/* =====================================================================
   service-worker.js
   - Caches the static customer pages so they open offline.
   - Network-first, so a new deployment shows up right away when online.
   - NEVER touches Supabase / CDN requests (cross-origin) or admin pages,
     so no private data is ever cached.
   - Push events are handled; push subscription/delivery is not configured.
   Bump CACHE_VERSION on each deployment to clear old files.
   ===================================================================== */

const CACHE_VERSION = 'v8-commerce-20261127-storefront-type';
const CACHE_NAME = 'shop-static-' + CACHE_VERSION;
const SHELL = [
  './', 'index.html', 'products.html', 'cart.html', 'orders.html', 'account.html', 'account.js',
  'shop.css', 'fonts/geist-sans.woff2', 'shop.js', 'supabase.js', 'vendor/supabase-2.110.1.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('shop-static-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Supabase, CDNs: leave alone
  if (/admin/i.test(url.pathname)) return;
  if (!SHELL.some(path => new URL(path,self.registration.scope).pathname === url.pathname)) return;                   // admin files: never cached

  const cacheKey = url.origin + url.pathname;
  event.respondWith(
    fetch(req, {cache: "no-cache"})
      .then(res => {
        if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(cacheKey, copy))); }
        return res;
      })
      .catch(() => caches.match(cacheKey).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : new Response('', {status:503}))))
  );
});

/* ---------- Push notifications (skeleton) ---------- */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'New order received';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || 'admin.html#orders' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const candidate = new URL(event.notification.data?.url || 'admin.html#orders', self.registration.scope);
  const target = candidate.origin === self.location.origin && candidate.pathname.startsWith(new URL(self.registration.scope).pathname) ? candidate.href : new URL('admin.html#orders',self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if (c.url.startsWith(new URL('admin.html', self.registration.scope).href) && 'focus' in c) return c.navigate(target).then(() => c.focus());
      return clients.openWindow(target);
    })
  );
});
