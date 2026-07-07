/**
 * sw.js - 掼蛋PWA Service Worker
 * 缓存所有静态资源，实现完全离线运行
 * 自动适配任意部署路径（/guandan-pwa/、/、本地开发等）
 */

// 自动计算部署基础路径（动态适配 GitHub Pages 子路径等）
const BASE_PATH = self.location.pathname.replace(/\/[^/]*$/, '/');

const CACHE_NAME = 'guandan-v5';

// 要缓存的所有资源（使用动态路径）
const PRECACHE_URLS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'css/style.css',
  BASE_PATH + 'js/cards.js',
  BASE_PATH + 'js/rules.js',
  BASE_PATH + 'js/settings.js',
  BASE_PATH + 'js/memory.js',
  BASE_PATH + 'js/stats.js',
  BASE_PATH + 'js/sound.js',
  BASE_PATH + 'js/ai.js',
  BASE_PATH + 'js/game.js',
  BASE_PATH + 'js/ui.js',
  BASE_PATH + 'js/app.js',
  BASE_PATH + 'icons/icon-192.png',
  BASE_PATH + 'icons/icon-512.png'
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

// 拦截请求：优先从缓存返回，无网络时静默使用缓存
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
            // 彻底离线且没缓存时：尝试返回离线首页
            return caches.match(BASE_PATH + 'index.html');
          });
        })
    );
  }
});
