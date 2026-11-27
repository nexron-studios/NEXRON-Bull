import type { FuseResult, FuseResultMatch } from 'fuse.js'
import type { ChatMessage } from '@/types/agentd.type'
import type { StreamItem } from '@/utils/chatStream'
import type { ToolUseBlock } from '@/utils/toolPairs'
import { summarizeToolInput } from '@/utils/toolSummary'

/** Who a hit comes from: the user, Claude, or a tool Claude ran (by its name). */
export type SearchSource = { kind: 'user' } | { kind: 'claude' } | { kind: 'tool'; name: string }

/** One searchable text of the chat; `key` is the stream item that shows it. */
export interface SearchEntry {
  key: string
  /** Position in the stream, so hits read top to bottom like the chat */
  order: number
  text: string
  source: SearchSource
  at: string | null
}

/** An entry that matched, with the matched part of its text (`end` exclusive). */
export interface SearchHit extends SearchEntry {
  start: number
  end: number
}

export interface Snippet {
  before: string
  term: string
  after: string
}

// Context kept before the match in a hit row; the row truncates what follows.
const SNIPPET_LEAD = 32
const SNIPPET_TAIL = 120
// A hit lands in the upper third of the chat, where the eye starts reading.
const TARGET_FRACTION = 1 / 3

const textOf = (message: ChatMessage): string =>
  message.blocks
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim()

const toolEntryOf = (key: string, order: number, block: ToolUseBlock): SearchEntry[] => {
  const text = summarizeToolInput(block.input)
  return text ? [{ key, order, text, source: { kind: 'tool', name: block.name }, at: null }] : []
}

/** What the search looks through: what was said, and the one line of each tool call. */
export const searchEntriesOf = (stream: StreamItem[]): SearchEntry[] =>
  stream.flatMap((item, order): SearchEntry[] => {
    switch (item.kind) {
      case 'message': {
        const text = textOf(item.message)
        const source: SearchSource = { kind: item.message.role === 'user' ? 'user' : 'claude' }
        return text ? [{ key: item.key, order, text, source, at: item.message.at }] : []
      }
      case 'tool':
        return toolEntryOf(item.key, order, item.block)
      case 'reads':
        return item.steps.flatMap((step) =>
          step.kind === 'tool' ? toolEntryOf(item.key, order, step.block) : []
        )
      // Thinking and sources are not what a reader looks for again.
      case 'reasoning':
      case 'sources':
        return []
      default: {
        const unhandled: never = item
        throw new Error(`Unhandled stream item: ${JSON.stringify(unhandled)}`)
      }
    }
  })

// Fuse reports every stretch that matched; the longest is the word the reader typed.
const longestRangeOf = (matches: readonly FuseResultMatch[] | undefined) =>
  (matches ?? [])
    .flatMap((match) => match.indices)
    .reduce<readonly [number, number] | null>(
      (best, range) => (!best || range[1] - range[0] > best[1] - best[0] ? range : best),
      null
    )

// A letter, digit, or a joiner inside a word ("App-Icon" stays one word, "icons.md" too).
const WORD_CHAR = /[\p{L}\p{N}_.-]/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

// A fuzzy match marks scattered letters ("on" of "Icon" for "ikon"); the hit is the whole word
// around them, so the chat marks "Icon" and not every "on".
const wordAround = (text: string, [from, to]: readonly [number, number]): [number, number] => {
  let start = from
  let end = to + 1
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? '')) start -= 1
  while (end < text.length && WORD_CHAR.test(text[end] ?? '')) end += 1
  // The text is markdown: `_Icon_` renders as Icon, and a dot at the end closes the sentence. The
  // word starts and ends with a letter or digit, so it is found in the rendered chat.
  while (start < end - 1 && !LETTER_OR_DIGIT.test(text[start] ?? '')) start += 1
  while (end > start + 1 && !LETTER_OR_DIGIT.test(text[end - 1] ?? '')) end -= 1
  return [start, end]
}

/** Fuse's results as hits, in chat order: up and down walk the chat, not the ranking. */
export const hitsOf = (results: FuseResult<SearchEntry>[]): SearchHit[] =>
  results
    .flatMap(({ item, matches }) => {
      const range = longestRangeOf(matches)
      if (!range) return []
      const [start, end] = wordAround(item.text, range)
      return [{ ...item, start, end }]
    })
    .sort((a, b) => a.order - b.order)

/** The hit's line for the list: a little before the match, the match, and what follows. */
export const snippetOf = ({ text, start, end }: SearchHit): Snippet => {
  const flat = text.replace(/\s/g, ' ')
  const from = Math.max(0, start - SNIPPET_LEAD)
  return {
    before: `${from > 0 ? '…' : ''}${flat.slice(from, start)}`,
    term: flat.slice(start, end),
    after: flat.slice(end, end + SNIPPET_TAIL)
  }
}

/** The next hit `delta` steps away, wrapping around at both ends. */
export const steppedIndexOf = (index: number, delta: number, count: number): number =>
  count ? (((index + delta) % count) + count) % count : 0

/** The scrollTop that puts content at `offset` into the upper third of the viewport. */
export const scrollTargetOf = (offset: number, viewport: number, maxScroll: number): number =>
  Math.min(maxScroll, Math.max(0, offset - viewport * TARGET_FRACTION))
