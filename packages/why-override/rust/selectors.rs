use crate::json::{escape_json_string, parse_json, JsonValue};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub type Selector = Vec<String>;

pub fn parse_selector_segments(key: &str) -> Selector {
    if !key.contains('/') {
        return vec![key.to_string()];
    }
    let parts: Vec<&str> = key.split('/').collect();
    let mut segments = Vec::with_capacity(parts.len());
    let mut i = 0;
    while i < parts.len() {
        if parts[i].starts_with('@') && i + 1 < parts.len() {
            segments.push(format!("{}/{}", parts[i], parts[i + 1]));
            i += 2;
        } else {
            segments.push(parts[i].to_string());
            i += 1;
        }
    }
    segments
}

pub fn selector_key(selector: &[String]) -> String {
    let mut out = String::from("[");
    for (i, seg) in selector.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        escape_json_string(seg, &mut out);
    }
    out.push(']');
    out
}

pub fn format_selector(selector: &[String]) -> String {
    let mut out = String::new();
    for (i, seg) in selector.iter().enumerate() {
        if i > 0 {
            out.push_str(" > ");
        }
        escape_json_string(seg, &mut out);
    }
    out
}

pub fn collect_override_selectors(
    overrides: &JsonValue,
    parent_path: &[String],
    out: &mut Vec<Selector>,
) {
    let Some(entries) = overrides.as_object() else {
        return;
    };
    for (key, value) in entries {
        let segments = parse_selector_segments(key);
        let mut selector = Vec::with_capacity(parent_path.len() + segments.len());
        selector.extend_from_slice(parent_path);
        selector.extend(segments);

        if selector.iter().any(|seg| seg.contains('*')) {
            eprintln!(
                "Warning: unsupported wildcard override selector {}; skipping.",
                selector_key(&selector)
            );
            continue;
        }

        match value {
            JsonValue::Object(_) => collect_override_selectors(value, &selector, out),
            JsonValue::Str(_) => out.push(selector),
            _ => {}
        }
    }
}

pub fn collect_all_manifest_selectors(manifest: &JsonValue) -> Vec<Selector> {
    let sources = [
        manifest.get("overrides"),
        manifest.get("pnpm").and_then(|p| p.get("overrides")),
        manifest.get("resolutions"),
    ];
    let mut seen = HashSet::new();
    let mut all_selectors = Vec::new();

    for source in sources.into_iter().flatten() {
        if source.as_object().is_some() {
            let mut found = Vec::new();
            collect_override_selectors(source, &[], &mut found);
            for sel in found {
                let key = selector_key(&sel);
                if seen.insert(key) {
                    all_selectors.push(sel);
                }
            }
        }
    }
    all_selectors
}

pub fn package_name_from_segment<'a>(segment: &'a str) -> &'a str {
    let search_start = if segment.starts_with('@') { 1 } else { 0 };
    if search_start < segment.len() {
        if let Some(rel_idx) = segment[search_start..].find('@') {
            let idx = search_start + rel_idx;
            if idx > 0 {
                return &segment[..idx];
            }
        }
    }
    segment
}

fn lookup_target_in_object<'a>(obj: &'a JsonValue, selector: &[String]) -> Option<&'a str> {
    let mut current = obj;
    let mut found = true;
    for seg in selector {
        if let Some(next) = current.get(seg) {
            current = next;
        } else {
            found = false;
            break;
        }
    }
    if found {
        if let Some(s) = current.as_str() {
            return Some(s);
        }
    }
    let joined_key = selector.join("/");
    obj.get(&joined_key).and_then(|v| v.as_str())
}

pub fn get_override_target<'a>(manifest: &'a JsonValue, selector: &[String]) -> Option<&'a str> {
    let sources = [
        manifest.get("overrides"),
        manifest.get("pnpm").and_then(|p| p.get("overrides")),
        manifest.get("resolutions"),
    ];
    for source in sources.into_iter().flatten() {
        if let Some(target) = lookup_target_in_object(source, selector) {
            return Some(target);
        }
    }
    None
}

pub struct InstalledInfo {
    pub name: String,
    pub version: Option<String>,
    pub installed_at_secs: Option<u64>,
}

pub fn get_installed_info(selector: &[String], workspace_root: &Path) -> InstalledInfo {
    let last_seg = selector
        .iter()
        .rev()
        .find(|s| s.as_str() != ".")
        .map(|s| s.as_str())
        .unwrap_or("");
    let name = package_name_from_segment(last_seg).to_string();
    let pkg_dir = workspace_root.join("node_modules").join(&name);
    let pkg_json_path = pkg_dir.join("package.json");

    if let Ok(content) = fs::read_to_string(&pkg_json_path) {
        if let Ok(parsed) = parse_json(&content) {
            if let Some(version) = parsed.get("version").and_then(|v| v.as_str()) {
                let mtime_secs = fs::metadata(&pkg_dir)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                return InstalledInfo {
                    name,
                    version: Some(version.to_string()),
                    installed_at_secs: mtime_secs,
                };
            }
        }
    }
    InstalledInfo {
        name,
        version: None,
        installed_at_secs: None,
    }
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let m_adj = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * m_adj + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe as i64 - 719468
}

pub fn now_iso_utc() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, min, sec, millis
    )
}

pub fn format_installed_at(installed_secs: u64) -> String {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (installed_secs / 86400) as i64;
    let (year, month, day) = civil_from_days(days);
    let stamp = format!("{:04}-{:02}-{:02}", year, month, day);
    let elapsed_mins = now_secs.saturating_sub(installed_secs) / 60;
    let relative = if elapsed_mins < 1 {
        "just now".to_string()
    } else if elapsed_mins < 60 {
        format!("{}m ago", elapsed_mins)
    } else if elapsed_mins < 60 * 24 {
        format!("{}h ago", elapsed_mins / 60)
    } else {
        format!("{}d ago", elapsed_mins / (60 * 24))
    };
    format!("{} ({})", stamp, relative)
}

