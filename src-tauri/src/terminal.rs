//! Real shells for Bull's terminal tabs: one pseudo console per terminal (ConPTY on Windows).
//! Output goes to the window event `terminal`, batched per few milliseconds instead of per read,
//! so a build log does not turn into thousands of events. A terminal on another machine is a local
//! pseudo console running `ssh -t <host>`; the frontend types the `cd` once the shell is ready.

use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::connections::lock;

pub const TERMINAL_EVENT: &str = "terminal";

/// One frame at 120 Hz: output that arrives within it goes out as one event.
const BATCH_WINDOW: Duration = Duration::from_millis(8);
/// Caps one event, so a flood of output never becomes a single huge message.
const BATCH_MAX_BYTES: usize = 64 * 1024;
const READ_BUFFER_BYTES: usize = 16 * 1024;
/// Variables that tie a process to the Claude session or herdr pane Bull was started from. Claude
/// settings a user set on purpose (`CLAUDE_CODE_GIT_BASH_PATH`, `CLAUDE_CODE_USE_BEDROCK` …) pass.
const SESSION_VARS: [&str; 5] =
    ["CLAUDECODE", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT", "CLAUDE_PID"];
const SESSION_VAR_PREFIXES: [&str; 4] =
    ["CLAUDE_CODE_SESSION_", "CLAUDE_CODE_CHILD_", "CLAUDE_CODE_MESSAGING_", "HERDR_"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shell {
    Pwsh,
    Powershell,
    Cmd,
    Bash,
    /// The shell macOS or Linux logs the user in to (`$SHELL`, zsh on a Mac)
    Login,
}

/// Windows offers its shells to pick from; macOS and Linux start the user's own login shell, which
/// already is the one they chose for every terminal there.
#[cfg(windows)]
const SHELLS: [Shell; 4] = [Shell::Pwsh, Shell::Powershell, Shell::Cmd, Shell::Bash];
#[cfg(not(windows))]
const SHELLS: [Shell; 1] = [Shell::Login];
/// Where `$SHELL` is not set or gone: the system's default shell, then `/bin/sh`, which every
/// macOS and Linux has, so a terminal always starts.
#[cfg(target_os = "macos")]
const FALLBACK_LOGIN_SHELLS: [&str; 2] = ["/bin/zsh", "/bin/sh"];
#[cfg(all(not(windows), not(target_os = "macos")))]
const FALLBACK_LOGIN_SHELLS: [&str; 2] = ["/bin/bash", "/bin/sh"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalEvent {
    Output { id: u32, data: String },
    Exit { id: u32, code: u32 },
}

#[derive(Debug, thiserror::Error)]
pub enum TerminalError {
    #[error("cannot open a pseudo console: {0}")]
    Open(String),
    #[error("cannot start {0}: {1}")]
    Spawn(String, String),
    #[error("{0:?} is not installed")]
    ShellMissing(Shell),
    #[error("folder {0} does not exist")]
    NoFolder(String),
    #[error("terminal {0} is gone")]
    NotFound(u32),
    #[error("terminal {0}: {1}")]
    Io(u32, io::Error),
}

impl Serialize for TerminalError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnRequest {
    /// SSH host alias; `None` is this machine
    pub machine: Option<String>,
    /// Empty: the home folder. On another machine the frontend changes into it.
    pub cwd: String,
    /// Ignored on another machine, where the login shell of the host answers
    pub shell: Shell,
    #[serde(default)]
    pub env: HashMap<String, String>,
    pub cols: u16,
    pub rows: u16,
}

type Sink = Arc<dyn Fn(TerminalEvent) + Send + Sync>;

struct Pty {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

pub struct TerminalHost {
    sink: Sink,
    ptys: Arc<Mutex<HashMap<u32, Arc<Pty>>>>,
    next_id: AtomicU32,
}

enum Chunk {
    Data(Vec<u8>),
    /// The reader hit the end: the pseudo console is closed.
    Eof,
    Exited(u32),
}

impl TerminalHost {
    pub fn new(sink: impl Fn(TerminalEvent) + Send + Sync + 'static) -> Self {
        restore_ctrl_c();
        Self { sink: Arc::new(sink), ptys: Arc::new(Mutex::new(HashMap::new())), next_id: AtomicU32::new(1) }
    }

    pub fn spawn(&self, request: &SpawnRequest) -> Result<u32, TerminalError> {
        let command = command_of(request)?;
        self.spawn_command(command, request.cols, request.rows)
    }

    fn spawn_command(&self, command: CommandBuilder, cols: u16, rows: u16) -> Result<u32, TerminalError> {
        let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
        let pair = native_pty_system().openpty(size).map_err(|err| TerminalError::Open(err.to_string()))?;
        let program = command.get_argv().first().map(|arg| arg.to_string_lossy().into_owned()).unwrap_or_default();
        let mut child = pair.slave.spawn_command(command).map_err(|err| TerminalError::Spawn(program, err.to_string()))?;
        // Only the child may hold the console's other end, or the reader never sees its end.
        drop(pair.slave);
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let reader = pair.master.try_clone_reader().map_err(|err| TerminalError::Open(err.to_string()))?;
        let writer = pair.master.take_writer().map_err(|err| TerminalError::Open(err.to_string()))?;
        let pty = Pty { master: Mutex::new(pair.master), writer: Mutex::new(writer), killer: Mutex::new(child.clone_killer()) };
        lock(&self.ptys).insert(id, Arc::new(pty));

        let (sender, receiver) = mpsc::channel();
        let sink = Arc::clone(&self.sink);
        thread::spawn(move || pump(&*sink, id, &receiver));
        let to_pump = sender.clone();
        thread::spawn(move || read_until_end(reader, &to_pump));
        let ptys = Arc::clone(&self.ptys);
        thread::spawn(move || {
            let code = child.wait().map(|status| status.exit_code()).unwrap_or(u32::MAX);
            // The pump only stops after the exit; a closed channel means the app is going away.
            let _ = sender.send(Chunk::Exited(code));
            // Dropping the console ends the reader on Windows, where the pipe outlives the shell.
            lock(&ptys).remove(&id);
        });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), TerminalError> {
        let pty = self.pty(id)?;
        // The map is not locked here: a shell that does not read its input blocks only itself.
        let mut writer = lock(&pty.writer);
        writer.write_all(data.as_bytes()).and_then(|()| writer.flush()).map_err(|err| TerminalError::Io(id, err))
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), TerminalError> {
        let pty = self.pty(id)?;
        let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
        let master = lock(&pty.master);
        master.resize(size).map_err(|err| TerminalError::Io(id, io::Error::other(err.to_string())))
    }

    /// The waiting thread cleans up and reports the exit.
    pub fn kill(&self, id: u32) -> Result<(), TerminalError> {
        let pty = self.pty(id)?;
        // portable-pty 0.9 on Windows reports a successful TerminateProcess as an error (inverted
        // check in `WinChildKiller::kill`), so the result says nothing. The exit event tells.
        let _ = lock(&pty.killer).kill();
        Ok(())
    }

    pub fn kill_all(&self) {
        let ptys: Vec<Arc<Pty>> = lock(&self.ptys).values().cloned().collect();
        for pty in ptys {
            // Already ending on its own; nothing left to stop.
            let _ = lock(&pty.killer).kill();
        }
    }

    fn pty(&self, id: u32) -> Result<Arc<Pty>, TerminalError> {
        lock(&self.ptys).get(&id).cloned().ok_or(TerminalError::NotFound(id))
    }
}

/// A process started in a process group of its own (as from a background shell or some launchers)
/// ignores Ctrl+C, and every child inherits that: Ctrl+C in a terminal then stopped nothing.
/// Bull has no console to be interrupted through, so normal handling is turned back on for it
/// and therefore for its shells.
#[cfg(windows)]
fn restore_ctrl_c() {
    use windows::Win32::System::Console::SetConsoleCtrlHandler;
    // SAFETY: no handler routine is passed; this only resets the process' ignore-Ctrl+C flag.
    if let Err(err) = unsafe { SetConsoleCtrlHandler(None, false) } {
        eprintln!("terminal: cannot restore Ctrl+C handling: {err}");
    }
}

#[cfg(not(windows))]
fn restore_ctrl_c() {}

fn read_until_end(mut reader: Box<dyn Read + Send>, to_pump: &Sender<Chunk>) {
    let mut buffer = vec![0; READ_BUFFER_BYTES];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                if to_pump.send(Chunk::Data(buffer[..read].to_vec())).is_err() {
                    return;
                }
            }
        }
    }
    // As above: nobody is left to tell when the pump is gone.
    let _ = to_pump.send(Chunk::Eof);
}

/// Sends output in batches and the exit once both the shell ended and its last output was read.
fn pump(sink: &(dyn Fn(TerminalEvent) + Send + Sync), id: u32, receiver: &Receiver<Chunk>) {
    let mut bytes = Vec::new();
    let mut is_read = false;
    let mut code = None;
    while let Ok(first) = receiver.recv() {
        let deadline = Instant::now() + BATCH_WINDOW;
        let mut next = Some(first);
        while let Some(chunk) = next.take() {
            match chunk {
                Chunk::Data(data) => bytes.extend_from_slice(&data),
                Chunk::Eof => is_read = true,
                Chunk::Exited(exit) => code = Some(exit),
            }
            if bytes.len() >= BATCH_MAX_BYTES || (is_read && code.is_some()) {
                break;
            }
            match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(chunk) => next = Some(chunk),
                Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => break,
            }
        }
        let data = take_text(&mut bytes);
        if !data.is_empty() {
            sink(TerminalEvent::Output { id, data });
        }
        if let (true, Some(code)) = (is_read, code) {
            sink(TerminalEvent::Exit { id, code });
            return;
        }
    }
}

