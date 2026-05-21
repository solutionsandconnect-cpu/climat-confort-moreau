"use client";
export const dynamic = "force-dynamic";
// src/app/affectation-planning/page.tsx
// Affecter un RDV à un technicien sur un logement

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, addDoc, doc, serverTimestamp, orderBy, DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { subscribeOperations } from "@/lib/firestore";
import type { Operation } from "@/types";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Calendar, Clock, User, Home, Building2, Check, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

interface Tech { id: string; uid: string; displayName: string; photoUrl?: string; }
interface LogementOpt { id: string; numLogement: string; nomOccupant: string; operationRef?: DocumentReference; }

export default function AffectationPlanningPage() {
  const router = useRouter();
  const { firebaseUser } = useAuthStore();

  const [operations, setOperations] = useState<Operation[]>([]);
  const [techniciens, setTechniciens] = useState<Tech[]>([]);
  const [logements, setLogements] = useState<LogementOpt[]>([]);

  const [selectedChantier, setSelectedChantier] = useState("");
  const [selectedTech, setSelectedTech] = useState("");
  const [selectedLogement, setSelectedLogement] = useState("");
  const [dateRdv, setDateRdv] = useState("");
  const [heureDebut, setHeureDebut] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingLogements, setLoadingLogements] = useState(false);

  useEffect(() => {
    const unsub = subscribeOperations(setOperations);
    getDocs(query(collection(db, "usersapp"), where("actif", "==", true)))
      .then(snap => setTechniciens(snap.docs.map(d => ({
        id: d.id, uid: d.data().uid,
        displayName: (d.data().display_name as string) ?? `${d.data().prenom} ${d.data().nom}`,
        photoUrl: d.data().photo_url,
      }))));
    return () => unsub();
  }, []);

  // Charger logements du chantier sélectionné
  useEffect(() => {
    if (!selectedChantier) { setLogements([]); return; }
    setLoadingLogements(true);
    const opRef = doc(db, "Operation", selectedChantier);
    getDocs(query(collection(db, "Logements"), where("operation_ref", "==", opRef), orderBy("num_logement")))
      .then(snap => {
        setLogements(snap.docs.map(d => ({ id: d.id, numLogement: d.data().num_logement as string, nomOccupant: d.data().nom_occupant as string })));
        setLoadingLogements(false);
      });
  }, [selectedChantier]);

  const handleSave = async () => {
    if (!selectedTech || !dateRdv || !heureDebut) {
      toast.error("Technicien, logement, date et heure de début sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      const parseTime = (dateStr: string, timeStr: string) => {
        const [h, m] = timeStr.split(":").map(Number);
        const d = new Date(dateStr);
        d.setHours(h, m, 0);
        return d;
      };

      const techRef = doc(db, "usersapp", selectedTech);
      const logRef = selectedLogement ? doc(db, "Logements", selectedLogement) : null;
      const opRef = selectedChantier ? doc(db, "Operation", selectedChantier) : null;

      await addDoc(collection(db, "Planning"), {
        ref_users: techRef,
        ref_logement: logRef,
        ref_operation: opRef,
        date_rdv: new Date(dateRdv),
        heure_rdv: parseTime(dateRdv, heureDebut),
        heure_fin_rdv: heureFin ? parseTime(dateRdv, heureFin) : null,
        date_create: serverTimestamp(),
        create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
        descriptif_travaux: "Non défini",
        affectation_planning: "Oui",
        statut_rdv: "En attente",
        etat_actuel: "A planifier",
      });

      toast.success("Planning affecté !");
      setSelectedTech(""); setSelectedLogement(""); setSelectedChantier("");
      setDateRdv(""); setHeureDebut(""); setHeureFin("");
    } catch (e) { console.error(e); toast.error("Erreur lors de l'affectation"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Affecter un planning</h1>
            <p className="text-xs text-secondary-text">Assigner un RDV à un technicien</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Technicien */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <User size={13} />Technicien <span className="text-error">*</span>
            </label>
            <select className="input-base" value={selectedTech} onChange={e => setSelectedTech(e.target.value)}>
              <option value="">— Sélectionnez le technicien —</option>
              {techniciens.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </div>

          {/* Chantier + Logement */}
          <div className="card p-4 space-y-3">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide flex items-center gap-1.5">
              <Building2 size={13} />Chantier & Logement
            </label>
            <div>
              <label className="text-xs font-medium text-secondary-text">Chantier</label>
              <select className="input-base mt-1" value={selectedChantier} onChange={e => { setSelectedChantier(e.target.value); setSelectedLogement(""); }}>
                <option value="">— Sélectionnez le chantier —</option>
                {operations.map(op => <option key={op.id} value={op.id}>{op.nomChantier} ({op.numChantier})</option>)}
              </select>
            </div>
            {selectedChantier && (
              <div>
                <label className="text-xs font-medium text-secondary-text">Logement</label>
                {loadingLogements ? (
                  <div className="flex items-center gap-2 mt-1 text-sm text-secondary-text"><Spinner size="sm" />Chargement…</div>
                ) : (
                  <select className="input-base mt-1" value={selectedLogement} onChange={e => setSelectedLogement(e.target.value)}>
                    <option value="">— Sélectionnez le logement —</option>
                    {logements.map(l => <option key={l.id} value={l.id}>{l.numLogement} — {l.nomOccupant}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Date et heures */}
          <div className="card p-4 space-y-3">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide flex items-center gap-1.5">
              <Calendar size={13} />Date & Heures <span className="text-error">*</span>
            </label>
            <div>
              <label className="text-xs font-medium text-secondary-text">Date du RDV</label>
              <input className="input-base mt-1" type="date" value={dateRdv} onChange={e => setDateRdv(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Heure début <span className="text-error">*</span></label>
                <input className="input-base mt-1" type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Heure fin</label>
                <input className="input-base mt-1" type="time" value={heureFin} onChange={e => setHeureFin(e.target.value)} />
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !selectedTech || !dateRdv || !heureDebut}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Affectation en cours…" : "Enregistrer le planning"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
