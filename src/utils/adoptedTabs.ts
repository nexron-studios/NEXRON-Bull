import type { TabInfoProps } from '@/types/agentd.type'
import type { SavedTab } from '@/utils/chatTab'
import { isPermissionMode } from '@/utils/sessionSettings'

/**
 * The running tabs of a machine this app has no tab for yet, as tabs to open: this app did not
 * start them, so `tabs` is all it knows about them. The history comes from the transcript once the
 * app attaches.
 */
export const adoptedTabsOf = (
  infos: TabInfoProps[],
  knownIds: ReadonlySet<string>,
  machine: string | null
): SavedTab[] =>
  infos
    .filter((info) => !knownIds.has(info.tab))
    .map((info) => ({
      id: info.tab,
      title: info.title ?? '',
      profile: info.profile,
      account: info.account ?? '',
      cwd: info.cwd,
      machine,
      sessionId: info.session_id,
      model: info.model,
      // agentd passes on what the starting app sent; a mode this app does not know is no mode.
      permissionMode: isPermissionMode(info.permission_mode) ? info.permission_mode : null,
      effort: info.effort,
      isFresh: info.is_fresh
    }))
