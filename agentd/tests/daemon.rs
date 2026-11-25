//! Drives the real agentd binary with fake-claude as Claude.
//! Run with `cargo test --features fake-claude`.
#![cfg(feature = "fake-claude")]

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

const WAIT: Duration = Duration::from_secs(10);

struct Agentd {
    child: Child,
    stdin: ChildStdin,
    events: Receiver<Value>,
}

impl Agentd {
    fn spawn() -> Self {
        Self::spawn_with(Command::new(env!("CARGO_BIN_EXE_agentd")))
    }

    /// With its own home folder, so it sees only the profiles a test writes.
    fn spawn_in_home(home: &PathBuf) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_agentd"));
        command.env("USERPROFILE", home).env("HOME", home);
        Self::spawn_with(command)
    }

    fn spawn_with(mut command: Command) -> Self {
        let mut child = command
            .arg("stdio")
            .env("AGENTD_CLAUDE", env!("CARGO_BIN_EXE_fake-claude"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("agentd starts");
        let stdout = child.stdout.take().expect("piped stdout");
        let (sender, events) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                sender.send(serde_json::from_str(&line).expect("agentd writes JSON lines")).ok();
            }
        });
        let stdin = child.stdin.take().expect("piped stdin");
        Self { child, stdin, events }
    }

    fn send(&mut self, request: Value) {
        writeln!(self.stdin, "{request}").unwrap();
    }

    /// Skips events until one matches, so the order of unrelated events does not matter.
    fn expect(&self, matches: impl Fn(&Value) -> bool) -> Value {
        loop {
            let event = self.events.recv_timeout(WAIT).expect("event before timeout");
            if matches(&event) {
                return event;
            }
        }
    }
}