/// The text of `bytes`, leaving an incomplete UTF-8 sequence at the end for the next batch:
/// a read can stop in the middle of a character.
fn take_text(bytes: &mut Vec<u8>) -> String {
    let cut = match std::str::from_utf8(bytes) {
        Err(err) if err.error_len().is_none() => err.valid_up_to(),
        _ => bytes.len(),
    };
    let rest = bytes.split_off(cut);
    let text = String::from_utf8_lossy(bytes).into_owned();
    *bytes = rest;
    text
}

fn command_of(request: &SpawnRequest) -> Result<CommandBuilder, TerminalError> {
    let mut command = match &request.machine {
        Some(host) => {
            let mut command = CommandBuilder::new(crate::connections::ssh_program());
            let entry = crate::machines::resolve(host).map_err(|err| TerminalError::Spawn(host.clone(), err.to_string()))?;
            command.arg("-t");
            command.args(entry.ssh_args());
            command.cwd(home_folder());
            command
        }
        None => {
            let program = program_of(request.shell).ok_or(TerminalError::ShellMissing(request.shell))?;
            let mut command = CommandBuilder::new(program);
            command.args(shell_args(request.shell));
            command.cwd(local_folder(&request.cwd)?);
            command
        }
    };
    scrub_inherited_env(&mut command);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    for (key, value) in &request.env {
        command.env(key, value);
    }
    Ok(command)
}

