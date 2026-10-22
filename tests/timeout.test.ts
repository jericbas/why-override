import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFixture, parseJSONC, runInteractiveNpm } from "./helpers.ts";

test("interactive prompt uses env timeout before project config", async () => {
  const fixtureRoot = await createFixture(undefined, 5);
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
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
      join(fixtureRoot, ".override-reasons.json"),
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
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
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
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" }, 1.5);
  try {
    await writeFile(
      join(fixtureRoot, ".override-reasons.json"),
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

test("typing input resets countdown timer and avoids premature timeout", async () => {
  const fixtureRoot = await createFixture({ "is-number": "7.0.0" }, 2);
  try {
    const reasonStorePath = join(fixtureRoot, ".override-reasons.json");
    await writeFile(
      reasonStorePath,
      JSON.stringify({ version: 1, reasons: [] }, null, 2),
    );

    let output = "";
    let prompted = false;
    const decoder = new TextDecoder();
    const child = Bun.spawn(["node", "packages/why-override/dist/cli.js"], {
      cwd: fixtureRoot,
      env: { ...process.env, OVERRIDE_TIMEOUT: "2" },
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
            setTimeout(() => {
              terminal.write("Typing ");
              setTimeout(() => {
                terminal.write("debounced answer\r");
              }, 1200);
            }, 1200);
          }
        },
      },
    });

    const safetyTimer = setTimeout(() => child.kill(), 10000);
    const exitCode = await child.exited;
    clearTimeout(safetyTimer);
    child.terminal.close();

    expect(exitCode).toBe(0);
    expect(output).not.toContain("Timed out after 2 seconds");

    const store = parseJSONC(await readFile(reasonStorePath, "utf8"));
    expect(store.reasons).toHaveLength(1);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
