const CACHE_NAME = 'tenken-shell-v66';
const APP_FILES = [
  './', './index.html', './app.css', './app.js', './admin.js', './delivery.js', './reuse.js', './shared.js','./storage.js', './manifest.json', './icon.svg',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png',
  './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs', './vendor/jszip.min.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fetch the complete new shell before offering an update. Existing clients
    // keep using their active worker until they explicitly save and accept.
    await cache.addAll(APP_FILES.map(path=>new Request(path,{cache:'reload'})));
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting())});
self.addEventListener('activate', event => {
  // Other open tabs can still be running the previous app. Retain their shell.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const fileName=new URL(request.url).pathname.split('/').pop();
  if(fileName==='initial-settings.json'||decodeURIComponent(fileName)==='基本セット.json'||fileName==='app-status.json'){
    // Operational notices/settings must never fall back to an old cached copy.
    event.respondWith(fetch(new Request(request,{cache:'no-store'})).catch(()=>Response.error()));return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
