// src/lib/firebaseAdmin.ts
// SDK Firebase Admin — côté serveur uniquement (routes API Next.js)
// Ne jamais importer ce fichier dans du code client ("use client")

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!rawKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
    throw new Error("Variables d'environnement Firebase Admin manquantes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
  }

  // Sur Vercel la clé peut être collée avec des guillemets JSON encadrants ("-----BEGIN...-----")
  // ou avec des \n littéraux au lieu de vrais sauts de ligne. On normalise les deux cas.
  const privateKey = rawKey.startsWith('"')
    ? JSON.parse(rawKey) as string
    : rawKey.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// Initialisation lazy : appelée à l'intérieur des handlers, jamais au chargement du module
export function getAdminAuth() {
  return getAuth(getAdminApp());
}
export function getAdminDb() {
  return getFirestore(getAdminApp());
}
export { getApps } from "firebase-admin/app";
