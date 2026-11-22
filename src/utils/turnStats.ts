import type { ChatMessage } from '@/types/agentd.type'
import { formatElapsed, formatHoursMinutes, MS_PER_HOUR, MS_PER_SECOND } from '@/utils/elapsed'
import { modelFamilyOf } from '@/utils/tabInsights'

/** What a finished turn took, as the line under its answer says it. */
export interface TurnStats {
  /** From the prompt to Claude's last message; `null` without times */
  durationMs: number | null
  outputTokens: number
  /** The model of the last reply, as the API names it */
  model: string | null
}

/** Claude Code's own rule of thumb while a reply streams: about four characters per token. */
const CHARS_PER_TOKEN = 4
const THOUSAND = 1000
const MILLION = 1_000_000
const SECONDS_PER_MINUTE = 60

/** Output tokens per API message, so a reply split into several lines counts once. */
const outputByCall = (messages: ChatMessage[]): Map<string, number> => {
  const byCall = new Map<string, number>()
  for (const { usage } of messages) {
    if (!usage) continue
    // An older agentd sends no id; the lines of one call carry the same usage, a later call never.
    const call =
      usage.id ?? `${usage.input}:${usage.cache_read}:${usage.cache_write}:${usage.output}`
    byCall.set(call, Math.max(byCall.get(call) ?? 0, usage.output))
  }
  return byCall
}

/**
 * Tokens Claude wrote in these messages. Live, a line carries the count from the start of its
 * call; `outputs` holds the final count the stream reported at the end of the call.
 */
export const outputTokensOf = (
  messages: ChatMessage[],
  outputs: Readonly<Record<string, number>>
): number =>
  [...outputByCall(messages)].reduce((sum, [call, output]) => sum + (outputs[call] ?? output), 0)

/** The running turn so far, with the reply Claude is streaming right now estimated. */
export const liveTurnTokensOf = (
  messages: ChatMessage[],
  outputs: Readonly<Record<string, number>>,
  streamingChars: number
): number => outputTokensOf(messages, outputs) + Math.ceil(streamingChars / CHARS_PER_TOKEN)

const timeOf = (message: ChatMessage | undefined): number | null => {
  const ms = message?.at ? Date.parse(message.at) : Number.NaN
  return Number.isFinite(ms) ? ms : null
}

/** A turn from its prompt on; `null` when Claude did not reply in it. */
export const turnStatsOf = (
  turn: ChatMessage[],
  outputs: Readonly<Record<string, number>>
): TurnStats | null => {
  const replies = turn.filter((message) => message.role === 'assistant')
  const last = replies.at(-1)
  if (!last) return null
  const start = timeOf(turn[0])
  const end = timeOf(last)
  return {
    durationMs: start !== null && end !== null ? Math.max(0, end - start) : null,
    outputTokens: outputTokensOf(replies, outputs),
    model: replies.findLast((message) => message.usage)?.usage?.model ?? null
  }
}

const MODEL_PATTERN = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/

/** `claude-opus-5-5` → `Opus 5.5`, `claude-haiku-4-5-20251001` → `Haiku 4.5`. */
export const modelLabelOf = (model: string): string => {
  const match = model.match(MODEL_PATTERN)
  const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
  if (match?.[1] && match[2])
    return `${capitalized(match[1])} ${match[3] ? `${match[2]}.${match[3]}` : match[2]}`
  const family = modelFamilyOf(model)
  return family ? capitalized(family) : model
}

/** `812`, `4,2k`, `1,3M`: as short as the terminal's status line. */
export const tokenCountFormatterOf = (locale: string): ((value: number) => string) => {
  const exact = new Intl.NumberFormat(locale)
  const short = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return (value) => {
    if (value < THOUSAND) return exact.format(value)
    if (value < MILLION) return `${short.format(value / THOUSAND)}k`
    return `${short.format(value / MILLION)}M`
  }
}

/** A turn's length for the line under its answer, without the unit: seconds, minutes or hours. */
export const turnDurationOf = (
  ms: number
): { unit: 'seconds' | 'minutes' | 'hours'; time: string } => {
  if (ms < SECONDS_PER_MINUTE * MS_PER_SECOND)
    return { unit: 'seconds', time: String(Math.max(1, Math.round(ms / MS_PER_SECOND))) }
  if (ms < MS_PER_HOUR) return { unit: 'minutes', time: formatElapsed(ms) }
  return { unit: 'hours', time: formatHoursMinutes(ms) }
}
