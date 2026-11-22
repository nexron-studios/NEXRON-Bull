//! The tool calls of a session's subagents, read from the transcripts Claude Code keeps beside
//! the session's own: `<session-id>/subagents/agent-<agent-id>.jsonl`, each with a
//! `.meta.json` that names the Agent call that started it (`toolUseId`).

use std::fs;
use std::io;
use std::path::Path;

use serde::Serialize;
use serde_json::{Map, Value};

use crate::chat::{self, Block, ChatMessage};

const AGENT_PREFIX: &str = "agent-";
const TRANSCRIPT_EXTENSION: &str = ".jsonl";
const META_EXTENSION: &str = ".meta.json";
/// The app only shows one line of a call's input; a whole file a subagent wrote would make the
/// answer megabytes over SSH for nothing.
const INPUT_CHARS: usize = 400;
/// The newest calls with their results; the app lists only the last few of a subagent, and the
/// whole list goes out again each time one of the session's subagents finishes.
const MAX_MESSAGES: usize = 400;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SubagentTranscript {
    pub agent_id: String,
    /// The Agent call that started it; `None` when Claude Code wrote no meta file (older
    /// versions), the app then matches `agent_id` against the `agentId:` in the call's result.
    pub tool_use_id: Option<String>,
    /// Only tool calls and their results, the results without content.
    pub messages: Vec<ChatMessage>,
}

/// Every subagent transcript next to `transcript`; none when the session never started one.
pub fn transcripts_beside(transcript: &Path) -> io::Result<Vec<SubagentTranscript>> {
    let dir = transcript.with_extension("").join("subagents");
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };
    let mut agents = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(agent_id) = name.strip_prefix(AGENT_PREFIX).and_then(|rest| rest.strip_suffix(TRANSCRIPT_EXTENSION))
        else {
            continue;
        };
        // A running subagent's file may end in a half-written character; one unreadable file
        // must not cost the others their history.
        let Ok(bytes) = fs::read(entry.path()) else { continue };
        let meta = dir.join(format!("{AGENT_PREFIX}{agent_id}{META_EXTENSION}"));
        agents.push(SubagentTranscript {
            agent_id: agent_id.to_string(),
            tool_use_id: tool_use_id_of(&meta),
            messages: calls_of(&String::from_utf8_lossy(&bytes)),
        });
    }
    agents.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
    Ok(agents)
}

fn tool_use_id_of(meta: &Path) -> Option<String> {
    let meta: Value = serde_json::from_str(&fs::read_to_string(meta).ok()?).ok()?;
    meta["toolUseId"].as_str().map(str::to_string)
}

/// The newest tool calls and results of one subagent transcript, in order.
pub fn calls_of(text: &str) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = text
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter_map(|mut line| {
            // Every line of a subagent's own file is a sidechain; read it like a main transcript.
            line.as_object_mut()?.remove("isSidechain");
            chat::message_from(&line)
        })
        .filter_map(|message| {
            let blocks: Vec<Block> = message.blocks.into_iter().filter_map(call_block).collect();
            (!blocks.is_empty()).then_some(ChatMessage { blocks, usage: None, ..message })
        })
        .collect();
    messages.split_off(messages.len().saturating_sub(MAX_MESSAGES))
}

fn call_block(block: Block) -> Option<Block> {
    match block {
        Block::ToolUse { id, name, input } => Some(Block::ToolUse { id, name, input: short_input(input) }),
        Block::ToolResult { tool_use_id, is_error, .. } => {
            Some(Block::ToolResult { tool_use_id, is_error, content: Vec::new(), patch: None })
        }
        _ => None,
    }
}

