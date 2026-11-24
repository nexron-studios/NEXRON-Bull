//! Chat titles from Haiku: after each message the user sends, a one-shot `claude -p` names the
//! chat by its current task. Claude Code titles only interactive sessions (`ai-title` in the
//! transcript), never headless ones like a tab's, so agentd asks itself and keeps the titles in
//! its own folder, by session id.

use std::collections::HashMap;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::claude;
use crate::paths::APP_FOLDER;

const TITLES_FILE: &str = "titles.json";
/// The newest titles kept; older sessions fall back to their first prompt.
const MAX_TITLES: usize = 1000;
const MAX_TITLE_CHARS: usize = 60;
/// Enough of a message to see its task; a pasted log would only cost tokens.
const MAX_REQUEST_CHARS: usize = 2000;
const MODEL: &str = "haiku";
/// Haiku answers in about two seconds; a hung call must not keep a thread forever.
const TIMEOUT: Duration = Duration::from_secs(30);
/// The call loads nothing of the user's setup: no settings (hooks, plugins), no MCP servers, no
/// tools, no skills, no transcript. CLAUDE.md is not read under a replaced system prompt either,
/// so a call costs about 700 tokens (measured 24.11.2026). Without settings an account that signs
/// in through `env` or `apiKeyHelper` there gets no title; Bull's accounts sign in with the
/// subscription, and loading settings would run the user's hooks on every message.
const LEAN_ARGS: [&str; 9] = [
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--tools",
    "",
    "--disable-slash-commands",
    "--output-format",
    "text",
];
/// Tuned on real requests (24.11.2026): without "new task" spelled out, Haiku kept the first
/// title for every later topic; without "same language" it answered English requests in German.
const SYSTEM_PROMPT: &str = "You title a chat after the task it works on right now, like the \
subject line of a ticket. Reply with the title only: 2 to 5 words, in the same language as the \
latest request, no quotes, no colon, no trailing period, no app or project name in front. Decide \
from the latest request: if it starts a new task, title the new task. If it only continues the \
current one (a confirmation like \"ja mach das\", a correction, a detail, a question about it), \
reply with the previous title unchanged.";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Entry {
    title: String,
    /// When the title was set (ms since epoch), to keep the newest `MAX_TITLES`.
    at_ms: u64,
}

/// The titles by session id, written to `~/.nexron-chat/titles.json` on every change.
#[derive(Default)]
pub struct TitleStore {
    /// `None` without a home folder: titles then live until agentd exits.
    path: Option<PathBuf>,
    titles: Mutex<HashMap<String, Entry>>,
}

impl TitleStore {
    pub fn load(home: Option<&Path>) -> Self {
        let path = home.map(|home| home.join(APP_FOLDER).join(TITLES_FILE));
        let titles = path.as_deref().map(read_titles).unwrap_or_default();
        Self { path, titles: Mutex::new(titles) }
    }

    pub fn get(&self, session_id: &str) -> Option<String> {
        self.titles().get(session_id).map(|entry| entry.title.clone())
    }

    pub fn set(&self, session_id: &str, title: &str, at_ms: u64) {
        let mut titles = self.titles();
        titles.insert(session_id.to_string(), Entry { title: title.to_string(), at_ms });
        prune(&mut titles);
        let Some(path) = &self.path else { return };
        if let Err(err) = write_titles(path, &titles) {
            eprintln!("agentd: titles not saved: {err}");
        }
    }

    fn titles(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        self.titles.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn read_titles(path: &Path) -> HashMap<String, Entry> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return HashMap::new(),
        Err(err) => {
            eprintln!("agentd: titles unreadable, starting without: {err}");
            return HashMap::new();
        }
    };
    serde_json::from_str(&text).unwrap_or_else(|err| {
        eprintln!("agentd: titles invalid, starting without: {err}");
        HashMap::new()
    })
}

/// Through a temporary file and a rename: agentd killed mid-write would otherwise leave a cut-off
/// file, and every title in it would be lost on the next start.
fn write_titles(path: &Path, titles: &HashMap<String, Entry>) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let partial = path.with_extension("json.partial");
    std::fs::write(&partial, serde_json::to_vec(titles)?)?;
    std::fs::rename(partial, path)
}

fn prune(titles: &mut HashMap<String, Entry>) {
    if titles.len() <= MAX_TITLES {
        return;
    }
    let mut ages: Vec<u64> = titles.values().map(|entry| entry.at_ms).collect();
    ages.sort_unstable_by(|a, b| b.cmp(a));
    let oldest_kept = ages[MAX_TITLES - 1];
    titles.retain(|_, entry| entry.at_ms >= oldest_kept);
}

