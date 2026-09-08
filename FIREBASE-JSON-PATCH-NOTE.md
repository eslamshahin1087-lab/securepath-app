# تنبيه مهم قبل الرفع: firebase.json

لم أُرفق نسخة كاملة بديلة لملف `firebase.json` عمدًا — لأن هذا الملف **موجود بالفعل** في فرع
`fix/prod-hardening-v1` (أضافه PR #3) وأنا لا أملك محتواه الحالي بالكامل (خصوصًا إعدادات
`hosting`). استبداله بالكامل قد يمسح إعدادات موجودة عندك بدون قصد.

**افتح `firebase.json` الموجود عندك في هذا الفرع، وتأكد أن قسم `functions` موجود بداخله — أضفه
يدويًا لو ناقص:**

```json
{
  "functions": {
    "source": "functions"
  }
}
```

هذا القسم يُدمج مع بقية المفاتيح الموجودة (`hosting`, `firestore`, ...) في نفس الملف —
لا يستبدلها. مثال على شكل الملف كامل بعد الدمج (عدّل قيم `hosting`/`firestore` لتطابق ما هو موجود
عندك فعليًا، هذا للتوضيح فقط):

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "functions/**"]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions"
  }
}
```
