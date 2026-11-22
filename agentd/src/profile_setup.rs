//! Setting up a new Claude account: a fresh `~/.claude-<name>` folder that Claude Code then logs
//! into with `claude /login` and `CLAUDE_CONFIG_DIR` pointing at it. The name comes over the
//! wire, so it may only ever name a folder directly in the home folder.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::catalog::Profile;

/// Long enough for any account name, short enough to stay readable in every list.
const MAX_NAME_CHARS: usize = 32;
/// `~/.claude` is listed as `default`; a `.claude-default` would be a second account of that name.
const RESERVED_NAME: &str = "default";
const PROFILE_PREFIX: &str = ".claude-";

#[derive(Debug, thiserror::Error)]
pub enum ProfileSetupError {
    #[error("invalid account name {0:?}: use a-z, 0-9 and -")]
    BadName(String),
    #[error("{0} already exists")]
    Exists(PathBuf),
    #[error(transparent)]
    Io(#[from] io::Error),
}

fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_CHARS
        && name != RESERVED_NAME
        && !name.starts_with('-')
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Creates `<home>/.claude-<name>` with its `projects` folder, so `catalog::profiles` lists the
/// account right away, logged out until `claude /login` ran there.
pub fn create_profile(home: &Path, name: &str) -> Result<Profile, ProfileSetupError> {
    if !is_valid_name(name) {
        return Err(ProfileSetupError::BadName(name.to_string()));
    }
    let dir = home.join(format!("{PROFILE_PREFIX}{name}"));
    // `create_dir` (not `create_dir_all`) fails on an existing folder, so a race cannot reuse one.
    match fs::create_dir(&dir) {
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => return Err(ProfileSetupError::Exists(dir)),
        other => other?,
    }
    // A half-made folder would be invisible in the catalog yet block every retry with `Exists`.
    if let Err(err) = fs::create_dir(dir.join("projects")) {
        let _ = fs::remove_dir(&dir); // empty, made a moment ago; the original error matters more
        return Err(err.into());
    }
    Ok(Profile { label: name.to_string(), dir, email: None })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-profile-setup-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn creates_a_profile_that_the_catalog_lists() {
        let home = temp_home("create");

        let created = create_profile(&home, "kunde-x").unwrap();

        assert_eq!(created, Profile { label: "kunde-x".into(), dir: home.join(".claude-kunde-x"), email: None });
        assert!(home.join(".claude-kunde-x").join("projects").is_dir());
        let labels: Vec<_> = catalog::profiles(&home).into_iter().map(|p| p.label).collect();
        assert_eq!(labels, vec!["kunde-x"]);
    }

    #[test]
    fn refuses_an_existing_folder_and_leaves_it_alone() {
        let home = temp_home("exists");
        fs::create_dir_all(home.join(".claude-work")).unwrap();
        fs::write(home.join(".claude-work").join(".credentials.json"), "secret").unwrap();

        let err = create_profile(&home, "work").unwrap_err();

        assert!(matches!(err, ProfileSetupError::Exists(_)), "{err}");
        assert_eq!(fs::read_to_string(home.join(".claude-work").join(".credentials.json")).unwrap(), "secret");
        assert!(!home.join(".claude-work").join("projects").exists());
    }

    #[test]
    fn refuses_names_outside_a_z_0_9_and_dash() {
        let home = temp_home("bad-name");
        let too_long = "x".repeat(MAX_NAME_CHARS + 1);
        for name in ["", "Work", "a b", "../x", "a/b", "a\\b", "x.y", "-x", "default", "ü", too_long.as_str()] {
            let err = create_profile(&home, name).unwrap_err();
            assert!(matches!(err, ProfileSetupError::BadName(_)), "{name}: {err}");
        }
        assert_eq!(fs::read_dir(&home).unwrap().count(), 0, "nothing was created");
    }

    #[test]
    fn accepts_digits_and_inner_dashes() {
        let home = temp_home("good-name");
        assert_eq!(create_profile(&home, "team-2").unwrap().label, "team-2");
        assert_eq!(create_profile(&home, &"a".repeat(MAX_NAME_CHARS)).unwrap().label.len(), MAX_NAME_CHARS);
    }
}
