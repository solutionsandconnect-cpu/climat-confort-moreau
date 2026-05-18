"use client";

// src/app/accueil/page.tsx
// Équivalent de accueil_widget.dart
// Calendrier hebdomadaire + liste des interventions du jour

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import {
  subscribePlanningByDate,
  deletePlanning,
  getTechnicienNom,
  type PlanningItem,
} from "@/lib/planningService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, addDays, startOfWeek, isSameDay, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { LoadingPage, EmptyState, Spinner } from "@/components/ui";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Trash2,
  FileText,
  Calendar,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

// ============================================
// Composant : Carte d'une intervention
// ============================================

function PlanningCard({
  item,
  canDelete,
  onDelete,
  onClick,
}: {
  item: PlanningItem;
  canDelete: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const heureDebut = item.heureRdv
    ? format(item.heureRdv, "HH:mm")
    : "—";
  const heureFin = item.heureFinRdv
    ? format(item.heureFinRdv, "HH:mm")
    : "—";

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow duration-200">
      {/* Bande colorée en haut */}
      <div className="h-1 bg-primary" />
      <div className="p-4">
        {/* Heure */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-badge">
              <Clock size={13} />
              <span className="text-sm font-bold">
                {heureDebut} – {heureFin}
              </span>
            </div>
            {item.statutRdv && (
              <span
                className={cn(
                  "badge border",
                  item.statutRdv === "Réalisé"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : item.statutRdv === "Annulé"
                    ? "bg-red-100 text-red-700 border-red-200"
                    : "bg-yellow-100 text-yellow-800 border-yellow-200"
                )}
              >
                {item.statutRdv}
              </span>
            )}
          </div>

          {/* Supprimer (si affectation planning + admin) */}
          {canDelete && item.affectationPlanning === "Oui" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all duration-200"
              title="Supprimer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {/* Descriptif */}
        <div
          className="bg-primary-bg rounded-lg p-3 mb-3 cursor-pointer hover:bg-alternate/60 transition-colors"
          onClick={onClick}
        >
          <p className="text-sm text-primary-text leading-relaxed">
            {item.descriptifTravaux || (
              <span className="text-secondary-text italic">
                Descriptif non indiqué
              </span>
            )}
          </p>
        </div>

        {/* Technicien */}
        {item.technicienNom && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-secondary/10 text-secondary-600 px-3 py-1.5 rounded-lg text-xs font-medium">
              <User size={13} />
              <span>{item.technicienNom}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Composant : Calendrier hebdomadaire
// ============================================

function WeekCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

  const monthLabel = format(weekStart, "MMMM yyyy", { locale: fr });

  return (
    <div className="card p-4 mb-5">
      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-primary-text capitalize">
          {monthLabel}
        </span>
        <button
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Jours de la semaine */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all duration-200",
                isSelected
                  ? "bg-primary text-white shadow-sm"
                  : isTodayDay
                  ? "bg-secondary/15 text-secondary-600"
                  : "hover:bg-primary-bg text-secondary-text hover:text-primary-text"
              )}
            >
              <span className="text-[10px] font-semibold uppercase">
                {DAY_LABELS[i]}
              </span>
              <span
                className={cn(
                  "text-sm font-bold",
                  isSelected ? "text-white" : ""
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Page principale
// ============================================

export default function AccueilPage() {
  const router = useRouter();
  const { userApp, firebaseUser, setNotificationsNonLues } = useAuthStore();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [plannings, setPlannings] = useState<PlanningItem[]>([]);
  const [loadingPlannings, setLoadingPlannings] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canSeeAll =
    userApp?.roleapp === "Admin" ||
    userApp?.roleapp === "SuperAdmin" ||
    userApp?.type === "Conducteur de Travaux" ||
    userApp?.type === "Service SAV / Expertises" ||
    userApp?.type === "Bureau Administratif";

  // ============================================
  // Mise à jour last_login au chargement
  // ============================================

  useEffect(() => {
    if (firebaseUser) {
      const userRef = doc(db, "usersapp", firebaseUser.uid);
      updateDoc(userRef, { last_login: new Date() }).catch(() => {});
    }
  }, [firebaseUser]);

  // ============================================
  // Souscription planning par date
  // ============================================

  useEffect(() => {
    setLoadingPlannings(true);
    const unsub = subscribePlanningByDate(selectedDate, async (items) => {
      // Résoudre les noms des techniciens
      const withNames = await Promise.all(
        items.map(async (item) => {
          if (item.refUsers) {
            const nom = await getTechnicienNom(item.refUsers);
            return { ...item, technicienNom: nom };
          }
          return item;
        })
      );

      // Filtrer selon le rôle
      const filtered = canSeeAll
        ? withNames
        : withNames.filter(
            (p) => p.refUsers?.id === firebaseUser?.uid
          );

      setPlannings(filtered);
      setLoadingPlannings(false);
    });
    return () => unsub();
  }, [selectedDate, canSeeAll, firebaseUser?.uid]);

  // ============================================
  // Suppression
  // ============================================

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette intervention ?")) return;
    setDeletingId(id);
    try {
      await deletePlanning(id);
      toast.success("Intervention supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================
  // Libellé de la date sélectionnée
  // ============================================

  const dateLabel = isToday(selectedDate)
    ? `Aujourd'hui — ${format(selectedDate, "dd MMMM yyyy", { locale: fr })}`
    : format(selectedDate, "EEEE dd MMMM yyyy", { locale: fr });

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1
              className="text-2xl font-bold text-primary-text"
              style={{ fontFamily: "var(--font-inter-tight)" }}
            >
              Accueil
            </h1>
            <p className="text-sm text-secondary-text mt-0.5 capitalize">
              {dateLabel}
            </p>
          </div>

          {/* Bouton Documents (mobile, admin) */}
          <div className="flex items-center gap-2 lg:hidden">
            {isAdmin(userApp) && (
              <button
                onClick={() => router.push("/utilisateurs")}
                className="btn-primary p-2"
                title="Utilisateurs"
              >
                <User size={18} />
              </button>
            )}
            <button
              onClick={() => router.push("/feuilles-heures")}
              className="btn-outline flex items-center gap-2 text-sm px-3 py-2"
            >
              <FileText size={16} />
              Documents
            </button>
          </div>
        </div>

        {/* Calendrier hebdomadaire */}
        <WeekCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* Séparateur */}
        <div className="flex items-center gap-3 mb-4">
          <Calendar size={16} className="text-primary shrink-0" />
          <h2 className="text-sm font-bold text-primary-text">
            Interventions du jour
          </h2>
          <div className="flex-1 h-px bg-alternate" />
          {!loadingPlannings && (
            <span className="text-xs text-secondary-text bg-alternate px-2 py-0.5 rounded-full">
              {plannings.length} intervention{plannings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Liste des interventions */}
        {loadingPlannings ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : plannings.length === 0 ? (
          <EmptyState
            icon={<Calendar size={28} />}
            title="Aucune intervention ce jour"
            description="Sélectionne une autre date ou ajoute une intervention depuis le planning."
          />
        ) : (
          <div className="space-y-3">
            {plannings.map((item) => (
              <div key={item.id} className="relative">
                {deletingId === item.id && (
                  <div className="absolute inset-0 bg-white/70 rounded-card flex items-center justify-center z-10">
                    <Spinner />
                  </div>
                )}
                <PlanningCard
                  item={item}
                  canDelete={isAdmin(userApp)}
                  onDelete={() => handleDelete(item.id)}
                  onClick={() =>
                    router.push(`/interventions/${item.id}`)
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Info rôle limité */}
        {!canSeeAll && (
          <div className="mt-6 flex items-start gap-2.5 p-3.5 rounded-lg bg-blue-50 border border-blue-200">
            <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Vous ne voyez que vos propres interventions. Contactez un
              administrateur pour accéder à l&apos;ensemble du planning.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
