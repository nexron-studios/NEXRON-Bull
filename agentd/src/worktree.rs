//! One git worktree per chat, as the user works by hand: each chat gets its own branch in its own
//! folder beside the projects, branched from the freshly fetched integration branch. The main
//! checkout sits on a local `preview` branch (integration branch plus every open chat branch) that
//! the dev server runs from; a chat's branch is merged in there on request. Here and not in the
//! app, because a chat on another machine has its repository there.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use serde::Serialize;

use crate::claude::hide_console;
use crate::usage::native_path;

/// The never-pushed branch in the main checkout that collects every open chat branch.
pub const PREVIEW: &str = "preview";
/// Where a chat branch starts, the first one that exists: projects with a `dev` branch merge
/// there, the others straight into `main`.
const INTEGRATION_CANDIDATES: [&str; 4] = ["origin/dev", "origin/main", "dev", "main"];
const BRANCH_PREFIX: &str = "feat/";
/// The folder beside the parent folder of the repository: `dev/projects/x` → `dev/worktrees`.
const WORKTREES_DIR: &str = "worktrees";
/// A slug of a few words reads as a topic; a whole prompt would make an unusable folder name.
const MAX_SLUG_CHARS: usize = 40;
const MAX_SLUG_WORDS: usize = 5;
/// `feat/x-2` … before giving up on a name that is taken again and again.
const MAX_NAME_TRIES: usize = 99;
/// Another session merging into `preview` holds `index.lock` for a moment.
const LOCK_TRIES: usize = 5;
const LOCK_WAIT: Duration = Duration::from_secs(2);
const SHORT_ID_CHARS: usize = 6;
/// Filler of a first prompt ("kannst du bitte …", "please add a …") that says nothing about the topic.
const FILLER_WORDS: [&str; 34] = [
    "a", "an", "and", "the", "to", "of", "for", "in", "on", "please", "can", "you", "could", "i", "we",
    "kannst", "du", "bitte", "mal", "ich", "wir", "der", "die", "das", "den", "dem", "ein", "eine", "einen",
    "und", "mit", "im", "zu", "um",
];

