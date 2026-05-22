"use client";
// src/app/interventions/[id]/modifier/page.tsx
// Équivalent de modif_demande_widget.dart + selecteur_tech_rdv
// CRUD complet : descriptif, type, facturation, technicien, suppression

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc, getDoc, updateDoc, deleteDoc, getDocs, collection, query,
  where, addDoc, serverTimestamp, DocumentReference, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { subscribeIntervention, type InterventionDetail } from "@/lib/formsService";
import { LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, Check, Trash2, User, AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

const TYPES_DEMANDE = ["Réserve", "GPA", "DO", "Demande direct"];
const TYPES_TECH = ["Climat & Confort Moreau", "Sous-traitant"];

interface UserOption { id: string; uid: string; displayName: string; }

export default function ModifierInterventionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [inter, setInter] = useState<InterventionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Champs
  const [descriptif, setDescriptif] = useState("");
  const [typeDemande, setTypeDemande] = useState("");
  const [tempsAlloue, setTempsAlloue] = useState("");
  const [facturable, setFacturable] = useState("");
  const [nomFact, setNomFact] = useState("");
  const [mailFact, setMailFact] = useState("");
  const [infosFact, setInfosFact] = useState("");

  const [dateDemande, setDateDemande] = useState("");

  // Technicien
  const [typeTech, setTypeTech] = useState("Climat & Confort Moreau");
  const [techniciens, setTechniciens] = useState<UserOption[]>([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [sousTraitant, setSousTraitant] = useState("");

  const planRef = doc(db, "Planning", id) as DocumentReference;

  useEffect(() => {
    const unsub = subscribeIntervention(id, item => {
      if (!item) { router.back(); return; }
      setInter(item);
      setDescriptif(item.descriptifTravaux ?? "");
      setTypeDemande(item.typeDemande ?? "");
      setTempsAlloue(item.tempsAlloue?.toString() ?? "");
      setFacturable(item.demandeFacturable ?? "");
      setNomFact(item.nomFacturation ?? "");
      setMailFact(item.mailFacturation ?? "");
      setInfosFact(item.infosFacturation ?? "");
      setDateDemande(item.dateDemande ? format(item.dateDemande, "yyyy-MM-dd") : "");
      if (item.sousTraitant) { setTypeTech("Sous-traitant"); setSousTraitant(item.sousTraitant); }
      else if (item.refUsers) setSelectedTechId(item.refUsers.id);
      setLoading(false);
    });
    // Charger les techniciens
    getDocs(query(collection(db, "usersapp"), where("actif", "==", true)))
      .then(snap => setTechniciens(snap.docs.map(d => ({ id: d.id, uid: d.data().uid, displayName: d.data().display_name as string ?? `${d.data().prenom} ${d.data().nom}` }))));
    return () => unsub();
  }, [id, router]);

  const handleSave = async () => {
    if (!descriptif.trim()) { toast.error("Le descriptif est obligatoire"); return; }
    if (!typeDemande) { toast.error("Le type de demande est obligatoire"); return; }
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        descriptif_travaux: descriptif,
        type_demande: typeDemande,
        temps_alloue_demande: tempsAlloue ? parseFloat(tempsAlloue) : null,
        demande_facturable: facturable,
        nom_facturation: nomFact,
        mail_facturation: mailFact,
        infos_facturation: infosFact,
        date_demande: dateDemande ? Timestamp.fromDate(new Date(dateDemande)) : null,
      };

      // Technicien
      if (typeTech === "Climat & Confort Moreau" && selectedTechId) {
        updates.ref_users = doc(db, "usersapp", selectedTechId);
        updates.sous_traitant_si_pas_tech = null;
        const tech = techniciens.find(t => t.id === selectedTechId);
        if (tech) {
          // Ajouter note historique
          await addDoc(collection(db, "Notes_travaux"), {
            ref_planning: planRef, notes: `Technicien assigné : ${tech.displayName}`,
            note_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
            date_create: serverTimestamp(), type_note: "Technicien assigné", auto: "Oui",
          });
        }
      } else if (typeTech === "Sous-traitant" && sousTraitant.trim()) {
        updates.sous_traitant_si_pas_tech = sousTraitant;
        updates.ref_users = null;
      }

      // Facturation logement
      if (inter?.refLogement) {
        await updateDoc(inter.refLogement, {
          etat_facturation: facturable === "Travaux facturables" ? "Non facturé" : "Non facturable",
        });
      }

      await updateDoc(planRef, updates);
      toast.success("Intervention mise à jour !");
      router.back();
    } catch (e) { console.error(e); toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Supprimer les notes liées
      const notesSnap = await getDocs(query(collection(db, "Notes_travaux"), where("ref_planning", "==", planRef)));
      await Promise.all(notesSnap.docs.map(d => deleteDoc(d.ref)));
      // Supprimer les relances liées
      const relSnap = await getDocs(query(collection(db, "relances"), where("refPlanning", "==", planRef)));
      await Promise.all(relSnap.docs.map(d => deleteDoc(d.ref)));
      // Supprimer l'intervention
      await deleteDoc(planRef);
      toast.success("Intervention supprimée !");
      router.replace("/dashboard");
    } catch { toast.error("Erreur lors de la suppression"); }
    finally { setDeleting(false); }
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div className="flex-1"><h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Modifier l&apos;intervention</h1></div>
        </div>

        <div className="space-y-4">
          {/* Type demande */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Type de demande *</label>
            <div className="flex flex-wrap gap-2">
              {TYPES_DEMANDE.map(t => (
                <button key={t} onClick={() => setTypeDemande(t)} className={cn("px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all", typeDemande === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>{t}</button>
              ))}
            </div>
          </div>

          {/* Descriptif */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Descriptif des travaux *</label>
            <textarea className="input-base resize-none" rows={4} value={descriptif} onChange={e => setDescriptif(e.target.value)} placeholder="Décrivez les travaux…" />
          </div>

          {/* Temps alloué */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Temps alloué (heures)</label>
            <input className="input-base" type="number" step="0.5" min="0" value={tempsAlloue} onChange={e => setTempsAlloue(e.target.value)} placeholder="Ex: 2.5" />
          </div>

          {/* Date de demande */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2"><Calendar size={13} className="inline mr-1.5" />Date de demande</label>
            <input className="input-base" type="date" value={dateDemande} onChange={e => setDateDemande(e.target.value)} />
          </div>

          {/* Facturation */}
          <div className="card p-4 space-y-3">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block">Facturation</label>
            <div className="flex gap-2">
              {["Travaux facturables", "Travaux non facturables"].map(v => (
                <button key={v} onClick={() => setFacturable(v)} className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all", facturable === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                  {v === "Travaux facturables" ? "Facturable" : "Non facturable"}
                </button>
              ))}
            </div>
            {facturable === "Travaux facturables" && (
              <>
                <div><label className="text-xs font-medium text-secondary-text">Nom facturation *</label><input className="input-base mt-1" value={nomFact} onChange={e => setNomFact(e.target.value)} placeholder="Destinataire" /></div>
                <div><label className="text-xs font-medium text-secondary-text">Email facturation</label><input className="input-base mt-1" type="email" value={mailFact} onChange={e => setMailFact(e.target.value)} /></div>
                <div><label className="text-xs font-medium text-secondary-text">Informations complémentaires</label><textarea className="input-base mt-1 resize-none" rows={2} value={infosFact} onChange={e => setInfosFact(e.target.value)} /></div>
              </>
            )}
          </div>

          {/* Technicien */}
          <div className="card p-4 space-y-3">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block">Technicien / Intervenant</label>
            <div className="flex gap-2">
              {TYPES_TECH.map(t => (
                <button key={t} onClick={() => setTypeTech(t)} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all", typeTech === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{t}</button>
              ))}
            </div>
            {typeTech === "Climat & Confort Moreau" ? (
              <select className="input-base" value={selectedTechId} onChange={e => setSelectedTechId(e.target.value)}>
                <option value="">— Sélectionner un technicien —</option>
                {techniciens.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
              </select>
            ) : (
              <div>
                <label className="text-xs font-medium text-secondary-text">Nom du sous-traitant</label>
                <input className="input-base mt-1" value={sousTraitant} onChange={e => setSousTraitant(e.target.value)} placeholder="Nom de l'entreprise ou du technicien" />
              </div>
            )}
          </div>

          {/* Bouton sauvegarder */}
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Sauvegarde…" : "Enregistrer les modifications"}
          </button>

          {/* Suppression */}
          {isAdmin(userApp) && (
            <div className="card p-4">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide mb-2">Zone de danger</p>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="btn-danger w-full flex items-center justify-center gap-2">
                  <Trash2 size={15} />Supprimer cette intervention
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertTriangle size={16} className="text-error shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">Cette action est irréversible. Toutes les notes, relances et données liées seront supprimées.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="btn-outline flex-1">Annuler</button>
                    <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1 flex items-center justify-center gap-2">
                      {deleting ? <Spinner size="sm" /> : <Trash2 size={14} />}Confirmer la suppression
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
