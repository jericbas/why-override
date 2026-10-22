import { writeFileSync } from "node:fs";
import { color } from "./color.js";
import { askForExplanation } from "./prompt.js";
import { askForPackageSelection } from "./selection.js";
import { formatSelector, getOverrideTarget, selectorKey } from "./selectors.js";
import { getRecordSelector, isValidReasonRecord } from "./store.js";

export function updateSelectorReason(context, selector, explanation) {
  const { manifest, reasonDocument, reasonsBySelector, reasonStorePath } =
    context;
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex(
    (record) =>
      isValidReasonRecord(record) &&
      selectorKey(getRecordSelector(record)) === key,
  );
  const displaySelector = formatSelector(selector);
  const currentTarget = getOverrideTarget(manifest, selector);

  if (recordIndex >= 0) {
    const record = reasonDocument.reasons[recordIndex];
    const targetChanged =
      currentTarget !== undefined && currentTarget !== record.target;
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
    context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
    reasonsBySelector.set(key, explanation);
    console.log(`Refreshed reason for ${displaySelector}.`);
    return true;
  }

  const timestamp = new Date().toISOString();
  const record = {
    selector,
    reason: explanation,
    ...(currentTarget !== undefined ? { target: currentTarget } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  reasonDocument.reasons.push(record);
  context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
  if (context.reasonStoreMissing) {
    console.log(`Created ${reasonStorePath}.`);
    context.reasonStoreMissing = false;
  }
  reasonsBySelector.set(key, explanation);
  console.log(`Refreshed reason for ${displaySelector}.`);
  return true;
}

export async function refreshReason(context, selector) {
  const { reasonDocument, promptInterface, reasonStorePath } = context;
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

  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds: context.promptTimeoutSeconds,
    reasonDocument,
    displaySelector,
  });
  if (explanation === undefined || explanation === "") {
    return;
  }

  const changed = updateSelectorReason(context, selector, explanation);
  if (changed) {
    writeFileSync(reasonStorePath, context.reasonText);
  }
}

export async function refreshInteractive(context) {
  const {
    promptInterface,
    selectors,
    reasonsBySelector,
    promptTimeoutSeconds,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename,
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
    reasonsBySelector,
  });
  if (!selectedSelectors || selectedSelectors.length === 0) {
    return;
  }

  const displaySelector = selectedSelectors.map(formatSelector).join(", ");
  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds,
    reasonDocument,
    displaySelector,
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

  console.log(
    color.dim(
      `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
    ),
  );
}