fn claude_event<'a>(event: &'a Value, kind: &str) -> Option<&'a Value> {
    (event["type"] == "claude" && event["event"]["type"] == kind).then(|| &event["event"])
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("agentd-test-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn runs_a_session_end_to_end() {
    let mut agentd = Agentd::spawn();
    let cwd = temp_dir("cwd");

    agentd.send(json!({ "id": 1, "op": "hello" }));
    let hello = agentd.expect(|e| e["type"] == "hello");
    assert_eq!((hello["id"].as_u64(), hello["version"].as_str()), (Some(1), Some("0.1.0")));

    agentd.send(json!({ "id": 2, "op": "start", "tab": "t1", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    let started = agentd.expect(|e| e["type"] == "started");
    assert_eq!((started["id"].as_u64(), started["tab"].as_str()), (Some(2), Some("t1")));
    assert_eq!(started["session_id"].as_str().map(str::len), Some(36));
    agentd.expect(|e| claude_event(e, "control_response").is_some());

    agentd.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "hallo" }] }));
    let reply = agentd.expect(|e| e["type"] == "message");
    assert_eq!(reply["message"]["blocks"][0], json!({ "type": "text", "text": "echo: hallo" }));
    let result = agentd.expect(|e| claude_event(e, "result").is_some());
    assert_eq!(result["event"]["result"], "echo: hallo");

    agentd.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "please write" }] }));
    let ask = agentd.expect(|e| claude_event(e, "control_request").is_some());
    assert_eq!(ask["event"]["request"]["subtype"], "can_use_tool");
    agentd.send(json!({ "op": "permission", "tab": "t1", "request_id": "perm-1", "decision": { "behavior": "allow", "updatedInput": {} } }));
    assert_eq!(agentd.expect(|e| claude_event(e, "result").is_some())["event"]["result"], "decision: \"allow\"");

    // Ctrl+B: Claude gets the terminal's control request for exactly that call.
    agentd.send(json!({ "op": "background", "tab": "t1", "tool_use_id": "toolu_7" }));
    let asked = agentd.expect(|e| claude_event(e, "control_response").is_some_and(|r| r["response"]["response"]["subtype"] == "background_tasks"));
    assert_eq!(asked["event"]["response"]["response"]["tool_use_id"], "toolu_7");

    agentd.send(json!({ "id": 3, "op": "send", "tab": "nope", "content": [] }));
    let error = agentd.expect(|e| e["type"] == "error");
    assert_eq!((error["id"].as_u64(), error["message"].as_str()), (Some(3), Some("no running tab nope")));

    // A reloaded window starts the same tab again: it gets the running session, not an error.
    let session_id = started["session_id"].clone();
    agentd.send(json!({ "id": 4, "op": "start", "tab": "t1", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    let again = agentd.expect(|e| e["type"] == "started");
    assert_eq!((again["id"].as_u64(), &again["session_id"]), (Some(4), &session_id));

    agentd.send(json!({ "op": "stop", "tab": "t1" }));
    assert_eq!(agentd.expect(|e| e["type"] == "exited")["tab"], "t1");
    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn serves_history_pages_from_a_profile() {
    let mut agentd = Agentd::spawn();
    let profile = temp_dir("profile");
    let project = profile.join("projects").join("C--work");
    std::fs::create_dir_all(&project).unwrap();
    let lines: Vec<String> = (1..=3)
        .map(|i| json!({ "type": "user", "uuid": format!("m{i}"), "message": { "role": "user", "content": format!("Nachricht {i}") } }).to_string())
        .collect();
    std::fs::write(project.join("s1.jsonl"), lines.join("\n")).unwrap();

    agentd.send(json!({ "id": 7, "op": "history", "profile": profile, "session_id": "s1", "before": null, "limit": 2 }));
    let history = agentd.expect(|e| e["type"] == "history");
    assert_eq!(history["id"], 7);
    assert_eq!(history["has_more"], true);
    assert_eq!(history["messages"][0]["uuid"], "m2");
    assert_eq!(history["messages"][1]["blocks"][0], json!({ "type": "text", "text": "Nachricht 3" }));
}

#[test]
fn answers_a_fresh_session_without_transcript_with_an_empty_history() {
    let mut agentd = Agentd::spawn();
    let profile = temp_dir("fresh-profile");
    std::fs::create_dir_all(profile.join("projects").join("C--work")).unwrap();

    // A tab that never sent a message: Claude has not written its transcript yet.
    agentd.send(json!({ "id": 8, "op": "history", "profile": profile, "session_id": "never-used", "before": null, "limit": 40, "is_fresh": true }));
    let history = agentd.expect(|e| e["id"] == 8);
    assert_eq!(history, json!({ "type": "history", "id": 8, "messages": [], "has_more": false }));
}

#[test]
fn reports_a_lost_transcript_of_a_used_session() {
    let mut agentd = Agentd::spawn();
    let profile = temp_dir("lost-profile");
    std::fs::create_dir_all(profile.join("projects").join("C--work")).unwrap();

    agentd.send(json!({ "id": 10, "op": "history", "profile": profile, "session_id": "moved-away", "before": null, "limit": 40 }));
    let error = agentd.expect(|e| e["id"] == 10);
    assert_eq!((error["type"].as_str(), error["message"].as_str()), (Some("error"), Some("transcript of session moved-away not found")));
}

/// The command line the fake Claude of tab `tab` was started with.
fn claude_args(agentd: &mut Agentd, tab: &str) -> String {
    agentd.send(json!({ "op": "send", "tab": tab, "content": [{ "type": "text", "text": "args" }] }));
    let reply = agentd.expect(|e| e["type"] == "message" && e["tab"] == tab);
    reply["message"]["blocks"][0]["text"].as_str().unwrap_or_default().to_string()
}

#[test]
fn starts_a_fresh_session_without_transcript_under_its_own_id() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("fresh-start-profile"), temp_dir("fresh-start-cwd"));

    // `claude --resume` of a session without transcript exits with "No conversation found".
    agentd.send(json!({ "id": 9, "op": "start", "tab": "t9", "cwd": cwd, "profile": profile, "resume": "never-used", "model": null, "permission_mode": null, "is_fresh": true }));
    assert_eq!(agentd.expect(|e| e["type"] == "started")["session_id"], "never-used");
    let args = claude_args(&mut agentd, "t9");
    assert!(args.contains("--session-id never-used") && !args.contains("--resume"), "{args}");
}

#[test]
fn moves_a_new_chat_without_transcript_to_another_profile() {
    let home = temp_dir("fresh-move-home");
    let (profile, target) = (home.join(".claude"), home.join(".claude-spare"));
    std::fs::create_dir_all(&profile).unwrap();
    std::fs::create_dir_all(&target).unwrap();
    let cwd = temp_dir("fresh-move-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 13, "op": "start", "tab": "t13", "cwd": cwd, "profile": profile, "resume": "not-yet", "model": null, "permission_mode": null, "is_fresh": true }));
    agentd.expect(|e| e["type"] == "started");

    // Nothing to copy yet: the chat starts in the other profile under the same id.
    agentd.send(json!({ "op": "limit_move", "tab": "t13", "profile": target, "then": "ready" }));
    agentd.expect(|e| e["type"] == "exited" && e["tab"] == "t13");
    assert_eq!(agentd.expect(|e| e["type"] == "started" && e["tab"] == "t13")["session_id"], "not-yet");
    let args = claude_args(&mut agentd, "t13");
    assert!(args.contains("--session-id not-yet") && !args.contains("--resume"), "{args}");
}

#[test]
fn resumes_a_used_session_even_without_transcript() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("used-start-profile"), temp_dir("used-start-cwd"));

    // Claude itself reports a transcript that went missing; agentd does not start over silently.
    agentd.send(json!({ "id": 11, "op": "start", "tab": "t11", "cwd": cwd, "profile": profile, "resume": "moved-away", "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");
    let args = claude_args(&mut agentd, "t11");
    assert!(args.contains("--resume moved-away") && !args.contains("--session-id"), "{args}");
}

#[test]
fn moves_a_stopped_session_to_another_profile() {
    let mut agentd = Agentd::spawn();
    let (from, to) = (temp_dir("move-from"), temp_dir("move-to"));
    let project = from.join("projects").join("C--work");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::write(project.join("s9.jsonl"), "{}").unwrap();

    agentd.send(json!({ "id": 5, "op": "move_session", "from": from, "to": to, "session_id": "s9" }));
    assert_eq!(agentd.expect(|e| e["type"] == "moved")["id"], 5);
    assert!(to.join("projects").join("C--work").join("s9.jsonl").is_file());
}

#[test]
fn moves_a_new_chat_before_its_first_message_without_copying() {
    let mut agentd = Agentd::spawn();
    let (from, to) = (temp_dir("move-fresh-from"), temp_dir("move-fresh-to"));

    agentd.send(json!({ "id": 6, "op": "move_session", "from": from, "to": to, "session_id": "s10", "is_fresh": true }));
    assert_eq!(agentd.expect(|e| e["id"] == 6)["type"], "moved");
}

#[test]
fn refuses_to_move_a_used_session_whose_transcript_is_gone() {
    let mut agentd = Agentd::spawn();
    let (from, to) = (temp_dir("move-gone-from"), temp_dir("move-gone-to"));
    std::fs::create_dir_all(from.join("projects")).unwrap();

    agentd.send(json!({ "id": 7, "op": "move_session", "from": from, "to": to, "session_id": "s11", "is_fresh": false }));
    assert_eq!(agentd.expect(|e| e["id"] == 7)["type"], "error");
}

#[test]
fn reports_usage_per_day_model_and_project() {
    let home = temp_dir("usage-home");
    let project = home.join(".claude-work").join("projects").join("C--work");
    std::fs::create_dir_all(&project).unwrap();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let line = json!({ "type": "assistant", "timestamp": timestamp, "cwd": "C:\\work",
        "message": { "id": "m1", "model": "claude-opus-5-5",
            "usage": { "input_tokens": 1, "output_tokens": 2, "cache_read_input_tokens": 3, "cache_creation_input_tokens": 4 } } });
    std::fs::write(project.join("s1.jsonl"), format!("{line}\n")).unwrap();
    let mut agentd = Agentd::spawn_in_home(&home);

    agentd.send(json!({ "id": 11, "op": "usage", "days": 7 }));
    let usage = agentd.expect(|e| e["type"] == "usage");
    assert_eq!((usage["id"].as_u64(), usage["days"].as_u64()), (Some(11), Some(7)));
    let row = &usage["rows"][0];
    assert_eq!((row["model"].as_str(), row["project"].as_str()), (Some("opus"), Some("C:\\work")));
    assert_eq!([&row["input"], &row["output"], &row["cache_read"], &row["cache_write"]], [1, 2, 3, 4]);
}

#[test]
fn reports_the_branch_of_a_working_folder() {
    let repo = temp_dir("branch-repo");
    std::fs::create_dir_all(repo.join(".git")).unwrap();
    std::fs::write(repo.join(".git").join("HEAD"), "ref: refs/heads/feat/panel
").unwrap();
    let mut agentd = Agentd::spawn();

    agentd.send(json!({ "id": 13, "op": "branch", "cwd": repo }));
    let answer = agentd.expect(|e| e["type"] == "branch");
    assert_eq!((answer["id"].as_u64(), answer["branch"].as_str()), (Some(13), Some("feat/panel")));
}

#[test]
fn answers_an_unknown_op_with_its_request_id() {
    let mut agentd = Agentd::spawn();
    agentd.send(json!({ "id": 12, "op": "from_the_future" }));
    assert_eq!(agentd.expect(|e| e["type"] == "error")["id"], 12);
}

fn start_tab(agentd: &mut Agentd, id: u64, tab: &str, profile: &PathBuf, cwd: &PathBuf) -> Value {
    agentd.send(json!({ "id": id, "op": "start", "tab": tab, "cwd": cwd, "profile": profile, "resume": null, "model": null, "permission_mode": null }));
    let started = agentd.expect(|e| e["type"] == "started" && e["tab"] == tab);
    agentd.expect(|e| claude_event(e, "control_response").is_some());
    started
}

#[test]
fn clears_only_the_session_the_app_still_shows() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("clear-profile"), temp_dir("clear-cwd"));
    let session_id = start_tab(&mut agentd, 20, "t20", &profile, &cwd)["session_id"].clone();

    agentd.send(json!({ "id": 21, "op": "clear", "tab": "t20", "session_id": "some-other-session" }));
    let refused = agentd.expect(|e| e["id"] == 21);
    assert_eq!(refused["type"], "error");
    assert!(refused["message"].as_str().unwrap_or_default().contains("another session"), "{refused}");

    agentd.send(json!({ "id": 22, "op": "clear", "tab": "t20", "session_id": session_id }));
    assert_eq!(agentd.expect(|e| e["id"] == 22)["type"], "cleared");
    agentd.expect(|e| claude_event(e, "conversation_reset").is_some());
    agentd.expect(|e| claude_event(e, "result").is_some());

    // The tab runs the new session now: a reattaching app gets its id, a second clear needs it.
    agentd.send(json!({ "id": 23, "op": "start", "tab": "t20", "cwd": cwd, "profile": profile, "resume": null, "model": null, "permission_mode": null }));
    let again = agentd.expect(|e| e["id"] == 23);
    assert_eq!((again["session_id"].as_str(), again["working"].as_bool()), (Some("cleared-session"), Some(false)));
}

#[test]
fn denies_an_open_ask_before_clearing() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("clear-ask-profile"), temp_dir("clear-ask-cwd"));
    let session_id = start_tab(&mut agentd, 24, "t24", &profile, &cwd)["session_id"].clone();
    agentd.send(json!({ "op": "send", "tab": "t24", "content": [{ "type": "text", "text": "please write" }] }));
    let asked = agentd.expect(|e| claude_event(e, "control_request").is_some());

    agentd.send(json!({ "id": 25, "op": "clear", "tab": "t24", "session_id": session_id }));
    // Another app drops its card too.
    let resolved = agentd.expect(|e| e["type"] == "permission_resolved");
    assert_eq!((&resolved["tab"], &resolved["request_id"]), (&json!("t24"), &asked["event"]["request_id"]));
    assert_eq!(agentd.expect(|e| claude_event(e, "result").is_some())["event"]["result"], "decision: \"deny\"");
    agentd.expect(|e| claude_event(e, "conversation_reset").is_some());
}

