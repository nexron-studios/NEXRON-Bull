//! What Claude has streamed of the block it is writing right now, so an app that attaches mid-turn
//! sees the half-written text instead of nothing until the message is complete. Claude Code sends
//! each finished content block as an `assistant` message, which the transcript holds too; this
//! keeps only what came after the last one. It derives the same state the app derives from the
//! same events (`src/utils/liveStream.ts`); `tests/fixtures/stream_replay.json` holds both sides to
//! that, so the replay can replace the app's state outright.

use serde_json::Value;

use crate::protocol::{BlockKind, Event, LiveBlock};

/// Text kept per tab. A block rarely streams more than a few hundred KB before it completes; past
/// this the text is dropped and the replay tells the app the block is cut, so it shows nothing of
/// it until the finished message instead of a reply that starts mid-way.
pub(crate) const MAX_PARTIAL_BYTES: usize = 1024 * 1024;

#[derive(Debug, Default)]
pub(crate) struct PartialReply {
    /// Of the API call being streamed, from its `message_start`
    message_id: Option<String>,
    /// Characters streamed in this call (text, reasoning, tool input), for the app's token estimate
    chars: u64,
    block: LiveBlock,
}

impl PartialReply {
    /// A raw Claude event, one that `chat::message_from` did not turn into a message.
    pub(crate) fn observe(&mut self, event: &Value) {
        match event["type"].as_str() {
            // A subagent streams too; the app shows its text inside the Agent call, not here.
            Some("stream_event") if event["parent_tool_use_id"].is_null() => self.observe_stream(&event["event"]),
            // The turn is over, also an interrupted or failed one: nothing streams until the next
            // call starts, and an app attaching meanwhile has nothing to replay.
            // `/clear` empties the chat, the app's token estimate with it.
            Some("result" | "conversation_reset") => *self = Self::default(),
            _ => {}
        }
    }

    /// Claude sent a finished assistant message: what streamed so far is in it now.
    pub(crate) fn finish_block(&mut self) {
        self.block = LiveBlock::None;
    }

    fn observe_stream(&mut self, inner: &Value) {
        match inner["type"].as_str() {
            Some("message_start") => {
                *self = Self { message_id: inner["message"]["id"].as_str().map(str::to_string), ..Self::default() };
            }
            Some("content_block_start") if inner["content_block"]["type"] == "thinking" => self.append(BlockKind::Thinking, ""),
            Some("content_block_delta") => self.add_delta(&inner["delta"]),
            // The call's final output count reaches the app; its estimate starts over.
            Some("message_delta") if self.message_id.is_some() && inner["usage"]["output_tokens"].is_number() => self.chars = 0,
            _ => {}
        }
    }

    fn add_delta(&mut self, delta: &Value) {
        let piece = ["text", "thinking", "partial_json"].iter().find_map(|key| delta[*key].as_str()).unwrap_or_default();
        // The app counts JavaScript string length, in UTF-16 units.
        self.chars += piece.encode_utf16().count() as u64;
        match delta["type"].as_str() {
            Some("text_delta") => self.append(BlockKind::Writing, piece),
            Some("thinking_delta") => self.append(BlockKind::Thinking, piece),
            _ => {}
        }
    }

    /// As `appendedTo` in the app, plus the limit: a block past it is cut until it finishes.
    fn append(&mut self, kind: BlockKind, piece: &str) {
        let before = match (&self.block, kind) {
            (LiveBlock::Cut { .. }, _) => return,
            (LiveBlock::Thinking { text }, BlockKind::Thinking) | (LiveBlock::Writing { text }, BlockKind::Writing) => text.as_str(),
            (LiveBlock::None | LiveBlock::Thinking { .. } | LiveBlock::Writing { .. }, _) => "",
        };
        if before.len() + piece.len() > MAX_PARTIAL_BYTES {
            self.block = LiveBlock::Cut { of: kind };
            return;
        }
        let text = format!("{before}{piece}");
        // Reasoning shows from its start ("thinking …"); a reply only once it has text.
        if kind == BlockKind::Writing && text.is_empty() {
            return;
        }
        self.block = match kind {
            BlockKind::Thinking => LiveBlock::Thinking { text },
            BlockKind::Writing => LiveBlock::Writing { text },
        };
    }

    /// What an attaching app shows as live; `None` while nothing streamed in this call.
    pub(crate) fn replay(&self, tab: &str) -> Option<Event> {
        if self.block == LiveBlock::None && self.chars == 0 {
            return None;
        }
        Some(Event::StreamReplay { tab: tab.to_string(), message_id: self.message_id.clone(), chars: self.chars, block: self.block.clone() })
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use serde_json::{json, Value};

    use super::*;

    /// Shared with `src/utils/__tests__/liveStream.spec.ts`: the app folds the same events.
    const FIXTURE: &str = include_str!("../tests/fixtures/stream_replay.json");

    #[derive(Deserialize)]
    struct Case {
        name: String,
        events: Vec<Value>,
        replay: Value,
    }

    fn stream(inner: Value) -> Value {
        json!({ "type": "stream_event", "parent_tool_use_id": null, "event": inner })
    }

    fn text_delta(text: &str) -> Value {
        stream(json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": text } }))
    }

    fn replayed(partial: &PartialReply) -> Value {
        serde_json::to_value(partial.replay("t1")).unwrap()
    }

    #[test]
    fn replays_what_the_app_folds_from_the_same_events() {
        let cases: Vec<Case> = serde_json::from_str(FIXTURE).unwrap();
        for case in cases {
            let mut partial = PartialReply::default();
            for event in &case.events {
                if event["type"] == "assistant" {
                    partial.finish_block();
                } else {
                    partial.observe(event);
                }
            }
            assert_eq!(replayed(&partial), case.replay, "{}", case.name);
        }
    }

    #[test]
    fn replays_nothing_after_an_interrupted_turn() {
        let mut partial = PartialReply::default();
        partial.observe(&stream(json!({ "type": "message_start", "message": { "id": "msg_1" } })));
        partial.observe(&text_delta("Hal"));
        partial.observe(&json!({ "type": "result", "subtype": "error_during_execution", "is_error": true }));
        assert!(partial.replay("t1").is_none());
    }

    #[test]
    fn marks_a_block_past_the_limit_as_cut_until_the_next_block() {
        let mut partial = PartialReply::default();
        partial.observe(&stream(json!({ "type": "message_start", "message": { "id": "msg_1" } })));
        partial.observe(&text_delta(&"x".repeat(MAX_PARTIAL_BYTES)));
        assert_eq!(replayed(&partial)["block"]["kind"], "writing");
        partial.observe(&text_delta("y"));
        let chars = MAX_PARTIAL_BYTES as u64 + 1;
        assert_eq!(replayed(&partial), json!({ "type": "stream_replay", "tab": "t1", "message_id": "msg_1",
            "chars": chars, "block": { "kind": "cut", "of": "writing" } }));

        partial.finish_block();
        partial.observe(&text_delta("neu"));
        assert_eq!(replayed(&partial)["block"], json!({ "kind": "writing", "text": "neu" }));
    }
}
