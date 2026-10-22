use crate::json::{parse_json, stringify_pretty, JsonValue};
use crate::selectors::{format_selector, get_override_target, now_iso_utc, selector_key, Selector};
use crate::store::{
    get_existing_reasons, get_record_selector, is_valid_reason_record, warn_diagnostic,
};
use crate::table::{print_override_table, TableEntry};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{self, BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};

pub fn find_workspace_root() -> PathBuf {
    let mut current_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut nearest_manifest_dir: Option<PathBuf> = None;
    let mut workspace_root_dir: Option<PathBuf> = None;

    loop {
        let manifest_path = current_dir.join("package.json");
        if manifest_path.exists() {
            if nearest_manifest_dir.is_none() {
                nearest_manifest_dir = Some(current_dir.clone());
            }
            if let Ok(content) = fs::read_to_string(&manifest_path) {
                if let Ok(parsed) = parse_json(&content) {
                    if parsed.get("workspaces").is_some() {
                        workspace_root_dir = Some(current_dir.clone());
                    }
                }
            }
        }

        if current_dir.join("pnpm-workspace.yaml").exists() {
            workspace_root_dir = Some(current_dir.clone());
        }

        let Some(parent) = current_dir.parent() else {
            break;
        };
        if parent == current_dir {
            break;
        }
        current_dir = parent.to_path_buf();
    }

    workspace_root_dir
        .or(nearest_manifest_dir)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn find_reason_store_path(root: &Path) -> PathBuf {
    let candidates = [
        root.join(".override-reasons.json"),
        root.join(".override-reasons.jsonc"),
        root.join("override-reasons.json"),
        root.join("override-reasons.jsonc"),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }
    candidates[0].clone()
}

pub struct AppContext {
    pub workspace_root: PathBuf,
    pub manifest: JsonValue,
    pub reason_store_path: PathBuf,
    pub reason_store_filename: String,
    pub reason_text: String,
    pub reason_document: JsonValue,
    pub reason_store_missing: bool,
    pub reason_store_writable: bool,
    pub prompt_timeout_seconds: u64,
    pub is_tty: bool,
    pub selectors: Vec<Selector>,
    pub reasons_by_selector: HashMap<String, String>,
    pub workspaces_by_selector: HashMap<String, String>,
}

pub fn run_check(ctx: &AppContext) -> bool {
    let mut has_error = false;

    if ctx.reason_store_missing {
        eprintln!(
            "Error: Reason store {} does not exist.",
            ctx.reason_store_filename
        );
        has_error = true;
    } else if !ctx.reason_store_writable {
        eprintln!(
            "Error: Reason store {} is malformed.",
            ctx.reason_store_filename
        );
        has_error = true;
    }

    let mut undocumented = Vec::new();
    for selector in &ctx.selectors {
        let key = selector_key(selector);
        let reason = ctx.reasons_by_selector.get(&key);
        if reason.map(|r| r.trim().is_empty()).unwrap_or(true) {
            undocumented.push(selector);
        }
    }

    if !undocumented.is_empty() {
        has_error = true;
        for selector in undocumented {
            eprintln!(
                "Error: undocumented override {} (missing reason in {})",
                format_selector(selector),
                ctx.reason_store_filename
            );
        }
    }

    let active_keys: HashSet<String> = ctx.selectors.iter().map(|s| selector_key(s)).collect();
    let mut orphaned = Vec::new();
    if let Some(records) = ctx
        .reason_document
        .get("reasons")
        .and_then(|r| r.as_array())
    {
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
        has_error = true;
        for selector in &orphaned {
            eprintln!(
                "Error: orphaned override reason for {} (selector no longer exists in package manifest)",
                format_selector(selector)
            );
        }
    }

    if has_error {
        return false;
    }

    if ctx.selectors.is_empty() {
        println!("✓ No overrides declared; reason store is clean.");
    } else {
        let verb = if ctx.selectors.len() == 1 {
            "reason is"
        } else {
            "reasons are"
        };
        println!(
            "✓ All {} override {} documented and up to date.",
            ctx.selectors.len(),
            verb
        );
    }
    true
}

pub fn run_prune(ctx: &mut AppContext) -> bool {
    if ctx.reason_store_missing {
        println!(
            "Reason store {} does not exist; nothing to prune.",
            ctx.reason_store_filename
        );
        return true;
    }

    if !ctx.reason_store_writable {
        eprintln!(
            "Error: Cannot prune because {} is malformed.",
            ctx.reason_store_filename
        );
        return false;
    }

    let active_keys: HashSet<String> = ctx.selectors.iter().map(|s| selector_key(s)).collect();
    let mut remaining_reasons = Vec::new();
    let mut pruned = Vec::new();

    if let Some(records) = ctx
        .reason_document
        .get("reasons")
        .and_then(|r| r.as_array())
    {
        for record in records {
            if let Some(rec_sel) = get_record_selector(record) {
                if is_valid_reason_record(record) {
                    let key = selector_key(&rec_sel);
                    if !active_keys.contains(&key) {
                        pruned.push(rec_sel);
                        continue;
                    }
                }
            }
            remaining_reasons.push(record.clone());
        }
    }

    if pruned.is_empty() {
        println!("No orphaned override reasons to prune.");
        return true;
    }

    ctx.reason_document
        .set_field("reasons", JsonValue::Array(remaining_reasons));
    ctx.reason_text = format!("{}\n", stringify_pretty(&ctx.reason_document));
    let _ = fs::write(&ctx.reason_store_path, &ctx.reason_text);

    for selector in &pruned {
        println!("Pruned orphaned reason for {}.", format_selector(selector));
    }
    let noun = if pruned.len() == 1 {
        "record"
    } else {
        "records"
    };
    println!(
        "Successfully pruned {} orphaned override {} from {}.",
        pruned.len(),
        noun,
        ctx.reason_store_filename
    );
    true
}

pub fn ask_for_explanation(ctx: &AppContext, display_selector: &str) -> Option<String> {
    if !ctx.is_tty {
        return None;
    }
    let existing = get_existing_reasons(&ctx.reason_document);
    if !existing.is_empty() {
        println!("Existing reasons:");
        for (idx, reason) in existing.iter().enumerate() {
            println!("  {}) {}", idx + 1, reason);
        }
        println!(
            "Type a reason, or enter 1-{} to select an existing one.",
            existing.len()
        );
    }

    println!(
        "Why do you need to override this? {} (auto-skips in {}s)",
        display_selector, ctx.prompt_timeout_seconds
    );
    let _ = io::stdout().flush();

    let stdin = io::stdin();
    let mut line = String::new();
    match stdin.lock().read_line(&mut line) {
        Ok(0) | Err(_) => return None,
        Ok(_) => {}
    }

    let trimmed = line.trim();
    let stripped = trimmed.strip_prefix('#').unwrap_or(trimmed);
    if let Ok(num) = stripped.parse::<usize>() {
        if num >= 1 && num <= existing.len() {
            let selected = existing[num - 1].clone();
            println!("Selected: {}", selected);
            return Some(selected);
        }
    }
    Some(trimmed.to_string())
}

pub fn update_selector_reason(
    ctx: &mut AppContext,
    selector: &Selector,
    explanation: &str,
) -> bool {
    let key = selector_key(selector);
    let display_selector = format_selector(selector);
    let current_target = get_override_target(&ctx.manifest, selector).map(|s| s.to_string());

    let record_index = ctx
        .reason_document
        .get("reasons")
        .and_then(|r| r.as_array())
        .and_then(|arr| {
            arr.iter().rposition(|rec| {
                is_valid_reason_record(rec)
                    && get_record_selector(rec)
                        .map(|s| selector_key(&s) == key)
                        .unwrap_or(false)
            })
        });

    if let Some(idx) = record_index {
        let records = ctx
            .reason_document
            .get_mut("reasons")
            .and_then(|r| r.as_array_mut())
            .unwrap();
        let rec = &mut records[idx];
        let rec_reason = rec.get("reason").and_then(|v| v.as_str()).unwrap_or("");
        let rec_target = rec.get("target").and_then(|v| v.as_str());
        let target_changed = current_target
            .as_deref()
            .map(|ct| Some(ct) != rec_target)
            .unwrap_or(false);

        if explanation == rec_reason && !target_changed {
            println!("Reason unchanged for {}.", display_selector);
            return false;
        }

        let updated_at = now_iso_utc();
        rec.set_field("reason", JsonValue::Str(explanation.to_string()));
        rec.set_field("updatedAt", JsonValue::Str(updated_at));
        if let Some(ct) = current_target {
            rec.set_field("target", JsonValue::Str(ct));
        }
        ctx.reason_text = format!("{}\n", stringify_pretty(&ctx.reason_document));
        ctx.reasons_by_selector
            .insert(key, explanation.to_string());
        println!("Refreshed reason for {}.", display_selector);
        return true;
    }

    let timestamp = now_iso_utc();
    let mut fields = vec![
        (
            "selector".to_string(),
            JsonValue::Array(selector.iter().cloned().map(JsonValue::Str).collect()),
        ),
        ("reason".to_string(), JsonValue::Str(explanation.to_string())),
    ];
    if let Some(ct) = current_target {
        fields.push(("target".to_string(), JsonValue::Str(ct)));
    }
    fields.push(("createdAt".to_string(), JsonValue::Str(timestamp.clone())));
    fields.push(("updatedAt".to_string(), JsonValue::Str(timestamp)));

    if let Some(arr) = ctx
        .reason_document
        .get_mut("reasons")
        .and_then(|r| r.as_array_mut())
    {
        arr.push(JsonValue::Object(fields));
    }
    ctx.reason_text = format!("{}\n", stringify_pretty(&ctx.reason_document));
    if ctx.reason_store_missing {
        println!("Created {}.", ctx.reason_store_path.display());
        ctx.reason_store_missing = false;
    }
    ctx.reasons_by_selector
        .insert(key, explanation.to_string());
    println!("Refreshed reason for {}.", display_selector);
    true
}

pub fn refresh_reason(ctx: &mut AppContext, selector: &Selector) -> bool {
    let key = selector_key(selector);
    let display_selector = format_selector(selector);
    let exists = ctx
        .reason_document
        .get("reasons")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter().any(|rec| {
                is_valid_reason_record(rec)
                    && get_record_selector(rec)
                        .map(|s| selector_key(&s) == key)
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false);

    if !exists {
        eprintln!("No saved reason exists for {}.", display_selector);
        return false;
    }
    if !ctx.is_tty {
        eprintln!("Refreshing a reason requires an interactive terminal.");
        return false;
    }

    let Some(explanation) = ask_for_explanation(ctx, &display_selector) else {
        return true;
    };
    if explanation.is_empty() {
        return true;
    }
    if update_selector_reason(ctx, selector, &explanation) {
        let _ = fs::write(&ctx.reason_store_path, &ctx.reason_text);
    }
    true
}

pub fn run_enforce(ctx: &mut AppContext, is_reenter: bool) {
    let entries: Vec<TableEntry> = ctx
        .selectors
        .iter()
        .filter_map(|selector| {
            let key = selector_key(selector);
            let reason = ctx.reasons_by_selector.get(&key)?;
            if reason.trim().is_empty() {
                return None;
            }
            Some(TableEntry {
                selector: selector.clone(),
                reason: reason.clone(),
                workspaces_text: ctx.workspaces_by_selector.get(&key).cloned(),
            })
        })
        .collect();

    print_override_table(&entries, &ctx.workspace_root, &ctx.manifest);

    let selectors = ctx.selectors.clone();
    for selector in &selectors {
        let key = selector_key(selector);
        let display_selector = format_selector(selector);
        let has_reason = ctx
            .reasons_by_selector
            .get(&key)
            .map(|r| !r.trim().is_empty())
            .unwrap_or(false);

        if has_reason {
            if is_reenter {
                refresh_reason(ctx, selector);
            }
            continue;
        }

        if !ctx.is_tty {
            continue;
        }

        let Some(explanation) = ask_for_explanation(ctx, &display_selector) else {
            break;
        };
        if explanation.is_empty() {
            continue;
        }
        if !ctx.reason_store_writable {
            warn_diagnostic(&format!(
                "cannot save a reason for {} because the reason store is malformed; leaving it unchanged.",
                display_selector
            ));
            continue;
        }

        let timestamp = now_iso_utc();
        let current_target = get_override_target(&ctx.manifest, selector).map(|s| s.to_string());
        let mut fields = vec![
            (
                "selector".to_string(),
                JsonValue::Array(selector.iter().cloned().map(JsonValue::Str).collect()),
            ),
            ("reason".to_string(), JsonValue::Str(explanation.clone())),
        ];
        if let Some(ct) = current_target {
            fields.push(("target".to_string(), JsonValue::Str(ct)));
        }
        fields.push(("createdAt".to_string(), JsonValue::Str(timestamp.clone())));
        fields.push(("updatedAt".to_string(), JsonValue::Str(timestamp)));

        if let Some(arr) = ctx
            .reason_document
            .get_mut("reasons")
            .and_then(|r| r.as_array_mut())
        {
            arr.push(JsonValue::Object(fields));
        }
        ctx.reason_text = format!("{}\n", stringify_pretty(&ctx.reason_document));
        let _ = fs::write(&ctx.reason_store_path, &ctx.reason_text);
        if ctx.reason_store_missing {
            println!("Created {}.", ctx.reason_store_path.display());
            ctx.reason_store_missing = false;
        }
        ctx.reasons_by_selector.insert(key, explanation);
    }

    if !ctx.selectors.is_empty() {
        println!(
            "Note: please check {} if you want to check and edit reasons manually.",
            ctx.reason_store_filename
        );
    }
}

pub fn is_stdin_tty() -> bool {
    io::stdin().is_terminal()
}

