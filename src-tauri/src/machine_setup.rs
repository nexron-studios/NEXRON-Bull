//! Checks whether another machine can run Bull's chats. Every check is an ssh call whose answer
//! (agentd's `hello`, or ssh's complaint on stderr) is turned into one reason the assistant
//! explains; `machine_install` copies agentd over with the same calls. The first call asks which
//! system the machine runs (`machine_os`), the others are written for it.

use std::net::IpAddr;
use std::process::Command;

use serde::Serialize;
use tauri::State;

use crate::connections;
use crate::machine_os::{self, MachineOs, Platform, UNAME_COMMAND};
use crate::machines::{self, MachineEntry, MachineStore};
use crate::remote_call::{Asked, ask, ssh};

const HELLO_LINE: &str = r#"{"op":"hello","id":1}"#;
/// ssh's own exit code for its failures; anything else is the remote command's.
pub(crate) const SSH_FAILED: i32 = 255;
const SHELL_COMMAND_MISSING: i32 = 127;
const DEFAULT_SSH_PORT: &str = "22";
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
    /// A probe that got as far as `reason`, explained by the last lines of `stderr`.
    pub(crate) fn of(reason: ProbeReason, stderr: &str) -> Self {
        Self { reason, version: None, detail: detail_of(stderr), known_host: None, os: None }
    }
}

/// Finds the system, then asks the machine's agentd for `hello`; when it does not answer, a
/// further call finds out why.
pub fn probe(entry: &MachineEntry, should_accept_new_key: bool) -> Probe {
    match platform(entry, should_accept_new_key) {
        Ok(platform) => probe_agentd(entry, should_accept_new_key, platform.os),
        Err(failed) => failed,
    }
}

/// What `uname` says about the machine. `Err` when ssh got nowhere or the machine runs a system
/// Bull does not run on.
pub(crate) fn platform(entry: &MachineEntry, should_accept_new_key: bool) -> Result<Platform, Probe> {
    let asked = ask(ssh(entry, should_accept_new_key, UNAME_COMMAND), "", "")
        .map_err(|err| Probe::of(ProbeReason::Offline, &err.to_string()))?;
    if asked.code == Some(SSH_FAILED) {
        return Err(ssh_failed(entry, &asked.stderr));
    }
    machine_os::platform_of(asked.code, &asked.stdout).ok_or_else(|| Probe::of(ProbeReason::UnsupportedSystem, ""))
}

/// Asks agentd on a machine whose system is known for `hello`, after an install or as the rest
/// of a check.
pub(crate) fn probe_agentd(entry: &MachineEntry, should_accept_new_key: bool, os: MachineOs) -> Probe {
    Probe { os: Some(os), ..agentd_answer(entry, should_accept_new_key, os) }
}

fn agentd_answer(entry: &MachineEntry, should_accept_new_key: bool, os: MachineOs) -> Probe {
    let asked = match ask(ssh(entry, should_accept_new_key, os.probe_command()), HELLO_LINE, "hello") {
        Ok(asked) => asked,
        Err(err) => return Probe::of(ProbeReason::Offline, &err.to_string()),
    };
    if let Some(hello) = &asked.answer {
        let version = hello["version"].as_str().map(str::to_string);
        return Probe { version, ..Probe::of(ProbeReason::Ok, "") };
    }
    if asked.code == Some(SSH_FAILED) {
        return ssh_failed(entry, &asked.stderr);
    }
    match ask(ssh(entry, should_accept_new_key, os.presence_command()), "", "") {
        Ok(presence) => {
            let reason = presence_reason(&presence);
            // A blocked agentd is explained by what starting it said, not by the presence check.
            let stderr = if reason == ProbeReason::AgentdBlocked { &asked.stderr } else { &presence.stderr };
            Probe::of(reason, stderr)
        }
        Err(err) => Probe::of(ProbeReason::Offline, &err.to_string()),
    }
}

