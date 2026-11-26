const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BLANK = /^\s*$/

/**
 * The length of the part of a streaming reply that no further text can change: everything up to
 * its last blank line outside a code block. Only the rest is parsed again with each token, so a
 * long reply does not cost more per token the longer it gets.
 */
export const settledLengthOf = (text: string): number => {
  let fence: string | null = null
  let settled = 0
  let offset = 0
  for (const line of text.split('\n')) {
    const end = offset + line.length + 1
    const marker = FENCE.exec(line)?.[1]
    if (marker && fence === null) fence = marker
    else if (marker && fence !== null && marker[0] === fence[0] && marker.length >= fence.length)
      fence = null
    else if (fence === null && BLANK.test(line) && end <= text.length) settled = end
    offset = end
  }
  return settled
}
