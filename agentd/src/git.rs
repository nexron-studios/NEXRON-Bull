//! The checked-out branch of a working folder, read from the `HEAD` file instead of starting git:
//! the app asks for every open tab, and a process per question would be slow on a remote machine.
//! Where git itself has to answer (file lists, diffs), `run_git` starts it the one way agentd does.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::claude::hide_console;
use crate::usage::native_path;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git is not installed")]
    Missing,
    #[error("git could not start: {0}")]
    Start(io::Error),
    #[error("git failed: {0}")]
    Failed(String),
}

/// Git in `dir`, its output on success. Paths are taken literally (`pages/[id].vue` is no glob)
/// and printed unquoted; no optional locks, so a status taken here never makes a git command of
/// Claude's fail on `index.lock`.
pub fn run_git(dir: &Path, args: &[&str]) -> Result<Vec<u8>, GitError> {
    let mut git = Command::new("git");
    git.args(["--no-optional-locks", "--literal-pathspecs", "-c", "core.quotepath=off"])
        .args(args)
        .current_dir(dir)
        // English messages whatever the user's locale: callers match git's stderr.
        .env("LC_ALL", "C")
        .env("LANGUAGE", "C")
        .stdin(Stdio::null());
    hide_console(&mut git);
    let output = git.output().map_err(|err| match err.kind() {
        io::ErrorKind::NotFound => GitError::Missing,
        _ => GitError::Start(err),
    })?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let message = String::from_utf8_lossy(&output.stderr);
    Err(GitError::Failed(message.lines().next().unwrap_or_default().trim().to_string()))
}

/// Git's own short form of a commit id, shown for a detached `HEAD`.
const SHORT_SHA_LEN: usize = 7;
const HEADS_PREFIX: &str = "refs/heads/";

/// A folder's place in git: the branch checked out and, in a linked worktree, that worktree's top
/// folder.
#[derive(Debug, Clone, PartialEq)]
pub struct Checkout {
    /// `feat/chat-panel`, a short commit id when `HEAD` is detached, `None` when unreadable.
    pub branch: Option<String>,
    /// `None` in a main checkout or a submodule.
    pub worktree_root: Option<PathBuf>,
    /// A submodule: its repository lives in the parent's `.git/modules`, so it has no main
    /// checkout of its own to hold `preview` or worktrees.
    pub is_submodule: bool,
}

/// `None` outside a repository.
pub fn checkout_of(cwd: &str) -> Option<Checkout> {
    let cwd = native_path(cwd);
    // A relative or empty folder would be looked up from agentd's own folder.
    if !cwd.is_absolute() {
        return None;
    }
    // The nearest `.git` decides; one that cannot be read must not let an enclosing repository
    // answer for it.
    let git = cwd.ancestors().map(|dir| dir.join(".git")).find(|git| git.exists())?;
    let git_dir = git_dir_of(&git)?;
    // A linked worktree's `.git` file points into the main repository's `worktrees/`, a
    // submodule's into `modules/`.
    let is_linked = git.is_file() && git_dir.parent().and_then(Path::file_name).is_some_and(|name| name == "worktrees");
    Some(Checkout {
        branch: head_of(&git_dir),
        worktree_root: is_linked.then(|| git.parent().map(Path::to_path_buf)).flatten(),
        is_submodule: git.is_file() && !is_linked,
    })
}

fn head_of(git_dir: &Path) -> Option<String> {
    let head = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref:") {
        Some(reference) => {
            let reference = reference.trim();
            Some(reference.strip_prefix(HEADS_PREFIX).unwrap_or(reference).to_string())
        }
        None => head.get(..SHORT_SHA_LEN).map(str::to_string),
    }
}

/// A `.git` folder itself, or for a linked worktree the folder its `.git` file points to (absolute
/// or relative to the worktree). The worktree's own `HEAD` lives there, not in the main checkout.
pub(crate) fn git_dir_of(git: &Path) -> Option<PathBuf> {
    if git.is_dir() {
        return Some(git.to_path_buf());
    }
    let pointer = fs::read_to_string(git).ok()?;
    Some(git.parent()?.join(pointer.trim().strip_prefix("gitdir:")?.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-git-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn text(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    fn branch_of(cwd: &str) -> Option<String> {
        checkout_of(cwd)?.branch
    }

    fn worktree_root_of(cwd: &str) -> Option<PathBuf> {
        checkout_of(cwd)?.worktree_root
    }

    #[test]
    fn reads_the_branch_from_a_subfolder() {
        let repo = temp_dir("branch");
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join(".git/HEAD"), "ref: refs/heads/feat/chat-panel\n").unwrap();
        fs::create_dir_all(repo.join("src/views")).unwrap();

        assert_eq!(branch_of(&text(&repo.join("src/views"))).as_deref(), Some("feat/chat-panel"));
    }

    #[test]
    fn reads_a_linked_worktree_from_its_own_git_dir() {
        let base = temp_dir("worktree");
        let main_git = base.join("repo/.git");
        let worktree_git = main_git.join("worktrees/panel");
        fs::create_dir_all(&worktree_git).unwrap();
        fs::write(main_git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::write(worktree_git.join("HEAD"), "ref: refs/heads/feat/panel\n").unwrap();
        let worktree = base.join("worktrees/repo-panel");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join(".git"), "gitdir: ../../repo/.git/worktrees/panel\n").unwrap();

        assert_eq!(branch_of(&text(&worktree)).as_deref(), Some("feat/panel"));
        assert_eq!(worktree_root_of(&text(&worktree.join("src"))), Some(worktree.clone()));
        assert_eq!(worktree_root_of(&text(&base.join("repo"))), None);
    }

    #[test]
    fn shortens_a_detached_head() {
        let repo = temp_dir("detached");
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join(".git/HEAD"), "d5454e3c9f1a2b3c4d5e6f708192a3b4c5d6e7f8\n").unwrap();

        assert_eq!(branch_of(&text(&repo)).as_deref(), Some("d5454e3"));
    }

    #[test]
    fn tells_a_submodule_from_a_main_checkout_and_a_worktree() {
        let base = temp_dir("submodule");
        let modules = base.join("repo/.git/modules/lib");
        fs::create_dir_all(&modules).unwrap();
        fs::write(modules.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        let lib = base.join("repo/lib");
        fs::create_dir_all(&lib).unwrap();
        fs::write(lib.join(".git"), "gitdir: ../.git/modules/lib\n").unwrap();

        let checkout = checkout_of(&text(&lib)).unwrap();
        assert_eq!((checkout.is_submodule, checkout.worktree_root), (true, None));
    }

    #[test]
    fn does_not_fall_back_to_an_enclosing_repository_for_a_broken_git_file() {
        let outer = temp_dir("broken");
        fs::create_dir_all(outer.join(".git")).unwrap();
        fs::write(outer.join(".git/HEAD"), "ref: refs/heads/main
").unwrap();
        let inner = outer.join("vendored");
        fs::create_dir_all(&inner).unwrap();
        fs::write(inner.join(".git"), "not a pointer
").unwrap();

        assert_eq!(branch_of(&text(&inner)), None);
    }

    #[test]
    fn has_no_branch_outside_a_repository_or_for_a_relative_folder() {
        let dir = temp_dir("none");
        // The temp folder itself is in no repository on a test machine.
        assert_eq!(branch_of(&text(&dir)), None);
        assert_eq!(branch_of("relative/folder"), None);
        assert_eq!(branch_of(""), None);
    }
}
