import { isDesktopApp } from '@/lib/platform'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { adoptedTabsOf } from '@/utils/adoptedTabs'
import type { SavedTab } from '@/utils/chatTab'
import { isUnknownOpError } from '@/utils/sessionActions'

export interface RunningTabs {
  /** Ids of the tabs whose Claude runs on the machine */
  running: string[]
  /** Tabs to open for the ones this app has none for yet */
  adopted: SavedTab[]
}

/**
 * Where this app opens the tabs another app or device started. A browser opens them everywhere; the
 * app window on its own machine, so a second window or a fresh install shows every chat running
 * there. Other machines it leaves to the tabs it opened there itself.
 */
export const adoptsOn = (machine: Machine): boolean => !isDesktopApp() || machine === null

/** The tabs still running on a machine, without adopting any. */
const runningOnly = async (machine: Machine): Promise<RunningTabs> => {
  const { tabs } = await agentdService.ask<'running'>({ op: 'running' }, machine)
  return { running: tabs, adopted: [] }
}

/**
 * The tabs still running on a machine, and where this app adopts, the ones it has none for yet:
 * it learns of those only here (`tabs`, which an older agentd elsewhere does not know).
 */
export const runningTabsOn = async (
  machine: Machine,
  knownIds: ReadonlySet<string>
): Promise<RunningTabs> => {
  if (!adoptsOn(machine)) return runningOnly(machine)
  try {
    const { tabs: infos } = await agentdService.ask<'tabs'>({ op: 'tabs' }, machine)
    return {
      running: infos.map((info) => info.tab),
      adopted: adoptedTabsOf(infos, knownIds, machine)
    }
  } catch (error) {
    // An agentd from before `tabs` still attaches the tabs this app has; it adopts none until
    // that machine gets the new agentd.
    if (isUnknownOpError(error, 'tabs')) return runningOnly(machine)
    throw error
  }
}
