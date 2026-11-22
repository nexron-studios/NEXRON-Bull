import { systemNameOf } from '@/utils/platform'
import {
  ariaKeyShortcutsOf,
  keyStyleOf,
  shortcutLabelOf,
  type KeyChord
} from '@/utils/shortcutLabel'

/** Shortcut labels for the system Bull runs on: "⌘T" on a Mac, "Ctrl T" elsewhere. */
export const useShortcutLabels = () => {
  const style = keyStyleOf(systemNameOf(navigator.userAgent))

  const labelOf = (chord: KeyChord): string => shortcutLabelOf(chord, style)
  const ariaOf = (...chords: KeyChord[]): string => ariaKeyShortcutsOf(chords, style)

  return { labelOf, ariaOf }
}
