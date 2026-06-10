"use client";
// src/app/feuilles-heures/[id]/page.tsx

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  doc, addDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, deleteDoc,
  serverTimestamp, Timestamp, DocumentReference, query, where, orderBy, arrayUnion,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canCreateForOthers, isSalarie } from "@/store/authStore";
import { LoadingPage, Spinner, SearchInput } from "@/components/ui";
import { creerDiscussion, creerDiscussionGroupe, sendMessage, ajouterParticipants, updateDiscussionEtatDocument } from "@/lib/notifMessagerieService";
import { generateDocFhPdf } from "@/lib/generateDocFhPdf";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Save, Check, Info, Plus, Trash2, Send, Lock, Building2, ChevronDown, ChevronUp, FileText, Download, AlertTriangle, Clock, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { LISTE_SERVICES } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATS = ["Fiche d'heures", "Demande autorisation absence", "Fiche de retour Travaux imprévus", "Forfait Jour"];
const TYPES_FH = ["Plomberie", "Électricité", "SAV", "Atelier", "Dessin", "Magasin"];
const TYPES_ABSENCE = ["Congé payé", "Congé ancienneté", "Congé sans solde", "Jour de récupération", "Jour de repos", "Abs évènement familial"];
const ETATS = ["En attente", "En cours de traitement", "Validé", "Refusé"];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// Predefined task rows per FH type
// ⚠️ Vérifier que ces noms correspondent exactement à l'app Flutter (FFAppConstants)
const TACHES_PREDEFINIES: Record<string, string[]> = {
  "Plomberie": [
    "Préfabrication",
    "Livraison",
    "Incorporation",
    "Sous-sol",
    "Verticaux : chutes et réseau EU - EP colonnes VMC - 3CE",
    "Horizontaux : VP - VMC - Capteurs solaires",
    "Sorties de coffres EU - EV - VMC",
    "Chaufferie - locaux techniques",
    "Communs : Colonnes - Citerneau",
    "Plomberie (1ère intervention)",
    "Chauffage (1ère intervention)",
    "Electricité",
    "Plomberie (2e intervention)",
    "Chauffage (2e intervention)",
    "Percement et rebouchage",
    "Essais et réglages",
    "Finitions (pose abattants, réfrigérateurs, etc…)",
    "S.A.V.",
    "TMA ou TS (travaux hors marché de base)",
  ],
  "Électricité": [
    "Incorporation béton",
    "Installation provisoire chantier",
    "Sous-sol",
    "Incorporations placo - boîtiers",
    "Pose appareillages - goulottes (1ère intervention)",
    "Colonne - EDF - circuit terre",
    "Pose plaques - tableaux (2e intervention)",
    "Communs - Services Généraux - escalier - éclairage extérieur",
    "Essais et réglages",
    "Interphone - alarme - portiers",
    "Percement et rebouchage",
    "S.A.V.",
    "TMA ou TS (travaux hors marché de base)",
  ],
  "Dessin": [
    "Calcul (Plomberie - VMC - Solaire)",
    "Réservations + Exécution sous-sol (Plomberie - VMC - Solaire)",
    "Exécution niveaux + Schéma colonnes",
    "Réservations niveaux + combles",
    "Calcul (Chauffage)",
    "Exécution",
    "Réservations (Electricité)",
    "Plan coulage",
    "Tirage plans (Avant métré)",
    "Chiffrage",
    "DOE",
    "Carnet échantillons",
    "Réunion chantier - formation  - Divers",
    "CONGE",
  ],
  // SAV, Atelier, Magasin : pas de tâches prédéfinies → ajout manuel par chantier
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TacheFH {
  id?: string;
  nomLigne: string;
  case1: number; case2: number; case3: number; case4: number; case5: number;
}

interface ChantierFH {
  id?: string;
  nomChantier: string;
  numChantier: string;
  refOperationId?: string;
  taches: TacheFH[];
}

interface OperationOption {
  id: string;
  nomChantier: string;
  numChantier: string;
}

interface UserOption {
  id: string;
  uid: string;
  displayName: string;
  nom: string;
  prenom: string;
  service?: string;
  forfaitJour?: string;
}

interface ForfaitJourEntry {
  day: number;
  matin: string;
  apresMidi: string;
}

interface HistoriqueEntry {
  id: string;
  date?: Date;
  typeAction: string;
  auteurNom: string;
  etatDe?: string;
  etatVers?: string;
  commentaire?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const WEEKDAYS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const FJ_CODES = ["","X","JR","CP","JF","RH","ABS"];

function getEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const dy = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, mo - 1, dy);
}

function getFrenchHolidayDays(year: number, month: number): Set<number> {
  const days = new Set<number>();
  const add = (m: number, d: number) => { if (m === month) days.add(d); };
  add(1, 1); add(5, 1); add(5, 8); add(7, 14); add(8, 15); add(11, 1); add(11, 11); add(12, 25);
  const e = getEaster(year);
  const off = (n: number) => { const d = new Date(e); d.setDate(d.getDate() + n); add(d.getMonth() + 1, d.getDate()); };
  off(1); off(39); off(50); // Lundi Pâques, Ascension, Lundi Pentecôte
  return days;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) d.setUTCDate(1 + ((4 - d.getUTCDay()) + 7) % 7);
  return 1 + Math.round((firstThursday - d.valueOf()) / 604800000);
}

function getCalendarMonth(yearMonth: string): Array<{day: number; weekday: string; weekNum: number; isWeekend: boolean}> {
  if (!yearMonth) return [];
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const date = new Date(year, month - 1, d);
    return { day: d, weekday: WEEKDAYS[date.getDay()], weekNum: getISOWeek(date), isWeekend: date.getDay() === 0 || date.getDay() === 6 };
  });
}

function initForfaitJours(yearMonth: string): ForfaitJourEntry[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const holidays = getFrenchHolidayDays(year, month);
  return getCalendarMonth(yearMonth).map(({ day, isWeekend }) => {
    if (isWeekend) return { day, matin: "RH", apresMidi: "RH" };
    if (holidays.has(day)) return { day, matin: "JF", apresMidi: "JF" };
    return { day, matin: "X", apresMidi: "X" };
  });
}

function calcJoursOuvres(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const d = new Date(debut), f = new Date(fin);
  if (isNaN(d.getTime()) || isNaN(f.getTime()) || d > f) return 0;
  let count = 0;
  const cur = new Date(d);
  while (cur <= f) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function Chips({ label, value, options, onChange, req, disabled }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; req?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-secondary-text mb-1.5">
        {label}{req && <span className="text-error ml-1">*</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o} onClick={() => !disabled && onChange(o)} disabled={disabled}
            className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all",
              value === o ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50",
              disabled && "opacity-50 cursor-not-allowed")}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Signature canvas ─────────────────────────────────────────────────────────

