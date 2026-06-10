"use client";

// src/app/acteurs/page.tsx
// Équivalent de liste_acteurs_chantiers_widget.dart
// Liste de tous les acteurs chantiers avec recherche + ajout + modification

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, DocumentReference, Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput, Spinner } from "@/components/ui";
import { cn, getInitials, formatDateRelative } from "@/lib/utils";
import {
  Users, Plus, Pencil, Trash2, X, Check, Phone, Mail, MapPin,
  Building2, ChevronDown, ChevronUp, User,
} from "lucide-react";
import { NavButton } from "@/components/ui/NavButton";
import toast from "react-hot-toast";

const TYPES_ACTEUR = [
  "MOA", "MOE", "Syndic",
  "Cabinet", "Autre"
];

interface Acteur {
  id: string;
  typeActeur?: string;
  nomActeur?: string;
  qualiteActeur?: string;
  telActeur?: string;
  mailActeur?: string;
  adresseActeur?: string;
  observations?: string;
  operationRef?: DocumentReference;
  dateCreate?: Date;
  // résolu
  chantierNom?: string;
}

// ============================================
// Formulaire Ajout / Modification
// ============================================
function ActeurForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<Acteur>;
  onSave: (data: Omit<Acteur, "id" | "dateCreate" | "chantierNom">) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [type, setType] = useState(initial?.typeActeur ?? "");
  const [nom, setNom] = useState(initial?.nomActeur ?? "");
  const [qualite, setQualite] = useState(initial?.qualiteActeur ?? "");
  const [tel, setTel] = useState(initial?.telActeur ?? "");
  const [mail, setMail] = useState(initial?.mailActeur ?? "");
  const [adresse, setAdresse] = useState(initial?.adresseActeur ?? "");
  const [obs, setObs] = useState(initial?.observations ?? "");

  const handleSubmit = async () => {
    if (!nom.trim()) { toast.error("Le nom est obligatoire"); return; }
    await onSave({ typeActeur: type, nomActeur: nom, qualiteActeur: qualite, telActeur: tel, mailActeur: mail, adresseActeur: adresse, observations: obs });
  };

  return (
    <div className="card p-4 space-y-3 animate-slide-up mb-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-primary-text">{initial ? "Modifier l'acteur" : "Nouvel acteur"}</h3>
        <button onClick={onCancel}><X size={16} className="text-secondary-text" /></button>
      </div>

      <div>
        <label className="text-xs font-medium text-secondary-text">Type d&apos;acteur</label>
        <select className="input-base mt-1" value={type} onChange={e => setType(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {TYPES_ACTEUR.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary-text">Nom / Société <span className="text-error">*</span></label>
          <input className="input-base mt-1" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom ou raison sociale" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary-text">Qualité / Fonction</label>
          <input className="input-base mt-1" value={qualite} onChange={e => setQualite(e.target.value)} placeholder="Ex: Propriétaire" />
        </div>
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

      <div>
        <label className="text-xs font-medium text-secondary-text">Adresse</label>
        <input className="input-base mt-1" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse complète" />
      </div>

      <div>
        <label className="text-xs font-medium text-secondary-text">Observations</label>
        <textarea className="input-base mt-1 resize-none" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Notes, remarques…" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={saving || !nom.trim()} className="btn-primary flex items-center gap-2 flex-1">
          {saving ? <Spinner size="sm" /> : <Check size={14} />}
          {initial ? "Sauvegarder" : "Ajouter l'acteur"}
        </button>
        <button onClick={onCancel} className="btn-outline px-4"><X size={14} /></button>
      </div>
    </div>
  );
}

// ============================================
// Carte acteur
// ============================================
function ActeurCard({ acteur, canEdit, onEdit, onDelete }: {
  acteur: Acteur; canEdit: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 cursor-pointer hover:bg-primary-bg/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-sm">{getInitials(acteur.nomActeur ?? "?")}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-primary-text text-sm truncate">{acteur.nomActeur || "Sans nom"}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {acteur.typeActeur && (
                <span className="badge bg-primary/10 text-primary border-primary/20 text-xs">{acteur.typeActeur}</span>
              )}
              {acteur.qualiteActeur && (
                <span className="text-xs text-secondary-text truncate">{acteur.qualiteActeur}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && <>
              <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all"><Pencil size={13} /></button>
              <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"><Trash2 size={13} /></button>
            </>}
            {expanded ? <ChevronUp size={14} className="text-secondary-text" /> : <ChevronDown size={14} className="text-secondary-text" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-alternate px-4 py-3 space-y-2">
          {acteur.telActeur && (
            <a href={`tel:${acteur.telActeur}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Phone size={14} className="text-secondary-text" />{acteur.telActeur}
            </a>
          )}
          {acteur.mailActeur && (
            <a href={`mailto:${acteur.mailActeur}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Mail size={14} className="text-secondary-text" />{acteur.mailActeur}
            </a>
          )}
          {acteur.adresseActeur && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-secondary-text shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-primary-text">{acteur.adresseActeur}</p>
                <div className="mt-1.5">
                  <NavButton adresse={acteur.adresseActeur} />
                </div>
              </div>
            </div>
          )}
          {acteur.chantierNom && (
            <div className="flex items-center gap-2 text-sm text-secondary-text">
              <Building2 size={14} className="shrink-0" />{acteur.chantierNom}
            </div>
          )}
          {acteur.observations && (
            <p className="text-xs text-secondary-text bg-primary-bg rounded-lg px-3 py-2">{acteur.observations}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Page principale
// ============================================
export default function ActeursPage() {
  const { userApp, firebaseUser } = useAuthStore();
  const canManage = canManage || canViewDashboard(userApp);
  const [acteurs, setActeurs] = useState<Acteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chantierNames, setChantierNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "Acteurs_autre"), orderBy("type_acteur"));
    const unsub = onSnapshot(q, async (snap) => {
      const items: Acteur[] = snap.docs.map(d => ({
        id: d.id,
        typeActeur: d.data().type_acteur as string,
        nomActeur: d.data().nom_acteur as string,
        qualiteActeur: d.data().qualite_acteur as string,
        telActeur: d.data().tel_acteur as string,
        mailActeur: d.data().mail_acteur as string,
        adresseActeur: d.data().adresse_acteur as string,
        observations: d.data().observations as string,
        operationRef: d.data().operation_ref as DocumentReference,
        dateCreate: (d.data().date_create as Timestamp)?.toDate(),
      }));

      // Résoudre les noms de chantiers
      const map = new Map(chantierNames);
      await Promise.all(items.map(async item => {
        if (item.operationRef && !map.has(item.operationRef.id)) {
          try {
            const { getDoc } = await import("firebase/firestore");
            const snap = await getDoc(item.operationRef);
            if (snap.exists()) map.set(snap.id, snap.data().nom_chantier as string ?? "—");
          } catch {}
        }
      }));
      setChantierNames(new Map(map));

      setActeurs(items.map(a => ({
        ...a,
        chantierNom: a.operationRef ? map.get(a.operationRef.id) : undefined,
      })));
      setLoading(false);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (data: Omit<Acteur, "id" | "dateCreate" | "chantierNom">) => {
    setSaving(true);
    try {
      await addDoc(collection(db, "Acteurs_autre"), {
        ...toFirestore(data),
        date_create: serverTimestamp(),
        create_par: firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null,
      });
      toast.success("Acteur ajouté !");
      setShowForm(false);
    } catch (e) { console.error(e); toast.error("Erreur lors de l'ajout"); }
    finally { setSaving(false); }
  };

  const handleEdit = async (id: string, data: Omit<Acteur, "id" | "dateCreate" | "chantierNom">) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "Acteurs_autre", id), toFirestore(data));
      toast.success("Acteur mis à jour !");
      setEditingId(null);
    } catch (e) { console.error(e); toast.error("Erreur lors de la modification"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet acteur ?")) return;
    try {
      await deleteDoc(doc(db, "Acteurs_autre", id));
      toast.success("Acteur supprimé");
    } catch { toast.error("Erreur lors de la suppression"); }
  };

  const toFirestore = (data: Omit<Acteur, "id" | "dateCreate" | "chantierNom">) => ({
    type_acteur: data.typeActeur ?? "",
    nom_acteur: data.nomActeur ?? "",
    qualite_acteur: data.qualiteActeur ?? "",
    tel_acteur: data.telActeur ?? "",
    mail_acteur: data.mailActeur ?? "",
    adresse_acteur: data.adresseActeur ?? "",
    observations: data.observations ?? "",
  });

  const filtered = acteurs.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.nomActeur?.toLowerCase().includes(q) ||
      a.typeActeur?.toLowerCase().includes(q) ||
      a.qualiteActeur?.toLowerCase().includes(q) ||
      a.chantierNom?.toLowerCase().includes(q);
  });

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Acteurs chantiers</h1>
            <p className="text-sm text-secondary-text mt-0.5">{acteurs.length} acteur{acteurs.length !== 1 ? "s" : ""}</p>
          </div>
          {canManage && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /><span className="hidden sm:inline">Ajouter un acteur</span>
            </button>
          )}
        </div>

        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un acteur, un type, …" />
        </div>

        {showForm && (
          <ActeurForm onSave={handleAdd} onCancel={() => setShowForm(false)} saving={saving} />
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title="Aucun acteur" description="Ajoutez les acteurs liés aux chantiers (MOE, bureau de contrôle, sous-traitants…)." />
        ) : (
          <div className="space-y-2">
            {filtered.map(acteur => (
              <div key={acteur.id}>
                {editingId === acteur.id ? (
                  <ActeurForm
                    initial={acteur}
                    onSave={data => handleEdit(acteur.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                ) : (
                  <ActeurCard
                    acteur={acteur}
                    canEdit={canManage}
                    onEdit={() => setEditingId(acteur.id)}
                    onDelete={() => handleDelete(acteur.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
