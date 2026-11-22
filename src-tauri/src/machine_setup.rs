//! Checks whether another machine can run Bull's chats. Every check is an ssh call whose answer
//! (agentd's `hello`, or ssh's complaint on stderr) is turned into one reason the assistant
//! explains; `machine_install` copies agentd over with the same calls. Windows targets only, like
//! the connection itself.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::connections;
use crate::machines::{self, MachineEntry};

/// `stdio` serves one client and ends with its input, so asking `hello` starts nothing that
/// stays behind (unlike `connect`, which starts the background server).
const PROBE_COMMAND: &str = r"cmd /d /c .nexron-chat\agentd.exe stdio";
/// Tells a missing agentd from one Windows refuses to start, without reading localised text.
const PRESENCE_COMMAND: &str = r"cmd /d /c dir /b .nexron-chat\agentd.exe";
const HELLO_LINE: &str = r#"{"op":"hello","id":1}"#;
/// ssh's own exit code for its failures; anything else is the remote command's.
pub(crate) const SSH_FAILED: i32 = 255;
const SHELL_COMMAND_MISSING: i32 = 127;
const DEFAULT_SSH_PORT: &str = "22";
/// Longer than ssh's 10 s connect timeout, so a slow login is not cut short.
const ASK_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_DETAIL_CHARS: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeReason {
    Ok,
    Offline,
    AuthFailed,
    HostKeyChanged,
    /// ssh never saw this host and was told not to take a new key (the one-time migration)
    HostKeyUnknown,
    NoAgentd,
    AgentdBlocked,
    NotWindows,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Probe {
    pub reason: ProbeReason,
    /// What agentd's `hello` reported
    pub version: Option<String>,
    /// The last lines ssh or Windows wrote, for the assistant's "details"
    pub detail: Option<String>,
    /// How `known_hosts` names the machine, for forgetting a changed key: ssh stores the
    /// resolved host name, not the alias from `~/.ssh/config`
    pub known_host: Option<String>,
}

impl Probe {
    fn failed(reason: ProbeReason, stderr: &str) -> Self {
        Self { reason, version: None, detail: detail_of(stderr), known_host: None }
    }
}

/// What one ssh call gave back.
pub(crate) struct Asked {
    /// The first stdout line whose `type` was the wanted one
    pub(crate) answer: Option<Value>,
    /// Every other line before it
    pub(crate) stdout: String,
    pub(crate) code: Option<i32>,
    pub(crate) stderr: String,
}

pub(crate) fn ssh(entry: &MachineEntry, should_accept_new_key: bool, remote: &str) -> Command {
    let mut command = Command::new(connections::ssh_program());
    command.args(["-T", "-o", "BatchMode=yes", "-o", connections::SSH_CONNECT_TIMEOUT]);
    if should_accept_new_key {
        command.args(["-o", "StrictHostKeyChecking=accept-new"]);
    }
    command.args(entry.ssh_args()).arg(remote);
    command
}

/// Runs `command`, writes `line` to it and waits for a stdout line of type `wanted`, its end, or
/// the timeout. An answer ends the call at once: over a PowerShell login shell the end of input
/// does not always reach the program.
pub(crate) fn ask(mut command: Command, line: &str, wanted: &str) -> io::Result<Asked> {
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
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
    let (answer, stdout, has_ended) = read_until(&lines, wanted);
    if !has_ended {
        // Answered or out of time: it should not run on.
        let _ = child.kill();
    }
    drop(stdin);
    let code = child.wait()?.code();
    let stderr = stderr.and_then(|reader| reader.join().ok()).unwrap_or_default();
    Ok(Asked { answer, stdout, code, stderr })
}

/// The wanted answer (an empty `wanted` reads to the end), the lines before it, and whether
/// stdout ended on its own.
fn read_until(lines: &mpsc::Receiver<String>, wanted: &str) -> (Option<Value>, String, bool) {
    let deadline = Instant::now() + ASK_TIMEOUT;
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

/// Asks the machine's agentd for `hello`; when it does not answer, a second call finds out why.
pub fn probe(entry: &MachineEntry, should_accept_new_key: bool) -> Probe {
    let asked = match ask(ssh(entry, should_accept_new_key, PROBE_COMMAND), HELLO_LINE, "hello") {
        Ok(asked) => asked,
        Err(err) => return Probe::failed(ProbeReason::Offline, &err.to_string()),
    };
    if let Some(hello) = &asked.answer {
        let version = hello["version"].as_str().map(str::to_string);
        return Probe { reason: ProbeReason::Ok, version, detail: None, known_host: None };
    }
    if asked.code == Some(SSH_FAILED) {
        let reason = ssh_failure(&asked.stderr);
        let known_host = (reason == ProbeReason::HostKeyChanged).then(|| known_host_of(entry)).flatten();
        return Probe { known_host, ..Probe::failed(reason, &asked.stderr) };
    }
    match ask(ssh(entry, should_accept_new_key, PRESENCE_COMMAND), "", "") {
        Ok(presence) => {
            let reason = presence_reason(&presence);
            // A blocked agentd is explained by what starting it said, not by `dir`.
            let stderr = if reason == ProbeReason::AgentdBlocked { &asked.stderr } else { &presence.stderr };
            Probe::failed(reason, stderr)
        }
        Err(err) => Probe::failed(ProbeReason::Offline, &err.to_string()),
    }
}

/// ssh failed before the remote command ran: refused key, a changed host key, or no way there.
pub(crate) fn ssh_failure(stderr: &str) -> ProbeReason {
    let text = stderr.to_lowercase();
    if text.contains("host identification has changed") {
        return ProbeReason::HostKeyChanged;
    }
    // Without a changed key, a failed verification means the key is not known yet.
    if text.contains("host key verification failed") {
        return ProbeReason::HostKeyUnknown;
    }
    let refused = ["permission denied", "too many authentication failures", "no more authentication methods"];
    if refused.iter().any(|phrase| text.contains(phrase)) {
        return ProbeReason::AuthFailed;
    }
    ProbeReason::Offline
}

/// The answer of `PRESENCE_COMMAND`, after agentd itself did not answer.
fn presence_reason(presence: &Asked) -> ProbeReason {
    if presence.code == Some(SSH_FAILED) {
        return ssh_failure(&presence.stderr);
    }
    if presence.code == Some(0) {
        return ProbeReason::AgentdBlocked;
    }
    let text = presence.stderr.to_lowercase();
    let no_cmd = ["command not found", "cmd: not found", "unknown command", "does not provide shell access"];
    if presence.code == Some(SHELL_COMMAND_MISSING) || no_cmd.iter().any(|phrase| text.contains(phrase)) {
        return ProbeReason::NotWindows;
    }
    ProbeReason::NoAgentd
}

pub(crate) fn detail_of(stderr: &str) -> Option<String> {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|line| !line.is_empty()).collect();
    let tail = lines[lines.len().saturating_sub(3)..].join("\n");
    (!tail.is_empty()).then(|| tail.chars().take(MAX_DETAIL_CHARS).collect())
}

/// The name `known_hosts` keeps the machine under, from `ssh -G` (reads the config, connects
/// nowhere).
fn known_host_of(entry: &MachineEntry) -> Option<String> {
    let mut command = Command::new(connections::ssh_program());
    command.arg("-G").args(entry.ssh_args());
    let asked = ask(command, "", "").ok()?;
    known_host_in(&asked.stdout)
}

/// `hostkeyalias` wins over `hostname`; a port other than 22 is stored as `[host]:port`.
fn known_host_in(config: &str) -> Option<String> {
    let value = |key: &str| {
        config.lines().find_map(|line| {
            let (name, value) = line.split_once(' ')?;
            name.eq_ignore_ascii_case(key).then(|| value.trim().to_string())
        })
    };
    let host = value("hostkeyalias").filter(|alias| alias != "none").or_else(|| value("hostname"))?;
    match value("port").filter(|port| port != DEFAULT_SSH_PORT) {
        Some(port) => Some(format!("[{host}]:{port}")),
        None => Some(host),
    }
}

/// Checks a machine the user typed in or picked; it need not be in the list yet.
#[tauri::command(async)]
pub fn test_machine(entry: MachineEntry) -> Result<Probe, machines::MachinesError> {
    Ok(probe(&machines::validated(entry)?, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asked(code: i32, stderr: &str) -> Asked {
        Asked { answer: None, stdout: String::new(), code: Some(code), stderr: stderr.into() }
    }

    #[test]
    fn tells_ssh_failures_apart() {
        assert_eq!(ssh_failure("ssh: connect to host 192.0.2.10 port 22: Connection timed out"), ProbeReason::Offline);
        assert_eq!(ssh_failure("ssh: Could not resolve hostname box: Der angegebene Host ist unbekannt."), ProbeReason::Offline);
        assert_eq!(
            ssh_failure("user@100.64.0.10: Permission denied (publickey,password,keyboard-interactive)."),
            ProbeReason::AuthFailed
        );
        let changed = "@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@\nHost key verification failed.";
        assert_eq!(ssh_failure(changed), ProbeReason::HostKeyChanged);
        let unknown =
            "No ED25519 host key is known for github.com and you have requested strict checking.\r\nHost key verification failed.";
        assert_eq!(ssh_failure(unknown), ProbeReason::HostKeyUnknown);
    }

    #[test]
    fn tells_a_missing_agentd_from_a_blocked_one_and_from_other_systems() {
        assert_eq!(presence_reason(&asked(0, "")), ProbeReason::AgentdBlocked);
        assert_eq!(presence_reason(&asked(1, "Datei nicht gefunden")), ProbeReason::NoAgentd);
        assert_eq!(presence_reason(&asked(1, "File Not Found")), ProbeReason::NoAgentd);
        assert_eq!(presence_reason(&asked(127, "bash: line 1: cmd: command not found")), ProbeReason::NotWindows);
        let github = "Hi alex! You've successfully authenticated, but GitHub does not provide shell access.";
        assert_eq!(presence_reason(&asked(1, github)), ProbeReason::NotWindows);
        assert_eq!(presence_reason(&asked(255, "Connection closed by 10.0.0.2 port 22")), ProbeReason::Offline);
    }

    #[test]
    fn names_the_machine_as_known_hosts_stores_it() {
        assert_eq!(known_host_in("user nexron\nhostname 100.64.0.10\nport 22\n").as_deref(), Some("100.64.0.10"));
        assert_eq!(known_host_in("hostname box\nport 2222\n").as_deref(), Some("[box]:2222"));
        assert_eq!(known_host_in("hostname box\nhostkeyalias pc\nport 22\n").as_deref(), Some("pc"));
        assert_eq!(known_host_in("hostname box\nhostkeyalias none\n").as_deref(), Some("box"));
    }

    #[test]
    fn keeps_the_last_lines_as_detail() {
        assert_eq!(detail_of("\n a \n\nb\nc\nd\n").as_deref(), Some("b\nc\nd"));
        assert_eq!(detail_of("  \n"), None);
    }

    /// A stand-in for ssh: a shell that answers like agentd's `stdio`.
    #[cfg(windows)]
    #[test]
    fn reads_the_wanted_answer_and_its_exit_code() {
        use std::os::windows::process::CommandExt;
        let mut hello = Command::new("cmd");
        hello.raw_arg(r#"/d /c "echo noise& echo {"type":"hello","id":1,"version":"0.1.0","os":"windows"}""#);
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
