import { describe, expect, it } from 'vitest'
import { glowClassOf } from '../glow'

describe('glowClassOf', () => {
  it('should give a card its colour only as a glow from the top left, on a plain hairline', () => {
    expect(glowClassOf('read')).toBe(
      'border border-border bg-card bg-radial-[120%_140%_at_0%_0%] to-transparent to-60% from-act-read/12'
    )
  })
})
