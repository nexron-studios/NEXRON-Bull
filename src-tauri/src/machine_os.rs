//! The system another machine runs, and every shell line Bull sends there because of it. Windows'
//! OpenSSH hands the line to cmd or PowerShell, macOS and Linux to the user's login shell (sh,
//! bash, zsh, fish); each line below works in every shell of its system.

use serde::{Deserialize, Serialize};

/// Asked first: cmd and PowerShell do not know it, Git's tools on a Windows PATH answer `MINGW…`.
pub const UNAME_COMMAND: &str = "uname -sm";
const WINDOWS_TARGET: &str = "x86_64-pc-windows-msvc";
/// Where the release workflow uploads `agentd-<target>` for every tag `v<version>`.
const RELEASE_DOWNLOADS: &str = "https://github.com/nexron-studios/NEXRON-Bull/releases/download";
/// Kernels `uname -s` names on Windows when Git's or Cygwin's tools are on the PATH.
const WINDOWS_KERNEL_PREFIXES: [&str; 3] = ["MINGW", "MSYS", "CYGWIN"];

/// What the unix install line exits with when the download failed, to tell it from a failed rename.
pub const DOWNLOAD_FAILED: i32 = 3;
/// pgrep's answer when no process matches.
const NO_PROCESS: i32 = 1;

// Macros, not consts: `concat!` takes only literals, and the lines stay `&'static str`.
/// agentd's folder on Windows, relative to the SSH login folder (the user folder).
macro_rules! windows_dir {
    () => {
        ".nexron-chat"
    };
}
macro_rules! windows_agentd {
    () => {
        concat!(windows_dir!(), r"\agentd.exe")
    };
}
/// agentd's folder on macOS and Linux, inside the double quotes of an `sh -c '…'` line.
macro_rules! unix_dir {
    () => {
        "$HOME/.nexron-chat"
    };
}
macro_rules! unix_agentd {
    () => {
        concat!(unix_dir!(), "/agentd")
    };
}

/// The Windows install in steps: the new exe arrives beside the old one, which is then renamed
/// away. A running exe cannot be overwritten but can be renamed: the new one never waits for a
/// lock, and the previous one stays beside it to go back to.
pub mod windows_install {
    pub const FOLDER_COMMAND: &str = concat!("cmd /d /c if not exist ", windows_dir!(), " mkdir ", windows_dir!());
    /// Where the new exe arrives, as scp names it.
    pub const STAGED_PATH: &str = concat!(windows_dir!(), "/agentd.new.exe");
    pub const BACKUP_COMMAND: &str =
        concat!("cmd /d /c if exist ", windows_agentd!(), " move /y ", windows_agentd!(), " ", windows_dir!(), r"\agentd.old.exe");
    pub const SWAP_COMMAND: &str = concat!("cmd /d /c move /y ", windows_dir!(), r"\agentd.new.exe ", windows_agentd!());
    pub const RESTORE_COMMAND: &str =
        concat!("cmd /d /c if not exist ", windows_agentd!(), " move /y ", windows_dir!(), r"\agentd.old.exe ", windows_agentd!());
}

/// The system a machine runs; it decides which shell lines Bull sends there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MachineOs {
    Windows,
    Macos,
    Linux,
}

/// What `uname -sm` told about a machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Platform {
    pub os: MachineOs,
    /// The Rust target of the agentd release asset for it; `None` for a processor no release
    /// has a build for
    pub release_target: Option<&'static str>,
}

impl Platform {
    /// The agentd of Bull `version` for this machine on GitHub; `None` without a build for it.
    pub fn release_url(&self, version: &str) -> Option<String> {
        let suffix = if self.os.is_windows() { ".exe" } else { "" };
        self.release_target.map(|target| format!("{RELEASE_DOWNLOADS}/v{version}/agentd-{target}{suffix}"))
    }
}

