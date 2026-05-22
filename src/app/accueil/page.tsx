"use client";

// src/app/accueil/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import {
  subscribePlanningByDate,
  deletePlanning,
  getTechnicienNom,
  getPlanningCountsByRange,
  type PlanningItem,
} from "@/lib/planningService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  format, addDays, startOfWeek, isSameDay, isToday,
  startOfMonth, endOfMonth, addMonths, eachDayOfInterval, getDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import { cn, getInitials } from "@/lib/utils";
import { LoadingPage, EmptyState, Spinner } from "@/components/ui";
import {
  ChevronLeft, ChevronRight, Clock, User, Trash2,
  Calendar, AlertCircle, LogOut, BookOpen, Users, UsersRound, CalendarPlus,
} from "lucide-react";
import toast from "react-hot-toast";

type ViewMode = "week" | "month";

// ============================================
// Composant : Carte d'une intervention
// ============================================

function PlanningCard({
  item, canDelete, onDelete, onClick,
}: {
  item: PlanningItem;
  canDelete: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const heureDebut = item.heureRdv ? format(item.heureRdv, "HH:mm") : "—";
  const heureFin = item.heureFinRdv ? format(item.heureFinRdv, "HH:mm") : "—";

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow duration-200">
      <div className="h-1 bg-primary" />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-badge">
              <Clock size={13} />
              <span className="text-sm font-bold">{heureDebut} – {heureFin}</span>
            </div>
            {item.statutRdv && (
              <span className={cn(
                "badge border",
                item.statutRdv === "Réalisé" ? "bg-green-100 text-green-800 border-green-200"
                  : item.statutRdv === "Annulé" ? "bg-red-100 text-red-700 border-red-200"
                  : "bg-yellow-100 text-yellow-800 border-yellow-200"
              )}>
                {item.statutRdv}
              </span>
            )}
          </div>
          {canDelete && item.affectationPlanning === "Oui" && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all duration-200"
              title="Supprimer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div
          className="bg-primary-bg rounded-lg p-3 mb-3 cursor-pointer hover:bg-alternate/60 transition-colors"
          onClick={onClick}
        >
          <p className="text-sm text-primary-text leading-relaxed">
            {item.descriptifTravaux || (
              <span className="text-secondary-text italic">Descriptif non indiqué</span>
            )}
          </p>
        </div>
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
  weekStart,
  onWeekStartChange,
  countsByDate,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  weekStart: Date;
  onWeekStartChange: (d: Date) => void;
  countsByDate: Record<string, number>;
}) {
  // Resynchronise la semaine quand on revient à aujourd'hui
  useEffect(() => {
    if (isToday(selectedDate)) {
      onWeekStartChange(startOfWeek(new Date(), { weekStartsOn: 1 }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
  const monthLabel = format(weekStart, "MMMM yyyy", { locale: fr });

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onWeekStartChange(addDays(weekStart, -7))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-primary-text capitalize">{monthLabel}</span>
        <button
          onClick={() => onWeekStartChange(addDays(weekStart, 7))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);
          const count = countsByDate[format(day, "yyyy-MM-dd")] ?? 0;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all duration-200",
                isSelected ? "bg-primary text-white shadow-sm"
                  : isTodayDay ? "bg-secondary/15 text-secondary-600"
                  : "hover:bg-primary-bg text-secondary-text hover:text-primary-text"
              )}
            >
              <span className="text-[10px] font-semibold uppercase">{DAY_LABELS[i]}</span>
              <span className={cn("text-sm font-bold leading-none", isSelected ? "text-white" : "")}>
                {format(day, "d")}
              </span>
              {count > 0 ? (
                <span className={cn(
                  "min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center leading-none",
                  isSelected ? "bg-white/25 text-white" : "bg-primary text-white"
                )}>
                  {count}
                </span>
              ) : (
                <span className="h-4" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Composant : Calendrier mensuel
// ============================================

function MonthCalendar({
  selectedDate,
  onSelectDate,
  monthStart,
  onMonthStartChange,
  countsByDate,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  monthStart: Date;
  onMonthStartChange: (d: Date) => void;
  countsByDate: Record<string, number>;
}) {
  // Resynchronise le mois quand on revient à aujourd'hui
  useEffect(() => {
    if (isToday(selectedDate)) {
      onMonthStartChange(startOfMonth(new Date()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });
  // Décalage : lundi = 0
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7;
  const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
  const monthLabel = format(monthStart, "MMMM yyyy", { locale: fr });

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onMonthStartChange(addMonths(monthStart, -1))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-primary-text capitalize">{monthLabel}</span>
        <button
          onClick={() => onMonthStartChange(addMonths(monthStart, 1))}
          className="p-1.5 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* En-têtes jours */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-secondary-text uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grille des jours */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);
          const count = countsByDate[format(day, "yyyy-MM-dd")] ?? 0;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={cn(
                "relative flex items-center justify-center aspect-square w-full rounded-xl text-sm font-medium transition-all duration-200",
                isSelected ? "bg-primary text-white shadow-sm"
                  : isTodayDay ? "bg-secondary/15 text-secondary-600 font-bold"
                  : "hover:bg-primary-bg text-secondary-text hover:text-primary-text"
              )}
            >
              {format(day, "d")}
              {count > 0 && (
                <span className={cn(
                  "absolute top-0.5 right-0.5 min-w-[13px] h-[13px] rounded-full text-[8px] font-bold flex items-center justify-center px-0.5 leading-none",
                  isSelected ? "bg-white/30 text-white" : "bg-primary text-white"
                )}>
                  {count}
                </span>
              )}
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
  const { userApp, firebaseUser, setNotificationsNonLues, logout, journalInterneNonLu } = useAuthStore();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [showLogout, setShowLogout] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [countsByDate, setCountsByDate] = useState<Record<string, number>>({});
  const [plannings, setPlannings] = useState<PlanningItem[]>([]);
  const [loadingPlannings, setLoadingPlannings] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canSeeAll =
    userApp?.roleapp === "Admin" ||
    userApp?.roleapp === "SuperAdmin" ||
    userApp?.type === "Conducteur de Travaux" ||
    userApp?.type === "Service SAV / Expertises" ||
    userApp?.type === "Bureau Administratif";

  useEffect(() => {
    if (firebaseUser) {
      const userRef = doc(db, "usersapp", firebaseUser.uid);
      updateDoc(userRef, { last_login: new Date() }).catch(() => {});
    }
  }, [firebaseUser]);

  // Chargement des counts pour les badges du calendrier
  useEffect(() => {
    const start = viewMode === "week" ? weekStart : monthStart;
    const end = viewMode === "week" ? addDays(weekStart, 6) : endOfMonth(monthStart);
    getPlanningCountsByRange(start, end).then(setCountsByDate).catch(() => {});
  }, [viewMode, weekStart, monthStart]);

  useEffect(() => {
    setLoadingPlannings(true);
    const unsub = subscribePlanningByDate(selectedDate, async (items) => {
      const withNames = await Promise.all(
        items.map(async (item) => {
          if (item.refUsers) {
            const nom = await getTechnicienNom(item.refUsers);
            return { ...item, technicienNom: nom };
          }
          return item;
        })
      );
      const filtered = canSeeAll
        ? withNames
        : withNames.filter((p) => p.refUsers?.id === firebaseUser?.uid);
      setPlannings(filtered);
      setLoadingPlannings(false);
    });
    return () => unsub();
  }, [selectedDate, canSeeAll, firebaseUser?.uid]);

  const handleLogout = async () => {
    setShowLogout(false);
    await logout();
    toast.success("Déconnecté avec succès");
    router.replace("/login");
  };

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
            <p className="text-sm text-secondary-text mt-0.5 capitalize">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => router.push("/profil")}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0"
              title="Mon profil"
            >
              {userApp?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userApp.photoUrl} alt="avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">{getInitials(userApp?.nom ?? "U", userApp?.prenom)}</span>
              )}
            </button>
            <button
              onClick={() => setShowLogout(true)}
              className="p-2 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
              title="Déconnexion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Raccourcis rapides — mobile uniquement */}
        <div className="lg:hidden flex flex-wrap gap-2 mb-4">
          {isAdmin(userApp) && (
            <button
              onClick={() => router.push("/affectation-planning")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all"
            >
              <CalendarPlus size={14} />
              Affecter planning
            </button>
          )}
          <button
            onClick={() => router.push("/journal-interne")}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all"
          >
            <BookOpen size={14} />
            Journal interne
            {journalInterneNonLu > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {journalInterneNonLu > 9 ? "9+" : journalInterneNonLu}
              </span>
            )}
          </button>
          {isAdmin(userApp) && (
            <button
              onClick={() => router.push("/acteurs")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all"
            >
              <UsersRound size={14} />
              Acteurs chantiers
            </button>
          )}
          {isAdmin(userApp) && (
            <button
              onClick={() => router.push("/utilisateurs")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all"
            >
              <Users size={14} />
              Liste utilisateurs
            </button>
          )}
        </div>

        {/* Contrôles du calendrier */}
        <div className="flex items-center justify-between mb-3">
          {/* Bouton retour à aujourd'hui */}
          {!isToday(selectedDate) ? (
            <button
              onClick={() => setSelectedDate(new Date())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
            >
              <Calendar size={13} />
              Aujourd'hui
            </button>
          ) : (
            <div />
          )}

          {/* Toggle semaine / mois */}
          <div className="flex items-center bg-alternate rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                viewMode === "week" ? "bg-white text-primary shadow-sm" : "text-secondary-text hover:text-primary-text"
              )}
            >
              Semaine
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                viewMode === "month" ? "bg-white text-primary shadow-sm" : "text-secondary-text hover:text-primary-text"
              )}
            >
              Mois
            </button>
          </div>
        </div>

        {/* Calendrier */}
        {viewMode === "week" ? (
          <WeekCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            weekStart={weekStart}
            onWeekStartChange={setWeekStart}
            countsByDate={countsByDate}
          />
        ) : (
          <MonthCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            monthStart={monthStart}
            onMonthStartChange={setMonthStart}
            countsByDate={countsByDate}
          />
        )}

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
                  onClick={() => router.push(`/interventions/${item.id}`)}
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
      {/* Modal déconnexion mobile */}
      {showLogout && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 lg:hidden"
          onClick={() => setShowLogout(false)}
        >
          <div
            className="bg-secondary-bg rounded-t-2xl p-5 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-alternate mx-auto mb-4" />
            <p className="font-bold text-primary-text text-base mb-1">Déconnexion</p>
            <p className="text-sm text-secondary-text mb-5">Voulez-vous vous déconnecter de votre compte ?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogout(false)} className="flex-1 btn-outline">Annuler</button>
              <button onClick={handleLogout} className="flex-1 btn-danger">Déconnexion</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
