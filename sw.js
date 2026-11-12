// Service worker : mise en cache de l'application pour l'installation et le chargement rapide
const C = 'catan-v16', F = ['./', 'index.html', 'board.js', 'engine.js', 'config.js', 'avatars.js', 'manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(F))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
