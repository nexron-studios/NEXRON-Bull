import type { KeyChord } from '@/utils/shortcutLabel'

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'>

// Ctrl on Windows and Linux, Cmd on a Mac; never together with Alt (AltGr on German keyboards).
// Both count on every system; a chord's label (`KeyChord`) names the one the system uses.
const hasCommandKey = (event: KeyInfo): boolean => (event.ctrlKey || event.metaKey) && !event.altKey

export const NEW_SESSION_CHORD: KeyChord = { modifier: 'command', keys: ['T'] }

/**
 * Ctrl+T opens a new session, like a new browser tab. Shift is left alone (Ctrl+Shift+T means
 * "reopen" elsewhere), and a held key opens one dialog, not one per repeat.
 */
export const isNewSessionShortcut = (event: KeyInfo): boolean =>
  hasCommandKey(event) && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 't'

/** Folds the sidebar, or sends the running shell to the background (`ChatView`). */
export const SIDEBAR_CHORD: KeyChord = { modifier: 'command', keys: ['B'] }

/** Ctrl+B collapses the sidebar to its rail and back, like the side bar in VS Code. */
export const isSidebarShortcut = (event: KeyInfo): boolean =>
  hasCommandKey(event) && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 'b'

export const INFO_PANEL_CHORD: KeyChord = { modifier: 'command', keys: ['.'] }

/** Ctrl+. shows and hides the panel right of the chat; free in Bull and in WebView2. */
export const isInfoPanelShortcut = (event: KeyInfo): boolean =>
  hasCommandKey(event) && !event.shiftKey && !event.repeat && event.key === '.'

export const PREVIEW_CHORD: KeyChord = { modifier: 'command', keys: ['P'], hasShift: true }

/** Ctrl+Shift+P shows and hides the preview beside the chat; Ctrl+P stays WebView2's print. */
export const isPreviewShortcut = (event: KeyInfo): boolean =>
  hasCommandKey(event) && event.shiftKey && !event.repeat && event.key.toLowerCase() === 'p'

export const CHAT_SEARCH_CHORD: KeyChord = { modifier: 'command', keys: ['F'] }

/** Ctrl+F searches the shown chat; Bull takes it over from WebView2's own find bar. */
export const isChatSearchShortcut = (event: KeyInfo): boolean =>
  hasCommandKey(event) && !event.shiftKey && !event.repeat && event.key.toLowerCase() === 'f'

type PhysicalKeyInfo = Pick<
  KeyboardEvent,
  'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'
>

// By the key's place, left of 1 as in VS Code: on a German keyboard it types ^ and ` is a dead key.
// Labelled with Ctrl on a Mac too: macOS keeps Cmd+` for cycling an app's windows.
const isBackquoteChord = (event: PhysicalKeyInfo): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat && event.code === 'Backquote'

export const TERMINAL_DRAWER_CHORD: KeyChord = { modifier: 'control', keys: ['`'] }
export const NEW_TERMINAL_CHORD: KeyChord = { modifier: 'control', keys: ['`'], hasShift: true }

/** Ctrl+` shows and hides the terminals under the chat, like the panel in VS Code. */
export const isTerminalDrawerShortcut = (event: PhysicalKeyInfo): boolean =>
  isBackquoteChord(event) && !event.shiftKey

/** Ctrl+Shift+` opens a terminal tab in the shown chat's folder. */
export const isNewTerminalShortcut = (event: PhysicalKeyInfo): boolean =>
  isBackquoteChord(event) && event.shiftKey

/** Everything that `moveStepOf` moves. */
export const MOVE_CHORD: KeyChord = {
  modifier: 'command',
  keys: ['ArrowLeft', 'ArrowRight'],
  hasShift: true
}

/** Ctrl+Shift+Left/Right moves the focused tab or image one place; `null` for any other key. */
export const moveStepOf = (event: KeyInfo): -1 | 1 | null => {
  if (!hasCommandKey(event) || !event.shiftKey) return null
  if (event.key === 'ArrowLeft') return -1
  if (event.key === 'ArrowRight') return 1
  return null
}

/** Undo and redo while marking an image. */
export const UNDO_CHORD: KeyChord = { modifier: 'command', keys: ['Z'] }
export const REDO_CHORDS: readonly KeyChord[] = [
  { modifier: 'command', keys: ['Z'], hasShift: true },
  { modifier: 'command', keys: ['Y'] }
]

/** Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, as in every drawing app; `null` for other keys. */
export const historyStepOf = (event: KeyInfo): 'undo' | 'redo' | null => {
  if (!hasCommandKey(event)) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}
