"use client";
export const dynamic = "force-dynamic";
// src/app/acteurs/ajout/page.tsx — Ajout d'un acteur depuis un chantier

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { collection, addDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { AdresseSearch } from "@/components/ui/AdresseSearch";
import { ArrowLeft, Check, Users } from "lucide-react";
import toast from "react-hot-toast";

const TYPES = ["MOA", "MOE", "Syndic", "Cabinet", "Autre"];

function AjoutActeurPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [type, setType] = useState("");
  const [nom, setNom] = useState("");
  const [qualite, setQualite] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isAdmin(userApp) && !canViewDashboard(userApp)) return <AppShell><div className="p-8 text-center">Accès réservé.</div></AppShell>;

  const handleSubmit = async () => {
    if (!nom.trim()) { toast.error("Le nom est obligatoire"); return; }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        type_acteur: type, nom_acteur: nom, qualite_acteur: qualite,
        tel_acteur: tel, mail_acteur: mail, adresse_acteur: adresse,
        observations: obs, date_create: serverTimestamp(),
        create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
      };
      if (chantierId) data.operation_ref = doc(db, "Operation", chantierId);
      await addDoc(collection(db, "Acteurs_autre"), data);
      toast.success("Acteur ajouté !");
      router.replace(chantierId ? `/chantiers/${chantierId}` : "/acteurs");
    } catch (e) { console.error(e); toast.error("Erreur lors de l'ajout"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouvel acteur</h1>
            <p className="text-xs text-secondary-text">{chantierId ? "Ajout au chantier sélectionné" : "Ajout général"}</p>
          </div>
        </div>

        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            <Users size={28} className="text-primary" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Type d&apos;acteur</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${type === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Nom / Société <span className="text-error">*</span></label><input className="input-base mt-1" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom ou raison sociale" /></div>
              <div><label className="text-xs font-medium text-secondary-text">Qualité / Fonction</label><input className="input-base mt-1" value={qualite} onChange={e => setQualite(e.target.value)} placeholder="Ex: Propriétaire" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Téléphone</label><input className="input-base mt-1" type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="06 00 00 00 00" /></div>
              <div><label className="text-xs font-medium text-secondary-text">Email</label><input className="input-base mt-1" type="email" value={mail} onChange={e => setMail(e.target.value)} placeholder="email@exemple.com" /></div>
            </div>
            <AdresseSearch value={adresse} onChange={setAdresse} onSelect={setAdresse} label="Adresse" placeholder="Ex: 12 rue de la Paix, Vannes" />
            <div><label className="text-xs font-medium text-secondary-text">Observations</label><textarea className="input-base mt-1 resize-none" rows={2} value={obs} onChange={e => setObs(e.target.value)} /></div>
          </div>
          <button onClick={handleSubmit} disabled={saving || !nom.trim()} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Ajout en cours…" : "Ajouter l'acteur"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

import { Suspense } from "react";
export default function AjoutActeurPage() {
  return <Suspense fallback={<div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><AjoutActeurPageContent /></Suspense>;
}
