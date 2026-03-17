// sw.js — Service Worker de KRONOS (offline-first)

const CACHE = "kronos-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/state.js",
  "./js/sheets.js",
  "./js/migration.js",
  "./js/sprites.js",
  "./js/character.js",
  "./js/habits.js",
  "./js/pomodoro.js",
  "./js/nutrition.js",
  "./js/reflection.js",
  "./js/excel.js",
  "./js/main.js",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Sólo cachear peticiones GET del mismo origen
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cachear nuevas peticiones a assets locales
        if (response.ok && url.pathname.startsWith("/")) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
