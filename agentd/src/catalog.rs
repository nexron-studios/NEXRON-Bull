//! What exists on this machine: Claude profiles (accounts) and recent sessions
//! to continue. Lives in agentd so a remote machine answers the same way.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::Value;

use crate::live;

/// Smaller transcripts were opened and left without a real exchange.
const MIN_TRANSCRIPT_BYTES: u64 = 4 * 1024;
/// Title and folder sit near the start; the newest title near the end.
const HEAD_BYTES: u64 = 64 * 1024;
const TAIL_BYTES: u64 = 64 * 1024;
const TITLE_FALLBACK_CHARS: usize = 80;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Profile {
    pub label: String,
    pub dir: PathBuf,
    pub email: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub profile: PathBuf,
    pub account: String,
    pub cwd: String,
    pub title: String,
    pub modified_ms: u64,
}

/// Every `~/.claude` and `~/.claude-<name>` folder that has transcripts.
pub fn profiles(home: &Path) -> Vec<Profile> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(home)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_profile_name(path) && path.join("projects").is_dir())
        .collect();
    dirs.sort();
    dirs.into_iter().map(|dir| profile(home, dir)).collect()
}

fn is_profile_name(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    name == ".claude" || name.starts_with(".claude-")
}

fn profile(home: &Path, dir: PathBuf) -> Profile {
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
    let label = name.strip_prefix(".claude-").map(str::to_string).unwrap_or_else(|| "default".into());
    // The default profile keeps its .claude.json next to the folder, the others inside it.
    let state = if name == ".claude" { home.join(".claude.json") } else { dir.join(".claude.json") };
    let email = fs::read_to_string(state)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|v| v["oauthAccount"]["emailAddress"].as_str().map(str::to_string));
    Profile { label, dir, email }
}

/// The newest sessions across all profiles, newest first.
/// Running sessions are left out: a second process on the same transcript loses messages.
pub fn recent_sessions(profiles: &[Profile], limit: usize) -> Vec<SessionSummary> {
    let running: HashSet<String> = profiles.iter().flat_map(|profile| live::running_session_ids(&profile.dir)).collect();
    let is_running = |path: &Path| path.file_stem().and_then(|s| s.to_str()).is_some_and(|id| running.contains(id));
    let mut files: Vec<(&Profile, PathBuf, u64)> = profiles
        .iter()
        .flat_map(|profile| transcripts(&profile.dir).into_iter().map(move |(path, ms)| (profile, path, ms)))
        .filter(|(_, path, _)| !is_running(path))
        .collect();
    files.sort_by_key(|file| std::cmp::Reverse(file.2));
    files.into_iter().take(limit).filter_map(|(profile, path, ms)| summary(profile, &path, ms)).collect()
}

fn transcripts(profile: &Path) -> Vec<(PathBuf, u64)> {
    fs::read_dir(profile.join("projects"))
        .into_iter()
        .flatten()
        .flatten()
        .flat_map(|project| fs::read_dir(project.path()).into_iter().flatten().flatten())
        .filter(|file| file.path().extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|file| {
            let meta = file.metadata().ok()?;
            if meta.len() < MIN_TRANSCRIPT_BYTES {
                return None;
            }
            let ms = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
            Some((file.path(), ms))
        })
        .collect()
}

fn summary(profile: &Profile, path: &Path, modified_ms: u64) -> Option<SessionSummary> {
    let session_id = path.file_stem()?.to_str()?.to_string();
    let (head, tail) = head_and_tail(path)?;
    let lines = || head.lines().chain(tail.lines()).filter_map(|line| serde_json::from_str::<Value>(line).ok());
    let cwd = lines().find_map(|v| v["cwd"].as_str().map(str::to_string))?;
    let title = lines()
        .filter_map(|v| v["aiTitle"].as_str().map(str::to_string))
        .next_back()
        .or_else(|| lines().find_map(|v| first_prompt(&v)))
        .unwrap_or_default();
    Some(SessionSummary { session_id, profile: profile.dir.clone(), account: profile.label.clone(), cwd, title, modified_ms })
}

fn first_prompt(line: &Value) -> Option<String> {
    let message = crate::chat::message_from(line)?;
    let text = message.blocks.iter().find_map(|block| match block {
        crate::chat::Block::Text { text } if message.role == crate::chat::Role::User => Some(text.clone()),
        _ => None,
    })?;
    Some(text.chars().take(TITLE_FALLBACK_CHARS).collect())
}

/// Start and end of a transcript that can be tens of megabytes; partial lines
/// at the cut fail to parse and are skipped.
fn head_and_tail(path: &Path) -> Option<(String, String)> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let mut head = Vec::new();
    (&mut file).take(HEAD_BYTES).read_to_end(&mut head).ok()?;
    let mut tail = Vec::new();
    if len > HEAD_BYTES {
        file.seek(SeekFrom::Start(len.saturating_sub(TAIL_BYTES).max(HEAD_BYTES))).ok()?;
        file.read_to_end(&mut tail).ok()?;
    }
    Some((String::from_utf8_lossy(&head).into_owned(), String::from_utf8_lossy(&tail).into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-catalog-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_session(profile: &Path, id: &str, lines: &[Value]) {
        let project = profile.join("projects").join("C--work");
        fs::create_dir_all(&project).unwrap();
        let padding = json!({ "type": "attachment", "pad": "x".repeat(MIN_TRANSCRIPT_BYTES as usize) });
        let text: Vec<String> = lines.iter().chain([&padding]).map(Value::to_string).collect();
        fs::write(project.join(format!("{id}.jsonl")), text.join("\n")).unwrap();
    }

    #[test]
    fn finds_profiles_with_labels_and_emails() {
        let home = temp_home("profiles");
        for name in [".claude", ".claude-work", ".claude-empty", ".config"] {
            fs::create_dir_all(home.join(name)).unwrap();
        }
        fs::create_dir_all(home.join(".claude/projects")).unwrap();
        fs::create_dir_all(home.join(".claude-work/projects")).unwrap();
        fs::write(home.join(".claude-work/.claude.json"), r#"{"oauthAccount":{"emailAddress":"a@b.c"}}"#).unwrap();

        let found = profiles(&home);
        let labels: Vec<_> = found.iter().map(|p| (p.label.as_str(), p.email.as_deref())).collect();
        assert_eq!(labels, vec![("default", None), ("work", Some("a@b.c"))]);
    }

    #[test]
    fn summarises_sessions_with_title_or_first_prompt() {
        let home = temp_home("sessions");
        let profile = Profile { label: "work".into(), dir: home.join(".claude-work"), email: None };
        let user = |text: &str| json!({ "type": "user", "uuid": "u1", "cwd": "C:\\work",
            "message": { "role": "user", "content": text } });
        write_session(&profile.dir, "titled", &[user("Hallo"), json!({ "type": "ai-title", "aiTitle": "Login-Bug" })]);
        write_session(&profile.dir, "untitled", &[user("Bitte baue den Export")]);

        let mut sessions = recent_sessions(std::slice::from_ref(&profile), 10);
        sessions.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        let rows: Vec<_> = sessions.iter().map(|s| (s.session_id.as_str(), s.title.as_str(), s.cwd.as_str())).collect();
        assert_eq!(rows, vec![("titled", "Login-Bug", "C:\\work"), ("untitled", "Bitte baue den Export", "C:\\work")]);
    }
}
