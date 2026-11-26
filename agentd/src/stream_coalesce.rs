//! Claude streams every token as its own `content_block_delta`, hundreds per second. Each event
//! that reaches the app costs it a script evaluation (WKWebView on macOS), so consecutive pieces
//! of one block go out as one event of the same shape, its string the pieces joined. Old apps, the
//! phone bridge and other machines read it like any delta.

use std::time::{Duration, Instant};

use serde_json::Value;

/// How long a merged delta waits for more pieces: short enough that the text still flows, long
/// enough to fold the tokens of a fast stream into a few events per frame.
pub(crate) const MERGE_WINDOW: Duration = Duration::from_millis(30);

/// The field holding the streamed string, per delta type. Any other type (`signature_delta`)
/// carries no piece to join and never merges.
fn piece_field(delta_type: &str) -> Option<&'static str> {
    match delta_type {
        "text_delta" => Some("text"),
        "thinking_delta" => Some("thinking"),
        "input_json_delta" => Some("partial_json"),
        _ => None,
    }
}

/// A piece of a subagent's stream: the app shows it nowhere (`isSubagentStream`), so it is not sent.
pub(crate) fn is_subagent_stream(event: &Value) -> bool {
    event["type"] == "stream_event" && !event["parent_tool_use_id"].is_null()
}

/// What two deltas must share to merge: the block they belong to and the field they append to.
fn merge_key(event: &Value) -> Option<(u64, &'static str)> {
    if event["type"] != "stream_event" || !event["parent_tool_use_id"].is_null() {
        return None;
    }
    let inner = &event["event"];
    if inner["type"] != "content_block_delta" {
        return None;
    }
    let field = piece_field(inner["delta"]["type"].as_str()?)?;
    if !inner["delta"][field].is_string() {
        return None;
    }
    Some((inner["index"].as_u64()?, field))
}

/// Appends the piece of `next` to `pending`; both must share a `merge_key`.
fn append_piece(pending: &mut Value, next: &Value, field: &str) {
    let piece = next["event"]["delta"][field].as_str().unwrap_or_default();
    if let Some(Value::String(text)) = pending.pointer_mut(&format!("/event/delta/{field}")) {
        text.push_str(piece);
    }
}

/// The one delta of a tab still collecting pieces. Lines pass through in Claude's order: anything
/// that cannot join it sends it on first.
#[derive(Debug, Default)]
pub(crate) struct Coalescer {
    pending: Option<(Value, Instant)>,
}

impl Coalescer {
    /// When the waiting delta has to go out even if Claude writes nothing more.
    pub(crate) fn due(&self) -> Option<Instant> {
        self.pending.as_ref().map(|(_, due)| *due)
    }

    /// The waiting delta, to be handled now.
    pub(crate) fn flush(&mut self) -> Option<Value> {
        self.pending.take().map(|(event, _)| event)
    }

    /// Takes Claude's next line and returns the lines to handle now, in order: the waiting delta
    /// it sent on, then the line itself unless it waits in turn.
    pub(crate) fn push(&mut self, event: Value, now: Instant) -> impl Iterator<Item = Value> {
        self.take(event, now).into_iter().flatten()
    }

