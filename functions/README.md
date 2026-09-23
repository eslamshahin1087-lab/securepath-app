# SecurePath Functions — Deprecated / Shadow Backend

> **Production source of truth:** Cloudflare Worker at `workers/securepath-api/src/index.js`.

هذا المجلد لم يعد مصدر التنفيذ الأساسي. تم توحيد منطق الـbackend في SecurePath Worker لتفادي تشغيل نسختين مختلفتين من:
- النقاط والاستبدال
- GPS
- Cloudinary signing
- إجراءات العميل (مواعيد، شكاوى، تجديدات، رسائل، Leads)

لا تقم بنشر `functions/index.js` بالتوازي مع الـWorker. وجود نسختين قيد التشغيل قد يؤدي إلى تكرار rewards أو اختلاف قواعد العمل.

## الانتقال

1. انشر Worker من `workers/securepath-api`.
2. انشر `firestore.rules`.
3. حدّث PWA/APK إلى النسخة الموجودة في هذا الفرع.
4. تحقق من:
   - تسجيل الدخول
   - رفع مستند
   - طلب موعد
   - شكوى
   - طلب تجديد
   - طلب نصيحة
   - إنشاء Lead
   - النقاط والاستبدال
5. بعد التحقق، عطّل أي Cloud Functions قديمة كانت منشورة يدويًا من مشروع Firebase.

البيانات الحالية لا تحتاج حذفًا أو إعادة بناء. التغيير هنا هو نقل ملكية منطق الأعمال الحساسة إلى backend واحد موثوق.
