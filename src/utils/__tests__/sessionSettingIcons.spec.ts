import { describe, expect, it } from 'vitest'
import { effortLookOf } from '../sessionSettingIcons'
import { effortList } from '../sessionSettings'

describe('effortLookOf', () => {
  it('puts max on the solid brand background with sheen and glow', () => {
    expect(effortLookOf('max').badge).toBe('bg-brand-strong effort-sheen effort-glow')
  })

  it('lets the sheen start at high', () => {
    expect(effortLookOf('high').badge).toBe('bg-brand/15 ring-1 ring-brand/40 effort-sheen')
  })

  it('fills the bars of High in the brand blue', () => {
    expect(effortLookOf('high').on).toBe('bg-brand')
  })

  it('gives every step its own look', () => {
    const looks = effortList.map((effort) => JSON.stringify(effortLookOf(effort)))
    expect(new Set(looks).size).toBe(5)
  })
})
