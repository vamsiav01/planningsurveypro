import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);

// Use initializeFirestore to force long-polling (bypasses WebSocket blocking)
let db: any;
if (!getApps().length || !app) {
  // Should not happen, but safe fallback
  db = getFirestore(app);
} else {
  // If app is already initialized, getFirestore just returns the existing instance.
  // But we want to initialize it with custom settings if it's the first time.
  try {
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
    
    // Enable offline persistence so projects survive page reloads instantly
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
        } else if (err.code == 'unimplemented') {
          console.warn("The current browser does not support all of the features required to enable persistence");
        }
      });
    }
  } catch (e) {
    // If it was already initialized
    db = getFirestore(app);
  }
}

const storage = getStorage(app);

export { app, auth, db, storage };

