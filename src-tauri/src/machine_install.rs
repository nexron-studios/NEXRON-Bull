//! Installs agentd on another machine: refuses while chats run there, stops the idle one, puts the
//! new exe in place and checks it answers. A Windows machine gets the sidecar this app ships when
//! the app is a Windows build as well. Every other pairing has the machine download the agentd of
//! the app's own version from the GitHub release: the app carries only its own system's build.
//! The shell lines themselves live in `machine_os`; this module orders them and names failures.

use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::connections::{self, Connections};
use crate::local_agentd;
use crate::machine_os::{DOWNLOAD_FAILED, MachineOs, Platform, windows_install};
use crate::machine_setup::{self, Probe, ProbeReason, SSH_FAILED, detail_of, ssh_failure};
use crate::machines::{self, MachineEntry, MachineStore};
use crate::remote_call::{Asked, ask, ask_within, ssh};

/// Window event with the step an install is at.
pub const INSTALL_EVENT: &str = "machine_install";

/// A download or copy of agentd (a few MB) over a slow link or relay takes far longer than a
/// check may.
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(180);

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
    /// The machine did not get through the check: unreachable, refused, or a system without a
    /// build of agentd.
    #[error("the check of the machine failed: {reason:?}")]
    CheckFailed { reason: ProbeReason, detail: Option<String> },
    #[error("this app cannot find its own agentd: {detail}")]
    OwnAgentdMissing { detail: String },
    #[error("copying agentd failed: {detail}")]
    CopyFailed { detail: String },
    #[error("downloading {url} failed: {detail}")]
    DownloadFailed { url: String, detail: String },
    #[error("invalid machine: {detail}")]
    Invalid { detail: String },
}

/// How the new agentd gets onto the machine.
#[derive(Debug, PartialEq, Eq)]
enum Delivery {
    /// The sidecar of this app, copied over with scp
    Bundled(PathBuf),
    /// The release asset at this URL, downloaded by the machine itself
    Release(String),
}

/// The app's own sidecar only fits a machine of the same system; Bull ships no other builds.
fn delivery_for(platform: Platform, is_windows_app: bool, bundled: &Path, version: &str) -> Result<Delivery, InstallError> {
    if platform.os.is_windows() && is_windows_app {
        return Ok(Delivery::Bundled(bundled.to_path_buf()));
    }
    let url = platform.release_url(version);
    url.map(Delivery::Release).ok_or(InstallError::CheckFailed { reason: ProbeReason::UnsupportedSystem, detail: None })
}

/// Puts the new agentd on the machine and checks it starts. Refuses while chats run there, or
/// when it cannot tell: stopping agentd would end them. `pause` keeps Bull's own connection away
/// from the exe being replaced; it is taken only once nothing speaks against the install, so a
/// refusal leaves open tabs connected.
fn install<P>(
    entry: &MachineEntry,
    bundled: &Path,
    version: &str,
    pause: impl FnOnce() -> P,
    report: impl Fn(InstallStep),
) -> Result<Probe, InstallError> {
    report(InstallStep::Checking);
    let platform = machine_setup::platform(entry, true)
        .map_err(|failed| InstallError::CheckFailed { reason: failed.reason, detail: failed.detail })?;
    let os = platform.os;
    let delivery = delivery_for(platform, cfg!(windows), bundled, version)?;
    let is_running = is_agentd_running(entry, os)?;
    if is_running {
        match running_tabs(entry, os) {
            Some(0) => {}
            Some(count) => return Err(InstallError::TabsRunning { count }),
            None => return Err(InstallError::TabsUnknown),
        }
    }
    let _paused = pause();
    if is_running {
        report(InstallStep::Stopping);
        // Fails when agentd exited meanwhile; on Windows a copy that still finds it locked says so.
        let _ = run_checked(ssh(entry, true, os.stop_command()));
    }
    report(InstallStep::Copying);
    match &delivery {
        Delivery::Bundled(bundled) => put_on_windows(entry, scp(entry, bundled), None)?,
        Delivery::Release(url) if os.is_windows() => {
            put_on_windows(entry, ssh(entry, true, &os.install_command(url)), Some(url))?;
        }
        Delivery::Release(url) => put_on_unix(entry, os, url)?,
    }
    report(InstallStep::Verifying);
    Ok(machine_setup::probe_agentd(entry, true, os))
}

