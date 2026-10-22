import { color } from "./color.js";
import { promptWithCountdown } from "./prompt.js";
import { formatSelector, selectorKey } from "./selectors.js";

export function parsePackageSelection(input, selectors) {
  const trimmed = input.trim();
  if (trimmed === "") {
    return [];
  }
  if (trimmed.toLowerCase() === "all" || trimmed === "*") {
    return [...selectors];
  }

  const exactIndex = selectors.findIndex(
    (sel) =>
      formatSelector(sel) === trimmed ||
      formatSelector(sel).replace(/"/g, "") === trimmed ||
      sel.join(" > ") === trimmed,
  );
  if (exactIndex >= 0) {
    return [selectors[exactIndex]];
  }

  const selectedIndices = new Set();
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end > selectors.length || start > end) {
        return undefined;
      }
      for (let i = start; i <= end; i++) {
        selectedIndices.add(i - 1);
      }
    } else {
      const singleMatch = token.match(/^#?(\d+)$/);
      if (singleMatch) {
        const index = Number(singleMatch[1]) - 1;
        if (index < 0 || index >= selectors.length) {
          return undefined;
        }
        selectedIndices.add(index);
      } else {
        const unquoted = token.replace(/^["']|["']$/g, "");
        const matchedIndex = selectors.findIndex(
          (sel) =>
            sel.includes(unquoted) ||
            formatSelector(sel).replace(/"/g, "") === unquoted,
        );
        if (matchedIndex >= 0) {
          selectedIndices.add(matchedIndex);
        } else {
          return undefined;
        }
      }
    }
  }

  if (selectedIndices.size === 0) {
    return undefined;
  }

  return selectors.filter((_, idx) => selectedIndices.has(idx));
}

export async function askForPackageSelection({
  promptInterface,
  promptTimeoutSeconds,
  selectors,
  reasonsBySelector,
}) {
  if (!promptInterface) {
    return undefined;
  }

  console.log("Select package(s) to refresh:");
  selectors.forEach((selector, index) => {
    const key = selectorKey(selector);
    const existing = reasonsBySelector.get(key);
    const reasonPreview = existing ? color.dim(` (${existing.trim()})`) : "";
    console.log(
      `  ${index + 1}) ${color.bold(formatSelector(selector))}${reasonPreview}`,
    );
  });
  console.log(
    color.dim(
      `Enter package number(s) separated by commas (e.g. 1, 2), a range (e.g. 1-${selectors.length}), or 'all'. Press Enter to cancel.`,
    ),
  );

  while (true) {
    const formatQuestion = (secondsLeft) =>
      `${color.cyan("Which package(s) do you want to refresh?")} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
    const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping refresh.`;

    const response = await promptWithCountdown({
      promptInterface,
      promptTimeoutSeconds,
      formatQuestion,
      timeoutMessage,
    });
    if (response === undefined) {
      return undefined;
    }

    if (response.trim() === "") {
      console.log("No packages selected; skipping.");
      return undefined;
    }

    const selected = parsePackageSelection(response, selectors);
    if (selected && selected.length > 0) {
      return selected;
    }

    console.warn(
      color.yellow(
        `Invalid selection "${response.trim()}". Please enter numbers 1-${selectors.length}, ranges, or 'all'.`,
      ),
    );
  }
}
