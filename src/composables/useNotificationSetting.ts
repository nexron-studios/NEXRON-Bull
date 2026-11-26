import { computed, ref } from 'vue'
import { createGlobalState, useStorage } from '@vueuse/core'
import { toast } from '@/lib/toast'
import { useI18n } from 'vue-i18n'
import { handleError } from '@/lib/error'
import {
  canShowOsNotification,
  ensureOsPermission,
  hasOsNotifications,
  onWindowFocus,
  readOsPermission,
  showOsNotification
} from '@/lib/osNotification'
import { playSound } from '@/lib/soundPlayer'
import {
  isAllOff,
  settingsOfLegacy,
  withSettingDefaults,
  type NotificationSettings
} from '@/utils/notifications'
import type { OsPermission } from '@/utils/osPermission'

const STORAGE_KEY = 'bull.notification_settings'
/** The one on/off switch before there were settings; read once, then dropped. */
const LEGACY_KEY = 'bull.notifications'
/** Tab notifications count up from 1; a click on the test one opens nothing. */
const TEST_NOTIFICATION_ID = 0

const useSettingsState = createGlobalState(() => {
  const settings = useStorage<NotificationSettings>(
    STORAGE_KEY,
    settingsOfLegacy(localStorage.getItem(LEGACY_KEY)),
    localStorage,
    { mergeDefaults: withSettingDefaults }
  )
  localStorage.removeItem(LEGACY_KEY)
  const permission = ref<OsPermission>(hasOsNotifications() ? 'granted' : 'unavailable')

  // Focus, an opening popover and every bell ask at once; only the latest ask may answer.
  let latestCheck = 0

  /** Asks the system again; it may have changed in the Windows settings meanwhile. */
  const checkPermission = async () => {
    const check = ++latestCheck
    try {
      const answer = await readOsPermission()
      if (check === latestCheck) permission.value = answer
    } catch (error) {
      handleError(error)
    }
  }
  // Once for the app, not per bell: there are several bells, one per layout.
  onWindowFocus(() => void checkPermission()).catch(handleError)

  return { settings, permission, checkPermission }
})

/** What notifies how, saved per app: one structure for the master switch, events, delivery, sound. */
export const useNotificationSetting = () => {
  const { t } = useI18n()
  const { settings, permission, checkPermission } = useSettingsState()

  const isOff = computed(() => isAllOff(settings.value))

  const setOn = async (isOn: boolean) => {
    settings.value = { ...settings.value, isOn }
    if (!isOn || !hasOsNotifications()) return
    try {
      // Without system permission the in-app toasts still work, so the switch stays on.
      permission.value = await ensureOsPermission()
      if (permission.value !== 'granted') toast.warning(t('notifications.permission_denied'))
    } catch (error) {
      handleError(error)
    }
  }

  const update = (change: Partial<NotificationSettings>) => {
    settings.value = { ...settings.value, ...change }
  }

  /** Shows what the background would get: a system notification, else a toast in the window. */
  const sendTest = async () => {
    const title = t('notifications.test_title')
    const body = t('notifications.test_body')
    try {
      const { background, hasSound, sounds } = settings.value
      // Not awaited: a webview without audio must not keep the test notification away.
      if (hasSound) void playSound(sounds.done)
      const canUseOs = background === 'os' && (await canShowOsNotification())
      if (!canUseOs) {
        toast(title, { description: body })
        return
      }
      showOsNotification({
        id: TEST_NOTIFICATION_ID,
        title,
        body,
        hasSystemSound: false,
        hasOpenAction: false
      })
    } catch (error) {
      handleError(error)
    }
  }

  return { settings, permission, isOff, checkPermission, setOn, update, sendTest }
}
