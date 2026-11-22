// Service Worker for BRO SQUAD Progressive Web App
const CACHE_NAME = 'bro-squad-v1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-config.js',
  '/manifest.json',
  '/icons/icon.svg'
];

// Install: Cache essential app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for dynamic Firebase requests, Stale-While-Revalidate for app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do not intercept Firebase API or Firestore WebSocket/REST calls
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for shell
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* offline */});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
