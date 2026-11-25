import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import i18n from '@/i18n'
import { calloutOf, type CalloutProps } from '@/utils/callouts'
import { isLocalUrl } from '@/utils/previewUrl'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}
const escape = (text: string) => text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char)

// Code block with language label and copy button, after prompt-kit's Code Block (MIT).
// The button has no listener here: ChatMarkdown handles clicks on [data-copy].
const highlight = (code: string, language: string): string => {
  const known = !!language && !!hljs.getLanguage(language)
  const body = known ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escape(code)
  const copy = escape(i18n.global.t('chat.copy'))
  return `<pre class="code-block"><div class="code-head"><span>${escape(language || 'text')}</span><button type="button" data-copy aria-label="${copy}">${copy}</button></div><code class="hljs">${body}</code></pre>`
}

const TASK_MARKER = /^\[([ xX])\]\s+/

// GitHub task lists ("- [x] done"): the marker becomes a read-only checkbox. The checkbox is a
// token this plugin writes, so `html: false` still escapes everything Claude wrote.
const taskLists = (md: InstanceType<typeof MarkdownIt>) => {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    state.tokens.forEach((token, index) => {
      const item = state.tokens[index - 2]
      const first = token.children?.[0]
      if (token.type !== 'inline' || item?.type !== 'list_item_open' || first?.type !== 'text')
        return
      const marker = TASK_MARKER.exec(first.content)
      if (!marker) return
      first.content = first.content.slice(marker[0].length)
      const checkbox = new state.Token('html_inline', '', 0)
      const checked = marker[1] === ' ' ? '' : ' checked'
      checkbox.content = `<input type="checkbox" disabled${checked} class="task-check"> `
      token.children?.unshift(checkbox)
      item.attrJoin('class', 'task-item')
    })
  })
}

// A deliberate copy of Lucide's "app-window" (the `AppWindow` the preview's toggle and menu entry
// use from @lucide/vue): a component cannot render inside v-html. Copy it again if Lucide redraws it.
const PREVIEW_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/></svg>'

// A link to a local page (a dev server) gets a button after it that opens the page in Bull's
// preview; the link itself still opens the browser. ChatPane handles clicks on [data-preview].
const previewLinks = (md: InstanceType<typeof MarkdownIt>) => {
  md.core.ruler.after('inline', 'preview_links', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue
      // The href of each link still open; markdown-it types an attribute as string, number or null.
      const opens: string[] = []
      token.children = token.children.flatMap((child) => {
        if (child.type === 'link_open') opens.push(String(child.attrGet('href') ?? ''))
        if (child.type !== 'link_close') return [child]
        const href = opens.pop()
        if (!href || !isLocalUrl(href)) return [child]
        const label = escape(i18n.global.t('preview.open_in_preview'))
        const short = escape(i18n.global.t('preview.open_in_preview_short'))
        const button = new state.Token('html_inline', '', 0)
        button.content = `<button type="button" class="preview-link" data-preview="${escape(href)}" aria-label="${label}">${PREVIEW_ICON}<span>${short}</span></button>`
        return [child, button]
      })
    }
  })
}

// html: false escapes any HTML in Claude's text, so v-html only ever gets markdown output.
// breaks: true keeps single line breaks, as Claude Code shows them in the terminal.
export const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight
})
  .use(taskLists)
  .use(previewLinks)

export type MarkdownSegment =
  { kind: 'markdown'; html: string } | { kind: 'callout'; callout: CalloutProps; html: string }

type MarkdownToken = ReturnType<typeof markdown.parse>[number]

interface CalloutRange {
  /** Index of the quote's opening and closing token */
  open: number
  close: number
  callout: CalloutProps
}

const LINE_BREAKS = /\r\n?/g

/**
 * Claude's text as HTML, cut at its top-level callouts, which render as components with buttons.
 * Parsed once: markdown-it finds the quote blocks (a `> [!…]` in a code block stays text), and one
 * shared env keeps reference links working across a callout.
 */
export const renderSegments = (text: string): MarkdownSegment[] => {
  // markdown-it also breaks lines at a lone \r; the line numbers it reports must match `lines`.
  const source = text.replace(LINE_BREAKS, '\n')
  const lines = source.split('\n')
  const env = {}
  const tokens = markdown.parse(source, env)
  const render = (part: MarkdownToken[]) => markdown.renderer.render(part, markdown.options, env)
  const ranges = tokens.flatMap((token, open): CalloutRange[] => {
    if (token.type !== 'blockquote_open' || token.level !== 0 || !token.map) return []
    const callout = calloutOf(lines.slice(token.map[0], token.map[1]))
    if (!callout) return []
    const close = tokens.findIndex(
      (candidate, at) => at > open && candidate.type === 'blockquote_close' && candidate.level === 0
    )
    return [{ open, close, callout }]
  })
  const markdownBetween = (from: number, to: number): MarkdownSegment[] => {
    const html = render(tokens.slice(from, to))
    return html.trim() ? [{ kind: 'markdown', html }] : []
  }
  const segments = ranges.flatMap((range, index): MarkdownSegment[] => [
    ...markdownBetween((ranges[index - 1]?.close ?? -1) + 1, range.open),
    { kind: 'callout', callout: range.callout, html: markdown.render(range.callout.body, env) }
  ])
  return [...segments, ...markdownBetween((ranges.at(-1)?.close ?? -1) + 1, tokens.length)]
}
