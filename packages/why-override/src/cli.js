#!/usr/bin/env node

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { clearLine, cursorTo, moveCursor } from "node:readline";
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

function findReasonStorePath(root) {
  const dotPath = resolve(root, ".override-reasons.jsonc");
  if (existsSync(dotPath)) {
    return dotPath;
  }
  const regularPath = resolve(root, "override-reasons.jsonc");
  if (existsSync(regularPath)) {
    return regularPath;
  }
  return dotPath;
}

const workspaceRoot = findWorkspaceRoot();
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
);
const reasonStorePath = findReasonStorePath(workspaceRoot);
const reasonStoreFilename = basename(reasonStorePath);
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
let reasonStoreWritable = true;

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

const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const ansi = (code) => (text) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
const color = {
  bold: ansi("1"),
  dim: ansi("2"),
  cyan: ansi("36;1"),
  green: ansi("32"),
  yellow: ansi("33"),
  magenta: ansi("35;1"),
};

function getOverrideTarget(selector) {
  let value = manifest.overrides;
  for (const segment of selector) {
    value = value?.[segment];
  }
  return typeof value === "string" ? value : undefined;
}

function packageNameFromSegment(segment) {
  // Selector keys may carry a version range, e.g. "foo@^1" or "@scope/foo@1".
  const versionAt = segment.indexOf("@", segment.startsWith("@") ? 1 : 0);
  return versionAt > 0 ? segment.slice(0, versionAt) : segment;
}

function getInstalledInfo(selector) {
  const segments = selector.filter((segment) => segment !== ".");
  const name = packageNameFromSegment(segments.at(-1) ?? "");
  const packageDir = resolve(workspaceRoot, "node_modules", name);
  try {
    const { version } = JSON.parse(
      readFileSync(resolve(packageDir, "package.json"), "utf8"),
    );
    // Files inside npm tarballs carry fixed timestamps, but the package
    // directory itself is created when the package is installed.
    return { name, version, installedAt: statSync(packageDir).mtime };
  } catch {
    return { name };
  }
}

function formatInstalledAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const elapsedMinutes = Math.max(0, (Date.now() - date.getTime()) / 60000);
  const relative =
    elapsedMinutes < 1
      ? "just now"
      : elapsedMinutes < 60
        ? `${Math.floor(elapsedMinutes)}m ago`
        : elapsedMinutes < 60 * 24
          ? `${Math.floor(elapsedMinutes / 60)}h ago`
          : `${Math.floor(elapsedMinutes / (60 * 24))}d ago`;
  return `${stamp} (${relative})`;
}

function wrapText(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let remaining = word;
    while (remaining.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    if (!line) {
      line = remaining;
    } else if (line.length + 1 + remaining.length <= width) {
      line += ` ${remaining}`;
    } else {
      lines.push(line);
      line = remaining;
    }
  }
  if (line || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}

function printOverrideTable(entries) {
  if (entries.length === 0) {
    return;
  }

  const headers = [
    "Package",
    "Override",
    "Installed",
    "Last installed",
    "Reason",
  ];
  const rows = entries.map(({ selector, reason }) => {
    const target = getOverrideTarget(selector) ?? "";
    const installed = getInstalledInfo(selector);
    const versionStyle =
      installed.version === undefined
        ? color.dim
        : installed.version === target
          ? color.green
          : color.yellow;
    return [
      { text: formatSelector(selector), style: color.bold },
      { text: target, style: color.magenta },
      { text: installed.version ?? "not installed", style: versionStyle },
      {
        text: installed.installedAt
          ? formatInstalledAt(installed.installedAt)
          : "-",
        style: color.dim,
      },
      { text: reason.trim(), style: (text) => text },
    ];
  });

  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      ...rows.map((row) => (column === 4 ? 0 : row[column].text.length)),
    ),
  );
  // Fit the reason column to the terminal: 3 chars of padding/border per
  // column plus the closing border.
  const fixedWidth =
    widths.slice(0, 4).reduce((sum, width) => sum + width + 3, 0) + 4;
  const longestReason = Math.max(
    headers[4].length,
    ...rows.map((row) => row[4].text.length),
  );
  widths[4] =
    process.stdout.isTTY && process.stdout.columns
      ? Math.max(
          20,
          Math.min(longestReason, process.stdout.columns - fixedWidth),
        )
      : longestReason;

  const border = (left, middle, right) =>
    color.dim(
      `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`,
    );
  const bar = color.dim("│");
  const renderLine = (cells) =>
    `${bar}${cells
      .map(
        ({ text, style }, column) =>
          ` ${style(text)}${" ".repeat(widths[column] - text.length)} `,
      )
      .join(bar)}${bar}`;

  const output = [
    border("┌", "┬", "┐"),
    renderLine(headers.map((text) => ({ text, style: color.cyan }))),
    border("├", "┼", "┤"),
  ];
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      output.push(border("├", "┼", "┤"));
    }
    const reasonLines = wrapText(row[4].text, widths[4]);
    reasonLines.forEach((reasonLine, index) => {
      output.push(
        renderLine(
          row.map((cell, column) =>
            column === 4
              ? { text: reasonLine, style: cell.style }
              : index === 0
                ? cell
                : { text: "", style: cell.style },
          ),
        ),
      );
    });
  });
  output.push(border("└", "┴", "┘"));
  console.log(output.join("\n"));

  for (const entry of entries) {
    if (entry.workspacesText) {
      console.log(
        `Override ${formatSelector(entry.selector)}${entry.workspacesText}: ${entry.reason}`,
      );
    }
  }
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
  if (
    selector === undefined ||
    (typeof record.reason === "string" && record.reason.trim() === "") ||
    typeof record.reason !== "string" ||
    !isUtcTimestamp(record.createdAt) ||
    !isUtcTimestamp(record.updatedAt)
  ) {
    return false;
  }
  if (record.target !== undefined && typeof record.target !== "string") {
    return false;
  }
  if (
    record.workspaces !== undefined &&
    (!Array.isArray(record.workspaces) ||
      record.workspaces.length === 0 ||
      !record.workspaces.every(
        (workspace) => typeof workspace === "string" && workspace.length > 0,
      ))
  ) {
    return false;
  }
  return true;
}

