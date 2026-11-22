import type { TabStatus } from '@/utils/chatTab'
import type { ActivityState, ToolRun, TurnSummary } from '@/utils/tabActivity'
import type { Connector, ConnectorStatus } from '@/utils/tabInsights'

/**
 * What the panel's "Aktivität" shows (Figma 42e): the approval Claude waits on, the calls of a
 * running turn, ghost rows while the turn has none yet, the last turn's calls, a turn that only
 * answered, or a chat where nothing has run yet.
 */
export type ActivityView =
  | { kind: 'waiting' }
  | { kind: 'live' }
  | { kind: 'thinking'; isWriting: boolean }
  | { kind: 'done'; summary: TurnSummary }
  | { kind: 'answered'; summary: TurnSummary }
  | { kind: 'fresh' }

export const activityViewOf = (state: ActivityState, tools: ToolRun[]): ActivityView => {
  switch (state.kind) {
    case 'waiting':
      return { kind: 'waiting' }
    case 'running':
      return tools.length
        ? { kind: 'live' }
        : { kind: 'thinking', isWriting: state.phase === 'writing' }
    case 'idle': {
      const { summary } = state
      if (!summary) return { kind: 'fresh' }
      // A turn that only kept its plan (TodoWrite) did call a tool: it is summed up, not "answered".
      return summary.calls > 0 ? { kind: 'done', summary } : { kind: 'answered', summary }
    }
    default: {
      const unhandled: never = state
      throw new Error(`Unhandled activity state: ${JSON.stringify(unhandled)}`)
    }
  }
}

/** The mark right of the "Aktivität" title. */
export const activityMarkList = ['needs-you', 'live', 'resting'] as const
export type ActivityMark = (typeof activityMarkList)[number]

export interface ActivityAside {
  /** Tools of the shown turn; `0` hides the count */
  toolCount: number
  mark: ActivityMark | null
}

export const activityAsideOf = (view: ActivityView, toolCount: number): ActivityAside => {
  switch (view.kind) {
    case 'waiting':
      return { toolCount: 0, mark: 'needs-you' }
    case 'live':
      return { toolCount, mark: 'live' }
    case 'thinking':
      return { toolCount: 0, mark: 'live' }
    case 'done':
      return { toolCount, mark: null }
    case 'answered':
      return { toolCount: 0, mark: 'resting' }
    case 'fresh':
      return { toolCount: 0, mark: null }
    default: {
      const unhandled: never = view
      throw new Error(`Unhandled activity view: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * Where setting up a first connector stands, once "Im Terminal einrichten" opened a shell: a check
 * is due when the user is back in the chat, Claude reads its config again, it found nothing, or
 * this Claude cannot reload and has to start again (`restarting` while it does).
 */
export const connectorSetupList = ['due', 'checking', 'checked', 'restart', 'restarting'] as const
export type ConnectorSetup = (typeof connectorSetupList)[number]

/**
 * What "Konnektoren" shows: the reported servers, an account that has none, the skeleton while
 * Claude starts or its first turn begins, or the hint that they come with the next message.
 * Headless Claude sends `system/init`, the only event that lists them, with a turn and not
 * before; a tab whose Claude never had one cannot know them yet.
 *
 * After a setup: the skeleton while Claude looks again, the hint that it looks once the running
 * turn is over, "none yet" with a way to look again, or the restart an older Claude needs.
 */
export const connectorsViewList = [
  'list',
  'none',
  'starting',
  'awaiting',
  'checking',
  'after_turn',
  'recheck',
  'restart'
] as const
export type ConnectorsView = (typeof connectorsViewList)[number]

const setupViewOf = (status: TabStatus, setup: ConnectorSetup): ConnectorsView => {
  if (setup === 'checking' || setup === 'restarting') return 'checking'
  // A Claude that is not running reads the config when it starts: nothing to reload.
  if (status === 'ended') return 'awaiting'
  switch (setup) {
    case 'restart':
      return 'restart'
    case 'due':
    case 'checked':
      if (status === 'working' || status === 'asking') return 'after_turn'
      return status === 'starting' ? 'checking' : 'recheck'
    default: {
      const unhandled: never = setup
      throw new Error(`Unhandled connector setup: ${unhandled}`)
    }
  }
}

export const connectorsViewOf = (
  status: TabStatus,
  connectors: Connector[] | null,
  setup: ConnectorSetup | null = null
): ConnectorsView => {
  if (connectors?.length) return 'list'
  if (setup) return setupViewOf(status, setup)
  if (connectors) return 'none'
  switch (status) {
    case 'starting':
    case 'working':
    case 'asking':
      return 'starting'
    case 'idle':
    case 'ended':
      return 'awaiting'
    default: {
      const unhandled: never = status
      throw new Error(`Unhandled tab status: ${unhandled}`)
    }
  }
}

/**
 * The order of "Konnektoren": what needs the user first (a login, then an error), then what may
 * still come (connecting, unknown), the connected ones last. They work without anyone looking, and
 * with 25 servers the ones to act on would otherwise sit below the fold of the scroll area.
 */
const CONNECTOR_RANK: Record<ConnectorStatus, number> = {
  'needs-auth': 0,
  failed: 1,
  pending: 2,
  unknown: 3,
  connected: 4
}

/**
 * The connectors by state as above, by name within a state (`collator` in the app's language);
 * the input stays as it is.
 */
export const connectorsInOrderOf = (
  connectors: Connector[],
  collator: Intl.Collator
): Connector[] =>
  connectors.toSorted(
    (a, b) =>
      CONNECTOR_RANK[a.status] - CONNECTOR_RANK[b.status] || collator.compare(a.name, b.name)
  )
