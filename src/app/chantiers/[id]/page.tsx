"use client";

// src/app/chantiers/[id]/page.tsx
// Équivalent de fiche_chantier_widget.dart
// Détails d'un chantier : infos générales, bâtiments, logements, acteurs

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doc, DocumentReference, collection, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import {
  getOperation,
  updateOperation,
  checkNumChantierExists,
  subscribeBatiments,
  subscribeLogementsByOperation,
  subscribeActeurs,
  getConducteursTravaux,
  getConducteurNom,
  toggleLogementPrioritaire,
  deleteLogement,
  deleteBatiment,
  deleteChantier,
} from "@/lib/chantierService";
import type { Operation, Batiment, Logement, UserApp, ActeursAutre } from "@/types";
import { LISTE_ETATS } from "@/types";
import {
  BadgeEtat,
  BadgeFacturation,
  BadgePrioritaire,
  EmptyState,
  LoadingPage,
  Spinner,
  FilterChip,
} from "@/components/ui";
import { cn, formatDate, getInitials } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Building2,
  Home,
  Users,
  Phone,
  Mail,
  ChevronRight,
  Plus,
  Trash2,
  Star,
  StarOff,
  AlertTriangle,
  Layers,
  User,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

// ============================================
// Onglets de la page
// ============================================
type TabType = "batiments" | "acteurs";

