import { onScopeDispose, ref, type Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import type { SearchHit } from '@/utils/chatSearch'

// CSS Custom Highlight names; styled in transitions.css. The registry is global, so only the
// open search owns them.
const HIGHLIGHT_ALL = 'chat-search'
const HIGHLIGHT_CURRENT = 'chat-search-current'
const FLASH_CLASS = 'search-flash'

const hasHighlights = () => typeof CSS !== 'undefined' && 'highlights' in CSS

const itemElementOf = (scroller: HTMLElement, key: string) =>
  scroller.querySelector<HTMLElement>(`[data-search-key="${CSS.escape(key)}"]`)

const termOf = (hit: SearchHit) => hit.text.slice(hit.start, hit.end)

// Every place `term` appears in the visible text of `el`, case-insensitive. A RegExp on the
// original text, because lowercasing can change a string's length ("İ") and shift the offsets.
const rangesOf = (el: HTMLElement, term: string): Range[] => {
  if (!term) return []
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const ranges: Range[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.textContent ?? '').matchAll(pattern)) {
      const range = document.createRange()
      range.setStart(node, match.index)
      range.setEnd(node, match.index + match[0].length)
      ranges.push(range)
    }
  }
  return ranges
}

// Where a box sits in the scrolled content, independent of the current scroll position.
const offsetOf = (scroller: HTMLElement, box: Element | Range) =>
  box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop

// A hit inside a folded callout ("Einzelheiten") opens it: the reader lands on the word, not on
// a closed box.
const unfold = (item: HTMLElement, range: Range) => {
  for (let node = range.startContainer.parentElement; node && node !== item;) {
    if (node instanceof HTMLDetailsElement) node.open = true
    node = node.parentElement
  }
}

const flash = (item: HTMLElement) => {
  item.classList.remove(FLASH_CLASS)
  // Reading a layout value restarts the animation when the same hit is picked again.
  void item.offsetWidth
  item.classList.add(FLASH_CLASS)
  // Children animate too (an arriving item rises): only the flash's own end removes it.
  const settle = (event: AnimationEvent) => {
    if (event.animationName !== 'search-flash') return
    item.classList.remove(FLASH_CLASS)
    item.removeEventListener('animationend', settle)
  }
  item.addEventListener('animationend', settle)
}

/**
 * The search's marks in the rendered chat: every hit highlighted through the CSS Custom Highlight
 * API (the messages stay untouched), the current one stronger, and a tick per hit along the
 * scrollbar. `reveal` readies a hit for the jump.
 */
export const useSearchMarks = (
  scroller: Ref<HTMLElement | null>,
  hits: Ref<SearchHit[]>,
  active: Ref<number>
) => {
  // Hit positions as fractions of the scroll height; `null` for a hit whose item is not
  // rendered, so tick and hit share their index.
  const ticks = ref<(number | null)[]>([])
  let isShown = false

  const clear = () => {
    isShown = false
    ticks.value = []
    if (!hasHighlights()) return
    CSS.highlights.delete(HIGHLIGHT_ALL)
    CSS.highlights.delete(HIGHLIGHT_CURRENT)
  }
  const paint = () => {
    const el = scroller.value
    if (!el) return
    isShown = true
    const items = hits.value.map((hit) => itemElementOf(el, hit.key))
    ticks.value = items.map((item) => (item ? offsetOf(el, item) / el.scrollHeight : null))
    if (!hasHighlights()) return
    const all: Range[] = []
    const now: Range[] = []
    hits.value.forEach((hit, index) => {
      const item = items[index]
      if (item) (index === active.value ? now : all).push(...rangesOf(item, termOf(hit)))
    })
    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...all))
    CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(...now))
  }

  /** Unfolds and flashes the hit's item; where its word sits in the content, `null` if unseen. */
  const reveal = (hit: SearchHit): number | null => {
    const el = scroller.value
    const item = el ? itemElementOf(el, hit.key) : null
    if (!el || !item) return null
    const [word] = rangesOf(item, termOf(hit))
    if (word) unfold(item, word)
    flash(item)
    // The word itself; without one (text the item does not render), the item.
    return offsetOf(el, word ?? item)
  }

  // Images that load and blocks that unfold move everything below them.
  useResizeObserver(
    () => scroller.value?.firstElementChild as HTMLElement | undefined,
    () => isShown && paint()
  )
  onScopeDispose(clear)

  return { ticks, paint, clear, reveal }
}
