//! One command the user runs with `!` in the app, like Claude Code's bash mode: in the chat's
//! folder, through the shell Claude's own Bash tool uses (Git Bash on Windows), with a timeout.

use std::env;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::claude::{hide_console, scrub_env};
use crate::usage::native_path;

/// Claude Code's own limit for a `!` command before it gives up waiting.
const TIMEOUT: Duration = Duration::from_secs(120);
const POLL: Duration = Duration::from_millis(20);
/// A server the command started keeps the pipes open after the shell exits; its output after
/// this is not waited for.
const READ_GRACE: Duration = Duration::from_millis(500);
/// Claude Code cuts a tool's output at about this many characters; the end is what matters.
pub const MAX_OUTPUT_CHARS: usize = 30_000;
const GIT_BASH_VAR: &str = "CLAUDE_CODE_GIT_BASH_PATH";

#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("folder {0} not found")]
    NoFolder(String),
    #[error("the shell did not start: {0}")]
    Spawn(#[from] std::io::Error),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ShellRun {
    pub stdout: String,
    pub stderr: String,
    /// `None` when the command was killed (timeout) or ended by a signal.
    pub code: Option<i32>,
    pub duration_ms: u64,
    pub is_timed_out: bool,
}

pub fn run(cwd: &str, command: &str) -> Result<ShellRun, ShellError> {
    run_with_timeout(cwd, command, TIMEOUT)
}

fn run_with_timeout(cwd: &str, command: &str, timeout: Duration) -> Result<ShellRun, ShellError> {
    let folder = native_path(cwd);
    if !folder.is_absolute() || !folder.is_dir() {
        return Err(ShellError::NoFolder(cwd.to_string()));
    }
    let mut shell = shell_command(command);
    shell.current_dir(&folder).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    scrub_env(&mut shell);
    hide_console(&mut shell);
    let started = Instant::now();
    let mut child = shell.spawn()?;
    let stdout = collect(child.stdout.take());
    let stderr = collect(child.stderr.take());
    let (code, is_timed_out) = wait(&mut child, started, timeout);
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let grace = Instant::now() + READ_GRACE;
    Ok(ShellRun { stdout: stdout.take(grace), stderr: stderr.take(grace), code, duration_ms, is_timed_out })
}

fn wait(child: &mut Child, started: Instant, timeout: Duration) -> (Option<i32>, bool) {
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            return (status.code(), false);
        }
        if started.elapsed() >= timeout {
            kill_tree(child);
            return (None, true);
        }
        thread::sleep(POLL);
    }
}

/// The shell and everything it started: `npm run dev` would otherwise outlive the timeout and
/// keep its port. Already gone means it ended between the check and the kill.
fn kill_tree(child: &mut Child) {
    let mut kill = tree_killer(child.id());
    hide_console(&mut kill);
    let _ = kill.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(windows)]
fn tree_killer(pid: u32) -> Command {
    let mut kill = Command::new("taskkill");
    kill.args(["/T", "/F", "/PID", &pid.to_string()]);
    kill
}

/// The shell leads its own process group (see `shell_command`); the minus names the group.
#[cfg(not(windows))]
fn tree_killer(pid: u32) -> Command {
    let mut kill = Command::new("kill");
    kill.args(["-KILL", "--", &format!("-{pid}")]);
    kill
}

/// A pipe read on its own thread into a buffer, so a full pipe never blocks the command.
struct Collected {
    buffer: Arc<Mutex<Vec<u8>>>,
    reader: Option<JoinHandle<()>>,
}

fn collect(pipe: Option<impl Read + Send + 'static>) -> Collected {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let reader = pipe.map(|mut pipe| {
        let buffer = Arc::clone(&buffer);
        thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            while let Ok(read) = pipe.read(&mut chunk) {
                if read == 0 {
                    break;
                }
                buffer.lock().unwrap_or_else(PoisonError::into_inner).extend_from_slice(&chunk[..read]);
            }
        })
    });
    Collected { buffer, reader }
}

