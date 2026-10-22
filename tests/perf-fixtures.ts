import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot } from "./helpers.ts";

export interface SyntheticScale {
  overrideCount: number;
  lockfilePackageCount: number;
  nodeModulesCount?: number;
}

export interface BenchResult {
  name: string;
  iterations: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  opsPerSec: number;
}

export async function runBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations = 50,
  warmup = 5,
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const meanMs = samples.reduce((acc, v) => acc + v, 0) / samples.length;
  const p50Ms = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const p95Ms = samples[Math.floor(samples.length * 0.95)] ?? 0;
  return {
    name,
    iterations,
    meanMs,
    p50Ms,
    p95Ms,
    opsPerSec: meanMs > 0 ? 1000 / meanMs : 0,
  };
}

export function withSilentConsole<T>(fn: () => T): T {
  const { log, warn, error } = console;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

export function printBenchTable(title: string, results: BenchResult[]) {
  console.log(`\n=== ${title} ===`);
  const headers = [
    "Benchmark",
    "Runs",
    "Mean (ms)",
    "p50 (ms)",
    "p95 (ms)",
    "Ops/sec",
  ];
  const rows = results.map((r) => [
    r.name,
    String(r.iterations),
    r.meanMs.toFixed(3),
    r.p50Ms.toFixed(3),
    r.p95Ms.toFixed(3),
    r.opsPerSec >= 100
      ? Math.round(r.opsPerSec).toLocaleString()
      : r.opsPerSec.toFixed(1),
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const sep = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;
  const fmt = (row: string[]) =>
    `| ${row.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join(" | ")} |`;
  console.log([sep, fmt(headers), sep, ...rows.map(fmt), sep].join("\n"));
}

export async function runRustEnforcer(root: string, args: string[] = []) {
  const bin = join(repositoryRoot, "packages/why-override/dist/why-override");
  const child = Bun.spawn([bin, ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { output: `${out}\n${err}`, exitCode };
}

export function generateSyntheticManifestAndReasons(overrideCount: number) {
  const overrides: Record<string, unknown> = {};
  const reasons: Array<Record<string, unknown>> = [];
  const nowIso = "2026-10-15T00:00:00.000Z";

  for (let i = 0; i < overrideCount; i++) {
    const pkg =
      i % 5 === 0 ? `@scope-${i % 10}/pkg-${i}` : `synthetic-pkg-${i}`;
    const target = `${(i % 4) + 1}.${i % 10}.${i % 20}`;
    const isNested = i % 3 === 0;
    const parent = `parent-pkg-${i}`;
    if (isNested) overrides[parent] = { [pkg]: target };
    else overrides[pkg] = target;
    reasons.push({
      selector: isNested ? [parent, pkg] : [pkg],
      reason: `Pin ${pkg} to ${target} for upstream compatibility (#${1000 + i}).`,
      target,
      workspaces: isNested && i % 2 === 0 ? ["@why-override/demo"] : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return {
    manifest: { name: "synthetic-perf-fixture", version: "1.0.0", overrides },
    reasonDocument: { version: 1, reasons },
  };
}

export function generateSyntheticLockfile(
  overrideCount: number,
  lockfilePackageCount: number,
) {
  const packages: Record<string, Record<string, unknown>> = {
    "": { name: "synthetic-perf-fixture", version: "1.0.0" },
  };
  for (let i = 0; i < lockfilePackageCount; i++) {
    const idx = i % Math.max(1, overrideCount);
    const targetPkg =
      idx % 5 === 0 ? `@scope-${idx % 10}/pkg-${idx}` : `synthetic-pkg-${idx}`;
    const depName = `lock-dep-${i}`;
    packages[`node_modules/${depName}`] = {
      name: depName,
      version: `1.0.${i % 50}`,
      dependencies:
        i % 4 === 0
          ? { [targetPkg]: `^${i % 2 === 0 ? 1 : (idx % 4) + 1}.0.0` }
          : { [`other-lib-${i % 100}`]: "^1.0.0" },
    };
  }
  return { name: "synthetic-perf-fixture", lockfileVersion: 3, packages };
}

export async function createPerfFixture({
  overrideCount,
  lockfilePackageCount,
  nodeModulesCount = 0,
}: SyntheticScale) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "why-override-perf-"));
  const { manifest, reasonDocument } =
    generateSyntheticManifestAndReasons(overrideCount);
  await mkdir(join(fixtureRoot, "packages/why-override/dist"), {
    recursive: true,
  });
  const cliCode = await readFile(
    join(repositoryRoot, "packages/why-override/dist/cli.js"),
    "utf8",
  );
  const writes: Promise<unknown>[] = [
    writeFile(
      join(fixtureRoot, "package.json"),
      JSON.stringify(manifest, null, 2),
    ),
    writeFile(
      join(fixtureRoot, ".override-reasons.json"),
      JSON.stringify(reasonDocument, null, 2),
    ),
    writeFile(join(fixtureRoot, "packages/why-override/dist/cli.js"), cliCode),
  ];
  if (lockfilePackageCount > 0) {
    const lockJson = JSON.stringify(
      generateSyntheticLockfile(overrideCount, lockfilePackageCount),
    );
    writes.push(writeFile(join(fixtureRoot, "package-lock.json"), lockJson));
  }
  for (let i = 0; i < nodeModulesCount; i++) {
    const idx = i % Math.max(1, overrideCount);
    const targetPkg =
      idx % 5 === 0 ? `@scope-${idx % 10}/pkg-${idx}` : `synthetic-pkg-${idx}`;
    const pkgDir = join(fixtureRoot, "node_modules", `nm-pkg-${i}`);
    const nmJson = JSON.stringify({
      name: `nm-pkg-${i}`,
      version: "1.0.0",
      dependencies: { [targetPkg]: "^1.0.0" },
    });
    writes.push(
      mkdir(pkgDir, { recursive: true }).then(() =>
        writeFile(join(pkgDir, "package.json"), nmJson),
      ),
    );
  }
  await Promise.all(writes);
  return { fixtureRoot, manifest, reasonDocument };
}
