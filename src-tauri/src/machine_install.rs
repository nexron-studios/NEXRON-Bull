//! Installs agentd on another machine: refuses while chats run there, stops the idle one, puts the
//! new exe in place and checks it answers. A Windows machine gets the sidecar this app ships when
//! the app is a Windows build as well. Every other pairing has the machine download the agentd of
//! the app's own version from the GitHub release: the app carries only its own system's build.

use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::connections::{self, Connections};
use crate::local_agentd;
use crate::machine_os::{MachineOs, Platform};
use crate::machine_setup::{self, Asked, Probe, ProbeReason, SSH_FAILED, ask, detail_of, ssh, ssh_failure};
use crate::machines::{self, MachineEntry, MachineStore};

/// Window event with the step an install is at.
pub const INSTALL_EVENT: &str = "machine_install";

/// Where the release workflow uploads `agentd-<target>` for every tag `v<version>`.
const RELEASE_DOWNLOADS: &str = "https://github.com/nexron-studios/NEXRON-Bull/releases/download";
const WINDOWS_SUFFIX: &str = ".exe";

const FOLDER_COMMAND: &str = r"cmd /d /c if not exist .nexron-chat mkdir .nexron-chat";
/// A running exe cannot be overwritten but can be renamed: the new one never waits for a lock,
/// and the previous one stays beside it to go back to.
const BACKUP_COMMAND: &str =
    r"cmd /d /c if exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.exe .nexron-chat\agentd.old.exe";
const SWAP_COMMAND: &str = r"cmd /d /c move /y .nexron-chat\agentd.new.exe .nexron-chat\agentd.exe";
const RESTORE_COMMAND: &str =
    r"cmd /d /c if not exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.old.exe .nexron-chat\agentd.exe";
const STAGED_PATH: &str = ".nexron-chat/agentd.new.exe";
/// What the unix install line exits with when the download failed, to tell it from a failed rename.
const DOWNLOAD_FAILED: i32 = 3;
/// pgrep's answer when no process matches.
const NO_PROCESS: i32 = 1;

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
    #[error("downloading {url} failed: {detail}")]
    DownloadFailed { url: String, detail: String },
    #[error("invalid machine: {detail}")]
    Invalid { detail: String },
}

/// How the new agentd gets onto the machine.
#[derive(Debug, PartialEq, Eq)]
enum Delivery {
    /// The sidecar of this app, copied over with scp
    BundledToWindows(PathBuf),
    /// The release asset at this URL, downloaded by the machine itself
    ReleaseToWindows(String),
    ReleaseToUnix(String),
}

/// The app's own sidecar only fits a machine of the same system; Bull ships no other builds.
fn delivery_for(platform: Platform, is_windows_app: bool, bundled: &Path, version: &str) -> Result<Delivery, InstallError> {
    if platform.os.is_windows() && is_windows_app {
        return Ok(Delivery::BundledToWindows(bundled.to_path_buf()));
    }
    let target = platform.release_target.ok_or(InstallError::Unreachable { reason: ProbeReason::UnsupportedSystem, detail: None })?;
    let url = format!("{RELEASE_DOWNLOADS}/v{version}/agentd-{target}");
    Ok(match platform.os {
        MachineOs::Windows => Delivery::ReleaseToWindows(format!("{url}{WINDOWS_SUFFIX}")),
        MachineOs::Macos | MachineOs::Linux => Delivery::ReleaseToUnix(url),
    })
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
        .map_err(|failed| InstallError::Unreachable { reason: failed.reason, detail: failed.detail })?
        .ok_or(InstallError::Unreachable { reason: ProbeReason::UnsupportedSystem, detail: None })?;
    let delivery = delivery_for(platform, cfg!(windows), bundled, version)?;
    let is_running = is_agentd_running(entry, platform.os)?;
    if is_running {
        match running_tabs(entry, platform.os) {
            Some(0) => {}
            Some(count) => return Err(InstallError::TabsRunning { count }),
            None => return Err(InstallError::TabsUnknown),
        }
    }
    let _paused = pause();
    if is_running {
        report(InstallStep::Stopping);
        // Fails when agentd exited meanwhile; on Windows a copy that still finds it locked says so.
        let _ = run_checked(ssh(entry, true, platform.os.stop_command()));
    }
    report(InstallStep::Copying);
    match &delivery {
        Delivery::BundledToWindows(bundled) => put_on_windows(entry, scp(entry, bundled), None)?,
        Delivery::ReleaseToWindows(url) => {
            // curl.exe ships with Windows 10 and later.
            let download = format!(r"cmd /d /c curl.exe -fsSL -o .nexron-chat\agentd.new.exe {url}");
            put_on_windows(entry, ssh(entry, true, &download), Some(url))?;
        }
        Delivery::ReleaseToUnix(url) => put_on_unix(entry, url)?,
    }
    report(InstallStep::Verifying);
    Ok(machine_setup::probe(entry, true))
}

