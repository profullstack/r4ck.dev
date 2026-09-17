/* r4ck service worker: the shell offline, everything else network first. */
const VERSION = 'v1';
const CACHE = `r4ck-shell-${VERSION}`;
const SHELL = [
  '/',
  '/styles.css',
  '/app.js',
  '/logo.svg',
  '/manifest.webmanifest',
  '/fonts/Geist.woff2',
  '/fonts/GeistMono.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/mcp' ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/settings'
  )
    return;
  const isAsset = /\.(css|js|woff2|png|svg|ico)$/.test(url.pathname);
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (isAsset || e.request.mode === 'navigate'))
          caches
            .open(CACHE)
            .then((c) => c.put(e.request, res.clone()))
            .catch(() => {});
        return res;
      })
      .catch(
        async () =>
          (await caches.match(e.request)) ??
          (e.request.mode === 'navigate' ? caches.match('/') : Response.error()),
      ),
  );
});
