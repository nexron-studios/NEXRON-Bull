import { describe, expect, it } from 'vitest'
import { stuckIndexOf } from '../stickyHeading'

describe('stuckIndexOf', () => {
  it('should stick no heading while the area rests at its start', () => {
    expect(stuckIndexOf([0, 120, 300], 0)).toBe(-1)
  })

  it('should stick the heading of the section scrolled into', () => {
    expect(stuckIndexOf([0, 120, 300], 150)).toBe(1)
  })

  it('should hand over to the next heading once its section reaches the top', () => {
    expect(stuckIndexOf([0, 120, 300], 120)).toBe(1)
  })

  it('should find the section whatever order the tops come in', () => {
    expect(stuckIndexOf([300, 0, 120], 400)).toBe(0)
  })

  it('should stick no heading above the first section', () => {
    expect(stuckIndexOf([40, 160], 20)).toBe(-1)
  })
})
