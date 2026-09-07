# SecurePath (Wathiqati) — واثقتي

<p align="center">
  <img src="icon-512.png" width="96" alt="SecurePath logo">
</p>

<p align="center">
  <b>منصة رقمية للوساطة التأمينية — تدير علاقتك بوثائقك التأمينية وتربطك بوسيطك المرخّص في مكان واحد.</b>
</p>

<p align="center">
  🌐 <a href="https://securepath.app">securepath.app</a> ·
  📱 Progressive Web App (PWA) + Android APK ·
  🔒 مرخّص بالهيئة العامة للرقابة المالية — رقم FRA 38062
</p>

---

## نظرة عامة

**SecurePath (واثقتي)** هي منصة غير مباشرة لبيع/توليد عملاء التأمين (Indirect-Sale / Lead-Generation)، مُقدَّمة من وسيط تأمين حر مرخّص، **وليست شركة تأمين**. التطبيق يساعد العميل على:

- متابعة كل وثائقه التأمينية (سارية، قريبة من التجديد) في مكان واحد
- رفع وتوثيق مستنداته التأمينية
- تقييم مستوى حمايته التأمينية والحصول على توصيات مخصصة
- طلب عروض أسعار ومقارنتها بين شركات مختلفة
- كسب نقاط مقابل سلوكيات تأمينية وصحية وقيادة آمنة (قابلة للاستبدال بخصومات)
- التواصل المباشر مع وسيطه المرخّص

ويوفّر للوسيط (عبر لوحة التحكم) إدارة كاملة للعملاء، الوثائق، العملاء المحتملين (Leads)، المواعيد، الشكاوى، والإعلانات الترويجية لشركات التأمين.

> ⚖️ **الامتثال القانوني:** التطبيق يعمل كمنصة توعوية/تعريفية وتوليد عملاء محتملين فقط، طبقًا لقانون التأمين الموحد المصري. لا يُصدر التطبيق أي وثيقة تأمين مباشرة، ولا يُعتبر بديلاً عن شركة التأمين المرخّصة.

---

## ⚡ لمحة سريعة (Quick Facts)

| | |
|---|---|
| **النوع** | Progressive Web App (PWA) — بدون إطار عمل (Vanilla JS/HTML/CSS) |
| **قاعدة البيانات** | Firebase Firestore |
| **المصادقة** | Firebase Authentication (بريد إلكتروني/كلمة مرور) |
| **تخزين المستندات** | Cloudinary (Unsigned Upload Presets) |
| **الاستضافة** | GitHub Pages، دومين مخصص عبر `CNAME` |
| **النشر على أندرويد** | APK مبني من الـ PWA (`SecurePath-Production.apk`) |
| **اللغة** | عربي (افتراضي، RTL) / إنجليزي — تبديل فوري داخل التطبيق |

---

## 🗂️ هيكل المشروع

```
securepath-app/
├── wathiqati-app.html              # تطبيق العميل (SPA كامل - HTML/CSS/JS في ملف واحد)
├── securepath-admin.html           # لوحة تحكم الوسيط/الأدمن
├── index.html                      # صفحة الهبوط التسويقية (landing page)
├── manifest.json                   # إعداد الـ PWA (اسم، أيقونات، ألوان)
├── sw.js                           # Service Worker (كاش + عمل أوفلاين)
├── CNAME                           # الدومين المخصص (securepath.app)
├── securepath-firebase-migration.js # سكربت Node.js لإدارة حسابات اختبار/أدمن عبر Firebase Admin SDK
├── package.json                    # تبعيات سكربت الإدارة (firebase-admin)
├── icon-192.png / icon-512.png / icon-512-maskable.png / apple-touch-icon.png
├── SecurePath.apk / SecurePath-Production.apk
└── SecurePath-Production-SHA256.txt
```

---

## ✨ الميزات الرئيسية

### تطبيق العميل (`wathiqati-app.html`)
- تسجيل دخول/تسجيل حساب جديد + **توثيق إلزامي للبريد الإلكتروني** (مع استثناء حسابات تجريبية عبر دومين مضبوط مسبقًا)
- عرض ومتابعة الوثائق التأمينية (سارية / قريبة من التجديد)
- رفع وتوثيق المستندات (صور/PDF) عبر Cloudinary
- **تقييم الحماية الشاملة** — نقاط قوة/ضعف التغطية التأمينية للعميل
- **نظام نقاط الأمان (InsuraPoints)** — نقاط مقابل:
  - سلوكيات تأمينية (تقييم الحماية، رفع مستندات، تنويع التغطية، التجديد المبكر، دعوة صديق)
  - عادات صحية يومية (مشي، جري، أكل صحي) بمكافآت تتابع (streak)
  - القيادة الآمنة — تسجيل يدوي يومي **+ رحلة بتتبع GPS حي** تراقب الالتزام بحد السرعة (مدينة/طريق رئيسي/طريق سريع) وتمنح نقاطًا عند الالتزام
  - استبدال النقاط بخصم يصل حتى 15% على طلب عرض السعر التالي
