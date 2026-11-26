/** How often a running Bull looks for a new version, besides once shortly after start. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** The first check waits until start-up work (tabs, agentd, quota) is done. */
export const UPDATE_FIRST_CHECK_DELAY_MS = 15 * 1000

const NOTE_LINE_COUNT_MAX = 6
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/
const HEADING = /^\s*#{1,6}\s/
const INLINE_MARKUP = /\*\*|__|`/g
const LINK = /\[([^\]]+)\]\([^)]*\)/g

/** What Bull shows of a release before anything is downloaded. */
export type UpdateInfo = {
  version: string
  currentVersion: string
  notes: string[]
}

/** Where an update went wrong, so the dialog can say what still holds. */
export const updateStepList = ['check', 'download', 'install'] as const
export type UpdateStep = (typeof updateStepList)[number]

/**
 * One state for the whole update, from looking to restarting. `downloadedBytes` and `totalBytes`
 * come from the download stream; GitHub always sends a length, a proxy may not (`null`).
 */
export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; downloadedBytes: number; totalBytes: number | null }
  | { kind: 'ready'; info: UpdateInfo }
  | { kind: 'installing'; info: UpdateInfo }
  | { kind: 'failed'; step: 'check'; info: null; reason: string }
  | { kind: 'failed'; step: Exclude<UpdateStep, 'check'>; info: UpdateInfo; reason: string }

/**
 * The release notes as short lines for the dialog: the list items of the GitHub release, or its
 * paragraphs when it has no list. Markdown marks and link targets go, headings are skipped.
 */
export const releaseNoteLinesOf = (body: string | undefined): string[] => {
  if (!body) return []
  const lines = body.split(/\r?\n/).filter((line) => line.trim() && !HEADING.test(line))
  const items = lines.filter((line) => LIST_MARKER.test(line))
  return (items.length ? items : lines)
    .map((line) =>
      line.replace(LIST_MARKER, '').replace(LINK, '$1').replace(INLINE_MARKUP, '').trim()
    )
    .filter(Boolean)
    .slice(0, NOTE_LINE_COUNT_MAX)
}

/** Share of the download done, 0 to 1; `null` while the size is unknown. */
export const downloadRatioOf = (
  downloadedBytes: number,
  totalBytes: number | null
): number | null => {
  if (!totalBytes) return null
  return Math.min(1, downloadedBytes / totalBytes)
}

/** Whether the scheduled check is due; `0` (never checked) always is. */
export const isUpdateCheckDue = (lastCheckedAt: number, now: number): boolean =>
  now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS

/** The update this phase is about, if any. */
export const updateInfoOf = (phase: UpdatePhase): UpdateInfo | null => {
  switch (phase.kind) {
    case 'idle':
    case 'checking':
    case 'current':
      return null
    case 'available':
    case 'downloading':
    case 'ready':
    case 'installing':
    case 'failed':
      return phase.info
    default: {
      const unhandled: never = phase
      throw new Error(`Unhandled update phase: ${JSON.stringify(unhandled)}`)
    }
  }
}
