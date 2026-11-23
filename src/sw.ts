/// <reference lib="webworker" />
// Service worker do Família Segura: cache do app e dos mapas (Workbox) + Web Push.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
registerRoute(
  /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/i,
  new CacheFirst({
    cacheName: 'osm-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 }), new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
  urgent?: boolean
  tag?: string
  type?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { title: 'Família Segura', body: event.data?.text() ?? '' }
  }
  const title = data.title || 'Família Segura'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || `fs-${Date.now()}`,
      data: { url: data.url || '/', type: data.type },
      requireInteraction: Boolean(data.urgent),
      // vibrate não está na tipagem padrão, mas o Android respeita.
      ...({ vibrate: data.urgent ? [300, 150, 300, 150, 600] : [200] } as NotificationOptions),
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          try {
            await (c as WindowClient).navigate(url)
          } catch {
            /* origem diferente ou janela sem permissão: segue para focus */
          }
          return (c as WindowClient).focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
