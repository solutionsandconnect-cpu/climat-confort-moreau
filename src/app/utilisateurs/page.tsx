"use client";
// src/app/utilisateurs/page.tsx — photo + forfait jour + ajout compte + quota + suppression

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateDoc, doc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { auth } from "@/lib/firebase";
import {
  subscribeAllUsers, toggleUserActif, updateUser, deleteUserAccount,
  subscribeQuotaConfig, setQuotaMax,
} from "@/lib/modulesService";
import type { UserApp } from "@/types";
import { LISTE_SERVICES } from "@/types";
import { EmptyState, LoadingPage, SearchInput, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateRelative, getInitials } from "@/lib/utils";
import {
  Users, Pencil, X, Check, Power, PowerOff, Plus, ChevronDown, ChevronUp,
  Camera, Trash2, Shield, AlertTriangle, MonitorSmartphone,
} from "lucide-react";
import toast from "react-hot-toast";

const ROLES = ["Utilisateur", "Admin", "SuperAdmin"];
const TYPES = ["Chef de chantier Plomberie", "Chef de chantier Electricité", "Technicien SAV", "Compagnon Plomberie", "Compagnon Electricité", "Conducteur de Travaux", "Service SAV / Expertises", "Bureau Etude", "Bureau Administratif"];
const FORFAIT_OPTIONS = ["Forfait Jour", "Pas de forfait jour"];

function RoleBadge({ role }: { role?: string }) {
  const cfg = role === "SuperAdmin" ? "bg-purple-100 text-purple-800 border-purple-200" : role === "Admin" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-200";
  return <span className={cn("badge border text-xs", cfg)}>{role ?? "Utilisateur"}</span>;
}

