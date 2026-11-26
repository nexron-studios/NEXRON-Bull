/** The top-level fields of `next` that differ from `previous`, and the ones `next` dropped. */
export const fieldPatchOf = <T extends object>(
  previous: T,
  next: T
): { changed: Partial<T>; removed: (keyof T)[] } => {
  const changed: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[])
    if (!Object.is(previous[key], next[key])) changed[key] = next[key]
  const removed = (Object.keys(previous) as (keyof T)[]).filter((key) => !(key in next))
  return { changed, removed }
}
