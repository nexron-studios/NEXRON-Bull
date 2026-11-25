import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { WebSocket } from 'ws'
import { createBridge, parseClientMessage, type AgentdProcess, type Machine } from '../relay.ts'

const ORIGIN = 'https://bull.example.test'
const TOKEN = 'right-token'

/** Stands in for `agentd connect`: answers every request that has an id with a `hello`. */
const FAKE_AGENTD = `
  require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
    const { id, op } = JSON.parse(line)
    if (op === 'die') process.exit(0)
    if (id !== undefined) console.log(JSON.stringify({ type: 'hello', id, pid: process.pid }))
  })
`

const children: AgentdProcess[] = []
const spawnFake = (machine: Machine): AgentdProcess => {
  if (machine !== null) throw new Error(`unknown machine ${machine}`)
  const child = spawn(process.execPath, ['-e', FAKE_AGENTD], { stdio: ['pipe', 'pipe', 'inherit'] })
  children.push(child)
  return child
}

const server = createBridge({
  origins: new Set([ORIGIN]),
  isAuthorized: async (token) => token === TOKEN,
  machines: ['other-box'],
  spawnAgentd: spawnFake
})
let url = ''

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  server.close()
  for (const child of children) child.kill()
})

/** A device socket that collects every message it gets. */
const open = async (path = '/ws', origin = ORIGIN) => {
  const socket = new WebSocket(`${url}${path}`, { origin })
  const messages: Record<string, unknown>[] = []
  const waiters: (() => void)[] = []
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()))
    waiters.splice(0).forEach((wake) => wake())
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
  const next = async (type: string): Promise<Record<string, unknown>> => {
    for (;;) {
      const found = messages.findIndex((message) => message.type === type)
      if (found >= 0) return messages.splice(found, 1)[0]
      await new Promise<void>((wake) => waiters.push(wake))
    }
  }
  const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)))
  const send = (message: object) => socket.send(JSON.stringify(message))
  return { socket, next, closed, send }
}

const signedIn = async () => {
  const device = await open()
  device.send({ type: 'auth', token: TOKEN })
  return { ...device, ready: await device.next('ready') }
}

const refusalOf = (path: string, origin: string) =>
  new Promise<number>((resolve) => {
    const socket = new WebSocket(`${url}${path}`, { origin })
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
    socket.on('error', () => undefined)
  })

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('who gets in', () => {
  it('should refuse a page from another origin before the socket opens', async () => {
    assert.equal(await refusalOf('/ws', 'https://evil.example.test'), 403)
  })

  it('should refuse a socket without an origin', async () => {
    assert.equal(await refusalOf('/ws', ''), 403)
  })

  it('should know no path but the socket', async () => {
    assert.equal(await refusalOf('/other', ORIGIN), 404)
  })

  it('should close with 4401 for a wrong token', async () => {
    const device = await open()
    device.send({ type: 'auth', token: 'wrong-token' })
    assert.equal(await device.closed, 4401)
  })

  it('should close with 4401 for a request before the token', async () => {
    const device = await open()
    device.send({ type: 'request', seq: 1, machine: null, line: '{"op":"hello"}' })
    assert.equal(await device.closed, 4401)
    assert.equal(children.length, 0)
  })

  it('should close with 4503, not 4401, when it cannot check the token', async () => {
    const broken = createBridge({
      origins: new Set([ORIGIN]),
      isAuthorized: () => Promise.reject(new Error('token file half written')),
      machines: [],
      spawnAgentd: spawnFake
    })
    await new Promise<void>((resolve) => broken.listen(0, '127.0.0.1', resolve))
    const socket = new WebSocket(`ws://127.0.0.1:${(broken.address() as AddressInfo).port}/ws`, {
      origin: ORIGIN
    })
    socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token: TOKEN })))

    const code = await new Promise<number>((resolve) => socket.once('close', resolve))

    broken.close()
    assert.equal(code, 4503)
  })

  it('should close with 4408, not 4401, when no token comes in time', async () => {
    const waiting = createBridge({
      origins: new Set([ORIGIN]),
      isAuthorized: async () => true,
      machines: [],
      spawnAgentd: spawnFake,
      authTimeoutMs: 50
    })
    await new Promise<void>((resolve) => waiting.listen(0, '127.0.0.1', resolve))
    const socket = new WebSocket(`ws://127.0.0.1:${(waiting.address() as AddressInfo).port}/ws`, {
      origin: ORIGIN
    })

    const code = await new Promise<number>((resolve) => socket.once('close', resolve))

    waiting.close()
    assert.equal(code, 4408)
  })

  it('should close with 4400 for a message it does not know', async () => {
    const device = await open()
    device.socket.send('not json')
    assert.equal(await device.closed, 4400)
  })

  it('should tell a signed-in device the other machines', async () => {
    const device = await signedIn()
    assert.deepEqual(device.ready, { type: 'ready', machines: ['other-box'] })
    device.socket.close()
  })
})

