import { describe, expect, it } from 'vitest'
import { permissionOf } from '../osPermission'

describe('permissionOf', () => {
  it('trusts Windows over a plugin that grants always', () => {
    expect(permissionOf('blocked', true)).toBe('blocked')
  })

  it('grants when Windows lets notifications through', () => {
    expect(permissionOf('enabled', true)).toBe('granted')
  })

  it('grants when Windows lets them through even if the plugin says no', () => {
    expect(permissionOf('enabled', false)).toBe('granted')
  })

  it('falls back to a granting plugin without an answer from the system', () => {
    expect(permissionOf('unknown', true)).toBe('granted')
  })

  it('falls back to a refusing plugin without an answer from the system', () => {
    expect(permissionOf('unknown', false)).toBe('blocked')
  })
})
