# SecurePath (وثيقتي / Wathiqati)

منصة استشارات تأمينية رقمية، مبنية كتطبيق عميل + لوحة إدارة، تعمل كمنصة **بيع غير مباشر / توليد عملاء محتملين**
لوسيط تأمين حر مرخّص من الهيئة العامة للرقابة المالية المصرية (FRA)، وليست شركة تأمين مباشرة.

- **التطبيق (عميل):** [`wathiqati-app.html`](./wathiqati-app.html)
- **لوحة الإدارة:** [`securepath-admin.html`](./securepath-admin.html)
- **الرابط المباشر (GitHub Pages):** `https://eslamshahin1087-lab.github.io/securepath-app/`
  > ملف `CNAME` غير موجود حاليًا في المستودع — لو نطاق `securepath.app` المخصص مفعّل، تأكد إنه مُعرّف من
  > تبويب **Settings → Pages** في GitHub، وإلا فالرابط أعلاه هو الفعلي حاليًا.

## المزايا الأساسية

- إدارة الوثائق التأمينية، المطالبات، التجديدات، والمستندات لكل عميل
- تقييم تأميني تلقائي (مؤشر التغطية) وتوصيات مبنية عليه
- نظام نقاط ولاء "نقاط الأمان" (InsuraPoints) لتحويل سلوكيات صحية/تأمينية/قيادة آمنة إلى خصم
- إحالات (Referral) وتتبع Leads كاملة من كل نقاط التفاعل في التطبيق
- محادثة مباشرة وإشعارات بين العميل ولوحة الإدارة
- دعم لغتين (عربي/إنجليزي) بالكامل، ووضع PWA قابل للتثبيت

## التقنيات المستخدمة

- **Frontend:** HTML/CSS/JS خالص (بدون framework) — ملفان رئيسيان لكل من التطبيق ولوحة الإدارة
- **Backend:** Firebase (مشروع `path-1a672`) — Authentication + Firestore، خطة **Spark** المجانية
- **رفع المستندات:** Cloudinary (بدل Firebase Storage، تجنبًا للحاجة لخطة Blaze المدفوعة)
- **الاستضافة:** GitHub Pages

## بنية المشروع

```
wathiqati-app.html          تطبيق العميل
securepath-admin.html       لوحة الإدارة
index.html                  صفحة الهبوط التسويقية
firebase.json                إعدادات Firestore (القواعد + الفهارس)
firestore.rules              قواعد أمان Firestore — المرجع الأساسي لحماية كل الكتابات المباشرة من العميل
firestore.indexes.json       فهارس Firestore
functions/                   Cloud Functions احتياطية غير منشورة حاليًا (راجع functions/README.md)
manifest.json, sw.js         إعدادات PWA
securepath-firebase-migration.js   سكربت Node منفصل لإدارة حسابات الأدمن/الاختبار عبر Firebase Admin SDK
```

## ملاحظة أمان مهمة

نظام النقاط بالكامل يعمل مباشرة من المتصفح (بدون Cloud Functions، بسبب البقاء على خطة Spark)، ومحمي فقط عبر
قيم ثابتة (whitelist) في `firestore.rules` (`VALID_POINT_DELTAS`) مطابقة لـ `POINTS_CONFIG` داخل
`wathiqati-app.html`. **أي تعديل على قيم النقاط في التطبيق لازم يترافق مع تحديث يدوي لنفس القيم في
`firestore.rules`** قبل النشر.
