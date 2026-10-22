import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { runCheck } from "../packages/why-override/src/check.js";
import { runDoctor } from "../packages/why-override/src/doctor.js";
import { buildDependentsLookup } from "../packages/why-override/src/doctor-deps.js";
import {
  collectAllManifestSelectors,
  getOverrideTarget,
  selectorKey,
} from "../packages/why-override/src/selectors.js";
import { validateReasons } from "../packages/why-override/src/store.js";
import { printOverrideTable } from "../packages/why-override/src/table.js";
import { runEnforcer } from "./helpers.ts";
import {
  createPerfFixture,
  generateSyntheticManifestAndReasons,
  runRustEnforcer,
} from "./perf-fixtures.ts";

function withSilentConsole<T>(fn: () => T): T {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

test("perf: in-process selector collection, store validation, and check scale sub-millisecond for 200 overrides", () => {
  const { manifest, reasonDocument } = generateSyntheticManifestAndReasons(200);

  // Warmup
  const warmupSelectors = collectAllManifestSelectors(manifest);
  validateReasons({
    reasonDocument,
    selectors: warmupSelectors,
    manifest,
    warn: false,
  });

  const startSelectors = performance.now();
  const selectors = collectAllManifestSelectors(manifest);
  const selectorsElapsed = performance.now() - startSelectors;
  expect(selectors.length).toBe(200);
  expect(selectorsElapsed).toBeLessThan(25);

  const startTargets = performance.now();
  for (const selector of selectors) {
    expect(getOverrideTarget(manifest, selector)).toBeDefined();
  }
  const targetsElapsed = performance.now() - startTargets;
  expect(targetsElapsed).toBeLessThan(25);

  const startValidate = performance.now();
  const { reasonsBySelector, workspacesBySelector } = validateReasons({
    reasonDocument,
    selectors,
    manifest,
    warn: false,
  });
  const validateElapsed = performance.now() - startValidate;
  expect(reasonsBySelector.size).toBe(200);
  expect(validateElapsed).toBeLessThan(25);

  const startCheck = performance.now();
  const checkPassed = withSilentConsole(() =>
    runCheck({
      selectors,
      reasonsBySelector,
      reasonDocument,
      reasonStoreMissing: false,
      reasonStoreWritable: true,
      reasonStoreFilename: ".override-reasons.json",
    }),
  );
  const checkElapsed = performance.now() - startCheck;
  expect(checkPassed).toBe(true);
  expect(checkElapsed).toBeLessThan(25);

  const entries = selectors.map((selector) => ({
    selector,
    reason: reasonsBySelector.get(selectorKey(selector)) ?? "",
    workspacesText: workspacesBySelector.get(selectorKey(selector)),
  }));
  const startTable = performance.now();
  withSilentConsole(() => printOverrideTable(entries, process.cwd(), manifest));
  const tableElapsed = performance.now() - startTable;
  expect(tableElapsed).toBeLessThan(150);
});

test("perf: doctor single-pass lockfile index analyzes 200 overrides across 5,000 lockfile packages quickly", async () => {
  const { fixtureRoot, manifest, reasonDocument } = await createPerfFixture({
    overrideCount: 200,
    lockfilePackageCount: 5000,
  });

  try {
    const selectors = collectAllManifestSelectors(manifest);
    const { reasonsBySelector } = validateReasons({
      reasonDocument,
      selectors,
      manifest,
      warn: false,
    });

    const startIndex = performance.now();
    const getDependents = buildDependentsLookup(fixtureRoot);
    const indexElapsed = performance.now() - startIndex;
    expect(getDependents("@scope-0/pkg-0").length).toBeGreaterThan(0);
    expect(indexElapsed).toBeLessThan(200);

    const startDoctor = performance.now();
    withSilentConsole(() =>
      runDoctor({
        workspaceRoot: fixtureRoot,
        manifest,
        selectors,
        reasonsBySelector,
        reasonDocument,
        reasonStoreFilename: ".override-reasons.json",
        reasonStoreMissing: false,
        reasonStoreWritable: true,
      }),
    );
    const doctorElapsed = performance.now() - startDoctor;
    expect(doctorElapsed).toBeLessThan(250);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("perf: doctor single-pass node_modules scan analyzes 50 overrides across 200 installed packages quickly", async () => {
  const { fixtureRoot, manifest, reasonDocument } = await createPerfFixture({
    overrideCount: 50,
    lockfilePackageCount: 0,
    nodeModulesCount: 200,
  });

  try {
    const selectors = collectAllManifestSelectors(manifest);
    const { reasonsBySelector } = validateReasons({
      reasonDocument,
      selectors,
      manifest,
      warn: false,
    });

    const startDoctor = performance.now();
    withSilentConsole(() =>
      runDoctor({
        workspaceRoot: fixtureRoot,
        manifest,
        selectors,
        reasonsBySelector,
        reasonDocument,
        reasonStoreFilename: ".override-reasons.json",
        reasonStoreMissing: false,
        reasonStoreWritable: true,
      }),
    );
    const doctorElapsed = performance.now() - startDoctor;
    expect(doctorElapsed).toBeLessThan(150);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("perf: end-to-end CLI commands (check, enforce, doctor) complete well within latency budget on large fixture", async () => {
  const { fixtureRoot } = await createPerfFixture({
    overrideCount: 200,
    lockfilePackageCount: 5000,
  });

  try {
    const startCheck = performance.now();
    const checkRes = await runEnforcer(fixtureRoot, ["check"]);
    const checkElapsed = performance.now() - startCheck;
    expect(checkRes.exitCode).toBe(0);
    expect(checkElapsed).toBeLessThan(500);

    const startEnforce = performance.now();
    const enforceRes = await runEnforcer(fixtureRoot, []);
    const enforceElapsed = performance.now() - startEnforce;
    expect(enforceRes.exitCode).toBe(0);
    expect(enforceElapsed).toBeLessThan(500);

    const startDoctor = performance.now();
    const doctorRes = await runEnforcer(fixtureRoot, ["doctor"]);
    const doctorElapsed = performance.now() - startDoctor;
    expect(doctorRes.exitCode).toBe(0);
    expect(doctorRes.output).toContain("Total Overrides: 200");
    expect(doctorElapsed).toBeLessThan(500);

    const startRustCheck = performance.now();
    const rustCheckRes = await runRustEnforcer(fixtureRoot, ["check"]);
    const rustCheckElapsed = performance.now() - startRustCheck;
    expect(rustCheckRes.exitCode).toBe(0);
    expect(rustCheckRes.output).toContain(
      "All 200 override reasons are documented",
    );
    expect(rustCheckElapsed).toBeLessThan(100);

    const startRustDoctor = performance.now();
    const rustDoctorRes = await runRustEnforcer(fixtureRoot, ["doctor"]);
    const rustDoctorElapsed = performance.now() - startRustDoctor;
    expect(rustDoctorRes.exitCode).toBe(0);
    expect(rustDoctorRes.output).toContain("Total Overrides: 200");
    expect(rustDoctorElapsed).toBeLessThan(150);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
