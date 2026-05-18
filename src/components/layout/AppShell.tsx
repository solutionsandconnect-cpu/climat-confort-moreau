"use client";

// src/components/layout/AppShell.tsx
// Layout protégé : sidebar + contenu + nav mobile
// À utiliser pour toutes les pages qui nécessitent d'être connecté

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const { firebaseUser, initialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !firebaseUser) {
      router.replace("/login");
    }
  }, [firebaseUser, initialized, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-bg">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  return (
    <div className="flex min-h-screen bg-primary-bg">
      {/* Sidebar desktop */}
      <Sidebar />

      {/* Contenu principal */}
      <main
        className={cn(
          "flex-1 min-h-screen overflow-x-hidden",
          "pb-20 lg:pb-6", // padding bas pour la nav mobile
          className
        )}
      >
        {children}
      </main>

      {/* Bottom nav mobile */}
      <BottomNav />
    </div>
  );
}
