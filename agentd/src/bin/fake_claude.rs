//! Stand-in for `claude -p --input-format stream-json` in the integration
//! tests: acknowledges control requests (with the request as response), echoes user text as an assistant
//! reply and asks for a permission when the text says "write". "args" answers with its
//! own command line; "/clear" starts a new session like the real one; "limit" fails the turn
//! like a full account. `get_context_usage` answers with a token count, a control request of
//! subtype "refuse" with an error. "stream" starts a streamed reply and leaves it unfinished
//! ("Hallo ", the second part a moment later, so a test can detach in between); "finish" ends it
//! with "Welt", the complete message and the result. Called with `--no-session-persistence` it
//! is the title call and names a request containing "name me".

use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

/// Between the two parts of "stream": long enough for a test to close its app in between.
const STREAM_PAUSE: Duration = Duration::from_millis(300);

fn stream_event(inner: Value) -> Value {
    json!({ "type": "stream_event", "uuid": "stream", "parent_tool_use_id": null, "event": inner })
}

fn text_delta(text: &str) -> Value {
    stream_event(json!({ "type": "content_block_delta", "index": 1, "delta": { "type": "text_delta", "text": text } }))
}

/// What the one-shot title call (`agentd::titles`) gets back. Only a request that asks for it is
/// named, so the other tests never write a title into the real home folder.
const TITLE_MARKER: &str = "name me";

fn main() {
    // The title call: lean one-shot flags, the prompt as the last argument, nothing on stdin.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--no-session-persistence") {
        let prompt = args.last().map(String::as_str).unwrap_or_default();
        if prompt.contains(TITLE_MARKER) {
            let previous = prompt.lines().next().unwrap_or_default().trim_start_matches("Previous title: ");
            println!("\"Titled after {previous}.\"");
        }
        return;
    }
    let mut out = io::stdout().lock();
    let mut say = |value: Value| {
        writeln!(out, "{value}").and_then(|()| out.flush()).expect("stdout closed");
    };
    for line in io::stdin().lock().lines().map_while(Result::ok) {
        let message: Value = serde_json::from_str(&line).expect("agentd sent invalid JSON");
        match message["type"].as_str() {
            // Like a plan without auto mode, which refuses to switch to it.
            Some("control_request") if message["request"]["mode"] == "refuse" => say(json!({ "type": "control_response",
                "response": { "subtype": "error", "request_id": message["request_id"], "error": "mode refused" } })),
            // `initialize` lists the commands, like the real one.
            Some("control_request") => say(match message["request"]["subtype"].as_str() {
                Some("initialize") => json!({ "type": "control_response", "response": { "subtype": "success",
                    "request_id": message["request_id"], "response": { "commands": [{ "name": "compact",
                        "description": "Free up context", "argumentHint": "<instructions>" }] } } }),
                Some("get_context_usage") => json!({ "type": "control_response", "response": { "subtype": "success",
                    "request_id": message["request_id"], "response": { "totalTokens": 42 } } }),
                Some("refuse") => json!({ "type": "control_response", "response": { "subtype": "error",
                    "request_id": message["request_id"], "error": "refused on purpose" } }),
                _ => json!({ "type": "control_response",
                    "response": { "subtype": "success", "request_id": message["request_id"], "response": message["request"] } }),
            }),
            Some("control_response") => say(json!({ "type": "result", "subtype": "success",
                "result": format!("decision: {}", message["response"]["response"]["behavior"]) })),
            Some("user") => {
                let mut text = message["message"]["content"][0]["text"].as_str().unwrap_or_default().to_string();
                // Lets a test see the command line agentd started Claude with.
                if text == "args" {
                    text = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
                }
                if text == "/clear" {
                    say(json!({ "type": "conversation_reset", "trigger": "clear" }));
                    say(json!({ "type": "system", "subtype": "init", "session_id": "cleared-session" }));
                    // A subagent's init must not move the tab to its session.
                    say(json!({ "type": "system", "subtype": "init", "session_id": "subagent-session",
                        "parent_tool_use_id": "toolu_1" }));
                    say(json!({ "type": "result", "subtype": "success", "result": "" }));
                    continue;
                }
                // A full account, as Claude Code reports it; the reset lies far ahead so no test resumes.
                // "limit twice": two prompts queued in Claude both fail on the full account.
                if text == "limit" || text == "limit twice" {
                    say(json!({ "type": "rate_limit_event", "rate_limit_info": { "status": "rejected",
                        "resetsAt": 4_102_444_800_u64, "rateLimitType": "five_hour" } }));
                    let failures = if text == "limit" { 1 } else { 2 };
                    for _ in 0..failures {
                        say(json!({ "type": "result", "subtype": "success", "is_error": true,
                            "result": "You've hit your session limit · resets 3am" }));
                    }
                    continue;
                }
                if text == "stream" {
                    say(stream_event(json!({ "type": "message_start", "message": { "id": "msg_stream" } })));
                    say(stream_event(json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "thinking" } })));
                    say(stream_event(json!({ "type": "content_block_delta", "index": 0,
                        "delta": { "type": "thinking_delta", "thinking": "Erst lesen." } })));
                    say(json!({ "type": "assistant", "uuid": "stream-thinking",
                        "message": { "role": "assistant", "content": [{ "type": "thinking", "thinking": "Erst lesen." }] } }));
                    say(text_delta("Hal"));
                    thread::sleep(STREAM_PAUSE);
                    say(text_delta("lo "));
                    continue;
                }
                if text == "finish" {
                    say(text_delta("Welt"));
                    say(json!({ "type": "assistant", "uuid": "stream-text",
                        "message": { "role": "assistant", "content": [{ "type": "text", "text": "Hallo Welt" }] } }));
                    say(stream_event(json!({ "type": "message_delta", "usage": { "output_tokens": 5 } })));
                    say(json!({ "type": "result", "subtype": "success", "result": "Hallo Welt" }));
                    continue;
                }
                // A shell left running in the background, as Claude Code lists it after the start.
                if text == "background" {
                    say(json!({ "type": "system", "subtype": "background_tasks_changed",
                        "tasks": [{ "task_id": "b1", "task_type": "local_bash" }] }));
                    say(json!({ "type": "result", "subtype": "success", "result": "started" }));
                    continue;
                }
                if text.contains("write") {
                    say(json!({ "type": "control_request", "request_id": "perm-1",
                        "request": { "subtype": "can_use_tool", "tool_name": "Write", "input": {} } }));
                    continue;
                }
                say(json!({ "type": "assistant", "uuid": "a1",
                    "message": { "role": "assistant", "content": [{ "type": "text", "text": format!("echo: {text}") }] } }));
                say(json!({ "type": "result", "subtype": "success", "result": format!("echo: {text}") }));
            }
            _ => {}
        }
    }
}