/// The text of a message worth a title: none for a slash command or a message of images only.
pub fn request_text(content: &[Value]) -> Option<String> {
    let text = content
        .iter()
        .filter(|block| block["type"] == "text")
        .filter_map(|block| block["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let text = text.trim();
    if text.is_empty() || text.starts_with('/') {
        return None;
    }
    Some(text.chars().take(MAX_REQUEST_CHARS).collect())
}

pub fn prompt(previous: Option<&str>, request: &str) -> String {
    format!("Previous title: {}\n\nLatest request:\n{request}", previous.unwrap_or("(none)"))
}

/// The first line of Haiku's answer without quotes or a closing period; none if nothing is left.
pub fn clean(output: &str) -> Option<String> {
    const WRAPPERS: &[char] = &['"', '\'', '`', '*', '«', '»', '„', '“', '”'];
    let line = output.lines().map(str::trim).find(|line| !line.is_empty())?;
    let title = line.trim_matches(WRAPPERS).trim().trim_end_matches('.').trim();
    if title.is_empty() {
        return None;
    }
    Some(title.chars().take(MAX_TITLE_CHARS).collect())
}

/// Asks Haiku on the tab's account; `None` when Claude is missing, fails or takes too long.
pub fn generate(profile: Option<&Path>, previous: Option<&str>, request: &str) -> Option<String> {
    let program = claude::find_claude().ok()?;
    let mut command = Command::new(&program);
    command
        .args(["-p", "--model", MODEL])
        .args(LEAN_ARGS)
        .args(["--system-prompt", SYSTEM_PROMPT])
        .arg(prompt(previous, request))
        // Away from any project, so nothing of one is picked up.
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    claude::account_env(&mut command, &program, profile);
    let mut child = command.spawn().map_err(|err| eprintln!("agentd: title call failed: {err}")).ok()?;
    let output = read_with_timeout(&mut child)?;
    clean(&output)
}

/// Claude's answer once it closed its output; killed if that takes longer than `TIMEOUT`.
fn read_with_timeout(child: &mut Child) -> Option<String> {
    let mut stdout = child.stdout.take()?;
    let (send, receive) = mpsc::channel();
    thread::spawn(move || {
        let mut text = String::new();
        let _ = stdout.read_to_string(&mut text);
        let _ = send.send(text);
    });
    let Ok(text) = receive.recv_timeout(TIMEOUT) else {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("agentd: title call timed out");
        return None;
    };
    child.wait().ok()?.success().then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn takes_the_text_blocks_of_a_message() {
        let content = [json!({ "type": "text", "text": "Fix the" }), json!({ "type": "image" }), json!({ "type": "text", "text": "tab bar " })];

        assert_eq!(request_text(&content), Some("Fix the\ntab bar".to_string()));
    }

    #[test]
    fn skips_slash_commands_and_images_only() {
        assert_eq!(request_text(&[json!({ "type": "text", "text": "/compact" })]), None);
        assert_eq!(request_text(&[json!({ "type": "image" })]), None);
    }

    #[test]
    fn hands_the_previous_title_to_haiku() {
        assert_eq!(prompt(Some("Tab-Wechsel"), "ja mach das"), "Previous title: Tab-Wechsel\n\nLatest request:\nja mach das");
        assert_eq!(prompt(None, "hi"), "Previous title: (none)\n\nLatest request:\nhi");
    }

    #[test]
    fn cleans_quotes_periods_and_extra_lines() {
        assert_eq!(clean("\n\"Tab-Wechsel ohne Flackern.\"\nmore"), Some("Tab-Wechsel ohne Flackern".to_string()));
        assert_eq!(clean("„KI-Titel für Chats“"), Some("KI-Titel für Chats".to_string()));
        assert_eq!(clean("  \n \"\" "), None);
    }

    #[test]
    fn caps_a_long_title() {
        assert_eq!(clean(&"a".repeat(80)).map(|title| title.chars().count()), Some(MAX_TITLE_CHARS));
    }

    #[test]
    fn keeps_titles_across_a_restart() {
        let home = std::env::temp_dir().join(format!("agentd-titles-{}", std::process::id()));
        let store = TitleStore::load(Some(&home));

        store.set("s1", "Tab-Wechsel", 1);

        assert_eq!(TitleStore::load(Some(&home)).get("s1"), Some("Tab-Wechsel".to_string()));
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn keeps_only_the_newest_titles() {
        let mut titles: HashMap<String, Entry> =
            (0..=MAX_TITLES as u64).map(|at_ms| (format!("s{at_ms}"), Entry { title: "t".into(), at_ms })).collect();

        prune(&mut titles);

        assert_eq!(titles.len(), MAX_TITLES);
        assert!(!titles.contains_key("s0"));
    }
}