/// Bull may itself run inside a Claude session or a herdr pane (`npm run app:dev` from one). An
/// inherited `CLAUDE_CONFIG_DIR` would log `claude /login` of the default profile into that
/// session's account, `CLAUDECODE` marks Claude as a nested session, and HERDR_* let herdr claim
/// the shell. The request's env comes after.
fn scrub_inherited_env(command: &mut CommandBuilder) {
    for (key, _) in std::env::vars_os() {
        if is_session_var(&key.to_string_lossy()) {
            command.env_remove(key);
        }
    }
}

/// Windows variable names ignore case, so `Claude_Config_Dir` is the same variable.
fn is_session_var(name: &str) -> bool {
    let name = name.to_ascii_uppercase();
    SESSION_VARS.contains(&name.as_str()) || SESSION_VAR_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
}

fn local_folder(cwd: &str) -> Result<PathBuf, TerminalError> {
    if cwd.is_empty() {
        return Ok(home_folder());
    }
    let folder = PathBuf::from(cwd);
    if folder.is_dir() { Ok(folder) } else { Err(TerminalError::NoFolder(cwd.to_string())) }
}

fn home_folder() -> PathBuf {
    crate::connections::home_folder().unwrap_or_else(|| PathBuf::from("."))
}

fn shell_args(shell: Shell) -> &'static [&'static str] {
    match shell {
        Shell::Pwsh | Shell::Powershell => &["-NoLogo"],
        Shell::Cmd => &[],
        Shell::Bash => &["--login", "-i"],
        // zsh, bash and fish all read `-l`; the profile sets PATH (Homebrew, nvm) as in Terminal.app.
        Shell::Login => &["-l"],
    }
}

/// Where the shell's program is, or `None` when it is not installed.
fn program_of(shell: Shell) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let folders: Vec<PathBuf> = std::env::split_paths(&path).collect();
    match shell {
        Shell::Pwsh => find_in(&folders, &exe_name("pwsh")),
        Shell::Powershell => find_in(&folders, &exe_name("powershell")),
        Shell::Cmd => find_in(&folders, &exe_name("cmd")),
        Shell::Bash => git_bash().or_else(|| {
            // System32's bash.exe starts WSL, not the bash a Windows user means.
            let outside_system: Vec<PathBuf> = folders.into_iter().filter(|folder| !is_system_folder(folder)).collect();
            find_in(&outside_system, &exe_name("bash"))
        }),
        Shell::Login => login_shell(),
    }
}

