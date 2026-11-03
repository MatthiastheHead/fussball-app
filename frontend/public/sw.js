// Installierbare Web-App ohne Offline-Speicherung von Benutzerdaten.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Navigation wird immer frisch aus dem Netz geladen.
// Sitzungen, Daten und API-Antworten werden nicht zwischengespeichert.
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' &&
      new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request));
  }
});