/// A home with one profile `.claude-work` holding session `s30` with a subagent transcript.
fn home_with_session(name: &str) -> (PathBuf, PathBuf, PathBuf) {
    let home = temp_dir(name);
    let profile = home.join(".claude-work");
    let project = profile.join("projects").join("C--work");
    std::fs::create_dir_all(project.join("s30").join("subagents")).unwrap();
    std::fs::write(project.join("s30.jsonl"), "{}").unwrap();
    std::fs::write(project.join("s30").join("subagents").join("agent-a.jsonl"), "{}").unwrap();
    (home, profile, project)
}

#[test]
fn deletes_a_stopped_session_with_its_subagents() {
    let (home, profile, project) = home_with_session("delete-home");
    let mut agentd = Agentd::spawn_in_home(&home);

    agentd.send(json!({ "id": 30, "op": "delete_session", "profile": profile, "session_id": "s30" }));
    let deleted = agentd.expect(|e| e["id"] == 30);
    assert_eq!((deleted["type"].as_str(), deleted["session_id"].as_str()), (Some("deleted"), Some("s30")));
    assert!(!project.join("s30.jsonl").exists() && !project.join("s30").exists());
}

#[test]
fn refuses_to_delete_outside_a_known_profile() {
    let (home, _, _) = home_with_session("delete-stranger-home");
    let stranger = temp_dir("delete-stranger");
    let project = stranger.join("projects").join("C--work");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::write(project.join("s31.jsonl"), "{}").unwrap();
    let mut agentd = Agentd::spawn_in_home(&home);

    agentd.send(json!({ "id": 31, "op": "delete_session", "profile": stranger, "session_id": "s31" }));
    assert_eq!(agentd.expect(|e| e["id"] == 31)["type"], "error");
    agentd.send(json!({ "id": 32, "op": "delete_session", "profile": home.join(".claude-work"), "session_id": "../s30" }));
    assert_eq!(agentd.expect(|e| e["id"] == 32)["type"], "error");
    assert!(project.join("s31.jsonl").is_file());
}

