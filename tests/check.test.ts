import { expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFixture, runEnforcer } from "./helpers.ts";

test("check passes when all overrides are documented and no orphaned records exist", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "check-fixture",
          overrides: { "is-number": "7.0.0" },
        },
        null,
        2,
      ),
    );
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Documented rationale.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["--check"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(
      "All 1 override reason is documented and up to date",
    );

    const ciResult = await runEnforcer(fixtureRoot, ["--ci"]);
    expect(ciResult.exitCode).toBe(0);

    const checkSubcommandResult = await runEnforcer(fixtureRoot, ["check"]);
    expect(checkSubcommandResult.exitCode).toBe(0);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("check fails when an override is missing a reason", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "check-fixture",
          overrides: { "is-number": "7.0.0", chalk: "1.0.0" },
        },
        null,
        2,
      ),
    );
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Only is-number is documented.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["--check"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('undocumented override "chalk"');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("check fails when an orphaned record exists in reason store", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "check-fixture",
          overrides: { "is-number": "7.0.0" },
        },
        null,
        2,
      ),
    );
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Valid rationale.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              selector: ["orphaned-pkg"],
              reason: "No longer in package.json.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["--check"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      'orphaned override reason for "orphaned-pkg"',
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
