import { describe, expect, it } from 'vitest'
import i18n, { localeList } from '@/i18n'
import de from '../locales/de'
import en from '../locales/en'

const LINK = '@:'
const MESSAGES = { de, en }

const linkingKeysOf = (node: object, trail: string[] = []): string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    if (typeof value === 'string') return value.includes(LINK) ? [[...trail, key].join('.')] : []
    return linkingKeysOf(value, [...trail, key])
  })

describe('the linked computer word', () => {
  it.each(localeList)('should resolve in every %s text that links it', (locale) => {
    const keys = linkingKeysOf(MESSAGES[locale])
    const texts = keys.map((key) => i18n.global.t(key, {}, { locale }))

    expect(keys.length).toBeGreaterThan(0)
    expect(texts.filter((text) => !/\bPCs?\b/.test(text) || text.includes('computer'))).toEqual([])
  })
})
