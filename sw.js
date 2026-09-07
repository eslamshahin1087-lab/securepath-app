// sw.js - نسخة محسنة احترافية

const CACHE_NAME = 'securepath-v2';   // تغيير الإصدار عند التحديث
const SHELL = [
  './wathiqati-app.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ============= التثبيت =============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] تثبيت الملفات الأساسية');
        return cache.addAll(SHELL);
      })
      .then(() => {
        console.log('[SW] تم التثبيت بنجاح');
      })
      .catch((error) => {
        console.error('[SW] فشل تثبيت الملفات:', error);
        // يمكن إلقاء الخطأ لمنع التثبيت إذا كانت الملفات ضرورية
        // لكن نتركه يمر لاستمرار العمل جزئيًا
      })
  );
  // تفعيل الخدمة فورًا دون انتظار إغلاق الصفحات
  self.skipWaiting();
});

// ============= التنشيط =============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // حذف جميع الكاشات القديمة عدا الإصدار الحالي
        const deletePromises = cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] حذف كاش قديم:', name);
            return caches.delete(name);
          });
        return Promise.all(deletePromises);
      })
      .then(() => {
        // السيطرة على جميع الصفحات المفتوحة دون إعادة تحميل
        return self.clients.claim();
      })
      .then(() => {
        console.log('[SW] تم التنشيط والتحكم في العملاء');
      })
  );
});

// ============= اعتراض الطلبات =============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الطلبات غير GET وطلبات من أصول خارجية (لنخزن فقط مواردنا)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) {
    // للموارد الخارجية نفضل عدم التدخل (أو يمكن استخدام network-only)
    return;
  }

  // تحديد نوع الطلب
  const isNavigational = request.mode === 'navigate';

  // ----------------- استراتيجية للملاحة (HTML) -----------------
  if (isNavigational) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // إذا كانت الاستجابة سليمة، نخزن نسخة في الكاش لتحديثها
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          // عند فشل الشبكة، نبحث عن الصفحة المطلوبة في الكاش
          return caches.match(request)
            .then((cached) => {
              if (cached) return cached;
              // وإلا نقدم الصفحة الرئيسية كحل احتياطي
              return caches.match('./wathiqati-app.html');
            });
        })
    );
    return;
  }

  // ----------------- استراتيجية للملفات الثابتة -----------------
  // استخدم Cache‑First مع تحديث في الخلفية (Stale‑While‑Revalidate)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // نعيد الاستجابة المخزنة فورًا، ثم نحدّث الكاش في الخلفية
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => { /* تجاهل أخطاء التحديث الخلفي */ });
          return cachedResponse;
        }

        // لم نجد في الكاش → نذهب للشبكة ونخزن النتيجة
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, cloned);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // فشل كل شيء → نعيد استجابة افتراضية (مثل صورة placeholder)
            // يمكن إنشاء استجابة فارغة أو 404 حسب الحاجة
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
      })
  );
});
