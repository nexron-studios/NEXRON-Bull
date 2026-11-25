import type { AgentdEvent, ClaudeEvent, LiveBlock, LiveBlockKind } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'

/**
 * What a tab shows of the block Claude is streaming. agentd derives the same from the same events
 * (`agentd/src/partial_reply.rs`) to replay it; `agentd/tests/fixtures/stream_replay.json` holds
 * both sides to that.
 */

export const NO_LIVE_BLOCK: LiveBlock = { kind: 'none' }

/** The live block once `piece` of a `kind` block streamed; the one place a live block is built. */
export const appendedTo = (live: LiveBlock, kind: LiveBlockKind, piece: string): LiveBlock => {
  switch (live.kind) {
    case 'cut':
      return live
    case 'none':
    case 'thinking':
    case 'writing': {
      const text = (live.kind === kind ? live.text : '') + piece
      // Reasoning shows from its start ("thinking …"); a reply only once it has text.
      if (kind === 'writing' && text === '') return live
      return { kind, text }
    }
    default: {
      const unhandled: never = live
      throw new Error(`Unhandled live block: ${JSON.stringify(unhandled)}`)
    }
  }
}

/** What Claude is doing in the block it streams: thinking, writing, or `null` while none streams. */
export const liveActivityOf = (live: LiveBlock): LiveBlockKind | null => {
  switch (live.kind) {
    case 'none':
      return null
    case 'thinking':
    case 'writing':
      return live.kind
    case 'cut':
      return live.of
    default: {
      const unhandled: never = live
      throw new Error(`Unhandled live block: ${JSON.stringify(unhandled)}`)
    }
  }
}

const deltaKindOf = (type: unknown): LiveBlockKind | null => {
  if (type === 'thinking_delta') return 'thinking'
  if (type === 'text_delta') return 'writing'
  return null
}

/** The characters a streamed delta adds: text, reasoning or a tool call's input. */
const deltaCharsOf = (delta: Record<string, unknown> | undefined): number => {
  const piece = delta?.text ?? delta?.thinking ?? delta?.partial_json
  return typeof piece === 'string' ? piece.length : 0
}

/** The end of a streamed call: its final output count goes to `outputs`. */
const withCallEnd = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  const usage = inner.usage as { output_tokens?: unknown } | undefined
  const { messageId } = tab.streamUsage
  if (!messageId || typeof usage?.output_tokens !== 'number') return tab
  return {
    ...tab,
    outputs: { ...tab.outputs, [messageId]: usage.output_tokens },
    streamUsage: { messageId, chars: 0 }
  }
}

const withStreamText = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  switch (inner.type) {
    case 'message_start':
      return { ...tab, live: NO_LIVE_BLOCK, status: 'working' }
    case 'content_block_start': {
      const block = inner.content_block as { type?: string } | undefined
      if (block?.type !== 'thinking' || tab.live.kind === 'cut') return tab
      return { ...tab, live: appendedTo(tab.live, 'thinking', ''), status: 'working' }
    }
    case 'content_block_delta': {
      const delta = inner.delta as { type?: string; text?: string; thinking?: string } | undefined
      const kind = deltaKindOf(delta?.type)
      if (!kind || tab.live.kind === 'cut') return tab
      const piece = (kind === 'thinking' ? delta?.thinking : delta?.text) ?? ''
      return { ...tab, live: appendedTo(tab.live, kind, piece), status: 'working' }
    }
    default:
      return tab
  }
}

/** The tab after a top-level `stream_event` of Claude's. */
export const withStream = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  const streamed = withStreamText(tab, inner)
  if (inner.type === 'message_delta') return withCallEnd(streamed, inner)
  if (inner.type === 'message_start') {
    const message = inner.message as { id?: unknown } | undefined
    const messageId = typeof message?.id === 'string' ? message.id : null
    // Claude answers again: a retry it announced is over.
    return { ...streamed, retry: null, streamUsage: { messageId, chars: 0 } }
  }
  if (inner.type !== 'content_block_delta') return streamed
  const chars = deltaCharsOf(inner.delta as Record<string, unknown> | undefined)
  if (!chars) return streamed
  const { messageId, chars: before } = streamed.streamUsage
  return { ...streamed, streamUsage: { messageId, chars: before + chars } }
}

/**
 * agentd's own copy of the block so far, replayed when an app attaches. Every connected app gets
 * it: one that already shows this call live holds all its deltas, more than a cut replay carries,
 * and keeps what it shows. A lost connection clears the live block, so an app attaching again
 * never keeps a stale copy.
 */
export const withReplay = (
  tab: ChatTabState,
  event: Extract<AgentdEvent, { type: 'stream_replay' }>
): ChatTabState => {
  if (tab.live.kind !== 'none' && tab.streamUsage.messageId === event.message_id) return tab
  return {
    ...tab,
    live: event.block,
    streamUsage: { messageId: event.message_id, chars: event.chars },
    // A block on its way means a turn runs, also one Claude started by itself, as a delta says.
    status: liveActivityOf(event.block) ? 'working' : tab.status
  }
}
