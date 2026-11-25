//! agentd on another machine. `agentd serve` owns the Claude processes and listens on localhost;
//! `agentd connect`, started over SSH, relays one app to it. Claude keeps running when the SSH
//! connection ends, because only the server, not the relay, is its parent.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use crate::daemon::Daemon;
use crate::paths::{home, APP_FOLDER};

const DEFAULT_PORT: u16 = 14620;
/// Lets the tests run their own server next to a real one.
const PORT_VAR: &str = "AGENTD_PORT";
const HANDSHAKE_OK: &[u8; 3] = b"ok\n";
const START_TIMEOUT: Duration = Duration::from_secs(15);
const RETRY_DELAY: Duration = Duration::from_millis(200);
const IDLE_CHECK: Duration = Duration::from_secs(30);

/// Every connected app; each agentd event goes to all of them.
#[derive(Clone, Default)]
struct Clients(Arc<Mutex<Vec<(u64, TcpStream)>>>);

impl Clients {
    fn lock(&self) -> MutexGuard<'_, Vec<(u64, TcpStream)>> {
        // A panicked client thread leaves the list usable.
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Write for Clients {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // An app that went away is dropped; the others still get the event.
        self.lock().retain_mut(|(_, stream)| stream.write_all(buf).is_ok());
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn serve() -> io::Result<()> {
    // The port doubles as the lock: a second server on this machine stops here.
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port()))?;
    // Before the first thread: it changes the environment every Claude inherits.
    #[cfg(unix)]
    crate::login_path::adopt();
    let token = uuid::Uuid::new_v4().to_string();
    write_token(&token)?;
    let clients = Clients::default();
    let daemon = Daemon::new(clients.clone());
    let (idle_daemon, idle_clients) = (Arc::clone(&daemon), clients.clone());
    thread::spawn(move || loop {
        thread::sleep(IDLE_CHECK);
        if idle_daemon.is_idle() && idle_clients.lock().is_empty() {
            std::process::exit(0);
        }
    });
    for (id, stream) in (1u64..).zip(listener.incoming().filter_map(Result::ok)) {
        let (daemon, clients, token) = (Arc::clone(&daemon), clients.clone(), token.clone());
        thread::spawn(move || serve_client(&daemon, &clients, id, stream, &token));
    }
    Ok(())
}

fn serve_client(daemon: &Arc<Daemon<Clients>>, clients: &Clients, id: u64, stream: TcpStream, token: &str) {
    let Ok(mut writer) = stream.try_clone() else { return };
    let mut lines = BufReader::new(stream).lines();
    if lines.next().and_then(Result::ok).as_deref() != Some(token) {
        return;
    }
    // Before joining the list, so the reply comes ahead of any event.
    if writer.write_all(HANDSHAKE_OK).is_err() {
        return;
    }
    clients.lock().push((id, writer));
    for line in lines.map_while(Result::ok) {
        daemon.request(&line);
    }
    clients.lock().retain(|(known, _)| *known != id);
}

/// Relays stdin and stdout to the server, starting it first when none runs.
pub fn connect() -> io::Result<()> {
    let mut server = match attach() {
        Ok(server) => server,
        Err(_) => {
            start_server()?;
            wait_for_server()?
        }
    };
    let mut from_server = server.try_clone()?;
    thread::spawn(move || {
        // Ends the relay once the server is gone, so the app sees the connection close.
        let _ = io::copy(&mut from_server, &mut io::stdout().lock());
        std::process::exit(0);
    });
    io::copy(&mut io::stdin().lock(), &mut server)?;
    Ok(())
}

fn attach() -> io::Result<TcpStream> {
    let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port()))?;
    let token = std::fs::read_to_string(token_path()?)?;
    writeln!(stream, "{}", token.trim())?;
    // Read by hand: a buffered reader could swallow the first events behind the reply.
    let mut reply = [0u8; HANDSHAKE_OK.len()];
    stream.read_exact(&mut reply)?;
    if &reply != HANDSHAKE_OK {
        return Err(io::Error::other("agentd server refused the token"));
    }
    Ok(stream)
}

fn wait_for_server() -> io::Result<TcpStream> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        thread::sleep(RETRY_DELAY);
        match attach() {
            Ok(server) => return Ok(server),
            Err(err) if Instant::now() > deadline => return Err(err),
            Err(_) => {}
        }
    }
}

/// Windows' OpenSSH ends every process the session started, even detached ones. A process
/// created through WMI is not part of the session, so it outlives the connection.
/// DETACHED_PROCESS (8): WMI otherwise gives the console exe a visible console window.
#[cfg(windows)]
fn start_server() -> io::Result<()> {
    const EXE_VAR: &str = "AGENTD_EXE";
    const WMI_CREATE: &str = "$ErrorActionPreference = 'Stop'; \
        $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly \
        -Property @{ CreateFlags = [uint32]8 }; \
        $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create \
        -Arguments @{ CommandLine = ([char]34 + $env:AGENTD_EXE + [char]34 + ' serve'); \
        ProcessStartupInformation = $startup }; \
        exit $result.ReturnValue";
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", WMI_CREATE])
        .env(EXE_VAR, std::env::current_exe()?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    if !status.success() {
        return Err(io::Error::other("could not start the agentd server through WMI"));
    }
    Ok(())
}

/// Its own session without a terminal, so the hangup at the end of an SSH login does not reach it,
/// and reparented to init once this relay ends. A process manager that kills the whole login
/// (systemd's `KillUserProcesses=yes`) still ends it; that needs `loginctl enable-linger`.
#[cfg(not(windows))]
fn start_server() -> io::Result<()> {
    use std::os::unix::process::CommandExt;
    let mut command = Command::new(std::env::current_exe()?);
    command.arg("serve").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    // SAFETY: setsid and errno are async-signal-safe and touch no memory of the parent.
    unsafe {
        command.pre_exec(|| if libc::setsid() == -1 { Err(io::Error::last_os_error()) } else { Ok(()) });
    }
    command.spawn()?;
    Ok(())
}

fn port() -> u16 {
    std::env::var(PORT_VAR).ok().and_then(|port| port.parse().ok()).unwrap_or(DEFAULT_PORT)
}

/// Any local account can reach localhost; only the one that runs the server can read this file.
fn token_path() -> io::Result<PathBuf> {
    let home = home().ok_or_else(|| io::Error::other("home folder unknown"))?;
    Ok(home.join(APP_FOLDER).join(format!("agentd-{}.token", port())))
}

fn write_token(token: &str) -> io::Result<()> {
    let path = token_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(path)?.write_all(token.as_bytes())
}
