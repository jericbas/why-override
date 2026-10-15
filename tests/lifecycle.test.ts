import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const documentedReason =
  "Keep is-odd's transitive is-number dependency on a known compatible release.";

async function createFixture() {
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
    const packageDirectory = join(fixtureRoot, "packages/why-override");
    const demoDirectory = join(fixtureRoot, "apps/demo");
    const fixtureRootManifest = {
      ...rootManifest,
      name: "why-override-lifecycle-fixture",
    };
    delete fixtureRootManifest.devDependencies;

    await mkdir(join(packageDirectory, "dist"), { recursive: true });
    await mkdir(join(demoDirectory, "src"), { recursive: true });
    await writeFile(
      join(fixtureRoot, "package.json"),
      JSON.stringify(fixtureRootManifest, null, 2),
    );
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify(enforcerManifest, null, 2),
    );
    await writeFile(
      join(demoDirectory, "package.json"),
      JSON.stringify(demoManifest, null, 2),
    );
    await writeFile(
      join(demoDirectory, "src/index.js"),
      await readFile(join(repositoryRoot, "apps/demo/src/index.js"), "utf8"),
    );
    await writeFile(
      join(fixtureRoot, "override-reasons.jsonc"),
      await readFile(join(repositoryRoot, "override-reasons.jsonc"), "utf8"),
    );
    await writeFile(
      join(packageDirectory, "dist/cli.js"),
      await readFile(
        join(repositoryRoot, "packages/why-override/dist/cli.js"),
        "utf8",
      ),
    );

    return fixtureRoot;
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runNpm(fixtureRoot: string, args: string[]) {
  const child = Bun.spawn(["npm", ...args], {
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

for (const command of ["install", "ci"]) {
  test(`npm ${command} displays the saved root override reason`, async () => {
    const fixtureRoot = await createFixture();

    try {
      if (command === "ci") {
        const lockResult = await runNpm(fixtureRoot, [
          "install",
          "--package-lock-only",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
        ]);
        expect(lockResult.exitCode).toBe(0);
      }

      const result = await runNpm(fixtureRoot, [
        command,
        "--no-audit",
        "--no-fund",
      ]);

      if (result.exitCode !== 0) {
        throw new Error(result.output);
      }
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("is-number");
      expect(result.output).toContain(documentedReason);
      const installedVersion = JSON.parse(
        await readFile(
          join(fixtureRoot, "node_modules/is-number/package.json"),
          "utf8",
        ),
      ).version;
      expect(installedVersion).toBe("7.0.0");

      const demoCommand = await runNpm(fixtureRoot, [
        "run",
        "check-overrides",
        "--workspace=@why-override/demo",
      ]);
      if (demoCommand.exitCode !== 0) {
        throw new Error(demoCommand.output);
      }
      expect(demoCommand.exitCode).toBe(0);
      expect(demoCommand.output).toContain(documentedReason);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
}
