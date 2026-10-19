#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { applyEdits, modify, parse } from "jsonc-parser/lib/esm/main.js";

function findWorkspaceRoot() {
  let currentDir = resolve(process.cwd());
  let nearestManifestDir;
  let workspaceRootDir;

  while (true) {
    const manifestPath = resolve(currentDir, "package.json");
    if (existsSync(manifestPath)) {
      nearestManifestDir ??= currentDir;
      try {
        const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (parsed?.workspaces !== undefined) {
          workspaceRootDir = currentDir;
        }
      } catch {
        // Ignore unreadable ancestor manifests while searching upward.
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return (
    workspaceRootDir ??
    nearestManifestDir ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
  );
}

const workspaceRoot = findWorkspaceRoot();
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
);
const reasonStorePath = resolve(workspaceRoot, "override-reasons.jsonc");
let reasonText = "";
let reasonStoreMissing = false;
try {
  reasonText = readFileSync(reasonStorePath, "utf8");
} catch (error) {
  if (error?.code === "ENOENT") {
    reasonStoreMissing = true;
  } else {
    throw error;
  }
}
const parseErrors = [];
let reasonDocument = reasonStoreMissing
  ? undefined
  : parse(reasonText, parseErrors, {
      allowTrailingComma: true,
    });
let reasonStoreWritable = !reasonStoreMissing;

function collectOverrideSelectors(overrides, parentPath = []) {
  const selectors = [];

  for (const [key, value] of Object.entries(overrides ?? {})) {
    const selector = [...parentPath, key];
    if (key.includes("*")) {
      console.warn(
        `Warning: unsupported wildcard override selector ${JSON.stringify(selector)}; skipping.`,
      );
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      selectors.push(...collectOverrideSelectors(value, selector));
    } else if (typeof value === "string") {
      selectors.push(selector);
    }
  }

  return selectors;
}

function selectorKey(selector) {
  return JSON.stringify(selector);
}

function formatSelector(selector) {
  return selector.map((segment) => JSON.stringify(segment)).join(" > ");
}

function warnDiagnostic(message) {
  console.warn(`\u001b[33;1m[why-override] Warning: ${message}\u001b[0m`);
}

function getRecordSelector(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }

  if (typeof record.selector === "string" && record.selector.length > 0) {
    return [record.selector];
  }
  if (
    Array.isArray(record.selector) &&
    record.selector.length > 0 &&
    record.selector.every(
      (segment) => typeof segment === "string" && segment.length > 0,
    )
  ) {
    return record.selector;
  }
  return undefined;
}

function isUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isValidReasonRecord(record) {
  const selector = getRecordSelector(record);
  return (
    selector !== undefined &&
    typeof record.reason === "string" &&
    record.reason.trim() !== "" &&
    isUtcTimestamp(record.createdAt) &&
    isUtcTimestamp(record.updatedAt)
  );
}

const defaultPromptTimeoutSeconds = 10;

function getPromptTimeoutSeconds() {
  const environmentTimeout = process.env.OVERRIDE_TIMEOUT;
  const projectTimeout = manifest.config?.["why-override"]?.timeout;
  const configuredTimeout =
    environmentTimeout !== undefined ? environmentTimeout : projectTimeout;

  if (configuredTimeout === undefined) {
    return defaultPromptTimeoutSeconds;
  }

  const timeoutSeconds = Number(configuredTimeout);
  if (
    (typeof configuredTimeout === "string" ||
      typeof configuredTimeout === "number") &&
    Number.isFinite(timeoutSeconds) &&
    Number.isInteger(timeoutSeconds) &&
    timeoutSeconds > 0
  ) {
    return timeoutSeconds;
  }

  console.warn(
    `Warning: invalid override prompt timeout ${JSON.stringify(configuredTimeout)}; using default ${defaultPromptTimeoutSeconds} seconds.`,
  );
  return defaultPromptTimeoutSeconds;
}

if (reasonStoreMissing) {
  warnDiagnostic(
    "override-reasons.jsonc is missing; saved reasons cannot be read or updated.",
  );
  reasonDocument = { version: 1, reasons: [] };
  reasonStoreWritable = false;
} else if (parseErrors.length > 0 || !Array.isArray(reasonDocument?.reasons)) {
  warnDiagnostic(
    "override-reasons.jsonc is malformed; saved reasons cannot be read or updated.",
  );
  reasonDocument = { version: 1, reasons: [] };
  reasonStoreWritable = false;
}

const selectors = collectOverrideSelectors(manifest.overrides);
const activeSelectorKeys = new Set(selectors.map(selectorKey));
const reasonsBySelector = new Map();
const minimumReviewAgeMilliseconds = 30 * 24 * 60 * 60 * 1000;

for (const record of reasonDocument.reasons) {
  const selector = getRecordSelector(record);
  const displaySelector = selector
    ? formatSelector(selector)
    : "unknown selector";
  if (!isValidReasonRecord(record)) {
    warnDiagnostic(
      `malformed override reason record for ${displaySelector}; treating it as undocumented and preserving the record.`,
    );
    continue;
  }

  const key = selectorKey(selector);
  if (!activeSelectorKeys.has(key)) {
    warnDiagnostic(
      `stale override reason for ${displaySelector}; preserving the record.`,
    );
    continue;
  }

  reasonsBySelector.set(key, record.reason);
  if (
    Date.now() - Date.parse(record.updatedAt) >=
    minimumReviewAgeMilliseconds
  ) {
    warnDiagnostic(
      `Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`,
    );
  }
}

const promptTimeoutSeconds = getPromptTimeoutSeconds();
const promptInterface = process.stdin.isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

async function askForExplanation(displaySelector) {
  if (!promptInterface) {
    return undefined;
  }

  let timeoutHandle;
  const timeoutToken = Symbol("prompt-timeout");
  const closeToken = Symbol("prompt-close");
  const response = await Promise.race([
    promptInterface
      .question(`Why do you need to override this? ${displaySelector}\n`)
      .catch(() => closeToken),
    new Promise((resolveTimeout) => {
      timeoutHandle = setTimeout(
        () => resolveTimeout(timeoutToken),
        promptTimeoutSeconds * 1000,
      );
    }),
  ]);
  clearTimeout(timeoutHandle);
  if (response === timeoutToken) {
    console.warn(
      `Timed out after ${promptTimeoutSeconds} seconds; skipping ${displaySelector}.`,
    );
    promptInterface.close();
    return undefined;
  }
  if (response === closeToken) {
    return undefined;
  }

  return response.trim();
}

async function refreshReason(selector) {
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex(
    (record) =>
      isValidReasonRecord(record) &&
      selectorKey(getRecordSelector(record)) === key,
  );
  const displaySelector = formatSelector(selector);

  if (recordIndex < 0) {
    console.error(`No saved reason exists for ${displaySelector}.`);
    process.exitCode = 1;
    return;
  }
  if (!promptInterface) {
    console.error("Refreshing a reason requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }

  const explanation = await askForExplanation(displaySelector);
  if (explanation === undefined || explanation === "") {
    return;
  }

  const record = reasonDocument.reasons[recordIndex];
  if (explanation === record.reason) {
    console.log(`Reason unchanged for ${displaySelector}.`);
    return;
  }

  const updatedAt = new Date().toISOString();
  const formattingOptions = {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  };
  const edits = [
    ...modify(
      reasonText,
      ["reasons", recordIndex, "reason"],
      explanation,
      formattingOptions,
    ),
    ...modify(
      reasonText,
      ["reasons", recordIndex, "updatedAt"],
      updatedAt,
      formattingOptions,
    ),
  ];
  reasonText = applyEdits(reasonText, edits);
  writeFileSync(reasonStorePath, reasonText);
  console.log(`Refreshed reason for ${displaySelector}.`);
}

try {
  if (process.argv[2] === "refresh") {
    let selector;
    try {
      selector = JSON.parse(process.argv[3] ?? "");
    } catch {
      selector = undefined;
    }

    if (
      process.argv.length !== 4 ||
      !Array.isArray(selector) ||
      selector.length === 0 ||
      !selector.every(
        (segment) => typeof segment === "string" && segment.length > 0,
      )
    ) {
      console.error(
        'Usage: why-override refresh \'["package", "nested-selector"]\'',
      );
      process.exitCode = 1;
    } else {
      await refreshReason(selector);
    }
  } else {
    for (const selector of selectors) {
      const key = selectorKey(selector);
      const displaySelector = formatSelector(selector);
      const reason = reasonsBySelector.get(key);
      if (typeof reason === "string" && reason.trim() !== "") {
        console.log(`Override ${displaySelector}: ${reason}`);
        continue;
      }

      if (!promptInterface) {
        continue;
      }

      const explanation = await askForExplanation(displaySelector);
      if (explanation === undefined) {
        break;
      }
      if (explanation === "") {
        continue;
      }
      if (!reasonStoreWritable) {
        warnDiagnostic(
          `cannot save a reason for ${displaySelector} because the reason store is ${reasonStoreMissing ? "missing" : "malformed"}; leaving it unchanged.`,
        );
        continue;
      }

      const timestamp = new Date().toISOString();
      const record = {
        selector,
        reason: explanation,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const edits = modify(
        reasonText,
        ["reasons", reasonDocument.reasons.length],
        record,
        { formattingOptions: { insertSpaces: true, tabSize: 2 } },
      );
      reasonText = applyEdits(reasonText, edits);
      writeFileSync(reasonStorePath, reasonText);
      reasonDocument.reasons.push(record);
      reasonsBySelector.set(key, explanation);
    }
  }
} finally {
  promptInterface?.close();
}
