import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

/**
 * Opens a web or mail link outside Bull: in the app through the system browser, in a browser in a
 * new tab, without handing the opened page a way back to this one.
 */
export const openLink = async (url: string): Promise<void> => {
  if (isTauri()) return openUrl(url)
  window.open(url, '_blank', 'noopener,noreferrer')
}
