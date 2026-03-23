const CACHE_NAME = 'nova-ai-v2';
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
    self.skipWaiting(); // Force activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Delete old caches
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Network-first: always try fresh, fall back to cache
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
