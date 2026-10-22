import { color } from "./color.js";
import { formatSelector, selectorKey } from "./selectors.js";
import { getRecordSelector, isValidReasonRecord } from "./store.js";

export function runCheck(context) {
  const {
    selectors,
    reasonsBySelector,
    reasonDocument,
    reasonStoreMissing,
    reasonStoreWritable,
    reasonStoreFilename,
  } = context;

  let hasError = false;

  if (reasonStoreMissing) {
    console.error(
      color.red(`Error: Reason store ${reasonStoreFilename} does not exist.`),
    );
    hasError = true;
  } else if (!reasonStoreWritable) {
    console.error(
      color.red(`Error: Reason store ${reasonStoreFilename} is malformed.`),
    );
    hasError = true;
  }

  const undocumented = [];
  for (const selector of selectors) {
    const key = selectorKey(selector);
    const reason = reasonsBySelector.get(key);
    if (typeof reason !== "string" || reason.trim() === "") {
      undocumented.push(selector);
    }
  }

  if (undocumented.length > 0) {
    hasError = true;
    for (const selector of undocumented) {
      console.error(
        color.red(
          `Error: undocumented override ${formatSelector(selector)} (missing reason in ${reasonStoreFilename})`,
        ),
      );
    }
  }

  const activeKeys = new Set(selectors.map(selectorKey));
  const orphaned = [];
  for (const record of reasonDocument?.reasons ?? []) {
    const recordSelector = getRecordSelector(record);
    if (recordSelector && isValidReasonRecord(record)) {
      const key = selectorKey(recordSelector);
      if (!activeKeys.has(key)) {
        orphaned.push(recordSelector);
      }
    }
  }

  if (orphaned.length > 0) {
    hasError = true;
    for (const selector of orphaned) {
      console.error(
        color.red(
          `Error: orphaned override reason for ${formatSelector(selector)} (selector no longer exists in package manifest)`,
        ),
      );
    }
  }

  if (hasError) {
    process.exitCode = 1;
    return false;
  }

  if (selectors.length === 0) {
    console.log(color.green("✓ No overrides declared; reason store is clean."));
  } else {
    console.log(
      color.green(
        `✓ All ${selectors.length} override ${selectors.length === 1 ? "reason is" : "reasons are"} documented and up to date.`,
      ),
    );
  }
  return true;
}
