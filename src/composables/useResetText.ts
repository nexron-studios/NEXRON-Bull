import { useI18n } from 'vue-i18n'
import { resetInOf } from '@/utils/quota'

/** `Reset 2:14 h` or `Reset 3 T 4 h` for a quota window; `null` without a reset time. */
export const useResetText = () => {
  const { t } = useI18n()
  return (resetsAt: string | null, now: number): string | null => {
    const left = resetInOf(resetsAt, now)
    if (!left) return null
    const minutes = String(left.minutes).padStart(2, '0')
    return left.days
      ? t('usage.reset_days', { days: left.days, hours: left.hours })
      : t('usage.reset_hours', { hours: left.hours, minutes })
  }
}
