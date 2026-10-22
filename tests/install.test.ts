import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  documentedReason,
  parseJSONC,
  runInteractiveNpm,
  runNpm,
} from "./helpers.ts";

test("interactive npm install saves a reason and displays it next time", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    await writeFile(
      reasonStorePath,
      '{\n  "version": 1,\n  // Reasons are reviewed with dependency changes.\n  "reasons": []\n}\n',
    );

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "Needed to keep the demo compatible.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.answered).toBe(true);
    expect(result.output).toContain("Why do you need to override this?");

    const reasonStoreText = await readFile(reasonStorePath, "utf8");
    const reasonStore = parseJSONC(reasonStoreText);
    expect(reasonStoreText).toContain(
      "// Reasons are reviewed with dependency changes.",
    );
    expect(reasonStore.reasons).toHaveLength(1);
    expect(reasonStore.reasons[0]).toMatchObject({
      selector: ["is-number"],
      reason: "Needed to keep the demo compatible.",
      target: "7.0.0",
    });
    expect(reasonStore.reasons[0].createdAt).toBe(
      reasonStore.reasons[0].updatedAt,
    );
    expect(reasonStore.reasons[0].createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    const nextInstall = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);
    expect(nextInstall.exitCode).toBe(0);
    expect(nextInstall.output).toContain("Needed to keep the demo compatible.");
    expect(nextInstall.output).not.toContain(
      "Why do you need to override this?",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("empty interactive answer leaves the reason store unchanged", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "",
    );

    expect(result.exitCode).toBe(0);
    expect(result.answered).toBe(true);
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("non-TTY npm install skips undocumented reasons", async () => {
  const fixtureRoot = await createFixture(undefined, 120);
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);

    const start = Date.now();
    const result = await runNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      { OVERRIDE_TIMEOUT: "600" },
    );

    expect(result.exitCode).toBe(0);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.output).not.toContain("Why do you need to override this?");
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

for (const command of ["install", "ci"]) {
  test(`npm ${command} displays the saved root override reason`, async () => {
    const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
    try {
      await writeFile(
        join(fixtureRoot, ".override-reasons.jsonc"),
        JSON.stringify(
          {
            version: 1,
            reasons: [
              {
                selector: ["is-number"],
                reason: documentedReason,
                target: "7.0.0",
                createdAt: "2020-01-01T00:00:00.000Z",
                updatedAt: "2020-01-01T00:00:00.000Z",
              },
            ],
          },
          null,
          2,
        ),
      );
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
      expect(demoCommand.exitCode).toBe(0);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
}
