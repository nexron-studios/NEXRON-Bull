//! Hook runs the chat shows: one that stopped something, failed, or printed something for the
//! user. Live they arrive as `system`/`hook_response` (with `--include-hook-events`), in the
//! transcript as attachments (`hook_blocking_error`, `hook_non_blocking_error`, `hook_success`,
//! `hook_error_during_execution`); both shapes from Claude Code 2.1.327.
//!
//! A PreToolUse hook that blocks its tool with exit code 2 is left out: Claude Code writes the
//! block into the tool's result ("PreToolUse:Bash hook error: [command]: …"), and the app shows that
//! call as the hook line. A block by JSON keeps its own line; its result text is not known.

use serde_json::Value;

use crate::chat::{Block, HookOutcome};

/// The exit code that tells Claude Code to block (PreToolUse) or to hand stderr to Claude.
const BLOCKING_EXIT_CODE: i64 = 2;
const PRE_TOOL_USE: &str = "PreToolUse";
/// Their output goes to Claude as context, not to the user; the terminal does not show it either.
const CONTEXT_EVENTS: [&str; 4] = ["SessionStart", "Setup", "UserPromptSubmit", "UserPromptExpansion"];

struct HookRun<'a> {
    /// `PreToolUse:Bash`, or just the event where it names no tool
    name: &'a str,
    event: &'a str,
}

pub fn hook_of(line: &Value) -> Option<Block> {
    // A subagent's hooks belong to its own transcript, like its turns.
    if line.get("isSidechain").and_then(Value::as_bool) == Some(true)
        || line.get("parent_tool_use_id").is_some_and(|id| !id.is_null())
    {
        return None;
    }
    let (run, outcome, text, is_in_result) = match line.get("type")?.as_str()? {
        "system" if line.get("subtype")?.as_str()? == "hook_response" => {
            let is_exit_block = line.get("exit_code").and_then(Value::as_i64) == Some(BLOCKING_EXIT_CODE);
            let (run, outcome, text) = from_response(line)?;
            (run, outcome, text, is_exit_block)
        }
        "attachment" => {
            let attachment = line.get("attachment")?;
            let is_error_block = text(attachment, "type") == "hook_blocking_error";
            let (run, outcome, text) = from_attachment(attachment)?;
            (run, outcome, text, is_error_block)
        }
        _ => return None,
    };
    let text = text.trim();
    let is_shown_on_call = outcome == HookOutcome::Blocked && run.event == PRE_TOOL_USE && is_in_result;
    if is_shown_on_call || (text.is_empty() && outcome == HookOutcome::Output) {
        return None;
    }
    let tool = run.name.split_once(':').map(|(_, tool)| tool.to_string()).filter(|tool| !tool.is_empty());
    Some(Block::Hook { event: run.event.to_string(), tool, outcome, text: text.to_string() })
}

fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or_default()
}

fn run_of<'a>(value: &'a Value, name: &str, event: &str) -> Option<HookRun<'a>> {
    let event = value.get(event)?.as_str()?;
    Some(HookRun { name: value.get(name).and_then(Value::as_str).unwrap_or(event), event })
}

fn first_filled<'a>(texts: [&'a str; 3]) -> &'a str {
    texts.into_iter().find(|text| !text.trim().is_empty()).unwrap_or_default()
}

fn from_response(line: &Value) -> Option<(HookRun<'_>, HookOutcome, String)> {
    let run = run_of(line, "hook_name", "hook_event")?;
    let (stdout, stderr) = (text(line, "stdout"), text(line, "stderr"));
    if line.get("exit_code").and_then(Value::as_i64) == Some(BLOCKING_EXIT_CODE) {
        return Some((run, HookOutcome::Blocked, stderr.to_string()));
    }
    match text(line, "outcome") {
        "error" => Some((run, HookOutcome::Failed, first_filled([stderr, stdout, text(line, "output")]).to_string())),
        "success" => from_success(run, stdout),
        // Cancelled: the user stopped the turn, nothing went wrong.
        _ => None,
    }
}

