import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  parseJSONC,
  runInteractiveEnforcer,
  runInteractiveRefreshSelection,
} from "./helpers.ts";

test("interactive refresh prompts to select packages and applies one reason to multiple packages", async () => {
  const fixtureRoot = await createFixture({
    chalk: "1.0.0",
    "is-odd": { "is-number": "7.0.0" },
  });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const reasons = [
      {
        selector: ["chalk"],
        reason: "Old chalk reason.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        selector: ["is-odd", "is-number"],
        reason: "Old is-number reason.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runInteractiveRefreshSelection(
      fixtureRoot,
      "1, 2",
      "Unified compatibility update for build and runtime.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.selectionPrompted).toBe(true);
    expect(result.reasonPrompted).toBe(true);
    expect(result.output).toContain('Refreshed reason for "chalk"');
    expect(result.output).toContain(
      'Refreshed reason for "is-odd" > "is-number"',
    );

    const updatedDocument = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(updatedDocument.reasons).toHaveLength(2);
    expect(updatedDocument.reasons[0].reason).toBe(
      "Unified compatibility update for build and runtime.",
    );
    expect(updatedDocument.reasons[1].reason).toBe(
      "Unified compatibility update for build and runtime.",
    );
    expect(updatedDocument.reasons[0].updatedAt).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
    expect(updatedDocument.reasons[1].updatedAt).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("interactive refresh allows selecting a single package", async () => {
  const fixtureRoot = await createFixture({
    chalk: "1.0.0",
    "is-odd": { "is-number": "7.0.0" },
  });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const reasons = [
      {
        selector: ["chalk"],
        reason: "Old chalk reason.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        selector: ["is-odd", "is-number"],
        reason: "Old is-number reason.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runInteractiveRefreshSelection(
      fixtureRoot,
      "1",
      "Only refreshed chalk.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.selectionPrompted).toBe(true);
    expect(result.reasonPrompted).toBe(true);
    expect(result.output).toContain('Refreshed reason for "chalk"');
    expect(result.output).not.toContain('Refreshed reason for "is-odd"');

    const updatedDocument = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(updatedDocument.reasons[0].reason).toBe("Only refreshed chalk.");
    expect(updatedDocument.reasons[1].reason).toBe("Old is-number reason.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("interactive refresh cancels cleanly when selection is empty", async () => {
  const fixtureRoot = await createFixture({ chalk: "1.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const reasons = [
      {
        selector: ["chalk"],
        reason: "Unchanged chalk.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runInteractiveRefreshSelection(fixtureRoot, "");
    expect(result.exitCode).toBe(0);
    expect(result.selectionPrompted).toBe(true);
    expect(result.reasonPrompted).toBe(false);
    expect(result.output).toContain("No packages selected; skipping.");

    const doc = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(doc.reasons[0].reason).toBe("Unchanged chalk.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("non-TTY refresh without arguments requires interactive terminal", async () => {
  const fixtureRoot = await createFixture();
  try {
    const child = Bun.spawn(
      ["node", "packages/why-override/dist/cli.js", "refresh"],
      { cwd: fixtureRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect(exitCode).toBe(1);
    expect(`${stdout}\n${stderr}`).toContain(
      "Refreshing a reason requires an interactive terminal.",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh accepts array of selectors from command line to apply one reason to all", async () => {
  const fixtureRoot = await createFixture({
    chalk: "1.0.0",
    "is-odd": { "is-number": "7.0.0" },
  });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const reasons = [
      {
        selector: ["chalk"],
        reason: "Old chalk.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        selector: ["is-odd", "is-number"],
        reason: "Old is-number.",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runInteractiveEnforcer(
      fixtureRoot,
      ["refresh", '[["chalk"], ["is-odd", "is-number"]]'],
      "Batch reason from CLI.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);

    const doc = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(doc.reasons[0].reason).toBe("Batch reason from CLI.");
    expect(doc.reasons[1].reason).toBe("Batch reason from CLI.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
