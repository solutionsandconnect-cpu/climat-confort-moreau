"use client";

// src/app/chantiers/ajout/page.tsx
// Équivalent de ajout_chantier_widget.dart

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { createChantier, checkNumChantierExists } from "@/lib/chantierService";
import { getConducteursTravaux } from "@/lib/chantierService";
import type { UserApp } from "@/types";
import { Spinner } from "@/components/ui";
import { ArrowLeft, Building2, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function AjoutChantierPage() {
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [nomChantier, setNomChantier] = useState("");
  const [numChantier, setNumChantier] = useState("");
  const [conducteurId, setConducteurId] = useState("");
  const [conducteurs, setConducteurs] = useState<UserApp[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConducteursTravaux().then(setConducteurs);
  }, []);

  if (!isAdmin(userApp)) {
    return <AppShell><div className="p-8 text-center text-secondary-text">Accès réservé aux administrateurs.</div></AppShell>;
  }

  const handleSubmit = async () => {
    if (!nomChantier.trim()) { toast.error("Le nom du chantier est obligatoire"); return; }
    if (!numChantier.trim()) { toast.error("Le numéro de chantier est obligatoire"); return; }
    if (!firebaseUser) return;

    setSaving(true);
    try {
      // Vérif doublon numéro
      const exists = await checkNumChantierExists(numChantier, "");
      if (exists) { toast.error("Ce numéro de chantier existe déjà !"); setSaving(false); return; }

      const createParRef = doc(db, "usersapp", firebaseUser.uid);
      const conducteurRef = conducteurId ? doc(db, "usersapp", conducteurId) : undefined;

      const id = await createChantier({
        nomChantier, numChantier,
        conducteurRef: conducteurRef as any,
        createParRef: createParRef as any,
      });

      toast.success("Chantier créé avec succès !");
      router.replace(`/chantiers/${id}`);
    } catch { toast.error("Erreur lors de la création"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouveau chantier</h1>
            <p className="text-xs text-secondary-text">Remplissez les informations du chantier</p>
          </div>
        </div>

        {/* Icône */}
        <div className="flex justify-center mb-5">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            <Building2 size={36} className="text-primary" />
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide">Nom du chantier <span className="text-error">*</span></label>
            <input
              className="input-base mt-1.5"
              value={nomChantier}
              onChange={e => setNomChantier(e.target.value)}
              placeholder="Ex: Résidence Les Pins"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide">N° Chantier <span className="text-error">*</span></label>
            <input
              className="input-base mt-1.5 font-mono"
              value={numChantier}
              onChange={e => setNumChantier(e.target.value)}
              placeholder="Ex: 2024-001"
            />
            <p className="text-xs text-secondary-text mt-1">Doit être unique — vérifié automatiquement</p>
          </div>

          <div>
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide">Conducteur de travaux</label>
            <select className="input-base mt-1.5" value={conducteurId} onChange={e => setConducteurId(e.target.value)}>
              <option value="">— Sélectionner un conducteur —</option>
              {conducteurs.map(c => (
                <option key={c.id} value={c.id}>{c.displayName || `${c.prenom} ${c.nom}`}</option>
              ))}
            </select>
          </div>

          <div className="pt-1 text-xs text-secondary-text bg-primary-bg rounded-lg px-3 py-2">
            L&apos;état du chantier sera automatiquement défini à <strong>«&nbsp;En attente&nbsp;»</strong> à la création.
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !nomChantier.trim() || !numChantier.trim()}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-4"
        >
          {saving ? <Spinner size="sm" /> : <Check size={16} />}
          {saving ? "Création en cours…" : "Créer le chantier"}
        </button>
      </div>
    </AppShell>
  );
}