/// `None` for a system Bull does not run on (FreeBSD, a router). A failed `uname` is Windows:
/// cmd and PowerShell answer it with an error, and whatever else refuses it (a Git host without
/// shell access) fails the Windows check that follows. Lines a shell profile prints before the
/// answer (conda, nvm, a greeting) are skipped.
pub fn platform_of(code: Option<i32>, stdout: &str) -> Option<Platform> {
    let windows = Platform { os: MachineOs::Windows, release_target: Some(WINDOWS_TARGET) };
    if code != Some(0) {
        return Some(windows);
    }
    let (kernel, machine) = stdout.lines().find_map(uname_words)?;
    let is_arm = matches!(machine, "arm64" | "aarch64");
    match kernel {
        "Darwin" => Some(Platform {
            os: MachineOs::Macos,
            release_target: Some(if is_arm { "aarch64-apple-darwin" } else { "x86_64-apple-darwin" }),
        }),
        "Linux" => Some(Platform {
            os: MachineOs::Linux,
            release_target: match machine {
                "x86_64" => Some("x86_64-unknown-linux-musl"),
                _ if is_arm => Some("aarch64-unknown-linux-musl"),
                _ => None,
            },
        }),
        _ if is_windows_kernel(kernel) => Some(windows),
        _ => None,
    }
}

fn is_windows_kernel(kernel: &str) -> bool {
    WINDOWS_KERNEL_PREFIXES.iter().any(|prefix| kernel.starts_with(prefix))
}

/// Kernel and processor of a line `uname -sm` printed; `None` for any other line.
fn uname_words(line: &str) -> Option<(&str, &str)> {
    let mut words = line.split_whitespace();
    let (kernel, machine) = (words.next()?, words.next()?);
    let is_uname = matches!(kernel, "Darwin" | "Linux") || is_windows_kernel(kernel);
    (is_uname && words.next().is_none()).then_some((kernel, machine))
}

impl MachineOs {
    pub fn is_windows(self) -> bool {
        self == Self::Windows
    }

    /// `agentd connect`, the line every connection runs. Windows: `cmd` instead of the PowerShell
    /// login shell, which passes only the first stdin line to a script. Elsewhere: `sh`, whatever
    /// the login shell is; agentd finds `claude` itself (see agentd's `login_path`).
    pub fn connect_command(self) -> &'static str {
        match self {
            Self::Windows => concat!("cmd /d /c ", windows_agentd!(), " connect"),
            Self::Macos | Self::Linux => concat!(r#"sh -c '""#, unix_agentd!(), r#"" connect'"#),
        }
    }

    /// `agentd stdio` serves one client and ends with its input, so asking `hello` starts nothing
    /// that stays behind (unlike `connect`, which starts the background server).
    pub fn probe_command(self) -> &'static str {
        match self {
            Self::Windows => concat!("cmd /d /c ", windows_agentd!(), " stdio"),
            Self::Macos | Self::Linux => concat!(r#"sh -c '""#, unix_agentd!(), r#"" stdio'"#),
        }
    }

    /// Succeeds when the agentd exe is there; tells a missing agentd from one the system refuses
    /// to start, without reading localised text.
    pub fn presence_command(self) -> &'static str {
        match self {
            Self::Windows => concat!("cmd /d /c dir /b ", windows_agentd!()),
            Self::Macos | Self::Linux => concat!(r#"sh -c 'test -f ""#, unix_agentd!(), r#""'"#),
        }
    }

