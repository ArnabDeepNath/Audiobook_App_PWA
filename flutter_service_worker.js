'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {"404.html": "ef8844daa38f95be471446f541efd76a",
"assets/AssetManifest.bin": "a9e82d80d2e1c28b22a8690580244195",
"assets/AssetManifest.bin.json": "012ce7f51a7c2f688b2b9880fd5d102c",
"assets/AssetManifest.json": "fefa6825468e9730b5b6a1b0e6f8ab23",
"assets/assets/images/logo.png": "13380bb68f239d39d59878b7acbdc92f",
"assets/assets/images/logo_transparent.png": "13380bb68f239d39d59878b7acbdc92f",
"assets/assets/images/logo_white.png": "a2a0157606ffad75a2d01eff1b9cfc67",
"assets/FontManifest.json": "dc3d03800ccca4601324923c0b1d6d57",
"assets/fonts/MaterialIcons-Regular.otf": "99438b047cf30b3e51a10b66cfed1a2e",
"assets/NOTICES": "996f79090b4f5ff45a1eabec2f4ff371",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "e986ebe42ef785b27164c36a9abc7818",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"canvaskit/canvaskit.js": "738255d00768497e86aa4ca510cce1e1",
"canvaskit/canvaskit.js.symbols": "74a84c23f5ada42fe063514c587968c6",
"canvaskit/canvaskit.wasm": "9251bb81ae8464c4df3b072f84aa969b",
"canvaskit/chromium/canvaskit.js": "901bb9e28fac643b7da75ecfd3339f3f",
"canvaskit/chromium/canvaskit.js.symbols": "ee7e331f7f5bbf5ec937737542112372",
"canvaskit/chromium/canvaskit.wasm": "399e2344480862e2dfa26f12fa5891d7",
"canvaskit/skwasm.js": "5d4f9263ec93efeb022bb14a3881d240",
"canvaskit/skwasm.js.symbols": "c3c05bd50bdf59da8626bbe446ce65a3",
"canvaskit/skwasm.wasm": "4051bfc27ba29bf420d17aa0c3a98bce",
"canvaskit/skwasm.worker.js": "bfb704a6c714a75da9ef320991e88b03",
"favicon.png": "9de719c4aaee28ae421e997c8e09b903",
"flutter.js": "383e55f7f3cce5be08fcf1f3881f585c",
"flutter_bootstrap.js": "ea3ed7074ea47435edf007beeb3be1ba",
"icons/Icon-192.png": "867818654d268d4b5aff33676fa14d92",
"icons/Icon-512.png": "10948284af3ddc418a64776a05142d5e",
"icons/Icon-maskable-192.png": "867818654d268d4b5aff33676fa14d92",
"icons/Icon-maskable-512.png": "10948284af3ddc418a64776a05142d5e",
"index.html": "7d4950d7bcbab6c950458e77dbca9dda",
"/": "7d4950d7bcbab6c950458e77dbca9dda",
"main.dart.js": "bcd2c0818f2026a973aee0dfc0974d01",
"manifest.json": "a5230e999761effeeba953337fe49cbd",
"README.md": "7a4d3b275fa593df634bdc8073714ca9",
"splash/img/branding-1x.png": "905583e4597cd45f47c156c37dae9b48",
"splash/img/branding-2x.png": "ceda6fd7e1d263839f2a3b2e4206b906",
"splash/img/branding-3x.png": "2f909f4d5263bc77d0fbee2a8b65b4e8",
"splash/img/branding-4x.png": "af1bc41b92cd4140a987e3156e7b2678",
"splash/img/branding-dark-1x.png": "905583e4597cd45f47c156c37dae9b48",
"splash/img/branding-dark-2x.png": "ceda6fd7e1d263839f2a3b2e4206b906",
"splash/img/branding-dark-3x.png": "2f909f4d5263bc77d0fbee2a8b65b4e8",
"splash/img/branding-dark-4x.png": "af1bc41b92cd4140a987e3156e7b2678",
"splash/img/dark-1x.png": "905583e4597cd45f47c156c37dae9b48",
"splash/img/dark-2x.png": "ceda6fd7e1d263839f2a3b2e4206b906",
"splash/img/dark-3x.png": "2f909f4d5263bc77d0fbee2a8b65b4e8",
"splash/img/dark-4x.png": "af1bc41b92cd4140a987e3156e7b2678",
"splash/img/light-1x.png": "905583e4597cd45f47c156c37dae9b48",
"splash/img/light-2x.png": "ceda6fd7e1d263839f2a3b2e4206b906",
"splash/img/light-3x.png": "2f909f4d5263bc77d0fbee2a8b65b4e8",
"splash/img/light-4x.png": "af1bc41b92cd4140a987e3156e7b2678",
"version.json": "64d9241e4eadef4e0509fbd9cdce1d8d"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"flutter_bootstrap.js",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
