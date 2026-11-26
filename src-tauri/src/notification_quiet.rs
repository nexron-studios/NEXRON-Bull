//! Whether the system wants quiet right now, so Bull keeps its own notification sound to itself
//! (26.11.2026, Jonas: "bei Nicht stören leise"). Windows silenced its own toast sound in these
//! moments; Bull's sound comes from the webview and has to ask.
//!
//! Windows answers in two places: "Do not disturb" (Focus Assist on Windows 10) is the shell's
//! quiet-hours profile, read from its WNF state as there is no public API for it; a full-screen
//! app, a presentation or the quiet time after setup come from `SHQueryUserNotificationState`.
//! They are told apart because a full-screen app may be Bull itself, which the frontend knows.
//! macOS and Linux have no public way to ask for Focus or Do not disturb: never quiet there.
//! "Priority only" counts as quiet even when Bull is on the priority list: that list has no API.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationQuiet {
    None,
    /// "Do not disturb" is on, in any profile
    DoNotDisturb,
    /// A full-screen app, a presentation or the quiet time after setup
    Busy,
}

/// `QUERY_USER_NOTIFICATION_STATE` values in which Windows holds its notifications back:
/// busy (a full-screen app), a Direct3D full-screen game, presentation mode, the quiet time
/// after a new user signed in.
const BUSY_NOTIFICATION_STATES: [i32; 4] = [2, 3, 4, 6];
/// The quiet-hours profile when "Do not disturb" is off; 1 is "priority only", 2 "alarms only".
const QUIET_HOURS_OFF: u32 = 0;

/// "Do not disturb" wins over busy; an answer that could not be read counts as not quiet.
fn quiet_of(
    notification_state: Option<i32>,
    quiet_hours_profile: Option<u32>,
) -> NotificationQuiet {
    if quiet_hours_profile.is_some_and(|profile| profile != QUIET_HOURS_OFF) {
        return NotificationQuiet::DoNotDisturb;
    }
    if notification_state.is_some_and(|state| BUSY_NOTIFICATION_STATES.contains(&state)) {
        return NotificationQuiet::Busy;
    }
    NotificationQuiet::None
}

/// Asked right before a sound plays: the user turns "Do not disturb" on and off at any time.
#[tauri::command]
pub async fn notification_quiet() -> NotificationQuiet {
    quiet_of(imp::notification_state(), imp::quiet_hours_profile())
}

#[cfg(windows)]
mod imp {
    use std::sync::Once;

    use windows::Win32::UI::Shell::SHQueryUserNotificationState;

    use super::QUIET_HOURS_OFF;

    /// `WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED`: the shell publishes the active "Do not
    /// disturb" profile under this state name. Undocumented, but there since Windows 10 1803;
    /// checked on build 26300 (26.11.2026: profile 1 while Do not disturb was on).
    const WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: u64 = 0x0D83_063E_A3BF_1C75;
    /// Room for a payload that grows in a later Windows; the profile is its first u32.
    const WNF_BUFFER_WORDS: usize = 4;

    static WNF_FAILURE: Once = Once::new();

    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtQueryWnfStateData(
            state_name: *const u64,
            type_id: *const core::ffi::c_void,
            explicit_scope: *const core::ffi::c_void,
            change_stamp: *mut u32,
            buffer: *mut core::ffi::c_void,
            buffer_size: *mut u32,
        ) -> i32;
    }

    pub fn notification_state() -> Option<i32> {
        // SAFETY: plain query without input; Windows only writes the returned value.
        unsafe { SHQueryUserNotificationState() }
            .ok()
            .map(|state| state.0)
    }

    pub fn quiet_hours_profile() -> Option<u32> {
        let mut buffer = [0u32; WNF_BUFFER_WORDS];
        let mut size = size_of_val(&buffer) as u32;
        let mut stamp = 0u32;
        // SAFETY: `size` is exactly the local buffer's size, so Windows writes nothing beyond it.
        let status = unsafe {
            NtQueryWnfStateData(
                &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
                std::ptr::null(),
                std::ptr::null(),
                &mut stamp,
                buffer.as_mut_ptr().cast(),
                &mut size,
            )
        };
        // Once per run: a Windows that moved the state would otherwise fail without a trace.
        if status < 0 {
            WNF_FAILURE.call_once(|| {
                eprintln!("notification_quiet: reading Do not disturb failed: {status:#x}")
            });
            return None;
        }
        // An empty state was never published: Do not disturb was never switched on.
        if size == 0 {
            return Some(QUIET_HOURS_OFF);
        }
        Some(buffer[0])
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn notification_state() -> Option<i32> {
        None
    }

    pub fn quiet_hours_profile() -> Option<u32> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACCEPTS_NOTIFICATIONS: i32 = 5;
    const FULL_SCREEN_GAME: i32 = 3;
    const PRIORITY_ONLY: u32 = 1;

    #[test]
    fn is_not_quiet_when_windows_accepts_notifications_and_dnd_is_off() {
        assert_eq!(
            quiet_of(Some(ACCEPTS_NOTIFICATIONS), Some(QUIET_HOURS_OFF)),
            NotificationQuiet::None
        );
    }

    #[test]
    fn is_do_not_disturb_on_priority_only() {
        assert_eq!(
            quiet_of(Some(ACCEPTS_NOTIFICATIONS), Some(PRIORITY_ONLY)),
            NotificationQuiet::DoNotDisturb
        );
    }

    #[test]
    fn do_not_disturb_wins_over_a_full_screen_app() {
        assert_eq!(
            quiet_of(Some(FULL_SCREEN_GAME), Some(PRIORITY_ONLY)),
            NotificationQuiet::DoNotDisturb
        );
    }

    #[test]
    fn is_busy_while_a_full_screen_game_runs() {
        assert_eq!(
            quiet_of(Some(FULL_SCREEN_GAME), Some(QUIET_HOURS_OFF)),
            NotificationQuiet::Busy
        );
    }

    #[test]
    fn is_not_quiet_when_nothing_could_be_read() {
        assert_eq!(quiet_of(None, None), NotificationQuiet::None);
    }

    #[test]
    fn serializes_in_snake_case() {
        let json = serde_json::to_string(&NotificationQuiet::DoNotDisturb).unwrap();
        assert_eq!(json, "\"do_not_disturb\"");
    }
}
