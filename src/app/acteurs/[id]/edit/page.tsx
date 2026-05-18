"use client";
// src/app/acteurs/[id]/edit/page.tsx — Modification d'un acteur

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { ArrowLeft, Check, Users } from "lucide-react";
import toast from "react-hot-toast";

const TYPES = ["MOA", "MOE", "Syndic", "Cabinet", "Autre"];

export default function EditActeurPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [type, setType] = useState("");
  const [nom, setNom] = useState("");
  const [qualite, setQualite] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "Acteurs_autre", id)).then(snap => {
      if (!snap.exists()) { router.back(); return; }
      const d = snap.data();
      setType(d.type_acteur ?? ""); setNom(d.nom_acteur ?? "");
      setQualite(d.qualite_acteur ?? ""); setTel(d.tel_acteur ?? "");
      setMail(d.mail_acteur ?? ""); setAdresse(d.adresse_acteur ?? "");
      setObs(d.observations ?? ""); setLoading(false);
    });
  }, [id, router]);

  if (!isAdmin(userApp)) return <AppShell><div className="p-8 text-center">Accès réservé.</div></AppShell>;

  const handleSubmit = async () => {
    if (!nom.trim()) { toast.error("Le nom est obligatoire"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "Acteurs_autre", id), {
        type_acteur: type, nom_acteur: nom, qualite_acteur: qualite,
        tel_acteur: tel, mail_acteur: mail, adresse_acteur: adresse, observations: obs,
      });
      toast.success("Acteur mis à jour !");
      router.replace(chantierId ? `/chantiers/${chantierId}` : "/acteurs");
    } catch (e) { console.error(e); toast.error("Erreur"); }
    finally { setSaving(false); }
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Modifier l&apos;acteur</h1>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(t => <button key={t} onClick={() => setType(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${type === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50"}`}>{t}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Nom / Société *</label><input className="input-base mt-1" value={nom} onChange={e => setNom(e.target.value)} /></div>
              <div><label className="text-xs font-medium text-secondary-text">Qualité</label><input className="input-base mt-1" value={qualite} onChange={e => setQualite(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Téléphone</label><input className="input-base mt-1" type="tel" value={tel} onChange={e => setTel(e.target.value)} /></div>
              <div><label className="text-xs font-medium text-secondary-text">Email</label><input className="input-base mt-1" type="email" value={mail} onChange={e => setMail(e.target.value)} /></div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Adresse</label><input className="input-base mt-1" value={adresse} onChange={e => setAdresse(e.target.value)} /></div>
            <div><label className="text-xs font-medium text-secondary-text">Observations</label><textarea className="input-base mt-1 resize-none" rows={2} value={obs} onChange={e => setObs(e.target.value)} /></div>
          </div>
          <button onClick={handleSubmit} disabled={saving || !nom.trim()} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}Sauvegarder
          </button>
        </div>
      </div>
    </AppShell>
  );
}
