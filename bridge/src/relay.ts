import type { ChildProcessByStdio } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createInterface } from 'node:readline'
import type { Duplex, Readable, Writable } from 'node:stream'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

/** A machine from the bridge's list; `null` is the one the bridge runs on. */
export type Machine = string | null
export type AgentdProcess = ChildProcessByStdio<Writable, Readable, null>

export interface BridgeOptions {
  /** Pages allowed to open the socket, as `https://host[:port]` */
  origins: ReadonlySet<string>
  isAuthorized: (token: string) => Promise<boolean>
  /** The other machines a device may reach, told to it once it is in. */
  machines: readonly string[]
  /** Starts `agentd connect` for the machine; throws for one the bridge does not know. */
  spawnAgentd: (machine: Machine) => AgentdProcess
  heartbeatMs?: number
  authTimeoutMs?: number
}

export const SOCKET_PATH = '/ws'
/** A phone may send photos; agentd takes them base64 inside one line. */
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024
const DEFAULT_AUTH_TIMEOUT_MS = 10_000
/** A phone that went to sleep never closes its socket; this finds it and frees its agentd. */
const DEFAULT_HEARTBEAT_MS = 30_000

export const closeReasonList = [
  'unauthorized',
  'bad_message',
  'auth_timeout',
  'auth_unavailable'
] as const
export type CloseReason = (typeof closeReasonList)[number]
/**
 * 4000-4999 is free for applications; the browser hands the code to the app. Only `unauthorized`
 * means the token is wrong: the app forgets it then, and tries again after the others.
 */
export const CLOSE_CODE: Record<CloseReason, number> = {
  unauthorized: 4401,
  bad_message: 4400,
  auth_timeout: 4408,
  auth_unavailable: 4503
}

type ClientMessage =
  { type: 'auth'; token: string } | { type: 'request'; seq: number; machine: Machine; line: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The one place a message from the browser is trusted; anything else closes the socket. */
export const parseClientMessage = (data: string): ClientMessage | null => {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.type === 'auth' && typeof value.token === 'string')
    return { type: 'auth', token: value.token }
  if (value.type !== 'request') return null
  const { seq, machine, line } = value
  if (!Number.isSafeInteger(seq) || typeof line !== 'string') return null
  if (machine !== null && typeof machine !== 'string') return null
  // One request per line: a line break would smuggle a second one past this check.
  if (/[\r\n]/.test(line)) return null
  return { type: 'request', seq: seq as number, machine, line }
}

const textOf = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : data.toString('utf8')
}

interface Connection {
  id: number
  child: AgentdProcess
}

/**
 * One device's socket. Every request goes to that device's own `agentd connect` for the machine,
 * so agentd answers it alone (it routes answers per connection) and the bridge rewrites no ids.
 * `nextConnection` is shared by all devices: ids stay unique while the bridge runs.
 */
const serveDevice = (socket: WebSocket, options: BridgeOptions, nextConnection: () => number) => {
  const connections = new Map<Machine, Connection>()
  let isAuthed = false

  const send = (message: object) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  }

  const connect = (machine: Machine): Connection => {
    const child = options.spawnAgentd(machine)
    const connection = { id: nextConnection(), child }
    createInterface({ input: child.stdout }).on('line', (line) => send({ type: 'event', line }))
    // A dead child reports itself through `close` below; the write error itself says nothing more.
    child.stdin.on('error', () => child.kill())
    child.on('error', () => child.kill())
    child.on('close', () => {
      if (connections.get(machine) === connection) connections.delete(machine)
      // The app fails the requests that went out on it and attaches again, as with Tauri's.
      send({ type: 'disconnected', machine, connection: connection.id })
    })
    connections.set(machine, connection)
    return connection
  }

  const relay = (seq: number, machine: Machine, line: string) => {
    let connection: Connection
    try {
      connection = connections.get(machine) ?? connect(machine)
    } catch (error) {
      return send({ type: 'failed', seq, message: (error as Error).message })
    }
    connection.child.stdin.write(`${line}\n`)
    send({ type: 'sent', seq, connection: connection.id })
  }

  const close = (reason: CloseReason) => socket.close(CLOSE_CODE[reason], reason)

  const authTimer = setTimeout(
    () => close('auth_timeout'),
    options.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS
  )

  const signIn = async (token: string) => {
    let isKnown: boolean
    try {
      isKnown = await options.isAuthorized(token)
    } catch (error) {
      // An unreadable or half-written token file says nothing about this token: the device keeps
      // it and tries again, instead of every phone losing its token at once.
      console.error('bull-bridge: cannot check the token:', error)
      return close('auth_unavailable')
    }
    if (!isKnown) return close('unauthorized')
    clearTimeout(authTimer)
    isAuthed = true
    send({ type: 'ready', machines: options.machines })
  }

  socket.on('message', (data) => {
    const message = parseClientMessage(textOf(data))
    if (!message) return close('bad_message')
    if (message.type === 'request') {
      if (!isAuthed) return close('unauthorized')
      return relay(message.seq, message.machine, message.line)
    }
    if (!isAuthed) void signIn(message.token)
  })

  socket.on('close', () => {
    clearTimeout(authTimer)
    // Nobody reads these any more; Claude keeps running under `agentd serve`.
    for (const { child } of connections.values()) child.kill()
    connections.clear()
  })
}

const refuse = (socket: Duplex, status: string) => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
}

/**
 * The HTTP server the bridge listens with. It serves nothing but the socket: Caddy hands out the
 * app. The `Origin` check keeps other pages in the phone's browser off the socket; the token,
 * sent as the first message, is what actually lets a device in (no cookie a page could ride on).
 */
export const createBridge = (options: BridgeOptions): Server => {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const alive = new WeakSet<WebSocket>()
  const server = createServer((_request, response) => response.writeHead(404).end())
  let lastConnection = 0
  const nextConnection = () => ++lastConnection

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== SOCKET_PATH) return refuse(socket, '404 Not Found')
    if (!options.origins.has(request.headers.origin ?? '')) return refuse(socket, '403 Forbidden')
    sockets.handleUpgrade(request, socket, head, (ws) => {
      alive.add(ws)
      ws.on('pong', () => alive.add(ws))
      serveDevice(ws, options, nextConnection)
    })
  })

  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!alive.has(ws)) {
        ws.terminate()
        continue
      }
      alive.delete(ws)
      ws.ping()
    }
  }, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS)

  server.on('close', () => {
    clearInterval(heartbeat)
    for (const ws of sockets.clients) ws.terminate()
  })
  return server
}
