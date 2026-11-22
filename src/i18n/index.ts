import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'

export const localeList = ['de', 'en'] as const
export type Locale = (typeof localeList)[number]

const DEFAULT_LOCALE: Locale = 'de'

const browserLocale = (): Locale => {
  const language = navigator.language.slice(0, 2)
  return localeList.find((locale) => locale === language) ?? DEFAULT_LOCALE
}

const i18n = createI18n({
  legacy: false,
  locale: browserLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { de, en }
})

export default i18n
