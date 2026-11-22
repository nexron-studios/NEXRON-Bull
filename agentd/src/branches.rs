//! Which transcript lines a later prompt left behind. Claude Code never deletes from a
//! transcript: going back (`/rewind`, `rewind_conversation`, a prompt sent again after Esc) starts
//! a new branch beside the old one, and on resume it loads only the branch that ends at the
//! newest leaf. The chat must show that branch too, or a rewound turn comes back after a reload.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

/// Lines that belong to the conversation tree; the rest (snapshots, queue and cost records,
/// `last-prompt`) carry no `parentUuid` of their own.
const TREE_TYPES: [&str; 5] = ["user", "assistant", "attachment", "system", "progress"];
const LAST_PROMPT: &str = "last-prompt";

/// The uuids of every line on a branch the conversation no longer follows.
///
/// A branch counts as left behind only where it starts with a typed prompt beside the kept path.
/// Parallel tool calls branch too (each result hangs off its own call), but those results are
/// part of the conversation and stay.
pub fn abandoned(lines: &[Value]) -> HashSet<String> {
    let tree = Tree::of(lines);
    let kept = tree.kept_path();
    let is_on_kept = |parent: &Option<String>| match parent {
        Some(parent) => kept.uuids.contains(parent),
        // Without a parent the line starts the conversation; a prompt there was replaced only
        // when the kept path reaches the start too (it may end at a line missing from the file).
        None => kept.reaches_start,
    };
    let mut cut = HashSet::new();
    for line in lines {
        let Some(uuid) = tree_uuid(line) else { continue };
        if kept.uuids.contains(uuid) || !is_typed_prompt(line) || !is_on_kept(&parent_of(line)) {
            continue;
        }
        tree.collect_below(uuid, &mut cut);
    }
    cut
}

struct Tree<'a> {
    parents: HashMap<&'a str, Option<String>>,
    children: HashMap<String, Vec<&'a str>>,
    leaf: Option<String>,
}

struct KeptPath {
    uuids: HashSet<String>,
    /// The walk from the leaf ended at a line without parent, not at one the file lacks.
    reaches_start: bool,
}

impl<'a> Tree<'a> {
    fn of(lines: &'a [Value]) -> Self {
        let mut tree = Tree { parents: HashMap::new(), children: HashMap::new(), leaf: None };
        for line in lines {
            // The newest of: the last line written, or the leaf a rewind named after it.
            if line["type"] == LAST_PROMPT {
                tree.leaf = line["leafUuid"].as_str().map(str::to_string);
                continue;
            }
            let Some(uuid) = tree_uuid(line) else { continue };
            let parent = parent_of(line);
            if let Some(parent) = &parent {
                tree.children.entry(parent.clone()).or_default().push(uuid);
            }
            tree.parents.insert(uuid, parent);
            tree.leaf = Some(uuid.to_string());
        }
        tree
    }

    fn kept_path(&self) -> KeptPath {
        let mut uuids = HashSet::new();
        let mut current = self.leaf.clone();
        while let Some(uuid) = current {
            if !uuids.insert(uuid.clone()) {
                break;
            }
            match self.parents.get(uuid.as_str()) {
                Some(parent) => current = parent.clone(),
                None => return KeptPath { uuids, reaches_start: false },
            }
        }
        KeptPath { uuids, reaches_start: true }
    }

    fn collect_below(&self, root: &str, cut: &mut HashSet<String>) {
        let mut stack = vec![root.to_string()];
        while let Some(uuid) = stack.pop() {
            if let Some(children) = self.children.get(&uuid) {
                stack.extend(children.iter().map(|child| child.to_string()));
            }
            cut.insert(uuid);
        }
    }
}

/// A line without `parentUuid` at all (not even `null`) says nothing about the tree and is kept.
fn tree_uuid(line: &Value) -> Option<&str> {
    let kind = line["type"].as_str()?;
    if !TREE_TYPES.contains(&kind) || line["isSidechain"] == true || line.get("parentUuid").is_none() {
        return None;
    }
    line["uuid"].as_str()
}

