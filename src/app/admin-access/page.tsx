"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserApp } from "@/lib/firestore";
import { useAuthStore } from "@/store/authStore";
import { LoadingPage } from "@/components/ui";
import { ShieldAlert } from "lucide-react";

function AdminAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setError("Token d'accès manquant."); return; }

    (async () => {
      try {
        const cred = await signInWithCustomToken(auth, token);
        const userApp = await getUserApp(cred.user.uid);
        useAuthStore.setState({ firebaseUser: cred.user, userApp, loading: false, error: null, isImpersonating: true });
        router.replace("/accueil");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Échec de connexion (${msg}). Vérifiez que le lien est valide et non expiré.`);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <ShieldAlert size={28} className="text-error" />
        </div>
        <p className="text-lg font-bold text-primary-text">Accès impossible</p>
        <p className="text-sm text-secondary-text max-w-sm">{error}</p>
        <button onClick={() => router.replace("/login")} className="btn-outline mt-2">
          Retour à la connexion
        </button>
      </div>
    );
  }

  return <LoadingPage />;
}

export default function AdminAccessPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <AdminAccessContent />
    </Suspense>
  );
}
