import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'
import { startRefusalNoticeOf } from '@/lib/worktreeText'
import { queryClient } from '@/lib/queryClient'
import { disconnectedNoticeOf, useChatAttach } from '@/stores/chatAttach'
import { useConnectorSetupStore } from '@/stores/connectorSetup'
import { useDraftStore } from '@/stores/drafts'
import { useHeldPromptsStore } from '@/stores/heldPrompts'
import { useHiddenSessionsStore } from '@/stores/hiddenSessions'
import { useImageNameStore } from '@/stores/imageNames'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import { useRememberedSettingsStore } from '@/stores/rememberedSettings'
import { useShellRunsStore, type ShellRun } from '@/stores/shellRuns'
import { useSlashCommandsStore } from '@/stores/slashCommands'
import { useWorktreeSettingsStore } from '@/stores/worktreeSettings'
import type {
  AfterMove,
  AgentdEvent,
  AgentdRequest,
  PromptBlock,
  ProfileProps,
  SessionSummaryProps
} from '@/types/agentd.type'
import {
  applyEvent,
  hasRepliedThisTurn,
  isBusyStatus,
  newTab,
  savedTabOf,
  stampArrival,
  withAgentNotices,
  withBackgroundTasks,
  withHistory,
  withNewSession,
  withoutPending,
  withPendingPrompt,
  withTurnClock,
  withTurnCut,
  type ChatTabState,
  type PermissionAsk,
  type SavedTab
} from '@/utils/chatTab'
import { apiRetryOf } from '@/utils/apiRetry'
import { buildContent, type PendingImage } from '@/utils/content'
import {
  finishRanksOf,
  finishSortedOf,
  isSameRanks,
  withSeen,
  withUnseen
} from '@/utils/finishOrder'
import { hiddenKeyOf } from '@/utils/hiddenSessions'
import { IMAGE_REF_SLOTS, imageRefFormatOf } from '@/utils/imageRefs'
import { isWaitingTab, withLimit } from '@/utils/limits'
import { moveItem } from '@/utils/order'
import { draftWithUnsent, pendingMessageOf, type SentDraft } from '@/utils/pendingPrompts'
import { shellPromptBlocks } from '@/utils/shellBlocks'
import { parseSlashInput } from '@/utils/slashCommands'
import { withSubagentEvent } from '@/utils/subagentActions'
import {
  agentNoticesOf,
  backgroundTasksOf,
  connectorsOfStatus,
  type Connector
} from '@/utils/tabInsights'

const HISTORY_PAGE = 40
const DENIED_MESSAGE = 'The user denied this tool use.'
/** How image references read in the app's language, for drafts that come back to the composer. */
const imageRefFormat = () => imageRefFormatOf(i18n.global.t('images.reference', IMAGE_REF_SLOTS))
/** What Claude reads when the user turned a call down and said why, as in the terminal. */
const deniedWithReason = (reason: string) =>
  `The user denied this tool use and said what to do instead: ${reason}`
// Said to Claude when the user turns down a plan to change it: stay in plan mode and wait for them.
const PLAN_ADJUST_MESSAGE =
  'The user wants to adjust the plan and will say how in their next message. Stay in plan mode and wait for it.'
/** A machine that does not say within this which tabs run there counts as unreachable. */
const RUNNING_TIMEOUT_MS = 10_000
/** agentd gives up on Claude after 60 s; this only covers a connection that drops meanwhile. */
const CONTROL_TIMEOUT_MS = 70_000

/**
 * Why a tab's chat was left alone: it went on with another session since the user asked, it lost
 * its machine (Claude keeps running there), or Claude still runs there while the app reattaches.
 */
export const clearRefusalList = ['session_changed', 'disconnected', 'still_running'] as const
export type ClearRefusal = (typeof clearRefusalList)[number]

export class ClearRefusedError extends Error {
  readonly reason: ClearRefusal

  constructor(reason: ClearRefusal) {
    super(`clear refused: ${reason}`)
    this.name = 'ClearRefusedError'
    this.reason = reason
  }
}

/** A prompt waiting for Claude to start; `uuid` is its pending message in the tab. */
interface QueuedPrompt {
  uuid: string
  content: PromptBlock[]
}

