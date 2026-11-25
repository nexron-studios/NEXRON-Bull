import { computed, markRaw, watch } from 'vue'
import { tryOnScopeDispose, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { agentdService } from '@/api/services/agentd.service'
import BrandAppIcon from '@/components/brand/BrandAppIcon.vue'
import { useNotificationSetting } from '@/composables/useNotificationSetting'
import { useQuota } from '@/composables/useQuota'
import { handleError } from '@/lib/error'
import {
  canShowOsNotification,
  focusWindow,
  isWindowFocused,
  onOsNotificationClick,
  registerOpenAction,
  showOsNotification
} from '@/lib/osNotification'
import { useChatStore } from '@/stores/chat'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import type { AgentdEvent } from '@/types/agentd.type'
import { notificationTextOf } from '@/utils/answerCallouts'
import {
  deliveryOf,
  isEventWanted,
  isRepeat,
  isSameSnapshots,
  notifyKeyOf,
  quotaAlertsOf,
  reasonOf,
  snapshotOf,
  type NotifyReason,
  type QuotaAlert,
  type TabSnapshot
} from '@/utils/notifications'

// Store actions after which the end of a turn is the user's own doing, and the one that starts anew.
// `stopAndWait` stops a tab the user removes or deletes; `clearChat` interrupts the running turn.
const STOP_ACTIONS = new Set(['interrupt', 'switchAccount', 'clearChat', 'stopAndWait'])
const SEND_ACTION = 'send'
const QUEUE_SEND_ACTION = 'queueSend'
/** Per account, the reset time of the 5-hour window last told about; survives a restart. */
const QUOTA_TOLD_KEY = 'bull.notifications.quota_told'
/** A hint in the focused window stays this long (Figma "19b"), a little longer than a plain toast. */
const IN_WINDOW_TOAST_MS = 6_000
/** About the size macOS gives the app icon in a notification banner. Sonner's own sheet sizes the
 * icon unlayered, so only `!` beats it. */
const APP_ICON_CLASS = 'size-10! me-1!'

/** What to tell, about a tab or not; `tabId` is the one the toast's "Open" goes to. */
interface Message {
  tabId: string | null
  title: string
  body: string
}

/** What to tell about a tab: the reason, a line instead of the reason's own, and a fallback. */
interface Telling {
  reason: NotifyReason
  /** Said instead of the reason's line, such as the question an answer ends on */
  body: string | null
  /** Told when the reason itself is switched off, without `body` */
  fallback: NotifyReason | null
}

/** Tells the user when a tab they are not looking at needs them, finished or failed. */
export const useTabNotifications = () => {
  const chat = useChatStore()
  const { tabs, activeId } = storeToRefs(chat)
  const { settings } = useNotificationSetting()
  const { t, locale } = useI18n()
  const isQuotaWanted = computed(() => isEventWanted(settings.value, 'quota_low', false))
  // Polls only while the switch is on; the sidebar footer may poll the same query anyway.
  const { accounts } = useQuota(isQuotaWanted)
  const quotaTold = useStorage<Record<string, number>>(QUOTA_TOLD_KEY, {})

  // Plain bookkeeping per tab, nothing renders from it.
  const lastSentAt = new Map<string, number>()
  const tabOfNotification = new Map<number, string>()
  /** Permission asks agentd sent again to an attaching app, by request id, with their tab. */
  const replayedAsks = new Map<string, string>()
  const stoppedByUser = new Set<string>()
  /** Tabs whose account is full, with how many messages wait; they go out when the card clears. */
  const waitingTabs = new Map<string, number>()
  /** Tabs whose queue the user sent by hand: no news about their own click. */
  const sentByUser = new Set<string>()
  const limitPolicy = useLimitPolicyStore()
  let nextNotificationId = 1

  // Same array while only streamed text changes, so the watcher below skips those updates.
  const snapshots = computed<TabSnapshot[]>((previous) => {
    const next = tabs.value.map((tab) =>
      snapshotOf(
        tab,
        tab.machine
          ? t('chat.disconnected', { machine: tab.machine })
          : t('chat.disconnected_local')
      )
    )
    return previous && isSameSnapshots(previous, next) ? previous : next
  })

  const titleOf = (id: string) =>
    tabs.value.find((tab) => tab.id === id)?.title || t('chat.new_chat')

  const openTab = (id: string) => {
    if (tabs.value.some((tab) => tab.id === id)) activeId.value = id
  }

  const deliver = async ({ tabId, title, body }: Message): Promise<boolean> => {
    const canUseOs = await canShowOsNotification()
    const isFocused = await isWindowFocused()
    const { background, hasSound } = settings.value
    const delivery = deliveryOf({
      tabId,
      activeId: activeId.value,
      isFocused,
      canUseOs,
      background
    })
    if (!delivery) return false
    if (delivery === 'os') {
      const id = nextNotificationId++
      if (tabId) tabOfNotification.set(id, tabId)
      showOsNotification({ id, title, body, hasSound, hasOpenAction: tabId !== null })
      return true
    }
    // shortcut: in-window toasts play no sound; add one if the user misses it there.
    toast(title, {
      description: body,
      // The system notification carries the app icon; its stand-in in the window does too.
      icon: markRaw(BrandAppIcon),
      classes: { icon: APP_ICON_CLASS },
      // Shown while the user is away: it waits until dismissed instead of expiring unseen.
      duration: isFocused ? IN_WINDOW_TOAST_MS : Number.POSITIVE_INFINITY,
      closeButton: !isFocused,
      action: tabId ? { label: t('notifications.open'), onClick: () => openTab(tabId) } : undefined
    })
    return true
  }

  const wantedOf = (tabId: string, { reason, body, fallback }: Telling) => {
    const isMuted = tabs.value.find((tab) => tab.id === tabId)?.isMuted ?? false
    if (isEventWanted(settings.value, reason, isMuted)) return { reason, body }
    if (fallback && isEventWanted(settings.value, fallback, isMuted))
      return { reason: fallback, body: null }
    return null
  }

  const notify = async (tabId: string, telling: Telling, now: number) => {
    const wanted = wantedOf(tabId, telling)
    if (!wanted) return
    const { reason, body } = wanted
    const key = notifyKeyOf(tabId, reason)
    const previous = lastSentAt.get(key)
    if (isRepeat(previous, now)) return
    // Claimed across the await so a burst meanwhile counts as a repeat; released if nobody was told.
    lastSentAt.set(key, now)
    const message = {
      tabId,
      title: titleOf(tabId),
      body: body ?? t(`notifications.reason.${reason}`)
    }
    if (await deliver(message)) return
    if (previous === undefined) lastSentAt.delete(key)
    else lastSentAt.set(key, previous)
  }

  const forget = (tabId: string) => {
    for (const key of lastSentAt.keys()) if (key.startsWith(`${tabId}:`)) lastSentAt.delete(key)
    for (const [id, tab] of tabOfNotification) if (tab === tabId) tabOfNotification.delete(id)
    for (const [request, tab] of replayedAsks) if (tab === tabId) replayedAsks.delete(request)
    stoppedByUser.delete(tabId)
    waitingTabs.delete(tabId)
    sentByUser.delete(tabId)
  }

  const check = (before: TabSnapshot, after: TabSnapshot, now: number) => {
    const isReplay = after.requestId !== null && replayedAsks.delete(after.requestId)
    const reason = reasonOf(before, after, {
      isReplay,
      isStoppedByUser: stoppedByUser.has(after.id)
    })
    if (after.status === 'idle' || after.status === 'ended') stoppedByUser.delete(after.id)
    if (!reason) return
    // A question from an ask has its own card; one an answer ends on is said in the notification,
    // and someone who wants finished turns but no questions still hears that the turn finished.
    const isAnswerQuestion = reason === 'question' && !after.requestId && !!after.openQuestion
    const telling = isAnswerQuestion
      ? {
          reason,
          body: notificationTextOf(after.openQuestion ?? ''),
          fallback: 'finished' as const
        }
      : { reason, body: null, fallback: null }
    notify(after.id, telling, now).catch(handleError)
  }

  watch(snapshots, (after, before) => {
    const now = Date.now()
    const previous = new Map(before.map((snapshot) => [snapshot.id, snapshot]))
    for (const snapshot of after) {
      const old = previous.get(snapshot.id)
      previous.delete(snapshot.id)
      if (old) check(old, snapshot, now)
    }
    // What is left was closed.
    for (const id of previous.keys()) forget(id)
  })

  const tellQuota = async (alert: QuotaAlert) => {
    // Remembered first: the next poll must not tell the same window while this one is on its way.
    const previous = quotaTold.value
    quotaTold.value = { ...previous, [alert.key]: alert.resetsAt }
    try {
      await deliver({
        tabId: null,
        title: t('notifications.quota_low.title', { account: alert.label }),
        body: t('notifications.quota_low.body', { percent: alert.percent })
      })
    } catch (error) {
      // Not told after all: the next poll tries again.
      quotaTold.value = previous
      throw error
    }
  }

  // Also when the switch turns on: numbers already over the line are told then.
  watch([accounts, isQuotaWanted], ([current, isWanted]) => {
    if (!isWanted) return
    const alerts = quotaAlertsOf(current, quotaTold.value, Date.now())
    for (const alert of alerts) tellQuota(alert).catch(handleError)
  })

  const tellQueueSent = (tabId: string) => {
    const isMuted = tabs.value.find((tab) => tab.id === tabId)?.isMuted ?? false
    if (!limitPolicy.notifyQueueSent || !settings.value.isOn || isMuted) return
    deliver({ tabId, title: titleOf(tabId), body: t('notifications.queue_sent') }).catch(
      handleError
    )
  }

  const onLimit = (event: Extract<AgentdEvent, { type: 'limit' }>) => {
    if (event.state.kind === 'waiting') {
      waitingTabs.set(event.tab, event.state.queue.length)
      return
    }
    const waiting = waitingTabs.get(event.tab) ?? 0
    const isOwnClick = sentByUser.delete(event.tab)
    waitingTabs.delete(event.tab)
    // A move takes the messages along to the other account; that is no reset.
    if (waiting > 0 && !isOwnClick && event.state.kind === 'none') tellQueueSent(event.tab)
  }

  const onAgentdEvent = (event: AgentdEvent) => {
    if (event.type === 'limit') return onLimit(event)
    if (event.type !== 'claude' || event.event.replay !== true) return
    replayedAsks.set(String(event.event.request_id), event.tab)
  }

  const stopAgentd = agentdService.onEvent(onAgentdEvent)
  const stopActions = chat.$onAction(({ name, args }) => {
    const id = String(args[0])
    if (name === QUEUE_SEND_ACTION) sentByUser.add(id)
    if (STOP_ACTIONS.has(name)) stoppedByUser.add(id)
    else if (name === SEND_ACTION) stoppedByUser.delete(id)
  })

  // The button keeps the label it was registered with, so a language switch registers it again.
  watch(locale, () => registerOpenAction(t('notifications.open')).catch(handleError), {
    immediate: true
  })
  // A click brings Bull forward, also for news of no tab such as the quota.
  const stopClicks = onOsNotificationClick((id) => {
    focusWindow().catch(handleError)
    const tabId = tabOfNotification.get(id)
    if (tabId) openTab(tabId)
  }).catch((error: unknown) => {
    handleError(error)
    return () => {}
  })

  tryOnScopeDispose(() => {
    stopAgentd()
    stopActions()
    void stopClicks.then((stop) => stop())
  })
}
