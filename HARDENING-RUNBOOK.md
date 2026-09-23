# SecurePath Hardening Runbook

## الهدف

هذا الفرع يطبق أربع تغييرات مترابطة بدون حذف بيانات التطبيق:

1. Backend واحد لعمليات العميل الحساسة: Cloudflare Worker.
2. تقليل التحميل الأولي للـPWA وlazy-load لمكتبة Excel.
3. منع الكتابات الحساسة المباشرة من العميل إلى Firestore.
4. إعادة ترتيب الصفحة الرئيسية حول «ماذا بعد؟ / What's next؟».

## النشر

### 1) Firestore

firebase deploy --only firestore:rules

### 2) Cloudflare Worker

cd workers/securepath-api
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler deploy

تأكد أن `js/securepath-backend.js` يشير إلى عنوان الـWorker الإنتاجي الصحيح.

### 3) GitHub Pages

الـworkflow يستبعد الآن:
- `securepath-admin.html`
- `test-firebase.html`
- `functions/`
- `workers/`
- `scripts/`
- `securepath-firebase-migration.js`

وبذلك لا تُنشر أدوات الإدارة/الاختبار/backend ضمن موقع العميل.

### 4) حسابات الاختبار

لا تستخدم أي استثناء عام حسب النطاق. حساب الاختبار يحتاج custom claim:

`securepathTest=true`

ويمكن ضبطه فقط من خلال `securepath-firebase-migration.js` باستخدام قائمة حسابات صريحة.

### 5) بعد النشر

اختبر بالترتيب:
- login / logout
- profile save
- appointment
- complaint
- renewal
- advice request
- lead creation
- document upload
- points
- points redemption
- GPS trip
- HR Hub / Excel loading
- PWA offline navigation

## ملاحظة مهمة

إذا كان هناك إصدار Cloud Functions قديم منشور في Firebase من تاريخ سابق، يجب إيقافه بعد التحقق من Worker حتى لا يوجد مساران متوازيان لمنح النقاط أو تنفيذ نفس العمليات.