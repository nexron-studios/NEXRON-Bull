/** Quota and context shares run from 0 to this. */
export const ALL_PERCENT = 100

/** `part` of `whole` in percent; 0 for an empty whole. */
export const percentOf = (part: number, whole: number): number =>
  whole > 0 ? (part / whole) * ALL_PERCENT : 0

/** The CSS width of a bar filled to `percent`, kept within 0…100 %. */
export const percentWidth = (percent: number): string =>
  `${Math.min(ALL_PERCENT, Math.max(0, percent))}%`

/** What is left of a quota once `usedPercent` of it is spent, 0…100. */
export const leftPercentOf = (usedPercent: number): number => Math.max(0, ALL_PERCENT - usedPercent)
