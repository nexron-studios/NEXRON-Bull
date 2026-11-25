/** Mirrors agentd/src/protocol.rs and agentd/src/chat.rs. */

export type Role = 'user' | 'assistant' | 'system'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  /**
   * `patch`: what an Edit, MultiEdit or Write changed, with line numbers, as Claude Code reports it
   * beside the result; missing for other tools and from an older agentd.
   */
  | {
      type: 'tool_result'
      tool_use_id: string
      is_error: boolean
      content: Block[]
      patch?: PatchHunk[]
    }
  | { type: 'command'; name: string; args: string }
  | { type: 'command_output'; text: string }
  | { type: 'compacted' }
  /** `text` is empty when the session ran without thinking display */
  | { type: 'thinking'; text: string }
  | { type: 'interrupted' }
  /**
   * What another agent of the session sent, mostly a background subagent's final report
   * (`is_report`). Claude Code hands it to Claude as a prompt, so it arrives as a system message.
   * `from` is the agent id, `name` its type or given name where the transcript has one.
   */
  | { type: 'agent_message'; from: string; name: string | null; text: string; is_report: boolean }
  /** A command the user ran with `!`; Claude reads it with the prompt it came with */
  | { type: 'shell'; command: string }
  | { type: 'shell_output'; stdout: string; stderr: string }
  /** Added by the app where agentd moved the chat to another account; never in a transcript */
  | { type: 'account_moved'; from: AccountRefProps; to: AccountRefProps }
  /** A hook that stopped something, failed or printed for the user (`agentd/src/hooks.rs`). */
  | { type: 'hook'; event: string; tool: string | null; outcome: HookOutcome; text: string }

/** One hunk of a file change; each line starts with its mark: ` ` context, `-` removed, `+` added. */
export interface PatchHunk {
  old_start: number
  new_start: number
  lines: string[]
}

/** How git sees a changed file in the working tree against `HEAD` (`agentd/src/file_diff.rs`). */
export const changedStatusList = ['modified', 'added', 'untracked', 'deleted'] as const
export type ChangedStatus = (typeof changedStatusList)[number]
/** A file with nothing to show against `HEAD`; `missing`: created and removed again */
export const cleanStatusList = ['unchanged', 'ignored', 'missing'] as const
export type CleanStatus = (typeof cleanStatusList)[number]

/** agentd's answer to `file_diff`, one variant per case: the diff, or why there is none */
export type FileDiff =
  | {
      state: 'diff'
      status: ChangedStatus
      hunks: PatchHunk[]
      /** Only the lines around each change came, or the lines were cut */
      is_truncated: boolean
    }
  | { state: 'binary'; status: ChangedStatus }
  /** Too big to send any lines */
  | { state: 'too_big'; status: ChangedStatus }
  | { state: 'clean'; status: CleanStatus }
  | { state: 'not_in_repository' }
  | { state: 'git_missing' }
  | { state: 'failed'; message: string }

export const hookOutcomeList = ['blocked', 'failed', 'output'] as const
export type HookOutcome = (typeof hookOutcomeList)[number]

/** Token counts as Claude Code writes them, renamed in agentd (`agentd/src/usage.rs`). */
export interface TokenCounts {
  input: number
  output: number
  cache_read: number
  cache_write: number
}

/** The API call behind an assistant message; its input side is the context size. */
export interface MessageUsage extends TokenCounts {
  model: string
  /** The API message; Claude Code splits one into a line per content block, each with its usage */
  id?: string
}

export interface ChatMessage {
  uuid: string
  role: Role
  at: string | null
  blocks: Block[]
  /** Only on assistant messages */
  usage?: MessageUsage
  /** A prompt sent while Claude was working; Claude read it within that turn */
  is_mid_turn?: boolean
}

export const quotaProblemList = [
  'no_login',
  'logged_out',
  'expired',
  'rate_limited',
  'unreachable',
  'bad_answer',
  /** Only from TokenScope: its numbers are older than its last try, no reason given */
  'stale'
] as const
export type QuotaProblem = (typeof quotaProblemList)[number]

