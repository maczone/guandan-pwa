/**
 * sw.js - 掼蛋PWA Service Worker
 * 缓存所有静态资源，实现完全离线运行
 */

const CACHE_NAME = 'guandan-v3';

// 要缓存的所有资源
const PRECACHE_URLS = [
  '/guandan-pwa/',
  '/guandan-pwa/index.html',
  '/guandan-pwa/manifest.json',
  '/guandan-pwa/css/style.css',
  '/guandan-pwa/js/cards.js',
  '/guandan-pwa/js/rules.js',
  '/guandan-pwa/js/settings.js',
  '/guandan-pwa/js/memory.js',
  '/guandan-pwa/js/stats.js',
  '/guandan-pwa/js/sound.js',
  '/guandan-pwa/js/ai.js',
  '/guandan-pwa/js/game.js',
  '/guandan-pwa/js/ui.js',
  '/guandan-pwa/js/app.js',
  '/guandan-pwa/icons/icon-192.png',
  '/guandan-pwa/icons/icon-512.png'
];

// 安装：预缓存所有文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：优先从缓存返回
self.addEventListener('fetch', event => {
  // 只拦截同源请求
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 不在缓存中则从网络获取
          return fetch(event.request).then(response => {
            // 只缓存成功响应
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return response;
          }).catch(() => {
            // 离线且没缓存时返回离线页面
            return caches.match('/guandan-pwa/index.html');
          });
        })
    );
  }
});