#[derive(Debug, thiserror::Error)]
pub enum WorktreeError {
    #[error("folder {0} not found")]
    NoFolder(String),
    #[error("{0} is not in a git repository")]
    NoRepository(String),
    #[error("{0} is the main checkout, not a worktree")]
    NotAWorktree(String),
    #[error("no integration branch (origin/dev, origin/main, dev or main) in {0}")]
    NoIntegration(String),
    #[error("{0} has no branch checked out")]
    Detached(String),
    #[error("no free branch name for {0}")]
    NoFreeName(String),
    #[error("git {command} failed: {message}")]
    Git { command: String, message: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CreatedWorktree {
    pub path: String,
    pub branch: String,
    /// The integration branch it started from, e.g. `origin/main`.
    pub base: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MergeOutcome {
    Merged { commits: u32 },
    /// `preview` already has every commit of the branch.
    UpToDate,
    /// Merge aborted; `branches` are the other chat branches in `preview` that touched `files`.
    Conflict { files: Vec<String>, branches: Vec<String> },
    /// Nothing merged: `preview` exists, but the main checkout is on `branch`.
    MainElsewhere { branch: String },
    /// Nothing merged: `preview` is missing, and the main checkout has uncommitted changes to
    /// switch away from.
    MainDirty,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PreviewMerge {
    pub branch: String,
    pub outcome: MergeOutcome,
    /// `preview` did not exist and was made from the integration branch first.
    pub created_preview: bool,
    /// Changes not committed yet; a merge takes only commits.
    pub has_uncommitted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RemoveOutcome {
    Removed { branch: String },
    /// Nothing was removed: these files are changed or new.
    Uncommitted { files: Vec<String> },
    /// Nothing was removed: the branch has work the integration branch does not have yet.
    Unmerged { commits: u32, integration: String },
    /// Nothing was removed: a chat's Claude still runs in the folder.
    InUse,
}

/// A new worktree for the repository `cwd` is in, its branch named after `hint` (the chat's first
/// prompt). `root` replaces the folder the worktrees go into.
pub fn create(cwd: &str, hint: &str, root: Option<&str>) -> Result<CreatedWorktree, WorktreeError> {
    let folder = existing_folder(cwd)?;
    let main = main_checkout_of(&folder)?;
    // A chat opened on `app/src` works in `app-x/src`: the same place in its own checkout.
    let prefix = git(&folder, &["rev-parse", "--show-prefix"]).unwrap_or_default();
    fetch(&main);
    let base = integration_of(&main)?;
    let root = match root.map(str::trim).filter(|root| !root.is_empty()) {
        Some(root) => native_path(root),
        None => default_root(&main),
    };
    let repo = main.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let (branch, path) = free_name(&main, &root, &repo, &slug_of(hint))?;
    fs::create_dir_all(&root)?;
    let path_text = path.to_string_lossy().into_owned();
    // No upstream: a `git push` from the chat must never land on the integration branch.
    git(&main, &["worktree", "add", "--no-track", "-b", &branch, &path_text, &base])?;
    let inside = path.join(path_from_git(prefix.trim_end_matches('/')));
    // A subfolder the integration branch does not have yet leaves the chat at the top.
    let chat_folder = if prefix.is_empty() || !inside.is_dir() { path } else { inside };
    Ok(CreatedWorktree { path: chat_folder.to_string_lossy().into_owned(), branch, base })
}

/// Merges the worktree's branch into `preview` in the main checkout, creating `preview` there
/// first when it is missing and the checkout is clean. A conflict is aborted, never left behind.
pub fn merge_into_preview(worktree: &str) -> Result<PreviewMerge, WorktreeError> {
    let (worktree, main, branch) = linked_worktree(worktree)?;
    let has_uncommitted = !changed_files(&worktree)?.is_empty();
    let created_preview = match ensure_preview(&main)? {
        Preview::Ready { created } => created,
        Preview::Elsewhere(current) => {
            let outcome = MergeOutcome::MainElsewhere { branch: current };
            return Ok(PreviewMerge { branch, outcome, created_preview: false, has_uncommitted });
        }
        Preview::Dirty => {
            return Ok(PreviewMerge { branch, outcome: MergeOutcome::MainDirty, created_preview: false, has_uncommitted });
        }
    };
    let commits = count(&main, &format!("{PREVIEW}..{branch}"))?;
    if commits == 0 {
        return Ok(PreviewMerge { branch, outcome: MergeOutcome::UpToDate, created_preview, has_uncommitted });
    }
    let outcome = match git(&main, &["merge", "--no-edit", &branch]) {
        Ok(_) => MergeOutcome::Merged { commits },
        Err(err) => {
            let files = lines(&git(&main, &["diff", "--name-only", "--diff-filter=U"])?);
            if files.is_empty() {
                return Err(err);
            }
            let branches = clashing_branches(&main, &branch, &files);
            git(&main, &["merge", "--abort"])?;
            MergeOutcome::Conflict { files, branches }
        }
    };
    Ok(PreviewMerge { branch, outcome, created_preview, has_uncommitted })
}

/// Removes the worktree and its branch, but only once nothing in it can be lost: no uncommitted
/// change, no commit the integration branch lacks (a squash-merged branch counts as merged) and
/// no Claude running anywhere in it (`is_in_use`, asked with the worktree's top folder).
pub fn remove(worktree: &str, is_in_use: impl Fn(&Path) -> bool) -> Result<RemoveOutcome, WorktreeError> {
    let (worktree, main, branch) = linked_worktree(worktree)?;
    // git would remove the folder under a running Claude.
    if is_in_use(&worktree) {
        return Ok(RemoveOutcome::InUse);
    }
    let files = changed_files(&worktree)?;
    if !files.is_empty() {
        return Ok(RemoveOutcome::Uncommitted { files });
    }
    fetch(&main);
    let integration = integration_of(&main)?;
    let commits = count(&main, &format!("{integration}..{branch}"))?;
    if commits > 0 && !is_content_merged(&main, &integration, &branch) {
        return Ok(RemoveOutcome::Unmerged { commits, integration });
    }
    remove_junctions(&worktree)?;
    git(&main, &["worktree", "remove", &worktree.to_string_lossy()])?;
    // A file a process still held stays behind as a bare folder git no longer knows.
    if worktree.exists() {
        fs::remove_dir_all(&worktree)?;
        git(&main, &["worktree", "prune"])?;
    }
    git(&main, &["branch", "-D", &branch])?;
    Ok(RemoveOutcome::Removed { branch })
}

/// `cwd` is the folder of a worktree or inside one; the same folder written either way.
pub fn is_inside(cwd: &Path, worktree: &str) -> bool {
    let key = |path: &Path| {
        let text = path.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_string();
        if cfg!(windows) { text.to_lowercase() } else { text }
    };
    let (cwd, worktree) = (key(cwd), key(&native_path(worktree)));
    cwd == worktree || cwd.starts_with(&format!("{worktree}/"))
}

/// A branch name from the first words that carry meaning: `feat/kalender-wochenansicht`. Without
/// any (a prompt of only images or symbols) a short random id stands in.
pub fn slug_of(hint: &str) -> String {
    let folded: String = hint
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'ä' => "ae".to_string(),
            'ö' => "oe".to_string(),
            'ü' => "ue".to_string(),
            'ß' => "ss".to_string(),
            c if c.is_ascii_alphanumeric() => c.to_string(),
            _ => " ".to_string(),
        })
        .collect();
    let mut slug = String::new();
    for word in folded.split_whitespace().filter(|word| !FILLER_WORDS.contains(word)).take(MAX_SLUG_WORDS) {
        if !slug.is_empty() && slug.len() + 1 + word.len() > MAX_SLUG_CHARS {
            break;
        }
        if !slug.is_empty() {
            slug.push('-');
        }
        slug.push_str(word);
    }
    slug.truncate(MAX_SLUG_CHARS);
    if slug.is_empty() {
        let id = uuid::Uuid::new_v4().simple().to_string();
        return format!("chat-{}", &id[..SHORT_ID_CHARS]);
    }
    slug
}

fn existing_folder(cwd: &str) -> Result<PathBuf, WorktreeError> {
    let folder = native_path(cwd);
    // A relative folder would be looked up from agentd's own folder.
    if !folder.is_absolute() || !folder.is_dir() {
        return Err(WorktreeError::NoFolder(cwd.to_string()));
    }
    Ok(folder)
}

/// The folder whose `.git` holds the repository: for a linked worktree, the one it came from.
fn main_checkout_of(folder: &Path) -> Result<PathBuf, WorktreeError> {
    let common = git(folder, &["rev-parse", "--path-format=absolute", "--git-common-dir"])
        .map_err(|_| WorktreeError::NoRepository(folder.to_string_lossy().into_owned()))?;
    let common = path_from_git(&common);
    match common.file_name() {
        Some(name) if name == ".git" => Ok(common.parent().map(Path::to_path_buf).unwrap_or(common)),
        // A bare repository has no checkout to hold `preview`.
        _ => Err(WorktreeError::NoRepository(folder.to_string_lossy().into_owned())),
    }
}

/// The worktree's top folder, its main checkout and its branch; refuses the main checkout itself.
fn linked_worktree(worktree: &str) -> Result<(PathBuf, PathBuf, String), WorktreeError> {
    let folder = existing_folder(worktree)?;
    let main = main_checkout_of(&folder)?;
    let top = path_from_git(&git(&folder, &["rev-parse", "--show-toplevel"])?);
    // Equal both ways: a worktree may well live inside the main checkout (`.claude/worktrees/x`).
    if is_inside(&top, &main.to_string_lossy()) && is_inside(&main, &top.to_string_lossy()) {
        return Err(WorktreeError::NotAWorktree(worktree.to_string()));
    }
    let branch = git(&top, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map_err(|_| WorktreeError::Detached(worktree.to_string()))?;
    Ok((top, main, branch))
}

fn default_root(main: &Path) -> PathBuf {
    let projects = main.parent().unwrap_or(main);
    projects.parent().unwrap_or(projects).join(WORKTREES_DIR)
}

fn free_name(main: &Path, root: &Path, repo: &str, slug: &str) -> Result<(String, PathBuf), WorktreeError> {
    for attempt in 1..=MAX_NAME_TRIES {
        let name = if attempt == 1 { slug.to_string() } else { format!("{slug}-{attempt}") };
        let branch = format!("{BRANCH_PREFIX}{name}");
        let path = root.join(format!("{repo}-{name}"));
        if !path.exists() && !exists(main, &format!("refs/heads/{branch}")) {
            return Ok((branch, path));
        }
    }
    Err(WorktreeError::NoFreeName(slug.to_string()))
}

/// Without a network the chat still starts, from what the last fetch brought.
fn fetch(main: &Path) {
    let has_origin = git(main, &["remote"]).is_ok_and(|remotes| lines(&remotes).iter().any(|r| r == "origin"));
    if !has_origin {
        return;
    }
    if let Err(err) = git(main, &["fetch", "--quiet", "origin"]) {
        eprintln!("agentd: worktree goes on without a fresh fetch: {err}");
    }
}

fn integration_of(main: &Path) -> Result<String, WorktreeError> {
    INTEGRATION_CANDIDATES
        .iter()
        .find(|candidate| exists(main, &format!("{candidate}^{{commit}}")))
        .map(|candidate| candidate.to_string())
        .ok_or_else(|| WorktreeError::NoIntegration(main.to_string_lossy().into_owned()))
}

enum Preview {
    Ready { created: bool },
    /// `preview` exists, but the main checkout is on this other branch: switching it is the user's call.
    Elsewhere(String),
    /// `preview` is missing and switching to it would carry uncommitted changes along.
    Dirty,
}

/// Puts the main checkout on `preview`, creating it from the integration branch when missing.
fn ensure_preview(main: &Path) -> Result<Preview, WorktreeError> {
    // A detached main checkout shows as its short commit id.
    let current = git(main, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .or_else(|_| git(main, &["rev-parse", "--short", "HEAD"]))?;
    if current == PREVIEW {
        return Ok(Preview::Ready { created: false });
    }
    if exists(main, &format!("refs/heads/{PREVIEW}")) {
        return Ok(Preview::Elsewhere(current));
    }
    if !changed_files(main)?.is_empty() {
        return Ok(Preview::Dirty);
    }
    let base = integration_of(main)?;
    git(main, &["switch", "--no-track", "-c", PREVIEW, &base])?;
    Ok(Preview::Ready { created: true })
}

/// The other chat branches whose latest change to a conflicting file is already in `preview`.
fn clashing_branches(main: &Path, branch: &str, files: &[String]) -> Vec<String> {
    let Ok(integration) = integration_of(main) else { return Vec::new() };
    let mut branches = Vec::new();
    for file in files {
        let range = format!("{integration}..HEAD");
        let Ok(commit) = git(main, &["log", "-1", "--no-merges", "--format=%H", &range, "--", file]) else {
            continue;
        };
        if commit.is_empty() {
            continue;
        }
        let contains = git(main, &["branch", "--format=%(refname:short)", "--contains", &commit]).unwrap_or_default();
        for name in lines(&contains) {
            if name != PREVIEW && name != branch && !branches.contains(&name) {
                branches.push(name);
            }
        }
    }
    branches
}

/// Merging the branch into the integration branch would change nothing: a squash merge took it in.
fn is_content_merged(main: &Path, integration: &str, branch: &str) -> bool {
    let merged = git(main, &["merge-tree", "--write-tree", integration, branch]);
    let target = git(main, &["rev-parse", &format!("{integration}^{{tree}}")]);
    match (merged, target) {
        (Ok(merged), Ok(target)) => merged.lines().next() == Some(target.as_str()),
        _ => false,
    }
}

/// `git worktree remove` follows a junction (a linked `node_modules`) and empties its target in the
/// main checkout. Removed first, they go as links only.
#[cfg(windows)]
fn remove_junctions(folder: &Path) -> Result<(), WorktreeError> {
    use std::os::windows::fs::FileTypeExt;
    let mut stack = vec![folder.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_symlink_dir() {
                fs::remove_dir(entry.path())?;
            } else if kind.is_dir() && entry.file_name() != ".git" {
                stack.push(entry.path());
            }
        }
    }
    Ok(())
}

/// Outside Windows git deletes a symlink, never what it points to.
#[cfg(not(windows))]
fn remove_junctions(_folder: &Path) -> Result<(), WorktreeError> {
    Ok(())
}

fn changed_files(folder: &Path) -> Result<Vec<String>, WorktreeError> {
    let status = git(folder, &["status", "--porcelain", "--untracked-files=normal"])?;
    Ok(lines(&status).into_iter().map(|line| line.get(3..).unwrap_or(&line).to_string()).collect())
}

fn count(main: &Path, range: &str) -> Result<u32, WorktreeError> {
    let text = git(main, &["rev-list", "--count", range])?;
    Ok(text.parse().unwrap_or(0))
}

fn exists(main: &Path, reference: &str) -> bool {
    git(main, &["rev-parse", "--verify", "--quiet", reference]).is_ok()
}

fn lines(text: &str) -> Vec<String> {
    text.lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_string).collect()
}

/// Git prints `C:/x/y` on Windows; the app shows and compares folders with backslashes.
fn path_from_git(text: &str) -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(text.replace('/', "\\"))
    } else {
        PathBuf::from(text)
    }
}

/// Trimmed stdout. Waits and tries again while another git holds the index lock.
fn git(dir: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    let mut tries = 0;
    loop {
        tries += 1;
        let mut command = Command::new("git");
        command
            .args(["-c", "core.quotepath=off"])
            .args(args)
            .current_dir(dir)
            // A fetch that wants a password fails instead of waiting for a prompt nobody sees.
            .env("GIT_TERMINAL_PROMPT", "0")
            .stdin(Stdio::null());
        hide_console(&mut command);
        let output = command.output()?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("index.lock") && tries < LOCK_TRIES {
            thread::sleep(LOCK_WAIT);
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(WorktreeError::Git { command: args.first().copied().unwrap_or_default().to_string(), message });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_keep_the_words_that_carry_the_topic() {
        assert_eq!(slug_of("Kannst du bitte den Kalender um eine Wochenansicht erweitern?"), "kalender-wochenansicht-erweitern");
        assert_eq!(slug_of("Fix the login: Größe & Ölfarbe"), "fix-login-groesse-oelfarbe");
    }

    #[test]
    fn a_slug_stays_short() {
        let slug = slug_of("one two three four five six seven eight");
        assert_eq!(slug, "one-two-three-four-five");
        assert!(slug_of(&"x".repeat(80)).len() <= MAX_SLUG_CHARS);
    }

    #[test]
    fn a_prompt_without_words_gets_a_short_id() {
        let slug = slug_of("🙂 ?!");
        assert!(slug.starts_with("chat-") && slug.len() == "chat-".len() + SHORT_ID_CHARS, "{slug}");
    }

    #[test]
    fn a_folder_inside_the_worktree_counts_as_in_it() {
        let worktree = if cfg!(windows) { r"C:\dev\worktrees\app-x" } else { "/dev/worktrees/app-x" };
        let inside = if cfg!(windows) { r"c:\dev\worktrees\app-x\src" } else { "/dev/worktrees/app-x/src" };
        let beside = if cfg!(windows) { r"C:\dev\worktrees\app-x2" } else { "/dev/worktrees/app-x2" };
        assert!(is_inside(Path::new(worktree), worktree));
        assert!(is_inside(Path::new(inside), worktree));
        assert!(!is_inside(Path::new(beside), worktree));
    }
}
