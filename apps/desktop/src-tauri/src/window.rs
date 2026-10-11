use tauri::{AppHandle, Manager};

pub const MAIN: &str = "main";

// On macOS the main window is a non-activating NSPanel: showing it makes it
// key without activating Parley, so the app you were in stays active, and
// AeroSpace doesn't manage it (no workspace jump, no focus change).
#[cfg(target_os = "macos")]
mod panel {
    use tauri_nspanel::tauri_panel;

    tauri_panel! {
        panel!(ParleyPanel {
            config: {
                can_become_key_window: true,
                can_become_main_window: false,
                is_floating_panel: true
            }
        })
    }
}

#[cfg(target_os = "macos")]
pub fn init_panel(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_nspanel::{StyleMask, WebviewWindowExt};

    let window = app
        .get_webview_window(MAIN)
        .ok_or("main window missing")?;
    let panel = window.to_panel::<panel::ParleyPanel>()?;
    // add_, not set_: keep Tauri's title bar, resize and close styles.
    panel.add_style_mask(StyleMask::empty().nonactivating_panel().into())?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn show(app: &AppHandle) {
    use tauri_nspanel::ManagerExt;

    if let Ok(panel) = app.get_webview_panel(MAIN) {
        panel.show_and_make_key();
    }
}

#[cfg(target_os = "macos")]
pub fn hide(app: &AppHandle) {
    use tauri_nspanel::ManagerExt;

    if let Ok(panel) = app.get_webview_panel(MAIN) {
        panel.hide();
    }
}

#[cfg(target_os = "macos")]
pub fn toggle(app: &AppHandle) {
    use tauri_nspanel::ManagerExt;

    if let Ok(panel) = app.get_webview_panel(MAIN) {
        if panel.is_visible() {
            hide(app);
        } else {
            show(app);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn toggle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if window.is_visible().unwrap_or(false) {
            hide(app);
        } else {
            show(app);
        }
    }
}
