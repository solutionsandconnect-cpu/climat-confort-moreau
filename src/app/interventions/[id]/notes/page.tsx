"use client";
// src/app/interventions/[id]/notes/page.tsx — Notes & Historique (Notes_travaux)

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, serverTimestamp, Timestamp, DocumentReference, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { EmptyState, LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Plus, X, Check, StickyNote, Calendar, Search } from "lucide-react";
import toast from "react-hot-toast";

const TYPES_NOTE = ["Information", "Relance", "Blocage", "Livraison matériel", "Autre"];

function getNoteStyle(type?: string): string {
  switch (type) {
    case "Relance":           return "bg-orange-100 text-orange-700 border-orange-200";
    case "Blocage":           return "bg-red-100 text-red-700 border-red-200";
    case "Historique":        return "bg-slate-100 text-slate-600 border-slate-200";
    case "Assignation":       return "bg-blue-100 text-blue-700 border-blue-200";
    case "Planification":     return "bg-violet-100 text-violet-700 border-violet-200";
    case "Signature client":  return "bg-green-100 text-green-700 border-green-200";
    case "Signature technicien": return "bg-teal-100 text-teal-700 border-teal-200";
    case "Compte rendu":      return "bg-amber-100 text-amber-800 border-amber-300";
    case "Photos":            return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Quitus":            return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "Relances":          return "bg-rose-100 text-rose-700 border-rose-200";
    default:                  return "bg-primary/10 text-primary border-primary/20";
  }
}

interface Note {
  id: string; notes?: string; typeNote?: string; notePar?: DocumentReference;
  dateCreate?: Date; dateRelance?: Date; relancePossible?: string; auto?: string;
  auteurNom?: string;
}

