"use client";
// src/app/interventions/[id]/notes/page.tsx — Notes & Historique (Notes_travaux)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, serverTimestamp, Timestamp, DocumentReference, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { EmptyState, LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { ArrowLeft, Plus, X, Check, StickyNote, Calendar } from "lucide-react";
import toast from "react-hot-toast";

const TYPES_NOTE = ["Information", "Relance", "Blocage", "Livraison matériel", "Autre"];

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

  const planRef = doc(db, "Planning", id) as DocumentReference;

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
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Notes & Historique</h1>
            <p className="text-xs text-secondary-text">{notes.length} note{notes.length !== 1 ? "s" : ""}</p>

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

        {(() => {
          const allNotes = [...notes, ...syntheticNotes]
            .sort((a, b) => (b.dateCreate?.getTime() ?? 0) - (a.dateCreate?.getTime() ?? 0));
          if (allNotes.length === 0) return <EmptyState icon={<StickyNote size={28} />} title="Aucune note" description="Ajoutez des notes sur cette intervention." />;
          return (
            <div className="space-y-2">
              {allNotes.map(note => (
                <div key={note.id} className={cn("card p-4", note.auto === "Oui" ? "bg-primary-bg/60 border-dashed" : "")}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className={cn("badge border text-xs",
                      note.typeNote === "Relance" ? "bg-orange-100 text-orange-700 border-orange-200"
                      : note.typeNote === "Blocage" ? "bg-red-100 text-red-700 border-red-200"
                      : note.typeNote === "Historique" ? "bg-secondary/10 text-secondary-600 border-secondary/20"
                      : "bg-primary/10 text-primary border-primary/20")}>
                      {note.typeNote || "Note"}{note.auto === "Oui" ? " (auto)" : ""}
                    </span>
                    <span className="text-xs text-secondary-text shrink-0">{formatDateTime(note.dateCreate)}</span>
                  </div>
                  <p className="text-sm text-primary-text leading-relaxed">{note.notes}</p>
                  {note.dateRelance && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-600 bg-orange-50 px-2.5 py-1.5 rounded-lg w-fit">
                      <Calendar size={11} />Relance : {formatDateTime(note.dateRelance)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}
