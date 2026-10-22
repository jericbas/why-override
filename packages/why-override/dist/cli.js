#!/usr/bin/env node

// packages/why-override/src/cli.js
import { readFileSync as readFileSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { basename, resolve as resolve3 } from "node:path";
import { createInterface } from "node:readline/promises";

// packages/why-override/src/color.js
var useColor = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
var ansi = (code) => (text) => useColor ? `\x1B[${code}m${text}\x1B[0m` : text;
var color = {
  bold: ansi("1"),
  dim: ansi("2"),
  cyan: ansi("36;1"),
  green: ansi("32"),
  yellow: ansi("33"),
  magenta: ansi("35;1")
};
function warnDiagnostic(message) {
  console.warn(`\x1B[33;1m[why-override] Warning: ${message}\x1B[0m`);
}

// packages/why-override/src/enforce.js
import { writeFileSync as writeFileSync2 } from "node:fs";

// packages/why-override/src/prompt.js
import { clearLine, cursorTo, moveCursor } from "node:readline";

// packages/why-override/src/store.js
import { readFileSync as readFileSync2 } from "node:fs";

// packages/why-override/src/selectors.js
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
function collectOverrideSelectors(overrides, parentPath = []) {
  const selectors = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const selector = [...parentPath, key];
    if (key.includes("*")) {
      console.warn(`Warning: unsupported wildcard override selector ${JSON.stringify(selector)}; skipping.`);
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
function packageNameFromSegment(segment) {
  const versionAt = segment.indexOf("@", segment.startsWith("@") ? 1 : 0);
  return versionAt > 0 ? segment.slice(0, versionAt) : segment;
}
function getInstalledInfo(selector, workspaceRoot) {
  const segments = selector.filter((segment) => segment !== ".");
  const name = packageNameFromSegment(segments.at(-1) ?? "");
  const packageDir = resolve(workspaceRoot, "node_modules", name);
  try {
    const { version } = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));
    return { name, version, installedAt: statSync(packageDir).mtime };
  } catch {
    return { name };
  }
}
function formatInstalledAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const elapsedMinutes = Math.max(0, (Date.now() - date.getTime()) / 60000);
  const relative = elapsedMinutes < 1 ? "just now" : elapsedMinutes < 60 ? `${Math.floor(elapsedMinutes)}m ago` : elapsedMinutes < 60 * 24 ? `${Math.floor(elapsedMinutes / 60)}h ago` : `${Math.floor(elapsedMinutes / (60 * 24))}d ago`;
  return `${stamp} (${relative})`;
}
function getOverrideTarget(manifest, selector) {
  let value = manifest.overrides;
  for (const segment of selector) {
    value = value?.[segment];
  }
  return typeof value === "string" ? value : undefined;
}

