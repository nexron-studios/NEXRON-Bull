//! `agentd serve` with fake-claude: a tab keeps running when its app disconnects, and the next
//! app attaches to it mid-turn. Run with `cargo test --features fake-claude`.
#![cfg(feature = "fake-claude")]

use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const WAIT: Duration = Duration::from_secs(10);

/// Same home and port for the server and every relay, kept away from a real server.
struct Setup {
    home: PathBuf,
    port: u16,
}

impl Setup {
    fn new() -> Self {
        let home = std::env::temp_dir().join(format!("agentd-test-server-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        Self { home, port }
    }

    fn agentd(&self, mode: &str) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_agentd"));
        command
            .arg(mode)
            .env("AGENTD_CLAUDE", env!("CARGO_BIN_EXE_fake-claude"))
            .env("AGENTD_PORT", self.port.to_string())
            .env(if cfg!(windows) { "USERPROFILE" } else { "HOME" }, &self.home);
        command
    }

    /// Waits until the server accepts connections; a relay started earlier would launch its own.
    fn serve(&self) -> Child {
        let server = self.agentd("serve").spawn().expect("server starts");
        let deadline = Instant::now() + WAIT;
        while std::net::TcpStream::connect(("127.0.0.1", self.port)).is_err() {
            assert!(Instant::now() < deadline, "server listens before timeout");
            thread::sleep(Duration::from_millis(50));
        }
        server
    }

    fn connect(&self) -> Relay {
        let mut child = self.agentd("connect").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, events) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                sender.send(serde_json::from_str::<Value>(&line).expect("JSON lines")).ok();
            }
        });
        let stdin = child.stdin.take().unwrap();
        Relay { child, stdin, events }
    }
}

struct Relay {
    child: Child,
    stdin: ChildStdin,
    events: Receiver<Value>,
}

impl Relay {
    fn send(&mut self, request: Value) {
        writeln!(self.stdin, "{request}").unwrap();
    }

    fn expect(&self, matches: impl Fn(&Value) -> bool) -> Value {
        loop {
            let event = self.events.recv_timeout(WAIT).expect("event before timeout");
            if matches(&event) {
                return event;
            }
        }
    }
}

fn start(tab: &str, cwd: &Path) -> Value {
    json!({ "op": "start", "tab": tab, "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null })
}

fn is_ask(event: &Value) -> bool {
    event["type"] == "claude" && event["event"]["request"]["subtype"] == "can_use_tool"
}

#[test]
fn keeps_a_tab_running_while_no_app_is_connected() {
    let setup = Setup::new();
    let mut server = setup.serve();

    let mut first = setup.connect();
    first.send(start("t1", &setup.home));
    let started = first.expect(|e| e["type"] == "started");
    first.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "please write" }] }));
    assert_eq!(first.expect(is_ask)["event"]["replay"], Value::Null);
    // The app closes while Claude waits for an answer.
    first.child.kill().unwrap();
    first.child.wait().unwrap();

    let mut second = setup.connect();
    second.send(json!({ "id": 1, "op": "running" }));
    assert_eq!(second.expect(|e| e["type"] == "running")["tabs"], json!(["t1"]));
    second.send(start("t1", &setup.home));
    let again = second.expect(|e| e["type"] == "started");
    assert_eq!((&again["session_id"], &again["working"]), (&started["session_id"], &json!(true)));
    let replayed = second.expect(is_ask);
    assert_eq!((&replayed["event"]["request_id"], &replayed["event"]["replay"]), (&json!("perm-1"), &json!(true)));

    second.send(json!({ "op": "permission", "tab": "t1", "request_id": "perm-1", "decision": { "behavior": "allow" } }));
    let result = second.expect(|e| e["type"] == "claude" && e["event"]["type"] == "result");
    assert_eq!(result["event"]["result"], "decision: \"allow\"");
    second.send(json!({ "op": "stop", "tab": "t1" }));
    second.expect(|e| e["type"] == "exited");

    server.kill().unwrap();
    second.child.wait().unwrap();
}

