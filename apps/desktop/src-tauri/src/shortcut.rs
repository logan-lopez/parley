use tauri::App;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::window;

// Free in ~/.config/keymap/keymap.md as of setup. Global: it's taken from
// every other app while Parley runs.
const TOGGLE: &str = "Cmd+Ctrl+P";

pub fn init(app: &App) -> tauri::Result<()> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    window::toggle(app);
                }
            })
            .build(),
    )?;

    if let Err(err) = app.global_shortcut().register(TOGGLE) {
        eprintln!("parley: couldn't register {TOGGLE}: {err}");
    }
    Ok(())
}
