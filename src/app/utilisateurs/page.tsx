"use client";
// src/app/utilisateurs/page.tsx — photo + forfait jour + ajout compte

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateDoc, doc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, isSuperAdmin } from "@/store/authStore";
import { subscribeAllUsers, toggleUserActif, updateUser } from "@/lib/modulesService";
import type { UserApp } from "@/types";
import { LISTE_SERVICES } from "@/types";
import { EmptyState, LoadingPage, SearchInput, Spinner } from "@/components/ui";
import { cn, formatDate, formatDateRelative, getInitials } from "@/lib/utils";
import { Users, Pencil, X, Check, Power, PowerOff, Plus, ChevronDown, ChevronUp, Camera } from "lucide-react";
import toast from "react-hot-toast";

const ROLES = ["Utilisateur", "Admin", "SuperAdmin"];
const TYPES = ["Conducteur de Travaux", "Technicien", "Service SAV / Expertises", "Bureau Administratif", "Magasin", "Chiffrage"];
const FORFAIT_OPTIONS = ["Forfait Jour", "Pas de forfait jour"];

function RoleBadge({ role }: { role?: string }) {
  const cfg = role === "SuperAdmin" ? "bg-purple-100 text-purple-800 border-purple-200" : role === "Admin" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-200";
  return <span className={cn("badge border text-xs", cfg)}>{role ?? "Utilisateur"}</span>;
}

function UserCard({ user, canEdit, canToggle }: { user: UserApp; canEdit: boolean; canToggle: boolean; }) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [editNom, setEditNom] = useState(user.nom);
  const [editPrenom, setEditPrenom] = useState(user.prenom);
  const [editPhone, setEditPhone] = useState(user.phoneNumber ?? "");
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
      await updateDoc(doc(db, "usersapp", user.id), { acces_forfait_jour: editForfait });
      setEditMode(false);
      toast.success("Utilisateur mis à jour");
    } catch { toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
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
            <p className="text-xs text-secondary-text truncate">{user.email}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <RoleBadge role={user.roleapp} />
              {user.type && <span className="badge bg-secondary/10 text-secondary-600 border-secondary/20 text-xs">{user.type}</span>}
              {(user as any).acesForfaitJour === "Forfait Jour" && <span className="badge bg-tertiary/10 text-tertiary border-tertiary/20 text-xs">Forfait Jour</span>}
              {!user.actif && <span className="badge bg-red-100 text-red-700 border-red-200 text-xs">Inactif</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && <button onClick={e => { e.stopPropagation(); setEditMode(!editMode); setExpanded(true); }} className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10"><Pencil size={13} /></button>}
            {canToggle && <button onClick={e => { e.stopPropagation(); toggleUserActif(user.id, user.actif); }} className={cn("p-1.5 rounded-lg transition-all", user.actif ? "text-secondary-text hover:text-error hover:bg-red-50" : "text-secondary-text hover:text-green-600 hover:bg-green-50")}>{user.actif ? <PowerOff size={13} /> : <Power size={13} />}</button>}
            {expanded ? <ChevronUp size={14} className="text-secondary-text" /> : <ChevronDown size={14} className="text-secondary-text" />}
          </div>
        </div>
      </div>
      {expanded && !editMode && (
        <div className="border-t border-alternate px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {user.service && <div><p className="text-secondary-text">Service</p><p className="font-medium">{user.service}</p></div>}
          {user.phoneNumber && <div><p className="text-secondary-text">Téléphone</p><a href={`tel:${user.phoneNumber}`} className="font-medium text-primary">{user.phoneNumber}</a></div>}
          {user.lastLogin && <div><p className="text-secondary-text">Dernière connexion</p><p className="font-medium">{formatDateRelative(user.lastLogin)}</p></div>}
        </div>
      )}
      {expanded && editMode && (
        <div className="border-t border-alternate px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-secondary-text">Prénom</label><input className="input-base mt-1" value={editPrenom} onChange={e => setEditPrenom(e.target.value)} /></div>
            <div><label className="text-xs font-medium text-secondary-text">Nom</label><input className="input-base mt-1" value={editNom} onChange={e => setEditNom(e.target.value)} /></div>
          </div>
          <div><label className="text-xs font-medium text-secondary-text">Téléphone</label><input className="input-base mt-1" type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-secondary-text">Rôle</label><select className="input-base mt-1" value={editRole} onChange={e => setEditRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className="text-xs font-medium text-secondary-text">Type</label><select className="input-base mt-1" value={editType} onChange={e => setEditType(e.target.value)}><option value="">—</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-secondary-text">Service</label><select className="input-base mt-1" value={editService} onChange={e => setEditService(e.target.value)}><option value="">—</option>{LISTE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div>
            <label className="text-xs font-medium text-secondary-text mb-1.5 block">Forfait Jour</label>
            <div className="flex gap-2">
              {FORFAIT_OPTIONS.map(o => <button key={o} onClick={() => setEditForfait(o)} className={cn("flex-1 py-2 rounded-lg text-xs font-semibold border transition-all", editForfait === o ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text")}>{o}</button>)}
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

export default function UtilisateursPage() {
  const { userApp } = useAuthStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreRole, setFiltreRole] = useState<string | null>(null);
  const [filtreActif, setFiltreActif] = useState<boolean | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeAllUsers(u => { setUsers(u); setLoading(false); });
  }, []);

  const filtered = users.filter(u => {
    if (filtreRole && u.roleapp !== filtreRole) return false;
    if (filtreActif !== null && u.actif !== filtreActif) return false;
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
        <div className="card p-4 mb-4 space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un utilisateur…" />
          <div className="flex flex-wrap gap-1.5">
            {[null, ...ROLES].map(r => <button key={String(r)} onClick={() => setFiltreRole(r)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", filtreRole === r ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{r ?? "Tous"}</button>)}
            <div className="w-px bg-alternate mx-1" />
            {[null, true, false].map(v => <button key={String(v)} onClick={() => setFiltreActif(v)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", filtreActif === v ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{v === null ? "Tous" : v ? "Actifs" : "Inactifs"}</button>)}
          </div>
        </div>
        {filtered.length === 0 ? <EmptyState icon={<Users size={28} />} title="Aucun utilisateur" /> : (
          <div className="space-y-2">{filtered.map(u => <UserCard key={u.id} user={u} canEdit={isAdmin(userApp)} canToggle={isAdmin(userApp)} />)}</div>
        )}
      </div>
    </AppShell>
  );
}
