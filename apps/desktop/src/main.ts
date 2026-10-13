import { createApp } from 'vue'
import './styles.css'
import { initGalleryTheme, initTheme, startTheme } from './theme'
import { initZoom } from './zoom'

// The webview never navigates; links in model text open through the platform adapter.
document.addEventListener('click', (event) => {
  if ((event.target as Element | null)?.closest('a[href]')) event.preventDefault()
}, { capture: true })

if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
  const { default: Gallery } = await import('./gallery/Gallery.vue')
  initGalleryTheme(new URLSearchParams(location.search).get('theme'))
  initZoom()
  createApp(Gallery).mount('#app')
} else {
  await startApp()
}

async function startApp() {
  initTheme()
  const [{ default: App }, { startHub }, { hubHandlers, hydrate }, { load }, { initNotifications }] = await Promise.all([
    import('./App.vue'),
    import('./hub/client'),
    import('./asks/store'),
    import('./asks/persist'),
    import('./asks/notifications'),
  ])

  initZoom()
  createApp(App).mount('#app')
  startTheme()

  // History loads before the hub: servers re-send their pending asks on
  // connect, and those must find their records (and drafts) already there.
  const [snapshots] = await Promise.all([
    load(),
    initNotifications().catch((error) => console.warn('notifications unavailable:', error)),
  ])
  hydrate(snapshots)
  await startHub(hubHandlers)
}
