"use client";
// src/app/dashboard/page.tsx

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, doc, DocumentReference, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import { subscribeOperations, subscribeLogements } from "@/lib/firestore";
import type { Operation, Logement } from "@/types";
import { LISTE_ETATS, LISTE_ETAT_FACTURATION, LISTE_ETAT_SIGNATURE, LISTE_ETAT_QUITUS, LISTE_ETAT_CHANTIER } from "@/types";
import { StatCard, BadgeEtat, BadgeFacturation, BadgePrioritaire, FilterChip, SearchInput, LoadingPage, EmptyState } from "@/components/ui";
import { NavButton } from "@/components/ui/NavButton";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { TrendingUp, Clock, CheckCircle2, XCircle, Plus, Building2, Home, MapPin, User, Package, Bell, SlidersHorizontal, ChevronDown, ChevronUp, Trash2, Pencil, AlertTriangle, FileSignature, Inbox, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

const TYPES_DEMANDE = ["Réserve", "GPA", "DO", "Demande direct"];
type TabType = "logements" | "operations";

// Cache
const conducteurCache = new Map<string, { nom: string; photoUrl?: string }>();
const batimentCache = new Map<string, string>();

async function getConducteur(ref: DocumentReference) {
  if (conducteurCache.has(ref.id)) return conducteurCache.get(ref.id)!;
  try {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = { nom: snap.data().display_name as string ?? "—", photoUrl: snap.data().photo_url as string };
      conducteurCache.set(ref.id, d); return d;
    }
  } catch {}
  return { nom: "—" };
}

async function getAdresseBatiment(batRef?: DocumentReference): Promise<string> {
  if (!batRef) return "";
  if (batimentCache.has(batRef.id)) return batimentCache.get(batRef.id)!;
  try {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(batRef);
    if (snap.exists()) {
      const adr = (snap.data().adresse_batiment ?? snap.data().adresse) as string ?? "";
      batimentCache.set(batRef.id, adr); return adr;
    }
  } catch {}
  return "";
}

async function deletePlanningRelated(planId: string) {
  const planRef = doc(db, "Planning", planId);
  const [avant, apres, notes, mat] = await Promise.all([
    getDocs(collection(db, "Planning", planId, "Photo_avant")),
    getDocs(collection(db, "Planning", planId, "Photo_apres")),
    getDocs(query(collection(db, "Notes_travaux"), where("ref_planning", "==", planRef))),
    getDocs(query(collection(db, "Materiel_tache"), where("planning_ref", "==", planRef))),
  ]);
  await Promise.all([...avant.docs, ...apres.docs, ...notes.docs, ...mat.docs].map(d => deleteDoc(d.ref)));
}

async function checkRelance(logementId: string): Promise<boolean> {
  const logRef = doc(db, "Logements", logementId);
  const now = new Date();
  // Ancien système
  const old = await getDocs(query(collection(db, "relances"), where("ref_logement", "==", logRef)));
  if (old.docs.some(d => { const dr = (d.data().date_relance as any)?.toDate?.(); return !dr || dr <= now; })) return true;
  // Nouveau système : Workflow_relance actif via Planning
  const planSnap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", logRef)));
  for (const planDoc of planSnap.docs) {
    const planRef = doc(db, "Planning", planDoc.id);
    const wSnap = await getDocs(query(collection(db, "Workflow_relance"), where("planning_ref", "==", planRef), where("statut", "==", "actif")));
    if (wSnap.size > 0) return true;
  }
  return false;
}

async function getFirstPlanningDate(logementId: string): Promise<Date | undefined> {
  const logRef = doc(db, "Logements", logementId);
  const snap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", logRef)));
  const dates = snap.docs.map(d => (d.data().date_create as any)?.toDate?.() as Date | undefined).filter(Boolean) as Date[];
  if (!dates.length) return undefined;
  return dates.sort((a, b) => a.getTime() - b.getTime())[0];
}

async function checkMaterielManquant(logementId: string): Promise<boolean> {
  const logRef = doc(db, "Logements", logementId);
  const snap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", logRef), where("etat_materiel", "==", "Matériel manquant")));
  return snap.size > 0;
}

