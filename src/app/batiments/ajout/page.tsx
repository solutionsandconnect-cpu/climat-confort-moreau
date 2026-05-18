"use client";

// src/app/batiments/ajout/page.tsx — avec code interphone + infos accès + date réception

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { doc, DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { createBatimentFull } from "@/lib/formsService";
import { Spinner } from "@/components/ui";
import { ArrowLeft, Building2, Check, MapPin, Key, Info, Calendar } from "lucide-react";
import toast from "react-hot-toast";

export default function AjoutBatimentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [nom, setNom] = useState("");
  const [rue, setRue] = useState("");
  const [cp, setCp] = useState("");
  const [ville, setVille] = useState("");
  const [codeInterphone, setCodeInterphone] = useState("");
  const [infosAcces, setInfosAcces] = useState("");
  const [dateReception, setDateReception] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isAdmin(userApp)) return <AppShell><div className="p-8 text-center text-secondary-text">Accès réservé aux administrateurs.</div></AppShell>;
  if (!chantierId) return <AppShell><div className="p-8 text-center text-secondary-text">Chantier non spécifié.</div></AppShell>;

  const handleSubmit = async () => {
    if (!nom.trim()) { toast.error("Le nom du bâtiment est obligatoire"); return; }
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await createBatimentFull({
        nomBatiment: nom, rue, codePostal: cp, ville,
        codeInterphone, informationsAcces: infosAcces,
        dateReception: dateReception ? new Date(dateReception) : undefined,
        operationRef: doc(db, "Operation", chantierId) as DocumentReference,
        createParRef: doc(db, "usersapp", firebaseUser.uid) as DocumentReference,
      });
      toast.success("Bâtiment créé !");
      router.replace(`/chantiers/${chantierId}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouveau bâtiment</h1>
            <p className="text-xs text-secondary-text">Ajout au chantier sélectionné</p>
          </div>
        </div>

        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            <Building2 size={28} className="text-primary" />
          </div>
        </div>

        <div className="space-y-4">
          {/* Nom */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Nom du bâtiment <span className="text-error">*</span></label>
            <input className="input-base" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Bâtiment A" />
          </div>

          {/* Adresse */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={14} className="text-secondary-text" />
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Adresse</p>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Rue / Voie</label>
              <input className="input-base mt-1" value={rue} onChange={e => setRue(e.target.value)} placeholder="Ex: 12 rue de la Paix" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Code postal</label>
                <input className="input-base mt-1" value={cp} onChange={e => setCp(e.target.value)} placeholder="Ex: 56000" maxLength={5} />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Ville</label>
                <input className="input-base mt-1" value={ville} onChange={e => setVille(e.target.value)} placeholder="Ex: Vannes" />
              </div>
            </div>
          </div>

          {/* Accès */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Key size={14} className="text-secondary-text" />
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Accès</p>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Code interphone</label>
              <input className="input-base mt-1" value={codeInterphone} onChange={e => setCodeInterphone(e.target.value)} placeholder="Ex: 1234A" />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Informations d&apos;accès</label>
              <textarea className="input-base mt-1 resize-none" rows={3} value={infosAcces} onChange={e => setInfosAcces(e.target.value)} placeholder="Ex: Digicode portail : 0000, clé boîte aux lettres..." />
            </div>
          </div>

          {/* Date réception */}
          <div className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar size={14} className="text-secondary-text" />
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide">Date de réception</label>
            </div>
            <input className="input-base" type="date" value={dateReception} onChange={e => setDateReception(e.target.value)} />
          </div>

          <button onClick={handleSubmit} disabled={saving || !nom.trim()} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Création en cours…" : "Créer le bâtiment"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
