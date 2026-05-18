"use client";

// src/app/logements/ajout/page.tsx
// Bâtiment OBLIGATOIRE + sélecteur acteur si non occupé (comme Flutter)

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, DocumentReference, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { createLogement } from "@/lib/formsService";
import { getBatimentsForOperation } from "@/lib/logementService";
import type { Batiment } from "@/types";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArrowLeft, Home, Check, Star, StarOff, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const TYPES_CONTACT = ["MOA", "MOE", "Syndic", "Cabinet", "Autre"];

interface ActeurOption { id: string; nomActeur: string; }

export default function AjoutLogementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [batiments, setBatiments] = useState<Batiment[]>([]);
  const [batimentId, setBatimentId] = useState("");
  const [numLogement, setNumLogement] = useState("");
  const [nomOccupant, setNomOccupant] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [typeContact, setTypeContact] = useState("");
  const [roleContact, setRoleContact] = useState("");
  const [acteurSelectionne, setActeurSelectionne] = useState("");
  const [acteurs, setActeurs] = useState<ActeurOption[]>([]);
  const [etage, setEtage] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [prioritaire, setPrioritaire] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingBats, setLoadingBats] = useState(true);

  useEffect(() => {
    if (!chantierId) return;
    const opRef = doc(db, "Operation", chantierId) as DocumentReference;
    getBatimentsForOperation(opRef).then(bats => { setBatiments(bats); setLoadingBats(false); });
  }, [chantierId]);

  // Charger acteurs filtrés par type de contact
  useEffect(() => {
    if (!typeContact || typeContact === "Autre" || occupe) { setActeurs([]); return; }
    const q = query(collection(db, "Acteurs_autre"), where("type_acteur", "==", typeContact));
    getDocs(q).then(snap => setActeurs(snap.docs.map(d => ({ id: d.id, nomActeur: d.data().nom_acteur as string }))));
  }, [typeContact, occupe]);

  if (!isAdmin(userApp)) return <AppShell><div className="p-8 text-center">Accès réservé aux administrateurs.</div></AppShell>;
  if (!chantierId) return <AppShell><div className="p-8 text-center">Chantier non spécifié.</div></AppShell>;

  const handleSubmit = async () => {
    if (!numLogement.trim()) { toast.error("Le numéro de logement est obligatoire"); return; }
    if (!batimentId) { toast.error("Veuillez sélectionner un bâtiment"); return; }
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const id = await createLogement({
        numLogement, nomOccupant, telOccupant: tel, mailOccupant: mail,
        roleContact, typeContact, etageLogement: etage,
        logementOccupe: occupe,
        batimentRef: doc(db, "Batiment", batimentId) as DocumentReference,
        operationRef: doc(db, "Operation", chantierId) as DocumentReference,
        createParRef: doc(db, "usersapp", firebaseUser.uid) as DocumentReference,
        prioritaire,
      });
      toast.success("Logement créé !");
      router.replace(`/logements/${id}?chantier=${chantierId}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouveau logement</h1>
            <p className="text-xs text-secondary-text">Les champs * sont obligatoires</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Bâtiment OBLIGATOIRE */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Bâtiment <span className="text-error">*</span></label>
            {loadingBats ? <div className="flex justify-center py-4"><Spinner /></div>
              : batiments.length === 0 ? (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <AlertCircle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-800">Aucun bâtiment disponible</p>
                    <button onClick={() => router.push(`/batiments/ajout?chantier=${chantierId}`)} className="mt-1 text-xs font-bold text-yellow-800 underline">
                      Créer un bâtiment →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {batiments.map(b => (
                    <button key={b.id} onClick={() => setBatimentId(b.id)}
                      className={cn("w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                        batimentId === b.id ? "border-primary bg-primary/5" : "border-alternate hover:border-primary/40")}>
                      <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center", batimentId === b.id ? "border-primary" : "border-alternate")}>
                        {batimentId === b.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-text">{b.nomBatiment || "Sans nom"}</p>
                        {b.adresse && <p className="text-xs text-secondary-text">{b.adresse}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Identification */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Identification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">N° Logement <span className="text-error">*</span></label>
                <input className="input-base mt-1" value={numLogement} onChange={e => setNumLogement(e.target.value)} placeholder="Ex: A-01" />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Niveau / Étage</label>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setEtage(n => Math.max(0, n - 1))} className="w-8 h-9 rounded-lg border border-alternate flex items-center justify-center hover:text-primary transition-all">–</button>
                  <span className="flex-1 text-center font-bold">{etage}</span>
                  <button onClick={() => setEtage(n => n + 1)} className="w-8 h-9 rounded-lg border border-alternate flex items-center justify-center hover:text-primary transition-all">+</button>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text mb-1.5 block">Logement occupé</label>
              <div className="flex gap-2">
                {["Oui", "Non"].map(v => (
                  <button key={v} onClick={() => setOccupe(v === "Oui")}
                    className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",
                      (occupe ? "Oui" : "Non") === v ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text mb-1.5 block">Priorité</label>
              <div className="flex gap-2">
                <button onClick={() => setPrioritaire(true)} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border flex items-center justify-center gap-2 transition-all", prioritaire ? "bg-red-500 text-white border-red-500" : "border-alternate text-secondary-text")}>
                  <Star size={13} /> Prioritaire
                </button>
                <button onClick={() => setPrioritaire(false)} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border flex items-center justify-center gap-2 transition-all", !prioritaire ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>
                  <StarOff size={13} /> Standard
                </button>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Contact / Occupant</p>
            <div>
              <label className="text-xs font-medium text-secondary-text">Type de contact</label>
              <select className="input-base mt-1" value={typeContact} onChange={e => { setTypeContact(e.target.value); setActeurSelectionne(""); }}>
                <option value="">— Sélectionner —</option>
                {TYPES_CONTACT.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Sélecteur acteur (si non occupé et type != Autre) */}
            {!occupe && typeContact && typeContact !== "Autre" && acteurs.length > 0 && (
              <div>
                <label className="text-xs font-medium text-secondary-text">Acteur {typeContact}</label>
                <select className="input-base mt-1" value={acteurSelectionne} onChange={e => {
                  setActeurSelectionne(e.target.value);
                  const a = acteurs.find(a => a.id === e.target.value);
                  if (a) setNomOccupant(a.nomActeur);
                }}>
                  <option value="">— Sélectionner un acteur —</option>
                  {acteurs.map(a => <option key={a.id} value={a.id}>{a.nomActeur}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-secondary-text">Rôle / Précision</label>
              <input className="input-base mt-1" value={roleContact} onChange={e => setRoleContact(e.target.value)} placeholder="Ex: Propriétaire bailleur" />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Nom de l&apos;occupant</label>
              <input className="input-base mt-1" value={nomOccupant} onChange={e => setNomOccupant(e.target.value)} placeholder="Nom Prénom" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Téléphone</label>
                <input className="input-base mt-1" type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="06 00 00 00 00" />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Email</label>
                <input className="input-base mt-1" type="email" value={mail} onChange={e => setMail(e.target.value)} placeholder="email@exemple.com" />
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving || !numLogement.trim() || !batimentId || batiments.length === 0}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Création en cours…" : "Créer le logement"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
