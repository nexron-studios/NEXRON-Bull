//! The JSON-lines protocol between the dashboard and agentd: one request per
//! stdin line, one event per stdout line. The same stream runs locally and over
//! `ssh -T`, so it carries no paths or handles that only make sense on one side.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::catalog::{Profile, SessionSummary};
use crate::chat::ChatMessage;
use crate::commands::SlashCommand;
use crate::file_diff::FileDiff;
use crate::profile_defaults::ProfileDefaults;
use crate::quota::AccountQuota;
use crate::rewind::RewindPoint;
use crate::subagents::SubagentTranscript;
use crate::usage::{SessionRow, ToolRow, UsageRow};
use crate::worktree::{PreviewMerge, RefusalKind, RemoveOutcome};

/// A request with an optional id, echoed back on the reply it causes.
#[derive(Debug, Deserialize)]
pub struct Envelope {
    pub id: Option<u64>,
    #[serde(flatten)]
    pub request: Request,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    Hello,
    Start(StartParams),
    /// `content` is a list of Anthropic content blocks (text, base64 image).
    Send { tab: String, content: Vec<Value> },
    Interrupt { tab: String },
    /// Answers a `can_use_tool` request; `decision` is `{behavior: allow|deny, ...}`.
    Permission { tab: String, request_id: String, decision: Value },
    /// Closes Claude's stdin: it finishes the current turn and exits.
    Stop { tab: String },
    /// Sends `/clear`, but only while the tab still runs `session_id`; an open ask is denied and
    /// the turn interrupted first, or Claude would finish the turn before clearing.
    Clear { tab: String, session_id: String },
    History(HistoryParams),
    Profiles,
    Recent { limit: usize },
    /// Copies a session into another profile; it must not be running anywhere. A new chat
    /// (`is_fresh`) whose transcript Claude has not written yet has nothing to copy.
    MoveSession {
        from: Option<PathBuf>,
        to: Option<PathBuf>,
        session_id: String,
        #[serde(default)]
        is_fresh: bool,
    },
    /// Tabs whose Claude is still running here, so a reconnecting app can attach to them.
    Running,
    /// The running tabs with what an app needs to open them: an app that did not start them (the
    /// browser) knows nothing else about them.
    Tabs,
    /// Plan quota of every profile here; `force` asks Anthropic again sooner than every 90 s.
    Quota {
        #[serde(default)]
        force: bool,
    },
    /// Tokens per day, model family and project over the last `days` days.
    Usage { days: u32 },
    /// The git branch checked out in a working folder.
    Branch { cwd: String },
    /// Deletes a stopped session's transcript, subagent folder and checkpoints in that profile.
    DeleteSession { profile: Option<PathBuf>, session_id: String },
    /// The tool calls of every subagent the session started, from their own transcripts.
    SubagentHistory { profile: Option<PathBuf>, session_id: String },
    /// Creates `~/.claude-<name>` (a-z, 0-9, -) for a new account; refuses an existing folder.
    CreateProfile { name: String },
    /// Changes a running session in place, through Claude's control requests; `None` keeps it.
    Configure {
        tab: String,
        permission_mode: Option<String>,
        model: Option<String>,
        effort: Option<String>,
    },
    /// What a profile's `settings.json` sets for new sessions: model, effort, permission mode.
    ProfileDefaults { profile: Option<PathBuf> },
    /// What to do when an account hits its plan limit; kept on disk, so it holds without the app.
    SetLimits { policy: LimitPolicy },
    /// Moves the tab's session to `profile` now; `then` says whether Claude goes on or waits there.
    LimitMove { tab: String, profile: PathBuf, then: AfterMove },
    /// Drops one waiting message of a tab (to edit it, the app puts its text back in the composer).
    QueueRemove { tab: String, entry: u64 },
    /// Sends a waiting tab's messages now instead of at the reset.
    QueueSend { tab: String },
    /// Files of a working folder for the `@` menu, at most `limit` (capped at `files::MAX_FILES`).
    ListFiles { cwd: String, limit: usize },
    /// Runs one command typed with `!` in the chat's folder; the app hands its output to Claude.
    RunShell { cwd: String, command: String },
    /// Hands a control request to the tab's Claude (`get_context_usage`, `rewind_files`,
    /// `rewind_conversation`, ...) and answers with Claude's response to it.
    Control { tab: String, request: Value },
    /// The prompts of the session that `rewind_files` and `rewind_conversation` can go back to.
    RewindPoints { profile: Option<PathBuf>, session_id: String },
    /// Sends running Bash calls and subagents to the background, like Ctrl+B in the terminal: only
    /// the one `tool_use_id` started, or every one in the foreground.
    Background { tab: String, tool_use_id: Option<String> },
    /// Merges the worktree's branch into `preview` in the main checkout.
    MergeIntoPreview { worktree: String },
    /// Removes the worktree and its branch; refuses while anything in it could be lost.
    RemoveWorktree { worktree: String },
    /// A file's changes in the working tree against `HEAD`; `path` may be relative to `cwd`.
    FileDiff { cwd: String, path: String },
}

