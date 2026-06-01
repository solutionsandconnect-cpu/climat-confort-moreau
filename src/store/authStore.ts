// src/store/authStore.ts
// Gestion de l'état global d'authentification

import { create } from "zustand";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserApp } from "@/lib/firestore";
import { subscribePermissionsConfig, initPermissionsConfig, DEFAULT_PERMISSIONS_CONFIG } from "@/lib/permissionsService";
import type { PermissionsConfig } from "@/lib/permissionsService";
import type { UserApp } from "@/types";

interface AuthState {
  // État
  firebaseUser: User | null;
  userApp: UserApp | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isImpersonating: boolean;
  permissionsConfig: PermissionsConfig | null;

  // App state (équivalent FFAppState)
  pageActuelle: string;
  notificationsNonLues: number;
  messagesNonLus: number;
  journalInterneNonLu: number;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setPageActuelle: (page: string) => void;
  setNotificationsNonLues: (count: number) => void;
  setMessagesNonLus: (count: number) => void;
  setJournalInterneNonLu: (count: number) => void;
  initAuth: () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  userApp: null,
  loading: false,
  initialized: false,
  error: null,
  isImpersonating: false,
  permissionsConfig: null,

  pageActuelle: "Accueil",
  notificationsNonLues: 0,
  messagesNonLus: 0,
  journalInterneNonLu: 0,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const msg = getFirebaseErrorMessage(err);
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
    try {
      const userApp = await getUserApp(cred.user.uid);
      if (userApp && userApp.actif === false) {
        await signOut(auth);
        const msg = "Ce compte est désactivé. Contactez votre administrateur.";
        set({ error: msg, loading: false });
        throw new Error(msg);
      }
      set({ firebaseUser: cred.user, userApp, loading: false });
    } catch (err: unknown) {
      set({ loading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ loading: true });
    await signOut(auth);
    set({
      firebaseUser: null,
      userApp: null,
      loading: false,
      isImpersonating: false,
      pageActuelle: "Accueil",
      notificationsNonLues: 0,
      messagesNonLus: 0,
    });
  },

  resetPassword: async (email: string) => {
    set({ loading: true, error: null });
    try {
      await sendPasswordResetEmail(auth, email);
      set({ loading: false });
    } catch (err: unknown) {
      const msg = getFirebaseErrorMessage(err);
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  setPageActuelle: (page) => set({ pageActuelle: page }),
  setNotificationsNonLues: (count) => set({ notificationsNonLues: count }),
  setMessagesNonLus: (count) => set({ messagesNonLus: count }),
  setJournalInterneNonLu: (count) => set({ journalInterneNonLu: count }),
  clearError: () => set({ error: null }),

  initAuth: () => {
    let unsubPerms: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userApp = await getUserApp(user.uid);
        set({ firebaseUser: user, userApp, initialized: true });

        // Initialise le doc Firestore si absent, puis s'abonne en temps réel
        initPermissionsConfig().catch(() => {});
        unsubPerms?.();
        unsubPerms = subscribePermissionsConfig(config => set({ permissionsConfig: config }));
      } else {
        unsubPerms?.();
        unsubPerms = undefined;
        set({ firebaseUser: null, userApp: null, initialized: true, permissionsConfig: null });
      }
    });

    return () => { unsubAuth(); unsubPerms?.(); };
  },
}));

// ============================================
// Traduction des erreurs Firebase en français
// ============================================

function getFirebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/user-not-found":      return "Aucun compte trouvé avec cet email.";
    case "auth/wrong-password":      return "Mot de passe incorrect.";
    case "auth/invalid-email":       return "Adresse email invalide.";
    case "auth/too-many-requests":   return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/network-request-failed": return "Erreur réseau. Vérifiez votre connexion.";
    case "auth/invalid-credential":  return "Email ou mot de passe incorrect.";
    default:                         return "Une erreur est survenue. Veuillez réessayer.";
  }
}

// ============================================
// Helpers de rôle (inchangés)
// ============================================

export const isAdmin = (userApp: UserApp | null) =>
  userApp?.roleapp === "Admin" || userApp?.roleapp === "SuperAdmin";

export const isSuperAdmin = (userApp: UserApp | null) =>
  userApp?.roleapp === "SuperAdmin";

// ============================================
// Helpers de permission — lisent la config dynamique depuis le store
// Les Admins/SuperAdmins ont toujours accès à tout.
// ============================================

// Résolution des permissions : exception utilisateur > type > défaut false
function resolvePerms(userApp: UserApp | null) {
  if (!userApp) return null;
  const config = useAuthStore.getState().permissionsConfig ?? DEFAULT_PERMISSIONS_CONFIG;
  const typePerms = userApp.type ? (config.types[userApp.type] ?? null) : null;
  const overrides = config.userOverrides?.[userApp.id] ?? {};
  return {
    canViewDashboard:   overrides.canViewDashboard   ?? typePerms?.canViewDashboard   ?? false,
    canCreateForOthers: overrides.canCreateForOthers ?? typePerms?.canCreateForOthers ?? false,
    canPublishJournal:  overrides.canPublishJournal  ?? typePerms?.canPublishJournal  ?? false,
    canSeeAll:          overrides.canSeeAll          ?? typePerms?.canSeeAll          ?? false,
    isSalarie:          overrides.isSalarie          ?? typePerms?.isSalarie          ?? false,
  };
}

export const canPublishJournal = (userApp: UserApp | null): boolean =>
  isAdmin(userApp) || (resolvePerms(userApp)?.canPublishJournal ?? false);

export const canViewDashboard = (userApp: UserApp | null): boolean =>
  isAdmin(userApp) || (resolvePerms(userApp)?.canViewDashboard ?? false);

export const canCreateForOthers = (userApp: UserApp | null): boolean =>
  isAdmin(userApp) || (resolvePerms(userApp)?.canCreateForOthers ?? false);

export const canSeeAll = (userApp: UserApp | null): boolean =>
  isAdmin(userApp) || (resolvePerms(userApp)?.canSeeAll ?? false);

export const isSalarie = (userApp: UserApp | null): boolean =>
  resolvePerms(userApp)?.isSalarie ?? false;
