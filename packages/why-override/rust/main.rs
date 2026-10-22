use std::env;
use std::fs;
use std::process;
use why_override::commands::{
    ask_for_explanation, find_reason_store_path, find_workspace_root, is_stdin_tty, refresh_reason,
    run_check, run_enforce, run_prune, update_selector_reason, AppContext,
};
use why_override::doctor::run_doctor;
use why_override::json::{parse_json, JsonValue};
use why_override::selectors::{collect_all_manifest_selectors, format_selector, Selector};
use why_override::store::{get_prompt_timeout_seconds, load_reason_store, validate_reasons};

fn print_help() {
    println!(
        "why-override - Document and review package dependency overrides

Usage:
  why-override                     Enforce override reasons and prompt in interactive TTY
  why-override check, --check, --ci Verify all overrides are documented (exits 1 on failure)
  why-override prune, clean        Remove orphaned records from reason store
  why-override doctor              Analyze override health and upstream dependencies
  why-override refresh             Interactively update reasons
  why-override refresh --all       Prompt to re-enter reasons for all overrides
  why-override refresh '<selector>' Update reason for a specific selector
"
    );
}

fn parse_single_selector(val: &JsonValue) -> Option<Selector> {
    let arr = val.as_array()?;
    if arr.is_empty() {
        return None;
    }
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

fn parse_multi_selectors(val: &JsonValue) -> Option<Vec<Selector>> {
    let arr = val.as_array()?;
    if arr.is_empty() {
        return None;
    }
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        out.push(parse_single_selector(item)?);
    }
    Some(out)
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.iter().any(|a| a == "--help" || a == "-h") {
        print_help();
        return;
    }

    let workspace_root = find_workspace_root();
    let manifest_path = workspace_root.join("package.json");
    let manifest_text = fs::read_to_string(&manifest_path).unwrap_or_else(|e| {
        eprintln!("Failed to read {}: {}", manifest_path.display(), e);
        process::exit(1);
    });
    let manifest = parse_json(&manifest_text).unwrap_or_else(|e| {
        eprintln!("Failed to parse {}: {}", manifest_path.display(), e);
        process::exit(1);
    });

    let reason_store_path = find_reason_store_path(&workspace_root);
    let reason_store_filename = reason_store_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| ".override-reasons.json".to_string());

    let store_data = load_reason_store(&reason_store_path, &reason_store_filename);
    let prompt_timeout_seconds = get_prompt_timeout_seconds(&manifest);
    let is_tty = is_stdin_tty();
    let selectors = collect_all_manifest_selectors(&manifest);

    let arg2 = args.get(1).map(|s| s.as_str()).unwrap_or("");
    let is_check = arg2 == "check" || args.iter().any(|a| a == "--check" || a == "--ci");
    let is_prune = arg2 == "prune"
        || arg2 == "clean"
        || args.iter().any(|a| a == "--prune" || a == "--clean");
    let is_doctor = arg2 == "doctor" || args.iter().any(|a| a == "--doctor");

    let validated = validate_reasons(
        &store_data.reason_document,
        &selectors,
        &manifest,
        !is_check && !is_prune && !is_doctor,
    );

    let mut ctx = AppContext {
        workspace_root,
        manifest,
        reason_store_path,
        reason_store_filename,
        reason_text: store_data.reason_text,
        reason_document: store_data.reason_document,
        reason_store_missing: store_data.reason_store_missing,
        reason_store_writable: store_data.reason_store_writable,
        prompt_timeout_seconds,
        is_tty,
        selectors,
        reasons_by_selector: validated.reasons_by_selector,
        workspaces_by_selector: validated.workspaces_by_selector,
    };

    if is_check {
        if !run_check(&ctx) {
            process::exit(1);
        }
    } else if is_prune {
        if !run_prune(&mut ctx) {
            process::exit(1);
        }
    } else if is_doctor {
        run_doctor(
            &ctx.workspace_root,
            &ctx.manifest,
            &ctx.selectors,
            &ctx.reasons_by_selector,
            &ctx.reason_document,
            &ctx.reason_store_filename,
            ctx.reason_store_missing,
            ctx.reason_store_writable,
        );
    } else if arg2 == "refresh" {
        let arg3 = args.get(2).map(|s| s.as_str()).unwrap_or("");
        if arg3 == "--all" || arg3 == "-a" {
            let sels = ctx.selectors.clone();
            let mut ok = true;
            for sel in &sels {
                if !refresh_reason(&mut ctx, sel) {
                    ok = false;
                }
            }
            if !sels.is_empty() {
                println!(
                    "Note: please check {} if you want to check and edit reasons manually.",
                    ctx.reason_store_filename
                );
            }
            if !ok {
                process::exit(1);
            }
        } else if args.len() == 2 {
            if !ctx.is_tty {
                eprintln!("Refreshing a reason requires an interactive terminal.");
                process::exit(1);
            }
            if ctx.selectors.is_empty() {
                println!("No overrides found.");
            }
        } else {
            let parsed = parse_json(arg3).ok();
            let single = parsed.as_ref().and_then(parse_single_selector);
            let multi = parsed.as_ref().and_then(parse_multi_selectors);

            if args.len() != 3 || (single.is_none() && multi.is_none()) {
                eprintln!(
                    "Usage: why-override refresh '[\"package\", \"nested-selector\"]' or why-override refresh --all"
                );
                process::exit(1);
            } else if let Some(sel) = single {
                let ok = refresh_reason(&mut ctx, &sel);
                println!(
                    "Note: please check {} if you want to check and edit reasons manually.",
                    ctx.reason_store_filename
                );
                if !ok {
                    process::exit(1);
                }
            } else if let Some(sels) = multi {
                let display_selector = sels
                    .iter()
                    .map(|s| format_selector(s))
                    .collect::<Vec<_>>()
                    .join(", ");
                if let Some(explanation) = ask_for_explanation(&ctx, &display_selector) {
                    if !explanation.is_empty() {
                        let mut any_changed = false;
                        for item in &sels {
                            if update_selector_reason(&mut ctx, item, &explanation) {
                                any_changed = true;
                            }
                        }
                        if any_changed {
                            let _ = fs::write(&ctx.reason_store_path, &ctx.reason_text);
                        }
                    }
                }
                println!(
                    "Note: please check {} if you want to check and edit reasons manually.",
                    ctx.reason_store_filename
                );
            }
        }
    } else {
        let is_reenter = args.iter().any(|a| a == "--reenter" || a == "--re-enter");
        run_enforce(&mut ctx, is_reenter);
    }
}

