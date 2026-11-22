import { describe, expect, it } from 'vitest'
import { machineLabelOf } from '../machineLabel'

describe('machineLabelOf', () => {
  it('should hide this computer while it is the only machine', () => {
    expect(machineLabelOf(null, false, 'Dieser PC')).toBeNull()
  })

  it('should name this computer once there is another machine', () => {
    expect(machineLabelOf(null, true, 'Dieser PC')).toBe('Dieser PC')
  })

  it('should always name another machine', () => {
    expect(machineLabelOf('nexron-server', false, 'Dieser PC')).toBe('nexron-server')
  })
})
