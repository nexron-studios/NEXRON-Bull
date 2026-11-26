const FENCE_OPEN = /^\s*(`{3,}|~{3,})/
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/
const BLANK = /^\s*$/
// A line after a blank line that may still belong to the block above: indented (a list item's
// paragraph, a sub-list, indented code) or a further item of the same list.
const CONTINUATION = /^(\s|[-*+](\s|$)|\d{1,9}[.)](\s|$))/

/**
 * The length of the part of a streaming reply that no further text can change: everything up to
 * the last blank line outside a code block that a new top-level block follows. Only the rest is
 * parsed again with each token, so a long reply does not cost more per token the longer it gets.
 */
export const settledLengthOf = (text: string): number => {
  let fence: string | null = null
  let blankEnd: number | null = null
  let settled = 0
  let offset = 0
  for (const line of text.split('\n')) {
    const end = offset + line.length + 1
    offset = end
    if (fence !== null) {
      const closing = FENCE_CLOSE.exec(line)?.[1]
      if (closing && closing[0] === fence[0] && closing.length >= fence.length) fence = null
      continue
    }
    if (BLANK.test(line)) {
      if (end <= text.length) blankEnd = end
      continue
    }
    if (blankEnd !== null && !CONTINUATION.test(line)) settled = blankEnd
    blankEnd = null
    fence = FENCE_OPEN.exec(line)?.[1] ?? null
  }
  return settled
}
