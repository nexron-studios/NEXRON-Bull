/** The list with the item at `from` moved to `to`; out-of-range moves leave it as it is. */
export const moveItem = <T>(list: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Rows the user has not placed yet come first, in the order they arrive; placed rows follow in
 * the order the user gave them. New arrivals stay visible at the top instead of sinking.
 */
export const applyManualOrder = <T extends { key: string }>(rows: T[], order: string[]): T[] => {
  if (!order.length) return rows
  const position = new Map(order.map((key, index) => [key, index]))
  const unplaced = rows.filter((row) => !position.has(row.key))
  const placed = rows
    .filter((row) => position.has(row.key))
    .sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0))
  return [...unplaced, ...placed]
}

/**
 * The stored order after the user arranged one group: its keys in their new order first, the
 * other groups' keys after them in their old order, keys that no longer exist dropped.
 */
export const withGroupOrder = (
  order: string[],
  groupKeys: string[],
  existing: Set<string>
): string[] => {
  const moved = new Set(groupKeys)
  return [...groupKeys, ...order.filter((key) => !moved.has(key) && existing.has(key))]
}
