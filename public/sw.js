/* 1200 HAIRSTUDIO: one root worker. No fetch handler, offline cache, or auth caching. */
function safePushUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin === self.location.origin && /^\/(de|en)\/admin\/push\/[a-f0-9-]{36}$/.test(url.pathname) && !url.search && !url.hash) return url.href;
  } catch {}
  return new URL('/admin', self.location.origin).href;
}
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const id = typeof data.id === 'string' && /^[a-f0-9-]{36}$/.test(data.id) ? data.id : 'fallback';
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 120) : '1200 HAIRSTUDIO', {
    body: typeof data.body === 'string' ? data.body.slice(0, 240) : 'Eine neue Mitteilung ist verfügbar.',
    icon: '/brand/profile.png', tag: '1200-admin-' + id, renotify: false,
    data: { url: safePushUrl(data.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safePushUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const own = windows.filter(client => new URL(client.url).origin === self.location.origin);
    const client = own.find(item => /\/(de|en)\/admin/.test(new URL(item.url).pathname)) || own[0];
    if (client) {
      try { await client.navigate(url); await client.focus(); return; } catch {}
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('pushsubscriptionchange', event => {
  // Authenticated admin UI reconciles/renews on the next open. Never store auth credentials here.
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    windows.forEach(client => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
  }));
});
