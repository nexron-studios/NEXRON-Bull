import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

const host = process.env.TAURI_DEV_HOST

// Fixed port from "Lokale Ports" in the vault: 1460, HMR 1461. strictPort so another
// project's dev server never ends up in this window.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  clearScreen: false,
  server: {
    port: 1460,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1461 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/agentd/**'] }
  },
  // The transitions spec reads that stylesheet as text; other CSS stays empty in tests.
  test: { environment: 'jsdom', css: { include: [/transitions\.css/] } }
})
