import { color } from "./color.js";
import {
  formatInstalledAt,
  formatSelector,
  getInstalledInfo,
  getOverrideTarget,
} from "./selectors.js";

export function wrapText(text, width) {
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

export function printOverrideTable(entries, workspaceRoot, manifest) {
  if (entries.length === 0) {
    return;
  }

  const headers = [
    "Package",
    "Override",
    "Installed",
    "Last installed",
    "Reason",
  ];
  const rows = entries.map(({ selector, reason }) => {
    const target = getOverrideTarget(manifest, selector) ?? "";
    const installed = getInstalledInfo(selector, workspaceRoot);
    const versionStyle =
      installed.version === undefined
        ? color.dim
        : installed.version === target
          ? color.green
          : color.yellow;
    return [
      { text: formatSelector(selector), style: color.bold },
      { text: target, style: color.magenta },
      { text: installed.version ?? "not installed", style: versionStyle },
      {
        text: installed.installedAt
          ? formatInstalledAt(installed.installedAt)
          : "-",
        style: color.dim,
      },
      { text: reason.trim(), style: (text) => text },
    ];
  });

  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      ...rows.map((row) => (column === 4 ? 0 : row[column].text.length)),
    ),
  );
  const fixedWidth =
    widths.slice(0, 4).reduce((sum, width) => sum + width + 3, 0) + 4;
  const longestReason = Math.max(
    headers[4].length,
    ...rows.map((row) => row[4].text.length),
  );
  widths[4] =
    process.stdout.isTTY && process.stdout.columns
      ? Math.max(
          20,
          Math.min(longestReason, process.stdout.columns - fixedWidth),
        )
      : longestReason;

  const border = (left, middle, right) =>
    color.dim(
      `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`,
    );
  const bar = color.dim("│");
  const renderLine = (cells) =>
    `${bar}${cells
      .map(
        ({ text, style }, column) =>
          ` ${style(text)}${" ".repeat(widths[column] - text.length)} `,
      )
      .join(bar)}${bar}`;

  const output = [
    border("┌", "┬", "┐"),
    renderLine(headers.map((text) => ({ text, style: color.cyan }))),
    border("├", "┼", "┤"),
  ];
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      output.push(border("├", "┼", "┤"));
    }
    const reasonLines = wrapText(row[4].text, widths[4]);
    reasonLines.forEach((reasonLine, index) => {
      output.push(
        renderLine(
          row.map((cell, column) =>
            column === 4
              ? { text: reasonLine, style: cell.style }
              : index === 0
                ? cell
                : { text: "", style: cell.style },
          ),
        ),
      );
    });
  });
  output.push(border("└", "┴", "┘"));
  console.log(output.join("\n"));

  for (const entry of entries) {
    if (entry.workspacesText) {
      console.log(
        `Override ${formatSelector(entry.selector)}${entry.workspacesText}: ${entry.reason}`,
      );
    }
  }
}
