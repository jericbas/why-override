import { writeFileSync } from "node:fs";
import { color, warnDiagnostic } from "./color.js";
import { askForExplanation } from "./prompt.js";
import { refreshReason } from "./refresh.js";
import { formatSelector, getOverrideTarget, selectorKey } from "./selectors.js";
import { printOverrideTable } from "./table.js";

export async function runEnforce(context, isReenter) {
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
    reasonStoreFilename,
  } = context;

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
    workspaceRoot,
    manifest,
  );

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
      displaySelector,
    });
    if (explanation === undefined) {
      break;
    }
    if (explanation === "") {
      continue;
    }
    if (!context.reasonStoreWritable) {
      warnDiagnostic(
        `cannot save a reason for ${displaySelector} because the reason store is malformed; leaving it unchanged.`,
      );
      continue;
    }

    const timestamp = new Date().toISOString();
    const currentTarget = getOverrideTarget(manifest, selector);
    const record = {
      selector,
      reason: explanation,
      ...(currentTarget !== undefined ? { target: currentTarget } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    reasonDocument.reasons.push(record);
    context.reasonText = `${JSON.stringify(reasonDocument, null, 2)}\n`;
    writeFileSync(reasonStorePath, context.reasonText);
    if (context.reasonStoreMissing) {
      console.log(`Created ${reasonStorePath}.`);
      context.reasonStoreMissing = false;
    }
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
