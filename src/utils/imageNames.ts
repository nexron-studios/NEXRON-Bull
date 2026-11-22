import { promptKeyOf } from '@/utils/attachments'
import { fnv1aOf } from '@/utils/hash'

/** Where a message's images were sent: the tab, and once Claude started, its session. */
export interface ImageNameScope {
  tabId: string
  /** SSH host alias; `null` is this computer */
  machine: string | null
  /** `null` while a new tab waits for Claude to start */
  sessionId: string | null
}

export interface SavedImageNames {
  /** The file names in the composer, by position */
  names: string[]
  /** When they were saved (ms), so the oldest go first */
  at: number
}

/** Image names of sent prompts by `savedImageNameKeyOf`; only names, never the pixels. */
export type SavedImageNameBook = Record<string, SavedImageNames>

/** Like the hidden sessions: old prompts scroll out of every history long before 500 are sent. */
export const MAX_SAVED_IMAGE_NAMES = 500

/**
 * Per machine, session and prompt. The prompt is hashed: its text can be long, and localStorage only
 * holds a few megabytes. Within one session a 32-bit collision of two prompts is not worth more.
 */
export const savedImageNameKeyOf = (
  machine: string | null,
  sessionId: string,
  texts: readonly string[],
  imageCount: number
): string => `${machine ?? ''}|${sessionId}|${fnv1aOf(promptKeyOf(texts, imageCount)).toString(36)}`

/** Until Claude started a new tab has no session; this run of the app knows it by its tab. */
export const tabImageNameKeyOf = (
  tabId: string,
  texts: readonly string[],
  imageCount: number
): string => `${tabId}|${promptKeyOf(texts, imageCount)}`

export const withSavedImageNames = (
  book: SavedImageNameBook,
  key: string,
  names: string[],
  now: number
): SavedImageNameBook => {
  const next = { ...book, [key]: { names, at: now } }
  const entries = Object.entries(next)
  if (entries.length <= MAX_SAVED_IMAGE_NAMES) return next
  return Object.fromEntries(
    entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_SAVED_IMAGE_NAMES)
  )
}

const isSavedImageNames = (value: unknown): value is SavedImageNames => {
  if (typeof value !== 'object' || value === null) return false
  const { names, at } = value as Partial<SavedImageNames>
  return (
    Array.isArray(names) &&
    names.every((name) => typeof name === 'string') &&
    typeof at === 'number'
  )
}

/**
 * Reads the book from localStorage: nothing yet, an edited or broken value all give what is valid
 * of it, at worst an empty book. The history then numbers the images, as it always did.
 */
export const parseSavedImageNames = (raw: string | null): SavedImageNameBook => {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) return {}
    throw error
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isSavedImageNames(value)))
}