fn ssh_failed(entry: &MachineEntry, stderr: &str) -> Probe {
    let reason = ssh_failure(stderr);
    let known_host = (reason == ProbeReason::HostKeyChanged).then(|| known_host_of(entry)).flatten();
    Probe { known_host, ..Probe::of(reason, stderr) }
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
    known_host_in(&ssh_config_of(entry)?)
}

/// What `ssh -G` makes of the machine: one `key value` line per option.
fn ssh_config_of(entry: &MachineEntry) -> Option<String> {
    let mut command = Command::new(connections::ssh_program());
    command.arg("-G").args(entry.ssh_args());
    Some(ask(command, "", "").ok()?.stdout)
}

fn config_value(config: &str, key: &str) -> Option<String> {
    config.lines().find_map(|line| {
        let (name, value) = line.split_once(' ')?;
        name.eq_ignore_ascii_case(key).then(|| value.trim().to_string())
    })
}

/// `hostkeyalias` wins over `hostname`; a port other than 22 is stored as `[host]:port`.
fn known_host_in(config: &str) -> Option<String> {
    let value = |key: &str| config_value(config, key);
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
        store.remember_os(&entry, os);
    }
    Ok(probe)
}

/// The host ssh connects to directly, from `ssh -G`. `None` behind a proxy (the host may not be
/// reachable from here) or for a loopback `HostName` (a forwarded port into a VM or WSL): there
/// `localhost` would show this machine's page under the other machine's name.
fn direct_host_in(config: &str) -> Option<String> {
    let value = |key: &str| config_value(config, key).filter(|value| value != "none");
    if value("proxyjump").is_some() || value("proxycommand").is_some() {
        return None;
    }
    value("hostname").filter(|host| !is_loopback_host(host))
}

fn is_loopback_host(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    match bare.parse::<IpAddr>() {
        Ok(ip) => ip.is_loopback() || ip.is_unspecified(),
        Err(_) => {
            let name = bare.to_ascii_lowercase();
            name == "localhost" || name.ends_with(".localhost")
        }
    }
}

/// The host ssh really connects to for a machine (`HostName`, the alias resolved), for the
/// preview: a dev server's `localhost` there is that host from here. `None` when ssh cannot say
/// or the machine is not directly reachable (`direct_host_in`).
#[tauri::command(async)]
pub fn machine_host_name(name: String) -> Result<Option<String>, machines::MachinesError> {
    let entry = machines::resolve(&name)?;
    Ok(ssh_config_of(&entry).and_then(|config| direct_host_in(&config)))
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
    fn takes_a_direct_host_name() {
        let config = "hostname devbox.example
proxycommand none
";
        assert_eq!(direct_host_in(config).as_deref(), Some("devbox.example"));
    }

    #[test]
    fn refuses_a_host_behind_a_proxy() {
        assert_eq!(direct_host_in("hostname devbox.example
proxyjump gate.example
"), None);
        assert_eq!(direct_host_in("hostname devbox.example
proxycommand nc %h %p
"), None);
    }

    #[test]
    fn refuses_a_loopback_host_name() {
        for host in ["localhost", "127.0.0.1", "127.0.1.1", "::1", "[::1]", "0.0.0.0", "vm.localhost"] {
            assert_eq!(direct_host_in(&format!("hostname {host}
port 2222
")), None, "{host}");
        }
    }

    #[test]
    fn reads_one_option_of_ssh_g() {
        let config = "user dev
hostname devbox.example
port 22
";
        assert_eq!(config_value(config, "hostname").as_deref(), Some("devbox.example"));
        assert_eq!(config_value(config, "HostName").as_deref(), Some("devbox.example"));
        assert_eq!(config_value(config, "proxyjump"), None);
    }

    #[test]
    fn keeps_the_last_lines_as_detail() {
        assert_eq!(detail_of("\n a \n\nb\nc\nd\n").as_deref(), Some("b\nc\nd"));
        assert_eq!(detail_of("  \n"), None);
    }
}
