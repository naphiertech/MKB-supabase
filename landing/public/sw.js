const CACHE_NAME = 'mkbridertrack-assets-v1';

// Static precache list (can be left empty for dynamic on-demand caching)
const PRECACHE_ASSETS = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Custom helper to serve HTML5 range requests (206 Partial Content) from cache
async function handleRangeRequest(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cachedResponse;

  try {
    const arrayBuffer = await cachedResponse.arrayBuffer();
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : arrayBuffer.byteLength - 1;

    const slicedBuffer = arrayBuffer.slice(start, end + 1);
    
    return new Response(slicedBuffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
        'Content-Length': slicedBuffer.byteLength.toString(),
        'Content-Type': cachedResponse.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'public, max-age=31536000',
        'Accept-Ranges': 'bytes'
      }
    });
  } catch (error) {
    // If range parsing fails, fall back to standard full cached response
    return cachedResponse;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept HTTP/S GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Intercept images and videos (from both local public directory and external CDNs like Unsplash & Pexels)
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg|avif|ico)$/i.test(url.pathname) || 
                  url.hostname.includes('unsplash.com') || 
                  url.hostname.includes('pexels.com/image');
  const isVideo = /\.(mp4|webm|ogg)$/i.test(url.pathname) || 
                  url.pathname.includes('pexels.com/download/video') || 
                  url.pathname.includes('/video/');

  if (isImage || isVideo) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from Cache. If it's a video stream range request, slice the buffer.
          if (isVideo) {
            return handleRangeRequest(event.request, cachedResponse);
          }
          return cachedResponse;
        }

        // Cache Miss: Fetch from network, clone the response, and save it in cache
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch((err) => {
          console.warn('Failed to fetch cached asset from network:', err);
          // Return a safe offline status response
          return new Response('Offline asset unavailable.', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
  }
});
