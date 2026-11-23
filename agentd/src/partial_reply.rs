//! What Claude has streamed of the reply it is writing right now, so an app that attaches mid-turn
//! sees the half-written text instead of nothing until the message is complete. Claude Code sends
//! each finished content block as an `assistant` message, which the transcript holds too; this
//! keeps only what came after the last one. It mirrors what the app derives from the same events
//! (`withStream` in `src/utils/chatTab.ts`), so the replay can replace the app's state outright.

use serde_json::Value;

use crate::protocol::Event;

/// Text plus reasoning kept per tab. A reply rarely streams more than a few hundred KB before its
/// block completes; past this the text is dropped and the replay tells the app the block is cut,
/// so it shows nothing of it until the finished message instead of a reply that starts mid-way.
pub(crate) const MAX_PARTIAL_BYTES: usize = 1024 * 1024;

#[derive(Debug, Default)]
pub(crate) struct PartialReply {
    /// Of the API call being streamed, from its `message_start`
    message_id: Option<String>,
    /// Characters streamed in this call (text, reasoning, tool input), for the app's token estimate
    chars: u64,
    text: String,
    /// `None` while Claude is not thinking, as in the app
    thinking: Option<String>,
    /// More than `MAX_PARTIAL_BYTES` came since the last finished block
    is_overflowed: bool,
}

impl PartialReply {
    /// A raw Claude event, one that `chat::message_from` did not turn into a message.
    pub(crate) fn observe(&mut self, event: &Value) {
        match event["type"].as_str() {
            // A subagent streams too; the app shows its text inside the Agent call, not here.
            Some("stream_event") if event["parent_tool_use_id"].is_null() => self.observe_stream(&event["event"]),
            Some("result") => self.finish_block(),
            // `/clear` empties the chat, the app's token estimate with it.
            Some("conversation_reset") => *self = Self::default(),
            _ => {}
        }
    }

    /// Claude sent a finished assistant message: what streamed so far is in it now.
    pub(crate) fn finish_block(&mut self) {
        self.text.clear();
        self.thinking = None;
        self.is_overflowed = false;
    }

    fn observe_stream(&mut self, inner: &Value) {
        match inner["type"].as_str() {
            Some("message_start") => {
                *self = Self { message_id: inner["message"]["id"].as_str().map(str::to_string), ..Self::default() };
            }
            Some("content_block_start") if inner["content_block"]["type"] == "thinking" => self.thinking = Some(String::new()),
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
        let is_text = match delta["type"].as_str() {
            Some("text_delta") => true,
            Some("thinking_delta") => false,
            _ => return,
        };
        let kept = self.text.len() + self.thinking.as_ref().map_or(0, String::len);
        if self.is_overflowed || kept + piece.len() > MAX_PARTIAL_BYTES {
            self.is_overflowed = true;
            self.text = String::new();
            self.thinking = None;
            return;
        }
        let target = if is_text { &mut self.text } else { self.thinking.get_or_insert_with(String::new) };
        target.push_str(piece);
    }

    /// What an attaching app shows as live text. Past the limit it carries no text but `is_truncated`.
    pub(crate) fn replay(&self, tab: &str) -> Option<Event> {
        Some(Event::Streaming {
            tab: tab.to_string(),
            message_id: self.message_id.clone(),
            chars: self.chars,
            text: self.text.clone(),
            thinking: self.thinking.clone(),
            is_truncated: self.is_overflowed,
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    fn stream(inner: Value) -> Value {
        json!({ "type": "stream_event", "parent_tool_use_id": null, "event": inner })
    }

    fn text_delta(text: &str) -> Value {
        stream(json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": text } }))
    }

    fn replayed(partial: &PartialReply) -> Value {
        serde_json::to_value(partial.replay("t1").expect("a replay")).unwrap()
    }

    #[test]
    fn keeps_reasoning_and_text_of_the_running_call() {
        let mut partial = PartialReply::default();
        partial.observe(&stream(json!({ "type": "message_start", "message": { "id": "msg_1" } })));
        partial.observe(&stream(json!({ "type": "content_block_start", "index": 0, "content_block": { "type": "thinking" } })));
        partial.observe(&stream(json!({ "type": "content_block_delta", "index": 0, "delta": { "type": "thinking_delta", "thinking": "Erst lesen." } })));
        partial.observe(&text_delta("Hal"));
        partial.observe(&text_delta("lo"));

        assert_eq!(replayed(&partial), json!({ "type": "streaming", "tab": "t1", "message_id": "msg_1",
            "chars": 16, "text": "Hallo", "thinking": "Erst lesen.", "is_truncated": false }));
    }

    #[test]
    fn forgets_the_text_once_its_message_or_the_result_came() {
        let mut partial = PartialReply::default();
        partial.observe(&stream(json!({ "type": "message_start", "message": { "id": "msg_1" } })));
        partial.observe(&text_delta("Hallo"));
        partial.finish_block();
        partial.observe(&text_delta("Welt"));
        assert_eq!(replayed(&partial)["text"], "Welt");

        partial.observe(&json!({ "type": "result", "subtype": "success" }));
        assert_eq!((replayed(&partial)["text"].clone(), replayed(&partial)["chars"].clone()), (json!(""), json!(9)));
    }

    #[test]
    fn leaves_out_what_a_subagent_streams() {
        let mut partial = PartialReply::default();
        let mut delta = text_delta("inside the Agent call");
        delta["parent_tool_use_id"] = json!("toolu_1");
        partial.observe(&delta);
        assert_eq!(replayed(&partial)["text"], "");
    }

    #[test]
    fn marks_a_block_past_the_limit_as_cut_until_the_next_block() {
        let mut partial = PartialReply::default();
        partial.observe(&stream(json!({ "type": "message_start", "message": { "id": "msg_1" } })));
        partial.observe(&text_delta(&"x".repeat(MAX_PARTIAL_BYTES)));
        assert_eq!(replayed(&partial)["is_truncated"], false);
        partial.observe(&text_delta("y"));
        let chars = MAX_PARTIAL_BYTES as u64 + 1;
        assert_eq!(replayed(&partial), json!({ "type": "streaming", "tab": "t1", "message_id": "msg_1",
            "chars": chars, "text": "", "thinking": null, "is_truncated": true }));

        partial.finish_block();
        partial.observe(&text_delta("neu"));
        assert_eq!((replayed(&partial)["text"].clone(), replayed(&partial)["is_truncated"].clone()), (json!("neu"), json!(false)));
    }
}
