//! The agentd for this machine. The app ships it as a sidecar next to its own exe, but runs it
//! from a copy in `~/.nexron-chat`, the folder other machines use too: a running `agentd serve`
//! locks its exe, and an app update or rebuild must never fail because of that.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::connections::home_folder;

const DATA_FOLDER: &str = ".nexron-chat";

#[derive(Debug, thiserror::Error)]
pub enum LocalAgentdError {
    #[error("home folder unknown")]
    NoHome,
    #[error("cannot install agentd from {0}: {1}")]
    Install(PathBuf, io::Error),
}

fn exe_name() -> String {
    format!("agentd{}", std::env::consts::EXE_SUFFIX)
}

/// tauri-build puts the sidecar next to the app exe, in dev and in an installed app alike.
pub(crate) fn bundled_exe() -> io::Result<PathBuf> {
    Ok(std::env::current_exe()?.with_file_name(exe_name()))
}

/// The copy to start `connect` from; `connect` starts the server from its own path, so the
/// server runs from it as well.
///
/// shortcut: a server still running from an older copy keeps serving, whatever version its
/// `hello` reports; it exits once idle and the next connect starts the new one. Upgrade it
/// actively once the protocol changes in a way an older server cannot answer.
pub fn installed_exe() -> Result<PathBuf, LocalAgentdError> {
    let installed = home_folder()
        .ok_or(LocalAgentdError::NoHome)?
        .join(DATA_FOLDER)
        .join(exe_name());
    match bundled_exe().and_then(|bundled| install(&bundled, &installed)) {
        Ok(()) => Ok(installed),
        Err(err) if installed.is_file() => {
            eprintln!(
                "warning: keeping {} instead of the bundled agentd, an older server may still run from it: {err}",
                installed.display()
            );
            Ok(installed)
        }
        Err(err) => Err(LocalAgentdError::Install(installed, err)),
    }
}

/// Replaces `target` with `source` unless both are the same. Written beside it and renamed, so
/// a running exe is never half overwritten: Windows refuses the rename, Unix keeps the old file
/// for the process that runs it.
fn install(source: &Path, target: &Path) -> io::Result<()> {
    let wanted = fs::read(source)?;
    if is_same_content(&wanted, target)? {
        return Ok(());
    }
    if let Some(folder) = target.parent() {
        fs::create_dir_all(folder)?;
    }
    let staged = target.with_extension("new");
    // Written, not `fs::copy`: on macOS that carries the app's quarantine flag over, and Gatekeeper
    // then refuses to run the copy outside the app bundle.
    fs::write(&staged, wanted)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        const EXECUTABLE: u32 = 0o755;
        fs::set_permissions(&staged, fs::Permissions::from_mode(EXECUTABLE))?;
    }
    fs::rename(&staged, target).inspect_err(|_| {
        if let Err(err) = fs::remove_file(&staged) {
            eprintln!("warning: cannot remove {}: {err}", staged.display());
        }
    })
}

fn is_same_content(wanted: &[u8], target: &Path) -> io::Result<bool> {
    match fs::read(target) {
        Ok(present) => Ok(present == wanted),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_folder(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("nexron-chat-install-{name}-{}", std::process::id()));
        // A leftover from an earlier run would change what the test sees.
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_a_missing_exe_into_a_new_folder() {
        let dir = temp_folder("missing");
        fs::write(dir.join("bundled"), "v2").unwrap();
        let target = dir.join("data").join("agentd.exe");
        install(&dir.join("bundled"), &target).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "v2");
        assert!(!dir.join("data").join("agentd.new").exists());
    }

    #[test]
    fn replaces_an_exe_that_differs() {
        let dir = temp_folder("differs");
        fs::write(dir.join("bundled"), "v2").unwrap();
        fs::write(dir.join("agentd.exe"), "v1").unwrap();
        install(&dir.join("bundled"), &dir.join("agentd.exe")).unwrap();
        assert_eq!(fs::read_to_string(dir.join("agentd.exe")).unwrap(), "v2");
    }

    #[test]
    fn leaves_an_equal_exe_alone() {
        let dir = temp_folder("equal");
        fs::write(dir.join("bundled"), "v1").unwrap();
        fs::write(dir.join("agentd.exe"), "v1").unwrap();
        let before = fs::metadata(dir.join("agentd.exe"))
            .unwrap()
            .modified()
            .unwrap();
        install(&dir.join("bundled"), &dir.join("agentd.exe")).unwrap();
        assert_eq!(
            fs::metadata(dir.join("agentd.exe"))
                .unwrap()
                .modified()
                .unwrap(),
            before
        );
    }

    /// Stands in for a running `agentd serve`: Windows lets nobody replace an exe in use.
    #[cfg(windows)]
    #[test]
    fn keeps_a_locked_exe_and_cleans_up() {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        let dir = temp_folder("locked");
        fs::write(dir.join("bundled"), "v2").unwrap();
        fs::write(dir.join("agentd.exe"), "v1").unwrap();
        let _running = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(dir.join("agentd.exe"))
            .unwrap();
        assert!(install(&dir.join("bundled"), &dir.join("agentd.exe")).is_err());
        assert_eq!(fs::read_to_string(dir.join("agentd.exe")).unwrap(), "v1");
        assert!(!dir.join("agentd.new").exists());
    }
}
