const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** 32-bit FNV-1a: a short, stable fingerprint of a text. Not for anything secret. */
export const fnv1aOf = (text: string): number => {
  let hash = FNV_OFFSET
  // Whole code points: two emoji share their first UTF-16 unit and would hash alike.
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME)
  return hash >>> 0
}
