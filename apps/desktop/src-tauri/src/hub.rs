// The local socket hub. The app runs once; each MCP server instance
// (one per agent session) connects here, sends asks, and waits for answers.
// Message shapes: packages/protocol/src/wire.ts.

use tauri::AppHandle;

// TODO: pick the transport (localhost WebSocket vs unix socket), listen,
// forward asks to the webview, and route answers back to the right connection.
pub fn start(_app: AppHandle) {}
