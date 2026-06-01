"use client";
// src/app/interventions/[id]/page.tsx — Complet avec toutes les infos Flutter

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const MapInterventions = dynamic(() => import("@/components/ui/MapInterventions").then(m => ({ default: m.MapInterventions })), { ssr: false, loading: () => null });
import {
  doc, updateDoc, Timestamp, DocumentReference, addDoc, deleteField,
  collection, onSnapshot, deleteDoc, serverTimestamp, getDoc, getDocs, query, where
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, isSalarie } from "@/store/authStore";
import { subscribeIntervention, updateIntervention, createRelance, countRelances, resolveUserNom, resolveLogementInfo, resolveOperationInfo, type InterventionDetail } from "@/lib/formsService";
import { subscribeWorkflowByPlanning, lancerWorkflow, arreterWorkflowByPlanning, type WorkflowRelance } from "@/lib/workflowRelanceService";
import { generateQuitusPdf } from "@/lib/generateQuitusPdf";
import { geocodeAddress, estimateTravelTime } from "@/lib/geocode";
import { LoadingPage, Spinner } from "@/components/ui";
import { NavButton } from "@/components/ui/NavButton";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft, Clock, User, Home, Building2, Pencil, Check, X,
  CheckCircle2, AlertCircle, FileText, Bell, Save, Camera, StickyNote,
  Trash2, Plus, Phone, Mail, MapPin, Key, Calendar, AlertTriangle, Upload,
  ChevronDown, ChevronUp, Lock, LockOpen, MessageSquare, Euro, Wrench,
  Download, Maximize2,
} from "lucide-react";
import toast from "react-hot-toast";

