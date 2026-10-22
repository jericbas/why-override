import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findWorkspaceRoot() {
  let currentDir = resolve(process.cwd());
  let nearestManifestDir;
  let workspaceRootDir;

  while (true) {
    const manifestPath = resolve(currentDir, "package.json");
    if (existsSync(manifestPath)) {
      nearestManifestDir ??= currentDir;
      try {
        const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (parsed?.workspaces !== undefined) {
          workspaceRootDir = currentDir;
        }
      } catch {
        // Ignore unreadable ancestor manifests while searching upward.
      }
    }

    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      workspaceRootDir = currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return (
    workspaceRootDir ??
    nearestManifestDir ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
  );
}

export function findReasonStorePath(root) {
  const candidates = [
    resolve(root, ".override-reasons.json"),
    resolve(root, ".override-reasons.jsonc"),
    resolve(root, "override-reasons.json"),
    resolve(root, "override-reasons.jsonc"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}
