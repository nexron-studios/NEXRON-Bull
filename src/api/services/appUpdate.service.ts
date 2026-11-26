import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// GitHub answers within a second; a stuck proxy must not keep "Suche …" up for minutes.
const CHECK_TIMEOUT_MS = 30 * 1000

/** Bytes of the download so far and in total; `total` is null when no length was sent. */
export type DownloadProgress = { downloaded: number; total: number | null }

/**
 * The Tauri updater, read from `latest.json` of the newest published GitHub release. The update
 * handle stays opaque to the rest of the app: only this service downloads and installs it.
 */
export const appUpdateService = {
  /** The newer release, or `null` when this Bull is the newest. */
  find: async (): Promise<Update | null> => check({ timeout: CHECK_TIMEOUT_MS }),

  download: async (
    update: Update,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> => {
    let downloaded = 0
    let total: number | null = null
    await update.download((event: DownloadEvent) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength ?? null
          break
        case 'Progress':
          downloaded += event.data.chunkLength
          break
        case 'Finished':
          return
      }
      onProgress({ downloaded, total })
    })
  },

  /**
   * Installs the downloaded update and starts the new Bull. On Windows the installer ends this
   * process itself and starts Bull again, so `relaunch` only runs on macOS and Linux.
   */
  installAndRestart: async (update: Update): Promise<void> => {
    await update.install()
    await relaunch()
  }
}
