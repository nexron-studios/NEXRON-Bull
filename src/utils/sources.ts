import { resultTextOf, type ToolResultBlock } from '@/utils/toolPairs'

export interface Source {
  url: string
  /** Host without `www.`, what the chip shows */
  domain: string
}

// A URL runs until whitespace, a quote or a bracket; a balanced pair of parentheses belongs to
// it (Wikipedia: `/wiki/Rust_(programming_language)`), a lone one ends it.
const URL_PATTERN = /https?:\/\/(?:[^\s"'<>()[\]{}]|\([^\s"'<>()[\]{}]*\))+/g
const TRAILING_PUNCTUATION = /[.,;:!?]+$/
const WWW_PREFIX = /^www\./

const sourceOf = (raw: string): Source | null => {
  const url = raw.replace(TRAILING_PUNCTUATION, '')
  if (!URL.canParse(url)) return null
  return { url, domain: new URL(url).hostname.replace(WWW_PREFIX, '') }
}

/**
 * The web pages one tool call read: the URL of a `WebFetch`, every link a `WebSearch`
 * returned. Other tools read no sources.
 */
export const sourcesOfCall = (
  name: string,
  input: Record<string, unknown>,
  result: ToolResultBlock | null
): Source[] => {
  if (name === 'WebFetch' && typeof input.url === 'string') {
    const source = sourceOf(input.url)
    return source ? [source] : []
  }
  if (name !== 'WebSearch' || !result) return []
  return (resultTextOf(result).match(URL_PATTERN) ?? []).flatMap((raw) => sourceOf(raw) ?? [])
}

/** Each page once, in the order Claude first read it. */
export const uniqueSources = (sources: Source[]): Source[] => {
  const seen = new Set<string>()
  return sources.filter((source) => !seen.has(source.url) && !!seen.add(source.url))
}
