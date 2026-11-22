//! Which sessions are running right now. Claude Code writes `<profile>/sessions/<pid>.json`
//! per running process; the file stays behind after a crash, so the process is checked too.
//! Ported from the Agent Dashboard (`sessions.rs`).

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFile {
    session_id: String,
    pid: u32,
    /// Process start time, so a reused PID does not count as the same process
    proc_start: Option<String>,
}

pub fn running_session_ids(profile: &Path) -> HashSet<String> {
    fs::read_dir(profile.join("sessions"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| serde_json::from_str::<SessionFile>(&fs::read_to_string(entry.path()).ok()?).ok())
        .filter(|file| process_alive(file.pid, file.proc_start.as_deref()))
        .map(|file| file.session_id)
        .collect()
}

#[cfg(windows)]
fn process_alive(pid: u32, proc_start: Option<&str>) -> bool {
    #[repr(C)]
    #[derive(Default)]
    struct FileTime {
        low: u32,
        high: u32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn GetExitCodeProcess(process: isize, code: *mut u32) -> i32;
        fn GetProcessTimes(process: isize, c: *mut FileTime, e: *mut FileTime, k: *mut FileTime, u: *mut FileTime) -> i32;
        fn CloseHandle(handle: isize) -> i32;
    }
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    /// FILETIME counts 100 ns steps; one second of tolerance.
    const SAME_START_TOLERANCE: u64 = 10_000_000;
    // SAFETY: only queries on a handle we own and close before returning.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle == 0 {
            return false;
        }
        let mut code = 0u32;
        let mut alive = GetExitCodeProcess(handle, &mut code) != 0 && code == STILL_ACTIVE;
        let (mut created, mut exited, mut kernel, mut user) = Default::default();
        if alive && GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0 {
            let started = ((created.high as u64) << 32) | created.low as u64;
            if let Some(expected) = proc_start.and_then(|s| s.parse::<u64>().ok()) {
                alive = started.abs_diff(expected) < SAME_START_TOLERANCE;
            }
        }
        CloseHandle(handle);
        alive
    }
}

#[cfg(not(windows))]
fn process_alive(pid: u32, proc_start: Option<&str>) -> bool {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    const EPERM: i32 = 1;
    // SAFETY: signal 0 is never delivered, it only checks that the PID exists.
    let exists = unsafe { kill(pid as i32, 0) } == 0
        || std::io::Error::last_os_error().raw_os_error() == Some(EPERM);
    if !exists {
        return false;
    }
    let Some(expected) = proc_start else { return true };
    // Claude Code writes the start like `ps -o lstart` in UTC ("Wed Oct 28 10:11:40 2026").
    let Ok(out) = std::process::Command::new("ps")
        .args(["-o", "lstart=", "-p", &pid.to_string()])
        .env("LC_ALL", "C")
        .env("TZ", "UTC")
        .output()
    else {
        return true;
    };
    let words = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    words(&String::from_utf8_lossy(&out.stdout)) == words(expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_only_sessions_whose_process_still_runs() {
        let profile = std::env::temp_dir().join(format!("agentd-live-{}", std::process::id()));
        let sessions = profile.join("sessions");
        fs::create_dir_all(&sessions).unwrap();
        let own = std::process::id();
        fs::write(sessions.join("1.json"), format!(r#"{{"sessionId":"running","pid":{own}}}"#)).unwrap();
        // PIDs are multiples of 4 on Windows and never this large elsewhere.
        fs::write(sessions.join("2.json"), r#"{"sessionId":"gone","pid":4294967291}"#).unwrap();

        assert_eq!(running_session_ids(&profile), HashSet::from(["running".to_string()]));
    }
}
