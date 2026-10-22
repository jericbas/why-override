import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  parseJSONC,
  runInteractiveEnforcer,
  runInteractiveNpm,
  runNpm,
} from "./helpers.ts";

test("refresh updates changed reason but preserves creation time", async () => {
  const fixtureRoot = await createFixture();
  try {
    const installResult = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);
    expect(installResult.exitCode).toBe(0);
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const createdAt = "2020-01-01T00:00:00.000Z";
    const originalUpdatedAt = "2021-01-01T00:00:00.000Z";
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Original rationale.",
              createdAt,
              updatedAt: originalUpdatedAt,
            },
          ],
        },
        null,
        2,
      ),
    );

    const refreshArgs = [
      "exec",
      "--workspace=@why-override/demo",
      "--",
      "why-override",
      "refresh",
      '["is-number"]',
    ];
    const refreshed = await runInteractiveNpm(
      fixtureRoot,
      refreshArgs,
      "Updated rationale.",
    );

    expect(refreshed.exitCode).toBe(0);
    expect(refreshed.answered).toBe(true);
    const refreshedDoc = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(refreshedDoc.reasons[0]).toMatchObject({
      selector: ["is-number"],
      reason: "Updated rationale.",
      createdAt,
    });
    expect(refreshedDoc.reasons[0].updatedAt).not.toBe(originalUpdatedAt);

    const changedUpdatedAt = refreshedDoc.reasons[0].updatedAt;
    const unchanged = await runInteractiveNpm(
      fixtureRoot,
      refreshArgs,
      "Updated rationale.",
    );

    expect(unchanged.exitCode).toBe(0);
    const unchangedDoc = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(unchangedDoc.reasons[0].updatedAt).toBe(changedUpdatedAt);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh with an unchanged reason records the current target", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.1" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const createdAt = "2020-01-01T00:00:00.000Z";
    const originalUpdatedAt = "2021-01-01T00:00:00.000Z";
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Pinned rationale.",
              target: "7.0.0",
              createdAt,
              updatedAt: originalUpdatedAt,
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runInteractiveEnforcer(
      fixtureRoot,
      ["refresh", '["is-number"]'],
      "Pinned rationale.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);

    const [record] = parseJSONC(
      await readFile(reasonStorePath, "utf8"),
    ).reasons;
    expect(record).toMatchObject({
      reason: "Pinned rationale.",
      target: "7.0.1",
      createdAt,
    });
    expect(record.updatedAt).not.toBe(originalUpdatedAt);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh --all prompts to re-enter reasons for each override", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Original rationale.",
              createdAt: "2020-01-01T00:00:00.000Z",
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );
    const result = await runInteractiveEnforcer(
      fixtureRoot,
      ["refresh", "--all"],
      "New re-entered rationale.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).toContain('Refreshed reason for "is-number"');

    const [record] = parseJSONC(
      await readFile(reasonStorePath, "utf8"),
    ).reasons;
    expect(record.reason).toBe("New re-entered rationale.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("--reenter flag prompts to re-enter reasons for existing overrides", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Original rationale.",
              createdAt: "2020-01-01T00:00:00.000Z",
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );
    const result = await runInteractiveEnforcer(
      fixtureRoot,
      ["--reenter"],
      "Reentered via flag.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).toContain('Refreshed reason for "is-number"');

    const [record] = parseJSONC(
      await readFile(reasonStorePath, "utf8"),
    ).reasons;
    expect(record.reason).toBe("Reentered via flag.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
