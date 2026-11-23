//! `agentd serve` with fake-claude: a tab keeps running when its app disconnects, and the next
//! app attaches to it mid-turn. Run with `cargo test --features fake-claude`.
#![cfg(feature = "fake-claude")]

use std::io::{BufRead, BufReader, Write};
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

fn send_text(relay: &mut Relay, text: &str) {
    relay.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": text }] }));
}

fn is_text_delta(event: &Value, text: &str) -> bool {
    event["type"] == "claude" && event["event"]["type"] == "stream_event" && event["event"]["event"]["delta"]["text"] == text
}

#[test]
fn replays_the_unfinished_reply_to_an_app_that_attaches_mid_stream() {
    let setup = Setup::new();
    let mut server = setup.serve();

    let mut first = setup.connect();
    first.send(start("t1", &setup.home));
    first.expect(|e| e["type"] == "started");
    send_text(&mut first, "stream");
    first.expect(|e| is_text_delta(e, "Hal"));
    // The app closes mid-answer; Claude streams on with nobody listening.
    first.child.kill().unwrap();
    first.child.wait().unwrap();
    thread::sleep(Duration::from_secs(1));

    let mut second = setup.connect();
    second.send(start("t1", &setup.home));
    second.expect(|e| e["type"] == "started");
    let replay = second.expect(|e| e["type"] == "streaming");
    // The reasoning came as its own finished message, which the transcript holds; only the text is open.
    assert_eq!(replay, json!({ "type": "streaming", "tab": "t1", "message_id": "msg_stream", "chars": 17,
        "text": "Hallo ", "thinking": null, "is_truncated": false }));

    send_text(&mut second, "finish");
    let mut events = Vec::new();
    while events.last().is_none_or(|e: &Value| !(e["type"] == "claude" && e["event"]["type"] == "result")) {
        events.push(second.expect(|_| true));
    }
    let messages: Vec<&Value> = events.iter().filter(|e| e["type"] == "message").collect();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["message"]["blocks"], json!([{ "type": "text", "text": "Hallo Welt" }]));
    assert!(events.iter().any(|e| is_text_delta(e, "Welt")));
    assert!(!events.iter().any(|e| e["type"] == "streaming"));

    // Finished: an app attaching now has no half-written text to show, so nothing is replayed.
    second.send(start("t1", &setup.home));
    second.send(json!({ "op": "hello", "id": 7 }));
    let mut attached = Vec::new();
    while attached.last().is_none_or(|e: &Value| e["type"] != "hello") {
        attached.push(second.expect(|_| true));
    }
    assert!(attached.iter().any(|e| e["type"] == "started"));
    assert!(!attached.iter().any(|e| e["type"] == "streaming"));

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
    writeln!(stream, "{}", json!({ "id": 1, "op": "hello" })).unwrap();
    let mut reply = String::new();
    BufReader::new(stream).read_line(&mut reply).unwrap();
    assert_eq!(reply, "");
    server.kill().unwrap();
}
