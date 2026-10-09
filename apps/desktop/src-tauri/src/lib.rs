// Keep this side small: tray, hotkey, window management, and the hub that
// server instances connect to. Forms and everything else live in the webview.

mod hub;
#[cfg(desktop)]
mod shortcut;
mod tray;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            tray::init(app)?;
            #[cfg(desktop)]
            shortcut::init(app)?;
            hub::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
