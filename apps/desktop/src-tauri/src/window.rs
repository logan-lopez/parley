use tauri::{AppHandle, Manager};

pub const MAIN: &str = "main";

// Spike (brief 8): on macOS the main window is a non-activating NSPanel, so
// showing it makes it key without activating Parley. The bet is that
// AeroSpace then sees no app activation and doesn't jump workspaces.
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
pub fn toggle(app: &AppHandle) {
    use tauri_nspanel::ManagerExt;

    if let Ok(panel) = app.get_webview_panel(MAIN) {
        if panel.is_visible() {
            panel.hide();
        } else {
            panel.show_and_make_key();
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
pub fn toggle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show(app);
        }
    }
}
