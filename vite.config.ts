import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults, defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

const host = process.env.TAURI_DEV_HOST
// The phone bridge (`bridge/`, port 3060), so the app in a dev browser tab reaches agentd the way
// Caddy serves it in production: same origin, `/ws`.
const bridgeUrl = process.env.BULL_BRIDGE_URL ?? 'ws://127.0.0.1:3060'

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
    watch: { ignored: ['**/src-tauri/**', '**/agentd/**', '**/bridge/**'] },
    proxy: { '/ws': { target: bridgeUrl, ws: true } }
  },
  // The transitions spec reads that stylesheet as text; other CSS stays empty in tests.
  // `bridge/` is a Node program with its own `node:test` suite (`npm run test:bridge`).
  test: {
    environment: 'jsdom',
    css: { include: [/transitions\.css/] },
    exclude: [...configDefaults.exclude, 'bridge/**']
  }
})
