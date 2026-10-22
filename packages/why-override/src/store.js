import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser/lib/esm/main.js";
import { warnDiagnostic } from "./color.js";
import { formatSelector, getOverrideTarget, selectorKey } from "./selectors.js";

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
    record.selector.every(
      (segment) => typeof segment === "string" && segment.length > 0,
    )
  ) {
    return record.selector;
  }
  return undefined;
}

export function isUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function isValidReasonRecord(record) {
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

export function getPromptTimeoutSeconds(manifest) {
  const defaultTimeout = 10;
  const envTimeout = process.env.OVERRIDE_TIMEOUT;
  const projectTimeout = manifest.config?.["why-override"]?.timeout;
  const configured = envTimeout !== undefined ? envTimeout : projectTimeout;

  if (configured === undefined) {
    return defaultTimeout;
  }
  const timeoutSeconds = Number(configured);
  if (
    (typeof configured === "string" || typeof configured === "number") &&
    Number.isFinite(timeoutSeconds) &&
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

export function loadReasonStore(reasonStorePath, reasonStoreFilename) {
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
    : parse(reasonText, parseErrors, { allowTrailingComma: true });
  let reasonStoreWritable = true;

  if (reasonStoreMissing) {
    warnDiagnostic(
      `${reasonStoreFilename} is missing; it will be created when you save a reason.`,
    );
    reasonDocument = { version: 1, reasons: [] };
    reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
  } else if (
    parseErrors.length > 0 ||
    !Array.isArray(reasonDocument?.reasons)
  ) {
    warnDiagnostic(
      `${reasonStoreFilename} is malformed; saved reasons cannot be read or updated.`,
    );
    reasonDocument = { version: 1, reasons: [] };
    reasonStoreWritable = false;
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
}) {
  const activeSelectorKeys = new Set(selectors.map(selectorKey));
  const reasonsBySelector = new Map();
  const workspacesBySelector = new Map();

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

    const currentTarget = getOverrideTarget(manifest, selector);
    if (
      record.target !== undefined &&
      currentTarget !== undefined &&
      record.target !== currentTarget
    ) {
      warnDiagnostic(
        `override target for ${displaySelector} changed from "${record.target}" to "${currentTarget}".`,
      );
    }

    if (Date.now() - Date.parse(record.updatedAt) >= minimumReviewAgeMs) {
      warnDiagnostic(
        `Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`,
      );
    }
  }

  return { reasonsBySelector, workspacesBySelector };
}
