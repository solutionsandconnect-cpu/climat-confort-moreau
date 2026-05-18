"use client";

// src/components/layout/AuthProvider.tsx
// Équivalent de main.dart + FirebaseUserProvider de Flutter

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    const unsubscribe = initAuth();
    return unsubscribe;
  }, [initAuth]);

  return <>{children}</>;
}
