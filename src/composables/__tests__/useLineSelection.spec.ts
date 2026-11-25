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

describe('useLineSelection move', () => {
  it('should start at the first line going down and at the last going up', () => {
    const down = useLineSelection([2, 5, 7])
    const up = useLineSelection([2, 5, 7])

    down.move(1, false)
    up.move(-1, false)

    expect([down.cursor.value, up.cursor.value]).toEqual([2, 7])
  })

  it('should jump to the ends with Home and End and stop there', () => {
    const selection = useLineSelection([2, 5, 7])
    selection.move(1, false)

    selection.move(Infinity, true)
    selection.move(1, true)

    expect(selection.range.value).toEqual({ start: 2, end: 7 })
    selection.move(-Infinity, false)
    expect(selection.range.value).toEqual({ start: 2, end: 2 })
  })

  it('should take only the keys that move the cursor', () => {
    const selection = useLineSelection([2, 5, 7])

    const isArrowTaken = selection.handleKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    const isLetterTaken = selection.handleKey(new KeyboardEvent('keydown', { key: 'a' }))

    expect([isArrowTaken, isLetterTaken, selection.isChosen(2), selection.isChosen(5)]).toEqual([
      true,
      false,
      true,
      false
    ])
  })
})
