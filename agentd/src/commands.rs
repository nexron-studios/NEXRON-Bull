//! The slash commands and skills Claude Code offers in a session, for the app's command menu.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SlashCommand {
    /// Without the slash: `compact`, `code-review`, `engineering:debug`.
    pub name: String,
    /// Claude Code ends a custom command's or skill's description with where it comes from,
    /// e.g. "(user)"; the app reads that to group the menu.
    pub description: String,
    /// What the command takes, e.g. "<optional custom summarization instructions>"; often empty.
    pub argument_hint: String,
}

/// The commands in Claude's answer to `initialize` or in a later `commands_changed` notice (a
/// skill added on disk); `None` for every other line.
pub fn commands_in(event: &Value) -> Option<Vec<SlashCommand>> {
    let list = match event["type"].as_str()? {
        "control_response" => event["response"]["response"].get("commands")?,
        "system" if event["subtype"] == "commands_changed" => event.get("commands")?,
        _ => return None,
    };
    Some(list.as_array()?.iter().filter_map(command_of).collect())
}

fn command_of(item: &Value) -> Option<SlashCommand> {
    let name = item.get("name")?.as_str()?.trim_start_matches('/');
    if name.is_empty() {
        return None;
    }
    let text = |key: &str| item.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
    Some(SlashCommand { name: name.to_string(), description: text("description"), argument_hint: text("argumentHint") })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_the_commands_of_the_initialize_answer() {
        let answer = json!({ "type": "control_response", "response": { "subtype": "success", "request_id": "agentd-1",
            "response": { "commands": [
                { "name": "compact", "description": "Free up context", "argumentHint": "<instructions>" },
                { "name": "commit", "description": "Commit staged changes (user)" },
                { "name": "", "description": "nameless" }
            ], "models": [] } } });
        assert_eq!(commands_in(&answer), Some(vec![
            SlashCommand { name: "compact".into(), description: "Free up context".into(), argument_hint: "<instructions>".into() },
            SlashCommand { name: "commit".into(), description: "Commit staged changes (user)".into(), argument_hint: "".into() },
        ]));
    }

    #[test]
    fn reads_a_changed_list_and_ignores_other_lines() {
        let changed = json!({ "type": "system", "subtype": "commands_changed", "commands": [{ "name": "/review", "description": "" }] });
        assert_eq!(commands_in(&changed).map(|list| list[0].name.clone()), Some("review".into()));
        let permission = json!({ "type": "control_response", "response": { "response": { "behavior": "allow" } } });
        assert_eq!(commands_in(&permission), None);
        assert_eq!(commands_in(&json!({ "type": "system", "subtype": "init" })), None);
    }
}
