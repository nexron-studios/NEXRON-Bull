//! Deleting a session for good: its transcript, its folder next to it (subagent transcripts,
//! stored tool results) and its `/rewind` checkpoints, the same parts `transfer` copies. Only
//! inside a known profile's `projects` folder: the request comes over the wire, so neither the
//! session id nor a linked project folder may lead anywhere else.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Claude Code names sessions by UUID; anything else in an id is refused before it nears a path.
const MAX_SESSION_ID_CHARS: usize = 64;

#[derive(Debug, thiserror::Error)]
pub enum RemovalError {
    #[error("invalid session id {0:?}")]
    BadSessionId(String),
    #[error("{0} is not a Claude profile on this machine")]
    UnknownProfile(PathBuf),
    #[error("transcript of session {0} not found")]
    NotFound(String),
    #[error("transcript of session {0} lies outside its profile")]
    OutsideProfile(String),
    #[error(transparent)]
    Io(#[from] io::Error),
}

fn is_valid_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= MAX_SESSION_ID_CHARS
        && session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `profile` must be one of `known` (the profiles agentd lists), compared after resolving links.
pub fn delete_session(profile: &Path, known: &[PathBuf], session_id: &str) -> Result<(), RemovalError> {
    if !is_valid_session_id(session_id) {
        return Err(RemovalError::BadSessionId(session_id.to_string()));
    }
    let profile = fs::canonicalize(profile).map_err(|_| RemovalError::UnknownProfile(profile.to_path_buf()))?;
    if !known.iter().filter_map(|dir| fs::canonicalize(dir).ok()).any(|dir| dir == profile) {
        return Err(RemovalError::UnknownProfile(profile));
    }
    let projects = profile.join("projects");
    let transcript_name = format!("{session_id}.jsonl");
    let transcript = fs::read_dir(&projects)
        .map_err(|_| RemovalError::NotFound(session_id.to_string()))?
        .filter_map(Result::ok)
        .map(|project| project.path().join(&transcript_name))
        .find(|path| path.is_file())
        .ok_or_else(|| RemovalError::NotFound(session_id.to_string()))?;
    // A project folder that is a link to elsewhere resolves outside `projects`: leave it alone.
    let transcript = fs::canonicalize(transcript)?;
    let project = transcript.parent().ok_or_else(|| RemovalError::OutsideProfile(session_id.to_string()))?;
    if project.parent() != Some(projects.as_path()) {
        return Err(RemovalError::OutsideProfile(session_id.to_string()));
    }
    fs::remove_file(&transcript)?;
    remove_dir_if_present(&project.join(session_id))?;
    remove_dir_if_present(&profile.join("file-history").join(session_id))?;
    Ok(())
}

/// `remove_dir_all` does not follow links inside the folder, it removes the link itself.
fn remove_dir_if_present(dir: &Path) -> io::Result<()> {
    match fs::remove_dir_all(dir) {
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_profile(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-removal-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(dir.join("projects")).unwrap();
        dir
    }

    fn write_session(profile: &Path, id: &str) -> PathBuf {
        let project = profile.join("projects").join("C--work");
        fs::create_dir_all(project.join(id).join("subagents")).unwrap();
        fs::write(project.join(format!("{id}.jsonl")), "line").unwrap();
        fs::write(project.join(id).join("subagents").join("agent-a.jsonl"), "sub").unwrap();
        fs::create_dir_all(profile.join("file-history").join(id)).unwrap();
        fs::write(profile.join("file-history").join(id).join("v1"), "old").unwrap();
        project
    }

    #[test]
    fn deletes_transcript_subagents_and_checkpoints_only_of_that_session() {
        let profile = temp_profile("delete");
        let project = write_session(&profile, "s1");
        write_session(&profile, "s2");

        delete_session(&profile, &[profile.clone()], "s1").unwrap();

        assert!(!project.join("s1.jsonl").exists());
        assert!(!project.join("s1").exists());
        assert!(!profile.join("file-history").join("s1").exists());
        assert!(project.join("s2.jsonl").is_file(), "the other session stays");
        assert!(project.join("s2").join("subagents").join("agent-a.jsonl").is_file());
    }

    #[test]
    fn deletes_a_transcript_without_subagent_folder() {
        let profile = temp_profile("plain");
        let project = profile.join("projects").join("C--work");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("s1.jsonl"), "line").unwrap();

        delete_session(&profile, &[profile.clone()], "s1").unwrap();
        assert!(!project.join("s1.jsonl").exists());
    }

    #[test]
    fn refuses_ids_that_could_leave_the_projects_folder() {
        let profile = temp_profile("bad-id");
        for id in ["", "../s1", "..", "C:\\x", "a/b", "s1.jsonl", &"x".repeat(65)] {
            let err = delete_session(&profile, &[profile.clone()], id).unwrap_err();
            assert!(matches!(err, RemovalError::BadSessionId(_)), "{id}: {err}");
        }
    }

    #[test]
    fn refuses_a_folder_that_is_not_a_known_profile() {
        let (profile, other) = (temp_profile("known"), temp_profile("stranger"));
        write_session(&other, "s1");

        let err = delete_session(&other, &[profile], "s1").unwrap_err();
        assert!(matches!(err, RemovalError::UnknownProfile(_)), "{err}");
        assert!(other.join("projects").join("C--work").join("s1.jsonl").is_file());
    }

    #[test]
    fn reports_an_unknown_session() {
        let profile = temp_profile("missing");
        let err = delete_session(&profile, &[profile.clone()], "nope").unwrap_err();
        assert!(matches!(err, RemovalError::NotFound(_)), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn leaves_a_linked_project_folder_alone() {
        let (profile, elsewhere) = (temp_profile("linked"), temp_profile("elsewhere"));
        let target = write_session(&elsewhere, "s1");
        std::os::unix::fs::symlink(&target, profile.join("projects").join("C--linked")).unwrap();

        let err = delete_session(&profile, &[profile.clone()], "s1").unwrap_err();
        assert!(matches!(err, RemovalError::OutsideProfile(_)), "{err}");
        assert!(target.join("s1.jsonl").is_file());
    }
}
