//! Claude Code runs from a copy per version in `~/.nexron-chat/claude/<version>/`. Windows
//! cannot replace an exe that runs, so a tab running the installed `claude.exe` makes every
//! Claude Code update fail, also while the window is closed: `agentd serve` keeps tabs alive.
//! Running tabs keep their version; the next start after an update gets a fresh copy.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, PoisonError};
use std::time::SystemTime;

use crate::claude::{hide_console, parse_version};
use crate::paths::{self, APP_FOLDER};

pub(crate) const COPIES_FOLDER: &str = "claude";
const STAGED_SUFFIX: &str = ".partial";
/// Windows' answer for deleting an exe that runs, besides `PermissionDenied`.
const SHARING_VIOLATION: i32 = 32;

type Version = [u32; 3];

#[derive(Debug, thiserror::Error)]
pub enum CopyError {
    #[error("home folder unknown")]
    NoHome,
    #[error("cannot read the version of {0}")]
    UnknownVersion(PathBuf),
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// Tells an updated install from the one seen last without running it.
#[derive(Debug, Clone, PartialEq)]
struct Stamp {
    len: u64,
    modified: SystemTime,
}

impl Stamp {
    fn of(file: &Path) -> io::Result<Self> {
        let meta = fs::metadata(file)?;
        Ok(Self { len: meta.len(), modified: meta.modified()? })
    }
}

/// The last install seen; `copy` is `None` when copying it failed, so later starts do not
/// repeat a copy of several hundred MB that fails each time.
struct Known {
    installed: PathBuf,
    stamp: Stamp,
    copy: Option<(Version, PathBuf)>,
}

fn copies_folder() -> Option<PathBuf> {
    paths::home().map(|home| home.join(APP_FOLDER).join(COPIES_FOLDER))
}

/// Tabs started from a copy must not update it; the install updates from the terminal.
pub fn is_copy(program: &Path) -> bool {
    copies_folder().is_some_and(|copies| program.starts_with(copies))
}

/// The exe a new tab runs. Falls back to `installed` itself when no copy can be made: the tab
/// still starts, only updates fail while it runs, as before the copies.
pub fn runnable(installed: &Path) -> PathBuf {
    if !cfg!(windows) {
        // Unix replaces a running binary without complaint, so the install is used as it is.
        return installed.to_path_buf();
    }
    match copies_folder().ok_or(CopyError::NoHome).and_then(|copies| copy_for(installed, &copies)) {
        Ok(Some(copy)) => copy,
        Ok(None) => installed.to_path_buf(),
        Err(err) => {
            eprintln!("warning: running {} directly, Claude Code updates fail while it runs: {err}", installed.display());
            installed.to_path_buf()
        }
    }
}

/// `None` when copying this install failed before. The lock also keeps two tabs starting at
/// once from copying the same version twice.
fn copy_for(installed: &Path, copies: &Path) -> Result<Option<PathBuf>, CopyError> {
    static KNOWN: Mutex<Option<Known>> = Mutex::new(None);
    let mut known = KNOWN.lock().unwrap_or_else(PoisonError::into_inner);
    let stamp = Stamp::of(installed)?;
    let cached = known.as_ref().filter(|k| k.installed == installed && k.stamp == stamp);
    let copy = match cached.map(|k| k.copy.clone()) {
        Some(Some((version, copy))) if copy.is_file() => (version, copy),
        Some(None) => return Ok(None),
        _ => {
            let outcome = version_of(installed).and_then(|version| Ok((version, install_copy(installed, copies, version)?)));
            *known = Some(Known { installed: installed.to_path_buf(), stamp, copy: outcome.as_ref().ok().cloned() });
            outcome?
        }
    };
    remove_older_versions(copies, copy.0);
    Ok(Some(copy.1))
}

fn version_of(installed: &Path) -> Result<Version, CopyError> {
    let mut probe = Command::new(installed);
    probe.arg("--version").stdin(Stdio::null()).stderr(Stdio::null());
    hide_console(&mut probe);
    let output = probe.output()?;
    parse_version(&String::from_utf8_lossy(&output.stdout)).ok_or_else(|| CopyError::UnknownVersion(installed.to_path_buf()))
}

fn folder_name([major, minor, patch]: Version) -> String {
    format!("{major}.{minor}.{patch}")
}

/// Copied beside the version folders and renamed into place, so a tab never starts a half
/// written exe and a copy cut off by a crash is cleaned up like an old version.
fn install_copy(installed: &Path, copies: &Path, version: Version) -> Result<PathBuf, CopyError> {
    let file_name = installed.file_name().ok_or_else(|| CopyError::UnknownVersion(installed.to_path_buf()))?;
    let folder = copies.join(folder_name(version));
    let target = folder.join(file_name);
    if target.is_file() {
        return Ok(target);
    }
    fs::create_dir_all(&folder)?;
    let staged = copies.join(format!("{}{STAGED_SUFFIX}", folder_name(version)));
    fs::copy(installed, &staged)?;
    fs::rename(&staged, &target).inspect_err(|_| {
        if let Err(err) = fs::remove_file(&staged) {
            eprintln!("warning: cannot remove {}: {err}", staged.display());
        }
    })?;
    Ok(target)
}

/// Only versions older than `current`: another agentd that has not seen an update yet would
/// otherwise delete the newer copy before its tab started. Each copy is a few hundred MB.
fn remove_older_versions(copies: &Path, current: Version) {
    let Ok(entries) = fs::read_dir(copies) else { return };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(version) = parse_version(name.trim_end_matches(STAGED_SUFFIX)) else { continue };
        if version >= current {
            continue;
        }
        let path = entry.path();
        match if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) } {
            // A tab still runs it; the next start tries again.
            Err(err) if is_in_use(&err) => {}
            Err(err) => eprintln!("warning: cannot remove the old Claude copy {}: {err}", path.display()),
            Ok(()) => {}
        }
    }
}

