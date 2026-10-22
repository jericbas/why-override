import { color } from "./color.js";
import {
  findDependentsInLockfile,
  findDependentsInNodeModules,
  isSatisfied,
} from "./doctor-deps.js";
import {
  formatSelector,
  getOverrideTarget,
  packageNameFromSegment,
  selectorKey,
} from "./selectors.js";
import { getRecordSelector, isValidReasonRecord } from "./store.js";

export function runDoctor(context) {
  const {
    workspaceRoot,
    manifest,
    selectors,
    reasonsBySelector,
    reasonDocument,
    reasonStoreFilename,
    reasonStoreMissing,
    reasonStoreWritable,
  } = context;

  console.log(color.bold("=== why-override Doctor ===\n"));

  if (reasonStoreMissing) {
    console.log(
      `Reason Store: ${color.red("MISSING")} (${reasonStoreFilename})`,
    );
  } else if (!reasonStoreWritable) {
    console.log(
      `Reason Store: ${color.red("MALFORMED")} (${reasonStoreFilename})`,
    );
  } else {
    console.log(
      `Reason Store: ${color.green("HEALTHY")} (${reasonStoreFilename})`,
    );
  }

  const activeKeys = new Set(selectors.map(selectorKey));
  console.log(`Total Overrides: ${selectors.length}`);
  console.log(`Total Stored Reasons: ${reasonDocument?.reasons?.length ?? 0}`);

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
    console.log(`\n${color.yellow(`Orphaned Records (${orphaned.length}):`)}`);
    for (const s of orphaned) {
      console.log(
        `  - ${formatSelector(s)} (run 'why-override prune' to remove)`,
      );
    }
  }

  if (selectors.length > 0) {
    console.log(color.bold("\nOverride Analysis:"));
  }

  for (const selector of selectors) {
    const key = selectorKey(selector);
    const displaySelector = formatSelector(selector);
    const reason = reasonsBySelector.get(key);
    const currentTarget = getOverrideTarget(manifest, selector);
    const pkgName = packageNameFromSegment(selector.at(-1) ?? "");

    console.log(`\n${color.bold(displaySelector)}`);
    if (currentTarget) {
      console.log(`  Target: ${currentTarget}`);
    }
    if (reason) {
      console.log(`  Reason: ${reason}`);
    } else {
      console.log(`  Reason: ${color.red("UNDOCUMENTED")}`);
    }

    const lockfileDeps = findDependentsInLockfile(workspaceRoot, pkgName);
    const dependents =
      lockfileDeps !== null
        ? lockfileDeps
        : findDependentsInNodeModules(workspaceRoot, pkgName);

    if (dependents.length === 0) {
      console.log(
        `  Status: ${color.cyan("Safe to Remove")} (no parent packages found requesting "${pkgName}")`,
      );
    } else {
      const unmet = [];
      for (const dep of dependents) {
        if (currentTarget && !isSatisfied(dep.spec, currentTarget)) {
          unmet.push(dep);
        }
      }
      if (unmet.length === 0 && currentTarget) {
        console.log(
          `  Status: ${color.green("Safe to Remove")} (all parent packages natively satisfy "${currentTarget}")`,
        );
        console.log("  Dependents:");
        for (const dep of dependents) {
          console.log(`    - ${dep.name} requests "${dep.spec}"`);
        }
      } else {
        console.log(`  Status: ${color.yellow("Still Needed")}`);
        console.log("  Dependents requiring override:");
        for (const dep of unmet.length > 0 ? unmet : dependents) {
          console.log(`    - ${dep.name} requests "${dep.spec}"`);
        }
      }
    }
  }

  console.log("\n===========================");
}
