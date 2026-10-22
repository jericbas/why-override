import { expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFixture, runEnforcer } from "./helpers.ts";

test("doctor analyzes overrides and detects Safe to Remove when no dependents exist", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "doctor-fixture",
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
              reason: "Rationale.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["doctor"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("why-override Doctor");
    expect(result.output).toContain("Total Overrides: 1");
    expect(result.output).toContain("Safe to Remove");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("doctor detects Still Needed when lockfile dependent requests older version", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    const lockfilePath = join(fixtureRoot, "package-lock.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "doctor-lockfile-fixture",
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
              reason: "Compatibility rationale.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );
    await writeFile(
      lockfilePath,
      JSON.stringify(
        {
          name: "doctor-lockfile-fixture",
          lockfileVersion: 3,
          packages: {
            "node_modules/is-odd": {
              name: "is-odd",
              version: "3.0.1",
              dependencies: {
                "is-number": "^6.0.0",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["doctor"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Still Needed");
    expect(result.output).toContain('is-odd requests "^6.0.0"');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
