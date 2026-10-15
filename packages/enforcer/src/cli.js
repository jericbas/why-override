#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser/lib/esm/main.js";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
);
const reasonText = readFileSync(
  resolve(workspaceRoot, "override-reasons.jsonc"),
  "utf8",
);
const parseErrors = [];
const reasonDocument = parse(reasonText, parseErrors, {
  allowTrailingComma: true,
});

if (parseErrors.length > 0 || !Array.isArray(reasonDocument?.reasons)) {
  console.warn(
    "Warning: override-reasons.jsonc is malformed; skipping saved reasons.",
  );
  process.exit(0);
}

const reasonsBySelector = new Map(
  reasonDocument.reasons.map((record) => [record.selector, record.reason]),
);

for (const selector of Object.keys(manifest.overrides ?? {})) {
  const reason = reasonsBySelector.get(selector);
  if (typeof reason === "string" && reason.trim() !== "") {
    console.log(`Override ${selector}: ${reason}`);
  }
}
