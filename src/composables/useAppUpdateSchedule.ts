import { useIntervalFn, useTimeoutFn } from '@vueuse/core'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { UPDATE_FIRST_CHECK_DELAY_MS, isUpdateCheckDue } from '@/utils/appUpdate'

// Short against the 6-hour interval: a laptop that slept through a check catches up soon after
// waking instead of a whole interval later.
const DUE_POLL_MS = 15 * 60 * 1000

/**
 * Looks for a new Bull once shortly after start and then whenever the last look is 6 hours old.
 * Only the installed app: a dev build would install the release over its own `target` folder.
 */
export const useAppUpdateSchedule = () => {
  const store = useAppUpdateStore()
  if (import.meta.env.DEV) return

  const checkInBackground = () => void store.check({ isManual: false })
  const checkIfDue = () => {
    if (!isUpdateCheckDue(store.lastCheckedAt, Date.now())) return
    checkInBackground()
  }

  useTimeoutFn(checkInBackground, UPDATE_FIRST_CHECK_DELAY_MS)
  useIntervalFn(checkIfDue, DUE_POLL_MS)
}
