import { isTauri } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'

/**
 * Through Tauri, not navigator.clipboard: the web API refuses while the window has no focus. A
 * browser has only the web API; there the copy comes from a tap, so the page has the focus.
 * Resolves `true` once the text is on the clipboard, `false` after the error was shown.
 */
export const copyText = (text: string): Promise<boolean> =>
  (isTauri() ? writeText(text) : navigator.clipboard.writeText(text))
    .then(() => {
      toast.success(i18n.global.t('chat.copied'))
      return true
    })
    .catch((error: unknown) => {
      handleError(error)
      return false
    })
