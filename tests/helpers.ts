import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export * from "./interactive-helpers.ts";

export const repositoryRoot = resolve(import.meta.dir, "..");
export const parseJSONC = createRequire(
  join(repositoryRoot, "packages/why-override/package.json"),
)("jsonc-parser").parse;
export const documentedReason =
  "Keep is-odd's transitive is-number dependency on a known stable, compatible release.";

export async function createFixture(
  overrides?: Record<string, unknown>,
  promptTimeout?: unknown,
) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "why-override-lifecycle-"));
  try {
    const rootManifest = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    );
    const demoManifest = JSON.parse(
      await readFile(join(repositoryRoot, "apps/demo/package.json"), "utf8"),
    );
    const enforcerManifest = JSON.parse(
      await readFile(
        join(repositoryRoot, "packages/why-override/package.json"),
        "utf8",
      ),
    );
    const fixtureRootManifest = {
      ...rootManifest,
      name: "why-override-lifecycle-fixture",
    };
    delete fixtureRootManifest.devDependencies;
    fixtureRootManifest.overrides = overrides ?? rootManifest.overrides;
    if (promptTimeout !== undefined) {
      fixtureRootManifest.config = {
        ...fixtureRootManifest.config,
        "why-override": { timeout: promptTimeout },
      };
    }

    await mkdir(join(fixtureRoot, "packages/why-override/dist"), {
      recursive: true,
    });
    await mkdir(join(fixtureRoot, "apps/demo/src"), { recursive: true });

    const files = [
      ["package.json", JSON.stringify(fixtureRootManifest, null, 2)],
      [
        "packages/why-override/package.json",
        JSON.stringify(enforcerManifest, null, 2),
      ],
      ["apps/demo/package.json", JSON.stringify(demoManifest, null, 2)],
      [
        "apps/demo/src/index.js",
        await readFile(join(repositoryRoot, "apps/demo/src/index.js"), "utf8"),
      ],
      [
        ".override-reasons.jsonc",
        await readFile(join(repositoryRoot, ".override-reasons.jsonc"), "utf8"),
      ],
      [
        "packages/why-override/dist/cli.js",
        await readFile(
          join(repositoryRoot, "packages/why-override/dist/cli.js"),
          "utf8",
        ),
      ],
    ];
    for (const [relPath, content] of files) {
      await writeFile(join(fixtureRoot, relPath), content);
    }

    return fixtureRoot;
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function runNpm(
  fixtureRoot: string,
  args: string[],
  env: Record<string, string> = {},
) {
  const child = Bun.spawn(["npm", ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { output: `${stdout}\n${stderr}`, exitCode };
}

export async function runEnforcer(fixtureRoot: string) {
  const child = Bun.spawn(["node", "packages/why-override/dist/cli.js"], {
    cwd: fixtureRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { output: `${stdout}\n${stderr}`, exitCode };
}

