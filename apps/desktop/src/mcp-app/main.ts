// The ask card as an MCP Apps view, inline in a host's chat (Claude Desktop).
// No hub, no Tauri, no zoom: it talks to the MCP server through the host.
import { createApp } from 'vue'
import '../styles.css'
import McpApp from './McpApp.vue'

// styles.css: content height, the max width, host fonts.
document.documentElement.classList.add('inline')

// The view never navigates. Markdown links open through `openExternal`,
// which McpApp points at the host's `ui/open-link`.
document.addEventListener('click', (event) => {
  if ((event.target as Element | null)?.closest('a[href]')) event.preventDefault()
}, { capture: true })

createApp(McpApp).mount('#app')