fn unreachable(err: io::Error) -> InstallError {
    InstallError::Unreachable { reason: ProbeReason::Offline, detail: Some(err.to_string()) }
}

fn is_agentd_running(entry: &MachineEntry, os: MachineOs) -> Result<bool, InstallError> {
    let processes = ask(ssh(entry, true, os.processes_command()), "", "").map_err(unreachable)?;
    if processes.code == Some(SSH_FAILED) {
        return Err(InstallError::Unreachable { reason: ssh_failure(&processes.stderr), detail: detail_of(&processes.stderr) });
    }
    Ok(is_running_in(os, &processes))
}

/// When the process list gives no clear "none", agentd itself is asked whether chats run.
fn is_running_in(os: MachineOs, processes: &Asked) -> bool {
    match os {
        // tasklist names each process; with none it says so in the system's language.
        MachineOs::Windows => processes.code != Some(0) || processes.stdout.to_lowercase().contains("agentd"),
        MachineOs::Macos | MachineOs::Linux => processes.code != Some(NO_PROCESS),
    }
}

/// Tabs the machine's background server runs; `None` when it gives no answer (busy, too old to
/// know `running`, refused), since then nobody can promise that stopping it ends nothing.
fn running_tabs(entry: &MachineEntry, os: MachineOs) -> Option<usize> {
    ask(ssh(entry, true, os.connect_command()), RUNNING_LINE, "running")
        .ok()
        .and_then(|asked| asked.answer)
        .and_then(|answer| answer["tabs"].as_array().map(Vec::len))
}

/// `fetch` puts the new exe at `STAGED_PATH`; `url` names the download it makes, if it is one.
fn put_on_windows(entry: &MachineEntry, fetch: Command, url: Option<&String>) -> Result<(), InstallError> {
    run_checked(ssh(entry, true, FOLDER_COMMAND))?;
    run_checked(fetch).map_err(|err| match (url, err) {
        (Some(url), InstallError::CopyFailed { detail }) => InstallError::DownloadFailed { url: url.clone(), detail },
        (_, other) => other,
    })?;
    run_checked(ssh(entry, true, BACKUP_COMMAND))?;
    if let Err(err) = run_checked(ssh(entry, true, SWAP_COMMAND)) {
        // Without this the machine would have no agentd.exe at all. Should the way back fail as
        // well, the swap's own error is the one that explains it.
        let _ = run_checked(ssh(entry, true, RESTORE_COMMAND));
        return Err(err);
    }
    Ok(())
}

fn put_on_unix(entry: &MachineEntry, url: &str) -> Result<(), InstallError> {
    let asked = ask(ssh(entry, true, &unix_install_command(url)), "", "").map_err(unreachable)?;
    let detail = detail_of(&asked.stderr).unwrap_or_default();
    match asked.code {
        Some(0) => Ok(()),
        Some(SSH_FAILED) => Err(InstallError::Unreachable { reason: ssh_failure(&asked.stderr), detail: Some(detail) }),
        Some(DOWNLOAD_FAILED) => Err(InstallError::DownloadFailed { url: url.to_string(), detail }),
        _ => Err(InstallError::CopyFailed { detail }),
    }
}

