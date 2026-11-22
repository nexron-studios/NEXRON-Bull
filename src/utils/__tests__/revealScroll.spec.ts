import { describe, expect, it } from 'vitest'
import { revealTopOf, topInsetOf } from '../revealScroll'

describe('topInsetOf', () => {
  const card = { left: 100, right: 900 }

  it('should count a cover over the card from the chat top to its bottom', () => {
    expect(topInsetOf({ left: 600, right: 1000, bottom: 160 }, card, 100)).toBe(60)
  })

  it('should not count a cover beside the card', () => {
    expect(topInsetOf({ left: 950, right: 1300, bottom: 160 }, card, 100)).toBe(0)
  })

  it('should not count a missing cover', () => {
    expect(topInsetOf(null, card, 100)).toBe(0)
  })
})

const geometry = {
  cardOffset: 900,
  cardHeight: 40,
  viewportHeight: 600,
  maxScroll: 2000,
  topInset: 0
}

describe('revealTopOf', () => {
  it('should put the card below a cover over the top for start', () => {
    expect(revealTopOf({ ...geometry, topInset: 60 }, 'start')).toBe(824)
  })

  it('should keep the card inside a short chat that the cover mostly hides', () => {
    expect(revealTopOf({ ...geometry, viewportHeight: 300, topInset: 350 }, 'center')).toBe(640)
  })

  it('should center the card in the part below a cover', () => {
    expect(revealTopOf({ ...geometry, topInset: 60 }, 'center')).toBe(590)
  })

  it('should put the card a small gap below the top for start', () => {
    expect(revealTopOf(geometry, 'start')).toBe(884)
  })

  it('should put the card in the middle of the viewport for center', () => {
    expect(revealTopOf(geometry, 'center')).toBe(620)
  })

  it('should keep the top of a card taller than the viewport in view for center', () => {
    expect(revealTopOf({ ...geometry, cardHeight: 800 }, 'center')).toBe(884)
  })

  it('should not go above the top for a card near the start', () => {
    expect(revealTopOf({ ...geometry, cardOffset: 10 }, 'start')).toBe(0)
  })

  it('should stop at the end of the list for a card near the bottom', () => {
    expect(revealTopOf({ ...geometry, cardOffset: 2300 }, 'start')).toBe(2000)
  })
})
