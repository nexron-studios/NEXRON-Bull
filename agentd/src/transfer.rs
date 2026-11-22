//! Moving a session to another account (profile), like `claude-takealong`, but complete:
//! besides the transcript it takes subagent transcripts, stored tool results and the
//! `/rewind` checkpoints. The source copy stays, as with takealong.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Copies everything of `session_id` from one profile folder into another, keeping the
/// project folder name (`projects/<cwd-slug>/`), so `claude --resume` finds it there.
pub fn copy_session(from: &Path, to: &Path, session_id: &str) -> io::Result<()> {
    let transcript_name = format!("{session_id}.jsonl");
    let project = fs::read_dir(from.join("projects"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|dir| dir.join(&transcript_name).is_file())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("transcript of {session_id}")))?;
    let slug = project.file_name().ok_or_else(|| io::Error::other("project folder without name"))?;
    let target_project = to.join("projects").join(slug);
    fs::create_dir_all(&target_project)?;
    copy_keeping_time(&project.join(&transcript_name), &target_project.join(&transcript_name))?;
    copy_dir_if_present(&project.join(session_id), &target_project.join(session_id))?;
    copy_dir_if_present(&from.join("file-history").join(session_id), &to.join("file-history").join(session_id))
}

/// The app takes a transcript's last change as the time its chat finished, so the copy keeps it.
fn copy_keeping_time(from: &Path, to: &Path) -> io::Result<()> {
    fs::copy(from, to)?;
    let modified = fs::metadata(from)?.modified()?;
    fs::File::options().write(true).open(to)?.set_modified(modified)
}

fn copy_dir_if_present(from: &Path, to: &Path) -> io::Result<()> {
    if !from.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target: PathBuf = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_if_present(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-transfer-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_transcript_subagents_and_checkpoints() {
        let (from, to) = (temp("from"), temp("to"));
        let project = from.join("projects").join("C--work");
        fs::create_dir_all(project.join("s1").join("subagents")).unwrap();
        fs::write(project.join("s1.jsonl"), "line").unwrap();
        fs::write(project.join("s1").join("subagents").join("a.jsonl"), "sub").unwrap();
        fs::create_dir_all(from.join("file-history").join("s1")).unwrap();
        fs::write(from.join("file-history").join("s1").join("v1"), "old").unwrap();

        copy_session(&from, &to, "s1").unwrap();

        let target = to.join("projects").join("C--work");
        assert_eq!(fs::read_to_string(target.join("s1.jsonl")).unwrap(), "line");
        assert_eq!(fs::read_to_string(target.join("s1").join("subagents").join("a.jsonl")).unwrap(), "sub");
        assert_eq!(fs::read_to_string(to.join("file-history").join("s1").join("v1")).unwrap(), "old");
        assert!(project.join("s1.jsonl").is_file(), "the source copy stays");
    }

    #[test]
    fn keeps_the_time_the_transcript_last_changed() {
        let (from, to) = (temp("from-time"), temp("to-time"));
        let project = from.join("projects").join("C--work");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("s2.jsonl"), "line").unwrap();
        let yesterday = std::time::SystemTime::now() - std::time::Duration::from_secs(24 * 60 * 60);
        fs::File::options().write(true).open(project.join("s2.jsonl")).unwrap().set_modified(yesterday).unwrap();

        copy_session(&from, &to, "s2").unwrap();

        let copied = fs::metadata(to.join("projects").join("C--work").join("s2.jsonl")).unwrap();
        assert_eq!(copied.modified().unwrap(), yesterday);
    }

    #[test]
    fn fails_for_an_unknown_session() {
        let (from, to) = (temp("from-missing"), temp("to-missing"));
        fs::create_dir_all(from.join("projects")).unwrap();
        assert_eq!(copy_session(&from, &to, "nope").unwrap_err().kind(), io::ErrorKind::NotFound);
    }
}
