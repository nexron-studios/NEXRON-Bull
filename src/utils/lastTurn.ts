import { formatElapsed, formatHoursMinutes, MS_PER_HOUR } from '@/utils/elapsed'
import type { TurnSummary } from '@/utils/tabActivity'

/**
 * The two ways the summary calls vue-i18n's `t`. Not `ComposerTranslation`: that type is generic
 * over the message schema, so the app's typed `t` and the global one do not fit the same parameter.
 */
export interface Translate {
  (key: string, count: number): string
  (key: string, named: Record<string, string>): string
}

const durationTextOf = (durationMs: number, t: Translate): string =>
  durationMs < MS_PER_HOUR
    ? t('activity.duration_minutes', { time: formatElapsed(durationMs) })
    : t('activity.duration_hours', { time: formatHoursMinutes(durationMs) })

/**
 * "Last turn: 14 tools, 3 subagents, 4:10 min". A turn without subagents leaves that part out
 * ("0 subagents" read like something was missing); the tools stay, even at 0, because a turn
 * without any tool is worth knowing.
 */
export const lastTurnTextOf = (
  { tools, subagents, durationMs }: TurnSummary,
  t: Translate
): string => {
  const toolPart = t('activity.tool_count', tools)
  const agentPart = subagents > 0 ? t('activity.subagent_count', subagents) : null
  if (durationMs === null) {
    return agentPart
      ? t('activity.last_turn_untimed', { tools: toolPart, subagents: agentPart })
      : t('activity.last_turn_untimed_no_agents', { tools: toolPart })
  }
  const duration = durationTextOf(durationMs, t)
  return agentPart
    ? t('activity.last_turn', { tools: toolPart, subagents: agentPart, duration })
    : t('activity.last_turn_no_agents', { tools: toolPart, duration })
}

const isSameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString()

/**
 * "Last turn at 14:32, 0:03 min" for a turn that only answered: when it ended says more than a
 * row of zeros. A turn of an earlier day names the day too, so a restored chat does not read as
 * today's. `null` when the messages carried no time at all.
 */
export const answeredTurnTextOf = (
  { durationMs, endedAt }: TurnSummary,
  t: Translate,
  locale: string,
  now: number
): string | null => {
  const duration = durationMs === null ? null : durationTextOf(durationMs, t)
  if (endedAt === null) return duration && t('activity.answered_took', { duration })
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    endedAt
  )
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(endedAt)
  const when = isSameDay(endedAt, now) ? 'at' : 'on'
  return duration
    ? t(`activity.answered_${when}_took`, { date, time, duration })
    : t(`activity.answered_${when}`, { date, time })
}
