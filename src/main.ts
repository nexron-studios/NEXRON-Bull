import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { isTauri } from '@tauri-apps/api/core'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from '@/App.vue'
import { bridgeService } from '@/api/services/bridge.service'
import i18n from '@/i18n'
import router from '@/router'
import { handleError } from '@/lib/error'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/queryClient'
import '@/styles/main.css'

const app = createApp(App)
// Second reporting place next to the agentd error events; no remote service while the app has a single user.
app.config.errorHandler = (error) => handleError(error)
app
  .use(createPinia().use(piniaPluginPersistedstate))
  .use(router)
  .use(i18n)
  .use(VueQueryPlugin, { queryClient })
  .mount('#app')
registerServiceWorker()
// The app window has Tauri's own way to agentd; a browser signs in to the bridge.
if (!isTauri()) bridgeService.start()
