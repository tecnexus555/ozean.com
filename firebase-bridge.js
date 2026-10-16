// جسر Firebase: تسجيل الدخول بحساب Google والقراءة والنشر والحفظ
// ملاحظة: الصفحة لا تحمّل هذا الملف بعد. يُضاف عبر: <script type="module" src="firebase-bridge.js"></script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where, addDoc, deleteDoc, serverTimestamp, runTransaction, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// الصق إعدادات مشروعك من: Project settings ← Your apps ← Web app
const firebaseConfig = {
  apiKey: "AIzaSyCSSLsWAOoyG_6CyiQysDK2IoFYjf-nMbE",
  authDomain: "ozean-47b09.firebaseapp.com",
  projectId: "ozean-47b09",
  storageBucket: "ozean-47b09.firebasestorage.app",
  messagingSenderId: "207064916319",
  appId: "1:207064916319:web:8d299bce003418d5a116ea"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

window.ozean = { user: null };

window.signIn = async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { alert("تعذّر تسجيل الدخول: " + e.message); }
};
window.signOutUser = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  window.ozean.user = user;
  window.dispatchEvent(new CustomEvent("ozean-auth", { detail: user }));
  if (user) {
    const r = doc(db, "users", user.uid);
    const snap = await getDoc(r);
    if (!snap.exists()) {
      const ok = confirm("بالمتابعة توافق على حفظ بياناتك (الاسم والبريد والصورة) لإدارة حسابك في Ozean. هل توافق؟");
      if (!ok) { await signOut(auth); return; }
      await setDoc(r, { displayName: user.displayName || "", email: user.email || "",
        photoURL: user.photoURL || "", phone: "", createdAt: serverTimestamp(),
        consentAt: serverTimestamp(), lastLoginAt: serverTimestamp() });
    } else {
      await updateDoc(r, { lastLoginAt: serverTimestamp(), displayName: user.displayName || "",
        photoURL: user.photoURL || "" });
    }
  }
});

function mapItem(d) {
  const x = d.data();
  return { id: x.numId, _docId: d.id, title: x.title, desc: x.description, cat: x.category,
           price: x.pricingMode === "free" ? 0 : (x.pricingMode === "nego" ? null : x.price),
           cur: x.currency, artist: x.artist, img: x.previewData || x.previewUrl || null,
           gallery: x.gallery || (x.previewData ? [x.previewData] : []),
           driveLink: x.driveLink || null,
           auction: x.auction ? { ...x.auction, endsAt: x.auction.endsAt && x.auction.endsAt.toMillis ? x.auction.endsAt.toMillis() : 0 } : null,
           dur: x.duration || "", mine: x.artistId === window.ozean.user?.uid,
           draft: !x.isPublished };
}

window.loadItems = async () => {
  const out = [];
  const pub = await getDocs(query(collection(db, "items"), where("isPublished", "==", true)));
  pub.forEach(d => out.push(mapItem(d)));
  if (window.ozean.user) {
    const mine = await getDocs(query(collection(db, "items"), where("artistId", "==", window.ozean.user.uid)));
    mine.forEach(d => { if (!out.find(x => x._docId === d.id)) out.push(mapItem(d)); });
  }
  return out;
};

// ضغط المعاينة لتبقى صغيرة داخل وثيقة Firestore (الحد الأقصى للوثيقة 1 ميغابايت)
async function compressImage(src, maxW = 800, maxBytes = 300 * 1024) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  for (let q = 0.8; q >= 0.4; q -= 0.1) {
    const out = c.toDataURL("image/jpeg", q);
    if (out.length * 0.75 <= maxBytes) return out;
  }
  throw new Error("الصورة كبيرة جداً بعد الضغط، اختر صورة أصغر");
}