describe('parseClientMessage', () => {
  it('should refuse a line that carries a second request', () => {
    const line = '{"op":"hello"}\n{"op":"run_shell"}'
    assert.equal(
      parseClientMessage(JSON.stringify({ type: 'request', seq: 1, machine: null, line })),
      null
    )
  })

  it('should refuse a machine that is not a name', () => {
    const message = { type: 'request', seq: 1, machine: 7, line: '{}' }
    assert.equal(parseClientMessage(JSON.stringify(message)), null)
  })

  it('should read a request', () => {
    const message = { type: 'request', seq: 3, machine: 'box', line: '{"op":"tabs"}' }
    assert.deepEqual(parseClientMessage(JSON.stringify(message)), message)
  })
})

describe('relay', () => {
  it('should send the line to agentd and its answer back', async () => {
    const device = await signedIn()
    device.send({ type: 'request', seq: 1, machine: null, line: '{"id":7,"op":"hello"}' })

    const sent = await device.next('sent')
    const event = await device.next('event')

    assert.equal(sent.seq, 1)
    assert.equal(JSON.parse(event.line as string).id, 7)
    device.socket.close()
  })

  it('should keep one agentd per machine for the device', async () => {
    const device = await signedIn()
    device.send({ type: 'request', seq: 1, machine: null, line: '{"id":1,"op":"hello"}' })
    device.send({ type: 'request', seq: 2, machine: null, line: '{"id":2,"op":"hello"}' })

    const [first, second] = [await device.next('sent'), await device.next('sent')]
    const pids = [await device.next('event'), await device.next('event')].map(
      (event) => JSON.parse(event.line as string).pid
    )

    assert.equal(first.connection, second.connection)
    assert.equal(pids[0], pids[1])
    device.socket.close()
  })

  it('should give two devices their own agentd and connection ids', async () => {
    const [phone, tablet] = [await signedIn(), await signedIn()]
    phone.send({ type: 'request', seq: 1, machine: null, line: '{"id":1,"op":"hello"}' })
    tablet.send({ type: 'request', seq: 1, machine: null, line: '{"id":1,"op":"hello"}' })

    const [onPhone, onTablet] = [await phone.next('sent'), await tablet.next('sent')]

    assert.notEqual(onPhone.connection, onTablet.connection)
    phone.socket.close()
    tablet.socket.close()
  })

  it('should fail a request for a machine it cannot start', async () => {
    const device = await signedIn()
    device.send({ type: 'request', seq: 4, machine: 'nowhere', line: '{"op":"hello"}' })
    assert.deepEqual(await device.next('failed'), {
      type: 'failed',
      seq: 4,
      message: 'unknown machine nowhere'
    })
    device.socket.close()
  })

  it('should report an agentd that died, with the connection it was', async () => {
    const device = await signedIn()
    device.send({ type: 'request', seq: 1, machine: null, line: '{"op":"die"}' })
    const { connection } = await device.next('sent')

    const lost = await device.next('disconnected')

    assert.deepEqual(lost, { type: 'disconnected', machine: null, connection })
    device.socket.close()
  })

  it('should end the device agentd once its socket closes', async () => {
    const device = await signedIn()
    device.send({ type: 'request', seq: 1, machine: null, line: '{"id":1,"op":"hello"}' })
    const { pid } = JSON.parse((await device.next('event')).line as string)

    device.socket.close()
    await device.closed
    const child = children.find((known) => known.pid === pid)
    if (child && child.exitCode === null && child.signalCode === null)
      await new Promise((resolve) => child.once('close', resolve))

    assert.equal(isRunning(pid), false)
  })
})
