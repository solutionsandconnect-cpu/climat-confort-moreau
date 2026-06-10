"use client";

// src/components/layout/AppShell.tsx
// Layout protégé : sidebar + contenu + nav mobile
// À utiliser pour toutes les pages qui nécessitent d'être connecté

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { MonitorSmartphone, X } from "lucide-react";
import { collection, query, where, onSnapshot, doc, getDocs, updateDoc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import type { DocumentReference } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/authStore";
import { subscribeNotificationsNonLues } from "@/lib/notifMessagerieService";
import { registerPushToken, onForegroundMessage } from "@/lib/pushService";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  noPadBottom?: boolean;
  hideNav?: boolean;
}

export function AppShell({ children, className, noPadBottom, hideNav }: AppShellProps) {
  const { firebaseUser, userApp, initialized, isImpersonating, logout, setMessagesNonLus, setNotificationsNonLues, setJournalInterneNonLu } = useAuthStore();
  const router = useRouter();
  const [impersonationInfo, setImpersonationInfo] = useState<{ adminName: string; targetName: string } | null>(null);

  const msgDestCount = useRef(0);
  const msgCreatCount = useRef(0);
  const msgGroupCount = useRef(0);

  useEffect(() => {
    if (initialized && !firebaseUser) {
      router.replace("/login");
    }
  }, [firebaseUser, initialized, router]);

  // Lecture et persistance du mode impersonation depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tc_impersonation");
      if (raw) {
        const data = JSON.parse(raw) as { adminName: string; targetName: string; adminToken: string };
        setImpersonationInfo(data);
        if (!isImpersonating) useAuthStore.setState({ isImpersonating: true });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to unread messages (ancien format 1-à-1 + nouveau format groupes)
  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const userId = userApp?.id ?? firebaseUser.uid;
    const total = () => setMessagesNonLus(msgDestCount.current + msgCreatCount.current + msgGroupCount.current);

    const unsubDest = onSnapshot(
      query(collection(db, "messagerie"), where("user_destinataire", "==", userRef), where("etat_message_destinataire", "==", false)),
      snap => { msgDestCount.current = snap.size; total(); }
    );
    const unsubCreat = onSnapshot(
      query(collection(db, "messagerie"), where("user_create", "==", userRef), where("etat_message_expediteur", "==", false)),
      snap => { msgCreatCount.current = snap.size; total(); }
    );
    const unsubGroup = onSnapshot(
      query(collection(db, "messagerie"), where("non_lus_ids", "array-contains", userId)),
      snap => { msgGroupCount.current = snap.size; total(); },
      () => {}
    );

    return () => { unsubDest(); unsubCreat(); unsubGroup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, userApp?.id]);

  // Subscribe to unread journal items
  useEffect(() => {
    if (!firebaseUser) return;
    const myService = userApp?.service;
    const myType = userApp?.type;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const unsub = onSnapshot(query(collection(db, "Journal_interne"), orderBy("date_create", "desc"), limit(100)), async snap => {
      let count = 0;
      await Promise.all(snap.docs.map(async d => {
        const listeNomEnvoi = (d.data().liste_nom_envoi as string[]) ?? [];
        const isRecipient = listeNomEnvoi.some(s => s === myService || s === myType);
        if (!isRecipient) return;
        const lectureSnap = await getDocs(query(
          collection(db, "Journal_interne", d.id, "lecture_document_journal_interne"),
          where("user_lu", "==", userRef), limit(1)
        ));
        if (lectureSnap.empty) count++;
      }));
      setJournalInterneNonLu(count);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, userApp?.service, userApp?.type]);

  // Subscribe to unread notifications
  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const unsub = subscribeNotificationsNonLues(userRef, items => {
      setNotificationsNonLues(items.length);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid]);

  // Mise à jour last_login à chaque visite (sauf impersonation)
  useEffect(() => {
    if (!firebaseUser || !userApp) return;
    if (isImpersonating) return;
    updateDoc(doc(db, "usersapp", userApp.id), { last_login: serverTimestamp() }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid]);

  // Initialiser les push notifications FCM
  useEffect(() => {
    if (!firebaseUser || !userApp) return;
    // Enregistrement token push (demande permission si pas encore accordée)
    registerPushToken(userApp.id).catch(() => {});

    // Messages FCM reçus quand l'app est au premier plan
    let unsubFCM: (() => void) | undefined;
    onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? "Notification";
      const body = payload.notification?.body ?? "";
      toast(body ? `${title} — ${body}` : title, { icon: "🔔", duration: 5000 });
    }).then(unsub => { unsubFCM = unsub as (() => void) | undefined; });

    return () => { unsubFCM?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, userApp?.id]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-bg">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  return (
    <div className={cn("flex bg-primary-bg", noPadBottom ? "h-[100dvh] overflow-hidden" : "min-h-screen")}>
      {/* Sidebar desktop */}
      <Sidebar />

      {/* Contenu principal */}
      <main
        className={cn(
          "flex-1 overflow-x-hidden",
          noPadBottom
            ? "flex flex-col overflow-hidden"
            : "min-h-screen pb-20 lg:pb-6",
          className
        )}
      >
        {/* Bannière impersonation */}
        {impersonationInfo && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium">
            <MonitorSmartphone size={14} className="shrink-0 text-amber-600" />
            <span className="flex-1">
              Session de <span className="font-bold">{impersonationInfo.adminName}</span> — vous consultez le compte de <span className="font-bold">{impersonationInfo.targetName}</span>
            </span>
            <button
              onClick={async () => {
                const raw = localStorage.getItem("tc_impersonation");
                const adminToken = raw ? (JSON.parse(raw) as { adminToken?: string }).adminToken : undefined;
                localStorage.removeItem("tc_impersonation");
                setImpersonationInfo(null);
                if (adminToken) {
                  try {
                    await signInWithCustomToken(auth, adminToken);
                    router.replace("/accueil");
                    return;
                  } catch {
                    // token expiré (>1h) → déconnexion classique
                  }
                }
                await logout();
                router.replace("/login");
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold transition-colors shrink-0"
            >
              <X size={12} /> Quitter
            </button>
          </div>
        )}
        {children}
      </main>

      {/* Bottom nav mobile — masquée sur les pages plein-écran (chat, etc.) */}
      {!hideNav && <BottomNav />}
    </div>
  );
}
