import type { SystemName } from '@/utils/platform'

/**
 * Which key a chord is held with. `command` is Ctrl on Windows and Linux and Cmd on a Mac;
 * `control` is Ctrl everywhere, for chords macOS keeps for itself with Cmd (Cmd+` cycles windows).
 */
export const chordModifierList = ['command', 'control'] as const
export type ChordModifier = (typeof chordModifierList)[number]

/**
 * A keyboard shortcut. `keys` are `KeyboardEvent.key` values, letters in capitals as on the key
 * cap; more than one means "any of them" (←/→ moves left or right).
 */
export interface KeyChord {
  modifier: ChordModifier
  keys: readonly string[]
  hasShift?: boolean
}

/** How a system writes its keys: Apple's glyphs on a Mac, the key caps' names elsewhere. */
export const keyStyleList = ['mac', 'pc'] as const
export type KeyStyle = (typeof keyStyleList)[number]

export const keyStyleOf = (system: SystemName | null): KeyStyle =>
  system === 'macOS' ? 'mac' : 'pc'

const KEY_GLYPHS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→' }

const keyGlyphOf = (key: string): string => KEY_GLYPHS[key] ?? key

// Apple's order is Control, Option, Shift, Command.
const macModifiersOf = ({ modifier, hasShift }: KeyChord): string => {
  const shift = hasShift ? '⇧' : ''
  return modifier === 'control' ? `⌃${shift}` : `${shift}⌘`
}

/** The chord as a key badge shows it: "Ctrl ⇧ `" on Windows, "⇧⌘T" or "⌃`" on a Mac. */
export const shortcutLabelOf = (chord: KeyChord, style: KeyStyle): string => {
  const keys = chord.keys.map(keyGlyphOf).join('/')
  switch (style) {
    case 'mac':
      return `${macModifiersOf(chord)}${keys}`
    case 'pc':
      return ['Ctrl', ...(chord.hasShift ? ['⇧'] : []), keys].join(' ')
    default: {
      const unhandled: never = style
      throw new Error(`Unhandled key style: ${unhandled}`)
    }
  }
}

// `aria-keyshortcuts` names the Command key "Meta".
const ariaModifierOf = (modifier: ChordModifier, style: KeyStyle): string =>
  style === 'mac' && modifier === 'command' ? 'Meta' : 'Control'

/** The chords as `aria-keyshortcuts` wants them: one "Control+Shift+ArrowLeft" per key. */
export const ariaKeyShortcutsOf = (chords: readonly KeyChord[], style: KeyStyle): string =>
  chords
    .flatMap((chord) =>
      chord.keys.map((key) =>
        [ariaModifierOf(chord.modifier, style), ...(chord.hasShift ? ['Shift'] : []), key].join('+')
      )
    )
    .join(' ')
