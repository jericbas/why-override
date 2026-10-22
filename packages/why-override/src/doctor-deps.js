import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;
const GTE_RE = /^>=?\s*(\d+\.\d+\.\d+)/;
const SPEC_RE = /^[\^~]?\s*(\d+)\.(\d+)\.(\d+)/;
const NODE_MODULES_PREFIX_RE = /^.*node_modules\//;

function parseSemver(v) {
  const match = String(v).match(SEMVER_RE);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function isSatisfied(requestedSpec, targetVersion) {
  const targetParsed = parseSemver(targetVersion);
  if (!targetParsed) return false;

  const trimmed = String(requestedSpec).trim();
  if (
    trimmed === targetVersion ||
    trimmed === `^${targetVersion}` ||
    trimmed === `~${targetVersion}`
  ) {
    return true;
  }

  const gteMatch = trimmed.match(GTE_RE);
  if (gteMatch) {
    const minParsed = parseSemver(gteMatch[1]);
    if (minParsed && compareVersions(targetParsed, minParsed) >= 0) {
      return true;
    }
  }

  const specMatch = trimmed.match(SPEC_RE);
  if (specMatch) {
    const specParsed = {
      major: Number(specMatch[1]),
      minor: Number(specMatch[2]),
      patch: Number(specMatch[3]),
    };
    if (trimmed.startsWith("^")) {
      if (specParsed.major > 0 && targetParsed.major === specParsed.major) {
        return compareVersions(targetParsed, specParsed) >= 0;
      }
      return false;
    }
    if (trimmed.startsWith("~")) {
      if (
        targetParsed.major === specParsed.major &&
        targetParsed.minor === specParsed.minor
      ) {
        return compareVersions(targetParsed, specParsed) >= 0;
      }
      return false;
    }
  }

  return false;
}

function addDepEntry(index, depName, entry) {
  let list = index.get(depName);
  if (!list) {
    list = [];
    index.set(depName, list);
  }
  list.push(entry);
}

function indexLockfile(workspaceRoot) {
  const lockfilePath = resolve(workspaceRoot, "package-lock.json");
  if (!existsSync(lockfilePath)) return null;

  try {
    const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
    const index = new Map();

    if (lockfile.packages && typeof lockfile.packages === "object") {
      for (const [pkgPath, pkgInfo] of Object.entries(lockfile.packages)) {
        if (!pkgPath || pkgPath === "" || !pkgInfo) continue;
        const deps = pkgInfo.dependencies;
        const peerDeps = pkgInfo.peerDependencies;
        if (!deps && !peerDeps) continue;
        const name =
          pkgInfo.name ?? pkgPath.replace(NODE_MODULES_PREFIX_RE, "");
        if (deps && typeof deps === "object") {
          for (const [depName, spec] of Object.entries(deps)) {
            if (peerDeps && depName in peerDeps) continue;
            addDepEntry(index, depName, { name, path: pkgPath, spec });
          }
        }
        if (peerDeps && typeof peerDeps === "object") {
          for (const [depName, spec] of Object.entries(peerDeps)) {
            addDepEntry(index, depName, { name, path: pkgPath, spec });
          }
        }
      }
      return index;
    }

    if (lockfile.dependencies) {
      const scanV1Deps = (depsObj, parentName = "") => {
        for (const [name, info] of Object.entries(depsObj ?? {})) {
          if (info?.requires && typeof info.requires === "object") {
            const resolvedName = parentName || name;
            const pkgPath = `node_modules/${name}`;
            for (const [depName, spec] of Object.entries(info.requires)) {
              addDepEntry(index, depName, {
                name: resolvedName,
                path: pkgPath,
                spec,
              });
            }
          }
          if (info?.dependencies) {
            scanV1Deps(info.dependencies, name);
          }
        }
      };
      scanV1Deps(lockfile.dependencies);
      return index;
    }
  } catch {
    return null;
  }
  return null;
}

function indexNodeModules(workspaceRoot) {
  const index = new Map();
  const nodeModulesDir = resolve(workspaceRoot, "node_modules");
  if (!existsSync(nodeModulesDir)) return index;

  const checkPkg = (pkgDir, pkgName) => {
    try {
      const manifestPath = resolve(pkgDir, "package.json");
      if (!existsSync(manifestPath)) return;
      const pkgManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const deps = pkgManifest.dependencies;
      const peerDeps = pkgManifest.peerDependencies;
      const pkgPath = `node_modules/${pkgName}`;
      if (deps && typeof deps === "object") {
        for (const [depName, spec] of Object.entries(deps)) {
          if (peerDeps && depName in peerDeps) continue;
          if (depName !== pkgName) {
            addDepEntry(index, depName, { name: pkgName, path: pkgPath, spec });
          }
        }
      }
      if (peerDeps && typeof peerDeps === "object") {
        for (const [depName, spec] of Object.entries(peerDeps)) {
          if (depName !== pkgName) {
            addDepEntry(index, depName, { name: pkgName, path: pkgPath, spec });
          }
        }
      }
    } catch {}
  };

  try {
    const entries = readdirSync(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("@")) {
        const scopedDir = resolve(nodeModulesDir, entry.name);
        try {
          const scopedEntries = readdirSync(scopedDir, { withFileTypes: true });
          for (const scopedEntry of scopedEntries) {
            if (scopedEntry.isDirectory()) {
              checkPkg(
                resolve(scopedDir, scopedEntry.name),
                `${entry.name}/${scopedEntry.name}`,
              );
            }
          }
        } catch {}
      } else if (!entry.name.startsWith(".")) {
        checkPkg(resolve(nodeModulesDir, entry.name), entry.name);
      }
    }
  } catch {}

  return index;
}

export function buildDependentsLookup(workspaceRoot) {
  const lockfileIndex = indexLockfile(workspaceRoot);
  const index = lockfileIndex ?? indexNodeModules(workspaceRoot);
  return (targetPackageName) => index.get(targetPackageName) ?? [];
}

export function findDependentsInLockfile(workspaceRoot, targetPackageName) {
  const index = indexLockfile(workspaceRoot);
  if (index === null) return null;
  return index.get(targetPackageName) ?? [];
}

export function findDependentsInNodeModules(workspaceRoot, targetPackageName) {
  const index = indexNodeModules(workspaceRoot);
  return index.get(targetPackageName) ?? [];
}