window.publishItem = async (item) => {
  const user = window.ozean.user;
  if (!user) throw new Error("سجّل الدخول أولاً");
  if (item.vid || item.aud) throw new Error("رفع الفيديو والموسيقى يتطلب تفعيل التخزين (Storage) أولاً");
  const uid = user.uid;
  if (item.driveLink && !/^https:\/\/(drive|docs)\.google\.com\//.test(item.driveLink)) {
    throw new Error("رابط Google Drive غير صالح، يجب أن يبدأ بـ https://drive.google.com/");
  }
  const galleryData = item.gallery && item.gallery.length
    ? await Promise.all(item.gallery.map(g => compressImage(g, 700, 150 * 1024)))
    : (item.img ? [await compressImage(item.img, 700, 150 * 1024)] : []);
  const previewData = galleryData[0] || null;
  const docRef = await addDoc(collection(db, "items"), {
    numId: item.id, title: item.title, description: item.desc || "",
    category: item.cat,
    pricingMode: item.auction ? "auction" : (item.price === 0 ? "free" : (item.price == null ? "nego" : "fixed")),
    price: item.auction ? Number(item.auction.startPrice) : (item.price ?? null), currency: item.cur || "LYD",
    artist: user.displayName || "فنان", artistId: uid,
    isPublished: !item.draft, createdAt: serverTimestamp(),
    commissionPercent: item.commissionPercent ?? 10, minFeeUsd: item.minFeeUsd ?? 0.5,
    previewData,
    gallery: galleryData,
    driveLink: item.driveLink || null,
    auction: item.auction ? { ...item.auction, startPrice: Number(item.auction.startPrice), minStep: Number(item.auction.minStep), endsAt: Timestamp.fromDate(new Date(item.auction.endsAt)) } : null
  });
  const warnings = [];
  // الملف الأصلي: إن وُضع رابط Drive فلا يُرفع شيء، وإلا يُحفظ في Storage إن كان مفعّلاً
  if (item.masterFile && !item.driveLink) {
    try {
      await uploadBytes(ref(storage, `masters/${uid}/${item.id}/${item.masterFile.name}`), item.masterFile);
    } catch (e) {
      console.error(e);
      warnings.push("الملف الأصلي لم يُحفظ لأن التخزين غير مفعّل بعد");
    }
  }
  return { id: docRef.id, warnings };
};

window.loadProfile = async () => {
  const u = window.ozean.user; if (!u) return null;
  const s = await getDoc(doc(db, "users", u.uid));
  return s.exists() ? s.data() : null;
};
window.saveProfile = async (data) => {
  const u = window.ozean.user; if (!u) throw new Error("سجّل الدخول أولاً");
  await updateDoc(doc(db, "users", u.uid), data);
};

window.placeBid = async (docId, amount) => {
  const u = window.ozean.user;
  if (!u) throw new Error("سجّل الدخول أولاً");
  const ref = doc(db, "items", docId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("العمل غير موجود");
    const a = snap.data().auction;
    if (!a) throw new Error("هذا العمل ليس مزاداً");
    const ends = a.endsAt && a.endsAt.toMillis ? a.endsAt.toMillis() : 0;
    if (a.closed || Date.now() >= ends) throw new Error("انتهى المزاد");
    const min = a.highBid != null ? a.highBid + a.minStep : a.startPrice;
    if (!(Number(amount) >= min)) throw new Error("أقل مزايدة مسموحة: " + min);
    tx.update(ref, {
      "auction.highBid": Number(amount),
      "auction.highBidder": u.uid,
      "auction.highBidderName": u.displayName || "",
      "auction.bids": (a.bids || 0) + 1
    });
  });
};

window.closeAuction = async (docId) => {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  await updateDoc(doc(db, "items", docId), { "auction.closed": true });
};

window.deleteItem = async (docId) => {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  await deleteDoc(doc(db, "items", docId));
};

window.deleteAccount = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("سجّل الدخول أولاً");
  const mine = await getDocs(query(collection(db, "items"), where("artistId", "==", user.uid)));
  for (const d of mine.docs) await deleteDoc(d.ref);
  await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
  await deleteUser(user);
};

window.saveAvatar = async (dataUrl) => {
  const user = window.ozean.user;
  if (!user) throw new Error("سجّل الدخول أولاً");
  const blob = await (await fetch(dataUrl)).blob();
  const r = ref(storage, `previews/${user.uid}/avatar`);
  await uploadBytes(r, blob);
  const url = await getDownloadURL(r);
  await updateDoc(doc(db, "users", user.uid), { photoURL: url });
  return url;
};