fn exe_name(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

fn find_in(folders: &[PathBuf], file: &str) -> Option<PathBuf> {
    folders.iter().map(|folder| folder.join(file)).find(|candidate| candidate.is_file())
}

/// System32 (and its 32-bit views) hold the WSL launcher `bash.exe`, however PATH spells them.
fn is_system_folder(folder: &Path) -> bool {
    let name = folder.file_name().map(|name| name.to_string_lossy().to_ascii_lowercase());
    matches!(name.as_deref(), Some("system32" | "syswow64" | "sysnative"))
}

fn git_bash() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let program_files = std::env::var_os("ProgramFiles")?;
    let bash = PathBuf::from(program_files).join(r"Git\bin\bash.exe");
    bash.is_file().then_some(bash)
}


#[cfg(windows)]
fn login_shell() -> Option<PathBuf> {
    None
}

#[cfg(not(windows))]
fn login_shell() -> Option<PathBuf> {
    let own = std::env::var_os("SHELL").map(PathBuf::from);
    own.into_iter().chain(FALLBACK_LOGIN_SHELLS.map(PathBuf::from)).find(|shell| shell.is_file())
}

#[tauri::command(async)]
pub fn terminal_shells() -> Vec<Shell> {
    SHELLS.into_iter().filter(|shell| program_of(*shell).is_some()).collect()
}

#[tauri::command(async)]
pub fn terminal_spawn(host: State<'_, TerminalHost>, request: SpawnRequest) -> Result<u32, TerminalError> {
    host.spawn(&request)
}

#[tauri::command(async)]
pub fn terminal_write(host: State<'_, TerminalHost>, id: u32, data: String) -> Result<(), TerminalError> {
    host.write(id, &data)
}

#[tauri::command(async)]
pub fn terminal_resize(host: State<'_, TerminalHost>, id: u32, cols: u16, rows: u16) -> Result<(), TerminalError> {
    host.resize(id, cols, rows)
}

#[tauri::command(async)]
pub fn terminal_kill(host: State<'_, TerminalHost>, id: u32) -> Result<(), TerminalError> {
    host.kill(id)
}

/// A reloaded page lost its terminals; the shells it started must not run on unseen.
#[tauri::command(async)]
pub fn terminal_kill_all(host: State<'_, TerminalHost>) {
    host.kill_all();
}

#[cfg(test)]
mod tests {
    use super::*;

    const WAIT: Duration = Duration::from_secs(20);

    #[test]
    fn drops_only_the_variables_of_a_parent_session() {
        for name in ["CLAUDECODE", "CLAUDE_CONFIG_DIR", "Claude_Config_Dir", "CLAUDE_CODE_SESSION_ID", "HERDR_PANE"] {
            assert!(is_session_var(name), "{name}");
        }
        for name in ["CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CODE_FORCE_TERMINAL_IMAGES", "PATH"] {
            assert!(!is_session_var(name), "{name}");
        }
    }

    #[test]
    fn keeps_a_split_character_for_the_next_batch() {
        let mut bytes = "a€".as_bytes()[..2].to_vec();
        assert_eq!(take_text(&mut bytes), "a");
        assert_eq!(bytes, vec![0xE2]);
        bytes.extend_from_slice(&"€".as_bytes()[1..]);
        assert_eq!(take_text(&mut bytes), "€");
        assert!(bytes.is_empty());
    }

    #[test]
    fn replaces_invalid_bytes_in_the_middle() {
        let mut bytes = vec![b'a', 0xFF, b'b'];
        assert_eq!(take_text(&mut bytes), "a\u{FFFD}b");
        assert!(bytes.is_empty());
    }

