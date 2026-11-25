//! What a chat's worktree is called: `feat/<topic>` in `<repo>-<topic>`, the topic taken from the
//! chat's first prompt.

use std::path::{Path, PathBuf};

use super::git_cmd::exists;
use super::WorktreeError;

const BRANCH_PREFIX: &str = "feat/";
/// The folder beside the parent folder of the repository: `dev/projects/x` → `dev/worktrees`.
const WORKTREES_DIR: &str = "worktrees";
/// A slug of a few words reads as a topic; a whole prompt would make an unusable folder name.
const MAX_SLUG_CHARS: usize = 40;
const MAX_SLUG_WORDS: usize = 5;
/// `feat/x-2` … before giving up on a name that is taken again and again.
const MAX_NAME_TRIES: usize = 99;
const SHORT_ID_CHARS: usize = 6;
/// Filler of a first prompt ("kannst du bitte …", "please add a …") that says nothing about the topic.
const FILLER_WORDS: [&str; 34] = [
    "a", "an", "and", "the", "to", "of", "for", "in", "on", "please", "can", "you", "could", "i", "we",
    "kannst", "du", "bitte", "mal", "ich", "wir", "der", "die", "das", "den", "dem", "ein", "eine", "einen",
    "und", "mit", "im", "zu", "um",
];

/// A branch name from the first words that carry meaning: `feat/kalender-wochenansicht`. Without
/// any (a prompt of only images or symbols) a short random id stands in.
pub fn slug_of(hint: &str) -> String {
    let folded: String = hint
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'ä' => "ae".to_string(),
            'ö' => "oe".to_string(),
            'ü' => "ue".to_string(),
            'ß' => "ss".to_string(),
            c if c.is_ascii_alphanumeric() => c.to_string(),
            _ => " ".to_string(),
        })
        .collect();
    let mut slug = String::new();
    for word in folded.split_whitespace().filter(|word| !FILLER_WORDS.contains(word)).take(MAX_SLUG_WORDS) {
        if !slug.is_empty() && slug.len() + 1 + word.len() > MAX_SLUG_CHARS {
            break;
        }
        if !slug.is_empty() {
            slug.push('-');
        }
        slug.push_str(word);
    }
    slug.truncate(MAX_SLUG_CHARS);
    if slug.is_empty() {
        let id = uuid::Uuid::new_v4().simple().to_string();
        return format!("chat-{}", &id[..SHORT_ID_CHARS]);
    }
    slug
}

pub(super) fn default_root(main: &Path) -> PathBuf {
    let projects = main.parent().unwrap_or(main);
    projects.parent().unwrap_or(projects).join(WORKTREES_DIR)
}

/// The first branch and folder that are both still free: `feat/x`, `feat/x-2`, …
pub(super) fn free_name(main: &Path, root: &Path, repo: &str, slug: &str) -> Result<(String, PathBuf), WorktreeError> {
    for attempt in 1..=MAX_NAME_TRIES {
        let name = if attempt == 1 { slug.to_string() } else { format!("{slug}-{attempt}") };
        let branch = format!("{BRANCH_PREFIX}{name}");
        let path = root.join(format!("{repo}-{name}"));
        if !path.exists() && !exists(main, &format!("refs/heads/{branch}")) {
            return Ok((branch, path));
        }
    }
    Err(WorktreeError::NoFreeName(slug.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_keep_the_words_that_carry_the_topic() {
        assert_eq!(slug_of("Kannst du bitte den Kalender um eine Wochenansicht erweitern?"), "kalender-wochenansicht-erweitern");
        assert_eq!(slug_of("Fix the login: Größe & Ölfarbe"), "fix-login-groesse-oelfarbe");
    }

    #[test]
    fn a_slug_stays_short() {
        let slug = slug_of("one two three four five six seven eight");
        assert_eq!(slug, "one-two-three-four-five");
        assert!(slug_of(&"x".repeat(80)).len() <= MAX_SLUG_CHARS);
    }

    #[test]
    fn a_prompt_without_words_gets_a_short_id() {
        let slug = slug_of("🙂 ?!");
        assert!(slug.starts_with("chat-") && slug.len() == "chat-".len() + SHORT_ID_CHARS, "{slug}");
    }
}
