import type { Ref } from 'vue'
import {
  AgentdDisconnectedError,
  AgentdTimeoutError,
  type Machine
} from '@/api/services/agentd.service'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'
import { isDesktopApp } from '@/lib/platform'
import { adoptsOn, runningTabsOn } from '@/lib/runningTabs'
import { useWatchedTabsStore } from '@/stores/watchedTabs'
import { newTab, type ChatTabState, type SavedTab } from '@/utils/chatTab'
import { NO_LIVE_BLOCK } from '@/utils/liveStream'

const RECONNECT_FIRST_MS = 250
const RECONNECT_MAX_MS = 30_000

/**
 * Where the app stands with one machine. `delay` is the wait before the next try once a try
 * failed; `null` while nothing failed yet.
 */
type MachineLink =
  | { state: 'attaching'; promise: Promise<void>; delay: number | null }
  | { state: 'attached' }
  | { state: 'waiting'; delay: number; timer: ReturnType<typeof setTimeout> }
  | { state: 'failed'; delay: number }

/** What the chat store lends: its tabs and the steps that reopen one. */
export interface ChatAttachDeps {
  tabs: Ref<ChatTabState[]>
  tabOf: (id: string) => ChatTabState | undefined
  update: (id: string, change: (tab: ChatTabState) => ChatTabState) => void
  start: (tab: ChatTabState) => void
  loadHistory: (id: string) => Promise<void>
  /** Prompts that will not reach Claude go back to the composer. */
  giveBack: (id: string) => void
  /** A prompt Claude took up while nobody listened. */
  forgetDraft: (id: string, uuid: string) => void
}

export const disconnectedNoticeOf = (machine: Machine) =>
  machine
    ? i18n.global.t('chat.disconnected', { machine })
    : i18n.global.t('chat.disconnected_local')

/**
 * Attaching to the tabs whose Claude runs on a machine: on start, after a lost connection, and
 * also to the tabs other apps started there (see `adoptsOn`). Claude outlives the app on every machine,
 * so a tab here is only a view onto it.
 */
