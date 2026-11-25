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
 * The tabs still running on a machine. The app window started its own and only asks which run; a
 * browser also opens the ones the desktop or another device started, since it learns of them only
 * here (`tabs`, which an older agentd elsewhere does not know).
 */
const runningOnly = async (machine: Machine): Promise<RunningTabs> => {
  const { tabs } = await agentdService.ask<'running'>({ op: 'running' }, machine)
  return { running: tabs, adopted: [] }
}

export const runningTabsOn = async (
  machine: Machine,
  knownIds: ReadonlySet<string>
): Promise<RunningTabs> => {
  if (isDesktopApp()) return runningOnly(machine)
  try {
    const { tabs: infos } = await agentdService.ask<'tabs'>({ op: 'tabs' }, machine)
    return {
      running: infos.map((info) => info.tab),
      adopted: adoptedTabsOf(infos, knownIds, machine)
    }
  } catch (error) {
    // An agentd from before `tabs` still attaches the tabs this browser has; it adopts none until
    // that machine gets the new agentd.
    if (isUnknownOpError(error, 'tabs')) return runningOnly(machine)
    throw error
  }
}
