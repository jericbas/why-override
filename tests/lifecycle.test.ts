import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const parseJSONC = createRequire(
  join(repositoryRoot, "packages/why-override/package.json"),
)("jsonc-parser").parse;
const documentedReason =
  "Keep is-odd's transitive is-number dependency on a known compatible release.";

async function createFixture(
  overrides?: Record<string, unknown>,
  promptTimeout?: unknown,
) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "why-override-lifecycle-"));
  try {
    const rootManifest = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    );
    const demoManifest = JSON.parse(
      await readFile(join(repositoryRoot, "apps/demo/package.json"), "utf8"),
    );
    const enforcerManifest = JSON.parse(
      await readFile(
        join(repositoryRoot, "packages/why-override/package.json"),
        "utf8",
      ),
    );
    const packageDirectory = join(fixtureRoot, "packages/why-override");
    const demoDirectory = join(fixtureRoot, "apps/demo");
    const fixtureRootManifest = {
      ...rootManifest,
      name: "why-override-lifecycle-fixture",
    };
    delete fixtureRootManifest.devDependencies;
    fixtureRootManifest.overrides = overrides ?? rootManifest.overrides;
    if (promptTimeout !== undefined) {
      fixtureRootManifest.config = {
        ...fixtureRootManifest.config,
        "why-override": { timeout: promptTimeout },
      };
    }

    await mkdir(join(packageDirectory, "dist"), { recursive: true });
    await mkdir(join(demoDirectory, "src"), { recursive: true });
    await writeFile(
      join(fixtureRoot, "package.json"),
      JSON.stringify(fixtureRootManifest, null, 2),
    );
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify(enforcerManifest, null, 2),
    );
    await writeFile(
      join(demoDirectory, "package.json"),
      JSON.stringify(demoManifest, null, 2),
    );
    await writeFile(
      join(demoDirectory, "src/index.js"),
      await readFile(join(repositoryRoot, "apps/demo/src/index.js"), "utf8"),
    );
    await writeFile(
      join(fixtureRoot, "override-reasons.jsonc"),
      await readFile(join(repositoryRoot, "override-reasons.jsonc"), "utf8"),
    );
    await writeFile(
      join(packageDirectory, "dist/cli.js"),
      await readFile(
        join(repositoryRoot, "packages/why-override/dist/cli.js"),
        "utf8",
      ),
    );

    return fixtureRoot;
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

