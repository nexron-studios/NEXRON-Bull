import type { ClaudeEvent, SubagentTranscript } from '@/types/agentd.type'
import { toolRunsOf, type ToolRun } from '@/utils/tabActivity'
import type { Subagent } from '@/utils/tabInsights'
import { isTaskTool } from '@/utils/toolKind'
import { summarizeToolInput } from '@/utils/toolSummary'

/** An open subagent lists its newest actions; more would push the rest of the panel away. */
export const SHOWN_ACTIONS = 5
/** A collapsed finished subagent names its first few actions. */
export const SUMMARY_ACTIONS = 2
/** Per subagent and run; a long one would otherwise keep every call it ever made. */
export const MAX_LIVE_ACTIONS = 200

/** Tool calls of each subagent, by the id of the Agent call that runs it. */
export type SubagentRuns = Record<string, ToolRun[]>

type LateResult = Pick<ToolRun, 'status' | 'finishedAt'>

/** What arrived live of one subagent. */
export interface LiveSubagent {
  calls: ToolRun[]
  /**
   * Results of calls made before the app listened (after a reload); those calls are only in the
   * transcript. By call id.
   */
  lateResults: Record<string, LateResult>
}

/** By the id of the Agent call that runs the subagent. */
export type LiveSubagents = Record<string, LiveSubagent>

interface RawToolUse {
  type: 'tool_use'
  id: string
  name: string
  input?: Record<string, unknown>
}
interface RawToolResult {
  type: 'tool_result'
  tool_use_id: string
  is_error?: boolean
}

const blocksOf = (event: ClaudeEvent): { type?: string }[] => {
  const content = (event.message as { content?: unknown } | undefined)?.content
  return Array.isArray(content) ? content : []
}

const isToolUse = (block: { type?: string }): block is RawToolUse => block.type === 'tool_use'
const isToolResult = (block: { type?: string }): block is RawToolResult =>
  block.type === 'tool_result'

const EMPTY_LIVE: LiveSubagent = { calls: [], lateResults: {} }

const withCalls = (known: LiveSubagent, event: ClaudeEvent, now: number): LiveSubagent | null => {
  const ids = new Set(known.calls.map((run) => run.id))
  const added = blocksOf(event)
    .filter(isToolUse)
    .filter((block) => !ids.has(block.id) && !isTaskTool(block.name))
    .map((block): ToolRun => ({
      id: block.id,
      name: block.name,
      target: summarizeToolInput(block.input ?? {}),
      status: 'running',
      startedAt: now,
      finishedAt: null
    }))
  if (!added.length) return null
  return { ...known, calls: [...known.calls, ...added].slice(-MAX_LIVE_ACTIONS) }
}

const withResults = (known: LiveSubagent, event: ClaudeEvent, now: number): LiveSubagent | null => {
  const results = blocksOf(event)
    .filter(isToolResult)
    .map((block): [string, LateResult] => [
      block.tool_use_id,
      { status: block.is_error === true ? 'failed' : 'done', finishedAt: now }
    ])
  if (!results.length) return null
  const resultOf = new Map(results)
  const callIds = new Set(known.calls.map((run) => run.id))
  return {
    calls: known.calls.map((run) => ({ ...run, ...resultOf.get(run.id) })),
    lateResults: {
      ...known.lateResults,
      ...Object.fromEntries(results.filter(([id]) => !callIds.has(id)))
    }
  }
}

/**
 * What is known live after one event. A subagent's own calls (`assistant`) and their results
 * (`user`) come raw, tagged with the Agent call that runs it; the stream carries no time, so `now`
 * is when they arrived. `null` when the event changes nothing.
 */
export const withSubagentEvent = (
  live: LiveSubagents,
  event: ClaudeEvent,
  now: number
): LiveSubagents | null => {
  const parentId = event.parent_tool_use_id
  if (typeof parentId !== 'string') return null
  const known = live[parentId] ?? EMPTY_LIVE
  const next =
    event.type === 'assistant'
      ? withCalls(known, event, now)
      : event.type === 'user'
        ? withResults(known, event, now)
        : null
  return next ? { ...live, [parentId]: next } : null
}

/**
 * Each subagent's calls from its own transcript. A transcript names its Agent call in the meta
 * file; without one it is matched by the agent id the call's result names.
 */
export const historyRunsOf = (
  transcripts: SubagentTranscript[],
  agents: Subagent[]
): SubagentRuns => {
  const callIdOf = new Map(
    agents.flatMap((agent) => (agent.agentId ? [[agent.agentId, agent.id]] : []))
  )
  const running = new Set(agents.filter((a) => a.status === 'running').map((a) => a.id))
  return Object.fromEntries(
    transcripts.flatMap((transcript) => {
      const id = transcript.tool_use_id ?? callIdOf.get(transcript.agent_id)
      return id ? [[id, toolRunsOf(transcript.messages, running.has(id))]] : []
    })
  )
}

/** Live calls carry their arrival time, transcript calls their written time; both are epoch ms. */
const byStart = (a: ToolRun, b: ToolRun): number => (a.startedAt ?? 0) - (b.startedAt ?? 0)

/**
 * A subagent's actions, oldest first, from its transcript and what arrived live. A finished call
 * beats the same call still waiting for its result; a call that never got one was cut off once
 * the subagent ended.
 */
export const subagentActionsOf = (
  agent: Subagent,
  live: LiveSubagent = EMPTY_LIVE,
  history: ToolRun[] = []
): ToolRun[] => {
  const byId = new Map(history.map((run) => [run.id, run]))
  for (const [id, result] of Object.entries(live.lateResults)) {
    const known = byId.get(id)
    if (known?.status === 'running') byId.set(id, { ...known, ...result })
  }
  for (const run of live.calls) {
    const known = byId.get(run.id)
    if (!known || known.status === 'running') byId.set(run.id, run)
  }
  const runs = [...byId.values()].sort(byStart)
  if (agent.status === 'running') return runs
  return runs.map((run) => (run.status === 'running' ? { ...run, status: 'stopped' } : run))
}

/** The newest actions an open subagent lists, and how many older ones it leaves out. */
export const shownActionsOf = (
  actions: ToolRun[],
  showsAll: boolean
): { shown: ToolRun[]; hiddenCount: number } =>
  showsAll || actions.length <= SHOWN_ACTIONS
    ? { shown: actions, hiddenCount: 0 }
    : { shown: actions.slice(-SHOWN_ACTIONS), hiddenCount: actions.length - SHOWN_ACTIONS }

/** `Read tokens.css, Grep --brand`: the first actions of a collapsed subagent. */
export const actionSummaryOf = (actions: ToolRun[]): string =>
  actions
    .slice(0, SUMMARY_ACTIONS)
    .map((run) => (run.target ? `${run.name} ${run.target}` : run.name))
    .join(', ')
