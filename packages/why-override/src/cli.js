#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { applyEdits, modify, parse } from "jsonc-parser/lib/esm/main.js";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
);
let reasonText = readFileSync(
  resolve(workspaceRoot, "override-reasons.jsonc"),
  "utf8",
);
const parseErrors = [];
const reasonDocument = parse(reasonText, parseErrors, {
  allowTrailingComma: true,
});

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

if (parseErrors.length > 0 || !Array.isArray(reasonDocument?.reasons)) {
  console.warn(
    "Warning: override-reasons.jsonc is malformed; skipping saved reasons.",
  );
  process.exit(0);
}

const reasonsBySelector = new Map(
  reasonDocument.reasons.map((record) => [
    selectorKey(
      Array.isArray(record.selector) ? record.selector : [record.selector],
    ),
    record.reason,
  ]),
);
const selectors = collectOverrideSelectors(manifest.overrides);
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
  const response = await Promise.race([
    promptInterface.question(
      `Why do you need to override this? ${displaySelector}\n`,
    ),
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

  return response.trim();
}

async function refreshReason(selector) {
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findIndex(
    (record) =>
      selectorKey(
        Array.isArray(record.selector) ? record.selector : [record.selector],
      ) === key,
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
  writeFileSync(resolve(workspaceRoot, "override-reasons.jsonc"), reasonText);
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
      !selector.every((segment) => typeof segment === "string")
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

      const explanation = await askForExplanation(displaySelector);
      if (explanation === undefined) {
        break;
      }
      if (explanation === "") {
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
      writeFileSync(
        resolve(workspaceRoot, "override-reasons.jsonc"),
        reasonText,
      );
      reasonDocument.reasons.push(record);
      reasonsBySelector.set(key, explanation);
    }
  }
} finally {
  promptInterface?.close();
}
