import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// `tauri dev` loads the dev server directly, so the CSP in tauri.conf.json
// only applies to bundled builds. Serve the same policy in dev, plus what Vite
// needs: inline <style> for injected CSS, and the HMR socket. Keep in sync.
// 'unsafe-eval' is for AJV (JSON Forms validation), which compiles validators
// with `new Function`.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ipc: http://ipc.localhost ws://${host ?? "localhost"}:1420 ws://${host ?? "localhost"}:1421`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [vue()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    headers: { "Content-Security-Policy": csp },
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
