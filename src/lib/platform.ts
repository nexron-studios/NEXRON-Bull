import { isTauri } from '@tauri-apps/api/core'
import { offeredSettingsSectionsOf } from '@/utils/settings'

/**
 * The Bull app window, not a browser tab. Only the app has terminals, the login dialog, the
 * machine setup, the window icon and Tauri's clipboard and opener; a browser reaches agentd
 * through the bridge. A function, so tests can switch it.
 */
export const isDesktopApp = (): boolean => isTauri()

/** The settings sections this platform offers. */
export const offeredSettingsSections = () => offeredSettingsSectionsOf(isDesktopApp())
