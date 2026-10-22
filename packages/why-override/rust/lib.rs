pub mod commands;
pub mod doctor;
pub mod json;
pub mod selectors;
pub mod store;
pub mod table;

#[cfg(test)]
mod tests {
    use super::doctor::{is_satisfied, parse_semver};
    use super::json::{parse_json, stringify_pretty};
    use super::selectors::{collect_all_manifest_selectors, format_selector, get_override_target};
    use super::store::{is_utc_timestamp, validate_reasons};

    #[test]
    fn parses_and_formats_selectors_and_reasons() {
        let manifest = parse_json(
            r#"{
              "name": "test-pkg",
              "overrides": {
                "chalk": "1.0.0",
                "is-odd": {
                  "is-number": "7.0.0"
                }
              },
              "resolutions": {
                "@scope/parent/@scope/child": "2.1.0"
              }
            }"#,
        )
        .unwrap();

        let selectors = collect_all_manifest_selectors(&manifest);
        assert_eq!(selectors.len(), 3);
        assert_eq!(format_selector(&selectors[0]), "\"chalk\"");
        assert_eq!(
            format_selector(&selectors[1]),
            "\"is-odd\" > \"is-number\""
        );
        assert_eq!(
            format_selector(&selectors[2]),
            "\"@scope/parent\" > \"@scope/child\""
        );
        assert_eq!(
            get_override_target(&manifest, &selectors[1]),
            Some("7.0.0")
        );
    }

    #[test]
    fn validates_utc_timestamps_and_semver_satisfaction() {
        assert!(is_utc_timestamp("2026-10-15T00:00:00.000Z"));
        assert!(!is_utc_timestamp("2026-02-30T00:00:00.000Z"));
        assert!(!is_utc_timestamp("not-a-timestamp"));

        assert!(parse_semver("^7.0.0").is_some());
        assert!(is_satisfied("^7.0.0", "7.1.2"));
        assert!(!is_satisfied("^6.0.0", "7.0.0"));
        assert!(is_satisfied(">=6.0.0", "7.0.0"));
    }

    #[test]
    fn validates_reason_records_and_roundtrips_json() {
        let manifest = parse_json(r#"{"overrides":{"is-number":"7.0.0"}}"#).unwrap();
        let doc = parse_json(
            r#"{
  "version": 1,
  "reasons": [
    {
      "selector": [
        "is-number"
      ],
      "reason": "Pin compatible release.",
      "createdAt": "2026-10-15T00:00:00.000Z",
      "updatedAt": "2026-10-15T00:00:00.000Z"
    }
  ]
}"#,
        )
        .unwrap();

        let selectors = collect_all_manifest_selectors(&manifest);
        let validated = validate_reasons(&doc, &selectors, &manifest, false);
        assert_eq!(
            validated.reasons_by_selector.get("[\"is-number\"]").map(|s| s.as_str()),
            Some("Pin compatible release.")
        );
        assert!(stringify_pretty(&doc).contains("\"Pin compatible release.\""));
    }
}

