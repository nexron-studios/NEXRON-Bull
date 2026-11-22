import { computed } from 'vue'
import i18n from '@/i18n'
import { ageFormatterOf } from '@/utils/elapsed'

// One set of number formats for every row, rebuilt only when the language changes.
const formatAge = computed(() => ageFormatterOf(i18n.global.locale.value))

/** Formats how long ago or for how long, in the app's language: `24 min`, `3 h`. */
export const useAgeFormat = () => formatAge