fn offline(err: io::Error) -> InstallError {
    InstallError::CheckFailed { reason: ProbeReason::Offline, detail: Some(err.to_string()) }
}

fn is_agentd_running(entry: &MachineEntry, os: MachineOs) -> Result<bool, InstallError> {
    let processes = ask(ssh(entry, true, os.processes_command()), "", "").map_err(offline)?;
    if processes.code == Some(SSH_FAILED) {
        return Err(InstallError::CheckFailed { reason: ssh_failure(&processes.stderr), detail: detail_of(&processes.stderr) });
    }
    Ok(os.agentd_runs(processes.code, &processes.stdout))
}

/// Tabs the machine's background server runs; `None` when it gives no answer (busy, too old to
/// know `running`, refused), since then nobody can promise that stopping it ends nothing.
fn running_tabs(entry: &MachineEntry, os: MachineOs) -> Option<usize> {
    ask(ssh(entry, true, os.connect_command()), RUNNING_LINE, "running")
        .ok()
        .and_then(|asked| asked.answer)
        .and_then(|answer| answer["tabs"].as_array().map(Vec::len))
}

/// `fetch` puts the new exe at `windows_install::STAGED_PATH`; `url` names the download it makes,
/// if it is one.
fn put_on_windows(entry: &MachineEntry, fetch: Command, url: Option<&str>) -> Result<(), InstallError> {
    run_checked(ssh(entry, true, windows_install::FOLDER_COMMAND))?;
    run_checked_within(fetch, TRANSFER_TIMEOUT).map_err(|err| match (url, err) {
        (Some(url), InstallError::CopyFailed { detail }) => InstallError::DownloadFailed { url: url.to_string(), detail },
        (_, other) => other,
    })?;
    run_checked(ssh(entry, true, windows_install::BACKUP_COMMAND))?;
    if let Err(err) = run_checked(ssh(entry, true, windows_install::SWAP_COMMAND)) {
        // Without this the machine would have no agentd.exe at all. Should the way back fail as
        // well, the swap's own error is the one that explains it.
        let _ = run_checked(ssh(entry, true, windows_install::RESTORE_COMMAND));
        return Err(err);
    }
    Ok(())
}

fn put_on_unix(entry: &MachineEntry, os: MachineOs, url: &str) -> Result<(), InstallError> {
    let asked = ask_within(ssh(entry, true, &os.install_command(url)), "", "", TRANSFER_TIMEOUT).map_err(offline)?;
    unix_install_outcome(&asked, url)
}

fn unix_install_outcome(asked: &Asked, url: &str) -> Result<(), InstallError> {
    if asked.is_timed_out {
        return Err(InstallError::DownloadFailed { url: url.to_string(), detail: timed_out_detail() });
    }
    let detail = detail_of(&asked.stderr).unwrap_or_default();
    match asked.code {
        Some(0) => Ok(()),
        Some(SSH_FAILED) => Err(InstallError::CheckFailed { reason: ssh_failure(&asked.stderr), detail: Some(detail) }),
        Some(DOWNLOAD_FAILED) => Err(InstallError::DownloadFailed { url: url.to_string(), detail }),
        _ => Err(InstallError::CopyFailed { detail }),
    }
}

fn timed_out_detail() -> String {
    format!("no end after {} s", TRANSFER_TIMEOUT.as_secs())
}

fn scp(entry: &MachineEntry, bundled: &Path) -> Command {
    let mut command = Command::new(connections::openssh_program("scp"));
    command.args(["-o", "BatchMode=yes", "-o", connections::SSH_CONNECT_TIMEOUT]);
    let target = format!("{}:{}", entry.destination(), windows_install::STAGED_PATH);
    command.args(entry.port_args("-P")).arg(bundled).arg(target);
    command
}

fn run_checked(command: Command) -> Result<(), InstallError> {
    checked(ask(command, "", ""))
}

