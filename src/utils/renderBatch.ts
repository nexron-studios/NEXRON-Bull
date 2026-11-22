/** Rows a list renders at first; the rest follow in batches while it scrolls. */
export const FIRST_BATCH_SIZE = 15
export const NEXT_BATCH_SIZE = 10

/**
 * Grouped rows cut to the first `limit` rows across all groups, in order. A group the cut leaves
 * without rows goes; a group that had none to begin with stays while every row above it is shown,
 * with its own empty line. `allRows` keeps every row, for counts and actions on the whole group;
 * `start` is the position of the group's first row in the whole list.
 */
export const sliceGroups = <T extends { rows: unknown[] }>(
  groups: T[],
  limit: number
): (T & { allRows: T['rows']; start: number })[] =>
  groups.flatMap((entry, at) => {
    const start = groups.slice(0, at).reduce((sum, before) => sum + before.rows.length, 0)
    const isReached = entry.rows.length ? start < limit : start <= limit
    if (!isReached) return []
    return [
      {
        ...entry,
        rows: entry.rows.slice(0, Math.max(0, limit - start)),
        allRows: entry.rows,
        start
      }
    ]
  })

/** The position of the first matching row across all groups, in display order; -1 for none. */
export const flatIndexOf = <R>(groups: { rows: R[] }[], isMatch: (row: R) => boolean): number =>
  groups.flatMap((entry) => entry.rows).findIndex(isMatch)
