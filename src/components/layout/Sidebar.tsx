"use client";

// src/components/layout/Sidebar.tsx

import { useRouter, usePathname } from "next/navigation";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/authStore";
import { cn, getInitials } from "@/lib/utils";
import {
  LayoutDashboard, Home, Users, UsersRound, FileText,
  BookOpen, MessageCircle, Bell, LogOut, ChevronDown, CalendarPlus,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface NavItem {
  label: string; icon: React.ReactNode; href: string; page: string;
  adminOnly?: boolean; superAdminOnly?: boolean; badge?: number;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { userApp, logout, pageActuelle, setPageActuelle,
    notificationsNonLues, messagesNonLus, journalInterneNonLu } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navItems: NavItem[] = [
    { label: "Accueil", icon: <Home size={18} />, href: "/accueil", page: "Accueil" },
    { label: "Tableau de bord", icon: <LayoutDashboard size={18} />, href: "/dashboard", page: "DashBoard" },
    { label: "Affecter un planning", icon: <CalendarPlus size={18} />, href: "/affectation-planning", page: "Affecter planning", adminOnly: true },
    { label: "Liste utilisateurs", icon: <Users size={18} />, href: "/utilisateurs", page: "Liste utilisateurs", adminOnly: true },
    { label: "Acteurs chantiers", icon: <UsersRound size={18} />, href: "/acteurs", page: "Acteurs chantiers", adminOnly: true },
    { label: "Documents", icon: <FileText size={18} />, href: "/feuilles-heures", page: "Fiches heures" },
    { label: "Journal interne", icon: <BookOpen size={18} />, href: "/journal-interne", page: "Journal interne", badge: journalInterneNonLu },
    { label: "Messagerie", icon: <MessageCircle size={18} />, href: "/messagerie", page: "Messagerie", badge: messagesNonLus },
    { label: "Notifications", icon: <Bell size={18} />, href: "/notifications", page: "Notifications", badge: notificationsNonLues },
  ];

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    toast.success("Déconnecté avec succès");
    router.replace("/login");
  };

  const filteredItems = navItems.filter(item => {
    if (item.superAdminOnly && !isSuperAdmin(userApp)) return false;
    if (item.adminOnly && !isAdmin(userApp)) return false;
    return true;
  });

  return (
    <aside className="hidden lg:flex flex-col w-[270px] h-screen bg-primary-bg border-r border-alternate shadow-sidebar shrink-0 sticky top-0">
      {/* Header avec logo */}
      <div className="px-4 pt-5 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-alternate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-ccm.jpg" alt="CCM" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-primary-text text-sm leading-tight">Climat & Confort</p>
            <p className="text-xs text-secondary-text">Moreau</p>
          </div>
        </div>
      </div>

      {/* Profil */}
      <div className="mx-3 mb-3 p-3 rounded-xl bg-white border border-alternate shadow-sm cursor-pointer hover:shadow-md transition-all shrink-0"
        onClick={() => { setPageActuelle("Mon Profil"); router.push("/profil"); }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            {userApp?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userApp.photoUrl} alt="avatar" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{getInitials(userApp?.nom ?? "U", userApp?.prenom)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-text truncate">{userApp?.prenom} {userApp?.nom}</p>
            <p className="text-xs text-secondary-text truncate">{userApp?.roleapp ?? "Utilisateur"}</p>
          </div>
          <ChevronDown size={14} className="text-secondary-text shrink-0" />
        </div>
      </div>

      {/* Navigation scrollable */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto min-h-0">
        {filteredItems.map(item => {
          const isActive = pageActuelle === item.page || pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <button key={item.href} onClick={() => { setPageActuelle(item.page); router.push(item.href); }}
              className={cn("sidebar-link w-full text-left", isActive && "active")}>
              <span className={cn("shrink-0", isActive ? "text-primary" : "text-secondary-text")}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="bg-error text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 notif-pulse">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Déconnexion — toujours visible en bas */}
      <div className="px-3 pb-4 pt-2 border-t border-alternate shrink-0">
        {!showLogoutConfirm ? (
          <button onClick={() => setShowLogoutConfirm(true)}
            className="sidebar-link w-full text-left text-error hover:text-error hover:bg-red-50">
            <LogOut size={18} /><span>Déconnexion</span>
          </button>
        ) : (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200">
            <p className="text-sm font-medium text-red-800 mb-2">Confirmer la déconnexion ?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 text-xs py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition-colors">Annuler</button>
              <button onClick={handleLogout} className="flex-1 text-xs py-1.5 rounded-lg bg-error text-white hover:bg-red-600 transition-colors font-semibold">Confirmer</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

