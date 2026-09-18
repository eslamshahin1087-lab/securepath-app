/**
 * firebase-init.js
 * تهيئة Firebase لتطبيق SecurePath
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCkRYPffAEBRivC2Si5T-ILL99ZrSq-dWM",
  authDomain: "path-1a672.firebaseapp.com",
  projectId: "path-1a672",
  storageBucket: "path-1a672.firebasestorage.app",
  messagingSenderId: "616651183121",
  appId: "1:616651183121:web:ba7f3cdec65a9df8014db0",
  measurementId: "G-3LHQJG4PSV"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, firebaseConfig };

console.log('[firebase-init] ✅ Firebase initialized:', firebaseConfig.projectId);