// packages/why-override/src/store.js
function getRecordSelector(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return;
  }
  if (typeof record.selector === "string" && record.selector.length > 0) {
    return [record.selector];
  }
  if (Array.isArray(record.selector) && record.selector.length > 0 && record.selector.every((segment) => typeof segment === "string" && segment.length > 0)) {
    return record.selector;
  }
  return;
}
function isUtcTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
function isValidReasonRecord(record) {
  const selector = getRecordSelector(record);
  if (selector === undefined || typeof record.reason === "string" && record.reason.trim() === "" || typeof record.reason !== "string" || !isUtcTimestamp(record.createdAt) || !isUtcTimestamp(record.updatedAt)) {
    return false;
  }
  if (record.target !== undefined && typeof record.target !== "string") {
    return false;
  }
  if (record.workspaces !== undefined && (!Array.isArray(record.workspaces) || record.workspaces.length === 0 || !record.workspaces.every((workspace) => typeof workspace === "string" && workspace.length > 0))) {
    return false;
  }
  return true;
}
function getPromptTimeoutSeconds(manifest) {
  const defaultTimeout = 10;
  const envTimeout = process.env.OVERRIDE_TIMEOUT;
  const projectTimeout = manifest.config?.["why-override"]?.timeout;
  const configured = envTimeout !== undefined ? envTimeout : projectTimeout;
  if (configured === undefined) {
    return defaultTimeout;
  }
  const timeoutSeconds = Number(configured);
  if ((typeof configured === "string" || typeof configured === "number") && Number.isFinite(timeoutSeconds) && Number.isInteger(timeoutSeconds) && timeoutSeconds > 0) {
    return timeoutSeconds;
  }
  console.warn(`Warning: invalid override prompt timeout ${JSON.stringify(configured)}; using default ${defaultTimeout} seconds.`);
  return defaultTimeout;
}
function getExistingReasons(reasonDocument) {
  const reasons = [];
  const seen = new Set;
  for (const record of reasonDocument?.reasons ?? []) {
    if (isValidReasonRecord(record) && typeof record.reason === "string" && record.reason.trim() !== "") {
      const trimmed = record.reason.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        reasons.push(trimmed);
      }
    }
  }
  return reasons;
}
function loadReasonStore(reasonStorePath, reasonStoreFilename) {
  let reasonText = "";
  let reasonStoreMissing = false;
  try {
    reasonText = readFileSync2(reasonStorePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      reasonStoreMissing = true;
    } else {
      throw error;
    }
  }
  let reasonDocument;
  let reasonStoreWritable = true;
  if (reasonStoreMissing) {
    warnDiagnostic(`${reasonStoreFilename} is missing; it will be created when you save a reason.`);
    reasonDocument = { version: 1, reasons: [] };
    reasonText = `${JSON.stringify(reasonDocument, null, 2)}
`;
  } else {
    try {
      reasonDocument = JSON.parse(reasonText);
    } catch {
      reasonDocument = undefined;
    }
    if (reasonDocument === null || typeof reasonDocument !== "object" || !Array.isArray(reasonDocument?.reasons)) {
      warnDiagnostic(`${reasonStoreFilename} is malformed; saved reasons cannot be read or updated.`);
      reasonDocument = { version: 1, reasons: [] };
      reasonStoreWritable = false;
    }
  }
  return {
    reasonText,
    reasonDocument,
    reasonStoreMissing,
    reasonStoreWritable
  };
}
function validateReasons({
  reasonDocument,
  selectors,
  manifest,
  minimumReviewAgeMs = 30 * 24 * 60 * 60 * 1000
}) {
  const activeSelectorKeys = new Set(selectors.map(selectorKey));
  const reasonsBySelector = new Map;
  const workspacesBySelector = new Map;
  for (const record of reasonDocument.reasons) {
    const selector = getRecordSelector(record);
    const displaySelector = selector ? formatSelector(selector) : "unknown selector";
    if (!isValidReasonRecord(record)) {
      warnDiagnostic(`malformed override reason record for ${displaySelector}; treating it as undocumented and preserving the record.`);
      continue;
    }
    const key = selectorKey(selector);
    if (!activeSelectorKeys.has(key)) {
      warnDiagnostic(`stale override reason for ${displaySelector}; preserving the record.`);
      continue;
    }
    reasonsBySelector.set(key, record.reason);
    if (Array.isArray(record.workspaces) && record.workspaces.length > 0) {
      workspacesBySelector.set(key, ` [workspaces: ${record.workspaces.join(", ")}]`);
    }
    const currentTarget = getOverrideTarget(manifest, selector);
    if (record.target !== undefined && currentTarget !== undefined && record.target !== currentTarget) {
      warnDiagnostic(`override target for ${displaySelector} changed from "${record.target}" to "${currentTarget}".`);
    }
    if (Date.now() - Date.parse(record.updatedAt) >= minimumReviewAgeMs) {
      warnDiagnostic(`Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`);
    }
  }
  return { reasonsBySelector, workspacesBySelector };
}

