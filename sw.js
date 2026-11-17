/* Service worker SIMA SOBAT JEZ — hanya cangkang statis (HTML/CSS/JS/ikon).
   Permintaan ke script.google.com / googleusercontent.com TIDAK di-cache: data selalu segar. */
const CACHE = 'sima-pwa-v2';
const ASET = ['./', './index.html', './css/style.css', './js/config.js', './js/app.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASET)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // POST & GAS lewat jaringan langsung
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    const jaringan = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(jaringan); return hit; }      // tampil instan dari cache, perbarui di latar
    return (await jaringan) || new Response('Sedang offline. Periksa koneksi internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
