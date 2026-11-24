import { openQuestionOf } from '@/utils/answerCallouts'
import { isBusyStatus, shownStatusOf, type ChatTabState, type TabStatus } from '@/utils/chatTab'
import { leftPercentOf } from '@/utils/percent'
import { accountKeyOf, windowOf, type MachineQuota } from '@/utils/quota'

export const notifyReasonList = ['approval', 'question', 'plan', 'finished', 'failed'] as const
export type NotifyReason = (typeof notifyReasonList)[number]

/** Everything that can be switched on or off: what a tab tells, and a quota running low. */
export const notifyEventList = [...notifyReasonList, 'quota_low'] as const
export type NotifyEvent = (typeof notifyEventList)[number]

/** `os`: a system notification, `toast`: inside the window. */
export const notifyDeliveryList = ['os', 'toast'] as const
export type NotifyDelivery = (typeof notifyDeliveryList)[number]

export interface NotificationSettings {
  isOn: boolean
  events: Record<NotifyEvent, boolean>
  /** How to tell while Bull is in the background; in front it is always a toast. */
  background: NotifyDelivery
  hasSound: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  isOn: false,
  events: {
    approval: true,
    question: true,
    plan: true,
    finished: true,
    failed: true,
    quota_low: false
  },
  background: 'os',
  hasSound: false
}

/** The settings before there were any: the one on/off switch, saved as `"true"` or `"false"`. */
export const settingsOfLegacy = (legacy: string | null): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  isOn: legacy === 'true'
})

/** What came from storage, with every field this version knows; unknown values fall back. */
export const withSettingDefaults = (
  saved: Partial<NotificationSettings> | null,
  defaults: NotificationSettings
): NotificationSettings => {
  // Storage holds whatever was written there, `null` included.
  const stored = saved ?? {}
  return {
    isOn: typeof stored.isOn === 'boolean' ? stored.isOn : defaults.isOn,
    events: Object.fromEntries(
      notifyEventList.map((event) => {
        const value = stored.events?.[event]
        return [event, typeof value === 'boolean' ? value : defaults.events[event]]
      })
    ) as Record<NotifyEvent, boolean>,
    background: notifyDeliveryList.includes(stored.background as NotifyDelivery)
      ? (stored.background as NotifyDelivery)
      : defaults.background,
    hasSound: typeof stored.hasSound === 'boolean' ? stored.hasSound : defaults.hasSound
  }
}

/** The user wants to hear about this event, and not from a chat they muted. */
export const isEventWanted = (
  settings: NotificationSettings,
  event: NotifyEvent,
  isMuted: boolean
): boolean => settings.isOn && settings.events[event] && !isMuted

/** Nothing would ever notify: the bell shows as off. */
export const isAllOff = (settings: NotificationSettings): boolean =>
  !settings.isOn || notifyEventList.every((event) => !settings.events[event])

/** The fields of a tab that decide whether something happened worth telling. */
export interface TabSnapshot {
  id: string
  /** As the user sees it: background agents or shells still running count as working */
  status: TabStatus
  /** Claude's own turn is over (idle or ended), whatever still runs in the background */
  isTurnOver: boolean
  /** When the chat last finished (`withTurnClock`); a new value is a new "finished" */
  finishedAt: number | null
  /** Request id of the open permission ask, if any */
  requestId: string | null
  toolName: string | null
  notice: string | null
  /** The notice is the app's "connection lost"; Claude keeps running on that machine. */
  isDisconnected: boolean
  /** The question the last answer ends on (`> [!question]`), until the user answers */
  openQuestion: string | null
}

/** What the composable knows beyond the two snapshots. */
export interface ReasonContext {
  /** agentd sent this ask again to an attaching app; the user heard of it before. */
  isReplay: boolean
  /** The user stopped or interrupted this turn themselves. */
  isStoppedByUser: boolean
}

/** A burst of events within this window gives one notification per tab and reason. */
export const NOTIFY_REPEAT_MS = 5_000

const QUESTION_TOOL = 'AskUserQuestion'
const PLAN_TOOL = 'ExitPlanMode'

export const snapshotOf = (tab: ChatTabState, disconnectedNotice: string | null): TabSnapshot => ({
  id: tab.id,
  status: shownStatusOf(tab),
  isTurnOver: tab.status === 'idle' || tab.status === 'ended',
  finishedAt: tab.finishedAt,
  requestId: tab.permission?.requestId ?? null,
  toolName: tab.permission?.toolName ?? null,
  notice: tab.notice,
  isDisconnected: tab.notice !== null && tab.notice === disconnectedNotice,
  openQuestion: openQuestionOf(tab)
})