async function runNpm(
  fixtureRoot: string,
  args: string[],
  env: Record<string, string> = {},
) {
  const child = Bun.spawn(["npm", ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { output: `${stdout}\n${stderr}`, exitCode };
}

async function runEnforcer(fixtureRoot: string) {
  const child = Bun.spawn(["node", "packages/why-override/dist/cli.js"], {
    cwd: fixtureRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { output: `${stdout}\n${stderr}`, exitCode };
}

async function runInteractiveNpm(
  fixtureRoot: string,
  args: string[],
  answer?: string,
  env: Record<string, string> = {},
  safetyTimeoutMs = 5000,
) {
  let output = "";
  let answered = false;
  let prompted = false;
  const decoder = new TextDecoder();
  const child = Bun.spawn(["npm", ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ...env },
    terminal: {
      cols: 100,
      rows: 30,
      data(terminal, data) {
        output += decoder.decode(data, { stream: true });
        if (!prompted && output.includes("Why do you need to override this?")) {
          prompted = true;
          if (answer !== undefined) {
            answered = true;
            terminal.write(`${answer}\r`);
          }
        }
      },
    },
  });
  const safetyTimer = setTimeout(() => child.kill(), safetyTimeoutMs);
  const exitCode = await child.exited;
  clearTimeout(safetyTimer);
  child.terminal.close();

  return {
    output: `${output}${decoder.decode()}`,
    exitCode,
    answered,
    prompted,
  };
}

test("interactive npm install saves a reason and displays it next time", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    await writeFile(
      reasonStorePath,
      '{\n  "version": 1,\n  // Reasons are reviewed with dependency changes.\n  "reasons": []\n}\n',
    );

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "Needed to keep the demo compatible.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.answered).toBe(true);
    expect(result.output).toContain("Why do you need to override this?");

    const reasonStoreText = await readFile(reasonStorePath, "utf8");
    const reasonStore = parseJSONC(reasonStoreText);
    expect(reasonStoreText).toContain(
      "// Reasons are reviewed with dependency changes.",
    );
    expect(reasonStore.reasons).toHaveLength(1);
    expect(reasonStore.reasons[0]).toMatchObject({
      selector: ["is-number"],
      reason: "Needed to keep the demo compatible.",
    });
    expect(reasonStore.reasons[0].createdAt).toBe(
      reasonStore.reasons[0].updatedAt,
    );
    expect(reasonStore.reasons[0].createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    const nextInstall = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);
    expect(nextInstall.exitCode).toBe(0);
    expect(nextInstall.output).toContain("Needed to keep the demo compatible.");
    expect(nextInstall.output).not.toContain(
      "Why do you need to override this?",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("empty interactive answer leaves the reason store unchanged", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "",
    );

    expect(result.exitCode).toBe(0);
    expect(result.answered).toBe(true);
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("non-TTY npm install skips undocumented reasons", async () => {
  const fixtureRoot = await createFixture(undefined, 120);

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);

    const start = Date.now();
    const result = await runNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      { OVERRIDE_TIMEOUT: "600" },
    );

    expect(result.exitCode).toBe(0);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.output).not.toContain("Why do you need to override this?");
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("interactive prompt uses env timeout before project config", async () => {
  const fixtureRoot = await createFixture(undefined, 5);

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);
    const start = Date.now();

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      undefined,
      { OVERRIDE_TIMEOUT: "1" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).toContain("Timed out after 1 seconds");
    expect(Date.now() - start).toBeGreaterThanOrEqual(800);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("interactive prompt uses project timeout when env is absent", async () => {
  const fixtureRoot = await createFixture(undefined, 1);

  try {
    await writeFile(
      join(fixtureRoot, "override-reasons.jsonc"),
      JSON.stringify({ version: 1, reasons: [] }, null, 2),
    );
    const result = await runInteractiveNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(true);
    expect(result.output).toContain("Timed out after 1 seconds");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("invalid env timeout warns and falls back to ten seconds", async () => {
  const fixtureRoot = await createFixture(undefined, 1);

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const emptyReasonStore = JSON.stringify(
      { version: 1, reasons: [] },
      null,
      2,
    );
    await writeFile(reasonStorePath, emptyReasonStore);
    const start = Date.now();
    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      undefined,
      { OVERRIDE_TIMEOUT: "0" },
      15000,
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("invalid override prompt timeout");
    expect(result.output).toContain("Timed out after 10 seconds");
    expect(Date.now() - start).toBeGreaterThanOrEqual(9500);
    expect(Date.now() - start).toBeLessThan(15000);
    expect(
      JSON.stringify(JSON.parse(await readFile(reasonStorePath, "utf8"))),
    ).toBe(JSON.stringify(JSON.parse(emptyReasonStore)));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("invalid project timeout warns and falls back to ten seconds", async () => {
  const fixtureRoot = await createFixture(undefined, 1.5);

  try {
    await writeFile(
      join(fixtureRoot, "override-reasons.jsonc"),
      JSON.stringify({ version: 1, reasons: [] }, null, 2),
    );
    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      "Valid reason.",
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("invalid override prompt timeout");
    expect(result.answered).toBe(true);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh updates changed reason but preserves creation time", async () => {
  const fixtureRoot = await createFixture();

  try {
    const installResult = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);
    expect(installResult.exitCode).toBe(0);
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
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
    const refreshedDocument = parseJSONC(
      await readFile(reasonStorePath, "utf8"),
    );
    expect(refreshedDocument.reasons[0]).toMatchObject({
      selector: ["is-number"],
      reason: "Updated rationale.",
      createdAt,
    });
    expect(refreshedDocument.reasons[0].updatedAt).not.toBe(originalUpdatedAt);

    const changedUpdatedAt = refreshedDocument.reasons[0].updatedAt;
    const unchanged = await runInteractiveNpm(
      fixtureRoot,
      refreshArgs,
      "Updated rationale.",
    );

    expect(unchanged.exitCode).toBe(0);
    const unchangedDocument = parseJSONC(
      await readFile(reasonStorePath, "utf8"),
    );
    expect(unchangedDocument.reasons[0].updatedAt).toBe(changedUpdatedAt);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("changing only an override target leaves its reason record unchanged", async () => {
  const fixtureRoot = await createFixture();

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

    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
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

    const result = await runInteractiveNpm(fixtureRoot, [
      "exec",
      "--workspace=@why-override/demo",
      "--",
      "why-override",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(false);
    expect(result.output).toContain("Original rationale.");
    expect(await readFile(reasonStorePath, "utf8")).toBe(originalReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("aging documented reasons does not trigger an install prompt", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const oldReasonStore = JSON.stringify(
      {
        version: 1,
        reasons: [
          {
            selector: ["is-number"],
            reason: "Old but still documented.",
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    );
    await writeFile(reasonStorePath, oldReasonStore);

    const result = await runInteractiveNpm(
      fixtureRoot,
      ["install", "--no-audit", "--no-fund"],
      undefined,
      { OVERRIDE_TIMEOUT: "1" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.prompted).toBe(false);
    expect(result.output).toContain("Old but still documented.");
    expect(await readFile(reasonStorePath, "utf8")).toBe(oldReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("reasons warn at 30 days but not before the boundary", async () => {
  const fixtureRoot = await createFixture({
    "is-number": "7.0.0",
    "is-odd": "3.0.1",
  });

  try {
    const now = Date.now();
    const reasons = [
      {
        selector: ["is-number"],
        reason: "Recently reviewed rationale.",
        createdAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        selector: ["is-odd"],
        reason: "Rationale at the review boundary.",
        createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    await writeFile(
      join(fixtureRoot, "override-reasons.jsonc"),
      JSON.stringify({ version: 1, reasons }, null, 2),
    );

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Recently reviewed rationale.");
    expect(result.output).toContain("Rationale at the review boundary.");
    expect(result.output).toContain("Review this override rationale");
    expect(result.output).toContain('for "is-odd"');
    expect(result.output).not.toContain('for "is-number"');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("malformed reason records warn, remain intact, and are treated as undocumented", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
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
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    const malformedReasonStore = '{ "version": 1, "reasons": [\n';
    await writeFile(reasonStorePath, malformedReasonStore);

    const result = await runNpm(fixtureRoot, [
      "install",
      "--no-audit",
      "--no-fund",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("override-reasons.jsonc is malformed");
    expect(await readFile(reasonStorePath, "utf8")).toBe(malformedReasonStore);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("missing reason store warns without blocking install or creating the file", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
    await rm(reasonStorePath);

    const result = await runEnforcer(fixtureRoot);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("override-reasons.jsonc is missing");
    await expect(readFile(reasonStorePath, "utf8")).rejects.toThrow();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("refresh updates the valid record when an earlier malformed record shares the selector", async () => {
  const fixtureRoot = await createFixture();

  try {
    const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
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

    let output = "";
    let prompted = false;
    const decoder = new TextDecoder();
    const child = Bun.spawn(
      ["node", "packages/why-override/dist/cli.js", "refresh", '["is-number"]'],
      {
        cwd: fixtureRoot,
        terminal: {
          cols: 100,
          rows: 30,
          data(terminal, data) {
            output += decoder.decode(data, { stream: true });
            if (
              !prompted &&
              output.includes("Why do you need to override this?")
            ) {
              prompted = true;
              terminal.write("Refreshed valid rationale.\r");
            }
          },
        },
      },
    );
    const exitCode = await child.exited;
    child.terminal.close();

    expect(exitCode).toBe(0);
    expect(prompted).toBe(true);
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

test("stale reason records warn and remain unchanged without blocking installs", async () => {
  for (const command of ["install", "ci"]) {
    const fixtureRoot = await createFixture();

    try {
      if (command === "ci") {
        const lockResult = await runNpm(fixtureRoot, [
          "install",
          "--package-lock-only",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
        ]);
        expect(lockResult.exitCode).toBe(0);
      }

      const reasonStorePath = join(fixtureRoot, "override-reasons.jsonc");
      const staleReasonStore = JSON.stringify(
        {
          version: 1,
          reasons: [
            {
              selector: ["removed-package"],
              reason: "Preserve this stale rationale.",
              createdAt: "2020-01-01T00:00:00.000Z",
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
            {
              selector: ["is-number"],
              reason: "Current rationale.",
              createdAt: "2026-10-15T00:00:00.000Z",
              updatedAt: "2026-10-15T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      );
      await writeFile(reasonStorePath, staleReasonStore);

      const result = await runNpm(fixtureRoot, [
        command,
        "--no-audit",
        "--no-fund",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("stale override reason");
      expect(result.output).toContain("Current rationale.");
      expect(await readFile(reasonStorePath, "utf8")).toBe(staleReasonStore);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
});

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
      join(fixtureRoot, "override-reasons.jsonc"),
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

for (const command of ["install", "ci"]) {
  test(`npm ${command} displays the saved root override reason`, async () => {
    const fixtureRoot = await createFixture();

    try {
      if (command === "ci") {
        const lockResult = await runNpm(fixtureRoot, [
          "install",
          "--package-lock-only",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
        ]);
        expect(lockResult.exitCode).toBe(0);
      }

      const result = await runNpm(fixtureRoot, [
        command,
        "--no-audit",
        "--no-fund",
      ]);

      if (result.exitCode !== 0) {
        throw new Error(result.output);
      }
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("is-number");
      expect(result.output).toContain(documentedReason);
      const installedVersion = JSON.parse(
        await readFile(
          join(fixtureRoot, "node_modules/is-number/package.json"),
          "utf8",
        ),
      ).version;
      expect(installedVersion).toBe("7.0.0");

      const demoCommand = await runNpm(fixtureRoot, [
        "run",
        "check-overrides",
        "--workspace=@why-override/demo",
      ]);
      if (demoCommand.exitCode !== 0) {
        throw new Error(demoCommand.output);
      }
      expect(demoCommand.exitCode).toBe(0);
      expect(demoCommand.output).toContain(documentedReason);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
}
