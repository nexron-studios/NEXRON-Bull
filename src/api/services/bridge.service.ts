import { readonly, ref } from 'vue'
// A cycle with agentd.service, harmless: the error class is only used once requests run.
import { AgentdDisconnectedError, type Machine } from '@/api/services/agentd.service'

/**
 * The browser's way to agentd: one WebSocket to the bridge (`bridge/`), which runs an
 * `agentd connect` per machine for this device. It stands in for Tauri's `agentd_request` and
 * `agentd` event, so the rest of the app sees the same lines and connection ids either way.
 */

export const bridgeStatusList = [
  'connecting',
  'needs_token',
  'rejected',
  'ready',
  'offline'
] as const
export type BridgeStatus = (typeof bridgeStatusList)[number]

const TOKEN_KEY = 'bull.bridge.token'
const SOCKET_PATH = '/ws'
/** The bridge's close codes for a refused token and a message it could not read. */
const UNAUTHORIZED = 4401
const RETRY_FIRST_MS = 1000
const RETRY_MAX_MS = 30_000

type BridgeMessage =
  | { type: 'ready'; machines: string[] }
  | { type: 'sent'; seq: number; connection: number }
  | { type: 'failed'; seq: number; message: string }
  | { type: 'event'; line: string }
  | { type: 'disconnected'; machine: Machine; connection: number }

interface PendingSend {
  machine: Machine
  resolve: (connection: number) => void
  reject: (error: Error) => void
}

const status = ref<BridgeStatus>('connecting')
const machines = ref<string[]>([])
/** A token was just entered and the bridge has not said yet whether it knows it. */
const isSigningIn = ref(false)

let socket: WebSocket | null = null
let nextSeq = 1
const pendingSends = new Map<number, PendingSend>()
/**
 * The bridge's connection ids of this socket → the app's own. The bridge counts from 1 again
 * after a restart, and the app remembers ended connections by id, so it numbers them itself.
 */
const connections = new Map<number, { id: number; machine: Machine }>()
let lastConnection = 0
let readyWaiters: (() => void)[] = []
const lineListeners = new Set<(line: string) => void>()
const readyListeners = new Set<(machines: string[]) => void>()
let retryDelay = RETRY_FIRST_MS
let retryTimer: ReturnType<typeof setTimeout> | undefined

const socketUrl = () =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${SOCKET_PATH}`

const emitLine = (line: string) => lineListeners.forEach((listener) => listener(line))

const lost = (machine: Machine, id: number) =>
  emitLine(JSON.stringify({ type: 'disconnected', machine, connection: id }))

const ownConnection = (bridgeId: number, machine: Machine): number => {
  const known = connections.get(bridgeId)
  if (known) return known.id
  const id = ++lastConnection
  connections.set(bridgeId, { id, machine })
  return id
}

const onMessage = (message: BridgeMessage) => {
  switch (message.type) {
    case 'ready':
      machines.value = message.machines
      status.value = 'ready'
      isSigningIn.value = false
      retryDelay = RETRY_FIRST_MS
      readyWaiters.splice(0).forEach((wake) => wake())
      readyListeners.forEach((listener) => listener(message.machines))
      return
    case 'sent': {
      const waiter = pendingSends.get(message.seq)
      if (!waiter) return
      pendingSends.delete(message.seq)
      waiter.resolve(ownConnection(message.connection, waiter.machine))
      return
    }
    case 'failed': {
      pendingSends.get(message.seq)?.reject(new Error(message.message))
      pendingSends.delete(message.seq)
      return
    }
    case 'event':
      return emitLine(message.line)
    case 'disconnected': {
      const id = ownConnection(message.connection, message.machine)
      connections.delete(message.connection)
      return lost(message.machine, id)
    }
    default: {
      const unhandled: never = message
      throw new Error(`Unhandled bridge message: ${JSON.stringify(unhandled)}`)
    }
  }
}

// Every agentd connection of the socket ended with it: the app fails what went out on them and
// attaches again once the socket is back.
const onClose = (code: number) => {
  socket = null
  for (const waiter of pendingSends.values())
    waiter.reject(new AgentdDisconnectedError(waiter.machine))
  pendingSends.clear()
  const ended = [...connections.values()]
  connections.clear()
  ended.forEach(({ machine, id }) => lost(machine, id))
  if (code === UNAUTHORIZED) {
    isSigningIn.value = false
    localStorage.removeItem(TOKEN_KEY)
    status.value = 'rejected'
    return
  }
  status.value = 'offline'
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, retryDelay)
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
}

const connect = () => {
  clearTimeout(retryTimer)
  if (socket) return
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    status.value = status.value === 'rejected' ? 'rejected' : 'needs_token'
    return
  }
  status.value = 'connecting'
  const opened = new WebSocket(socketUrl())
  socket = opened
  // The token goes in the first message, never in the URL or a cookie another page could use.
  opened.onopen = () => opened.send(JSON.stringify({ type: 'auth', token }))
  opened.onmessage = ({ data }) => onMessage(JSON.parse(String(data)) as BridgeMessage)
  opened.onclose = ({ code }) => onClose(code)
}

const whenReady = (): Promise<void> =>
  status.value === 'ready' && socket?.readyState === WebSocket.OPEN
    ? Promise.resolve()
    : new Promise((resolve) => readyWaiters.push(resolve))

// A phone suspends the page; once it is back the socket should not wait out the backoff.
const reconnectNow = () => {
  if (document.visibilityState !== 'visible' || status.value !== 'offline') return
  retryDelay = RETRY_FIRST_MS
  connect()
}

export const bridgeService = {
  state: readonly({ status, machines, isSigningIn }),

  /** Opens the socket with the stored token, or waits for one to be entered. */
  start: () => {
    document.addEventListener('visibilitychange', reconnectNow)
    window.addEventListener('online', reconnectNow)
    connect()
  },

  /** Stores the token this device was given and signs in with it. */
  signIn: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token.trim())
    isSigningIn.value = true
    status.value = 'connecting'
    connect()
  },

  whenReady,

  /** Sends one protocol line, once signed in, and resolves with the connection it went out on. */
  request: async (line: string, machine: Machine): Promise<number> => {
    await whenReady()
    const seq = nextSeq++
    const sent = new Promise<number>((resolve, reject) =>
      pendingSends.set(seq, { machine, resolve, reject })
    )
    socket?.send(JSON.stringify({ type: 'request', seq, machine, line }))
    return sent
  },

  onLine: (listener: (line: string) => void): (() => void) => {
    lineListeners.add(listener)
    return () => lineListeners.delete(listener)
  },

  /** Called each time the socket is (again) signed in, with the machines the bridge reaches. */
  onReady: (listener: (machines: string[]) => void): (() => void) => {
    readyListeners.add(listener)
    return () => readyListeners.delete(listener)
  }
}
