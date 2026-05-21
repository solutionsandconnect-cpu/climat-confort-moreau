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
import { cn } from "@/lib/utils";
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
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Conducteur de travaux</label>
            <div className="space-y-2">
              {conducteurs.length === 0 && <p className="text-sm text-secondary-text italic">Aucun conducteur disponible.</p>}
              {conducteurs.map(c => {
                const nom = c.displayName || `${c.prenom} ${c.nom}`;
                const selected = conducteurId === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setConducteurId(selected ? "" : c.id)}
                    className={cn("w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left",
                      selected ? "border-primary bg-primary/5" : "border-alternate hover:border-primary/40")}>
                    <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center", selected ? "border-primary" : "border-alternate")}>
                      {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    {c.photoUrl ? (
                      <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{nom.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-sm font-semibold text-primary-text">{nom}</span>
                  </button>
                );
              })}
            </div>
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
