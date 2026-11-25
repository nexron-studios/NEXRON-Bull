//! Finding the `claude` binary and building its headless command line.

use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock, PoisonError};

use crate::claude_copy;
use crate::paths;
use crate::protocol::StartParams;

/// Overrides the lookup, e.g. for tests or an unusual install.
const CLAUDE_OVERRIDE_VAR: &str = "AGENTD_CLAUDE";
const CONFIG_DIR_VAR: &str = "CLAUDE_CONFIG_DIR";
const TODO_TOOLS_VAR: &str = "CLAUDE_CODE_ENABLE_TODO_TOOLS";
/// Headless Claude Code backs up files before a turn changes them only with this set; without
/// the backups `rewind_files` has nothing to go back to.
const CHECKPOINTING_VAR: &str = "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING";
const AUTOUPDATER_OFF_VAR: &str = "DISABLE_AUTOUPDATER";
/// The oldest Claude Code verified to know each newer flag; an older one exits with "unknown
/// option", which would end every tab on that machine.
const THINKING_DISPLAY_SINCE: [u32; 3] = [2, 1, 325];
const HOOK_EVENTS_SINCE: [u32; 3] = [2, 1, 327];
/// Variables of the environment agentd was started from that must not reach Claude.
const INHERITED_PREFIXES: [&str; 2] = ["CLAUDE", "HERDR_"];
/// How much of the session id a chat's name carries, see `chat_name`.
const CHAT_NAME_ID_LENGTH: usize = 4;

#[derive(Debug, thiserror::Error)]
pub enum ClaudeError {
    #[error("claude not found on PATH (set {CLAUDE_OVERRIDE_VAR} to its full path)")]
    NotFound,
}

/// The exe a new tab runs: an override as it is, otherwise a copy of the install, see `claude_copy`.
pub fn find_claude() -> Result<PathBuf, ClaudeError> {
    if let Some(path) = env::var_os(CLAUDE_OVERRIDE_VAR) {
        return Ok(PathBuf::from(path));
    }
    let path = env::var_os("PATH").ok_or(ClaudeError::NotFound)?;
    let installed = env::split_paths(&path).find_map(|dir| claude_in(&dir)).ok_or(ClaudeError::NotFound)?;
    Ok(claude_copy::runnable(&installed))
}

/// The npm install on Windows puts a `claude.cmd` shim on PATH; the real
/// binary sits in node_modules next to it. Running the .exe directly keeps
/// `cmd` (and its quoting) out of the pipe.
fn claude_in(dir: &Path) -> Option<PathBuf> {
    let exe = dir.join(if cfg!(windows) { "claude.exe" } else { "claude" });
    if exe.is_file() {
        return Some(exe);
    }
    let npm_exe = dir.join("node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    (cfg!(windows) && dir.join("claude.cmd").is_file() && npm_exe.is_file()).then_some(npm_exe)
}

/// Which newer flags the installed Claude Code takes. Without `--thinking-display summarized`
/// headless Claude streams and stores thinking blocks empty (signature only); without
/// `--include-hook-events` it reports no hook but SessionStart and Setup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Generation {
    /// Too old for the flags: thinking shows without text, hooks stay unseen.
    Older,
    ThinkingDisplay,
    HookEvents,
}

/// `claude --version` prints e.g. "2.1.325 (Claude Code)".
pub(crate) fn parse_version(output: &str) -> Option<[u32; 3]> {
    let mut parts = output.split_whitespace().next()?.split('.').map(|part| part.parse().ok());
    Some([parts.next()??, parts.next()??, parts.next()??])
}

pub fn generation_for(version_output: &str) -> Generation {
    match parse_version(version_output) {
        Some(version) if version >= HOOK_EVENTS_SINCE => Generation::HookEvents,
        Some(version) if version >= THINKING_DISPLAY_SINCE => Generation::ThinkingDisplay,
        _ => Generation::Older,
    }
}

/// Asks the binary for its version once per path and agentd process; an update of Claude Code
/// arrives as a new copy under a new path.
pub fn generation_of(program: &Path) -> Generation {
    static KNOWN: OnceLock<Mutex<HashMap<PathBuf, Generation>>> = OnceLock::new();
    let known = KNOWN.get_or_init(Mutex::default);
    if let Some(&generation) = known.lock().unwrap_or_else(PoisonError::into_inner).get(program) {
        return generation;
    }
    let mut probe = Command::new(program);
    probe.arg("--version").stdin(Stdio::null()).stderr(Stdio::null());
    hide_console(&mut probe);
    let output = probe.output().map(|out| String::from_utf8_lossy(&out.stdout).into_owned());
    let generation = generation_for(&output.unwrap_or_default());
    known.lock().unwrap_or_else(PoisonError::into_inner).insert(program.to_path_buf(), generation);
    generation
}