// ============================================
// Page principale
// ============================================
export default function FicheChantierPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const { userApp } = useAuthStore();
  const canManage = isAdmin(userApp) || canViewDashboard(userApp);

  // Data
  const [operation, setOperation] = useState<Operation | null>(null);
  const [batiments, setBatiments] = useState<Batiment[]>([]);
  const [logements, setLogements] = useState<Logement[]>([]);
  const [acteurs, setActeurs] = useState<ActeursAutre[]>([]);
  const [conducteurs, setConducteurs] = useState<UserApp[]>([]);
  const [conducteurNom, setConducteurNom] = useState<string>("Non assigné");
  const [loading, setLoading] = useState(true);

  // Mode édition
  const [editMode, setEditMode] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editNum, setEditNum] = useState("");
  const [editEtat, setEditEtat] = useState("");
  const [editConducteur, setEditConducteur] = useState("");
  const [saving, setSaving] = useState(false);

  // Onglet actif
  const [activeTab, setActiveTab] = useState<TabType>("batiments");

  // Suppression chantier
  const [confirmDeleteChantier, setConfirmDeleteChantier] = useState(false);
  const [deletingChantier, setDeletingChantier] = useState(false);

  // Filtre logements sans bâtiment
  const [filtreEtat, setFiltreEtat] = useState<string | null>(null);

  // Bâtiments dépliés
  const [expandedBatiments, setExpandedBatiments] = useState<Set<string>>(new Set());

  // Modal rattachement acteur existant
  const [showLinkActeur, setShowLinkActeur] = useState(false);
  const [allActeurs, setAllActeurs] = useState<{ id: string; nom: string; societe?: string; role?: string; tel?: string }[]>([]);
  const [linkingActeurId, setLinkingActeurId] = useState<string | null>(null);
  const [acteurSearch, setActeurSearch] = useState("");

  // ============================================
  // Chargement initial
  // ============================================
  useEffect(() => {
    setLoading(true);
    getOperation(id).then((op) => {
      if (!op) {
        toast.error("Chantier introuvable");
        router.replace("/dashboard");
        return;
      }
      setOperation(op);
      setEditNom(op.nomChantier);
      setEditNum(op.numChantier);
      setEditEtat(op.etatChantier);

      // Résoudre le nom du conducteur
      if (op.conducteurTravaux) {
        getConducteurNom(op.conducteurTravaux as DocumentReference).then(
          setConducteurNom
        );
      }
      setLoading(false);
    });

    getConducteursTravaux().then(setConducteurs);

    const unsubBat = subscribeBatiments(id, setBatiments);
    const unsubLog = subscribeLogementsByOperation(id, setLogements);
    const unsubAct = subscribeActeurs(id, setActeurs);

    return () => {
      unsubBat();
      unsubLog();
      unsubAct();
    };
  }, [id, router]);

  // ============================================
  // Sauvegarde
  // ============================================
  const handleSave = async () => {
    if (!operation) return;
    setSaving(true);

    try {
      // Vérification doublon numéro
      if (editNum !== operation.numChantier) {
        const exists = await checkNumChantierExists(editNum, id);
        if (exists) {
          toast.error("Ce numéro de chantier existe déjà !");
          setSaving(false);
          return;
        }
      }

      const updates: Parameters<typeof updateOperation>[1] = {
        nomChantier: editNom,
        numChantier: editNum,
        etatChantier: editEtat,
      };

      // Conducteur
      if (editConducteur) {
        const cond = conducteurs.find((c) => c.displayName === editConducteur);
        if (cond) {
          updates.conducteurTravaux = doc(db, "usersapp", cond.id) as DocumentReference;
          setConducteurNom(cond.displayName);
        }
      }

      await updateOperation(id, updates);
      setOperation((prev) =>
        prev
          ? { ...prev, nomChantier: editNom, numChantier: editNum, etatChantier: editEtat }
          : prev
      );
      setEditMode(false);
      toast.success("Chantier mis à jour");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!operation) return;
    setEditNom(operation.nomChantier);
    setEditNum(operation.numChantier);
    setEditEtat(operation.etatChantier);
    setEditMode(false);
  };

  // ============================================
  // Suppression logement
  // ============================================
  const handleDeleteLogement = async (logement: Logement) => {
    if (!confirm(`Supprimer définitivement le logement "${logement.numLogement}" ?`)) return;
    try {
      await deleteLogement(logement.id);
      toast.success("Logement supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  // ============================================
  // Suppression bâtiment
  // ============================================
  const handleDeleteBatiment = async (batiment: Batiment) => {
    if (!confirm(`Supprimer le bâtiment "${batiment.nomBatiment || "sans nom"}" ?`)) return;
    const result = await deleteBatiment(batiment.id, id);
    if (!result.ok) {
      toast.error(result.reason ?? "Impossible de supprimer");
    } else {
      toast.success("Bâtiment supprimé");
    }
  };

  // ============================================
  // Rattacher un acteur existant au chantier
  // ============================================
  const handleOpenLinkActeur = async () => {
    const snap = await getDocs(collection(db, "Acteurs_autre"));
    setAllActeurs(snap.docs.map(d => ({
      id: d.id,
      nom: d.data().nom_acteur as string,
      societe: d.data().qualite_acteur as string,
      role: d.data().type_acteur as string,
      tel: d.data().tel_acteur as string,
    })));
    setActeurSearch("");
    setShowLinkActeur(true);
  };

  const handleLinkActeur = async (acteurId: string) => {
    setLinkingActeurId(acteurId);
    try {
      await updateDoc(doc(db, "Acteurs_autre", acteurId), {
        operation_ref: doc(db, "Operation", id),
      });
      toast.success("Acteur rattaché au chantier !");
      setShowLinkActeur(false);
    } catch { toast.error("Erreur lors du rattachement"); }
    finally { setLinkingActeurId(null); }
  };

  // ============================================
  // Toggle bâtiment déplié
  // ============================================
  const toggleBatiment = (batId: string) => {
    setExpandedBatiments((prev) => {
      const next = new Set(prev);
      if (next.has(batId)) next.delete(batId);
      else next.add(batId);
      return next;
    });
  };

  // ============================================
  // Logements filtrés par bâtiment
  // ============================================
  const getLogementsByBatiment = useCallback(
    (batimentId: string) =>
      logements.filter((l) => {
        const batId =
          typeof l.batimentRef === "string"
            ? l.batimentRef
            : (l.batimentRef as { id?: string })?.id;
        return batId === batimentId;
      }),
    [logements]
  );

  const logementsSansBatiment = logements.filter((l) => !l.batimentRef);

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  if (!operation) return null;

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">

        {/* ===== HEADER ===== */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-bold text-primary truncate"
              style={{ fontFamily: "var(--font-inter-tight)" }}
            >
              {operation.nomChantier || "Chantier sans nom"}
            </h1>
            <p className="text-xs text-secondary-text">
              N° {operation.numChantier || "—"} · Créé le {formatDate(operation.dateCreate)}
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {!confirmDeleteChantier ? (
                <button onClick={() => setConfirmDeleteChantier(true)}
                  className="p-2 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all" title="Supprimer le chantier">
                  <Trash2 size={16} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <AlertCircle size={13} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-700 font-medium">Supprimer ?</span>
                  <button disabled={deletingChantier} onClick={async () => {
                    setDeletingChantier(true);
                    const result = await deleteChantier(id);
                    if (result.ok) { toast.success("Chantier supprimé"); router.replace("/dashboard"); }
                    else { toast.error(result.reason ?? "Impossible de supprimer"); setConfirmDeleteChantier(false); }
                    setDeletingChantier(false);
                  }} className="text-xs font-bold text-red-700 hover:text-red-900 ml-1">
                    {deletingChantier ? "…" : "Oui"}
                  </button>
                  <button onClick={() => setConfirmDeleteChantier(false)} className="text-xs text-secondary-text hover:text-primary-text ml-0.5">Non</button>
                </div>
              )}
              <button
                onClick={() => setEditMode(!editMode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all",
                  editMode
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "btn-outline"
                )}
              >
                {editMode ? <X size={15} /> : <Pencil size={15} />}
                {editMode ? "Annuler" : "Modifier"}
              </button>
            </div>
          )}
        </div>

        {/* ===== CARTE INFO CHANTIER ===== */}
        <div className="card p-4 mb-5">
          <div className="flex items-start gap-4">
            {/* Icône */}
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border-2 border-primary/20">
              <Building2 size={24} className="text-primary" />
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              {!editMode ? (
                /* === MODE LECTURE === */
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-secondary-text">Nom du chantier</p>
                    <p className="font-semibold text-primary-text">
                      {operation.nomChantier || "Non indiqué"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <p className="text-xs text-secondary-text">N° Chantier</p>
                      <p className="font-mono font-semibold text-sm bg-primary-bg px-2 py-0.5 rounded inline-block mt-0.5">
                        {operation.numChantier || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary-text">État</p>
                      <div className="mt-0.5">
                        <BadgeEtat etat={operation.etatChantier} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-secondary-text">Conducteur de travaux</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">
                            {conducteurNom.charAt(0)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-primary-text">
                          {conducteurNom}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* === MODE ÉDITION === */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">
                      Nom du chantier
                    </label>
                    <input
                      className="input-base mt-1"
                      value={editNom}
                      onChange={(e) => setEditNom(e.target.value)}
                      placeholder="Nom du chantier"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-secondary-text">
                        N° Chantier
                      </label>
                      <input
                        className="input-base mt-1 font-mono"
                        value={editNum}
                        onChange={(e) => setEditNum(e.target.value)}
                        placeholder="Numéro"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-secondary-text">
                        État
                      </label>
                      <select
                        className="input-base mt-1"
                        value={editEtat}
                        onChange={(e) => setEditEtat(e.target.value)}
                      >
                        {LISTE_ETATS.map((e) => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">
                      Conducteur de travaux
                    </label>
                    <select
                      className="input-base mt-1"
                      value={editConducteur || conducteurNom}
                      onChange={(e) => setEditConducteur(e.target.value)}
                    >
                      <option value="">Sélectionnez un conducteur…</option>
                      {conducteurs.map((c) => (
                        <option key={c.id} value={c.displayName}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Boutons save/cancel */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn-primary flex items-center gap-2"
                    >
                      {saving ? <Spinner size="sm" /> : <Check size={15} />}
                      Sauvegarder
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="btn-outline"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== STATS RAPIDES ===== */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Bâtiments", value: batiments.length, icon: <Building2 size={16} /> },
            { label: "Logements", value: logements.length, icon: <Home size={16} /> },
            { label: "Acteurs", value: acteurs.length, icon: <Users size={16} /> },
          ].map((stat) => (
            <div key={stat.label} className="card p-3 flex items-center gap-3">
              <span className="text-primary">{stat.icon}</span>
              <div>
                <p className="text-lg font-bold text-primary-text leading-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-secondary-text">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ===== ONGLETS ===== */}
        <div className="flex gap-1 bg-primary-bg border border-alternate rounded-xl p-1 mb-4 w-fit overflow-x-auto">
          {(
            [
              { key: "batiments", label: "Bâtiments & Logements", icon: <Building2 size={14} /> },
              { key: "acteurs", label: "Acteurs", icon: <Users size={14} /> },
            ] as { key: TabType; label: string; icon: React.ReactNode }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-white text-primary shadow-sm"
                  : "text-secondary-text hover:text-primary-text"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== ONGLET : BÂTIMENTS & LOGEMENTS ===== */}
        {activeTab === "batiments" && (
          <div className="space-y-3">
            {/* Boutons ajout */}
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/logements/ajout?chantier=${id}`)}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Plus size={15} />
                  Ajouter un logement
                </button>
                <button
                  onClick={() => router.push(`/batiments/ajout?chantier=${id}`)}
                  className="btn-outline flex items-center gap-2 text-sm"
                >
                  <Plus size={15} />
                  Ajouter un bâtiment
                </button>
              </div>
            )}

            {batiments.length === 0 && logementsSansBatiment.length === 0 ? (
              <EmptyState
                icon={<Building2 size={28} />}
                title="Aucun bâtiment ni logement"
                description="Ajoutez un bâtiment ou un logement directement à ce chantier."
              />
            ) : (
              <>
                {/* Bâtiments */}
                {batiments.map((bat) => {
                  const batsLogs = getLogementsByBatiment(bat.id);
                  const isExpanded = expandedBatiments.has(bat.id);

                  return (
                    <div key={bat.id} className="card overflow-hidden">
                      {/* Header bâtiment */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-primary-bg/50 transition-colors"
                        onClick={() => toggleBatiment(bat.id)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 size={16} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-primary-text text-sm">
                            {bat.nomBatiment || "Bâtiment sans nom"}
                          </p>
                          <p className="text-xs text-secondary-text">
                            {(() => {
                              const rue = bat.adresse?.trim() ?? "";
                              const cpVille = [bat.codePostal?.trim(), bat.ville?.trim()].filter(Boolean).join(" ");
                              const parts = [rue, cpVille].filter(Boolean);
                              return parts.length > 0 ? `${parts.join(", ")} · ` : "· ";
                            })()}
                            <span className="font-medium">{batsLogs.length} logement(s)</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManage && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/batiments/${bat.id}/edit?chantier=${id}`);
                                }}
                                className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBatiment(bat);
                                }}
                                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-secondary-text" />
                          ) : (
                            <ChevronDown size={16} className="text-secondary-text" />
                          )}
                        </div>
                      </div>

                      {/* Logements du bâtiment */}
                      {isExpanded && (
                        <div className="border-t border-alternate">
                          {batsLogs.length === 0 ? (
                            <div className="px-4 py-6 text-center">
                              <p className="text-sm text-secondary-text">
                                Aucun logement dans ce bâtiment
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-alternate">
                              {batsLogs.map((log) => (
                                <LogementRow
                                  key={log.id}
                                  logement={log}
                                  canEdit={canManage}
                                  onEdit={() => router.push(`/logements/${log.id}`)}
                                  onTogglePrioritaire={() =>
                                    toggleLogementPrioritaire(log.id, log.prioritaire ?? false)
                                  }
                                  onDelete={() => handleDeleteLogement(log)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Logements sans bâtiment */}
                {logementsSansBatiment.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate">
                      <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">
                        Logements sans bâtiment ({logementsSansBatiment.length})
                      </p>
                    </div>
                    <div className="divide-y divide-alternate">
                      {logementsSansBatiment.map((log) => (
                        <LogementRow
                          key={log.id}
                          logement={log}
                          canEdit={canManage}
                          onEdit={() => router.push(`/logements/${log.id}`)}
                          onTogglePrioritaire={() =>
                            toggleLogementPrioritaire(log.id, log.prioritaire ?? false)
                          }
                          onDelete={() => handleDeleteLogement(log)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== ONGLET : ACTEURS ===== */}
        {activeTab === "acteurs" && (
          <div className="space-y-3">
            {canManage && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => router.push(`/acteurs/ajout?chantier=${id}`)}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Plus size={15} />
                  Nouvel acteur
                </button>
                <button
                  onClick={handleOpenLinkActeur}
                  className="btn-outline flex items-center gap-2 text-sm"
                >
                  <User size={15} />
                  Rattacher un acteur existant
                </button>
              </div>
            )}

            {acteurs.length === 0 ? (
              <EmptyState
                icon={<Users size={28} />}
                title="Aucun acteur"
                description="Aucun acteur extérieur n'a été ajouté à ce chantier."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {acteurs.map((acteur) => (
                  <div
                    key={acteur.id}
                    className="card p-4 hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/15 flex items-center justify-center shrink-0">
                        <span className="text-secondary-600 font-bold text-sm">
                          {getInitials(acteur.nom ?? "?")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-primary-text text-sm">
                          {acteur.nom || "—"}
                        </p>
                        {acteur.societe && (
                          <p className="text-xs text-secondary-text">{acteur.societe}</p>
                        )}
                        {acteur.role && (
                          <span className="badge bg-primary/10 text-primary border-primary/20 mt-1">
                            {acteur.role}
                          </span>
                        )}
                        <div className="mt-2 space-y-1">
                          {acteur.telephone && (
                            <a
                              href={`tel:${acteur.telephone}`}
                              className="flex items-center gap-1.5 text-xs text-secondary-text hover:text-primary transition-colors"
                            >
                              <Phone size={11} />
                              {acteur.telephone}
                            </a>
                          )}
                          {acteur.email && (
                            <a
                              href={`mailto:${acteur.email}`}
                              className="flex items-center gap-1.5 text-xs text-secondary-text hover:text-primary transition-colors"
                            >
                              <Mail size={11} />
                              {acteur.email}
                            </a>
                          )}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() =>
                            router.push(`/acteurs/${acteur.id}/edit?chantier=${id}`)
                          }
                          className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal : rattacher un acteur existant */}
      {showLinkActeur && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowLinkActeur(false); }}>
          <div className="bg-secondary-bg rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-alternate shrink-0">
              <p className="font-bold text-primary-text">Rattacher un acteur existant</p>
              <button onClick={() => setShowLinkActeur(false)} className="p-1 hover:bg-alternate rounded-lg transition-colors"><X size={18} className="text-secondary-text" /></button>
            </div>
            <div className="px-5 py-3 border-b border-alternate shrink-0">
              <input className="input-base" placeholder="Rechercher par nom…" value={acteurSearch} onChange={e => setActeurSearch(e.target.value)} autoFocus />
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-alternate">
              {allActeurs.filter(a => !acteurSearch || a.nom?.toLowerCase().includes(acteurSearch.toLowerCase())).map(a => (
                <button key={a.id} onClick={() => handleLinkActeur(a.id)} disabled={!!linkingActeurId}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-primary-bg transition-colors text-left">
                  <div className="w-9 h-9 rounded-full bg-secondary/15 flex items-center justify-center shrink-0">
                    <span className="text-secondary-600 font-bold text-xs">{getInitials(a.nom ?? "?")}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary-text">{a.nom || "—"}</p>
                    {(a.societe || a.role) && <p className="text-xs text-secondary-text truncate">{[a.role, a.societe].filter(Boolean).join(" · ")}</p>}
                    {a.tel && <p className="text-xs text-secondary-text">{a.tel}</p>}
                  </div>
                  {linkingActeurId === a.id && <Spinner size="sm" />}
                </button>
              ))}
              {allActeurs.filter(a => !acteurSearch || a.nom?.toLowerCase().includes(acteurSearch.toLowerCase())).length === 0 && (
                <p className="px-5 py-6 text-sm text-secondary-text text-center">Aucun acteur trouvé</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ============================================
// Composant : Ligne d'un logement
// ============================================
function LogementRow({
  logement,
  canEdit,
  showAllCols = false,
  onEdit,
  onTogglePrioritaire,
  onDelete,
}: {
  logement: Logement;
  canEdit: boolean;
  showAllCols?: boolean;
  onEdit: () => void;
  onTogglePrioritaire: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 hover:bg-primary-bg/60 transition-colors">
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="flex items-start justify-between mb-2">
          <div className="cursor-pointer flex-1" onClick={onEdit}>
            <p className="font-semibold text-primary-text text-sm">
              {logement.numLogement || "—"}
            </p>
            <p className="text-xs text-secondary-text">
              {logement.nomOccupant || "Aucun occupant"}
            </p>
            {logement.etageLogement !== undefined && (
              <p className="text-xs text-secondary-text">
                Niveau {logement.etageLogement}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <BadgePrioritaire prioritaire={logement.prioritaire} />
            <BadgeEtat etat={logement.etatChantier ?? "—"} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            <BadgeFacturation etat={logement.etatFacturation ?? "—"} />
            <span className="badge bg-gray-100 text-gray-600 border-gray-200">
              {logement.etatSignature ?? "—"}
            </span>
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <button
                onClick={onTogglePrioritaire}
                className="p-1.5 rounded-lg text-secondary-text hover:text-warning hover:bg-yellow-50 transition-all"
                title={logement.prioritaire ? "Retirer la priorité" : "Marquer prioritaire"}
              >
                {logement.prioritaire ? <StarOff size={14} /> : <Star size={14} />}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop */}
      <div
        className={cn(
          "hidden sm:grid items-center gap-3",
          showAllCols
            ? "grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
            : "grid-cols-[2fr_1fr_1fr_auto]"
        )}
      >
        <div className="cursor-pointer" onClick={onEdit}>
          <p className="font-semibold text-primary-text text-sm">
            {logement.numLogement || "—"}
          </p>
          <p className="text-xs text-secondary-text truncate">
            {logement.nomOccupant || "Aucun occupant"}
          </p>
          {logement.etageLogement !== undefined && (
            <p className="text-xs text-secondary-text">
              Niveau {logement.etageLogement}
            </p>
          )}
          <BadgePrioritaire prioritaire={logement.prioritaire} />
        </div>

        <BadgeEtat etat={logement.etatChantier ?? "—"} />

        {showAllCols && (
          <BadgeFacturation etat={logement.etatFacturation ?? "—"} />
        )}

        {showAllCols && (
          <span
            className={cn(
              "badge border",
              logement.etatSignature === "Signé"
                ? "bg-green-100 text-green-800 border-green-200"
                : "bg-gray-100 text-gray-600 border-gray-200"
            )}
          >
            {logement.etatSignature ?? "—"}
          </span>
        )}

        {showAllCols && (
          <div className="flex items-center">
            <BadgePrioritaire prioritaire={logement.prioritaire} />
            {!logement.prioritaire && (
              <span className="text-xs text-secondary-text">Standard</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all"
          >
            <ChevronRight size={16} />
          </button>
          {canEdit && (
            <>
              <button
                onClick={onTogglePrioritaire}
                className="p-1.5 rounded-lg text-secondary-text hover:text-warning hover:bg-yellow-50 transition-all"
                title={logement.prioritaire ? "Retirer la priorité" : "Marquer prioritaire"}
              >
                {logement.prioritaire ? <StarOff size={13} /> : <Star size={13} />}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
