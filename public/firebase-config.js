// BRO SQUAD - Firebase Web SDK Modular Setup
// Built for Google Firebase Spark Plan (100% Free Forever)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  collection, 
  addDoc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  writeBatch,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =========================================================================
// REPLACE THE PLACEHOLDERS BELOW WITH YOUR ACTUAL FIREBASE PROJECT KEYS
// (From Firebase Console > Project Settings > General > Your apps)
// =========================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyYOUR_API_KEY_HERE",
  authDomain: "bro-squad-cloud.firebaseapp.com",
  projectId: "bro-squad-cloud",
  storageBucket: "bro-squad-cloud.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Initialize Firebase Core
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for Firestore if supported
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not supported in this browser');
    }
  });
} catch (e) {
  // Graceful fallback
}

// Room Identity Constants
export const ROOM_ID = "bro-squad-main";
export const ROOM_NAME = "BRO SQUAD";
export const INITIAL_MEMBERS = [
  { id: "asaduzzaman", name: "Asaduzzaman", role: "admin" },
  { id: "abdullah", name: "Abdullah", role: "member" },
  { id: "md-milon", name: "Md Milon", role: "member" },
  { id: "md-monir", name: "Md Monir", role: "member" }
];

export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
};