#[test]
fn refuses_a_client_without_the_token() {
    let setup = Setup::new();
    let mut server = setup.serve();
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", setup.port)).unwrap();
    writeln!(stream, "not-the-token").unwrap();
    // The server hangs up right after the wrong token. macOS may report the next write or the
    // read as a broken pipe or a reset, Windows does not; either way no reply may arrive.
    let is_hang_up = |kind| matches!(kind, ErrorKind::BrokenPipe | ErrorKind::ConnectionReset);
    if let Err(error) = writeln!(stream, "{}", json!({ "id": 1, "op": "hello" })) {
        assert!(is_hang_up(error.kind()), "write failed with {error}");
    }
    let mut reply = String::new();
    if let Err(error) = BufReader::new(stream).read_line(&mut reply) {
        assert!(is_hang_up(error.kind()), "read failed with {error}");
    }
    assert_eq!(reply, "");
    server.kill().unwrap();
}

/// Events until `wait` passes without one.
fn quiet_for(relay: &Relay, wait: Duration) -> Vec<Value> {
    let mut seen = Vec::new();
    while let Ok(event) = relay.events.recv_timeout(wait) {
        seen.push(event);
    }
    seen
}

#[test]
fn answers_only_the_app_that_asked_under_its_own_id() {
    let setup = Setup::new();
    let mut server = setup.serve();
    let (mut desktop, mut phone) = (setup.connect(), setup.connect());

    // Both apps count from 1; each must get its own answer, not the other's.
    desktop.send(json!({ "id": 1, "op": "hello" }));
    phone.send(json!({ "id": 1, "op": "running" }));
    assert_eq!(desktop.expect(|e| e["id"] == 1)["type"], "hello");
    assert_eq!(phone.expect(|e| e["id"] == 1)["type"], "running");
    let leaked: Vec<Value> = quiet_for(&desktop, Duration::from_millis(500));
    assert!(leaked.iter().all(|e| e["type"] != "running"), "desktop got the phone's answer: {leaked:?}");

    // Events of a tab still reach every app.
    desktop.send(start("t1", &setup.home));
    phone.expect(|e| e["type"] == "started" && e["tab"] == "t1");
    desktop.send(json!({ "op": "stop", "tab": "t1" }));
    phone.expect(|e| e["type"] == "exited");

    server.kill().unwrap();
    for relay in [&mut desktop, &mut phone] {
        relay.child.wait().unwrap();
    }
}

#[test]
fn lists_running_tabs_and_tells_every_app_when_an_ask_is_answered() {
    let setup = Setup::new();
    let mut server = setup.serve();
    let (mut desktop, mut phone) = (setup.connect(), setup.connect());

    desktop.send(json!({ "op": "start", "tab": "t1", "cwd": setup.home, "profile": null, "resume": null, "model": "haiku", "permission_mode": "default" }));
    let started = desktop.expect(|e| e["type"] == "started");
    desktop.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "please write" }] }));
    desktop.expect(is_ask);

    phone.send(json!({ "id": 1, "op": "tabs" }));
    let tabs = phone.expect(|e| e["type"] == "tabs");
    let tab = &tabs["tabs"][0];
    assert_eq!((&tab["tab"], &tab["session_id"], &tab["working"], &tab["asks"]), (&json!("t1"), &started["session_id"], &json!(true), &json!(1)));
    assert_eq!((&tab["model"], &tab["permission_mode"], &tab["profile"]), (&json!("haiku"), &json!("default"), &Value::Null));
    assert_eq!(tab["is_fresh"], json!(false));
    assert_eq!(tab["cwd"].as_str().map(PathBuf::from), Some(setup.home.clone()));

    // The phone decides; the desktop hears it so its card goes away.
    phone.send(json!({ "op": "permission", "tab": "t1", "request_id": "perm-1", "decision": { "behavior": "allow" } }));
    let resolved = desktop.expect(|e| e["type"] == "permission_resolved");
    assert_eq!((&resolved["tab"], &resolved["request_id"]), (&json!("t1"), &json!("perm-1")));
    desktop.send(json!({ "op": "stop", "tab": "t1" }));
    desktop.expect(|e| e["type"] == "exited");

    server.kill().unwrap();
    for relay in [&mut desktop, &mut phone] {
        relay.child.wait().unwrap();
    }
}
