import type { Machine } from '@/api/services/agentd.service'
import type { SessionSummaryProps } from '@/types/agentd.type'
import { sessionKeyOf } from '@/utils/sessionList'

/** Sessions removed from Bull's lists, by key, with when (ms); the transcripts stay on disk. */
export type HiddenSessions = Record<string, number>

/** Old entries only cost storage: `recent` lists the newest 30 sessions per machine anyway. */
export const MAX_HIDDEN_SESSIONS = 500

/** Per machine, account and session: a moved session's copy on another account is its own entry. */
export const hiddenKeyOf = (machine: Machine, account: string, sessionId: string): string =>
  `${machine ?? ''}|${sessionKeyOf(account, sessionId)}`

export const withHidden = (hidden: HiddenSessions, keys: string[], now: number): HiddenSessions => {
  const next = { ...hidden, ...Object.fromEntries(keys.map((key) => [key, now])) }
  const entries = Object.entries(next)
  if (entries.length <= MAX_HIDDEN_SESSIONS) return next
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_HIDDEN_SESSIONS))
}

export const withoutHidden = (hidden: HiddenSessions, keys: string[]): HiddenSessions => {
  const gone = new Set(keys)
  return Object.fromEntries(Object.entries(hidden).filter(([key]) => !gone.has(key)))
}

/** The sessions of one machine that are still listed. */
export const visibleSessionsOf = (
  hidden: HiddenSessions,
  machine: Machine,
  sessions: SessionSummaryProps[]
): SessionSummaryProps[] =>
  sessions.filter(
    (session) => !(hiddenKeyOf(machine, session.account, session.session_id) in hidden)
  )
