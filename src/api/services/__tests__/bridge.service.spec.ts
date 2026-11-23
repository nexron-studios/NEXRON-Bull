import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Stands in for the browser's WebSocket; the test plays the bridge. */
class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  drop(code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const loadService = async () => {
  vi.resetModules()
  return (await import('../bridge.service')).bridgeService
}

const signedIn = async () => {
  const service = await loadService()
  service.start()
  const socket = FakeSocket.last as FakeSocket
  socket.open()
  socket.receive({ type: 'ready', machines: ['main-pc'] })
  return { service, socket }
}

describe('bridgeService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    localStorage.setItem('bull.bridge.token', 'device-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    localStorage.clear()
    FakeSocket.last = null
  })

  it('should wait for a token before it opens a socket', async () => {
    localStorage.clear()
    const service = await loadService()

    service.start()

    expect([service.state.status, FakeSocket.last]).toEqual(['needs_token', null])
  })

  it('should send the token as the first message, not in the address', async () => {
    const service = await loadService()
    service.start()
    const socket = FakeSocket.last as FakeSocket

    socket.open()

    expect(socket.url).toBe('ws://localhost:3000/ws')
    expect(socket.sent).toEqual([{ type: 'auth', token: 'device-token' }])
  })

  it('should know the machines once the bridge lets it in', async () => {
    const { service } = await signedIn()
    expect([service.state.status, service.state.machines]).toEqual(['ready', ['main-pc']])
  })

  it('should resolve a request with the connection it went out on', async () => {
    const { service, socket } = await signedIn()

    const sent = service.request('{"op":"tabs","id":1}', null)
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.receive({ type: 'sent', seq: 1, connection: 7 })

    expect(socket.sent[1]).toEqual({
      type: 'request',
      seq: 1,
      machine: null,
      line: '{"op":"tabs","id":1}'
    })
    await expect(sent).resolves.toBe(1)
  })

  it('should end every connection of a lost socket under the ids the app knows', async () => {
    const { service, socket } = await signedIn()
    const lines: string[] = []
    service.onLine((line) => lines.push(line))
    const sent = service.request('{"op":"hello"}', 'main-pc')
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.receive({ type: 'sent', seq: 1, connection: 3 })
    await sent

    socket.drop(1006)

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { type: 'disconnected', machine: 'main-pc', connection: 1 }
    ])
    expect(service.state.status).toBe('offline')
  })

  it('should count connections on across a new socket, though the bridge starts from 1 again', async () => {
    const { service, socket } = await signedIn()
    const first = service.request('{"op":"hello"}', null)
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.receive({ type: 'sent', seq: 1, connection: 1 })
    await first
    socket.drop(1006)

    await vi.advanceTimersByTimeAsync(1000)
    const next = FakeSocket.last as FakeSocket
    next.open()
    next.receive({ type: 'ready', machines: [] })
    const second = service.request('{"op":"hello"}', null)
    await vi.waitFor(() => expect(next.sent).toHaveLength(2))
    next.receive({ type: 'sent', seq: 2, connection: 1 })

    await expect(second).resolves.toBe(2)
  })

  it('should forget a refused token and ask for another', async () => {
    const { service, socket } = await signedIn()

    socket.drop(4401)

    expect([service.state.status, localStorage.getItem('bull.bridge.token')]).toEqual([
      'rejected',
      null
    ])
  })
})