pub fn args(params: &StartParams, session_id: &str, generation: Generation) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
        "--include-partial-messages", "--replay-user-messages", "--permission-prompt-tool", "stdio",
    ]
    .map(String::from)
    .to_vec();
    if generation >= Generation::ThinkingDisplay {
        args.extend(["--thinking-display".into(), "summarized".into()]);
    }
    if generation >= Generation::HookEvents {
        // A hook that blocks something or fails then shows in the chat, as in the terminal.
        args.push("--include-hook-events".into());
    }
    match &params.resume {
        Some(id) => args.extend(["--resume".into(), id.clone()]),
        None => args.extend(["--session-id".into(), session_id.to_string()]),
    }
    // Without it Claude Code derives a new name at every start, resume included. It also replaces
    // a `/rename` from the terminal: one name everywhere (22.11.2026). 2.1.326 is the
    // oldest seen with `--name`, so it rides on the hook-events generation.
    if generation >= Generation::HookEvents {
        args.extend(["--name".into(), chat_name(&params.cwd, session_id)]);
    }
    if let Some(model) = &params.model {
        args.extend(["--model".into(), model.clone()]);
    }
    if let Some(mode) = &params.permission_mode {
        args.extend(["--permission-mode".into(), mode.clone()]);
    }
    if let Some(effort) = &params.effort {
        args.extend(["--effort".into(), effort.clone()]);
    }
    args
}

/// The fixed name of a chat, folder plus the start of its session id (`nexron-chat-1a87`), as the
/// Agent Dashboard and other sessions see it. The app shows the same (`chatNameOf` in
/// `src/utils/sessionList.ts`); the last folder of a Windows or POSIX path, like Claude takes it.
pub fn chat_name(cwd: &Path, session_id: &str) -> String {
    let cwd = cwd.to_string_lossy();
    let folder = cwd.split(['\\', '/']).filter(|part| !part.is_empty()).last().unwrap_or(&cwd);
    let id: String = session_id.chars().take(CHAT_NAME_ID_LENGTH).collect();
    format!("{folder}-{id}")
}

pub fn command(program: &Path, params: &StartParams, session_id: &str, generation: Generation) -> Command {
    let mut command = Command::new(program);
    command
        .args(args(params, session_id, generation))
        .current_dir(&params.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    account_env(&mut command, program, params.profile.as_deref());
    // Headless Claude Code leaves out its task tools; with them Claude keeps a plan the app
    // shows as steps, like the interactive todo list.
    command.env(TODO_TOOLS_VAR, "1");
    command.env(CHECKPOINTING_VAR, "true");
    command
}

/// What every Claude agentd starts needs: a clean environment, the account's profile and no
/// console window. A tab's Claude and the one-shot title call share it.
pub(crate) fn account_env(command: &mut Command, program: &Path, profile: Option<&Path>) {
    scrub_env(command);
    // A copy updating itself would grow a second install beside the real one; the real one
    // updates from the terminal, and the next tab start copies the new version.
    if claude_copy::is_copy(program) {
        command.env(AUTOUPDATER_OFF_VAR, "1");
    }
    // The default profile keeps its .claude.json next to ~/.claude, not inside; pointing
    // CLAUDE_CONFIG_DIR at it would make Claude look inside and start from a blank state.
    if let Some(profile) = profile.filter(|dir| !is_default_profile(dir)) {
        command.env(CONFIG_DIR_VAR, profile);
    }
    hide_console(command);
}

/// agentd may itself run inside a Claude session or a herdr pane. Inherited CLAUDE* variables
/// make a child report to that parent session, HERDR_* ones make herdr's hook claim the
/// parent's pane for it.
pub(crate) fn scrub_env(command: &mut Command) {
    for (key, _) in env::vars_os() {
        let name = key.to_string_lossy();
        if INHERITED_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) {
            command.env_remove(key);
        }
    }
}

fn is_default_profile(dir: &Path) -> bool {
    let Some(home) = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) else {
        return false;
    };
    paths::comparable(dir) == paths::comparable(&PathBuf::from(home).join(".claude"))
}

