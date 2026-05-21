"use client";

// src/components/layout/BottomNav.tsx
// Équivalent de nav_bar_tel_widget.dart

import { useRouter, usePathname } from "next/navigation";
import { useAuthStore, canViewDashboard } from "@/store/authStore";
import { cn } from "@/lib/utils";
import {
  Home,
  LayoutDashboard,
  FileText,
  MessageCircle,
  Bell,
} from "lucide-react";

export function BottomNav() {
  const router = useRouter();
  const { notificationsNonLues, messagesNonLus, userApp } = useAuthStore();
  const pathname = usePathname();

  const items = [
    { label: "Accueil", icon: <Home size={20} />, href: "/accueil", badge: undefined },
    ...(canViewDashboard(userApp) ? [{ label: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard", badge: undefined }] : []),
    { label: "Fiches", icon: <FileText size={20} />, href: "/feuilles-heures", badge: undefined },
    { label: "Messages", icon: <MessageCircle size={20} />, href: "/messagerie", badge: messagesNonLus },
    { label: "Notifs", icon: <Bell size={20} />, href: "/notifications", badge: notificationsNonLues },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary-bg border-t border-alternate shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
              }}
              className="relative flex flex-col items-center gap-1 flex-1 py-2"
            >
              <span
                className={cn(
                  "transition-colors duration-200",
                  isActive ? "text-primary" : "text-secondary-text"
                )}
              >
                {item.icon}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-200",
                  isActive ? "text-primary" : "text-secondary-text"
                )}
              >
                {item.label}
              </span>
              {/* Badge */}
              {item.badge && item.badge > 0 ? (
                <span className="absolute top-1 right-[calc(50%-18px)] bg-error text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
              {/* Active indicator */}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
