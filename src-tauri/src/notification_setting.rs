//! Whether the system lets Bull's notifications through. `tauri-plugin-notification` reports
//! "granted" on the desktop always, even when Bull is switched off in the Windows settings, so
//! Windows is asked directly, for the same app id the plugin sends its toasts with.

use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
// Only Windows answers with more than `Unknown`.
#[cfg_attr(not(windows), allow(dead_code))]
pub enum NotificationSetting {
    Enabled,
    Blocked,
    /// Not Windows, or Windows does not know the app id: the plugin's answer stands.
    Unknown,
}

/// What Windows uses for toasts of an app without its own AppUserModelID; copied from
/// `tauri-winrt-notification` (`Toast::POWERSHELL_APP_ID`), which the plugin falls back to.
const POWERSHELL_APP_ID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/// The app id the notification plugin sends with: the app identifier for the installed app,
/// PowerShell's for a build run from `target/`, where no Start menu shortcut carries the id.
/// The plugin keeps this rule private (`desktop.rs` in tauri-plugin-notification 2.8), so it is
/// repeated here; check it again when the plugin moves to a new minor version.
fn toast_app_id<'a>(exe_dir: &Path, identifier: &'a str) -> &'a str {
    let is_build_dir = exe_dir.ends_with("target/debug") || exe_dir.ends_with("target/release");
    if is_build_dir {
        POWERSHELL_APP_ID
    } else {
        identifier
    }
}

/// Asked when the settings open and when the window comes back: the user may change it meanwhile.
#[tauri::command]
pub async fn notification_setting(app: tauri::AppHandle) -> NotificationSetting {
    let Ok(exe) = tauri::utils::platform::current_exe() else {
        return NotificationSetting::Unknown;
    };
    let Some(exe_dir) = exe.parent() else {
        return NotificationSetting::Unknown;
    };
    imp::query(toast_app_id(exe_dir, &app.config().identifier))
}

#[cfg(windows)]
mod imp {
    use super::NotificationSetting;
    use windows::UI::Notifications::{NotificationSetting as WinSetting, ToastNotificationManager};
    use windows::core::HSTRING;

    pub fn query(app_id: &str) -> NotificationSetting {
        let setting = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))
            .and_then(|notifier| notifier.Setting());
        // An app id without a registered shortcut fails here; the plugin's answer is all there is.
        setting.map_or(NotificationSetting::Unknown, setting_of)
    }

    /// Every value but `Enabled` names who switched it off: the app, all notifications, a policy.
    pub fn setting_of(setting: WinSetting) -> NotificationSetting {
        if setting == WinSetting::Enabled {
            NotificationSetting::Enabled
        } else {
            NotificationSetting::Blocked
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::NotificationSetting;

    pub fn query(_app_id: &str) -> NotificationSetting {
        NotificationSetting::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const IDENTIFIER: &str = "com.nexron.chat";

    // Backslash paths only split into components on Windows.
    #[cfg(windows)]
    #[test]
    fn dev_build_uses_the_powershell_app_id() {
        let exe_dir = Path::new(r"C:\dev\nexron-chat\src-tauri\target\debug");
        assert_eq!(toast_app_id(exe_dir, IDENTIFIER), POWERSHELL_APP_ID);
    }

    // Backslash paths only split into components on Windows.
    #[cfg(windows)]
    #[test]
    fn release_build_in_target_uses_the_powershell_app_id() {
        let exe_dir = Path::new(r"C:\dev\nexron-chat\src-tauri\target\release");
        assert_eq!(toast_app_id(exe_dir, IDENTIFIER), POWERSHELL_APP_ID);
    }

    #[test]
    fn installed_app_uses_its_identifier() {
        let exe_dir = Path::new(r"C:\Users\me\AppData\Local\Bull");
        assert_eq!(toast_app_id(exe_dir, IDENTIFIER), "com.nexron.chat");
    }

    #[test]
    fn serializes_in_snake_case() {
        let json = serde_json::to_string(&NotificationSetting::Blocked).unwrap();
        assert_eq!(json, "\"blocked\"");
    }

    #[cfg(windows)]
    #[test]
    fn only_enabled_lets_notifications_through() {
        use windows::UI::Notifications::NotificationSetting as WinSetting;
        assert_eq!(
            imp::setting_of(WinSetting::Enabled),
            NotificationSetting::Enabled
        );
        for setting in [
            WinSetting::DisabledForApplication,
            WinSetting::DisabledForUser,
            WinSetting::DisabledByGroupPolicy,
            WinSetting::DisabledByManifest,
        ] {
            assert_eq!(imp::setting_of(setting), NotificationSetting::Blocked);
        }
    }
}