// ============================================
// Types
// ============================================
interface BatimentInfo {
  id: string; nomBatiment?: string; adresse?: string;
  codeInterphone?: string; informationsAcces?: string; dateReception?: Date;
}
interface LogementInfo {
  id: string; numLogement?: string; nomOccupant?: string;
  telOccupant?: string; mailOccupant?: string; etageLogement?: number;
  typeContact?: string; roleContact?: string;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function StatutBadge({ statut }: { statut?: string }) {
  const cfg = statut === "Réalisé" ? "bg-green-100 text-green-800 border-green-200"
    : statut === "Annulé" ? "bg-red-100 text-red-700 border-red-200"
    : "bg-yellow-100 text-yellow-800 border-yellow-200";
  return <span className={cn("badge border", cfg)}>{statut ?? "En attente"}</span>;
}

function Chips({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void; }) {
  return (
    <div><label className="text-xs font-medium text-secondary-text block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">{options.map(o => <button key={o} onClick={() => onChange(o)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", value === o ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{o}</button>)}</div>
    </div>
  );
}

// ============================================
// Signature Canvas avec présence + import image
// ============================================
function SignatureSection({ label, existing, presenceValue, onPresenceChange, onSave, onImport }: {
  label: string; existing?: string; presenceValue?: string;
  onPresenceChange?: (v: string) => void;
  onSave: (dataUrl: string) => Promise<void>;
  onImport?: (file: File) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"view" | "draw">(existing ? "view" : "draw");
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "draw" || locked) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    const pos = (e: MouseEvent | TouchEvent) => {
      const r = c.getBoundingClientRect(); const s = "touches" in e ? e.touches[0] : e;
      return { x: (s.clientX - r.left) * (c.width / r.width), y: (s.clientY - r.top) * (c.height / r.height) };
    };
    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: MouseEvent | TouchEvent) => { e.preventDefault(); if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing.current = false; };
    c.addEventListener("mousedown", start); c.addEventListener("mousemove", move); c.addEventListener("mouseup", end);
    c.addEventListener("touchstart", start, { passive: false }); c.addEventListener("touchmove", move, { passive: false }); c.addEventListener("touchend", end);
    return () => { c.removeEventListener("mousedown", start); c.removeEventListener("mousemove", move); c.removeEventListener("mouseup", end); c.removeEventListener("touchstart", start); c.removeEventListener("touchmove", move); c.removeEventListener("touchend", end); };
  }, [mode, locked]);

  const save = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try { await onSave(canvasRef.current.toDataURL("image/png")); setMode("view"); toast.success("Signature enregistrée !"); }
    catch { /* erreurs spécifiques gérées par le callback */ } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-alternate pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-primary-text">{label}</p>
        {(existing || mode === "view") && <button onClick={() => setMode(mode === "view" ? "draw" : "view")} className="text-xs text-primary font-semibold">{mode === "view" ? "Re-signer" : "Annuler"}</button>}
      </div>

      {/* Présence occupant (uniquement pour signature client) */}
      {onPresenceChange && (
        <div className="mb-3">
          <p className="text-xs font-medium text-secondary-text mb-1.5">L&apos;occupant était-il présent ?</p>
          <div className="flex gap-2">
            {["Oui", "Non"].map(v => (
              <button key={v} onClick={() => onPresenceChange(v)}
                className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",
                  presenceValue === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "view" && existing ? (
        <div className="flex items-center gap-3 p-2 bg-green-50 rounded-xl">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <img src={existing} alt="signature" className="max-h-16 rounded border border-alternate" />
        </div>
      ) : (
        <div>
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={400} height={120}
              className={cn(
                "w-full border-2 rounded-xl bg-white",
                locked ? "border-alternate cursor-default" : "border-dashed border-primary/40 cursor-crosshair touch-none"
              )}
            />
            {locked && (
              <button
                onClick={() => setLocked(false)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/90 rounded-xl text-secondary-text hover:text-primary transition-colors"
              >
                <Lock size={18} />
                <span className="text-xs font-medium">Toucher pour signer</span>
              </button>
            )}
          </div>
          {!locked && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => { const ctx = canvasRef.current?.getContext("2d"); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }} className="btn-outline text-xs px-3 py-1.5">Effacer</button>
              <button onClick={save} disabled={saving} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5 py-1.5">{saving ? <Spinner size="sm" /> : <Check size={12} />}Valider</button>
              <button onClick={() => setLocked(true)} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"><Lock size={11} />Verrouiller</button>
              {onImport && (
                <button onClick={() => importRef.current?.click()} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"><Upload size={12} />Importer</button>
              )}
            </div>
          )}
          {onImport && (
            <input ref={importRef} type="file" accept="image/*" className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f && onImport) { await onImport(f); setMode("view"); } e.target.value = ""; }} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Page principale
// ============================================
export default function DetailsInterventionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [inter, setInter] = useState<InterventionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nbRelances, setNbRelances] = useState(0);
  const [techNom, setTechNom] = useState("");
  const [logementFull, setLogementFull] = useState<LogementInfo | null>(null);
  const [batimentFull, setBatimentFull] = useState<BatimentInfo | null>(null);
  const [chantierInfo, setChantierInfo] = useState({ nom: "—", num: "—" });
  const [photosApres, setPhotosApres] = useState<{ id: string; url: string }[]>([]);
  const [uploadingApres, setUploadingApres] = useState(false);
  const photosApresInputRef = useRef<HTMLInputElement>(null);

  // Édition infos
  const [editInfos, setEditInfos] = useState(false);
  const [statut, setStatut] = useState(""); const [travauxFinis, setTravauxFinis] = useState("");
  const [presenceOccupant, setPresenceOccupant] = useState(""); const [facturable, setFacturable] = useState("");
  const [nomFact, setNomFact] = useState(""); const [mailFact, setMailFact] = useState("");
  const [savingInfos, setSavingInfos] = useState(false);
  const [savingFacturation, setSavingFacturation] = useState(false);
  const [generatingQuitus, setGeneratingQuitus] = useState(false);

  // Édition date/heure
  const [editDate, setEditDate] = useState(false);
  const [newDate, setNewDate] = useState(""); const [newHeureDebut, setNewHeureDebut] = useState("");
  const [newHeureFin, setNewHeureFin] = useState(""); const [savingDate, setSavingDate] = useState(false);

  // CR
  const [editCR, setEditCR] = useState(false); const [cr, setCr] = useState(""); const [savingCR, setSavingCR] = useState(false);

  // Signature
  const [nomSignataire, setNomSignataire] = useState(""); const [prenomSignataire, setPrenomSignataire] = useState("");
  const [presenceSignataire, setPresenceSignataire] = useState("");
  const [editSignataire, setEditSignataire] = useState(false);
  const [savingSignataire, setSavingSignataire] = useState(false);
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");

  // Relance simple
  const [showRelance, setShowRelance] = useState(false); const [motifRelance, setMotifRelance] = useState(""); const [savingRelance, setSavingRelance] = useState(false);

  // Workflow relance client
  const [workflow, setWorkflow] = useState<WorkflowRelance | null | undefined>(undefined);
  const [showStartWorkflow, setShowStartWorkflow] = useState(false);
  const [noteWorkflow, setNoteWorkflow] = useState("");
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [editingPhaseNum, setEditingPhaseNum] = useState<2 | 3 | 4 | null>(null);
  const [editPhaseDate, setEditPhaseDate] = useState("");
  const [savingPhaseEdit, setSavingPhaseEdit] = useState(false);
  const [editingAnnotationNum, setEditingAnnotationNum] = useState<2 | 3 | 4 | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  // Suppression
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  // Édition numéro quitus
  const [editQuitusNum, setEditQuitusNum] = useState(false);
  const [newQuitusNum, setNewQuitusNum] = useState("");
  const [savingQuitusNum, setSavingQuitusNum] = useState(false);

  // Vue planning technicien (existant)
  const [showPlanningTech, setShowPlanningTech] = useState(false);
  const [planningTech, setPlanningTech] = useState<{ id: string; dateRdv?: Date; heureRdv?: Date; logementNum: string }[]>([]);

  // Assignation technicien inline
  const [showAssignTech, setShowAssignTech] = useState(false);
  const [techniciens, setTechniciens] = useState<{id: string; displayName: string; photoUrl?: string; adresseDepart?: string; adresseDepartLat?: number; adresseDepartLon?: number}[]>([]);
  const [travelEstimates, setTravelEstimates] = useState<Map<string, { minutes: number; distanceKm: number } | null>>(new Map());
  const [assignTechId, setAssignTechId] = useState("");
  const [savingTech, setSavingTech] = useState(false);
  const [planningPerTech, setPlanningPerTech] = useState<Map<string, { id: string; dateRdv?: Date; heureRdv?: Date; heureFinRdv?: Date | null; logementNum: string; batimentAdresse?: string }[]>>(new Map());
  const [expandedTechPlanning, setExpandedTechPlanning] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"tech" | "sous-traitant">("tech");
  const [sousTraitantNom, setSousTraitantNom] = useState("");

  // Chevauchement horaires
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Photos après lock + lightbox
  const [photosApresLocked, setPhotosApresLocked] = useState(true);
  const [lightboxUrlApres, setLightboxUrlApres] = useState<string | null>(null);

  // Heures d'intervention — edit mode
  const [editHeures, setEditHeures] = useState(false);
  const [heureDebutEdit, setHeureDebutEdit] = useState("");
  const [heureFinEdit, setHeureFinEdit] = useState("");
  const [savingHeures, setSavingHeures] = useState(false);

  const planRef = doc(db, "Planning", id) as DocumentReference;

  const addHistorique = useCallback(async (action: string, typeNote = "Historique") => {
    const { firebaseUser: fbu, userApp: ua } = useAuthStore.getState();
    if (!fbu) return;
    const auteur = ua?.displayName ?? fbu.displayName ?? fbu.email ?? "Utilisateur";
    await addDoc(collection(db, "Notes_travaux"), {
      notes: `${auteur} : ${action}`,
      type_note: typeNote,
      ref_planning: doc(db, "Planning", id),
      note_par: doc(db, "usersapp", fbu.uid),
      date_create: serverTimestamp(),
      auto: "Oui",
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeIntervention(id, async item => {
      if (!item) { if (!deletingRef.current) toast.error("Intervention introuvable"); router.back(); return; }
      setInter(item);
      setCr(item.compteRenduTechnicien ?? "");
      setNewQuitusNum(String(item.numQuitus ?? ""));
      setStatut(item.statutRdv ?? ""); setTravauxFinis(item.travauxFinis ?? "");
      setPresenceOccupant(item.presenceOccupant ?? ""); setFacturable(item.demandeFacturable ?? "");
      setNomFact(item.nomFacturation ?? ""); setMailFact(item.mailFacturation ?? "");
      setNomSignataire(item.nomClientSignataire ?? ""); setPrenomSignataire(item.prenomClientSignature ?? "");
      setPresenceSignataire(item.presenceOccupant ?? "");
      setHeureArrivee(item.heureArrivee ?? ""); setHeureDepart(item.heureDepart ?? "");
      if (item.dateRdv) setNewDate(format(item.dateRdv, "yyyy-MM-dd"));
      if (item.heureRdv) setNewHeureDebut(format(item.heureRdv, "HH:mm"));
      if (item.heureFinRdv) setNewHeureFin(format(item.heureFinRdv, "HH:mm"));
      if (item.refUsers) {
        const nom = await resolveUserNom(item.refUsers);
        setTechNom(nom);
      } else if (item.sousTraitant) setTechNom(item.sousTraitant);

      // Charger infos logement complètes
      if (item.refLogement) {
        const logSnap = await getDoc(item.refLogement);
        if (logSnap.exists()) {
          const d = logSnap.data();
          setLogementFull({ id: logSnap.id, numLogement: d.num_logement, nomOccupant: d.nom_occupant, telOccupant: d.tel_occupant, mailOccupant: d.mail_occupant, etageLogement: d.etage_logement, typeContact: d.type_contact, roleContact: d.role_contact });
          // Charger infos bâtiment
          if (d.batiment_ref) {
            const batSnap = await getDoc(d.batiment_ref as DocumentReference);
            if (batSnap.exists()) {
              const b = batSnap.data();
              setBatimentFull({ id: batSnap.id, nomBatiment: b.nom_batiment, adresse: b.adresse_batiment ?? b.adresse, codeInterphone: b.code_interphone, informationsAcces: b.informations_acces, dateReception: b.date_reception?.toDate() });
            }
          }
        }
      }
      if (item.refOperation) {
        const info = await resolveOperationInfo(item.refOperation);
        setChantierInfo(info);
      }
      setLoading(false);
    });

    // Photos après
    const unsubPhotos = onSnapshot(collection(db, "Planning", id, "Photo_apres"), snap => {
      setPhotosApres(snap.docs.map(d => ({ id: d.id, url: d.data().photos_apres as string })));
    });
    countRelances(id).then(setNbRelances);
    const unsubWorkflow = subscribeWorkflowByPlanning(id, w => setWorkflow(w ?? null));
    // Charger la liste des techniciens
    getDocs(query(collection(db, "usersapp"), where("actif", "==", true)))
      .then(snap => setTechniciens(snap.docs.map(d => ({
        id: d.id,
        displayName: (d.data().display_name as string) ?? `${d.data().prenom ?? ""} ${d.data().nom ?? ""}`.trim(),
        photoUrl: d.data().photo_url as string ?? undefined,
        adresseDepart: d.data().adresse_depart as string | undefined,
        adresseDepartLat: d.data().adresse_depart_lat as number | undefined,
        adresseDepartLon: d.data().adresse_depart_lon as number | undefined,
      }))));
    return () => { unsub(); unsubPhotos(); unsubWorkflow(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSaveInfos = async () => {
    setSavingInfos(true);
    try { await updateIntervention(id, { statutRdv: statut, demandeFacturable: facturable, nomFacturation: nomFact, mailFacturation: mailFact }); setEditInfos(false); toast.success("Mis à jour"); }
    catch { toast.error("Erreur"); } finally { setSavingInfos(false); }
  };

  const handleSaveCR = async () => {
    setSavingCR(true);
    try { await updateIntervention(id, { compteRenduTechnicien: cr, travauxFinis }); addHistorique("Compte rendu mis à jour", "Compte rendu").catch(() => {}); setEditCR(false); toast.success("CR sauvegardé"); }
    catch { toast.error("Erreur"); } finally { setSavingCR(false); }
  };

  const handleSaveSignataire = async () => {
    setSavingSignataire(true);
    try {
      await updateDoc(planRef, { nomClientSignataire: nomSignataire, prenomClientSignature: prenomSignataire, presence_occupant: presenceSignataire });
      setEditSignataire(false);
      toast.success("Informations signataire mises à jour");
    } catch { toast.error("Erreur"); } finally { setSavingSignataire(false); }
  };

  const handleSaveHeures = async () => {
    setSavingHeures(true);
    try {
      const updates: Record<string, unknown> = {};
      if (heureDebutEdit) { const [h, m] = heureDebutEdit.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heureDebutInter = Timestamp.fromDate(d); }
      if (heureFinEdit) { const [h, m] = heureFinEdit.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heureFinInter = Timestamp.fromDate(d); }
      if (Object.keys(updates).length) await updateDoc(planRef, updates);
      setEditHeures(false);
      toast.success("Heures mises à jour !");
    } catch { toast.error("Erreur"); } finally { setSavingHeures(false); }
  };

  const checkOverlap = useCallback(async (date: string, heureDebut: string, heureFin: string) => {
    if (!date || !heureDebut) { setOverlapWarning(null); return; }
    const startH = parseInt(heureDebut.split(":")[0]) * 60 + parseInt(heureDebut.split(":")[1]);
    const endH = heureFin ? parseInt(heureFin.split(":")[0]) * 60 + parseInt(heureFin.split(":")[1]) : startH + 60;
    const dayStart = new Date(date + "T00:00:00");
    const dayEnd = new Date(date + "T23:59:59");
    try {
      // Une seule requête : tous les plannings de ce jour
      const snap = await getDocs(query(
        collection(db, "Planning"),
        where("date_rdv", ">=", Timestamp.fromDate(dayStart)),
        where("date_rdv", "<=", Timestamp.fromDate(dayEnd))
      ));
      const conflictsMap = new Map<string, string>(); // techId → displayName
      snap.docs.forEach(d => {
        if (d.id === id) return;
        const h = d.data().heure_rdv?.toDate?.();
        if (!h) return;
        const hf = d.data().heure_fin_rdv?.toDate?.() ?? null;
        const tStart = h.getHours() * 60 + h.getMinutes();
        const tEnd = hf ? hf.getHours() * 60 + hf.getMinutes() : tStart + 60;
        if (!(startH < tEnd && endH > tStart)) return;
        const refUsers = d.data().ref_users as DocumentReference | undefined;
        if (!refUsers) return;
        const techId = refUsers.id;
        // Si un tech est déjà assigné, on ne rapporte que ses conflits
        if (inter?.refUsers && techId !== inter.refUsers.id) return;
        const tech = techniciens.find(t => t.id === techId);
        if (tech) conflictsMap.set(techId, tech.displayName);
      });
      if (conflictsMap.size === 0) {
        setOverlapWarning(null);
      } else if (inter?.refUsers) {
        setOverlapWarning(`${conflictsMap.size} chevauchement(s) détecté(s) pour ${techNom} ce jour-là.`);
      } else {
        const names = Array.from(conflictsMap.values());
        setOverlapWarning(`Créneau occupé pour : ${names.join(", ")}.`);
      }
    } catch { setOverlapWarning(null); }
  }, [inter?.refUsers, id, techNom, techniciens]);

  useEffect(() => {
    if (!editDate) { setOverlapWarning(null); return; }
    const timer = setTimeout(() => checkOverlap(newDate, newHeureDebut, newHeureFin), 600);
    return () => clearTimeout(timer);
  }, [newDate, newHeureDebut, newHeureFin, editDate, checkOverlap]);

  // Calcul d'estimation de trajet dès qu'un technicien est sélectionné
  useEffect(() => {
    if (!assignTechId) return;
    const tech = techniciens.find(t => t.id === assignTechId);
    const dest = batimentFull?.adresse;
    if (!dest || !tech) return;
    const techItems = planningPerTech.get(assignTechId) ?? [];
    const others = techItems.filter(p => p.id !== id && p.batimentAdresse);
    const currentDateRdv = inter?.dateRdv;
    const prevItem = currentDateRdv
      ? (others.filter(p => p.dateRdv && p.dateRdv < currentDateRdv).pop() ?? null)
      : null;
    const originAddress = prevItem?.batimentAdresse ?? tech.adresseDepart;
    if (!originAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const destCoords = await geocodeAddress(dest);
        const originCoords: [number, number] | null = (!prevItem && tech.adresseDepartLat && tech.adresseDepartLon)
          ? [tech.adresseDepartLat, tech.adresseDepartLon]
          : await geocodeAddress(originAddress);
        if (cancelled || !destCoords || !originCoords) return;
        const est = estimateTravelTime(originCoords[0], originCoords[1], destCoords[0], destCoords[1]);
        setTravelEstimates(prev => new Map(prev).set(assignTechId, est));
      } catch {
        if (!cancelled) setTravelEstimates(prev => new Map(prev).set(assignTechId, null));
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignTechId, batimentFull?.adresse, planningPerTech]);

  // Auto-charger le planning du technicien sélectionné pour estimer le trajet
  useEffect(() => {
    if (!assignTechId || !showAssignTech) return;
    if (planningPerTech.has(assignTechId)) return;
    const techRef = doc(db, "usersapp", assignTechId);
    getDocs(query(collection(db, "Planning"), where("ref_users", "==", techRef))).then(async snap => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const items = await Promise.all(snap.docs
        .filter(d => { const dr = d.data().date_rdv?.toDate?.(); return dr && dr >= today; })
        .map(async d => {
          const logRef = (d.data().ref_logement ?? d.data().logement_ref) as DocumentReference | undefined;
          let logNum = "—"; let batimentAdresse: string | undefined;
          if (logRef) {
            try {
              const ls = await getDoc(logRef);
              if (ls.exists()) {
                logNum = ls.data().num_logement;
                const batRef = ls.data().batiment_ref as DocumentReference | undefined;
                if (batRef) {
                  const batSnap = await getDoc(batRef);
                  if (batSnap.exists()) batimentAdresse = (batSnap.data().adresse_batiment ?? batSnap.data().adresse) as string | undefined;
                }
              }
            } catch {}
          }
          return { id: d.id, dateRdv: d.data().date_rdv?.toDate?.(), heureRdv: d.data().heure_rdv?.toDate?.(), heureFinRdv: d.data().heure_fin_rdv?.toDate?.() ?? null, logementNum: logNum, batimentAdresse };
        })
      );
      items.sort((a, b) => (a.dateRdv?.getTime() ?? 0) - (b.dateRdv?.getTime() ?? 0));
      setPlanningPerTech(prev => new Map(prev).set(assignTechId, items));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignTechId, showAssignTech]);

  const handleSaveDate = async () => {
    setSavingDate(true);
    try {
      const updates: Record<string, unknown> = {};
      if (newDate) updates.date_rdv = Timestamp.fromDate(new Date(newDate));
      if (newHeureDebut) { const [h, m] = newHeureDebut.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heure_rdv = Timestamp.fromDate(d); }
      if (newHeureFin) { const [h, m] = newHeureFin.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heure_fin_rdv = Timestamp.fromDate(d); }
      if (inter?.refLogement) await updateDoc(inter.refLogement, { etat_chantier: "Planifié" });
      await updateDoc(planRef, updates);
      // RDV pris → arrêter le workflow de relance s'il est actif
      if (newDate) arreterWorkflowByPlanning(id).catch(console.error);
      const datePart = newDate ? new Date(newDate + "T12:00:00").toLocaleDateString("fr-FR") : "";
      const heurePart = newHeureDebut ? ` à ${newHeureDebut}${newHeureFin ? ` – ${newHeureFin}` : ""}` : "";
      addHistorique(`RDV planifié : ${datePart}${heurePart}`, "Planification").catch(() => {});
      setEditDate(false); toast.success("Date/heure mise à jour !");
    } catch { toast.error("Erreur"); } finally { setSavingDate(false); }
  };

  const handleClearDate = async () => {
    try {
      await updateDoc(planRef, { date_rdv: deleteField(), heure_rdv: deleteField(), heure_fin_rdv: deleteField() });
      addHistorique("Date et heures de RDV effacées", "Planification").catch(() => {});
      setEditDate(false); toast.success("Date effacée");
    } catch { toast.error("Erreur"); }
  };

  const uploadSig = async (dataUrl: string, field: string): Promise<string> => {
    let blob: Blob;
    if (dataUrl.startsWith("data:")) { const res = await fetch(dataUrl); blob = await res.blob(); }
    else { blob = dataUrl as unknown as Blob; } // file import
    const r = storageRef(storage, `signatures/${field}_${id}_${Date.now()}.png`);
    await uploadBytes(r, blob); return getDownloadURL(r);
  };

  const handleSigClient = async (dataUrl: string) => {
    if (!nomSignataire.trim()) {
      toast.error("Veuillez renseigner le nom du signataire client avant de signer");
      setEditSignataire(true);
      throw new Error("validation");
    }
    const url = await uploadSig(dataUrl, "client");
    await updateDoc(planRef, { signatureClient: url, nomClientSignataire: nomSignataire, prenomClientSignature: prenomSignataire, presence_occupant: presenceSignataire, date_signature_client: serverTimestamp() });
    if (inter?.refLogement) await updateDoc(inter.refLogement, { etat_signature: "Signé" });
    addHistorique("Signature client enregistrée", "Signature client").catch(() => {});
  };

  const handleImportSigClient = async (file: File) => {
    const r = storageRef(storage, `signatures/client_import_${id}_${Date.now()}`);
    await uploadBytes(r, file); const url = await getDownloadURL(r);
    await updateDoc(planRef, { signatureClient: url, nomClientSignataire: nomSignataire, prenomClientSignature: prenomSignataire, presence_occupant: "Non", date_signature_client: serverTimestamp() });
  };

  const handleSigTech = async (dataUrl: string) => {
    if (!heureArrivee) { toast.error("Veuillez indiquer l'heure d'arrivée du technicien"); throw new Error("validation"); }
    if (!heureDepart) { toast.error("Veuillez indiquer l'heure de départ du technicien"); throw new Error("validation"); }
    const url = await uploadSig(dataUrl, "tech");
    await updateDoc(planRef, {
      signature_technicien: url,
      date_signature_technicien: serverTimestamp(),
      heure_arrivee_tech: heureArrivee,
      heure_depart_tech: heureDepart,
    });
    addHistorique(`Signature technicien — arrivée ${heureArrivee}, départ ${heureDepart}`, "Signature technicien").catch(() => {});
  };

  // Quitus PDF upload manuel
  const handleQuitusUpload = async (file: File) => {
    try {
      const r = storageRef(storage, `quitus/${id}_${Date.now()}_${file.name}`);
      await uploadBytes(r, file); const url = await getDownloadURL(r);
      await updateDoc(planRef, { quitus_pdf: url });
      addHistorique("Quitus PDF importé manuellement", "Quitus").catch(() => {});
      toast.success("Quitus PDF importé !");
    } catch { toast.error("Erreur upload quitus"); }
  };

  const handleEditPhaseDate = async (phaseNum: 2 | 3 | 4) => {
    if (!editPhaseDate || !workflow) return;
    setSavingPhaseEdit(true);
    try {
      const fieldMap: Record<2|3|4, string> = { 2: "date_relance_2", 3: "date_relance_3", 4: "date_relance_4" };
      const notifIdMap: Record<2|3|4, string | undefined> = { 2: workflow.notifPhase2Id, 3: workflow.notifPhase3Id, 4: workflow.notifPhase4Id };
      const ts = Timestamp.fromDate(new Date(editPhaseDate));
      await updateDoc(doc(db, "Workflow_relance", workflow.id), { [fieldMap[phaseNum]]: ts });
      const notifId = notifIdMap[phaseNum];
      if (notifId) await updateDoc(doc(db, "Notifications", notifId), { date_declenchement: ts });
      setEditingPhaseNum(null);
      toast.success("Date de relance mise à jour !");
    } catch { toast.error("Erreur"); } finally { setSavingPhaseEdit(false); }
  };

  const handleDeletePhase = async (phaseNum: 2 | 3 | 4) => {
    if (!workflow) return;
    const notifIdMap: Record<2|3|4, string | undefined> = { 2: workflow.notifPhase2Id, 3: workflow.notifPhase3Id, 4: workflow.notifPhase4Id };
    const fieldMap: Record<2|3|4, string> = { 2: "notif_phase2_id", 3: "notif_phase3_id", 4: "notif_phase4_id" };
    const notifId = notifIdMap[phaseNum];
    if (notifId) await updateDoc(doc(db, "Notifications", notifId), { etat_notification: "Lue", date_lecture: serverTimestamp() }).catch(() => {});
    await updateDoc(doc(db, "Workflow_relance", workflow.id), { [fieldMap[phaseNum]]: null });
    toast.success("Relance supprimée");
  };

  const handleSaveAnnotation = async (phaseNum: 2 | 3 | 4) => {
    if (!workflow) return;
    setSavingAnnotation(true);
    try {
      const fieldMap: Record<2|3|4, string> = { 2: "note_phase_2", 3: "note_phase_3", 4: "note_phase_4" };
      await updateDoc(doc(db, "Workflow_relance", workflow.id), { [fieldMap[phaseNum]]: annotationText });
      setEditingAnnotationNum(null);
      toast.success("Annotation enregistrée");
    } catch { toast.error("Erreur"); } finally { setSavingAnnotation(false); }
  };

  const handleLancerWorkflow = async () => {
    if (!firebaseUser) return;
    setSavingWorkflow(true);
    try {
      await lancerWorkflow({
        planningId: id,
        logementRef: inter?.refLogement,
        nomContact: logementFull?.nomOccupant ?? inter?.nomFacturation ?? "",
        telContact: logementFull?.telOccupant ?? "",
        mailContact: logementFull?.mailOccupant ?? inter?.mailFacturation ?? "",
        numLogement: logementFull?.numLogement ?? "",
        quitusNumero: inter?.quitusNumero ?? `Quitus n°${inter?.numQuitus ?? ""}`,
        noteInitiale: noteWorkflow,
        createParRef: doc(db, "usersapp", firebaseUser.uid),
        targetUserRef: doc(db, "usersapp", firebaseUser.uid),
      });
      setShowStartWorkflow(false);
      setNoteWorkflow("");
      addHistorique("Suivi de relances client lancé", "Relances").catch(() => {});
      toast.success("Système de relance lancé ! Des rappels vous seront envoyés automatiquement.");
    } catch (e) { console.error(e); toast.error("Erreur lors du lancement"); }
    finally { setSavingWorkflow(false); }
  };

  const deleteStorageUrl = async (url: string) => {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return;
    try {
      const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
      await deleteObject(storageRef(storage, path));
    } catch {}
  };

  const handleDeleteIntervention = async () => {
    setDeleting(true);
    deletingRef.current = true;
    try {
      // Photos avant : Firestore + Storage
      const photosAvantSnap = await getDocs(collection(db, "Planning", id, "Photo_avant"));
      await Promise.all(photosAvantSnap.docs.map(async d => {
        await deleteStorageUrl(d.data().photos_avant as string);
        await deleteDoc(d.ref);
      }));
      // Photos après : Firestore + Storage
      const photosApresSnap = await getDocs(collection(db, "Planning", id, "Photo_apres"));
      await Promise.all(photosApresSnap.docs.map(async d => {
        await deleteStorageUrl(d.data().photos_apres as string);
        await deleteDoc(d.ref);
      }));
      // Signatures Storage
      if (inter?.signatureClient) await deleteStorageUrl(inter.signatureClient);
      if (inter?.signatureTechnicien) await deleteStorageUrl(inter.signatureTechnicien);
      // Quitus PDF Storage
      if (inter?.quitusPdf) await deleteStorageUrl(inter.quitusPdf);
      // Matériel
      const matSnap = await getDocs(query(collection(db, "Materiel_tache"), where("planning_ref", "==", planRef)));
      await Promise.all(matSnap.docs.map(d => deleteDoc(d.ref)));
      // Notes_travaux
      const notesSnap = await getDocs(query(collection(db, "Notes_travaux"), where("ref_planning", "==", planRef)));
      await Promise.all(notesSnap.docs.map(d => deleteDoc(d.ref)));
      // Arrêter le workflow relance
      await arreterWorkflowByPlanning(id).catch(() => {});
      // Supprimer l'intervention
      await deleteDoc(planRef);
      toast.success("Intervention supprimée");
      router.back();
    } catch {
      deletingRef.current = false;
      toast.error("Erreur lors de la suppression");
      setDeleting(false);
    }
  };

  const handleSaveQuitusNum = async () => {
    const num = parseInt(newQuitusNum);
    if (!num || num < 1) { toast.error("Numéro invalide"); return; }
    setSavingQuitusNum(true);
    try {
      await updateDoc(planRef, { num_quitus: num, quitus_numero: `Quitus n°${num}` });
      setEditQuitusNum(false);
      toast.success("Numéro de quitus mis à jour !");
    } catch { toast.error("Erreur"); } finally { setSavingQuitusNum(false); }
  };

  const handleGenerateQuitus = async () => {
    if (!inter) return;
    setGeneratingQuitus(true);
    try {
      const blob = await generateQuitusPdf({
        numDossier: chantierInfo.num,
        numQuitus: inter.numQuitus,
        typeIntervention: inter.typeDemande,
        nomChantier: chantierInfo.nom,
        adresseChantier: batimentFull?.adresse,
        dateRdv: inter.dateRdv,
        heureRdv: inter.heureRdv,
        batiment: batimentFull?.nomBatiment,
        logement: logementFull?.numLogement,
        nomClient: logementFull?.nomOccupant,
        telClient: logementFull?.telOccupant,
        tache: inter.descriptifTravaux,
        cr: inter.compteRenduTechnicien,
        travauxFinis: inter.travauxFinis,
        presenceOccupant: inter.presenceOccupant,
        nomTechnicien: techNom,
        heureDebutInter: inter.heureDebutInter,
        heureFinInter: inter.heureFinInter,
        signatureTechnicien: inter.signatureTechnicien,
        dateSignatureClient: inter.dateSignatureClient,
        nomSignataire: inter.nomClientSignataire,
        prenomSignataire: inter.prenomClientSignature,
        signatureClient: inter.signatureClient,
      });
      // Upload to Firebase Storage
      const r = storageRef(storage, `quitus/${id}_${Date.now()}.pdf`);
      await uploadBytes(r, blob, { contentType: "application/pdf" });
      const url = await getDownloadURL(r);
      await updateDoc(planRef, { quitus_pdf: url });
      if (inter.refLogement) await updateDoc(inter.refLogement, { etat_quitus: "Envoyé" });
      addHistorique("Quitus généré", "Quitus").catch(() => {});
      toast.success("Quitus généré et sauvegardé !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération du quitus");
    } finally {
      setGeneratingQuitus(false);
    }
  };

  const handleAssignTech = async () => {
    if (assignMode === "tech" && !assignTechId) return;
    if (assignMode === "sous-traitant" && !sousTraitantNom.trim()) return;
    setSavingTech(true);
    try {
      if (assignMode === "tech") {
        await updateDoc(planRef, { ref_users: doc(db, "usersapp", assignTechId), sous_traitant_si_pas_tech: null });
        const t = techniciens.find(t => t.id === assignTechId);
        if (t) setTechNom(t.displayName);
        addHistorique(`Technicien assigné : ${t?.displayName ?? assignTechId}`, "Assignation").catch(() => {});
        // Invalider le cache — la prochaine ouverture du modal recharge le planning à jour
        setPlanningPerTech(prev => { const next = new Map(prev); next.delete(assignTechId); return next; });
        toast.success("Technicien assigné !");
      } else {
        await updateDoc(planRef, { sous_traitant_si_pas_tech: sousTraitantNom.trim(), ref_users: null });
        setTechNom(sousTraitantNom.trim());
        addHistorique(`Sous-traitant assigné : ${sousTraitantNom.trim()}`, "Assignation").catch(() => {});
        toast.success("Sous-traitant assigné !");
      }
      setShowAssignTech(false);
    } catch { toast.error("Erreur"); } finally { setSavingTech(false); }
  };

  const loadTechPlanningForModal = async (techId: string) => {
    if (planningPerTech.has(techId)) {
      setExpandedTechPlanning(prev => prev === techId ? null : techId);
      return;
    }
    const techRef = doc(db, "usersapp", techId);
    const snap = await getDocs(query(collection(db, "Planning"), where("ref_users", "==", techRef)));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const items = await Promise.all(snap.docs
      .filter(d => { const dr = d.data().date_rdv?.toDate?.(); return dr && dr >= today; })
      .map(async d => {
        const logRef = (d.data().ref_logement ?? d.data().logement_ref) as DocumentReference | undefined;
        let logNum = "—";
        let batimentAdresse: string | undefined;
        if (logRef) {
          try {
            const ls = await getDoc(logRef);
            if (ls.exists()) {
              logNum = ls.data().num_logement;
              const batRef = ls.data().batiment_ref as DocumentReference | undefined;
              if (batRef) {
                const batSnap = await getDoc(batRef);
                if (batSnap.exists()) batimentAdresse = (batSnap.data().adresse_batiment ?? batSnap.data().adresse) as string | undefined;
              }
            }
          } catch {}
        }
        return { id: d.id, dateRdv: d.data().date_rdv?.toDate?.(), heureRdv: d.data().heure_rdv?.toDate?.(), heureFinRdv: d.data().heure_fin_rdv?.toDate?.() ?? null, logementNum: logNum, batimentAdresse };
      })
    );
    items.sort((a, b) => (a.dateRdv?.getTime() ?? 0) - (b.dateRdv?.getTime() ?? 0));
    setPlanningPerTech(prev => new Map(prev).set(techId, items));
    setExpandedTechPlanning(techId);
  };

  // Vue planning technicien (fiche)
  const loadPlanningTech = async () => {
    if (!inter?.refUsers) return;
    const snap = await getDocs(query(collection(db, "Planning"), where("ref_users", "==", inter.refUsers)));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const items = await Promise.all(snap.docs
      .filter(d => { const dr = d.data().date_rdv?.toDate?.(); return dr && dr >= today; })
      .map(async d => {
        const logRef = d.data().ref_logement as DocumentReference;
        let logNum = "—";
        if (logRef) { try { const ls = await getDoc(logRef); if (ls.exists()) logNum = ls.data().num_logement; } catch {} }
        return { id: d.id, dateRdv: d.data().date_rdv?.toDate?.(), heureRdv: d.data().heure_rdv?.toDate?.(), logementNum: logNum };
      })
    );
    items.sort((a, b) => (a.dateRdv?.getTime() ?? 0) - (b.dateRdv?.getTime() ?? 0));
    setPlanningTech(items);
    setShowPlanningTech(true);
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  if (!inter) return null;

  // Vérifie si un item de planning chevauche le créneau en cours d'édition (ou existant)
  const isItemOverlap = (p: { dateRdv?: Date; heureRdv?: Date; heureFinRdv?: Date | null }) => {
    if (!newDate || !newHeureDebut || !p.dateRdv || !p.heureRdv) return false;
    if (p.dateRdv.toDateString() !== new Date(newDate + "T00:00:00").toDateString()) return false;
    const startH = parseInt(newHeureDebut.split(":")[0]) * 60 + parseInt(newHeureDebut.split(":")[1]);
    const endH = newHeureFin ? parseInt(newHeureFin.split(":")[0]) * 60 + parseInt(newHeureFin.split(":")[1]) : startH + 60;
    const tStart = p.heureRdv.getHours() * 60 + p.heureRdv.getMinutes();
    const tEnd = p.heureFinRdv ? p.heureFinRdv.getHours() * 60 + p.heureFinRdv.getMinutes() : tStart + 60;
    return startH < tEnd && endH > tStart;
  };

  const salarie = isSalarie(userApp);
  const dateLabel = inter.dateRdv ? format(inter.dateRdv, "EEEE dd MMMM yyyy", { locale: fr }) : "Date non définie";
  const heureLabel = inter.heureRdv ? `${format(inter.heureRdv, "HH:mm")}${inter.heureFinRdv ? ` – ${format(inter.heureFinRdv, "HH:mm")}` : ""}` : null;
  const tempsAlloue = inter.tempsAlloue;
  const isPlanifie = !!inter.dateRdv;

  // Panneau de trajet pour la modale d'assignation (affiché dès la sélection d'un tech)
  const selectedTech = assignTechId ? techniciens.find(t => t.id === assignTechId) : null;
  const selectedTechItems = assignTechId ? (planningPerTech.get(assignTechId) ?? []) : [];
  const selectedTechOthers = selectedTechItems.filter(p => p.id !== id && p.batimentAdresse);
  const selectedTechPrev = inter.dateRdv
    ? (selectedTechOthers.filter(p => p.dateRdv && p.dateRdv < inter.dateRdv!).pop() ?? null)
    : null;
  const selectedTechOriginAddress = selectedTechPrev?.batimentAdresse ?? selectedTech?.adresseDepart;
  const selectedTechOriginLabel = selectedTechPrev ? `Log. ${selectedTechPrev.logementNum}` : "domicile / dépôt";
  const selectedTechOriginCoords: [number, number] | undefined = (!selectedTechPrev && selectedTech?.adresseDepartLat && selectedTech?.adresseDepartLon)
    ? [selectedTech.adresseDepartLat!, selectedTech.adresseDepartLon!]
    : undefined;
  const selectedTechTravelEst = assignTechId ? travelEstimates.get(assignTechId) : undefined;
  const showTravelPanel = assignMode === "tech" && !!assignTechId && !!selectedTech && !!batimentFull?.adresse && !!selectedTechOriginAddress;

  const quitusReqs = [
    { label: "Signature technicien", done: !!inter.signatureTechnicien },
    { label: "Compte rendu rédigé", done: !!inter.compteRenduTechnicien?.trim() },
  ];
  const canGenerateQuitus = quitusReqs.every(r => r.done);

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5 overflow-x-hidden">

        {/* Header */}
        <div className="flex items-start gap-2 mb-5 flex-wrap">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary shrink-0"><ArrowLeft size={20} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-primary-text capitalize leading-tight" style={{ fontFamily: "var(--font-inter-tight)" }}>{dateLabel}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {inter.quitusPdf && <a href={inter.quitusPdf} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1"><FileText size={11} />Quitus</a>}
              {!salarie && inter.refOperation && (
                <button onClick={() => router.push(`/chantiers/${(inter.refOperation as any).id}`)}
                  className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                  <Building2 size={11} />Voir le chantier
                </button>
              )}
              {!salarie && logementFull && (
                <button onClick={() => router.push(`/logements/${logementFull.id}`)}
                  className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                  <Home size={11} />Fiche logement
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {!salarie && <button onClick={() => router.push(`/interventions/${id}/modifier`)} className="btn-outline flex items-center gap-1.5 text-sm"><Pencil size={14} />Modifier</button>}
            {isAdmin(userApp) && (
              confirmDelete ? (
                <button
                  onClick={handleDeleteIntervention}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error text-white text-sm font-semibold"
                >
                  <AlertTriangle size={14} />{deleting ? "…" : "Confirmer"}
                </button>
              ) : (
                <button
                  onClick={() => { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }}
                  className="p-2 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
                  title="Supprimer l'intervention"
                >
                  <Trash2 size={16} />
                </button>
              )
            )}
            <StatutBadge statut={inter.statutRdv} />
          </div>
        </div>

        {/* Infos principales */}
        <div className="card overflow-hidden mb-4">
          <div className="h-1.5 bg-primary" />
          <div className="p-4">
            {/* Heure + date modifiable */}
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                {heureLabel && <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg"><Clock size={14} /><span className="text-sm font-bold">{heureLabel}</span></div>}
                {tempsAlloue && <span className="text-xs text-secondary-text">({tempsAlloue}h alloué)</span>}
                {inter.typeDemande && <span className="badge bg-secondary/15 text-secondary-600 border-secondary/20">{inter.typeDemande}</span>}
              </div>
              {!salarie && <button onClick={() => setEditDate(!editDate)} className="text-xs text-primary font-semibold flex items-center gap-1 shrink-0"><Pencil size={12} />Date</button>}
            </div>
            {editDate && (
              <div className="bg-primary-bg rounded-xl p-3 mb-3 space-y-2 animate-slide-up">
                <div><label className="text-xs font-medium text-secondary-text">Date</label><input className="input-base mt-1" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium text-secondary-text">Heure début</label><input className="input-base mt-1" type="time" value={newHeureDebut} onChange={e => setNewHeureDebut(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-secondary-text">Heure fin</label><input className="input-base mt-1" type="time" value={newHeureFin} onChange={e => setNewHeureFin(e.target.value)} /></div>
                </div>
                {tempsAlloue && <p className="text-xs text-secondary-text flex items-center gap-1"><AlertTriangle size={11} className="text-tertiary" />Temps alloué : {tempsAlloue}h</p>}
                {(() => {
                  if (!tempsAlloue || !newHeureDebut || !newHeureFin) return null;
                  const [dh, dm] = newHeureDebut.split(":").map(Number);
                  const [fh, fm] = newHeureFin.split(":").map(Number);
                  const durationMin = (fh * 60 + fm) - (dh * 60 + dm);
                  if (durationMin <= 0) return null;
                  const allocMin = Math.round(Number(tempsAlloue) * 60);
                  if (durationMin === allocMin) return null;
                  const durH = Math.floor(durationMin / 60);
                  const durM = durationMin % 60;
                  const durLabel = durH > 0 ? `${durH}h${durM > 0 ? String(durM).padStart(2, "0") : ""}` : `${durM} min`;
                  return (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">Durée saisie ({durLabel}) différente du temps alloué ({tempsAlloue}h). Vous pouvez confirmer quand même.</p>
                    </div>
                  );
                })()}
                {overlapWarning && (
                  <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <AlertTriangle size={15} className="text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-orange-700">Chevauchement détecté</p>
                      <p className="text-xs text-orange-600 mt-0.5">{overlapWarning}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleSaveDate} disabled={savingDate} className="btn-primary flex items-center gap-2 flex-1 text-sm">{savingDate ? <Spinner size="sm" /> : <Check size={13} />}Confirmer{overlapWarning ? " quand même" : ""}</button>
                  <button onClick={() => setEditDate(false)} className="btn-outline px-3"><X size={13} /></button>
                </div>
                {(inter?.dateRdv || inter?.heureRdv) && (
                  <button onClick={handleClearDate} className="text-xs text-error flex items-center gap-1 mt-1 hover:underline">
                    <Trash2 size={11} />Effacer la date et les heures
                  </button>
                )}
              </div>
            )}

            {/* Logement */}
            {logementFull && (
              <div className="bg-primary-bg rounded-xl p-3 mb-3">
                <div className="flex items-center gap-1.5 mb-2"><Home size={13} className="text-secondary-text" /><p className="text-xs font-bold text-secondary-text uppercase">Logement</p></div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><span className="text-sm font-bold text-primary-text">{logementFull.numLogement}</span>{logementFull.etageLogement !== undefined && <span className="badge bg-primary/10 text-primary border-primary/20 text-xs">Niv. {logementFull.etageLogement}</span>}</div>
                  {logementFull.nomOccupant && <p className="text-sm text-primary-text">{logementFull.nomOccupant}</p>}
                  {logementFull.typeContact && <p className="text-xs text-secondary-text">{logementFull.typeContact}{logementFull.roleContact ? ` — ${logementFull.roleContact}` : ""}</p>}
                  {(logementFull.telOccupant || logementFull.mailOccupant) && (
                    <div className="mt-1.5 space-y-1.5">
                      {logementFull.telOccupant && (
                        <div>
                          <p className="text-xs text-primary-text mb-1">{logementFull.telOccupant}</p>
                          <div className="flex gap-1.5">
                            <a href={`tel:${logementFull.telOccupant}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200 hover:bg-green-100 transition-colors"><Phone size={11} />Appeler</a>
                            <a href={`sms:${logementFull.telOccupant}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 hover:bg-blue-100 transition-colors"><MessageSquare size={11} />SMS</a>
                            {inter.dateRdv && (
                              <div className="relative group">
                                <a
                                  href={`sms:${logementFull.telOccupant}?body=${encodeURIComponent(`Bonjour${logementFull.nomOccupant ? ` ${logementFull.nomOccupant}` : ""},\n\nNous vous rappelons votre rendez-vous prévu le ${format(inter.dateRdv, "dd MMMM yyyy", { locale: fr })}${inter.heureRdv ? ` à ${format(inter.heureRdv, "HH:mm")}` : ""}.\n\nCordialement,\nClimat Confort Moreau`)}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100 transition-colors"
                                >
                                  <Calendar size={11} />Rappel RDV
                                  <span className="ml-1 text-[9px] bg-violet-200 text-violet-800 px-1 rounded font-bold">BONUS</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {logementFull.mailOccupant && (
                        <div>
                          <p className="text-xs text-primary-text mb-1 break-all">{logementFull.mailOccupant}</p>
                          <a href={`mailto:${logementFull.mailOccupant}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20 transition-colors w-fit"><Mail size={11} />E-mail</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bâtiment */}
            {batimentFull && (
              <div className="bg-primary-bg rounded-xl p-3 mb-3">
                <div className="flex items-center gap-1.5 mb-2"><Building2 size={13} className="text-secondary-text" /><p className="text-xs font-bold text-secondary-text uppercase">Bâtiment — {batimentFull.nomBatiment}</p></div>
                <div className="space-y-1.5">
                  {batimentFull.adresse && (
                    <div className="flex items-start gap-2">
                      <MapPin size={13} className="text-secondary-text shrink-0 mt-0.5" />
                      <div className="flex-1"><p className="text-sm text-primary-text">{batimentFull.adresse}</p></div>
                      <NavButton adresse={batimentFull.adresse} />
                    </div>
                  )}
                  {batimentFull.codeInterphone && <div className="flex items-center gap-2"><Key size={13} className="text-secondary-text shrink-0" /><p className="text-sm text-primary-text">Code : <span className="font-bold font-mono">{batimentFull.codeInterphone}</span></p></div>}
                  {batimentFull.informationsAcces && <div className="bg-white rounded-lg px-3 py-2"><p className="text-xs text-secondary-text mb-0.5">Infos d&apos;accès</p><p className="text-sm text-primary-text">{batimentFull.informationsAcces}</p></div>}
                  {batimentFull.dateReception && <div className="flex items-center gap-2"><Calendar size={13} className="text-secondary-text shrink-0" /><p className="text-xs text-secondary-text">Réception : {formatDate(batimentFull.dateReception)}</p></div>}
                </div>
              </div>
            )}

            {/* Chantier */}
            <div className="flex items-center gap-2 mb-2 text-xs text-secondary-text">
              <Building2 size={12} /><span>{chantierInfo.nom} <span className="text-xs">({chantierInfo.num})</span></span>
            </div>

            {/* Technicien / Sous-traitant */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center shrink-0"><User size={14} className="text-secondary-600" /></div>
              <div className="flex-1">
                <p className="text-xs text-secondary-text">{inter.sousTraitant && !inter.refUsers ? "Sous-traitant" : "Technicien"}</p>
                <p className="text-sm font-semibold">{techNom || <span className="text-secondary-text italic font-normal">Non assigné</span>}</p>
                {inter.sousTraitant && !inter.refUsers && <span className="badge bg-orange-100 text-orange-700 border-orange-200 text-xs mt-0.5">Sous-traitant</span>}
              </div>
              {!salarie && (
              <div className="flex flex-col gap-1.5 shrink-0 items-end">
                {techNom && <button onClick={loadPlanningTech} className="text-xs text-primary font-semibold flex items-center gap-1"><Calendar size={12} />Planning</button>}
                <div className="flex flex-col gap-1">
                  {techNom && (
                    <button onClick={async () => {
                      try { await updateDoc(planRef, { ref_users: null, sous_traitant_si_pas_tech: null }); setTechNom(""); addHistorique("Technicien désassigné", "Assignation").catch(() => {}); toast.success("Technicien désassigné"); }
                      catch { toast.error("Erreur"); }
                    }} className="btn-outline text-xs px-2.5 py-1.5 flex items-center gap-1 text-error border-error/30 hover:bg-red-50">
                      <X size={12} />Désassigner
                    </button>
                  )}
                  <button onClick={() => {
                    const currentTechId = inter.refUsers?.id;
                    // Invalider le cache du tech actuel pour recharger son planning à jour
                    if (currentTechId) {
                      setPlanningPerTech(prev => { const next = new Map(prev); next.delete(currentTechId); return next; });
                    }
                    setAssignTechId(currentTechId ?? "");
                    setSousTraitantNom(inter.sousTraitant ?? "");
                    setAssignMode(inter.sousTraitant && !inter.refUsers ? "sous-traitant" : "tech");
                    setExpandedTechPlanning(null);
                    setShowAssignTech(true);
                  }} className="btn-outline text-xs px-2.5 py-1.5 flex items-center gap-1">
                    <User size={12} />{techNom ? "Changer" : "Assigner"}
                  </button>
                </div>
              </div>
              )}
            </div>

            {inter.descriptifTravaux && <div className="bg-primary-bg rounded-xl p-3 mt-3"><p className="text-xs text-secondary-text mb-1">Descriptif</p><p className="text-sm">{inter.descriptifTravaux}</p></div>}
          </div>
        </div>

        {/* Vue planning technicien */}
        {showPlanningTech && (
          <div className="card overflow-hidden mb-4 animate-slide-up">
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Planning de {techNom}</p>
              <button onClick={() => setShowPlanningTech(false)}><X size={14} className="text-secondary-text" /></button>
            </div>
            <div className="p-4">
              {planningTech.length === 0 ? <p className="text-sm text-secondary-text italic">Aucun RDV à venir.</p> : (
                <div className="space-y-2">
                  {planningTech.map(p => (
                    <div key={p.id} className={cn("flex items-center gap-3 p-2.5 rounded-xl border", p.id === id ? "bg-primary/5 border-primary/30" : "bg-secondary-bg border-alternate")}>
                      <div className="text-center w-16 shrink-0">
                        {p.dateRdv && <><p className="text-xs font-bold text-primary-text">{format(p.dateRdv, "dd MMM", { locale: fr })}</p><p className="text-xs text-secondary-text">{format(p.dateRdv, "EEE", { locale: fr })}</p></>}
                      </div>
                      <div className="flex-1">
                        {p.heureRdv && <p className="text-xs font-semibold text-secondary-text">{format(p.heureRdv, "HH:mm")}</p>}
                        <p className="text-sm font-semibold text-primary-text">Logement {p.logementNum}</p>
                      </div>
                      {p.id === id && <span className="badge bg-primary/10 text-primary border-primary/20 text-xs">Ce RDV</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raccourcis navigation */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => router.push(`/interventions/${id}/notes`)} className="card p-3 flex items-center gap-2.5 hover:shadow-card-hover active:opacity-75 transition-all text-left">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><StickyNote size={14} className="text-primary" /></div>
            <div className="min-w-0"><p className="text-xs font-semibold leading-tight">Notes & Historique</p><p className="text-xs text-secondary-text">Événements</p></div>
          </button>
          <button onClick={() => router.push(`/interventions/${id}/details`)} className="card p-3 flex items-center gap-2.5 hover:shadow-card-hover active:opacity-75 transition-all text-left">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0"><Camera size={14} className="text-secondary-600" /></div>
            <div className="min-w-0"><p className="text-xs font-semibold leading-tight">Photos & Matériel</p><p className="text-xs text-secondary-text">Avant / Matériaux</p></div>
          </button>
        </div>

        {/* Informations */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations</p>
            {!salarie && !editInfos && <button onClick={() => setEditInfos(true)} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Modifier</button>}
          </div>
          {!editInfos ? (
            <div className="divide-y divide-alternate/60 text-sm">
              {/* Facturation */}
              <div className="flex items-center gap-3 py-2.5 px-4">
                <p className="text-xs text-secondary-text w-28 shrink-0 flex items-center gap-1">Facturation</p>
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {inter.demandeFacturable && <span className="font-medium">{inter.demandeFacturable === "Travaux facturables" ? "Facturable" : "Non facturable"}</span>}
                  {inter.demandeFacturable === "Travaux facturables" && (
                    <span className={cn("badge border text-xs ml-1",
                      inter.etatFacturation === "Facturé" ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200")}>
                      {inter.etatFacturation || "Non facturé"}
                    </span>
                  )}
                  {inter.demandeFacturable === "Travaux facturables" && inter.etatFacturation !== "Facturé" && (
                    <button disabled={savingFacturation} onClick={async () => {
                      setSavingFacturation(true);
                      try { await updateIntervention(id, { etatFacturation: "Facturé" }); toast.success("Marqué comme facturé !"); }
                      catch { toast.error("Erreur"); } finally { setSavingFacturation(false); }
                    }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200 hover:bg-green-100 transition-colors">
                      {savingFacturation ? <Spinner size="sm" /> : <Check size={11} />}Marquer facturé
                    </button>
                  )}
                </div>
              </div>
              {/* Sous-traitant */}
              {inter.sousTraitant && !inter.refUsers && (
                <div className="flex items-center gap-3 py-2.5 px-4">
                  <p className="text-xs text-secondary-text w-28 shrink-0 flex items-center gap-1"><User size={11} />Réalisé par</p>
                  <div className="flex items-center gap-2"><span className="font-medium">{inter.sousTraitant}</span><span className="badge bg-orange-100 text-orange-700 border-orange-200 text-xs">Sous-traitant</span></div>
                </div>
              )}
              {/* Autres infos */}
              {[
                ["Statut RDV", inter.statutRdv],
                ["Date de demande", inter.dateDemande ? formatDate(inter.dateDemande) : null],
                ["Temps alloué", inter.tempsAlloue ? `${inter.tempsAlloue}h` : null],
                ["Nom facturation", inter.nomFacturation],
                ["Email facturation", inter.mailFacturation],
              ].map(([label, val]) => val ? (
                <div key={label as string} className="flex items-start gap-3 py-2.5 px-4">
                  <p className="text-xs text-secondary-text w-28 shrink-0 pt-0.5">{label}</p>
                  <p className="font-medium min-w-0 break-words flex-1">{val}</p>
                </div>
              ) : null)}
              {inter.mailFacturation && (
                <div className="px-4 py-2.5">
                  <a href={`mailto:${inter.mailFacturation}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20 transition-colors w-fit">
                    <Mail size={11} />Envoyer e-mail facturation
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <Chips label="Statut" value={statut} options={["En attente", "Réalisé", "Annulé"]} onChange={setStatut} />
              <Chips label="Facturable" value={facturable} options={["Travaux facturables", "Travaux non facturables"]} onChange={setFacturable} />
              {facturable === "Travaux facturables" && (
                <>
                  <div><label className="text-xs font-medium text-secondary-text">Nom facturation</label><input className="input-base mt-1" value={nomFact} onChange={e => setNomFact(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-secondary-text">Email facturation</label><input className="input-base mt-1" type="email" value={mailFact} onChange={e => setMailFact(e.target.value)} /></div>
                </>
              )}
              <div className="flex gap-2"><button onClick={handleSaveInfos} disabled={savingInfos} className="btn-primary flex items-center gap-2 flex-1">{savingInfos ? <Spinner size="sm" /> : <Check size={14} />}Sauvegarder</button><button onClick={() => setEditInfos(false)} className="btn-outline px-4"><X size={14} /></button></div>
            </div>
          )}
        </div>

        {!salarie && <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Suivi de relances client</p>
              {workflow?.statut === "actif" && <span className="text-xs px-1.5 py-0.5 rounded-full bg-tertiary/20 text-tertiary font-bold animate-pulse">Actif</span>}
              {workflow?.statut === "arrete" && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">Stoppé</span>}
            </div>
            {workflow === undefined && <Spinner size="sm" />}
          </div>
          <div className="p-4">
            {workflow === null && !showStartWorkflow && (
              <div className="space-y-3">
                <p className="text-sm text-secondary-text">Aucune relance en cours. Si le client n'a pas répondu à votre appel, lancez le suivi automatique.</p>
                <button onClick={() => setShowStartWorkflow(true)} className="btn-outline w-full flex items-center justify-center gap-2">
                  <Phone size={14} />Lancer le suivi de relance (appel sans réponse)
                </button>
              </div>
            )}

            {workflow === null && showStartWorkflow && (
              <div className="space-y-3 animate-slide-up">
                <p className="text-xs font-medium text-secondary-text">Le client n'a pas répondu. Vous recevrez des rappels automatiques pour les relances suivantes.</p>
                <textarea className="input-base resize-none" rows={2} value={noteWorkflow} onChange={e => setNoteWorkflow(e.target.value)} placeholder="Note sur l'appel initial (optionnel)…" />
                <div className="flex gap-2">
                  <button onClick={handleLancerWorkflow} disabled={savingWorkflow} className="btn-primary flex items-center gap-2 flex-1">
                    {savingWorkflow ? <Spinner size="sm" /> : <Bell size={14} />}Confirmer et lancer
                  </button>
                  <button onClick={() => setShowStartWorkflow(false)} className="btn-outline px-4"><X size={14} /></button>
                </div>
              </div>
            )}

            {workflow?.statut === "actif" && (() => {
              const now = new Date();
              const phases = [
                { num: 1, label: "Appel initial — sans réponse", date: workflow.datePhase1, icon: <Phone size={13} />, type: "done", notePhase: workflow.noteInitiale },
                { num: 2, label: "Rappel téléphonique", date: workflow.dateRelance2, icon: <Phone size={13} />, action: workflow.telContact ? `tel:${workflow.telContact}` : null, actionLabel: workflow.telContact ? `Appeler ${workflow.telContact}` : null, type: workflow.dateRelance2 && workflow.dateRelance2 <= now ? "due" : "future", notePhase: workflow.notePhase2 },
                { num: 3, label: "Email de relance (manuel)", date: workflow.dateRelance3, icon: <Mail size={13} />, action: workflow.mailContact ? `mailto:${workflow.mailContact}?subject=Demande de rendez-vous – ${workflow.quitusNumero || "Intervention"}` : null, actionLabel: workflow.mailContact ? `Envoyer à ${workflow.mailContact}` : null, type: workflow.dateRelance3 && workflow.dateRelance3 <= now ? "due" : "future", notePhase: workflow.notePhase3 },
                { num: 4, label: "Email automatique", date: workflow.dateRelance4, icon: <Mail size={13} />, type: workflow.dateRelance4 && workflow.dateRelance4 <= now ? "due" : "future", notePhase: workflow.notePhase4,
                  autoMail: `mailto:${workflow.mailContact}?subject=${encodeURIComponent(`Demande d'intervention – ${workflow.quitusNumero || ""} – Logement ${workflow.numLogement || ""}`)}&body=${encodeURIComponent(`Bonjour${workflow.nomContact ? ` ${workflow.nomContact}` : ""},\n\nNous vous contactons suite à plusieurs tentatives pour convenir d'un rendez-vous concernant une intervention à réaliser pour le logement ${workflow.numLogement || ""}.\n\nMerci de nous contacter au plus tôt afin de planifier cette intervention.\n\nCordialement,\nClimat & Confort Moreau`)}` },
              ] as const;
              return (
                <div>
                  <div className="space-y-0 mb-4">
                    {phases.map((phase, i) => (
                      <div key={phase.num} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 text-xs font-bold",
                            phase.type === "done" ? "bg-green-500 border-green-500 text-white"
                            : phase.type === "due" ? "bg-tertiary border-tertiary text-white"
                            : "bg-secondary-bg border-alternate text-secondary-text")}>
                            {phase.type === "done" ? <Check size={12} /> : phase.icon}
                          </div>
                          {i < phases.length - 1 && <div className="w-0.5 h-4 bg-alternate my-0.5" />}
                        </div>
                        <div className="flex-1 pb-3 min-w-0">
                          <p className={cn("text-sm font-semibold leading-tight", phase.type === "done" ? "text-green-700" : phase.type === "due" ? "text-tertiary" : "text-secondary-text")}>
                            {phase.label}
                            {phase.type === "due" && <span className="ml-2 text-xs bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded-full">À faire</span>}
                          </p>
                          {phase.date && <p className="text-xs text-secondary-text mt-0.5">{phase.type === "done" ? "Effectué le " : "Prévu le "}{format(phase.date, "dd/MM/yyyy", { locale: fr })}</p>}
                          {phase.num === 1 && workflow.noteInitiale && <p className="text-xs text-secondary-text italic mt-0.5">{workflow.noteInitiale}</p>}
                          {phase.num !== 1 && phase.notePhase && <p className="text-xs text-secondary-text italic mt-0.5">{phase.notePhase}</p>}
                          {"action" in phase && phase.action && phase.type === "due" && (
                            <a href={phase.action} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors">
                              {phase.icon}{phase.actionLabel}
                            </a>
                          )}
                          {"autoMail" in phase && phase.autoMail && phase.type === "due" && (
                            <a href={phase.autoMail} className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors w-full justify-center">
                              <Mail size={14} />Envoyer l&apos;email automatique
                            </a>
                          )}
                          {/* Contrôles modifier/supprimer pour phases 2, 3, 4 */}
                          {phase.num !== 1 && (
                            editingPhaseNum === (phase.num as 2|3|4) ? (
                              <div className="flex items-center gap-2 mt-2">
                                <input type="date" className="input-base text-xs flex-1 py-1.5" value={editPhaseDate} onChange={e => setEditPhaseDate(e.target.value)} />
                                <button onClick={() => handleEditPhaseDate(phase.num as 2|3|4)} disabled={savingPhaseEdit} className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1">
                                  {savingPhaseEdit ? <Spinner size="sm" /> : <Check size={11} />}
                                </button>
                                <button onClick={() => setEditingPhaseNum(null)} className="btn-outline text-xs px-2 py-1.5"><X size={11} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 mt-1.5">
                                <button
                                  onClick={() => { setEditPhaseDate(phase.date ? format(phase.date, "yyyy-MM-dd") : ""); setEditingPhaseNum(phase.num as 2|3|4); }}
                                  className="text-xs text-secondary-text flex items-center gap-1 hover:text-primary transition-colors">
                                  <Pencil size={10} />Modifier date
                                </button>
                                <span className="text-alternate text-xs">·</span>
                                <button
                                  onClick={() => handleDeletePhase(phase.num as 2|3|4)}
                                  className="text-xs text-error flex items-center gap-1 hover:opacity-70 transition-opacity">
                                  <Trash2 size={10} />Supprimer
                                </button>
                              </div>
                            )
                          )}
                          {/* Annotation par phase */}
                          {phase.num !== 1 && (
                            editingAnnotationNum === (phase.num as 2|3|4) ? (
                              <div className="mt-2 space-y-1.5">
                                <textarea className="input-base resize-none text-xs py-1.5" rows={2} value={annotationText} onChange={e => setAnnotationText(e.target.value)} placeholder="Annotation sur cette relance…" />
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveAnnotation(phase.num as 2|3|4)} disabled={savingAnnotation} className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1">
                                    {savingAnnotation ? <Spinner size="sm" /> : <Check size={11} />}Enregistrer
                                  </button>
                                  <button onClick={() => setEditingAnnotationNum(null)} className="btn-outline text-xs px-2 py-1.5"><X size={11} /></button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAnnotationText(phase.notePhase ?? ""); setEditingAnnotationNum(phase.num as 2|3|4); }}
                                className="text-xs text-secondary-text flex items-center gap-1 hover:text-primary transition-colors mt-1">
                                <Pencil size={10} />{phase.notePhase ? "Modifier annotation" : "Annoter"}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={async () => { await arreterWorkflowByPlanning(id); addHistorique("Suivi de relances arrêté — RDV pris", "Relances").catch(() => {}); toast.success("Relances arrêtées — RDV pris !"); }}
                    className="btn-outline w-full flex items-center justify-center gap-2 text-sm text-green-700 border-green-200 hover:bg-green-50">
                    <Check size={14} />RDV pris — Arrêter les relances
                  </button>
                </div>
              );
            })()}

            {workflow?.statut === "arrete" && (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 size={16} />
                <p className="text-sm font-semibold">Relances arrêtées — Rendez-vous programmé.</p>
              </div>
            )}
          </div>
        </div>}

        {isPlanifie && (<>

        {/* Séparateur — Après l'intervention */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-alternate" />
          <span className="text-xs font-bold text-secondary-text uppercase tracking-widest whitespace-nowrap px-2">Après l&apos;intervention</span>
          <div className="flex-1 h-px bg-alternate" />
        </div>

        {/* Signatures */}
        <div className="card overflow-hidden mb-4">
          <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate"><p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Signatures & Heures</p></div>
          {/* Heures arrivée/départ — edit mode avec validation */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-secondary-text">Heures d&apos;intervention</p>
              {!editHeures ? (
                <button onClick={() => { setHeureDebutEdit(inter.heureDebutInter ? format(inter.heureDebutInter, "HH:mm") : ""); setHeureFinEdit(inter.heureFinInter ? format(inter.heureFinInter, "HH:mm") : ""); setEditHeures(true); }} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Modifier</button>
              ) : (
                <button onClick={() => setEditHeures(false)} className="text-xs text-secondary-text"><X size={14} /></button>
              )}
            </div>
            {!editHeures ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary-bg rounded-xl p-3">
                  <p className="text-xs text-secondary-text mb-0.5">Arrivée</p>
                  <p className="text-xl font-bold text-primary-text">{inter.heureDebutInter ? format(inter.heureDebutInter, "HH:mm") : "—"}</p>
                </div>
                <div className="bg-primary-bg rounded-xl p-3">
                  <p className="text-xs text-secondary-text mb-0.5">Départ</p>
                  <p className="text-xl font-bold text-primary-text">{inter.heureFinInter ? format(inter.heureFinInter, "HH:mm") : "—"}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 animate-slide-up">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-secondary-text">Heure arrivée tech.</label><input className="input-base mt-1" type="time" value={heureDebutEdit} onChange={e => setHeureDebutEdit(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-secondary-text">Heure départ tech.</label><input className="input-base mt-1" type="time" value={heureFinEdit} onChange={e => setHeureFinEdit(e.target.value)} /></div>
                </div>
                <div className="flex gap-2"><button onClick={handleSaveHeures} disabled={savingHeures} className="btn-primary flex items-center gap-2 flex-1 text-sm">{savingHeures ? <Spinner size="sm" /> : <Check size={13} />}Valider les heures</button><button onClick={() => setEditHeures(false)} className="btn-outline px-3"><X size={13} /></button></div>
              </div>
            )}
          </div>
          {/* Signataire client — éditable si pas encore signé, sinon verrouillé */}
          {inter.signatureClient && !editSignataire ? (
            <div className="px-4 pb-4">
              <div className="bg-primary-bg rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-secondary-text">Informations signataire</p>
                  <button onClick={() => setEditSignataire(true)} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Modifier</button>
                </div>
                {inter.nomClientSignataire || inter.prenomClientSignature ? (
                  <p className="text-sm font-medium text-primary-text">{inter.prenomClientSignature} {inter.nomClientSignataire}</p>
                ) : (
                  <p className="text-sm text-secondary-text italic">Non renseigné</p>
                )}
                {inter.presenceOccupant && (
                  <p className="text-xs text-secondary-text mt-0.5">Occupant {inter.presenceOccupant === "Oui" ? "présent" : "absent"}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-secondary-text">Nom signataire client</label>
                  <input className="input-base mt-1" value={nomSignataire} onChange={e => setNomSignataire(e.target.value)} placeholder="Nom" />
                </div>
                <div><label className="text-xs font-medium text-secondary-text">Prénom</label>
                  <input className="input-base mt-1" value={prenomSignataire} onChange={e => setPrenomSignataire(e.target.value)} placeholder="Prénom" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-secondary-text mb-1.5">L&apos;occupant était-il présent ?</p>
                <div className="flex gap-2">
                  {["Oui", "Non"].map(v => (
                    <button key={v} onClick={() => setPresenceSignataire(v)}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",
                        presenceSignataire === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveSignataire} disabled={savingSignataire} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                  {savingSignataire ? <Spinner size="sm" /> : <Check size={13} />}Sauvegarder
                </button>
                {inter.signatureClient && (
                  <button onClick={() => { setEditSignataire(false); setNomSignataire(inter.nomClientSignataire ?? ""); setPrenomSignataire(inter.prenomClientSignature ?? ""); setPresenceSignataire(inter.presenceOccupant ?? ""); }} className="btn-outline px-3"><X size={13} /></button>
                )}
              </div>
            </div>
          )}
          <div className="px-4 pb-4">
            <SignatureSection label="Signature client" existing={inter.signatureClient} onSave={handleSigClient} onImport={handleImportSigClient} />
          </div>
          <div className="px-4 pb-4 space-y-3">
            {!inter.signatureTechnicien && (
              <div className="bg-primary-bg rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-secondary-text">Horaires technicien <span className="text-error">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Heure d&apos;arrivée</label>
                    <input className="input-base mt-1" type="time" value={heureArrivee} onChange={e => setHeureArrivee(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Heure de départ</label>
                    <input className="input-base mt-1" type="time" value={heureDepart} onChange={e => setHeureDepart(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
            {inter.signatureTechnicien && (inter.heureArrivee || inter.heureDepart) && (
              <div className="bg-primary-bg rounded-xl p-3 flex gap-4 flex-wrap">
                {inter.heureArrivee && <p className="text-xs text-secondary-text">Arrivée : <span className="font-semibold text-primary-text">{inter.heureArrivee}</span></p>}
                {inter.heureDepart && <p className="text-xs text-secondary-text">Départ : <span className="font-semibold text-primary-text">{inter.heureDepart}</span></p>}
              </div>
            )}
            <SignatureSection label="Signature technicien" existing={inter.signatureTechnicien} onSave={handleSigTech} />
          </div>
        </div>

        {/* Compte rendu + Photos après */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Compte rendu & Photos</p>
            {!editCR && <button onClick={() => setEditCR(true)} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Rédiger</button>}
          </div>
          <div className="p-4">
            {!editCR ? (
              <div className="space-y-3">
                {/* Travaux finis */}
                <div className="flex items-center gap-2">
                  <Wrench size={13} className="text-secondary-text shrink-0" />
                  <p className="text-xs text-secondary-text">Travaux finis :</p>
                  <span className={cn("badge border text-xs",
                    inter.travauxFinis === "Oui" ? "bg-green-100 text-green-700 border-green-200"
                    : inter.travauxFinis === "Partiellement" ? "bg-orange-100 text-orange-700 border-orange-200"
                    : inter.travauxFinis === "Non" ? "bg-red-100 text-red-700 border-red-200"
                    : "bg-gray-100 text-gray-500 border-gray-200")}>
                    {inter.travauxFinis || "Non renseigné"}
                  </span>
                </div>
                <p className={cn("text-sm leading-relaxed", !inter.compteRenduTechnicien && "text-secondary-text italic")}>{inter.compteRenduTechnicien || "Aucun compte rendu"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Chips label="Travaux finis" value={travauxFinis} options={["Oui", "Non", "Partiellement"]} onChange={setTravauxFinis} />
                <textarea className="input-base resize-none" rows={5} value={cr} onChange={e => setCr(e.target.value)} placeholder="Travaux réalisés, observations…" />
                <div className="flex gap-2"><button onClick={handleSaveCR} disabled={savingCR} className="btn-primary flex items-center gap-2 flex-1">{savingCR ? <Spinner size="sm" /> : <Save size={14} />}Sauvegarder</button><button onClick={() => { setEditCR(false); setCr(inter.compteRenduTechnicien ?? ""); setTravauxFinis(inter.travauxFinis ?? ""); }} className="btn-outline px-4"><X size={14} /></button></div>
              </div>
            )}
            {/* Photos après */}
            <div className="mt-4 pt-4 border-t border-alternate">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-secondary-text">Photos après intervention</p>
                  {photosApres.length > 0 && (
                    <button onClick={() => setPhotosApresLocked(l => !l)} className={cn("flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border transition-colors", photosApresLocked ? "border-alternate text-secondary-text hover:border-primary/40" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100")}>
                      {photosApresLocked ? <><Lock size={10} />Verrouillé</> : <><LockOpen size={10} />Déverrouillé</>}
                    </button>
                  )}
                </div>
                <button onClick={() => photosApresInputRef.current?.click()} disabled={uploadingApres} className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                  {uploadingApres ? <Spinner size="sm" /> : <Camera size={13} />}Ajouter
                </button>
                <input ref={photosApresInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                  const files = Array.from(e.target.files ?? []); if (!files.length) return;
                  setUploadingApres(true);
                  for (const file of files) { try { const r = storageRef(storage, `interventions/${id}/apres/${Date.now()}_${file.name}`); const snap = await uploadBytes(r, file); const url = await getDownloadURL(snap.ref); await addDoc(collection(db, "Planning", id, "Photo_apres"), { photos_apres: url, date_create: serverTimestamp(), planning_ref: planRef }); } catch {} }
                  setUploadingApres(false); addHistorique(`${files.length} photo(s) après intervention ajoutée(s)`, "Photos").catch(() => {}); toast.success("Photos ajoutées !"); e.target.value = "";
                }} />
              </div>
              {photosApres.length === 0 ? (
                <button onClick={() => photosApresInputRef.current?.click()} className="w-full p-4 border-2 border-dashed border-alternate rounded-xl flex items-center justify-center gap-2 text-sm text-secondary-text hover:border-primary/40 transition-colors"><Camera size={18} />Ajouter des photos</button>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photosApres.map(p => (
                    <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square cursor-pointer" onClick={() => setLightboxUrlApres(p.url)}>
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <button onClick={e => { e.stopPropagation(); setLightboxUrlApres(p.url); }} className="p-1.5 bg-black/60 rounded-full text-white"><Maximize2 size={12} /></button>
                        {!photosApresLocked && (
                          <button onClick={async e => { e.stopPropagation(); await deleteDoc(doc(db, "Planning", id, "Photo_apres", p.id)); }} className="p-1.5 bg-error rounded-full text-white"><Trash2 size={12} /></button>
                        )}
                      </div>
                      {photosApresLocked && <div className="absolute bottom-1 right-1 bg-black/50 rounded-full p-0.5"><Lock size={9} className="text-white" /></div>}
                    </div>
                  ))}
                  <button onClick={() => photosApresInputRef.current?.click()} className="border-2 border-dashed border-alternate rounded-xl aspect-square flex items-center justify-center hover:border-primary/40"><Plus size={18} className="text-secondary-text" /></button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Séparateur — Clôture */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-alternate" />
          <span className="text-xs font-bold text-secondary-text uppercase tracking-widest whitespace-nowrap px-2">Clôture</span>
          <div className="flex-1 h-px bg-alternate" />
        </div>

        {/* Quitus */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Quitus</p>
              {inter.numQuitus && !editQuitusNum && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary text-white text-xs font-bold tracking-wide shadow-sm">
                  n°{inter.numQuitus}
                </span>
              )}
            </div>
            {!salarie && (!editQuitusNum
              ? <button onClick={() => { setNewQuitusNum(String(inter.numQuitus ?? "")); setEditQuitusNum(true); }} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />N°</button>
              : <button onClick={() => setEditQuitusNum(false)} className="text-xs text-secondary-text"><X size={14} /></button>
            )}
          </div>
          {editQuitusNum && (
            <div className="px-4 pt-3 pb-0 flex items-center gap-2 animate-slide-up">
              <input
                className="input-base flex-1"
                type="number"
                min="1"
                value={newQuitusNum}
                onChange={e => setNewQuitusNum(e.target.value)}
                placeholder="Numéro de quitus"
              />
              <button onClick={handleSaveQuitusNum} disabled={savingQuitusNum} className="btn-primary flex items-center gap-1.5 px-3 py-2.5 text-sm">
                {savingQuitusNum ? <Spinner size="sm" /> : <Check size={14} />}
              </button>
            </div>
          )}
          <div className="p-4 space-y-3">
            {inter.quitusPdf ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700"><CheckCircle2 size={16} /><p className="text-sm font-semibold">Quitus disponible</p></div>
                  {!salarie && <button
                    onClick={handleGenerateQuitus}
                    disabled={generatingQuitus}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all"
                  >
                    {generatingQuitus ? <Spinner size="sm" /> : <Download size={12} />}
                    {generatingQuitus ? "Génération…" : "Re-générer"}
                  </button>}
                </div>
                <a href={inter.quitusPdf} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5"><FileText size={16} />Télécharger le quitus PDF</a>
                <a
                  href={`mailto:${logementFull?.mailOccupant ?? ""}?subject=${encodeURIComponent(`Quitus n°${inter.numQuitus ?? ""} – ${chantierInfo.nom ?? "Intervention"}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint le quitus de votre intervention.\n\nLien de téléchargement : ${inter.quitusPdf}\n\nCordialement,\nClimate & Confort Moreau`)}`}
                  className="btn-outline w-full flex items-center justify-center gap-2 py-2.5 text-sm"
                >
                  <Mail size={16} />Envoyer par email
                </a>
              </div>
            ) : !salarie ? (
              <div className="space-y-2">
                {/* Conditions requises pour générer */}
                <p className="text-xs font-semibold text-secondary-text uppercase tracking-wide">Conditions pour générer</p>
                <div className="space-y-1.5">
                  {quitusReqs.map(req => (
                    <div key={req.label} className={cn("flex items-center gap-2 text-sm", req.done ? "text-green-700" : "text-secondary-text")}>
                      {req.done
                        ? <CheckCircle2 size={14} className="shrink-0 text-green-600" />
                        : <AlertCircle size={14} className="shrink-0 text-secondary-text/60" />}
                      <span>{req.label}</span>
                    </div>
                  ))}
                </div>
                <button
                  disabled={!canGenerateQuitus || generatingQuitus}
                  onClick={handleGenerateQuitus}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all",
                    canGenerateQuitus && !generatingQuitus
                      ? "bg-primary text-white hover:bg-primary-600 active:bg-primary-700 shadow-sm"
                      : "bg-alternate text-secondary-text opacity-60 cursor-not-allowed"
                  )}
                >
                  {generatingQuitus ? <><Spinner size="sm" />Génération en cours…</> : <><FileText size={15} />Générer le quitus</>}
                </button>
              </div>
            ) : null}
            {!salarie && <label className="w-full cursor-pointer">
              <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-alternate hover:border-primary/40 text-sm font-medium text-secondary-text hover:text-primary transition-colors">
                <Upload size={16} />Importer un quitus PDF manuellement
              </div>
              <input type="file" accept="application/pdf" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) await handleQuitusUpload(f); e.target.value = ""; }} />
            </label>}
          </div>
        </div>

        </>)}

      </div>

      {/* Lightbox photos après */}
      {lightboxUrlApres && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center" onClick={() => setLightboxUrlApres(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <a href={lightboxUrlApres} download className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"><Download size={15} />Télécharger</a>
            <button onClick={() => setLightboxUrlApres(null)} className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-white transition-colors"><X size={18} /></button>
          </div>
          <img src={lightboxUrlApres} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Modale assignation technicien */}
      {showAssignTech && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAssignTech(false); }}>
          <div className="bg-secondary-bg rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl flex flex-col max-h-[90dvh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-alternate shrink-0">
              <p className="font-bold text-primary-text">Assignation</p>
              <button onClick={() => setShowAssignTech(false)} className="p-1 hover:bg-alternate rounded-lg"><X size={18} className="text-secondary-text" /></button>
            </div>
            {/* Tabs Technicien / Sous-traitant */}
            <div className="flex gap-1 mx-3 mt-3 mb-1 bg-primary-bg border border-alternate rounded-xl p-1 shrink-0">
              {(["tech", "sous-traitant"] as const).map(mode => (
                <button key={mode} onClick={() => setAssignMode(mode)}
                  className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    assignMode === mode ? "bg-white text-primary shadow-sm" : "text-secondary-text")}>
                  {mode === "tech" ? "Technicien interne" : "Sous-traitant"}
                </button>
              ))}
            </div>

            {/* Carte de localisation de l'intervention — masquée quand le panneau trajet prend le relai */}
            {batimentFull?.adresse && !showTravelPanel && (
              <div className="px-3 pb-2 shrink-0">
                <p className="text-xs font-semibold text-secondary-text mb-1.5 flex items-center gap-1.5">
                  <MapPin size={11} />Localisation de l&apos;intervention
                  <span className="text-[8px] bg-violet-200 text-violet-800 px-1 rounded font-bold">BONUS</span>
                </p>
                <MapInterventions
                  markers={[{ id: "inter", label: batimentFull.nomBatiment ?? "Intervention", address: batimentFull.adresse, color: "primary" }]}
                  height="160px"
                />
              </div>
            )}

            {assignMode === "tech" ? (
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {techniciens.filter(t => t.displayName?.trim()).map(t => {
                  const techItems = planningPerTech.get(t.id) ?? [];
                  const techLoaded = planningPerTech.has(t.id);
                  const conflictItems = techLoaded ? techItems.filter(p => p.id !== id && isItemOverlap(p)) : [];
                  const hasConflict = techLoaded && conflictItems.length > 0;
                  return (
                    <div key={t.id}>
                      <button onClick={() => setAssignTechId(assignTechId === t.id ? "" : t.id)}
                        className={cn("w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left",
                          hasConflict ? "border-red-200 bg-red-50/60"
                          : assignTechId === t.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-primary-bg")}>
                        <div className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0", assignTechId === t.id ? "border-primary bg-primary" : "border-alternate")} />
                        {t.photoUrl ? (
                          <img src={t.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", hasConflict ? "bg-red-100" : "bg-secondary/15")}>
                            <span className={cn("text-xs font-bold", hasConflict ? "text-red-600" : "text-secondary-600")}>{t.displayName.charAt(0)}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-primary-text">{t.displayName}</span>
                          {(() => {
                            let displayAddr = t.adresseDepart;
                            if (planningPerTech.has(t.id)) {
                              const tItems = planningPerTech.get(t.id)!;
                              const others = tItems.filter(p => p.id !== id && p.batimentAdresse);
                              const prevItem = inter.dateRdv
                                ? (others.filter(p => p.dateRdv && p.dateRdv < inter.dateRdv!).pop() ?? null)
                                : null;
                              if (prevItem?.batimentAdresse) displayAddr = prevItem.batimentAdresse;
                            }
                            return displayAddr ? (
                              <p className="text-[10px] text-secondary-text flex items-center gap-1 mt-0.5 leading-tight">
                                <MapPin size={9} className="shrink-0" />
                                <span className="truncate">{displayAddr}</span>
                              </p>
                            ) : null;
                          })()}
                          {hasConflict && (
                            <p className="text-xs text-red-600 font-semibold flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={10} />{conflictItems.length} conflit(s) ce créneau
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {batimentFull?.adresse && (() => {
                            let originAddr = t.adresseDepart;
                            if (planningPerTech.has(t.id)) {
                              const tItems = planningPerTech.get(t.id)!;
                              const others = tItems.filter(p => p.id !== id && p.batimentAdresse);
                              const prevItem = inter.dateRdv
                                ? (others.filter(p => p.dateRdv && p.dateRdv < inter.dateRdv!).pop() ?? null)
                                : null;
                              if (prevItem?.batimentAdresse) originAddr = prevItem.batimentAdresse;
                            }
                            if (!originAddr) return null;
                            return (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddr)}&destination=${encodeURIComponent(batimentFull.adresse)}&travelmode=driving`}
                                target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className={cn("text-[10px] font-semibold flex items-center gap-0.5", hasConflict ? "text-red-500" : "text-primary")}
                              >
                                <MapPin size={9} />Itinéraire
                                <span className="text-[7px] bg-violet-200 text-violet-800 px-0.5 rounded font-bold ml-0.5">BONUS</span>
                              </a>
                            );
                          })()}
                          <button type="button" onClick={e => { e.stopPropagation(); loadTechPlanningForModal(t.id); }}
                            className={cn("text-xs font-semibold flex items-center gap-1", hasConflict ? "text-red-600" : "text-primary")}>
                            <Calendar size={11} />{expandedTechPlanning === t.id ? "Masquer" : "Planning"}
                          </button>
                        </div>
                      </button>
                      {expandedTechPlanning === t.id && (
                        <div className="mx-2 mb-1 rounded-xl border overflow-hidden border-alternate bg-primary-bg">
                          {hasConflict && (
                            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
                              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                              <p className="text-xs font-bold text-red-700">
                                {conflictItems.length} RDV en chevauchement avec ce créneau — assigner quand même ?
                              </p>
                            </div>
                          )}
                          {techItems.length === 0 ? (
                            <p className="text-xs text-secondary-text italic p-3">Aucun RDV à venir.</p>
                          ) : (
                            <>
                            <div className="divide-y divide-alternate/50 max-h-48 overflow-y-auto">
                              {techItems.map(p => {
                                const overlap = p.id !== id && isItemOverlap(p);
                                return (
                                  <div key={p.id} className={cn("flex items-center gap-2 px-3 py-2",
                                    overlap ? "bg-red-50 border-l-2 border-red-400"
                                    : p.id === id ? "bg-primary/5" : "")}>
                                    <div className="shrink-0 text-xs text-center w-12">
                                      {p.dateRdv && (
                                        <>
                                          <p className={cn("font-bold", overlap ? "text-red-700" : "text-primary-text")}>{format(p.dateRdv, "dd/MM", { locale: fr })}</p>
                                          <p className="text-secondary-text">{format(p.dateRdv, "EEE", { locale: fr })}</p>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {p.heureRdv && (
                                        <p className={cn("text-xs font-semibold", overlap ? "text-red-600" : "text-secondary-text")}>
                                          {format(p.heureRdv, "HH:mm")}{p.heureFinRdv ? ` – ${format(p.heureFinRdv, "HH:mm")}` : ""}
                                        </p>
                                      )}
                                      <p className={cn("text-xs font-semibold truncate", overlap ? "text-red-700" : "")}>Log. {p.logementNum}</p>
                                    </div>
                                    {overlap && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                                    {p.id === id && <span className="text-xs text-primary font-bold shrink-0">Ce RDV</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {(() => {
                              const dest = batimentFull?.adresse;
                              if (!dest) return null;
                              const tech = techniciens.find(x => x.id === t.id);
                              const others = techItems.filter(p => p.id !== id && p.batimentAdresse);
                              const prev = inter.dateRdv
                                ? (others.filter(p => p.dateRdv && p.dateRdv < inter.dateRdv!).pop() ?? null)
                                : null;
                              const originAddress = prev?.batimentAdresse ?? tech?.adresseDepart;
                              if (!originAddress) return null;
                              const originLabel = prev ? `Log. ${prev.logementNum}` : "domicile / dépôt";
                              const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddress)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
                              const travelEst = travelEstimates.get(t.id);
                              return (
                                <div className="border-t border-alternate px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-[10px] text-secondary-text flex items-center gap-1">
                                    <MapPin size={9} className="shrink-0" />
                                    Depuis {originLabel}
                                    {travelEst && (
                                      <span className="font-semibold text-primary-text ml-1">
                                        ~{formatMinutes(travelEst.minutes)} · ~{travelEst.distanceKm} km
                                      </span>
                                    )}
                                    <span className="text-[8px] bg-violet-200 text-violet-800 px-1 rounded font-bold ml-0.5">BONUS</span>
                                  </p>
                                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-primary font-semibold flex items-center gap-0.5 hover:underline shrink-0">
                                    <MapPin size={9} />Google Maps
                                  </a>
                                </div>
                              );
                            })()}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 flex-1">
                <label className="text-xs font-medium text-secondary-text block mb-1.5">Nom du sous-traitant</label>
                <input className="input-base" value={sousTraitantNom} onChange={e => setSousTraitantNom(e.target.value)}
                  placeholder="Ex: Entreprise Martin, Jean Dupont…" autoFocus />
                <p className="text-xs text-secondary-text mt-2">Le technicien interne ne sera pas assigné. Le sous-traitant sera affiché à la place.</p>
              </div>
            )}

            {/* Panneau de trajet — s'affiche dès qu'un tech est sélectionné */}
            {showTravelPanel && (
              <div className="px-3 pt-2 pb-2 border-t border-alternate shrink-0 bg-primary-bg">
                <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                  <p className="text-[10px] font-bold text-secondary-text uppercase tracking-wide flex items-center gap-1">
                    <MapPin size={9} />Trajet depuis {selectedTechOriginLabel}
                    <span className="text-[8px] bg-violet-200 text-violet-800 px-1 rounded font-bold">BONUS</span>
                  </p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedTechOriginAddress!)}&destination=${encodeURIComponent(batimentFull!.adresse)}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-primary font-semibold flex items-center gap-0.5 hover:underline">
                    <MapPin size={9} />Google Maps
                  </a>
                </div>
                {selectedTechTravelEst === undefined && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Spinner size="sm" />
                    <p className="text-[10px] text-secondary-text">Calcul du trajet…</p>
                  </div>
                )}
                {selectedTechTravelEst && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock size={10} className="text-secondary-text shrink-0" />
                    <p className="text-[10px] text-secondary-text">
                      ~<span className="font-bold text-primary-text">{formatMinutes(selectedTechTravelEst.minutes)}</span>
                      <span className="mx-1 opacity-50">·</span>
                      ~{selectedTechTravelEst.distanceKm} km
                      <span className="ml-1 text-[8px] italic">(estimation)</span>
                    </p>
                  </div>
                )}
                <MapInterventions
                  markers={[
                    { id: "origin", label: selectedTechOriginLabel, address: selectedTechOriginAddress!, coords: selectedTechOriginCoords, color: "green" },
                    { id: "dest", label: batimentFull?.nomBatiment ?? "Intervention", address: batimentFull!.adresse, color: "primary" },
                  ]}
                  height="110px"
                />
              </div>
            )}
            <div className="p-3 border-t border-alternate shrink-0" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              <button onClick={handleAssignTech}
                disabled={(assignMode === "tech" ? !assignTechId : !sousTraitantNom.trim()) || savingTech}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                {savingTech ? <Spinner size="sm" /> : <Check size={14} />}
                {assignMode === "tech" ? "Confirmer l'assignation" : "Assigner le sous-traitant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
