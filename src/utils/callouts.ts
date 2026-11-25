/** The callouts Claude writes at the end of an answer, in Obsidian syntax (`> [!question] …`). */
export const calloutKindList = [
  'changes',
  'info',
  'warning',
  'preview',
  'todo',
  'tip',
  'question'
] as const
export type CalloutKind = (typeof calloutKindList)[number]

export interface CalloutProps {
  kind: CalloutKind
  /** The text after the marker; `null` falls back to the kind's label */
  title: string | null
  /** Markdown inside the quote, without its `>` prefixes */
  body: string
  /** `[!info]-`: starts closed, a click opens it */
  isFolded: boolean
}

const QUOTE_PREFIX = /^ {0,3}> ?/
const CALLOUT_HEAD = /^\[!(\w+)\]([+-]?)[ \t]*(.*)$/

/** The callout a top-level quote block stands for, or `null` when it is a plain quote. */
export const calloutOf = (lines: string[]): CalloutProps | null => {
  const inner = lines.map((line) => line.replace(QUOTE_PREFIX, ''))
  const head = CALLOUT_HEAD.exec(inner[0]?.trim() ?? '')
  if (!head) return null
  const [, name = '', fold = '', title = ''] = head
  const kind = calloutKindList.find((known) => known === name.toLowerCase())
  if (!kind) return null
  return {
    kind,
    title: title.trim() || null,
    body: inner.slice(1).join('\n').trim(),
    isFolded: fold === '-'
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const QUOTE_LINE = /^ {0,3}>/
const LINE_BREAK = /\r\n?|\n/
const TOP_LEVEL_ITEM = /^(?:[-*+]|\d+[.)])\s+/

/**
 * The top-level callouts of a text, found line by line: quote blocks outside code fences. Reads
 * the state of a chat without a markdown parser; the chat itself renders through markdown-it.
 */
export const calloutsIn = (text: string): CalloutProps[] => {
  const blocks: string[][] = []
  let fence: string | null = null
  let quote: string[] | null = null
  for (const line of text.split(LINE_BREAK)) {
    const fenceMark = FENCE.exec(line)?.[1] ?? null
    if (fence) {
      if (fenceMark?.startsWith(fence)) fence = null
      continue
    }
    if (fenceMark) {
      fence = fenceMark
      quote = null
    } else if (QUOTE_LINE.test(line)) {
      if (!quote) {
        quote = []
        blocks.push(quote)
      }
      quote.push(line)
    } else {
      quote = null
    }
  }
  return blocks.flatMap((block) => calloutOf(block) ?? [])
}

const TASK_MARK = /^\[[ xX]\]\s+/
const CONTINUATION = /^\s+\S/

/**
 * The top-level list items of a callout's body, as plain lines: the task box (`[ ]`) dropped, an
 * item that wraps onto indented lines joined, nested items and code blocks left out.
 */
const listItemsOf = (body: string): string[] => {
  const items: string[] = []
  let isInFence = false
  for (const line of body.split(LINE_BREAK)) {
    if (FENCE.test(line)) isInFence = !isInFence
    if (isInFence || FENCE.test(line)) continue
    if (TOP_LEVEL_ITEM.test(line)) {
      items.push(line.replace(TOP_LEVEL_ITEM, '').replace(TASK_MARK, '').trim())
    } else if (items.length && CONTINUATION.test(line) && !TOP_LEVEL_ITEM.test(line.trim())) {
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`
    }
  }
  return items
}

/** The points of a callout's body; a body without a list is one point. */
export const itemsOf = (body: string): string[] => {
  const items = listItemsOf(body)
  return items.length ? items : [body.trim()].filter(Boolean)
}

/** How many top-level list items a folded callout hides; 0 when its body is no list. */
export const pointCountOf = (body: string): number => listItemsOf(body).length

/** What a button quotes: the body, or the title when Claude wrote the question on the marker line. */
export const quotedTextOf = ({ title, body }: CalloutProps): string => body || title || ''

/** Text as a markdown quote: what the user answers goes below it. */
export const quoteOf = (text: string): string =>
  text
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')
