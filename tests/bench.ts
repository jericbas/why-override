import { rm } from "node:fs/promises";
import { runCheck } from "../packages/why-override/src/check.js";
import { runDoctor } from "../packages/why-override/src/doctor.js";
import {
  collectAllManifestSelectors,
  getOverrideTarget,
  selectorKey,
} from "../packages/why-override/src/selectors.js";
import { validateReasons } from "../packages/why-override/src/store.js";
import { printOverrideTable } from "../packages/why-override/src/table.js";
import { runEnforcer } from "./helpers.ts";
import {
  type BenchResult,
  createPerfFixture,
  generateSyntheticManifestAndReasons,
  printBenchTable,
  runBenchmark,
  runRustEnforcer,
  withSilentConsole,
} from "./perf-fixtures.ts";

function buildDoctorContext(fixture: {
  fixtureRoot: string;
  manifest: Record<string, unknown>;
  reasonDocument: { version: number; reasons: Array<Record<string, unknown>> };
}) {
  const selectors = collectAllManifestSelectors(fixture.manifest);
  const { reasonsBySelector } = validateReasons({
    reasonDocument: fixture.reasonDocument,
    selectors,
    manifest: fixture.manifest,
    warn: false,
  });
  return {
    workspaceRoot: fixture.fixtureRoot,
    manifest: fixture.manifest,
    selectors,
    reasonsBySelector,
    reasonDocument: fixture.reasonDocument,
    reasonStoreFilename: ".override-reasons.json",
    reasonStoreMissing: false,
    reasonStoreWritable: true,
  };
}

async function main() {
  const smallData = generateSyntheticManifestAndReasons(20);
  const largeData = generateSyntheticManifestAndReasons(200);
  const largeSelectors = collectAllManifestSelectors(largeData.manifest);
  const largeValidated = validateReasons({
    reasonDocument: largeData.reasonDocument,
    selectors: largeSelectors,
    manifest: largeData.manifest,
    warn: false,
  });

  const [mediumFixture, largeFixture, nmFixture] = await Promise.all([
    createPerfFixture({ overrideCount: 50, lockfilePackageCount: 1000 }),
    createPerfFixture({ overrideCount: 200, lockfilePackageCount: 5000 }),
    createPerfFixture({
      overrideCount: 50,
      lockfilePackageCount: 0,
      nodeModulesCount: 200,
    }),
  ]);

  try {
    const tableEntries = largeSelectors.map((selector) => ({
      selector,
      reason: largeValidated.reasonsBySelector.get(selectorKey(selector)) ?? "",
      workspacesText: largeValidated.workspacesBySelector.get(
        selectorKey(selector),
      ),
    }));
    const mediumCtx = buildDoctorContext(mediumFixture);
    const largeCtx = buildDoctorContext(largeFixture);
    const nmCtx = buildDoctorContext(nmFixture);
    const root = largeFixture.fixtureRoot;

    const inProcessResults: BenchResult[] = [
      await runBenchmark(
        "collectAllManifestSelectors (200 overrides)",
        () => {
          collectAllManifestSelectors(largeData.manifest);
        },
        500,
      ),
      await runBenchmark(
        "getOverrideTarget x200 selectors",
        () => {
          for (const sel of largeSelectors)
            getOverrideTarget(largeData.manifest, sel);
        },
        500,
      ),
      await runBenchmark(
        "validateReasons (20 overrides)",
        () => {
          const sels = collectAllManifestSelectors(smallData.manifest);
          validateReasons({
            reasonDocument: smallData.reasonDocument,
            selectors: sels,
            manifest: smallData.manifest,
            warn: false,
          });
        },
        500,
      ),
      await runBenchmark(
        "validateReasons (200 overrides)",
        () => {
          validateReasons({
            reasonDocument: largeData.reasonDocument,
            selectors: largeSelectors,
            manifest: largeData.manifest,
            warn: false,
          });
        },
        200,
      ),
      await runBenchmark(
        "runCheck (200 overrides)",
        () => {
          withSilentConsole(() => runCheck(largeCtx));
        },
        500,
      ),
      await runBenchmark(
        "printOverrideTable (200 overrides)",
        () => {
          withSilentConsole(() =>
            printOverrideTable(tableEntries, root, largeData.manifest),
          );
        },
        100,
      ),
      await runBenchmark(
        "runDoctor (50 overrides, 1,000 lockfile pkgs)",
        () => {
          withSilentConsole(() => runDoctor(mediumCtx));
        },
        20,
        2,
      ),
      await runBenchmark(
        "runDoctor (200 overrides, 5,000 lockfile pkgs)",
        () => {
          withSilentConsole(() => runDoctor(largeCtx));
        },
        15,
        2,
      ),
      await runBenchmark(
        "runDoctor (50 overrides, 200 node_modules pkgs)",
        () => {
          withSilentConsole(() => runDoctor(nmCtx));
        },
        15,
        2,
      ),
    ];
    printBenchTable("In-Process Module Benchmarks (JS)", inProcessResults);

    const e2eCommands: Array<[string, string[]]> = [
      ["CLI e2e: why-override check (200 overrides)", ["check"]],
      ["CLI e2e: why-override enforce (200 overrides)", []],
      ["CLI e2e: why-override doctor (200 overrides, 5k lockfile)", ["doctor"]],
    ];

    const nodeResults: BenchResult[] = [];
    for (const [label, args] of e2eCommands) {
      nodeResults.push(
        await runBenchmark(label, () => runEnforcer(root, args), 10, 2),
      );
    }
    printBenchTable("End-to-End CLI Process Benchmarks (Node.js)", nodeResults);

    const rustResults: BenchResult[] = [];
    for (const [label, args] of e2eCommands) {
      rustResults.push(
        await runBenchmark(label, () => runRustEnforcer(root, args), 20, 3),
      );
    }
    printBenchTable(
      "End-to-End CLI Process Benchmarks (Native Rust)",
      rustResults,
    );
  } finally {
    await Promise.all([
      rm(mediumFixture.fixtureRoot, { recursive: true, force: true }),
      rm(largeFixture.fixtureRoot, { recursive: true, force: true }),
      rm(nmFixture.fixtureRoot, { recursive: true, force: true }),
    ]);
  }
}

await main();
