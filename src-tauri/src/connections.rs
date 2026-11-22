//! One `agentd connect` per machine, JSON lines both ways: for this machine a local child
//! process, for another one over `ssh -T`. Either way Claude runs under a background
//! `agentd serve` and outlives the app. Events go to one window event; tab ids and request ids
//! are unique app-wide, so the frontend needs no machine on events. Only Windows targets for
//! other machines for now (`cmd /d /c`).

use std::collections::{HashMap, HashSet};
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::agent_host::AGENTD_EVENT;
use crate::local_agentd;
use crate::machines::{self, MachineEntry};

/// Where the setup assistant puts agentd, relative to the SSH login folder.
/// `cmd` instead of the PowerShell login shell: only the first stdin line would reach a script.
pub(crate) const REMOTE_COMMAND: &str = r"cmd /d /c .nexron-chat\agentd.exe connect";

/// How long ssh tries to reach a host. Without it Windows gives up on an unreachable one after
/// ~21 s (measured against `nexron-server` offline), and every view asking it waits that long;
/// 10 s still leaves a slow Tailscale relay path plenty of room. On the command line it wins over
/// a `ConnectTimeout` in `~/.ssh/config`.
pub(crate) const SSH_CONNECT_TIMEOUT: &str = "ConnectTimeout=10";

/// An SSH host alias; `None` is this machine.
pub type Machine = Option<String>;