/// The input's top-level scalars, long texts cut: what names the target of a call.
fn short_input(input: Value) -> Value {
    let Value::Object(fields) = input else { return Value::Object(Map::new()) };
    let kept = fields.into_iter().filter_map(|(key, value)| match value {
        Value::String(text) if text.chars().count() > INPUT_CHARS => {
            Some((key, Value::String(text.chars().take(INPUT_CHARS).collect())))
        }
        Value::String(_) | Value::Bool(_) | Value::Number(_) => Some((key, value)),
        _ => None,
    });
    Value::Object(kept.collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn line(kind: &str, uuid: &str, content: Value) -> String {
        json!({
            "type": kind, "uuid": uuid, "isSidechain": true, "agentId": "a1",
            "timestamp": "2026-11-16T18:06:41.929Z",
            "message": { "role": kind, "content": content },
        })
        .to_string()
    }

    #[test]
    fn keeps_only_calls_and_empty_results() {
        let text = [
            line("user", "u1", json!("Find the header")),
            line("assistant", "a1", json!([{ "type": "thinking", "thinking": "hm" }])),
            line("assistant", "a2", json!([{ "type": "tool_use", "id": "t1", "name": "Glob",
                "input": { "pattern": "**/*.vue", "edits": [1, 2] } }])),
            line("user", "u2", json!([{ "type": "tool_result", "tool_use_id": "t1", "is_error": false,
                "content": "a.vue\nb.vue" }])),
            line("assistant", "a3", json!([{ "type": "text", "text": "Found 2" }])),
        ]
        .join("\n");
        let messages = calls_of(&text);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].uuid, "a2");
        assert_eq!(messages[0].at.as_deref(), Some("2026-11-16T18:06:41.929Z"));
        assert_eq!(messages[0].blocks, vec![Block::ToolUse {
            id: "t1".into(),
            name: "Glob".into(),
            input: json!({ "pattern": "**/*.vue" }),
        }]);
        assert_eq!(messages[1].blocks, vec![Block::ToolResult {
            tool_use_id: "t1".into(),
            is_error: false,
            content: Vec::new(),
            patch: None,
        }]);
    }

    #[test]
    fn keeps_only_the_newest_calls() {
        let text: Vec<String> = (0..MAX_MESSAGES + 3)
            .map(|i| line("assistant", &format!("a{i}"), json!([{ "type": "tool_use", "id": format!("t{i}"),
                "name": "Read", "input": {} }])))
            .collect();
        let messages = calls_of(&text.join("
"));
        assert_eq!(messages.len(), MAX_MESSAGES);
        assert_eq!(messages[0].uuid, "a3");
    }

    #[test]
    fn cuts_long_input_texts() {
        let long = "x".repeat(INPUT_CHARS + 50);
        let input = short_input(json!({ "file_path": "a.ts", "content": long, "replace_all": true }));
        assert_eq!(input["file_path"], "a.ts");
        assert_eq!(input["content"].as_str().unwrap().len(), INPUT_CHARS);
        assert_eq!(input["replace_all"], true);
    }

    #[test]
    fn reads_every_agent_with_its_call_id() {
        let root = std::env::temp_dir().join(format!("agentd-subagents-{}", std::process::id()));
        let dir = root.join("s1").join("subagents");
        fs::create_dir_all(&dir).unwrap();
        let call = line("assistant", "a2", json!([{ "type": "tool_use", "id": "t1", "name": "Read",
            "input": { "file_path": "a.ts" } }]));
        fs::write(dir.join("agent-b2.jsonl"), &call).unwrap();
        fs::write(dir.join("agent-a1.jsonl"), &call).unwrap();
        fs::write(dir.join("agent-a1.meta.json"), r#"{"toolUseId":"toolu_9"}"#).unwrap();
        fs::write(dir.join("agent-a1.forked-skill.json"), "{}").unwrap();

        let agents = transcripts_beside(&root.join("s1.jsonl")).unwrap();
        let ids: Vec<_> = agents.iter().map(|a| (a.agent_id.as_str(), a.tool_use_id.as_deref())).collect();
        assert_eq!(ids, vec![("a1", Some("toolu_9")), ("b2", None)]);
        assert_eq!(agents[0].messages.len(), 1);
        assert_eq!(transcripts_beside(&root.join("none.jsonl")).unwrap(), Vec::new());
        fs::remove_dir_all(root).unwrap();
    }
}
