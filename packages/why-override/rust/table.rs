use crate::json::JsonValue;
use crate::selectors::{
    format_installed_at, format_selector, get_installed_info, get_override_target, Selector,
};
use std::path::Path;

pub struct TableEntry {
    pub selector: Selector,
    pub reason: String,
    pub workspaces_text: Option<String>,
}

pub fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();

    for word in text.split_whitespace() {
        let mut remaining = word;
        while remaining.chars().count() > width {
            if !line.is_empty() {
                lines.push(line);
                line = String::new();
            }
            let chunk: String = remaining.chars().take(width).collect();
            let byte_len = chunk.len();
            lines.push(chunk);
            remaining = &remaining[byte_len..];
        }
        if line.is_empty() {
            line = remaining.to_string();
        } else if line.chars().count() + 1 + remaining.chars().count() <= width {
            line.push(' ');
            line.push_str(remaining);
        } else {
            lines.push(line);
            line = remaining.to_string();
        }
    }

    if !line.is_empty() || lines.is_empty() {
        lines.push(line);
    }
    lines
}

pub fn print_override_table(entries: &[TableEntry], workspace_root: &Path, manifest: &JsonValue) {
    if entries.is_empty() {
        return;
    }

    let headers = [
        "Package",
        "Override",
        "Installed",
        "Last installed",
        "Reason",
    ];
    let rows: Vec<[String; 5]> = entries
        .iter()
        .map(|entry| {
            let target = get_override_target(manifest, &entry.selector)
                .unwrap_or("")
                .to_string();
            let installed = get_installed_info(&entry.selector, workspace_root);
            let installed_version = installed
                .version
                .unwrap_or_else(|| "not installed".to_string());
            let installed_at = installed
                .installed_at_secs
                .map(format_installed_at)
                .unwrap_or_else(|| "-".to_string());
            [
                format_selector(&entry.selector),
                target,
                installed_version,
                installed_at,
                entry.reason.trim().to_string(),
            ]
        })
        .collect();

    let mut widths = [0usize; 5];
    for col in 0..4 {
        widths[col] = headers[col].len();
        for row in &rows {
            widths[col] = widths[col].max(row[col].chars().count());
        }
    }
    let mut longest_reason = headers[4].len();
    for row in &rows {
        longest_reason = longest_reason.max(row[4].chars().count());
    }
    widths[4] = longest_reason;

    let border = |left: &str, middle: &str, right: &str| -> String {
        let segments: Vec<String> = widths.iter().map(|w| "─".repeat(w + 2)).collect();
        format!("{}{}{}", left, segments.join(middle), right)
    };

    let render_line = |cells: &[&str; 5]| -> String {
        let parts: Vec<String> = cells
            .iter()
            .enumerate()
            .map(|(col, text)| {
                let char_len = text.chars().count();
                let pad = widths[col].saturating_sub(char_len);
                format!(" {}{} ", text, " ".repeat(pad))
            })
            .collect();
        format!("│{}│", parts.join("│"))
    };

    let mut output = vec![
        border("┌", "┬", "┐"),
        render_line(&headers),
        border("├", "┼", "┤"),
    ];

    for (row_idx, row) in rows.iter().enumerate() {
        if row_idx > 0 {
            output.push(border("├", "┼", "┤"));
        }
        let reason_lines = wrap_text(&row[4], widths[4]);
        for (line_idx, reason_line) in reason_lines.iter().enumerate() {
            if line_idx == 0 {
                output.push(render_line(&[
                    &row[0],
                    &row[1],
                    &row[2],
                    &row[3],
                    reason_line,
                ]));
            } else {
                output.push(render_line(&["", "", "", "", reason_line]));
            }
        }
    }

    output.push(border("└", "┴", "┘"));
    println!("{}", output.join("\n"));

    for entry in entries {
        if let Some(ws_text) = &entry.workspaces_text {
            println!(
                "Override {}{}: {}",
                format_selector(&entry.selector),
                ws_text,
                entry.reason
            );
        }
    }
}

