//! The user's own PATH for the background server on macOS and Linux. Started over `ssh -T`, the
//! login shell runs the command without reading the profile, and an app opened from the Finder
//! gets launchd's `/usr/bin:/bin:/usr/sbin:/sbin`; either way `claude` in `~/.local/bin` or
//! Homebrew would not be found. The server asks the user's shell once, as a terminal would start
//! it, and puts that PATH in front of its own.

// The parsing is plain text and tested on every system; only the server on unix uses it.
#![cfg_attr(not(unix), allow(dead_code))]

/// Printed before and after the PATH, so whatever a profile echoes is not taken for it.
const MARKER: &str = "__agentd_login_path__";
const SEPARATOR: char = ':';
/// Where Claude Code's installers put it, for a shell that does not say: the native installer in
/// the home folder, Homebrew on Apple silicon and on Intel.
const HOME_INSTALL_DIRS: [&str; 1] = [".local/bin"];
const SYSTEM_INSTALL_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

#[cfg(unix)]
mod ask {
    use std::io::BufReader;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    use super::{MARKER, read_answer};

    const FALLBACK_SHELL: &str = "/bin/sh";
    /// A profile that waits or hangs must not keep the server from starting: `connect` gives it
    /// 15 s in all.
    const ASK_TIMEOUT: Duration = Duration::from_secs(5);

    /// `$SHELL`, else the login shell of the account (an app started by launchd may lack the
    /// variable).
    pub fn user_shell() -> String {
        if let Some(shell) = std::env::var("SHELL").ok().filter(|shell| !shell.is_empty()) {
            return shell;
        }
        // SAFETY: getpwuid returns a pointer into static storage or null; it is read at once,
        // before any thread runs that could call it again.
        let from_account = unsafe {
            let entry = libc::getpwuid(libc::getuid());
            (!entry.is_null() && !(*entry).pw_shell.is_null())
                .then(|| std::ffi::CStr::from_ptr((*entry).pw_shell).to_string_lossy().into_owned())
        };
        from_account.filter(|shell| !shell.is_empty()).unwrap_or_else(|| FALLBACK_SHELL.into())
    }

    /// What an interactive login shell prints for the markers and its PATH: `-i` reads `.zshrc`
    /// and `.bashrc` as well, where installers put their lines. `None` when it gives no answer
    /// in time.
    pub fn login_shell_output(shell: &str) -> Option<String> {
        let script = format!("printf '%s\\n%s\\n%s\\n' {MARKER} \"$PATH\" {MARKER}");
        let mut child = Command::new(shell)
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
            let _ = sender.send(read_answer(BufReader::new(stdout)));
        });
        let answer = received.recv_timeout(ASK_TIMEOUT).ok();
        // Done or stuck, it has nothing more to say; an already ended shell refuses the kill.
        let _ = child.kill();
        let _ = child.wait();
        answer
    }
}

/// Sets PATH to the login shell's, then what the server got, then the install folders. Called
/// once at the start of the server, before any of its threads.
#[cfg(unix)]
pub fn adopt() {
    let output = ask::login_shell_output(&ask::user_shell());
    let current = std::env::var("PATH").unwrap_or_default();
    let home = crate::paths::home().map(|home| home.to_string_lossy().into_owned());
    std::env::set_var("PATH", merged(output.as_deref().and_then(path_in), &current, home.as_deref()));
}

/// What the shell printed up to the closing marker. Not up to the end: a process a profile starts
/// in the background may keep stdout open long after the shell answered.
fn read_answer(reader: impl std::io::BufRead) -> String {
    let mut text = String::new();
    let mut markers = 0;
    // What arrived before a read error is still worth looking at.
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

/// The line between the two markers.
fn path_in(output: &str) -> Option<&str> {
    let mut lines = output.lines().skip_while(|line| *line != MARKER).skip(1);
    let path = lines.next()?;
    (lines.next() == Some(MARKER) && !path.is_empty()).then_some(path)
}

/// Each folder once, in the order of `login`, `current` and the install folders.
fn merged(login: Option<&str>, current: &str, home: Option<&str>) -> String {
    let in_home = home.into_iter().flat_map(|home| HOME_INSTALL_DIRS.iter().map(move |dir| format!("{home}/{dir}")));
    let candidates = login
        .into_iter()
        .flat_map(|path| path.split(SEPARATOR))
        .chain(current.split(SEPARATOR))
        .map(str::to_string)
        .chain(in_home)
        .chain(SYSTEM_INSTALL_DIRS.iter().map(|dir| dir.to_string()));
    let mut folders: Vec<String> = Vec::new();
    for folder in candidates {
        if !folder.is_empty() && !folders.contains(&folder) {
            folders.push(folder);
        }
    }
    folders.join(&SEPARATOR.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_path_between_the_markers_only() {
        let noisy = format!("Welcome back\n{MARKER}\n/opt/homebrew/bin:/usr/bin\n{MARKER}\nlogout\n");
        assert_eq!(path_in(&noisy), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(path_in(&format!("{MARKER}\n/usr/bin\n")), None);
        assert_eq!(path_in("no markers\n"), None);
    }

    #[test]
    fn stops_reading_at_the_closing_marker() {
        let answer = format!("hi\n{MARKER}\n/usr/bin\n{MARKER}\nfrom a background job\n");
        assert_eq!(read_answer(answer.as_bytes()), format!("hi\n{MARKER}\n/usr/bin\n{MARKER}\n"));
    }

    #[test]
    fn puts_the_login_path_first_and_keeps_each_folder_once() {
        let path = merged(Some("/home/me/.local/bin:/usr/local/bin:/usr/bin"), "/usr/bin:/bin", Some("/home/me"));
        assert_eq!(path, "/home/me/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin");
    }

    #[test]
    fn without_an_answer_the_install_folders_still_join() {
        let path = merged(None, "/usr/bin:/bin", Some("/Users/me"));
        assert_eq!(path, "/usr/bin:/bin:/Users/me/.local/bin:/opt/homebrew/bin:/usr/local/bin");
    }

    /// `sh -i -l -c` of the machine running the tests; it reads no profile that echoes markers.
    #[cfg(unix)]
    #[test]
    fn a_real_shell_answers_with_its_path() {
        let output = ask::login_shell_output("/bin/sh").unwrap();
        assert!(path_in(&output).is_some_and(|path| path.contains("/bin")));
    }
}
