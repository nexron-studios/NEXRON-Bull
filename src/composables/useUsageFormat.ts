import { computed } from 'vue'
import i18n from '@/i18n'
import { usageFormattersOf } from '@/utils/usageFormat'

// One set of Intl formats for the whole page, rebuilt only when the language changes.
const formatters = computed(() => usageFormattersOf(i18n.global.locale.value))

/** Numbers, shares and days of the usage page in the app's language. */
export const useUsageFormat = () => formatters
