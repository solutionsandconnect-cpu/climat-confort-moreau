"use client";
export const dynamic = "force-dynamic";
// src/app/logements/[id]/page.tsx — version complète Flutter
// Mode lecture + édition inline avec bâtiment modifiable et acteur si non occupé

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot, updateDoc, getDocs, query, where, collection, DocumentReference, getDoc, addDoc, serverTimestamp, Timestamp, deleteDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { arreterWorkflowByPlanning } from "@/lib/workflowRelanceService";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { subscribePlanningByLogement, subscribeRelancesByLogement, type PlanningLogement, type RelanceLogement } from "@/lib/logementService";
import type { Logement, Batiment } from "@/types";
import { LISTE_ETAT_CHANTIER, LISTE_ETAT_FACTURATION, LISTE_ETAT_SIGNATURE, LISTE_ETAT_QUITUS } from "@/types";
import { BadgeEtat, BadgeFacturation, BadgePrioritaire, EmptyState, LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Pencil, Check, X, Phone, Mail, Home, Building2, Calendar, Clock, Star, StarOff, User, Layers, CheckCircle2, AlertCircle, Plus, History, MapPin, Trash2, AlertTriangle, MessageSquare } from "lucide-react";
import { AdresseSearch } from "@/components/ui/AdresseSearch";
import toast from "react-hot-toast";

const TYPES_CONTACT = ["MOA", "MOE", "Syndic", "Cabinet", "Autre"];

interface Acteur { id: string; nomActeur?: string; telActeur?: string; mailActeur?: string; qualiteActeur?: string; }

function InfoRow({ icon, label, value, href, emptyText = "Non renseigné" }: {
  icon: React.ReactNode; label: string; value?: string | null; href?: string; emptyText?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 py-3 px-4">
      <span className="text-secondary-text shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-secondary-text">{label}</p>
        <p className={cn("text-sm font-medium mt-0.5", !value ? "text-secondary-text italic" : "text-primary-text", href && value && "text-primary")}>
          {value || emptyText}
        </p>
      </div>
    </div>
  );
  if (href && value) return <a href={href} className="block hover:bg-primary-bg/60 transition-colors rounded-lg">{content}</a>;
  return <div>{content}</div>;
}

