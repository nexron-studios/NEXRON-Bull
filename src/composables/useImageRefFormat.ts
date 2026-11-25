import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NOTE_LINE_SLOTS, noteLineFormatOf } from '@/utils/imageNotes'
import { IMAGE_REF_SLOTS, imageRefFormatOf } from '@/utils/imageRefs'

/** How image references read in the current language ("[Bild 2 (Name…)]"). */
export const useImageRefFormat = () => {
  const { t } = useI18n()
  return computed(() => imageRefFormatOf(t('images.reference', IMAGE_REF_SLOTS)))
}

/** How a mark's note line reads in the current language ("Bild 2: ① smaller"). */
export const useNoteLineFormat = () => {
  const { t } = useI18n()
  return computed(() => noteLineFormatOf(t('images.note_line', NOTE_LINE_SLOTS)))
}
