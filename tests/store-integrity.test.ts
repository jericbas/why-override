import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  documentedReason,
  parseJSONC,
  runEnforcer,
  runInteractiveEnforcer,
  runInteractiveNpm,
  runNpm,
} from "./helpers.ts";

test("malformed reason records warn, remain intact, and are treated as undocumented", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const malformedRecord = {
      selector: 42,
      reason: "Unreadable selector record.",
      createdAt: "not-a-date",
      updatedAt: "not-a-date",
    };
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons: [malformedRecord] }, null, 2),
    );

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "Recovered rationale.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("malformed override reason record");
    expect(result.answered).toBe(true);
    const reasonDocument = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(reasonDocument.reasons[0]).toEqual(malformedRecord);
    expect(reasonDocument.reasons[1]).toMatchObject({
      selector: ["is-number"],
      reason: "Recovered rationale.",
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("malformed reason store warns and remains unchanged without blocking install", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    const malformedReasonStore = '{ "version": 1, "reasons": [\n';
    await writeFile(reasonStorePath, malformedReasonStore);

    const result = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(".override-reasons.jsonc is malformed");
    expect(await readFile(reasonStorePath, "utf8")).toBe(malformedReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("missing reason store warns without blocking install or creating the file", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    await rm(reasonStorePath);

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(".override-reasons.jsonc is missing");
    await expect(readFile(reasonStorePath, "utf8")).rejects.toThrow();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("missing reason store is created when an interactive reason is saved", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.jsonc");
    await rm(reasonStorePath);

    const result = await runInteractiveEnforcer(
      fixtureRoot,
      [],
      "Created from a missing store.",
    );
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).not.toContain("cannot save a reason");

    const reasonStore = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(reasonStore.version).toBe(1);
    expect(reasonStore.reasons).toHaveLength(1);
    expect(reasonStore.reasons[0]).toMatchObject({
      selector: ["is-number"],
      reason: "Created from a missing store.",
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("legacy override-reasons.jsonc without dot is supported as fallback", async () => {
  const fixtureRoot = await createFixture();
  try {
    const dotPath = join(fixtureRoot, ".override-reasons.jsonc");
    const legacyPath = join(fixtureRoot, "override-reasons.jsonc");
    const content = await readFile(dotPath, "utf8");
    await rm(dotPath);
    await writeFile(legacyPath, content);

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("missing");
    expect(result.output).toContain(documentedReason);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
