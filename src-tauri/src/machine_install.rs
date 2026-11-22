//! Installs the agentd this app ships on another machine: refuses while chats run there, stops
//! the idle one, copies the new exe over and checks it answers.

use std::io;
use std::path::Path;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::connections::{self, Connections};
use crate::local_agentd;
use crate::machine_setup::{self, Probe, ProbeReason, SSH_FAILED, ask, detail_of, ssh, ssh_failure};
use crate::machines::{self, MachineEntry};

/// Window event with the step an install is at.
pub const INSTALL_EVENT: &str = "machine_install";

const PROCESSES_COMMAND: &str = r#"cmd /d /c tasklist /nh /fi "imagename eq agentd*""#;
const STOP_COMMAND: &str = r"cmd /d /c taskkill /f /im agentd*";
const FOLDER_COMMAND: &str = r"cmd /d /c if not exist .nexron-chat mkdir .nexron-chat";
/// A running exe cannot be overwritten but can be renamed: the new one never waits for a lock,
/// and the previous one stays beside it to go back to.
const BACKUP_COMMAND: &str =
    r"cmd /d /c if exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.exe .nexron-chat\agentd.old.exe";
const SWAP_COMMAND: &str = r"cmd /d /c move /y .nexron-chat\agentd.new.exe .nexron-chat\agentd.exe";
const RESTORE_COMMAND: &str =
    r"cmd /d /c if not exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.old.exe .nexron-chat\agentd.exe";
const STAGED_PATH: &str = ".nexron-chat/agentd.new.exe";

const RUNNING_LINE: &str = r#"{"op":"running","id":1}"#;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallStep {
    Checking,
    Stopping,
    Copying,
    Verifying,
}

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InstallError {
    #[error("{count} chats still run there")]
    TabsRunning { count: usize },
    #[error("agentd there does not say whether chats run")]
    TabsUnknown,
    #[error("machine not reachable: {reason:?}")]
    Unreachable { reason: ProbeReason, detail: Option<String> },
    #[error("copying agentd failed: {detail}")]
    CopyFailed { detail: String },
    #[error("invalid machine: {detail}")]
    Invalid { detail: String },
}

/// Copies `bundled` to the machine and checks it starts. Refuses while chats run there, or when it
/// cannot tell: stopping agentd would end them. `pause` keeps Bull's own connection away from the
/// exe being replaced; it is taken only once nothing speaks against the install, so a refusal
/// leaves open tabs connected.
fn install<P>(
    entry: &MachineEntry,
    bundled: &Path,
    pause: impl FnOnce() -> P,
    report: impl Fn(InstallStep),
) -> Result<Probe, InstallError> {
    report(InstallStep::Checking);
    let processes = ask(ssh(entry, true, PROCESSES_COMMAND), "", "").map_err(unreachable)?;
    if processes.code != Some(0) {
        let reason = if processes.code == Some(SSH_FAILED) { ssh_failure(&processes.stderr) } else { ProbeReason::NotWindows };
        return Err(InstallError::Unreachable { reason, detail: detail_of(&processes.stderr) });
    }
    // tasklist names each process; with none it says so in the system's language.
    let is_running = processes.stdout.to_lowercase().contains("agentd");
    if is_running {
        match running_tabs(entry) {
            Some(0) => {}
            Some(count) => return Err(InstallError::TabsRunning { count }),
            None => return Err(InstallError::TabsUnknown),
        }
    }
    let _paused = pause();
    if is_running {
        report(InstallStep::Stopping);
        // taskkill fails when agentd exited meanwhile; a copy that still finds it locked says so.
        let _ = run_checked(ssh(entry, true, STOP_COMMAND));
    }
    report(InstallStep::Copying);
    run_checked(ssh(entry, true, FOLDER_COMMAND))?;
    run_checked(scp(entry, bundled))?;
    run_checked(ssh(entry, true, BACKUP_COMMAND))?;
    if let Err(err) = run_checked(ssh(entry, true, SWAP_COMMAND)) {
        // Without this the machine would have no agentd.exe at all. Should the way back fail as
        // well, the swap's own error is the one that explains it.
        let _ = run_checked(ssh(entry, true, RESTORE_COMMAND));
        return Err(err);
    }
    report(InstallStep::Verifying);
    Ok(machine_setup::probe(entry, true))
}

fn unreachable(err: io::Error) -> InstallError {
    InstallError::Unreachable { reason: ProbeReason::Offline, detail: Some(err.to_string()) }
}

/// Tabs the machine's background server runs; `None` when it gives no answer (busy, too old to
/// know `running`, refused), since then nobody can promise that stopping it ends nothing.
fn running_tabs(entry: &MachineEntry) -> Option<usize> {
    ask(ssh(entry, true, connections::REMOTE_COMMAND), RUNNING_LINE, "running")
        .ok()
        .and_then(|asked| asked.answer)
        .and_then(|answer| answer["tabs"].as_array().map(Vec::len))
}

fn scp(entry: &MachineEntry, bundled: &Path) -> Command {
    let mut command = Command::new(connections::openssh_program("scp"));
    command.args(["-o", "BatchMode=yes", "-o", connections::SSH_CONNECT_TIMEOUT]);
    command.args(entry.port_args("-P")).arg(bundled).arg(format!("{}:{STAGED_PATH}", entry.destination()));
    command
}

fn run_checked(command: Command) -> Result<(), InstallError> {
    let asked = ask(command, "", "").map_err(|err| InstallError::CopyFailed { detail: err.to_string() })?;
    if asked.code == Some(0) {
        return Ok(());
    }
    Err(InstallError::CopyFailed { detail: detail_of(&asked.stderr).unwrap_or_default() })
}

#[derive(Clone, Serialize)]
struct InstallProgress<'a> {
    machine: &'a str,
    step: InstallStep,
}

/// Installs the agentd this app ships. Bull's own connection to the machine waits meanwhile, so
/// it neither starts the old agentd again nor locks the file being replaced.
#[tauri::command(async)]
pub fn install_agentd(app: AppHandle, connections: State<'_, Connections>, entry: MachineEntry) -> Result<Probe, InstallError> {
    let entry = machines::validated(entry).map_err(|err| InstallError::Invalid { detail: err.to_string() })?;
    let bundled = local_agentd::bundled_exe().map_err(|err| InstallError::CopyFailed { detail: err.to_string() })?;
    install(&entry, &bundled, || connections.pause(&entry.name), |step| {
        // A closed window has nobody left to show the step to.
        let _ = app.emit(INSTALL_EVENT, InstallProgress { machine: &entry.name, step });
    })
}
