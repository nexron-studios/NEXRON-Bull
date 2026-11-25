//! One git worktree per chat, as the user works by hand: each chat gets its own branch in its own
//! folder beside the projects, branched from the freshly fetched integration branch. The main
//! checkout sits on a local `preview` branch (integration branch plus every open chat branch) that
//! the dev server runs from; a chat's branch is merged in there on request. Here and not in the
//! app, because a chat on another machine has its repository there.

mod git_cmd;
mod naming;

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::paths;
use crate::usage::native_path;
use git_cmd::{changed_files, count, exists, git, lines, path_from_git};
pub use naming::slug_of;

/// The never-pushed branch in the main checkout that collects every open chat branch.
pub const PREVIEW: &str = "preview";
/// Where a chat branch starts, the first one that exists: projects with a `dev` branch merge
/// there, the others straight into `main`. Between the remote and the local names comes whatever
/// `origin/HEAD` points to, for a repository whose default branch has another name.
const REMOTE_INTEGRATION: [&str; 3] = ["origin/dev", "origin/main", "origin/master"];
const LOCAL_INTEGRATION: [&str; 3] = ["dev", "main", "master"];
/// Git config key on a chat branch naming the tab it was made for, so a retry finds it again.
const TAB_KEY: &str = "bulltab";

#[derive(Debug, thiserror::Error)]
pub enum WorktreeError {
    #[error("folder {0} not found")]
    NoFolder(String),
    #[error("{0} is not in a git repository")]
    NoRepository(String),
    #[error("{0} is the main checkout, not a worktree")]
    NotAWorktree(String),
    #[error("no integration branch (origin/dev, origin/main, origin/master, origin/HEAD, dev, main or master) in {0}")]
    NoIntegration(String),
    #[error("the worktree folder {0} is not a full path")]
    RelativeRoot(String),
    #[error("{0} has no branch checked out")]
    Detached(String),
    #[error("no free branch name for {0}")]
    NoFreeName(String),
    #[error("git {command} failed: {message}")]
    Git { command: String, message: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Why agentd did not make, merge or remove a worktree, for the app to say in its own words.
/// `Failed` is git or the disk failing; its message is all there is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RefusalKind {
    NoFolder,
    NoRepository,
    NotAWorktree,
    NoIntegration,
    RelativeRoot,
    Detached,
    NoFreeName,
    Failed,
}

impl WorktreeError {
    pub fn kind(&self) -> RefusalKind {
        match self {
            Self::NoFolder(_) => RefusalKind::NoFolder,
            Self::NoRepository(_) => RefusalKind::NoRepository,
            Self::NotAWorktree(_) => RefusalKind::NotAWorktree,
            Self::NoIntegration(_) => RefusalKind::NoIntegration,
            Self::RelativeRoot(_) => RefusalKind::RelativeRoot,
            Self::Detached(_) => RefusalKind::Detached,
            Self::NoFreeName(_) => RefusalKind::NoFreeName,
            Self::Git { .. } | Self::Io(_) => RefusalKind::Failed,
        }
    }
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
/// prompt); the folder the chat works in. `root` replaces the folder the worktrees go into. A second
/// call for the same `tab` (its Claude never got going) returns the worktree made the first time.
pub fn create(cwd: &Path, hint: &str, root: Option<&str>, tab: &str) -> Result<PathBuf, WorktreeError> {
    let folder = existing_folder(&cwd.to_string_lossy())?;
    let main = main_checkout_of(&folder)?;
    // A chat opened on `app/src` works in `app-x/src`: the same place in its own checkout.
    let prefix = git(&folder, &["rev-parse", "--show-prefix"]).unwrap_or_default();
    let root = match root.map(str::trim).filter(|root| !root.is_empty()) {
        // A relative folder would be looked up from agentd's own folder.
        Some(root) if !native_path(root).is_absolute() => return Err(WorktreeError::RelativeRoot(root.to_string())),
        Some(root) => native_path(root),
        None => naming::default_root(&main),
    };
    if let Some(top) = made_for(&main, tab) {
        return Ok(chat_folder_of(top, &prefix));
    }
    fetch(&main);
    let base = integration_of(&main)?;
    let repo = main.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let (branch, top) = naming::free_name(&main, &root, &repo, &slug_of(hint))?;
    fs::create_dir_all(&root)?;
    let top_text = top.to_string_lossy().into_owned();
    // No upstream: a `git push` from the chat must never land on the integration branch.
    git(&main, &["worktree", "add", "--no-track", "-b", &branch, &top_text, &base])?;
    git(&main, &["config", &format!("branch.{branch}.{TAB_KEY}"), tab])?;
    Ok(chat_folder_of(top, &prefix))
}

/// The same subfolder in the worktree; one the integration branch does not have yet leaves the
/// chat at the top.
fn chat_folder_of(top: PathBuf, prefix: &str) -> PathBuf {
    let inside = top.join(path_from_git(prefix.trim_end_matches('/')));
    if prefix.is_empty() || !inside.is_dir() { top } else { inside }
}

/// The top folder of the worktree already made for `tab`, if it still exists.
fn made_for(main: &Path, tab: &str) -> Option<PathBuf> {
    let pattern = format!("^branch\\..*\\.{TAB_KEY}$");
    let keys = git(main, &["config", "--get-regexp", &pattern]).ok()?;
    let suffix = format!(".{TAB_KEY} {tab}");
    let branch = lines(&keys)
        .into_iter()
        .find_map(|line| Some(line.strip_prefix("branch.")?.strip_suffix(&suffix)?.to_string()))?;
    let list = git(main, &["worktree", "list", "--porcelain"]).ok()?;
    let mut top = None;
    for line in list.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            top = Some(path_from_git(path));
        } else if line.strip_prefix("branch refs/heads/") == Some(branch.as_str()) {
            return top.filter(|top| top.is_dir());
        }
    }
    None
}

