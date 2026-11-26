//! Where `claude` is on this machine, for the hidden Claude of the dictation. An app opened from
//! the Finder or the Dock gets launchd's `/usr/bin:/bin:/usr/sbin:/sbin`, so on macOS and Linux
//! the user's login shell is asked for its PATH, as `agentd/src/login_path.rs` does for the
//! server. The app does not link agentd, so the few lines are repeated here.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Printed around the PATH, so whatever a profile echoes is not taken for it.
const MARKER: &str = "__bull_login_path__";
/// Where Claude Code's installers put it, for a shell that does not say.
const HOME_INSTALL_DIRS: [&str; 1] = [".local/bin"];
const SYSTEM_INSTALL_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

/// The program and the PATH it should run with.
pub struct ClaudeProgram {
    pub path: PathBuf,
    pub search_path: OsString,
}

pub fn find() -> Option<ClaudeProgram> {
    let search_path = search_path();
    let path = std::env::split_paths(&search_path).find_map(|dir| claude_in(&dir))?;
    Some(ClaudeProgram { path, search_path })
}

/// The npm install on Windows puts a `claude.cmd` shim on PATH; the real exe sits in
/// node_modules next to it, and running it directly keeps `cmd` out of the PTY.
fn claude_in(dir: &Path) -> Option<PathBuf> {
    let exe = dir.join(if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    });
    if exe.is_file() {
        return Some(exe);
    }
    let npm_exe = dir.join("node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    (cfg!(windows) && dir.join("claude.cmd").is_file() && npm_exe.is_file()).then_some(npm_exe)
}

/// Windows hands an app the user's PATH as it is.
#[cfg(windows)]
fn search_path() -> OsString {
    std::env::var_os("PATH").unwrap_or_default()
}

#[cfg(not(windows))]
fn search_path() -> OsString {
    let login = ask::login_shell_output().and_then(|output| path_in(&output).map(str::to_string));
    let current = std::env::var("PATH").unwrap_or_default();
    let home = crate::connections::home_folder().map(|home| home.to_string_lossy().into_owned());
    merged(login.as_deref(), &current, home.as_deref()).into()
}

#[cfg(not(windows))]
mod ask {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    use super::MARKER;

    const FALLBACK_SHELL: &str = "/bin/sh";
    /// A profile that waits or hangs must not keep the dictation from starting for long.
    const ASK_TIMEOUT: Duration = Duration::from_secs(5);

    /// What `$SHELL -i -l` prints: `-i` reads `.zshrc` and `.bashrc` too, where installers put
    /// their PATH lines. `None` when it gives no answer in time.
    pub fn login_shell_output() -> Option<String> {
        let script = format!("printf '%s\\n%s\\n%s\\n' {MARKER} \"$PATH\" {MARKER}");
        let mut child = Command::new(user_shell())
            .args(["-i", "-l", "-c", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let stdout = child.stdout.take()?;
        let (sender, received) = mpsc::channel();
        thread::spawn(move || {
            // Nobody waits any more once the answer came too late.
            let _ = sender.send(read_to_marker(BufReader::new(stdout)));
        });
        let answer = received.recv_timeout(ASK_TIMEOUT).ok();
        // Done or stuck, it has nothing more to say; an already ended shell refuses the kill.
        let _ = child.kill();
        let _ = child.wait();
        answer
    }

    /// `$SHELL`, else the login shell of the account: an app started by launchd may lack the
    /// variable, and `/bin/sh` reads none of the profiles where installers put their PATH.
    fn user_shell() -> String {
        if let Some(shell) = std::env::var("SHELL")
            .ok()
            .filter(|shell| !shell.is_empty())
        {
            return shell;
        }
        account_shell().unwrap_or_else(|| FALLBACK_SHELL.into())
    }

    pub(super) fn account_shell() -> Option<String> {
        // SAFETY: getpwuid returns a pointer into static storage or null; it is copied at once.
        // Another thread calling getpwuid meanwhile could overwrite it, which only risks a wrong
        // shell name, and Bull calls it nowhere else.
        let shell = unsafe {
            let entry = libc::getpwuid(libc::getuid());
            (!entry.is_null() && !(*entry).pw_shell.is_null()).then(|| {
                std::ffi::CStr::from_ptr((*entry).pw_shell)
                    .to_string_lossy()
                    .into_owned()
            })
        };
        shell.filter(|shell| !shell.is_empty())
    }

    /// What the shell printed up to the closing marker, not up to the end: a job a profile starts
    /// in the background may keep stdout open long after the shell answered.
    fn read_to_marker(reader: impl BufRead) -> String {
        let mut text = String::new();
        let mut markers = 0;
        for line in reader.lines().map_while(Result::ok) {
            markers += usize::from(line == MARKER);
            text.push_str(&line);
            text.push('\n');
            if markers == 2 {
                break;
            }
        }
        text
    }
}

/// The line between the two markers.
#[cfg_attr(windows, allow(dead_code))]
fn path_in(output: &str) -> Option<&str> {
    let mut lines = output.lines().skip_while(|line| *line != MARKER).skip(1);
    let path = lines.next()?;
    (lines.next() == Some(MARKER) && !path.is_empty()).then_some(path)
}

/// Each folder once, in the order of `login`, `current` and the install folders.
#[cfg_attr(windows, allow(dead_code))]
fn merged(login: Option<&str>, current: &str, home: Option<&str>) -> String {
    let in_home = home.into_iter().flat_map(|home| {
        HOME_INSTALL_DIRS
            .iter()
            .map(move |dir| format!("{home}/{dir}"))
    });
    let candidates = login
        .into_iter()
        .flat_map(|path| path.split(':'))
        .chain(current.split(':'))
        .map(str::to_string)
        .chain(in_home)
        .chain(SYSTEM_INSTALL_DIRS.iter().map(|dir| dir.to_string()));
    let mut folders: Vec<String> = Vec::new();
    for folder in candidates {
        if !folder.is_empty() && !folders.contains(&folder) {
            folders.push(folder);
        }
    }
    folders.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_path_between_the_markers_only() {
        let noisy =
            format!("Welcome back\n{MARKER}\n/opt/homebrew/bin:/usr/bin\n{MARKER}\nlogout\n");
        assert_eq!(path_in(&noisy), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(path_in(&format!("{MARKER}\n/usr/bin\n")), None);
    }

    #[cfg(not(windows))]
    #[test]
    fn the_account_names_its_login_shell() {
        // A container may run the tests for a user without a passwd entry; nothing to check then.
        let Some(shell) = ask::account_shell() else {
            return;
        };
        assert!(Path::new(&shell).is_file(), "{shell}");
    }

    #[test]
    fn puts_the_login_path_first_and_keeps_each_folder_once() {
        let path = merged(
            Some("/home/me/.local/bin:/usr/bin"),
            "/usr/bin:/bin",
            Some("/home/me"),
        );
        assert_eq!(
            path,
            "/home/me/.local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin"
        );
    }
}
