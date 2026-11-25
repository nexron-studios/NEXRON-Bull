import type { ChatMessage } from '@/types/agentd.type'

/** The names a dev server answers to on the machine it runs on. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '0.0.0.0',
  '[::]'
])
/** What a server prints when it listens on every address; a browser cannot load it as such. */
const ANY_ADDRESS_HOSTS: ReadonlySet<string> = new Set(['0.0.0.0', '[::]'])
const LOOPBACK_NAME = 'localhost'
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:'])

// Up to the first space, quote, angle bracket or backtick; a markdown link's `)` and `]` end it too.
// The host must end there: `localhost.example.com` is another machine.
const LOCAL_URL_PATTERN =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0)(?![\w.-])(?::\d{1,5})?(?:[/?#][^\s<>"'`()[\]]*)?/gi
/** Sentence punctuation right after a link belongs to the sentence, not the link. */
const TRAILING_PUNCTUATION = /[.,;:!?*_]+$/

/** The newest local address in Claude's answers and the answer it stands in. */
export interface DetectedPreview {
  url: string
  /** The answer's message id: a later answer wins even when it names the same address again */
  messageId: string
  /** When the answer came (ms), `null` if unknown */
  at: number | null
}

/** What the pane remembers for a tab: the URL it shows and the newest answer at that moment. */
export interface SavedPreview {
  url: string
  /** `messageId` of the newest detected address when `url` was set; a later one replaces `url` */
  detectedIn: string | null
  /** When `url` was set (ms): an older answer the history loads afterwards stays behind it */
  savedAt?: number
}

const parsed = (text: string): URL | null => {
  try {
    return new URL(text)
  } catch {
    // Not a URL at all: the caller treats it like any other text that is no preview address.
    return null
  }
}

/** An http(s) address on the machine itself, the kind a dev server prints. */
export const isLocalUrl = (text: string): boolean => {
  const url = parsed(text)
  return !!url && WEB_PROTOCOLS.has(url.protocol) && LOCAL_HOSTS.has(url.hostname)
}

/** The last local address in a text, as Claude ends a report with the page to look at. */
const lastLocalUrlIn = (text: string): string | null => {
  const found = (text.match(LOCAL_URL_PATTERN) ?? [])
    .map((match) => match.replace(TRAILING_PUNCTUATION, ''))
    .filter(isLocalUrl)
  return found.at(-1) ?? null
}

const timeOf = (at: string | null): number | null => {
  const time = at ? Date.parse(at) : Number.NaN
  return Number.isNaN(time) ? null : time
}

/** The newest local address in Claude's answers, or `null` while there is none. */
export const latestPreviewOf = (messages: readonly ChatMessage[]): DetectedPreview | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    for (let block = message.blocks.length - 1; block >= 0; block--) {
      const part = message.blocks[block]
      const url = part?.type === 'text' ? lastLocalUrlIn(part.text) : null
      if (url) return { url, messageId: message.uuid, at: timeOf(message.at) }
    }
  }
  return null
}

/** Whether Claude named the address after the user set theirs; unknown times count as later. */
const isNewerThan = (detected: DetectedPreview, saved: SavedPreview): boolean => {
  if (detected.messageId === saved.detectedIn) return false
  if (detected.at === null || saved.savedAt === undefined) return true
  return detected.at > saved.savedAt
}

/**
 * The URL the pane shows: a newer address from Claude replaces what was typed or picked, until
 * then the saved one stays (the latest wins).
 */
export const previewUrlOf = (
  saved: SavedPreview | undefined,
  detected: DetectedPreview | null
): string | null => {
  if (!saved) return detected?.url ?? null
  return detected && isNewerThan(detected, saved) ? detected.url : saved.url
}

/**
 * What the user typed into the URL field, as an address: `localhost:5173/x` gets its `http://`.
 * Only http(s), so the field never opens `file:` or `javascript:` in the frame.
 */
export const typedPreviewUrlOf = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null
  const url = parsed(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`)
  return url && WEB_PROTOCOLS.has(url.protocol) ? url.href : null
}

/**
 * The address to load for a tab on this machine: a server that printed the address it listens on
 * (`0.0.0.0`, `[::]`) answers on `localhost`.
 */
export const loadableUrlOf = (text: string): string => {
  const url = parsed(text)
  if (!url || !ANY_ADDRESS_HOSTS.has(url.hostname)) return text
  url.hostname = LOOPBACK_NAME
  return url.href
}

/**
 * The address to load for a tab on another machine: its `localhost` is that machine, so the host
 * becomes `hostName`. Any other address stays as it is.
 */
export const previewUrlOn = (text: string, hostName: string): string => {
  const url = parsed(text)
  if (!url || !LOCAL_HOSTS.has(url.hostname)) return text
  url.hostname = hostName.includes(':') ? `[${hostName}]` : hostName
  return url.href
}

// The page may run scripts and forms, but never navigate or open Bull's window.
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads'
const OWN_ORIGIN_FRAME_SANDBOX = 'allow-scripts allow-forms allow-modals allow-downloads'

/**
 * The frame's sandbox for `src` inside a window served from `origin`. A page from Bull's own origin
 * (its dev server, when Claude works on Bull) keeping that origin could reach into Bull's window
 * and its IPC, so it runs as an opaque origin instead.
 */
export const frameSandboxOf = (src: string, origin: string): string =>
  parsed(src)?.origin === origin ? OWN_ORIGIN_FRAME_SANDBOX : FRAME_SANDBOX
