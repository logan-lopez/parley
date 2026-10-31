use tauri::{
    include_image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle,
};

use crate::window;

const TRAY: &str = "main";

pub fn init(app: &App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Parley", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id(TRAY)
        // The flag in black; as a template image macOS tints it for the menu bar.
        // Rendered from icons/tray.svg by `pnpm --filter @parley/desktop icons`.
        .icon(include_image!("icons/tray.png"))
        .icon_as_template(true)
        .tooltip("Parley")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => window::show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// The number beside the menu bar icon; empty when nothing is waiting.
#[tauri::command]
pub fn set_pending_count(app: AppHandle, n: u32) {
    if let Some(tray) = app.tray_by_id(TRAY) {
        let title = (n > 0).then(|| n.to_string());
        let _ = tray.set_title(title);
    }
}
