//! A file's current changes for the app's diff review: the working tree against `HEAD`, read with
//! git on the machine the chat runs on. Outside a repository there is no answer, and the app shows
//! the edits recorded in the chat instead.

use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::claude::hide_console;
use crate::usage::native_path;

/// Git's id of the empty tree: the base of a repository that has no commit yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/// So much context that a hunk holds the whole file; the app folds the long unchanged stretches.
const FULL_CONTEXT: &str = "--unified=100000";
/// Git's default, for a file too big to send whole.
const SHORT_CONTEXT: &str = "--unified=3";
/// More than a review reads; a remote machine must not send a generated file over SSH.
const MAX_DIFF_BYTES: usize = 1024 * 1024;
const HUNK_HEADER: &str = "@@ ";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Modified,
    /// New in the index or a new commit-less repository.
    Added,
    /// Not known to git yet; the whole file counts as added.
    Untracked,
    Deleted,
    /// Same as in `HEAD`: committed meanwhile, or changed back.
    Unchanged,
    /// Matched by `.gitignore`; git has no history of it.
    Ignored,
}

/// Like Claude Code's `structuredPatch`, so the app draws both the same way.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hunk {
    pub old_start: u64,
    pub new_start: u64,
    /// Each with its mark in front: `+`, `-` or a space.
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileDiff {
    pub status: FileStatus,
    pub hunks: Vec<Hunk>,
    pub is_binary: bool,
    /// Only the lines around each change came, or (untracked) the file was cut.
    pub is_truncated: bool,
}

/// `None` when the file is in no repository or git is missing: the chat's own edits then count.
pub fn file_diff(cwd: &str, path: &str) -> Option<FileDiff> {
    let cwd = native_path(cwd);
    let file = cwd.join(native_path(path));
    // A relative folder would be looked up from agentd's own folder.
    if !file.is_absolute() {
        return None;
    }
    // The file's own repository, which need not be the chat's; a deleted file's folder may be gone.
    let dir = file.ancestors().skip(1).find(|dir| dir.is_dir())?.to_path_buf();
    let status = status_of(&dir, &file)?;
    match status {
        FileStatus::Unchanged | FileStatus::Ignored => Some(FileDiff { status, hunks: Vec::new(), is_binary: false, is_truncated: false }),
        FileStatus::Untracked => Some(untracked_diff(&file)),
        _ => tracked_diff(&dir, &file, status),
    }
}

fn git(dir: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let mut git = Command::new("git");
    git.args(["-c", "core.quotepath=off"]).args(args).current_dir(dir).stdin(Stdio::null()).stderr(Stdio::null());
    hide_console(&mut git);
    git.output().ok().filter(|output| output.status.success()).map(|output| output.stdout)
}

fn pathspec(file: &Path) -> String {
    file.to_string_lossy().into_owned()
}

fn status_of(dir: &Path, file: &Path) -> Option<FileStatus> {
    let out = git(dir, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching", "--", &pathspec(file)])?;
    let out = String::from_utf8_lossy(&out);
    let Some(code) = out.get(..2) else { return Some(FileStatus::Unchanged) };
    Some(match code {
        "??" => FileStatus::Untracked,
        "!!" => FileStatus::Ignored,
        code if code.contains('D') => FileStatus::Deleted,
        code if code.starts_with('A') => FileStatus::Added,
        _ => FileStatus::Modified,
    })
}

fn tracked_diff(dir: &Path, file: &Path, status: FileStatus) -> Option<FileDiff> {
    let base = if git(dir, &["rev-parse", "--verify", "-q", "HEAD"]).is_some() { "HEAD" } else { EMPTY_TREE };
    let spec = pathspec(file);
    let diff_with = |context: &str| git(dir, &["diff", "--no-color", "--no-ext-diff", context, base, "--", &spec]);
    let full = diff_with(FULL_CONTEXT)?;
    let (out, is_short) = if full.len() > MAX_DIFF_BYTES { (diff_with(SHORT_CONTEXT)?, true) } else { (full, false) };
    let text = String::from_utf8_lossy(&out);
    let is_binary = text.lines().any(|line| line.starts_with("Binary files "));
    let mut hunks = parse_hunks(&text);
    let is_cut = cut_to_limit(&mut hunks);
    Some(FileDiff { status, hunks, is_binary, is_truncated: is_short || is_cut })
}

/// The whole file as added lines; git has nothing to compare it with.
fn untracked_diff(file: &Path) -> FileDiff {
    let bytes = fs::read(file).unwrap_or_default();
    if bytes.contains(&0) {
        return FileDiff { status: FileStatus::Untracked, hunks: Vec::new(), is_binary: true, is_truncated: false };
    }
    let is_truncated = bytes.len() > MAX_DIFF_BYTES;
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_DIFF_BYTES)]);
    let lines: Vec<String> = text.lines().map(|line| format!("+{line}")).collect();
    let hunks = if lines.is_empty() { Vec::new() } else { vec![Hunk { old_start: 0, new_start: 1, lines }] };
    FileDiff { status: FileStatus::Untracked, hunks, is_binary: false, is_truncated }
}

