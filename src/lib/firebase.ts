// src/lib/firebase.ts
// Configuration Firebase - remplace les valeurs par celles de ta console Firebase
// ou utilise les variables d'environnement dans .env.local

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Évite la réinitialisation en hot-reload Next.js
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Persistance offline désactivée intentionnellement :
// enableIndexedDbPersistence est déprécié et cause des
// "INTERNAL ASSERTION FAILED" en dev Next.js (hot-reload).
// La persistance peut être réactivée en prod si nécessaire.

export default app;