/// Merges the worktree's branch into `preview` in the main checkout, creating `preview` there
/// first when it is missing and the checkout is clean. A conflict is aborted, never left behind.
pub fn merge_into_preview(worktree: &str) -> Result<PreviewMerge, WorktreeError> {
    let (worktree, main, branch) = linked_worktree(worktree)?;
    let has_uncommitted = !changed_files(&worktree)?.is_empty();
    let created_preview = match ensure_preview(&main)? {
        Ok(created) => created,
        Err(outcome) => return Ok(PreviewMerge { branch, outcome, created_preview: false, has_uncommitted }),
    };
    let commits = count(&main, &format!("{PREVIEW}..{branch}"))?;
    if commits == 0 {
        return Ok(PreviewMerge { branch, outcome: MergeOutcome::UpToDate, created_preview, has_uncommitted });
    }
    let outcome = match git(&main, &["merge", "--no-edit", &branch]) {
        Ok(_) => MergeOutcome::Merged { commits },
        Err(err) => conflict_of(&main, &branch, err)?,
    };
    Ok(PreviewMerge { branch, outcome, created_preview, has_uncommitted })
}

/// After a failed merge: the conflict, with the merge aborted before anything else can fail, so
/// `preview` is never left mid-merge. A merge refused before it began (local changes in the way)
/// has nothing to abort and stays the error it was.
fn conflict_of(main: &Path, branch: &str, err: WorktreeError) -> Result<MergeOutcome, WorktreeError> {
    match git(main, &["diff", "--name-only", "--diff-filter=U"]).map(|text| lines(&text)) {
        Ok(files) if files.is_empty() => Err(err),
        Ok(files) => {
            let branches = clashing_branches(main, branch, &files);
            git(main, &["merge", "--abort"])?;
            Ok(MergeOutcome::Conflict { files, branches })
        }
        Err(listing) => {
            git(main, &["merge", "--abort"])?;
            Err(listing)
        }
    }
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
    // Nothing in it can be lost any more. A file a process still holds makes git give up halfway
    // (Windows); what is left goes by hand, and `prune` forgets the folder.
    if let Err(err) = git(&main, &["worktree", "remove", &worktree.to_string_lossy()]) {
        eprintln!("agentd: removing the worktree by hand: {err}");
    }
    if worktree.exists() {
        fs::remove_dir_all(&worktree)?;
    }
    git(&main, &["worktree", "prune"])?;
    git(&main, &["branch", "-D", &branch])?;
    Ok(RemoveOutcome::Removed { branch })
}

/// `cwd` is the folder of a worktree or inside one; the same folder written either way.
pub fn is_inside(cwd: &Path, worktree: &str) -> bool {
    let (cwd, worktree) = (paths::comparable(cwd), paths::comparable(&native_path(worktree)));
    cwd == worktree || cwd.starts_with(&format!("{worktree}/"))
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
    let remote_default = git(main, &["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).ok();
    REMOTE_INTEGRATION
        .iter()
        .map(|name| name.to_string())
        .chain(remote_default)
        .chain(LOCAL_INTEGRATION.iter().map(|name| name.to_string()))
        .find(|candidate| exists(main, &format!("{candidate}^{{commit}}")))
        .ok_or_else(|| WorktreeError::NoIntegration(main.to_string_lossy().into_owned()))
}

/// Puts the main checkout on `preview`, creating it from the integration branch when missing:
/// `Ok(created)`, or the outcome that leaves it alone. A main checkout on another branch is the
/// user's call, and a missing `preview` is not made while switching would carry changes along.
fn ensure_preview(main: &Path) -> Result<Result<bool, MergeOutcome>, WorktreeError> {
    // A detached main checkout shows as its short commit id.
    let current = git(main, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .or_else(|_| git(main, &["rev-parse", "--short", "HEAD"]))?;
    if current == PREVIEW {
        return Ok(Ok(false));
    }
    if exists(main, &format!("refs/heads/{PREVIEW}")) {
        return Ok(Err(MergeOutcome::MainElsewhere { branch: current }));
    }
    if !changed_files(main)?.is_empty() {
        return Ok(Err(MergeOutcome::MainDirty));
    }
    let base = integration_of(main)?;
    git(main, &["switch", "--no-track", "-c", PREVIEW, &base])?;
    Ok(Ok(true))
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

#[cfg(test)]
mod tests {
    use super::*;

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
