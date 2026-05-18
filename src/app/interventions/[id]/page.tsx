"use client";
// src/app/interventions/[id]/page.tsx — complet avec date/heure, signature, notes

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc, Timestamp, DocumentReference, addDoc, collection, onSnapshot, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { subscribeIntervention, updateIntervention, createRelance, countRelances, resolveUserNom, resolveLogementInfo, resolveOperationInfo, type InterventionDetail } from "@/lib/formsService";
import { LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Clock, User, Home, Building2, Pencil, Check, X, CheckCircle2, AlertCircle, FileText, Bell, Save, Camera, StickyNote, Pen, Trash2, Plus } from "lucide-react";
import toast from "react-hot-toast";

function StatutBadge({ statut }: { statut?: string }) {
  const cfg = statut === "Réalisé" ? "bg-green-100 text-green-800 border-green-200" : statut === "Annulé" ? "bg-red-100 text-red-700 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200";
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
// Signature Canvas
// ============================================
function SignatureCanvas({ label, existing, onSave }: { label: string; existing?: string; onSave: (dataUrl: string) => Promise<void>; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "draw">(existing ? "view" : "draw");

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  };

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2; ctx.lineCap = "round";

    const start = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const p = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: MouseEvent | TouchEvent) => { e.preventDefault(); if (!drawing.current) return; const p = getPos(e, canvas); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing.current = false; };

    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", move); canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start); canvas.removeEventListener("touchmove", move); canvas.removeEventListener("touchend", end);
    };
  }, [mode]);

  const clear = () => { const ctx = canvasRef.current?.getContext("2d"); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSave(dataUrl);
      setSaved(true); setMode("view"); toast.success("Signature enregistrée !");
    } catch { toast.error("Erreur"); } finally { setSaving(false); }
  };

  return (
    <div className="p-4 border-t border-alternate">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-primary-text">{label}</p>
        {(existing || saved) ? (
          <button onClick={() => setMode(mode === "view" ? "draw" : "view")} className="text-xs text-primary font-semibold">
            {mode === "view" ? "Re-signer" : "Annuler"}
          </button>
        ) : null}
      </div>
      {mode === "view" && existing ? (
        <div className="bg-primary-bg rounded-xl p-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <img src={existing} alt="signature" className="max-h-16 rounded border border-alternate" />
        </div>
      ) : (
        <div>
          <canvas ref={canvasRef} width={400} height={120} className="w-full border-2 border-dashed border-alternate rounded-xl bg-white cursor-crosshair touch-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={clear} className="btn-outline flex items-center gap-1.5 text-xs px-3 py-2"><Trash2 size={12} />Effacer</button>
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2 flex-1 justify-center">{saving ? <Spinner size="sm" /> : <Check size={12} />}Valider la signature</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DetailsInterventionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [inter, setInter] = useState<InterventionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nbRelances, setNbRelances] = useState(0);
  const [techNom, setTechNom] = useState("");
  const [logementInfo, setLogementInfo] = useState({ num: "—", occupant: "—" });
  const [chantierInfo, setChantierInfo] = useState({ nom: "—", num: "—" });

  // Édition infos
  const [editInfos, setEditInfos] = useState(false);
  const [statut, setStatut] = useState(""); const [travauxFinis, setTravauxFinis] = useState(""); const [presenceOccupant, setPresenceOccupant] = useState(""); const [facturable, setFacturable] = useState(""); const [nomFact, setNomFact] = useState(""); const [mailFact, setMailFact] = useState(""); const [savingInfos, setSavingInfos] = useState(false);

  // Édition date/heure
  const [editDate, setEditDate] = useState(false);
  const [newDate, setNewDate] = useState(""); const [newHeureDebut, setNewHeureDebut] = useState(""); const [newHeureFin, setNewHeureFin] = useState(""); const [savingDate, setSavingDate] = useState(false);

  // CR
  const [editCR, setEditCR] = useState(false);
  const [cr, setCr] = useState(""); const [savingCR, setSavingCR] = useState(false);

  // Relance
  const [showRelance, setShowRelance] = useState(false);
  const [motifRelance, setMotifRelance] = useState(""); const [savingRelance, setSavingRelance] = useState(false);

  // Signature
  const [nomSignataire, setNomSignataire] = useState(""); const [prenomSignataire, setPrenomSignataire] = useState("");

  // Photos après (pour le compte rendu)
  const [photosApres, setPhotosApres] = useState<{id: string; url: string}[]>([]);
  const [uploadingApres, setUploadingApres] = useState(false);
  const photosApresInputRef = useRef<HTMLInputElement>(null);

  const planRef = doc(db, "Planning", id) as DocumentReference;

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeIntervention(id, async item => {
      if (!item) { toast.error("Intervention introuvable"); router.back(); return; }
      setInter(item); setCr(item.compteRenduTechnicien ?? ""); setStatut(item.statutRdv ?? ""); setTravauxFinis(item.travauxFinis ?? ""); setPresenceOccupant(item.presenceOccupant ?? ""); setFacturable(item.demandeFacturable ?? ""); setNomFact(item.nomFacturation ?? ""); setMailFact(item.mailFacturation ?? "");
      setNomSignataire(item.nomClientSignataire ?? ""); setPrenomSignataire(item.prenomClientSignature ?? "");
      if (item.dateRdv) setNewDate(format(item.dateRdv, "yyyy-MM-dd"));
      if (item.heureRdv) setNewHeureDebut(format(item.heureRdv, "HH:mm"));
      if (item.heureFinRdv) setNewHeureFin(format(item.heureFinRdv, "HH:mm"));
      if (item.refUsers) resolveUserNom(item.refUsers).then(setTechNom);
      else if (item.sousTraitant) setTechNom(item.sousTraitant);
      if (item.refLogement) resolveLogementInfo(item.refLogement).then(setLogementInfo);
      if (item.refOperation) resolveOperationInfo(item.refOperation).then(setChantierInfo);
      setLoading(false);
    });
    countRelances(id).then(setNbRelances);

    // Charger photos après
    const unsubPhotos = onSnapshot(collection(db, "Planning", id, "Photo_apres"), snap => {
      setPhotosApres(snap.docs.map(d => ({ id: d.id, url: d.data().photos_apres as string })));
    });

    return () => { unsub(); unsubPhotos(); };
  }, [id, router]);

  const handleSaveInfos = async () => { setSavingInfos(true); try { await updateIntervention(id, { statutRdv: statut, travauxFinis, presenceOccupant, demandeFacturable: facturable, nomFacturation: nomFact, mailFacturation: mailFact }); setEditInfos(false); toast.success("Mis à jour"); } catch { toast.error("Erreur"); } finally { setSavingInfos(false); } };
  const handleSaveCR = async () => { setSavingCR(true); try { await updateIntervention(id, { compteRenduTechnicien: cr }); setEditCR(false); toast.success("CR sauvegardé"); } catch { toast.error("Erreur"); } finally { setSavingCR(false); } };

  const handleSaveDate = async () => {
    setSavingDate(true);
    try {
      const updates: Record<string, any> = {};
      if (newDate) updates.date_rdv = Timestamp.fromDate(new Date(newDate));
      if (newHeureDebut) { const [h, m] = newHeureDebut.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heure_rdv = Timestamp.fromDate(d); }
      if (newHeureFin) { const [h, m] = newHeureFin.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0); updates.heure_fin_rdv = Timestamp.fromDate(d); }
      // Mise à jour état logement à "Planifié"
      if (inter?.refLogement) await updateDoc(inter.refLogement, { etat_chantier: "Planifié" });
      await updateDoc(planRef, updates);
      setEditDate(false); toast.success("Date/heure mise à jour !");
    } catch { toast.error("Erreur"); } finally { setSavingDate(false); }
  };

  const handleSignatureClient = async (dataUrl: string) => {
    const r = storageRef(storage, `signatures/client_${id}_${Date.now()}.png`);
    const res = await fetch(dataUrl); const blob = await res.blob();
    await uploadBytes(r, blob); const url = await getDownloadURL(r);
    await updateDoc(planRef, { signatureClient: url, nomClientSignataire: nomSignataire, prenomClientSignature: prenomSignataire, date_signature_client: serverTimestamp() });
    if (inter?.refLogement) await updateDoc(inter.refLogement, { etat_signature: "Signé" });
  };

  const handleSignatureTech = async (dataUrl: string) => {
    const r = storageRef(storage, `signatures/tech_${id}_${Date.now()}.png`);
    const res = await fetch(dataUrl); const blob = await res.blob();
    await uploadBytes(r, blob); const url = await getDownloadURL(r);
    await updateDoc(planRef, { signature_technicien: url, date_signature_technicien: serverTimestamp() });
  };

  const handleRelance = async () => {
    if (!inter?.refLogement || !firebaseUser) return;
    setSavingRelance(true);
    try { await createRelance({ planningRef: planRef, logementRef: inter.refLogement, motif: motifRelance, createParRef: doc(db, "usersapp", firebaseUser.uid) as DocumentReference }); setNbRelances(n => n + 1); setShowRelance(false); setMotifRelance(""); toast.success("Relance créée !"); }
    catch { toast.error("Erreur"); } finally { setSavingRelance(false); }
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  if (!inter) return null;

  const dateLabel = inter.dateRdv ? format(inter.dateRdv, "EEEE dd MMMM yyyy", { locale: fr }) : "Date non définie";
  const heureLabel = inter.heureRdv ? `${format(inter.heureRdv, "HH:mm")}${inter.heureFinRdv ? ` – ${format(inter.heureFinRdv, "HH:mm")}` : ""}` : null;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div className="flex-1 min-w-0"><h1 className="text-xl font-bold text-primary-text capitalize" style={{ fontFamily: "var(--font-inter-tight)" }}>{dateLabel}</h1></div>
          <button onClick={() => router.push(`/interventions/${id}/modifier`)} className="btn-outline flex items-center gap-1.5 text-sm shrink-0"><Pencil size={14} />Modifier</button>
          <StatutBadge statut={inter.statutRdv} />
        </div>

        {/* Carte principale */}
        <div className="card overflow-hidden mb-4">
          <div className="h-1.5 bg-primary" />
          <div className="p-4">
            {/* Date/heure + bouton modifier */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {heureLabel && <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg"><Clock size={14} /><span className="text-sm font-bold">{heureLabel}</span></div>}
                {inter.typeDemande && <span className="badge bg-secondary/15 text-secondary-600 border-secondary/20">{inter.typeDemande}</span>}
              </div>
              <button onClick={() => setEditDate(!editDate)} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Modifier date</button>
            </div>

            {/* Édition date/heure */}
            {editDate && (
              <div className="bg-primary-bg rounded-xl p-3 mb-3 space-y-2 animate-slide-up">
                <div><label className="text-xs font-medium text-secondary-text">Date du RDV</label><input className="input-base mt-1" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium text-secondary-text">Heure début</label><input className="input-base mt-1" type="time" value={newHeureDebut} onChange={e => setNewHeureDebut(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-secondary-text">Heure fin</label><input className="input-base mt-1" type="time" value={newHeureFin} onChange={e => setNewHeureFin(e.target.value)} /></div>
                </div>
                <div className="flex gap-2"><button onClick={handleSaveDate} disabled={savingDate} className="btn-primary flex items-center gap-2 flex-1 text-sm">{savingDate ? <Spinner size="sm" /> : <Check size={13} />}Confirmer</button><button onClick={() => setEditDate(false)} className="btn-outline px-3"><X size={13} /></button></div>
              </div>
            )}

            {/* Logement + chantier */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-primary-bg rounded-xl p-3"><div className="flex items-center gap-1.5 mb-1"><Home size={13} className="text-secondary-text" /><p className="text-xs text-secondary-text">Logement</p></div><p className="text-sm font-semibold">{logementInfo.num}</p><p className="text-xs text-secondary-text truncate">{logementInfo.occupant}</p></div>
              <div className="bg-primary-bg rounded-xl p-3"><div className="flex items-center gap-1.5 mb-1"><Building2 size={13} className="text-secondary-text" /><p className="text-xs text-secondary-text">Chantier</p></div><p className="text-sm font-semibold truncate">{chantierInfo.nom}</p><p className="text-xs text-secondary-text">N° {chantierInfo.num}</p></div>
            </div>
            {techNom && <div className="flex items-center gap-2.5 mb-3"><div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center"><User size={14} className="text-secondary-600" /></div><div><p className="text-xs text-secondary-text">Technicien</p><p className="text-sm font-semibold">{techNom}</p></div></div>}
            {inter.descriptifTravaux && <div className="bg-primary-bg rounded-xl p-3"><p className="text-xs text-secondary-text mb-1">Descriptif</p><p className="text-sm leading-relaxed">{inter.descriptifTravaux}</p></div>}
          </div>
        </div>

        {/* Informations */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations</p>
            {!editInfos && <button onClick={() => setEditInfos(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold"><Pencil size={12} />Modifier</button>}
          </div>
          {!editInfos ? (
            <div className="divide-y divide-alternate/60 text-sm">
              {[["Statut", inter.statutRdv], ["Travaux finis", inter.travauxFinis], ["Présence occupant", inter.presenceOccupant], ["Facturable", inter.demandeFacturable], ["Temps alloué", inter.tempsAlloue ? `${inter.tempsAlloue}h` : null], ["Nom facturation", inter.nomFacturation], ["Email facturation", inter.mailFacturation]].map(([label, val]) => val ? (
                <div key={label} className="flex items-center gap-3 py-2.5 px-4"><p className="text-xs text-secondary-text w-32 shrink-0">{label}</p><p className="font-medium text-primary-text">{val}</p></div>
              ) : null)}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <Chips label="Statut" value={statut} options={["En attente", "Réalisé", "Annulé"]} onChange={setStatut} />
              <Chips label="Travaux finis" value={travauxFinis} options={["Oui", "Non", "Partiellement"]} onChange={setTravauxFinis} />
              <Chips label="Présence occupant" value={presenceOccupant} options={["Présent", "Absent"]} onChange={setPresenceOccupant} />
              <Chips label="Facturable" value={facturable} options={["Travaux facturables", "Travaux non facturables"]} onChange={setFacturable} />
              {facturable === "Travaux facturables" && <>
                <div><label className="text-xs font-medium text-secondary-text">Nom facturation</label><input className="input-base mt-1" value={nomFact} onChange={e => setNomFact(e.target.value)} /></div>
                <div><label className="text-xs font-medium text-secondary-text">Email facturation</label><input className="input-base mt-1" type="email" value={mailFact} onChange={e => setMailFact(e.target.value)} /></div>
              </>}
              <div className="flex gap-2"><button onClick={handleSaveInfos} disabled={savingInfos} className="btn-primary flex items-center gap-2 flex-1">{savingInfos ? <Spinner size="sm" /> : <Check size={14} />}Sauvegarder</button><button onClick={() => setEditInfos(false)} className="btn-outline px-4"><X size={14} /></button></div>
            </div>
          )}
        </div>

        {/* Signatures */}
        <div className="card overflow-hidden mb-4">
          <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate"><p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Signatures & Heures</p></div>
          {/* Heures arrivée/départ technicien */}
          <div className="p-4 pb-0 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary-text">Heure arrivée technicien</label>
              <input className="input-base mt-1" type="time"
                defaultValue={inter.heureDebutInter ? format(inter.heureDebutInter, "HH:mm") : ""}
                onBlur={async e => { if (e.target.value) { const [h,m] = e.target.value.split(":").map(Number); const d = new Date(); d.setHours(h,m,0); await updateDoc(planRef, { heureDebutInter: Timestamp.fromDate(d) }); } }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Heure départ technicien</label>
              <input className="input-base mt-1" type="time"
                defaultValue={inter.heureFinInter ? format(inter.heureFinInter, "HH:mm") : ""}
                onBlur={async e => { if (e.target.value) { const [h,m] = e.target.value.split(":").map(Number); const d = new Date(); d.setHours(h,m,0); await updateDoc(planRef, { heureFinInter: Timestamp.fromDate(d) }); } }}
              />
            </div>
          </div>
          {/* Nom signataire client - toujours visible, sauvegarde à la saisie */}
          <div className="p-4 pb-0 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary-text">Nom client signataire</label>
              <input className="input-base mt-1" value={nomSignataire} onChange={e => setNomSignataire(e.target.value)}
                onBlur={async e => { if (e.target.value) await updateDoc(planRef, { nomClientSignataire: e.target.value }); }}
                placeholder="Nom" />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Prénom client</label>
              <input className="input-base mt-1" value={prenomSignataire} onChange={e => setPrenomSignataire(e.target.value)}
                onBlur={async e => { if (e.target.value) await updateDoc(planRef, { prenomClientSignature: e.target.value }); }}
                placeholder="Prénom" />
            </div>
          </div>
          <SignatureCanvas label="Signature client" existing={inter.signatureClient} onSave={handleSignatureClient} />
          <SignatureCanvas label="Signature technicien" existing={inter.signatureTechnicien} onSave={handleSignatureTech} />
        </div>

        {/* Compte rendu + Photos */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Compte rendu & Photos</p>
            {!editCR && <button onClick={() => setEditCR(true)} className="text-xs text-primary font-semibold flex items-center gap-1"><Pencil size={12} />Rédiger</button>}
          </div>
          <div className="p-4">
            {!editCR ? <p className={cn("text-sm leading-relaxed", !inter.compteRenduTechnicien && "text-secondary-text italic")}>{inter.compteRenduTechnicien || "Aucun compte rendu"}</p> : (
              <div className="space-y-3">
                <textarea className="input-base resize-none" rows={5} value={cr} onChange={e => setCr(e.target.value)} placeholder="Travaux réalisés, observations…" />
                <div className="flex gap-2"><button onClick={handleSaveCR} disabled={savingCR} className="btn-primary flex items-center gap-2 flex-1">{savingCR ? <Spinner size="sm" /> : <Save size={14} />}Sauvegarder</button><button onClick={() => { setEditCR(false); setCr(inter.compteRenduTechnicien ?? ""); }} className="btn-outline px-4"><X size={14} /></button></div>
              </div>
            )}

            {/* Photos après intervention directement depuis le CR */}
            <div className="mt-4 pt-4 border-t border-alternate">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-secondary-text">Photos après intervention</p>
                <button onClick={() => photosApresInputRef.current?.click()} disabled={uploadingApres}
                  className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                  {uploadingApres ? <Spinner size="sm" /> : <Camera size={13} />}Ajouter
                </button>
                <input ref={photosApresInputRef} type="file" accept="image/*" className="hidden" multiple
                  onChange={async e => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    setUploadingApres(true);
                    for (const file of files) {
                      try {
                        const r = storageRef(storage, `interventions/${id}/apres/${Date.now()}_${file.name}`);
                        const snap = await uploadBytes(r, file);
                        const url = await getDownloadURL(snap.ref);
                        await addDoc(collection(db, "Planning", id, "Photo_apres"), { photos_apres: url, date_create: serverTimestamp(), planning_ref: planRef });
                      } catch (err) { console.error(err); }
                    }
                    setUploadingApres(false);
                    toast.success("Photos ajoutées !");
                    e.target.value = "";
                  }} />
              </div>
              {photosApres.length === 0 ? (
                <button onClick={() => photosApresInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-alternate rounded-xl flex items-center justify-center gap-2 text-sm text-secondary-text hover:border-primary/40 hover:text-primary transition-colors">
                  <Camera size={18} />Ajouter des photos après intervention
                </button>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photosApres.map(p => (
                    <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square">
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={async () => {
                          await deleteDoc(doc(db, "Planning", id, "Photo_apres", p.id));
                          toast.success("Photo supprimée");
                        }} className="p-1.5 bg-error rounded-full text-white"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => photosApresInputRef.current?.click()}
                    className="border-2 border-dashed border-alternate rounded-xl aspect-square flex items-center justify-center hover:border-primary/40 transition-colors">
                    <Plus size={18} className="text-secondary-text" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Relances */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <div className="flex items-center gap-2"><p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Relances</p>{nbRelances > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-tertiary/20 text-tertiary font-bold">{nbRelances}</span>}</div>
            {!showRelance && <button onClick={() => setShowRelance(true)} className="text-xs text-primary font-semibold flex items-center gap-1"><Bell size={12} />Créer</button>}
          </div>
          <div className="p-4">
            {!showRelance ? <p className="text-sm text-secondary-text">{nbRelances > 0 ? `${nbRelances} relance${nbRelances > 1 ? "s" : ""} enregistrée${nbRelances > 1 ? "s" : ""}` : "Aucune relance pour cette intervention."}</p> : (
              <div className="space-y-3 animate-slide-up">
                <textarea className="input-base resize-none" rows={3} value={motifRelance} onChange={e => setMotifRelance(e.target.value)} placeholder="Motif de la relance…" />
                <div className="flex gap-2"><button onClick={handleRelance} disabled={savingRelance || !motifRelance.trim()} className="btn-primary flex items-center gap-2 flex-1">{savingRelance ? <Spinner size="sm" /> : <Bell size={14} />}Créer</button><button onClick={() => setShowRelance(false)} className="btn-outline px-4"><X size={14} /></button></div>
              </div>
            )}
          </div>
        </div>

        {/* Quitus PDF */}
        {(inter.signatureClient && inter.signatureTechnicien) && (
          <div className="card overflow-hidden mb-4">
            <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Quitus</p>
            </div>
            <div className="p-4">
              {inter.quitusPdf ? (
                <div className="space-y-2">
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle2 size={16} />Quitus généré
                  </p>
                  <a href={inter.quitusPdf} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5">
                    <FileText size={16} />Télécharger le quitus PDF
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-secondary-text italic">Quitus non encore généré.</p>
                  <p className="text-xs text-secondary-text bg-primary-bg rounded-lg p-3">
                    La génération automatique du quitus PDF nécessite un service externe. 
                    Vous pouvez exporter les données via l&apos;impression du navigateur (Ctrl+P).
                  </p>
                </div>
              )}
            </div>
          </div>
        )}


        <div className="space-y-2">
          <button onClick={() => router.push(`/interventions/${id}/notes`)} className="w-full card p-3.5 flex items-center gap-3 hover:shadow-card-hover transition-shadow text-left">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><StickyNote size={16} className="text-primary" /></div>
            <div className="flex-1"><p className="text-sm font-semibold text-primary-text">Notes & Historique</p><p className="text-xs text-secondary-text">Suivre les événements de l&apos;intervention</p></div>
            <FileText size={16} className="text-secondary-text" />
          </button>
          <button onClick={() => router.push(`/interventions/${id}/details`)} className="w-full card p-3.5 flex items-center gap-3 hover:shadow-card-hover transition-shadow text-left">
            <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0"><Camera size={16} className="text-secondary-600" /></div>
            <div className="flex-1"><p className="text-sm font-semibold text-primary-text">Photos & Matériel</p><p className="text-xs text-secondary-text">Photos avant/après + matériel</p></div>
            <FileText size={16} className="text-secondary-text" />
          </button>
          {inter.refLogement && (
            <button onClick={() => router.push(`/logements/${inter.refLogement!.id}`)} className="w-full card p-3.5 flex items-center gap-3 hover:shadow-card-hover transition-shadow text-left">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Home size={16} className="text-primary" /></div>
              <div className="flex-1"><p className="text-sm font-semibold text-primary-text">Fiche logement</p><p className="text-xs text-secondary-text">{logementInfo.num} — {logementInfo.occupant}</p></div>
              <FileText size={16} className="text-secondary-text" />
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