/** Who fetched the numbers: agentd itself, or NEXRON TokenScope while it runs there. */
export const quotaSourceList = ['anthropic', 'tokenscope'] as const
export type QuotaSource = (typeof quotaSourceList)[number]

export const quotaWindowKeyList = [
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet'
] as const
export type QuotaWindowKey = (typeof quotaWindowKeyList)[number]

export interface QuotaWindow {
  key: QuotaWindowKey
  used_percent: number
  /** RFC 3339 */
  resets_at: string | null
}

/** Mirrors `AccountQuota` in agentd/src/quota.rs: one per profile. */
export interface AccountQuotaProps {
  profile: string
  label: string
  email: string | null
  /** `pro`, `max`, … */
  plan: string | null
  windows: QuotaWindow[]
  /** When `windows` were fetched (ms); 0 if never */
  fetched_ms: number
  /** Why the numbers are stale or missing */
  problem: QuotaProblem | null
  /** Missing from an older agentd on another machine */
  source?: QuotaSource
}

export const modelFamilyList = ['opus', 'sonnet', 'haiku', 'other'] as const
export type ModelFamily = (typeof modelFamilyList)[number]

/** Mirrors `UsageRow` in agentd/src/usage.rs. */
export interface UsageRow extends TokenCounts {
  /** Local day on the answering machine, `YYYY-MM-DD` */
  day: string
  model: ModelFamily
  /** The session's working folder */
  project: string
}

/** Mirrors `ToolRow` in agentd/src/usage.rs: tool calls of one name on one day in one project. */
export interface ToolUseRow {
  day: string
  project: string
  /** As Claude Code names it: `Bash`, `Read`, `mcp__<server>__<tool>` */
  tool: string
  calls: number
}

/** Mirrors `SessionRow` in agentd/src/usage.rs: sessions that wrote to a project on one day. */
export interface SessionCountRow {
  day: string
  project: string
  sessions: number
}

export interface ProfileProps {
  /** Folder name after `.claude-`, `default` for `~/.claude` */
  label: string
  /** The account's `CLAUDE_CONFIG_DIR` */
  dir: string
  email: string | null
}

/** Mirrors agentd/src/profile_defaults.rs: what the profile's `settings.json` sets, as written. */
export interface ProfileDefaults {
  /** An alias (`opus`) or a full model name; `null` is Claude Code's own default */
  model: string | null
  effort: string | null
  permission_mode: string | null
  /**
   * `modelSettings.<model>.effortLevel` by model name (`claude-opus-5-5`); before `effort` for that
   * model. Absent from an older agentd.
   */
  model_efforts?: Record<string, string>
}

export interface SessionSummaryProps {
  session_id: string
  profile: string
  account: string
  cwd: string
  title: string
  modified_ms: number
}

/** One subagent's own transcript: only its tool calls and results, results without content. */
export interface SubagentTranscript {
  agent_id: string
  /** The Agent call that started it; `null` when Claude Code wrote no meta file */
  tool_use_id: string | null
  messages: ChatMessage[]
}

/** A slash command or skill of a session, as Claude Code lists it (`agentd/src/commands.rs`). */
export interface SlashCommandProps {
  /** Without the slash */
  name: string
  /** Custom commands and skills end with where they come from, e.g. "(user)" */
  description: string
  argument_hint: string
}

/** A prompt the session can go back to; mirrors `RewindPoint` in agentd/src/rewind.rs. */
export interface RewindPointProps {
  /** The prompt's uuid, the target of `rewind_files` and `rewind_conversation` */
  uuid: string
  text: string
  images: number
  at: string | null
  /** Files the turn of this prompt changed */
  files_changed: number
  /** Claude Code backed up the files before this prompt; without it the code cannot go back */
  has_checkpoint: boolean
}

/** Any stdout line of Claude that is not a chat message. */
export interface ClaudeEvent {
  type: string
  subtype?: string
  [key: string]: unknown
}

/** A running tab as `tabs` lists it; `null` model, mode or effort is the profile's default. */
export interface TabInfoProps {
  tab: string
  session_id: string
  /** As the recent list names the session; `null` before Claude wrote its transcript */
  title: string | null
  cwd: string
  profile: string | null
  account: string | null
  model: string | null
  permission_mode: string | null
  effort: string | null
  /** As started: the session may have no transcript yet */
  is_fresh: boolean
}

