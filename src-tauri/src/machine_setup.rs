//! Checks whether another machine can run Bull's chats. Every check is an ssh call whose answer
//! (agentd's `hello`, or ssh's complaint on stderr) is turned into one reason the assistant
//! explains; `machine_install` copies agentd over with the same calls. The first call asks which
//! system the machine runs (`machine_os`), the others are written for it.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::connections;
use crate::machine_os::{self, MachineOs, Platform, UNAME_COMMAND};
use crate::machines::{self, MachineEntry, MachineStore};

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
    /// Neither Windows, macOS nor Linux, or no shell at all (a Git host)
    UnsupportedSystem,
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
    /// The system it runs, once ssh got that far
    pub os: Option<MachineOs>,
}

impl Probe {
    pub(crate) fn failed(reason: ProbeReason, stderr: &str) -> Self {
        Self { reason, version: None, detail: detail_of(stderr), known_host: None, os: None }
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
    /// Stopped at the deadline, neither answered nor ended. The exit code then is the kill's
    /// (1 on Windows), not the remote command's.
    pub(crate) is_timed_out: bool,
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
pub(crate) fn ask(command: Command, line: &str, wanted: &str) -> io::Result<Asked> {
    ask_within(command, line, wanted, ASK_TIMEOUT)
}

/// `ask` with its own deadline, for calls that take longer than a check, such as a download.
pub(crate) fn ask_within(mut command: Command, line: &str, wanted: &str, timeout: Duration) -> io::Result<Asked> {
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
    let (answer, stdout, has_ended) = read_until(&lines, wanted, timeout);
    if !has_ended {
        // Answered or out of time: it should not run on.
        let _ = child.kill();
    }
    drop(stdin);
    let code = child.wait()?.code();
    let stderr = stderr.and_then(|reader| reader.join().ok()).unwrap_or_default();
    let is_timed_out = !has_ended && answer.is_none();
    Ok(Asked { answer, stdout, code, stderr, is_timed_out })
}

/// The wanted answer (an empty `wanted` reads to the end), the lines before it, and whether
/// stdout ended on its own.
fn read_until(lines: &mpsc::Receiver<String>, wanted: &str, timeout: Duration) -> (Option<Value>, String, bool) {
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

/// Finds the system, then asks the machine's agentd for `hello`; when it does not answer, a
/// further call finds out why.
pub fn probe(entry: &MachineEntry, should_accept_new_key: bool) -> Probe {
    let platform = match platform(entry, should_accept_new_key) {
        Ok(Some(platform)) => platform,
        Ok(None) => return Probe::failed(ProbeReason::UnsupportedSystem, ""),
        Err(failed) => return failed,
    };
    Probe { os: Some(platform.os), ..probe_agentd(entry, should_accept_new_key, platform.os) }
}

/// What `uname` says about the machine: `Ok(None)` for a system Bull does not run on, `Err` when
/// ssh got nowhere.
pub(crate) fn platform(entry: &MachineEntry, should_accept_new_key: bool) -> Result<Option<Platform>, Probe> {
    let asked = ask(ssh(entry, should_accept_new_key, UNAME_COMMAND), "", "")
        .map_err(|err| Probe::failed(ProbeReason::Offline, &err.to_string()))?;
    if asked.code == Some(SSH_FAILED) {
        return Err(ssh_failed(entry, &asked.stderr));
    }
    Ok(machine_os::platform_of(asked.code, &asked.stdout))
}

fn probe_agentd(entry: &MachineEntry, should_accept_new_key: bool, os: MachineOs) -> Probe {
    let asked = match ask(ssh(entry, should_accept_new_key, os.probe_command()), HELLO_LINE, "hello") {
        Ok(asked) => asked,
        Err(err) => return Probe::failed(ProbeReason::Offline, &err.to_string()),
    };
    if let Some(hello) = &asked.answer {
        let version = hello["version"].as_str().map(str::to_string);
        return Probe { version, ..Probe::failed(ProbeReason::Ok, "") };
    }
    if asked.code == Some(SSH_FAILED) {
        return ssh_failed(entry, &asked.stderr);
    }
    match ask(ssh(entry, should_accept_new_key, os.presence_command()), "", "") {
        Ok(presence) => {
            let reason = presence_reason(&presence);
            // A blocked agentd is explained by what starting it said, not by the presence check.
            let stderr = if reason == ProbeReason::AgentdBlocked { &asked.stderr } else { &presence.stderr };
            Probe::failed(reason, stderr)
        }
        Err(err) => Probe::failed(ProbeReason::Offline, &err.to_string()),
    }
}

fn ssh_failed(entry: &MachineEntry, stderr: &str) -> Probe {
    let reason = ssh_failure(stderr);
    let known_host = (reason == ProbeReason::HostKeyChanged).then(|| known_host_of(entry)).flatten();
    Probe { known_host, ..Probe::failed(reason, stderr) }
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
        return ProbeReason::UnsupportedSystem;
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

/// Checks a machine the user typed in or picked; it need not be in the list yet. A listed one
/// remembers the system found: its next connection speaks that system's shell.
#[tauri::command(async)]
pub fn test_machine(store: State<'_, MachineStore>, entry: MachineEntry) -> Result<Probe, machines::MachinesError> {
    let entry = machines::validated(entry)?;
    let probe = probe(&entry, true);
    if let Some(os) = probe.os {
        machines::remember_os(&store, &entry, os);
    }
    Ok(probe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asked(code: i32, stderr: &str) -> Asked {
        Asked { answer: None, stdout: String::new(), code: Some(code), stderr: stderr.into(), is_timed_out: false }
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
        assert_eq!(presence_reason(&asked(127, "bash: line 1: cmd: command not found")), ProbeReason::UnsupportedSystem);
        let github = "Hi alex! You've successfully authenticated, but GitHub does not provide shell access.";
        assert_eq!(presence_reason(&asked(1, github)), ProbeReason::UnsupportedSystem);
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
