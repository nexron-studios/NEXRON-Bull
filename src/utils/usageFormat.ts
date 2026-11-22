/** Number and date formats of the usage page for one locale; build once per locale. */
export interface UsageFormatters {
  /** `4,4 Mrd.`, `19,4 Mio.`, `812` */
  compact: (value: number) => string
  /** `22.180` (de), `22,180` (en) */
  exact: (value: number) => string
  /** 0.38 → `38 %` */
  percent: (share: number) => string
  /** Quota utilisation as the endpoint sends it, 0…100 → `42 %` */
  usedPercent: (value: number) => string
  /** `YYYY-MM-DD` → `2.11.` (de) or `11/2` (en) */
  dayShort: (day: string) => string
  /** `YYYY-MM-DD` → `Mo., 2.11.` (de) or `Mon, 11/2` (en) */
  dayMedium: (day: string) => string
  /** `YYYY-MM-DD` → `Montag, 2. November` */
  dayLong: (day: string) => string
  /** `Opus 2 Mio., Sonnet 1 Mio. und Haiku 3.000` */
  list: (parts: string[]) => string
  /** ms since epoch → `14:05` */
  time: (ms: number) => string
  /** ms since epoch → `20.11.2026, 14:05` (de) or `Nov 20, 2026, 2:05 PM` (en) */
  dateTime: (ms: number) => string
  /** 0 → `Jan.` (de) or `Jan` (en) */
  monthShort: (month: number) => string
  /** 0 = Monday → `Mo` (de) or `Mon` (en) */
  weekdayShort: (weekday: number) => string
}

/** A Monday in January; months and weekdays are counted from it. */
const REFERENCE_YEAR = 2024

/** Noon, so a day key never slips into the neighbouring day around a time-zone change. */
const dateOf = (day: string): Date => new Date(`${day}T12:00:00`)

export const usageFormattersOf = (locale: string): UsageFormatters => {
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  const exact = new Intl.NumberFormat(locale)
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
  const dayShort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' })
  const dayMedium = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric'
  })
  const dayLong = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' })
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return {
    compact: (value) => compact.format(value),
    exact: (value) => exact.format(value),
    percent: (share) => percent.format(share),
    usedPercent: (value) => percent.format(value / 100),
    dayShort: (day) => dayShort.format(dateOf(day)),
    dayMedium: (day) => dayMedium.format(dateOf(day)),
    dayLong: (day) => dayLong.format(dateOf(day)),
    list: (parts) => list.format(parts),
    time: (ms) => time.format(ms),
    dateTime: (ms) => dateTime.format(ms),
    monthShort: (month) => monthShort.format(new Date(REFERENCE_YEAR, month, 1, 12)),
    weekdayShort: (weekday) => weekdayShort.format(new Date(REFERENCE_YEAR, 0, 1 + weekday, 12))
  }
}
