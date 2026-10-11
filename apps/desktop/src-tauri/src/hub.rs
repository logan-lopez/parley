// The local socket hub. The app runs once; each MCP server instance (one
// per agent session) connects here over a unix socket and speaks NDJSON.
//
// Rust stays protocol-agnostic: it tags each line with a connection id and
// forwards it to the webview, and writes whatever the webview sends back.
// Message shapes live in packages/protocol/src/wire.ts.

use std::{
    collections::HashMap,
    fs,
    os::unix::fs::{DirBuilderExt, PermissionsExt},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{UnixListener, UnixStream},
    sync::mpsc,
};

const MAX_LINE: usize = 1024 * 1024;
// sun_path is 104 bytes on macOS, including the trailing NUL.
const MAX_SOCKET_PATH: usize = 103;

enum Out {
    Line(String),
    Close,
}

#[derive(Clone, Serialize)]
#[serde(untagged)]
enum Event {
    Message { conn: u64, message: Value },
    Disconnected { conn: u64 },
}

#[derive(Default)]
struct Inbox {
    ready_calls: u32,
    buffer: Vec<Event>,
}

#[derive(Default)]
pub struct Hub {
    next_id: AtomicU64,
    conns: Mutex<HashMap<u64, mpsc::UnboundedSender<Out>>>,
    inbox: Mutex<Inbox>,
}

impl Hub {
    // Until the webview calls hub_ready, events wait in the buffer.
    fn deliver(&self, app: &AppHandle, event: Event) {
        let mut inbox = self.inbox.lock().unwrap();
        if inbox.ready_calls == 0 {
            inbox.buffer.push(event);
        } else {
            emit(app, &event);
        }
    }
}

fn emit(app: &AppHandle, event: &Event) {
    let name = match event {
        Event::Message { .. } => "hub:message",
        Event::Disconnected { .. } => "hub:disconnected",
    };
    if let Err(err) = app.emit(name, event) {
        eprintln!("parley: emit {name} failed: {err}");
    }
}

pub fn socket_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = match std::env::var_os("PARLEY_SOCKET") {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => app
            .path()
            .app_data_dir()
            .map_err(|e| format!("no app data dir: {e}"))?
            .join("hub.sock"),
    };
    let len = path.as_os_str().len();
    if len > MAX_SOCKET_PATH {
        return Err(format!(
            "socket path is {len} bytes, over the macOS limit of {MAX_SOCKET_PATH}: {}",
            path.display()
        ));
    }
    Ok(path)
}

// Binds the socket, or exits if another Parley already owns it.
pub fn start(app: AppHandle) -> Result<(), String> {
    let path = socket_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    if path.exists() {
        if std::os::unix::net::UnixStream::connect(&path).is_ok() {
            eprintln!("parley: another instance is running ({}); exiting", path.display());
            std::process::exit(0);
        }
        // Left over from a crash.
        fs::remove_file(&path).map_err(|e| format!("remove stale {}: {e}", path.display()))?;
    }
    let listener = std::os::unix::net::UnixListener::bind(&path)
        .map_err(|e| format!("bind {}: {e}", path.display()))?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("chmod {}: {e}", path.display()))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    eprintln!("parley: hub listening on {}", path.display());

    tauri::async_runtime::spawn(async move {
        let listener = match UnixListener::from_std(listener) {
            Ok(l) => l,
            Err(err) => return eprintln!("parley: hub listener: {err}"),
        };
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let hub = app.state::<Hub>();
                    let id = hub.next_id.fetch_add(1, Ordering::Relaxed) + 1;
                    let (tx, rx) = mpsc::unbounded_channel();
                    hub.conns.lock().unwrap().insert(id, tx);
                    tauri::async_runtime::spawn(serve(app.clone(), id, stream, rx));
                }
                Err(err) => eprintln!("parley: accept failed: {err}"),
            }
        }
    });
    Ok(())
}

pub fn cleanup(app: &AppHandle) {
    if let Ok(path) = socket_path(app) {
        let _ = fs::remove_file(path);
    }
}

async fn serve(app: AppHandle, id: u64, stream: UnixStream, mut rx: mpsc::UnboundedReceiver<Out>) {
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read);
    let mut buf = Vec::new();
    let hub = app.state::<Hub>();

    loop {
        // read_until is cancel-safe: partial bytes stay in `buf` across iterations.
        let mut limited = (&mut reader).take((MAX_LINE + 1 - buf.len()) as u64);
        let read = tokio::select! {
            read = limited.read_until(b'\n', &mut buf) => read,
            out = rx.recv() => match out {
                Some(Out::Line(line)) if write.write_all(line.as_bytes()).await.is_ok() => continue,
                _ => break,
            },
        };
        match read {
            Ok(n) if n > 0 && buf.last() == Some(&b'\n') => {
                let line = buf.trim_ascii();
                if !line.is_empty() {
                    let Ok(message) = serde_json::from_slice::<Value>(line) else {
                        eprintln!("parley: conn {id} sent invalid JSON; closing");
                        break;
                    };
                    hub.deliver(&app, Event::Message { conn: id, message });
                }
                buf.clear();
            }
            Ok(_) if buf.len() > MAX_LINE => {
                eprintln!("parley: conn {id} sent a line over 1 MiB; closing");
                break;
            }
            _ => break, // EOF (possibly partway through a line) or a read error
        }
    }

    let _ = write.shutdown().await;
    hub.conns.lock().unwrap().remove(&id);
    hub.deliver(&app, Event::Disconnected { conn: id });
}

#[tauri::command]
pub fn hub_ready(app: AppHandle, hub: State<'_, Hub>) {
    let mut inbox = hub.inbox.lock().unwrap();
    inbox.ready_calls += 1;
    if inbox.ready_calls > 1 {
        // The webview reloaded and lost its state. Servers reconnect and
        // re-send their pending asks, so dropping everyone loses nothing.
        for tx in hub.conns.lock().unwrap().values() {
            let _ = tx.send(Out::Close);
        }
    }
    for event in inbox.buffer.drain(..) {
        emit(&app, &event);
    }
}

#[tauri::command]
pub fn hub_send(hub: State<'_, Hub>, conn: u64, message: Value) -> Result<(), String> {
    let mut line = message.to_string();
    if line.len() > MAX_LINE {
        return Err(format!("message is {} bytes, over the 1 MiB line limit", line.len()));
    }
    line.push('\n');
    let conns = hub.conns.lock().unwrap();
    let tx = conns.get(&conn).ok_or_else(|| format!("no connection {conn}"))?;
    tx.send(Out::Line(line)).map_err(|_| format!("connection {conn} is closing"))
}

#[tauri::command]
pub fn hub_close(hub: State<'_, Hub>, conn: u64) {
    if let Some(tx) = hub.conns.lock().unwrap().get(&conn) {
        let _ = tx.send(Out::Close);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    // A form's `properties` are its question order. Without serde_json's
    // `preserve_order`, `Value` sorts object keys and the window shows the
    // questions alphabetically.
    #[test]
    fn a_forwarded_line_keeps_its_key_order() {
        let line = r#"{"type":"ask","form":{"schema":{"properties":{"storage":{},"keys":{},"backup":{}}}}}"#;
        let message: Value = serde_json::from_str(line).unwrap();
        assert_eq!(message.to_string(), line);
    }
}
