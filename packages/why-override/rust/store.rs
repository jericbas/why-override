use crate::json::{parse_json, stringify_compact, stringify_pretty, JsonValue};
use crate::selectors::{
    days_from_civil, format_selector, get_override_target, selector_key, Selector,
};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn warn_diagnostic(message: &str) {
    eprintln!("\u{001b}[33;1m[why-override] Warning: {}\u{001b}[0m", message);
}

pub fn get_record_selector(record: &JsonValue) -> Option<Selector> {
    let entries = record.as_object()?;
    let sel_val = entries.iter().find(|(k, _)| k == "selector").map(|(_, v)| v)?;
    match sel_val {
        JsonValue::Str(s) if !s.is_empty() => Some(vec![s.clone()]),
        JsonValue::Array(arr) if !arr.is_empty() => {
            let mut out = Vec::with_capacity(arr.len());
            for item in arr {
                let s = item.as_str()?;
                if s.is_empty() {
                    return None;
                }
                out.push(s.to_string());
            }
            Some(out)
        }
        _ => None,
    }
}

pub fn parse_utc_timestamp_ms(value: &str) -> Option<i64> {
    let b = value.as_bytes();
    if b.len() != 24
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return None;
    }
    for &idx in &[0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22] {
        if !b[idx].is_ascii_digit() {
            return None;
        }
    }
    let year: i64 = value[0..4].parse().ok()?;
    let month: u32 = value[5..7].parse().ok()?;
    let day: u32 = value[8..10].parse().ok()?;
    let hour: i64 = value[11..13].parse().ok()?;
    let min: i64 = value[14..16].parse().ok()?;
    let sec: i64 = value[17..19].parse().ok()?;
    let ms: i64 = value[20..23].parse().ok()?;

    if !(1..=12).contains(&month) || day < 1 || hour > 23 || min > 59 || sec > 59 {
        return None;
    }
    let is_leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        2 => {
            if is_leap {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if day > max_day {
        return None;
    }
    let days = days_from_civil(year, month, day);
    Some(days * 86_400_000 + hour * 3_600_000 + min * 60_000 + sec * 1_000 + ms)
}

pub fn is_utc_timestamp(value: &str) -> bool {
    parse_utc_timestamp_ms(value).is_some()
}

pub fn is_valid_reason_record(record: &JsonValue) -> bool {
    if get_record_selector(record).is_none() {
        return false;
    }
    let Some(reason) = record.get("reason").and_then(|v| v.as_str()) else {
        return false;
    };
    if reason.trim().is_empty() {
        return false;
    }
    let Some(created_at) = record.get("createdAt").and_then(|v| v.as_str()) else {
        return false;
    };
    let Some(updated_at) = record.get("updatedAt").and_then(|v| v.as_str()) else {
        return false;
    };
    if !is_utc_timestamp(created_at) || !is_utc_timestamp(updated_at) {
        return false;
    }
    if let Some(target_val) = record.get("target") {
        if !matches!(target_val, JsonValue::Null | JsonValue::Str(_)) {
            return false;
        }
        if matches!(target_val, JsonValue::Null) {
            return false;
        }
    }
    if let Some(ws_val) = record.get("workspaces") {
        let Some(arr) = ws_val.as_array() else {
            return false;
        };
        if arr.is_empty()
            || !arr
                .iter()
                .all(|w| w.as_str().map(|s| !s.is_empty()).unwrap_or(false))
        {
            return false;
        }
    }
    true
}

pub fn get_prompt_timeout_seconds(manifest: &JsonValue) -> u64 {
    let default_timeout = 10u64;
    if let Ok(env_val) = env::var("OVERRIDE_TIMEOUT") {
        if let Ok(n) = env_val.trim().parse::<i64>() {
            if n > 0 && !env_val.contains('.') {
                return n as u64;
            }
        }
        eprintln!(
            "Warning: invalid override prompt timeout {}; using default {} seconds.",
            stringify_compact(&JsonValue::Str(env_val)),
            default_timeout
        );
        return default_timeout;
    }

    if let Some(cfg_val) = manifest
        .get("config")
        .and_then(|c| c.get("why-override"))
        .and_then(|w| w.get("timeout"))
    {
        match cfg_val {
            JsonValue::Number(n) if *n > 0.0 && n.fract() == 0.0 && n.is_finite() => {
                return *n as u64;
            }
            JsonValue::Str(s) => {
                if let Ok(n) = s.trim().parse::<i64>() {
                    if n > 0 && !s.contains('.') {
                        return n as u64;
                    }
                }
            }
            _ => {}
        }
        eprintln!(
            "Warning: invalid override prompt timeout {}; using default {} seconds.",
            stringify_compact(cfg_val),
            default_timeout
        );
    }
    default_timeout
}

pub fn get_existing_reasons(reason_document: &JsonValue) -> Vec<String> {
    let mut reasons = Vec::new();
    let mut seen = HashSet::new();
    if let Some(arr) = reason_document.get("reasons").and_then(|r| r.as_array()) {
        for record in arr {
            if is_valid_reason_record(record) {
                if let Some(r) = record.get("reason").and_then(|v| v.as_str()) {
                    let trimmed = r.trim();
                    if !trimmed.is_empty() && seen.insert(trimmed.to_string()) {
                        reasons.push(trimmed.to_string());
                    }
                }
            }
        }
    }
    reasons
}

pub struct StoreData {
    pub reason_text: String,
    pub reason_document: JsonValue,
    pub reason_store_missing: bool,
    pub reason_store_writable: bool,
}

fn empty_reason_document() -> JsonValue {
    JsonValue::Object(vec![
        ("version".to_string(), JsonValue::Number(1.0)),
        ("reasons".to_string(), JsonValue::Array(Vec::new())),
    ])
}

pub fn load_reason_store(reason_store_path: &Path, reason_store_filename: &str) -> StoreData {
    let mut reason_text = String::new();
    let mut reason_store_missing = false;

    match fs::read_to_string(reason_store_path) {
        Ok(text) => reason_text = text,
        Err(err) if err.kind() == ErrorKind::NotFound => {
            reason_store_missing = true;
        }
        Err(err) => panic!("Failed to read reason store: {}", err),
    }

    let mut reason_store_writable = true;
    let reason_document = if reason_store_missing {
        warn_diagnostic(&format!(
            "{} is missing; it will be created when you save a reason.",
            reason_store_filename
        ));
        let doc = empty_reason_document();
        reason_text = format!("{}\n", stringify_pretty(&doc));
        doc
    } else {
        match parse_json(&reason_text) {
            Ok(doc)
                if doc.as_object().is_some()
                    && doc.get("reasons").and_then(|r| r.as_array()).is_some() =>
            {
                doc
            }
            _ => {
                warn_diagnostic(&format!(
                    "{} is malformed; saved reasons cannot be read or updated.",
                    reason_store_filename
                ));
                reason_store_writable = false;
                empty_reason_document()
            }
        }
    };

    StoreData {
        reason_text,
        reason_document,
        reason_store_missing,
        reason_store_writable,
    }
}

pub struct ValidatedReasons {
    pub reasons_by_selector: HashMap<String, String>,
    pub workspaces_by_selector: HashMap<String, String>,
}

pub fn validate_reasons(
    reason_document: &JsonValue,
    selectors: &[Selector],
    manifest: &JsonValue,
    warn: bool,
) -> ValidatedReasons {
    let minimum_review_age_ms: i64 = 30 * 24 * 60 * 60 * 1000;
    let active_keys: HashSet<String> = selectors.iter().map(|s| selector_key(s)).collect();
    let mut reasons_by_selector = HashMap::new();
    let mut workspaces_by_selector = HashMap::new();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let Some(records) = reason_document.get("reasons").and_then(|r| r.as_array()) else {
        return ValidatedReasons {
            reasons_by_selector,
            workspaces_by_selector,
        };
    };

    for record in records {
        let sel = get_record_selector(record);
        let display_sel = sel
            .as_ref()
            .map(|s| format_selector(s))
            .unwrap_or_else(|| "unknown selector".to_string());

        if !is_valid_reason_record(record) {
            if warn {
                warn_diagnostic(&format!(
                    "malformed override reason record for {}; treating it as undocumented and preserving the record.",
                    display_sel
                ));
            }
            continue;
        }

        let selector = sel.unwrap();
        let key = selector_key(&selector);
        if !active_keys.contains(&key) {
            if warn {
                warn_diagnostic(&format!(
                    "stale override reason for {}; preserving the record.",
                    display_sel
                ));
            }
            continue;
        }

        if let Some(reason_str) = record.get("reason").and_then(|v| v.as_str()) {
            reasons_by_selector.insert(key.clone(), reason_str.to_string());
        }

        if let Some(ws_arr) = record.get("workspaces").and_then(|v| v.as_array()) {
            if !ws_arr.is_empty() {
                let names: Vec<&str> = ws_arr.iter().filter_map(|w| w.as_str()).collect();
                workspaces_by_selector.insert(key, format!(" [workspaces: {}]", names.join(", ")));
            }
        }

        if warn {
            if let (Some(rec_target), Some(curr_target)) = (
                record.get("target").and_then(|v| v.as_str()),
                get_override_target(manifest, &selector),
            ) {
                if rec_target != curr_target {
                    warn_diagnostic(&format!(
                        "override target for {} changed from \"{}\" to \"{}\".",
                        display_sel, rec_target, curr_target
                    ));
                }
            }

            if let Some(updated_at) = record.get("updatedAt").and_then(|v| v.as_str()) {
                if let Some(updated_ms) = parse_utc_timestamp_ms(updated_at) {
                    if now_ms - updated_ms >= minimum_review_age_ms {
                        warn_diagnostic(&format!(
                            "Review this override rationale for {}; it was last updated {}.",
                            display_sel, updated_at
                        ));
                    }
                }
            }
        }
    }

    ValidatedReasons {
        reasons_by_selector,
        workspaces_by_selector,
    }
}

