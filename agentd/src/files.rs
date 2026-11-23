//! The files of a working folder for the app's `@` menu. Like Claude Code: what git tracks or
//! would track (so `.gitignore` holds), outside a repository a plain walk without the usual
//! build and dependency folders.

use std::collections::VecDeque;
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::git::run_git;
use crate::usage::native_path;

/// More than any menu shows; a remote folder must not send a whole monorepo over SSH.
pub const MAX_FILES: usize = 20_000;
/// Skipped by the walk outside a repository: big, generated, never what one mentions.
const SKIPPED_DIRS: [&str; 7] = ["node_modules", "target", "dist", "build", "__pycache__", "venv", "vendor"];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileList {
    /// Relative to the folder, with `/`, sorted.
    pub files: Vec<String>,
    /// The folder holds more than `limit` files; the rest is left out.
    pub is_truncated: bool,
}

pub fn list_files(cwd: &str, limit: usize) -> FileList {
    let limit = limit.min(MAX_FILES);
    let cwd = native_path(cwd);
    // A relative folder would be looked up from agentd's own folder.
    if !cwd.is_absolute() || !cwd.is_dir() {
        return FileList { files: Vec::new(), is_truncated: false };
    }
    let mut files = git_files(&cwd).unwrap_or_else(|| walk(&cwd, limit + 1));
    files.sort();
    files.dedup();
    let is_truncated = files.len() > limit;
    files.truncate(limit);
    FileList { files, is_truncated }
}

/// Tracked files plus untracked ones `.gitignore` lets through; `None` outside a repository or
/// without git.
fn git_files(cwd: &Path) -> Option<Vec<String>> {
    let out = run_git(cwd, &["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).ok()?;
    let text = String::from_utf8_lossy(&out);
    Some(text.split('\0').filter(|path| !path.is_empty()).map(str::to_string).collect())
}

/// Breadth first, so a cut-off list still holds the files near the top.
fn walk(cwd: &Path, limit: usize) -> Vec<String> {
    let mut files = Vec::new();
    let mut queue = VecDeque::from([String::new()]);
    while let Some(dir) = queue.pop_front() {
        let Ok(entries) = fs::read_dir(cwd.join(&dir)) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                if !name.starts_with('.') && !SKIPPED_DIRS.contains(&name.as_str()) {
                    queue.push_back(path);
                }
                continue;
            }
            files.push(path);
            if files.len() >= limit {
                return files;
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-files-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, path: &str) {
        let file = dir.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, "x").unwrap();
    }

    #[test]
    fn walks_a_plain_folder_without_dependency_and_hidden_folders() {
        let dir = temp_dir("walk");
        for path in ["README.md", "src/app.ts", "node_modules/vue/index.js", ".cache/x", "src/.env"] {
            write(&dir, path);
        }
        assert_eq!(walk(&dir, 100).into_iter().collect::<std::collections::BTreeSet<_>>(),
            ["README.md", "src/.env", "src/app.ts"].map(String::from).into());
    }

    #[test]
    fn respects_gitignore_inside_a_repository() {
        let dir = temp_dir("git");
        let init = Command::new("git").args(["init", "-q"]).current_dir(&dir).status();
        if !init.is_ok_and(|status| status.success()) {
            return; // No git on this machine: the walk above covers the fallback.
        }
        fs::write(dir.join(".gitignore"), "dist/\n*.log\n").unwrap();
        for path in ["src/main.ts", "dist/bundle.js", "debug.log"] {
            write(&dir, path);
        }
        let list = list_files(&dir.to_string_lossy(), 100);
        assert_eq!(list, FileList { files: vec![".gitignore".into(), "src/main.ts".into()], is_truncated: false });
    }

    #[test]
    fn cuts_the_list_at_the_limit() {
        let dir = temp_dir("limit");
        for path in ["a.txt", "b.txt", "c.txt"] {
            write(&dir, path);
        }
        let list = list_files(&dir.to_string_lossy(), 2);
        assert_eq!((list.files.len(), list.is_truncated), (2, true));
        assert_eq!(list_files("relative/folder", 10).files, Vec::<String>::new());
    }
}
