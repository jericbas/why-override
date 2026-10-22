import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFixture, runEnforcer } from "./helpers.ts";

test("prune command removes orphaned records and preserves active ones", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "prune-fixture",
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
              reason: "Keep this active override.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              selector: ["stale-package"],
              reason: "This was deleted from package.json.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["prune"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(
      'Pruned orphaned reason for "stale-package"',
    );
    expect(result.output).toContain(
      "Successfully pruned 1 orphaned override record",
    );

    const updatedStore = JSON.parse(await readFile(reasonStorePath, "utf8"));
    expect(updatedStore.reasons).toHaveLength(1);
    expect(updatedStore.reasons[0].selector).toEqual(["is-number"]);

    // Running prune again should report nothing to prune
    const secondResult = await runEnforcer(fixtureRoot, ["prune"]);
    expect(secondResult.exitCode).toBe(0);
    expect(secondResult.output).toContain(
      "No orphaned override reasons to prune",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("clean alias works equivalently to prune", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "clean-fixture",
          overrides: {},
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
              selector: ["removed-pkg"],
              reason: "To be cleaned.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot, ["clean"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Pruned orphaned reason for "removed-pkg"');

    const updatedStore = JSON.parse(await readFile(reasonStorePath, "utf8"));
    expect(updatedStore.reasons).toHaveLength(0);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
