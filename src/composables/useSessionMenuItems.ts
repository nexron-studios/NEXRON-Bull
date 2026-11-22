import { computed, toValue, type Component, type MaybeRefOrGetter } from 'vue'
import { Copy, Eraser, EyeOff, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useSessionActionsStore } from '@/stores/sessionActions'
import {
  isActionAvailable,
  sessionActionList,
  type SessionAction,
  type SessionTarget
} from '@/utils/sessionActions'

export interface SessionMenuItem {
  action: SessionAction
  label: string
  icon: Component
  isDestructive: boolean
}

const ICONS: Record<SessionAction, Component> = {
  copy_id: Copy,
  clear: Eraser,
  remove: EyeOff,
  delete: Trash2
}

/** The entries of a session's "…" and context menu: only what applies to this session. */
export const useSessionMenuItems = (target: MaybeRefOrGetter<SessionTarget | null>) => {
  const { t } = useI18n()
  const actions = useSessionActionsStore()

  const items = computed<SessionMenuItem[]>(() => {
    const current = toValue(target)
    if (!current) return []
    return sessionActionList
      .filter((action) => isActionAvailable(action, current))
      .map((action) => ({
        action,
        label: t(`session_actions.menu.${action}`),
        icon: ICONS[action],
        isDestructive: action === 'delete'
      }))
  })

  const run = (action: SessionAction) => {
    const current = toValue(target)
    if (current) actions.act(action, current)
  }

  return { items, run }
}
