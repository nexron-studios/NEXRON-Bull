import { truncateName } from '@/utils/attachments'
import { withoutNoteLines } from '@/utils/imageNotes'
import type { Highlight } from '@/utils/textPieces'

/**
 * Stand-ins for number and name, so the locale's reference template ("[Bild {n} ({name})]") can
 * be read back as a pattern without parsing vue-i18n's message syntax.
 */
export const IMAGE_REF_SLOTS = { n: '\u0001', name: '\u0002' } as const

/** Claude sees no file names; the name only helps the user, shortened like the markup comment's. */
export const IMAGE_REF_NAME_MAX = 24

/** How references read in the current locale, and how to find them again in a text. */
export interface ImageRefFormat {
  render: (n: number, name: string) => string
  /** Global, with the named groups `n` and `name` */
  pattern: RegExp
}

/** What a reference needs to know of an attachment. */
export interface RefImage {
  id: string
  name: string
}

/** A reference in the text: where it stands, the image number it names (from 1) and the name. */
export interface ImageRef {
  start: number
  end: number
  n: number
  name: string
}

export interface TextSelection {
  start: number
  end: number
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The composer draws a reference as one chip over its text, so the textarea must not wrap inside
 * it: spaces become no-break spaces and hyphens no-break hyphens. Typed references with plain ones
 * are still found.
 */
const NO_BREAK_SPACE = '\u00a0'
const NO_BREAK_HYPHEN = '\u2011'
export const unbreakable = (text: string) =>
  text.replaceAll(' ', NO_BREAK_SPACE).replaceAll('-', NO_BREAK_HYPHEN)

// Brackets would end the token early, so a name keeps its meaning with round ones instead.
const nameLabelOf = (name: string) =>
  unbreakable(truncateName(name.replaceAll('[', '(').replaceAll(']', ')'), IMAGE_REF_NAME_MAX))

/** The format for a template rendered with `IMAGE_REF_SLOTS` in place of number and name. */
export const imageRefFormatOf = (template: string): ImageRefFormat => {
  // A group may be named once; a slot used again repeats it by backreference.
  const source = escapeRegExp(template)
    .replaceAll(' ', `[ ${NO_BREAK_SPACE}]`)
    .replaceAll('-', `[-${NO_BREAK_HYPHEN}]`)
    .replace(IMAGE_REF_SLOTS.n, '(?<n>\\d+)')
    .replaceAll(IMAGE_REF_SLOTS.n, '\\k<n>')
    .replace(IMAGE_REF_SLOTS.name, '(?<name>[^\\n\\[\\]]+?)')
    .replaceAll(IMAGE_REF_SLOTS.name, '\\k<name>')
  return {
    render: (n, name) =>
      unbreakable(template)
        .replaceAll(IMAGE_REF_SLOTS.n, () => String(n))
        .replaceAll(IMAGE_REF_SLOTS.name, () => nameLabelOf(name)),
    pattern: new RegExp(source, 'g')
  }
}

/**
 * The text as Claude and the clipboard get it: references with plain spaces and hyphens again, so
 * a file name reads as it is on disk.
 */
export const withPlainImageRefs = (text: string, format: ImageRefFormat) =>
  text.replace(format.pattern, (ref) =>
    ref.replaceAll(NO_BREAK_SPACE, ' ').replaceAll(NO_BREAK_HYPHEN, '-')
  )

/** Every text that reads like a reference, whether or not an image stands behind it. */
export const imageRefsOf = (text: string, format: ImageRefFormat): ImageRef[] =>
  [...text.matchAll(format.pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    n: Number(match.groups?.n),
    name: match.groups?.name ?? ''
  }))

/**
 * The references whose number and name fit `images`, with the image they mean. Anything else
 * (an old prompt from the history, a reference typed apart) stays plain text.
 */
export const validImageRefsOf = <T extends RefImage>(
  text: string,
  images: readonly T[],
  format: ImageRefFormat
): (ImageRef & { image: T })[] =>
  imageRefsOf(text, format).flatMap((ref) => {
    const image = images[ref.n - 1]
    return image && nameLabelOf(image.name) === unbreakable(ref.name) ? [{ ...ref, image }] : []
  })

/**
 * The references of a sent prompt to highlight: those with an image of the prompt behind their
 * number (`srcs` in prompt order). Its file names are not always known (the transcript has none),
 * so the number decides.
 */
export const sentImageRefHighlightsOf = (
  text: string,
  srcs: readonly string[],
  format: ImageRefFormat
): Highlight[] =>
  imageRefsOf(text, format).flatMap(({ start, end, n, name }) => {
    const src = srcs[n - 1]
    return src ? [{ start, end, kind: 'image' as const, n, name, src }] : []
  })

/** Cuts `start`..`end` and one space next to it, so no double space is left behind. */
const cutRange = (text: string, start: number, end: number) => {
  if (text[end] === ' ') return text.slice(0, start) + text.slice(end + 1)
  if (text[start - 1] === ' ') return text.slice(0, start - 1) + text.slice(end)
  return text.slice(0, start) + text.slice(end)
}

/**
 * The text once the attachments went from `before` to `after`: each reference gets its image's new
 * number, or goes when its image went, together with the note lines under it. `successors` points
 * a replaced image at the one that took its place (a marked copy).
 */
export const remapImageRefs = (
  text: string,
  before: readonly RefImage[],
  after: readonly RefImage[],
  format: ImageRefFormat,
  successors: Readonly<Record<string, string>> = {}
): string =>
  // Right to left, so the offsets of the references still to come stay valid.
  validImageRefsOf(text, before, format).reduceRight((result, ref) => {
    const id = successors[ref.image.id] ?? ref.image.id
    const at = after.findIndex((image) => image.id === id)
    const image = after[at]
    if (!image) return cutRange(withoutNoteLines(result, ref.end), ref.start, ref.end)
    return result.slice(0, ref.start) + format.render(at + 1, image.name) + result.slice(ref.end)
  }, text)

/** References in place of the selection, a space on either side where needed; caret after them. */
export const insertImageRefs = (
  text: string,
  selection: TextSelection,
  refs: readonly string[]
): { text: string; caret: number } => {
  const head = text.slice(0, selection.start)
  const tail = text.slice(selection.end)
  const lead = head && !/\s$/.test(head) ? ' ' : ''
  const trail = /^\s/.test(tail) ? '' : ' '
  const inserted = `${lead}${refs.join(' ')}${trail}`
  return { text: head + inserted + tail, caret: head.length + inserted.length }
}

export const deleteDirectionList = ['backward', 'forward'] as const
export type DeleteDirection = (typeof deleteDirectionList)[number]

/** The reference a Backspace (`backward`) or Delete at `caret` would cut into. */
export const imageRefAt = <T extends ImageRef>(
  refs: readonly T[],
  caret: number,
  direction: DeleteDirection
): T | null =>
  refs.find((ref) =>
    direction === 'backward'
      ? ref.start < caret && caret <= ref.end
      : ref.start <= caret && caret < ref.end
  ) ?? null

/** Where a reference chip is drawn, in client pixels, and the image number it names. */
export interface ImageRefBox {
  n: number
  rect: { left: number; right: number; top: number; bottom: number }
}

/**
 * The image number of the chip under a point, or `null`. The composer's chips lie behind the
 * textarea, so a click finds them by position rather than by its target.
 */
export const imageRefNumberAt = (
  boxes: readonly ImageRefBox[],
  x: number,
  y: number
): number | null =>
  boxes.find(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    ?.n ?? null
