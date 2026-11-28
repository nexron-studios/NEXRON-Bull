//! Turns transcript lines and live stream-json events into chat messages.
//! Both carry the same `message` shape, so one function serves history and
//! live view alike.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use crate::branches;
use crate::hooks;
use crate::usage::Tokens;

const SYNTHETIC_MODEL: &str = "<synthetic>";
const INTERRUPTED_PREFIX: &str = "[Request interrupted by user";
/// `origin.kind` of a message another agent of the session sent, mostly a subagent's hand-back.
const PEER_ORIGIN: &str = "peer";
/// The sentence Claude Code puts before the wrapped message in the prompt it hands to Claude.
const AGENT_MESSAGE_PREAMBLE: &str = "Another Claude session sent a message:";
const AGENT_MESSAGE_OPEN: &str = "<agent-message";
const AGENT_MESSAGE_CLOSE: &str = "</agent-message>";
/// A subagent's final report comes inside a frame that tells Claude not to obey it, with every
/// report line indented; the chat shows the report alone.
const REPORT_FRAME: &str = "[Subagent hand-back]";
const REPORT_START: &str = "The report follows:";
const REPORT_INDENT: &str = "  ";
/// Tags Claude Code wraps around what it adds to a user turn (found in real transcripts).
/// `pasted_content` is a large paste from the terminal: raw, it would show as markup.
const INJECTED_TAGS: [&str; 13] = [
    "system-reminder", "local-command-caveat", "local-command-stderr", "command-message",
    "task-notification", "agent-message", "ide_opened_file", "ide_selection", "browser_instruction", "user-prompt-submit-hook",
    "new-diagnostics", "persisted-output", "pasted_content",
];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    User,
    Assistant,
    /// Markers like "conversation compacted", not spoken by anyone.
    System,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Block {
    Text { text: String },
    Image { media_type: String, data: String },
    ToolUse { id: String, name: String, input: Value },
    /// `patch`: the change an Edit, MultiEdit or Write made, with line numbers, as Claude Code
    /// reports it beside the result; `None` for other tools and where it is missing.
    ToolResult {
        tool_use_id: String,
        is_error: bool,
        content: Vec<Block>,
        #[serde(skip_serializing_if = "Option::is_none")]
        patch: Option<Vec<Hunk>>,
    },
    Command { name: String, args: String },
    CommandOutput { text: String },
    Compacted,
    /// Claude's reasoning before a reply or tool call. `text` is empty when the session
    /// did not ask for it (Claude Code stores only the signature then); the block still
    /// marks that and when Claude thought.
    Thinking { text: String },
    /// The user stopped Claude mid-turn.
    Interrupted,
    /// What another agent of this session sent, mostly a background subagent's final report
    /// (`is_report`). Claude Code delivers it as a prompt; nobody typed it. `from` is the agent's
    /// id, `name` its type or given name where Claude Code wrote one down.
    AgentMessage { from: String, name: Option<String>, text: String, is_report: bool },
    /// A command the user ran with `!` (Claude Code's bash mode); Claude reads it with the turn.
    Shell { command: String },
    /// What that command printed.
    ShellOutput { stdout: String, stderr: String },
    /// A hook that stopped something, failed or had something to say. `event` is the hook event
    /// (`PostToolUse`), `tool` the tool it ran for where the event names one.
    Hook { event: String, tool: Option<String>, outcome: HookOutcome, text: String },
}

