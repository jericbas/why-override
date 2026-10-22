import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export function collectOverrideSelectors(overrides, parentPath = []) {
  const selectors = [];

  for (const [key, value] of Object.entries(overrides ?? {})) {
    const selector = [...parentPath, key];
    if (key.includes("*")) {
      console.warn(
        `Warning: unsupported wildcard override selector ${JSON.stringify(selector)}; skipping.`,
      );
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      selectors.push(...collectOverrideSelectors(value, selector));
    } else if (typeof value === "string") {
      selectors.push(selector);
    }
  }

  return selectors;
}

export function selectorKey(selector) {
  return JSON.stringify(selector);
}

export function formatSelector(selector) {
  return selector.map((segment) => JSON.stringify(segment)).join(" > ");
}

export function packageNameFromSegment(segment) {
  const versionAt = segment.indexOf("@", segment.startsWith("@") ? 1 : 0);
  return versionAt > 0 ? segment.slice(0, versionAt) : segment;
}

export function getInstalledInfo(selector, workspaceRoot) {
  const segments = selector.filter((segment) => segment !== ".");
  const name = packageNameFromSegment(segments.at(-1) ?? "");
  const packageDir = resolve(workspaceRoot, "node_modules", name);
  try {
    const { version } = JSON.parse(
      readFileSync(resolve(packageDir, "package.json"), "utf8"),
    );
    return { name, version, installedAt: statSync(packageDir).mtime };
  } catch {
    return { name };
  }
}

export function formatInstalledAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const elapsedMinutes = Math.max(0, (Date.now() - date.getTime()) / 60000);
  const relative =
    elapsedMinutes < 1
      ? "just now"
      : elapsedMinutes < 60
        ? `${Math.floor(elapsedMinutes)}m ago`
        : elapsedMinutes < 60 * 24
          ? `${Math.floor(elapsedMinutes / 60)}h ago`
          : `${Math.floor(elapsedMinutes / (60 * 24))}d ago`;
  return `${stamp} (${relative})`;
}

export function getOverrideTarget(manifest, selector) {
  let value = manifest.overrides;
  for (const segment of selector) {
    value = value?.[segment];
  }
  return typeof value === "string" ? value : undefined;
}

