import { describe, expect, it } from 'vitest'
import { ariaKeyShortcutsOf, keyStyleOf, shortcutLabelOf } from '../shortcutLabel'
import {
  INFO_PANEL_CHORD,
  MOVE_CHORD,
  NEW_SESSION_CHORD,
  NEW_TERMINAL_CHORD,
  REDO_CHORDS,
  TERMINAL_DRAWER_CHORD,
  UNDO_CHORD
} from '../shortcuts'

describe('keyStyleOf', () => {
  it('should write Mac keys only on macOS, and PC keys on every other or unknown system', () => {
    expect([
      keyStyleOf('macOS'),
      keyStyleOf('Windows'),
      keyStyleOf('Linux'),
      keyStyleOf(null)
    ]).toEqual(['mac', 'pc', 'pc', 'pc'])
  })
})

describe('shortcutLabelOf', () => {
  it('should name Ctrl with a space before each key on a PC', () => {
    expect(
      [NEW_SESSION_CHORD, INFO_PANEL_CHORD, NEW_TERMINAL_CHORD, MOVE_CHORD].map((chord) =>
        shortcutLabelOf(chord, 'pc')
      )
    ).toEqual(['Ctrl T', 'Ctrl .', 'Ctrl ⇧ `', 'Ctrl ⇧ ←/→'])
  })

  it('should write Apple glyphs without spaces, Shift before Command, on a Mac', () => {
    expect(
      [NEW_SESSION_CHORD, INFO_PANEL_CHORD, MOVE_CHORD].map((chord) =>
        shortcutLabelOf(chord, 'mac')
      )
    ).toEqual(['⌘T', '⌘.', '⇧⌘←/→'])
  })

  it('should keep Control for the terminal chords on a Mac, before Shift', () => {
    expect(
      [TERMINAL_DRAWER_CHORD, NEW_TERMINAL_CHORD].map((chord) => shortcutLabelOf(chord, 'mac'))
    ).toEqual(['⌃`', '⌃⇧`'])
  })
})

describe('ariaKeyShortcutsOf', () => {
  it('should list one Control shortcut per key on a PC', () => {
    expect(ariaKeyShortcutsOf([MOVE_CHORD], 'pc')).toBe(
      'Control+Shift+ArrowLeft Control+Shift+ArrowRight'
    )
  })

  it('should name the Command key Meta on a Mac and join several chords', () => {
    expect([
      ariaKeyShortcutsOf([UNDO_CHORD], 'mac'),
      ariaKeyShortcutsOf(REDO_CHORDS, 'mac')
    ]).toEqual(['Meta+Z', 'Meta+Shift+Z Meta+Y'])
  })

  it('should keep Control for a Control chord on a Mac', () => {
    expect(ariaKeyShortcutsOf([NEW_TERMINAL_CHORD], 'mac')).toBe('Control+Shift+`')
  })
})
