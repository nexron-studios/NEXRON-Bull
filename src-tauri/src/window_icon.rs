//! The window icon in the colour scheme. Tauri's `set_icon` sets only the small icon on Windows
//! (`ICON_SMALL`: title bar); the taskbar button and Alt+Tab show the big one (`ICON_BIG`), which
//! tao takes from the exe at start and never changes. So the big one is set here as well.
//!
//! An installed Bull has a Start menu shortcut to the same exe with the app's AppUserModelID; the
//! taskbar matches the window to it and shows the shortcut's icon, ignoring the window's. So the
//! window gets an ID of its own (`<identifier>.window`), which no shortcut carries.

use std::sync::Mutex;

use serde::{Serialize, Serializer};
use tauri::{State, WebviewWindow, image::Image};

#[derive(Debug, thiserror::Error)]
pub enum WindowIconError {
    #[error("the icon is not a readable PNG: {0}")]
    Decode(tauri::Error),
    #[error("the window refused the icon: {0}")]
    Window(tauri::Error),
    #[cfg(windows)]
    #[error("Windows could not create the taskbar icon: {0}")]
    Os(#[from] windows::core::Error),
}

impl Serialize for WindowIconError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// The big icon this app created last, freed once the next one replaced it. Kept as the raw
/// value: `HICON` holds a pointer and is not `Send`. The exe's own icon is never freed here.
#[derive(Default)]
pub struct BigWindowIcon(#[cfg_attr(not(windows), allow(dead_code))] Mutex<Option<isize>>);

/// The PNG is the app tile with the bull in the scheme's accent, drawn by the frontend.
#[tauri::command]
pub fn set_window_icon(
    window: WebviewWindow,
    big_icon: State<'_, BigWindowIcon>,
    png: Vec<u8>,
) -> Result<(), WindowIconError> {
    let image = Image::from_bytes(&png).map_err(WindowIconError::Decode)?;
    // The title bar first: it must not stay behind when the taskbar step fails.
    window
        .set_icon(image.clone())
        .map_err(WindowIconError::Window)?;
    #[cfg(windows)]
    {
        imp::set_big_icon(&window, &big_icon, &image)?;
        imp::detach_from_shortcut(&window)?;
    }
    #[cfg(not(windows))]
    let _ = big_icon; // Only Windows keeps a second, big icon.
    Ok(())
}

#[cfg(windows)]
mod imp {
    use std::sync::PoisonError;

    use std::mem::ManuallyDrop;

    use tauri::{Manager, WebviewWindow, image::Image};
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::StructuredStorage::{
        PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0, PropVariantClear,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::PropertiesSystem::{
        IPropertyStore, SHGetPropertyStoreForWindow,
    };
    use windows::Win32::UI::Shell::SHStrDupW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIcon, DestroyIcon, HICON, ICON_BIG, SendMessageW, WM_SETICON,
    };
    use windows::core::PCWSTR;

    use super::{BigWindowIcon, WindowIconError};

    const BYTES_PER_PIXEL: usize = 4;

    /// The window's own AppUserModelID, so the taskbar shows its icon instead of the shortcut's.
    pub fn detach_from_shortcut(window: &WebviewWindow) -> Result<(), WindowIconError> {
        let hwnd = window.hwnd().map_err(WindowIconError::Window)?;
        let app_id = format!("{}.window", window.app_handle().config().identifier);
        set_app_id(hwnd, &app_id)
    }

    pub(super) fn set_app_id(hwnd: HWND, app_id: &str) -> Result<(), WindowIconError> {
        let wide: Vec<u16> = app_id.encode_utf16().chain(Some(0)).collect();
        // SAFETY: `wide` is NUL-terminated and outlives the copy; the copy lives in COM memory,
        // which `PropVariantClear` frees once the store has taken its own copy.
        unsafe {
            let copy = SHStrDupW(PCWSTR(wide.as_ptr()))?;
            let mut value = PROPVARIANT {
                Anonymous: PROPVARIANT_0 {
                    Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                        vt: VT_LPWSTR,
                        Anonymous: PROPVARIANT_0_0_0 { pwszVal: copy },
                        ..Default::default()
                    }),
                },
            };
            let stored = SHGetPropertyStoreForWindow::<IPropertyStore>(hwnd).and_then(|store| {
                store
                    .SetValue(&PKEY_AppUserModel_ID, &value)
                    .and_then(|()| store.Commit())
            });
            PropVariantClear(&mut value)?;
            stored?;
        }
        Ok(())
    }

    pub fn set_big_icon(
        window: &WebviewWindow,
        big_icon: &BigWindowIcon,
        image: &Image<'_>,
    ) -> Result<(), WindowIconError> {
        let hwnd = window.hwnd().map_err(WindowIconError::Window)?;
        let icon = icon_of(image)?;
        // SAFETY: `hwnd` is this window's live handle and `icon` a valid icon this app owns.
        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(icon.0 as isize)),
            );
        }
        // A poisoned lock still holds the last handle; nothing else lives behind it.
        let previous = big_icon
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .replace(icon.0 as isize);
        if let Some(previous) = previous {
            // SAFETY: created by `icon_of` and no longer set on any window. A failure only leaks
            // one small icon handle, there is nothing to recover.
            let _ = unsafe { DestroyIcon(HICON(previous as *mut _)) };
        }
        Ok(())
    }

    /// RGBA to a 32-bit icon the way tao builds its small one: BGRA colours, alpha carries the
    /// transparency, the AND mask only has to be large enough.
    fn icon_of(image: &Image<'_>) -> Result<HICON, WindowIconError> {
        let mut bgra = image.rgba().to_vec();
        for pixel in bgra.chunks_exact_mut(BYTES_PER_PIXEL) {
            pixel.swap(0, 2);
        }
        let and_mask = vec![0u8; bgra.len() / BYTES_PER_PIXEL];
        // SAFETY: both buffers outlive the call and hold width × height pixels.
        let icon = unsafe {
            CreateIcon(
                None,
                image.width() as i32,
                image.height() as i32,
                1,
                (BYTES_PER_PIXEL * 8) as u8,
                and_mask.as_ptr(),
                bgra.as_ptr(),
            )
        }?;
        Ok(icon)
    }
}

#[cfg(all(test, windows))]
mod tests {
    use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, WINDOW_EX_STYLE, WS_OVERLAPPEDWINDOW,
    };
    use windows::core::w;

    #[test]
    fn gives_a_window_its_own_app_id_without_corrupting_the_heap() {
        // SAFETY: a plain hidden window owned by this test thread, destroyed at the end.
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().unwrap();
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                w!("probe"),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                10,
                10,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            for round in 0..50 {
                super::imp::set_app_id(hwnd, &format!("com.nexron.chat.window{round}")).unwrap();
                let churn: Vec<Vec<u8>> = (0..200).map(|size| vec![0u8; size * 16]).collect();
                drop(churn);
            }
            DestroyWindow(hwnd).unwrap();
        }
    }
}
