
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('personow-v3').then((cache) => {
      return cache.addAll(['./index.html', './personal.html', './landing.html', './style.css', './style-personal.css', './style-landing.css', './polish.css', './script.js', './script-personal.js', './logo-branco.png', './icon-192.png']);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
