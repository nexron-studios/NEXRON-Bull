//! The prompts a session can be rewound to, as Claude Code's `/rewind` lists them: the typed
//! prompts of the kept branch since the last compaction (Claude no longer holds older ones), each
//! with the files its turn changed and whether a file checkpoint was taken before it.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use crate::branches;
use crate::chat::{self, Block, Role};

const SNAPSHOT: &str = "file-history-snapshot";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RewindPoint {
    /// The prompt's uuid, the target of `rewind_files` and `rewind_conversation`.
    pub uuid: String,
    pub text: String,
    pub images: usize,
    pub at: Option<String>,
    /// Files the turn of this prompt wrote, edited or changed through a shell command.
    pub files_changed: usize,
    /// Claude Code backed up the files before this prompt; without it the code cannot go back.
    pub has_checkpoint: bool,
}

pub fn points(transcript: &str) -> Vec<RewindPoint> {
    let lines: Vec<Value> = transcript.lines().filter_map(|line| serde_json::from_str(line).ok()).collect();
    let abandoned = branches::abandoned(&lines);
    let kept: Vec<&Value> =
        lines.iter().filter(|line| line["uuid"].as_str().is_none_or(|uuid| !abandoned.contains(uuid))).collect();
    let since = kept.iter().rposition(|line| line["subtype"] == "compact_boundary").map_or(0, |at| at + 1);
    let checkpoints: HashSet<&str> =
        lines.iter().filter(|line| line["type"] == SNAPSHOT).filter_map(|line| line["messageId"].as_str()).collect();
    let mut points: Vec<RewindPoint> = Vec::new();
    let mut files: HashSet<String> = HashSet::new();
    for line in &kept[since..] {
        if let Some(point) = point_of(line, &checkpoints) {
            if let Some(previous) = points.last_mut() {
                previous.files_changed = files.len();
            }
            files.clear();
            points.push(point);
            continue;
        }
        files.extend(changed_files(&line["toolUseResult"]));
    }
    if let Some(last) = points.last_mut() {
        last.files_changed = files.len();
    }
    points
}

fn point_of(line: &Value, checkpoints: &HashSet<&str>) -> Option<RewindPoint> {
    if !branches::is_typed_prompt(line) || line["isSidechain"] == true {
        return None;
    }
    // Commands, their output and what Claude Code injected are user lines too, but nothing typed.
    let message = chat::message_from(line).filter(|message| message.role == Role::User)?;
    let texts: Vec<&str> = message
        .blocks
        .iter()
        .filter_map(|block| match block {
            Block::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    let images = message.blocks.iter().filter(|block| matches!(block, Block::Image { .. })).count();
    if texts.is_empty() && images == 0 {
        return None;
    }
    Some(RewindPoint {
        has_checkpoint: checkpoints.contains(message.uuid.as_str()),
        uuid: message.uuid,
        text: texts.join("\n"),
        images,
        at: message.at,
        files_changed: 0,
    })
}

/// Write and Edit results carry the file and its patch; a shell command that changed files lists
/// them under `bashEditDiff` (`files` today, `changedFiles` before).
fn changed_files(result: &Value) -> Vec<String> {
    let mut files = Vec::new();
    if result.get("structuredPatch").is_some() {
        files.extend(result["filePath"].as_str().map(str::to_string));
    }
    let diff = &result["bashEditDiff"];
    let listed = diff["files"].as_array().into_iter().flatten().filter_map(|file| file["filePath"].as_str());
    let named = diff["changedFiles"].as_array().into_iter().flatten().filter_map(Value::as_str);
    files.extend(listed.chain(named).map(str::to_string));
    files
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn transcript(lines: &[Value]) -> String {
        lines.iter().map(Value::to_string).collect::<Vec<_>>().join("\n")
    }

    fn prompt(uuid: &str, parent: Option<&str>, text: &str) -> Value {
        json!({ "type": "user", "uuid": uuid, "parentUuid": parent, "timestamp": "2026-11-18T10:00:00Z",
            "message": { "role": "user", "content": [{ "type": "text", "text": text }] } })
    }

    fn reply(uuid: &str, parent: &str) -> Value {
        json!({ "type": "assistant", "uuid": uuid, "parentUuid": parent,
            "message": { "role": "assistant", "content": [{ "type": "tool_use", "id": "t", "name": "Write", "input": {} }] } })
    }

    fn edit(uuid: &str, parent: &str, file: &str) -> Value {
        json!({ "type": "user", "uuid": uuid, "parentUuid": parent, "toolUseResult": { "filePath": file, "structuredPatch": [] },
            "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t" }] } })
    }

    #[test]
    fn lists_prompts_with_their_changed_files_and_checkpoints() {
        let text = transcript(&[
            prompt("p1", None, "make a"),
            json!({ "type": SNAPSHOT, "messageId": "p1", "snapshot": {} }),
            reply("a1", "p1"),
            edit("r1", "a1", "a.txt"),
            edit("r2", "r1", "a.txt"),
            json!({ "type": "user", "uuid": "r3", "parentUuid": "r2", "toolUseResult": { "bashEditDiff": { "files": [{ "filePath": "b.txt" }] } },
                "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t" }] } }),
            prompt("p2", Some("r3"), "just talk"),
        ]);
        let points = points(&text);
        assert_eq!(points.len(), 2);
        assert_eq!((points[0].uuid.as_str(), points[0].files_changed, points[0].has_checkpoint), ("p1", 2, true));
        assert_eq!((points[1].text.as_str(), points[1].files_changed, points[1].has_checkpoint), ("just talk", 0, false));
        assert_eq!(points[0].at.as_deref(), Some("2026-11-18T10:00:00Z"));
    }

    #[test]
    fn leaves_out_commands_rewound_prompts_and_what_came_before_a_compaction() {
        let text = transcript(&[
            prompt("p1", None, "before"),
            json!({ "type": "system", "subtype": "compact_boundary", "uuid": "c1", "parentUuid": null, "logicalParentUuid": "p1" }),
            prompt("cmd", Some("c1"), "<command-name>/compact</command-name>"),
            prompt("p2", Some("cmd"), "kept"),
            prompt("p3", Some("p2"), "cut"),
            json!({ "type": "last-prompt", "leafUuid": "p2", "rewound": true, "cutUuid": "p3" }),
        ]);
        let uuids: Vec<String> = points(&text).into_iter().map(|point| point.uuid).collect();
        assert_eq!(uuids, ["p2"]);
    }
}
