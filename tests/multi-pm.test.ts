import { expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFixture, runEnforcer } from "./helpers.ts";

test("recognizes pnpm.overrides and Yarn / Bun resolutions", async () => {
  const fixtureRoot = await createFixture();
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    const manifestPath = join(fixtureRoot, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          name: "multi-pm-fixture",
          pnpm: {
            overrides: {
              "pnpm-lib": "1.0.0",
            },
          },
          resolutions: {
            "yarn-lib": "2.0.0",
            "parent/child": "3.0.0",
            "@scoped/pkg": "4.0.0",
          },
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
              selector: ["pnpm-lib"],
              reason: "pnpm reason.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              selector: ["yarn-lib"],
              reason: "yarn reason.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              selector: ["parent", "child"],
              reason: "nested resolution reason.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              selector: ["@scoped/pkg"],
              reason: "scoped package resolution reason.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const checkResult = await runEnforcer(fixtureRoot, ["--check"]);
    expect(checkResult.exitCode).toBe(0);
    expect(checkResult.output).toContain(
      "All 4 override reasons are documented",
    );

    const doctorResult = await runEnforcer(fixtureRoot, ["doctor"]);
    expect(doctorResult.exitCode).toBe(0);
    expect(doctorResult.output).toContain("Total Overrides: 4");
    expect(doctorResult.output).toContain('"parent" > "child"');
    expect(doctorResult.output).toContain('"@scoped/pkg"');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