/// The hunks of a unified diff; the file headers above the first `@@` and git's
/// "\ No newline at end of file" notes are left out.
pub fn parse_hunks(text: &str) -> Vec<Hunk> {
    let mut hunks: Vec<Hunk> = Vec::new();
    for line in text.lines() {
        if let Some(header) = line.strip_prefix(HUNK_HEADER) {
            if let Some((old_start, new_start)) = starts_of(header) {
                hunks.push(Hunk { old_start, new_start, lines: Vec::new() });
            }
            continue;
        }
        let Some(hunk) = hunks.last_mut() else { continue };
        if line.starts_with(['+', '-', ' ']) {
            hunk.lines.push(line.strip_suffix('\r').unwrap_or(line).to_string());
        }
    }
    hunks
}

/// `-12,3 +14,5 @@ fn x` → (12, 14); a count of 0 or 1 may be left out.
fn starts_of(header: &str) -> Option<(u64, u64)> {
    let mut parts = header.split_whitespace();
    let start = |part: Option<&str>, sign: char| part?.strip_prefix(sign)?.split(',').next()?.parse().ok();
    Some((start(parts.next(), '-')?, start(parts.next(), '+')?))
}

/// Drops whole lines past the byte limit, so a short diff of a huge file still fits.
fn cut_to_limit(hunks: &mut Vec<Hunk>) -> bool {
    let mut budget = MAX_DIFF_BYTES;
    for (index, hunk) in hunks.iter_mut().enumerate() {
        for (at, line) in hunk.lines.iter().enumerate() {
            if line.len() > budget {
                hunk.lines.truncate(at);
                hunks.truncate(index + 1);
                return true;
            }
            budget -= line.len();
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// The temp folder is in no repository on a test machine.
    fn temp_folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-diff-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_hunks_without_headers_and_newline_notes() {
        let text = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,3 @@ fn x\n a\r\n-b\n+c\n+d\n\\ No newline at end of file\n@@ -10 +11 @@\n-e\n+f\n";
        assert_eq!(
            parse_hunks(text),
            vec![
                Hunk { old_start: 1, new_start: 1, lines: vec![" a".into(), "-b".into(), "+c".into(), "+d".into()] },
                Hunk { old_start: 10, new_start: 11, lines: vec!["-e".into(), "+f".into()] },
            ]
        );
    }

    #[test]
    fn reads_an_untracked_file_as_added_and_spots_binary_content() {
        let dir = temp_folder("untracked");
        fs::write(dir.join("new.txt"), "one\ntwo\n").unwrap();
        fs::write(dir.join("blob.bin"), [1u8, 0, 2]).unwrap();

        let text = untracked_diff(&dir.join("new.txt"));
        assert_eq!(text.hunks, vec![Hunk { old_start: 0, new_start: 1, lines: vec!["+one".into(), "+two".into()] }]);
        assert!(untracked_diff(&dir.join("blob.bin")).is_binary);
    }

    #[test]
    fn cuts_whole_lines_past_the_limit() {
        let long = format!("+{}", "x".repeat(MAX_DIFF_BYTES / 2));
        let mut hunks = vec![Hunk { old_start: 1, new_start: 1, lines: vec![long.clone(), long.clone(), long] }];
        assert!(cut_to_limit(&mut hunks));
        assert_eq!(hunks[0].lines.len(), 1);
    }

    #[test]
    fn has_no_answer_outside_a_repository_or_for_a_relative_folder() {
        let dir = temp_folder("none");
        fs::write(dir.join("a.txt"), "a").unwrap();
        assert_eq!(file_diff(&dir.to_string_lossy(), "a.txt"), None);
        assert_eq!(file_diff("relative", "a.txt"), None);
    }
}