fn run_checked_within(command: Command, timeout: Duration) -> Result<(), InstallError> {
    checked(ask_within(command, "", "", timeout))
}

fn checked(asked: io::Result<Asked>) -> Result<(), InstallError> {
    let asked = asked.map_err(|err| InstallError::CopyFailed { detail: err.to_string() })?;
    if asked.is_timed_out {
        return Err(InstallError::CopyFailed { detail: timed_out_detail() });
    }
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

/// Installs the agentd of this app's version. Bull's own connection to the machine waits
/// meanwhile, so it neither starts the old agentd again nor locks the file being replaced.
#[tauri::command(async)]
pub fn install_agentd(
    app: AppHandle,
    connections: State<'_, Connections>,
    store: State<'_, MachineStore>,
    entry: MachineEntry,
) -> Result<Probe, InstallError> {
    let entry = machines::validated(entry).map_err(|err| InstallError::Invalid { detail: err.to_string() })?;
    let bundled = local_agentd::bundled_exe().map_err(|err| InstallError::OwnAgentdMissing { detail: err.to_string() })?;
    let version = app.package_info().version.to_string();
    let probe = install(&entry, &bundled, &version, || connections.pause(&entry.name), |step| {
        // A closed window has nobody left to show the step to.
        let _ = app.emit(INSTALL_EVENT, InstallProgress { machine: &entry.name, step });
    })?;
    if let Some(os) = probe.os {
        store.remember_os(&entry, os);
    }
    Ok(probe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn platform(os: MachineOs, release_target: Option<&'static str>) -> Platform {
        Platform { os, release_target }
    }

    fn asked(code: i32) -> Asked {
        Asked { answer: None, stdout: String::new(), code: Some(code), stderr: String::new(), is_timed_out: false }
    }

    #[test]
    fn a_windows_app_copies_its_own_agentd_to_windows() {
        let windows = platform(MachineOs::Windows, Some("x86_64-pc-windows-msvc"));
        let delivery = delivery_for(windows, true, Path::new("agentd.exe"), "0.8.0").unwrap();
        assert_eq!(delivery, Delivery::Bundled(PathBuf::from("agentd.exe")));
    }

    #[test]
    fn other_pairings_download_the_release_of_the_app_version() {
        let mac = platform(MachineOs::Macos, Some("aarch64-apple-darwin"));
        assert_eq!(
            delivery_for(mac, true, Path::new("agentd.exe"), "0.8.0").unwrap(),
            Delivery::Release("https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-aarch64-apple-darwin".into())
        );
        let windows = platform(MachineOs::Windows, Some("x86_64-pc-windows-msvc"));
        assert_eq!(
            delivery_for(windows, false, Path::new("agentd"), "0.8.0").unwrap(),
            Delivery::Release(
                "https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-x86_64-pc-windows-msvc.exe".into()
            )
        );
    }

    #[test]
    fn a_processor_without_a_build_is_refused_before_anything_stops() {
        let arm32 = platform(MachineOs::Linux, None);
        let refused = delivery_for(arm32, true, Path::new("agentd.exe"), "0.8.0");
        assert!(matches!(refused, Err(InstallError::CheckFailed { reason: ProbeReason::UnsupportedSystem, .. })));
    }

    #[test]
    fn a_download_that_runs_out_of_time_is_a_failed_download() {
        let url = "https://example.org/agentd-x";
        // Killed at the deadline: Windows reports the kill's exit code 1, not the script's.
        let killed = Asked { is_timed_out: true, ..asked(1) };
        let failure = unix_install_outcome(&killed, url).unwrap_err();
        assert!(
            matches!(&failure, InstallError::DownloadFailed { url: failed, detail } if failed == url && detail == "no end after 180 s"),
            "{failure:?}"
        );
        assert!(matches!(unix_install_outcome(&asked(3), url), Err(InstallError::DownloadFailed { .. })));
        assert!(matches!(unix_install_outcome(&asked(1), url), Err(InstallError::CopyFailed { .. })));
        assert!(unix_install_outcome(&asked(0), url).is_ok());
    }
}
