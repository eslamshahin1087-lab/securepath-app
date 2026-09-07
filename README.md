# SecurePath (Wathiqati) — واثقتي

منصة رقمية لإدارة رحلة العميل التأمينية وربطه بالوسيط المرخّص، مع تطبيق عميل ولوحة إدارة موحدة على Firebase.

## Production hardening v1

هذه النسخة تضيف طبقة بنية تحتية قابلة للمراجعة داخل المستودع:

- `firestore.rules` — قواعد وصول واضحة Least Privilege.
- `firestore.indexes.json` — تتبع إعدادات الفهارس.
- `firebase.json` — إعداد النشر.
- `ARCHITECTURE.md` — نموذج الهوية والبيانات القياسي.
- إصلاح أوامر `npm` لتستخدم `securepath-firebase-migration.js`.

## قاعدة الهوية

القاعدة القياسية للمشروع:

```
Firebase Auth UID
        ↓
clients/{uid}
        ↓
clientId = uid في كل السجلات التابعة للعميل
```

لا يجب إنشاء هوية بديلة للعميل باستخدام `username` أو `email`.

## الملفات الرئيسية

- `wathiqati-app.html` — تطبيق العميل.
- `securepath-admin.html` — لوحة الإدارة.
- `index.html` — صفحة الهبوط.
- `manifest.json` و `sw.js` — PWA.
- `securepath-firebase-migration.js` — إدارة حسابات Admin/Test.
- `firestore.rules` — سياسة الصلاحيات.
- `ARCHITECTURE.md` — توثيق المعمارية.

## التشغيل المحلي

```bash
npx serve .
```

ثم:

- `wathiqati-app.html`
- `securepath-admin.html`

## أدوات Firebase Admin

```bash
npm install
npm run list
npm run apply-test
npm run apply-admin
npm run apply-both
```

مرّر بيانات Firebase Admin عبر:

```
FIREBASE_SERVICE_ACCOUNT_JSON
```

ولا تضع Service Account داخل المستودع.

## النشر

### Firestore

```bash
firebase deploy --only firestore
```

### Hosting

```bash
firebase deploy --only hosting
```

## ملاحظة إنتاجية مهمة

قواعد Firestore الجديدة تجعل عمليات النقاط والتقييمات الحساسة غير قابلة للكتابة بحرية من المتصفح. يجب نقل إصدار النقاط والاستبدال والعمليات ذات الأثر المالي إلى Cloud Functions أو Firebase Admin قبل تفعيل القواعد الصارمة في الإنتاج.

## الامتثال

SecurePath منصة وسيط/خدمات رقمية تأمينية وليست شركة تأمين أو جهة إصدار وثائق مباشرة. يجب أن تبقى تدفقات المنتجات والعروض والإفصاحات متوافقة مع ترخيص الوسيط واللوائح المعمول بها.
