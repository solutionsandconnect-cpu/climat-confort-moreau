"use client";
// src/app/journal-interne/page.tsx — PDF + date envoi + service

import { useEffect, useState, useRef } from "react";
import { doc, collection, query, orderBy, onSnapshot, addDoc, deleteDoc, getDocs, where, serverTimestamp, Timestamp, DocumentReference, updateDoc, arrayUnion } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateRelative, getInitials } from "@/lib/utils";
import { BookOpen, Plus, Trash2, X, ChevronDown, ChevronUp, Send, Eye, FileText, Calendar, Paperclip, ExternalLink, CheckCircle2 } from "lucide-react";
import { LISTE_SERVICES } from "@/types";
import toast from "react-hot-toast";

interface JItem { id: string; titre?: string; text?: string; docEnvoye?: string; nomDocument?: string; dateCreate?: Date; dateEnvoi?: Date; userCreate?: DocumentReference; listeNomEnvoi?: string[]; auteurNom?: string; listeLus?: string[]; listeNomLus?: string[]; }

function Card({ item, canDelete, onDelete, currentUserId, onMarkRead }: { item: JItem; canDelete: boolean; onDelete: () => void; currentUserId: string; onMarkRead: () => void; }) {
  const [open, setOpen] = useState(false);
  const isRead = item.listeLus?.includes(currentUserId);
  return (
    <div className={cn("card overflow-hidden", !isRead && item.listeNomEnvoi?.length ? "border-primary/30" : "")}>
      <div className="px-4 py-3.5 cursor-pointer hover:bg-primary-bg/50" onClick={() => setOpen(!open)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {!isRead && item.listeNomEnvoi?.length ? <span className="w-2 h-2 rounded-full bg-primary shrink-0" /> : null}
              <p className="font-semibold text-primary-text text-sm">{item.titre || "Sans titre"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {item.auteurNom && <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-[9px] font-bold text-primary">{getInitials(item.auteurNom)}</span></div><span className="text-xs text-secondary-text">{item.auteurNom}</span></div>}
              <span className="text-xs text-secondary-text">{formatDateRelative(item.dateCreate)}</span>
              {item.dateEnvoi && <span className="text-xs text-secondary-text flex items-center gap-1"><Calendar size={10} />Envoi : {formatDate(item.dateEnvoi)}</span>}
              {item.nomDocument && <span className="text-xs text-primary flex items-center gap-1"><Paperclip size={10} />{item.nomDocument}</span>}
            </div>
            {item.listeNomEnvoi?.length ? <div className="flex items-center gap-1.5 mt-1"><Eye size={11} className="text-secondary-text" /><span className="text-xs text-secondary-text">Services : {item.listeNomEnvoi.join(", ")}</span></div> : null}
            {item.listeLus && item.listeLus.length > 0 && (
              <button className="flex items-center gap-1.5 mt-1 hover:opacity-80" onClick={e => { e.stopPropagation(); setOpen(true); }}>
                <CheckCircle2 size={11} className="text-green-600" />
                <span className="text-xs text-green-600 underline">{item.listeLus.length} lecture{item.listeLus.length > 1 ? "s" : ""}</span>
              </button>
            )}
            {item.listeNomEnvoi?.length && (!item.listeLus || item.listeLus.length === 0) && (
              <span className="text-xs text-secondary-text mt-1 block">Aucune lecture enregistrée</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isRead && item.listeNomEnvoi?.length ? (
              <button onClick={e => { e.stopPropagation(); onMarkRead(); }} className="text-xs font-semibold text-primary hover:text-primary-600 transition-colors px-2 py-1 rounded-lg hover:bg-primary/10">Marquer lu</button>
            ) : null}
            {canDelete && <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50"><Trash2 size={13} /></button>}
            {open ? <ChevronUp size={16} className="text-secondary-text" /> : <ChevronDown size={16} className="text-secondary-text" />}
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-alternate px-4 py-3 bg-primary-bg/40 space-y-2">
          <p className="text-sm text-primary-text leading-relaxed whitespace-pre-wrap">{item.text || "Pas de contenu"}</p>
          {item.docEnvoye && <a href={item.docEnvoye} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"><FileText size={14} />Voir le PDF<ExternalLink size={12} /></a>}
          {/* Qui a lu */}
          {item.listeNomLus && item.listeNomLus.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-secondary-text mb-1">Lu par :</p>
              <div className="flex flex-wrap gap-1.5">
                {item.listeNomLus.map((n, i) => <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-badge">{n}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Form({ currentUserId, onClose, onSubmit }: { currentUserId: string; onClose: () => void; onSubmit: (d: { titre: string; text: string; nomDocument: string; dateEnvoi: string; services: string[]; pdfFile?: File; }) => Promise<void>; }) {
  const [titre, setTitre] = useState(""); const [text, setText] = useState(""); const [nomDoc, setNomDoc] = useState(""); const [dateEnvoi, setDateEnvoi] = useState(""); const [services, setServices] = useState<string[]>([]); const [pdf, setPdf] = useState<File | null>(null); const [saving, setSaving] = useState(false);
  const fRef = useRef<HTMLInputElement>(null);
  const toggle = (s: string) => setServices(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const submit = async () => {
    if (!titre.trim() || !text.trim() || !nomDoc.trim()) { toast.error("Titre, contenu et nom document obligatoires"); return; }
    setSaving(true);
    try { await onSubmit({ titre, text, nomDocument: nomDoc, dateEnvoi, services, pdfFile: pdf ?? undefined }); toast.success("Publié !"); onClose(); }
    catch (e: any) { console.error("Journal publish error:", e); toast.error(`Erreur : ${e?.message ?? "Vérifiez les règles Firebase"}`); } finally { setSaving(false); }
  };
  return (
    <div className="card p-4 mb-4 space-y-3 animate-slide-up">
      <div className="flex items-center justify-between"><h3 className="font-bold text-sm text-primary-text">Nouvel article</h3><button onClick={onClose}><X size={16} className="text-secondary-text" /></button></div>
      <div><label className="text-xs font-medium text-secondary-text">Titre *</label><input className="input-base mt-1" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre…" /></div>
      <div><label className="text-xs font-medium text-secondary-text">Nom du document *</label><input className="input-base mt-1" value={nomDoc} onChange={e => setNomDoc(e.target.value)} placeholder="Note de service du…" /></div>
      <div><label className="text-xs font-medium text-secondary-text">Contenu *</label><textarea className="input-base mt-1 resize-none" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Contenu de l'article…" /></div>
      <div><label className="text-xs font-medium text-secondary-text">Date d&apos;envoi</label><input className="input-base mt-1" type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} /></div>
      <div>
        <label className="text-xs font-medium text-secondary-text mb-1.5 block">Document PDF</label>
        {pdf ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary-bg border border-alternate"><FileText size={16} className="text-primary shrink-0" /><span className="text-sm flex-1 truncate">{pdf.name}</span><button onClick={() => setPdf(null)}><X size={14} /></button></div>
        ) : (
          <button onClick={() => fRef.current?.click()} className="w-full p-3 border-2 border-dashed border-alternate rounded-xl text-sm text-secondary-text hover:border-primary/40 flex items-center justify-center gap-2"><Paperclip size={16} />Ajouter un PDF</button>
        )}
        <input ref={fRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = ""; }} />
      </div>
      <div>
        <label className="text-xs font-medium text-secondary-text mb-1.5 block">Services destinataires</label>
        <div className="flex flex-wrap gap-1.5">
          {LISTE_SERVICES.map(s => <button key={s} onClick={() => toggle(s)} className={cn("px-2.5 py-1 rounded-badge text-xs font-medium border transition-all", services.includes(s) ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{s}</button>)}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2 flex-1">{saving ? <Spinner size="sm" /> : <Send size={14} />}Publier</button>
        <button onClick={onClose} className="btn-outline px-4">Annuler</button>
      </div>
    </div>
  );
}

export default function JournalInternePage() {
  const { firebaseUser, userApp } = useAuthStore();
  const [items, setItems] = useState<JItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(query(collection(db, "Journal_interne"), orderBy("date_create", "desc")), async snap => {
      const itemsRaw = snap.docs.map(d => ({ id: d.id, titre: d.data().titre, text: d.data().text, docEnvoye: d.data().doc_envoye, nomDocument: d.data().nom_document, dateCreate: (d.data().date_create as Timestamp)?.toDate(), dateEnvoi: (d.data().date_envoi as Timestamp)?.toDate(), userCreate: d.data().user_create, listeNomEnvoi: d.data().liste_nom_envoi as string[] }));
      // Charger sous-collections lecture pour chaque item
      const withReads = await Promise.all(itemsRaw.map(async item => {
        const lectureSnap = await getDocs(collection(db, "Journal_interne", item.id, "lecture_document_journal_interne"));
        const listeLus = lectureSnap.docs.map(d => (d.data().user_lu as DocumentReference)?.id).filter(Boolean);
        const listeNomLus = lectureSnap.docs.map(d => d.data().nom_user_lu as string).filter(Boolean);
        return { ...item, listeLus, listeNomLus };
      }));
      setItems(withReads);
      setLoading(false);
    });
    getDocs(collection(db, "usersapp")).then(snap => { const m = new Map<string, string>(); snap.docs.forEach(d => m.set(d.id, (d.data().display_name as string) ?? `${d.data().prenom} ${d.data().nom}`)); setNames(m); });
    return () => unsub();
  }, []);

  const submit = async (data: { titre: string; text: string; nomDocument: string; dateEnvoi: string; services: string[]; pdfFile?: File; }) => {
    if (!firebaseUser) return;
    let pdfUrl = "";
    if (data.pdfFile) {
      try {
        const path = `journal/${firebaseUser.uid}/${Date.now()}_${data.pdfFile.name.replace(/\s/g, "_")}`;
        const r = storageRef(storage, path);
        const snapshot = await uploadBytes(r, data.pdfFile);
        pdfUrl = await getDownloadURL(snapshot.ref);
      } catch (e: any) {
        console.error("Storage error:", e);
        if (e?.code === "storage/unauthorized") {
          toast("PDF non uploadé : règles Firebase Storage à configurer. L'article sera publié sans pièce jointe.", { duration: 5000 });
        }
        pdfUrl = ""; // Continue sans PDF
      }
    }
    let listeEnvoi: DocumentReference[] = [];
    if (data.services.length > 0) {
      const snap = await getDocs(query(collection(db, "usersapp"), where("service_appartenance", "in", data.services)));
      listeEnvoi = snap.docs.map(d => doc(db, "usersapp", d.id) as DocumentReference);
    }
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    await addDoc(collection(db, "Journal_interne"), {
      titre: data.titre, text: data.text,
      nom_document: data.nomDocument.replace(/\s/g, "_"),
      doc_envoye: pdfUrl,
      date_envoi: data.dateEnvoi ? new Date(data.dateEnvoi) : null,
      user_create: userRef,
      Liste_envoi: listeEnvoi,
      liste_nom_envoi: data.services,
      date_create: serverTimestamp(),
      Liste_lecture: userRef,
    });
  };

  const markRead = async (item: JItem) => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const nomUser = names.get(firebaseUser.uid) ?? "Inconnu";
    await addDoc(collection(db, "Journal_interne", item.id, "lecture_document_journal_interne"), {
      user_lu: userRef, nom_user_lu: nomUser, date_create: serverTimestamp(),
    });
    toast.success("Marqué comme lu");
  };

  const withNames = items.map(i => ({ ...i, auteurNom: i.userCreate ? names.get(i.userCreate.id) : undefined }));
  const filtered = withNames.filter(i => { if (!search.trim()) return true; const q = search.toLowerCase(); return i.titre?.toLowerCase().includes(q) || i.text?.toLowerCase().includes(q) || i.auteurNom?.toLowerCase().includes(q); });

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  return (
    <AppShell>
      <div className="animate-page-enter max-w-3xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div><h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Journal interne</h1><p className="text-sm text-secondary-text mt-0.5">{items.length} article{items.length !== 1 ? "s" : ""}</p></div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /><span className="hidden sm:inline">Nouvel article</span></button>
        </div>
        <div className="mb-4"><SearchInput value={search} onChange={setSearch} placeholder="Rechercher dans le journal…" /></div>
        {showForm && <Form currentUserId={firebaseUser?.uid ?? ""} onClose={() => setShowForm(false)} onSubmit={submit} />}
        {filtered.length === 0 ? <EmptyState icon={<BookOpen size={28} />} title="Aucun article" description="Publiez le premier article du journal interne." /> : (
          <div className="space-y-2">{filtered.map(item => <Card key={item.id} item={item} canDelete={isAdmin(userApp) || item.userCreate?.id === firebaseUser?.uid} currentUserId={firebaseUser?.uid ?? ""} onMarkRead={() => markRead(item)} onDelete={async () => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "Journal_interne", item.id)); toast.success("Supprimé"); }} />)}</div>
        )}
      </div>
    </AppShell>
  );
}
