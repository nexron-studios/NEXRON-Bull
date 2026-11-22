import { describe, expect, it } from 'vitest'
import { isMachineNameTaken, machineLabelOf, machineNameOf, withMachineName } from '../machineLabel'

describe('machineLabelOf', () => {
  it('should hide this computer while it is the only machine', () => {
    expect(machineLabelOf(null, false, 'Dieser PC')).toBeNull()
  })

  it('should name this computer once there is another machine', () => {
    expect(machineLabelOf(null, true, 'Dieser PC')).toBe('Dieser PC')
  })

  it('should always name another machine', () => {
    expect(machineLabelOf('nexron-server', false, 'Server')).toBe('Server')
  })
})

describe('machineNameOf', () => {
  it('should fall back to the own name and to "this PC"', () => {
    expect([
      machineNameOf('nexron-server', {}, 'Dieser PC'),
      machineNameOf(null, {}, 'Dieser PC')
    ]).toEqual(['nexron-server', 'Dieser PC'])
  })

  it('should show the names the user gave', () => {
    const names = { '': 'Desktop', 'nexron-server': 'Server' }
    expect([
      machineNameOf('nexron-server', names, 'Dieser PC'),
      machineNameOf(null, names, 'Dieser PC')
    ]).toEqual(['Server', 'Desktop'])
  })
})

describe('withMachineName', () => {
  it('should store a trimmed name under the machine', () => {
    expect(withMachineName({}, null, '  Desktop ', 'Dieser PC')).toEqual({ '': 'Desktop' })
  })

  it('should drop the entry for an empty or the default name', () => {
    const names = { '': 'Desktop', box: 'Box' }
    expect(withMachineName(names, null, ' ', 'Dieser PC')).toEqual({ box: 'Box' })
    expect(withMachineName(names, 'box', 'box', 'box')).toEqual({ '': 'Desktop' })
  })

  it('should cut a name at 40 characters', () => {
    expect(withMachineName({}, 'box', 'x'.repeat(50), 'box')).toEqual({ box: 'x'.repeat(40) })
  })
})

describe('isMachineNameTaken', () => {
  it('should compare names without case and surrounding space', () => {
    expect(isMachineNameTaken(' server ', ['Server', 'Dieser PC'])).toBe(true)
  })

  it('should accept a free or an empty name', () => {
    expect([isMachineNameTaken('Laptop', ['Server']), isMachineNameTaken(' ', [''])]).toEqual([
      false,
      false
    ])
  })
})
