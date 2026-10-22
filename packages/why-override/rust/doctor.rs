use crate::json::{parse_json, JsonValue};
use crate::selectors::{
    format_selector, get_override_target, package_name_from_segment, selector_key, Selector,
};
use crate::store::{get_record_selector, is_valid_reason_record};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Semver {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

pub fn parse_semver(v: &str) -> Option<Semver> {
    let bytes = v.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start1 = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'.' {
                i += 1;
                let start2 = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                if i > start2 && i < bytes.len() && bytes[i] == b'.' {
                    i += 1;
                    let start3 = i;
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        i += 1;
                    }
                    if i > start3 {
                        let major = v[start1..start2 - 1].parse().ok()?;
                        let minor = v[start2..start3 - 1].parse().ok()?;
                        let patch = v[start3..i].parse().ok()?;
                        return Some(Semver {
                            major,
                            minor,
                            patch,
                        });
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

pub fn is_satisfied(requested_spec: &str, target_version: &str) -> bool {
    let Some(target) = parse_semver(target_version) else {
        return false;
    };
    let trimmed = requested_spec.trim();
    if trimmed == target_version
        || trimmed
            .strip_prefix('^')
            .map(|s| s == target_version)
            .unwrap_or(false)
        || trimmed
            .strip_prefix('~')
            .map(|s| s == target_version)
            .unwrap_or(false)
    {
        return true;
    }

    if let Some(rest) = trimmed
        .strip_prefix(">=")
        .or_else(|| trimmed.strip_prefix('>'))
    {
        if let Some(min_ver) = parse_semver(rest.trim_start()) {
            if target >= min_ver {
                return true;
            }
        }
    }

    let (prefix, rest) = if let Some(r) = trimmed.strip_prefix('^') {
        (Some('^'), r.trim_start())
    } else if let Some(r) = trimmed.strip_prefix('~') {
        (Some('~'), r.trim_start())
    } else {
        (None, trimmed)
    };

    if let Some(spec) = parse_semver(rest) {
        match prefix {
            Some('^') => {
                if spec.major > 0 && target.major == spec.major {
                    return target >= spec;
                }
                return false;
            }
            Some('~') => {
                if target.major == spec.major && target.minor == spec.minor {
                    return target >= spec;
                }
                return false;
            }
            _ => {}
        }
    }
    false
}

#[derive(Clone, Debug)]
pub struct DependentEntry {
    pub name: String,
    pub path: String,
    pub spec: String,
}

fn add_dep_entry(
    index: &mut HashMap<String, Vec<DependentEntry>>,
    dep_name: &str,
    entry: DependentEntry,
) {
    index.entry(dep_name.to_string()).or_default().push(entry);
}

fn strip_node_modules_prefix(path: &str) -> &str {
    match path.rfind("node_modules/") {
        Some(idx) => &path[idx + "node_modules/".len()..],
        None => path,
    }
}

pub fn index_lockfile(workspace_root: &Path) -> Option<HashMap<String, Vec<DependentEntry>>> {
    let lockfile_path = workspace_root.join("package-lock.json");
    let content = fs::read_to_string(lockfile_path).ok()?;
    let lockfile = parse_json(&content).ok()?;
    let mut index = HashMap::new();

    if let Some(packages) = lockfile.get("packages").and_then(|p| p.as_object()) {
        for (pkg_path, pkg_info) in packages {
            if pkg_path.is_empty() {
                continue;
            }
            let deps = pkg_info.get("dependencies").and_then(|d| d.as_object());
            let peer_deps = pkg_info.get("peerDependencies").and_then(|d| d.as_object());
            if deps.is_none() && peer_deps.is_none() {
                continue;
            }
            let name = pkg_info
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or_else(|| strip_node_modules_prefix(pkg_path))
                .to_string();

            if let Some(deps_list) = deps {
                for (dep_name, spec_val) in deps_list {
                    if peer_deps
                        .map(|pd| pd.iter().any(|(k, _)| k == dep_name))
                        .unwrap_or(false)
                    {
                        continue;
                    }
                    if let Some(spec) = spec_val.as_str() {
                        add_dep_entry(
                            &mut index,
                            dep_name,
                            DependentEntry {
                                name: name.clone(),
                                path: pkg_path.clone(),
                                spec: spec.to_string(),
                            },
                        );
                    }
                }
            }
            if let Some(peer_list) = peer_deps {
                for (dep_name, spec_val) in peer_list {
                    if let Some(spec) = spec_val.as_str() {
                        add_dep_entry(
                            &mut index,
                            dep_name,
                            DependentEntry {
                                name: name.clone(),
                                path: pkg_path.clone(),
                                spec: spec.to_string(),
                            },
                        );
                    }
                }
            }
        }
        return Some(index);
    }

    if let Some(deps) = lockfile.get("dependencies") {
        fn scan_v1_deps(
            deps_obj: &JsonValue,
            parent_name: &str,
            index: &mut HashMap<String, Vec<DependentEntry>>,
        ) {
            let Some(entries) = deps_obj.as_object() else {
                return;
            };
            for (name, info) in entries {
                if let Some(requires) = info.get("requires").and_then(|r| r.as_object()) {
                    let resolved_name = if parent_name.is_empty() {
                        name.as_str()
                    } else {
                        parent_name
                    };
                    let pkg_path = format!("node_modules/{}", name);
                    for (dep_name, spec_val) in requires {
                        if let Some(spec) = spec_val.as_str() {
                            add_dep_entry(
                                index,
                                dep_name,
                                DependentEntry {
                                    name: resolved_name.to_string(),
                                    path: pkg_path.clone(),
                                    spec: spec.to_string(),
                                },
                            );
                        }
                    }
                }
                if let Some(sub_deps) = info.get("dependencies") {
                    scan_v1_deps(sub_deps, name, index);
                }
            }
        }
        scan_v1_deps(deps, "", &mut index);
        return Some(index);
    }

    None
}

pub fn index_node_modules(workspace_root: &Path) -> HashMap<String, Vec<DependentEntry>> {
    let mut index = HashMap::new();
    let nm_dir = workspace_root.join("node_modules");
    let Ok(entries) = fs::read_dir(&nm_dir) else {
        return index;
    };

    let check_pkg = |pkg_dir: &Path,
                     pkg_name: &str,
                     index: &mut HashMap<String, Vec<DependentEntry>>| {
        let manifest_path = pkg_dir.join("package.json");
        let Ok(content) = fs::read_to_string(manifest_path) else {
            return;
        };
        let Ok(pkg_manifest) = parse_json(&content) else {
            return;
        };
        let deps = pkg_manifest.get("dependencies").and_then(|d| d.as_object());
        let peer_deps = pkg_manifest
            .get("peerDependencies")
            .and_then(|d| d.as_object());
        let pkg_path = format!("node_modules/{}", pkg_name);

        if let Some(deps_list) = deps {
            for (dep_name, spec_val) in deps_list {
                if peer_deps
                    .map(|pd| pd.iter().any(|(k, _)| k == dep_name))
                    .unwrap_or(false)
                {
                    continue;
                }
                if dep_name != pkg_name {
                    if let Some(spec) = spec_val.as_str() {
                        add_dep_entry(
                            index,
                            dep_name,
                            DependentEntry {
                                name: pkg_name.to_string(),
                                path: pkg_path.clone(),
                                spec: spec.to_string(),
                            },
                        );
                    }
                }
            }
        }
        if let Some(peer_list) = peer_deps {
            for (dep_name, spec_val) in peer_list {
                if dep_name != pkg_name {
                    if let Some(spec) = spec_val.as_str() {
                        add_dep_entry(
                            index,
                            dep_name,
                            DependentEntry {
                                name: pkg_name.to_string(),
                                path: pkg_path.clone(),
                                spec: spec.to_string(),
                            },
                        );
                    }
                }
            }
        }
    };

    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if !ft.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('@') {
            if let Ok(scoped_entries) = fs::read_dir(entry.path()) {
                for scoped_entry in scoped_entries.flatten() {
                    if scoped_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let sub_name = scoped_entry.file_name().to_string_lossy().to_string();
                        let full_name = format!("{}/{}", name, sub_name);
                        check_pkg(&scoped_entry.path(), &full_name, &mut index);
                    }
                }
            }
        } else if !name.starts_with('.') {
            check_pkg(&entry.path(), &name, &mut index);
        }
    }

    index
}

pub fn build_dependents_index(workspace_root: &Path) -> HashMap<String, Vec<DependentEntry>> {
    index_lockfile(workspace_root).unwrap_or_else(|| index_node_modules(workspace_root))
}

pub fn run_doctor(
    workspace_root: &Path,
    manifest: &JsonValue,
    selectors: &[Selector],
    reasons_by_selector: &HashMap<String, String>,
    reason_document: &JsonValue,
    reason_store_filename: &str,
    reason_store_missing: bool,
    reason_store_writable: bool,
) {
    println!("=== why-override Doctor ===\n");
    if reason_store_missing {
        println!("Reason Store: MISSING ({})", reason_store_filename);
    } else if !reason_store_writable {
        println!("Reason Store: MALFORMED ({})", reason_store_filename);
    } else {
        println!("Reason Store: HEALTHY ({})", reason_store_filename);
    }

    let active_keys: HashSet<String> = selectors.iter().map(|s| selector_key(s)).collect();
    let stored_count = reason_document
        .get("reasons")
        .and_then(|r| r.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    println!("Total Overrides: {}", selectors.len());
    println!("Total Stored Reasons: {}", stored_count);

    let mut orphaned = Vec::new();
    if let Some(records) = reason_document.get("reasons").and_then(|r| r.as_array()) {
        for record in records {
            if let Some(rec_sel) = get_record_selector(record) {
                if is_valid_reason_record(record) {
                    let key = selector_key(&rec_sel);
                    if !active_keys.contains(&key) {
                        orphaned.push(rec_sel);
                    }
                }
            }
        }
    }

    if !orphaned.is_empty() {
        println!("\nOrphaned Records ({}):", orphaned.len());
        for s in &orphaned {
            println!(
                "  - {} (run 'why-override prune' to remove)",
                format_selector(s)
            );
        }
    }

    if !selectors.is_empty() {
        println!("\nOverride Analysis:");
    }

    let dep_index = if !selectors.is_empty() {
        build_dependents_index(workspace_root)
    } else {
        HashMap::new()
    };

    for selector in selectors {
        let key = selector_key(selector);
        let display_selector = format_selector(selector);
        let reason = reasons_by_selector.get(&key);
        let current_target = get_override_target(manifest, selector);
        let pkg_name = package_name_from_segment(selector.last().map(|s| s.as_str()).unwrap_or(""));

        println!("\n{}", display_selector);
        if let Some(target) = current_target {
            println!("  Target: {}", target);
        }
        if let Some(r) = reason {
            println!("  Reason: {}", r);
        } else {
            println!("  Reason: UNDOCUMENTED");
        }

        let dependents = dep_index.get(pkg_name).map(|v| v.as_slice()).unwrap_or(&[]);
        if dependents.is_empty() {
            println!(
                "  Status: Safe to Remove (no parent packages found requesting \"{}\")",
                pkg_name
            );
        } else {
            let mut unmet = Vec::new();
            for dep in dependents {
                if let Some(target) = current_target {
                    if !is_satisfied(&dep.spec, target) {
                        unmet.push(dep);
                    }
                }
            }
            if unmet.is_empty() && current_target.is_some() {
                let target = current_target.unwrap();
                println!(
                    "  Status: Safe to Remove (all parent packages natively satisfy \"{}\")",
                    target
                );
                println!("  Dependents:");
                for dep in dependents {
                    println!("    - {} requests \"{}\"", dep.name, dep.spec);
                }
            } else {
                println!("  Status: Still Needed");
                println!("  Dependents requiring override:");
                if !unmet.is_empty() {
                    for dep in unmet {
                        println!("    - {} requests \"{}\"", dep.name, dep.spec);
                    }
                } else {
                    for dep in dependents {
                        println!("    - {} requests \"{}\"", dep.name, dep.spec);
                    }
                }
            }
        }
    }

    println!("\n===========================");
}
