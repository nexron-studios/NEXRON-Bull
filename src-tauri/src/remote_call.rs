//! One ssh call to another machine and what came back: the line Bull was waiting for, the rest
//! of stdout, the exit code and stderr. Checks and installs are built from these calls.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::connections;
use crate::machines::MachineEntry;

/// Longer than ssh's 10 s connect timeout, so a slow login is not cut short.
const ASK_TIMEOUT: Duration = Duration::from_secs(30);

/// What one ssh call gave back.
pub(crate) struct Asked {
    /// The first stdout line whose `type` was the wanted one
    pub(crate) answer: Option<Value>,
    /// Every other line before it
    pub(crate) stdout: String,
    pub(crate) code: Option<i32>,
    pub(crate) stderr: String,
    /// Stopped at the deadline, neither answered nor ended. The exit code then is the kill's
    /// (1 on Windows), not the remote command's.
    pub(crate) is_timed_out: bool,
}

pub(crate) fn ssh(entry: &MachineEntry, should_accept_new_key: bool, remote: &str) -> Command {
    let mut command = Command::new(connections::ssh_program());
    command.args([
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        connections::SSH_CONNECT_TIMEOUT,
    ]);
    if should_accept_new_key {
        command.args(["-o", "StrictHostKeyChecking=accept-new"]);
    }
    command.args(entry.ssh_args()).arg(remote);
    command
}

/// Runs `command`, writes `line` to it and waits for a stdout line of type `wanted`, its end, or
/// the timeout. An answer ends the call at once: over a PowerShell login shell the end of input
/// does not always reach the program.
pub(crate) fn ask(command: Command, line: &str, wanted: &str) -> io::Result<Asked> {
    ask_within(command, line, wanted, ASK_TIMEOUT)
}

/// `ask` with its own deadline, for calls that take longer than a check, such as a download.
pub(crate) fn ask_within(
    mut command: Command,
    line: &str,
    wanted: &str,
    timeout: Duration,
) -> io::Result<Asked> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    connections::hide_console(&mut command);
    let mut child = command.spawn()?;
    let mut stdin = child.stdin.take();
    if let Some(input) = stdin.as_mut() {
        // A remote that already ended has nobody to read it; its exit code tells why.
        let _ = writeln!(input, "{line}").and_then(|()| input.flush());
    }
    let stderr = child.stderr.take().map(|mut pipe| {
        thread::spawn(move || {
            let mut text = String::new();
            // Whatever arrived before a read error still explains the failure.
            let _ = pipe.read_to_string(&mut text);
            text
        })
    });
    let (sender, lines) = mpsc::channel();
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
    }
    let (answer, stdout, has_ended) = read_until(&lines, wanted, timeout);
    if !has_ended {
        // Answered or out of time: it should not run on.
        let _ = child.kill();
    }
    drop(stdin);
    let code = child.wait()?.code();
    let stderr = stderr
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let is_timed_out = !has_ended && answer.is_none();
    Ok(Asked {
        answer,
        stdout,
        code,
        stderr,
        is_timed_out,
    })
}

/// The wanted answer (an empty `wanted` reads to the end), the lines before it, and whether
/// stdout ended on its own.
fn read_until(
    lines: &mpsc::Receiver<String>,
    wanted: &str,
    timeout: Duration,
) -> (Option<Value>, String, bool) {
    let deadline = Instant::now() + timeout;
    let mut stdout = String::new();
    loop {
        let line = match lines.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(line) => line,
            Err(mpsc::RecvTimeoutError::Disconnected) => return (None, stdout, true),
            Err(mpsc::RecvTimeoutError::Timeout) => return (None, stdout, false),
        };
        let event = serde_json::from_str::<Value>(&line).ok();
        if let Some(event) = event.filter(|event| !wanted.is_empty() && event["type"] == wanted) {
            return (Some(event), stdout, false);
        }
        stdout.push_str(&line);
        stdout.push('\n');
    }
}

#[cfg(test)]
mod tests {
    /// A stand-in for ssh: a shell that answers like agentd's `stdio`.
    #[cfg(windows)]
    #[test]
    fn reads_the_wanted_answer_and_its_exit_code() {
        use std::os::windows::process::CommandExt;

        use super::*;

        const HELLO_LINE: &str = r#"{"op":"hello","id":1}"#;
        let mut hello = Command::new("cmd");
        hello.raw_arg(
            r#"/d /c "echo noise& echo {"type":"hello","id":1,"version":"0.1.0","os":"windows"}""#,
        );
        let answered = ask(hello, HELLO_LINE, "hello").unwrap();
        assert_eq!(answered.answer.unwrap()["version"], "0.1.0");

        let mut missing = Command::new("cmd");
        missing.args(["/d", "/c", "echo gone 1>&2& exit 3"]);
        let failed = ask(missing, HELLO_LINE, "hello").unwrap();
        assert!(failed.answer.is_none());
        assert_eq!(failed.code, Some(3));
        assert_eq!(failed.stderr.trim(), "gone");
    }
}
