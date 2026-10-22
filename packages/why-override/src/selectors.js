import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export function parseSelectorSegments(key) {
  if (!key.includes("/")) {
    return [key];
  }
  const parts = key.split("/");
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith("@") && i + 1 < parts.length) {
      segments.push(`${parts[i]}/${parts[i + 1]}`);
      i++;
    } else {
      segments.push(parts[i]);
    }
  }
  return segments;
}

export function collectOverrideSelectors(overrides, parentPath = []) {
  const selectors = [];

  for (const [key, value] of Object.entries(overrides ?? {})) {
    const segments = parseSelectorSegments(key);
    const selector = [...parentPath, ...segments];
    if (selector.some((segment) => segment.includes("*"))) {
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

export function collectAllManifestSelectors(manifest) {
  const sources = [
    manifest?.overrides,
    manifest?.pnpm?.overrides,
    manifest?.resolutions,
  ];
  const seen = new Set();
  const allSelectors = [];

  for (const source of sources) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const selectors = collectOverrideSelectors(source);
      for (const selector of selectors) {
        const key = selectorKey(selector);
        if (!seen.has(key)) {
          seen.add(key);
          allSelectors.push(selector);
        }
      }
    }
  }

  return allSelectors;
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

function lookupTargetInObject(obj, selector) {
  if (obj === null || typeof obj !== "object") {
    return undefined;
  }
  let current = obj;
  let found = true;
  for (const segment of selector) {
    if (current !== null && typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      found = false;
      break;
    }
  }
  if (found && typeof current === "string") {
    return current;
  }
  const joinedKey = selector.join("/");
  if (typeof obj[joinedKey] === "string") {
    return obj[joinedKey];
  }
  return undefined;
}

export function getOverrideTarget(manifest, selector) {
  const sources = [
    manifest?.overrides,
    manifest?.pnpm?.overrides,
    manifest?.resolutions,
  ];
  for (const source of sources) {
    const target = lookupTargetInObject(source, selector);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}
