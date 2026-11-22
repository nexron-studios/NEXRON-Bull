import { useI18n } from 'vue-i18n'
import type { RowActivity } from '@/utils/sessionList'

/** What a busy session is doing, as one line: `Edit · site.webmanifest`, `wartet auf eine Antwort`. */
export const useActivityLabel = () => {
  const { t } = useI18n()

  return (activity: RowActivity): string => {
    switch (activity.kind) {
      case 'tool':
        return activity.target ? `${activity.tool} · ${activity.target}` : activity.tool
      case 'ask':
        return t(`notifications.reason.${activity.reason}`)
      case 'state':
        return t(`chat.stream.activity.${activity.state}`)
      default: {
        const unhandled: never = activity
        throw new Error(`Unhandled row activity: ${JSON.stringify(unhandled)}`)
      }
    }
  }
}
