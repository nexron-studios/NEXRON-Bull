//! Whether the system wants quiet right now, so Bull keeps its own notification sound to itself
//! (26.11.2026, Jonas: "bei Nicht stören leise"). Windows silenced its own toast sound in these
//! moments; Bull's sound comes from the webview and has to ask.
//!
//! Windows answers in two places: "Do not disturb" (Focus Assist on Windows 10) is the shell's
//! quiet-hours profile, read from its WNF state as there is no public API for it; a full-screen
//! game, a presentation or the quiet time after setup come from `SHQueryUserNotificationState`.
//! macOS and Linux have no public way to ask for Focus or Do not disturb, so they never count as
//! quiet there.

/// `QUERY_USER_NOTIFICATION_STATE` values in which Windows holds its notifications back:
/// busy (a full-screen app), a Direct3D full-screen game, presentation mode, the quiet time
/// after a new user signed in.
const QUIET_NOTIFICATION_STATES: [i32; 4] = [2, 3, 4, 6];
/// The quiet-hours profile when "Do not disturb" is off; 1 is "priority only", 2 "alarms only".
const QUIET_HOURS_OFF: u32 = 0;

/// Quiet when either source says so; an answer that could not be read counts as not quiet.
fn is_quiet_of(notification_state: Option<i32>, quiet_hours_profile: Option<u32>) -> bool {
    let is_busy =
        notification_state.is_some_and(|state| QUIET_NOTIFICATION_STATES.contains(&state));
    let is_do_not_disturb = quiet_hours_profile.is_some_and(|profile| profile != QUIET_HOURS_OFF);
    is_busy || is_do_not_disturb
}

/// Asked right before a sound plays: the user turns "Do not disturb" on and off at any time.
#[tauri::command]
pub async fn notification_quiet() -> bool {
    is_quiet_of(imp::notification_state(), imp::quiet_hours_profile())
}

#[cfg(windows)]
mod imp {
    use windows::Win32::UI::Shell::SHQueryUserNotificationState;

    /// `WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED`: the shell publishes the active "Do not
    /// disturb" profile under this state name. Undocumented, but stable since Windows 10 1803.
    const WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: u64 = 0x0D83_063E_A3BF_1C75;

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
        let mut profile = 0u32;
        let mut size = size_of::<u32>() as u32;
        let mut stamp = 0u32;
        // SAFETY: the buffer is a local u32 and `size` says exactly how much Windows may write.
        let status = unsafe {
            NtQueryWnfStateData(
                &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
                std::ptr::null(),
                std::ptr::null(),
                &mut stamp,
                (&mut profile as *mut u32).cast(),
                &mut size,
            )
        };
        // A negative NTSTATUS is a failure; an empty state was never published, so it is off.
        (status >= 0 && size as usize == size_of::<u32>()).then_some(profile)
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

    #[test]
    fn is_not_quiet_when_windows_accepts_notifications_and_dnd_is_off() {
        assert!(!is_quiet_of(
            Some(ACCEPTS_NOTIFICATIONS),
            Some(QUIET_HOURS_OFF)
        ));
    }

    #[test]
    fn is_quiet_with_do_not_disturb_on_priority_only() {
        assert!(is_quiet_of(Some(ACCEPTS_NOTIFICATIONS), Some(1)));
    }

    #[test]
    fn is_quiet_while_a_full_screen_game_runs() {
        assert!(is_quiet_of(Some(FULL_SCREEN_GAME), Some(QUIET_HOURS_OFF)));
    }

    #[test]
    fn is_not_quiet_when_nothing_could_be_read() {
        assert!(!is_quiet_of(None, None));
    }
}