function SigCanvas({ label, existing, onSave, disabled }: {
  label: string; existing?: string; onSave: (url: string) => Promise<void>; disabled?: boolean;
}) {
  const canRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"view" | "draw">(existing ? "view" : "draw");
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "draw" || locked) return;
    const c = canRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    const pos = (e: MouseEvent | TouchEvent) => {
      const r = c.getBoundingClientRect();
      const s = "touches" in e ? e.touches[0] : e;
      return { x: (s.clientX - r.left) * (c.width / r.width), y: (s.clientY - r.top) * (c.height / r.height) };
    };
    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: MouseEvent | TouchEvent) => { e.preventDefault(); if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing.current = false; };
    c.addEventListener("mousedown", start); c.addEventListener("mousemove", move); c.addEventListener("mouseup", end);
    c.addEventListener("touchstart", start, { passive: false }); c.addEventListener("touchmove", move, { passive: false }); c.addEventListener("touchend", end);
    return () => {
      c.removeEventListener("mousedown", start); c.removeEventListener("mousemove", move); c.removeEventListener("mouseup", end);
      c.removeEventListener("touchstart", start); c.removeEventListener("touchmove", move); c.removeEventListener("touchend", end);
    };
  }, [mode, locked]);

  const save = async () => {
    setSaving(true);
    try { await onSave(canRef.current!.toDataURL("image/png")); setMode("view"); toast.success("Signature enregistrée !"); }
    catch { toast.error("Erreur"); } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-alternate pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-secondary-text">{label}</p>
        {!disabled && (existing || mode === "view") && (
          <button onClick={() => setMode(mode === "view" ? "draw" : "view")} className="text-xs text-primary font-semibold">
            {mode === "view" ? "Re-signer" : "Annuler"}
          </button>
        )}
      </div>
      {mode === "view" && existing ? (
        <div className="flex items-center gap-3 p-2 bg-green-50 rounded-xl">
          <Check size={14} className="text-green-600 shrink-0" />
          <img src={existing} alt="" className="max-h-12 rounded border border-alternate" />
        </div>
      ) : disabled ? (
        <div className="w-full h-16 border-2 border-alternate rounded-xl bg-primary-bg/50 flex items-center justify-center">
          <p className="text-xs text-secondary-text italic">Non signé</p>
        </div>
      ) : (
        <div>
          <div className="relative">
            <canvas ref={canRef} width={400} height={100}
              className={cn("w-full border-2 rounded-xl bg-white",
                locked ? "border-alternate cursor-default" : "border-dashed border-primary/40 cursor-crosshair touch-none")} />
            {locked && (
              <button onClick={() => setLocked(false)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/90 rounded-xl text-secondary-text hover:text-primary transition-colors">
                <Lock size={16} />
                <span className="text-xs font-medium">Toucher pour signer</span>
              </button>
            )}
          </div>
          {!locked && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => { const ctx = canRef.current?.getContext("2d"); if (ctx && canRef.current) ctx.clearRect(0, 0, canRef.current.width, canRef.current.height); }}
                className="btn-outline text-xs px-3 py-1.5">Effacer</button>
              <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex-1 flex items-center justify-center gap-1.5">
                {saving ? <Spinner size="sm" /> : <Check size={12} />}Valider
              </button>
              <button onClick={() => setLocked(true)} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1">
                <Lock size={11} />Verrouiller
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task table ───────────────────────────────────────────────────────────────

function TableauTaches({ chantier, vue, jour, onChange, onAddTache, onDeleteTache, readOnly }: {
  chantier: ChantierFH; vue: string; jour: string;
  onChange: (ti: number, field: string, val: number) => void;
  onAddTache: (nom: string) => void;
  onDeleteTache: (ti: number) => void;
  readOnly: boolean;
}) {
  const [nouvelleTache, setNouvelleTache] = useState("");
  const cols = vue === "Vue Hebdomadaire" ? [0, 1, 2, 3, 4] : [JOURS.indexOf(jour)].filter(i => i >= 0);
  const vals = (t: TacheFH) => [t.case1, t.case2, t.case3, t.case4, t.case5];
  const rowTotal = (t: TacheFH) => cols.reduce((s, i) => s + (vals(t)[i] || 0), 0);
  const colTotal = (ci: number) => chantier.taches.reduce((s, t) => s + (vals(t)[ci] || 0), 0);
  const grand = chantier.taches.reduce((s, t) => s + rowTotal(t), 0);
  const colTotalClass = (v: number) => v > 10 ? "text-red-600" : v > 8 ? "text-orange-500" : "text-primary";

  if (chantier.taches.length === 0 && readOnly) {
    return <p className="text-xs text-secondary-text italic py-2">Aucune tâche enregistrée.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[280px]">
          <thead>
            <tr className="bg-primary/5">
              <th className="text-left px-2 py-1.5 font-semibold text-secondary-text border border-alternate min-w-[130px]">Tâche</th>
              {cols.map(i => <th key={i} className="px-1 py-1.5 font-semibold text-secondary-text border border-alternate text-center w-12">{JOURS[i].substring(0, 3)}.</th>)}
              <th className="px-1 py-1.5 font-bold text-primary border border-alternate text-center w-12">Total</th>
              {!readOnly && <th className="w-6 border border-alternate bg-primary/5" />}
            </tr>
          </thead>
          <tbody>
            {chantier.taches.map((t, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? "bg-secondary-bg" : "bg-primary-bg/30"}>
                <td className="border border-alternate px-2 py-1.5 text-xs text-primary-text font-medium">{t.nomLigne}</td>
                {cols.map(i => (
                  <td key={i} className="border border-alternate p-0.5 text-center">
                    <input type="number" min="0" step="0.5" max="24"
                      className="w-11 bg-transparent text-xs text-center text-primary-text px-0.5 py-1 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30 rounded"
                      value={vals(t)[i] || ""}
                      onChange={e => onChange(idx, `case${i + 1}`, parseFloat(e.target.value) || 0)}
                      readOnly={readOnly} placeholder="0" />
                  </td>
                ))}
                <td className="border border-alternate px-1 py-1.5 text-center font-bold text-primary">{rowTotal(t) || "—"}</td>
                {!readOnly && (
                  <td className="border border-alternate px-1 py-1.5 text-center">
                    <button onClick={() => onDeleteTache(idx)} className="text-error hover:text-red-700"><Trash2 size={10} /></button>
                  </td>
                )}
              </tr>
            ))}
            {chantier.taches.length > 0 && (
              <tr className="bg-primary/5 font-bold">
                <td className="border border-alternate px-2 py-1.5 text-primary text-xs">Total général</td>
                {cols.map(i => {
                  const tot = colTotal(i);
                  return <td key={i} className={cn("border border-alternate px-1 py-1.5 text-center font-bold", colTotalClass(tot))} title={tot > 8 ? `${tot}h — dépasse la journée normale` : undefined}>{tot || "—"}</td>;
                })}
                <td className="border border-alternate px-1 py-1.5 text-center text-primary font-bold">{grand || "—"}</td>
                {!readOnly && <td className="border border-alternate" />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2">
          <input className="input-base flex-1 text-xs py-1.5" value={nouvelleTache}
            onChange={e => setNouvelleTache(e.target.value)} placeholder="Nouvelle tâche…"
            onKeyDown={e => { if (e.key === "Enter" && nouvelleTache.trim()) { onAddTache(nouvelleTache.trim()); setNouvelleTache(""); } }} />
          <button onClick={() => { if (nouvelleTache.trim()) { onAddTache(nouvelleTache.trim()); setNouvelleTache(""); } }}
            disabled={!nouvelleTache.trim()}
            className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1 shrink-0 disabled:opacity-40">
            <Plus size={12} />Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ChantierBlock ────────────────────────────────────────────────────────────

function ChantierBlock({ chantier, chantierIdx, vue, jour, typeFH, onChangeTache, onDeleteChantier, onAddTache, onDeleteTache, readOnly }: {
  chantier: ChantierFH; chantierIdx: number; vue: string; jour: string; typeFH: string;
  onChangeTache: (ci: number, ti: number, field: string, val: number) => void;
  onDeleteChantier: (ci: number) => void;
  onAddTache: (ci: number, nom: string) => void;
  onDeleteTache: (ci: number, ti: number) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-alternate rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <Building2 size={14} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-primary-text truncate">{chantier.nomChantier || "Chantier sans nom"}</p>
          {chantier.numChantier && <p className="text-xs text-secondary-text">N° {chantier.numChantier}</p>}
        </div>
        {!readOnly && (
          <button onClick={e => { e.stopPropagation(); onDeleteChantier(chantierIdx); }}
            className="p-1.5 rounded-lg text-error hover:bg-red-50 transition-colors shrink-0">
            <Trash2 size={13} />
          </button>
        )}
        {open ? <ChevronUp size={14} className="text-secondary-text shrink-0" /> : <ChevronDown size={14} className="text-secondary-text shrink-0" />}
      </div>
      {open && (
        <div className="p-3">
          <TableauTaches
            chantier={chantier} vue={vue} jour={jour}
            onChange={(ti, f, v) => onChangeTache(chantierIdx, ti, f, v)}
            onAddTache={nom => onAddTache(chantierIdx, nom)}
            onDeleteTache={ti => onDeleteTache(chantierIdx, ti)}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}

// ─── Add chantier panel ───────────────────────────────────────────────────────

function AddChantierPanel({ operations, operationsLoaded, typeFH, existingNums, onAdd }: {
  operations: OperationOption[];
  operationsLoaded: boolean;
  typeFH: string;
  existingNums: string[];
  onAdd: (chantier: ChantierFH) => void;
}) {
  const [search, setSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [nomManuel, setNomManuel] = useState("");
  const [numManuel, setNumManuel] = useState("");

  // Bloque par numéro de chantier (unique) — les chantiers sans numéro ne sont pas bloqués
  const isDuplicateNum = (num: string) => !!num.trim() && existingNums.includes(num.trim());

  const available = operations.filter(op => !isDuplicateNum(op.numChantier));
  const filtered = search.trim()
    ? available.filter(op =>
        op.nomChantier.toLowerCase().includes(search.toLowerCase()) ||
        op.numChantier.toLowerCase().includes(search.toLowerCase())
      )
    : available;

  const makeTaches = (): TacheFH[] =>
    (TACHES_PREDEFINIES[typeFH] ?? []).map(nom => ({
      nomLigne: nom, case1: 0, case2: 0, case3: 0, case4: 0, case5: 0,
    }));

  const handleSelect = (op: OperationOption) => {
    onAdd({ nomChantier: op.nomChantier, numChantier: op.numChantier, refOperationId: op.id, taches: makeTaches() });
  };

  const handleManual = () => {
    if (!nomManuel.trim()) return;
    if (isDuplicateNum(numManuel)) {
      toast.error(`Le n° de chantier "${numManuel.trim()}" est déjà ajouté`);
      return;
    }
    onAdd({ nomChantier: nomManuel.trim(), numChantier: numManuel.trim(), taches: makeTaches() });
    setNomManuel(""); setNumManuel("");
  };

  const numManuelDuplicate = isDuplicateNum(numManuel);

  return (
    <div className="border-2 border-dashed border-primary/25 rounded-xl p-3 space-y-2 bg-primary-bg/40">
      <p className="text-xs font-semibold text-secondary-text flex items-center gap-1.5">
        <Plus size={12} className="text-primary" />Ajouter un chantier
      </p>

      <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par nom ou n° chantier…" />

      <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
        {!operationsLoaded ? (
          <p className="text-xs text-secondary-text text-center py-3 italic">Chargement des chantiers…</p>
        ) : available.length === 0 ? (
          <p className="text-xs text-secondary-text text-center py-3 italic">
            {operations.length === 0 ? "Aucun chantier disponible." : "Tous les chantiers ont été ajoutés."}
          </p>
        ) : filtered.length === 0 && search.trim() ? (
          <p className="text-xs text-secondary-text text-center py-3 italic">Aucun résultat pour « {search} »</p>
        ) : null}
        {filtered.slice(0, 25).map(op => (
          <button key={op.id} onClick={() => handleSelect(op)}
            className="w-full text-left px-3 py-2 hover:bg-white border border-alternate rounded-lg text-xs transition-colors flex items-center justify-between gap-2 bg-secondary-bg">
            <div className="min-w-0">
              <p className="font-semibold text-primary-text truncate">{op.nomChantier}</p>
              {op.numChantier && <p className="text-secondary-text font-mono">N° {op.numChantier}</p>}
            </div>
            <Plus size={13} className="text-primary shrink-0" />
          </button>
        ))}
        {filtered.length > 25 && (
          <p className="text-xs text-secondary-text text-center py-1.5 italic">+{filtered.length - 25} autres — affinez la recherche</p>
        )}
      </div>

      <button onClick={() => setManualMode(m => !m)}
        className="text-xs text-secondary font-medium flex items-center gap-1 w-full justify-center py-1 rounded-lg border border-alternate hover:bg-alternate transition-colors">
        {manualMode ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Saisie manuelle (hors liste)
      </button>

      {manualMode && (
        <div className="space-y-2 pt-1 border-t border-alternate">
          <input className="input-base text-xs" value={nomManuel} onChange={e => setNomManuel(e.target.value)} placeholder="Nom du chantier…" />
          <div>
            <input className={cn("input-base text-xs font-mono", numManuelDuplicate && "border-error focus:ring-error/30")}
              value={numManuel} onChange={e => setNumManuel(e.target.value)} placeholder="N° chantier" />
            {numManuelDuplicate && (
              <p className="text-xs text-error mt-1 flex items-center gap-1">
                Ce numéro de chantier est déjà présent dans cette feuille.
              </p>
            )}
          </div>
          <button onClick={handleManual} disabled={!nomManuel.trim() || numManuelDuplicate}
            className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-40">
            <Plus size={13} />Ajouter ce chantier
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FHDetailPage({ params }: { params: { id: string } }) {
  const isNew = params.id === "nouveau";
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [historique, setHistorique] = useState<HistoriqueEntry[]>([]);
  const [chefEquipeId, setChefEquipeId] = useState("");
  const [chefEquipeName, setChefEquipeName] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isExternal, setIsExternal] = useState(false);
  const [createParId, setCreateParId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [operationsLoaded, setOperationsLoaded] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingPdfMsg, setSendingPdfMsg] = useState(false);
  const [dateCreate, setDateCreate] = useState<Date | null>(null);
  const prevEtatRef = useRef<string>("");
  const obsUserEdited = useRef(false);

  // Document fields
  const [categorie, setCategorie] = useState("Fiche d'heures");
  const [selectedUserId, setSelectedUserId] = useState(firebaseUser?.uid ?? "");
  const [nom, setNom] = useState(userApp?.nom ?? "");
  const [prenom, setPrenom] = useState(userApp?.prenom ?? "");
  const [service, setService] = useState(userApp?.service ?? "");
  const [etat, setEtat] = useState("En attente");
  const [etatEnvoi, setEtatEnvoi] = useState("Non envoyé");
  const [observations, setObservations] = useState("");
  const [motifRefus, setMotifRefus] = useState("");
  const [sigUser, setSigUser] = useState("");
  const [sigChef, setSigChef] = useState("");
  const [sigResp, setSigResp] = useState("");
  const [nomResp, setNomResp] = useState("");

  // Fiche d'heures specific
  const [typeFH, setTypeFH] = useState("");
  const [mois, setMois] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [vue, setVue] = useState(() => typeof window !== "undefined" && window.innerWidth < 640 ? "Vue Journalière" : "Vue Hebdomadaire");
  const [jourSel, setJourSel] = useState("Lundi");
  const [chantiers, setChantiers] = useState<ChantierFH[]>([]);

  // Absence
  const [typeAbs, setTypeAbs] = useState("");
  const [debutAbs, setDebutAbs] = useState("");
  const [finAbs, setFinAbs] = useState("");
  const [nbJours, setNbJours] = useState("");
  const [nbJoursAuto, setNbJoursAuto] = useState(0);
  useEffect(() => {
    if (debutAbs && finAbs) {
      const a = calcJoursOuvres(debutAbs, finAbs);
      setNbJoursAuto(a);
      setNbJours(a.toString());
    }
  }, [debutAbs, finAbs]);

  // Travaux imprévus
  const [nomCh, setNomCh] = useState("");
  const [numCh, setNumCh] = useState("");
  const [tiOperationId, setTiOperationId] = useState("");
  const [dateTI, setDateTI] = useState(() => new Date().toISOString().split("T")[0]);
  const [conducteurTxId, setConducteurTxId] = useState("");
  const [naturesTravaux, setNaturesTravaux] = useState("");
  const [cptInter, setCptInter] = useState("");
  const [ts, setTs] = useState("");
  const [tma, setTma] = useState("");
  const [cptProrata, setCptProrata] = useState("");
  const [estMat, setEstMat] = useState("");
  const [estH, setEstH] = useState("");
  const [chiffrage, setChiffrage] = useState("");
  const [accept, setAccept] = useState("");
  const [factImprev, setFactImprev] = useState("");
  const [visa, setVisa] = useState(false);

  // Forfait Jour
  const [forfaitMois, setForfaitMois] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [forfaitJours, setForfaitJours] = useState<ForfaitJourEntry[]>([]);

  // Initialiser le tableau Forfait Jour quand le mois change (nouveau doc uniquement)
  useEffect(() => {
    if (categorie !== "Forfait Jour" || !isNew || !forfaitMois) return;
    setForfaitJours(initForfaitJours(forfaitMois));
  }, [forfaitMois, categorie, isNew]);

  // Sync tiOperationId quand les opérations sont chargées et nomCh est défini (doc existant)
  useEffect(() => {
    if (categorie !== "Fiche de retour Travaux imprévus" || !operationsLoaded || !nomCh) return;
    const match = operations.find(op => op.nomChantier === nomCh);
    if (match) setTiOperationId(match.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomCh, operations, operationsLoaded, categorie]);

  // Pre-fill connected user on new doc
  // - Lambda : champs déjà initialisés depuis userApp, pas besoin de users[]
  // - Chef/Admin : se déclenche quand users[] est chargé et selectedUserId connu
  useEffect(() => {
    if (!isNew || !selectedUserId) return;
    if (users.length > 0) {
      const u = users.find(u => u.uid === selectedUserId || u.id === selectedUserId);
      if (u) { setNom(u.nom); setPrenom(u.prenom); setService(u.service ?? ""); }
    } else if (userApp && (selectedUserId === firebaseUser?.uid || selectedUserId === userApp.id)) {
      setNom(userApp.nom); setPrenom(userApp.prenom); setService(userApp.service ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, isNew, selectedUserId]);

  useEffect(() => {
    if (isNew && firebaseUser?.uid && !selectedUserId) setSelectedUserId(firebaseUser.uid);
  }, [firebaseUser, isNew, selectedUserId]);

  // ── Load static data (users, operations) ──────────────────────────────────

  useEffect(() => {
    // Liste des utilisateurs : toujours chargée (nécessaire pour le sélecteur chef d'équipe)
    getDocs(collection(db, "usersapp")).then(snap =>
      setUsers(snap.docs.map(d => ({
        id: d.id, uid: d.data().uid ?? d.id,
        nom: d.data().nom ?? "", prenom: d.data().prenom ?? "",
        service: d.data().service_appartenance,
        forfaitJour: d.data().forfait_jour as string | undefined,
        displayName: (d.data().display_name as string) ?? `${d.data().prenom} ${d.data().nom}`,
      })))
    ).catch(() => {});
    getDocs(collection(db, "Operation")).then(snap => {
      setOperations(
        snap.docs
          .map(d => ({ id: d.id, nomChantier: (d.data().nom_chantier as string) ?? "", numChantier: (d.data().num_chantier as string) ?? "" }))
          .filter(op => op.nomChantier)
          .sort((a, b) => a.nomChantier.localeCompare(b.nomChantier, "fr"))
      );
      setOperationsLoaded(true);
    });
  }, []);

  // ── Load document (onSnapshot for fields only — not chantiers) ────────────

  useEffect(() => {
    if (isNew) { setLoading(false); return; }

    const toStr = (v: unknown) => {
      try { return (v as any)?.toDate ? (v as any).toDate().toISOString().split("T")[0] : ""; }
      catch { return ""; }
    };

    const unsub = onSnapshot(doc(db, "Documents_fh", params.id), snap => {
      if (!snap.exists()) { router.back(); return; }
      const d = snap.data();
      setCategorie(d.categorie_document ?? "Fiche d'heures");
      setSelectedUserId((d.ref_user as DocumentReference)?.id ?? "");
      const newChefId = (d.ref_chef_equipe as DocumentReference)?.id ?? "";
      setChefEquipeId(newChefId);
      if (newChefId) {
        getDoc(doc(db, "usersapp", newChefId)).then(s => {
          if (s.exists()) setChefEquipeName((s.data().display_name as string) ?? `${s.data().prenom ?? ""} ${s.data().nom ?? ""}`.trim());
        }).catch(() => {});
      } else {
        setChefEquipeName("");
      }
      setIsExternal(d.personne_externe === true);
      setCreateParId((d.create_par as DocumentReference)?.id ?? "");
      setDateCreate(d.date_create?.toDate ? d.date_create.toDate() : null);
      setNom(d.nom ?? ""); setPrenom(d.prenom ?? ""); setService(d.service ?? "");
      prevEtatRef.current = d.etat_traitement_document ?? "En attente";
      setEtat(d.etat_traitement_document ?? "En attente");
      setEtatEnvoi(d.etat_envoi ?? "Non envoyé");
      setTypeFH(d.type_document ?? ""); setMois(d.mois ?? "");
      setDebut(toStr(d.debut_semaine)); setFin(toStr(d.fin_semaine));
      if (!obsUserEdited.current) setObservations(d.observations ?? "");
      setSigUser(d.signature_user ?? ""); setSigChef(d.signature_chef_equipe ?? "");
      setSigResp(d.signature_responsable ?? ""); setNomResp(d.nom_responsable ?? "");
      setTypeAbs(d.type_absence ?? "");
      setDebutAbs(toStr(d.debut_semaine)); setFinAbs(toStr(d.fin_semaine));
      setNbJours(d.nb_jours?.toString() ?? "");
      setNomCh(d.nom_chantier_travaux_imprevus ?? "");
      setNumCh(d.num_chantier_travaux_imprevus ?? "");
      setConducteurTxId((d.ref_conducteur_travaux as DocumentReference | null)?.id ?? "");
      if (d.forfait_mois) setForfaitMois(d.forfait_mois as string);
      const rawFj = d.forfait_jours_data as Array<{day: number; matin: string; apres_midi: string}> | null;
      if (rawFj) setForfaitJours(rawFj.map(j => ({ day: j.day, matin: j.matin, apresMidi: j.apres_midi })));
      else if (d.categorie_document === "Forfait Jour" && d.forfait_mois)
        setForfaitJours(initForfaitJours(d.forfait_mois as string));
      setDateTI(toStr(d.debut_semaine));
      setNaturesTravaux(d.observations ?? "");
      setCptInter(d.compte_inter_travaux_imprevus ?? "");
      setTs(d.ts_travaux_imprevus ?? ""); setTma(d.tma_travaux_imprevus ?? "");
      setCptProrata(d.compte_prorata_travaux_imprevus ?? "");
      setEstMat(d.estimations_materiaux ?? ""); setEstH(d.estimations_heures ?? "");
      setChiffrage(d.chiffrage_transmis ?? ""); setAccept(d.acceptation_travaux_imprevus ?? "");
      setFactImprev(d.facturation_travaux_imprevus ?? ""); setVisa(d.visa_chiffrage ?? false);
      setLoading(false);
    }, (err) => {
      console.warn("Document inaccessible :", err);
      setLoading(false);
      router.back();
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, isNew, router]);

  // ── Load chantiers ONCE (separate from onSnapshot to avoid race during save) ─

  useEffect(() => {
    if (isNew) return;
    const docRef = doc(db, "Documents_fh", params.id);
    getDocs(query(collection(db, "Chantiers_fh"), where("refDocumentFh", "==", docRef)))
      .then(async snap => {
        const result: ChantierFH[] = [];
        for (const chanDoc of snap.docs) {
          const tachesSnap = await getDocs(
            query(collection(db, "Chantiers_fh", chanDoc.id, "details_chantiers_fh"), orderBy("index"))
          );
          result.push({
            id: chanDoc.id,
            nomChantier: chanDoc.data().nomChantier ?? "",
            numChantier: chanDoc.data().numChantier ?? "",
            refOperationId: (chanDoc.data().refOperation as DocumentReference | null)?.id,
            taches: tachesSnap.docs.map(t => ({
              id: t.id,
              nomLigne: (t.data().nomLigne as string) ?? "",
              case1: t.data().case1 ?? 0, case2: t.data().case2 ?? 0,
              case3: t.data().case3 ?? 0, case4: t.data().case4 ?? 0,
              case5: t.data().case5 ?? 0,
            })),
          });
        }
        setChantiers(result);
      });
  // Only run on mount / when doc ID changes (not on every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, isNew]);

  useEffect(() => {
    if (isNew) return;
    // Pas d'orderBy pour éviter l'exigence d'un index Firestore composite sur la sous-collection
    const unsub = onSnapshot(
      collection(db, "Documents_fh", params.id, "historique_fh"),
      snap => setHistorique(snap.docs
        .map(d => ({
          id: d.id,
          date: d.data().date_action?.toDate() as Date | undefined,
          typeAction: d.data().type_action ?? "",
          auteurNom: d.data().auteur_nom ?? "",
          etatDe: d.data().etat_de as string | undefined,
          etatVers: d.data().etat_vers as string | undefined,
          commentaire: d.data().commentaire as string | undefined,
        }))
        .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
      ),
      err => console.warn("Historique onSnapshot:", err)
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, isNew]);

  // ── Chantier state handlers ───────────────────────────────────────────────

  const handleAddChantier = async (ch: ChantierFH) => {
    const tempId = `temp_${Date.now()}`;
    setChantiers(p => [...p, { ...ch, id: tempId }]);
    if (isNew) return;
    try {
      const docRef = doc(db, "Documents_fh", params.id);
      const userRef = firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null;
      const chRef = await addDoc(collection(db, "Chantiers_fh"), {
        nomChantier: ch.nomChantier, numChantier: ch.numChantier,
        refDocumentFh: docRef,
        refOperation: ch.refOperationId ? doc(db, "Operation", ch.refOperationId) : null,
        refUserCreate: userRef,
      });
      await Promise.all(ch.taches.map((t, i) =>
        addDoc(collection(db, "Chantiers_fh", chRef.id, "details_chantiers_fh"), {
          nomLigne: t.nomLigne, index: i,
          case1: 0, case2: 0, case3: 0, case4: 0, case5: 0, total: 0,
          refDocumentFh: docRef, refUserCreate: userRef,
        })
      ));
      setChantiers(p => p.map(c => c.id === tempId ? { ...c, id: chRef.id } : c));
      toast.success("Chantier ajouté !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'ajout du chantier");
      setChantiers(p => p.filter(c => c.id !== tempId));
    }
  };

  const handleDeleteChantier = async (ci: number) => {
    const ch = chantiers[ci];
    setChantiers(p => p.filter((_, i) => i !== ci));
    if (!isNew && ch.id && !ch.id.startsWith("temp_")) {
      try {
        const sub = await getDocs(collection(db, "Chantiers_fh", ch.id, "details_chantiers_fh"));
        await Promise.all(sub.docs.map(t => deleteDoc(t.ref)));
        await deleteDoc(doc(db, "Chantiers_fh", ch.id));
      } catch (e) { console.error(e); }
    }
  };
  const handleChangeTache = (ci: number, ti: number, field: string, val: number) =>
    setChantiers(p => p.map((ch, i) => i !== ci ? ch : {
      ...ch, taches: ch.taches.map((t, j) => j !== ti ? t : { ...t, [field]: val }),
    }));
  const handleAddTache = (ci: number, nomLigne: string) =>
    setChantiers(p => p.map((ch, i) => i !== ci ? ch : {
      ...ch, taches: [...ch.taches, { nomLigne, case1: 0, case2: 0, case3: 0, case4: 0, case5: 0 }],
    }));
  const handleDeleteTache = (ci: number, ti: number) =>
    setChantiers(p => p.map((ch, i) => i !== ci ? ch : {
      ...ch, taches: ch.taches.filter((_, j) => j !== ti),
    }));

  // ── Save helpers ──────────────────────────────────────────────────────────

  const toTS = (s: string) => s ? Timestamp.fromDate(new Date(s)) : null;

  const buildNom = () => {
    if (categorie === "Fiche d'heures") return `${typeFH} - ${mois} sem. ${debut}`.trim();
    if (categorie === "Demande autorisation absence") return `Absence ${typeAbs} ${debutAbs} au ${finAbs}`;
    if (categorie === "Forfait Jour") {
      const [y, m] = forfaitMois.split("-").map(Number);
      return `Forfait Jour - ${prenom} ${nom} - ${MOIS_FR[m - 1]} ${y}`.trim();
    }
    return `Travaux imprévus ${nomCh} - ${new Date().toLocaleDateString("fr-FR")}`;
  };

  const saveChantiers = async (docId: string) => {
    const docRef = doc(db, "Documents_fh", docId);
    const userRef = firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null;
    for (const chantier of chantiers.filter(c => c.nomChantier.trim())) {
      const chantierId = chantier.id && !chantier.id.startsWith("temp_") ? chantier.id : null;
      if (chantierId) {
        // Chantier déjà sauvegardé — on met à jour uniquement les tâches/heures
        const sub = await getDocs(collection(db, "Chantiers_fh", chantierId, "details_chantiers_fh"));
        await Promise.all(sub.docs.map(t => deleteDoc(t.ref)));
        for (let i = 0; i < chantier.taches.length; i++) {
          const t = chantier.taches[i];
          const total = (t.case1||0)+(t.case2||0)+(t.case3||0)+(t.case4||0)+(t.case5||0);
          await addDoc(collection(db, "Chantiers_fh", chantierId, "details_chantiers_fh"), {
            nomLigne: t.nomLigne, index: i,
            case1: t.case1||0, case2: t.case2||0, case3: t.case3||0,
            case4: t.case4||0, case5: t.case5||0, total,
            refDocumentFh: docRef, refUserCreate: userRef,
          });
        }
      } else {
        // Chantier pas encore persisté (cas rare avec l'auto-save)
        const chRef = await addDoc(collection(db, "Chantiers_fh"), {
          nomChantier: chantier.nomChantier, numChantier: chantier.numChantier,
          refDocumentFh: docRef,
          refOperation: chantier.refOperationId ? doc(db, "Operation", chantier.refOperationId) : null,
          refUserCreate: userRef,
        });
        for (let i = 0; i < chantier.taches.length; i++) {
          const t = chantier.taches[i];
          const total = (t.case1||0)+(t.case2||0)+(t.case3||0)+(t.case4||0)+(t.case5||0);
          await addDoc(collection(db, "Chantiers_fh", chRef.id, "details_chantiers_fh"), {
            nomLigne: t.nomLigne, index: i,
            case1: t.case1||0, case2: t.case2||0, case3: t.case3||0,
            case4: t.case4||0, case5: t.case5||0, total,
            refDocumentFh: docRef, refUserCreate: userRef,
          });
        }
      }
    }
  };

  const buildData = () => {
    const userRef = isExternal ? null
      : selectedUserId ? doc(db, "usersapp", selectedUserId)
      : (firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null);
    const isAbs = categorie === "Demande autorisation absence";
    const isTI = categorie === "Fiche de retour Travaux imprévus";
    const isFJ = categorie === "Forfait Jour";
    const debutTS = isAbs ? toTS(debutAbs) : isTI ? toTS(dateTI) : isFJ && forfaitMois ? Timestamp.fromDate(new Date(forfaitMois + "-01")) : toTS(debut);
    const finTS = isAbs ? toTS(finAbs) : isTI || isFJ ? null : toTS(fin);
    return {
      ref_user: userRef, nom, prenom, service,
      personne_externe: isExternal,
      ref_chef_equipe: chefEquipeId ? doc(db, "usersapp", chefEquipeId) : null,
      categorie_document: categorie,
      nom_document: buildNom(),
      type_document: typeFH,
      etat_traitement_document: etat,
      etat_envoi: etatEnvoi,
      mois,
      observations: isTI ? naturesTravaux : observations,
      debut_semaine: debutTS, fin_semaine: finTS,
      signature_user: sigUser, signature_chef_equipe: sigChef,
      signature_responsable: sigResp, nom_responsable: nomResp,
      type_absence: typeAbs,
      nb_jours: nbJours ? parseFloat(nbJours) : null,
      nom_chantier_travaux_imprevus: nomCh,
      num_chantier_travaux_imprevus: numCh,
      ref_conducteur_travaux: conducteurTxId ? doc(db, "usersapp", conducteurTxId) : null,
      compte_inter_travaux_imprevus: cptInter,
      ts_travaux_imprevus: ts, tma_travaux_imprevus: tma,
      compte_prorata_travaux_imprevus: cptProrata,
      estimations_materiaux: estMat, estimations_heures: estH,
      chiffrage_transmis: chiffrage, acceptation_travaux_imprevus: accept,
      facturation_travaux_imprevus: factImprev, visa_chiffrage: visa,
      forfait_mois: isFJ ? forfaitMois : null,
      forfait_jours_data: isFJ ? forfaitJours.map(j => ({ day: j.day, matin: j.matin, apres_midi: j.apresMidi })) : null,
    };
  };

  const handleSave = async () => {
    if (!nom.trim() || !prenom.trim()) { toast.error("Nom et prénom obligatoires"); return; }
    if (categorie === "Fiche d'heures" && !typeFH) { toast.error("Veuillez sélectionner un type de fiche"); return; }
    if (!isNew && categorie === "Fiche d'heures") {
      const totalH = chantiers.reduce((s, ch) => s + ch.taches.reduce((t, r) => t + (r.case1||0) + (r.case2||0) + (r.case3||0) + (r.case4||0) + (r.case5||0), 0), 0);
      if (totalH > 38) { toast.error(`Total semaine : ${totalH}h — 38h maximum autorisées. Créez une seconde feuille pour les heures supplémentaires.`); return; }
    }
    if (!isNew && etat === "Validé" && categorie !== "Fiche de retour Travaux imprévus" && !isAdmin(userApp)) {
      const manquantes: string[] = [];
      if (!sigUser) manquantes.push("signature salarié");
      if (chefEquipeId && !sigChef) manquantes.push("signature chef d'équipe");
      if (!sigResp) manquantes.push("signature responsable");
      if (manquantes.length > 0) {
        toast.error(`Validation impossible — ${manquantes.join(", ")} manquante${manquantes.length > 1 ? "s" : ""}`);
        return;
      }
    }
    setSaving(true);
    try {
      const data = buildData();
      let docId = params.id;
      if (isNew) {
        Object.assign(data, { date_create: serverTimestamp(), create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null });
        const ref = await addDoc(collection(db, "Documents_fh"), data);
        docId = ref.id;
        router.replace(`/feuilles-heures/${docId}`);
      } else {
        const prevEtat = prevEtatRef.current;
        const wasRefused = prevEtat !== "Refusé" && etat === "Refusé";
        const etatChanged = prevEtat !== etat;
        await updateDoc(doc(db, "Documents_fh", params.id), data);
        if (categorie === "Fiche d'heures") await saveChantiers(docId);

        // Entrée historique quand l'état change
        if (etatChanged) {
          await addDoc(collection(db, "Documents_fh", params.id, "historique_fh"), {
            date_action: serverTimestamp(),
            type_action: wasRefused ? "Refus" : "Changement d'état",
            auteur_nom: `${userApp?.prenom ?? ""} ${userApp?.nom ?? ""}`.trim(),
            auteur_id: firebaseUser?.uid ?? "",
            etat_de: prevEtat,
            etat_vers: etat,
            ...(wasRefused && motifRefus.trim() ? { commentaire: motifRefus.trim() } : {}),
          }).catch(() => {});
          // Mettre à jour l'état du document dans les discussions liées
          const docFhRef = doc(db, "Documents_fh", params.id);
          updateDiscussionEtatDocument(docFhRef, etat).catch(() => {});
        }

        // Ajouter le chef d'équipe à la discussion liée s'il n'en fait pas partie
        if (chefEquipeId) {
          const docFhRef = doc(db, "Documents_fh", params.id);
          const discSnap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
          if (!discSnap.empty) {
            const chefRef = doc(db, "usersapp", chefEquipeId) as DocumentReference;
            await ajouterParticipants(discSnap.docs[0].id, [chefRef]).catch(() => {});
          }
        }

        // Auto-message quand un document est refusé
        if (wasRefused && firebaseUser && selectedUserId) {
          const destId = selectedUserId !== firebaseUser.uid ? selectedUserId : null;
          if (destId) {
            try {
              const adminRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
              const motifLigne = motifRefus.trim() ? `\n\nMotif : ${motifRefus.trim()}` : "";
              const msgText = `Bonjour,\n\nVotre document "${buildNom()}" n'a pas pu être validé et a été refusé.${motifLigne}\n\nMerci de le corriger et de le soumettre à nouveau.\n\nCordialement`;
              const docFhRef = doc(db, "Documents_fh", params.id);
              const existingSnap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
              if (!existingSnap.empty) {
                // sendMessage gère le marquage non-lu pour tous les participants
                await sendMessage(existingSnap.docs[0].id, adminRef, msgText);
              }
            } catch (e) { console.error("Erreur auto-message refus :", e); }
          }
          setMotifRefus("");
        }

        // Auto-message quand un document est validé
        if (etat === "Validé" && prevEtat !== "Validé" && firebaseUser) {
          try {
            const adminRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
            const docFhRef = doc(db, "Documents_fh", params.id);
            const existingSnap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
            const msgText = `Le document "${buildNom()}" a été validé.`;
            if (!existingSnap.empty) {
              await sendMessage(existingSnap.docs[0].id, adminRef, msgText);
            } else if (selectedUserId && selectedUserId !== firebaseUser.uid) {
              const salarieRef = doc(db, "usersapp", selectedUserId) as DocumentReference;
              await creerDiscussionGroupe([adminRef, salarieRef], adminRef, buildNom(), "RH", msgText, docFhRef, "Validé");
            }
          } catch (e) { console.error("Erreur auto-message validation :", e); }
        }

        obsUserEdited.current = false;
        toast.success("Document mis à jour !");
      }
    } catch (e) { console.error(e); toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await generateDocFhPdf({
        categorie, nom, prenom, service,
        dateCreate: dateCreate?.toLocaleDateString("fr-FR"),
        typeFH, mois, debut, fin, chantiers,
        typeAbs, debutAbs, finAbs, nbJours,
        nomCh, numCh, dateTI, naturesTravaux,
        estMat, estH, conducteurNom: conducteurTxId ? (users.find(u => u.id === conducteurTxId)?.displayName ?? "") : "",
        visa, chiffrage, accept, factImprev, ts, tma, cptInter, cptProrata,
        forfaitMois,
        forfaitJours: categorie === "Forfait Jour" ? getCalendarMonth(forfaitMois).map(cd => ({
          ...cd, matin: forfaitJours.find(j => j.day === cd.day)?.matin ?? "",
          apresMidi: forfaitJours.find(j => j.day === cd.day)?.apresMidi ?? "",
        })) : undefined,
        observations, sigUser, sigChef, sigResp, nomResp, etat,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${categorie.replace(/[^a-zA-Z0-9]/g, "_")}-${prenom}_${nom}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); toast.error("Erreur lors de la génération PDF"); }
    finally { setGeneratingPdf(false); }
  };

  const handleSendPdfToMessagerie = async () => {
    if (isNew) { toast.error("Sauvegardez d'abord le document"); return; }
    if (!firebaseUser) return;
    setSendingPdfMsg(true);
    try {
      const docFhRef = doc(db, "Documents_fh", params.id);
      const discSnap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
      if (discSnap.empty) { toast.error("Aucune discussion liée — envoyez d'abord le document."); return; }
      const discId = discSnap.docs[0].id;
      const discData = discSnap.docs[0].data();

      const blob = await generateDocFhPdf({
        categorie, nom, prenom, service,
        dateCreate: dateCreate?.toLocaleDateString("fr-FR"),
        typeFH, mois, debut, fin, chantiers,
        typeAbs, debutAbs, finAbs, nbJours,
        nomCh, numCh, dateTI, naturesTravaux,
        estMat, estH, conducteurNom: conducteurTxId ? (users.find(u => u.id === conducteurTxId)?.displayName ?? "") : "",
        visa, chiffrage, accept, factImprev, ts, tma, cptInter, cptProrata,
        forfaitMois,
        forfaitJours: categorie === "Forfait Jour" ? getCalendarMonth(forfaitMois).map(cd => ({
          ...cd, matin: forfaitJours.find(j => j.day === cd.day)?.matin ?? "",
          apresMidi: forfaitJours.find(j => j.day === cd.day)?.apresMidi ?? "",
        })) : undefined,
        observations, sigUser, sigChef, sigResp, nomResp, etat,
      });
      const fileName = `${categorie.replace(/[^a-zA-Z0-9]/g, "_")}-${prenom}_${nom}-${Date.now()}.pdf`;
      const r = storageRef(storage, `messagerie/${discId}/${fileName}`);
      await uploadBytes(r, blob, { contentType: "application/pdf" });
      const url = await getDownloadURL(r);

      const senderRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
      await addDoc(collection(db, "messagerie", discId, "messages_messagerie"), {
        ref_user: senderRef,
        message_text: `Document PDF : ${buildNom()}`,
        document_pdf_list: [url],
        date_create: serverTimestamp(),
      });
      const participantsIds = discData.participants_ids as string[] | undefined;
      if (participantsIds) {
        await updateDoc(doc(db, "messagerie", discId), {
          date_last_message: serverTimestamp(),
          non_lus_ids: participantsIds.filter(pid => pid !== (userApp?.id ?? firebaseUser.uid)),
        });
      }
      toast.success("PDF envoyé dans la messagerie !");
    } catch (e) { console.error(e); toast.error("Erreur lors de l'envoi du PDF"); }
    finally { setSendingPdfMsg(false); }
  };

  // Créer ET envoyer en une seule action pour "Fiche de retour Travaux imprévus"
  const handleCreateAndSendTI = async () => {
    if (!nom.trim() || !prenom.trim()) { toast.error("Nom et prénom obligatoires"); return; }
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const data = {
        ...buildData(),
        date_create: serverTimestamp(),
        create_par: doc(db, "usersapp", firebaseUser.uid),
        etat_traitement_document: "En cours de traitement",
        etat_envoi: "Envoyé",
      };
      const ref = await addDoc(collection(db, "Documents_fh"), data);
      const docId = ref.id;
      // Historique
      await addDoc(collection(db, "Documents_fh", docId, "historique_fh"), {
        date_action: serverTimestamp(),
        type_action: "Envoi",
        auteur_nom: `${prenom} ${nom}`.trim(),
        auteur_id: firebaseUser.uid,
        etat_de: "En attente",
        etat_vers: "En cours de traitement",
      }).catch(() => {});
      // Messagerie : Comptabilité + Chiffrage + conducteur de travaux
      const userRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
      const [comptaSnap, chiffrageSnap] = await Promise.all([
        getDocs(query(collection(db, "usersapp"), where("service_appartenance", "==", "Comptabilité"))),
        getDocs(query(collection(db, "usersapp"), where("service_appartenance", "==", "Chiffrage"))),
      ]);
      const destRefs: DocumentReference[] = [
        ...comptaSnap.docs.map(d => d.ref as DocumentReference),
        ...chiffrageSnap.docs.map(d => d.ref as DocumentReference),
      ];
      if (destRefs.length > 0) {
        const docFhRef = doc(db, "Documents_fh", docId);
        const conducteurRef = conducteurTxId ? doc(db, "usersapp", conducteurTxId) as DocumentReference : null;
        const salarieRef = selectedUserId ? doc(db, "usersapp", selectedUserId) as DocumentReference : userRef;
        const allParticipants: DocumentReference[] = [salarieRef];
        for (const r of destRefs) { if (r.id !== salarieRef.id) allParticipants.push(r); }
        if (conducteurRef && !allParticipants.find(p => p.id === conducteurRef.id)) allParticipants.push(conducteurRef);
        const msgText = `Bonjour,\n\nJe vous transmets le document "${buildNom()}" pour traitement.\n\nCordialement`;
        await creerDiscussionGroupe(allParticipants, userRef, `Travaux imprévus ${nomCh}`, "Comptabilité", msgText, docFhRef, "En cours de traitement");
        updateDiscussionEtatDocument(docFhRef, "En cours de traitement").catch(() => {});
      }
      toast.success("Document créé et envoyé !");
      router.replace(`/feuilles-heures/${docId}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création/envoi"); }
    finally { setSaving(false); }
  };

  const handleEnvoyer = async () => {
    if (isNew) { toast.error("Sauvegardez d'abord le document"); return; }
    if (categorie !== "Fiche de retour Travaux imprévus" && !sigUser) { toast.error("Vous devez signer le document avant de l'envoyer"); return; }
    if (categorie === "Fiche d'heures") {
      const totalH = chantiers.reduce((s, ch) => s + ch.taches.reduce((t, r) => t + (r.case1||0) + (r.case2||0) + (r.case3||0) + (r.case4||0) + (r.case5||0), 0), 0);
      if (totalH > 38) { toast.error(`Total semaine : ${totalH}h — 38h maximum autorisées. Créez une seconde feuille pour les heures supplémentaires.`); return; }
    }
    if (!firebaseUser) return;
    setSending(true);
    try {
      const wasRefused = etat === "Refusé";
      // Sauvegarde les modifications du formulaire + change l'état en une seule opération
      const data = buildData();
      await updateDoc(doc(db, "Documents_fh", params.id), {
        ...data,
        etat_traitement_document: "En cours de traitement",
        etat_envoi: "Envoyé",
      });
      if (categorie === "Fiche d'heures") await saveChantiers(params.id);
      setEtat("En cours de traitement"); setEtatEnvoi("Envoyé");
      // Entrée historique
      await addDoc(collection(db, "Documents_fh", params.id, "historique_fh"), {
        date_action: serverTimestamp(),
        type_action: wasRefused ? "Renvoi après correction" : "Envoi",
        auteur_nom: `${prenom} ${nom}`.trim(),
        auteur_id: firebaseUser.uid,
        etat_de: etat,
        etat_vers: "En cours de traitement",
      }).catch(() => {});
      const userRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
      const serviceDestinataire = categorie === "Fiche d'heures" ? "RH" : "Comptabilité";

      // Travaux imprévus : Comptabilité + Chiffrage + conducteur de travaux
      let destRefs: DocumentReference[];
      if (categorie === "Fiche de retour Travaux imprévus") {
        const [comptaSnap, chiffrageSnap] = await Promise.all([
          getDocs(query(collection(db, "usersapp"), where("service_appartenance", "==", "Comptabilité"))),
          getDocs(query(collection(db, "usersapp"), where("service_appartenance", "==", "Chiffrage"))),
        ]);
        destRefs = [
          ...comptaSnap.docs.map(d => d.ref as DocumentReference),
          ...chiffrageSnap.docs.map(d => d.ref as DocumentReference),
        ];
      } else {
        const snap = await getDocs(query(collection(db, "usersapp"), where("service_appartenance", "==", serviceDestinataire)));
        destRefs = snap.docs.map(d => d.ref as DocumentReference);
      }

      if (destRefs.length > 0) {
        const docFhRef = doc(db, "Documents_fh", params.id);
        const msgText = wasRefused
          ? `Bonjour,\n\nSuite au refus, j'ai corrigé le document "${buildNom()}" et vous le soumets à nouveau pour traitement.\n\nCordialement`
          : `Bonjour,\n\nJe vous transmets le document "${buildNom()}" pour traitement.\n\nCordialement`;

        const conducteurRef = conducteurTxId ? doc(db, "usersapp", conducteurTxId) as DocumentReference : null;
        const existingSnap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
        if (!existingSnap.empty) {
          const discId = existingSnap.docs[0].id;
          const salarieRef = selectedUserId ? doc(db, "usersapp", selectedUserId) as DocumentReference : userRef;
          const chefRef = chefEquipeId ? doc(db, "usersapp", chefEquipeId) as DocumentReference : null;
          const allRefs = [salarieRef, ...destRefs, ...(chefRef ? [chefRef] : []), ...(conducteurRef ? [conducteurRef] : [])];
          await ajouterParticipants(discId, allRefs).catch(() => {});
          await sendMessage(discId, userRef, msgText);
        } else {
          const salarieRef = selectedUserId ? doc(db, "usersapp", selectedUserId) as DocumentReference : userRef;
          const chefRef = chefEquipeId ? doc(db, "usersapp", chefEquipeId) as DocumentReference : null;
          const allParticipants: DocumentReference[] = [salarieRef];
          for (const r of destRefs) { if (r.id !== salarieRef.id) allParticipants.push(r); }
          if (chefRef && !allParticipants.find(p => p.id === chefRef.id)) allParticipants.push(chefRef);
          if (conducteurRef && !allParticipants.find(p => p.id === conducteurRef.id)) allParticipants.push(conducteurRef);

          const objet = categorie === "Fiche d'heures" ? `Fiche heures ${mois} - Sem ${debut}`
            : categorie === "Demande autorisation absence" ? `Demande absence ${typeAbs} - ${debutAbs}`
            : categorie === "Forfait Jour" ? buildNom()
            : `Travaux imprévus ${nomCh}`;

          await creerDiscussionGroupe(
            allParticipants, userRef, objet, serviceDestinataire, msgText,
            docFhRef, "En cours de traitement"
          );
        }
        updateDiscussionEtatDocument(docFhRef, "En cours de traitement").catch(() => {});
      }
      const toastMsg = categorie === "Fiche de retour Travaux imprévus"
        ? (wasRefused ? "Document renvoyé après correction !" : "Document envoyé à la Comptabilité, au Chiffrage et au conducteur de travaux !")
        : (wasRefused ? "Document renvoyé après correction !" : `Document envoyé au service ${serviceDestinataire} !`);
      toast.success(toastMsg);
    } catch (e) { console.error(e); toast.error("Erreur lors de l'envoi"); }
    finally { setSending(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const docRef = doc(db, "Documents_fh", params.id);
      const chantiersSnap = await getDocs(query(collection(db, "Chantiers_fh"), where("refDocumentFh", "==", docRef)));
      for (const ch of chantiersSnap.docs) {
        const sub = await getDocs(collection(db, "Chantiers_fh", ch.id, "details_chantiers_fh"));
        await Promise.all(sub.docs.map(t => deleteDoc(t.ref)));
        await deleteDoc(ch.ref);
      }
      await deleteDoc(docRef);
      toast.success("Document supprimé.");
      router.replace("/feuilles-heures");
    } catch (e) { console.error(e); toast.error("Erreur lors de la suppression"); setDeleting(false); setConfirmDelete(false); }
  };

  const uploadSig = async (dataUrl: string, field: string): Promise<string> => {
    try {
      const r = storageRef(storage, `signatures/fh_${isNew ? "new" : params.id}_${field}_${Date.now()}.png`);
      const res = await fetch(dataUrl); const blob = await res.blob();
      await uploadBytes(r, blob); return getDownloadURL(r);
    } catch { toast.error("Erreur upload signature"); return dataUrl; }
  };

  const sUser = async (d: string) => { const u = await uploadSig(d, "user"); setSigUser(u); if (!isNew) await updateDoc(doc(db, "Documents_fh", params.id), { signature_user: u }); };
  const sChef = async (d: string) => { const u = await uploadSig(d, "chef"); setSigChef(u); if (!isNew) await updateDoc(doc(db, "Documents_fh", params.id), { signature_chef_equipe: u }); };
  const sResp = async (d: string) => { const u = await uploadSig(d, "resp"); setSigResp(u); if (!isNew) await updateDoc(doc(db, "Documents_fh", params.id), { signature_responsable: u }); };

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  const admin = isAdmin(userApp);
  const chefOuAdmin = canCreateForOthers(userApp);
  const estSalarie = isSalarie(userApp);
  const SERVICES_FORFAIT_ACCES = ["Comptabilité", "RH", "Bureau d'étude"];
  const canAccessForfaitJour = admin
    || userApp?.forfaitJour === "Forfait Jour"
    || SERVICES_FORFAIT_ACCES.includes(userApp?.service ?? "");
  const catsDisponibles = canAccessForfaitJour ? CATS : CATS.filter(c => c !== "Forfait Jour");
  // isCreator : vérifie contre l'UID Firebase ET l'ID Firestore. Pour les personnes externes, on vérifie create_par.
  const isCreator = isNew || selectedUserId === firebaseUser?.uid || selectedUserId === userApp?.id
    || (isExternal && (createParId === firebaseUser?.uid || createParId === userApp?.id));
  const isChef = !isNew && !!chefEquipeId && chefEquipeId === firebaseUser?.uid;
  const serviceDestinataireCourant = categorie === "Fiche d'heures" ? "RH" : "Comptabilité";
  const isCompta = userApp?.service === serviceDestinataireCourant || userApp?.service === "Chiffrage";
  const canEditPostSend = etatEnvoi === "Envoyé" && isCompta;
  // isValidated : basé sur la valeur Firestore sauvegardée (prevEtatRef), pas sur l'état du formulaire
  const isValidated = !isNew && prevEtatRef.current === "Validé";
  // Section 2 des Travaux imprévus : éditable uniquement par Comptabilité (ou admin)
  const readOnlySection2 = isValidated || (!admin && userApp?.service !== "Comptabilité");
  // Éditable : En attente ou Refusé (le salarié peut corriger), toujours éditable pour admin/compta
  const readOnly = isValidated || (!admin && !canEditPostSend && (!isCreator || (etat !== "En attente" && etat !== "Refusé")));
  // Paramètres (type, dates, salarié) : locked after creation, sauf pour le créateur en attente/refusé
  const paramLocked = !isNew && !admin && !(isCreator && (etat === "En attente" || etat === "Refusé"));
  // readOnlyData : plus restrictif — Comptabilité ne peut pas modifier les données (heures, signatures, etc.)
  const readOnlyData = isValidated || (!admin && (!isCreator || (etat !== "En attente" && etat !== "Refusé")));

  // Alertes heures (non bloquantes)
  const totalHeuresSemaine = categorie === "Fiche d'heures"
    ? chantiers.reduce((s, ch) => s + ch.taches.reduce((t, r) => t + (r.case1||0) + (r.case2||0) + (r.case3||0) + (r.case4||0) + (r.case5||0), 0), 0)
    : 0;
  const heuresParJour = categorie === "Fiche d'heures"
    ? [0,1,2,3,4].map(i => chantiers.reduce((s, ch) => s + ch.taches.reduce((t, r) => t + ([r.case1,r.case2,r.case3,r.case4,r.case5][i]||0), 0), 0))
    : [0,0,0,0,0];

  const etatBadgeClass = etat === "Validé" ? "bg-green-100 text-green-800 border-green-200"
    : etat === "Refusé" ? "bg-red-100 text-red-700 border-red-200"
    : etat === "En cours de traitement" ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-yellow-100 text-yellow-800 border-yellow-200";

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>
              {isNew ? "Nouveau document" : "Document"}
            </h1>
            <p className="text-xs text-secondary-text truncate">{categorie}</p>
          </div>
          {!isNew && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span className={cn("badge border text-xs", etatBadgeClass)}>{etat}</span>
              {etatEnvoi === "Envoyé" && (
                <span className="badge bg-blue-50 text-blue-700 border-blue-200 text-xs flex items-center gap-1">
                  <Send size={10} />Envoyé
                </span>
              )}
              {(!estSalarie || etat === "Validé") && (
                <button onClick={handleDownloadPdf} disabled={generatingPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all">
                  {generatingPdf ? <><span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />PDF…</> : <><Download size={13} />PDF</>}
                </button>
              )}
              {!isNew && etatEnvoi === "Envoyé" && (
                <button onClick={handleSendPdfToMessagerie} disabled={sendingPdfMsg || generatingPdf}
                  title="Envoyer le PDF dans la discussion messagerie liée"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-bg border border-alternate text-xs font-semibold text-secondary-text hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50">
                  {sendingPdfMsg ? <><span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />Envoi…</> : <><Share2 size={13} />Messagerie</>}
                </button>
              )}
            </div>
          )}
        </div>

        {isValidated && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-xl">
            <Lock size={14} className="text-green-700 shrink-0" />
            <p className="text-xs text-green-700 font-medium">Document validé — lecture seule, aucune modification possible.</p>
          </div>
        )}
        {!isNew && etat === "Refusé" && isCreator && !admin && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl">
            <Info size={14} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">Document refusé — vous pouvez le corriger puis le renvoyer.</p>
          </div>
        )}
        {!isNew && readOnly && !isValidated && etat !== "Refusé" && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <Info size={14} className="text-yellow-700 shrink-0" />
            <p className="text-xs text-yellow-700">Document {etat.toLowerCase()} — modifications désactivées.</p>
          </div>
        )}

        <div className="space-y-4">

          {/* ── Type de document ── */}
          <div className="card p-4">
            <Chips label="Type de document" value={categorie} options={catsDisponibles} onChange={setCategorie} disabled={!isNew} />
          </div>

          {/* ── Salarié concerné ── */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Salarié concerné</p>

            {/* Toggle Interne / Externe — chefs uniquement, à la création */}
            {chefOuAdmin && isNew && (
              <div className="flex rounded-xl border border-alternate overflow-hidden">
                {[{ label: "Salarié (app)", val: false }, { label: "Personne externe", val: true }].map(opt => (
                  <button key={String(opt.val)} type="button"
                    onClick={() => { setIsExternal(opt.val); setSelectedUserId(""); setNom(""); setPrenom(""); setService(""); }}
                    className={cn("flex-1 py-2 text-xs font-semibold transition-all",
                      isExternal === opt.val ? "bg-primary text-white" : "text-secondary-text hover:bg-alternate")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Sélecteur utilisateur — seulement si non externe */}
            {chefOuAdmin && !isExternal && (
              <select className="input-base" value={selectedUserId} disabled={!isNew}
                onChange={e => {
                  setSelectedUserId(e.target.value);
                  const u = users.find(u => u.uid === e.target.value || u.id === e.target.value);
                  if (u) { setNom(u.nom); setPrenom(u.prenom); setService(u.service ?? ""); }
                }}>
                <option value="">— Sélectionner —</option>
                {(categorie === "Forfait Jour"
                  ? users.filter(u => u.forfaitJour === "Forfait Jour")
                  : users
                ).map(u => <option key={u.id} value={u.uid || u.id}>{u.displayName}</option>)}
              </select>
            )}

            {isExternal && !isNew && (
              <p className="text-xs text-secondary-text flex items-center gap-1.5">
                <Info size={11} className="shrink-0" />Personne externe (sans compte sur l&apos;application)
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Nom *</label>
                <input className="input-base mt-1" value={nom} onChange={e => setNom(e.target.value)}
                  readOnly={isExternal ? readOnlyData : (estSalarie || !isNew)} />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Prénom *</label>
                <input className="input-base mt-1" value={prenom} onChange={e => setPrenom(e.target.value)}
                  readOnly={isExternal ? readOnlyData : (estSalarie || !isNew)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Service</label>
              <select className="input-base mt-1" value={service} onChange={e => setService(e.target.value)}
                disabled={isExternal ? readOnlyData : (estSalarie || !isNew)}>
                <option value="">—</option>
                {LISTE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* ══ FICHE D'HEURES ══ */}
          {categorie === "Fiche d'heures" && (
            <>
              {/* Paramètres — locked after creation */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Paramètres</p>
                  {paramLocked && (
                    <span className="flex items-center gap-1 text-xs text-secondary-text"><Lock size={10} />Verrouillé</span>
                  )}
                </div>
                <Chips label="Type de fiche" value={typeFH} options={TYPES_FH} onChange={setTypeFH} req disabled={paramLocked} />
                <div>
                  <label className="text-xs font-medium text-secondary-text">Mois</label>
                  <select className="input-base mt-1" value={mois} onChange={e => setMois(e.target.value)} disabled={paramLocked}>
                    <option value="">— Sélectionner —</option>
                    {MOIS_FR.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Début de semaine</label>
                    <input className="input-base mt-1" type="date" value={debut} onChange={e => setDebut(e.target.value)} readOnly={paramLocked} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Fin de semaine</label>
                    <input className="input-base mt-1" type="date" value={fin} onChange={e => setFin(e.target.value)} readOnly={paramLocked} />
                  </div>
                </div>
              </div>

              {/* Chantiers — only visible after creation */}
              {!isNew && (
                <div className="card p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">
                      Chantiers &amp; Heures
                      <span className="ml-2 font-normal normal-case text-secondary-text">({chantiers.length} chantier{chantiers.length !== 1 ? "s" : ""})</span>
                    </p>
                    {!readOnly && (
                      <div className="flex gap-1">
                        {["Vue Hebdomadaire", "Vue Journalière"].map(v => (
                          <button key={v} onClick={() => !readOnlyData && setVue(v)}
                            className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                              vue === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                            {v === "Vue Hebdomadaire" ? "Semaine" : "Jour"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {vue === "Vue Journalière" && !readOnly && (
                    <div className="flex flex-wrap gap-1.5">
                      {JOURS.map(j => (
                        <button key={j} onClick={() => setJourSel(j)}
                          className={cn("px-2.5 py-1 rounded-badge text-xs font-semibold border transition-all",
                            jourSel === j ? "bg-secondary text-white border-secondary" : "border-alternate text-secondary-text hover:border-secondary/50")}>
                          {j.substring(0, 3)}.
                        </button>
                      ))}
                    </div>
                  )}

                  {chantiers.length === 0 && readOnly && (
                    <p className="text-xs text-secondary-text italic text-center py-3">Aucun chantier enregistré.</p>
                  )}

                  <div className="space-y-3">
                    {chantiers.map((ch, ci) => (
                      <ChantierBlock key={ci}
                        chantier={ch} chantierIdx={ci}
                        vue={vue} jour={jourSel} typeFH={typeFH}
                        onChangeTache={handleChangeTache}
                        onDeleteChantier={handleDeleteChantier}
                        onAddTache={handleAddTache}
                        onDeleteTache={handleDeleteTache}
                        readOnly={readOnlyData}
                      />
                    ))}
                  </div>

                  {chantiers.length > 0 && (totalHeuresSemaine > 38 || heuresParJour.some(h => h > 10)) && (
                    <div className="space-y-1.5">
                      {totalHeuresSemaine > 38 && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700 font-medium">Total semaine : {totalHeuresSemaine}h — dépasse 38h maximum. Créez une seconde feuille pour les heures supplémentaires.</p>
                        </div>
                      )}
                      {heuresParJour.map((h, i) => h > 10 ? (
                        <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 font-medium">{JOURS[i]} : {h}h — dépasse 10h</p>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {!readOnlyData && (
                    <AddChantierPanel
                      operations={operations}
                      operationsLoaded={operationsLoaded}
                      typeFH={typeFH}
                      existingNums={chantiers.map(c => c.numChantier).filter(n => !!n.trim())}
                      onAdd={handleAddChantier}
                    />
                  )}
                </div>
              )}

              {!isNew && (
                <div className="card p-4">
                  <label className="text-xs font-medium text-secondary-text">Observations</label>
                  <textarea className="input-base mt-1 resize-none" rows={2} value={observations}
                    onChange={e => { setObservations(e.target.value); obsUserEdited.current = true; }} readOnly={readOnlyData} />
                </div>
              )}
            </>
          )}

          {/* ══ DEMANDE ABSENCE ══ */}
          {categorie === "Demande autorisation absence" && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Demande d&apos;absence</p>
              <div className="flex flex-wrap gap-1.5">
                {TYPES_ABSENCE.map(t => (
                  <button key={t} onClick={() => !readOnlyData && setTypeAbs(t)} disabled={readOnlyData}
                    className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all",
                      typeAbs === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50",
                      readOnlyData && "opacity-50 cursor-not-allowed")}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="p-3 bg-primary-bg rounded-xl space-y-1">
                <p className="text-xs text-secondary-text">1 — N&apos;oubliez pas de prendre en compte 5 samedis sur une année de congés payés.</p>
                <p className="text-xs text-secondary-text">2 — Il est impératif de faire la demande au moins 15 jours avant la date demandée, sauf circonstances familiales particulières.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary-text">Date de début</label>
                  <input className="input-base mt-1" type="date" value={debutAbs} onChange={e => setDebutAbs(e.target.value)} readOnly={readOnlyData} />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-text">Date de fin</label>
                  <input className="input-base mt-1" type="date" value={finAbs} onChange={e => setFinAbs(e.target.value)} readOnly={readOnlyData} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Nombre de jours ouvrés</label>
                <div className="flex items-center gap-3 mt-1">
                  <input className="input-base flex-1" type="number" min="0" step="0.5" value={nbJours}
                    onChange={e => setNbJours(e.target.value)} readOnly={readOnlyData} />
                  {nbJoursAuto > 0 && (
                    <span className="text-xs text-secondary bg-secondary/10 px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                      Auto : {nbJoursAuto}j
                    </span>
                  )}
                </div>
                {debutAbs && finAbs && <p className="text-xs text-secondary-text mt-1 flex items-center gap-1"><Info size={11} />Calcul auto (lun–ven)</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Observations / Motif</label>
                <textarea className="input-base mt-1 resize-none" rows={2} value={observations}
                  onChange={e => setObservations(e.target.value)} readOnly={readOnlyData} />
              </div>
            </div>
          )}

          {/* ══ TRAVAUX IMPRÉVUS ══ */}
          {categorie === "Fiche de retour Travaux imprévus" && (
            <>
              {/* Section 1 — Identification chantier */}
              <div className="card p-4 space-y-3">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Identification chantier</p>

                {/* Sélecteur chantier */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Chantier</label>
                  {readOnlyData ? (
                    <p className="input-base mt-1 font-semibold text-primary-text">{nomCh || "—"}{numCh ? ` (${numCh})` : ""}</p>
                  ) : (
                    <select className="input-base mt-1" value={tiOperationId}
                      onChange={e => {
                        setTiOperationId(e.target.value);
                        const op = operations.find(o => o.id === e.target.value);
                        if (op) { setNomCh(op.nomChantier); setNumCh(op.numChantier); }
                        else { setNomCh(""); setNumCh(""); }
                      }}>
                      <option value="">— Sélectionner un chantier —</option>
                      {operations.map(op => (
                        <option key={op.id} value={op.id}>{op.nomChantier}{op.numChantier ? ` (${op.numChantier})` : ""}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Date des travaux</label>
                  <input className="input-base mt-1" type="date" value={dateTI} onChange={e => setDateTI(e.target.value)} readOnly={readOnlyData} />
                </div>

                {/* Nature des travaux */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Nature des travaux</label>
                  <textarea className="input-base mt-1 resize-none" rows={3} value={naturesTravaux}
                    onChange={e => setNaturesTravaux(e.target.value)} readOnly={readOnlyData}
                    placeholder="Décrire la nature des travaux imprévus…" />
                </div>

                {/* Estimations */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Estimation matériaux</label>
                    <textarea className="input-base mt-1 resize-none" rows={2} value={estMat}
                      onChange={e => setEstMat(e.target.value)} readOnly={readOnlyData} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Estimation heures</label>
                    <input className="input-base mt-1" value={estH}
                      onChange={e => setEstH(e.target.value)} readOnly={readOnlyData} placeholder="Ex: 4h" />
                  </div>
                </div>

                {/* Conducteur de travaux */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Responsable facturation — conducteur de travaux (si besoin)</label>
                  <select className="input-base mt-1" value={conducteurTxId}
                    onChange={e => setConducteurTxId(e.target.value)}
                    disabled={readOnlyData}>
                    <option value="">— Aucun —</option>
                    {users.filter(u => u.service === "Conducteur travaux").map(u => (
                      <option key={u.id} value={u.id}>{u.displayName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section 2 — Chiffrage & Comptabilité : visible uniquement après envoi */}
              {etatEnvoi === "Envoyé" && <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Chiffrage &amp; Comptabilité</p>
                  {!admin && userApp?.service !== "Comptabilité" && (
                    <span className="text-[10px] text-secondary-text flex items-center gap-1">
                      <Lock size={10} />Service Comptabilité uniquement
                    </span>
                  )}
                </div>

                {/* Visa chiffrage */}
                <div>
                  <label className="text-xs font-medium text-secondary-text mb-1.5 block">Visa chiffrage</label>
                  <div className="flex gap-2">
                    {["Oui", "Non"].map(v => (
                      <button key={v} onClick={() => !readOnlySection2 && setVisa(v === "Oui")}
                        disabled={readOnlySection2}
                        className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",
                          (visa ? "Oui" : "Non") === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text",
                          readOnlySection2 && "opacity-50 cursor-not-allowed")}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-secondary-text mt-1.5 leading-relaxed italic">
                    * Mr KEVIN DOURNEAU est la seule personne habilitée à légitimer un chiffrage via le CDTX
                  </p>
                </div>

                {/* Chiffrage transmis */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Chiffrage transmis</label>
                  <input className="input-base mt-1" value={chiffrage}
                    onChange={e => setChiffrage(e.target.value)} readOnly={readOnlySection2} />
                </div>

                {/* Acceptation */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Acceptation</label>
                  <input className="input-base mt-1" value={accept}
                    onChange={e => setAccept(e.target.value)} readOnly={readOnlySection2} />
                </div>

                {/* Facturation */}
                <div>
                  <label className="text-xs font-medium text-secondary-text">Facturation</label>
                  <input className="input-base mt-1" value={factImprev}
                    onChange={e => setFactImprev(e.target.value)} readOnly={readOnlySection2} />
                </div>

                {/* TS / TMA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">TS</label>
                    <input className="input-base mt-1" value={ts}
                      onChange={e => setTs(e.target.value)} readOnly={readOnlySection2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">TMA</label>
                    <input className="input-base mt-1" value={tma}
                      onChange={e => setTma(e.target.value)} readOnly={readOnlySection2} />
                  </div>
                </div>

                {/* Compte inter / Compte prorata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Compte inter</label>
                    <input className="input-base mt-1" value={cptInter}
                      onChange={e => setCptInter(e.target.value)} readOnly={readOnlySection2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Compte prorata</label>
                    <input className="input-base mt-1" value={cptProrata}
                      onChange={e => setCptProrata(e.target.value)} readOnly={readOnlySection2} />
                  </div>
                </div>
              </div>}
            </>
          )}

          {/* ══ FORFAIT JOUR ══ */}
          {categorie === "Forfait Jour" && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Document Individuel — Demi-journées et journées travaillées</p>

              {/* Sélecteur mois */}
              <div>
                <label className="text-xs font-medium text-secondary-text">Mois concerné</label>
                <input className="input-base mt-1" type="month" value={forfaitMois}
                  onChange={e => setForfaitMois(e.target.value)}
                  readOnly={!isNew && !admin} disabled={!isNew && !admin} />
              </div>

              {/* Légende */}
              <div className="text-[10px] text-secondary-text leading-5 bg-primary-bg rounded-lg px-3 py-2 border border-alternate">
                <span className="font-semibold">Légende :</span>
                {" "}<span className="font-mono font-bold">X</span> demi-journée travaillée ·{" "}
                <span className="font-mono font-bold">JR</span> demi-journée de repos ·{" "}
                <span className="font-mono font-bold">CP</span> congé payé ·{" "}
                <span className="font-mono font-bold">JF</span> jour férié ·{" "}
                <span className="font-mono font-bold">RH</span> repos hebdomadaire ·{" "}
                <span className="font-mono font-bold">ABS</span> autre absence
              </div>

              {/* Grille calendaire */}
              {forfaitMois && (() => {
                const calendar = getCalendarMonth(forfaitMois);
                const weeks = [...new Set(calendar.map(d => d.weekNum))];
                const totalMatin = forfaitJours.filter(j => j.matin === "X").length;
                const totalAm = forfaitJours.filter(j => j.apresMidi === "X").length;

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border border-alternate px-2 py-1.5 text-left font-semibold text-secondary-text bg-primary-bg w-20">Jour</th>
                          <th className="border border-alternate px-2 py-1.5 text-center font-semibold text-secondary-text bg-primary-bg w-8">N°</th>
                          <th className="border border-alternate px-2 py-1.5 text-center font-semibold text-secondary-text bg-primary-bg">Matin</th>
                          <th className="border border-alternate px-2 py-1.5 text-center font-semibold text-secondary-text bg-primary-bg">Après-midi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map(wk => (
                          <>
                            <tr key={`wk-${wk}`}>
                              <td colSpan={4} className="border border-alternate px-2 py-1 bg-primary/10 font-semibold text-primary text-[10px]">
                                Semaine {wk}
                              </td>
                            </tr>
                            {calendar.filter(d => d.weekNum === wk).map(({ day, weekday, isWeekend }) => {
                              const entry = forfaitJours.find(j => j.day === day) ?? { day, matin: "", apresMidi: "" };
                              const bg = isWeekend ? "bg-alternate/50" : "";
                              return (
                                <tr key={day} className={bg}>
                                  <td className="border border-alternate px-2 py-1 text-secondary-text">{weekday}</td>
                                  <td className="border border-alternate px-2 py-1 text-center text-secondary-text font-mono">{day}</td>
                                  <td className="border border-alternate px-1 py-0.5">
                                    <select
                                      className="w-full bg-transparent text-center text-xs font-mono font-semibold focus:outline-none"
                                      value={entry.matin}
                                      disabled={readOnlyData}
                                      onChange={e => setForfaitJours(prev => prev.map(j => j.day === day ? { ...j, matin: e.target.value } : j))}>
                                      {FJ_CODES.map(c => <option key={c} value={c}>{c || "—"}</option>)}
                                    </select>
                                  </td>
                                  <td className="border border-alternate px-1 py-0.5">
                                    <select
                                      className="w-full bg-transparent text-center text-xs font-mono font-semibold focus:outline-none"
                                      value={entry.apresMidi}
                                      disabled={readOnlyData}
                                      onChange={e => setForfaitJours(prev => prev.map(j => j.day === day ? { ...j, apresMidi: e.target.value } : j))}>
                                      {FJ_CODES.map(c => <option key={c} value={c}>{c || "—"}</option>)}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        ))}
                        <tr className="font-semibold bg-primary-bg">
                          <td colSpan={2} className="border border-alternate px-2 py-1.5 text-xs">TOTAL MOIS (X)</td>
                          <td className="border border-alternate px-2 py-1.5 text-center text-xs font-mono">{totalMatin}</td>
                          <td className="border border-alternate px-2 py-1.5 text-center text-xs font-mono">{totalAm}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Sections only shown after creation ── */}
          {!isNew && (
            <>
              {/* État — admin only */}
              <div className="card p-4 space-y-3">
                <Chips label="État de traitement" value={etat} options={ETATS} onChange={v => { setEtat(v); if (v !== "Refusé") setMotifRefus(""); }} disabled={!admin || isValidated} />
                {!admin && (
                  <p className="text-xs text-secondary-text flex items-center gap-1">
                    <Lock size={11} />Seul un administrateur peut modifier l&apos;état.
                  </p>
                )}
                {admin && etat === "Refusé" && (
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Motif de refus <span className="text-secondary-text font-normal">(transmis au salarié par messagerie)</span></label>
                    <textarea
                      className="input-base mt-1 resize-none"
                      rows={3}
                      value={motifRefus}
                      onChange={e => setMotifRefus(e.target.value)}
                      placeholder="Expliquez ce qui doit être corrigé…"
                    />
                  </div>
                )}
              </div>

              {/* Signatures — masquées pour Travaux imprévus, signature salarié seule pour Forfait Jour */}
              {categorie !== "Fiche de retour Travaux imprévus" && <div className="card p-4 space-y-2">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide mb-2">Signatures</p>

                <SigCanvas label="Signature salarié" existing={sigUser} onSave={sUser} disabled={readOnlyData} />

                {/* Sélecteur chef d'équipe + signature chef — masqués pour absence et Forfait Jour */}
                {categorie !== "Demande autorisation absence" && categorie !== "Fiche de retour Travaux imprévus" && categorie !== "Forfait Jour" && (
                  <>
                    {admin || !readOnlyData ? (
                      <div className="border-t border-alternate pt-3">
                        <label className="text-xs font-medium text-secondary-text">Chef d&apos;équipe</label>
                        <select className="input-base mt-1" value={chefEquipeId}
                          onChange={e => setChefEquipeId(e.target.value)}
                          disabled={readOnlyData}>
                          <option value="">— Aucun chef d&apos;équipe —</option>
                          {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                        </select>
                      </div>
                    ) : chefEquipeName ? (
                      <div className="border-t border-alternate pt-3 flex items-center gap-2 text-xs text-secondary-text">
                        <span className="font-medium text-primary-text">Chef d&apos;équipe :</span>
                        <span>{chefEquipeName}</span>
                        {isChef && <span className="badge bg-primary/10 text-primary border-primary/20">Vous</span>}
                      </div>
                    ) : null}
                    <SigCanvas label="Signature chef d'équipe" existing={sigChef} onSave={sChef} disabled={(!admin && !isChef) || isValidated} />
                  </>
                )}

                {/* Nom + signature responsable — masqués pour Forfait Jour */}
                {categorie !== "Forfait Jour" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-secondary-text">Nom du responsable</label>
                      <input className="input-base mt-1" value={nomResp} onChange={e => setNomResp(e.target.value)}
                        readOnly={!admin || isValidated} placeholder="Nom du responsable signataire" />
                    </div>
                    <SigCanvas label="Signature responsable" existing={sigResp} onSave={sResp} disabled={!admin || isValidated} />
                  </>
                )}
              </div>}
            </>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 flex-wrap">
            {isNew && categorie === "Fiche de retour Travaux imprévus" ? (
              <button onClick={handleCreateAndSendTI} disabled={saving}
                className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                {saving ? <Spinner size="sm" /> : <Send size={16} />}
                {saving ? "Envoi…" : "Créer et envoyer le document"}
              </button>
            ) : (!readOnly || isNew) && (
              <button onClick={handleSave} disabled={saving}
                className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                {saving ? <Spinner size="sm" /> : isNew ? <FileText size={16} /> : <Save size={16} />}
                {saving ? "Création…" : isNew ? "Créer le document" : "Sauvegarder"}
              </button>
            )}
            {!isNew && isCreator && (etatEnvoi !== "Envoyé" || etat === "Refusé") && (etat === "En attente" || etat === "Refusé") && (
              <button onClick={handleEnvoyer} disabled={sending}
                className="py-3 flex items-center justify-center gap-2 font-semibold text-sm rounded-xl border-2 transition-all px-4 bg-secondary/10 text-secondary-700 border-secondary/30 hover:bg-secondary/20">
                {sending ? <Spinner size="sm" /> : <Send size={15} />}
                {sending ? "Envoi…" : etat === "Refusé" ? "Renvoyer après correction" : "Envoyer"}
              </button>
            )}
            {!isNew && (!estSalarie || etat === "Validé") && (
              <button onClick={handleDownloadPdf} disabled={generatingPdf}
                className="w-full py-3 flex items-center justify-center gap-2 font-semibold text-sm rounded-xl border-2 border-alternate text-secondary-text hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50">
                {generatingPdf
                  ? <><span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />Génération PDF…</>
                  : <><Download size={16} />Imprimer / Télécharger PDF</>}
              </button>
            )}
          </div>

          {/* ── Suppression ── */}
          {!isNew && (admin || (isCreator && etat === "En attente")) && (
            <div className={cn("rounded-xl border-2 p-3 transition-all", confirmDelete ? "border-red-300 bg-red-50" : "border-alternate")}>
              {confirmDelete ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-error flex items-center gap-2">
                    <Trash2 size={15} />Confirmer la suppression ?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="btn-outline text-xs px-4 py-2">Annuler</button>
                    <button onClick={handleDelete} disabled={deleting}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-error text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-60">
                      {deleting ? <Spinner size="sm" /> : <Trash2 size={13} />}
                      {deleting ? "Suppression…" : "Supprimer définitivement"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={handleDelete}
                  className="w-full flex items-center justify-center gap-2 text-error text-sm font-semibold py-1 hover:opacity-80 transition-opacity">
                  <Trash2 size={15} />Supprimer ce document
                </button>
              )}
            </div>
          )}

          {!isNew && etatEnvoi === "Envoyé" && (
            <div className={cn("text-xs text-center flex items-center justify-center gap-1.5 font-medium",
              etat === "Validé" ? "text-green-600" : etat === "Refusé" ? "text-red-600" : "text-secondary-text"
            )}>
              {etat === "Validé" ? <Check size={11} /> : etat === "Refusé" ? <AlertTriangle size={11} /> : <Send size={11} />}
              {etat === "Validé"
                ? "Document validé par la comptabilité"
                : etat === "Refusé"
                ? "Document refusé — consultez la messagerie pour le motif"
                : "Document envoyé à la comptabilité — en attente de traitement"}
            </div>
          )}

          {/* ── Historique ── */}
          {!isNew && historique.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={13} />Historique
              </p>
              <div className="space-y-2">
                {historique.map(entry => (
                  <div key={entry.id} className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border text-xs",
                    entry.typeAction === "Refus" ? "bg-red-50 border-red-200" : "bg-secondary-bg border-alternate"
                  )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-semibold", entry.typeAction === "Refus" ? "text-red-700" : "text-primary-text")}>
                          {entry.typeAction}
                        </span>
                        {entry.etatDe && entry.etatVers && (
                          <span className="text-secondary-text">{entry.etatDe} → {entry.etatVers}</span>
                        )}
                      </div>
                      <p className="text-secondary-text mt-0.5">{entry.auteurNom}</p>
                      {entry.commentaire && (
                        <p className="mt-1 font-medium text-red-700">Motif : {entry.commentaire}</p>
                      )}
                    </div>
                    <span className="text-secondary-text shrink-0 tabular-nums">{entry.date ? formatDateTime(entry.date) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
