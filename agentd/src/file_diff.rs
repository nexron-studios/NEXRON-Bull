//! A file's current changes for the app's diff review: the working tree against `HEAD`, read with
//! git on the machine the chat runs on. Outside a repository, or without git, the app shows the
//! edits recorded in the chat instead and says why.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;

use serde::Serialize;

use crate::git::{run_git, GitError};
use crate::usage::native_path;

/// Git's id of the empty tree: the base of a repository that has no commit yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/// So much context that a hunk holds the whole file; the app folds the long unchanged stretches.
const FULL_CONTEXT: &str = "--unified=100000";
/// Git's default, for a file too big to send whole.
const SHORT_CONTEXT: &str = "--unified=3";
/// More than a review reads; a remote machine must not send a generated file over SSH.
const MAX_DIFF_BYTES: usize = 1024 * 1024;
/// Past this, even a diff with little context could hold most of the file in memory twice.
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const HUNK_HEADER: &str = "@@ ";
const NOT_A_REPOSITORY: &str = "not a git repository";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Modified,
    /// New in the index, renamed or copied there, or in a repository without a commit.
    Added,
    /// Not known to git yet; the whole file counts as added.
    Untracked,
    Deleted,
    /// Same as in `HEAD`: committed meanwhile, or changed back.
    Unchanged,
    /// Matched by `.gitignore`; git has no history of it.
    Ignored,
    /// Neither on disk nor in `HEAD`: created and removed again, or never there.
    Missing,
}

/// Like Claude Code's `structuredPatch`, so the app draws both the same way.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hunk {
    pub old_start: u64,
    pub new_start: u64,
    /// Each with its mark in front: `+`, `-` or a space.
    pub lines: Vec<String>,
}

/// The app's answer, one variant per case it shows differently. Without a diff it falls back to
/// the edits the chat recorded and says why.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum FileDiff {
    /// `is_truncated`: only the lines around each change came, or the lines were cut.
    Diff { status: FileStatus, hunks: Vec<Hunk>, is_truncated: bool },
    Binary { status: FileStatus },
    /// Too big to send any lines.
    TooBig { status: FileStatus },
    /// No change against `HEAD` to show: unchanged, ignored or missing.
    Clean { status: FileStatus },
    NotInRepository,
    GitMissing,
    Failed { message: String },
}