- مقارنة عروض التأمين بين الشركات
- صفحة **نصائح تأمينية** تثقيفية
- برنامج إحالة (روابط دعوة أصدقاء + إحالة عروض)
- إعلانات شركات التأمين (تُدار من لوحة التحكم)
- طلب مواعيد استشارة، وتقديم شكاوى
- محادثة مباشرة مع الوسيط + زر واتساب عائم
- دعم كامل للغتين عربي/إنجليزي مع RTL/LTR ديناميكي
- عمل أوفلاين جزئي عبر Service Worker

### لوحة التحكم (`securepath-admin.html`)
- إدارة العملاء، الوثائق (بمتابعة حية Real-time)، المنتجات، العروض
- لوحة **العملاء المحتملين (Leads)** مع إحصاءات ومصدر كل عميل محتمل
- إدارة **المواعيد** و**الشكاوى** (حالة، فلترة، شارات غير مقروء)
- إدارة **إعلانات شركات التأمين** المعروضة للعملاء
- إعدادات الوسيط (الاسم، رقم الترخيص، رقم واتساب) — تُغذّي تلقائيًا الإفصاح القانوني في تطبيق العميل

---

## 🔧 الإعداد والتشغيل

### المتطلبات
- مشروع Firebase (خطة Spark المجانية كافية) مفعّل عليه: **Authentication** (بريد/كلمة مرور) و**Firestore**
- حساب Cloudinary (لرفع المستندات دون الحاجة لترقية Firebase لخطة Blaze) مع Upload Preset غير موقّع (Unsigned)

### خطوات التشغيل محليًا
هذا المشروع بدون build step — ملفات HTML/JS/CSS مباشرة:

```bash
git clone https://github.com/eslamshahin1087-lab/securepath-app.git
cd securepath-app
# أي خادم استاتيك بسيط، مثال:
npx serve .
# أو
python3 -m http.server 8080
```

ثم افتح `wathiqati-app.html` (تطبيق العميل) أو `securepath-admin.html` (لوحة التحكم) على المتصفح.

### إعداد Firebase
في كلا الملفين (`wathiqati-app.html` و`securepath-admin.html`) داخل الكود، حدّث كائن `firebaseConfig` ببيانات مشروعك:
```js
apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
```
> ملاحظة أمنية: ظهور `apiKey` داخل كود العميل أمر طبيعي ومتوقع في تطبيقات Firebase من جهة العميل — الحماية الفعلية تكون عبر **Firestore Security Rules**، وليس عبر إخفاء المفتاح.

### إعداد Cloudinary
حدّث اسم الـ Cloud Name واسم الـ Upload Preset في دوال رفع المستندات داخل `wathiqati-app.html` و`securepath-admin.html` (البحث عن `cloudinary`).

### مجموعات Firestore المستخدمة
```
clients · policies · documents · products · offers · leads · appointments
complaints · companyAds · pointsLog · notifications · settings · admin
insuranceAssessments · insuranceTypes · insuranceAds · claims · renewals
payments · messages · activity · companies · users
```

---

## 🔐 الأمان والتوثيق

- **توثيق البريد الإلكتروني إلزامي** لتسجيل الدخول (`user.emailVerified`)، إلا للحسابات على دومين مستثنى صراحة عبر `VERIFICATION_EXEMPT_DOMAINS` داخل `wathiqati-app.html` — **يُستخدم فقط لدومينات تملكها بالكامل**.
- سكربت `securepath-firebase-migration.js` هو الطريقة **الأكثر أمانًا** لتفعيل حسابات اختبار: يستخدم Firebase Admin SDK لتحديد حسابات بعينها (بالبريد/UID صراحة) وتعيين `emailVerified = true` عبر Custom Claims من جهة السيرفر — **بدون** الاعتماد على الدومين وحده كإثبات ملكية. يُفضَّل الانتقال التدريجي لهذه الطريقة بدلًا من الاستثناء بالدومين على العميل إن أمكن.
- لا تضع ملف `service-account.json` الخاص بـ Firebase Admin في المستودع أبدًا — مرره عبر متغير بيئة `FIREBASE_SERVICE_ACCOUNT_JSON`.
- تأكد دائمًا من إحكام **Firestore Security Rules** من داخل Firebase Console (غير مُدارة داخل هذا المستودع).

---

## 🚀 النشر

- **الويب:** يُنشر تلقائيًا عبر GitHub Pages، مربوط بدومين مخصص `securepath.app` عبر ملف `CNAME`.
- **أندرويد:** يُبنى APK من الـ PWA (`SecurePath.apk` / `SecurePath-Production.apk`)، مع بصمة توثيق SHA-256 في `SecurePath-Production-SHA256.txt` لكل إصدار إنتاجي.

---

## 📄 الترخيص والامتثال

هذا التطبيق مقدَّم من وسيط تأمين حر **مرخّص من الهيئة العامة للرقابة المالية المصرية** — رقم الترخيص **FRA 38062** — كمنصة وساطة غير مباشرة (توليد عملاء محتملين) طبقًا لقانون التأمين الموحد. جميع طلبات عروض الأسعار تمر عبر نموذج/تواصل مباشر مع الوسيط، ولا يُصدر التطبيق أي وثيقة تأمين مباشرة.
