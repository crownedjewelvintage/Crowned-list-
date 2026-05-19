// Crown List service worker — minimal app-shell cache.
// Bumps cache version on each deploy by reading SW URL query string.
const VERSION = "crown-list-v1";
const APP_SHELL_CACHE = `${VERSION}-shell`;

// On install, claim immediately so updates take effect on next page load.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GETs to same-origin resources.
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Never intercept API or upload calls — they need fresh, authenticated responses.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/__")
  ) {
    return;
  }

  // App shell: network-first, fall back to cache for offline.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Cache successful responses for HTML/JS/CSS/images
        if (fresh && fresh.status === 200 && fresh.type === "basic") {
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        // Last resort: try the root document for SPA navigations
        if (req.mode === "navigate") {
          const root = await cache.match("./");
          if (root) return root;
        }
        throw e;
      }
    })(),
  );
});
