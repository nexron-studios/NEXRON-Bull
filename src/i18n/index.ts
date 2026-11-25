import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'
import { computerWordOf, systemNameOf } from '@/utils/platform'

export const localeList = ['de', 'en'] as const
export type Locale = (typeof localeList)[number]

const DEFAULT_LOCALE: Locale = 'de'

const browserLocale = (): Locale => {
  const language = navigator.language.slice(0, 2)
  return localeList.find((locale) => locale === language) ?? DEFAULT_LOCALE
}

// The locale texts link to it as `@:computer`.
const computer = computerWordOf(systemNameOf(navigator.userAgent))

const i18n = createI18n({
  legacy: false,
  locale: browserLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { de: { ...de, computer }, en: { ...en, computer } }
})

export default i18n