// packages/why-override/src/prompt.js
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
async function promptWithCountdown({
  promptInterface,
  promptTimeoutSeconds,
  formatQuestion,
  timeoutMessage
}) {
  if (!promptInterface) {
    return;
  }
  let timeoutHandle;
  let countdownHandle;
  const timeoutToken = Symbol("prompt-timeout");
  const closeToken = Symbol("prompt-close");
  let deadline = Date.now() + promptTimeoutSeconds * 1000;
  const renderQuestion = (secondsLeft) => {
    if (!process.stdout.isTTY) {
      return;
    }
    const rowsBelowQuestion = promptInterface.getCursorPos().rows;
    process.stdout.write("\x1B7");
    moveCursor(process.stdout, 0, -rowsBelowQuestion);
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
    process.stdout.write(formatQuestion(secondsLeft));
    process.stdout.write("\x1B8");
  };
  let resolveTimeoutPromise;
  const timeoutPromise = new Promise((resolve) => {
    resolveTimeoutPromise = resolve;
  });
  const armTimeout = () => {
    clearTimeout(timeoutHandle);
    const msRemaining = Math.max(0, deadline - Date.now());
    timeoutHandle = setTimeout(() => resolveTimeoutPromise(timeoutToken), msRemaining);
  };
  armTimeout();
  if (process.stdout.isTTY) {
    countdownHandle = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
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
    const questionPromise = promptInterface.question(`${formatQuestion(promptTimeoutSeconds)}
`).catch(() => closeToken);
    response = await Promise.race([questionPromise, timeoutPromise]);
  } finally {
    process.stdin.removeListener("data", onInput);
    debouncedResetTimer.cancel();
    clearTimeout(timeoutHandle);
    clearInterval(countdownHandle);
  }
  if (response === timeoutToken) {
    if (timeoutMessage) {
      console.warn(timeoutMessage);
    }
    promptInterface.close();
    return;
  }
  if (response === closeToken) {
    return;
  }
  return response;
}
async function askForExplanation({
  promptInterface,
  promptTimeoutSeconds,
  reasonDocument,
  displaySelector
}) {
  if (!promptInterface) {
    return;
  }
  const existingReasons = getExistingReasons(reasonDocument);
  if (existingReasons.length > 0) {
    console.log("Existing reasons:");
    existingReasons.forEach((reason, index) => {
      console.log(`  ${index + 1}) ${reason}`);
    });
    console.log(color.dim(`Type a reason, or enter 1-${existingReasons.length} to select an existing one.`));
  }
  const formatQuestion = (secondsLeft) => `${color.cyan("Why do you need to override this?")} ${color.yellow(color.bold(displaySelector))} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
  const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping ${displaySelector}.`;
  const response = await promptWithCountdown({
    promptInterface,
    promptTimeoutSeconds,
    formatQuestion,
    timeoutMessage
  });
  if (response === undefined) {
    return;
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

// packages/why-override/src/refresh.js
import { writeFileSync } from "node:fs";

// packages/why-override/src/selection.js
function parsePackageSelection(input, selectors) {
  const trimmed = input.trim();
  if (trimmed === "") {
    return [];
  }
  if (trimmed.toLowerCase() === "all" || trimmed === "*") {
    return [...selectors];
  }
  const exactIndex = selectors.findIndex((sel) => formatSelector(sel) === trimmed || formatSelector(sel).replace(/"/g, "") === trimmed || sel.join(" > ") === trimmed);
  if (exactIndex >= 0) {
    return [selectors[exactIndex]];
  }
  const selectedIndices = new Set;
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end > selectors.length || start > end) {
        return;
      }
      for (let i = start;i <= end; i++) {
        selectedIndices.add(i - 1);
      }
    } else {
      const singleMatch = token.match(/^#?(\d+)$/);
      if (singleMatch) {
        const index = Number(singleMatch[1]) - 1;
        if (index < 0 || index >= selectors.length) {
          return;
        }
        selectedIndices.add(index);
      } else {
        const unquoted = token.replace(/^["']|["']$/g, "");
        const matchedIndex = selectors.findIndex((sel) => sel.includes(unquoted) || formatSelector(sel).replace(/"/g, "") === unquoted);
        if (matchedIndex >= 0) {
          selectedIndices.add(matchedIndex);
        } else {
          return;
        }
      }
    }
  }
  if (selectedIndices.size === 0) {
    return;
  }
  return selectors.filter((_, idx) => selectedIndices.has(idx));
}
async function askForPackageSelection({
  promptInterface,
  promptTimeoutSeconds,
  selectors,
  reasonsBySelector
}) {
  if (!promptInterface) {
    return;
  }
  console.log("Select package(s) to refresh:");
  selectors.forEach((selector, index) => {
    const key = selectorKey(selector);
    const existing = reasonsBySelector.get(key);
    const reasonPreview = existing ? color.dim(` (${existing.trim()})`) : "";
    console.log(`  ${index + 1}) ${color.bold(formatSelector(selector))}${reasonPreview}`);
  });
  console.log(color.dim(`Enter package number(s) separated by commas (e.g. 1, 2), a range (e.g. 1-${selectors.length}), or 'all'. Press Enter to cancel.`));
  while (true) {
    const formatQuestion = (secondsLeft) => `${color.cyan("Which package(s) do you want to refresh?")} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
    const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping refresh.`;
    const response = await promptWithCountdown({
      promptInterface,
      promptTimeoutSeconds,
      formatQuestion,
      timeoutMessage
    });
    if (response === undefined) {
      return;
    }
    if (response.trim() === "") {
      console.log("No packages selected; skipping.");
      return;
    }
    const selected = parsePackageSelection(response, selectors);
    if (selected && selected.length > 0) {
      return selected;
    }
    console.warn(color.yellow(`Invalid selection "${response.trim()}". Please enter numbers 1-${selectors.length}, ranges, or 'all'.`));
  }
}

// packages/why-override/src/refresh.js
function updateSelectorReason(context, selector, explanation) {
  const { manifest, reasonDocument, reasonsBySelector, reasonStorePath } = context;
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex((record) => isValidReasonRecord(record) && selectorKey(getRecordSelector(record)) === key);
  const displaySelector = formatSelector(selector);
  const currentTarget = getOverrideTarget(manifest, selector);
  if (recordIndex >= 0) {
    const record = reasonDocument.reasons[recordIndex];
    const targetChanged = currentTarget !== undefined && currentTarget !== record.target;
    if (explanation === record.reason && !targetChanged) {
      console.log(`Reason unchanged for ${displaySelector}.`);
      return false;
    }
    const updatedAt = new Date().toISOString();
    record.reason = explanation;
    record.updatedAt = updatedAt;
    if (currentTarget !== undefined) {
      record.target = currentTarget;
    }
    context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}
`;
    reasonsBySelector.set(key, explanation);
    console.log(`Refreshed reason for ${displaySelector}.`);
    return true;
  }
  const timestamp = new Date().toISOString();
  const record = {
    selector,
    reason: explanation,
    ...currentTarget !== undefined ? { target: currentTarget } : {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  reasonDocument.reasons.push(record);
  context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}
`;
  if (context.reasonStoreMissing) {
    console.log(`Created ${reasonStorePath}.`);
    context.reasonStoreMissing = false;
  }
  reasonsBySelector.set(key, explanation);
  console.log(`Refreshed reason for ${displaySelector}.`);
  return true;
}
async function refreshReason(context, selector) {
  const { reasonDocument, promptInterface, reasonStorePath } = context;
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex((record) => isValidReasonRecord(record) && selectorKey(getRecordSelector(record)) === key);
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
  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds: context.promptTimeoutSeconds,
    reasonDocument,
    displaySelector
  });
  if (explanation === undefined || explanation === "") {
    return;
  }
  const changed = updateSelectorReason(context, selector, explanation);
  if (changed) {
    writeFileSync(reasonStorePath, context.reasonText);
  }
}
async function refreshInteractive(context) {
  const {
    promptInterface,
    selectors,
    reasonsBySelector,
    promptTimeoutSeconds,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename
  } = context;
  if (!promptInterface) {
    console.error("Refreshing a reason requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }
  if (selectors.length === 0) {
    console.log("No overrides found.");
    return;
  }
  const selectedSelectors = await askForPackageSelection({
    promptInterface,
    promptTimeoutSeconds,
    selectors,
    reasonsBySelector
  });
  if (!selectedSelectors || selectedSelectors.length === 0) {
    return;
  }
  const displaySelector = selectedSelectors.map(formatSelector).join(", ");
  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds,
    reasonDocument,
    displaySelector
  });
  if (explanation === undefined || explanation === "") {
    return;
  }
  let anyChanged = false;
  for (const selector of selectedSelectors) {
    const changed = updateSelectorReason(context, selector, explanation);
    if (changed) {
      anyChanged = true;
    }
  }
  if (anyChanged) {
    writeFileSync(reasonStorePath, context.reasonText);
  }
  console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
}

// packages/why-override/src/table.js
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
function printOverrideTable(entries, workspaceRoot, manifest) {
  if (entries.length === 0) {
    return;
  }
  const headers = [
    "Package",
    "Override",
    "Installed",
    "Last installed",
    "Reason"
  ];
  const rows = entries.map(({ selector, reason }) => {
    const target = getOverrideTarget(manifest, selector) ?? "";
    const installed = getInstalledInfo(selector, workspaceRoot);
    const versionStyle = installed.version === undefined ? color.dim : installed.version === target ? color.green : color.yellow;
    return [
      { text: formatSelector(selector), style: color.bold },
      { text: target, style: color.magenta },
      { text: installed.version ?? "not installed", style: versionStyle },
      {
        text: installed.installedAt ? formatInstalledAt(installed.installedAt) : "-",
        style: color.dim
      },
      { text: reason.trim(), style: (text) => text }
    ];
  });
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => column === 4 ? 0 : row[column].text.length)));
  const fixedWidth = widths.slice(0, 4).reduce((sum, width) => sum + width + 3, 0) + 4;
  const longestReason = Math.max(headers[4].length, ...rows.map((row) => row[4].text.length));
  widths[4] = process.stdout.isTTY && process.stdout.columns ? Math.max(20, Math.min(longestReason, process.stdout.columns - fixedWidth)) : longestReason;
  const border = (left, middle, right) => color.dim(`${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`);
  const bar = color.dim("│");
  const renderLine = (cells) => `${bar}${cells.map(({ text, style }, column) => ` ${style(text)}${" ".repeat(widths[column] - text.length)} `).join(bar)}${bar}`;
  const output = [
    border("┌", "┬", "┐"),
    renderLine(headers.map((text) => ({ text, style: color.cyan }))),
    border("├", "┼", "┤")
  ];
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      output.push(border("├", "┼", "┤"));
    }
    const reasonLines = wrapText(row[4].text, widths[4]);
    reasonLines.forEach((reasonLine, index) => {
      output.push(renderLine(row.map((cell, column) => column === 4 ? { text: reasonLine, style: cell.style } : index === 0 ? cell : { text: "", style: cell.style })));
    });
  });
  output.push(border("└", "┴", "┘"));
  console.log(output.join(`
`));
  for (const entry of entries) {
    if (entry.workspacesText) {
      console.log(`Override ${formatSelector(entry.selector)}${entry.workspacesText}: ${entry.reason}`);
    }
  }
}

