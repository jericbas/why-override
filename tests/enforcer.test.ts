import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  parseJSONC,
  runEnforcer,
  runInteractiveEnforcer,
} from "./helpers.ts";

test("enforcer matches exact nested selector paths and rejects wildcard keys", async () => {
  const overrides = {
    "is-number": "7.0.0",
    parent: {
      ".": "2.0.0",
      child: "1.0.0",
    },
    "parent@^2": { ".": "2.1.0" },
    alias: "npm:real-package@1.0.0",
    git: "github:user/repository#commit",
    local: "file:../local-package",
    "*": "unsupported-wildcard-target",
  };
  const fixtureRoot = await createFixture(overrides);
  try {
    const records = [
      { selector: ["parent", "."], reason: "Parent package rationale." },
      { selector: ["parent", "child"], reason: "Nested child rationale." },
      { selector: ["parent@^2", "."], reason: "Qualified parent rationale." },
      { selector: ["alias"], reason: "Alias target stays separate." },
      { selector: ["git"], reason: "Git target stays separate." },
      { selector: ["local"], reason: "Local target stays separate." },
    ].map((record) => ({
      ...record,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    }));
    await writeFile(
      join(fixtureRoot, ".override-reasons.json"),
      JSON.stringify({ version: 1, reasons: records }, null, 2),
    );

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Parent package rationale.");
    expect(result.output).toContain("Nested child rationale.");
    expect(result.output).toContain("Qualified parent rationale.");
    expect(result.output).toContain("Alias target stays separate.");
    expect(result.output).toContain("Git target stays separate.");
    expect(result.output).toContain("Local target stays separate.");
    expect(result.output).toContain("wildcard override selector");
    expect(result.output).not.toContain("unsupported-wildcard-target");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("interactive prompt allows selecting an existing reason by number and displays the manual edit note", async () => {
  const fixtureRoot = await createFixture({
    "is-odd": "3.0.1",
    "is-number": "7.0.0",
  });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const existingReason = "Shared upstream compatibility workaround.";
    const timestamp = new Date().toISOString();
    await writeFile(
      reasonStorePath,
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-odd"],
              reason: existingReason,
              target: "3.0.1",
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runInteractiveEnforcer(fixtureRoot, [], "1");
    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).toContain("Existing reasons:");
    expect(result.output).toContain(`1) ${existingReason}`);
    expect(result.output).toContain(
      "Note: please check .override-reasons.json if you want to check and edit reasons manually.",
    );
    expect(result.output).toContain(`Selected: ${existingReason}`);

    const store = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(store.reasons).toHaveLength(2);
    expect(store.reasons[1]).toMatchObject({
      selector: ["is-number"],
      reason: existingReason,
      target: "7.0.0",
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("enforcer displays note pointing to .override-reasons.json", async () => {
  const fixtureRoot = await createFixture();
  try {
    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(
      "Note: please check .override-reasons.json if you want to check and edit reasons manually.",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
