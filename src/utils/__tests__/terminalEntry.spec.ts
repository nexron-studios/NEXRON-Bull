import { describe, expect, it } from 'vitest'
import {
  clampDrawerHeight,
  savedTerminalOf,
  savedTerminalsOf,
  terminalOfRequest
} from '../terminalEntry'

describe('terminalOfRequest', () => {
  it('should keep the request and leave the shell to the settings', () => {
    expect(
      terminalOfRequest('t1', { machine: 'nexron-server', cwd: 'C:\\x', title: 'Login' }, null)
    ).toEqual({
      id: 't1',
      machine: 'nexron-server',
      cwd: 'C:\\x',
      title: 'Login',
      shell: null,
      drawerOf: null
    })
  })
})

describe('savedTerminalOf', () => {
  it('should drop the command and the environment', () => {
    const entry = {
      ...terminalOfRequest(
        't1',
        { machine: null, cwd: 'C:\\x', command: 'claude /login', env: { A: 'b' } },
        null
      ),
      shell: 'pwsh' as const
    }
    expect(savedTerminalOf(entry)).toEqual({
      id: 't1',
      machine: null,
      cwd: 'C:\\x',
      shell: 'pwsh',
      title: undefined
    })
  })
})

describe('savedTerminalsOf', () => {
  it('should keep valid tabs and repair what can be repaired', () => {
    expect(
      savedTerminalsOf([
        { id: 't1', machine: null, cwd: 'C:\\x', shell: 'cmd', title: 'Build' },
        { id: 't2', machine: 3, cwd: '', shell: 'zsh' },
        { id: 7, cwd: 'C:\\y' },
        'junk'
      ])
    ).toEqual([
      { id: 't1', machine: null, cwd: 'C:\\x', shell: 'cmd', title: 'Build' },
      { id: 't2', machine: null, cwd: '', shell: null, title: undefined }
    ])
  })

  it('should give nothing for a value that is no list', () => {
    expect(savedTerminalsOf({ tabs: [] })).toEqual([])
  })
})

describe('clampDrawerHeight', () => {
  it('should leave the chat above at least 30 % of the column', () => {
    expect(clampDrawerHeight(900, 1000)).toBe(700)
  })

  it('should never go below the minimum height', () => {
    expect(clampDrawerHeight(40, 1000)).toBe(120)
  })

  it('should keep a height in range as it is', () => {
    expect(clampDrawerHeight(260, 1000)).toBe(260)
  })
})
