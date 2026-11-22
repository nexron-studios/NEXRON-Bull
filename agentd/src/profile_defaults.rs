//! What a profile starts new sessions with when the app leaves model, effort or mode open:
//! the user's `settings.json` in the profile folder. Project settings can still override it.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ProfileDefaults {
    /// As written there: an alias (`opus`) or a full model name; `None` is Claude Code's default.
    pub model: Option<String>,
    pub effort: Option<String>,
    pub permission_mode: Option<String>,
    /// `modelSettings.<model>.effortLevel` by model name (`claude-opus-5-5`); for that model it
    /// comes before `effort`.
    pub model_efforts: BTreeMap<String, String>,
}

/// A missing or unreadable file sets nothing.
pub fn read(profile_dir: &Path) -> ProfileDefaults {
    let Ok(text) = fs::read_to_string(profile_dir.join("settings.json")) else {
        return ProfileDefaults::default();
    };
    let settings: Value = serde_json::from_str(&text).unwrap_or_default();
    let text_at = |value: &Value| value.as_str().map(str::to_string);
    ProfileDefaults {
        model: text_at(&settings["model"]),
        effort: text_at(&settings["effortLevel"]),
        permission_mode: text_at(&settings["permissions"]["defaultMode"]),
        model_efforts: model_efforts_of(&settings["modelSettings"]),
    }
}

fn model_efforts_of(model_settings: &Value) -> BTreeMap<String, String> {
    let Some(models) = model_settings.as_object() else {
        return BTreeMap::new();
    };
    models
        .iter()
        .filter_map(|(model, settings)| Some((model.clone(), settings["effortLevel"].as_str()?.to_string())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-defaults-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_model_effort_and_mode() {
        let dir = temp("set");
        fs::write(
            dir.join("settings.json"),
            r#"{"model":"opus","effortLevel":"high","permissions":{"defaultMode":"auto","allow":[]}}"#,
        )
        .unwrap();
        let expected = ProfileDefaults {
            model: Some("opus".into()),
            effort: Some("high".into()),
            permission_mode: Some("auto".into()),
            model_efforts: BTreeMap::new(),
        };
        assert_eq!(read(&dir), expected);
    }

    #[test]
    fn reads_the_effort_of_each_model() {
        let dir = temp("models");
        fs::write(
            dir.join("settings.json"),
            r#"{"modelSettings":{"claude-opus-5-5":{"effortLevel":"high"},"claude-sonnet-5":{"maxEffortLevel":"medium"}}}"#,
        )
        .unwrap();
        let expected = ProfileDefaults {
            model_efforts: BTreeMap::from([("claude-opus-5-5".to_string(), "high".to_string())]),
            ..ProfileDefaults::default()
        };
        assert_eq!(read(&dir), expected);
    }

    #[test]
    fn missing_or_broken_settings_set_nothing() {
        let dir = temp("missing");
        assert_eq!(read(&dir), ProfileDefaults::default());
        fs::write(dir.join("settings.json"), "{ not json").unwrap();
        assert_eq!(read(&dir), ProfileDefaults::default());
    }
}
