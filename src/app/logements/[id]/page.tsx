"use client";
// src/app/logements/[id]/page.tsx — version complète Flutter
// Mode lecture + édition inline avec bâtiment modifiable et acteur si non occupé

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot, updateDoc, getDocs, query, where, collection, DocumentReference, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { subscribePlanningByLogement, subscribeRelancesByLogement, type PlanningLogement, type RelanceLogement } from "@/lib/logementService";
import type { Logement, Batiment } from "@/types";
import { LISTE_ETAT_CHANTIER, LISTE_ETAT_FACTURATION, LISTE_ETAT_SIGNATURE, LISTE_ETAT_QUITUS } from "@/types";
import { BadgeEtat, BadgeFacturation, BadgePrioritaire, EmptyState, LoadingPage, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Pencil, Check, X, Phone, Mail, Home, Building2, Calendar, Clock, Star, StarOff, User, Layers, CheckCircle2, AlertCircle, Plus, History } from "lucide-react";
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

function PlanningCard({ item, onClick }: { item: PlanningLogement; onClick: () => void }) {
  return (
    <div className="card p-3.5 cursor-pointer hover:shadow-card-hover transition-shadow" onClick={onClick}>
      <div className="flex items-start justify-between mb-2">
        <div>
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
        <span className={cn("badge border text-xs", item.statutRdv === "Réalisé" ? "bg-green-100 text-green-800 border-green-200" : item.statutRdv === "Annulé" ? "bg-red-100 text-red-700 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200")}>
          {item.statutRdv ?? "En attente"}
        </span>
      </div>
      {item.descriptifTravaux && <p className="text-xs text-secondary-text bg-primary-bg rounded-lg px-3 py-2 mb-2">{item.descriptifTravaux}</p>}
      <div className="flex gap-2">
        {[{ label: "Client", sig: item.signatureClient }, { label: "Technicien", sig: item.signatureTechnicien }].map(s => (
          <div key={s.label} className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg", s.sig ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
            {s.sig ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FicheLogementPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userApp } = useAuthStore();
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
      setEditMode(false);
      toast.success("Logement mis à jour !");
    } catch (e) { console.error(e); toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const opId = logement?.operationRef ? (logement.operationRef as DocumentReference).id : undefined;

  if (loading) return <AppShell><LoadingPage /></AppShell>;
  if (!logement) return null;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-3xl mx-auto px-4 lg:px-6 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.push(chantierId ? `/chantiers/${chantierId}` : "/dashboard")}
            className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>
              Logement {logement.numLogement || "—"}
            </h1>
            <p className="text-xs text-secondary-text">{batiment?.nomBatiment && `${batiment.nomBatiment} · `}Créé le {formatDate(logement.dateCreate)}</p>
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
                <InfoRow icon={<Phone size={15} />} label="Téléphone" value={logement.telOccupant} href={logement.telOccupant ? `tel:${logement.telOccupant}` : undefined} />
                <InfoRow icon={<Mail size={15} />} label="Email" value={logement.mailOccupant} href={logement.mailOccupant ? `mailto:${logement.mailOccupant}` : undefined} />
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
                : <div className="space-y-2">{plannings.map(p => <PlanningCard key={p.id} item={p} onClick={() => router.push(`/interventions/${p.id}`)} />)}</div>
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
                  <label className="text-xs font-medium text-secondary-text">Acteur ({editType})</label>
                  {loadingActeurs ? <div className="flex justify-center py-2"><Spinner /></div> : (
                    <select className="input-base mt-1" value={editActeurId}
                      onChange={e => {
                        const a = acteursDisponibles.find(a => a.id === e.target.value);
                        if (a) { setEditActeurId(a.id); setEditNom(a.nomActeur ?? ""); setEditTel(a.telActeur ?? ""); setEditMail(a.mailActeur ?? ""); if (a.qualiteActeur) setEditRole(a.qualiteActeur); }
                      }}>
                      <option value="">— Sélectionner —</option>
                      {acteursDisponibles.map(a => <option key={a.id} value={a.id}>{a.nomActeur}</option>)}
                    </select>
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
