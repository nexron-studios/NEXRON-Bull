import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { bridgeService } from '@/api/services/bridge.service'
import type { AgentdEvent, AgentdRequest } from '@/types/agentd.type'

const AGENTD_EVENT = 'agentd'

/** The name of another machine in Bull's list; `null` is this computer. */
export type Machine = string | null

type Listener = (event: AgentdEvent) => void

/** No answer in time; the machine may be offline or run an agentd without this op. */
export class AgentdTimeoutError extends Error {
  readonly machine: Machine

  constructor(machine: Machine) {
    super(`agentd on ${machine ?? 'this computer'} did not answer in time`)
    this.name = 'AgentdTimeoutError'
    this.machine = machine
  }
}

/** The connection to the machine ended before it answered, e.g. ssh could not reach the host. */
export class AgentdDisconnectedError extends Error {
  readonly machine: Machine

  constructor(machine: Machine) {
    super(`connection to ${machine ?? 'this computer'} ended before agentd answered`)
    this.name = 'AgentdDisconnectedError'
    this.machine = machine
  }
}

const listeners = new Set<Listener>()
interface Waiter {
  machine: Machine
  /** The connection the request went out on, once `agentd_request` said which */
  connection?: number
  resolve: (event: AgentdEvent) => void
  reject: (error: Error) => void
  /** Rejects the request when no answer comes in time; cleared once one does */
  timer?: ReturnType<typeof setTimeout>
}

const pending = new Map<number, Waiter>()
// A request can learn its connection only after that connection's `disconnected` arrived. One id
// per lost connection, so this stays small.
const endedConnections = new Set<number>()
let nextId = 1
let unlisten: Promise<UnlistenFn> | null = null

const fail = (id: number, error: Error) => {
  const waiter = pending.get(id)
  if (!waiter) return
  pending.delete(id)
  clearTimeout(waiter.timer)
  waiter.reject(error)
}

// Its agentd will never answer what it was asked there. Matched by connection, not by machine:
// a request sent meanwhile may already be on the machine's next connection.
const failRequestsOn = (connection: number, machine: Machine) => {
  endedConnections.add(connection)
  for (const [id, waiter] of pending)
    if (waiter.connection === connection) fail(id, new AgentdDisconnectedError(machine))
}

const markSentOn = (id: number, connection: number) => {
  const waiter = pending.get(id)
  if (!waiter) return
  if (endedConnections.has(connection)) fail(id, new AgentdDisconnectedError(waiter.machine))
  else waiter.connection = connection
}

const dispatch = (event: AgentdEvent) => {
  if (event.type === 'disconnected') failRequestsOn(event.connection, event.machine)
  const id = 'id' in event ? event.id : null
  const waiter = id === null ? undefined : pending.get(id)
  if (waiter) {
    pending.delete(id as number)
    clearTimeout(waiter.timer)
    if (event.type === 'error') waiter.reject(new Error(event.message))
    else waiter.resolve(event)
  }
  listeners.forEach((listener) => listener(event))
}

const dispatchLine = (line: string) => dispatch(JSON.parse(line))

// One listener for the whole app; components subscribe through `onEvent`. Local and remote
// agentd share it: tab and request ids are unique app-wide. Tauri's window event in the app,
// the bridge's WebSocket in a browser: both deliver the same lines.
const ensureListening = () =>
  (unlisten ??= isTauri()
    ? listen<string>(AGENTD_EVENT, ({ payload }) => dispatchLine(payload))
    : Promise.resolve(bridgeService.onLine(dispatchLine)))

/** Resolves with the id of the connection the line went out on. */
const request = (line: string, machine: Machine): Promise<number> =>
  isTauri()
    ? invoke<number>('agentd_request', { line, machine })
    : bridgeService.request(line, machine)

export const agentdService = {
  send: async (message: AgentdRequest, machine: Machine = null): Promise<void> => {
    await ensureListening()
    await request(JSON.stringify(message), machine)
  },

  /**
   * Sends a request with an id and resolves with the event that answers it. It rejects when the
   * machine's connection ends first (an unreachable host), and with `timeoutMs` also when an
   * open connection gives no answer in time (an agentd that does not know the op).
   */
  ask: async <T extends AgentdEvent['type']>(
    message: AgentdRequest,
    machine: Machine = null,
    timeoutMs?: number
  ): Promise<Extract<AgentdEvent, { type: T }>> => {
    await ensureListening()
    const id = nextId++
    const answer = new Promise<AgentdEvent>((resolve, reject) => {
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => fail(id, new AgentdTimeoutError(machine)), timeoutMs)
      pending.set(id, { machine, resolve, reject, timer })
    })
    const sent = request(JSON.stringify({ ...message, id }), machine).then(
      (connection) => markSentOn(id, connection),
      (error: unknown) => {
        // No reply will come for a request that never left.
        clearTimeout(pending.get(id)?.timer)
        pending.delete(id)
        throw error
      }
    )
    // Awaited together, so an answer that fails while the request is still on its way (an error
    // event, a timeout) is never an unhandled rejection.
    const [event] = await Promise.all([answer, sent])
    return event as Extract<AgentdEvent, { type: T }>
  },

  /** Resolves with the next event that matches; for replies that carry no request id. */
  waitFor: (match: (event: AgentdEvent) => boolean): Promise<AgentdEvent> =>
    new Promise((resolve) => {
      const unsubscribe = agentdService.onEvent((event) => {
        if (!match(event)) return
        unsubscribe()
        resolve(event)
      })
    }),

  onEvent: (listener: Listener): (() => void) => {
    void ensureListening()
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
