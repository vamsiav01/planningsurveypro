self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.matchAll();
    }).then(function(clients) {
      clients.forEach(client => {
        if (client.url && "navigate" in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Pass through to network immediately
  e.respondWith(fetch(e.request).catch(() => new Response("Network error")));
});
