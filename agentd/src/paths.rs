//! Where Claude keeps its profiles and transcripts on this machine.

use std::io;
use std::path::PathBuf;

use crate::daemon::DaemonError;

/// The profile folder, `~/.claude` when none is given.
pub fn profile_dir(profile: Option<PathBuf>) -> Result<PathBuf, DaemonError> {
    match profile {
        Some(profile) => Ok(profile),
        None => Ok(home().ok_or(DaemonError::NoHome)?.join(".claude")),
    }
}

/// `<profile>/projects/<cwd-slug>/<session-id>.jsonl`; the slug is not needed
/// because the session id is unique across projects. `None` while Claude has not written
/// it: a session gets its transcript with its first message, a tab that never sent one has none.
pub fn find_transcript(profile: Option<PathBuf>, session_id: &str) -> Result<Option<PathBuf>, DaemonError> {
    let projects = profile_dir(profile)?.join("projects");
    let file_name = format!("{session_id}.jsonl");
    let entries = match std::fs::read_dir(projects) {
        Ok(entries) => entries,
        // A profile that never ran a session has no projects folder yet.
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    Ok(entries.filter_map(Result::ok).map(|project| project.path().join(&file_name)).find(|path| path.is_file()))
}

/// agentd's own folder in the home folder, on every machine.
pub const APP_FOLDER: &str = ".nexron-chat";

pub fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_profile(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-paths-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_the_transcript_in_any_project_folder() {
        let profile = temp_profile("found");
        let project = profile.join("projects").join("C--work");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("s1.jsonl"), "").unwrap();
        assert_eq!(find_transcript(Some(profile), "s1").unwrap(), Some(project.join("s1.jsonl")));
    }

    #[test]
    fn a_profile_without_sessions_has_no_transcript() {
        assert_eq!(find_transcript(Some(temp_profile("empty")), "s1").unwrap(), None);
    }

    #[test]
    fn an_unreadable_profile_stays_an_error() {
        let profile = temp_profile("broken");
        std::fs::write(profile.join("projects"), "not a folder").unwrap();
        assert!(find_transcript(Some(profile), "s1").is_err());
    }
}
