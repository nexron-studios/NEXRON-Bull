export const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const twoDigits = (value: number) => String(value).padStart(2, '0')

/** Running time like a stopwatch: `0:42`, `12:05`, `1:02:09`. */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  const seconds = total % SECONDS_PER_MINUTE
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR
  const hours = Math.floor(total / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR))
  return hours
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes}:${twoDigits(seconds)}`
}

export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR
const MS_PER_DAY = MS_PER_HOUR * 24

/** Hours and minutes, for spans past an hour: `1:02`, `12:40`. */
export const formatHoursMinutes = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / MS_PER_MINUTE))
  return `${Math.floor(totalMinutes / MINUTES_PER_HOUR)}:${twoDigits(totalMinutes % MINUTES_PER_HOUR)}`
}

const unitFormat = (locale: string, unit: 'minute' | 'hour' | 'day') =>
  new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' })

/**
 * A coarse age for list rows: `< 1 min`, `24 min`, `3 h`, `2 d`; it changes once a minute.
 * Build it once per locale: an `Intl.NumberFormat` is too costly to create per row and tick.
 */
export const ageFormatterOf = (locale: string): ((ms: number) => string) => {
  const minute = unitFormat(locale, 'minute')
  const hour = unitFormat(locale, 'hour')
  const day = unitFormat(locale, 'day')
  return (ms) => {
    if (ms < MS_PER_MINUTE) return `< ${minute.format(1)}`
    if (ms < MS_PER_HOUR) return minute.format(Math.floor(ms / MS_PER_MINUTE))
    if (ms < MS_PER_DAY) return hour.format(Math.floor(ms / MS_PER_HOUR))
    return day.format(Math.floor(ms / MS_PER_DAY))
  }
}
