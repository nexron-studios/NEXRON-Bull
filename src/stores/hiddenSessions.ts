import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'
import type { SessionSummaryProps } from '@/types/agentd.type'
import {
  visibleSessionsOf,
  withHidden,
  withoutHidden,
  type HiddenSessions
} from '@/utils/hiddenSessions'

const HIDDEN_STORAGE_KEY = 'bull.sessions.hidden'

/** Sessions the user removed from the sidebar and the overview; kept across restarts. */
export const useHiddenSessionsStore = defineStore('hiddenSessions', () => {
  const hidden = useStorage<HiddenSessions>(HIDDEN_STORAGE_KEY, {})

  const hide = (keys: string[]) => {
    hidden.value = withHidden(hidden.value, keys, Date.now())
  }

  const unhide = (keys: string[]) => {
    hidden.value = withoutHidden(hidden.value, keys)
  }

  const visibleOf = (machine: Machine, sessions: SessionSummaryProps[]) =>
    visibleSessionsOf(hidden.value, machine, sessions)

  return { hidden, hide, unhide, visibleOf }
})
