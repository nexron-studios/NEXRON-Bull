//! agentd on another machine. `agentd serve` owns the Claude processes and listens on localhost;
//! `agentd connect`, started over SSH, relays one app to it. Claude keeps running when the SSH
//! connection ends, because only the server, not the relay, is its parent.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::Value;

use crate::daemon::Daemon;
use crate::paths::{home, APP_FOLDER};

const DEFAULT_PORT: u16 = 14620;
/// Lets the tests run their own server next to a real one.
const PORT_VAR: &str = "AGENTD_PORT";
const HANDSHAKE_OK: &[u8; 3] = b"ok\n";
const START_TIMEOUT: Duration = Duration::from_secs(15);
const RETRY_DELAY: Duration = Duration::from_millis(200);
const IDLE_CHECK: Duration = Duration::from_secs(30);
/// Requests still waiting for their answer, over all apps. An app puts an id only on what answers,
/// but an op that never does would keep its entry; past this the oldest are given up.
const MAX_OPEN_ASKS: usize = 4096;

/// Every connected app. An answer goes back only to the app that asked, under the id it asked
/// with: every app counts its request ids from 1, so the server hands agentd ids of its own.
/// Any other event goes to all of them.
#[derive(Clone, Default)]
struct Clients(Arc<Mutex<Routes>>);

#[derive(Default)]
struct Routes {
    streams: Vec<(u64, TcpStream)>,
    /// Server request id → the app that asked and its own id; gone once answered.
    asked: BTreeMap<u64, (u64, u64)>,
    /// Ids asked by an app that left before the answer: that answer goes to nobody.
    orphaned: BTreeSet<u64>,
    next_id: u64,
    /// `emit` may write one event in pieces; it is routed once its line is complete.
    line: Vec<u8>,
}

impl Clients {
    fn lock(&self) -> MutexGuard<'_, Routes> {
        // A panicked client thread leaves the list usable.
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The request with a server id in place of the app's, which its answer gets back.
    fn assign_id(&self, client: u64, line: &str) -> String {
        let Ok(mut request) = serde_json::from_str::<Value>(line) else { return line.to_string() };
        let Some(own) = request["id"].as_u64() else { return line.to_string() };
        let mut routes = self.lock();
        routes.next_id += 1;
        let id = routes.next_id;
        routes.asked.insert(id, (client, own));
        if routes.asked.len() > MAX_OPEN_ASKS {
            routes.asked.pop_first();
        }
        request["id"] = Value::from(id);
        request.to_string()
    }

    fn leave(&self, client: u64) {
        let mut routes = self.lock();
        routes.streams.retain(|(known, _)| *known != client);
        let gone: Vec<u64> = routes.asked.iter().filter(|(_, (asker, _))| *asker == client).map(|(id, _)| *id).collect();
        for id in gone {
            routes.asked.remove(&id);
            routes.orphaned.insert(id);
        }
        while routes.orphaned.len() > MAX_OPEN_ASKS {
            routes.orphaned.pop_first();
        }
    }
}

#[derive(Deserialize)]
struct Answer {
    id: Option<u64>,
}

impl Routes {
    fn route(&mut self, line: &[u8]) {
        // Most lines are stream events without an id: reading only the id skips building a whole
        // `Value` for each of them; the few answers are read in full below.
        let id = serde_json::from_slice::<Answer>(line).ok().and_then(|answer| answer.id);
        let Some(id) = id else { return self.broadcast(line) };
        let mut event: Value = match serde_json::from_slice(line) {
            Ok(event) => event,
            Err(_) => return self.broadcast(line),
        };
        if self.orphaned.remove(&id) {
            return;
        }
        let Some((client, own)) = self.asked.remove(&id) else {
            // A second event for an answered request: its id means nothing to any app.
            event["id"] = Value::Null;
            return self.broadcast(format!("{event}\n").as_bytes());
        };
        event["id"] = Value::from(own);
        let line = format!("{event}\n");
        self.streams.retain_mut(|(known, stream)| *known != client || stream.write_all(line.as_bytes()).is_ok());
    }

    fn broadcast(&mut self, line: &[u8]) {
        // An app that went away is dropped; the others still get the event.
        self.streams.retain_mut(|(_, stream)| stream.write_all(line).is_ok());
    }
}

impl Write for Clients {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut routes = self.lock();
        routes.line.extend_from_slice(buf);
        while let Some(end) = routes.line.iter().position(|&byte| byte == b'\n') {
            let line: Vec<u8> = routes.line.drain(..=end).collect();
            routes.route(&line);
        }
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
        if idle_daemon.is_idle() && idle_clients.lock().streams.is_empty() {
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
    clients.lock().streams.push((id, writer));
    for line in lines.map_while(Result::ok) {
        daemon.request(&clients.assign_id(id, &line));
    }
    clients.leave(id);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// An app's end of a local connection, and what the server writes to it.
    fn app() -> (TcpStream, TcpStream) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let reader = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (writer, _) = listener.accept().unwrap();
        reader.set_read_timeout(Some(Duration::from_millis(200))).unwrap();
        (writer, reader)
    }

    fn received(reader: &mut TcpStream) -> String {
        let mut buf = [0u8; 4096];
        let read = reader.read(&mut buf).unwrap_or(0);
        String::from_utf8_lossy(&buf[..read]).into_owned()
    }

    #[test]
    fn gives_a_late_answer_for_an_app_that_left_to_nobody() {
        let clients = Clients::default();
        let ((gone, _), (stays, mut stays_reader)) = (app(), app());
        clients.lock().streams.extend([(1, gone), (2, stays)]);
        let asked: Value = serde_json::from_str(&clients.assign_id(1, r#"{"id":1,"op":"quota"}"#)).unwrap();

        clients.leave(1);
        clients.clone().write_all(format!("{}\n", json_line(&asked["id"])).as_bytes()).unwrap();

        assert_eq!(received(&mut stays_reader), "");
    }

    #[test]
    fn keeps_open_asks_bounded() {
        let clients = Clients::default();
        for own in 0..(MAX_OPEN_ASKS as u64 + 10) {
            clients.assign_id(1, &format!(r#"{{"id":{own},"op":"send"}}"#));
        }

        assert_eq!(clients.lock().asked.len(), MAX_OPEN_ASKS);
    }

    fn json_line(id: &Value) -> String {
        format!(r#"{{"type":"quota","id":{id},"accounts":[]}}"#)
    }
}
