# خطة تنفيذ إصلاح ثغرة النقاط — خطوة بخطوة

## 1) أضف SDK الخاص بـ Cloud Functions

في `<head>` بجانب سكربتات Firebase الحالية (بعد سطر 6251 تقريبًا حيث يُهيّأ `firebaseConfig`):

```html
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-functions-compat.js"></script>
```

ثم أضف بجانب `var db = firebase.firestore();`:

```js
var functions = firebase.functions();
```

## 2) استبدال منح النقاط اليدوي بالأحداث التلقائية

الدوال `onDocumentUploaded` و `onAssessmentCompleted` في `functions_index.js` تعمل تلقائيًا
عند إنشاء وثيقة حقيقية في `documents` / `insuranceAssessments`. لذلك:

- **احذف** أي استدعاء لـ `awardInsuraPoints(...)` في مسارات: رفع مستند، إكمال تقييم، تجديد مبكر،
  تنويع تغطية، إحالة صديق — طالما أنشأت Cloud Function مطابقة لكل حدث بنفس نمط
  `onAssessmentCompleted` (كررها لكل نوع حدث حسب الـ collection المسؤولة عنه).
- بعد الحذف، لن تُظهر هذه المسارات Toast فوري بالنقاط (لأن الكتابة أصبحت غير متزامنة عبر trigger).
  الحل: اعتمد على مستمع Firestore الموجود بالفعل لعرض بيانات `clients` (`STATE.userData`) —
  عند وصول التحديث الحقيقي من السيرفر، شغّل `showPointsToast()` من داخل الـ listener بدلاً
  من استدعائها مباشرة من الدالة المحلية.

## 3) استبدال العادات اليومية والقيادة اليدوية

ابحث عن كل مكان يستدعي `awardInsuraPoints(points, 'habitWalk', ...)` أو ما شابه، واستبدله بنداء
للدالة السحابية بدلاً من الكتابة المباشرة:

```js
// قبل (خطر - العميل يقرر القيمة ويكتبها مباشرة):
awardInsuraPoints(10, 'habitWalk', 'مشي', 'Walk');

// بعد (آمن - السيرفر يقرر القيمة ويمنع التكرار اليومي):
functions.httpsCallable('checkInHabit')({ habit: 'walk' })
  .then(function(res) { showPointsToast(res.data.points, 'مشي', 'Walk'); })
  .catch(function(e) { console.warn('Habit check-in failed', e.message); });
```

نفس النمط بالضبط لـ `logDrivingManual` (بدون بيانات إضافية).

## 4) استبدال رحلة GPS

بدلاً من حساب نسبة الالتزام بالسرعة محليًا ثم منح النقاط، اجمع العينات الخام أثناء الرحلة
(نفس بيانات `watchPosition` الموجودة أصلًا حول سطر 8646) وأرسلها دفعة واحدة عند انتهاء الرحلة:

```js
functions.httpsCallable('logGpsTrip')({ samples: GPS_TRIP.samples })
  .then(function(res) {
    if (res.data.points > 0) showPointsToast(res.data.points, 'رحلة آمنة', 'Safe trip');
  });
```

## 5) استبدال `confirmRedeemPoints()` بالكامل

هذا هو التغيير الأهم. استبدل جسم الدالة (سطر 8744-8790 حاليًا) بحيث لا تكتب على
`clients` أو `leads` مباشرة أبدًا:

```js
function confirmRedeemPoints() {
    var slider = document.getElementById('redeemSlider'),
        pts = parseInt(slider.value, 10) || 0;
    if (pts <= 0) { closeModal('redeemPointsModal'); return; }

    functions.httpsCallable('redeemPoints')({ points: pts })
        .then(function(res) {
            var discountPct = res.data.discountPercent;
            closeModal('redeemPointsModal');
            renderPointsWidget();
            renderPointsHub();

            var note = STATE.language === 'ar'
                ? ('طلب خصم بنقاط الأمان: ' + discountPct + '% (' + res.data.pointsUsed + ' نقطة)')
                : ('InsuraPoints discount request: ' + discountPct + '% (' + res.data.pointsUsed + ' pts)');
            // ... نفس منطق فتح Google Form الموجود حاليًا في سطر 8787+ يبقى كما هو
        })
        .catch(function(e) {
            alert(STATE.language === 'ar' ? 'تعذر استبدال النقاط: ' + e.message : 'Could not redeem points: ' + e.message);
        });
}
```

لاحظ أن `STATE.userData.insuraPoints` المعروض في الواجهة سيتحدّث تلقائيًا من مستمع Firestore
الحالي بمجرد أن تُنفّذ الدالة السحابية الخصم فعليًا — لا حاجة لتعديله محليًا بشكل متفائل.

## 6) النشر

```bash
cd securepath-app
firebase init functions   # إن لم تكن مهيأة من قبل
# انسخ محتوى functions_index.js إلى functions/index.js
cd functions && npm install firebase-functions@latest firebase-admin@latest
cd ..
firebase deploy --only functions,firestore:rules
```

## 7) قائمة اختبار قبل الاعتماد على الفرع الرئيسي

- [ ] تسجيل دخول كعميل عادي وتشغيل: `firebase.firestore().collection('clients').doc(uid).set({insuraPoints: firebase.firestore.FieldValue.increment(999999)}, {merge:true})` من الـ Console — يجب أن يفشل بـ `permission-denied`.
- [ ] تشغيل `checkInHabit` مرتين في نفس اليوم لنفس العادة — يجب أن يفشل الثاني بـ `failed-precondition`.
- [ ] استدعاء `redeemPoints` برصيد أكبر من الفعلي — يجب أن يُحدّ (`cap`) للرصيد الحقيقي فقط.
- [ ] التأكد أن مستند `leads` الجديد من نوع `points_redemption` يحمل `discountPercent` مطابقًا لما حسبه السيرفر فعليًا، وليس رقمًا اعتباطيًا يرسله العميل.
- [ ] رفع مستند حقيقي جديد والتأكد أن `documentUpload` points تُضاف تلقائيًا دون أي كود إضافي من جهة العميل.