fn from_attachment(attachment: &Value) -> Option<(HookRun<'_>, HookOutcome, String)> {
    let run = run_of(attachment, "hookName", "hookEvent")?;
    match text(attachment, "type") {
        "hook_blocking_error" => {
            let reason = attachment.get("blockingError").map(|error| text(error, "blockingError")).unwrap_or_default();
            Some((run, HookOutcome::Blocked, reason.to_string()))
        }
        "hook_non_blocking_error" => {
            Some((run, HookOutcome::Failed, first_filled([text(attachment, "stderr"), text(attachment, "stdout"), ""]).to_string()))
        }
        "hook_error_during_execution" => Some((run, HookOutcome::Failed, text(attachment, "content").to_string())),
        "hook_success" => from_success(run, text(attachment, "stdout")),
        _ => None,
    }
}

/// A hook that exits 0 can still block with JSON (`decision: block`, PreToolUse's
/// `permissionDecision: deny`, PermissionRequest's `decision.behavior: deny`) or leave the user a
/// `systemMessage`. Other JSON steers Claude Code and is no output for anyone.
fn from_success<'a>(run: HookRun<'a>, stdout: &str) -> Option<(HookRun<'a>, HookOutcome, String)> {
    let Ok(json) = serde_json::from_str::<Value>(stdout.trim()) else {
        return (!CONTEXT_EVENTS.contains(&run.event)).then_some((run, HookOutcome::Output, stdout.to_string()));
    };
    let specific = json.get("hookSpecificOutput");
    if let Some(output) = specific.filter(|output| text(output, "permissionDecision") == "deny") {
        return Some((run, HookOutcome::Blocked, text(output, "permissionDecisionReason").to_string()));
    }
    let request = specific.and_then(|output| output.get("decision")).filter(|decision| text(decision, "behavior") == "deny");
    if let Some(decision) = request {
        return Some((run, HookOutcome::Blocked, text(decision, "message").to_string()));
    }
    if text(&json, "decision") == "block" {
        return Some((run, HookOutcome::Blocked, text(&json, "reason").to_string()));
    }
    let message = json.get("systemMessage").and_then(Value::as_str)?;
    Some((run, HookOutcome::Output, message.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn response(event: &str, name: &str, exit_code: i64, outcome: &str, stdout: &str, stderr: &str) -> Value {
        // As `claude -p --include-hook-events` 2.1.327 writes it, per its output schema.
        json!({ "type": "system", "subtype": "hook_response", "hook_id": "h1", "hook_name": name, "hook_event": event,
                "output": format!("{stdout}{stderr}"), "stdout": stdout, "stderr": stderr, "exit_code": exit_code,
                "outcome": outcome, "uuid": "e1", "session_id": "s1" })
    }

    fn hook(event: &str, tool: Option<&str>, outcome: HookOutcome, text: &str) -> Option<Block> {
        Some(Block::Hook { event: event.into(), tool: tool.map(str::to_string), outcome, text: text.into() })
    }

    #[test]
    fn shows_a_hook_that_failed() {
        let line = response("PostToolUse", "PostToolUse:Edit", 1, "error", "", "prettier: command not found\n");
        assert_eq!(hook_of(&line), hook("PostToolUse", Some("Edit"), HookOutcome::Failed, "prettier: command not found"));
    }

    #[test]
    fn shows_what_a_hook_printed_for_the_user() {
        let line = response("PostToolUse", "PostToolUse:Edit", 0, "success", "Formatted 1 file\n", "");
        assert_eq!(hook_of(&line), hook("PostToolUse", Some("Edit"), HookOutcome::Output, "Formatted 1 file"));
        let line = response("Stop", "Stop", 2, "error", "", "Tests fail, keep going.");
        assert_eq!(hook_of(&line), hook("Stop", None, HookOutcome::Blocked, "Tests fail, keep going."));
    }

    #[test]
    fn leaves_out_silent_hooks_context_and_pre_tool_blocks() {
        let silent = response("PostToolUse", "PostToolUse:Edit", 0, "success", "", "");
        let context = response("SessionStart", "SessionStart:startup", 0, "success", "Vault rules synced", "");
        let blocked = response("PreToolUse", "PreToolUse:Bash", 2, "error", "", "git push --force is blocked");
        let cancelled = response("PostToolUse", "PostToolUse:Edit", 1, "cancelled", "", "");
        for line in [silent, context, blocked, cancelled] {
            assert_eq!(hook_of(&line), None, "{line}");
        }
    }

    #[test]
    fn reads_json_decisions_and_system_messages() {
        let deny = r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Not on main"}}}"#;
        let line = response("PermissionRequest", "PermissionRequest:Bash", 0, "success", deny, "");
        assert_eq!(hook_of(&line), hook("PermissionRequest", Some("Bash"), HookOutcome::Blocked, "Not on main"));
        // A JSON deny says nothing in the call's result the app could read, so it keeps its line.
        let deny = r#"{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"No .env"}}"#;
        let line = response("PreToolUse", "PreToolUse:Read", 0, "success", deny, "");
        assert_eq!(hook_of(&line), hook("PreToolUse", Some("Read"), HookOutcome::Blocked, "No .env"));
        let line = response("PostToolUse", "PostToolUse:Write", 0, "success", r#"{"systemMessage":"Lint clean"}"#, "");
        assert_eq!(hook_of(&line), hook("PostToolUse", Some("Write"), HookOutcome::Output, "Lint clean"));
        let line = response("PostToolUse", "PostToolUse:Write", 0, "success", r#"{"continue":true}"#, "");
        assert_eq!(hook_of(&line), None);
    }

    fn attachment(attachment: Value) -> Value {
        json!({ "type": "attachment", "uuid": "a1", "timestamp": "2026-11-18T01:00:00Z", "attachment": attachment })
    }

    #[test]
    fn reads_hooks_from_transcript_attachments() {
        let blocked = attachment(json!({ "type": "hook_blocking_error", "hookName": "PostToolUse:Edit", "toolUseID": "t1",
            "hookEvent": "PostToolUse", "blockingError": { "blockingError": "Type check failed", "command": "npm run check" } }));
        assert_eq!(hook_of(&blocked), hook("PostToolUse", Some("Edit"), HookOutcome::Blocked, "Type check failed"));
        let failed = attachment(json!({ "type": "hook_non_blocking_error", "hookName": "Stop", "toolUseID": "t2",
            "hookEvent": "Stop", "stderr": "notify.ps1 not found", "stdout": "", "exitCode": 1, "command": "notify.ps1" }));
        assert_eq!(hook_of(&failed), hook("Stop", None, HookOutcome::Failed, "notify.ps1 not found"));
        let printed = attachment(json!({ "type": "hook_success", "hookName": "PostToolUse:Write", "toolUseID": "t3",
            "hookEvent": "PostToolUse", "content": "", "stdout": "1 file formatted", "stderr": "", "exitCode": 0 }));
        assert_eq!(hook_of(&printed), hook("PostToolUse", Some("Write"), HookOutcome::Output, "1 file formatted"));
        let pre = attachment(json!({ "type": "hook_blocking_error", "hookName": "PreToolUse:Bash", "toolUseID": "t4",
            "hookEvent": "PreToolUse", "blockingError": { "blockingError": "no", "command": "x" } }));
        assert_eq!(hook_of(&pre), None);
    }

    #[test]
    fn leaves_a_subagents_hooks_to_it() {
        let mut line = response("PostToolUse", "PostToolUse:Edit", 1, "error", "", "boom");
        line["parent_tool_use_id"] = json!("toolu_1");
        assert_eq!(hook_of(&line), None);
    }
}
