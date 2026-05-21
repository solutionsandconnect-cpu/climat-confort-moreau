// src/app/api/admin/delete-user/route.ts
// Route API serveur — supprime un compte Firebase Auth + Firestore
// Accessible uniquement aux Admin et SuperAdmin authentifiés

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    // 1. Vérifier le token du demandeur
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    // 2. Vérifier que le demandeur est Admin ou SuperAdmin
    const callerSnap = await adminDb
      .collection("usersapp")
      .where("uid", "==", callerUid)
      .limit(1)
      .get();
    if (callerSnap.empty) {
      return NextResponse.json({ error: "Compte demandeur introuvable" }, { status: 403 });
    }
    const callerRole = callerSnap.docs[0].data().roleapp as string | undefined;
    if (callerRole !== "Admin" && callerRole !== "SuperAdmin") {
      return NextResponse.json({ error: "Accès refusé — rôle insuffisant" }, { status: 403 });
    }

    // 3. Récupérer l'uid cible
    const body = await req.json() as { uid?: string; firestoreId?: string };
    const { uid, firestoreId } = body;
    if (!uid) {
      return NextResponse.json({ error: "uid manquant" }, { status: 400 });
    }

    // 4. Supprimer le compte Firebase Auth
    try {
      await adminAuth.deleteUser(uid);
    } catch (e: unknown) {
      const err = e as { code?: string };
      // Si l'utilisateur Auth n'existe pas, on continue quand même
      if (err?.code !== "auth/user-not-found") {
        throw e;
      }
    }

    // 5. Supprimer le document Firestore (si firestoreId fourni)
    if (firestoreId) {
      await adminDb.collection("usersapp").doc(firestoreId).delete();
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("delete-user API error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
