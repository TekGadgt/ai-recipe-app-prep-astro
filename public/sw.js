const CACHE_NAME = "pantry-party-v1.0.0";
const CACHE_ASSETS = [
  "/",
  "/session",
  "/styles/global.css",
  "/scripts/storage.js",
  "/scripts/openai.js",
  "/manifest.json",
];

// Install event - cache assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip OpenAI API requests - always go to network
  if (event.request.url.includes("api.openai.com")) {
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return (
          response ||
          fetch(event.request).then((fetchResponse) => {
            // Don't cache non-GET requests or failed responses
            if (event.request.method !== "GET" || !fetchResponse.ok) {
              return fetchResponse;
            }

            // Clone the response for caching
            const responseClone = fetchResponse.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });

            return fetchResponse;
          })
        );
      })
      .catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
      })
  );
});