export default function NotesInterventionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser } = useAuthStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [syntheticNotes, setSyntheticNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newType, setNewType] = useState("Information");
  const [saving, setSaving] = useState(false);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [logRef, setLogRef] = useState<DocumentReference | null>(null);
  const [filterType, setFilterType] = useState("Tous");
  const [filterUserId, setFilterUserId] = useState("Tous");
  const [searchQuery, setSearchQuery] = useState("");

  const planRef = doc(db, "Planning", id) as DocumentReference;

  const allNotes = useMemo(() =>
    [...notes, ...syntheticNotes].sort((a, b) => (b.dateCreate?.getTime() ?? 0) - (a.dateCreate?.getTime() ?? 0)),
    [notes, syntheticNotes]
  );

  const uniqueTypes = useMemo(() =>
    ["Tous", ...Array.from(new Set(allNotes.map(n => n.typeNote).filter((t): t is string => !!t)))],
    [allNotes]
  );

  const uniqueAuthors = useMemo(() =>
    [{ id: "Tous", name: "Tous les auteurs" }, ...Array.from(
      allNotes.reduce((m, n) => {
        const refId = (n.notePar as DocumentReference | undefined)?.id;
        if (refId && !m.has(refId)) m.set(refId, userNames.get(refId) ?? "…");
        return m;
      }, new Map<string, string>())
    ).map(([id, name]) => ({ id, name }))],
    [allNotes, userNames]
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allNotes
      .filter(n => filterType === "Tous" || n.typeNote === filterType)
      .filter(n => filterUserId === "Tous" || (n.notePar as DocumentReference | undefined)?.id === filterUserId)
      .filter(n => !q || (n.notes ?? "").toLowerCase().includes(q));
  }, [allNotes, filterType, filterUserId, searchQuery]);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "Notes_travaux"), where("ref_planning", "==", planRef), orderBy("date_create", "desc")),
      snap => {
        setNotes(snap.docs.map(d => ({
          id: d.id, notes: d.data().notes, typeNote: d.data().type_note,
          notePar: d.data().note_par, dateCreate: (d.data().date_create as Timestamp)?.toDate(),
          dateRelance: (d.data().date_relance as Timestamp)?.toDate(),
          relancePossible: d.data().relance_possible, auto: d.data().auto,
        })));
        setLoading(false);
      }
    );

    // Charger les dates de création des entités liées comme entrées synthétiques
    (async () => {
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) return;
      const pd = planSnap.data();
      const entries: Note[] = [];

      const lRef = pd.ref_logement as DocumentReference | undefined;
      if (lRef) setLogRef(lRef);
      const logRef = lRef;
      if (logRef) {
        const logSnap = await getDoc(logRef);
        if (logSnap.exists()) {
          const ld = logSnap.data();
          const d = (ld.date_create as Timestamp)?.toDate();
          if (d) entries.push({ id: "syn_log", notes: `Logement ${ld.num_logement ?? ""} ajouté`, typeNote: "Historique", auto: "Oui", dateCreate: d });
        }
      }

      const opRef = pd.ref_operation as DocumentReference | undefined;
      if (opRef) {
        const opSnap = await getDoc(opRef);
        if (opSnap.exists()) {
          const od = opSnap.data();
          const d = (od.date_create as Timestamp)?.toDate();
          if (d) entries.push({ id: "syn_op", notes: `Chantier créé : ${od.nom_chantier ?? ""}`, typeNote: "Historique", auto: "Oui", dateCreate: d });
        }
      }

      setSyntheticNotes(entries);
    })();

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Résoudre les noms des auteurs
  useEffect(() => {
    const refs = notes.map(n => n.notePar).filter(Boolean) as DocumentReference[];
    const unique = refs.filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
    const unknown = unique.filter(r => !userNames.has(r.id));
    if (unknown.length === 0) return;
    Promise.all(unknown.map(async r => {
      const snap = await getDoc(r);
      return { id: r.id, name: snap.data()?.displayName ?? snap.data()?.nom ?? "Utilisateur" };
    })).then(results => setUserNames(prev => {
      const next = new Map(prev);
      results.forEach(({ id, name }) => next.set(id, name));
      return next;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const handleAdd = async () => {
    if (!newNote.trim()) { toast.error("Note obligatoire"); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, "Notes_travaux"), {
        notes: newNote, type_note: newType, ref_planning: planRef,
        ...(logRef ? { ref_logement: logRef } : {}),
        note_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
        date_create: serverTimestamp(), auto: "Non",
      });
      toast.success("Note ajoutée !");
      setNewNote(""); setNewType("Information");
      setShowForm(false);
    } catch { toast.error("Erreur lors de l'ajout"); }
    finally { setSaving(false); }
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Notes & Historique</h1>
            <p className="text-xs text-secondary-text">
              {filteredNotes.length === allNotes.length
                ? `${allNotes.length} entrée${allNotes.length !== 1 ? "s" : ""}`
                : `${filteredNotes.length} / ${allNotes.length} entrée${allNotes.length !== 1 ? "s" : ""}`}
            </p>

          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Ajouter</button>
        </div>

        {/* Formulaire ajout */}
        {showForm && (
          <div className="card p-4 mb-4 space-y-3 animate-slide-up">
            <div className="flex justify-between"><p className="font-bold text-sm">Nouvelle note</p><button onClick={() => setShowForm(false)}><X size={16} className="text-secondary-text" /></button></div>
            <div>
              <label className="text-xs font-medium text-secondary-text mb-1.5 block">Type de note</label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES_NOTE.map(t => <button key={t} onClick={() => setNewType(t)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", newType === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{t}</button>)}
              </div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Note *</label><textarea className="input-base mt-1 resize-none" rows={3} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Saisissez votre note…" /></div>
            <div className="flex gap-2"><button onClick={handleAdd} disabled={saving} className="btn-primary flex items-center gap-2 flex-1">{saving ? <Spinner size="sm" /> : <Check size={14} />}Ajouter</button><button onClick={() => setShowForm(false)} className="btn-outline px-4"><X size={14} /></button></div>
          </div>
        )}

        {/* Filtres */}
        {allNotes.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text pointer-events-none" />
              <input
                className="input-base pl-8 text-sm"
                placeholder="Rechercher dans les notes…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {uniqueAuthors.length > 1 && (
              <select
                className="input-base text-sm"
                value={filterUserId}
                onChange={e => setFilterUserId(e.target.value)}
              >
                {uniqueAuthors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div className="flex gap-1.5 flex-wrap">
              {uniqueTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    "px-2.5 py-1 rounded-badge text-xs font-semibold border transition-all",
                    filterType === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {allNotes.length === 0
          ? <EmptyState icon={<StickyNote size={28} />} title="Aucune note" description="Ajoutez des notes sur cette intervention." />
          : filteredNotes.length === 0
            ? <p className="text-center text-sm text-secondary-text py-8">Aucune note ne correspond aux filtres.</p>
            : (
              <div className="space-y-2">
                {filteredNotes.map(note => (
                  <div key={note.id} className={cn("card p-4", note.auto === "Oui" ? "bg-primary-bg/60 border-dashed" : "")}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className={cn("badge border text-xs", getNoteStyle(note.typeNote))}>
                        {note.typeNote || "Note"}
                      </span>
                      <span className="text-xs text-secondary-text shrink-0">{formatDateTime(note.dateCreate)}</span>
                    </div>
                    {note.auto !== "Oui" && (note.notePar as DocumentReference | undefined)?.id && (
                      <p className="text-xs text-secondary-text mb-1">{userNames.get((note.notePar as DocumentReference).id) ?? "…"}</p>
                    )}
                    <p className="text-sm text-primary-text leading-relaxed">{note.notes}</p>
                    {note.dateRelance && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-600 bg-orange-50 px-2.5 py-1.5 rounded-lg w-fit">
                        <Calendar size={11} />Relance : {formatDateTime(note.dateRelance)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
        }
      </div>
    </AppShell>
  );
}