function debounce(fn, waitMs = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
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
    `${reasonStoreFilename} is missing; it will be created when you save a reason.`,
  );
  reasonDocument = { version: 1, reasons: [] };
  // Start from an empty store; the file is only written once a reason is saved.
  reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
} else if (parseErrors.length > 0 || !Array.isArray(reasonDocument?.reasons)) {
  warnDiagnostic(
    `${reasonStoreFilename} is malformed; saved reasons cannot be read or updated.`,
  );
  reasonDocument = { version: 1, reasons: [] };
  reasonStoreWritable = false;
}

const selectors = collectOverrideSelectors(manifest.overrides);
const activeSelectorKeys = new Set(selectors.map(selectorKey));
const reasonsBySelector = new Map();
const workspacesBySelector = new Map();
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
  if (Array.isArray(record.workspaces) && record.workspaces.length > 0) {
    workspacesBySelector.set(
      key,
      ` [workspaces: ${record.workspaces.join(", ")}]`,
    );
  }

  const currentTarget = getOverrideTarget(selector);
  if (
    record.target !== undefined &&
    currentTarget !== undefined &&
    record.target !== currentTarget
  ) {
    warnDiagnostic(
      `override target for ${displaySelector} changed from "${record.target}" to "${currentTarget}".`,
    );
  }

  if (
    Date.now() - Date.parse(record.updatedAt) >=
    minimumReviewAgeMilliseconds
  ) {
    warnDiagnostic(
      `Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`,
    );
  }
}

function getExistingReasons() {
  const reasons = [];
  const seen = new Set();
  for (const record of reasonDocument?.reasons ?? []) {
    if (
      isValidReasonRecord(record) &&
      typeof record.reason === "string" &&
      record.reason.trim() !== ""
    ) {
      const trimmed = record.reason.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        reasons.push(trimmed);
      }
    }
  }
  return reasons;
}

const promptTimeoutSeconds = getPromptTimeoutSeconds();
const promptInterface = process.stdin.isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

