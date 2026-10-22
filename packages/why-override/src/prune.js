import { writeFileSync } from "node:fs";
import { color } from "./color.js";
import { formatSelector, selectorKey } from "./selectors.js";
import { getRecordSelector, isValidReasonRecord } from "./store.js";

export function runPrune(context) {
  const {
    selectors,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename,
    reasonStoreMissing,
    reasonStoreWritable,
  } = context;

  if (reasonStoreMissing) {
    console.log(
      `Reason store ${reasonStoreFilename} does not exist; nothing to prune.`,
    );
    return;
  }

  if (!reasonStoreWritable) {
    console.error(
      color.red(
        `Error: Cannot prune because ${reasonStoreFilename} is malformed.`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const activeKeys = new Set(selectors.map(selectorKey));
  const remainingReasons = [];
  const pruned = [];

  for (const record of reasonDocument?.reasons ?? []) {
    const recordSelector = getRecordSelector(record);
    if (recordSelector && isValidReasonRecord(record)) {
      const key = selectorKey(recordSelector);
      if (!activeKeys.has(key)) {
        pruned.push(recordSelector);
        continue;
      }
    }
    remainingReasons.push(record);
  }

  if (pruned.length === 0) {
    console.log("No orphaned override reasons to prune.");
    return;
  }

  reasonDocument.reasons = remainingReasons;
  context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
  writeFileSync(reasonStorePath, context.reasonText);

  for (const selector of pruned) {
    console.log(`Pruned orphaned reason for ${formatSelector(selector)}.`);
  }
  console.log(
    `Successfully pruned ${pruned.length} orphaned override ${pruned.length === 1 ? "record" : "records"} from ${reasonStoreFilename}.`,
  );
}
