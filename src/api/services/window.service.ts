import { invoke } from '@tauri-apps/api/core'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface LogicalWindowSize {
  width: number
  height: number
}

export const windowService = {
  /**
   * Title bar and taskbar icon from one PNG. Tauri's own `setIcon` changes only the title bar on
   * Windows, so `src-tauri/src/window_icon.rs` sets the taskbar's big icon as well.
   */
  setIcon: (png: Uint8Array): Promise<void> =>
    // A plain array: a typed array would cross as an object with numbered keys.
    invoke('set_window_icon', { png: Array.from(png) }),

  /** Zooms the whole page like a browser does: px, rem and media queries alike. */
  setZoom: (zoom: number): Promise<void> => getCurrentWebview().setZoom(zoom),

  /**
   * The window's inner size in logical pixels, the system's scaling taken out. Unlike
   * `innerWidth` it does not change with the page zoom.
   */
  logicalSize: async (): Promise<LogicalWindowSize> => {
    const window = getCurrentWindow()
    const [size, scale] = await Promise.all([window.innerSize(), window.scaleFactor()])
    const { width, height } = size.toLogical(scale)
    return { width, height }
  },

  /** Calls `listener` when the window is resized or moves to a screen with other scaling. */
  onSizeChange: async (listener: () => void): Promise<UnlistenFn> => {
    const window = getCurrentWindow()
    const stopResized = await window.onResized(listener)
    try {
      const stopScaleChanged = await window.onScaleChanged(listener)
      return () => {
        stopResized()
        stopScaleChanged()
      }
    } catch (error) {
      // Not swallowed: the caller reports it; only the half that did subscribe is undone.
      stopResized()
      throw error
    }
  }
}
