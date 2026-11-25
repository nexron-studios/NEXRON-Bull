import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clockStamp, extensionOf, isGenericPasteName, uniqueName } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import { isLargePaste, lineCountOf, type PastedText } from '@/utils/pastedText'

interface ComposerPasteOptions {
  images: Ref<PendingImage[]>
  pastes: Ref<PastedText[]>
  isShell: Ref<boolean>
  addFiles: (files: Iterable<File>) => Promise<void>
}

/**
 * Paste into the composer: a screenshot becomes an image, a long text a chip (Figma 30), so the
 * field stays readable. Short text and anything in shell mode keeps its normal path.
 */
export const useComposerPaste = ({ images, pastes, isShell, addFiles }: ComposerPasteOptions) => {
  const { t } = useI18n()

  // A screenshot comes as "image.png"; the time of the paste tells it apart, a number the rest.
  const namePasted = (files: File[]) =>
    files.reduce<File[]>((named, file) => {
      if (!isGenericPasteName(file.name)) return [...named, file]
      const taken = [...images.value, ...named].map((image) => image.name)
      const time = clockStamp(new Date())
      const name = uniqueName(t('images.pasted_name', { time, ext: extensionOf(file.type) }), taken)
      return [...named, new File([file], name, { type: file.type })]
    }, [])

  const handlePaste = (event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length) {
      event.preventDefault()
      void addFiles(namePasted(files))
      return
    }
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (isShell.value || !isLargePaste(text)) return
    event.preventDefault()
    pastes.value = [
      ...pastes.value,
      { id: crypto.randomUUID(), text, lineCount: lineCountOf(text) }
    ]
  }

  return { handlePaste }
}
