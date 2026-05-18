"use client";

// src/app/interventions/ajout/page.tsx
// Équivalent de ajout_demande_widget.dart
// Champs : type demande, descriptif, temps alloué, facturable, infos facturation,
//          référence logement + chantier passés en query params

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, DocumentReference, addDoc, collection, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, Check, Clock, FileText, Euro, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const TYPES_DEMANDE = ["Réserve", "GPA", "DO", "Demande direct"];

interface PlanningQuitus {
  id: string;
  quitusNumero?: string;
  numQuitus?: number;
  dateRdv?: Date;
}

export default function AjoutInterventionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser } = useAuthStore();

  const logementId = searchParams.get("logement");
  const chantierId = searchParams.get("chantier");

  const [logementInfo, setLogementInfo] = useState<{ num: string; occupant: string } | null>(null);
  const [chantierInfo, setChantierInfo] = useState<{ nom: string; num: string } | null>(null);
  const [planningsExistants, setPlanningsExistants] = useState<PlanningQuitus[]>([]);

  // Champs du formulaire
  const [typeDemande, setTypeDemande] = useState("");
  const [descriptif, setDescriptif] = useState("");
  const [tempsAlloue, setTempsAlloue] = useState("");
  const [facturable, setFacturable] = useState("");
  const [nomFacturation, setNomFacturation] = useState("");
  const [mailFacturation, setMailFacturation] = useState("");
  const [infosFacturation, setInfosFacturation] = useState("");
  const [quitusRef, setQuitusRef] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      // Charger infos logement
      if (logementId) {
        const snap = await getDoc(doc(db, "Logements", logementId));
        if (snap.exists()) {
          setLogementInfo({
            num: snap.data().num_logement as string ?? "—",
            occupant: snap.data().nom_occupant as string ?? "—",
          });
        }
      }
      // Charger infos chantier
      if (chantierId) {
        const snap = await getDoc(doc(db, "Operation", chantierId));
        if (snap.exists()) {
          setChantierInfo({
            nom: snap.data().nom_chantier as string ?? "—",
            num: snap.data().num_chantier as string ?? "—",
          });
        }
      }
      // Charger plannings existants (pour référence quitus)
      if (logementId) {
        const logRef = doc(db, "Logements", logementId);
        const q = query(collection(db, "Planning"), orderBy("num_quitus", "desc"));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({
          id: d.id,
          quitusNumero: d.data().quitus_numero as string,
          numQuitus: d.data().num_quitus as number,
        }));
        setPlanningsExistants(items.slice(0, 20));
      }
      setLoading(false);
    }
    loadData();
  }, [logementId, chantierId]);

  const handleSubmit = async () => {
    if (!typeDemande) { toast.error("Veuillez sélectionner un type de demande"); return; }
    if (!descriptif.trim()) { toast.error("Le descriptif des travaux est obligatoire"); return; }
    if (!facturable) { toast.error("Veuillez indiquer si les travaux sont facturables"); return; }
    if (facturable === "Travaux facturables" && !nomFacturation.trim()) {
      toast.error("Le nom de facturation est obligatoire pour des travaux facturables"); return;
    }
    if (!firebaseUser) return;

    setSaving(true);
    try {
      // Compter le nombre de plannings pour le numéro de quitus
      const countSnap = await getDocs(collection(db, "Planning"));
      const numQuitus = countSnap.size + 1;

      const data: Record<string, unknown> = {
        type_demande: typeDemande,
        descriptif_travaux: descriptif,
        temps_alloue_demande: tempsAlloue ? parseFloat(tempsAlloue) : null,
        demande_facturable: facturable,
        etat_actuel: "A planifier",
        statut_rdv: "En attente",
        num_quitus: numQuitus,
        quitus_numero: `Quitus n°${numQuitus}`,
        etat_facturation: facturable === "Travaux facturables" ? "Non facturé" : "Facturé",
        date_create: serverTimestamp(),
        create_par: doc(db, "usersapp", firebaseUser.uid),
      };

      if (logementId) data.ref_logement = doc(db, "Logements", logementId);
      if (chantierId) data.ref_operation = doc(db, "Operation", chantierId);
      if (facturable === "Travaux facturables") {
        data.nom_facturation = nomFacturation;
        data.mail_facturation = mailFacturation;
        data.infos_facturation = infosFacturation;
      }
      if (quitusRef) {
        data.ref_planning_quitus_inter_non_fini = doc(db, "Planning", quitusRef);
      }

      const ref = await addDoc(collection(db, "Planning"), data);
      toast.success("Intervention créée !");
      router.replace(`/interventions/${ref.id}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSaving(false); }
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouvelle intervention</h1>
            <p className="text-xs text-secondary-text">Créer une demande d&apos;intervention</p>
          </div>
        </div>

        {/* Logement + Chantier */}
        {(logementInfo || chantierInfo) && (
          <div className="card p-4 mb-4 space-y-2">
            {logementInfo && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-secondary-text text-xs w-20 shrink-0">Logement</span>
                <span className="font-semibold text-primary-text">{logementInfo.num}</span>
                <span className="text-secondary-text">—</span>
                <span className="text-secondary-text truncate">{logementInfo.occupant}</span>
              </div>
            )}
            {chantierInfo && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-secondary-text text-xs w-20 shrink-0">Chantier</span>
                <span className="font-semibold text-primary-text">{chantierInfo.nom}</span>
                <span className="text-xs font-mono text-secondary-text">({chantierInfo.num})</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Type de demande */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">
              Type de demande <span className="text-error">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TYPES_DEMANDE.map(t => (
                <button key={t} onClick={() => setTypeDemande(t)}
                  className={cn("px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                    typeDemande === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Descriptif */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">
              Descriptif des travaux <span className="text-error">*</span>
            </label>
            <textarea
              className="input-base resize-none"
              rows={4}
              value={descriptif}
              onChange={e => setDescriptif(e.target.value)}
              placeholder="Décrivez les travaux à réaliser…"
            />
          </div>

          {/* Temps alloué */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">
              <Clock size={13} className="inline mr-1.5" />Temps alloué (heures)
            </label>
            <input
              className="input-base"
              type="number"
              step="0.5"
              min="0"
              value={tempsAlloue}
              onChange={e => setTempsAlloue(e.target.value)}
              placeholder="Ex: 2.5"
            />
          </div>

          {/* Facturable */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">
              <Euro size={13} className="inline mr-1.5" />Facturation <span className="text-error">*</span>
            </label>
            <div className="flex gap-2">
              {["Travaux facturables", "Travaux non facturables"].map(v => (
                <button key={v} onClick={() => setFacturable(v)}
                  className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all",
                    facturable === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                  {v === "Travaux facturables" ? "Facturable" : "Non facturable"}
                </button>
              ))}
            </div>
          </div>

          {/* Infos facturation (si facturable) */}
          {facturable === "Travaux facturables" && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations de facturation</p>
              <div>
                <label className="text-xs font-medium text-secondary-text">Nom facturation <span className="text-error">*</span></label>
                <input className="input-base mt-1" value={nomFacturation} onChange={e => setNomFacturation(e.target.value)} placeholder="Nom du destinataire" />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Email facturation</label>
                <input className="input-base mt-1" type="email" value={mailFacturation} onChange={e => setMailFacturation(e.target.value)} placeholder="email@exemple.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Informations complémentaires</label>
                <textarea className="input-base mt-1 resize-none" rows={2} value={infosFacturation} onChange={e => setInfosFacturation(e.target.value)} placeholder="Adresse, notes…" />
              </div>
            </div>
          )}

          {/* Référence quitus précédent (optionnel) */}
          {planningsExistants.length > 0 && (
            <div className="card p-4">
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">
                Référence quitus précédent (optionnel)
              </label>
              <select className="input-base" value={quitusRef} onChange={e => setQuitusRef(e.target.value)}>
                <option value="">Aucune référence</option>
                {planningsExistants.map(p => (
                  <option key={p.id} value={p.id}>{p.quitusNumero || `Quitus n°${p.numQuitus}`}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving || !typeDemande || !descriptif.trim() || !facturable}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Création en cours…" : "Créer l'intervention"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