export const useChatAttach = ({
  tabs,
  tabOf,
  update,
  start,
  loadHistory,
  giveBack,
  forgetDraft
}: ChatAttachDeps) => {
  const links = new Map<Machine, MachineLink>()

  /**
   * Opens the tabs another app started; a tab opened meanwhile by a second ask is left out, since
   * every answer was computed against the tabs from before its own wait.
   */
  const openAdopted = (adopted: SavedTab[]): ChatTabState[] => {
    const watchedTabs = useWatchedTabsStore()
    const opened = adopted
      .filter((tab) => !tabOf(tab.id) && !watchedTabs.isClosed(tab.id))
      .map(newTab)
    if (!opened.length) return opened
    tabs.value = [...tabs.value, ...opened]
    watchedTabs.markAdopted(opened.map((tab) => tab.id))
    return opened
  }

  /** The tabs whose Claude still runs on the machine; where this app adopts, it opens the ones it lacks. */
  const runningOn = async (machine: Machine): Promise<string[]> => {
    const known = new Set(tabs.value.map((tab) => tab.id))
    const { running, adopted } = await runningTabsOn(machine, known)
    openAdopted(adopted)
    return running
  }

  const attachTo = async (machine: Machine) => {
    const running = await runningOn(machine)
    const notice = disconnectedNoticeOf(machine)
    for (const tab of tabs.value.filter((t) => t.machine === machine)) {
      if (tab.notice === notice) update(tab.id, (t) => ({ ...t, notice: null }))
      if (!running.includes(tab.id)) {
        // Claude is gone there; a tab that is starting again keeps its queued prompts.
        if (tab.status === 'ended') giveBack(tab.id)
        continue
      }
      // Messages written while nobody listened are only in the transcript, with every prompt
      // Claude took up meanwhile; the others it echoes once it gets to them.
      tab.pending.forEach((prompt) => forgetDraft(tab.id, prompt.uuid))
      update(tab.id, (t) => ({ ...t, messages: [], pending: [], hasMore: false }))
      void loadHistory(tab.id)
      start(tab)
    }
  }

  /**
   * One attach per machine at a time: a lost bridge socket asks through its `disconnected` events
   * and again once it is back; two would load every history twice.
   */
  const attach = (machine: Machine): Promise<void> => {
    const link = links.get(machine)
    if (link?.state === 'attaching') return link.promise
    if (link?.state === 'waiting') clearTimeout(link.timer)
    const delay = link?.state === 'waiting' || link?.state === 'failed' ? link.delay : null
    const promise = attachTo(machine).then(
      () => void links.set(machine, { state: 'attached' }),
      (error: unknown) => {
        if (delay === null) links.delete(machine)
        else links.set(machine, { state: 'failed', delay })
        throw error
      }
    )
    links.set(machine, { state: 'attaching', promise, delay })
    return promise
  }

  const isRetrying = (machine: Machine) => {
    const link = links.get(machine)
    if (!link || link.state === 'attached') return false
    return link.state !== 'attaching' || link.delay !== null
  }

  // A try still running decides by its own outcome; one already waiting keeps its time.
  const scheduleReconnect = (machine: Machine) => {
    const link = links.get(machine)
    if (!tabs.value.some((tab) => tab.machine === machine)) {
      if (link?.state === 'waiting') clearTimeout(link.timer)
      if (link?.state !== 'attaching') links.delete(machine)
      return
    }
    if (link?.state === 'waiting' || link?.state === 'attaching') return
    const wait = link?.state === 'failed' ? link.delay : RECONNECT_FIRST_MS
    // A failed try is recovered by the next one; the notice already tells the user.
    const timer = setTimeout(() => attach(machine).catch(() => scheduleReconnect(machine)), wait)
    links.set(machine, { state: 'waiting', delay: Math.min(wait * 2, RECONNECT_MAX_MS), timer })
  }

  /** Attaches every machine with tabs here, and `others` besides (see the transport's `onReady`). */
  const attachAll = (others: Machine[]) => {
    for (const machine of new Set([...tabs.value.map((tab) => tab.machine), ...others]))
      attach(machine).catch((error: unknown) => {
        // A machine that is not reachable yet is tried again until its tabs can attach.
        if (error instanceof AgentdDisconnectedError) scheduleReconnect(machine)
        else handleError(error)
      })
  }

  /** Claude keeps running on that machine; the app attaches again once it reaches it. */
  const markDisconnected = (machine: Machine) => {
    const wasRetrying = isRetrying(machine)
    if (links.get(machine)?.state === 'attached') links.delete(machine)
    const notice = disconnectedNoticeOf(machine)
    const wasLive = tabs.value.some((tab) => tab.machine === machine && tab.status !== 'ended')
    tabs.value = tabs.value.map((tab) =>
      tab.machine === machine && tab.status !== 'ended'
        ? {
            ...tab,
            status: 'ended',
            statusBeforeMove: null,
            live: NO_LIVE_BLOCK,
            turn: null,
            permission: null,
            notice
          }
        : tab
    )
    if (wasLive || wasRetrying) scheduleReconnect(machine)
  }

  const adoptStartedOn = async (machine: Machine) => {
    const known = new Set(tabs.value.map((tab) => tab.id))
    const { adopted } = await runningTabsOn(machine, known)
    for (const tab of openAdopted(adopted)) {
      void loadHistory(tab.id)
      start(tab)
    }
  }

  /**
   * Another app started a tab this one has none for: open it too and attach. Only the new ones;
   * attaching again to the others would reload their chats. The event does not say its machine,
   * but only an attached one can have sent it. Each is asked on its own: one that went away
   * meanwhile keeps no other machine's tab closed.
   */
  const adoptStarted = async () => {
    const attached = [...links].flatMap(([machine, link]) =>
      link.state === 'attached' && adoptsOn(machine) ? [machine] : []
    )
    const results = await Promise.allSettled(attached.map(adoptStartedOn))
    for (const result of results) {
      if (result.status === 'fulfilled') continue
      const error: unknown = result.reason
      // Its `disconnected` reattaches it, and that adopts its new tabs as well.
      if (error instanceof AgentdDisconnectedError || error instanceof AgentdTimeoutError) continue
      handleError(error)
    }
  }

  /** This app only watches a tab another app started: closing it here leaves Claude running. */
  const isWatchedOnly = (id: string) => useWatchedTabsStore().isAdopted(id)

  /**
   * Closed here: never opened again while its Claude still runs. The app window marks only a
   * watched one: it stops its own, and one whose stop failed comes back once agentd answers again.
   */
  const forgetClosed = (id: string) => {
    if (!isDesktopApp() || isWatchedOnly(id)) useWatchedTabsStore().markClosed(id)
  }

  /**
   * The app window saves only its own tabs: a watched one comes back by adoption while it still
   * runs, and restored from the saved list it would count as this window's own.
   */
  const isSavedHere = (id: string) => !isDesktopApp() || !isWatchedOnly(id)

  return { attachAll, markDisconnected, adoptStarted, isWatchedOnly, forgetClosed, isSavedHere }
}
