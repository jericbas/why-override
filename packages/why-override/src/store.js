import { readFileSync } from "node:fs";
import { warnDiagnostic } from "./color.js";
import { formatSelector, getOverrideTarget, selectorKey } from "./selectors.js";

const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function getRecordSelector(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }
  if (typeof record.selector === "string" && record.selector.length > 0) {
    return [record.selector];
  }
  if (
    Array.isArray(record.selector) &&
    record.selector.length > 0 &&
    record.selector.every((s) => typeof s === "string" && s.length > 0)
  ) {
    return record.selector;
  }
  return undefined;
}

function parseUtcTimestampMs(value) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_RE.test(value)) {
    return Number.NaN;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return Number.NaN;
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const year = Number(value.slice(0, 4));
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay =
    month === 2
      ? isLeap
        ? 29
        : 28
      : month === 4 || month === 6 || month === 9 || month === 11
        ? 30
        : 31;
  return day <= maxDay && hour <= 23 ? ms : Number.NaN;
}

export function isUtcTimestamp(value) {
  return !Number.isNaN(parseUtcTimestampMs(value));
}

export function isValidReasonRecord(record) {
  const selector = getRecordSelector(record);
  if (
    selector === undefined ||
    typeof record.reason !== "string" ||
    record.reason.trim() === "" ||
    !isUtcTimestamp(record.createdAt) ||
    !isUtcTimestamp(record.updatedAt) ||
    (record.target !== undefined && typeof record.target !== "string")
  ) {
    return false;
  }
  return (
    record.workspaces === undefined ||
    (Array.isArray(record.workspaces) &&
      record.workspaces.length > 0 &&
      record.workspaces.every((w) => typeof w === "string" && w.length > 0))
  );
}

export function getPromptTimeoutSeconds(manifest) {
  const defaultTimeout = 10;
  const configured =
    process.env.OVERRIDE_TIMEOUT ?? manifest.config?.["why-override"]?.timeout;
  if (configured === undefined) return defaultTimeout;

  const timeoutSeconds = Number(configured);
  if (
    (typeof configured === "string" || typeof configured === "number") &&
    Number.isInteger(timeoutSeconds) &&
    timeoutSeconds > 0
  ) {
    return timeoutSeconds;
  }
  console.warn(
    `Warning: invalid override prompt timeout ${JSON.stringify(configured)}; using default ${defaultTimeout} seconds.`,
  );
  return defaultTimeout;
}

export function getExistingReasons(reasonDocument) {
  const reasons = [];
  const seen = new Set();
  for (const record of reasonDocument?.reasons ?? []) {
    if (isValidReasonRecord(record)) {
      const trimmed = record.reason.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        reasons.push(trimmed);
      }
    }
  }
  return reasons;
}

export function loadReasonStore(reasonStorePath, reasonStoreFilename) {
  let reasonText = "";
  let reasonStoreMissing = false;
  try {
    reasonText = readFileSync(reasonStorePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    reasonStoreMissing = true;
  }

  let reasonDocument;
  let reasonStoreWritable = true;

  if (reasonStoreMissing) {
    warnDiagnostic(
      `${reasonStoreFilename} is missing; it will be created when you save a reason.`,
    );
    reasonDocument = { version: 1, reasons: [] };
    reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
  } else {
    try {
      reasonDocument = JSON.parse(reasonText);
    } catch {}

    if (
      reasonDocument === null ||
      typeof reasonDocument !== "object" ||
      !Array.isArray(reasonDocument?.reasons)
    ) {
      warnDiagnostic(
        `${reasonStoreFilename} is malformed; saved reasons cannot be read or updated.`,
      );
      reasonDocument = { version: 1, reasons: [] };
      reasonStoreWritable = false;
    }
  }

  return {
    reasonText,
    reasonDocument,
    reasonStoreMissing,
    reasonStoreWritable,
  };
}

export function validateReasons({
  reasonDocument,
  selectors,
  manifest,
  minimumReviewAgeMs = 30 * 24 * 60 * 60 * 1000,
  warn = true,
}) {
  const activeSelectorKeys = new Set(selectors.map(selectorKey));
  const reasonsBySelector = new Map();
  const workspacesBySelector = new Map();
  const warnMsg = (msg) => warn && warnDiagnostic(msg);
  const nowMs = Date.now();

  for (const record of reasonDocument.reasons) {
    const selector = getRecordSelector(record);
    const displaySelector = selector
      ? formatSelector(selector)
      : "unknown selector";
    if (!isValidReasonRecord(record)) {
      warnMsg(
        `malformed override reason record for ${displaySelector}; treating it as undocumented and preserving the record.`,
      );
      continue;
    }

    const key = selectorKey(selector);
    if (!activeSelectorKeys.has(key)) {
      warnMsg(
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

    if (warn) {
      const currentTarget = getOverrideTarget(manifest, selector);
      if (
        record.target !== undefined &&
        currentTarget !== undefined &&
        record.target !== currentTarget
      ) {
        warnMsg(
          `override target for ${displaySelector} changed from "${record.target}" to "${currentTarget}".`,
        );
      }

      if (nowMs - parseUtcTimestampMs(record.updatedAt) >= minimumReviewAgeMs) {
        warnMsg(
          `Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`,
        );
      }
    }
  }

  return { reasonsBySelector, workspacesBySelector };
}