async function impersonateUser(targetUid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Non authentifié");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/admin/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ targetUid }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }
  const { token } = await res.json();
  window.open(`/admin-access?token=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
}

function UserCard({ user, canEdit, canToggle, canImpersonate, onDelete }: { user: UserApp; canEdit: boolean; canToggle: boolean; canImpersonate: boolean; onDelete: () => void; }) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  const [editNom, setEditNom] = useState(user.nom);
  const [editPrenom, setEditPrenom] = useState(user.prenom);
  const [editPhone, setEditPhone] = useState(user.phoneNumber ?? "");
  const [editPhoneType, setEditPhoneType] = useState<"Pro" | "Perso">(user.phoneType ?? "Pro");
  const [editEmailType, setEditEmailType] = useState<"Pro" | "Perso">(user.emailType ?? "Pro");
  const [editType, setEditType] = useState(user.type ?? "");
  const [editRole, setEditRole] = useState<string>(user.roleapp ?? "Utilisateur");
  const [editService, setEditService] = useState(user.service ?? "");
  const [editForfait, setEditForfait] = useState((user as any).acesForfaitJour ?? "");

  const handlePhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const r = storageRef(storage, `users/${user.id}/photo_${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "usersapp", user.id), { photo_url: url });
      toast.success("Photo mise à jour !");
    } catch { toast.error("Erreur upload photo"); }
    finally { setUploadingPhoto(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser(user.id, { nom: editNom, prenom: editPrenom, phoneNumber: editPhone, type: editType, roleapp: editRole, service: editService, displayName: `${editPrenom} ${editNom}` });
      await updateDoc(doc(db, "usersapp", user.id), {
        acces_forfait_jour: editForfait,
        phone_type: editPhoneType,
        email_type: editEmailType,
      });
      setEditMode(false);
      toast.success("Utilisateur mis à jour");
    } catch { toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Non authentifié");
      const idToken = await currentUser.getIdToken();
      await deleteUserAccount(user.id, user.uid, idToken);
      toast.success("Compte supprimé définitivement");
      onDelete();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Erreur lors de la suppression");
    }
    finally { setDeleting(false); setConfirmDelete(false); }
  };

  return (
    <div className={cn("card overflow-hidden", !user.actif && "opacity-60")}>
      <div className="px-4 py-3 cursor-pointer hover:bg-primary-bg/50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary flex items-center justify-center">
              {user.photoUrl ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-white text-sm font-bold">{getInitials(user.nom, user.prenom)}</span>}
            </div>
            {canEdit && (
              <label className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-600 transition-colors" onClick={e => e.stopPropagation()}>
                {uploadingPhoto ? <Spinner size="sm" /> : <Camera size={10} className="text-white" />}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-primary-text text-sm">{user.displayName || `${user.prenom} ${user.nom}`}</p>
            <p className="text-xs text-secondary-text truncate">{user.email}{user.emailType ? ` (${user.emailType})` : ""}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <RoleBadge role={user.roleapp} />
              {user.type && <span className="badge bg-secondary/10 text-secondary-600 border-secondary/20 text-xs">{user.type}</span>}
              {user.service && <span className="badge bg-primary/10 text-primary border-primary/20 text-xs">{user.service}</span>}
              {(user as any).acesForfaitJour === "Forfait Jour" && <span className="badge bg-tertiary/10 text-tertiary border-tertiary/20 text-xs">Forfait Jour</span>}
              {!user.actif && <span className="badge bg-red-100 text-red-700 border-red-200 text-xs">Inactif</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canImpersonate && (
              <button
                title="Prendre la main (ouvre un nouvel onglet)"
                onClick={async e => {
                  e.stopPropagation();
                  setImpersonating(true);
                  try { await impersonateUser(user.uid); }
                  catch (err: unknown) { toast.error((err as Error).message || "Erreur"); }
                  finally { setImpersonating(false); }
                }}
                disabled={impersonating}
                className="p-1.5 rounded-lg text-secondary-text hover:text-purple-600 hover:bg-purple-50 transition-all"
              >
                {impersonating ? <Spinner size="sm" /> : <MonitorSmartphone size={13} />}
              </button>
            )}
            {canEdit && <button onClick={e => { e.stopPropagation(); setEditMode(!editMode); setExpanded(true); }} className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10"><Pencil size={13} /></button>}
            {canToggle && <button onClick={e => { e.stopPropagation(); toggleUserActif(user.id, user.actif); }} className={cn("p-1.5 rounded-lg transition-all", user.actif ? "text-secondary-text hover:text-error hover:bg-red-50" : "text-secondary-text hover:text-green-600 hover:bg-green-50")}>{user.actif ? <PowerOff size={13} /> : <Power size={13} />}</button>}
            {canEdit && <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); setExpanded(true); }} className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"><Trash2 size={13} /></button>}
            {expanded ? <ChevronUp size={14} className="text-secondary-text" /> : <ChevronDown size={14} className="text-secondary-text" />}
          </div>
        </div>
      </div>

      {/* Confirmation suppression */}
      {expanded && confirmDelete && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 mb-1">Supprimer ce compte ?</p>
          <p className="text-xs text-red-600 mb-3">Cette action est irréversible. Toutes les données de l&apos;utilisateur seront supprimées.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 text-sm py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-100 transition-colors">Annuler</button>
            <button onClick={handleDelete} disabled={deleting} className="flex-1 text-sm py-2 rounded-lg bg-error text-white hover:bg-red-700 font-semibold transition-colors flex items-center justify-center gap-2">
              {deleting ? <Spinner size="sm" /> : <Trash2 size={13} />} Supprimer
            </button>
          </div>
        </div>
      )}

      {expanded && !editMode && !confirmDelete && (
        <div className="border-t border-alternate px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {user.phoneNumber && <div><p className="text-secondary-text">Téléphone{user.phoneType ? ` (${user.phoneType})` : ""}</p><a href={`tel:${user.phoneNumber}`} className="font-medium text-primary">{user.phoneNumber}</a></div>}
          {user.lastLogin && <div><p className="text-secondary-text">Dernière connexion</p><p className="font-medium">{formatDateRelative(user.lastLogin)}</p></div>}
          {user.createdTime && <div><p className="text-secondary-text">Compte créé le</p><p className="font-medium">{formatDate(user.createdTime)}</p></div>}
        </div>
      )}
      {expanded && editMode && !confirmDelete && (
        <div className="border-t border-alternate px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-secondary-text">Prénom</label><input className="input-base mt-1" value={editPrenom} onChange={e => setEditPrenom(e.target.value)} /></div>
            <div><label className="text-xs font-medium text-secondary-text">Nom</label><input className="input-base mt-1" value={editNom} onChange={e => setEditNom(e.target.value)} /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary-text">Téléphone</label>
            <input className="input-base mt-1" type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            <div className="flex gap-2 mt-1.5">
              {(["Pro", "Perso"] as const).map(t => (
                <button key={t} type="button" onClick={() => setEditPhoneType(t)} className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all", editPhoneType === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary-text">Type d&apos;email</label>
            <div className="flex gap-2 mt-1.5">
              {(["Pro", "Perso"] as const).map(t => (
                <button key={t} type="button" onClick={() => setEditEmailType(t)} className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all", editEmailType === t ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-secondary-text">Rôle</label><select className="input-base mt-1" value={editRole} onChange={e => setEditRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className="text-xs font-medium text-secondary-text">Type</label><select className="input-base mt-1" value={editType} onChange={e => setEditType(e.target.value)}><option value="">—</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-secondary-text">Service</label><select className="input-base mt-1" value={editService} onChange={e => setEditService(e.target.value)}><option value="">—</option>{LISTE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div>
            <label className="text-xs font-medium text-secondary-text mb-1.5 block">Forfait Jour</label>
            <div className="flex gap-2">
              {FORFAIT_OPTIONS.map(o => <button key={o} type="button" onClick={() => setEditForfait(o)} className={cn("flex-1 py-2 rounded-lg text-xs font-semibold border transition-all", editForfait === o ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{o}</button>)}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 flex-1">{saving ? <Spinner size="sm" /> : <Check size={14} />}Sauvegarder</button>
            <button onClick={() => setEditMode(false)} className="btn-outline px-4"><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Gestion du quota (SuperAdmin uniquement)
// ============================================
function QuotaPanel({ totalUsers }: { totalUsers: number }) {
  const [quotaMax, setQuotaMaxState] = useState<number | null>(null);
  const [editQuota, setEditQuota] = useState("");
  const [editingQuota, setEditingQuota] = useState(false);
  const [savingQuota, setSavingQuota] = useState(false);

  useEffect(() => {
    return subscribeQuotaConfig(cfg => {
      setQuotaMaxState(cfg.quotaMax);
      setEditQuota(String(cfg.quotaMax));
    });
  }, []);

  const restant = quotaMax !== null ? quotaMax - totalUsers : null;
  const quotaAtteint = restant !== null && restant <= 0;
  const quotaWarning = restant !== null && restant > 0 && restant <= 5;

  const handleSaveQuota = async () => {
    const val = parseInt(editQuota, 10);
    if (isNaN(val) || val < 1) { toast.error("Quota invalide"); return; }
    setSavingQuota(true);
    try {
      await setQuotaMax(val);
      setEditingQuota(false);
      toast.success("Quota mis à jour");
    } catch { toast.error("Erreur lors de la sauvegarde"); }
    finally { setSavingQuota(false); }
  };

  return (
    <div className={cn("card p-4 mb-4 border", quotaAtteint ? "border-red-300 bg-red-50" : quotaWarning ? "border-yellow-300 bg-yellow-50" : "border-primary/20 bg-primary/5")}>
      <div className="flex items-center gap-2 mb-2">
        <Shield size={15} className={quotaAtteint ? "text-error" : quotaWarning ? "text-yellow-700" : "text-primary"} />
        <p className="text-xs font-bold text-primary-text uppercase tracking-wide">Quota de comptes</p>
      </div>
      {quotaMax !== null && (
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-secondary-text">{totalUsers} / {quotaMax} comptes</span>
              <span className={cn("font-semibold", quotaAtteint ? "text-error" : quotaWarning ? "text-yellow-700" : "text-primary")}>
                {restant} restant{restant !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="h-2 bg-alternate rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", quotaAtteint ? "bg-error" : quotaWarning ? "bg-yellow-500" : "bg-primary")}
                style={{ width: `${Math.min(100, (totalUsers / quotaMax) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {(quotaAtteint || quotaWarning) && (
        <div className="flex items-center gap-2 text-xs mb-3">
          <AlertTriangle size={13} className={quotaAtteint ? "text-error" : "text-yellow-700"} />
          <span className={quotaAtteint ? "text-error font-semibold" : "text-yellow-700"}>
            {quotaAtteint ? "Quota atteint — création de compte bloquée." : `Attention : seulement ${restant} compte${restant !== 1 ? "s" : ""} restant${restant !== 1 ? "s" : ""}.`}
          </span>
        </div>
      )}
      {!editingQuota ? (
        <button onClick={() => setEditingQuota(true)} className="btn-outline text-xs flex items-center gap-1.5">
          <Pencil size={12} /> Modifier le quota maximum
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="number" min={1} className="input-base flex-1 text-sm" value={editQuota}
            onChange={e => setEditQuota(e.target.value)} placeholder="Nombre max de comptes"
          />
          <button onClick={handleSaveQuota} disabled={savingQuota} className="btn-primary flex items-center gap-1.5 px-3">
            {savingQuota ? <Spinner size="sm" /> : <Check size={14} />}
          </button>
          <button onClick={() => setEditingQuota(false)} className="btn-outline px-3"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function UtilisateursPage() {
  const { userApp } = useAuthStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreRole, setFiltreRole] = useState<string | null>(null);
  const [filtreActif, setFiltreActif] = useState<boolean | null>(null);
  const [filtreService, setFiltreService] = useState<string | null>(null);
  const [filtreType, setFiltreType] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeAllUsers(u => { setUsers(u); setLoading(false); });
  }, []);

  const filtered = users.filter(u => {
    if (u.id !== userApp?.id && u.roleapp === "Admin") return false;
    if (filtreRole && u.roleapp !== filtreRole) return false;
    if (filtreActif !== null && u.actif !== filtreActif) return false;
    if (filtreService && u.service !== filtreService) return false;
    if (filtreType && u.type !== filtreType) return false;
    if (search.trim()) { const q = search.toLowerCase(); return u.displayName?.toLowerCase().includes(q) || u.nom?.toLowerCase().includes(q) || u.prenom?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q); }
    return true;
  });

  if (!isAdmin(userApp)) return <AppShell><div className="p-8 text-center text-secondary-text">Accès réservé aux administrateurs.</div></AppShell>;
  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-4xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div><h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Utilisateurs</h1><p className="text-sm text-secondary-text mt-0.5">{users.length} comptes · {users.filter(u => u.actif).length} actifs</p></div>
          {isAdmin(userApp) && <button onClick={() => router.push("/utilisateurs/creer")} className="btn-primary flex items-center gap-2"><Plus size={16} /><span className="hidden sm:inline">Créer un compte</span></button>}
        </div>

        {/* Quota panel — Admin uniquement (pas SuperAdmin) */}
        {userApp?.roleapp === "Admin" && <QuotaPanel totalUsers={users.length} />}

        <div className="card p-4 mb-4 space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un utilisateur…" />
          <div className="flex flex-wrap gap-1.5">
            {[null, "Utilisateur", "SuperAdmin"].map(r => <button key={String(r)} onClick={() => setFiltreRole(r)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", filtreRole === r ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{r ?? "Tous les rôles"}</button>)}
            <div className="w-px bg-alternate mx-1" />
            {[null, true, false].map(v => <button key={String(v)} onClick={() => setFiltreActif(v)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", filtreActif === v ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{v === null ? "Tous" : v ? "Actifs" : "Inactifs"}</button>)}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <select className="input-base text-xs" value={filtreService ?? ""} onChange={e => setFiltreService(e.target.value || null)}>
                <option value="">Tous les services</option>
                {LISTE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <select className="input-base text-xs" value={filtreType ?? ""} onChange={e => setFiltreType(e.target.value || null)}>
                <option value="">Tous les types</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        {filtered.length === 0 ? <EmptyState icon={<Users size={28} />} title="Aucun utilisateur" /> : (
          <div className="space-y-2">{filtered.map(u => (
            <UserCard
              key={u.id}
              user={u}
              canEdit={isAdmin(userApp)}
              canToggle={isAdmin(userApp)}
              canImpersonate={isAdmin(userApp) && u.roleapp !== "Admin" && u.id !== userApp?.id}
              onDelete={() => {}}
            />
          ))}</div>
        )}
      </div>
    </AppShell>
  );
}
