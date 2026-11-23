import { isTauri } from '@tauri-apps/api/core'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { adoptedTabsOf } from '@/utils/adoptedTabs'
import type { SavedTab } from '@/utils/chatTab'

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
export const runningTabsOn = async (
  machine: Machine,
  knownIds: ReadonlySet<string>
): Promise<RunningTabs> => {
  if (isTauri()) {
    const { tabs } = await agentdService.ask<'running'>({ op: 'running' }, machine)
    return { running: tabs, adopted: [] }
  }
  const { tabs: infos } = await agentdService.ask<'tabs'>({ op: 'tabs' }, machine)
  return {
    running: infos.map((info) => info.tab),
    adopted: adoptedTabsOf(infos, knownIds, machine)
  }
}
