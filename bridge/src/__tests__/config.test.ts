import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agentdCommandOf } from '../config.ts'

describe('agentdCommandOf', () => {
  it('should start the local agentd connect for the bridge machine', () => {
    assert.deepEqual(agentdCommandOf('agentd.exe', [], null), ['agentd.exe', ['connect']])
  })

  it('should reach another machine the way the desktop app does', () => {
    const [, args] = agentdCommandOf('agentd.exe', ['main-pc'], 'main-pc')
    assert.deepEqual(args, [
      '-T',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ServerAliveInterval=15',
      'main-pc',
      String.raw`cmd /d /c .nexron-chat\agentd.exe connect`
    ])
  })

  it('should refuse a machine that is not in its list', () => {
    assert.throws(() => agentdCommandOf('agentd.exe', ['main-pc'], 'other'), /unknown machine/)
  })
})
