/* ── 오늘의 경제 · 서비스 워커 ─────────────────────────────────
   셸은 캐시 우선(오프라인에서도 즉시 열림), 브리핑 데이터는
   네트워크 우선(항상 최신) + 캐시 폴백으로 처리합니다.
   셸 파일을 고치면 SHELL_VERSION 을 올려 주세요.
   ───────────────────────────────────────────────────────────── */

var SHELL_VERSION = 'shell-v4';
var DATA_CACHE = 'data-v1';
var FONT_CACHE = 'font-v1';
var PHOTO_CACHE = 'photo-v1';

var SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_VERSION)
      .then(function (cache) {
        // addAll 은 하나라도 실패하면 설치 전체가 실패한다.
        // 파일별로 담아 두어 아이콘 하나 때문에 앱이 오프라인을 잃지 않게 한다.
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  var keep = [SHELL_VERSION, DATA_CACHE, FONT_CACHE, PHOTO_CACHE];
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return keep.indexOf(k) === -1 ? caches.delete(k) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return fetch(req)
      .then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(function () {
        // 쿼리스트링(캐시버스터)이 달라도 같은 파일로 찾아 준다
        return cache.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          throw new Error('offline and not cached');
        });
      });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 구글 폰트 — 한 번 받아 두면 오프라인에서도 유지
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // APK 내려받기는 서비스 워커가 건드리지 않는다.
  // (캐시에 1MB 를 쌓을 이유도 없고, 오프라인 폴백이 index.html 을 돌려주면 안 된다)
  if (url.pathname.endsWith('.apk')) return;

  // 사진 — 한 번 받으면 계속 쓴다 (파일명이 곧 버전이라 갱신할 필요가 없다)
  if (url.pathname.indexOf('/photos/') > -1 && !url.pathname.endsWith('.json')) {
    e.respondWith(
      caches.open(PHOTO_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          return hit || fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 브리핑 데이터 — 항상 최신을 먼저 시도
  if (url.pathname.indexOf('/data/') > -1) {
    e.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // 페이지 이동 — 오프라인이면 캐시된 셸을 돌려준다
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('index.html', { cacheName: SHELL_VERSION })
          .then(function (hit) { return hit || caches.match('./'); });
      })
    );
    return;
  }

  // 그 외 셸 자원 — 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(SHELL_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
