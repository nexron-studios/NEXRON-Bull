//! Tokens used per day, model family and project, from the Claude transcripts of every profile
//! (`<profile>/projects/**/*.jsonl`, subagent files included), plus the tools Claude called and
//! the sessions that wrote on each day and project.
//!
//! Transcripts only grow, so each file is read once and afterwards only from where the last scan
//! stopped. A message is counted once even when it sits in several files: a moved or forked
//! session carries copies of earlier messages.

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};

use chrono::{DateTime, Local, NaiveDate};
use memchr::memmem;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::catalog::Profile;

const SECONDS_PER_DAY: u64 = 24 * 60 * 60;
/// A year of weeks, for the activity grid of the overview.
pub const MAX_DAYS: u32 = 371;
/// Only lines with both markers can carry usage; the rest (tool results, attachments, most of
/// the bytes) is skipped without parsing JSON.
const ASSISTANT_MARKER: &[u8] = b"\"type\":\"assistant\"";
const USAGE_MARKER: &[u8] = b"\"usage\"";
const SYNTHETIC_MODEL: &str = "<synthetic>";
/// How often a report also drops deleted transcripts and looks repositories up again (a folder
/// may have become a repo); doing it on every report would stat every file under the lock.
const SWEEP_INTERVAL: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Family {
    Opus,
    Sonnet,
    Haiku,
    Other,
}

