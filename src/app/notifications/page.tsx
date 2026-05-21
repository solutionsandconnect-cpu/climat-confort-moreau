"use client";

// src/app/notifications/page.tsx
// Équivalent de notifications_widget.dart
// 3 onglets : Non lues / Lues / Toutes

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
  Bell,
  BellOff,
  CheckCheck,
  Circle,
  ChevronRight,
  LayoutDashboard,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

type TabType = "nonlues" | "lues" | "toutes";

// ============================================
// Composant : Carte notification
// ============================================
function NotifCard({
  item,
  onRead,
}: {
  item: NotificationItem;
  onRead?: () => void;
}) {
  const isNonLue = item.etatNotification === "Non lue";

  return (
    <div
      className={cn(
        "card p-4 transition-all duration-200",
        isNonLue
          ? "border-primary/30 bg-primary/5 cursor-pointer hover:shadow-card-hover"
          : "opacity-80"
      )}
      onClick={isNonLue ? onRead : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Icône état */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
            isNonLue ? "bg-primary/15" : "bg-alternate"
          )}
        >
          {isNonLue ? (
            <Circle size={14} className="text-primary fill-primary" />
          ) : (
            <Bell size={14} className="text-secondary-text" />
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {item.typeNotification && (
            <p
              className={cn(
                "text-sm font-semibold mb-0.5",
                isNonLue ? "text-primary" : "text-primary-text"
              )}
            >
              {item.typeNotification}
            </p>
          )}
          <p className="text-sm text-primary-text leading-relaxed">
            {item.notification || "Pas de contenu"}
          </p>
          <p className="text-xs text-secondary-text mt-1.5">
            {formatDateRelative(item.dateDeclenchement ?? item.dateCreate)}
          </p>
          {item.dateLecture && (
            <p className="text-xs text-secondary-text">
              Lu le {formatDateRelative(item.dateLecture)}
            </p>
          )}
        </div>

        {/* Flèche si non lue */}
        {isNonLue && (
          <ChevronRight size={16} className="text-primary shrink-0 mt-1" />
        )}
      </div>
    </div>
  );
}

// ============================================
// Page principale
// ============================================
export default function NotificationsPage() {
  const router = useRouter();
  const { firebaseUser, setNotificationsNonLues } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabType>("nonlues");
  const [nonLues, setNonLues] = useState<NotificationItem[]>([]);
  const [lues, setLues] = useState<NotificationItem[]>([]);
  const [toutes, setToutes] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);

    setLoading(true);
    const unsubNL = subscribeNotificationsNonLues(userRef, (items) => {
      setNonLues(items);
      setNotificationsNonLues(items.length);
      setLoading(false);
    });
    const unsubL = subscribeNotificationsLues(userRef, setLues);
    const unsubA = subscribeAllNotifications(userRef, setToutes);

    return () => {
      unsubNL();
      unsubL();
      unsubA();
    };
  }, [firebaseUser, setNotificationsNonLues]);

  // Clic sur une notification non lue : demande confirmation
  const handleNotifClick = (item: NotificationItem) => {
    setConfirmId(item.id);
  };

  const handleConfirmRead = async (item: NotificationItem) => {
    setConfirmId(null);
    await marquerNotificationLue(item.id);
    toast.success("Notification marquée comme lue");

    // Navigation vers la page liée
    if (item.allerVersPage === "Dashboard") {
      router.push("/dashboard");
    } else if (item.allerVersPage === "Listes Utilisateurs") {
      router.push("/utilisateurs");
    } else if (item.allerVersPage === "Intervention" && item.planningId) {
      router.push(`/interventions/${item.planningId}`);
    }
  };

  const handleMarquerToutes = async () => {
    if (!firebaseUser) return;
    setMarkingAll(true);
    try {
      const userRef = doc(db, "usersapp", firebaseUser.uid);
      await marquerToutesLues(userRef);
      toast.success("Toutes les notifications marquées comme lues");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setMarkingAll(false);
    }
  };

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "nonlues", label: "Non lues", count: nonLues.length },
    { key: "lues", label: "Lues" },
    { key: "toutes", label: "Toutes", count: toutes.length },
  ];

  const currentList =
    activeTab === "nonlues"
      ? nonLues
      : activeTab === "lues"
      ? lues
      : toutes;

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1
              className="text-2xl font-bold text-primary-text"
              style={{ fontFamily: "var(--font-inter-tight)" }}
            >
              Notifications
            </h1>
            {nonLues.length > 0 && (
              <p className="text-sm text-secondary-text mt-0.5">
                {nonLues.length} non lue{nonLues.length > 1 ? "s" : ""}
              </p>
            )}
          </div>

          {nonLues.length > 0 && (
            <button
              onClick={handleMarquerToutes}
              disabled={markingAll}
              className="btn-outline flex items-center gap-2 text-sm"
            >
              {markingAll ? <Spinner size="sm" /> : <CheckCheck size={15} />}
              Tout marquer lu
            </button>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-1 bg-primary-bg border border-alternate rounded-xl p-1 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5",
                activeTab === tab.key
                  ? "bg-white text-primary shadow-sm"
                  : "text-secondary-text hover:text-primary-text"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full font-bold",
                    activeTab === tab.key
                      ? tab.key === "nonlues"
                        ? "bg-error text-white"
                        : "bg-primary/10 text-primary"
                      : "bg-alternate text-secondary-text"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        {currentList.length === 0 ? (
          <EmptyState
            icon={
              activeTab === "nonlues" ? (
                <BellOff size={28} />
              ) : (
                <Bell size={28} />
              )
            }
            title={
              activeTab === "nonlues"
                ? "Aucune notification non lue"
                : activeTab === "lues"
                ? "Aucune notification lue"
                : "Aucune notification"
            }
            description={
              activeTab === "nonlues"
                ? "Vous êtes à jour ! Toutes vos notifications ont été lues."
                : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {currentList.map((item) => (
              <div key={item.id}>
                <NotifCard
                  item={item}
                  onRead={() => handleNotifClick(item)}
                />

                {/* Modal de confirmation inline */}
                {confirmId === item.id && (
                  <div className="mt-1 p-3.5 rounded-xl bg-primary/5 border border-primary/20 animate-slide-up">
                    <p className="text-sm font-medium text-primary-text mb-3">
                      Marquer cette notification comme lue ?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmId(null)}
                        className="flex-1 text-sm py-1.5 rounded-lg border border-alternate text-secondary-text hover:bg-alternate transition-colors"
                      >
                        Laisser en non lue
                      </button>
                      <button
                        onClick={() => handleConfirmRead(item)}
                        className="flex-1 text-sm py-1.5 rounded-lg bg-primary text-white hover:bg-primary-600 transition-colors font-semibold"
                      >
                        Confirmer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
