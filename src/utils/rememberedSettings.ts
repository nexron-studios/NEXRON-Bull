import type { ChatTabState } from '@/utils/chatTab'
import { isPermissionMode } from '@/utils/sessionSettings'

/** What a chat was set to when its tab closed: mode, model and effort, all `null` if unchosen. */
export type ChosenSettings = Pick<ChatTabState, 'model' | 'effort' | 'permissionMode'>

export interface RememberedSettings extends ChosenSettings {
  sessionId: string
}

/** Enough for every session someone reopens from the lists; the oldest goes first. */
export const MAX_REMEMBERED_SESSIONS = 200

const NOTHING_CHOSEN: ChosenSettings = { model: null, effort: null, permissionMode: null }

const hasChoice = ({ model, effort, permissionMode }: ChosenSettings) =>
  model !== null || effort !== null || permissionMode !== null

/**
 * The list after the tab of `sessionId` closed with `chosen`, newest last. A chat with nothing
 * chosen leaves no entry, and drops an older one, so it reopens on the account's defaults.
 */
export const withRemembered = (
  remembered: readonly RememberedSettings[],
  sessionId: string,
  chosen: ChosenSettings,
  cap = MAX_REMEMBERED_SESSIONS
): RememberedSettings[] => {
  const others = remembered.filter((entry) => entry.sessionId !== sessionId)
  if (!hasChoice(chosen)) return others
  const { model, effort, permissionMode } = chosen
  return [...others, { sessionId, model, effort, permissionMode }].slice(-cap)
}

/** The list without a session, e.g. one deleted for good. */
export const withoutSession = (
  remembered: readonly RememberedSettings[],
  sessionId: string
): RememberedSettings[] => remembered.filter((entry) => entry.sessionId !== sessionId)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const rememberedEntryOf = (value: unknown): RememberedSettings[] => {
  if (!isRecord(value) || typeof value.sessionId !== 'string') return []
  const { sessionId, model, effort, permissionMode } = value
  if (!isTextOrNull(model) || !isTextOrNull(effort)) return []
  if (permissionMode !== null && !isPermissionMode(permissionMode)) return []
  return [{ sessionId, model, effort, permissionMode }]
}

/**
 * The list as stored in `localStorage`, checked where it enters: an entry from an older build
 * or edited by hand with a mode Bull does not know is dropped, not handed to Claude.
 */
export const rememberedListOf = (stored: unknown): RememberedSettings[] =>
  Array.isArray(stored) ? stored.flatMap(rememberedEntryOf) : []

/** What a session's tab reopens with: its last choice, or nothing chosen. */
export const rememberedOf = (
  remembered: readonly RememberedSettings[],
  sessionId: string
): ChosenSettings => {
  const entry = remembered.find((candidate) => candidate.sessionId === sessionId)
  if (!entry) return NOTHING_CHOSEN
  const { model, effort, permissionMode } = entry
  return { model, effort, permissionMode }
}