/// A compaction starts a new root and keeps its link to the old one as `logicalParentUuid`.
fn parent_of(line: &Value) -> Option<String> {
    ["parentUuid", "logicalParentUuid"].iter().find_map(|key| line[*key].as_str()).map(str::to_string)
}

/// Something the user sent, as opposed to a tool result or a line Claude Code added.
pub fn is_typed_prompt(line: &Value) -> bool {
    if line["type"] != "user" || line["isMeta"] == true || line["isCompactSummary"] == true {
        return false;
    }
    match &line["message"]["content"] {
        Value::String(_) => true,
        Value::Array(items) => !items.iter().any(|item| item["type"] == "tool_result"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn prompt(uuid: &str, parent: Option<&str>, text: &str) -> Value {
        json!({ "type": "user", "uuid": uuid, "parentUuid": parent, "message": { "role": "user", "content": [{ "type": "text", "text": text }] } })
    }

    fn reply(uuid: &str, parent: &str) -> Value {
        json!({ "type": "assistant", "uuid": uuid, "parentUuid": parent, "message": { "role": "assistant", "content": [{ "type": "text", "text": "ok" }] } })
    }

    fn tool_result(uuid: &str, parent: &str) -> Value {
        json!({ "type": "user", "uuid": uuid, "parentUuid": parent, "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t" }] } })
    }

    fn sorted(set: HashSet<String>) -> Vec<String> {
        let mut uuids: Vec<String> = set.into_iter().collect();
        uuids.sort();
        uuids
    }

    #[test]
    fn a_rewind_leaves_the_cut_prompt_and_its_turn_behind() {
        let lines = vec![
            prompt("p1", None, "one"),
            reply("a1", "p1"),
            prompt("p2", Some("a1"), "two"),
            reply("a2", "p2"),
            json!({ "type": "last-prompt", "leafUuid": "a1", "rewound": true, "cutUuid": "p2" }),
        ];
        assert_eq!(sorted(abandoned(&lines)), ["a2", "p2"]);
    }

    #[test]
    fn the_prompt_sent_after_a_rewind_replaces_the_old_branch() {
        let lines = vec![
            prompt("p1", None, "one"),
            reply("a1", "p1"),
            prompt("p2", Some("a1"), "two"),
            reply("a2", "p2"),
            prompt("p3", Some("a1"), "three"),
            reply("a3", "p3"),
        ];
        assert_eq!(sorted(abandoned(&lines)), ["a2", "p2"]);
    }

    #[test]
    fn parallel_tool_results_stay() {
        let lines = vec![
            prompt("p1", None, "go"),
            reply("call1", "p1"),
            reply("call2", "call1"),
            tool_result("r1", "call1"),
            tool_result("r2", "call2"),
            reply("a1", "r2"),
        ];
        assert!(abandoned(&lines).is_empty());
    }

    #[test]
    fn rewinding_to_the_first_prompt_leaves_everything_behind() {
        let lines = vec![
            prompt("p1", None, "one"),
            reply("a1", "p1"),
            json!({ "type": "last-prompt", "leafUuid": null, "rewound": true, "cutUuid": "p1" }),
        ];
        assert_eq!(sorted(abandoned(&lines)), ["a1", "p1"]);
    }

    #[test]
    fn a_broken_path_never_drops_the_start() {
        // The leaf's parent is missing from the file: nothing before it can be judged.
        let lines = vec![prompt("p1", None, "one"), reply("a1", "p1"), reply("a2", "gone")];
        assert!(abandoned(&lines).is_empty());
    }

    #[test]
    fn a_compaction_keeps_the_path_through_its_logical_parent() {
        let lines = vec![
            prompt("p1", None, "one"),
            reply("a1", "p1"),
            json!({ "type": "system", "subtype": "compact_boundary", "uuid": "c1", "parentUuid": null, "logicalParentUuid": "a1" }),
            prompt("p2", Some("c1"), "two"),
        ];
        assert!(abandoned(&lines).is_empty());
    }
}
