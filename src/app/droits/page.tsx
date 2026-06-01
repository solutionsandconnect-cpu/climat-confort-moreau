"use client";

import { useEffect, useState, useCallback } from "react";
import { getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import {
  subscribePermissionsConfig,
  updateTypePermission,
  setUserPermissionOverride,
  removeUserPermissionOverride,
  removeAllUserOverrides,
  TOUS_LES_TYPES,
  PERMISSIONS_LABELS,
} from "@/lib/permissionsService";
import type { PermissionsConfig, PermissionKey, UserOverrides } from "@/lib/permissionsService";
import type { UserApp } from "@/types";
import { LoadingPage, Spinner, SearchInput } from "@/components/ui";
import { ShieldCheck, Info, Plus, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import toast from "react-hot-toast";

const PERMISSION_KEYS: PermissionKey[] = [
  "canViewDashboard",
  "canCreateForOthers",
  "canPublishJournal",
  "canSeeAll",
  "isSalarie",
];

// ── Composant toggle simple ──────────────────────────────────────────────────

function Toggle({ checked, onChange, loading }: { checked: boolean; onChange: () => void; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center w-10 h-6"><Spinner size="sm" /></div>;
  return (
    <button
      onClick={onChange}
      className={cn("relative inline-flex w-10 h-6 rounded-full transition-colors duration-200", checked ? "bg-primary" : "bg-gray-200")}
    >
      <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

// ── Carte exception utilisateur ──────────────────────────────────────────────

function UserOverrideCard({
  user, config, onRemoveAll,
}: {
  user: UserApp;
  config: PermissionsConfig;
  onRemoveAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState<PermissionKey | null>(null);
  const [removing, setRemoving] = useState(false);

  const overrides = config.userOverrides[user.id] ?? {};
  const typePerms = user.type ? config.types[user.type] : null;
  const nbOverrides = Object.keys(overrides).length;

  const handleToggleOverride = async (perm: PermissionKey) => {
    setUpdating(perm);
    try {
      if (perm in overrides) {
        // L'override existe : on le bascule
        await setUserPermissionOverride(user.id, perm, !overrides[perm]);
      } else {
        // Pas d'override : on crée l'inverse du type pour que ce soit utile
        const typeVal = typePerms?.[perm] ?? false;
        await setUserPermissionOverride(user.id, perm, !typeVal);
      }
    } catch { toast.error("Erreur lors de la mise à jour"); }
    finally { setUpdating(null); }
  };

  const handleRemoveOverride = async (perm: PermissionKey, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdating(perm);
    try { await removeUserPermissionOverride(user.id, perm); }
    catch { toast.error("Erreur lors de la suppression"); }
    finally { setUpdating(null); }
  };

  const handleRemoveAll = async () => {
    setRemoving(true);
    try { await removeAllUserOverrides(user.id); onRemoveAll(); }
    catch { toast.error("Erreur lors de la suppression"); }
    finally { setRemoving(false); }
  };

  return (
    <div className="card overflow-hidden">
      {/* En-tête */}
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-primary-bg/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          {user.photoUrl
            ? <img src={user.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
            : <span className="text-white text-xs font-bold">{getInitials(user.nom, user.prenom)}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-primary-text text-sm">{user.displayName || `${user.prenom} ${user.nom}`}</p>
          <p className="text-xs text-secondary-text">
            {user.type ?? "Aucun type"} · <span className="text-primary font-medium">{nbOverrides} exception{nbOverrides > 1 ? "s" : ""}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); handleRemoveAll(); }}
            disabled={removing}
            className="p-1.5 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
            title="Supprimer toutes les exceptions"
          >
            {removing ? <Spinner size="sm" /> : <Trash2 size={14} />}
          </button>
          {expanded ? <ChevronUp size={14} className="text-secondary-text" /> : <ChevronDown size={14} className="text-secondary-text" />}
        </div>
      </div>

      {/* Détail des permissions */}
      {expanded && (
        <div className="border-t border-alternate px-4 py-3 space-y-2.5">
          <p className="text-xs text-secondary-text mb-3">
            Les permissions marquées <span className="font-semibold text-primary">En exception</span> remplacent celles du type.
            Cliquez sur <X size={10} className="inline" /> pour revenir au droit du type.
          </p>
          {PERMISSION_KEYS.map(perm => {
            const hasOverride = perm in overrides;
            const effectiveVal = hasOverride ? (overrides[perm] ?? false) : (typePerms?.[perm] ?? false);
            const isUpdating = updating === perm;

            return (
              <div key={perm} className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl border transition-colors",
                hasOverride ? "border-primary/30 bg-primary/5" : "border-alternate bg-transparent"
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary-text">{PERMISSIONS_LABELS[perm].label}</p>
                    {hasOverride && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">Exception</span>
                    )}
                  </div>
                  {!hasOverride && (
                    <p className="text-xs text-secondary-text mt-0.5">Hérité du type ({effectiveVal ? "activé" : "désactivé"})</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Toggle checked={effectiveVal} onChange={() => handleToggleOverride(perm)} loading={isUpdating} />
                  {hasOverride && (
                    <button
                      onClick={e => handleRemoveOverride(perm, e)}
                      className="p-1 rounded-lg text-secondary-text hover:text-error hover:bg-red-50 transition-all"
                      title="Retirer l'exception (revient au type)"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Modal ajout utilisateur ──────────────────────────────────────────────────

function AddUserOverrideModal({
  users, existingIds, onAdd, onClose,
}: {
  users: UserApp[];
  existingIds: Set<string>;
  onAdd: (user: UserApp) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const available = users.filter(u =>
    !existingIds.has(u.id) &&
    (u.roleapp !== "Admin" && u.roleapp !== "SuperAdmin") &&
    (search.trim() === "" || `${u.displayName} ${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-alternate">
          <p className="font-bold text-primary-text">Choisir un utilisateur</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-bg"><X size={16} /></button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher…" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {available.length === 0 && (
            <p className="text-sm text-secondary-text text-center py-6">
              {search ? "Aucun résultat" : "Tous les utilisateurs ont déjà une exception"}
            </p>
          )}
          {available.map(u => (
            <button
              key={u.id}
              onClick={() => onAdd(u)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary-bg/60 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                {u.photoUrl
                  ? <img src={u.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  : <span className="text-white text-xs font-bold">{getInitials(u.nom, u.prenom)}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-primary-text text-sm">{u.displayName || `${u.prenom} ${u.nom}`}</p>
                <p className="text-xs text-secondary-text">{u.type ?? "Aucun type"}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function DroitsPage() {
  const { userApp } = useAuthStore();
  const [config, setConfig] = useState<PermissionsConfig | null>(null);
  const [allUsers, setAllUsers] = useState<UserApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDocs(collection(db, "usersapp")).then(snap => {
      setAllUsers(snap.docs.map(d => ({
        id: d.id,
        uid: d.data().uid as string,
        email: d.data().email as string,
        displayName: (d.data().display_name ?? `${d.data().prenom ?? ""} ${d.data().nom ?? ""}`.trim()) as string,
        nom: d.data().nom as string,
        prenom: d.data().prenom as string,
        photoUrl: d.data().photo_url as string | undefined,
        actif: d.data().actif as boolean,
        type: d.data().type as string | undefined,
        roleapp: d.data().roleapp as string | undefined,
        service: d.data().service_appartenance as string | undefined,
      } as UserApp)));
    });
    return subscribePermissionsConfig(c => { setConfig(c); setLoading(false); });
  }, []);

  const handleTypeToggle = useCallback(async (type: string, perm: PermissionKey, current: boolean) => {
    const key = `${type}:${perm}`;
    setUpdating(key);
    try { await updateTypePermission(type, perm, !current); }
    catch { toast.error("Erreur lors de la mise à jour"); }
    finally { setUpdating(null); }
  }, []);

  const handleAddUser = useCallback((user: UserApp) => {
    setShowAddModal(false);
    setPendingUserIds(s => new Set(s).add(user.id));
  }, []);

  // Retire de pendingUserIds dès que Firestore a enregistré un vrai override
  useEffect(() => {
    if (!config) return;
    setPendingUserIds(s => {
      const next = new Set(s);
      for (const id of s) {
        if (id in config.userOverrides) next.delete(id);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.userOverrides]);

  if (!isAdmin(userApp)) {
    return <AppShell><div className="p-8 text-center text-secondary-text">Accès réservé aux administrateurs.</div></AppShell>;
  }
  if (loading || !config) return <AppShell><LoadingPage /></AppShell>;

  // Utilisateurs qui ont au moins une exception, + ceux qu'on vient d'ajouter
  const overrideUserIds = new Set([
    ...Object.keys(config.userOverrides),
    ...pendingUserIds,
  ]);
  const overrideUsers = allUsers.filter(u => overrideUserIds.has(u.id));

  return (
    <AppShell>
      <div className="px-4 lg:px-6 py-5 animate-page-enter">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>
              Droits d&apos;accès
            </h1>
          </div>
          <p className="text-sm text-secondary-text">
            Les <span className="font-semibold">Admins et SuperAdmins</span> ont toujours accès à tout.
            Les exceptions par utilisateur prennent le dessus sur le type.
          </p>
        </div>

        {/* ── SECTION 1 : Par type ── */}
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-base font-bold text-primary-text">Par type d&apos;utilisateur</h2>
        </div>

        {/* Légende */}
        <div className="card p-4 mb-3 space-y-1.5">
          {PERMISSION_KEYS.map(k => (
            <div key={k} className="flex items-start gap-2">
              <span className="text-xs font-semibold text-primary-text w-40 shrink-0">{PERMISSIONS_LABELS[k].label}</span>
              <span className="text-xs text-secondary-text">{PERMISSIONS_LABELS[k].description}</span>
            </div>
          ))}
        </div>

        {/* Tableau desktop */}
        <div className="hidden lg:block card overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-alternate bg-secondary-bg/50">
                <th className="text-left px-4 py-3 font-semibold text-primary-text">Type</th>
                {PERMISSION_KEYS.map(k => (
                  <th key={k} className="text-center px-3 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-primary-text text-xs leading-tight">{PERMISSIONS_LABELS[k].label}</span>
                      <button onMouseEnter={() => setTooltip(k)} onMouseLeave={() => setTooltip(null)} className="relative">
                        <Info size={12} className="text-secondary-text hover:text-primary transition-colors" />
                        {tooltip === k && (
                          <div className="absolute z-10 left-1/2 -translate-x-1/2 top-5 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg text-left whitespace-normal">
                            {PERMISSIONS_LABELS[k].description}
                          </div>
                        )}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TOUS_LES_TYPES.map((type, i) => {
                const perms = config.types[type];
                return (
                  <tr key={type} className={cn("border-b border-alternate/50 hover:bg-primary-bg/40 transition-colors", i % 2 === 0 ? "bg-white" : "bg-secondary-bg/20")}>
                    <td className="px-4 py-3 font-medium text-primary-text">{type}</td>
                    {PERMISSION_KEYS.map(perm => {
                      const val = perms?.[perm] ?? false;
                      const key = `${type}:${perm}`;
                      return (
                        <td key={perm} className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <Toggle checked={val} onChange={() => handleTypeToggle(type, perm, val)} loading={updating === key} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cartes mobile — par type */}
        <div className="lg:hidden space-y-3 mb-8">
          {TOUS_LES_TYPES.map(type => {
            const perms = config.types[type];
            return (
              <div key={type} className="card overflow-hidden">
                <div className="px-4 py-3 bg-secondary-bg/30 border-b border-alternate">
                  <p className="font-semibold text-primary-text text-sm">{type}</p>
                </div>
                <div className="px-4 py-3 space-y-3">
                  {PERMISSION_KEYS.map(perm => {
                    const val = perms?.[perm] ?? false;
                    const key = `${type}:${perm}`;
                    return (
                      <div key={perm} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary-text">{PERMISSIONS_LABELS[perm].label}</p>
                          <p className="text-xs text-secondary-text mt-0.5">{PERMISSIONS_LABELS[perm].description}</p>
                        </div>
                        <Toggle checked={val} onChange={() => handleTypeToggle(type, perm, val)} loading={updating === key} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── SECTION 2 : Exceptions par utilisateur ── */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-primary-text">Exceptions par utilisateur</h2>
            <p className="text-xs text-secondary-text mt-0.5">
              Droits individuels qui remplacent ceux du type.
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {overrideUsers.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-secondary-text">Aucune exception définie.</p>
            <p className="text-xs text-secondary-text mt-1">Tous les utilisateurs suivent les droits de leur type.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overrideUsers.map(u => (
              <UserOverrideCard
                key={u.id}
                user={u}
                config={config}
                onRemoveAll={() => setPendingUserIds(s => { const n = new Set(s); n.delete(u.id); return n; })}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddUserOverrideModal
          users={allUsers}
          existingIds={overrideUserIds}
          onAdd={handleAddUser}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </AppShell>
  );
}
