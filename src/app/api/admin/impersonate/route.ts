import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(idToken);

    const callerSnap = await adminDb.collection("usersapp").doc(decoded.uid).get();
    if (!callerSnap.exists) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const callerRole = callerSnap.data()?.roleapp as string | undefined;
    if (callerRole !== "Admin" && callerRole !== "SuperAdmin") {
      return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
    }

    const { targetUid } = (await req.json()) as { targetUid?: string };
    if (!targetUid) return NextResponse.json({ error: "targetUid manquant" }, { status: 400 });

    // Refuser d'usurper un Admin ou SuperAdmin
    const targetSnap = await adminDb.collection("usersapp").where("uid", "==", targetUid).limit(1).get();
    if (!targetSnap.empty) {
      const targetRole = targetSnap.docs[0].data().roleapp as string | undefined;
      if (targetRole === "Admin" || targetRole === "SuperAdmin") {
        return NextResponse.json({ error: "Impossible de prendre la main sur un compte administrateur" }, { status: 403 });
      }
    }

    const customToken = await adminAuth.createCustomToken(targetUid, {
      impersonatedBy: decoded.uid,
    });

    return NextResponse.json({ token: customToken });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
