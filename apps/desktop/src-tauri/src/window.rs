use tauri::{AppHandle, Manager};

pub const MAIN: &str = "main";

// TODO: announce instead of grabbing focus (notification + hotkey), and
// tauri-nspanel for a non-activating panel on macOS.
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn toggle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show(app);
        }
    }
}
