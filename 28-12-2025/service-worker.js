const CACHE_NAME = 'ak-alheri-chemist-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json', // If it exists, good to cache.
  // Add other static assets if known, but runtime caching handles most.
];

self.addEventListener('install', (event) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle http/https requests
  if (!url.protocol.startsWith('http')) return;

  // Cache-first for assets (JS/CSS/Images) in /assets/ or /icons/
  // Stale-while-revalidate for everything else (HTML, JSON, etc.)
  
  const isAsset = url.pathname.startsWith('/assets/') || 
                  url.pathname.match(/\.(png|jpg|jpeg|svg|ico|js|css)$/);

  if (isAsset && url.origin === self.location.origin) {
     event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
  } else {
    // Stale-while-revalidate for non-assets (likely HTML or API)
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Clone the response right away
          const responseToCache = networkResponse.clone();
          // Cache the cloned response
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, responseToCache);
          }
          // Return the original response to the browser
          return networkResponse;
        });

        return cachedResponse || fetchPromise;
      })
    );
  }
});