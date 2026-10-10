self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('tapago-v2').then((cache) => {
      return cache.addAll(['./index.html', './personal.html', './style.css', './style-personal.css', './script.js', './script-personal.js']);
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
