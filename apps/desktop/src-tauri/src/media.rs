// Exact-file grants after checking the server's hash. The form and protocol
// stay in TypeScript; Rust knows only paths and hashes.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Deserialize)]
pub struct MediaRequest {
    abs: String,
    sha256: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaStatus {
    Ok,
    Changed,
    Missing,
    Refused,
}

fn check_file(file: &MediaRequest) -> MediaStatus {
    let path = Path::new(&file.abs);
    if !path.is_absolute() {
        return MediaStatus::Refused;
    }
    // The server sends real paths. Refuse symlinks, including a replaced
    // parent directory, rather than following a path somewhere new.
    match path.canonicalize() {
        Ok(real) if real != path => return MediaStatus::Refused,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return MediaStatus::Missing,
        Err(_) => return MediaStatus::Refused,
        _ => {}
    }
    if !path.is_file() {
        return MediaStatus::Refused;
    }
    let Ok(mut input) = File::open(path) else {
        return MediaStatus::Refused;
    };
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => hash.update(&buffer[..n]),
            Err(_) => return MediaStatus::Refused,
        }
    }
    if format!("{:x}", hash.finalize()) == file.sha256 {
        MediaStatus::Ok
    } else {
        MediaStatus::Changed
    }
}

#[tauri::command]
pub async fn allow_media(
    app: AppHandle,
    entries: Vec<MediaRequest>,
) -> Result<Vec<MediaStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        entries
            .iter()
            .map(|entry| {
                let status = check_file(entry);
                if status == MediaStatus::Ok
                    && app.asset_protocol_scope().allow_file(&entry.abs).is_err()
                {
                    MediaStatus::Refused
                } else {
                    status
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_media(app: AppHandle, entry: MediaRequest) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !app.asset_protocol_scope().is_allowed(&entry.abs)
            || check_file(&entry) != MediaStatus::Ok
        {
            return Err("This picture is no longer granted or has changed".into());
        }
        app.opener()
            .open_path(entry.abs, None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_hash_missing_and_non_files() {
        let path = std::env::temp_dir().join(format!("parley-media-{}", std::process::id()));
        std::fs::write(&path, b"picture").unwrap();
        let mut entry = MediaRequest {
            abs: path.canonicalize().unwrap().to_string_lossy().into_owned(),
            sha256: format!("{:x}", Sha256::digest(b"picture")),
        };
        assert_eq!(check_file(&entry), MediaStatus::Ok);
        #[cfg(unix)]
        {
            let link = path.with_extension("link");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            let linked = MediaRequest {
                abs: link.to_string_lossy().into_owned(),
                sha256: entry.sha256.clone(),
            };
            assert_eq!(check_file(&linked), MediaStatus::Refused);
            std::fs::remove_file(link).unwrap();
        }
        std::fs::write(&path, b"different").unwrap();
        assert_eq!(check_file(&entry), MediaStatus::Changed);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(check_file(&entry), MediaStatus::Missing);
        entry.abs = "relative.png".into();
        assert_eq!(check_file(&entry), MediaStatus::Refused);
        entry.abs = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(check_file(&entry), MediaStatus::Refused);
    }
}
