// Bull service worker. Exists so Chrome and Edge offer "Install app"; it caches nothing, so it can
// never serve stale app code or get in the way of Vite's HMR. Only page loads pass through it: when
// the dev server is down, the installed window shows a short note instead of a browser error page.
// vue-i18n is not reachable here, so the note carries its own two languages.
const OFFLINE_TEXT = {
  de: 'Bull ist nicht erreichbar. Läuft der Dev-Server?',
  en: 'Bull is not reachable. Is the dev server running?'
}

const offlinePage = () => {
  const lang = self.navigator.language.startsWith('de') ? 'de' : 'en'
  return new Response(
    `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>Bull</title>` +
      '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0e0e0f;color:#f0efec;font:15px system-ui">' +
      `${OFFLINE_TEXT[lang]}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

self.addEventListener('install', () => self.skipWaiting())

// Navigation preload starts the page request while the worker boots, so it adds no latency.
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([self.registration.navigationPreload?.enable(), self.clients.claim()])
  )
)

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request))
      } catch {
        return offlinePage()
      }
    })()
  )
})
