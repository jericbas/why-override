import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  runEnforcer,
  runInteractiveNpm,
  runNpm,
} from "./helpers.ts";

test("aging documented reasons does not trigger an install prompt", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const oldReasonStore = JSON.stringify(
      {
        version: 1,
        reasons: [
          {
            selector: ["is-number"],
            reason: "Old but still documented.",
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    );
    await writeFile(reasonStorePath, oldReasonStore);

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      undefined,
      { OVERRIDE_TIMEOUT: "1" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(false);
    expect(result.output).toContain("Old but still documented.");
    expect(await readFile(reasonStorePath, "utf8")).toBe(oldReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("reasons warn at 30 days but not before the boundary", async () => {
  const fixtureRoot = await createFixture({
    "is-number": "7.0.0",
    "is-odd": "3.0.1",
  });
  try {
    const now = Date.now();
    const reasons = [
      {
        selector: ["is-number"],
        reason: "Recently reviewed rationale.",
        createdAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        selector: ["is-odd"],
        reason: "Rationale at the review boundary.",
        createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    await writeFile(
      join(fixtureRoot, ".override-reasons.jsonc"),
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Recently reviewed rationale.");
    expect(result.output).toContain("Rationale at the review boundary.");
    expect(result.output).toContain("Review this override rationale");
    expect(result.output).toContain('for "is-odd"');
    expect(result.output).not.toContain('for "is-number"');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("stale reason records warn and remain unchanged without blocking installs", async () => {
  for (const command of ["install", "ci"]) {
    const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
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

      const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
      const staleReasonStore = JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["removed-package"],
              reason: "Preserve this stale rationale.",
              createdAt: "2020-01-01T00:00:00.000Z",
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
            {
              selector: ["is-number"],
              reason: "Current rationale.",
              createdAt: "2026-10-15T00:00:00.000Z",
              updatedAt: "2026-10-15T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      );
      await writeFile(reasonStorePath, staleReasonStore);

      const result = await runNpm(fixtureRoot, [
        command,
        "--no-audit",
        "--no-fund",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("stale override reason");
      expect(result.output).toContain("Current rationale.");
      expect(await readFile(reasonStorePath, "utf8")).toBe(staleReasonStore);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
});
