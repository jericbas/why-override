#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { color } from "./color.js";
import { runEnforce } from "./enforce.js";
import { askForExplanation } from "./prompt.js";
import {
  refreshInteractive,
  refreshReason,
  updateSelectorReason,
} from "./refresh.js";
import { collectOverrideSelectors, formatSelector } from "./selectors.js";
import {
  getPromptTimeoutSeconds,
  loadReasonStore,
  validateReasons,
} from "./store.js";
import { findReasonStorePath, findWorkspaceRoot } from "./workspace.js";

const workspaceRoot = findWorkspaceRoot();
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
);
const reasonStorePath = findReasonStorePath(workspaceRoot);
const reasonStoreFilename = basename(reasonStorePath);

const storeData = loadReasonStore(reasonStorePath, reasonStoreFilename);
const { reasonDocument, reasonStoreMissing, reasonStoreWritable } = storeData;
const promptTimeoutSeconds = getPromptTimeoutSeconds(manifest);
const promptInterface = process.stdin.isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

const selectors = collectOverrideSelectors(manifest.overrides);
const { reasonsBySelector, workspacesBySelector } = validateReasons({
  reasonDocument,
  selectors,
  manifest,
});

const context = {
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
  workspacesBySelector,
};

try {
  if (process.argv[2] === "refresh") {
    if (process.argv[3] === "--all" || process.argv[3] === "-a") {
      for (const selector of selectors) {
        await refreshReason(context, selector);
      }
      if (selectors.length > 0) {
        console.log(
          color.dim(
            `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
          ),
        );
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

      const isSingle =
        Array.isArray(selector) &&
        selector.length > 0 &&
        selector.every((seg) => typeof seg === "string" && seg.length > 0);
      const isMulti =
        Array.isArray(selector) &&
        selector.length > 0 &&
        selector.every(
          (item) =>
            Array.isArray(item) &&
            item.length > 0 &&
            item.every((seg) => typeof seg === "string" && seg.length > 0),
        );

      if (process.argv.length !== 4 || (!isSingle && !isMulti)) {
        console.error(
          'Usage: why-override refresh \'["package", "nested-selector"]\' or why-override refresh --all',
        );
        process.exitCode = 1;
      } else if (isSingle) {
        await refreshReason(context, selector);
        console.log(
          color.dim(
            `Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`,
          ),
        );
      } else if (isMulti) {
        const displaySelector = selector.map(formatSelector).join(", ");
        const explanation = await askForExplanation({
          promptInterface,
          promptTimeoutSeconds,
          reasonDocument,
          displaySelector,
        });
        if (explanation !== undefined && explanation !== "") {
          let anyChanged = false;
          for (const item of selector) {
            if (updateSelectorReason(context, item, explanation)) {
              anyChanged = true;
            }
          }
          if (anyChanged) {
            writeFileSync(reasonStorePath, context.reasonText);
          }
        }
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
    await runEnforce(context, isReenter);
  }
} finally {
  promptInterface?.close();
}
