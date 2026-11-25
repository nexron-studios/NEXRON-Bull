import { readonly, ref } from 'vue'
import { CLOSE_CODE, SOCKET_PATH, type BridgeMessage, type ClientMessage } from '@bridge/protocol'
import { AgentdDisconnectedError, type Machine } from '@/api/agentdErrors'
import type { AgentdTransport } from '@/api/agentdTransport'
import { parseBridgeMessage } from '@/utils/bridgeMessage'

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
const RETRY_FIRST_MS = 1000
const RETRY_MAX_MS = 30_000

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
/** The open connections of this socket and their machine; all end with it. */
const connections = new Map<number, Machine>()
let readyWaiters: (() => void)[] = []
const lineListeners = new Set<(line: string) => void>()
const readyListeners = new Set<(machines: Machine[]) => void>()
let retryDelay = RETRY_FIRST_MS
let retryTimer: ReturnType<typeof setTimeout> | undefined

const socketUrl = () =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${SOCKET_PATH}`

const sendToBridge = (message: ClientMessage) => socket?.send(JSON.stringify(message))

const emitLine = (line: string) => lineListeners.forEach((listener) => listener(line))

const lost = (machine: Machine, connection: number) =>
  emitLine(JSON.stringify({ type: 'disconnected', machine, connection }))

const onMessage = (message: BridgeMessage) => {
  switch (message.type) {
    case 'ready':
      machines.value = message.machines
      status.value = 'ready'
      isSigningIn.value = false
      retryDelay = RETRY_FIRST_MS
      readyWaiters.splice(0).forEach((wake) => wake())
      readyListeners.forEach((listener) => listener([null, ...message.machines]))
      return
    case 'sent': {
      const waiter = pendingSends.get(message.seq)
      if (!waiter) return
      pendingSends.delete(message.seq)
      connections.set(message.connection, waiter.machine)
      waiter.resolve(message.connection)
      return
    }
    case 'failed': {
      pendingSends.get(message.seq)?.reject(new Error(message.message))
      pendingSends.delete(message.seq)
      return
    }
    case 'event':
      return emitLine(message.line)
    case 'disconnected':
      connections.delete(message.connection)
      return lost(message.machine, message.connection)
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
  const ended = [...connections]
  connections.clear()
  ended.forEach(([connection, machine]) => lost(machine, connection))
  // Only this code means the token is wrong; the others (no token in time, the bridge cannot
  // read its token file) say nothing about it, so the app keeps it and tries again.
  if (code === CLOSE_CODE.unauthorized) {
    isSigningIn.value = false
    localStorage.removeItem(TOKEN_KEY)
    status.value = 'rejected'
    return
  }
  // A token just entered stays unconfirmed; the token screen says the bridge is out of reach.
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
  opened.onopen = () => sendToBridge({ type: 'auth', token })
  opened.onmessage = ({ data }) => {
    const message = parseBridgeMessage(String(data))
    if (message) onMessage(message)
  }
  opened.onclose = ({ code }) => onClose(code)
}

const isReady = () => status.value === 'ready' && socket?.readyState === WebSocket.OPEN

const whenReady = (): Promise<void> =>
  isReady() ? Promise.resolve() : new Promise((resolve) => readyWaiters.push(resolve))

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
    sendToBridge({ type: 'request', seq, machine, line })
    return sent
  },

  onLine: async (listener: (line: string) => void): Promise<() => void> => {
    lineListeners.add(listener)
    return () => lineListeners.delete(listener)
  },

  /** Each time the socket is (again) signed in, and at once when it is now; see the transport. */
  onReady: (listener: (machines: Machine[]) => void): (() => void) => {
    readyListeners.add(listener)
    if (isReady()) queueMicrotask(() => listener([null, ...machines.value]))
    return () => readyListeners.delete(listener)
  }
} satisfies AgentdTransport & Record<string, unknown>
