import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseSemver(v) {
  const match = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
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

  const gteMatch = trimmed.match(/^>=?\s*(\d+\.\d+\.\d+)/);
  if (gteMatch) {
    const minParsed = parseSemver(gteMatch[1]);
    if (minParsed && compareVersions(targetParsed, minParsed) >= 0) {
      return true;
    }
  }

  const specMatch = trimmed.match(/^[\^~]?\s*(\d+)\.(\d+)\.(\d+)/);
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

export function findDependentsInLockfile(workspaceRoot, targetPackageName) {
  const lockfilePath = resolve(workspaceRoot, "package-lock.json");
  if (!existsSync(lockfilePath)) return null;

  try {
    const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
    const dependents = [];

    if (lockfile.packages && typeof lockfile.packages === "object") {
      for (const [pkgPath, pkgInfo] of Object.entries(lockfile.packages)) {
        if (!pkgPath || pkgPath === "") continue;
        const deps = {
          ...pkgInfo.dependencies,
          ...pkgInfo.peerDependencies,
        };
        if (deps[targetPackageName]) {
          const spec = deps[targetPackageName];
          const name = pkgInfo.name ?? pkgPath.replace(/^.*node_modules\//, "");
          dependents.push({ name, path: pkgPath, spec });
        }
      }
      return dependents;
    }

    if (lockfile.dependencies) {
      const scanV1Deps = (depsObj, parentName = "") => {
        for (const [name, info] of Object.entries(depsObj ?? {})) {
          if (info.requires?.[targetPackageName]) {
            dependents.push({
              name: parentName || name,
              path: `node_modules/${name}`,
              spec: info.requires[targetPackageName],
            });
          }
          if (info.dependencies) {
            scanV1Deps(info.dependencies, name);
          }
        }
      };
      scanV1Deps(lockfile.dependencies);
      return dependents;
    }
  } catch {
    return null;
  }
  return null;
}

export function findDependentsInNodeModules(workspaceRoot, targetPackageName) {
  const nodeModulesDir = resolve(workspaceRoot, "node_modules");
  if (!existsSync(nodeModulesDir)) return [];

  const dependents = [];
  const checkPkg = (pkgDir, pkgName) => {
    try {
      const manifestPath = resolve(pkgDir, "package.json");
      if (existsSync(manifestPath)) {
        const pkgManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        const deps = {
          ...pkgManifest.dependencies,
          ...pkgManifest.peerDependencies,
        };
        if (deps[targetPackageName]) {
          dependents.push({
            name: pkgName,
            path: `node_modules/${pkgName}`,
            spec: deps[targetPackageName],
          });
        }
      }
    } catch {}
  };

  try {
    const entries = readdirSync(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("@")) {
          const scopedDir = resolve(nodeModulesDir, entry.name);
          try {
            const scopedEntries = readdirSync(scopedDir, {
              withFileTypes: true,
            });
            for (const scopedEntry of scopedEntries) {
              if (scopedEntry.isDirectory()) {
                checkPkg(
                  resolve(scopedDir, scopedEntry.name),
                  `${entry.name}/${scopedEntry.name}`,
                );
              }
            }
          } catch {}
        } else if (
          entry.name !== targetPackageName &&
          !entry.name.startsWith(".")
        ) {
          checkPkg(resolve(nodeModulesDir, entry.name), entry.name);
        }
      }
    }
  } catch {}

  return dependents;
}