    fn take(&mut self, event: Value, now: Instant) -> [Option<Value>; 2] {
        // Whatever comes next: a steady stream of lines must not hold the reply past its window.
        let overdue = if self.due().is_some_and(|due| now >= due) { self.flush() } else { None };
        // Never sent, so it cannot reorder anything; a subagent streaming beside the reply must
        // not cut the reply's merge short.
        if is_subagent_stream(&event) {
            return [overdue, Some(event)];
        }
        let Some(key) = merge_key(&event) else {
            return [overdue.or_else(|| self.flush()), Some(event)];
        };
        if let Some((pending, _)) = &mut self.pending {
            if merge_key(pending) == Some(key) {
                append_piece(pending, &event, key.1);
                return [None, None];
            }
        }
        let flushed = overdue.or_else(|| self.flush());
        self.pending = Some((event, now + MERGE_WINDOW));
        [flushed, None]
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use serde_json::json;

    use super::*;
    use crate::partial_reply::PartialReply;

    fn stream(parent: Value, inner: Value) -> Value {
        json!({ "type": "stream_event", "uuid": "u1", "parent_tool_use_id": parent, "event": inner })
    }

    fn delta(index: u64, delta: Value) -> Value {
        stream(Value::Null, json!({ "type": "content_block_delta", "index": index, "delta": delta }))
    }

    fn text(index: u64, text: &str) -> Value {
        delta(index, json!({ "type": "text_delta", "text": text }))
    }

    /// Every line through one coalescer, all within the window, then the rest flushed as at EOF.
    fn coalesced(events: &[Value]) -> Vec<Value> {
        let mut coalescer = Coalescer::default();
        let now = Instant::now();
        let mut out: Vec<Value> = events.iter().flat_map(|event| coalescer.push(event.clone(), now).collect::<Vec<_>>()).collect();
        out.extend(coalescer.flush());
        out
    }

    #[test]
    fn joins_consecutive_pieces_of_one_block_into_one_event() {
        assert_eq!(coalesced(&[text(1, "Hal"), text(1, "lo "), text(1, "Welt")]), vec![text(1, "Hallo Welt")]);
    }

    #[test]
    fn joins_reasoning_and_tool_input_in_their_own_field() {
        let thinking = |piece: &str| delta(0, json!({ "type": "thinking_delta", "thinking": piece }));
        let input = |piece: &str| delta(2, json!({ "type": "input_json_delta", "partial_json": piece }));
        let events = [thinking("Erst "), thinking("lesen."), input("{\"file\":"), input("\"a\"}")];
        assert_eq!(coalesced(&events), vec![thinking("Erst lesen."), input("{\"file\":\"a\"}")]);
    }

    #[test]
    fn keeps_pieces_of_another_block_or_type_apart() {
        let thinking = delta(1, json!({ "type": "thinking_delta", "thinking": "hm" }));
        let events = [text(0, "a"), text(1, "b"), thinking.clone(), text(1, "c")];
        assert_eq!(coalesced(&events), vec![text(0, "a"), text(1, "b"), thinking, text(1, "c")]);
    }

    #[test]
    fn sends_the_waiting_delta_before_any_other_line() {
        let signature = delta(0, json!({ "type": "signature_delta", "signature": "sig" }));
        let stop = stream(Value::Null, json!({ "type": "content_block_stop", "index": 0 }));
        let message = json!({ "type": "assistant", "message": { "role": "assistant", "content": [] } });
        let events = [text(0, "a"), signature.clone(), signature.clone(), text(0, "b"), stop.clone(), text(0, "c"), message.clone()];
        assert_eq!(coalesced(&events), vec![text(0, "a"), signature.clone(), signature, text(0, "b"), stop, text(0, "c"), message]);
    }

    #[test]
    fn passes_a_subagent_piece_without_cutting_the_reply_short() {
        let subagent = stream(
            json!("toolu_1"),
            json!({ "type": "content_block_delta", "index": 0,
            "delta": { "type": "text_delta", "text": "intern" } }),
        );
        assert!(is_subagent_stream(&subagent));
        assert!(!is_subagent_stream(&text(0, "a")));
        assert_eq!(coalesced(&[text(0, "Hal"), subagent.clone(), text(0, "lo")]), vec![subagent, text(0, "Hallo")]);
    }

    #[test]
    fn starts_a_new_event_once_the_window_has_passed() {
        let mut coalescer = Coalescer::default();
        let start = Instant::now();
        assert_eq!(coalescer.push(text(0, "Hal"), start).count(), 0);
        assert_eq!(coalescer.due(), Some(start + MERGE_WINDOW));
        assert_eq!(coalescer.push(text(0, "lo "), start + MERGE_WINDOW / 2).count(), 0);
        let sent: Vec<Value> = coalescer.push(text(0, "Welt"), start + MERGE_WINDOW).collect();
        assert_eq!(sent, vec![text(0, "Hallo ")]);
        assert_eq!(coalescer.flush(), Some(text(0, "Welt")));
        assert_eq!(coalescer.due(), None);
    }

    #[test]
    fn sends_an_overdue_delta_before_a_subagent_piece() {
        let subagent = stream(
            json!("toolu_1"),
            json!({ "type": "content_block_delta", "index": 0,
            "delta": { "type": "text_delta", "text": "intern" } }),
        );
        let mut coalescer = Coalescer::default();
        let start = Instant::now();
        assert_eq!(coalescer.push(text(0, "Hal"), start).count(), 0);
        let early: Vec<Value> = coalescer.push(subagent.clone(), start + MERGE_WINDOW / 2).collect();
        assert_eq!(early, vec![subagent.clone()]);
        let late: Vec<Value> = coalescer.push(subagent.clone(), start + MERGE_WINDOW).collect();
        assert_eq!(late, vec![text(0, "Hal"), subagent]);
        assert_eq!(coalescer.due(), None);
    }

    #[derive(Deserialize)]
    struct Case {
        name: String,
        events: Vec<Value>,
    }

    fn replay_of(events: &[Value]) -> Option<crate::protocol::Event> {
        let mut partial = PartialReply::default();
        for event in events {
            if event["type"] == "assistant" {
                partial.finish_block();
            } else {
                partial.observe(event);
            }
        }
        partial.replay("t1")
    }

    /// The app's live state and the replay must not tell merged events from single ones.
    #[test]
    fn folds_to_the_same_replay_as_the_single_pieces() {
        let cases: Vec<Case> = serde_json::from_str(include_str!("../tests/fixtures/stream_replay.json")).unwrap();
        for case in cases {
            let single = serde_json::to_value(replay_of(&case.events)).unwrap();
            let merged = serde_json::to_value(replay_of(&coalesced(&case.events))).unwrap();
            assert_eq!(merged, single, "{}", case.name);
        }
    }
}
