import type { TabActivity } from '@/utils/activity'
import type { ChatTabState } from '@/utils/chatTab'
import { MS_PER_MINUTE } from '@/utils/elapsed'

/** What the quip in the thinking bar riffs on (Figma "41"). */
export const quipMoodList = ['thinking', 'working', 'writing'] as const
export type QuipMood = (typeof quipMoodList)[number]

/** From here on a turn counts as long, and the stubborn quips mix in. */
export const LONG_TURN_MS = 2 * MS_PER_MINUTE
/** How long one quip stays before the next one comes. */
export const QUIP_INTERVAL_MS = 6000
/**
 * A quip shows at least this long before a mood change may replace it: in a quick tool loop the
 * mood flips every second, and a new quip each time would only flicker.
 */
export const QUIP_MIN_SHOW_MS = 2000

export interface ShownQuip {
  text: string
  mood: QuipMood
  shownAt: number
}

// Always English, in every UI language, like Claude Code's spinner words (20.11.2026).
// They are flavour, not information, so they stay out of the locale files.
const QUIPS: Record<QuipMood, readonly string[]> = {
  thinking: ['Ruminating…', 'Chewing the cud…', 'Mulling it over…', 'Pondering…', 'Brooding…'],
  working: [
    'Pawing the ground…',
    'Charging…',
    'Locking horns…',
    'Bulldozing through…',
    'Rallying the market…',
    'Stampeding…',
    'Ploughing ahead…'
  ],
  writing: ['Wordsmithing…', 'Scribbling…', 'Penning…', 'Spinning a yarn…']
}
const LONG_TURN_QUIPS = [
  'Still chewing…',
  'Taking the bull by the horns…',
  'Horns down, still going…',
  'Bullheaded about it…'
]

/**
 * `null` while Claude needs the user or something went wrong (approval, question, API retry,
 * waiting for a limit): a joke must never hide that, so only the plain label shows then.
 */
export const quipMoodOf = (tab: ChatTabState, activity: TabActivity): QuipMood | null => {
  if (tab.retry || tab.limit.kind === 'waiting') return null
  switch (activity.kind) {
    case 'asking':
      return null
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing'
    case 'tool':
    case 'working':
      return 'working'
    default: {
      const unhandled: never = activity
      throw new Error(`Unhandled activity: ${JSON.stringify(unhandled)}`)
    }
  }
}

export const quipPoolOf = (mood: QuipMood, isLongTurn: boolean): readonly string[] =>
  isLongTurn ? [...QUIPS[mood], ...LONG_TURN_QUIPS] : QUIPS[mood]

/**
 * Whether the bar should show a new quip now: the first one at once, one for a new mood once the
 * old has had its minimum time, and otherwise the next after the interval. `canRotate` is off when
 * the system asks for less motion, since text that changes on its own is motion too.
 */
export const shouldReplaceQuip = (
  shown: ShownQuip | null,
  mood: QuipMood,
  now: number,
  canRotate: boolean
): boolean => {
  if (!shown) return true
  const age = now - shown.shownAt
  if (shown.mood !== mood) return age >= QUIP_MIN_SHOW_MS
  return canRotate && age >= QUIP_INTERVAL_MS
}

/** A random quip from the pool, never the one showing right now. `random` returns [0, 1). */
export const pickQuip = (
  pool: readonly string[],
  current: string | null,
  random: () => number = Math.random
): string => {
  const choices = pool.filter((quip) => quip !== current)
  const options = choices.length ? choices : pool
  return options[Math.floor(random() * options.length)]
}