/// One hunk of a file change: where it starts in the old and the new file, and its lines with
/// their mark (`" "` context, `"-"` removed, `"+"` added) as the first character.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hunk {
    pub old_start: u64,
    pub new_start: u64,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HookOutcome {
    /// Exit code 2 or a "block"/"deny" decision: the hook stopped what it ran for.
    Blocked,
    /// The hook itself went wrong: another exit code, a crash, a timeout.
    Failed,
    /// It ran fine and printed something for the user.
    Output,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ChatMessage {
    pub uuid: String,
    pub role: Role,
    pub at: Option<String>,
    pub blocks: Vec<Block>,
    /// What the API call behind an assistant message used; its input side is the context size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<MessageUsage>,
    /// A prompt the user sent while Claude was working; Claude read it within that turn.
    #[serde(skip_serializing_if = "is_false")]
    pub is_mid_turn: bool,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MessageUsage {
    pub model: String,
    /// The API message: Claude Code writes one line per content block, each with the same usage.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(flatten)]
    pub tokens: Tokens,
}

/// One transcript line or stream-json event; `None` for everything that is not
/// part of the visible conversation (attachments, meta, subagents, bookkeeping).
pub fn message_from(line: &Value) -> Option<ChatMessage> {
    let uuid = line.get("uuid")?.as_str()?.to_string();
    let at = line.get("timestamp").and_then(Value::as_str).map(str::to_string);
    let kind = line.get("type")?.as_str()?;
    if kind == "system" && line.get("subtype").and_then(Value::as_str) == Some("compact_boundary") {
        let blocks = vec![Block::Compacted];
        return Some(ChatMessage { uuid, role: Role::System, at, blocks, usage: None, is_mid_turn: false });
    }
    if let Some(hook) = hooks::hook_of(line) {
        return Some(ChatMessage { uuid, role: Role::System, at, blocks: vec![hook], usage: None, is_mid_turn: false });
    }
    // The live stream carries a subagent's own turns with the id of the Agent call that runs
    // it; the transcript keeps them in a separate file, so the chat shows only the call.
    if is_true(line, "isSidechain") || line.get("parent_tool_use_id").is_some_and(|id| !id.is_null()) {
        return None;
    }
    if let Some(blocks) = agent_message_of(line) {
        // As an attachment, Claude read it while working (see `queued_prompt`).
        let is_mid_turn = kind == "attachment";
        return Some(ChatMessage { uuid, role: Role::System, at, blocks, usage: None, is_mid_turn });
    }
    let role = match kind {
        "user" => Role::User,
        "assistant" => Role::Assistant,
        _ => return None,
    };
    if ["isMeta", "isCompactSummary"].iter().any(|flag| is_true(line, flag)) {
        return None;
    }
    let message = line.get("message")?;
    // Live, Claude Code marks the user lines it writes itself `isSynthetic`, where the transcript
    // says `isMeta` or `isCompactSummary`: the summary a compaction leaves (plain text) and the
    // instructions of a loaded skill (text blocks). Nobody typed them.
    if kind == "user" && is_true(line, "isSynthetic") {
        return None;
    }
    // Claude Code writes API errors (limit reached, login expired) as a fake assistant reply;
    // the result event already carries the same text and the app shows it as a notice.
    if message.get("model").and_then(Value::as_str) == Some(SYNTHETIC_MODEL) {
        return None;
    }
    let mut blocks = blocks_of(message.get("content")?);
    if blocks.is_empty() {
        return None;
    }
    with_patch(&mut blocks, line);
    let usage = usage_of(message);
    Some(ChatMessage { uuid, role, at, blocks, usage, is_mid_turn: false })
}

/// A prompt sent during a running turn is no user line in the transcript: Claude Code stores it
/// as a `queued_command` attachment where Claude read it. The live stream echoes it as a user
/// message instead, so only the transcript needs this. A queued prompt Claude did not absorb
/// before the turn ended becomes the next turn's user line and gets no attachment; in -p mode
/// every attachment so far carried `hostsOwnTurn` and was absorbed (`queue-operation` reason
/// `absorbed_mid_turn`), so it is mid-turn either way.
fn queued_prompt(line: &Value) -> Option<ChatMessage> {
    let attachment = line.get("attachment")?;
    let field = |name: &str| attachment.get(name).and_then(Value::as_str);
    // Task notifications and subagent hand-backs are queued the same way; neither was typed.
    let is_typed = field("type") == Some("queued_command") && field("commandMode") == Some("prompt");
    if !is_typed || is_true(attachment, "isMeta") || is_true(line, "isSidechain") {
        return None;
    }
    let blocks = blocks_of(attachment.get("prompt")?);
    if blocks.is_empty() {
        return None;
    }
    Some(ChatMessage {
        uuid: line.get("uuid")?.as_str()?.to_string(),
        role: Role::User,
        at: line.get("timestamp").and_then(Value::as_str).map(str::to_string),
        blocks,
        usage: None,
        is_mid_turn: true,
    })
}

/// Claude Code hands another agent's message to Claude as a prompt: in the transcript a meta user
/// line (or, read mid-turn, a `queued_command` attachment) with `origin.kind` "peer", live as a
/// user echo whose text reads "Another Claude session sent a message:" and the wrapped body.
/// The chat shows it as a system line, not as something the user said.
fn agent_message_of(line: &Value) -> Option<Vec<Block>> {
    let source = match line.get("type")?.as_str()? {
        "user" => line,
        "attachment" => line.get("attachment")?,
        _ => return None,
    };
    let origin = source.get("origin").filter(|origin| origin["kind"] == PEER_ORIGIN);
    let block = match origin {
        Some(origin) => from_origin(origin, source)?,
        None => from_wrapped_text(&prompt_text(source)?)?,
    };
    Some(vec![block])
}

fn from_origin(origin: &Value, source: &Value) -> Option<Block> {
    let field = |name: &str| origin.get(name).and_then(Value::as_str).map(str::to_string);
    let Some(body) = field("body") else { return prompt_text(source).and_then(|text| from_wrapped_text(&text)) };
    let (report, is_report) = report_of(&body);
    // Claude Code also keeps the report without its frame.
    let text = field("handbackReportText").filter(|text| !text.is_empty()).unwrap_or(report);
    let is_report = is_report || is_true(origin, "handback");
    let from = field("from").unwrap_or_default();
    Some(Block::AgentMessage { from, name: field("name").filter(|name| !name.is_empty()), text, is_report })
}

/// The report inside a hand-back frame, and whether there was one; other messages stay as sent.
fn report_of(body: &str) -> (String, bool) {
    let Some((_, report)) = body.strip_prefix(REPORT_FRAME).and_then(|rest| rest.split_once(REPORT_START)) else {
        return (body.to_string(), false);
    };
    let lines: Vec<&str> =
        report.trim_start_matches(['\r', '\n']).lines().map(|line| line.strip_prefix(REPORT_INDENT).unwrap_or(line)).collect();
    (lines.join("\n"), true)
}

/// The one text of a user message or a queued prompt; peer messages carry a single text.
fn prompt_text(source: &Value) -> Option<String> {
    let content = source.get("message").and_then(|message| message.get("content")).or_else(|| source.get("prompt"))?;
    match content {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => match items.as_slice() {
            [item] if item["type"] == "text" => item["text"].as_str().map(str::to_string),
            _ => None,
        },
        _ => None,
    }
}

/// `<agent-message from="id">body</agent-message>`, at the start or after Claude Code's own
/// preamble. Typed text that only quotes the tag stays text.
fn from_wrapped_text(text: &str) -> Option<Block> {
    let trimmed = text.trim_start();
    let wrapped = trimmed.strip_prefix(AGENT_MESSAGE_PREAMBLE).map(str::trim_start).unwrap_or(trimmed);
    let after_open = wrapped.strip_prefix(AGENT_MESSAGE_OPEN)?;
    let head_end = after_open.find('>')?;
    let head = &after_open[..head_end];
    let rest = &after_open[head_end + 1..];
    // The last closing tag: a report may quote the tag itself.
    let body = &rest[..rest.rfind(AGENT_MESSAGE_CLOSE)?];
    let from = between(head, "from=\"", "\"").unwrap_or_default().to_string();
    let (text, is_report) = report_of(body.trim_matches(['\r', '\n']));
    Some(Block::AgentMessage { from, name: None, text, is_report })
}

/// Claude Code keeps the tool's own output beside the result: `toolUseResult` in the transcript,
/// `tool_use_result` live. For a file change it holds `structuredPatch`; only that goes to the app,
/// not the whole file it also carries. A line answers one call, so only a lone result gets it.
fn with_patch(blocks: &mut [Block], line: &Value) {
    let output = line.get("toolUseResult").or_else(|| line.get("tool_use_result"));
    let Some(hunks) = output.and_then(|output| output.get("structuredPatch")).and_then(Value::as_array) else { return };
    let mut results = blocks.iter_mut().filter_map(|block| match block {
        Block::ToolResult { patch, .. } => Some(patch),
        _ => None,
    });
    let (Some(patch), None) = (results.next(), results.next()) else { return };
    *patch = Some(hunks.iter().filter_map(hunk_of).collect());
}

fn hunk_of(hunk: &Value) -> Option<Hunk> {
    let lines = hunk.get("lines")?.as_array()?.iter().filter_map(|line| line.as_str().map(str::to_string)).collect();
    Some(Hunk { old_start: hunk.get("oldStart")?.as_u64()?, new_start: hunk.get("newStart")?.as_u64()?, lines })
}

fn usage_of(message: &Value) -> Option<MessageUsage> {
    let model = message.get("model")?.as_str()?.to_string();
    let tokens = serde_json::from_value(message.get("usage")?.clone()).ok()?;
    let id = message.get("id").and_then(Value::as_str).map(str::to_string);
    Some(MessageUsage { model, id, tokens })
}

/// The chat of the branch Claude Code continues; what a rewind or a resent prompt left behind is
/// still in the file but no longer part of the conversation.
pub fn parse_transcript(text: &str) -> Vec<ChatMessage> {
    let lines: Vec<Value> = text.lines().filter_map(|line| serde_json::from_str(line).ok()).collect();
    let abandoned = branches::abandoned(&lines);
    let is_kept = |line: &Value| line["uuid"].as_str().is_none_or(|uuid| !abandoned.contains(uuid));
    // Should Claude Code ever write a user line for a queued prompt as well, that line wins.
    let user_lines: HashSet<&str> = lines
        .iter()
        .filter(|line| line["type"] == "user")
        .filter_map(|line| line["uuid"].as_str())
        .collect();
    let is_written_twice =
        |line: &Value| line["attachment"]["source_uuid"].as_str().is_some_and(|uuid| user_lines.contains(uuid));
    lines
        .iter()
        .filter(|line| is_kept(line) && !is_written_twice(line))
        .filter_map(|line| message_from(line).or_else(|| queued_prompt(line)))
        .collect()
}

/// The `limit` messages just before `before` (or the newest ones), oldest first,
/// and whether older ones remain.
pub fn page(messages: &[ChatMessage], before: Option<&str>, limit: usize) -> (Vec<ChatMessage>, bool) {
    let end = before
        .and_then(|uuid| messages.iter().position(|m| m.uuid == uuid))
        .unwrap_or(messages.len());
    let start = end.saturating_sub(limit);
    (messages[start..end].to_vec(), start > 0)
}

fn is_true(line: &Value, flag: &str) -> bool {
    line.get(flag).and_then(Value::as_bool).unwrap_or(false)
}

fn blocks_of(content: &Value) -> Vec<Block> {
    match content {
        Value::String(text) => text_block(text).into_iter().collect(),
        Value::Array(items) => items.iter().filter_map(block_of).collect(),
        _ => Vec::new(),
    }
}

fn block_of(item: &Value) -> Option<Block> {
    let field = |name: &str| item.get(name).and_then(Value::as_str).unwrap_or_default().to_string();
    match item.get("type")?.as_str()? {
        "text" => text_block(item.get("text")?.as_str()?),
        "image" => {
            let source = item.get("source")?;
            if source.get("type")?.as_str()? != "base64" {
                return None;
            }
            Some(Block::Image {
                media_type: source.get("media_type")?.as_str()?.to_string(),
                data: source.get("data")?.as_str()?.to_string(),
            })
        }
        "tool_use" => Some(Block::ToolUse {
            id: field("id"),
            name: field("name"),
            input: item.get("input").cloned().unwrap_or(Value::Null),
        }),
        "tool_result" => Some(Block::ToolResult {
            tool_use_id: field("tool_use_id"),
            is_error: item.get("is_error").and_then(Value::as_bool).unwrap_or(false),
            content: item.get("content").map(blocks_of).unwrap_or_default(),
            patch: None,
        }),
        "thinking" => Some(Block::Thinking { text: field("thinking") }),
        "redacted_thinking" => Some(Block::Thinking { text: String::new() }),
        _ => None,
    }
}

/// Claude Code wraps slash commands and injected context in pseudo-XML tags.
/// Commands become their own block; other tagged text is context, not chat.
fn text_block(text: &str) -> Option<Block> {
    if let Some(name) = between(text, "<command-name>", "</command-name>") {
        let args = between(text, "<command-args>", "</command-args>").unwrap_or_default();
        return Some(Block::Command { name: name.trim().to_string(), args: args.trim().to_string() });
    }
    if let Some(output) = between(text, "<local-command-stdout>", "</local-command-stdout>") {
        return Some(Block::CommandOutput { text: output.trim().to_string() });
    }
    if let Some(block) = shell_block(text) {
        return Some(block);
    }
    if is_injected(text) || text.trim().is_empty() {
        return None;
    }
    // "[Request interrupted by user]" and "... for tool use]" are markers, not something typed.
    if text.starts_with(INTERRUPTED_PREFIX) {
        return Some(Block::Interrupted);
    }
    Some(Block::Text { text: text.to_string() })
}

/// `! git status` in Claude Code's terminal, or from the app: the command and its output come as
/// `<bash-input>`, `<bash-stdout>` and `<bash-stderr>`, each at the start of its own text.
fn shell_block(text: &str) -> Option<Block> {
    let text = text.trim_start();
    if text.starts_with("<bash-input>") {
        let command = between(text, "<bash-input>", "</bash-input>")?;
        return Some(Block::Shell { command: command.trim().to_string() });
    }
    if !text.starts_with("<bash-stdout>") && !text.starts_with("<bash-stderr>") {
        return None;
    }
    let stream = |tag: &str| {
        let output = between(text, &format!("<{tag}>"), &format!("</{tag}>")).unwrap_or_default();
        output.trim_end().to_string()
    };
    Some(Block::ShellOutput { stdout: stream("bash-stdout"), stderr: stream("bash-stderr") })
}

/// Text that merely starts with `<` (HTML, a generic type) is something the user typed.
fn is_injected(text: &str) -> bool {
    let Some(rest) = text.trim_start().strip_prefix('<') else { return false };
    INJECTED_TAGS.iter().any(|tag| {
        rest.strip_prefix(tag).is_some_and(|after| after.starts_with(['>', ' ', '\n', '\r']))
    })
}

fn between<'a>(text: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let start = text.find(open)? + open.len();
    let end = start + text[start..].find(close)?;
    Some(&text[start..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn user(uuid: &str, content: Value) -> Value {
        json!({ "type": "user", "uuid": uuid, "timestamp": "2026-11-15T01:00:00Z",
                "message": { "role": "user", "content": content } })
    }

    #[test]
    fn keeps_full_text_and_images_of_a_user_message() {
        let line = user("u1", json!([
            { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "iVBOR" } },
            { "type": "text", "text": "Welche Farbe?\nZweite Zeile" }
        ]));
        let message = message_from(&line).unwrap();
        assert_eq!(message.role, Role::User);
        assert_eq!(message.blocks, vec![
            Block::Image { media_type: "image/png".into(), data: "iVBOR".into() },
            Block::Text { text: "Welche Farbe?\nZweite Zeile".into() },
        ]);
    }

    #[test]
    fn keeps_thinking_with_or_without_text() {
        let line = json!({ "type": "assistant", "uuid": "a0", "message": { "role": "assistant", "content": [
            { "type": "thinking", "thinking": "Checking the header first.", "signature": "x" },
            { "type": "thinking", "thinking": "", "signature": "y" },
            { "type": "redacted_thinking", "data": "z" }
        ]}});
        assert_eq!(message_from(&line).unwrap().blocks, vec![
            Block::Thinking { text: "Checking the header first.".into() },
            Block::Thinking { text: "".into() },
            Block::Thinking { text: "".into() },
        ]);
    }

    #[test]
    fn reads_tool_use_and_nested_tool_result() {
        let call = json!({ "type": "assistant", "uuid": "a1", "message": { "role": "assistant", "content": [
            { "type": "tool_use", "id": "t1", "name": "Bash", "input": { "command": "echo hi" } }
        ]}});
        let result = user("u2", json!([{ "type": "tool_result", "tool_use_id": "t1", "is_error": false,
            "content": [{ "type": "text", "text": "hi" }] }]));
        assert_eq!(message_from(&call).unwrap().blocks, vec![
            Block::ToolUse { id: "t1".into(), name: "Bash".into(), input: json!({ "command": "echo hi" }) },
        ]);
        assert_eq!(message_from(&result).unwrap().blocks, vec![Block::ToolResult {
            tool_use_id: "t1".into(), is_error: false, content: vec![Block::Text { text: "hi".into() }], patch: None,
        }]);
    }

    #[test]
    fn turns_slash_commands_into_command_blocks() {
        let command = user("u3", json!("<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>"));
        let output = user("u4", json!("<local-command-stdout>Compacted </local-command-stdout>"));
        assert_eq!(message_from(&command).unwrap().blocks, vec![Block::Command { name: "/compact".into(), args: "".into() }]);
        assert_eq!(message_from(&output).unwrap().blocks, vec![Block::CommandOutput { text: "Compacted".into() }]);
    }

    #[test]
    fn skips_meta_sidechain_summaries_and_bookkeeping() {
        let mut meta = user("u5", json!("[Image: source: C:\\x.png]"));
        meta["isMeta"] = json!(true);
        let mut sidechain = user("u6", json!("subagent prompt"));
        sidechain["isSidechain"] = json!(true);
        let caveat = user("u7", json!("<local-command-caveat>The command below</local-command-caveat>"));
        let attachment = json!({ "type": "attachment", "uuid": "x1" });
        let mut subagent = user("u9", json!("Fetch https://example.com"));
        subagent["parent_tool_use_id"] = json!("toolu_1");
        for line in [meta, sidechain, caveat, attachment, subagent] {
            assert_eq!(message_from(&line), None);
        }
    }

    #[test]
    fn reads_a_shell_command_and_its_output() {
        let input = user("u12", json!("<bash-input> git status --short</bash-input>"));
        let output = user("u13", json!("<bash-stdout> M src/app.ts
</bash-stdout><bash-stderr></bash-stderr>"));
        let together = user("u14", json!([
            { "type": "text", "text": "<bash-input>npm test</bash-input>" },
            { "type": "text", "text": "<bash-stdout></bash-stdout><bash-stderr>1 failed</bash-stderr>" },
            { "type": "text", "text": "Fix the test" }
        ]));
        assert_eq!(message_from(&input).unwrap().blocks, vec![Block::Shell { command: "git status --short".into() }]);
        assert_eq!(message_from(&output).unwrap().blocks, vec![Block::ShellOutput { stdout: " M src/app.ts".into(), stderr: "".into() }]);
        assert_eq!(message_from(&together).unwrap().blocks, vec![
            Block::Shell { command: "npm test".into() },
            Block::ShellOutput { stdout: "".into(), stderr: "1 failed".into() },
            Block::Text { text: "Fix the test".into() },
        ]);
    }

    #[test]
    fn keeps_typed_text_that_starts_with_a_tag() {
        let line = user("u10", json!([{ "type": "text", "text": "<b>fett</b> Antworte nur mit: ok" }]));
        assert_eq!(message_from(&line).unwrap().blocks, vec![Block::Text { text: "<b>fett</b> Antworte nur mit: ok".into() }]);
        let generic = user("u11", json!("<T> in TypeScript?"));
        assert_eq!(message_from(&generic).unwrap().blocks, vec![Block::Text { text: "<T> in TypeScript?".into() }]);
    }

    #[test]
    fn skips_context_claude_code_adds_in_tags() {
        for text in ["<system-reminder>\nToday</system-reminder>", "<task-notification>\n<task-id>x</task-id>",
                     "<agent-message from=\"a1\">\nreport"] {
            assert_eq!(message_from(&user("u12", json!(text))), None, "{text}");
        }
    }

    #[test]
    fn turns_the_interrupt_note_into_a_marker() {
        let line = user("u8", json!([{ "type": "text", "text": "[Request interrupted by user for tool use]" }]));
        assert_eq!(message_from(&line).unwrap().blocks, vec![Block::Interrupted]);
    }

    fn queued(uuid: &str, attachment: Value) -> Value {
        json!({ "type": "attachment", "uuid": uuid, "timestamp": "2026-11-15T18:52:43.665Z", "attachment": attachment })
    }

    #[test]
    fn reads_a_prompt_sent_mid_turn_as_user_message() {
        // As Claude Code 2.1 writes it for a prompt that arrived while a tool ran (`claude -p`).
        let line = queued("q1", json!({ "type": "queued_command", "commandMode": "prompt", "hostsOwnTurn": true,
            "prompt": [{ "type": "text", "text": "Sag am Ende auch BANANE." }],
            "source_uuid": "0c666eea", "timestamp": "2026-11-15T18:52:43.665Z" }));
        assert_eq!(queued_prompt(&line).unwrap(), ChatMessage {
            uuid: "q1".into(), role: Role::User, at: Some("2026-11-15T18:52:43.665Z".into()),
            blocks: vec![Block::Text { text: "Sag am Ende auch BANANE.".into() }], usage: None, is_mid_turn: true,
        });
    }

    #[test]
    fn keeps_a_mid_turn_prompt_where_claude_read_it() {
        let call = json!({ "type": "assistant", "uuid": "a1", "message": { "role": "assistant", "content": [
            { "type": "tool_use", "id": "t1", "name": "Bash", "input": {} }] } });
        let result = user("u1", json!([{ "type": "tool_result", "tool_use_id": "t1", "content": "42" }]));
        let prompt = queued("q1", json!({ "type": "queued_command", "commandMode": "prompt", "prompt": "BANANE" }));
        let reply = json!({ "type": "assistant", "uuid": "a2", "message": { "role": "assistant", "content": "42 BANANE" } });
        let text = [call, result, prompt, reply].map(|line| line.to_string()).join("\n");
        let order: Vec<_> = parse_transcript(&text).into_iter().map(|m| (m.uuid, m.is_mid_turn)).collect();
        assert_eq!(order, [("a1".into(), false), ("u1".into(), false), ("q1".into(), true), ("a2".into(), false)]);
    }

    #[test]
    fn shows_a_queued_prompt_once_when_it_also_has_a_user_line() {
        let prompt = queued("q5", json!({ "type": "queued_command", "commandMode": "prompt", "hostsOwnTurn": true,
            "prompt": "ZWEI", "source_uuid": "u7" }));
        let line = user("u7", json!("ZWEI"));
        let text = [prompt, line].map(|line| line.to_string()).join("\n");
        let uuids: Vec<_> = parse_transcript(&text).into_iter().map(|m| m.uuid).collect();
        assert_eq!(uuids, ["u7"]);
    }

    #[test]
    fn reads_a_mid_turn_prompt_typed_in_the_terminal() {
        let line = queued("q2", json!({ "type": "queued_command", "commandMode": "prompt", "humanTurn": true,
            "origin": { "kind": "human" }, "prompt": "keine fixe Reihenfolge" }));
        assert_eq!(queued_prompt(&line).unwrap().blocks, vec![Block::Text { text: "keine fixe Reihenfolge".into() }]);
    }

    #[test]
    fn skips_queued_notifications_and_agent_messages() {
        let notification = queued("q3", json!({ "type": "queued_command", "commandMode": "task-notification",
            "origin": { "kind": "task-notification" }, "prompt": "<task-notification>done</task-notification>" }));
        let handback = queued("q4", json!({ "type": "queued_command", "commandMode": "prompt", "isMeta": true,
            "origin": { "kind": "peer" }, "prompt": "Subagent report" }));
        for line in [notification, handback] {
            assert_eq!(queued_prompt(&line), None);
        }
    }

    /// The frame as Claude Code 2.1.325 writes it, shortened in the middle.
    const FRAMED: &str = "[Subagent hand-back] The text below is the final report of a subagent this session delegated to. The report follows:\n  Ping finished,\n  1 match.";
    const HANDBACK: &str = "Another Claude session sent a message:\n<agent-message from=\"a444072e1eecc1107\">\n[Subagent hand-back] The text below is the final report of a subagent this session delegated to. The report follows:\n  Ping finished,\n  1 match.\n</agent-message>\n\nThat \"other Claude session\" is an agent working inside this same session.";

    fn peer_origin() -> Value {
        json!({ "kind": "peer", "from": "a444072e1eecc1107", "senderTaskId": "a444072e1eecc1107", "name": "Explore",
                "body": FRAMED, "handback": true, "handbackReportText": "Ping finished,\n1 match." })
    }

    fn handback_block(name: Option<&str>) -> Block {
        Block::AgentMessage {
            from: "a444072e1eecc1107".into(), name: name.map(str::to_string), text: "Ping finished,\n1 match.".into(), is_report: true,
        }
    }

    #[test]
    fn turns_a_subagent_handback_in_the_transcript_into_a_system_line() {
        // As Claude Code 2.1.325 writes a hand-back that arrived while Claude was idle (`claude -p`).
        let mut line = user("p1", json!(HANDBACK));
        line["isMeta"] = json!(true);
        line["origin"] = peer_origin();
        assert_eq!(message_from(&line).unwrap(), ChatMessage {
            uuid: "p1".into(), role: Role::System, at: Some("2026-11-15T01:00:00Z".into()),
            blocks: vec![handback_block(Some("Explore"))], usage: None, is_mid_turn: false,
        });
    }

    #[test]
    fn keeps_a_handback_claude_read_mid_turn_inside_that_turn() {
        let line = queued("p2", json!({ "type": "queued_command", "commandMode": "prompt", "isMeta": true,
            "origin": peer_origin(), "prompt": format!("<agent-message from=\"a444072e1eecc1107\">\n{FRAMED}\n</agent-message>"),
            "source_uuid": "u1", "delivery_id": "d1" }));
        let messages = parse_transcript(&line.to_string());
        assert_eq!(messages.len(), 1);
        assert_eq!((&messages[0].role, &messages[0].blocks, messages[0].is_mid_turn),
                   (&Role::System, &vec![handback_block(Some("Explore"))], true));
    }

    #[test]
    fn reads_a_live_handback_echo_from_its_text() {
        let line = user("p3", json!([{ "type": "text", "text": HANDBACK }]));
        let message = message_from(&line).unwrap();
        assert_eq!((message.role, message.blocks), (Role::System, vec![handback_block(None)]));
    }

    #[test]
    fn keeps_typed_text_that_quotes_an_agent_message() {
        for text in ["Warum zeigt Bull das:\n<agent-message from=\"a1\">x</agent-message>",
                     "Warum zeigt Bull das?\nHier der Text:\n<agent-message from=\"a1\">x</agent-message>"] {
            let line = user("p4", json!(text));
            assert_eq!(message_from(&line).unwrap().blocks, vec![Block::Text { text: text.into() }], "{text}");
        }
    }

    #[test]
    fn keeps_a_report_that_quotes_the_closing_tag() {
        let text = "Another Claude session sent a message:\n<agent-message from=\"a1\">\nBull hides `</agent-message>` now.\n</agent-message>\n\nThat \"other Claude session\" is an agent.";
        assert_eq!(message_from(&user("p5", json!(text))).unwrap().blocks, vec![Block::AgentMessage {
            from: "a1".into(), name: None, text: "Bull hides `</agent-message>` now.".into(), is_report: false,
        }]);
    }

    #[test]
    fn keeps_a_plain_message_from_another_agent_as_sent() {
        let mut line = user("p7", json!("x"));
        line["isMeta"] = json!(true);
        line["origin"] = json!({ "kind": "peer", "from": "a2", "body": "Done with the header." });
        assert_eq!(message_from(&line).unwrap().blocks, vec![Block::AgentMessage {
            from: "a2".into(), name: None, text: "Done with the header.".into(), is_report: false,
        }]);
    }

    #[test]
    fn leaves_a_message_to_a_running_subagent_inside_its_call() {
        let mut line = user("p6", json!("<agent-message from=\"main\">\nAlso check the footer.\n</agent-message>"));
        line["parent_tool_use_id"] = json!("toolu_1");
        assert_eq!(message_from(&line), None);
    }

    #[test]
    fn keeps_the_usage_of_an_assistant_reply() {
        let line = json!({ "type": "assistant", "uuid": "a1",
            "message": { "role": "assistant", "model": "claude-opus-5-5", "content": [{ "type": "text", "text": "Hi" }],
                         "usage": { "input_tokens": 3, "output_tokens": 9, "cache_read_input_tokens": 20000, "cache_creation_input_tokens": 400 } } });
        let usage = message_from(&line).unwrap().usage.unwrap();
        assert_eq!(usage.model, "claude-opus-5-5");
        assert_eq!(usage.id, None);
        assert_eq!(usage.tokens, Tokens { input: 3, output: 9, cache_read: 20000, cache_write: 400 });
    }

    #[test]
    fn keeps_the_api_message_id_a_reply_was_split_from() {
        let line = json!({ "type": "assistant", "uuid": "a2", "message": { "id": "msg_1", "role": "assistant",
            "model": "claude-opus-5-5", "content": [{ "type": "text", "text": "Hi" }], "usage": { "output_tokens": 9 } } });
        assert_eq!(message_from(&line).unwrap().usage.unwrap().id.as_deref(), Some("msg_1"));
    }

    /// As Claude Code 2.1.327 writes an Edit result in the transcript (shortened).
    fn edit_result(field: &str) -> Value {
        let mut line = user("u20", json!([{ "type": "tool_result", "tool_use_id": "t9", "content": "The file was updated." }]));
        line[field] = json!({ "filePath": "C:/x/build.mjs", "oldString": "  slash8,\n  at8,", "newString": "  slash8,\n  slashSearch8,\n  at8,",
            "originalFile": null, "structuredPatch": [{ "oldStart": 3122, "oldLines": 3, "newStart": 3122, "newLines": 4,
            "lines": ["   uxBoard,", "   slash8,", "+  slashSearch8,", "   at8,"] }], "userModified": false, "replaceAll": false });
        line
    }

    #[test]
    fn keeps_the_patch_of_a_file_change_live_and_in_the_transcript() {
        for field in ["toolUseResult", "tool_use_result"] {
            let blocks = message_from(&edit_result(field)).unwrap().blocks;
            let Block::ToolResult { patch, .. } = &blocks[0] else { panic!("no tool result") };
            let lines = vec!["   uxBoard,".to_string(), "   slash8,".into(), "+  slashSearch8,".into(), "   at8,".into()];
            assert_eq!(patch.as_deref(), Some(&[Hunk { old_start: 3122, new_start: 3122, lines }][..]), "{field}");
        }
    }

    #[test]
    fn leaves_results_without_a_patch_alone() {
        let mut line = user("u21", json!([{ "type": "tool_result", "tool_use_id": "t1", "content": "ok" }]));
        line["toolUseResult"] = json!({ "stdout": "ok", "stderr": "", "interrupted": false });
        let blocks = message_from(&line).unwrap().blocks;
        assert!(matches!(&blocks[0], Block::ToolResult { patch: None, .. }));
    }

    #[test]
    fn skips_synthetic_api_error_replies() {
        let line = json!({ "type": "assistant", "uuid": "a9", "apiError": "usage_limit_reached",
            "message": { "role": "assistant", "model": "<synthetic>",
                         "content": [{ "type": "text", "text": "You've hit your limit" }] } });
        assert_eq!(message_from(&line), None);
    }

    #[test]
    fn skips_the_live_compaction_summary() {
        let line = json!({ "type": "user", "uuid": "u9", "isSynthetic": true, "isReplay": false,
            "message": { "role": "user", "content": "This session is being continued from a previous conversation." } });
        assert_eq!(message_from(&line), None);
    }

    #[test]
    fn skips_the_live_instructions_of_a_loaded_skill() {
        let line = json!({ "type": "user", "uuid": "u10", "isSynthetic": true, "parent_tool_use_id": null,
            "message": { "role": "user",
                         "content": [{ "type": "text", "text": "Base directory for this skill: C:\\skills\\rea" }] } });
        assert_eq!(message_from(&line), None);
    }

    #[test]
    fn marks_compaction_as_system_message() {
        let line = json!({ "type": "system", "subtype": "compact_boundary", "uuid": "s1" });
        assert_eq!(message_from(&line).unwrap(), ChatMessage {
            uuid: "s1".into(), role: Role::System, at: None, blocks: vec![Block::Compacted], usage: None,
            is_mid_turn: false,
        });
    }

    #[test]
    fn pages_backwards_from_a_uuid() {
        let text = (1..=5).map(|i| user(&format!("m{i}"), json!(format!("Nachricht {i}"))).to_string())
            .collect::<Vec<_>>().join("\n");
        let messages = parse_transcript(&text);
        let uuids = |page: &[ChatMessage]| page.iter().map(|m| m.uuid.clone()).collect::<Vec<_>>();

        let (newest, has_more) = page(&messages, None, 2);
        assert_eq!((uuids(&newest), has_more), (vec!["m4".to_string(), "m5".into()], true));
        let (older, has_more) = page(&messages, Some("m4"), 5);
        assert_eq!((uuids(&older), has_more), (vec!["m1".to_string(), "m2".into(), "m3".into()], false));
    }
}