#[derive(Debug, thiserror::Error)]
pub enum FileDiffError {
    #[error("not in a git repository")]
    NotInRepository,
    #[error("the folder must be absolute")]
    RelativeFolder,
    #[error(transparent)]
    Git(#[from] GitError),
    #[error("cannot read the file: {0}")]
    Read(io::Error),
}

impl From<FileDiffError> for FileDiff {
    fn from(err: FileDiffError) -> Self {
        match err {
            FileDiffError::NotInRepository => Self::NotInRepository,
            FileDiffError::Git(GitError::Missing) => Self::GitMissing,
            err => Self::Failed { message: err.to_string() },
        }
    }
}

pub fn file_diff(cwd: &str, path: &str) -> FileDiff {
    read_diff(cwd, path).unwrap_or_else(FileDiff::from)
}

fn read_diff(cwd: &str, path: &str) -> Result<FileDiff, FileDiffError> {
    let cwd = native_path(cwd);
    // A relative folder would be looked up from agentd's own folder.
    if !cwd.is_absolute() {
        return Err(FileDiffError::RelativeFolder);
    }
    let file = cwd.join(native_path(path));
    // Git runs in the file's own folder with a relative path: its repository need not be the
    // chat's, a symlinked folder still matches the work tree, and a deleted file's folder may be
    // gone (then the nearest one that is left).
    let dir = file.ancestors().skip(1).find(|dir| dir.is_dir()).ok_or(FileDiffError::NotInRepository)?;
    let spec = pathspec_in(dir, &file);
    let status = status_of(dir, &spec, &file)?;
    match status {
        FileStatus::Unchanged | FileStatus::Ignored | FileStatus::Missing => Ok(FileDiff::Clean { status }),
        FileStatus::Untracked => untracked_diff(&file),
        FileStatus::Modified | FileStatus::Added | FileStatus::Deleted => tracked_diff(dir, &spec, &file, status),
    }
}

/// `file` relative to `dir`, with `/`; git takes it literally (`--literal-pathspecs`).
fn pathspec_in(dir: &Path, file: &Path) -> String {
    let relative = file.strip_prefix(dir).unwrap_or(file);
    relative.components().map(|part| part.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/")
}

/// `run_git` reads git in English, so its "not a git repository" is the same on every machine.
fn status_of(dir: &Path, spec: &str, file: &Path) -> Result<FileStatus, FileDiffError> {
    let out = match run_git(dir, &["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching", "--", spec]) {
        Ok(out) => out,
        Err(GitError::Failed(message)) if message.contains(NOT_A_REPOSITORY) => return Err(FileDiffError::NotInRepository),
        Err(err) => return Err(err.into()),
    };
    let out = String::from_utf8_lossy(&out);
    Ok(status_from_code(out.get(..2), file.exists()))
}

/// The two letters of `git status --porcelain` (index, work tree); none when git has nothing to say.
fn status_from_code(code: Option<&str>, exists: bool) -> FileStatus {
    let Some(code) = code else {
        return if exists { FileStatus::Unchanged } else { FileStatus::Missing };
    };
    let mut letters = code.chars();
    match (letters.next().unwrap_or(' '), letters.next().unwrap_or(' ')) {
        ('?', '?') => FileStatus::Untracked,
        ('!', '!') => FileStatus::Ignored,
        // Added to the index, then removed from disk: `HEAD` never had it either.
        ('A', 'D') => FileStatus::Missing,
        ('D', _) | (_, 'D') => FileStatus::Deleted,
        // `HEAD` has nothing under a renamed or copied file's new path.
        ('A' | 'R' | 'C', _) => FileStatus::Added,
        _ => FileStatus::Modified,
    }
}

fn tracked_diff(dir: &Path, spec: &str, file: &Path, status: FileStatus) -> Result<FileDiff, FileDiffError> {
    let base = if run_git(dir, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok() { "HEAD" } else { EMPTY_TREE };
    let size = size_of(dir, spec, file, base);
    if size > MAX_FILE_BYTES {
        return Ok(FileDiff::TooBig { status });
    }
    let is_short = size > MAX_DIFF_BYTES as u64;
    let context = if is_short { SHORT_CONTEXT } else { FULL_CONTEXT };
    let out = run_git(dir, &["diff", "--no-color", "--no-ext-diff", context, base, "--", spec])?;
    let text = String::from_utf8_lossy(&out);
    if text.lines().any(|line| line.starts_with("Binary files ")) {
        return Ok(FileDiff::Binary { status });
    }
    let mut hunks = parse_hunks(&text);
    let is_cut = cut_to_limit(&mut hunks);
    Ok(FileDiff::Diff { status, hunks, is_truncated: is_short || is_cut })
}

/// The bigger of the file on disk and in the base; a deleted file is only in the base.
fn size_of(dir: &Path, spec: &str, file: &Path, base: &str) -> u64 {
    let on_disk = fs::metadata(file).map(|meta| meta.len()).unwrap_or(0);
    let in_base = run_git(dir, &["cat-file", "-s", &format!("{base}:./{spec}")])
        .ok()
        .and_then(|out| String::from_utf8_lossy(&out).trim().parse().ok())
        .unwrap_or(0);
    on_disk.max(in_base)
}

/// The whole file as added lines, read only up to the limit and cut at a line end.
fn untracked_diff(file: &Path) -> Result<FileDiff, FileDiffError> {
    let handle = File::open(file).map_err(FileDiffError::Read)?;
    let size = handle.metadata().map_err(FileDiffError::Read)?.len();
    let mut bytes = Vec::new();
    handle.take(MAX_DIFF_BYTES as u64).read_to_end(&mut bytes).map_err(FileDiffError::Read)?;
    if bytes.contains(&0) {
        return Ok(FileDiff::Binary { status: FileStatus::Untracked });
    }
    let is_truncated = size > MAX_DIFF_BYTES as u64;
    if is_truncated {
        // A cut inside a line could split a character; the last whole line ends the review.
        bytes.truncate(memchr::memrchr(b'\n', &bytes).map_or(0, |end| end + 1));
    }
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<String> = text.lines().map(|line| format!("+{line}")).collect();
    let hunks = if lines.is_empty() { Vec::new() } else { vec![Hunk { old_start: 0, new_start: 1, lines }] };
    Ok(FileDiff::Diff { status: FileStatus::Untracked, hunks, is_truncated })
}

/// The hunks of a unified diff; the file headers above the first `@@` and git's
/// "\ No newline at end of file" notes are left out.
fn parse_hunks(text: &str) -> Vec<Hunk> {
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
                // A hunk cut before its first line would only leave a gap marker behind.
                let kept = if at == 0 { index } else { index + 1 };
                hunk.lines.truncate(at);
                hunks.truncate(kept);
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

        let hunks = vec![Hunk { old_start: 0, new_start: 1, lines: vec!["+one".into(), "+two".into()] }];
        assert_eq!(
            untracked_diff(&dir.join("new.txt")).unwrap(),
            FileDiff::Diff { status: FileStatus::Untracked, hunks, is_truncated: false }
        );
        assert_eq!(untracked_diff(&dir.join("blob.bin")).unwrap(), FileDiff::Binary { status: FileStatus::Untracked });
        assert!(matches!(untracked_diff(&dir.join("gone.txt")), Err(FileDiffError::Read(_))));
    }

    #[test]
    fn cuts_a_big_untracked_file_at_a_line_end() {
        let dir = temp_folder("big");
        let line = format!("{}\n", "ä".repeat(99));
        fs::write(dir.join("big.txt"), line.repeat(MAX_DIFF_BYTES / line.len() + 10)).unwrap();

        let FileDiff::Diff { hunks, is_truncated, .. } = untracked_diff(&dir.join("big.txt")).unwrap() else {
            panic!("no diff")
        };
        assert!(is_truncated);
        assert_eq!(hunks[0].lines.last(), Some(&format!("+{}", "ä".repeat(99))));
    }

    #[test]
    fn cuts_whole_lines_past_the_limit() {
        let long = format!("+{}", "x".repeat(MAX_DIFF_BYTES / 2));
        let mut hunks = vec![Hunk { old_start: 1, new_start: 1, lines: vec![long.clone(), long.clone(), long] }];
        assert!(cut_to_limit(&mut hunks));
        assert_eq!(hunks[0].lines.len(), 1);
    }

    #[test]
    fn drops_a_hunk_the_cut_reaches_before_its_first_line() {
        let long = format!("+{}", "x".repeat(MAX_DIFF_BYTES / 2 + 1));
        let mut hunks = vec![
            Hunk { old_start: 1, new_start: 1, lines: vec![long.clone()] },
            Hunk { old_start: 9, new_start: 9, lines: vec![long] },
        ];
        assert!(cut_to_limit(&mut hunks));
        assert_eq!((hunks.len(), hunks[0].lines.len()), (1, 1));
    }

    #[test]
    fn reads_the_status_letters() {
        let cases = [
            (Some("??"), FileStatus::Untracked),
            (Some("!!"), FileStatus::Ignored),
            (Some(" M"), FileStatus::Modified),
            (Some("A "), FileStatus::Added),
            (Some("R "), FileStatus::Added),
            (Some("C "), FileStatus::Added),
            (Some(" D"), FileStatus::Deleted),
            (Some("D "), FileStatus::Deleted),
            (Some("AD"), FileStatus::Missing),
        ];
        for (code, status) in cases {
            assert_eq!(status_from_code(code, true), status, "{code:?}");
        }
        assert_eq!(status_from_code(None, true), FileStatus::Unchanged);
        assert_eq!(status_from_code(None, false), FileStatus::Missing);
    }

    #[test]
    fn names_the_file_relative_to_its_folder() {
        let dir = Path::new("/repo/src");
        assert_eq!(pathspec_in(dir, &dir.join("pages").join("[id].vue")), "pages/[id].vue");
    }

    #[test]
    fn tells_a_relative_folder_from_one_outside_a_repository() {
        let dir = temp_folder("none");
        fs::write(dir.join("a.txt"), "a").unwrap();
        assert!(matches!(read_diff("relative", "a.txt"), Err(FileDiffError::RelativeFolder)));
        // Without git on the machine the answer is that git is missing; both mean "use the chat".
        assert!(matches!(file_diff(&dir.to_string_lossy(), "a.txt"), FileDiff::NotInRepository | FileDiff::GitMissing));
    }
}