fn is_in_use(err: &io::Error) -> bool {
    err.kind() == io::ErrorKind::PermissionDenied || err.raw_os_error() == Some(SHARING_VIOLATION)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentd-claude-copy-{name}-{}", std::process::id()));
        // A leftover from an earlier run would change what the test sees.
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn add_copy(copies: &Path, version: &str) {
        fs::create_dir_all(copies.join(version)).unwrap();
        fs::write(copies.join(version).join("claude.exe"), version).unwrap();
    }

    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(folder).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        names
    }

    #[test]
    fn copies_into_a_folder_named_after_the_version() {
        let dir = temp_folder("copy");
        fs::write(dir.join("claude.exe"), "v329").unwrap();
        let copy = install_copy(&dir.join("claude.exe"), &dir.join("copies"), [2, 1, 329]).unwrap();
        assert_eq!(copy, dir.join("copies").join("2.1.329").join("claude.exe"));
        assert_eq!(fs::read_to_string(&copy).unwrap(), "v329");
        assert_eq!(names_in(&dir.join("copies")), ["2.1.329"]);
    }

    #[test]
    fn an_existing_copy_is_kept_as_it_is() {
        let dir = temp_folder("existing");
        fs::write(dir.join("claude.exe"), "new bytes").unwrap();
        add_copy(&dir.join("copies"), "2.1.329");
        let copy = install_copy(&dir.join("claude.exe"), &dir.join("copies"), [2, 1, 329]).unwrap();
        assert_eq!(fs::read_to_string(copy).unwrap(), "2.1.329");
    }

    #[test]
    fn removes_older_versions_and_cut_off_copies() {
        let copies = temp_folder("cleanup");
        add_copy(&copies, "2.1.99");
        add_copy(&copies, "2.1.327");
        add_copy(&copies, "2.1.329");
        fs::write(copies.join("2.1.328.partial"), "half").unwrap();
        remove_older_versions(&copies, [2, 1, 329]);
        assert_eq!(names_in(&copies), ["2.1.329"]);
    }

    #[test]
    fn leaves_newer_versions_and_foreign_files_alone() {
        let copies = temp_folder("newer");
        add_copy(&copies, "2.1.329");
        add_copy(&copies, "2.1.330");
        fs::write(copies.join("2.1.330.partial"), "being copied").unwrap();
        fs::write(copies.join("notes.txt"), "not ours").unwrap();
        remove_older_versions(&copies, [2, 1, 329]);
        assert_eq!(names_in(&copies), ["2.1.329", "2.1.330", "2.1.330.partial", "notes.txt"]);
    }

    /// A process really running from an old copy, as a tab would: Windows keeps its exe.
    #[cfg(windows)]
    #[test]
    fn keeps_a_version_a_running_process_uses() {
        let copies = temp_folder("in-use");
        fs::create_dir_all(copies.join("2.1.327")).unwrap();
        let exe = copies.join("2.1.327").join("ping.exe");
        fs::copy(r"C:\Windows\System32\PING.EXE", &exe).unwrap();
        let mut running = Command::new(&exe).args(["-n", "30", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        remove_older_versions(&copies, [2, 1, 329]);
        let kept = exe.is_file();
        running.kill().unwrap();
        running.wait().unwrap();
        assert!(kept);
        remove_older_versions(&copies, [2, 1, 329]);
        assert!(names_in(&copies).is_empty());
    }

    #[test]
    fn a_missing_binary_has_no_version() {
        let dir = temp_folder("no-version");
        assert!(matches!(version_of(&dir.join("claude.exe")), Err(CopyError::Io(_))));
    }

    #[test]
    fn a_failed_copy_is_not_repeated_for_the_same_install() {
        let dir = temp_folder("failed");
        let installed = dir.join("claude.exe");
        fs::write(&installed, "not a program").unwrap();
        assert!(copy_for(&installed, &dir.join("copies")).is_err());
        assert_eq!(copy_for(&installed, &dir.join("copies")).unwrap(), None);
    }
}