async function askForExplanation(displaySelector) {
  if (!promptInterface) {
    return undefined;
  }

  const existingReasons = getExistingReasons();
  if (existingReasons.length > 0) {
    console.log("Existing reasons:");
    existingReasons.forEach((reason, index) => {
      console.log(`  ${index + 1}) ${reason}`);
    });
    console.log(
      color.dim(
        `Type a reason, or enter 1-${existingReasons.length} to select an existing one.`,
      ),
    );
  }

  let timeoutHandle;
  let countdownHandle;
  const timeoutToken = Symbol("prompt-timeout");
  const closeToken = Symbol("prompt-close");
  const formatQuestion = (secondsLeft) =>
    `${color.cyan("Why do you need to override this?")} ${color.yellow(color.bold(displaySelector))} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
  let deadline = Date.now() + promptTimeoutSeconds * 1000;

  const renderQuestion = (secondsLeft) => {
    if (!process.stdout.isTTY) {
      return;
    }
    const rowsBelowQuestion = promptInterface.getCursorPos().rows;
    process.stdout.write("\x1b7");
    moveCursor(process.stdout, 0, -rowsBelowQuestion);
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
    process.stdout.write(formatQuestion(secondsLeft));
    process.stdout.write("\x1b8");
  };

  let resolveTimeoutPromise;
  const timeoutPromise = new Promise((resolve) => {
    resolveTimeoutPromise = resolve;
  });

  const armTimeout = () => {
    clearTimeout(timeoutHandle);
    const msRemaining = Math.max(0, deadline - Date.now());
    timeoutHandle = setTimeout(
      () => resolveTimeoutPromise(timeoutToken),
      msRemaining,
    );
  };

  armTimeout();

  if (process.stdout.isTTY) {
    countdownHandle = setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000),
      );
      renderQuestion(secondsLeft);
    }, 1000);
  }

  const debouncedResetTimer = debounce(() => {
    deadline = Date.now() + promptTimeoutSeconds * 1000;
    armTimeout();
    renderQuestion(promptTimeoutSeconds);
  }, 300);

  const onInput = () => {
    deadline = Date.now() + promptTimeoutSeconds * 1000;
    clearTimeout(timeoutHandle);
    debouncedResetTimer();
  };

  process.stdin.on("data", onInput);

  let response;
  try {
    const questionPromise = promptInterface
      .question(`${formatQuestion(promptTimeoutSeconds)}\n`)
      .catch(() => closeToken);

    response = await Promise.race([questionPromise, timeoutPromise]);
  } finally {
    process.stdin.removeListener("data", onInput);
    debouncedResetTimer.cancel();
    clearTimeout(timeoutHandle);
    clearInterval(countdownHandle);
  }

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

  const trimmed = response.trim();
  const optionMatch = trimmed.match(/^#?([1-9]\d*)$/);
  if (optionMatch) {
    const optionIndex = Number(optionMatch[1]) - 1;
    if (optionIndex >= 0 && optionIndex < existingReasons.length) {
      const selected = existingReasons[optionIndex];
      console.log(`Selected: ${selected}`);
      return selected;
    }
  }

  return trimmed;
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
  const currentTarget = getOverrideTarget(selector);
  const targetChanged =
    currentTarget !== undefined && currentTarget !== record.target;
  if (explanation === record.reason && !targetChanged) {
    console.log(`Reason unchanged for ${displaySelector}.`);
    return;
  }

  const updatedAt = new Date().toISOString();
  const formattingOptions = {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  };
  reasonText = applyEdits(
    reasonText,
    modify(
      reasonText,
      ["reasons", recordIndex, "reason"],
      explanation,
      formattingOptions,
    ),
  );
  reasonText = applyEdits(
    reasonText,
    modify(
      reasonText,
      ["reasons", recordIndex, "updatedAt"],
      updatedAt,
      formattingOptions,
    ),
  );
  if (currentTarget !== undefined) {
    reasonText = applyEdits(
      reasonText,
      modify(
        reasonText,
        ["reasons", recordIndex, "target"],
        currentTarget,
        formattingOptions,
      ),
    );
  }
  writeFileSync(reasonStorePath, reasonText);
  record.reason = explanation;
  record.updatedAt = updatedAt;
  if (currentTarget !== undefined) {
    record.target = currentTarget;
  }
  console.log(`Refreshed reason for ${displaySelector}.`);
}

try {
  if (process.argv[2] === "refresh") {
    if (process.argv[3] === "--all" || process.argv[3] === "-a") {
      for (const selector of selectors) {
        await refreshReason(selector);
      }
      if (selectors.length > 0) {
        console.log(
          color.dim(
            `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
          ),
        );
      }
    } else {
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
          'Usage: why-override refresh \'["package", "nested-selector"]\' or why-override refresh --all',
        );
        process.exitCode = 1;
      } else {
        await refreshReason(selector);
        console.log(
          color.dim(
            `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
          ),
        );
      }
    }
  } else {
    const isReenter =
      process.argv.includes("--reenter") || process.argv.includes("--re-enter");

    printOverrideTable(
      selectors
        .map((selector) => {
          const key = selectorKey(selector);
          return {
            selector,
            reason: reasonsBySelector.get(key),
            workspacesText: workspacesBySelector.get(key),
          };
        })
        .filter(
          ({ reason }) => typeof reason === "string" && reason.trim() !== "",
        ),
    );

    for (const selector of selectors) {
      const key = selectorKey(selector);
      const displaySelector = formatSelector(selector);
      const reason = reasonsBySelector.get(key);
      if (typeof reason === "string" && reason.trim() !== "") {
        if (isReenter) {
          await refreshReason(selector);
        }
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
          `cannot save a reason for ${displaySelector} because the reason store is malformed; leaving it unchanged.`,
        );
        continue;
      }

      const timestamp = new Date().toISOString();
      const currentTarget = getOverrideTarget(selector);
      const record = {
        selector,
        reason: explanation,
        ...(currentTarget !== undefined ? { target: currentTarget } : {}),
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
      if (reasonStoreMissing) {
        console.log(`Created ${reasonStorePath}.`);
        reasonStoreMissing = false;
      }
      reasonDocument.reasons.push(record);
      reasonsBySelector.set(key, explanation);
    }

    if (selectors.length > 0) {
      console.log(
        color.dim(
          `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
        ),
      );
    }
  }
} finally {
  promptInterface?.close();
}