impl Family {
    fn of(model: &str) -> Self {
        let model = model.to_ascii_lowercase();
        [("opus", Family::Opus), ("sonnet", Family::Sonnet), ("haiku", Family::Haiku)]
            .into_iter()
            .find_map(|(name, family)| model.contains(name).then_some(family))
            .unwrap_or(Family::Other)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tokens {
    #[serde(rename(deserialize = "input_tokens"), default)]
    pub input: u64,
    #[serde(rename(deserialize = "output_tokens"), default)]
    pub output: u64,
    #[serde(rename(deserialize = "cache_read_input_tokens"), default)]
    pub cache_read: u64,
    #[serde(rename(deserialize = "cache_creation_input_tokens"), default)]
    pub cache_write: u64,
}

impl Tokens {
    fn add(&mut self, other: &Tokens) {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Key {
    day: NaiveDate,
    family: Family,
    project: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ToolKey {
    day: NaiveDate,
    project: String,
    tool: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UsageRow {
    /// Local day on this machine, `YYYY-MM-DD`
    pub day: String,
    pub model: Family,
    /// The session's working folder
    pub project: String,
    #[serde(flatten)]
    pub tokens: Tokens,
}

/// Tool calls of one name on one day in one project.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolRow {
    pub day: String,
    pub project: String,
    pub tool: String,
    pub calls: u32,
}

/// How many sessions wrote to a project on one day.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SessionRow {
    pub day: String,
    pub project: String,
    pub sessions: u32,
}

#[derive(Debug, Default, PartialEq, Serialize)]
pub struct UsageReport {
    pub rows: Vec<UsageRow>,
    pub tools: Vec<ToolRow>,
    pub sessions: Vec<SessionRow>,
}

/// The fields of a transcript line this module reads.
#[derive(Deserialize)]
struct Line {
    #[serde(rename = "type")]
    kind: String,
    timestamp: Option<String>,
    cwd: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "isApiErrorMessage", default)]
    is_api_error: bool,
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    id: Option<String>,
    model: Option<String>,
    usage: Option<Tokens>,
    /// One content block per line; a `tool_use` block names the tool. Read loosely: a line whose
    /// content has an unexpected shape still counts its tokens.
    #[serde(default)]
    content: Value,
}

#[derive(Default)]
struct FileUsage {
    slot: u32,
    offset: u64,
    totals: HashMap<Key, Tokens>,
    tools: HashMap<ToolKey, u32>,
    /// Day and working folder → the sessions that wrote there
    sessions: HashMap<(NaiveDate, String), HashSet<String>>,
    /// The newest message: Claude Code writes one line per content block with the same id and a
    /// growing usage, so it is counted only once the next message starts (or at report time).
    pending: Option<(String, Key, Tokens)>,
}

impl FileUsage {
    fn commit_pending(&mut self) {
        if let Some((_, key, tokens)) = self.pending.take() {
            self.totals.entry(key).or_default().add(&tokens);
        }
    }
}

#[derive(Default)]
struct Index {
    files: HashMap<PathBuf, FileUsage>,
    /// Message id → slot of the file that counts it
    claims: HashMap<String, u32>,
    next_slot: u32,
    /// Working folder → its repository (`None`: none found); kept across reports
    roots: HashMap<String, Option<PathBuf>>,
    /// When deleted transcripts and stale repository lookups were last cleared
    swept_at: Option<Instant>,
}

#[derive(Default)]
pub struct UsageIndex(Mutex<Index>);

impl UsageIndex {
    /// Rows for the last `days` days including today. The first call reads every transcript
    /// written in that time; later calls only what was appended since.
    pub fn report(&self, profiles: &[Profile], days: u32) -> UsageReport {
        let days = days.clamp(1, MAX_DAYS);
        let today = Local::now().date_naive();
        let first_day = today - chrono::Days::new(u64::from(days - 1));
        // A file last written before the first day holds nothing newer; one day of slack for zones.
        let cutoff = SystemTime::now() - Duration::from_secs(u64::from(days + 1) * SECONDS_PER_DAY);
        let mut index = self.lock();
        let mut seen = Vec::new();
        for profile in profiles {
            for path in transcripts(&profile.dir.join("projects"), cutoff) {
                index.refresh(&path);
                seen.push(path);
            }
        }
        index.sweep_now_and_then();
        index.report_of(&seen, first_day)
    }

    fn lock(&self) -> MutexGuard<'_, Index> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Index {
    fn refresh(&mut self, path: &Path) {
        let Ok(len) = fs::metadata(path).map(|meta| meta.len()) else { return };
        if !self.files.contains_key(path) {
            let slot = self.next_slot;
            self.next_slot += 1;
            self.files.insert(path.to_path_buf(), FileUsage { slot, ..FileUsage::default() });
        }
        let Some(file) = self.files.get_mut(path) else { return };
        if len < file.offset {
            // Rewritten, not appended: read it again from the start.
            let slot = file.slot;
            *file = FileUsage { slot, ..FileUsage::default() };
            self.claims.retain(|_, owner| *owner != slot);
        }
        if len == file.offset {
            return;
        }
        let Some(appended) = read_from(path, file.offset) else { return };
        // A half-written last line stays until it is complete.
        let Some(end) = appended.iter().rposition(|&b| b == b'\n').map(|i| i + 1) else { return };
        file.offset += end as u64;
        let mut file = std::mem::take(file);
        let (assistant, usage) = (memmem::Finder::new(ASSISTANT_MARKER), memmem::Finder::new(USAGE_MARKER));
        for line in appended[..end].split(|&b| b == b'\n') {
            if assistant.find(line).is_some() && usage.find(line).is_some() {
                ingest(&mut file, &mut self.claims, line);
            }
        }
        self.files.insert(path.to_path_buf(), file);
    }

    fn sweep_now_and_then(&mut self) {
        if self.swept_at.is_some_and(|at| at.elapsed() < SWEEP_INTERVAL) {
            return;
        }
        self.swept_at = Some(Instant::now());
        // shortcut: messages a deleted file claimed stay claimed, so a copy elsewhere is not
        // counted until agentd restarts. Deleting transcripts is rare.
        self.files.retain(|path, _| path.is_file());
        self.roots.clear();
    }

    fn report_of(&mut self, paths: &[PathBuf], first_day: NaiveDate) -> UsageReport {
        let files: Vec<&FileUsage> = paths.iter().filter_map(|path| self.files.get(path)).collect();
        let keys = || {
            files.iter().flat_map(|file| {
                let pending = file.pending.as_ref().map(|(_, key, tokens)| (key, tokens));
                file.totals.iter().chain(pending).filter(|(key, _)| key.day >= first_day)
            })
        };
        let tool_keys = || files.iter().flat_map(|file| file.tools.iter()).filter(|(key, _)| key.day >= first_day);
        let session_keys =
            || files.iter().flat_map(|file| file.sessions.iter()).filter(|((day, _), _)| *day >= first_day);
        let cwds = keys()
            .map(|(key, _)| key.project.as_str())
            .chain(tool_keys().map(|(key, _)| key.project.as_str()))
            .chain(session_keys().map(|((_, cwd), _)| cwd.as_str()));
        let projects = repositories_of(&mut self.roots, cwds);
        let project_of = |cwd: &str| projects.get(cwd).map_or(cwd, String::as_str).to_string();

        let mut sums: HashMap<(NaiveDate, Family, String), Tokens> = HashMap::new();
        for (key, tokens) in keys() {
            sums.entry((key.day, key.family, project_of(&key.project))).or_default().add(tokens);
        }
        let mut rows: Vec<UsageRow> = sums
            .into_iter()
            .map(|((day, family, project), tokens)| UsageRow { day: day_text(day), model: family, project, tokens })
            .collect();
        rows.sort_by(|a, b| (&a.day, &a.project).cmp(&(&b.day, &b.project)));

        let mut calls: HashMap<(NaiveDate, String, &str), u32> = HashMap::new();
        for (key, count) in tool_keys() {
            *calls.entry((key.day, project_of(&key.project), key.tool.as_str())).or_default() += count;
        }
        let mut tools: Vec<ToolRow> = calls
            .into_iter()
            .map(|((day, project, tool), calls)| ToolRow { day: day_text(day), project, tool: tool.to_string(), calls })
            .collect();
        tools.sort_by(|a, b| (&a.day, &a.project, &a.tool).cmp(&(&b.day, &b.project, &b.tool)));

        // A session that worked in two folders of one repository counts once there.
        let mut ids: HashMap<(NaiveDate, String), HashSet<&str>> = HashMap::new();
        for ((day, cwd), sessions) in session_keys() {
            ids.entry((*day, project_of(cwd))).or_default().extend(sessions.iter().map(String::as_str));
        }
        let mut sessions: Vec<SessionRow> = ids
            .into_iter()
            .map(|((day, project), ids)| SessionRow { day: day_text(day), project, sessions: ids.len() as u32 })
            .collect();
        sessions.sort_by(|a, b| (&a.day, &a.project).cmp(&(&b.day, &b.project)));

        UsageReport { rows, tools, sessions }
    }
}

fn ingest(file: &mut FileUsage, claims: &mut HashMap<String, u32>, line: &[u8]) {
    let Ok(line) = serde_json::from_slice::<Line>(line) else { return };
    if line.kind != "assistant" || line.is_api_error {
        return;
    }
    let Some(Message { id: Some(id), model: Some(model), usage: Some(tokens), content }) = line.message else { return };
    if model == SYNTHETIC_MODEL {
        return;
    }
    let Some(day) = line.timestamp.as_deref().and_then(local_day) else { return };
    let is_pending = file.pending.as_ref().is_some_and(|(pending, _, _)| *pending == id);
    // Claimed by another file (a copy) or by an earlier message of this one.
    if !is_pending && claims.contains_key(&id) {
        return;
    }
    let project = line.cwd.unwrap_or_default();
    // Each line is one content block, so every line of a message adds its own tool call.
    for name in tool_names(&content) {
        *file.tools.entry(ToolKey { day, project: project.clone(), tool: name.to_string() }).or_default() += 1;
    }
    if let Some(session) = line.session_id {
        file.sessions.entry((day, project.clone())).or_default().insert(session);
    }
    if is_pending {
        if let Some(pending) = file.pending.as_mut() {
            pending.2 = tokens;
        }
        return;
    }
    claims.insert(id.clone(), file.slot);
    file.commit_pending();
    let key = Key { day, family: Family::of(&model), project };
    file.pending = Some((id, key, tokens));
}

fn tool_names(content: &Value) -> impl Iterator<Item = &str> {
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("tool_use"))
        .filter_map(|block| block.get("name").and_then(Value::as_str))
}

fn day_text(day: NaiveDate) -> String {
    day.format("%Y-%m-%d").to_string()
}

const WORKTREE_PARENT: &str = "worktrees";
const GIT_WORKTREE_MARKER: &str = "/.git/worktrees/";

/// Working folder → the repository it belongs to, so a subfolder or a git worktree counts toward
/// its repo. A worktree that was removed since is matched by name (`worktrees/<repo>-<topic>`)
/// against the repos found; anything else, and a line without folder (`""`), keeps its folder.
/// `roots` caches the file system lookups across reports.
fn repositories_of<'a>(
    roots: &mut HashMap<String, Option<PathBuf>>,
    cwds: impl Iterator<Item = &'a str>,
) -> HashMap<&'a str, String> {
    let mut found: HashMap<&str, Option<PathBuf>> = HashMap::new();
    for cwd in cwds {
        found.entry(cwd).or_insert_with(|| {
            roots.entry(cwd.to_string()).or_insert_with(|| repository_root(&native_path(cwd))).clone()
        });
    }
    let repos: Vec<(String, &PathBuf)> = found
        .values()
        .flatten()
        .filter_map(|root| Some((root.file_name()?.to_str()?.to_string(), root)))
        .collect();
    found
        .iter()
        .filter_map(|(cwd, root)| {
            let root = match root {
                Some(root) => root.clone(),
                None => removed_worktree_repo(&native_path(cwd), &repos)?.clone(),
            };
            Some((*cwd, root.to_string_lossy().into_owned()))
        })
        .collect()
}

