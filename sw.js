// Service worker cache version and static asset manifest
const CACHE_NAME = 'motsa-jiki-v1.7.0';
const ASSETS = [
  '/',
  '/overview',
  '/goals',
  '/milestone',
  '/help',
  '/privacy',
  '/terms',
  '/styles.css',
  '/manifest.json',
  '/js/schema.js',
  '/js/db.js',
  '/js/filesystem.js',
  '/js/gdrive.js',
  '/js/sync.js',
  '/js/app.js',
  '/js/log.js',
  '/js/overview.js',
  '/js/goals.js',
  '/js/badges.js',
  '/fonts/fonts.css',
  // Archivo Narrow
  '/fonts/archivo-narrow-latin.woff2',
  // Inter
  '/fonts/inter-latin.woff2',
  // JetBrains Mono
  '/fonts/jetbrains-latin.woff2',
  // Icon sprite (inline nav/header icons)
  '/icons/icons.svg',
  // App icons (manifest + apple-touch-icon + favicon fallback)
  '/icons/icon-48x48.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/logo.svg'
];

// Fetch asset, strip redirect metadata, and store standard Response in cache
async function cacheCleanResponse(cache, url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
  const body = await response.blob();
  const clean = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
  await cache.put(url, clean);
}

// Normalize navigation path variants to clean route keys
function normalizeNavPath(pathname) {
  let p = pathname;
  if (p.endsWith('/index.html')) p = p.slice(0, -('index.html'.length));
  else if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p === '' ? '/' : p;
}

// Precache static assets and take control immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(ASSETS.map((url) => cacheCleanResponse(cache, url)));
    })()
  );
  self.skipWaiting();
});

// Purge obsolete caches and claim active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Intercept requests for cache-first navigation and static asset delivery
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Bypasses non-GET and cross-origin requests
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    (async () => {
      const url = new URL(request.url);

      // Handle page navigation requests with fallback to root shell
      if (request.mode === 'navigate') {
        const cacheKey = normalizeNavPath(url.pathname);
        const cached = await caches.match(cacheKey);
        if (cached) return cached;

        try {
          const network = await fetch(request);
          return network;
        } catch {
          return caches.match('/');
        }
      }

      // Cache-first strategy for subresources (JS, CSS, assets) with network fallback
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        return await fetch(request);
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })()
  );
});