    /// Exit code 0 with a line per agentd process. On Windows also 0 without one: tasklist then
    /// says so in the system's language.
    pub fn processes_command(self) -> &'static str {
        match self {
            Self::Windows => r#"cmd /d /c tasklist /nh /fi "imagename eq agentd*""#,
            Self::Macos | Self::Linux => r#"sh -c 'pgrep -u "$(id -u)" -x agentd'"#,
        }
    }

    /// Whether the answer of `processes_command` shows an agentd. When it gives no clear "none",
    /// agentd itself is asked whether chats run.
    pub fn agentd_runs(self, code: Option<i32>, stdout: &str) -> bool {
        match self {
            // tasklist names each process; with none it says so in the system's language.
            Self::Windows => code != Some(0) || stdout.to_lowercase().contains("agentd"),
            Self::Macos | Self::Linux => code != Some(NO_PROCESS),
        }
    }

    pub fn stop_command(self) -> &'static str {
        match self {
            Self::Windows => r"cmd /d /c taskkill /f /im agentd*",
            Self::Macos | Self::Linux => r#"sh -c 'pkill -u "$(id -u)" -x agentd'"#,
        }
    }

    /// Has the machine fetch `url` itself. Windows: to `windows_install::STAGED_PATH` only, the
    /// steps in `windows_install` swap it in (curl.exe ships with Windows 10 and later). Elsewhere
    /// one line downloads to a temporary name and renames it over the old agentd, which a running
    /// server keeps using until it exits; the previous one stays as `agentd.old`, a failed
    /// download (exit `DOWNLOAD_FAILED`) changes nothing. No single quote inside the `sh -c`
    /// argument, so fish reads it the same.
    pub fn install_command(self, url: &str) -> String {
        match self {
            Self::Windows => format!(concat!("cmd /d /c curl.exe -fsSL -o ", windows_dir!(), r"\agentd.new.exe {}"), url),
            Self::Macos | Self::Linux => format!(
                concat!(
                    r#"sh -c 'set -e; dir=""#,
                    unix_dir!(),
                    r#""; staged="$dir/agentd.download"; trap "rm -f \"$staged\"" EXIT; mkdir -p "$dir"; "#,
                    r#"if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$staged" "{url}" || exit {code}; "#,
                    r#"else wget -q -O "$staged" "{url}" || exit {code}; fi; chmod 755 "$staged"; "#,
                    r#"if [ -f "$dir/agentd" ]; then cp -pf "$dir/agentd" "$dir/agentd.old"; fi; mv -f "$staged" "$dir/agentd"'"#
                ),
                url = url,
                code = DOWNLOAD_FAILED
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target_of(code: i32, stdout: &str) -> Option<(MachineOs, Option<&'static str>)> {
        platform_of(Some(code), stdout).map(|platform| (platform.os, platform.release_target))
    }

    #[test]
    fn reads_the_system_and_processor_from_uname() {
        assert_eq!(target_of(0, "Darwin arm64\n"), Some((MachineOs::Macos, Some("aarch64-apple-darwin"))));
        assert_eq!(target_of(0, "Darwin x86_64\n"), Some((MachineOs::Macos, Some("x86_64-apple-darwin"))));
        assert_eq!(target_of(0, "Linux x86_64\n"), Some((MachineOs::Linux, Some("x86_64-unknown-linux-musl"))));
        assert_eq!(target_of(0, "Linux aarch64\n"), Some((MachineOs::Linux, Some("aarch64-unknown-linux-musl"))));
        assert_eq!(target_of(0, "Linux armv7l\n"), Some((MachineOs::Linux, None)));
    }

    #[test]
    fn a_shell_without_uname_is_windows() {
        let cmd = "'uname' is not recognized as an internal or external command";
        assert_eq!(target_of(1, cmd), Some((MachineOs::Windows, Some("x86_64-pc-windows-msvc"))));
        assert_eq!(target_of(0, "MINGW64_NT-10.0-26100 x86_64\n"), Some((MachineOs::Windows, Some("x86_64-pc-windows-msvc"))));
    }

    #[test]
    fn skips_what_a_shell_profile_prints_first() {
        let noisy = "(base) conda activated\nnvm: using node v22\nLinux x86_64\n";
        assert_eq!(target_of(0, noisy), Some((MachineOs::Linux, Some("x86_64-unknown-linux-musl"))));
        let greeting = "Welcome, Linux user\nDarwin arm64\n";
        assert_eq!(target_of(0, greeting), Some((MachineOs::Macos, Some("aarch64-apple-darwin"))));
    }

    #[test]
    fn other_systems_are_not_supported() {
        assert_eq!(platform_of(Some(0), "FreeBSD amd64\n"), None);
        assert_eq!(platform_of(Some(0), ""), None);
    }

    #[test]
    fn stores_the_system_in_lower_case() {
        assert_eq!(serde_json::to_string(&MachineOs::Macos).unwrap(), r#""macos""#);
        assert_eq!(serde_json::from_str::<MachineOs>(r#""linux""#).unwrap(), MachineOs::Linux);
    }

    #[test]
    fn unix_lines_run_agentd_from_the_home_folder() {
        assert_eq!(MachineOs::Linux.connect_command(), r#"sh -c '"$HOME/.nexron-chat/agentd" connect'"#);
        assert_eq!(MachineOs::Macos.probe_command(), r#"sh -c '"$HOME/.nexron-chat/agentd" stdio'"#);
        assert_eq!(MachineOs::Linux.presence_command(), r#"sh -c 'test -f "$HOME/.nexron-chat/agentd"'"#);
    }

    #[test]
    fn windows_lines_run_agentd_from_the_login_folder() {
        assert_eq!(MachineOs::Windows.connect_command(), r"cmd /d /c .nexron-chat\agentd.exe connect");
        assert_eq!(MachineOs::Windows.presence_command(), r"cmd /d /c dir /b .nexron-chat\agentd.exe");
        assert_eq!(
            windows_install::BACKUP_COMMAND,
            r"cmd /d /c if exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.exe .nexron-chat\agentd.old.exe"
        );
        assert_eq!(windows_install::SWAP_COMMAND, r"cmd /d /c move /y .nexron-chat\agentd.new.exe .nexron-chat\agentd.exe");
        assert_eq!(
            windows_install::RESTORE_COMMAND,
            r"cmd /d /c if not exist .nexron-chat\agentd.exe move /y .nexron-chat\agentd.old.exe .nexron-chat\agentd.exe"
        );
        assert_eq!(windows_install::FOLDER_COMMAND, r"cmd /d /c if not exist .nexron-chat mkdir .nexron-chat");
        assert_eq!(
            MachineOs::Windows.install_command("https://example.org/a.exe"),
            r"cmd /d /c curl.exe -fsSL -o .nexron-chat\agentd.new.exe https://example.org/a.exe"
        );
    }

    #[test]
    fn names_the_release_asset_of_the_app_version() {
        let mac = Platform { os: MachineOs::Macos, release_target: Some("aarch64-apple-darwin") };
        assert_eq!(
            mac.release_url("0.8.0").as_deref(),
            Some("https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-aarch64-apple-darwin")
        );
        let windows = Platform { os: MachineOs::Windows, release_target: Some(WINDOWS_TARGET) };
        assert_eq!(
            windows.release_url("0.8.0").as_deref(),
            Some("https://github.com/nexron-studios/NEXRON-Bull/releases/download/v0.8.0/agentd-x86_64-pc-windows-msvc.exe")
        );
        assert_eq!(Platform { os: MachineOs::Linux, release_target: None }.release_url("0.8.0"), None);
    }

    #[test]
    fn reads_whether_agentd_runs() {
        assert!(MachineOs::Linux.agentd_runs(Some(0), "4242\n"));
        assert!(!MachineOs::Macos.agentd_runs(Some(1), ""));
        // pgrep missing: agentd itself has to say.
        assert!(MachineOs::Linux.agentd_runs(Some(127), ""));
        assert!(MachineOs::Windows.agentd_runs(Some(0), "agentd.exe  4242 Console\n"));
        assert!(!MachineOs::Windows.agentd_runs(Some(0), "INFORMATION: No tasks are running\n"));
    }

    #[test]
    fn the_unix_install_line_downloads_beside_and_renames_over() {
        let line = MachineOs::Linux.install_command("https://example.org/agentd-x");
        assert!(line.starts_with(r#"sh -c 'set -e; dir="$HOME/.nexron-chat"; "#));
        assert!(line.contains(r#"curl -fsSL -o "$staged" "https://example.org/agentd-x" || exit 3;"#));
        assert!(line.ends_with(r#"cp -pf "$dir/agentd" "$dir/agentd.old"; fi; mv -f "$staged" "$dir/agentd"'"#));
        // One single-quoted argument for the login shell, whatever shell that is.
        assert_eq!(line.matches('\'').count(), 2);
        let whole = r#"sh -c 'set -e; dir="$HOME/.nexron-chat"; staged="$dir/agentd.download"; trap "rm -f \"$staged\"" EXIT; mkdir -p "$dir"; if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$staged" "https://example.org/agentd-x" || exit 3; else wget -q -O "$staged" "https://example.org/agentd-x" || exit 3; fi; chmod 755 "$staged"; if [ -f "$dir/agentd" ]; then cp -pf "$dir/agentd" "$dir/agentd.old"; fi; mv -f "$staged" "$dir/agentd"'"#;
        assert_eq!(line, whole);
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
        let line = MachineOs::Linux.install_command(&url);
        let script = line.strip_prefix("sh -c '").unwrap().strip_suffix('\'').unwrap();
        let status = std::process::Command::new("sh").args(["-c", script]).env("HOME", &home).status().unwrap();
        assert!(status.success());
        assert_eq!(std::fs::read_to_string(home.join(".nexron-chat/agentd")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(home.join(".nexron-chat/agentd.old")).unwrap(), "old");
        assert!(!home.join(".nexron-chat/agentd.download").exists());
    }
}
