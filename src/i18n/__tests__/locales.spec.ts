import { describe, expect, it } from 'vitest'
import de from '../locales/de'
import en from '../locales/en'

const keysOf = (messages: object, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  )

describe('locales', () => {
  it('should define the same keys in every language', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(de).sort())
  })
})
