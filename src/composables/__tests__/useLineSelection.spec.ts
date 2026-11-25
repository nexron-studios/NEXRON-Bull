import { describe, expect, it } from 'vitest'
import { useLineSelection } from '../useLineSelection'

const pointerDown = () => new MouseEvent('pointerdown', { button: 0 }) as PointerEvent

describe('useLineSelection', () => {
  it('should extend the range while the pointer drags over the lines', () => {
    const selection = useLineSelection([0, 1, 2, 3])

    selection.press(1, pointerDown())
    selection.sweep(3)

    expect(selection.range.value).toEqual({ start: 1, end: 3 })
  })

  it.each(['pointerup', 'pointercancel', 'blur'])('should stop dragging on %s', (type) => {
    const selection = useLineSelection([0, 1, 2, 3])
    selection.press(1, pointerDown())

    window.dispatchEvent(new Event(type))
    selection.sweep(3)

    expect(selection.range.value).toEqual({ start: 1, end: 1 })
  })
})
