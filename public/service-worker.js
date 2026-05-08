'use strict';

const CACHE = 'brigade-onboarding-v1';
const PRECACHE = ['/', '/styles.css', '/app.js', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Only handle GET requests to our own origin — never proxy external URLs
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Never cache admin or API routes — always go to the network
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/admin')) return;

  // Cache-first for static assets, stale-while-revalidate for the page shell.
  // Fetch using the validated URL string (not the raw Request) to avoid SSRF.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(requestUrl.href);
      const networkFetch = fetch(requestUrl.href).then((response) => {
        if (response.ok) cache.put(requestUrl.href, response.clone());
        return response;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});
