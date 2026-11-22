import { invoke } from '@tauri-apps/api/core'

export const windowService = {
  /**
   * Title bar and taskbar icon from one PNG. Tauri's own `setIcon` changes only the title bar on
   * Windows, so `src-tauri/src/window_icon.rs` sets the taskbar's big icon as well.
   */
  setIcon: (png: Uint8Array): Promise<void> =>
    // A plain array: a typed array would cross as an object with numbered keys.
    invoke('set_window_icon', { png: Array.from(png) })
}
