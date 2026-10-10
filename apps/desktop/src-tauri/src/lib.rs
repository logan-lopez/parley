// Keep this side small: tray, hotkey, window management, and the hub that
// server instances connect to. Forms and everything else live in the webview.

mod hub;
#[cfg(desktop)]
mod shortcut;
mod tray;
mod window;

use tauri::{RunEvent, WindowEvent};
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // History file only; the scope is in capabilities/default.json.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        // Remember position and size, but never restore visibility: the
        // window starts hidden and only the hotkey or tray shows it.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .build(),
        )
        .manage(hub::Hub::default())
        .setup(|app| {
            hub::start(app.handle().clone())?;
            tray::init(app)?;
            #[cfg(desktop)]
            shortcut::init(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // The close button hides; quitting is only from the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            hub::hub_ready,
            hub::hub_send,
            hub::hub_close,
            tray::set_pending_count,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                hub::cleanup(app);
            }
        });
}
