import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'

/**
 * Through Tauri, not navigator.clipboard: the web API refuses while the window has no focus.
 * Resolves `true` once the text is on the clipboard, `false` after the error was shown. Says
 * nothing on success; the caller decides how to confirm.
 */
export const writeClipboard = (text: string): Promise<boolean> =>
  writeText(text)
    .then(() => true)
    .catch((error: unknown) => {
      handleError(error)
      return false
    })

/** `writeClipboard` with a "Kopiert" toast, for a copy button or shortcut. */
export const copyText = async (text: string): Promise<boolean> => {
  const isCopied = await writeClipboard(text)
  if (isCopied) toast.success(i18n.global.t('chat.copied'))
  return isCopied
}
