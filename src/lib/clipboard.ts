import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'

/**
 * Through Tauri, not navigator.clipboard: the web API refuses while the window has no focus.
 * Resolves `true` once the text is on the clipboard, `false` after the error was shown.
 */
export const copyText = (text: string): Promise<boolean> =>
  writeText(text)
    .then(() => {
      toast.success(i18n.global.t('chat.copied'))
      return true
    })
    .catch((error: unknown) => {
      handleError(error)
      return false
    })