/// The app's limit settings, the same on every machine. Accounts are named by their label
/// (`office`, `default`), so one rule fits the profiles of every machine with that name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LimitPolicy {
    pub mode: LimitMode,
    /// Suggest the move from 90 % of the 5-hour window on, at the end of the turn.
    pub suggest_early: bool,
    /// Labels in the order a full chat tries them; accounts missing here follow by name.
    pub order: Vec<String>,
    /// A folder (repository name) that names accounts may only move between those.
    pub rules: Vec<FolderRule>,
    /// Messages sent to a full chat wait for the reset; off, they go to Claude and fail there.
    pub queue: bool,
}

impl Default for LimitPolicy {
    fn default() -> Self {
        Self { mode: LimitMode::Auto, suggest_early: true, order: Vec::new(), rules: Vec::new(), queue: true }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LimitMode {
    /// Move to the first allowed account with room, wait if there is none.
    Auto,
    /// Wait, and offer the accounts it could move to.
    Ask,
    /// Never move; wait for the reset.
    Wait,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderRule {
    pub folder: String,
    pub accounts: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AfterMove {
    /// Claude continues where the limit stopped it, then takes the waiting messages.
    Continue,
    /// The chat waits on that account for its reset (undoing an automatic move to a full one).
    Wait,
    /// Claude just runs there from the next message on (a move suggested before the limit).
    Ready,
}

/// One account as a limit card shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AccountRef {
    pub profile: PathBuf,
    pub label: String,
    /// Of the window that matters: the full one, or the 5-hour window for an account with room.
    pub used_percent: Option<f64>,
    pub resets_at_ms: Option<u64>,
}

/// A message that waits for the reset; images stay in agentd, the card only counts them.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QueuedPrompt {
    pub id: u64,
    pub text: String,
    pub images: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WaitReason {
    /// The policy says to wait.
    Policy,
    /// The policy says to ask; `candidates` are the offers.
    Ask,
    /// No allowed account has room.
    NoAccount,
    /// The user moved the chat back to its full account.
    Undone,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LimitState {
    /// Nothing to show (any earlier card is over).
    None,
    /// The 5-hour window passed 90 %; `candidate` is where the chat would go.
    Warning { account: AccountRef, candidate: Option<AccountRef> },
    /// The chat moved because `from` was full; Claude goes on on `to`.
    Moved { from: AccountRef, to: AccountRef },
    /// The chat waits for `account` to reset; `window` is `five_hour`, `seven_day`, ….
    Waiting {
        account: AccountRef,
        window: Option<String>,
        reason: WaitReason,
        candidates: Vec<AccountRef>,
        queue: Vec<QueuedPrompt>,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct StartParams {
    pub tab: String,
    /// `CLAUDE_CONFIG_DIR` of the account; `None` is the default profile.
    pub profile: Option<PathBuf>,
    pub cwd: PathBuf,
    /// Continue this session instead of starting a new one.
    pub resume: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    /// No prompt of this session has come back from Claude yet: it may have no transcript.
    #[serde(default)]
    pub is_fresh: bool,
    /// `low` … `max`; `None` keeps the profile's effort.
    #[serde(default)]
    pub effort: Option<String>,
    /// Claude starts in a new worktree of the repository `cwd` is in, not in `cwd` itself.
    #[serde(default)]
    pub worktree: Option<WorktreePlan>,
}

/// The chat's own worktree, made when its Claude first starts.
#[derive(Debug, Clone, Deserialize)]
pub struct WorktreePlan {
    /// The chat's first prompt; the branch is named after it.
    pub hint: String,
    /// Replaces the default folder for worktrees beside the projects.
    #[serde(default)]
    pub root: Option<String>,
}

/// A running tab as `tabs` lists it; `None` model, mode or effort is the profile's default.
#[derive(Debug, Serialize)]
pub struct TabInfo {
    pub tab: String,
    pub session_id: String,
    /// As the recent list names the session; `None` before Claude wrote its transcript.
    pub title: Option<String>,
    pub cwd: PathBuf,
    pub profile: Option<PathBuf>,
    pub account: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub effort: Option<String>,
    /// As the tab was started: its session may have no transcript yet, so `history` must not fail.
    pub is_fresh: bool,
}

#[derive(Debug, Deserialize)]
pub struct HistoryParams {
    pub profile: Option<PathBuf>,
    pub session_id: String,
    /// Return messages older than this uuid; `None` starts at the newest.
    pub before: Option<String>,
    pub limit: usize,
    /// As in `StartParams`: a missing transcript is then an empty chat, not an error.
    #[serde(default)]
    pub is_fresh: bool,
}

/// What a streamed block is: reasoning or the reply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Thinking,
    Writing,
}

/// The block Claude is streaming, as the app shows it. One block streams at a time: Claude Code
/// sends each finished block as its own message before the next one starts. `Cut`: it outgrew what
/// agentd keeps, so the app drops its further deltas until its finished message.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LiveBlock {
    #[default]
    None,
    Thinking { text: String },
    Writing { text: String },
    Cut { of: BlockKind },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    /// `id` is new: an older agentd answers `hello` without one.
    Hello { id: Option<u64>, version: &'static str, os: &'static str },
    /// `working` is true while a turn runs; an app attaching mid-turn shows Claude as busy.
    /// `profile` and `account` are where it runs now: a limit may have moved it meanwhile. `cwd` is
    /// where: a chat with a `worktree` plan works in its new worktree.
    Started { id: Option<u64>, tab: String, session_id: String, working: bool, profile: Option<PathBuf>, account: Option<String>, cwd: PathBuf },
    /// The limit card of a tab; sent again to an app that attaches later.
    Limit { tab: String, state: LimitState },
    LimitsSet { id: Option<u64> },
    /// A user or assistant message, parsed like a transcript line.
    Message { tab: String, message: ChatMessage },
    /// Any other stdout line of Claude, passed through untouched; an open permission ask sent
    /// again to an attaching app carries `"replay": true`.
    Claude { tab: String, event: Value },
    /// The block Claude is streaming since its last finished message, sent to an app that attaches
    /// mid-turn; never while nothing streamed. `message_id` and `chars` are the API call it belongs
    /// to and the characters streamed in it, for the app's token estimate.
    StreamReplay { tab: String, message_id: Option<String>, chars: u64, block: LiveBlock },
    Stderr { tab: String, text: String },
    Exited { tab: String, code: Option<i32> },
    History { id: Option<u64>, messages: Vec<ChatMessage>, has_more: bool },
    Profiles { id: Option<u64>, profiles: Vec<Profile> },
    ProfileCreated { id: Option<u64>, profile: Profile },
    Recent { id: Option<u64>, sessions: Vec<SessionSummary> },
    Moved { id: Option<u64>, session_id: String },
    /// `/clear` is on its way; Claude then reports the new session in `system`/`init`.
    Cleared { id: Option<u64>, tab: String },
    Deleted { id: Option<u64>, session_id: String },
    Running { id: Option<u64>, tabs: Vec<String> },
    Tabs { id: Option<u64>, tabs: Vec<TabInfo> },
    /// A `permission` answer went to Claude; every app drops its card for that ask.
    PermissionResolved { tab: String, request_id: String },
    Quota { id: Option<u64>, accounts: Vec<AccountQuota> },
    Usage { id: Option<u64>, days: u32, rows: Vec<UsageRow>, tools: Vec<ToolRow>, sessions: Vec<SessionRow> },
    /// `None` outside a repository; a short commit id when `HEAD` is detached.
    /// `worktree_root`: the top folder of the linked git worktree the folder is in (the one a removal
    /// deletes); `null` in a main checkout.
    Branch { id: Option<u64>, branch: Option<String>, worktree_root: Option<String> },
    PreviewMerged {
        id: Option<u64>,
        #[serde(flatten)]
        merge: PreviewMerge,
    },
    /// A worktree was not made (`tab` set: its Claude did not start), merged or removed.
    WorktreeRefused { id: Option<u64>, tab: Option<String>, kind: RefusalKind, message: String },
    WorktreeRemoved { id: Option<u64>, outcome: RemoveOutcome },
    /// Empty while the session has no transcript or never started a subagent.
    SubagentHistory { id: Option<u64>, agents: Vec<SubagentTranscript> },
    Error { id: Option<u64>, tab: Option<String>, message: String },
    /// The slash commands and skills of the tab's Claude, from `initialize` or a later change;
    /// sent again to an app that attaches.
    Commands { tab: String, commands: Vec<SlashCommand> },
    /// What the chat is about now, from Haiku after a message (see `titles`); sent again to an
    /// app that attaches. The session id keeps a late title from landing after `/clear`.
    Title { tab: String, session_id: String, title: String },
    Files { id: Option<u64>, files: Vec<String>, is_truncated: bool },
    /// `code` is `None` when the command was stopped at the timeout.
    ShellResult { id: Option<u64>, stdout: String, stderr: String, code: Option<i32>, duration_ms: u64, is_timed_out: bool },
    /// What Claude answered to a `control` request; an error answer comes as `Error` instead.
    ControlResult { id: Option<u64>, tab: String, response: Value },
    /// Oldest first; empty while the session has no transcript.
    RewindPoints { id: Option<u64>, points: Vec<RewindPoint> },
    /// The control requests of a `configure` are on their way to Claude.
    Configured { id: Option<u64>, tab: String },
    ProfileDefaults { id: Option<u64>, defaults: ProfileDefaults },
    /// The diff, or why there is none; the app then falls back to the chat's edits.
    FileDiff { id: Option<u64>, answer: FileDiff },
}
