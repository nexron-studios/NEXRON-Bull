import type { ChatMessage } from '@/types/agentd.type'
import { timeOf } from '@/utils/tabInsights'
import { diffCountsOf, diffOf, inputRowsOf, patchRowsOf } from '@/utils/toolInput'
import { resultsByToolId } from '@/utils/toolPairs'

/** A file Claude changed in this chat, with every change to it summed up. */
export interface ChangedFile {
  /** One file however its path was spelled (`C:\a.ts`, `c:/A.ts`) */
  key: string
  /** As first spelled, so the row keeps its name */
  path: string
  name: string
  /** The folder it sits in, by name only (the tooltip has the path); empty for a bare name */
  folder: string
  added: number
  removed: number
  /** The card a click shows: the latest change's own, or the Agent call of the subagent that made it */
  cardId: string
}

/** Messages that change files, and where a click on such a change goes. */
export interface ChangeSource {
  messages: ChatMessage[]
  /** The Agent call of a subagent's transcript; `null` for the chat, whose calls have own cards */
  cardId: string | null
}

const PATH_SEPARATOR = /[\\/]/
/** A drive letter or a UNC share: a Windows path, where case does not count. */
const WINDOWS_PATH = /^([a-z]:\/|\/\/)/i

const keyOf = (path: string): string => {
  const slashed = path.replaceAll('\\', '/')
  return WINDOWS_PATH.test(slashed) ? slashed.toLowerCase() : slashed
}

const nameAndFolderOf = (path: string): Pick<ChangedFile, 'name' | 'folder'> => {
  const segments = path.split(PATH_SEPARATOR).filter(Boolean)
  const name = segments.pop() ?? path
  return { name, folder: segments.pop() ?? '' }
}

interface FileChange {
  path: string
  added: number
  removed: number
  cardId: string
  at: number | null
}

/** The Edit, MultiEdit and Write calls of one source that went through, with their counts. */
const changesOf = ({ messages, cardId }: ChangeSource): FileChange[] => {
  const results = resultsByToolId(messages)
  return messages.flatMap((message) =>
    message.blocks.flatMap((block): FileChange[] => {
      if (block.type !== 'tool_use') return []
      const path = block.input.file_path
      const lines = diffOf(block.name, block.input)
      const result = results.get(block.id)
      if (typeof path !== 'string' || !lines || !result || result.is_error) return []
      const rows = result.patch?.length ? patchRowsOf(result.patch) : inputRowsOf(lines)
      return [{ path, ...diffCountsOf(rows), cardId: cardId ?? block.id, at: timeOf(message) }]
    })
  )
}

/**
 * Every file changed in the chat and in its subagents' transcripts, the latest changed first.
 * Failed calls changed nothing and are left out, as are calls still waiting for their result.
 * The counts come from Claude Code's patch, else from the call's own input.
 */
export const changedFilesOf = (sources: ChangeSource[]): ChangedFile[] => {
  // Stable: changes without a time keep their place in the chat.
  const changes = sources.flatMap(changesOf).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const files = new Map<string, ChangedFile>()
  for (const change of changes) {
    const key = keyOf(change.path)
    const before = files.get(key)
    // Deleted and set again, so the map's order follows the latest change.
    files.delete(key)
    files.set(key, {
      key,
      path: before?.path ?? change.path,
      ...nameAndFolderOf(before?.path ?? change.path),
      added: (before?.added ?? 0) + change.added,
      removed: (before?.removed ?? 0) + change.removed,
      cardId: change.cardId
    })
  }
  return [...files.values()].reverse()
}
