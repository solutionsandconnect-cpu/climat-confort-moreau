"use client";
export const dynamic = "force-dynamic";

// src/app/logements/ajout/page.tsx
// Bâtiment OBLIGATOIRE + sélecteur acteur si non occupé (comme Flutter)

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, DocumentReference, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import { createLogement } from "@/lib/formsService";
import { getBatimentsForOperation } from "@/lib/logementService";
import type { Batiment } from "@/types";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArrowLeft, Home, Check, Star, StarOff, AlertCircle, Plus, X, MapPin } from "lucide-react";
import { AdresseSearch } from "@/components/ui/AdresseSearch";
import toast from "react-hot-toast";

const TYPES_CONTACT = ["MOA", "MOE", "Syndic", "Cabinet", "Autre"];

interface ActeurOption { id: string; nomActeur: string; telActeur?: string; mailActeur?: string; qualiteActeur?: string; }

function AjoutLogementPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");
  const batimentIdParam = searchParams.get("batimentId");

  const [batiments, setBatiments] = useState<Batiment[]>([]);
  const [batimentId, setBatimentId] = useState(batimentIdParam ?? "");
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

  // Création acteur inline
  const [showCreateActeur, setShowCreateActeur] = useState(false);
  const [newActeurNom, setNewActeurNom] = useState("");
  const [newActeurQualite, setNewActeurQualite] = useState("");
  const [newActeurTel, setNewActeurTel] = useState("");
  const [newActeurMail, setNewActeurMail] = useState("");
  const [newActeurAdresse, setNewActeurAdresse] = useState("");
  const [newActeurObs, setNewActeurObs] = useState("");
  const [savingActeur, setSavingActeur] = useState(false);

  useEffect(() => {
    if (!chantierId) return;
    const opRef = doc(db, "Operation", chantierId) as DocumentReference;
    getBatimentsForOperation(opRef).then(bats => {
      setBatiments(bats);
      setLoadingBats(false);
      // Auto-sélection si on revient de la création d'un bâtiment
      if (batimentIdParam && bats.some(b => b.id === batimentIdParam)) {
        setBatimentId(batimentIdParam);
      }
    });
  }, [chantierId]);

  // Charger acteurs filtrés par type de contact
  useEffect(() => {
    if (!typeContact || occupe) { setActeurs([]); return; }
    const q = query(collection(db, "Acteurs_autre"), where("type_acteur", "==", typeContact));
    getDocs(q).then(snap => setActeurs(snap.docs.map(d => ({ id: d.id, nomActeur: d.data().nom_acteur as string, telActeur: d.data().tel_acteur as string, mailActeur: d.data().mail_acteur as string, qualiteActeur: d.data().qualite_acteur as string }))));
  }, [typeContact, occupe]);

  const handleCreateActeur = async () => {
    if (!newActeurNom.trim()) { toast.error("Le nom est obligatoire"); return; }
    setSavingActeur(true);
    try {
      const docRef = await addDoc(collection(db, "Acteurs_autre"), {
        nom_acteur: newActeurNom, type_acteur: typeContact,
        qualite_acteur: newActeurQualite, tel_acteur: newActeurTel,
        mail_acteur: newActeurMail, adresse_acteur: newActeurAdresse,
        observations: newActeurObs, date_create: serverTimestamp(),
        create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
      });
      const nouvelActeur: ActeurOption = { id: docRef.id, nomActeur: newActeurNom, telActeur: newActeurTel, mailActeur: newActeurMail, qualiteActeur: newActeurQualite };
      setActeurs(prev => [...prev, nouvelActeur]);
      setActeurSelectionne(docRef.id);
      setNomOccupant(newActeurNom);
      setTel(newActeurTel);
      setMail(newActeurMail);
      setRoleContact(newActeurQualite);
      setShowCreateActeur(false);
      setNewActeurNom(""); setNewActeurQualite(""); setNewActeurTel(""); setNewActeurMail("");
      setNewActeurAdresse(""); setNewActeurObs("");
      toast.success("Acteur créé et sélectionné !");
    } catch { toast.error("Erreur lors de la création"); }
    finally { setSavingActeur(false); }
  };

  if (!isAdmin(userApp) && !canViewDashboard(userApp)) return <AppShell><div className="p-8 text-center">Accès réservé aux administrateurs.</div></AppShell>;
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
      // Lier l'acteur sélectionné au chantier
      if (acteurSelectionne) {
        await updateDoc(doc(db, "Acteurs_autre", acteurSelectionne), {
          operation_ref: doc(db, "Operation", chantierId),
        });
      }
      toast.success("Logement créé !");
      router.replace(`/logements/${id}?chantier=${chantierId}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">
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
                    <button onClick={() => router.push(`/batiments/ajout?chantier=${chantierId}&returnTo=logement`)} className="mt-1 text-xs font-bold text-yellow-800 underline">
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

            {/* Type de contact et sélecteur acteur — seulement si NON occupé */}
            {!occupe && (
              <>
                <div>
                  <label className="text-xs font-medium text-secondary-text">Type de contact</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {TYPES_CONTACT.map(t => (
                      <button key={t} type="button" onClick={() => {
                        const next = typeContact === t ? "" : t;
                        setTypeContact(next);
                        setActeurSelectionne(""); setNomOccupant(""); setTel(""); setMail("");
                      }}
                        className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all",
                          typeContact === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {typeContact && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-secondary-text">Acteur {typeContact}</label>
                      <button type="button" onClick={() => setShowCreateActeur(true)}
                        className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                        <Plus size={12} />Créer un acteur
                      </button>
                    </div>
                    {acteurs.length === 0 ? (
                      <p className="text-xs text-secondary-text italic py-1">Aucun acteur de type «&nbsp;{typeContact}&nbsp;» — créez-en un ci-dessus.</p>
                    ) : (
                      <select className="input-base" value={acteurSelectionne} onChange={e => {
                        setActeurSelectionne(e.target.value);
                        const a = acteurs.find(a => a.id === e.target.value);
                        if (a) { setNomOccupant(a.nomActeur ?? ""); setTel(a.telActeur ?? ""); setMail(a.mailActeur ?? ""); setRoleContact(a.qualiteActeur ?? ""); }
                        else { setNomOccupant(""); setTel(""); setMail(""); setRoleContact(""); }
                      }}>
                        <option value="">— Sélectionner un acteur —</option>
                        {acteurs.map(a => <option key={a.id} value={a.id}>{a.nomActeur}{a.qualiteActeur ? ` — ${a.qualiteActeur}` : ""}</option>)}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-secondary-text">Rôle / Précision</label>
                  <input className="input-base mt-1" value={roleContact} onChange={e => setRoleContact(e.target.value)} placeholder="Ex: Propriétaire bailleur" />
                </div>
              </>
            )}
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

      {/* Modal création acteur */}
      {showCreateActeur && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreateActeur(false); }}>
          <div className="bg-secondary-bg rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-primary-text">Nouvel acteur {typeContact && `— ${typeContact}`}</p>
              <button onClick={() => setShowCreateActeur(false)} className="p-1 hover:bg-alternate rounded-lg transition-colors"><X size={18} className="text-secondary-text" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Nom / Société <span className="text-error">*</span></label>
                <input className="input-base mt-1" value={newActeurNom} onChange={e => setNewActeurNom(e.target.value)} placeholder="Nom ou raison sociale" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Qualité / Fonction</label>
                <input className="input-base mt-1" value={newActeurQualite} onChange={e => setNewActeurQualite(e.target.value)} placeholder="Ex: Propriétaire" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary-text">Téléphone</label>
                  <input className="input-base mt-1" type="tel" value={newActeurTel} onChange={e => setNewActeurTel(e.target.value)} placeholder="06…" />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-text">Email</label>
                  <input className="input-base mt-1" type="email" value={newActeurMail} onChange={e => setNewActeurMail(e.target.value)} placeholder="email@…" />
                </div>
              </div>
              <AdresseSearch value={newActeurAdresse} onChange={setNewActeurAdresse} onSelect={setNewActeurAdresse} label="Adresse postale" placeholder="Ex: 12 rue de la Paix, Vannes" />
              <div>
                <label className="text-xs font-medium text-secondary-text">Observations</label>
                <textarea className="input-base mt-1 resize-none" rows={2} value={newActeurObs} onChange={e => setNewActeurObs(e.target.value)} placeholder="Notes…" />
              </div>
            </div>
            <button onClick={handleCreateActeur} disabled={savingActeur || !newActeurNom.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
              {savingActeur ? <Spinner size="sm" /> : <Check size={16} />}
              {savingActeur ? "Création…" : "Créer et sélectionner"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

import { Suspense } from "react";
export default function AjoutLogementPage() {
  return <Suspense fallback={<div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><AjoutLogementPageContent /></Suspense>;
}
