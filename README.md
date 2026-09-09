# ⚠️ غير مُفعّل حاليًا — Not currently deployed

الكود في هذا الفولدر (`index.js`) **لا يُنشر ولا يُستخدم في الإنتاج حاليًا**. المشروع باقٍ على خطة
Firebase **Spark** (مجانية)، ومنطق نقاط الأمان بالكامل بيشتغل مباشرة من `wathiqati-app.html` عبر
كتابات محمية بقواعد `firestore.rules` (شوف `VALID_POINT_DELTAS` هناك).

هذا الكود متسيب هنا **كمسار ترقية مستقبلي فقط**: لو قررت يومًا ترقّي لخطة **Blaze** (بطاقة ائتمان
مربوطة، حصة مجانية سخية)، الفنكشنز دي بتدي حماية أقوى (تحسب صحة الرحلة GPS بنفسها بدل ما تصدّق رقم
جاي من المتصفح، وتمنع أي تلاعب محلي بالكامل). لو عايز تنشرها وقتها:

1. رجّع `"functions": { "source": "functions" }` جوه `firebase.json` في جذر المستودع.
2. `firebase deploy --only functions` (بعد ما تكون رقّيت الخطة فعليًا من Firebase Console).
3. بدّل نداءات `awardInsuraPoints()` / `confirmRedeemPoints()` في `wathiqati-app.html` بنداءات
   `httpsCallable('checkInHabit')` وما شابه، بدل الكتابة المباشرة على Firestore.

من غير الخطوات دي، الملف مش هيتنشر ومش هيأثر على حاجة.
