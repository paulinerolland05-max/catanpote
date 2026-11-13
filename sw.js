// Service worker : l'application fonctionne hors réseau, mais charge toujours la version la plus récente quand il y a du réseau
const C = 'catan-v19', F = ['./', 'index.html', 'board.js', 'engine.js', 'config.js', 'avatars.js', 'manifest.json'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' }))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copie = r.clone(); caches.open(C).then(c => c.put(e.request, copie)); return r; }).catch(() => caches.match(e.request)));
});
