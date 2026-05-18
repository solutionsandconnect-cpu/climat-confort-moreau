"use client";

// src/app/interventions/[id]/details/page.tsx
// Équivalent de details_demande_widget.dart
// Photos avant/après + gestion du matériel

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, DocumentReference, Timestamp, getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { Spinner, EmptyState, LoadingPage } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import {
  ArrowLeft, Camera, Plus, Trash2, Check, X, Package,
  CheckCircle2, AlertCircle, Image as ImageIcon, Upload,
} from "lucide-react";
import toast from "react-hot-toast";

interface PhotoItem {
  id: string;
  url: string;
  type: "avant" | "apres";
}

interface MaterielItem {
  id: string;
  materielTache?: string;
  etatMateriel?: string;
  localisationReception?: string;
  materielOk?: boolean;
  dateCommande?: Date;
  dateReception?: Date;
  planningRef?: DocumentReference;
}

export default function InterventionDetailsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [descriptif, setDescriptif] = useState("");
  const [loading, setLoading] = useState(true);
  const [photosAvant, setPhotosAvant] = useState<PhotoItem[]>([]);
  const [photosApres, setPhotosApres] = useState<PhotoItem[]>([]);
  const [materiels, setMateriels] = useState<MaterielItem[]>([]);
  const [uploadingAvant, setUploadingAvant] = useState(false);
  const [uploadingApres, setUploadingApres] = useState(false);

  // Ajout matériel
  const [showAddMat, setShowAddMat] = useState(false);
  const [newMat, setNewMat] = useState("");
  const [newEtatMat, setNewEtatMat] = useState("En attente");
  const [newLocalisation, setNewLocalisation] = useState("");
  const [newDateCommande, setNewDateCommande] = useState("");
  const [newDateReception, setNewDateReception] = useState("");
  const [savingMat, setSavingMat] = useState(false);
  const ETATS_MAT = ["En attente", "Commandé", "Receptionné"];

  const inputAvantRef = useRef<HTMLInputElement>(null);
  const inputApresRef = useRef<HTMLInputElement>(null);

  const planningRef = doc(db, "Planning", id) as DocumentReference;

  // ============================================
  // Chargement
  // ============================================
  useEffect(() => {
    setLoading(true);

    // Charger descriptif
    getDoc(planningRef).then(snap => {
      if (snap.exists()) setDescriptif(snap.data().descriptif_travaux as string ?? "");
      setLoading(false);
    });

    // Photos avant
    const unsubAvant = onSnapshot(
      query(collection(db, "Planning", id, "Photo_avant")),
      snap => setPhotosAvant(snap.docs.map(d => ({
        id: d.id,
        url: d.data().photos_avant as string,
        type: "avant",
      })))
    );

    // Photos après
    const unsubApres = onSnapshot(
      query(collection(db, "Planning", id, "Photo_apres")),
      snap => setPhotosApres(snap.docs.map(d => ({
        id: d.id,
        url: d.data().photos_apres as string,
        type: "apres",
      })))
    );

    // Matériel
    const unsubMat = onSnapshot(
      query(collection(db, "Materiel_tache"), where("planning_ref", "==", planningRef)),
      snap => setMateriels(snap.docs.map(d => ({
        id: d.id,
        materielTache: d.data().materiel_tache as string,
        etatMateriel: d.data().etat_materiel as string,
        localisationReception: d.data().localisation_reception_matos as string,
        materielOk: d.data().materiel_ok as boolean,
        dateCommande: (d.data().date_commande as Timestamp)?.toDate(),
        dateReception: (d.data().date_reception as Timestamp)?.toDate(),
        planningRef: d.data().planning_ref as DocumentReference,
      })))
    );

    return () => { unsubAvant(); unsubApres(); unsubMat(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ============================================
  // Upload photo
  // ============================================
  const handleUploadPhoto = async (file: File, type: "avant" | "apres") => {
    if (type === "avant") setUploadingAvant(true);
    else setUploadingApres(true);

    try {
      const storageRef = ref(storage, `interventions/${id}/${type}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      if (type === "avant") {
        await addDoc(collection(db, "Planning", id, "Photo_avant"), {
          photos_avant: url,
          date_create: serverTimestamp(),
          planning_ref: planningRef,
        });
      } else {
        await addDoc(collection(db, "Planning", id, "Photo_apres"), {
          photos_apres: url,
          date_create: serverTimestamp(),
          planning_ref: planningRef,
        });
      }
      toast.success("Photo ajoutée !");
    } catch (e) { console.error(e); toast.error("Erreur lors de l'upload"); }
    finally {
      if (type === "avant") setUploadingAvant(false);
      else setUploadingApres(false);
    }
  };

  const handleDeletePhoto = async (photoId: string, type: "avant" | "apres") => {
    if (!confirm("Supprimer cette photo ?")) return;
    try {
      const collName = type === "avant" ? "Photo_avant" : "Photo_apres";
      await deleteDoc(doc(db, "Planning", id, collName, photoId));
      toast.success("Photo supprimée");
    } catch { toast.error("Erreur lors de la suppression"); }
  };

  // ============================================
  // Ajout matériel
  // ============================================
  const handleAddMateriel = async () => {
    if (!newMat.trim()) { toast.error("Nom du matériel obligatoire"); return; }
    setSavingMat(true);
    try {
      await addDoc(collection(db, "Materiel_tache"), {
        materiel_tache: newMat,
        etat_materiel: newEtatMat || "En attente",
        localisation_reception_matos: newLocalisation,
        date_commande: newDateCommande ? new Date(newDateCommande) : null,
        date_reception: newDateReception ? new Date(newDateReception) : null,
        materiel_ok: newEtatMat === "Receptionné",
        planning_ref: planningRef,
        date_create: serverTimestamp(),
      });
      toast.success("Matériel ajouté !");
      setNewMat(""); setNewEtatMat("En attente"); setNewLocalisation("");
      setNewDateCommande(""); setNewDateReception("");
      setShowAddMat(false);
    } catch (e) { console.error(e); toast.error("Erreur lors de l'ajout"); }
    finally { setSavingMat(false); }
  };

  const handleToggleMaterielOk = async (mat: MaterielItem) => {
    try {
      await updateDoc(doc(db, "Materiel_tache", mat.id), {
        materiel_ok: !mat.materielOk,
        etat_materiel: !mat.materielOk ? "Reçu" : "À commander",
      });
    } catch { toast.error("Erreur"); }
  };

  const handleDeleteMateriel = async (matId: string) => {
    if (!confirm("Supprimer ce matériel ?")) return;
    try {
      await deleteDoc(doc(db, "Materiel_tache", matId));
      toast.success("Supprimé");
    } catch { toast.error("Erreur"); }
  };

  const updateEtatMaterielPlanning = async () => {
    const manquants = materiels.filter(m => !m.materielOk).length;
    await updateDoc(planningRef, {
      etat_materiel: manquants > 0 ? "Matériel manquant" : "Matériel ok",
    });
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Photos & Matériel</h1>
            {descriptif && <p className="text-xs text-secondary-text italic truncate max-w-xs">{descriptif}</p>}
          </div>
        </div>

        {/* ===== PHOTOS AVANT ===== */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Photos avant intervention</p>
            <button
              onClick={() => inputAvantRef.current?.click()}
              disabled={uploadingAvant}
              className="flex items-center gap-1.5 text-xs text-primary font-semibold"
            >
              {uploadingAvant ? <Spinner size="sm" /> : <Camera size={13} />}
              Ajouter
            </button>
            <input
              ref={inputAvantRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(f, "avant"); e.target.value = ""; }}
            />
          </div>
          <div className="p-4">
            {photosAvant.length === 0 ? (
              <div
                className="border-2 border-dashed border-alternate rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => inputAvantRef.current?.click()}
              >
                <ImageIcon size={28} className="text-secondary-text" />
                <p className="text-sm text-secondary-text">Cliquer pour ajouter des photos avant</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photosAvant.map(p => (
                  <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square">
                    <img src={p.url} alt="avant" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button onClick={() => handleDeletePhoto(p.id, "avant")} className="p-2 bg-error rounded-full text-white">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <div
                  className="border-2 border-dashed border-alternate rounded-xl aspect-square flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => inputAvantRef.current?.click()}
                >
                  <Plus size={20} className="text-secondary-text" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== PHOTOS APRÈS ===== */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Photos après intervention</p>
            <button
              onClick={() => inputApresRef.current?.click()}
              disabled={uploadingApres}
              className="flex items-center gap-1.5 text-xs text-primary font-semibold"
            >
              {uploadingApres ? <Spinner size="sm" /> : <Camera size={13} />}
              Ajouter
            </button>
            <input
              ref={inputApresRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(f, "apres"); e.target.value = ""; }}
            />
          </div>
          <div className="p-4">
            {photosApres.length === 0 ? (
              <div
                className="border-2 border-dashed border-alternate rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => inputApresRef.current?.click()}
              >
                <ImageIcon size={28} className="text-secondary-text" />
                <p className="text-sm text-secondary-text">Cliquer pour ajouter des photos après</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photosApres.map(p => (
                  <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square">
                    <img src={p.url} alt="apres" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button onClick={() => handleDeletePhoto(p.id, "apres")} className="p-2 bg-error rounded-full text-white">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <div
                  className="border-2 border-dashed border-alternate rounded-xl aspect-square flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => inputApresRef.current?.click()}
                >
                  <Plus size={20} className="text-secondary-text" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== MATÉRIEL ===== */}
        <div className="card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Matériel & Tâches</p>
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold",
                materiels.some(m => !m.materielOk) ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                {materiels.filter(m => m.materielOk).length}/{materiels.length} ok
              </span>
            </div>
            <button onClick={() => setShowAddMat(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold">
              <Plus size={13} />Ajouter
            </button>
          </div>

          <div className="p-4">
            {/* Formulaire ajout */}
            {showAddMat && (
              <div className="card p-3 mb-3 space-y-2 animate-slide-up border-primary/20">
                <input className="input-base" value={newMat} onChange={e => setNewMat(e.target.value)} placeholder="Nom du matériel / tâche *" />
                <div>
                  <label className="text-xs font-medium text-secondary-text">État</label>
                  <select className="input-base mt-1" value={newEtatMat} onChange={e => setNewEtatMat(e.target.value)}>
                    {ETATS_MAT.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <input className="input-base" value={newLocalisation} onChange={e => setNewLocalisation(e.target.value)} placeholder="Lieu de livraison / réception" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Date commande</label>
                    <input className="input-base mt-1" type="date" value={newDateCommande} onChange={e => setNewDateCommande(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-text">Date réception</label>
                    <input className="input-base mt-1" type="date" value={newDateReception} onChange={e => setNewDateReception(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddMateriel} disabled={savingMat} className="btn-primary flex items-center gap-2 flex-1 py-2 text-sm">
                    {savingMat ? <Spinner size="sm" /> : <Check size={13} />} Ajouter
                  </button>
                  <button onClick={() => setShowAddMat(false)} className="btn-outline px-3 py-2"><X size={13} /></button>
                </div>
              </div>
            )}

            {materiels.length === 0 ? (
              <EmptyState icon={<Package size={24} />} title="Aucun matériel" description="Ajoutez les matériaux et tâches nécessaires à cette intervention." />
            ) : (
              <div className="space-y-2">
                {materiels.map(mat => (
                  <div key={mat.id} className={cn("flex items-start gap-3 p-3 rounded-xl border transition-all",
                    mat.materielOk ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                    <button
                      onClick={() => handleToggleMaterielOk(mat)}
                      className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                        mat.materielOk ? "bg-green-500 border-green-500 text-white" : "border-red-400")}
                    >
                      {mat.materielOk && <Check size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-semibold", mat.materielOk ? "text-green-800 line-through" : "text-red-800")}>
                        {mat.materielTache || "Sans nom"}
                      </p>
                      {mat.etatMateriel && (
                        <p className={cn("text-xs mt-0.5", mat.materielOk ? "text-green-600" : "text-red-600")}>
                          {mat.etatMateriel}
                        </p>
                      )}
                      {mat.localisationReception && (
                        <p className="text-xs text-secondary-text mt-0.5">{mat.localisationReception}</p>
                      )}
                    </div>
                    <button onClick={() => handleDeleteMateriel(mat.id)} className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-100 transition-all shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bouton mise à jour état matériel */}
        {materiels.length > 0 && (
          <button
            onClick={updateEtatMaterielPlanning}
            className="btn-outline w-full flex items-center justify-center gap-2 mb-4"
          >
            <Check size={16} />
            Mettre à jour l&apos;état matériel sur l&apos;intervention
          </button>
        )}
      </div>
    </AppShell>
  );
}
