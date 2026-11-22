import { describe, expect, it } from 'vitest'
import { usageFormattersOf } from '../usageFormat'

describe('usageFormattersOf', () => {
  const de = usageFormattersOf('de')
  const en = usageFormattersOf('en')

  // Intl puts a no-break space between number and unit in German.
  it('should write token counts compact in the language', () => {
    expect([de.compact(19_400_000), en.compact(19_400_000), de.compact(812)]).toEqual([
      '19,4 Mio.',
      '19.4M',
      '812'
    ])
  })

  it('should write exact token counts grouped in the language', () => {
    expect([de.exact(22_180), en.exact(200_000)]).toEqual(['22.180', '200,000'])
  })

  it('should write shares and quota percent', () => {
    expect([de.percent(0.38), en.usedPercent(42.4)]).toEqual(['38 %', '42%'])
  })

  it('should write a day key as a short date', () => {
    expect([de.dayShort('2026-11-02'), en.dayShort('2026-11-02')]).toEqual(['2.11.', '11/2'])
  })

  it('should write a day key with its weekday', () => {
    expect([de.dayMedium('2026-11-02'), en.dayMedium('2026-11-02')]).toEqual([
      'Mo., 2.11.',
      'Mon, 11/2'
    ])
  })

  // ICU versions differ in the space before `PM` (plain or narrow no-break).
  it('should write a moment as date and time', () => {
    const moment = new Date(2026, 10, 20, 14, 5).getTime()
    expect(de.dateTime(moment)).toBe('20.11.2026, 14:05')
    expect(en.dateTime(moment)).toMatch(/^Nov 20, 2026, 2:05\sPM$/)
  })

  it('should join parts as a sentence list', () => {
    expect(de.list(['Opus 2', 'Sonnet 1', 'Haiku 3'])).toBe('Opus 2, Sonnet 1 und Haiku 3')
  })
})
