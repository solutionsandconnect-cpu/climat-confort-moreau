// src/lib/pushService.ts
// Gestion des notifications push FCM côté client
// Demande la permission, enregistre le token, envoie via API

import { updateDoc, doc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// Initialise le messaging Firebase en lazy (browser uniquement)
// Retourne null si le navigateur ne supporte pas les Service Workers (iOS Safari, etc.)
async function getFirebaseMessaging() {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const { getMessaging, isSupported, getToken, onMessage } = await import("firebase/messaging");
    const supported = await isSupported();
    if (!supported) return null;
    const { default: app } = await import("./firebase");
    return { messaging: getMessaging(app), getToken, onMessage };
  } catch {
    return null;
  }
}

// Enregistre le service worker FCM et retourne le token push
export async function registerPushToken(userFirestoreId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  if (!VAPID_KEY) {
    console.warn("NEXT_PUBLIC_FIREBASE_VAPID_KEY non défini — push désactivé");
    return null;
  }

  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    if (permission !== "granted") return null;

    // Enregistrer le service worker FCM
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    const m = await getFirebaseMessaging();
    if (!m) return null;

    const token = await m.getToken(m.messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      // Sauvegarder le token dans Firestore (arrayUnion = pas de doublon)
      await updateDoc(doc(db, "usersapp", userFirestoreId), {
        fcm_tokens: arrayUnion(token),
      });
    }

    return token ?? null;
  } catch (err) {
    console.warn("registerPushToken failed:", err);
    return null;
  }
}

// Supprime le token de cet appareil (déconnexion)
export async function unregisterPushToken(userFirestoreId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const m = await getFirebaseMessaging();
    if (!m) return;
    const { deleteToken } = await import("firebase/messaging");
    const token = await m.getToken(m.messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) {
      await deleteToken(m.messaging);
      await updateDoc(doc(db, "usersapp", userFirestoreId), {
        fcm_tokens: arrayRemove(token),
      });
    }
  } catch {
    // Silencieux — la déconnexion ne doit pas bloquer
  }
}

// Écoute les messages FCM quand l'app est au premier plan
export async function onForegroundMessage(handler: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void) {
  const m = await getFirebaseMessaging();
  if (!m) return () => {};
  return m.onMessage(m.messaging, handler);
}

// Envoie un push à un utilisateur cible via l'API serveur
export async function sendPushToUser(params: {
  callerIdToken: string;
  targetUserFirestoreId: string;
  title: string;
  body: string;
  link?: string;
  notifId?: string;
}): Promise<void> {
  try {
    await fetch("/api/send-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.callerIdToken}`,
      },
      body: JSON.stringify({
        targetUserFirestoreId: params.targetUserFirestoreId,
        title: params.title,
        body: params.body,
        link: params.link ?? "/notifications",
        notifId: params.notifId,
      }),
    });
  } catch {
    // Push non bloquant
  }
}
