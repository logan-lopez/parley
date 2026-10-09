import { createApp } from 'vue'
import './styles.css'
import { initZoom } from './zoom'

// The webview never navigates; links in model text open through the platform adapter.
document.addEventListener('click', (event) => {
  if ((event.target as Element | null)?.closest('a[href]')) event.preventDefault()
}, { capture: true })

if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
  const { default: Gallery } = await import('./gallery/Gallery.vue')
  createApp(Gallery).mount('#app')
} else {
  await startApp()
}

async function startApp() {
  const [{ default: App }, { getCurrentWindow }, { startHub }, { hubHandlers }, { initNotifications }] = await Promise.all([
    import('./App.vue'),
    import('@tauri-apps/api/window'),
    import('./hub/client'),
    import('./asks/store'),
    import('./asks/notifications'),
  ])

  initZoom()
  createApp(App).mount('#app')

  // Esc hides the window; it doesn't dismiss the ask.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') void getCurrentWindow().hide()
  })

  void initNotifications()
    .catch((error) => console.warn('notifications unavailable:', error))
    .then(() => startHub(hubHandlers))
}
