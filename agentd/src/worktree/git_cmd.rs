//! Running git for the worktree flow, and reading what it prints.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use super::WorktreeError;
use crate::claude::hide_console;

/// Another session merging into `preview` holds `index.lock` for a moment.
const LOCK_TRIES: usize = 5;
const LOCK_WAIT: Duration = Duration::from_secs(2);

/// Trimmed stdout. Waits and tries again while another git holds the index lock.
pub(super) fn git(dir: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    git_untrimmed(dir, args).map(|text| text.trim().to_string())
}

fn git_untrimmed(dir: &Path, args: &[&str]) -> Result<String, WorktreeError> {
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
            return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("index.lock") && tries < LOCK_TRIES {
            thread::sleep(LOCK_WAIT);
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(git_error(args, message));
    }
}

fn git_error(args: &[&str], message: String) -> WorktreeError {
    WorktreeError::Git { command: args.first().copied().unwrap_or_default().to_string(), message }
}

/// Changed and new files. `-z` and untrimmed: each entry is `XY path`, and the leading blank of
/// ` M a.ts` belongs to it.
pub(super) fn changed_files(folder: &Path) -> Result<Vec<String>, WorktreeError> {
    let status = git_untrimmed(folder, &["status", "--porcelain", "-z", "--untracked-files=normal"])?;
    Ok(paths_of_status(&status))
}

/// A rename or copy is followed by an entry with its old path.
fn paths_of_status(status: &str) -> Vec<String> {
    let mut entries = status.split('\0').filter(|entry| !entry.is_empty());
    let mut files = Vec::new();
    while let Some(entry) = entries.next() {
        let code = entry.get(..2).unwrap_or_default();
        files.push(entry.get(3..).unwrap_or_default().to_string());
        if code.contains('R') || code.contains('C') {
            entries.next();
        }
    }
    files
}

/// Commits in `range`. An answer that is no number fails: 0 would read as "nothing unmerged".
pub(super) fn count(main: &Path, range: &str) -> Result<u32, WorktreeError> {
    let args = ["rev-list", "--count", range];
    let text = git(main, &args)?;
    text.parse().map_err(|_| git_error(&args, format!("not a count: {text}")))
}

pub(super) fn exists(main: &Path, reference: &str) -> bool {
    git(main, &["rev-parse", "--verify", "--quiet", reference]).is_ok()
}

pub(super) fn lines(text: &str) -> Vec<String> {
    text.lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_string).collect()
}

/// Git prints `C:/x/y` on Windows; the app shows and compares folders with backslashes.
pub(super) fn path_from_git(text: &str) -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(text.replace('/', "\\"))
    } else {
        PathBuf::from(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_paths_keep_their_first_letter_and_skip_old_rename_paths() {
        let status = " M src/a.ts\0?? notes.txt\0R  src/new.ts\0src/old.ts\0";
        assert_eq!(paths_of_status(status), ["src/a.ts", "notes.txt", "src/new.ts"]);
    }
}