/// Every child process goes through this; on Windows a console window flashes up otherwise.
#[cfg(windows)]
pub(crate) fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(resume: Option<&str>) -> StartParams {
        StartParams {
            tab: "t1".into(),
            profile: Some(PathBuf::from("/profiles/.claude-work")),
            cwd: PathBuf::from("."),
            resume: resume.map(String::from),
            model: Some("haiku".into()),
            permission_mode: None,
            is_fresh: false,
            effort: None,
            worktree: None,
        }
    }

    #[test]
    fn new_session_gets_the_chosen_id_and_stdio_permissions() {
        let args = args(&params(None), "abc", Generation::HookEvents);
        assert_eq!(args.join(" "), "-p --input-format stream-json --output-format stream-json --verbose \
            --include-partial-messages --replay-user-messages --permission-prompt-tool stdio \
            --thinking-display summarized --include-hook-events --session-id abc --name .-abc --model haiku");
    }

    #[test]
    fn a_chat_is_named_after_its_folder_and_session_id() {
        let id = "1a875471-77b0-4d2e-9a41-0c5be1f0d6a2";
        assert_eq!(chat_name(Path::new(r"C:\me\dev\projects\nexron-chat\"), id), "nexron-chat-1a87");
        assert_eq!(chat_name(Path::new(r"C:\me"), id), "me-1a87");
        assert_eq!(chat_name(Path::new("/home/alex/reels"), id), "reels-1a87");
    }

    #[test]
    fn a_resumed_chat_keeps_the_name_of_its_session() {
        let start = StartParams { cwd: PathBuf::from(r"C:\me"), ..params(Some("1a875471-77b0")) };
        let args = args(&start, "1a875471-77b0", Generation::HookEvents);
        assert!(args.windows(2).any(|pair| pair == ["--name", "me-1a87"]));
    }

    #[test]
    fn a_chosen_effort_goes_on_the_command_line() {
        let start = StartParams { effort: Some("max".into()), ..params(None) };
        let args = args(&start, "abc", Generation::Older);
        assert!(args.windows(2).any(|pair| pair == ["--effort", "max"]));
    }

    #[test]
    fn older_claude_starts_without_the_newer_flags() {
        let args = args(&params(None), "abc", Generation::Older);
        assert!(!args.contains(&"--thinking-display".to_string()));
        assert!(!args.contains(&"--include-hook-events".to_string()));
        let thinking_only = super::args(&params(None), "abc", Generation::ThinkingDisplay);
        assert!(thinking_only.contains(&"--thinking-display".to_string()));
        assert!(!thinking_only.contains(&"--include-hook-events".to_string()));
        assert!(!thinking_only.contains(&"--name".to_string()));
    }

    #[test]
    fn newer_flags_need_a_verified_version() {
        assert_eq!(generation_for("2.1.327 (Claude Code)"), Generation::HookEvents);
        assert_eq!(generation_for("2.2.0 (Claude Code)"), Generation::HookEvents);
        assert_eq!(generation_for("2.1.326 (Claude Code)"), Generation::ThinkingDisplay);
        assert_eq!(generation_for("2.1.325 (Claude Code)"), Generation::ThinkingDisplay);
        assert_eq!(generation_for("2.1.324 (Claude Code)"), Generation::Older);
        assert_eq!(generation_for("1.9.999"), Generation::Older);
        assert_eq!(generation_for(""), Generation::Older);
        assert_eq!(generation_for("unknown"), Generation::Older);
    }

    #[test]
    fn resume_replaces_the_session_id() {
        let args = args(&params(Some("old")), "ignored", Generation::HookEvents);
        assert!(args.windows(2).any(|pair| pair == ["--resume", "old"]));
        assert!(!args.contains(&"--session-id".to_string()));
    }

    #[test]
    fn default_profile_gets_no_config_dir() {
        let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap();
        let mut start = params(None);
        start.profile = Some(PathBuf::from(home).join(".claude"));
        let command = command(Path::new("claude"), &start, "abc", Generation::Older);
        assert!(!command.get_envs().any(|(key, value)| key == CONFIG_DIR_VAR && value.is_some()));
    }

    #[test]
    fn command_sets_profile_and_drops_parent_claude_vars() {
        env::set_var("CLAUDE_CODE_SESSION_ID", "parent");
        env::set_var("HERDR_PANE_ID", "w2:pE");
        let command = command(Path::new("claude"), &params(None), "abc", Generation::Older);
        let envs: Vec<_> = command.get_envs().collect();
        assert!(envs.contains(&("CLAUDE_CODE_SESSION_ID".as_ref(), None)));
        assert!(envs.contains(&("HERDR_PANE_ID".as_ref(), None)));
        assert!(envs.contains(&(CONFIG_DIR_VAR.as_ref(), Some("/profiles/.claude-work".as_ref()))));
        assert!(envs.contains(&(TODO_TOOLS_VAR.as_ref(), Some("1".as_ref()))));
        assert!(envs.contains(&(CHECKPOINTING_VAR.as_ref(), Some("true".as_ref()))));
    }

    #[test]
    fn only_a_copy_runs_without_the_autoupdater() {
        let has_updater_off = |command: &Command| command.get_envs().any(|(key, _)| key == AUTOUPDATER_OFF_VAR);
        let copy = paths::home().unwrap().join(paths::APP_FOLDER).join(claude_copy::COPIES_FOLDER).join("2.1.329").join("claude.exe");
        assert!(has_updater_off(&command(&copy, &params(None), "abc", Generation::Older)));
        assert!(!has_updater_off(&command(Path::new("claude"), &params(None), "abc", Generation::Older)));
    }
}
