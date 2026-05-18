"use client";

// src/app/page.tsx
// Point d'entrée de l'app — redirige vers login ou accueil

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function HomePage() {
  const { firebaseUser, initialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;
    if (firebaseUser) {
      router.replace("/accueil");
    } else {
      router.replace("/login");
    }
  }, [firebaseUser, initialized, router]);

  // Écran de chargement initial
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-secondary-text text-sm">Chargement…</p>
      </div>
    </div>
  );
}