/** True when nothing a notification depends on changed, e.g. after a streaming delta. */
export const isSameSnapshots = (before: TabSnapshot[], after: TabSnapshot[]): boolean =>
  before.length === after.length &&
  before.every((snapshot, index) => {
    const other = after[index]
    return (
      snapshot.id === other.id &&
      snapshot.status === other.status &&
      snapshot.isTurnOver === other.isTurnOver &&
      snapshot.finishedAt === other.finishedAt &&
      snapshot.requestId === other.requestId &&
      snapshot.notice === other.notice &&
      snapshot.isDisconnected === other.isDisconnected &&
      snapshot.openQuestion === other.openQuestion
    )
  })

/** Which kind of answer an open permission ask wants. */
export const askReasonOf = (toolName: string | null): NotifyReason => {
  if (toolName === QUESTION_TOOL) return 'question'
  if (toolName === PLAN_TOOL) return 'plan'
  return 'approval'
}

const outcomeOf = (before: TabSnapshot, after: TabSnapshot): NotifyReason | null => {
  // A lost connection is no failure: Claude keeps running there and the app attaches again.
  if (after.isDisconnected) return null
  // An error result or an agentd error, also while starting.
  if (after.notice && after.notice !== before.notice && after.status !== 'ended') return 'failed'
  // Ending in the middle of a turn, or while starting, was not asked for.
  if (after.status === 'ended' && isBusyStatus(before.status)) return 'failed'
  // The chat finished: the same moment it gets its finish number, so neither the reply to a
  // subagent's report nor a turn that left background work running tells the user it is done.
  // An answer that ends on a question needs the user, not just their attention.
  if (after.finishedAt !== null && after.finishedAt !== before.finishedAt)
    return after.openQuestion ? 'question' : 'finished'
  return null
}

/** What changed between two states of one tab that the user should hear about, if anything. */
export const reasonOf = (
  before: TabSnapshot,
  after: TabSnapshot,
  context: ReasonContext
): NotifyReason | null => {
  if (after.requestId && after.requestId !== before.requestId)
    return context.isReplay ? null : askReasonOf(after.toolName)
  return context.isStoppedByUser ? null : outcomeOf(before, after)
}

export interface DeliveryContext {
  /** The tab it is about; `null` for news of no tab, such as a quota */
  tabId: string | null
  activeId: string | null
  isFocused: boolean
  canUseOs: boolean
  background: NotifyDelivery
}

/**
 * Where to tell it: never for the tab the user is looking at. An unfocused window gets what the
 * user picked for the background; without system notifications that is an in-app toast, which is
 * waiting when the user comes back.
 */
export const deliveryOf = ({
  tabId,
  activeId,
  isFocused,
  canUseOs,
  background
}: DeliveryContext): NotifyDelivery | null => {
  if (!isFocused) return background === 'os' && canUseOs ? 'os' : 'toast'
  return tabId !== null && tabId === activeId ? null : 'toast'
}

export const notifyKeyOf = (tabId: string, reason: NotifyReason): string => `${tabId}:${reason}`

/** True while the same tab and reason were told less than `NOTIFY_REPEAT_MS` ago. */
export const isRepeat = (lastAt: number | undefined, now: number): boolean =>
  lastAt !== undefined && now - lastAt < NOTIFY_REPEAT_MS

/** From this share of the 5-hour window on, the quota counts as low. */
export const QUOTA_ALERT_PERCENT = 80
/**
 * The next 5-hour window resets about five hours later; a reset time that moved less than this is
 * the same window reported again with a slightly different time.
 */
const SAME_WINDOW_MS = 60 * 60 * 1000

export interface QuotaAlert {
  /** Who the account is (`accountKeyOf`); the key under which the alert is remembered */
  key: string
  label: string
  percent: number
  /** When this 5-hour window resets (ms) */
  resetsAt: number
}

/**
 * Accounts whose 5-hour window reached `QUOTA_ALERT_PERCENT` and were not told in this window yet.
 * `told` holds, per account key, the reset time of the window last told about. A window that reset
 * before `now` is old data (a cached poll, an offline machine) and says nothing about the quota.
 */
export const quotaAlertsOf = (
  accounts: MachineQuota[],
  told: Record<string, number>,
  now: number
): QuotaAlert[] =>
  accounts.flatMap((account) => {
    const window = windowOf(account, 'five_hour')
    if (!window?.resets_at || window.used_percent < QUOTA_ALERT_PERCENT) return []
    const resetsAt = Date.parse(window.resets_at)
    const key = accountKeyOf(account)
    const last = told[key]
    if (Number.isNaN(resetsAt) || resetsAt <= now) return []
    if (last !== undefined && resetsAt - last < SAME_WINDOW_MS) return []
    return [
      {
        key,
        label: account.label,
        percent: Math.round(leftPercentOf(window.used_percent)),
        resetsAt
      }
    ]
  })
