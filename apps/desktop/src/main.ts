import { createApp } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import '@jsonforms/vue-vanilla/vanilla.css'
import App from './App.vue'
import { startHub } from './hub/client'
import { hubHandlers } from './asks/store'
import { initNotifications } from './asks/notifications'

createApp(App).mount('#app')

// Esc hides the window; it doesn't dismiss the ask.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') void getCurrentWindow().hide()
})

void initNotifications()
  .catch((error) => console.warn('notifications unavailable:', error))
  .then(() => startHub(hubHandlers))