export const useChatStore = defineStore(
  'chat',
  () => {
    const tabs = ref<ChatTabState[]>([])
    const activeId = ref<string | null>(null)
    // Messages typed while Claude was still starting; sent once it reports `started`. Reactive, so
    // the pane can tell a chat with a prompt on the way from an empty one.
    const queued = ref(new Map<string, QueuedPrompt[]>())
    // What the user typed for each pending prompt, by its uuid; goes back into the composer if
    // the prompt never reaches Claude. Plain map: images are whole data URLs.
    const sentDrafts = new Map<string, SentDraft>()
    // Pending prompts that carry `!` output. Claude Code reads them but never echoes them (bash
    // tags, checked with 2.1.327), so they would wait for an echo forever.
    const unechoed = new Set<string>()
    // The `!` runs each pending prompt took along; they go back to the chat if it never gets out.
    const sentShell = new Map<string, ShellRun[]>()

    const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value) ?? null)
    /**
     * Finished tabs not seen yet: tab id → number in the finish order, ① the newest. The same Map
     * while only streamed text changes, so the rows and tabs reading it skip those updates.
     */
    const finishRanks = computed<Map<string, number>>((previous) => {
      const next = finishRanksOf(tabs.value)
      return previous && isSameRanks(previous, next) ? previous : next
    })

    const update = (id: string, change: (tab: ChatTabState) => ChatTabState) => {
      tabs.value = tabs.value.map((tab) => {
        if (tab.id !== id) return tab
        const next = change(tab)
        // `/clear` moves the tab to a new session; the one it leaves can still be reopened.
        if (tab.sessionId && next.sessionId !== tab.sessionId)
          useRememberedSettingsStore().remember(tab.sessionId, tab)
        return next
      })
    }
    const tabOf = (id: string) => tabs.value.find((tab) => tab.id === id)
    /** Every request about a tab goes to the machine its session runs on. */
    const toTab = (id: string, message: AgentdRequest) =>
      agentdService.send(message, tabOf(id)?.machine ?? null)

    /**
     * Prompts that will not reach Claude (all pending ones without `uuids`) leave the chat and go
     * back into the composer, so nothing typed is lost.
     */
    const giveBack = (id: string, uuids?: string[]) => {
      const tab = tabOf(id)
      const back = tab?.pending.filter((prompt) => !uuids || uuids.includes(prompt.uuid)) ?? []
      if (!uuids) queued.value.delete(id)
      if (!back.length) return
      const draft = useDraftStore().draftOf(id)
      const unsent = back.flatMap((prompt) => sentDrafts.get(prompt.uuid) ?? [])
      Object.assign(draft, draftWithUnsent(draft, unsent, imageRefFormat()))
      back.forEach((prompt) => sentDrafts.delete(prompt.uuid))
      useShellRunsStore().putBack(
        id,
        back.flatMap((prompt) => sentShell.get(prompt.uuid) ?? [])
      )
      back.forEach((prompt) => forgetShell(prompt.uuid))
      update(id, (t) => withoutPending(t, new Set(back.map((prompt) => prompt.uuid))))
    }

    // Image names outlive the app only under a session id: a new tab gets one once Claude started,
    // a `/clear` only with the next init. So they are remembered again once Claude took the prompt.
    const rememberImageNames = (id: string, uuid: string) => {
      const tab = tabOf(id)
      const draft = sentDrafts.get(uuid)
      if (!tab || !draft) return
      const scope = { tabId: id, machine: tab.machine, sessionId: tab.sessionId }
      useImageNameStore().remember(scope, draft.text, draft.images)
    }

    /** A prompt Claude took up: its image names under the session it landed in, then its draft goes. */
    const forgetDraft = (id: string, uuid: string) => {
      rememberImageNames(id, uuid)
      sentDrafts.delete(uuid)
      forgetShell(uuid)
    }

    const forgetShell = (uuid: string) => {
      sentShell.delete(uuid)
      unechoed.delete(uuid)
    }

    /** Drops the drafts of prompts the tab no longer waits for: echoed or taken back. */
    const forgetSettled = (id: string, before: ChatTabState['pending']) => {
      const waiting = new Set(tabOf(id)?.pending.map((prompt) => prompt.uuid))
      for (const prompt of before) if (!waiting.has(prompt.uuid)) forgetDraft(id, prompt.uuid)
    }

    const sendNow = (id: string, { uuid, content }: QueuedPrompt) =>
      toTab(id, { op: 'send', tab: id, content }).catch((error: unknown) => {
        handleError(error)
        giveBack(id, [uuid])
      })

    /** A planned worktree is named after the prompt that starts Claude: the first one waiting. */
    const worktreePlanOf = (tab: ChatTabState) => {
      if (!tab.isWorktreePlanned) return null
      const first = queued.value.get(tab.id)?.[0]
      const hint = (first && sentDrafts.get(first.uuid)?.text) ?? ''
      return { hint, root: useWorktreeSettingsStore().rootOrDefault(tab.machine) }
    }

    const start = (tab: ChatTabState) => {
      update(tab.id, (t) => ({ ...t, status: 'starting', notice: null }))
      const payload = {
        tab: tab.id,
        profile: tab.profile,
        cwd: tab.cwd,
        resume: tab.sessionId,
        model: tab.model,
        permission_mode: tab.permissionMode,
        is_fresh: tab.isFresh,
        effort: tab.effort,
        worktree: worktreePlanOf(tab)
      }
      agentdService.send({ op: 'start', ...payload }, tab.machine).catch((error: unknown) => {
        handleError(error)
        giveBack(tab.id)
        update(tab.id, (t) => ({ ...t, statusBeforeMove: null }))
      })
    }

    const flushQueue = (id: string) => {
      const waiting = queued.value.get(id) ?? []
      if (!waiting.length) return
      for (const prompt of waiting) rememberImageNames(id, prompt.uuid)
      // The prompts are on their way: the turn runs from here, as after a direct send.
      update(id, (t) => withTurnClock({ ...t, status: 'working', notice: null }, Date.now()))
      for (const prompt of waiting) void sendNow(id, prompt)
      queued.value.delete(id)
    }

    /** A prompt waits for Claude to start in this tab. */
    const hasQueued = (id: string) => !!queued.value.get(id)?.length

    /** Messages held while Claude worked go back into the composer: stopped or gone, not sent. */
    const giveBackHeld = (id: string) => {
      const held = useHeldPromptsStore().takeAll(id)
      if (!held.length) return
      const draft = useDraftStore().draftOf(id)
      Object.assign(draft, draftWithUnsent(draft, held, imageRefFormat()))
    }

    // Claude finished: what was typed meanwhile goes out now, one right after the other; Claude
    // takes the later ones into the same turn. A turn that ended at the limit queues them there.
    const flushHeld = (id: string) => {
      for (const prompt of useHeldPromptsStore().takeAll(id))
        if (!queueForLimit(id, prompt.text, prompt.images)) dispatch(id, prompt.text, prompt.images)
    }

    // The sidebar lists today's sessions from `recent`; a closed tab or a finished turn changes it.
    const refreshRecent = (machine: Machine) =>
      void queryClient.invalidateQueries({ queryKey: ['agentd', 'recent', machine] })

    /** Claude answers: it took the prompts it does not echo, so they become messages as sent. */
    const settleUnechoed = (id: string, event: AgentdEvent) => {
      const isAnswer =
        (event.type === 'message' && event.message.role === 'assistant') ||
        (event.type === 'claude' && event.event.type === 'result')
      if (!isAnswer) return
      for (const prompt of tabOf(id)?.pending.filter(({ uuid }) => unechoed.has(uuid)) ?? []) {
        unechoed.delete(prompt.uuid)
        update(id, (tab) => applyEvent(tab, { type: 'message', tab: id, message: prompt }))
      }
    }

    const onEvent = (event: AgentdEvent) => {
      if (event.type === 'disconnected') return attach.markDisconnected(event.machine)
      if (!('tab' in event) || !event.tab) return
      const id = event.tab
      if (event.type === 'started' && !tabOf(id)) return void attach.adoptStarted()
      const now = Date.now()
      const wasBusy = !!tabOf(id)?.turn
      const pendingBefore = tabOf(id)?.pending ?? []
      // Claude is gone or refused the last request: what it has not taken up never reaches it.
      const isRefused = event.type === 'error' || event.type === 'worktree_refused'
      if (event.type === 'exited' || isRefused) giveBack(id)
      if (event.type === 'exited') giveBackHeld(id)
      settleUnechoed(id, event)
      update(id, (tab) => withTurnClock(applyEvent(tab, stampArrival(event, now)), now))
      if (event.type === 'worktree_refused')
        update(id, (tab) => ({ ...tab, notice: startRefusalNoticeOf(event) }))
      forgetSettled(id, pendingBefore)
      const notices = event.type === 'claude' ? agentNoticesOf(event.event, now) : []
      // Most events carry none; skip the second pass over all tabs for them.
      if (notices.length) update(id, (tab) => withAgentNotices(tab, notices))
      // An exited Claude took its background agents and shells along; a restart lists none of them.
      const tasks =
        event.type === 'claude'
          ? backgroundTasksOf(event.event)
          : event.type === 'exited'
            ? { active: [] }
            : null
      if (tasks) update(id, (tab) => withBackgroundTasks(tab, tasks, now))
      const live =
        event.type === 'claude'
          ? withSubagentEvent(tabOf(id)?.liveSubagents ?? {}, event.event, now)
          : null
      if (live) update(id, (tab) => ({ ...tab, liveSubagents: live }))
      const retry = event.type === 'claude' ? apiRetryOf(event.event, now) : null
      if (retry) update(id, (tab) => ({ ...tab, retry }))
      if (event.type === 'limit') update(id, (tab) => withLimit(tab, event.state, now))
      if (event.type === 'started') flushQueue(id)
      const tab = tabOf(id)
      if (tab && wasBusy && tab.turn === null) {
        refreshRecent(tab.machine)
        // A turn that failed (the limit itself) is agentd's to handle; a second move would race it.
        if (tab.moveAfterTurn && !tab.notice) moveNow(id, tab.moveAfterTurn)
        else if (tab.moveAfterTurn) update(id, (t) => ({ ...t, moveAfterTurn: null }))
      }
      if (tab?.status === 'idle') flushHeld(id)
    }

    const openNew = (fields: Omit<SavedTab, 'id' | 'title' | 'sessionId' | 'isFresh'>) => {
      const tab = newTab({
        ...fields,
        id: crypto.randomUUID(),
        title: '',
        sessionId: null,
        isFresh: true
      })
      tabs.value = [...tabs.value, tab]
      activeId.value = tab.id
      if (!tab.isWorktreePlanned) start(tab)
    }

    const loadHistory = async (id: string) => {
      const tab = tabOf(id)
      if (!tab?.sessionId) return
      update(id, (t) => ({ ...t, history: 'loading' }))
      try {
        const page = await agentdService.ask<'history'>(
          {
            op: 'history',
            profile: tab.profile,
            session_id: tab.sessionId,
            before: tab.messages[0]?.uuid ?? null,
            limit: HISTORY_PAGE,
            is_fresh: tab.isFresh
          },
          tab.machine
        )
        update(id, (t) => ({ ...withHistory(t, page.messages, page.has_more), history: 'loaded' }))
      } catch (error) {
        update(id, (t) => ({ ...t, history: 'failed' }))
        handleError(error)
      }
    }

    const attach = useChatAttach({ tabs, tabOf, update, start, loadHistory, giveBack, forgetDraft })

    const resume = (session: SessionSummaryProps, machine: Machine) => {
      // Continued on purpose: it belongs in the lists again once its tab closes.
      useHiddenSessionsStore().unhide([hiddenKeyOf(machine, session.account, session.session_id)])
      const open = tabs.value.find(
        (tab) => tab.sessionId === session.session_id && tab.machine === machine
      )
      if (open) {
        activeId.value = open.id
        return
      }
      const fields = {
        id: crypto.randomUUID(),
        title: session.title,
        profile: session.profile,
        account: session.account,
        cwd: session.cwd,
        machine,
        sessionId: session.session_id,
        ...useRememberedSettingsStore().settingsFor(session.session_id),
        isFresh: false
      }
      tabs.value = [...tabs.value, newTab(fields)]
      activeId.value = fields.id
    }

    /**
     * `!` commands run since the last prompt go in front of it, as Claude Code does. A slash
     * command must stay first in its prompt, so they wait for the next one.
     */
    const shellRunsFor = (id: string, text: string): ShellRun[] =>
      parseSlashInput(text) ? [] : useShellRunsStore().takeDone(id)

    /** agentd keeps it for the reset and lists it on the waiting card; no echo comes before that. */
    const queueForLimit = (id: string, text: string, images: PendingImage[]): boolean => {
      const tab = tabOf(id)
      if (!tab || !isWaitingTab(tab) || !useLimitPolicyStore().policy.queue) return false
      toTab(id, { op: 'send', tab: id, content: buildContent(text, images) }).catch(handleError)
      return true
    }

    /** While Claude works a message waits above the composer, still open to change. */
    const send = (id: string, text: string, images: PendingImage[]) => {
      const tab = tabOf(id)
      if (!tab) return
      if (queueForLimit(id, text, images)) return
      if (tab.status === 'working' || tab.status === 'asking')
        return useHeldPromptsStore().hold(id, { text, images })
      dispatch(id, text, images)
    }

    const dispatch = (id: string, text: string, images: PendingImage[]) => {
      const tab = tabOf(id)
      if (!tab) return
      const runs = shellRunsFor(id, text)
      const content = [...runs.flatMap(shellPromptBlocks), ...buildContent(text, images)]
      const now = Date.now()
      const prompt = pendingMessageOf(content, crypto.randomUUID(), now, hasRepliedThisTurn(tab))
      if (runs.length) {
        sentShell.set(prompt.uuid, runs)
        unechoed.add(prompt.uuid)
      }
      sentDrafts.set(prompt.uuid, { text, images })
      rememberImageNames(id, prompt.uuid)
      update(id, (t) => withPendingPrompt(t, prompt))
      const entry = { uuid: prompt.uuid, content }
      if (tab.status === 'ended' || tab.status === 'starting') {
        queued.value.set(id, [...(queued.value.get(id) ?? []), entry])
        if (tab.status === 'ended') start(tab)
        return
      }
      update(id, (t) => withTurnClock({ ...t, status: 'working', notice: null }, now))
      void sendNow(id, entry)
    }

    /**
     * Sends text Claude Code takes as a command (`/compact …`). Claude echoes no prompt for it, so
     * nothing waits in the chat for an echo; the turn shows as running until its result.
     */
    const sendCommand = (id: string, text: string) => {
      const tab = tabOf(id)
      if (!tab) return
      const entry = { uuid: crypto.randomUUID(), content: [{ type: 'text' as const, text }] }
      if (tab.status === 'ended' || tab.status === 'starting') {
        queued.value.set(id, [...(queued.value.get(id) ?? []), entry])
        if (tab.status === 'ended') start(tab)
        return
      }
      update(id, (t) => withTurnClock({ ...t, status: 'working', notice: null }, Date.now()))
      void sendNow(id, entry)
    }

    /** Resolves once Claude runs in the tab, starting it if it ended. */
    const ensureStarted = async (id: string) => {
      const tab = tabOf(id)
      if (!tab) throw new Error(`no tab ${id}`)
      if (tab.status !== 'ended' && tab.status !== 'starting') return
      // Its worktree is named after the first prompt; nothing else may make it before that.
      if (tab.isWorktreePlanned && tab.status === 'ended')
        throw new Error(i18n.global.t('worktree.waits_for_prompt'))
      const answer = agentdService.waitFor(
        (e) =>
          'tab' in e &&
          e.tab === id &&
          ['started', 'error', 'exited', 'worktree_refused'].includes(e.type)
      )
      if (tab.status === 'ended') start(tab)
      const event = await answer
      if (event.type === 'error') throw new Error(event.message)
      if (event.type === 'worktree_refused') throw new Error(startRefusalNoticeOf(event))
      if (event.type === 'exited') throw new Error(`Claude in tab ${id} exited`)
    }

    /** A control request to the tab's Claude (`get_context_usage`, `rewind_files`, …); its answer. */
    const askClaude = async (
      id: string,
      request: { subtype: string } & Record<string, unknown>
    ) => {
      const { response } = await agentdService.ask<'control_result'>(
        { op: 'control', tab: id, request },
        tabOf(id)?.machine ?? null,
        CONTROL_TIMEOUT_MS
      )
      return response
    }

    /**
     * The MCP servers Claude has right now; `mcp_status` answers without a turn. A `system/init`
     * that came while it was asked is newer and stays.
     */
    const refreshConnectors = async (id: string): Promise<Connector[]> => {
      const before = tabOf(id)?.connectors
      const connectors = connectorsOfStatus(await askClaude(id, { subtype: 'mcp_status' }))
      if (tabOf(id)?.connectors === before) update(id, (t) => ({ ...t, connectors }))
      return connectors
    }

    /**
     * Claude reads its MCP config again, as `/reload-plugins` does: a server added with
     * `claude mcp add` meanwhile connects without a restart, which `mcp_status` alone would not
     * list. Refused while a turn runs.
     */
    const reloadMcpConfig = (id: string) =>
      askClaude(id, { subtype: 'reload_plugins', refuse_if_busy: true })

    /** Claude starts again in the same session: the chat stays, the config is read anew. */
    const restart = async (id: string) => {
      await stopAndWait(id)
      await ensureStarted(id)
    }

    /** Reads the chat again from the transcript, e.g. after a rewind cut it. */
    const reloadHistory = (id: string) => {
      update(id, (t) => ({ ...t, messages: [], hasMore: false }))
      return loadHistory(id)
    }

    /**
     * Stopped before Claude started: what waits goes back into the composer in the order it was
     * sent. Each one goes in front of the draft, so the last one goes first. Queued slash commands
     * (`/compact …`) have no pending message; only their text goes back.
     */
    const giveBackQueued = (id: string) => {
      const pendingUuids = new Set(tabOf(id)?.pending.map((prompt) => prompt.uuid))
      for (const entry of [...(queued.value.get(id) ?? [])].reverse()) {
        if (pendingUuids.has(entry.uuid)) {
          giveBack(id, [entry.uuid])
          continue
        }
        const text = entry.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
        const draft = useDraftStore().draftOf(id)
        Object.assign(draft, draftWithUnsent(draft, [{ text, images: [] }], imageRefFormat()))
      }
      giveBack(id)
    }

    const interrupt = (id: string) => {
      giveBackHeld(id)
      // Claude has not started yet: stopping takes what waits back into the composer. Claude still
      // starts and then idles; only the prompt is withdrawn.
      if (hasQueued(id)) {
        giveBackQueued(id)
        return Promise.resolve()
      }
      return toTab(id, { op: 'interrupt', tab: id }).catch(handleError)
    }

    /** Ctrl+B: the running call goes on in the background, Claude's turn continues. */
    const sendToBackground = (id: string, toolUseId: string) =>
      toTab(id, { op: 'background', tab: id, tool_use_id: toolUseId }).catch(handleError)

    const decide = (
      id: string,
      decision: (permission: PermissionAsk) => Record<string, unknown>
    ) => {
      const permission = tabOf(id)?.permission
      if (!permission) return
      update(id, (t) => ({ ...t, permission: null, status: 'working' }))
      toTab(id, {
        op: 'permission',
        tab: id,
        request_id: permission.requestId,
        decision: decision(permission)
      }).catch(handleError)
    }

    /** `reason`: what the user typed when turning the call down; Claude reads it. */
    const answer = (id: string, isAllowed: boolean, reason = '') =>
      decide(id, ({ input }) => {
        if (isAllowed) return { behavior: 'allow', updatedInput: input }
        const said = reason.trim()
        return { behavior: 'deny', message: said ? deniedWithReason(said) : DENIED_MESSAGE }
      })

    const adjustPlan = (id: string) =>
      decide(id, () => ({ behavior: 'deny', message: PLAN_ADJUST_MESSAGE }))

    // Claude Code stores the rules it suggested itself ("git push:*"), like "don't ask again".
    const allowAlways = (id: string) =>
      decide(id, ({ input, suggestions }) => ({
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: suggestions
      }))

    // AskUserQuestion is answered through the permission channel: allowed, with the answers added.
    const answerQuestion = (id: string, answers: Record<string, string>) =>
      decide(id, ({ input }) => ({ behavior: 'allow', updatedInput: { ...input, answers } }))

    /** Ends Claude for this tab and resolves once the process is gone. */
    const stopAndWait = async (id: string) => {
      const tab = tabOf(id)
      if (!tab || tab.status === 'ended') return
      const exited = agentdService.waitFor((e) => e.type === 'exited' && e.tab === id)
      // Stopping waits for the current turn; interrupting first ends it right away.
      if (tab.status === 'working' || tab.status === 'asking') await interrupt(id)
      await toTab(id, { op: 'stop', tab: id })
      await exited
    }

    // Replaces claude-takealong: stop, copy the session into the other profile, continue there.
    // agentd copies nothing for a new chat whose transcript Claude has not written yet.
    const switchAccount = async (id: string, profile: ProfileProps) => {
      const tab = tabOf(id)
      if (!tab?.sessionId || tab.profile === profile.dir || tab.statusBeforeMove) return
      const wasBusy = isBusyStatus(tab.status)
      // Until Claude runs in the other account, lists show the chat as it will be (`listedTabOf`):
      // the stop interrupts a turn or an approval, so a busy chat is finished from here on.
      update(id, (t) => ({ ...t, statusBeforeMove: isBusyStatus(t.status) ? 'idle' : t.status }))
      try {
        await stopAndWait(id)
        await agentdService.ask<'moved'>(
          {
            op: 'move_session',
            from: tab.profile,
            to: profile.dir,
            session_id: tab.sessionId,
            is_fresh: tabOf(id)?.isFresh ?? false
          },
          tab.machine
        )
      } catch (error) {
        handleError(error)
        update(id, (t) => ({ ...t, statusBeforeMove: null }))
        return
      }
      // A turn the move interrupted goes on in the other account: the panel keeps it. A finished
      // one does not; the next prompt is something new.
      update(id, (t) => ({
        ...(wasBusy ? withTurnCut(t) : t),
        profile: profile.dir,
        account: profile.label,
        status: 'ended'
      }))
      const moved = tabOf(id)
      if (moved) start(moved)
    }

    /** Moves the chat to another account now; agentd restarts Claude there and reports the move. */
    const limitMove = (id: string, profile: string, then: AfterMove) =>
      toTab(id, { op: 'limit_move', tab: id, profile, then }).catch(handleError)

    const moveNow = (id: string, profile: string) => {
      update(id, (t) => ({ ...t, moveAfterTurn: null, limit: { kind: 'none' } }))
      void limitMove(id, profile, 'ready')
    }

    /** The move suggested at 90 %: right away when Claude is free, else once the turn ends. */
    const moveAfterTurn = (id: string, profile: string) => {
      if (!tabOf(id)?.turn) return moveNow(id, profile)
      update(id, (t) => ({ ...t, moveAfterTurn: profile, limit: { kind: 'none' } }))
    }

    /** "Stay": the suggestion goes away until agentd makes the next one. */
    const dismissLimit = (id: string) => update(id, (t) => ({ ...t, limit: { kind: 'none' } }))

    const queueRemove = (id: string, entry: number) =>
      toTab(id, { op: 'queue_remove', tab: id, entry }).catch(handleError)

    /** Sends the waiting messages now instead of at the reset. */
    const queueSend = (id: string) => toTab(id, { op: 'queue_send', tab: id }).catch(handleError)

    /**
     * Empties the chat of a tab, only while it still shows `sessionId`: `/clear` to a running Claude,
     * a new session in the same tab for a stopped one. The old transcript stays on disk.
     */
    const clearChat = async (id: string, sessionId: string) => {
      const tab = tabOf(id)
      if (!tab || tab.sessionId !== sessionId) throw new ClearRefusedError('session_changed')
      if (tab.status !== 'ended') {
        await agentdService.ask<'cleared'>(
          { op: 'clear', tab: id, session_id: sessionId },
          tab.machine
        )
        return refreshRecent(tab.machine)
      }
      // A lost connection ends the tab here too, but Claude goes on there and comes back with the
      // old session on reattach. Only a Claude that is really gone may be replaced locally.
      if (tab.machine && tab.notice === disconnectedNoticeOf(tab.machine))
        throw new ClearRefusedError('disconnected')
      const { tabs: running } = await agentdService.ask<'running'>(
        { op: 'running' },
        tab.machine,
        RUNNING_TIMEOUT_MS
      )
      if (running.includes(id)) throw new ClearRefusedError('still_running')
      if (tabOf(id)?.sessionId !== sessionId) throw new ClearRefusedError('session_changed')
      update(id, (t) => withNewSession(t, crypto.randomUUID()))
      refreshRecent(tab.machine)
    }

    /** Puts closed tabs back where they were, e.g. when a removal is undone. */
    const restoreTabs = (saved: { tab: SavedTab; index: number }[]) => {
      const next = [...tabs.value]
      for (const { tab, index } of [...saved].sort((a, b) => a.index - b.index))
        if (!next.some((open) => open.id === tab.id)) next.splice(index, 0, newTab(tab))
      tabs.value = next
    }

    const close = (id: string) => {
      const tab = tabOf(id)
      // A tab another app started is that app's chat: the browser only stops watching it.
      if (tab && tab.status !== 'ended' && !attach.isWatchedOnly(id))
        toTab(id, { op: 'stop', tab: id }).catch(handleError)
      attach.forgetClosed(id)
      queued.value.delete(id)
      tab?.pending.forEach((prompt) => sentDrafts.delete(prompt.uuid))
      useDraftStore().discard(id)
      useHeldPromptsStore().takeAll(id)
      useShellRunsStore().forget(id)
      useSlashCommandsStore().forget(id)
      useConnectorSetupStore().set(id, null)
      if (tab?.sessionId) useRememberedSettingsStore().remember(tab.sessionId, tab)
      tabs.value = tabs.value.filter((t) => t.id !== id)
      if (activeId.value === id) activeId.value = tabs.value.at(-1)?.id ?? null
      if (tab) refreshRecent(tab.machine)
    }

    /** The turn that ended at `at` finished while the user looked elsewhere. */
    const markUnseen = (id: string, at: number) => {
      update(id, (tab) => withUnseen(tab, at))
      // Only when a number appears: a drag afterwards stands until the next chat finishes.
      if (tabOf(id)?.unseenAt === at) tabs.value = finishSortedOf(tabs.value)
    }

    /** The user looked at the chat: it leaves the finish order. */
    const markSeen = (id: string) => {
      // Skips the pass over all tabs on every focus change and tab switch.
      const unseenAt = tabOf(id)?.unseenAt ?? null
      if (unseenAt !== null) update(id, withSeen)
    }

    /** The tab order after a drag in the tab bar; saved with the tabs. */
    const reorder = (ids: string[]) => {
      const byId = new Map(tabs.value.map((tab) => [tab.id, tab]))
      const moved = ids.flatMap((id) => byId.get(id) ?? [])
      if (moved.length === tabs.value.length) tabs.value = moved
    }

    /** A muted tab never notifies; saved with the tabs. */
    const setMuted = (id: string, isMuted: boolean) => update(id, (tab) => ({ ...tab, isMuted }))

    /** The window from the context report, or `null` to guess again after a model switch. */
    const setContextWindow = (id: string, contextWindow: number | null) =>
      update(id, (tab) => ({ ...tab, contextWindow }))

    /** One place left or right, the keyboard way of dragging a tab. */
    const moveTab = (id: string, step: -1 | 1) => {
      const from = tabs.value.findIndex((tab) => tab.id === id)
      tabs.value = moveItem(tabs.value, from, from + step)
    }

    agentdService.onEvent(onEvent)
    // Claude outlives the app on every machine; restored tabs pick up where it is now.
    agentdService.onReady(attach.attachAll)

    return {
      tabs,
      activeId,
      activeTab,
      finishRanks,
      openNew,
      resume,
      loadHistory,
      send,
      sendCommand,
      ensureStarted,
      askClaude,
      refreshConnectors,
      reloadMcpConfig,
      restart,
      reloadHistory,
      hasQueued,
      interrupt,
      sendToBackground,
      answer,
      allowAlways,
      adjustPlan,
      answerQuestion,
      switchAccount,
      limitMove,
      moveAfterTurn,
      dismissLimit,
      queueRemove,
      queueSend,
      stopAndWait,
      clearChat,
      setMuted,
      setContextWindow,
      restoreTabs,
      refreshRecent,
      close,
      reorder,
      moveTab,
      markUnseen,
      markSeen
    }
  },
  {
    persist: {
      // Only what reopens a tab; messages come back from the transcript.
      serializer: {
        serialize: (state) =>
          JSON.stringify({
            activeId: state.activeId,
            tabs: (state.tabs as ChatTabState[]).map(savedTabOf)
          }),
        deserialize: (text) => {
          const saved = JSON.parse(text) as { activeId: string | null; tabs: SavedTab[] }
          return {
            activeId: saved.activeId,
            tabs: saved.tabs.filter((tab) => tab.sessionId).map(newTab)
          }
        }
      }
    }
  }
)