/// Downloads to a temporary name and renames it over the old agentd, which a running server keeps
/// using until it exits. The previous one stays as `agentd.old`. A failed download changes
/// nothing. `sh` whatever the login shell is; no single quote inside, so fish reads it the same.
fn unix_install_command(url: &str) -> String {
    format!(
        r#"sh -c 'set -e; dir="$HOME/.nexron-chat"; staged="$dir/agentd.download"; trap "rm -f \"$staged\"" EXIT; mkdir -p "$dir"; if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$staged" "{url}" || exit {DOWNLOAD_FAILED}; else wget -q -O "$staged" "{url}" || exit {DOWNLOAD_FAILED}; fi; chmod 755 "$staged"; if [ -f "$dir/agentd" ]; then cp -pf "$dir/agentd" "$dir/agentd.old"; fi; mv -f "$staged" "$dir/agentd"'"#
    )
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
    let bundled = local_agentd::bundled_exe().map_err(|err| InstallError::CopyFailed { detail: err.to_string() })?;
    let version = app.package_info().version.to_string();
    let probe = install(&entry, &bundled, &version, || connections.pause(&entry.name), |step| {
        // A closed window has nobody left to show the step to.
        let _ = app.emit(INSTALL_EVENT, InstallProgress { machine: &entry.name, step });
    })?;
    if let Some(os) = probe.os {
        store.record_os(&entry, os).map_err(|err| InstallError::CopyFailed { detail: err.to_string() })?;
    }
    Ok(probe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn platform(os: MachineOs, release_target: Option<&'static str>) -> Platform {
        Platform { os, release_target }
    }

    fn processes(code: i32, stdout: &str) -> Asked {
        Asked { answer: None, stdout: stdout.into(), code: Some(code), stderr: String::new() }
    }

    #[test]
    fn a_windows_app_copies_its_own_agentd_to_windows() {
        let windows = platform(MachineOs::Windows, Some("x86_64-pc-windows-msvc"));
        let delivery = delivery_for(windows, true, Path::new("agentd.exe"), "0.8.0").unwrap();
        assert_eq!(delivery, Delivery::BundledToWindows(PathBuf::from("agentd.exe")));
    }

    #[test]
    fn other_pairings_download_the_release_of_the_app_version() {
        let mac = platform(MachineOs::Macos, Some("aarch64-apple-darwin"));
        assert_eq!(
            delivery_for(mac, true, Path::new("agentd.exe"), "0.8.0").unwrap(),
            Delivery::ReleaseToUnix("https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-aarch64-apple-darwin".into())
        );
        let windows = platform(MachineOs::Windows, Some("x86_64-pc-windows-msvc"));
        assert_eq!(
            delivery_for(windows, false, Path::new("agentd"), "0.8.0").unwrap(),
            Delivery::ReleaseToWindows(
                "https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-x86_64-pc-windows-msvc.exe".into()
            )
        );
    }

    #[test]
    fn a_processor_without_a_build_is_refused_before_anything_stops() {
        let arm32 = platform(MachineOs::Linux, None);
        let refused = delivery_for(arm32, true, Path::new("agentd.exe"), "0.8.0");
        assert!(matches!(refused, Err(InstallError::Unreachable { reason: ProbeReason::UnsupportedSystem, .. })));
    }

    #[test]
    fn reads_whether_agentd_runs() {
        assert!(is_running_in(MachineOs::Linux, &processes(0, "4242\n")));
        assert!(!is_running_in(MachineOs::Macos, &processes(1, "")));
        // pgrep missing: agentd itself has to say.
        assert!(is_running_in(MachineOs::Linux, &processes(127, "")));
        assert!(is_running_in(MachineOs::Windows, &processes(0, "agentd.exe  4242 Console\n")));
        assert!(!is_running_in(MachineOs::Windows, &processes(0, "INFORMATION: No tasks are running\n")));
    }

    #[test]
    fn the_unix_install_line_downloads_beside_and_renames_over() {
        let line = unix_install_command("https://example.org/agentd-x");
        assert!(line.starts_with(r#"sh -c 'set -e; dir="$HOME/.nexron-chat"; "#));
        assert!(line.contains(r#"curl -fsSL -o "$staged" "https://example.org/agentd-x" || exit 3;"#));
        assert!(line.ends_with(r#"cp -pf "$dir/agentd" "$dir/agentd.old"; fi; mv -f "$staged" "$dir/agentd"'"#));
        // One single-quoted argument for the login shell, whatever shell that is.
        assert_eq!(line.matches('\'').count(), 2);
    }

    /// The install line run by a real `sh`, against a file URL instead of GitHub.
    #[cfg(unix)]
    #[test]
    fn the_unix_install_line_keeps_the_old_agentd() {
        let home = std::env::temp_dir().join(format!("nexron-chat-unix-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(home.join(".nexron-chat")).unwrap();
        std::fs::write(home.join(".nexron-chat/agentd"), "old").unwrap();
        std::fs::write(home.join("new-build"), "new").unwrap();
        let url = format!("file://{}", home.join("new-build").display());
        let line = unix_install_command(&url);
        let script = line.strip_prefix("sh -c '").unwrap().strip_suffix('\'').unwrap();
        let status = Command::new("sh").args(["-c", script]).env("HOME", &home).status().unwrap();
        assert!(status.success());
        assert_eq!(std::fs::read_to_string(home.join(".nexron-chat/agentd")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(home.join(".nexron-chat/agentd.old")).unwrap(), "old");
        assert!(!home.join(".nexron-chat/agentd.download").exists());
    }
}
