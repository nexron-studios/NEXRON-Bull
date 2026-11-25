import type { ChildProcessByStdio } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createInterface } from 'node:readline'
import type { Duplex, Readable, Writable } from 'node:stream'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import {
  CLOSE_CODE,
  SOCKET_PATH,
  type BridgeMessage,
  type ClientMessage,
  type CloseReason,
  type Machine
} from './protocol.ts'

export type { Machine }
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

/** A phone may send photos; agentd takes them base64 inside one line. */
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024
const DEFAULT_AUTH_TIMEOUT_MS = 10_000
/** A phone that went to sleep never closes its socket; this finds it and frees its agentd. */
const DEFAULT_HEARTBEAT_MS = 30_000

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
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || typeof line !== 'string') return null
  if (machine !== null && typeof machine !== 'string') return null
  // One request per line: a line break would smuggle a second one past this check.
  if (/[\r\n]/.test(line)) return null
  return { type: 'request', seq, machine, line }
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
 */
interface Device {
  socket: WebSocket
  options: BridgeOptions
  /** Shared by all devices, so ids stay unique while the bridge runs. */
  nextConnection: () => number
  connections: Map<Machine, Connection>
  isAuthed: boolean
  authTimer?: ReturnType<typeof setTimeout>
}

const send = (device: Device, message: BridgeMessage) => {
  if (device.socket.readyState === device.socket.OPEN) device.socket.send(JSON.stringify(message))
}

const close = (device: Device, reason: CloseReason) =>
  device.socket.close(CLOSE_CODE[reason], reason)

const connect = (device: Device, machine: Machine): Connection => {
  const child = device.options.spawnAgentd(machine)
  const connection = { id: device.nextConnection(), child }
  createInterface({ input: child.stdout }).on('line', (line) =>
    send(device, { type: 'event', line })
  )
  // A dead child reports itself through `close` below; the write error itself says nothing more.
  child.stdin.on('error', () => child.kill())
  child.on('error', () => child.kill())
  child.on('close', () => {
    if (device.connections.get(machine) === connection) device.connections.delete(machine)
    // The app fails the requests that went out on it and attaches again, as with Tauri's.
    send(device, { type: 'disconnected', machine, connection: connection.id })
  })
  device.connections.set(machine, connection)
  return connection
}

const relay = (device: Device, seq: number, machine: Machine, line: string) => {
  let connection: Connection
  try {
    connection = device.connections.get(machine) ?? connect(device, machine)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return send(device, { type: 'failed', seq, message })
  }
  connection.child.stdin.write(`${line}\n`)
  send(device, { type: 'sent', seq, connection: connection.id })
}

const signIn = async (device: Device, token: string) => {
  let isKnown: boolean
  try {
    isKnown = await device.options.isAuthorized(token)
  } catch (error) {
    // An unreadable or half-written token file says nothing about this token: the device keeps
    // it and tries again, instead of every phone losing its token at once.
    console.error('bull-bridge: cannot check the token:', error)
    return close(device, 'auth_unavailable')
  }
  if (!isKnown) return close(device, 'unauthorized')
  clearTimeout(device.authTimer)
  device.isAuthed = true
  send(device, { type: 'ready', machines: [...device.options.machines] })
}

const onMessage = (device: Device, data: RawData) => {
  const message = parseClientMessage(textOf(data))
  if (!message) return close(device, 'bad_message')
  if (message.type === 'request') {
    if (!device.isAuthed) return close(device, 'unauthorized')
    return relay(device, message.seq, message.machine, message.line)
  }
  if (!device.isAuthed) void signIn(device, message.token)
}

const serveDevice = (socket: WebSocket, options: BridgeOptions, nextConnection: () => number) => {
  const device: Device = {
    socket,
    options,
    nextConnection,
    connections: new Map(),
    isAuthed: false
  }
  device.authTimer = setTimeout(
    () => close(device, 'auth_timeout'),
    options.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS
  )
  socket.on('message', (data) => onMessage(device, data))
  socket.on('close', () => {
    clearTimeout(device.authTimer)
    // Nobody reads these any more; Claude keeps running under `agentd serve`.
    for (const { child } of device.connections.values()) child.kill()
    device.connections.clear()
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
  // Counted on from the start time, so a restarted bridge never hands out an id the app still
  // remembers from before.
  let lastConnection = Date.now()
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
