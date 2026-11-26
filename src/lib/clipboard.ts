import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from '@/lib/toast'
import { isDesktopApp } from '@/lib/platform'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'

/**
 * Through Tauri, not navigator.clipboard: the web API refuses while the window has no focus. A
 * browser has only the web API; there the copy comes from a tap, so the page has the focus.
 * Resolves `true` once the text is on the clipboard, `false` after the error was shown. Says
 * nothing on success; the caller decides how to confirm.
 */
export const writeClipboard = (text: string): Promise<boolean> =>
  // Inside the chain: outside a secure context the browser has no `navigator.clipboard` at all.
  Promise.resolve()
    .then(() => (isDesktopApp() ? writeText(text) : navigator.clipboard.writeText(text)))
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
