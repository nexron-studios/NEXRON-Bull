import type { Highlight } from '@/utils/textPieces'

/** A file or folder the `@` menu offers. */
export interface MentionEntry {
  path: string
  isFolder: boolean
  /** Files below a folder; 0 for a file */
  fileCount: number
}

/** The files and every folder above them, folders with a trailing `/` like Claude Code writes. */
export const mentionEntriesOf = (files: readonly string[]): MentionEntry[] => {
  const folders = new Map<string, number>()
  for (const file of files) {
    const parts = file.split('/').slice(0, -1)
    parts.forEach((_, index) => {
      const folder = `${parts.slice(0, index + 1).join('/')}/`
      folders.set(folder, (folders.get(folder) ?? 0) + 1)
    })
  }
  const folderEntries = [...folders].map(([path, fileCount]) => ({
    path,
    isFolder: true,
    fileCount
  }))
  return [...files.map((path) => ({ path, isFolder: false, fileCount: 0 })), ...folderEntries]
}

/** How a picked entry stands in the text: Claude Code reads `@path`, a space ends it. */
export const mentionTextOf = (path: string): string => `@${path} `

const MENTION = /(^|\s)(@\S+)/g

/** Where the `@path` mentions among `known` stand, for the highlight. */
export const mentionRangesOf = (text: string, known: ReadonlySet<string>): Highlight[] =>
  [...text.matchAll(MENTION)].flatMap((match) => {
    const mention = match[2] ?? ''
    if (!known.has(mention.slice(1))) return []
    const start = (match.index ?? 0) + (match[1] ?? '').length
    return [{ start, end: start + mention.length, kind: 'mention' as const }]
  })