#[derive(Debug, thiserror::Error)]
pub enum ConnectionError {
    #[error("cannot start agentd connect for {name}: {1}", name = name_of(.0))]
    Spawn(Machine, io::Error),
    #[error("connection to {} is closed", name_of(.0))]
    Closed(Machine),
    #[error(transparent)]
    Local(#[from] local_agentd::LocalAgentdError),
    #[error(transparent)]
    Machine(#[from] machines::MachinesError),
    #[error("agentd is being installed on {0}")]
    Installing(String),
}

fn name_of(machine: &Machine) -> &str {
    machine.as_deref().unwrap_or("this machine")
}

struct Connection {
    /// Tells a pump whose connection ended from the one that replaced it.
    id: u64,
    child: Child,
    stdin: ChildStdin,
}

pub struct Connections {
    app: AppHandle,
    connections: Arc<Mutex<HashMap<Machine, Connection>>>,
    next_id: AtomicU64,
    /// Machines agentd is being installed on; nothing connects there meanwhile.
    installing: Arc<Mutex<HashSet<String>>>,
}

/// Lets the machine connect again once dropped.
pub struct Paused {
    installing: Arc<Mutex<HashSet<String>>>,
    name: String,
}

impl Drop for Paused {
    fn drop(&mut self) {
        lock(&self.installing).remove(&self.name);
    }
}

impl Connections {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            connections: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(0),
            installing: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Closes the machine's connection and refuses new ones until the guard is dropped: its
    /// `agentd connect` would lock the exe being replaced.
    pub fn pause(&self, name: &str) -> Paused {
        let connection = {
            // Under the connections lock, the one `send` holds while it checks and connects: no
            // connection can open between marking the machine and closing what it has.
            let mut connections = lock(&self.connections);
            lock(&self.installing).insert(name.to_string());
            connections.remove(&Some(name.to_string()))
        };
        end(connection);
        Paused { installing: Arc::clone(&self.installing), name: name.to_string() }
    }

    /// Ends the connection to a machine; its pump tells the window, as for any lost connection.
    pub fn disconnect(&self, name: &str) {
        let connection = lock(&self.connections).remove(&Some(name.to_string()));
        end(connection);
    }

    /// Sends one protocol line, connecting first if needed, and returns the connection's id.
    pub fn send(&self, machine: &Machine, line: &str) -> Result<u64, ConnectionError> {
        let mut connections = lock(&self.connections);
        if let Some(name) = machine.as_ref().filter(|name| lock(&self.installing).contains(*name)) {
            return Err(ConnectionError::Installing(name.clone()));
        }
        if !connections.contains_key(machine) {
            let connection = self.connect(machine)?;
            connections.insert(machine.clone(), connection);
        }
        let connection = connections.get_mut(machine).ok_or_else(|| ConnectionError::Closed(machine.clone()))?;
        if writeln!(connection.stdin, "{line}").and_then(|()| connection.stdin.flush()).is_err() {
            connections.remove(machine);
            return Err(ConnectionError::Closed(machine.clone()));
        }
        Ok(connection.id)
    }

    fn connect(&self, machine: &Machine) -> Result<Connection, ConnectionError> {
        let mut command = match machine {
            Some(name) => ssh_command(&machines::resolve(name)?),
            None => local_command()?,
        };
        command.stdin(Stdio::piped()).stdout(Stdio::piped());
        hide_console(&mut command);
        let mut child = command.spawn().map_err(|err| ConnectionError::Spawn(machine.clone(), err))?;
        let stdin = child.stdin.take().ok_or_else(|| ConnectionError::Closed(machine.clone()))?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        if let Some(stdout) = child.stdout.take() {
            let (app, connections, machine) = (self.app.clone(), Arc::clone(&self.connections), machine.clone());
            thread::spawn(move || pump(&app, &connections, &machine, id, stdout));
        }
        Ok(Connection { id, child, stdin })
    }
}

fn ssh_command(entry: &MachineEntry) -> Command {
    let mut command = Command::new(ssh_program());
    // stderr stays unread: when the connection fails, the setup assistant's check tells why.
    command
        .args(["-T", "-o", "BatchMode=yes", "-o", SSH_CONNECT_TIMEOUT, "-o", "ServerAliveInterval=15"])
        .args(entry.ssh_args())
        .arg(REMOTE_COMMAND)
        .stderr(Stdio::null());
    command
}

fn local_command() -> Result<Command, ConnectionError> {
    let mut command = Command::new(local_agentd::installed_exe()?);
    // agentd's own complaints (no server, refused token) land in the app's log.
    command.arg("connect").stderr(Stdio::inherit());
    Ok(command)
}

/// Forwards agentd's lines until the connection ends, then tells the window so the tabs of
/// that machine stop waiting.
fn pump(app: &AppHandle, connections: &Mutex<HashMap<Machine, Connection>>, machine: &Machine, id: u64, stdout: impl io::Read) {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        // A closed window has nobody left to tell.
        let _ = app.emit(AGENTD_EVENT, line);
    }
    let mut connections = lock(connections);
    if connections.get(machine).is_some_and(|connection| connection.id == id)
        && let Some(mut connection) = connections.remove(machine)
    {
        // Already ended; the status is not needed.
        let _ = connection.child.wait();
    }
    drop(connections);
    // The id tells the window which requests died with this connection: one sent meanwhile may
    // already be on its replacement.
    let lost = serde_json::json!({ "type": "disconnected", "machine": machine, "connection": id }).to_string();
    let _ = app.emit(AGENTD_EVENT, lost);
}

fn end(connection: Option<Connection>) {
    if let Some(mut connection) = connection {
        // Already ended is just as good.
        let _ = connection.child.kill();
        let _ = connection.child.wait();
    }
}

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panicked reader thread leaves the map usable.
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn ssh_program() -> PathBuf {
    openssh_program("ssh")
}

/// Windows' own OpenSSH: Git's ssh.exe, often first on PATH, mangles the remote cmd line.
pub(crate) fn openssh_program(name: &str) -> PathBuf {
    match std::env::var_os("SystemRoot") {
        Some(root) if cfg!(windows) => PathBuf::from(root).join("System32").join("OpenSSH").join(format!("{name}.exe")),
        _ => PathBuf::from(name),
    }
}

#[cfg(windows)]
pub(crate) fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console(_command: &mut Command) {}

pub(crate) fn home_folder() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}
