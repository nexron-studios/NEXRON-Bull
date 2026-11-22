import { isTauri } from '@tauri-apps/api/core'

/** Lets Chrome and Edge install the browser tab at localhost:1460 as an app. */
export const registerServiceWorker = (): void => {
  // The Tauri window is already an app; a worker there would only sit between it and the dev server.
  if (isTauri()) return
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) =>
    console.warn('pwa.register_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  )
}