    #[test]
    fn events_serialize_tagged() {
        let json = serde_json::to_string(&TerminalEvent::Exit { id: 3, code: 0 }).unwrap();
        assert_eq!(json, r#"{"type":"exit","id":3,"code":0}"#);
    }

    #[test]
    fn reads_the_spawn_request_in_camel_case() {
        let request: SpawnRequest =
            serde_json::from_str(r#"{"machine":null,"cwd":"","shell":"pwsh","cols":80,"rows":24}"#).unwrap();
        assert_eq!(request.shell, Shell::Pwsh);
        assert!(request.env.is_empty());
    }

    #[test]
    fn skips_system32_however_path_spells_it() {
        let folders = [r"C:\WINDOWS\system32\", r"C:\Windows\SysWOW64", r"C:\Program Files\Gitin"];
        let flags: Vec<bool> = folders.iter().map(|folder| is_system_folder(Path::new(folder))).collect();
        assert_eq!(flags, vec![cfg!(windows), cfg!(windows), false]);
    }

    #[test]
    fn a_missing_folder_is_an_error() {
        let result = local_folder(r"Z:\no\such\folder\for\bull");
        assert!(matches!(result, Err(TerminalError::NoFolder(_))));
    }

    #[test]
    fn an_empty_folder_is_home() {
        assert_eq!(local_folder("").unwrap(), home_folder());
    }

    #[test]
    fn unknown_terminals_are_not_found() {
        let host = TerminalHost::new(|_| {});
        assert!(matches!(host.write(99, "x"), Err(TerminalError::NotFound(99))));
        assert!(matches!(host.kill(99), Err(TerminalError::NotFound(99))));
    }

    fn collecting_host() -> (TerminalHost, Receiver<TerminalEvent>) {
        let (sender, receiver) = mpsc::channel();
        let sender = Mutex::new(sender);
        let host = TerminalHost::new(move |event| {
            // The test that reads them may already have finished.
            let _ = lock(&sender).send(event);
        });
        (host, receiver)
    }

    /// Everything a terminal printed until it exited, and its exit code.
    fn run_to_exit(receiver: &Receiver<TerminalEvent>, id: u32) -> (String, u32) {
        let mut output = String::new();
        loop {
            match receiver.recv_timeout(WAIT).expect("terminal did not exit in time") {
                TerminalEvent::Output { id: from, data } if from == id => output.push_str(&data),
                TerminalEvent::Exit { id: from, code } if from == id => return (output, code),
                _ => {}
            }
        }
    }

    #[cfg(windows)]
    fn echo_command(text: &str) -> CommandBuilder {
        let mut command = CommandBuilder::new("cmd.exe");
        command.args(["/d", "/c", "echo", text]);
        command
    }

    #[cfg(not(windows))]
    fn echo_command(text: &str) -> CommandBuilder {
        let mut command = CommandBuilder::new("echo");
        command.arg(text);
        command
    }

    #[test]
    fn streams_output_and_reports_the_exit() {
        let (host, receiver) = collecting_host();
        let id = host.spawn_command(echo_command("bull-pty-test"), 80, 24).unwrap();
        let (output, code) = run_to_exit(&receiver, id);
        assert!(output.contains("bull-pty-test"), "output was {output:?}");
        assert_eq!(code, 0);
        assert!(matches!(host.write(id, "x"), Err(TerminalError::NotFound(_))));
    }

    #[test]
    fn names_the_login_shell_as_the_frontend_does() {
        assert_eq!(serde_json::from_str::<Shell>(r#""login""#).unwrap(), Shell::Login);
    }

    #[cfg(windows)]
    #[test]
    fn offers_no_login_shell_on_windows() {
        assert!(!terminal_shells().contains(&Shell::Login));
    }

    #[cfg(not(windows))]
    #[test]
    fn offers_only_the_login_shell_elsewhere() {
        assert_eq!(terminal_shells(), vec![Shell::Login]);
    }

    #[cfg(windows)]
    #[test]
    fn kill_ends_a_running_shell() {
        let (host, receiver) = collecting_host();
        let mut command = CommandBuilder::new("cmd.exe");
        command.arg("/d");
        let id = host.spawn_command(command, 80, 24).unwrap();
        host.write(id, "echo typed-into-cmd\r").unwrap();
        host.resize(id, 100, 30).unwrap();
        let mut output = String::new();
        // The typed line and then its echo: the command ran.
        while output.matches("typed-into-cmd").count() < 2 {
            match receiver.recv_timeout(WAIT).expect("cmd did not answer in time") {
                TerminalEvent::Output { data, .. } => output.push_str(&data),
                TerminalEvent::Exit { .. } => panic!("cmd exited early: {output:?}"),
            }
        }
        host.kill(id).unwrap();
        run_to_exit(&receiver, id);
        assert!(matches!(host.write(id, "x"), Err(TerminalError::NotFound(_))));
    }

    #[cfg(windows)]
    #[test]
    fn finds_cmd_on_windows() {
        assert!(terminal_shells().contains(&Shell::Cmd));
    }
}
