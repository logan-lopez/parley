import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// The card for MCP Apps hosts, as one self-contained HTML file. The server
// build copies it to apps/server/dist/card.html and serves it as
// `ui://parley/card.html`. The Tauri build (vite.config.ts) is separate.
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  build: {
    outDir: "dist-mcp-app",
    emptyOutDir: true,
    rollupOptions: { input: "mcp-app.html" },
  },
});
