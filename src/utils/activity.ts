import { hasRepliedThisTurn, turnMessagesOf, type ChatTabState } from '@/utils/chatTab'
import { liveActivityOf } from '@/utils/liveStream'
import type { LiveBlockKind } from '@/types/agentd.type'
import { shortTarget, toolInfoOf, type Activity } from '@/utils/toolKind'
import { isShellTool } from '@/utils/toolOutput'
import { resultsByToolId, type ToolResultBlock, type ToolUseBlock } from '@/utils/toolPairs'
import { summarizeToolInput } from '@/utils/toolSummary'

/** What the thinking bar says while a turn runs. */
export type TabActivity =
  | { kind: 'asking' }
  | { kind: 'thinking' }
  | { kind: 'writing' }
  | { kind: 'tool'; activity: Activity; tool: string; target: string }
  | { kind: 'working' }

/** The newest call of the running turn without a result; earlier turns' calls are not running. */
const runningCall = (
  tab: ChatTabState,
  results: Map<string, ToolResultBlock>
): ToolUseBlock | undefined =>
  turnMessagesOf(tab)
    .flatMap((message) => message.blocks)
    .filter((block): block is ToolUseBlock => block.type === 'tool_use' && !results.has(block.id))
    .at(-1)

/** Sent, but Claude has neither written, thought nor called a tool yet in this turn. */
export const isAwaitingReply = (tab: ChatTabState): boolean => {
  if (tab.status !== 'working' || !tab.turn || tab.live.kind !== 'none') return false
  return !hasRepliedThisTurn(tab)
}

/**
 * The activity with the live block's kind given apart: a caller that passes it from its own
 * computed is not run again for every token, only when Claude switches between thinking and
 * writing.
 */
export const activityOf = (
  tab: ChatTabState,
  live: LiveBlockKind | null,
  results: Map<string, ToolResultBlock>
): TabActivity => {
  if (tab.permission) return { kind: 'asking' }
  if (live) return { kind: live }
  const call = runningCall(tab, results)
  if (!call) return { kind: 'working' }
  const target = shortTarget(summarizeToolInput(call.input))
  return { kind: 'tool', activity: toolInfoOf(call.name, target).activity, tool: call.name, target }
}

export const activityOfTab = (
  tab: ChatTabState,
  results: Map<string, ToolResultBlock>
): TabActivity => activityOf(tab, liveActivityOf(tab.live), results)

/**
 * The shell call Claude waits on right now: Ctrl+B sends it to the background, as in the terminal.
 * `null` while none runs in the foreground.
 */
export const foregroundShellOf = (tab: ChatTabState): ToolUseBlock | null => {
  if (tab.status !== 'working') return null
  const messages = turnMessagesOf(tab)
  const results = resultsByToolId(messages)
  return (
    messages
      .flatMap((message) => message.blocks)
      .filter(
        (block): block is ToolUseBlock =>
          block.type === 'tool_use' &&
          isShellTool(block.name) &&
          block.input.run_in_background !== true &&
          !results.has(block.id)
      )
      .at(-1) ?? null
  )
}
