// src/lib/permissionsService.ts
// Gestion dynamique des droits — par type ET par utilisateur — stockés dans app_config/permissions

import { doc, getDoc, onSnapshot, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type PermissionKey =
  | "canViewDashboard"
  | "canCreateForOthers"
  | "canPublishJournal"
  | "canSeeAll"
  | "isSalarie";

export interface TypePermissions {
  canViewDashboard: boolean;
  canCreateForOthers: boolean;
  canPublishJournal: boolean;
  canSeeAll: boolean;
  isSalarie: boolean;
}

// Les overrides utilisateur sont partiels : seules les permissions explicitement
// surchargées sont présentes. Les autres suivent le type.
export type UserOverrides = Partial<TypePermissions>;

export interface PermissionsConfig {
  types: Record<string, TypePermissions>;
  userOverrides: Record<string, UserOverrides>; // userId → overrides
}

export const TOUS_LES_TYPES = [
  "Chef de chantier Plomberie",
  "Chef de chantier Electricité",
  "Technicien SAV",
  "Compagnon Plomberie",
  "Compagnon Electricité",
  "Conducteur de Travaux",
  "Service SAV / Expertises",
  "Bureau Etude",
  "Bureau Administratif",
] as const;

export type UserType = typeof TOUS_LES_TYPES[number];

export const PERMISSIONS_LABELS: Record<PermissionKey, { label: string; description: string }> = {
  canViewDashboard:   { label: "Tableau de bord",        description: "Accès à la page tableau de bord et statistiques chantiers" },
  canCreateForOthers: { label: "Fiches heures (autrui)", description: "Créer et modifier des feuilles d'heures pour d'autres salariés" },
  canPublishJournal:  { label: "Journal interne",         description: "Publier des entrées dans le journal interne" },
  canSeeAll:          { label: "Voir tous les plannings", description: "Voir l'ensemble des interventions, pas uniquement les siennes" },
  isSalarie:          { label: "Mode salarié",            description: "Accès restreint : ne voit que ses propres données, pas de gestion" },
};

const DEFAULT_TYPE_PERMISSIONS: Record<UserType, TypePermissions> = {
  "Chef de chantier Plomberie":   { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: true  },
  "Chef de chantier Electricité": { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: true  },
  "Technicien SAV":               { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: true  },
  "Compagnon Plomberie":          { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: true  },
  "Compagnon Electricité":        { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: true  },
  "Conducteur de Travaux":        { canViewDashboard: true,  canCreateForOthers: true,  canPublishJournal: true,  canSeeAll: true,  isSalarie: false },
  "Service SAV / Expertises":     { canViewDashboard: true,  canCreateForOthers: true,  canPublishJournal: true,  canSeeAll: true,  isSalarie: false },
  "Bureau Etude":                 { canViewDashboard: false, canCreateForOthers: false, canPublishJournal: false, canSeeAll: false, isSalarie: false },
  "Bureau Administratif":         { canViewDashboard: true,  canCreateForOthers: true,  canPublishJournal: true,  canSeeAll: true,  isSalarie: false },
};

export const DEFAULT_PERMISSIONS_CONFIG: PermissionsConfig = {
  types: DEFAULT_TYPE_PERMISSIONS as Record<string, TypePermissions>,
  userOverrides: {},
};

const PERMISSIONS_DOC = () => doc(db, "app_config", "permissions");

export async function initPermissionsConfig(): Promise<void> {
  const snap = await getDoc(PERMISSIONS_DOC());
  if (!snap.exists()) {
    await setDoc(PERMISSIONS_DOC(), { types: DEFAULT_TYPE_PERMISSIONS, userOverrides: {} });
    return;
  }
  const existing = (snap.data().types ?? {}) as Record<string, TypePermissions>;
  const updates: Record<string, unknown> = {};
  for (const type of TOUS_LES_TYPES) {
    if (!existing[type]) updates[`types.${type}`] = DEFAULT_TYPE_PERMISSIONS[type];
  }
  if (Object.keys(updates).length > 0) await updateDoc(PERMISSIONS_DOC(), updates);
}

export function subscribePermissionsConfig(callback: (config: PermissionsConfig) => void): () => void {
  return onSnapshot(PERMISSIONS_DOC(), snap => {
    if (!snap.exists()) { callback(DEFAULT_PERMISSIONS_CONFIG); return; }
    const data = snap.data();
    const rawTypes = (data.types ?? {}) as Record<string, Partial<TypePermissions>>;
    const types: Record<string, TypePermissions> = {};
    for (const type of TOUS_LES_TYPES) {
      types[type] = { ...DEFAULT_TYPE_PERMISSIONS[type], ...(rawTypes[type] ?? {}) };
    }
    const userOverrides = (data.userOverrides ?? {}) as Record<string, UserOverrides>;
    callback({ types, userOverrides });
  });
}

// ── Droits par type ──────────────────────────────────────────────────────────

export async function updateTypePermission(type: string, permission: PermissionKey, value: boolean): Promise<void> {
  await updateDoc(PERMISSIONS_DOC(), { [`types.${type}.${permission}`]: value });
}

// ── Exceptions par utilisateur ───────────────────────────────────────────────

/** Définit une exception pour une permission précise d'un utilisateur. */
export async function setUserPermissionOverride(
  userId: string,
  permission: PermissionKey,
  value: boolean
): Promise<void> {
  await updateDoc(PERMISSIONS_DOC(), { [`userOverrides.${userId}.${permission}`]: value });
}

/** Supprime l'exception d'une permission précise (revient au droit du type). */
export async function removeUserPermissionOverride(
  userId: string,
  permission: PermissionKey
): Promise<void> {
  await updateDoc(PERMISSIONS_DOC(), { [`userOverrides.${userId}.${permission}`]: deleteField() });
}

/** Supprime toutes les exceptions d'un utilisateur. */
export async function removeAllUserOverrides(userId: string): Promise<void> {
  await updateDoc(PERMISSIONS_DOC(), { [`userOverrides.${userId}`]: deleteField() });
}
