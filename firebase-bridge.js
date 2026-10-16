// جسر Firebase: تسجيل الدخول بحساب Google والقراءة والنشر والحفظ
// ملاحظة: الصفحة لا تحمّل هذا الملف بعد. يُضاف عبر: <script type="module" src="firebase-bridge.js"></script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where, addDoc, serverTimestamp }
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
// البريد الوحيد المسموح له بالدخول حالياً
const ALLOWED_EMAILS = ["tecnexus555@gmail.com"];

window.signIn = async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { alert("تعذّر تسجيل الدخول: " + e.message); }
};
window.signOutUser = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (user && !ALLOWED_EMAILS.includes(user.email)) {
    alert("هذا الحساب غير مصرّح له بالدخول إلى Ozean");
    await signOut(auth);
    return;
  }
  window.ozean.user = user;
  window.dispatchEvent(new CustomEvent("ozean-auth", { detail: user }));
  if (user) {
    const r = doc(db, "users", user.uid);
    if (!(await getDoc(r)).exists()) {
      await setDoc(r, { displayName: user.displayName || "", email: user.email || "",
                        photoURL: user.photoURL || "", createdAt: serverTimestamp() });
    }
  }
});

function mapItem(d) {
  const x = d.data();
  return { id: x.numId, _docId: d.id, title: x.title, desc: x.description, cat: x.category,
           price: x.pricingMode === "free" ? 0 : (x.pricingMode === "nego" ? null : x.price),
           cur: x.currency, artist: x.artist, img: x.previewData || x.previewUrl || null,
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
  const previewData = item.img ? await compressImage(item.img) : null;
  const docRef = await addDoc(collection(db, "items"), {
    numId: item.id, title: item.title, description: item.desc || "",
    category: item.cat,
    pricingMode: item.price === 0 ? "free" : (item.price == null ? "nego" : "fixed"),
    price: item.price ?? null, currency: item.cur || "LYD",
    artist: user.displayName || "فنان", artistId: uid,
    isPublished: !item.draft, createdAt: serverTimestamp(),
    commissionPercent: item.commissionPercent ?? 10, minFeeUsd: item.minFeeUsd ?? 0.5,
    previewData,
    driveLink: item.driveLink || null
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
