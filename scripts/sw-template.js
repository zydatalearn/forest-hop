self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("activate", event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("forest-hop-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    const shell = new URL("./index.html", self.location.href).href;
    const key = event.request.mode === "navigate" ? shell : event.request.url;
    if (!FILES.some(file => new URL(file, self.location.href).href === key)) return;
    event.respondWith(caches.open(CACHE).then(async cache => {
        const saved = await cache.match(key);
        if (saved) return saved;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(key, response.clone());
        return response;
    }));
});