// packages/why-override/src/enforce.js
async function runEnforce(context, isReenter) {
  const {
    selectors,
    reasonsBySelector,
    workspacesBySelector,
    workspaceRoot,
    manifest,
    promptInterface,
    promptTimeoutSeconds,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename
  } = context;
  printOverrideTable(selectors.map((selector) => {
    const key = selectorKey(selector);
    return {
      selector,
      reason: reasonsBySelector.get(key),
      workspacesText: workspacesBySelector.get(key)
    };
  }).filter(({ reason }) => typeof reason === "string" && reason.trim() !== ""), workspaceRoot, manifest);
  for (const selector of selectors) {
    const key = selectorKey(selector);
    const displaySelector = formatSelector(selector);
    const reason = reasonsBySelector.get(key);
    if (typeof reason === "string" && reason.trim() !== "") {
      if (isReenter) {
        await refreshReason(context, selector);
      }
      continue;
    }
    if (!promptInterface) {
      continue;
    }
    const explanation = await askForExplanation({
      promptInterface,
      promptTimeoutSeconds,
      reasonDocument,
      displaySelector
    });
    if (explanation === undefined) {
      break;
    }
    if (explanation === "") {
      continue;
    }
    if (!context.reasonStoreWritable) {
      warnDiagnostic(`cannot save a reason for ${displaySelector} because the reason store is malformed; leaving it unchanged.`);
      continue;
    }
    const timestamp = new Date().toISOString();
    const currentTarget = getOverrideTarget(manifest, selector);
    const record = {
      selector,
      reason: explanation,
      ...currentTarget !== undefined ? { target: currentTarget } : {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    reasonDocument.reasons.push(record);
    context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}
`;
    writeFileSync2(reasonStorePath, context.reasonText);
    if (context.reasonStoreMissing) {
      console.log(`Created ${reasonStorePath}.`);
      context.reasonStoreMissing = false;
    }
    reasonsBySelector.set(key, explanation);
  }
  if (selectors.length > 0) {
    console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
  }
}

// packages/why-override/src/workspace.js
import { existsSync, readFileSync as readFileSync3 } from "node:fs";
import { dirname, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
function findWorkspaceRoot() {
  let currentDir = resolve2(process.cwd());
  let nearestManifestDir;
  let workspaceRootDir;
  while (true) {
    const manifestPath = resolve2(currentDir, "package.json");
    if (existsSync(manifestPath)) {
      nearestManifestDir ??= currentDir;
      try {
        const parsed = JSON.parse(readFileSync3(manifestPath, "utf8"));
        if (parsed?.workspaces !== undefined) {
          workspaceRootDir = currentDir;
        }
      } catch {}
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return workspaceRootDir ?? nearestManifestDir ?? resolve2(dirname(fileURLToPath(import.meta.url)), "../../..");
}
function findReasonStorePath(root) {
  const dotPath = resolve2(root, ".override-reasons.json");
  if (existsSync(dotPath)) {
    return dotPath;
  }
  const regularPath = resolve2(root, "override-reasons.json");
  if (existsSync(regularPath)) {
    return regularPath;
  }
  return dotPath;
}

// packages/why-override/src/cli.js
var workspaceRoot = findWorkspaceRoot();
var manifest = JSON.parse(readFileSync4(resolve3(workspaceRoot, "package.json"), "utf8"));
var reasonStorePath = findReasonStorePath(workspaceRoot);
var reasonStoreFilename = basename(reasonStorePath);
var storeData = loadReasonStore(reasonStorePath, reasonStoreFilename);
var { reasonDocument, reasonStoreMissing, reasonStoreWritable } = storeData;
var promptTimeoutSeconds = getPromptTimeoutSeconds(manifest);
var promptInterface = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
var selectors = collectOverrideSelectors(manifest.overrides);
var { reasonsBySelector, workspacesBySelector } = validateReasons({
  reasonDocument,
  selectors,
  manifest
});
var context = {
  workspaceRoot,
  manifest,
  reasonStorePath,
  reasonStoreFilename,
  reasonText: storeData.reasonText,
  reasonDocument,
  reasonStoreMissing,
  reasonStoreWritable,
  promptTimeoutSeconds,
  promptInterface,
  selectors,
  reasonsBySelector,
  workspacesBySelector
};
try {
  if (process.argv[2] === "refresh") {
    if (process.argv[3] === "--all" || process.argv[3] === "-a") {
      for (const selector of selectors) {
        await refreshReason(context, selector);
      }
      if (selectors.length > 0) {
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      }
    } else if (process.argv.length === 3) {
      await refreshInteractive(context);
    } else {
      let selector;
      try {
        selector = JSON.parse(process.argv[3] ?? "");
      } catch {
        selector = undefined;
      }
      const isSingle = Array.isArray(selector) && selector.length > 0 && selector.every((seg) => typeof seg === "string" && seg.length > 0);
      const isMulti = Array.isArray(selector) && selector.length > 0 && selector.every((item) => Array.isArray(item) && item.length > 0 && item.every((seg) => typeof seg === "string" && seg.length > 0));
      if (process.argv.length !== 4 || !isSingle && !isMulti) {
        console.error(`Usage: why-override refresh '["package", "nested-selector"]' or why-override refresh --all`);
        process.exitCode = 1;
      } else if (isSingle) {
        await refreshReason(context, selector);
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      } else if (isMulti) {
        const displaySelector = selector.map(formatSelector).join(", ");
        const explanation = await askForExplanation({
          promptInterface,
          promptTimeoutSeconds,
          reasonDocument,
          displaySelector
        });
        if (explanation !== undefined && explanation !== "") {
          let anyChanged = false;
          for (const item of selector) {
            if (updateSelectorReason(context, item, explanation)) {
              anyChanged = true;
            }
          }
          if (anyChanged) {
            writeFileSync3(reasonStorePath, context.reasonText);
          }
        }
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      }
    }
  } else {
    const isReenter = process.argv.includes("--reenter") || process.argv.includes("--re-enter");
    await runEnforce(context, isReenter);
  }
} finally {
  promptInterface?.close();
}