async function getTypesDemande(logementId: string): Promise<string> {
  const logRef = doc(db, "Logements", logementId);
  const snap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", logRef)));
  const types = snap.docs.map(d => d.data().type_demande as string).filter(Boolean);
  return Array.from(new Set(types)).join(", ");
}

interface LogementEnrichi extends Logement {
  adresse?: string; conducteurNom?: string; conducteurPhoto?: string;
  aRelancer?: boolean; materielManquant?: boolean; typesDemande?: string;
  chantierNom?: string; chantierNum?: string; dateDemande?: Date;
}
interface OperationEnrichie extends Operation {
  conducteurNom?: string; conducteurPhoto?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { userApp } = useAuthStore();

  const [operations, setOperations] = useState<Operation[]>([]);
  const [logements, setLogements] = useState<Logement[]>([]);
  const [logementsEnrichis, setLogementsEnrichis] = useState<Map<string, LogementEnrichi>>(new Map());
  const [operationsEnrichies, setOperationsEnrichies] = useState<Map<string, OperationEnrichie>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [confirmDeleteOpId, setConfirmDeleteOpId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("logements");
  const [searchChantier, setSearchChantier] = useState("");
  const [searchLogement, setSearchLogement] = useState("");

  // Filtres logements
  const [filtreFacturation, setFiltreFacturation] = useState<string[]>([...LISTE_ETAT_FACTURATION]);
  const [filtreEtatChantier, setFiltreEtatChantier] = useState<string[]>([...LISTE_ETAT_CHANTIER]);
  const [filtreSignature, setFiltreSignature] = useState<string[]>([...LISTE_ETAT_SIGNATURE]);
  const [filtreQuitus, setFiltreQuitus] = useState<string[]>([...LISTE_ETAT_QUITUS]);
  const [filtrePrioritaire, setFiltrePrioritaire] = useState<(boolean | null)[]>([true, false]);
  const [filtreMateriel, setFiltreMateriel] = useState<string | null>(null);
  const [filtreTypeDemande, setFiltreTypeDemande] = useState<string[]>([]);
  const [filtreRelance, setFiltreRelance] = useState<string | null>(null);
  const [filtreEtatOperation, setFiltreEtatOperation] = useState<string[]>([...LISTE_ETATS]);
  const [showFiltres, setShowFiltres] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubOps = subscribeOperations(ops => { setOperations(ops); setLoading(false); });
    const unsubLogs = subscribeLogements(logs => setLogements(logs));
    return () => { unsubOps(); unsubLogs(); };
  }, []);

  useEffect(() => {
    if (logements.length === 0 || operations.length === 0) return;
    const enrich = async () => {
      const map = new Map<string, LogementEnrichi>();
      await Promise.all(logements.map(async log => {
        const opId = typeof log.operationRef === "string" ? log.operationRef : (log.operationRef as DocumentReference | undefined)?.id;
        const op = operations.find(o => o.id === opId);
        let conducteurNom = "—", conducteurPhoto: string | undefined;
        if (op?.conducteurTravaux) {
          const c = await getConducteur(op.conducteurTravaux as DocumentReference);
          conducteurNom = c.nom; conducteurPhoto = c.photoUrl;
        }
        const batRef = typeof log.batimentRef === "object" ? log.batimentRef as DocumentReference : undefined;
        const adresse = await getAdresseBatiment(batRef);
        const aRelancer = await checkRelance(log.id);
        const materielManquant = await checkMaterielManquant(log.id);
        const typesDemande = await getTypesDemande(log.id);
        const dateDemande = await getFirstPlanningDate(log.id);
        map.set(log.id, { ...log, adresse, conducteurNom, conducteurPhoto, aRelancer, materielManquant, typesDemande, chantierNom: op?.nomChantier, chantierNum: op?.numChantier, dateDemande });
      }));
      setLogementsEnrichis(map);
    };
    enrich();
  }, [logements, operations]);

  useEffect(() => {
    if (operations.length === 0) return;
    const enrich = async () => {
      const map = new Map<string, OperationEnrichie>();
      await Promise.all(operations.map(async op => {
        let conducteurNom = "—", conducteurPhoto: string | undefined;
        if (op.conducteurTravaux) {
          const c = await getConducteur(op.conducteurTravaux as DocumentReference);
          conducteurNom = c.nom; conducteurPhoto = c.photoUrl;
        }
        map.set(op.id, { ...op, conducteurNom, conducteurPhoto });
      }));
      setOperationsEnrichies(map);
    };
    enrich();
  }, [operations]);

  const logementsFiltrés = useMemo(() => {
    return logements.map(l => logementsEnrichis.get(l.id) ?? l as LogementEnrichi).filter(l => {
      if (!filtreFacturation.includes(l.etatFacturation ?? "")) return false;
      if (!filtreEtatChantier.includes(l.etatChantier ?? "")) return false;
      if (!filtreSignature.includes(l.etatSignature ?? "")) return false;
      if (!filtreQuitus.includes(l.etatQuitus ?? "")) return false;
      if (!filtrePrioritaire.includes(l.prioritaire ?? false)) return false;
      if (filtreMateriel === "ok" && l.materielManquant) return false;
      if (filtreMateriel === "manquant" && !l.materielManquant) return false;
      if (filtreRelance === "relancer" && !l.aRelancer) return false;
      if (filtreRelance === "ok" && l.aRelancer) return false;
      if (filtreTypeDemande.length > 0) {
        const types = (l.typesDemande ?? "").split(", ");
        if (!filtreTypeDemande.some(ft => types.includes(ft))) return false;
      }
      if (searchLogement.trim()) {
        const q = searchLogement.toLowerCase();
        if (!l.numLogement.toLowerCase().includes(q) && !l.nomOccupant.toLowerCase().includes(q)) return false;
      }
      if (searchChantier.trim()) {
        const q = searchChantier.toLowerCase();
        if (!l.chantierNom?.toLowerCase().includes(q) && !l.chantierNum?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [logements, logementsEnrichis, filtreFacturation, filtreEtatChantier, filtreSignature, filtreQuitus, filtrePrioritaire, filtreMateriel, filtreRelance, filtreTypeDemande, searchLogement, searchChantier]);

  const operationsFiltrees = useMemo(() => operations.filter(op => {
    if (!filtreEtatOperation.includes(op.etatChantier)) return false;
    if (searchChantier.trim()) {
      const q = searchChantier.toLowerCase();
      if (!op.nomChantier.toLowerCase().includes(q) && !op.numChantier.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [operations, filtreEtatOperation, searchChantier]);

  const stats = useMemo(() => ({
    aPlanifier: logements.filter(l => l.etatChantier === "A planifier").length,
    enCours: logements.filter(l => l.etatChantier === "En attente").length,
    finis: logements.filter(l => l.etatChantier === "Travaux finis").length,
    clos: logements.filter(l => l.etatChantier === "Clos").length,
    nonFacture: logements.filter(l => l.etatFacturation === "Non facturé").length,
    nonSignes: logements.filter(l => l.etatSignature === "Non signé").length,
    attenteQuitus: logements.filter(l => l.etatQuitus === "Non envoyé").length,
  }), [logements]);

  const deleteLogement = async (logId: string) => {
    setDeleting(true);
    try {
      const logRef = doc(db, "Logements", logId);
      const planSnap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", logRef)));
      await Promise.all(planSnap.docs.map(async d => { await deletePlanningRelated(d.id); await deleteDoc(d.ref); }));
      await deleteDoc(logRef);
      toast.success("Logement supprimé");
    } catch { toast.error("Erreur lors de la suppression"); }
    finally { setDeleting(false); setConfirmDeleteLogId(null); }
  };

  const deleteOperation = async (opId: string) => {
    setDeleting(true);
    try {
      const opRef = doc(db, "Operation", opId);
      const logSnap = await getDocs(query(collection(db, "Logements"), where("operation_ref", "==", opRef)));
      await Promise.all(logSnap.docs.map(async d => {
        const lRef = doc(db, "Logements", d.id);
        const planSnap = await getDocs(query(collection(db, "Planning"), where("ref_logement", "==", lRef)));
        await Promise.all(planSnap.docs.map(async pd => { await deletePlanningRelated(pd.id); await deleteDoc(pd.ref); }));
        await deleteDoc(lRef);
      }));
      await deleteDoc(opRef);
      toast.success("Chantier et logements supprimés");
    } catch { toast.error("Erreur lors de la suppression"); }
    finally { setDeleting(false); setConfirmDeleteOpId(null); }
  };

  function toggleFilter<T>(arr: T[], val: T, all: T[]): T[] {
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    return next.length === 0 ? [...all] : next;
  }

  const resetFiltresLogements = () => {
    setFiltreFacturation([...LISTE_ETAT_FACTURATION]);
    setFiltreEtatChantier([...LISTE_ETAT_CHANTIER]);
    setFiltreSignature([...LISTE_ETAT_SIGNATURE]);
    setFiltreQuitus([...LISTE_ETAT_QUITUS]);
    setFiltrePrioritaire([true, false]);
    setFiltreMateriel(null);
    setFiltreTypeDemande([]);
    setFiltreRelance(null);
    setSearchLogement("");
    setSearchChantier("");
  };
  const resetFiltresOperations = () => {
    setFiltreEtatOperation([...LISTE_ETATS]);
    setSearchChantier("");
  };

  const filtresLogActifs =
    filtreFacturation.length !== LISTE_ETAT_FACTURATION.length ||
    filtreEtatChantier.length !== LISTE_ETAT_CHANTIER.length ||
    filtreSignature.length !== LISTE_ETAT_SIGNATURE.length ||
    filtreQuitus.length !== LISTE_ETAT_QUITUS.length ||
    filtrePrioritaire.length !== 2 || filtreMateriel !== null ||
    filtreTypeDemande.length > 0 || filtreRelance !== null ||
    searchLogement !== "" || searchChantier !== "";
  const filtresOpActifs =
    filtreEtatOperation.length !== LISTE_ETATS.length || searchChantier !== "";

  if (!canViewDashboard(userApp) && !loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full py-20 text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-alternate flex items-center justify-center mb-4"><Home size={28} className="text-secondary-text" /></div>
          <h2 className="text-lg font-bold text-primary-text mb-2">Accès non autorisé</h2>
          <p className="text-sm text-secondary-text">Le tableau de bord est réservé aux Admins et Conducteurs de travaux.</p>
        </div>
      </AppShell>
    );
  }

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5 max-w-full">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Tableau de bord</h1>
            <p className="text-sm text-secondary-text mt-0.5">{logements.length} logements · {operations.length} chantiers</p>
          </div>
          {(isAdmin(userApp) || canViewDashboard(userApp)) && (
            <button onClick={() => router.push("/chantiers/ajout")} className="btn-primary flex items-center gap-2">
              <Plus size={16} /><span className="hidden sm:inline">Nouveau chantier</span>
            </button>
          )}
        </div>

        {/* Stats — grille 2 col mobile, scroll horizontal desktop large */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:flex xl:flex-nowrap gap-2 xl:gap-3 mb-5 xl:overflow-x-auto xl:pb-2 scrollbar-hide">
          <StatCard label="À planifier" value={stats.aPlanifier} icon={<Clock size={20} />} color="warning" />
          <StatCard label="En attente" value={stats.enCours} icon={<TrendingUp size={20} />} color="secondary" />
          <StatCard label="Travaux finis" value={stats.finis} icon={<CheckCircle2 size={20} />} color="success" />
          <StatCard label="Clos" value={stats.clos} icon={<XCircle size={20} />} color="primary" />
          <StatCard label="Non facturés" value={stats.nonFacture} icon={<Inbox size={20} />} color="warning" />
          <StatCard label="Non signés" value={stats.nonSignes} icon={<FileSignature size={20} />} color="secondary" />
          <StatCard label="Attente Quitus" value={stats.attenteQuitus} icon={<AlertTriangle size={20} />} color="warning" />
        </div>

        {/* Recherche */}
        <div className="mb-4 space-y-2">
          {activeTab === "logements" && (
            <>
              <SearchInput value={searchLogement} onChange={setSearchLogement} placeholder="Rechercher par N° logement ou nom occupant…" />
              <SearchInput value={searchChantier} onChange={setSearchChantier} placeholder="Filtrer par nom ou numéro de chantier…" />
            </>
          )}
          {activeTab === "operations" && (
            <SearchInput value={searchChantier} onChange={setSearchChantier} placeholder="Nom ou numéro de chantier…" />
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-1 bg-primary-bg border border-alternate rounded-xl p-1 mb-4 w-fit">
          {([
            { key: "logements" as TabType, label: "Logements", count: logementsFiltrés.length, icon: <Home size={14} /> },
            { key: "operations" as TabType, label: "Chantiers", count: operationsFiltrees.length, icon: <Building2 size={14} /> },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === tab.key ? "bg-white text-primary shadow-sm" : "text-secondary-text hover:text-primary-text")}>
              {tab.icon}{tab.label}
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full", activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-alternate text-secondary-text")}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ===== LOGEMENTS ===== */}
        {activeTab === "logements" && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={13} className="text-secondary-text" />
                  <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Filtres</p>
                  {filtresLogActifs && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex items-center gap-2">
                  {filtresLogActifs && (
                    <button onClick={resetFiltresLogements} className="flex items-center gap-1 text-xs text-error hover:text-error/80 transition-colors font-medium">
                      <RotateCcw size={11} />Réinitialiser
                    </button>
                  )}
                  <button onClick={() => setShowFiltres(v => !v)} className="flex items-center gap-1 text-xs text-secondary-text hover:text-primary transition-colors">
                    {showFiltres ? <><ChevronUp size={14} />Masquer</> : <><ChevronDown size={14} />Afficher</>}
                  </button>
                </div>
              </div>
              {showFiltres && <>{[
                { label: "Facturation", opts: LISTE_ETAT_FACTURATION, val: filtreFacturation, set: setFiltreFacturation },
                { label: "État chantier", opts: LISTE_ETAT_CHANTIER, val: filtreEtatChantier, set: setFiltreEtatChantier },
                { label: "Signature", opts: LISTE_ETAT_SIGNATURE, val: filtreSignature, set: setFiltreSignature },
                { label: "Quitus", opts: LISTE_ETAT_QUITUS, val: filtreQuitus, set: setFiltreQuitus },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-secondary-text mb-1.5">{f.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.opts.map(e => <FilterChip key={e} label={e} active={f.val.includes(e)} onClick={() => f.set(toggleFilter(f.val, e, [...f.opts]))} />)}
                  </div>
                </div>
              ))}
              <div>
                <p className="text-xs text-secondary-text mb-1.5">Priorité</p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Prioritaire" active={filtrePrioritaire.includes(true)} onClick={() => setFiltrePrioritaire(toggleFilter(filtrePrioritaire, true as boolean | null, [true, false]))} />
                  <FilterChip label="Non prioritaire" active={filtrePrioritaire.includes(false)} onClick={() => setFiltrePrioritaire(toggleFilter(filtrePrioritaire, false as boolean | null, [true, false]))} />
                </div>
              </div>
              <div>
                <p className="text-xs text-secondary-text mb-1.5">Matériel</p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Tous" active={!filtreMateriel} onClick={() => setFiltreMateriel(null)} />
                  <FilterChip label="Matériel Ok" active={filtreMateriel === "ok"} onClick={() => setFiltreMateriel("ok")} />
                  <FilterChip label="Manquant" active={filtreMateriel === "manquant"} onClick={() => setFiltreMateriel("manquant")} />
                </div>
              </div>
              <div>
                <p className="text-xs text-secondary-text mb-1.5">Type de demande</p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Tous" active={filtreTypeDemande.length === 0} onClick={() => setFiltreTypeDemande([])} />
                  {TYPES_DEMANDE.map(t => <FilterChip key={t} label={t} active={filtreTypeDemande.includes(t)} onClick={() => setFiltreTypeDemande(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])} />)}
                </div>
              </div>
              <div>
                <p className="text-xs text-secondary-text mb-1.5">Relance</p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip label="Tous" active={!filtreRelance} onClick={() => setFiltreRelance(null)} />
                  <FilterChip label="À relancer" active={filtreRelance === "relancer"} onClick={() => setFiltreRelance("relancer")} />
                  <FilterChip label="Relance à jour" active={filtreRelance === "ok"} onClick={() => setFiltreRelance("ok")} />
                </div>
              </div>
              </>}
            </div>

            {logementsFiltrés.length === 0 ? (
              <EmptyState icon={<Home size={28} />} title="Aucun logement trouvé" description="Modifiez les filtres." />
            ) : (
              <div className="space-y-2">
                {logementsFiltrés.map(l => {
                  const logement = l as LogementEnrichi;
                  return (
                    <div key={l.id} className="card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer" onClick={() => router.push(`/logements/${l.id}`)}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-primary-text">{l.numLogement || "—"}</p>
                              <BadgePrioritaire prioritaire={l.prioritaire} />
                              <BadgeEtat etat={l.etatChantier ?? "—"} />
                              <BadgeFacturation etat={l.etatFacturation ?? "—"} />
                            </div>
                            <p className="text-sm text-secondary-text mt-0.5">{l.nomOccupant || "Aucun occupant"}</p>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-secondary-text">
                              {l.dateCreate && <span>Créé le {formatDate(l.dateCreate)}</span>}
                              {logement.dateDemande && <span>Demande : {formatDate(logement.dateDemande)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={async e => {
                                e.stopPropagation();
                                await updateDoc(doc(db, "Logements", l.id), { priorite_logement: !l.prioritaire });
                              }}
                              className={cn("text-xs font-semibold px-2 py-1 rounded-lg border transition-all",
                                l.prioritaire ? "bg-red-100 text-red-700 border-red-200 hover:bg-red-200" : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-200")}
                              title={l.prioritaire ? "Retirer la priorité" : "Marquer prioritaire"}
                            >
                              {l.prioritaire ? "★" : "☆"}
                            </button>
                            <button onClick={e => { e.stopPropagation(); router.push(`/logements/${l.id}`); }}
                              className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all" title="Modifier">
                              <Pencil size={13} />
                            </button>
                            {confirmDeleteLogId === l.id ? (
                              <button onClick={e => { e.stopPropagation(); deleteLogement(l.id); }}
                                disabled={deleting}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-error text-white text-xs font-semibold">
                                <AlertTriangle size={11} />Confirmer
                              </button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); setConfirmDeleteLogId(l.id); setTimeout(() => setConfirmDeleteLogId(null), 3000); }}
                                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all" title="Supprimer">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Chantier + conducteur */}
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          {logement.chantierNom && (
                            <div className="flex items-center gap-1.5 text-xs text-secondary-text">
                              <Building2 size={12} /><span>{logement.chantierNom} <span className="font-mono">({logement.chantierNum})</span></span>
                            </div>
                          )}
                          {logement.conducteurNom && logement.conducteurNom !== "—" && (
                            <div className="flex items-center gap-1.5 text-xs text-secondary-text">
                              {logement.conducteurPhoto ? (
                                <img src={logement.conducteurPhoto} alt="" className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-primary">{logement.conducteurNom.charAt(0)}</span>
                                </div>
                              )}
                              <span>{logement.conducteurNom}</span>
                            </div>
                          )}
                        </div>

                        {/* Adresse + GPS */}
                        {logement.adresse && (
                          <div className="flex items-center gap-2 mb-2" onClick={e => e.stopPropagation()}>
                            <MapPin size={12} className="text-secondary-text shrink-0" />
                            <span className="text-xs text-secondary-text truncate flex-1">{logement.adresse}</span>
                            <NavButton adresse={logement.adresse} />
                          </div>
                        )}

                        {/* Badges état */}
                        <div className="flex flex-wrap gap-1.5">
                          <span className={cn("badge border text-xs", l.etatSignature === "Signé" ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200")}>{l.etatSignature ?? "—"}</span>
                          <span className={cn("badge border text-xs", l.etatQuitus === "Envoyé" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200")}>Quitus : {l.etatQuitus ?? "—"}</span>
                          {logement.aRelancer !== undefined && (
                            <span className={cn("badge border text-xs flex items-center gap-1", logement.aRelancer ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-green-100 text-green-700 border-green-200")}>
                              <Bell size={10} />{logement.aRelancer ? "À relancer" : "OK"}
                            </span>
                          )}
                          {logement.materielManquant !== undefined && (
                            <span className={cn("badge border text-xs flex items-center gap-1", logement.materielManquant ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200")}>
                              <Package size={10} />{logement.materielManquant ? "Matériel manquant" : "Matériel Ok"}
                            </span>
                          )}
                          {logement.typesDemande && <span className="badge bg-secondary/10 text-secondary-600 border-secondary/20 text-xs">{logement.typesDemande}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== OPÉRATIONS ===== */}
        {activeTab === "operations" && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={13} className="text-secondary-text" />
                  <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Filtres</p>
                  {filtresOpActifs && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex items-center gap-2">
                  {filtresOpActifs && (
                    <button onClick={resetFiltresOperations} className="flex items-center gap-1 text-xs text-error hover:text-error/80 transition-colors font-medium">
                      <RotateCcw size={11} />Réinitialiser
                    </button>
                  )}
                  <button onClick={() => setShowFiltres(v => !v)} className="flex items-center gap-1 text-xs text-secondary-text hover:text-primary transition-colors">
                    {showFiltres ? <><ChevronUp size={14} />Masquer</> : <><ChevronDown size={14} />Afficher</>}
                  </button>
                </div>
              </div>
              {showFiltres && (
                <div className="flex flex-wrap gap-1.5">
                  {LISTE_ETATS.map(e => <FilterChip key={e} label={e} active={filtreEtatOperation.includes(e)} onClick={() => setFiltreEtatOperation(toggleFilter(filtreEtatOperation, e, [...LISTE_ETATS]))} />)}
                </div>
              )}
            </div>
            {operationsFiltrees.length === 0 ? (
              <EmptyState icon={<Building2 size={28} />} title="Aucun chantier trouvé" />
            ) : (
              <div className="space-y-2">
                {operationsFiltrees.map(op => {
                  const opE = operationsEnrichies.get(op.id);
                  const nb = logements.filter(l => {
                    const id = typeof l.operationRef === "string" ? l.operationRef : (l.operationRef as { id?: string })?.id;
                    return id === op.id;
                  }).length;
                  return (
                    <div key={op.id} className="card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer" onClick={() => router.push(`/chantiers/${op.id}`)}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-xs text-secondary-text bg-primary-bg px-2 py-0.5 rounded">{op.numChantier || "—"}</span>
                              <BadgeEtat etat={op.etatChantier} />
                            </div>
                            <p className="font-semibold text-primary-text">{op.nomChantier}</p>
                            <p className="text-xs text-secondary-text mt-0.5">
                              {nb} logement{nb !== 1 ? "s" : ""} · Créé le {formatDate(op.dateCreate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={e => { e.stopPropagation(); router.push(`/chantiers/${op.id}`); }}
                              className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all" title="Modifier">
                              <Pencil size={13} />
                            </button>
                            {confirmDeleteOpId === op.id ? (
                              <button onClick={e => { e.stopPropagation(); deleteOperation(op.id); }}
                                disabled={deleting}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-error text-white text-xs font-semibold">
                                <AlertTriangle size={11} />Confirmer
                              </button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); setConfirmDeleteOpId(op.id); setTimeout(() => setConfirmDeleteOpId(null), 3000); }}
                                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all" title="Supprimer">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Conducteur de travaux */}
                        {opE?.conducteurNom && opE.conducteurNom !== "—" && (
                          <div className="flex items-center gap-1.5 text-xs text-secondary-text">
                            {opE.conducteurPhoto ? (
                              <img src={opE.conducteurPhoto} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="text-[9px] font-bold text-primary">{opE.conducteurNom.charAt(0)}</span>
                              </div>
                            )}
                            
                            <span>{opE.conducteurNom}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
