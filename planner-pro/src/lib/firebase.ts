import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDz4bIalrBnn3utOVPSl4X2sQaadh07VDE",
  authDomain: "planning-survey-pro.firebaseapp.com",
  projectId: "planning-survey-pro",
  storageBucket: "planning-survey-pro.firebasestorage.app",
  messagingSenderId: "9615394137",
  appId: "1:9615394137:web:391072370f83128628b848"
};

// Initialize Firebase only if we have an API key or a dummy (for Next.js build prerendering)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
