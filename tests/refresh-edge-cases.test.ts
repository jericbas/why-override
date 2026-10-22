import { expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  documentedReason,
  parseJSONC,
  repositoryRoot,
  runInteractiveEnforcer,
} from "./helpers.ts";

test("refresh updates the valid record when an earlier malformed record shares the selector", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const malformedSameSelector = {
      selector: ["is-number"],
      reason: "Malformed timestamp record.",
      createdAt: "not-a-date",
      updatedAt: "not-a-date",
    };
    const validRecord = {
      selector: ["is-number"],
      reason: "Recovered valid rationale.",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        { version: 1, reasons: [malformedSameSelector, validRecord] },
        null,
        2,
      ),
    );

    const result = await runInteractiveEnforcer(
      fixtureRoot,
      ["refresh", '["is-number"]'],
      "Refreshed valid rationale.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    const updatedStore = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(updatedStore.reasons[0]).toEqual(malformedSameSelector);
    expect(updatedStore.reasons[1]).toMatchObject({
      selector: ["is-number"],
      reason: "Refreshed valid rationale.",
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    expect(updatedStore.reasons[1].updatedAt).not.toBe(
      "2025-01-01T00:00:00.000Z",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh rejects empty string selector segments and CLI resolves nested install layouts", async () => {
  const fixtureRoot = await createFixture();
  try {
    const nestedCliDir = join(
      fixtureRoot,
      "node_modules/.pnpm/why-override@0.1.0/node_modules/why-override/dist",
    );
    await mkdir(nestedCliDir, { recursive: true });
    const nestedCliPath = join(nestedCliDir, "cli.js");
    await writeFile(
      nestedCliPath,
      await readFile(
        join(repositoryRoot, "packages/why-override/dist/cli.js"),
        "utf8",
      ),
    );

    const nestedCheck = Bun.spawn(["node", nestedCliPath], {
      cwd: fixtureRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(nestedCheck.stdout).text(),
      new Response(nestedCheck.stderr).text(),
      nestedCheck.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(`${stdout}\n${stderr}`).toContain(documentedReason);

    const invalidRefresh = Bun.spawn(
      ["node", nestedCliPath, "refresh", '[""]'],
      {
        cwd: fixtureRoot,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [refreshOut, refreshErr, refreshExitCode] = await Promise.all([
      new Response(invalidRefresh.stdout).text(),
      new Response(invalidRefresh.stderr).text(),
      invalidRefresh.exited,
    ]);
    expect(refreshExitCode).toBe(1);
    expect(`${refreshOut}\n${refreshErr}`).toContain(
      'Usage: why-override refresh \'["package", "nested-selector"]\'',
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
