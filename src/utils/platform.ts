/** Operating systems whose name the UI says out loud, e.g. "Windows zeigt sie an". */
export const systemNameList = ['Windows', 'macOS', 'Linux'] as const
export type SystemName = (typeof systemNameList)[number]

// Order matters: Android user agents also contain "Linux", iOS ones "like Mac OS X".
const SYSTEM_MARKS: [mark: string, name: SystemName | null][] = [
  ['Windows', 'Windows'],
  ['Android', null],
  ['iPhone', null],
  ['iPad', null],
  ['Macintosh', 'macOS'],
  ['Linux', 'Linux']
]

/** The desktop system a user agent belongs to; `null` for phones and anything unknown. */
export const systemNameOf = (userAgent: string): SystemName | null =>
  SYSTEM_MARKS.find(([mark]) => userAgent.includes(mark))?.[1] ?? null

/**
 * What the texts call the computer Bull runs on ("Dieser Mac", "This PC"). The same word in
 * every language, so it is no locale text. A phone's browser cannot tell and says "PC".
 */
export const computerWordOf = (system: SystemName | null): string =>
  system === 'macOS' ? 'Mac' : 'PC'
