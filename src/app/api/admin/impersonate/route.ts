export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);

    const callerQuery = await getAdminDb().collection("usersapp").where("uid", "==", decoded.uid).limit(1).get();
    if (callerQuery.empty) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const callerRole = callerQuery.docs[0].data()?.roleapp as string | undefined;
    if (callerRole !== "Admin" && callerRole !== "SuperAdmin") {
      return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
    }

    const { targetUid } = (await req.json()) as { targetUid?: string };
    if (!targetUid) return NextResponse.json({ error: "targetUid manquant" }, { status: 400 });

    // Refuser d'usurper un Admin ou SuperAdmin
    const targetSnap = await getAdminDb().collection("usersapp").where("uid", "==", targetUid).limit(1).get();
    if (!targetSnap.empty) {
      const targetRole = targetSnap.docs[0].data().roleapp as string | undefined;
      if (targetRole === "Admin" || targetRole === "SuperAdmin") {
        return NextResponse.json({ error: "Impossible de prendre la main sur un compte administrateur" }, { status: 403 });
      }
    }

    const [customToken, adminCustomToken] = await Promise.all([
      getAdminAuth().createCustomToken(targetUid, { impersonatedBy: decoded.uid }),
      getAdminAuth().createCustomToken(decoded.uid),
    ]);

    return NextResponse.json({ token: customToken, adminToken: adminCustomToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[impersonate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
