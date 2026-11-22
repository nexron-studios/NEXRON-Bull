import type { FuseResult, FuseResultMatch, IFuseOptions } from 'fuse.js'
import type { MentionEntry } from '@/utils/fileMentions'
import { highlightPieces, type HighlightPiece } from '@/utils/highlight'
import { commandGroupList, type CommandGroup, type MenuCommand } from '@/utils/slashCommands'

/**
 * Names are what a person types after `/`; the description finds a command by what it does
 * ("zusammen" finds /compact). Without the length norm a hit in a long description would rank
 * like one in a short name.
 */
export const COMMAND_FUSE_OPTIONS: IFuseOptions<MenuCommand> = {
  keys: [
    { name: 'name', weight: 3 },
    { name: 'description', weight: 1 }
  ],
  threshold: 0.35,
  ignoreLocation: true,
  ignoreFieldNorm: true,
  includeMatches: true,
  minMatchCharLength: 2
}

/** The file name counts more than the folders above it: one types `ChatComp`, not `src/comp`. */
export const MENTION_FUSE_OPTIONS: IFuseOptions<MentionSearchable> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'path', weight: 1 }
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeMatches: true
}

/** A menu shows a handful of files; the rest is a better query away. */
export const MAX_MENTION_ROWS = 8

export interface CommandRow {
  key: string
  command: MenuCommand
  name: HighlightPiece[]
  description: HighlightPiece[]
}

export interface CommandSection {
  group: CommandGroup
  rows: CommandRow[]
}

const rangesOf = (
  matches: readonly FuseResultMatch[] | undefined,
  key: string
): (readonly [number, number])[] =>
  (matches ?? []).filter((match) => match.key === key).flatMap((match) => [...match.indices])

/**
 * Hits by group in the menu's order (Bull, Claude Code, custom), each group ranked by Fuse;
 * groups without a hit drop out.
 */
export const commandSectionsOf = (results: readonly FuseResult<MenuCommand>[]): CommandSection[] =>
  commandGroupList
    .map((group) => ({
      group,
      rows: results
        .filter((result) => result.item.group === group)
        .map(({ item, matches }) => ({
          key: `/${item.name}`,
          command: item,
          name: highlightPieces(item.name, rangesOf(matches, 'name')),
          description: highlightPieces(item.description, rangesOf(matches, 'description'))
        }))
    }))
    .filter((section) => section.rows.length > 0)

/** An entry with its last part apart, so the name can weigh more than the path. */
export interface MentionSearchable extends MentionEntry {
  name: string
}

export const mentionSearchableOf = (entries: readonly MentionEntry[]): MentionSearchable[] =>
  entries.map((entry) => ({
    ...entry,
    name: entry.path.replace(/\/$/, '').split('/').at(-1) ?? entry.path
  }))

export interface MentionRow {
  key: string
  entry: MentionEntry
  path: HighlightPiece[]
}

const depthOf = (path: string): number => path.replace(/\/$/, '').split('/').length

/** Without a query: what lies at the top of the folder, folders first. */
export const topMentionsOf = (
  entries: readonly MentionEntry[],
  limit = MAX_MENTION_ROWS
): MentionRow[] =>
  [...entries]
    .sort(
      (a, b) =>
        depthOf(a.path) - depthOf(b.path) ||
        Number(b.isFolder) - Number(a.isFolder) ||
        a.path.localeCompare(b.path)
    )
    .slice(0, limit)
    .map((entry) => ({ key: entry.path, entry, path: [{ text: entry.path, isHit: false }] }))

/** The best hits, the matched characters of the path set apart. */
export const mentionRowsOf = (
  results: readonly FuseResult<MentionSearchable>[],
  limit = MAX_MENTION_ROWS
): MentionRow[] =>
  results.slice(0, limit).map(({ item, matches }) => {
    // The name's hits sit at the end of the path.
    const offset = item.path.replace(/\/$/, '').length - item.name.length
    const ranges = [
      ...rangesOf(matches, 'path'),
      ...rangesOf(matches, 'name').map(([start, end]) => [start + offset, end + offset] as const)
    ]
    const { name: _name, ...entry } = item
    return { key: item.path, entry, path: highlightPieces(item.path, ranges) }
  })