export type AgentdEvent =
  /** An older agentd on another machine leaves `id` out: such a hello answers no request */
  | { type: 'hello'; id: number | null; version: string; os: string }
  /** `working`: the session was already running and is in the middle of a turn */
  /** `profile` and `account`: where it runs now, a limit may have moved it; `null` from an older agentd */
  | {
      type: 'started'
      id: number | null
      tab: string
      session_id: string
      working: boolean
      profile?: string | null
      account?: string | null
      /** Where Claude works: a planned worktree's folder; missing from an older agentd */
      cwd?: string
    }
  /** The limit card of a tab, sent again to an app that attaches later */
  | { type: 'limit'; tab: string; state: LimitState }
  | { type: 'limits_set'; id: number | null }
  | { type: 'message'; tab: string; message: ChatMessage }
  | { type: 'claude'; tab: string; event: ClaudeEvent }
  | { type: 'stderr'; tab: string; text: string }
  | { type: 'exited'; tab: string; code: number | null }
  | { type: 'history'; id: number | null; messages: ChatMessage[]; has_more: boolean }
  | { type: 'profiles'; id: number | null; profiles: ProfileProps[] }
  | { type: 'profile_created'; id: number | null; profile: ProfileProps }
  | { type: 'recent'; id: number | null; sessions: SessionSummaryProps[] }
  | { type: 'moved'; id: number | null; session_id: string }
  /** `/clear` is on its way; Claude then reports the new session in `system`/`init` */
  | { type: 'cleared'; id: number | null; tab: string }
  | { type: 'deleted'; id: number | null; session_id: string }
  | { type: 'running'; id: number | null; tabs: string[] }
  | { type: 'tabs'; id: number | null; tabs: TabInfoProps[] }
  /** An ask was answered, from this app or another one: every app drops its card */
  | { type: 'permission_resolved'; tab: string; request_id: string }
  | { type: 'quota'; id: number | null; accounts: AccountQuotaProps[] }
  | {
      type: 'usage'
      id: number | null
      days: number
      rows: UsageRow[]
      /** Missing from an agentd older than the activity grid */
      tools?: ToolUseRow[]
      sessions?: SessionCountRow[]
    }
  /** `null` outside a repository; a short commit id when `HEAD` is detached */
  /**
   * `worktree_root`: the linked git worktree's top folder, the one a removal deletes; `null` in a
   * main checkout, missing from an agentd older than worktrees
   */
  | { type: 'branch'; id: number | null; branch: string | null; worktree_root?: string | null }
  /** A worktree was not made (`tab` set: its Claude did not start), merged or removed */
  | {
      type: 'worktree_refused'
      id: number | null
      tab: string | null
      kind: WorktreeRefusalKind
      message: string
    }
  | {
      type: 'preview_merged'
      id: number | null
      branch: string
      outcome: PreviewMergeOutcome
      /** `preview` was missing and made from the integration branch first */
      created_preview: boolean
      /** Changes not committed yet; a merge takes only commits */
      has_uncommitted: boolean
    }
  | { type: 'worktree_removed'; id: number | null; outcome: WorktreeRemoval }
  /** Without a diff, the review shows the chat's own edits and says why */
  | { type: 'file_diff'; id: number | null; answer: FileDiff }
  /** Empty while the session has no transcript or never started a subagent */
  | { type: 'subagent_history'; id: number | null; agents: SubagentTranscript[] }
  /** Sent by the app, not agentd: the connection to a machine ended; `null` is this computer. */
  /** `connection` is the id `agentd_request` returned for the requests sent on it */
  | { type: 'disconnected'; machine: string | null; connection: number }
  | { type: 'error'; id: number | null; tab: string | null; message: string }
  /** The slash commands and skills of the tab's Claude; again when the app attaches */
  | { type: 'commands'; tab: string; commands: SlashCommandProps[] }
  /** What the chat is about now, named by Haiku after each message; sent again on attach. */
  | { type: 'title'; tab: string; session_id: string; title: string }
  | { type: 'files'; id: number | null; files: string[]; is_truncated: boolean }
  /** `code` is `null` when the command was stopped at the timeout */
  | {
      type: 'shell_result'
      id: number | null
      stdout: string
      stderr: string
      code: number | null
      duration_ms: number
      is_timed_out: boolean
    }
  /** Claude's answer to a `control` request, as Claude Code sends it */
  | { type: 'control_result'; id: number | null; tab: string; response: unknown }
  /** Oldest first; empty while the session has no transcript */
  | { type: 'rewind_points'; id: number | null; points: RewindPointProps[] }
  /** The control requests of a `configure` are on their way to Claude */
  | { type: 'configured'; id: number | null; tab: string }
  | { type: 'profile_defaults'; id: number | null; defaults: ProfileDefaults }

