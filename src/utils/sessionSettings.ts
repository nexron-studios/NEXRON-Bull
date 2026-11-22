import type { ClaudeEvent, ProfileDefaults } from '@/types/agentd.type'
import {
  modelList,
  otherPermissionModeList,
  permissionModeList,
  type ChatTabState,
  type OfferedMode,
  type PermissionMode
} from '@/utils/chatTab'
import { modelFamilyOf } from '@/utils/tabInsights'

/** How hard Claude thinks: every level `claude --effort` knows (xhigh since 19.11.2026). */
export const effortList = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof effortList)[number]

export type ModelAlias = (typeof modelList)[number]

/** The settings a chat runs with right now, as far as Bull knows them. */
export interface SessionSettings {
  /** `null`: neither the chat nor its account says which model, Claude Code picks its own */
  model: string | null
  effort: string | null
  mode: PermissionMode
}

export const isPermissionMode = (value: unknown): value is PermissionMode =>
  [...permissionModeList, ...otherPermissionModeList].includes(value as PermissionMode)

export const isEffort = (value: unknown): value is Effort => effortList.includes(value as Effort)

/** What Claude Code says a running chat runs with: `applied` of its `get_settings` answer. */
export interface AppliedSettings {
  /** The level it picked, also its own default; `null`: the model has none (Haiku 4.5) */
  effort: string | null
}

/** Of the `get_settings` answers of one chat, for asking again once Claude took a change. */
export const appliedSettingsKey = (machine: string | null, tabId: string) =>
  ['agentd', 'applied_settings', machine, tabId] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Claude's answer to `get_settings`, checked where it enters; `null` if it names no effort. */
export const appliedSettingsOf = (response: unknown): AppliedSettings | null => {
  if (!isRecord(response) || !isRecord(response.applied)) return null
  const { effort } = response.applied
  if (effort === null) return { effort: null }
  return typeof effort === 'string' ? { effort } : null
}

/**
 * The offered modes after `mode`, once round, as Shift+Tab reaches them; all from any other.
 * `refused`: modes Claude turned down in this chat (auto on a plan without it), skipped like
 * Claude Code skips a mode it does not have.
 */
export const modesAfter = (
  mode: PermissionMode,
  refused: readonly PermissionMode[] = []
): OfferedMode[] => {
  const at = permissionModeList.indexOf(mode as OfferedMode)
  return [
    ...permissionModeList.slice(at + 1),
    ...permissionModeList.slice(0, Math.max(at, 0))
  ].filter((next) => !refused.includes(next))
}

/** The mode Shift+Tab switches to from `mode`; from a mode Bull does not offer, back to asking. */
export const nextModeOf = (
  mode: PermissionMode,
  refused: readonly PermissionMode[] = []
): OfferedMode => modesAfter(mode, refused)[0] ?? 'default'

/**
 * The model a chat runs with: the one Claude last answered with while it is the chosen family
 * (it carries the version, "Opus 5.5"), else the choice.
 */
export const modelInUseOf = (chosen: string | null, answered: string | null): string | null => {
  const isSameFamily = !!chosen && !!answered && modelFamilyOf(chosen) === modelFamilyOf(answered)
  return isSameFamily ? answered : (chosen ?? answered)
}

/** `claude-opus-5-5-20261001` and `claude-opus-5-5[1m]` → `claude-opus-5-5`, as `modelSettings` names it. */
const modelKeyOf = (model: string): string =>
  model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')

/**
 * The `modelSettings` effort of `model`. An alias (`opus`) names no version, so it takes the entry
 * of its family only when the account sets exactly one: with two Opus versions it cannot tell.
 */
const perModelEffortOf = (efforts: Record<string, string>, model: string): string | null => {
  const exact = efforts[modelKeyOf(model)]
  if (exact) return exact
  const family = modelFamilyOf(model)
  if (!family || modelVersionOf(model)) return null
  const ofFamily = Object.entries(efforts).filter(([name]) => modelFamilyOf(name) === family)
  return ofFamily.length === 1 ? (ofFamily[0]?.[1] ?? null) : null
}

/** The account's effort for `model`: its `modelSettings` entry, else the top-level level. */
const accountEffortOf = (defaults: ProfileDefaults | null, model: string | null): string | null => {
  const efforts = defaults?.model_efforts
  const perModel = model && efforts ? perModelEffortOf(efforts, model) : null
  return perModel ?? defaults?.effort ?? null
}

/**
 * What the chat chose, else what its account sets, else Claude Code's own default. The effort
 * Claude reports (`applied`) comes before the account's: it also knows the default of a model,
 * e.g. medium for Sonnet. A chosen effort still wins, since Bull starts Claude with it again
 * (`--effort`). `answered`: the model Claude last answered with, which picks the account's
 * per-model effort while Claude does not run.
 */
export const settingsOf = (
  tab: Pick<ChatTabState, 'model' | 'effort' | 'permissionMode'>,
  defaults: ProfileDefaults | null,
  applied: AppliedSettings | null = null,
  answered: string | null = null
): SessionSettings => {
  const profileMode = defaults?.permission_mode
  const model = tab.model ?? defaults?.model ?? null
  const accountEffort = accountEffortOf(defaults, modelInUseOf(model, answered))
  return {
    model,
    effort: tab.effort ?? (applied ? applied.effort : accountEffort),
    mode: tab.permissionMode ?? (isPermissionMode(profileMode) ? profileMode : 'default')
  }
}

/**
 * `claude-opus-5-5-20261001` → `5.5`, `claude-sonnet-4-20250514` → `4`; `null` for an alias or a
 * name without a version. The date at the end has more digits than a minor version.
 */
export const modelVersionOf = (model: string): string | null => {
  const match = /(?:opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?(?!\d)/i.exec(model)
  if (!match) return null
  return match[2] ? `${match[1]}.${match[2]}` : (match[1] ?? null)
}

/**
 * The chat after a `system` event of Claude that names the mode it really runs in: `status` on
 * every change, `init` with every turn. A mode Claude switched to itself (leaving plan mode) shows
 * there. The mode is kept even when the account chose it, so the chip says what runs and a
 * restart goes on in it. The model is not read back: a refused change fails its request, and an
 * `init` from before the change would undo one that worked.
 */
export const withReportedSettings = (tab: ChatTabState, event: ClaudeEvent): ChatTabState => {
  if (event.parent_tool_use_id || !isPermissionMode(event.permissionMode)) return tab
  return event.permissionMode === tab.permissionMode
    ? tab
    : { ...tab, permissionMode: event.permissionMode }
}