function PlanningCard({ item, onClick, canDelete, showConfirm, onRequestDelete, onConfirmDelete }: {
  item: PlanningLogement; onClick: () => void;
  canDelete?: boolean; showConfirm?: boolean;
  onRequestDelete?: () => void; onConfirmDelete?: () => void;
}) {
  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow">
      <div className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
            <p className="text-sm font-semibold text-primary-text">
              {item.dateRdv ? format(item.dateRdv, "EEEE dd MMMM yyyy", { locale: fr }) : "Date non définie"}
            </p>
            {item.heureRdv && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock size={12} className="text-secondary-text" />
                <span className="text-xs text-secondary-text">{format(item.heureRdv, "HH:mm")}{item.heureFinRdv && ` – ${format(item.heureFinRdv, "HH:mm")}`}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("badge border text-xs", item.statutRdv === "Réalisé" ? "bg-green-100 text-green-800 border-green-200" : item.statutRdv === "Annulé" ? "bg-red-100 text-red-700 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200")}>
              {item.statutRdv ?? "En attente"}
            </span>
            {canDelete && (showConfirm ? (
              <button onClick={e => { e.stopPropagation(); onConfirmDelete?.(); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-error text-white text-xs font-semibold">
                <AlertTriangle size={11} />Confirmer
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); onRequestDelete?.(); }}
                className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all" title="Supprimer">
                <Trash2 size={13} />
              </button>
            ))}
          </div>
        </div>
        <div className="cursor-pointer" onClick={onClick}>
          {item.descriptifTravaux && <p className="text-xs text-secondary-text bg-primary-bg rounded-lg px-3 py-2 mb-2">{item.descriptifTravaux}</p>}
          <div className="flex gap-2">
            {[{ label: "Client", sig: item.signatureClient }, { label: "Technicien", sig: item.signatureTechnicien }].map(s => (
              <div key={s.label} className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg", s.sig ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                {s.sig ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FicheLogementPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userApp, firebaseUser } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [logement, setLogement] = useState<Logement | null>(null);
  const [batiment, setBatiment] = useState<Batiment | null>(null);
  const [batiments, setBatiments] = useState<Batiment[]>([]);
  const [plannings, setPlannings] = useState<PlanningLogement[]>([]);
  const [relances, setRelances] = useState<RelanceLogement[]>([]);
  const [acteursDisponibles, setActeursDisponibles] = useState<Acteur[]>([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Champs édition
  const [editNum, setEditNum] = useState("");
  const [editNom, setEditNom] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editMail, setEditMail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editType, setEditType] = useState("");
  const [editNiveau, setEditNiveau] = useState(0);
  const [editOccupe, setEditOccupe] = useState(false);
  const [editBatimentId, setEditBatimentId] = useState("");
  const [editEtatChantier, setEditEtatChantier] = useState("");
  const [editEtatFacturation, setEditEtatFacturation] = useState("");
  const [editEtatSignature, setEditEtatSignature] = useState("");
  const [editEtatQuitus, setEditEtatQuitus] = useState("");
  const [editPrioritaire, setEditPrioritaire] = useState(false);
  const [editActeurId, setEditActeurId] = useState("");
  const [loadingActeurs, setLoadingActeurs] = useState(false);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);

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
    setLoading(true);
    const unsub = onSnapshot(doc(db, "Logements", id), async snap => {
      if (!snap.exists()) { router.back(); return; }
      const d = snap.data();
      const log: Logement = {
        id: snap.id,
        numLogement: d.num_logement as string ?? "",
        nomOccupant: d.nom_occupant as string ?? "",
        telOccupant: d.tel_occupant as string,
        mailOccupant: d.mail_occupant as string,
        logementOccupe: d.logement_occupe as boolean ?? false,
        batimentRef: d.batiment_ref as DocumentReference,
        etageLogement: d.etage_logement as number,
        roleContact: d.role_contact as string,
        typeContact: d.type_contact as string,
        operationRef: d.operation_ref as DocumentReference,
        dateCreate: (d.date_create as Timestamp)?.toDate(),
        etatChantier: d.etat_chantier as string,
        etatQuitus: d.etat_quitus as string,
        etatFacturation: d.etat_facturation as string,
        etatSignature: d.etat_signature as string,
        prioritaire: d.priorite_logement as boolean ?? false,
      };
      setLogement(log);
      setEditNum(log.numLogement); setEditNom(log.nomOccupant);
      setEditTel(log.telOccupant ?? ""); setEditMail(log.mailOccupant ?? "");
      setEditRole(log.roleContact ?? ""); setEditType(log.typeContact ?? "");
      setEditNiveau(log.etageLogement ?? 0); setEditOccupe(log.logementOccupe);
      setEditEtatChantier(log.etatChantier ?? ""); setEditEtatFacturation(log.etatFacturation ?? "");
      setEditEtatSignature(log.etatSignature ?? ""); setEditEtatQuitus(log.etatQuitus ?? "");
      setEditPrioritaire(log.prioritaire ?? false);

      // Charger bâtiment
      if (log.batimentRef) {
        const batId = (log.batimentRef as DocumentReference).id;
        setEditBatimentId(batId);
        const batSnap = await getDoc(log.batimentRef as DocumentReference);
        if (batSnap.exists()) setBatiment({ id: batSnap.id, nomBatiment: batSnap.data().nom_batiment as string, adresse: batSnap.data().adresse_batiment as string });
      }

      // Charger tous les bâtiments du chantier
      if (log.operationRef) {
        const opRef = log.operationRef as DocumentReference;
        const batsSnap = await getDocs(query(collection(db, "Batiment"), where("ref_operation", "==", opRef)));
        setBatiments(batsSnap.docs.map(d => ({ id: d.id, nomBatiment: d.data().nom_batiment as string, adresse: (d.data().adresse_batiment ?? d.data().adresse) as string })));
      }
      setLoading(false);
    });
    const unsubPlan = subscribePlanningByLogement(id, setPlannings);
    const unsubRel = subscribeRelancesByLogement(id, setRelances);
    return () => { unsub(); unsubPlan(); unsubRel(); };
  }, [id, router]);

  // Charger acteurs selon type
  useEffect(() => {
    if (!editType || editType === "Autre" || editOccupe) { setActeursDisponibles([]); return; }
    setLoadingActeurs(true);
    getDocs(query(collection(db, "Acteurs_autre"), where("type_acteur", "==", editType)))
      .then(snap => {
        setActeursDisponibles(snap.docs.map(d => ({ id: d.id, nomActeur: d.data().nom_acteur as string, telActeur: d.data().tel_acteur as string, mailActeur: d.data().mail_acteur as string, qualiteActeur: d.data().qualite_acteur as string })));
        setLoadingActeurs(false);
      });
  }, [editType, editOccupe]);

  const handleCreateActeur = async () => {
    if (!newActeurNom.trim()) { toast.error("Le nom est obligatoire"); return; }
    setSavingActeur(true);
    try {
      const data: Record<string, unknown> = {
        type_acteur: editType, nom_acteur: newActeurNom, qualite_acteur: newActeurQualite,
        tel_acteur: newActeurTel, mail_acteur: newActeurMail, adresse_acteur: newActeurAdresse,
        observations: newActeurObs, date_create: serverTimestamp(),
        create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
      };
      if (logement?.operationRef) data.operation_ref = logement.operationRef;
      const ref = await addDoc(collection(db, "Acteurs_autre"), data);
      // Auto-sélectionner le nouvel acteur
      const newActeur = { id: ref.id, nomActeur: newActeurNom, telActeur: newActeurTel, mailActeur: newActeurMail, qualiteActeur: newActeurQualite };
      setActeursDisponibles(prev => [...prev, newActeur]);
      setEditActeurId(ref.id);
      setEditNom(newActeurNom); setEditTel(newActeurTel); setEditMail(newActeurMail);
      if (newActeurQualite) setEditRole(newActeurQualite);
      setShowCreateActeur(false);
      setNewActeurNom(""); setNewActeurQualite(""); setNewActeurTel(""); setNewActeurMail(""); setNewActeurAdresse(""); setNewActeurObs("");
      toast.success("Acteur créé et sélectionné !");
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSavingActeur(false); }
  };

  const handleSave = async () => {
    if (!logement) return;
    setSaving(true);
    try {
      const acteurRef = editActeurId ? doc(db, "Acteurs_autre", editActeurId) : null;
      await updateDoc(doc(db, "Logements", id), {
        num_logement: editNum,
        nom_occupant: editNom,
        tel_occupant: editTel,
        mail_occupant: editMail,
        role_contact: editRole,
        type_contact: editType,
        nom_type_contact: acteurRef,
        etage_logement: editNiveau,
        logement_occupe: editOccupe,
        batiment_ref: editBatimentId ? doc(db, "Batiment", editBatimentId) : null,
        etat_chantier: editEtatChantier,
        etat_facturation: editEtatFacturation,
        etat_signature: editEtatSignature,
        etat_quitus: editEtatQuitus,
        priorite_logement: editPrioritaire,
      });
      // Sync acteur → chantier si pas déjà lié
      if (editActeurId && logement.operationRef) {
        try {
          const actSnap = await getDoc(doc(db, "Acteurs_autre", editActeurId));
          if (actSnap.exists() && !actSnap.data().operation_ref) {
            await updateDoc(doc(db, "Acteurs_autre", editActeurId), {
              operation_ref: logement.operationRef,
            });
          }
        } catch (e) { console.error(e); }
      }
      setEditMode(false);
      toast.success("Logement mis à jour !");
    } catch (e) { console.error(e); toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const opId = logement?.operationRef ? (logement.operationRef as DocumentReference).id : undefined;

  const deleteStorageUrl = async (url: string) => {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return;
    try {
      const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
      await deleteObject(storageRef(storage, path));
    } catch {}
  };

  const handleDeletePlanning = async (planId: string, plan: PlanningLogement) => {
    setDeletingPlan(true);
    try {
      const planRef = doc(db, "Planning", planId);
      const photosAvantSnap = await getDocs(collection(db, "Planning", planId, "Photo_avant"));
      await Promise.all(photosAvantSnap.docs.map(async d => { await deleteStorageUrl(d.data().photos_avant as string); await deleteDoc(d.ref); }));
      const photosApresSnap = await getDocs(collection(db, "Planning", planId, "Photo_apres"));
      await Promise.all(photosApresSnap.docs.map(async d => { await deleteStorageUrl(d.data().photos_apres as string); await deleteDoc(d.ref); }));
      if (plan.signatureClient) await deleteStorageUrl(plan.signatureClient);
      if (plan.signatureTechnicien) await deleteStorageUrl(plan.signatureTechnicien);
      const matSnap = await getDocs(query(collection(db, "Materiel_tache"), where("planning_ref", "==", planRef)));
      await Promise.all(matSnap.docs.map(d => deleteDoc(d.ref)));
      const notesSnap = await getDocs(query(collection(db, "Notes_travaux"), where("ref_planning", "==", planRef)));
      await Promise.all(notesSnap.docs.map(d => deleteDoc(d.ref)));
      await arreterWorkflowByPlanning(planId).catch(() => {});
      await deleteDoc(planRef);
      toast.success("Intervention supprimée");
    } catch { toast.error("Erreur lors de la suppression"); }
    finally { setDeletingPlan(false); setConfirmDeletePlanId(null); }
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  if (!logement) return null;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-3xl mx-auto px-4 lg:px-6 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => {
              const destId = chantierId ?? opId;
              router.push(destId ? `/chantiers/${destId}` : "/dashboard");
            }}
            className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>
              Logement {logement.numLogement || "—"}
            </h1>
            <p className="text-xs text-secondary-text">{batiment?.nomBatiment && `${batiment.nomBatiment} · `}Créé le {formatDate(logement.dateCreate)}</p>
            {opId && (
              <button onClick={() => router.push(`/chantiers/${opId}`)} className="text-xs text-primary font-semibold flex items-center gap-1 mt-0.5 hover:underline">
                <Building2 size={11} />Voir le chantier
              </button>
            )}
          </div>
          {isAdmin(userApp) && (
            <button onClick={() => editMode ? (setEditMode(false)) : setEditMode(true)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all",
                editMode ? "bg-red-50 text-red-600 border border-red-200" : "btn-outline")}>
              {editMode ? <X size={15} /> : <Pencil size={15} />}
              {editMode ? "Annuler" : "Modifier"}
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <BadgeEtat etat={logement.etatChantier ?? "—"} />
          <BadgeFacturation etat={logement.etatFacturation ?? "—"} />
          <span className={cn("badge border", logement.etatSignature === "Signé" ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200")}>
            {logement.etatSignature ?? "—"}
          </span>
          <span className={cn("badge border", logement.etatQuitus === "Envoyé" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200")}>
            Quitus : {logement.etatQuitus ?? "—"}
          </span>
          <BadgePrioritaire prioritaire={logement.prioritaire} />
        </div>


        {/* MODE LECTURE */}
        {!editMode && (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations occupant</p>
              </div>
              <div className="divide-y divide-alternate/60">
                <InfoRow icon={<Home size={15} />} label="N° Logement" value={logement.numLogement} />
                <InfoRow icon={<User size={15} />} label="Occupant" value={logement.nomOccupant} />
                <InfoRow icon={<User size={15} />} label="Type contact" value={logement.typeContact} />
                {logement.roleContact && <InfoRow icon={<User size={15} />} label="Rôle / Précision" value={logement.roleContact} />}
                {/* Téléphone + actions */}
                <div className="flex items-center gap-3 py-3 px-4">
                  <span className="text-secondary-text shrink-0"><Phone size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-secondary-text">Téléphone</p>
                    {logement.telOccupant ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-sm font-medium text-primary-text">{logement.telOccupant}</span>
                        <a href={`tel:${logement.telOccupant}`} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200 hover:bg-green-100 transition-colors"><Phone size={10} />Appeler</a>
                        <a href={`sms:${logement.telOccupant}`} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 hover:bg-blue-100 transition-colors"><MessageSquare size={10} />SMS</a>
                      </div>
                    ) : <p className="text-sm text-secondary-text italic mt-0.5">Non renseigné</p>}
                  </div>
                </div>
                {/* Email + action */}
                <div className="flex items-center gap-3 py-3 px-4">
                  <span className="text-secondary-text shrink-0"><Mail size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-secondary-text">Email</p>
                    {logement.mailOccupant ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-sm font-medium text-primary-text break-all">{logement.mailOccupant}</span>
                        <a href={`mailto:${logement.mailOccupant}`} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20 transition-colors"><Mail size={10} />E-mail</a>
                      </div>
                    ) : <p className="text-sm text-secondary-text italic mt-0.5">Non renseigné</p>}
                  </div>
                </div>
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-primary-bg border-b border-alternate">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Caractéristiques</p>
              </div>
              <div className="divide-y divide-alternate/60">
                <InfoRow icon={<Building2 size={15} />} label="Bâtiment" value={batiment?.nomBatiment} emptyText="Aucun bâtiment" />
                <InfoRow icon={<Layers size={15} />} label="Niveau" value={logement.etageLogement !== undefined ? `Niveau ${logement.etageLogement}` : null} />
                <InfoRow icon={<Home size={15} />} label="Occupation" value={logement.logementOccupe ? "Occupé" : "Vacant"} />
              </div>
            </div>

            {/* Interventions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  <h2 className="text-sm font-bold text-primary-text">Interventions</h2>
                  <span className="text-xs text-secondary-text bg-alternate px-2 py-0.5 rounded-full">{plannings.length}</span>
                </div>
                {isAdmin(userApp) && (
                  <button onClick={() => router.push(`/interventions/ajout?logement=${id}${opId ? `&chantier=${opId}` : ""}`)}
                    className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                    <Plus size={14} />Ajouter
                  </button>
                )}
              </div>
              {plannings.length === 0
                ? <EmptyState icon={<Calendar size={24} />} title="Aucune intervention" description="Aucune intervention planifiée." />
                : <div className="space-y-2">{plannings.map(p => (
                    <PlanningCard
                      key={p.id}
                      item={p}
                      onClick={() => router.push(`/interventions/${p.id}`)}
                      canDelete={isAdmin(userApp)}
                      showConfirm={confirmDeletePlanId === p.id}
                      onRequestDelete={() => { setConfirmDeletePlanId(p.id); setTimeout(() => setConfirmDeletePlanId(null), 3000); }}
                      onConfirmDelete={() => !deletingPlan && handleDeletePlanning(p.id, p)}
                    />
                  ))}</div>
              }
            </div>

            {/* Relances */}
            {relances.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <History size={16} className="text-tertiary" />
                  <h2 className="text-sm font-bold text-primary-text">Relances</h2>
                  <span className="text-xs text-secondary-text bg-alternate px-2 py-0.5 rounded-full">{relances.length}</span>
                </div>
                <div className="space-y-2">
                  {relances.map(r => (
                    <div key={r.id} className="card p-3.5 flex items-start justify-between">
                      <p className="text-sm text-primary-text font-medium">{r.motif || "Sans motif"}</p>
                      <span className="text-xs text-secondary-text shrink-0 ml-3">{formatDate(r.dateRelance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE ÉDITION */}
        {editMode && (
          <div className="space-y-4">
            {/* Bâtiment modifiable */}
            <div className="card p-4">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide mb-2">Bâtiment</p>
              {batiments.length > 0 ? (
                <div className="space-y-2">
                  {batiments.map(b => (
                    <button key={b.id} onClick={() => setEditBatimentId(b.id)}
                      className={cn("w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left",
                        editBatimentId === b.id ? "border-primary bg-primary/5" : "border-alternate hover:border-primary/40")}>
                      <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center", editBatimentId === b.id ? "border-primary" : "border-alternate")}>
                        {editBatimentId === b.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <span className="text-sm font-medium text-primary-text">{b.nomBatiment || "Sans nom"}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-secondary-text italic">Aucun bâtiment disponible</p>}
            </div>

            {/* Identification */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Identification</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary-text">N° Logement</label>
                  <input className="input-base mt-1" value={editNum} onChange={e => setEditNum(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-text">Niveau</label>
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => setEditNiveau(n => Math.max(0, n - 1))} className="w-8 h-9 rounded-lg border border-alternate flex items-center justify-center text-secondary-text hover:text-primary">–</button>
                    <span className="flex-1 text-center font-bold text-primary-text">{editNiveau}</span>
                    <button onClick={() => setEditNiveau(n => n + 1)} className="w-8 h-9 rounded-lg border border-alternate flex items-center justify-center text-secondary-text hover:text-primary">+</button>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text mb-1.5 block">Occupation</label>
                <div className="flex gap-2">
                  {[["Oui", true], ["Non", false]].map(([label, val]) => (
                    <button key={String(label)} onClick={() => { setEditOccupe(val as boolean); setEditType(""); setEditActeurId(""); }}
                      className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all", editOccupe === val ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text mb-1.5 block">Priorité</label>
                <div className="flex gap-2">
                  <button onClick={() => setEditPrioritaire(true)} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-2", editPrioritaire ? "bg-red-500 text-white border-red-500" : "border-alternate text-secondary-text")}>
                    <Star size={13} /> Prioritaire
                  </button>
                  <button onClick={() => setEditPrioritaire(false)} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-2", !editPrioritaire ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>
                    <StarOff size={13} /> Standard
                  </button>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Contact</p>
              <div>
                <label className="text-xs font-medium text-secondary-text">Type de contact</label>
                <select className="input-base mt-1" value={editType} onChange={e => { setEditType(e.target.value); setEditActeurId(""); }}>
                  <option value="">— Sélectionner —</option>
                  {TYPES_CONTACT.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {!editOccupe && editType && editType !== "Autre" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-secondary-text">Acteur ({editType})</label>
                    <button type="button" onClick={() => setShowCreateActeur(true)}
                      className="text-xs text-primary font-semibold flex items-center gap-1">
                      <Plus size={11} />Créer
                    </button>
                  </div>
                  {loadingActeurs ? <div className="flex justify-center py-2"><Spinner /></div> : (
                    <select className="input-base" value={editActeurId}
                      onChange={e => {
                        const a = acteursDisponibles.find(a => a.id === e.target.value);
                        if (a) { setEditActeurId(a.id); setEditNom(a.nomActeur ?? ""); setEditTel(a.telActeur ?? ""); setEditMail(a.mailActeur ?? ""); if (a.qualiteActeur) setEditRole(a.qualiteActeur); }
                        else { setEditActeurId(""); }
                      }}>
                      <option value="">— Sélectionner —</option>
                      {acteursDisponibles.map(a => <option key={a.id} value={a.id}>{a.nomActeur}</option>)}
                    </select>
                  )}
                  {/* Modal création acteur */}
                  {showCreateActeur && (
                    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
                      onClick={e => { if (e.target === e.currentTarget) setShowCreateActeur(false); }}>
                      <div className="bg-secondary-bg rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl flex flex-col max-h-[90dvh]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-alternate shrink-0">
                          <p className="font-bold text-primary-text">Créer un acteur ({editType})</p>
                          <button onClick={() => setShowCreateActeur(false)} className="p-1 hover:bg-alternate rounded-lg"><X size={18} className="text-secondary-text" /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4 space-y-3">
                          <div><label className="text-xs font-medium text-secondary-text">Nom / Société *</label><input className="input-base mt-1" value={newActeurNom} onChange={e => setNewActeurNom(e.target.value)} /></div>
                          <div><label className="text-xs font-medium text-secondary-text">Qualité / Fonction</label><input className="input-base mt-1" value={newActeurQualite} onChange={e => setNewActeurQualite(e.target.value)} /></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label className="text-xs font-medium text-secondary-text">Téléphone</label><input className="input-base mt-1" type="tel" value={newActeurTel} onChange={e => setNewActeurTel(e.target.value)} /></div>
                            <div><label className="text-xs font-medium text-secondary-text">Email</label><input className="input-base mt-1" type="email" value={newActeurMail} onChange={e => setNewActeurMail(e.target.value)} /></div>
                          </div>
                          <AdresseSearch value={newActeurAdresse} onChange={setNewActeurAdresse} onSelect={setNewActeurAdresse} label="Adresse" />
                          <div><label className="text-xs font-medium text-secondary-text">Observations</label><textarea className="input-base mt-1 resize-none" rows={2} value={newActeurObs} onChange={e => setNewActeurObs(e.target.value)} /></div>
                        </div>
                        <div className="p-3 border-t border-alternate shrink-0" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                          <button onClick={handleCreateActeur} disabled={savingActeur || !newActeurNom.trim()}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                            {savingActeur ? <Spinner size="sm" /> : <Check size={14} />}Créer et sélectionner
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-secondary-text">Nom</label>
                <input className="input-base mt-1" value={editNom} onChange={e => setEditNom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Rôle / Précision</label>
                <input className="input-base mt-1" value={editRole} onChange={e => setEditRole(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary-text">Téléphone</label>
                  <input className="input-base mt-1" type="tel" value={editTel} onChange={e => setEditTel(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-text">Email</label>
                  <input className="input-base mt-1" type="email" value={editMail} onChange={e => setEditMail(e.target.value)} />
                </div>
              </div>
            </div>

            {/* États */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">États</p>
              {[
                { label: "État chantier", options: LISTE_ETAT_CHANTIER, value: editEtatChantier, setter: setEditEtatChantier },
                { label: "Facturation", options: LISTE_ETAT_FACTURATION, value: editEtatFacturation, setter: setEditEtatFacturation },
                { label: "Signature", options: LISTE_ETAT_SIGNATURE, value: editEtatSignature, setter: setEditEtatSignature },
                { label: "Quitus", options: LISTE_ETAT_QUITUS, value: editEtatQuitus, setter: setEditEtatQuitus },
              ].map(({ label, options, value, setter }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-secondary-text">{label}</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {options.map(o => (
                      <button key={o} onClick={() => setter(o)}
                        className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all",
                          value === o ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pb-4">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3">
                {saving ? <Spinner size="sm" /> : <Check size={16} />} Sauvegarder
              </button>
              <button onClick={() => setEditMode(false)} className="btn-outline px-4"><X size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
