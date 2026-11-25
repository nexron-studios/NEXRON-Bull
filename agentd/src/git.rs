//! The checked-out branch of a working folder, read from the `HEAD` file instead of starting git:
//! the app asks for every open tab, and a process per question would be slow on a remote machine.

use std::fs;
use std::path::{Path, PathBuf};

use crate::usage::native_path;

/// Git's own short form of a commit id, shown for a detached `HEAD`.
const SHORT_SHA_LEN: usize = 7;
const HEADS_PREFIX: &str = "refs/heads/";

/// `feat/chat-panel`, a short commit id when `HEAD` is detached, `None` outside a repository.
pub fn branch_of(cwd: &str) -> Option<String> {
    let cwd = native_path(cwd);
    // A relative or empty folder would be looked up from agentd's own folder.
    if !cwd.is_absolute() {
        return None;
    }
    // The nearest `.git` decides; one that cannot be read must not let an enclosing repository
    // answer for it.
    let git = cwd.ancestors().map(|dir| dir.join(".git")).find(|git| git.exists())?;
    let git_dir = git_dir_of(&git)?;
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

/// The top folder of the linked worktree the folder is (inside): its `.git` is a file pointing into
/// the main repository's `worktrees/`, unlike a submodule's, which points into `modules/`. `None`
/// for a main checkout or outside a repository.
pub fn linked_worktree_of(cwd: &str) -> Option<PathBuf> {
    let cwd = native_path(cwd);
    if !cwd.is_absolute() {
        return None;
    }
    let git = cwd.ancestors().map(|dir| dir.join(".git")).find(|git| git.exists())?;
    let is_linked = git.is_file()
        && git_dir_of(&git).is_some_and(|dir| dir.parent().and_then(Path::file_name).is_some_and(|name| name == "worktrees"));
    if !is_linked {
        return None;
    }
    git.parent().map(Path::to_path_buf)
}

/// A `.git` folder itself, or for a linked worktree the folder its `.git` file points to (absolute
/// or relative to the worktree). The worktree's own `HEAD` lives there, not in the main checkout.
fn git_dir_of(git: &Path) -> Option<PathBuf> {
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
        assert_eq!(linked_worktree_of(&text(&worktree.join("src"))), Some(worktree.clone()));
        assert_eq!(linked_worktree_of(&text(&base.join("repo"))), None);
    }

    #[test]
    fn shortens_a_detached_head() {
        let repo = temp_dir("detached");
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join(".git/HEAD"), "d5454e3c9f1a2b3c4d5e6f708192a3b4c5d6e7f8\n").unwrap();

        assert_eq!(branch_of(&text(&repo)).as_deref(), Some("d5454e3"));
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
