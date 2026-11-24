import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useClipped } from '../useClipped'

const elementOf = (scrollWidth: number, clientWidth: number): HTMLElement => {
  const el = document.createElement('span')
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth })
  return el
}

describe('useClipped', () => {
  it('should report clipped when one of the elements cuts its text off', () => {
    const { isClipped, measure } = useClipped([ref(elementOf(80, 80)), ref(elementOf(240, 120))])

    measure()

    expect(isClipped.value).toBe(true)
  })

  it('should report not clipped when every element shows its whole text', () => {
    const { isClipped, measure } = useClipped([ref(elementOf(80, 80)), ref(null)])

    measure()

    expect(isClipped.value).toBe(false)
  })

  it('should stay not clipped until measured', () => {
    const { isClipped } = useClipped([ref(elementOf(240, 120))])

    expect(isClipped.value).toBe(false)
  })
})