export interface StartPayload {
  tab: string
  profile: string | null
  cwd: string
  resume: string | null
  model: string | null
  permission_mode: string | null
  /** No prompt of this session came back from Claude yet: it may have no transcript */
  is_fresh: boolean
  /** `low` … `max`; `null` keeps the profile's effort */
  effort: string | null
  /** Claude starts in a new worktree of the repository of `cwd`, named after `hint` */
  worktree: { hint: string; root: string | null } | null
}

/** One block of a prompt as the app sends it: Anthropic content blocks. */
export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export type AgentdRequest =
  | { op: 'hello' }
  | ({ op: 'start' } & StartPayload)
  | { op: 'send'; tab: string; content: PromptBlock[] }
  | { op: 'interrupt'; tab: string }
  | { op: 'permission'; tab: string; request_id: string; decision: Record<string, unknown> }
  | { op: 'stop'; tab: string }
  /** Sends `/clear`, only while the tab still runs `session_id` */
  | { op: 'clear'; tab: string; session_id: string }
  | {
      op: 'history'
      profile: string | null
      session_id: string
      before: string | null
      limit: number
      /** A missing transcript is then an empty chat, not an error */
      is_fresh: boolean
    }
  | { op: 'profiles' }
  | { op: 'recent'; limit: number }
  | {
      op: 'move_session'
      from: string | null
      to: string | null
      session_id: string
      is_fresh: boolean
    }
  | { op: 'running' }
  | { op: 'tabs' }
  /** `force` asks Anthropic again sooner than every 90 s (at most every 15 s) */
  | { op: 'quota'; force: boolean }
  | { op: 'usage'; days: number }
  | { op: 'branch'; cwd: string }
  /** Deletes a stopped session's transcript, subagent folder and checkpoints in that profile */
  | { op: 'delete_session'; profile: string | null; session_id: string }
  | { op: 'subagent_history'; profile: string | null; session_id: string }
  /** Creates `~/.claude-<name>` (a-z, 0-9, -) for a new account; refuses an existing folder */
  | { op: 'create_profile'; name: string }
  /** Changes a running session in place; `null` keeps that setting */
  | {
      op: 'configure'
      tab: string
      permission_mode: string | null
      model: string | null
      effort: string | null
    }
  | { op: 'profile_defaults'; profile: string | null }
  /** What to do when an account hits its plan limit; agentd keeps it on disk */
  | { op: 'set_limits'; policy: LimitPolicy }
  /** Moves the tab's session to `profile` now; `then` says whether Claude goes on or waits there */
  | { op: 'limit_move'; tab: string; profile: string; then: AfterMove }
  /** Drops one waiting message (to edit it, the app puts its text back into the composer) */
  | { op: 'queue_remove'; tab: string; entry: number }
  /** Sends a waiting tab's messages now instead of at the reset */
  | { op: 'queue_send'; tab: string }
  /** Files of a working folder for the `@` menu, relative with `/`, gitignore respected */
  | { op: 'list_files'; cwd: string; limit: number }
  /** A file's changes in the working tree against `HEAD`; `path` may be relative to `cwd` */
  | { op: 'file_diff'; cwd: string; path: string }
  /** One `!` command in the chat's folder, through Git Bash on Windows */
  | { op: 'run_shell'; cwd: string; command: string }
  /** Hands a control request (`get_context_usage`, `rewind_files`, ...) to the tab's Claude */
  | { op: 'control'; tab: string; request: { subtype: string } & Record<string, unknown> }
  | { op: 'rewind_points'; profile: string | null; session_id: string }
  /** Ctrl+B: sends the running call `tool_use_id` (or every foreground one) to the background */
  | { op: 'background'; tab: string; tool_use_id: string | null }
  | { op: 'merge_into_preview'; worktree: string }
  /** Refuses while anything in the worktree could be lost or a chat runs in it */
  | { op: 'remove_worktree'; worktree: string }

