import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createFixture,
  runEnforcer,
  runInteractiveNpm,
  runNpm,
} from "./helpers.ts";

test("changing only an override target leaves its reason record unchanged", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" });
  try {
    const installResult = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);
    expect(installResult.exitCode).toBe(0);
    const manifestPath = join(fixtureRoot, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.overrides["is-number"] = "7.0.1";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const record = {
      selector: ["is-number"],
      reason: "Original rationale.",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2021-01-01T00:00:00.000Z",
    };
    const originalReasonStore = JSON.stringify(
      { version: 1, reasons: [record] },
      null,
      2,
    );
    await writeFile(reasonStorePath, originalReasonStore);

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["exec", "--workspace=@why-override/demo", "--", "why-override"],
      undefined,
      {},
      15000,
    );

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(false);
    expect(result.output).toContain("Original rationale.");
    expect(await readFile(reasonStorePath, "utf8")).toBe(originalReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("recorded target drift warns without changing the reason store", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.1" });
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const originalReasonStore = JSON.stringify(
      {
        version: 1,
        reasons: [
          {
            selector: ["is-number"],
            reason: "Pinned rationale.",
            target: "7.0.0",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    );
    await writeFile(reasonStorePath, originalReasonStore);

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Pinned rationale.");
    expect(result.output).toContain(
      'override target for "is-number" changed from "7.0.0" to "7.0.1"',
    );
    expect(await readFile(reasonStorePath, "utf8")).toBe(originalReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("optional workspaces are displayed and invalid values are malformed", async () => {
  const fixtureRoot = await createFixture({
    "is-number": "7.0.0",
    "is-odd": "3.0.1",
  });
  try {
    const timestamp = new Date().toISOString();
    await writeFile(
      join(fixtureRoot, ".override-reasons.json"),
      JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["is-number"],
              reason: "Shared rationale.",
              workspaces: ["apps/web", "apps/api"],
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            {
              selector: ["is-odd"],
              reason: "Invalid workspaces rationale.",
              workspaces: "apps/web",
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(
      'Override "is-number" [workspaces: apps/web, apps/api]: Shared rationale.',
    );
    expect(result.output).toContain(
      'malformed override reason record for "is-odd"',
    );
    expect(result.output).not.toContain("Invalid workspaces rationale.");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
