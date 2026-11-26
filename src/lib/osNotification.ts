import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification'
import { openUrl } from '@tauri-apps/plugin-opener'
import { permissionOf, type OsNotificationSetting, type OsPermission } from '@/utils/osPermission'

/** The page "System › Notifications"; allowed in `capabilities/default.json` and nothing else. */
const WINDOWS_NOTIFICATION_SETTINGS = 'ms-settings:notifications'
const WINDOWS_USER_AGENT = 'Windows'

const TAP_ACTION = 'tap'
const OPEN_ACTION = 'open'
/** Notifications about a tab carry one button, "Open"; approving stays in the chat, by design. */
const TAB_ACTION_TYPE = 'bull-tab'
/** The system's own sound; only when Bull could not play its own. */
const SYSTEM_SOUND = 'Default'

/** System notifications exist only in the Tauri window; the browser tab uses in-app toasts. */
export const hasOsNotifications = (): boolean => isTauri()

/**
 * Windows' own answer for Bull's toasts. A failed ask counts as no answer: it runs before every
 * notification and on every focus, and must neither drop the notification nor toast an error.
 */
const readSystemSetting = async (): Promise<OsNotificationSetting> => {
  try {
    return await invoke<OsNotificationSetting>('notification_setting')
  } catch (error) {
    console.warn('notifications.setting_failed', { error })
    return 'unknown'
  }
}

/**
 * Whether the system wants quiet: "Do not disturb", a full-screen game, a presentation (Windows
 * only; elsewhere never). Bull's own sound keeps still then, as the system's did. Asked before
 * every sound, the same way as the setting above: a failed ask counts as not quiet.
 */
export const isSystemQuiet = async (): Promise<boolean> => {
  if (!isTauri()) return false
  try {
    return await invoke<boolean>('notification_quiet')
  } catch (error) {
    console.warn('notifications.quiet_failed', { error })
    return false
  }
}

/** Whether the system shows Bull's notifications; asks Windows itself, not only the plugin. */
export const readOsPermission = async (): Promise<OsPermission> => {
  if (!hasOsNotifications()) return 'unavailable'
  const [setting, isPluginGranted] = await Promise.all([readSystemSetting(), isPermissionGranted()])
  return permissionOf(setting, isPluginGranted)
}

/** Asks the system once where it prompts; Windows has no prompt, only its settings. */
export const ensureOsPermission = async (): Promise<OsPermission> => {
  if (!hasOsNotifications()) return 'unavailable'
  const isPluginGranted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
  return permissionOf(await readSystemSetting(), isPluginGranted)
}

/**
 * Whether a system notification can be shown right now. Asked fresh for every notification: while
 * Bull sits in the background no focus event tells it that the Windows settings changed.
 */
export const canShowOsNotification = async (): Promise<boolean> =>
  (await readOsPermission()) === 'granted'

/**
 * Calls back whenever the window comes to the front, for the app's whole life: the Windows
 * settings may have changed while Bull was behind them.
 */
export const onWindowFocus = async (handler: () => void): Promise<void> => {
  if (!isTauri()) return
  await getCurrentWindow().onFocusChanged(({ payload: isFocused }) => {
    if (isFocused) handler()
  })
}

/** Only Windows has a settings page to send the user to; elsewhere the hint text stays alone. */
export const canOpenSystemSettings = (): boolean =>
  hasOsNotifications() && navigator.userAgent.includes(WINDOWS_USER_AGENT)

export const openSystemNotificationSettings = (): Promise<void> =>
  openUrl(WINDOWS_NOTIFICATION_SETTINGS)

/** Registers the "Open" button under its label; once at start, before the first notification. */
export const registerOpenAction = (label: string): Promise<void> =>
  hasOsNotifications()
    ? registerActionTypes([{ id: TAB_ACTION_TYPE, actions: [{ id: OPEN_ACTION, title: label }] }])
    : Promise.resolve()

export interface OsNotification {
  id: number
  title: string
  body: string
  /** The system's sound, as a fallback when Bull could not play its own */
  hasSystemSound: boolean
  /** Shows the "Open" button; a click on the toast itself opens it as well. */
  hasOpenAction: boolean
}

export const showOsNotification = ({
  id,
  title,
  body,
  hasSystemSound,
  hasOpenAction
}: OsNotification): void =>
  // Bull plays its own sound (`soundPlayer`); the system's would come on top of it.
  sendNotification({
    id,
    title,
    body,
    sound: hasSystemSound ? SYSTEM_SOUND : undefined,
    actionTypeId: hasOpenAction ? TAB_ACTION_TYPE : undefined
  })

/**
 * Asked at the moment of need: the webview's `document.hasFocus()` stayed true with the window
 * minimized, and Tauri's focus events missed a blur after a toast click brought the window back.
 */
export const isWindowFocused = (): Promise<boolean> =>
  isTauri() ? getCurrentWindow().isFocused() : Promise.resolve(document.hasFocus())

export const focusWindow = async () => {
  const window = getCurrentWindow()
  await window.unminimize()
  await window.show()
  await window.setFocus()
}

/**
 * Calls back with the id of a clicked notification. Windows reports a click only while the
 * toast is on screen, not from the Action Center. Resolves to the function that stops listening.
 */
export const onOsNotificationClick = async (handler: (id: number) => void): Promise<() => void> => {
  if (!hasOsNotifications()) return () => {}
  const listener = await onAction((event) => {
    if (![TAP_ACTION, OPEN_ACTION].includes(event.actionId) || !event.notification) return
    handler(event.notification.id)
  })
  return () => void listener.unregister()
}
