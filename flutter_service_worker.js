'use strict';
// This file will be replaced during flutter build by the actual service worker code
// This placeholder ensures we can register it in our index.html
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});
