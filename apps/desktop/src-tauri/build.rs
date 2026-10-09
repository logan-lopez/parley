fn main() {
    // App commands need an app manifest so capabilities can allow them.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "hub_ready",
            "hub_send",
            "hub_close",
            "set_pending_count",
        ]),
    ))
    .expect("failed to run tauri-build");
}