/** `branches`: the other chat branches in `preview` that changed the conflicting files. */
export type PreviewMergeOutcome =
  | { kind: 'merged'; commits: number }
  | { kind: 'up_to_date' }
  | { kind: 'conflict'; files: string[]; branches: string[] }
  /** `preview` exists, but the main checkout is on `branch`; nothing was merged */
  | { kind: 'main_elsewhere'; branch: string }
  /** `preview` is missing and the main checkout has uncommitted changes; nothing was merged */
  | { kind: 'main_dirty' }

/** Why agentd made, merged or removed no worktree; `failed` is git or the disk failing. */
export const worktreeRefusalKindList = [
  'no_folder',
  'no_repository',
  'not_a_worktree',
  'no_integration',
  'relative_root',
  'detached',
  'no_free_name',
  'failed'
] as const
export type WorktreeRefusalKind = (typeof worktreeRefusalKindList)[number]

/** Only `removed` removed anything. */
export type WorktreeRemoval =
  | { kind: 'removed'; branch: string }
  | { kind: 'uncommitted'; files: string[] }
  | { kind: 'unmerged'; commits: number; integration: string }
  | { kind: 'in_use' }

/** auto: move to the first allowed account with room; ask: wait and offer them; wait: never move */
export const limitModeList = ['auto', 'ask', 'wait'] as const
export type LimitMode = (typeof limitModeList)[number]

/** A folder (repository name) whose chats may only move between these account labels. */
export interface FolderRuleProps {
  folder: string
  accounts: string[]
}

/** The app's limit settings, the same on every machine; accounts are named by their label. */
export interface LimitPolicy {
  mode: LimitMode
  /** Suggest the move from 90 % of the 5-hour window on, at the end of the turn */
  suggest_early: boolean
  /** Labels in the order a full chat tries them; accounts missing here follow by name */
  order: string[]
  rules: FolderRuleProps[]
  /** Messages sent to a full chat wait for the reset; off, they go to Claude and fail there */
  queue: boolean
}

/** continue: Claude goes on where the limit stopped it; wait: for the reset there; ready: from the next message */
export const afterMoveList = ['continue', 'wait', 'ready'] as const
export type AfterMove = (typeof afterMoveList)[number]

/** One account as a limit card shows it. */
export interface AccountRefProps {
  profile: string
  label: string
  /** Of the window that matters: the full one, or the 5-hour window of an account with room */
  used_percent: number | null
  resets_at_ms: number | null
}

/** A message waiting for the reset; images stay in agentd, the card counts them. */
export interface QueuedPromptProps {
  id: number
  text: string
  images: number
}

export const waitReasonList = ['policy', 'ask', 'no_account', 'undone'] as const
export type WaitReason = (typeof waitReasonList)[number]

export type LimitState =
  | { kind: 'none' }
  /** The 5-hour window passed 90 %; `candidate` is where the chat would go */
  | { kind: 'warning'; account: AccountRefProps; candidate: AccountRefProps | null }
  /** The chat moved because `from` was full; Claude goes on on `to` */
  | { kind: 'moved'; from: AccountRefProps; to: AccountRefProps }
  /** Waits for `account` to reset; `window` is `five_hour`, `seven_day`, … */
  | {
      kind: 'waiting'
      account: AccountRefProps
      window: string | null
      reason: WaitReason
      candidates: AccountRefProps[]
      queue: QueuedPromptProps[]
    }
