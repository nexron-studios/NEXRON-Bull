import { describe, expect, it } from 'vitest'
import { ageFormatterOf, formatElapsed, formatHoursMinutes } from '../elapsed'

describe('formatElapsed', () => {
  it('should show minutes and seconds', () => {
    expect(formatElapsed(42_400)).toBe('0:42')
  })

  it('should add hours past one hour', () => {
    expect(formatElapsed(3_729_000)).toBe('1:02:09')
  })

  it('should not go below zero when clocks disagree', () => {
    expect(formatElapsed(-500)).toBe('0:00')
  })
})

describe('ageFormatterOf', () => {
  it('should say under a minute for fresh times', () => {
    expect(ageFormatterOf('en')(42_000)).toBe('< 1 min')
  })

  it('should count whole minutes below an hour', () => {
    expect(ageFormatterOf('en')(24 * 60_000 + 59_000)).toBe('24 min')
  })

  it('should switch to hours and then days', () => {
    expect([ageFormatterOf('de')(3 * 3_600_000), ageFormatterOf('de')(50 * 3_600_000)]).toEqual([
      '3 Std.',
      '2 Tg.'
    ])
  })
})

describe('formatHoursMinutes', () => {
  it('should show hours and padded minutes and drop the seconds', () => {
    expect(formatHoursMinutes(3_725_000)).toBe('1:02')
    expect(formatHoursMinutes(45_659_000)).toBe('12:40')
  })
})
