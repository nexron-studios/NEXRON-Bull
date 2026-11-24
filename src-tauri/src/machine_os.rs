//! The system another machine runs, and the shell lines Bull sends there because of it. Windows'
//! OpenSSH hands the line to cmd or PowerShell, macOS and Linux to the user's login shell (sh,
//! bash, zsh, fish); each line below works in every shell of its system.

use serde::{Deserialize, Serialize};

/// Asked first: cmd and PowerShell do not know it, Git's tools on a Windows PATH answer `MINGW…`.
pub const UNAME_COMMAND: &str = "uname -sm";
const WINDOWS_TARGET: &str = "x86_64-pc-windows-msvc";

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

/// Kernels `uname -s` names on Windows when Git's or Cygwin's tools are on the PATH.
const WINDOWS_KERNEL_PREFIXES: [&str; 3] = ["MINGW", "MSYS", "CYGWIN"];

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
            Self::Windows => r"cmd /d /c .nexron-chat\agentd.exe connect",
            Self::Macos | Self::Linux => r#"sh -c '"$HOME/.nexron-chat/agentd" connect'"#,
        }
    }

    /// `agentd stdio` serves one client and ends with its input, so asking `hello` starts nothing
    /// that stays behind (unlike `connect`, which starts the background server).
    pub fn probe_command(self) -> &'static str {
        match self {
            Self::Windows => r"cmd /d /c .nexron-chat\agentd.exe stdio",
            Self::Macos | Self::Linux => r#"sh -c '"$HOME/.nexron-chat/agentd" stdio'"#,
        }
    }

    /// Succeeds when the agentd exe is there; tells a missing agentd from one the system refuses
    /// to start, without reading localised text.
    pub fn presence_command(self) -> &'static str {
        match self {
            Self::Windows => r"cmd /d /c dir /b .nexron-chat\agentd.exe",
            Self::Macos | Self::Linux => r#"sh -c 'test -f "$HOME/.nexron-chat/agentd"'"#,
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

    pub fn stop_command(self) -> &'static str {
        match self {
            Self::Windows => r"cmd /d /c taskkill /f /im agentd*",
            Self::Macos | Self::Linux => r#"sh -c 'pkill -u "$(id -u)" -x agentd'"#,
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
        assert_eq!(MachineOs::Windows.connect_command(), r"cmd /d /c .nexron-chat\agentd.exe connect");
    }
}