#[test]
fn refuses_to_delete_a_session_claude_runs_on() {
    let (home, profile, project) = home_with_session("delete-running-home");
    let cwd = temp_dir("delete-running-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 33, "op": "start", "tab": "t33", "cwd": cwd, "profile": profile, "resume": "s30", "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");

    agentd.send(json!({ "id": 34, "op": "delete_session", "profile": profile, "session_id": "s30" }));
    let refused = agentd.expect(|e| e["id"] == 34);
    assert_eq!(refused["message"], "session s30 is still running; stop it first");
    assert!(project.join("s30.jsonl").is_file());
}

#[test]
fn creates_a_profile_and_lists_it() {
    let home = temp_dir("create-profile-home");
    let _ = std::fs::remove_dir_all(home.join(".claude-kunde-x")); // leftovers of an earlier run
    let mut agentd = Agentd::spawn_in_home(&home);

    agentd.send(json!({ "id": 40, "op": "create_profile", "name": "kunde-x" }));
    let created = agentd.expect(|e| e["id"] == 40);
    assert_eq!((created["type"].as_str(), created["profile"]["label"].as_str()), (Some("profile_created"), Some("kunde-x")));
    agentd.send(json!({ "id": 41, "op": "profiles" }));
    let labels: Vec<_> = agentd.expect(|e| e["id"] == 41)["profiles"].as_array().unwrap().iter().map(|p| p["label"].clone()).collect();
    assert!(labels.contains(&json!("kunde-x")), "{labels:?}");

    agentd.send(json!({ "id": 42, "op": "create_profile", "name": "kunde-x" }));
    assert_eq!(agentd.expect(|e| e["id"] == 42)["type"], "error");
    agentd.send(json!({ "id": 43, "op": "create_profile", "name": "../evil" }));
    assert_eq!(agentd.expect(|e| e["id"] == 43)["type"], "error");
}

#[test]
fn lists_the_commands_and_sends_them_again_on_attach() {
    let mut agentd = Agentd::spawn();
    let cwd = temp_dir("commands-cwd");
    agentd.send(json!({ "id": 50, "op": "start", "tab": "t50", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    let listed = agentd.expect(|e| e["type"] == "commands");
    assert_eq!(listed["tab"], "t50");
    assert_eq!(listed["commands"], json!([{ "name": "compact", "description": "Free up context", "argument_hint": "<instructions>" }]));

    agentd.send(json!({ "id": 51, "op": "start", "tab": "t50", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started" && e["id"] == 51);
    assert_eq!(agentd.expect(|e| e["type"] == "commands")["commands"][0]["name"], "compact");
}

#[test]
fn lists_files_and_runs_a_shell_command_in_a_folder() {
    let mut agentd = Agentd::spawn();
    let cwd = temp_dir("files-cwd");
    std::fs::create_dir_all(cwd.join("src")).unwrap();
    std::fs::write(cwd.join("src/app.ts"), "x").unwrap();

    agentd.send(json!({ "id": 60, "op": "list_files", "cwd": cwd, "limit": 10 }));
    let listed = agentd.expect(|e| e["id"] == 60);
    assert_eq!((listed["type"].as_str(), &listed["files"], &listed["is_truncated"]), (Some("files"), &json!(["src/app.ts"]), &json!(false)));

    agentd.send(json!({ "id": 61, "op": "run_shell", "cwd": cwd, "command": "echo hi" }));
    let ran = agentd.expect(|e| e["id"] == 61);
    assert_eq!((ran["type"].as_str(), ran["stdout"].as_str().map(str::trim), &ran["code"]), (Some("shell_result"), Some("hi"), &json!(0)));

    agentd.send(json!({ "id": 62, "op": "run_shell", "cwd": "relative", "command": "echo hi" }));
    assert_eq!(agentd.expect(|e| e["id"] == 62)["message"], "folder relative not found");
}

fn git_in(dir: &PathBuf, args: &[&str]) -> bool {
    Command::new("git").args(["-c", "user.name=test", "-c", "user.email=test", "-c", "core.autocrlf=false"]).args(args).current_dir(dir).status().is_ok_and(|status| status.success())
}

#[test]
fn diffs_changed_new_and_deleted_files_against_head() {
    let repo = temp_dir("file-diff");
    let _ = std::fs::remove_dir_all(repo.join(".git"));
    if !git_in(&repo, &["init", "-q"]) {
        return; // No git on this machine: the app then shows the chat's own edits.
    }
    std::fs::write(repo.join("kept.txt"), "one\ntwo\nthree\n").unwrap();
    std::fs::write(repo.join("gone.txt"), "bye\n").unwrap();
    std::fs::create_dir_all(repo.join("pages")).unwrap();
    std::fs::write(repo.join("pages/[id].vue"), "id\n").unwrap();
    std::fs::write(repo.join("pages/i.vue"), "i\n").unwrap();
    assert!(git_in(&repo, &["add", "."]) && git_in(&repo, &["commit", "-q", "-m", "init"]));
    std::fs::write(repo.join("pages/i.vue"), "changed\n").unwrap();
    std::fs::write(repo.join("kept.txt"), "one\n2\nthree\n").unwrap();
    std::fs::remove_file(repo.join("gone.txt")).unwrap();
    std::fs::create_dir_all(repo.join("src")).unwrap();
    std::fs::write(repo.join("src/new.ts"), "a\nb\n").unwrap();
    let mut agentd = Agentd::spawn();

    agentd.send(json!({ "id": 70, "op": "file_diff", "cwd": repo, "path": "kept.txt" }));
    let modified = agentd.expect(|e| e["id"] == 70);
    assert_eq!((modified["type"].as_str(), &modified["answer"]["state"]), (Some("file_diff"), &json!("diff")));
    assert_eq!(modified["answer"]["status"], "modified");
    assert_eq!(modified["answer"]["hunks"], json!([{ "old_start": 1, "new_start": 1, "lines": [" one", "-two", "+2", " three"] }]));

    agentd.send(json!({ "id": 71, "op": "file_diff", "cwd": repo, "path": repo.join("src/new.ts") }));
    let untracked = agentd.expect(|e| e["id"] == 71);
    assert_eq!(untracked["answer"]["status"], "untracked");
    assert_eq!(untracked["answer"]["hunks"][0]["lines"], json!(["+a", "+b"]));

    agentd.send(json!({ "id": 72, "op": "file_diff", "cwd": repo, "path": "gone.txt" }));
    let deleted = agentd.expect(|e| e["id"] == 72);
    assert_eq!((&deleted["answer"]["status"], &deleted["answer"]["hunks"][0]["lines"]), (&json!("deleted"), &json!(["-bye"])));

    // Brackets are part of the name, not a pattern that also matches `i.vue`.
    agentd.send(json!({ "id": 74, "op": "file_diff", "cwd": repo, "path": "pages/[id].vue" }));
    let unchanged = agentd.expect(|e| e["id"] == 74);
    assert_eq!((&unchanged["answer"]["state"], &unchanged["answer"]["status"]), (&json!("clean"), &json!("unchanged")));

    agentd.send(json!({ "id": 75, "op": "file_diff", "cwd": repo, "path": "never.txt" }));
    assert_eq!(agentd.expect(|e| e["id"] == 75)["answer"]["status"], "missing");

    let plain = temp_dir("file-diff-plain");
    std::fs::write(plain.join("a.txt"), "a").unwrap();
    agentd.send(json!({ "id": 73, "op": "file_diff", "cwd": plain, "path": "a.txt" }));
    assert_eq!(agentd.expect(|e| e["id"] == 73)["answer"]["state"], "not_in_repository");
}

#[test]
fn changes_mode_model_and_effort_of_a_running_session() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("configure-profile"), temp_dir("configure-cwd"));
    start_tab(&mut agentd, 50, "t50", &profile, &cwd);

    agentd.send(json!({ "id": 51, "op": "configure", "tab": "t50", "permission_mode": "plan", "model": "sonnet", "effort": "low" }));
    // agentd confirms once Claude answered all three; both reach the test in that order.
    let (mut asked, mut is_confirmed) = (Vec::new(), false);
    while asked.len() < 3 || !is_confirmed {
        let event = agentd.expect(|e| e["id"] == 51 || claude_event(e, "control_response").is_some());
        match claude_event(&event, "control_response") {
            Some(response) => asked.push(response["response"]["response"].clone()),
            None => is_confirmed = event["type"] == "configured",
        }
    }
    assert_eq!(asked, vec![
        json!({ "subtype": "set_permission_mode", "mode": "plan" }),
        json!({ "subtype": "set_model", "model": "sonnet" }),
        json!({ "subtype": "apply_flag_settings", "settings": { "effortLevel": "low" } }),
    ]);

    agentd.send(json!({ "id": 53, "op": "configure", "tab": "t50", "permission_mode": "refuse", "model": "haiku", "effort": null }));
    let refused = agentd.expect(|e| e["id"] == 53);
    assert_eq!((refused["type"].as_str(), refused["message"].as_str()), (Some("error"), Some("mode refused")));

    agentd.send(json!({ "id": 52, "op": "configure", "tab": "nope", "permission_mode": "plan", "model": null, "effort": null }));
    let refused = agentd.expect(|e| e["id"] == 52);
    assert_eq!((refused["type"].as_str(), &refused["tab"]), (Some("error"), &Value::Null));
}

#[test]
fn reads_what_a_profile_sets_for_new_sessions() {
    let profile = temp_dir("defaults-profile");
    std::fs::write(
        profile.join("settings.json"),
        r#"{"model":"sonnet","permissions":{"defaultMode":"plan"},"modelSettings":{"claude-opus-5-5":{"effortLevel":"xhigh"}}}"#,
    )
    .unwrap();
    let mut agentd = Agentd::spawn();

    agentd.send(json!({ "id": 60, "op": "profile_defaults", "profile": profile }));
    let answer = agentd.expect(|e| e["id"] == 60);
    assert_eq!(answer["defaults"], json!({ "model": "sonnet", "effort": null, "permission_mode": "plan", "model_efforts": { "claude-opus-5-5": "xhigh" } }));
}

fn limit_state(event: &Value, kind: &str) -> bool {
    event["type"] == "limit" && event["state"]["kind"] == kind
}

#[test]
fn a_full_account_parks_the_chat_and_queues_messages_until_sent() {
    let home = temp_dir("limit-wait-home");
    let cwd = temp_dir("limit-wait-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    let policy = json!({ "mode": "wait", "suggest_early": true, "order": [], "rules": [], "queue": true });
    agentd.send(json!({ "id": 50, "op": "set_limits", "policy": policy }));
    assert_eq!(agentd.expect(|e| e["id"] == 50)["type"], "limits_set");
    agentd.send(json!({ "id": 51, "op": "start", "tab": "t50", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");

    agentd.send(json!({ "op": "send", "tab": "t50", "content": [{ "type": "text", "text": "limit" }] }));
    let waiting = agentd.expect(|e| limit_state(e, "waiting"));
    assert_eq!(waiting["state"]["reason"], "policy");
    assert_eq!((waiting["state"]["account"]["label"].as_str(), waiting["state"]["window"].as_str()), (Some("default"), Some("five_hour")));
    assert_eq!(waiting["state"]["account"]["resets_at_ms"], 4_102_444_800_000_u64);

    agentd.send(json!({ "op": "send", "tab": "t50", "content": [{ "type": "text", "text": "hello" }] }));
    let queued = agentd.expect(|e| limit_state(e, "waiting") && e["state"]["queue"].as_array().is_some_and(|q| !q.is_empty()));
    assert_eq!(queued["state"]["queue"][0]["text"], "hello");

    agentd.send(json!({ "op": "queue_send", "tab": "t50" }));
    agentd.expect(|e| limit_state(e, "none"));
    let resumed = agentd.expect(|e| claude_event(e, "result").is_some());
    assert_eq!(
        resumed["event"]["result"],
        "echo: Das Limit hat deine Antwort auf meine letzte Nachricht unterbrochen. Mach dort weiter, oder fang sie jetzt an, falls du noch nicht begonnen hattest."
    );
    let queued_reply = agentd.expect(|e| claude_event(e, "result").is_some());
    assert_eq!(queued_reply["event"]["result"], "echo: hello");
    assert!(home.join(".nexron-chat").join("limits.json").is_file());
}

#[test]
fn failures_queued_behind_a_limit_are_handled_once() {
    let home = temp_dir("limit-once-home");
    let cwd = temp_dir("limit-once-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 54, "op": "start", "tab": "t54", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");

    agentd.send(json!({ "op": "send", "tab": "t54", "content": [{ "type": "text", "text": "limit twice" }] }));
    agentd.expect(|e| limit_state(e, "waiting"));
    let mut later = Vec::new();
    while let Ok(event) = agentd.events.recv_timeout(Duration::from_millis(1500)) {
        later.push(event);
    }
    assert_eq!(later.iter().filter(|e| e["type"] == "limit").count(), 0, "{later:?}");
}

fn quiet_for(agentd: &Agentd, wait: Duration) -> Vec<Value> {
    let mut seen = Vec::new();
    while let Ok(event) = agentd.events.recv_timeout(wait) {
        seen.push(event);
    }
    seen
}

#[test]
fn a_waiting_message_refused_again_at_the_reset_waits_again() {
    let home = temp_dir("limit-again-home");
    let cwd = temp_dir("limit-again-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    let policy = json!({ "mode": "wait", "suggest_early": true, "order": [], "rules": [], "queue": true });
    agentd.send(json!({ "id": 55, "op": "set_limits", "policy": policy }));
    agentd.expect(|e| e["id"] == 55);
    agentd.send(json!({ "id": 56, "op": "start", "tab": "t56", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");
    agentd.send(json!({ "op": "send", "tab": "t56", "content": [{ "type": "text", "text": "limit" }] }));
    agentd.expect(|e| limit_state(e, "waiting"));
    agentd.send(json!({ "op": "send", "tab": "t56", "content": [{ "type": "text", "text": "limit" }] }));
    agentd.expect(|e| limit_state(e, "waiting") && e["state"]["queue"].as_array().is_some_and(|q| q.len() == 1));

    agentd.send(json!({ "op": "queue_send", "tab": "t56" }));
    agentd.expect(|e| limit_state(e, "none"));
    let waiting_again = agentd.expect(|e| limit_state(e, "waiting"));
    assert_eq!(waiting_again["state"]["queue"][0]["text"], "limit");
}

#[test]
fn send_now_on_a_chat_that_no_longer_waits_starts_no_turn() {
    let home = temp_dir("limit-late-home");
    let cwd = temp_dir("limit-late-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 57, "op": "start", "tab": "t57", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");

    agentd.send(json!({ "op": "queue_send", "tab": "t57" }));
    let later = quiet_for(&agentd, Duration::from_millis(1000));
    assert_eq!(later.iter().filter(|e| claude_event(e, "result").is_some()).count(), 0, "{later:?}");
}

#[test]
fn without_an_account_with_room_the_chat_waits_and_drops_removed_messages() {
    let home = temp_dir("limit-none-home");
    let cwd = temp_dir("limit-none-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 52, "op": "start", "tab": "t52", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    agentd.expect(|e| e["type"] == "started");

    agentd.send(json!({ "op": "send", "tab": "t52", "content": [{ "type": "text", "text": "limit" }] }));
    assert_eq!(agentd.expect(|e| limit_state(e, "waiting"))["state"]["reason"], "no_account");
    agentd.send(json!({ "op": "send", "tab": "t52", "content": [{ "type": "text", "text": "later" }] }));
    let queued = agentd.expect(|e| limit_state(e, "waiting") && e["state"]["queue"].as_array().is_some_and(|q| !q.is_empty()));
    let entry = queued["state"]["queue"][0]["id"].as_u64().unwrap();
    agentd.send(json!({ "op": "queue_remove", "tab": "t52", "entry": entry }));
    let emptied = agentd.expect(|e| limit_state(e, "waiting") && e["state"]["queue"].as_array().is_some_and(Vec::is_empty));
    assert_eq!(emptied["state"]["reason"], "no_account");
}

#[test]
fn moving_a_chat_restarts_claude_in_the_other_profile_after_its_exit() {
    let (home, profile, _) = home_with_session("limit-move-home");
    let target = home.join(".claude-spare");
    std::fs::create_dir_all(&target).unwrap();
    let cwd = temp_dir("limit-move-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 53, "op": "start", "tab": "t53", "cwd": cwd, "profile": profile, "resume": "s30", "model": null, "permission_mode": null }));
    let first = agentd.expect(|e| e["type"] == "started");
    assert_eq!(first["account"], "work");

    agentd.send(json!({ "op": "limit_move", "tab": "t53", "profile": target, "then": "wait" }));
    agentd.expect(|e| e["type"] == "exited" && e["tab"] == "t53");
    let moved = agentd.expect(|e| e["type"] == "started" && e["tab"] == "t53");
    assert_eq!((moved["account"].as_str(), moved["session_id"].as_str()), (Some("spare"), Some("s30")));
    let waiting = agentd.expect(|e| limit_state(e, "waiting"));
    assert_eq!((waiting["state"]["reason"].as_str(), waiting["state"]["account"]["label"].as_str()), (Some("undone"), Some("spare")));
    assert!(target.join("projects").join("C--work").join("s30.jsonl").is_file());
}

#[test]
fn answers_control_requests_with_what_claude_said() {
    let mut agentd = Agentd::spawn();
    let (profile, cwd) = (temp_dir("control-profile"), temp_dir("control-cwd"));
    start_tab(&mut agentd, 40, "t40", &profile, &cwd);

    agentd.send(json!({ "id": 41, "op": "control", "tab": "t40", "request": { "subtype": "get_context_usage" } }));
    let usage = agentd.expect(|e| e["id"] == 41);
    assert_eq!((usage["type"].as_str(), &usage["response"]["totalTokens"]), (Some("control_result"), &json!(42)));

    agentd.send(json!({ "id": 42, "op": "control", "tab": "t40", "request": { "subtype": "refuse" } }));
    let refused = agentd.expect(|e| e["id"] == 42);
    assert_eq!((refused["type"].as_str(), refused["message"].as_str()), (Some("error"), Some("refused on purpose")));
    // Only the request failed, not the tab: the app must not take back the tab's prompts.
    assert!(refused["tab"].is_null(), "{refused}");

    agentd.send(json!({ "id": 43, "op": "control", "tab": "nope", "request": { "subtype": "get_context_usage" } }));
    assert_eq!(agentd.expect(|e| e["id"] == 43)["message"], "no running tab nope");
}

#[test]
fn lists_the_prompts_a_session_can_rewind_to() {
    let mut agentd = Agentd::spawn();
    let profile = temp_dir("rewind-profile");
    let project = profile.join("projects").join("C--work");
    std::fs::create_dir_all(&project).unwrap();
    let prompt = |uuid: &str, parent: Option<&str>, text: &str| {
        json!({ "type": "user", "uuid": uuid, "parentUuid": parent, "message": { "role": "user", "content": text } }).to_string()
    };
    let lines = [
        prompt("p1", None, "one"),
        json!({ "type": "file-history-snapshot", "messageId": "p1", "snapshot": {} }).to_string(),
        prompt("p2", Some("p1"), "two"),
        json!({ "type": "last-prompt", "leafUuid": "p1", "rewound": true, "cutUuid": "p2" }).to_string(),
    ];
    std::fs::write(project.join("s50.jsonl"), lines.join("\n")).unwrap();

    agentd.send(json!({ "id": 50, "op": "rewind_points", "profile": profile, "session_id": "s50" }));
    let points = agentd.expect(|e| e["id"] == 50);
    assert_eq!(points["type"], "rewind_points");
    assert_eq!(points["points"], json!([{ "uuid": "p1", "text": "one", "images": 0, "at": null, "files_changed": 0, "has_checkpoint": true }]));

    // The history shows the same branch: the rewound prompt is gone after a reload too.
    agentd.send(json!({ "id": 51, "op": "history", "profile": profile, "session_id": "s50", "before": null, "limit": 10 }));
    let history = agentd.expect(|e| e["id"] == 51);
    assert_eq!(history["messages"].as_array().map(Vec::len), Some(1));
}

#[test]
fn a_refused_mode_keeps_the_model_claude_took_with_it() {
    let (home, profile, _) = home_with_session("configure-refused-home");
    let target = home.join(".claude-spare");
    std::fs::create_dir_all(&target).unwrap();
    let cwd = temp_dir("configure-refused-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 71, "op": "start", "tab": "t71", "cwd": cwd, "profile": profile, "resume": "s30", "model": "opus", "permission_mode": "default" }));
    agentd.expect(|e| e["type"] == "started");
    agentd.send(json!({ "id": 72, "op": "configure", "tab": "t71", "permission_mode": "refuse", "model": "haiku", "effort": null }));
    assert_eq!(agentd.expect(|e| e["id"] == 72)["message"], "mode refused");
    // The refusal answers the asker once; the accepted model must not answer it a second time.
    agentd.send(json!({ "id": 73, "op": "configure", "tab": "t71", "permission_mode": null, "model": null, "effort": "low" }));
    assert_eq!(agentd.expect(|e| e["id"] == 72 || e["id"] == 73)["id"], 73);

    agentd.send(json!({ "op": "limit_move", "tab": "t71", "profile": target, "then": "ready" }));
    agentd.expect(|e| e["type"] == "exited" && e["tab"] == "t71");
    agentd.expect(|e| e["type"] == "started" && e["tab"] == "t71");
    let args = claude_args(&mut agentd, "t71");
    assert!(args.contains("--model haiku"), "{args}");
}

#[test]
fn a_moved_chat_keeps_the_mode_model_and_effort_it_was_switched_to() {
    let (home, profile, _) = home_with_session("configure-move-home");
    let target = home.join(".claude-spare");
    std::fs::create_dir_all(&target).unwrap();
    let cwd = temp_dir("configure-move-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    agentd.send(json!({ "id": 61, "op": "start", "tab": "t61", "cwd": cwd, "profile": profile, "resume": "s30", "model": "opus", "permission_mode": "default" }));
    agentd.expect(|e| e["type"] == "started");
    agentd.send(json!({ "id": 62, "op": "configure", "tab": "t61", "permission_mode": "plan", "model": "sonnet", "effort": "low" }));
    agentd.expect(|e| e["id"] == 62);

    agentd.send(json!({ "op": "limit_move", "tab": "t61", "profile": target, "then": "ready" }));
    agentd.expect(|e| e["type"] == "exited" && e["tab"] == "t61");
    agentd.expect(|e| e["type"] == "started" && e["tab"] == "t61");
    let args = claude_args(&mut agentd, "t61");
    for flag in ["--model sonnet", "--permission-mode plan", "--effort low"] {
        assert!(args.contains(flag), "{flag} missing in {args}");
    }
}

#[test]
fn names_a_chat_after_each_message_and_tells_an_app_that_attaches() {
    let home = temp_dir("titles-home");
    let cwd = temp_dir("titles-cwd");
    let mut agentd = Agentd::spawn_in_home(&home);
    let start = json!({ "op": "start", "tab": "t1", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null });
    agentd.send(start.clone());
    let session_id = agentd.expect(|e| e["type"] == "started")["session_id"].clone();

    agentd.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "please name me" }] }));
    let first = agentd.expect(|e| e["type"] == "title");
    agentd.send(json!({ "op": "send", "tab": "t1", "content": [{ "type": "text", "text": "name me again" }] }));
    let second = agentd.expect(|e| e["type"] == "title");
    agentd.send(start);
    agentd.expect(|e| e["type"] == "started");
    let replayed = agentd.expect(|e| e["type"] == "title");
    // A browser that did not start the tab learns its name from `tabs`.
    agentd.send(json!({ "id": 1, "op": "tabs" }));
    let listed = agentd.expect(|e| e["type"] == "tabs");

    assert_eq!((&first["tab"], &first["session_id"], &first["title"]), (&json!("t1"), &session_id, &json!("Titled after (none)")));
    assert_eq!(second["title"], "Titled after Titled after (none)");
    assert_eq!(replayed["title"], "Titled after Titled after (none)");
    assert_eq!(listed["tabs"][0]["title"], "Titled after Titled after (none)");
    agentd.send(json!({ "op": "stop", "tab": "t1" }));
    std::fs::remove_dir_all(&home).ok();
}

#[test]
fn tells_an_app_that_attaches_which_background_tasks_still_run() {
    let cwd = temp_dir("background-cwd");
    let mut agentd = Agentd::spawn();
    let start = json!({ "op": "start", "tab": "t70", "cwd": cwd, "profile": null, "resume": null, "model": null, "permission_mode": null });
    agentd.send(start.clone());
    agentd.expect(|e| e["type"] == "started" && e["tab"] == "t70");
    agentd.send(json!({ "op": "send", "tab": "t70", "content": [{ "type": "text", "text": "background" }] }));
    agentd.expect(|e| claude_event(e, "result").is_some());

    agentd.send(start);
    agentd.expect(|e| e["type"] == "started" && e["tab"] == "t70");
    let replayed = agentd.expect(|e| claude_event(e, "system").is_some_and(|s| s["subtype"] == "background_tasks_changed"));

    assert_eq!(replayed["event"]["tasks"][0]["task_id"], "b1");
    agentd.send(json!({ "op": "stop", "tab": "t70" }));
}
