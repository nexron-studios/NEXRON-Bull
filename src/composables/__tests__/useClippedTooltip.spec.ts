import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useClippedTooltip } from '../useClippedTooltip'

const elementOf = (scrollWidth: number, clientWidth: number): HTMLElement => {
  const el = document.createElement('span')
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth })
  return el
}

describe('useClippedTooltip', () => {
  it('should open when one of the elements cuts its text off', () => {
    const { open, setOpen } = useClippedTooltip([ref(elementOf(80, 80)), ref(elementOf(240, 120))])

    setOpen(true)

    expect(open.value).toBe(true)
  })

  it('should stay shut when every element shows its whole text', () => {
    const { open, setOpen } = useClippedTooltip([ref(elementOf(80, 80)), ref(null)])

    setOpen(true)

    expect(open.value).toBe(false)
  })

  it('should close when asked, clipped or not', () => {
    const { open, setOpen } = useClippedTooltip([ref(elementOf(240, 120))])
    setOpen(true)

    setOpen(false)

    expect(open.value).toBe(false)
  })
})
