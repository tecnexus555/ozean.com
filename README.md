# Ozean: منصة الأعمال الرقمية

## المحتويات
- `public/index.html`: الواجهة الكاملة (تعمل محلياً بالبيانات التجريبية).
- `public/firebase-bridge.js`: جسر Firebase (تسجيل الدخول والقراءة والنشر والحفظ). يحتاج إعدادات مشروعك.
- `firestore.rules` و`storage.rules`: قواعد الأمان.
- `functions/`: دالتا `processPayment` و`walletPass`.
- `firebase.json` و`.firebaserc`: إعدادات المشروع.

## الإعداد
1. في `.firebaserc` استبدل `ozean` باسم مشروعك.
2. في `public/firebase-bridge.js` ضع إعدادات `firebaseConfig`.
3. في `functions/index.js` غيّر `SITE` إلى نطاقك الفعلي.
4. أضف `WALLET_ISSUER_ID` في إعدادات الدوال، ومفتاح حساب الخدمة عبر:
   `firebase functions:secrets:set WALLET_SA_KEY`
5. ثبّت الاعتماديات:
   `cd functions && npm install && cd ..`

## النشر
```
firebase deploy --only firestore:rules,storage,hosting,functions
```

## تحذيرات
- **لا ترفع** أي ملف `*adminsdk*.json` ولا `.env` إلى GitHub.
- دالة `chargeWithGateway` غير مكتملة، وتُرجع رفضاً دائماً، فلا تُخصم أي أموال قبل ربطها ببوابة دفع مرخصة.
- الصفحة لا تستدعي `firebase-bridge.js` بعد، وربطها بالأزرار والمتجر خطوة تالية.
- ميزة Google Pay تحتاج حساب تاجر، والدينار الليبي غالباً غير مدعوم فيها.
- حفظ الأعمال في Firestore يتطلب تسجيل الدخول أولاً.

## الطلبات والدفع بالتحويل (v0.2)
- الدفع بالتحويل: محفظة أو مصرف داخل ليبيا، وتحويل دولي / Wise / ويسترن يونيون خارجها. لا يوجد خصم تلقائي.
- المسار: المشتري ينشئ طلباً ← يحوّل ويرسل الإيصال للفنان ← الفنان يؤكد من "طلبات العملاء" ← يظهر للمشتري "تنزيل العمل الأصلي".
- `firebase-bridge.js` أُضيفت إليه: `createOrder` و`loadOrders` و`confirmOrder` و`rejectOrder` و`getDelivery` و`loadSellerPay`.
- رابط الملف الأصلي صار في `items/{id}/private/master` بدل الوثيقة العامة، والقراءة لصاحب العمل أو مشترٍ مؤكَّد فقط.
- بعد النشر: `firebase deploy --only firestore:rules,storage` (قد يطلب Firebase منح Storage صلاحية قراءة Firestore، وافق عليها).
- الأعمال المنشورة قبل هذا التحديث قد يبقى `driveLink` فيها داخل الوثيقة العامة، فأعد نشرها أو احذف الحقل يدوياً.
