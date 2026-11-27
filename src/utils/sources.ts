import { resultTextOf, type ToolResultBlock } from '@/utils/toolPairs'

export interface Source {
  url: string
  /** Host without `www.`, what the chip shows */
  domain: string
  /** Page title a `WebSearch` result named; a `WebFetch` has none */
  title?: string
}

/** The pages of one site, in the order Claude first read them. */
export interface SourceGroup {
  domain: string
  sources: Source[]
}

/** What the chip row shows, and how many pages wait behind its "+N" chip. */
export interface SourceRow {
  shown: Source[]
  hiddenCount: number
}

// Up to 8 chips are shown as they are; past that 6 stay and the rest fold into "+N", so the chip
// row stays about one line and never hides just one or two pages behind a chip of the same size.
const INLINE_LIMIT = 8
const SHOWN_WHEN_FOLDED = 6

// A URL runs until whitespace, a quote or a bracket; a balanced pair of parentheses belongs to
// it (Wikipedia: `/wiki/Rust_(programming_language)`), a lone one ends it.
const URL_PATTERN = /https?:\/\/(?:[^\s"'<>()[\]{}]|\([^\s"'<>()[\]{}]*\))+/g
const TRAILING_PUNCTUATION = /[.,;:!?]+$/
const WWW_PREFIX = /^www\./
// WebSearch lists its hits as JSON objects: `{"title":"…","url":"…"}`.
const TITLED_LINK = /"title":"((?:[^"\\]|\\.)*)","url":"((?:[^"\\]|\\.)*)"/g

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
  const text = resultTextOf(result)
  const titles = titlesOf(text)
  return (text.match(URL_PATTERN) ?? []).flatMap((raw) => {
    const source = sourceOf(raw)
    if (!source) return []
    const title = titles.get(source.url)
    return title ? { ...source, title } : source
  })
}

/** Page title by url, from the JSON hits of a WebSearch result. */
const titlesOf = (text: string): Map<string, string> => {
  const titles = new Map<string, string>()
  for (const [, title, url] of text.matchAll(TITLED_LINK)) {
    const unescaped = unescapeJson(title)
    if (unescaped) titles.set(unescapeJson(url), unescaped)
  }
  return titles
}

const unescapeJson = (value: string): string => {
  try {
    return JSON.parse(`"${value}"`) as string
  } catch {
    // A broken escape keeps the raw text: a title with a stray backslash is still readable.
    return value
  }
}

/** Each page once, in the order Claude first read it. */
export const uniqueSources = (sources: Source[]): Source[] => {
  const seen = new Set<string>()
  return sources.filter((source) => !seen.has(source.url) && !!seen.add(source.url))
}

/** The chips of the row and the count behind its "+N" chip. */
export const sourceRowOf = (sources: Source[]): SourceRow => {
  if (sources.length <= INLINE_LIMIT) return { shown: sources, hiddenCount: 0 }
  return {
    shown: sources.slice(0, SHOWN_WHEN_FOLDED),
    hiddenCount: sources.length - SHOWN_WHEN_FOLDED
  }
}

/** Pages grouped by site, sites in the order Claude first read one of their pages. */
export const groupSourcesByDomain = (sources: Source[]): SourceGroup[] => {
  const groups = new Map<string, Source[]>()
  for (const source of sources) {
    const pages = groups.get(source.domain)
    if (pages) pages.push(source)
    else groups.set(source.domain, [source])
  }
  return [...groups].map(([domain, pages]) => ({ domain, sources: pages }))
}

/** The url after its host, what a list row under the site's heading shows; `/` for the home page. */
export const pathOf = (url: string): string => {
  const { pathname, search, hash } = new URL(url)
  const path = `${pathname}${search}${hash}`
  try {
    return decodeURI(path)
  } catch {
    // A lone `%` that is no escape: the encoded path is still a readable path.
    return path
  }
}
