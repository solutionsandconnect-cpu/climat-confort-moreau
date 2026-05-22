"use client";

// src/app/notifications/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import {
  subscribeNotificationsNonLues,
  subscribeNotificationsLues,
  subscribeAllNotifications,
  marquerNotificationLue,
  marquerToutesLues,
  type NotificationItem,
} from "@/lib/notifMessagerieService";
import { EmptyState, LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDateRelative } from "@/lib/utils";
import {
  Bell, BellOff, CheckCheck, Phone, Mail, Calendar,
  AlertTriangle, FileText, Wrench, Users,
} from "lucide-react";
import toast from "react-hot-toast";

type TabType = "nonlues" | "lues" | "toutes";

// ── Icône dynamique selon le type de notification ────────────────────────────
function NotifIcon({ item, isNonLue }: { item: NotificationItem; isNonLue: boolean }) {
  const cls = cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", isNonLue ? "bg-primary/15" : "bg-alternate");
  const iconCls = isNonLue ? "text-primary" : "text-secondary-text";

  const type = (item.typeNotification ?? "").toLowerCase();
  const action = item.workflowAction ?? "";

  if (action === "relance_appel" || type.includes("appel") || type.includes("téléphone") || type.includes("relance téléph")) {
    return <div className={cls}><Phone size={15} className={iconCls} /></div>;
  }
  if (action === "relance_mail_manuel" || action === "relance_mail_auto" || type.includes("email") || type.includes("mail")) {
    return <div className={cls}><Mail size={15} className={iconCls} /></div>;
  }
  if (type.includes("rendez") || type.includes("planning") || type.includes("rdv")) {
    return <div className={cls}><Calendar size={15} className={iconCls} /></div>;
  }
  if (type.includes("intervention") || type.includes("travaux")) {
    return <div className={cls}><Wrench size={15} className={iconCls} /></div>;
  }
  if (type.includes("document") || type.includes("fiche")) {
    return <div className={cls}><FileText size={15} className={iconCls} /></div>;
  }
  if (type.includes("utilisateur") || type.includes("account")) {
    return <div className={cls}><Users size={15} className={iconCls} /></div>;
  }
  if (type.includes("alerte") || type.includes("urgent")) {
    return <div className={cls}><AlertTriangle size={15} className={iconCls} /></div>;
  }
  return <div className={cls}><Bell size={14} className={iconCls} /></div>;
}

// ── Carte notification ────────────────────────────────────────────────────────
function NotifCard({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  const isNonLue = item.etatNotification === "Non lue";

  return (
    <div
      className={cn(
        "card p-4 transition-all duration-200 cursor-pointer",
        isNonLue ? "border-primary/30 bg-primary/5 hover:shadow-card-hover" : "opacity-80 hover:opacity-100"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <NotifIcon item={item} isNonLue={isNonLue} />

        <div className="flex-1 min-w-0">
          {item.typeNotification && (
            <p className={cn("text-sm font-semibold mb-0.5", isNonLue ? "text-primary" : "text-primary-text")}>
              {item.typeNotification}
            </p>
          )}
          <p className="text-sm text-primary-text leading-relaxed">{item.notification || "Pas de contenu"}</p>
          <p className="text-xs text-secondary-text mt-1.5">
            {formatDateRelative(item.dateDeclenchement ?? item.dateCreate)}
          </p>
          {item.dateLecture && (
            <p className="text-xs text-secondary-text">Lu le {formatDateRelative(item.dateLecture)}</p>
          )}
        </div>

        {isNonLue && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const router = useRouter();
  const { firebaseUser, setNotificationsNonLues } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabType>("nonlues");
  const [nonLues, setNonLues] = useState<NotificationItem[]>([]);
  const [lues, setLues] = useState<NotificationItem[]>([]);
  const [toutes, setToutes] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    setLoading(true);
    const unsubNL = subscribeNotificationsNonLues(userRef, items => {
      setNonLues(items);
      setNotificationsNonLues(items.length);
      setLoading(false);
    });
    const unsubL = subscribeNotificationsLues(userRef, setLues);
    // "Toutes" : seulement les notifs dont la date de déclenchement est passée
    const unsubA = subscribeAllNotifications(userRef, items => {
      const now = new Date();
      setToutes(items.filter(n => !n.dateDeclenchement || n.dateDeclenchement <= now));
    });
    return () => { unsubNL(); unsubL(); unsubA(); };
  }, [firebaseUser, setNotificationsNonLues]);

  const navigate = (item: NotificationItem) => {
    const page = item.allerVersPage ?? "";
    if (page === "Dashboard") { router.push("/dashboard"); return; }
    if (page === "Listes Utilisateurs") { router.push("/utilisateurs"); return; }
    if (page === "Intervention" && item.planningId) { router.push(`/interventions/${item.planningId}`); return; }
  };

  const handleClick = async (item: NotificationItem) => {
    // Marquer comme lue en arrière-plan si non lue
    if (item.etatNotification === "Non lue") {
      marquerNotificationLue(item.id).catch(() => {});
    }
    navigate(item);
  };

  const handleMarquerToutes = async () => {
    if (!firebaseUser) return;
    setMarkingAll(true);
    try {
      await marquerToutesLues(doc(db, "usersapp", firebaseUser.uid));
      toast.success("Toutes les notifications marquées comme lues");
    } catch { toast.error("Erreur lors de la mise à jour"); }
    finally { setMarkingAll(false); }
  };

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "nonlues", label: "Non lues", count: nonLues.length },
    { key: "lues", label: "Lues" },
    { key: "toutes", label: "Toutes", count: toutes.length },
  ];

  const currentList = activeTab === "nonlues" ? nonLues : activeTab === "lues" ? lues : toutes;

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Notifications</h1>
            {nonLues.length > 0 && <p className="text-sm text-secondary-text mt-0.5">{nonLues.length} non lue{nonLues.length > 1 ? "s" : ""}</p>}
          </div>
          {nonLues.length > 0 && (
            <button onClick={handleMarquerToutes} disabled={markingAll} className="btn-outline flex items-center gap-2 text-sm">
              {markingAll ? <Spinner size="sm" /> : <CheckCheck size={15} />}Tout marquer lu
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-primary-bg border border-alternate rounded-xl p-1 mb-4">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn("flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5",
                activeTab === tab.key ? "bg-white text-primary shadow-sm" : "text-secondary-text hover:text-primary-text")}>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === tab.key
                    ? tab.key === "nonlues" ? "bg-error text-white" : "bg-primary/10 text-primary"
                    : "bg-alternate text-secondary-text")}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {currentList.length === 0 ? (
          <EmptyState
            icon={activeTab === "nonlues" ? <BellOff size={28} /> : <Bell size={28} />}
            title={activeTab === "nonlues" ? "Aucune notification non lue" : activeTab === "lues" ? "Aucune notification lue" : "Aucune notification"}
            description={activeTab === "nonlues" ? "Vous êtes à jour ! Toutes vos notifications ont été lues." : undefined}
          />
        ) : (
          <div className="space-y-2">
            {currentList.map(item => (
              <NotifCard key={item.id} item={item} onClick={() => handleClick(item)} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
