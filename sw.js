const CACHE_NAME = 'nova-ai-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './Nova.png',
    './js/app.js',
    './js/state.js',
    './js/utils.js',
    './js/firebase.js',
    './js/ui.js',
    './js/persona.js',
    './js/profile.js',
    './js/chat.js',
    './js/auth.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Basic network-first strategy for a dynamic app
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
