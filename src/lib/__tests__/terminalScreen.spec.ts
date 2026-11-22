import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { answerDeviceAttributes, hasScreenText } from '../terminalScreen'

const write = (term: Terminal, data: string) =>
  new Promise<void>((resolve) => term.write(data, resolve))

describe('hasScreenText', () => {
  it('should be false for the mode switches and the title ConPTY sends first', async () => {
    const term = new Terminal()
    await write(term, '\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[H\x1b]0;C:\\pwsh.exe\x07')
    expect(hasScreenText(term.buffer.active)).toBe(false)
  })

  it('should be true once a prompt is drawn', async () => {
    const term = new Terminal()
    await write(term, '\x1b[1;1HPS C:\\Users\\Home> ')
    expect(hasScreenText(term.buffer.active)).toBe(true)
  })
})

describe('answerDeviceAttributes', () => {
  it('should answer a device attributes request with VT level 61', async () => {
    const term = new Terminal()
    const sent: string[] = []
    const replies: string[] = []
    term.onData((data) => replies.push(data))
    answerDeviceAttributes(term, (data) => sent.push(data))
    await write(term, '\x1b[c\x1b[0c')
    expect([sent, replies]).toEqual([['\x1b[?61c', '\x1b[?61c'], []])
  })

  it('should leave the secondary device attributes to xterm', async () => {
    const term = new Terminal()
    const sent: string[] = []
    const replies: string[] = []
    term.onData((data) => replies.push(data))
    answerDeviceAttributes(term, (data) => sent.push(data))
    await write(term, '\x1b[>c')
    expect([sent, replies]).toEqual([[], ['\x1b[>0;276;0c']])
  })
})