/// The nearest folder with a `.git`; for a linked worktree, the main checkout it belongs to.
/// Only absolute folders: a relative or empty one would be looked up from agentd's own folder.
pub(crate) fn repository_root(cwd: &Path) -> Option<PathBuf> {
    if !cwd.is_absolute() {
        return None;
    }
    cwd.ancestors().find_map(|dir| {
        let git = dir.join(".git");
        if git.is_dir() {
            return Some(dir.to_path_buf());
        }
        // A worktree's `.git` is a file: `gitdir: <main>/.git/worktrees/<name>`, absolute or
        // relative to the worktree.
        let pointer = fs::read_to_string(&git).ok()?;
        let gitdir = normalized(&dir.join(pointer.trim().strip_prefix("gitdir:")?.trim()));
        let text = gitdir.to_string_lossy().replace('\\', "/");
        let main = text.split_once(GIT_WORKTREE_MARKER).map(|(main, _)| normalized(Path::new(main)));
        Some(main.unwrap_or_else(|| dir.to_path_buf()))
    })
}

/// Claude started from Git Bash records `/c/me/dev` instead of `C:\me\dev`; both are one folder.
pub(crate) fn native_path(cwd: &str) -> PathBuf {
    let bytes = cwd.as_bytes();
    let is_msys = cfg!(windows) && bytes.len() >= 3 && bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b'/';
    if !is_msys {
        return PathBuf::from(cwd);
    }
    PathBuf::from(format!(r"{}:\{}", (bytes[1] as char).to_ascii_uppercase(), cwd[3..].replace('/', r"\")))
}

/// `a/b/../c` → `a/c` without touching the disk: `canonicalize` adds a verbatim prefix on Windows
/// and fails for folders that are gone.
fn normalized(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

fn removed_worktree_repo<'r>(cwd: &Path, repos: &'r [(String, &PathBuf)]) -> Option<&'r PathBuf> {
    if !cwd.is_absolute() {
        return None;
    }
    let name = cwd
        .ancestors()
        .find(|dir| dir.parent().and_then(Path::file_name).is_some_and(|parent| parent == WORKTREE_PARENT))?
        .file_name()?
        .to_str()?;
    repos
        .iter()
        .filter(|(repo, _)| name == repo || name.strip_prefix(repo.as_str()).is_some_and(|rest| rest.starts_with('-')))
        .max_by_key(|(repo, _)| repo.len())
        .map(|(_, root)| *root)
}

fn local_day(timestamp: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(timestamp).ok().map(|at| at.with_timezone(&Local).date_naive())
}

fn read_from(path: &Path, offset: u64) -> Option<Vec<u8>> {
    let mut file = File::open(path).ok()?;
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

/// Every `.jsonl` below `dir` written since `cutoff`, subagent folders included.
fn transcripts(dir: &Path, cutoff: SystemTime) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_dir() {
                pending.push(path);
            } else if path.extension().is_some_and(|ext| ext == "jsonl")
                && entry.metadata().and_then(|meta| meta.modified()).is_ok_and(|modified| modified >= cutoff)
            {
                found.push(path);
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn temp_profile(name: &str) -> Profile {
        let dir = std::env::temp_dir().join(format!("agentd-usage-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir); // leftovers of an earlier run
        fs::create_dir_all(dir.join("projects/C--work")).unwrap();
        Profile { label: name.into(), dir, email: None }
    }

    fn assistant(id: &str, model: &str, output: u64) -> Value {
        let now = Local::now().to_rfc3339();
        json!({ "type": "assistant", "timestamp": now, "cwd": "C:\\work",
            "message": { "id": id, "model": model,
                "usage": { "input_tokens": 10, "output_tokens": output, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 5 } } })
    }

    fn write(path: &Path, lines: &[Value], append: bool) {
        let text: String = lines.iter().map(|line| format!("{line}\n")).collect();
        if append {
            use std::io::Write;
            fs::OpenOptions::new().append(true).open(path).unwrap().write_all(text.as_bytes()).unwrap();
        } else {
            fs::write(path, text).unwrap();
        }
    }

    fn totals(rows: &[UsageRow]) -> Vec<(Family, u64, u64)> {
        let mut out: Vec<_> = rows.iter().map(|row| (row.model, row.tokens.input, row.tokens.output)).collect();
        out.sort_by_key(|row| format!("{:?}", row.0));
        out
    }

    #[test]
    fn counts_each_message_once_with_its_newest_usage() {
        let profile = temp_profile("once");
        let path = profile.dir.join("projects/C--work/s1.jsonl");
        // Two content blocks of one message, then a second message on another model.
        write(&path, &[assistant("m1", "claude-opus-5-5", 3), assistant("m1", "claude-opus-5-5", 7), assistant("m2", "claude-haiku-4-5", 2)], false);

        let rows = UsageIndex::default().report(std::slice::from_ref(&profile), 7).rows;
        assert_eq!(totals(&rows), vec![(Family::Haiku, 10, 2), (Family::Opus, 10, 7)]);
        assert_eq!(rows[0].project, "C:\\work");
        assert_eq!(rows[0].day, Local::now().date_naive().format("%Y-%m-%d").to_string());
    }

    #[test]
    fn counts_tool_calls_and_sessions_per_day() {
        let profile = temp_profile("tools");
        let block = |id: &str, session: &str, content: Value| {
            let mut line = assistant(id, "claude-opus-5-5", 1);
            line["sessionId"] = json!(session);
            line["message"]["content"] = json!([content]);
            line
        };
        // One message with two tool calls (a line each), then a text answer in another session.
        write(
            &profile.dir.join("projects/C--work/s1.jsonl"),
            &[
                block("m1", "s-1", json!({ "type": "tool_use", "id": "t1", "name": "Bash", "input": {} })),
                block("m1", "s-1", json!({ "type": "tool_use", "id": "t2", "name": "Read", "input": {} })),
                block("m2", "s-2", json!({ "type": "text", "text": "fertig" })),
            ],
            false,
        );

        let report = UsageIndex::default().report(std::slice::from_ref(&profile), 7);
        let tools: Vec<_> = report.tools.iter().map(|row| (row.tool.as_str(), row.calls)).collect();
        assert_eq!(tools, vec![("Bash", 1), ("Read", 1)]);
        let sessions: Vec<_> = report.sessions.iter().map(|row| (row.project.as_str(), row.sessions)).collect();
        assert_eq!(sessions, vec![("C:\\work", 2)]);
    }

    #[test]
    fn reads_only_what_was_appended_and_skips_copies() {
        let profile = temp_profile("append");
        let path = profile.dir.join("projects/C--work/s1.jsonl");
        write(&path, &[assistant("m1", "claude-sonnet-5", 4)], false);
        let index = UsageIndex::default();
        assert_eq!(totals(&index.report(std::slice::from_ref(&profile), 7).rows), vec![(Family::Sonnet, 10, 4)]);

        write(&path, &[assistant("m2", "claude-sonnet-5", 6)], true);
        // A moved session repeats m1 in another file; it must not count twice.
        let copy = profile.dir.join("projects/C--work/s2.jsonl");
        write(&copy, &[assistant("m1", "claude-sonnet-5", 4), json!({ "type": "user", "message": {} })], false);

        assert_eq!(totals(&index.report(std::slice::from_ref(&profile), 7).rows), vec![(Family::Sonnet, 20, 10)]);
    }

    #[test]
    fn leaves_out_api_errors_and_synthetic_replies() {
        let profile = temp_profile("errors");
        let mut failed = assistant("m1", "claude-opus-5-5", 9);
        failed["isApiErrorMessage"] = json!(true);
        write(
            &profile.dir.join("projects/C--work/s1.jsonl"),
            &[failed, assistant("m2", SYNTHETIC_MODEL, 9)],
            false,
        );
        assert!(UsageIndex::default().report(std::slice::from_ref(&profile), 7).rows.is_empty());
    }

    #[test]
    fn counts_worktrees_and_subfolders_toward_their_repository() {
        let base = std::env::temp_dir().join(format!("agentd-usage-repos-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let repo = base.join("projects").join("bull");
        fs::create_dir_all(repo.join(".git").join("worktrees").join("bull-usage")).unwrap();
        fs::create_dir_all(repo.join("src")).unwrap();
        let worktree = base.join("worktrees").join("bull-usage");
        fs::create_dir_all(&worktree).unwrap();
        let gitdir = repo.join(".git").join("worktrees").join("bull-usage");
        fs::write(worktree.join(".git"), format!("gitdir: {}", gitdir.to_string_lossy().replace('\\', "/"))).unwrap();
        let removed = base.join("worktrees").join("bull-old-topic");
        let loose = base.join("notes");
        let cwds = [&repo.join("src"), &worktree, &removed, &loose].map(|p| p.to_string_lossy().into_owned());

        let projects = repositories_of(&mut HashMap::new(), cwds.iter().map(String::as_str));
        let root = |cwd: &String| projects.get(cwd.as_str()).map(|p| PathBuf::from(p).components().collect::<PathBuf>());
        let expected: PathBuf = repo.components().collect();
        assert_eq!([root(&cwds[0]), root(&cwds[1]), root(&cwds[2])], [Some(expected.clone()), Some(expected.clone()), Some(expected)]);
        assert_eq!(root(&cwds[3]), None);
    }

    #[test]
    fn follows_a_relative_gitdir_from_the_worktree() {
        let base = std::env::temp_dir().join(format!("agentd-usage-relative-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let repo = base.join("projects").join("bull");
        fs::create_dir_all(repo.join(".git").join("worktrees").join("bull-fix")).unwrap();
        let worktree = base.join("worktrees").join("bull-fix");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join(".git"), "gitdir: ../../projects/bull/.git/worktrees/bull-fix\n").unwrap();

        assert_eq!(repository_root(&worktree), Some(normalized(&repo)));
    }

    #[cfg(windows)]
    #[test]
    fn reads_git_bash_folders_as_windows_paths() {
        assert_eq!(native_path("/c/me/dev/app"), PathBuf::from(r"C:\me\dev\app"));
        assert_eq!(native_path(r"C:\me"), PathBuf::from(r"C:\me"));
    }

    #[test]
    fn leaves_empty_and_relative_folders_unresolved() {
        // agentd's own working folder is this repository; neither may resolve to it.
        let projects = repositories_of(&mut HashMap::new(), ["", "src"].into_iter());
        assert!(projects.is_empty());
    }

    #[test]
    fn sorts_models_into_families() {
        let families: Vec<_> =
            ["claude-opus-5-5[1m]", "claude-sonnet-4-5-20250929", "claude-haiku-4-5", "gpt-x"].map(Family::of).into();
        assert_eq!(families, vec![Family::Opus, Family::Sonnet, Family::Haiku, Family::Other]);
    }
}