impl Collected {
    fn take(self, until: Instant) -> String {
        if let Some(reader) = &self.reader {
            while !reader.is_finished() && Instant::now() < until {
                thread::sleep(POLL);
            }
        }
        let bytes = std::mem::take(&mut *self.buffer.lock().unwrap_or_else(PoisonError::into_inner));
        tail(&strip_ansi(&String::from_utf8_lossy(&bytes)), MAX_OUTPUT_CHARS)
    }
}

/// The last `max` characters.
fn tail(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    text.chars().skip(count - max).collect()
}

/// Colour and cursor codes (CSI `ESC [ … letter`, OSC `ESC ] … BEL`) are noise in the chat and
/// in Claude's context.
fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' || (c == '\u{1b}' && chars.next_if_eq(&'\\').is_some()) {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(windows)]
fn shell_command(command: &str) -> Command {
    if let Some(bash) = git_bash() {
        let mut shell = Command::new(bash);
        shell.args(["-c", command]);
        return shell;
    }
    // cmd does not split its arguments like other programs; the line goes over as typed.
    use std::os::windows::process::CommandExt;
    let mut shell = Command::new("cmd");
    shell.args(["/d", "/s", "/c"]).raw_arg(format!("\"{command}\""));
    shell
}

#[cfg(not(windows))]
fn shell_command(command: &str) -> Command {
    use std::os::unix::process::CommandExt;
    let mut shell = Command::new(env::var_os("SHELL").unwrap_or_else(|| "/bin/sh".into()));
    shell.args(["-c", command]).process_group(0);
    shell
}

/// Claude Code's own lookup: its variable, else the `bash.exe` of the Git that is on PATH. The
/// `bash.exe` in System32 is WSL's and is never taken.
#[cfg_attr(not(windows), allow(dead_code))]
fn git_bash() -> Option<PathBuf> {
    if let Some(path) = env::var_os(GIT_BASH_VAR).map(PathBuf::from).filter(|path| path.is_file()) {
        return Some(path);
    }
    let path = env::var_os("PATH")?;
    env::split_paths(&path).filter(|dir| dir.join("git.exe").is_file()).find_map(|dir| bash_beside_git(&dir))
}

/// Git for Windows puts `git.exe` in `cmd`, `bin` or `mingw64/bin`; bash sits in `bin`.
fn bash_beside_git(git_dir: &Path) -> Option<PathBuf> {
    git_dir
        .ancestors()
        .take(3)
        .map(|dir| dir.join("bin").join("bash.exe"))
        .chain([git_dir.join("bash.exe")])
        .find(|bash| bash.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_colour_codes_and_titles() {
        assert_eq!(strip_ansi("\u{1b}[32m✓\u{1b}[0m passed\u{1b}]0;title\u{7} done"), "✓ passed done");
        assert_eq!(strip_ansi("plain"), "plain");
    }

    #[test]
    fn keeps_the_end_of_long_output() {
        assert_eq!(tail("abcdef", 3), "def");
        assert_eq!(tail("äö", 5), "äö");
    }

    #[test]
    fn runs_in_the_folder_and_keeps_both_streams() {
        let dir = std::env::temp_dir();
        let run = run(&dir.to_string_lossy(), "echo out && echo err 1>&2 && exit 3").unwrap();
        assert_eq!(run.stdout.trim(), "out");
        assert_eq!(run.stderr.trim(), "err");
        assert_eq!((run.code, run.is_timed_out), (Some(3), false));
    }

    #[test]
    fn stops_a_command_and_what_it_started_when_it_runs_too_long() {
        let dir = std::env::temp_dir().join(format!("agentd-shell-tree-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("still-ran.txt");
        let _ = std::fs::remove_file(&marker);
        // The inner shell is a grandchild; killing only the outer one would let it write the file.
        let command = "sh -c 'sleep 2 && echo late > still-ran.txt'";
        let run = run_with_timeout(&dir.to_string_lossy(), command, Duration::from_millis(500)).unwrap();
        assert_eq!((run.code, run.is_timed_out), (None, true));
        thread::sleep(Duration::from_secs(3));
        assert!(!marker.exists(), "a process the command started kept running");
    }

    #[test]
    fn refuses_a_missing_folder() {
        assert!(matches!(run("relative/folder", "echo hi"), Err(ShellError::NoFolder(_))));
    }
}
