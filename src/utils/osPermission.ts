/** `unavailable`: the browser tab, which has in-app toasts only. */
export const osPermissionList = ['granted', 'blocked', 'unavailable'] as const
export type OsPermission = (typeof osPermissionList)[number]

/**
 * What the Rust command `notification_setting` answers. `unknown`: not Windows, or an app id
 * Windows has no entry for.
 */
export const osNotificationSettingList = ['enabled', 'blocked', 'unknown'] as const
export type OsNotificationSetting = (typeof osNotificationSettingList)[number]

/**
 * The system's own answer wins: the notification plugin says granted on Windows always, also with
 * Bull switched off in the Windows settings. Without an answer, the plugin's stands.
 */
export const permissionOf = (
  setting: OsNotificationSetting,
  isPluginGranted: boolean
): Exclude<OsPermission, 'unavailable'> => {
  switch (setting) {
    case 'enabled':
      return 'granted'
    case 'blocked':
      return 'blocked'
    case 'unknown':
      return isPluginGranted ? 'granted' : 'blocked'
    default: {
      const unhandled: never = setting
      throw new Error(`Unhandled notification setting: ${unhandled}`)
    }
  }
}
