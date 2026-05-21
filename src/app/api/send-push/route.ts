// src/app/api/send-push/route.ts
// Envoie une notification push FCM à un ou plusieurs utilisateurs via firebase-admin

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getMessaging } from "firebase-admin/messaging";
import { getApps } from "firebase-admin/app";

function getAdminMessaging() {
  const app = getApps()[0];
  if (!app) throw new Error("Firebase Admin non initialisé");
  return getMessaging(app);
}

export async function POST(req: NextRequest) {
  try {
    // Authentifier le demandeur
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.slice(7));

    const body = await req.json() as {
      targetUserFirestoreId: string;
      title: string;
      body: string;
      link?: string;
      notifId?: string;
    };
    const { targetUserFirestoreId, title, body: notifBody, link = "/notifications", notifId } = body;

    if (!targetUserFirestoreId || !title) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Récupérer les tokens FCM de l'utilisateur cible
    const userDoc = await adminDb.collection("usersapp").doc(targetUserFirestoreId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const fcmTokens = (userDoc.data()?.fcm_tokens as string[]) ?? [];
    if (fcmTokens.length === 0) {
      // Pas de token enregistré — push impossible mais pas une erreur
      return NextResponse.json({ success: true, sent: 0, message: "Aucun token FCM enregistré" });
    }

    // Envoyer le push FCM à tous les appareils de l'utilisateur
    const messaging = getAdminMessaging();
    const result = await messaging.sendEachForMulticast({
      tokens: fcmTokens,
      notification: { title, body: notifBody },
      data: { link, notifId: notifId ?? "" },
      webpush: {
        notification: {
          title,
          body: notifBody,
          icon: "/logo-ccm.jpg",
          badge: "/logo-ccm.jpg",
          tag: notifId ?? "ccm-notif",
          renotify: "true",
        },
        fcmOptions: { link },
      },
      android: {
        notification: { icon: "ic_notification", color: "#EE8B60" },
        priority: "high",
      },
      apns: {
        payload: { aps: { badge: 1, sound: "default" } },
      },
    });

    // Nettoyer les tokens invalides
    const invalidTokens: string[] = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (errCode === "messaging/invalid-registration-token" || errCode === "messaging/registration-token-not-registered") {
          invalidTokens.push(fcmTokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const cleanedTokens = fcmTokens.filter(t => !invalidTokens.includes(t));
      await adminDb.collection("usersapp").doc(targetUserFirestoreId).update({ fcm_tokens: cleanedTokens });
    }

    return NextResponse.json({
      success: true,
      sent: result.successCount,
      failed: result.failureCount,
    });
  } catch (err) {
    console.error("send-push error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
