// src/store/authStore.ts
// Gestion de l'état global d'authentification
// Équivalent de FFAppState + auth_util.dart de Flutter

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
import type { UserApp } from "@/types";

interface AuthState {
  // État
  firebaseUser: User | null;
  userApp: UserApp | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

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

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  userApp: null,
  loading: false,
  initialized: false,
  error: null,

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userApp = await getUserApp(user.uid);
        set({ firebaseUser: user, userApp, initialized: true });
      } else {
        set({ firebaseUser: null, userApp: null, initialized: true });
      }
    });
    return unsubscribe;
  },
}));

// ============================================
// Traduction des erreurs Firebase en français
// ============================================

function getFirebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/user-not-found":
      return "Aucun compte trouvé avec cet email.";
    case "auth/wrong-password":
      return "Mot de passe incorrect.";
    case "auth/invalid-email":
      return "Adresse email invalide.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/network-request-failed":
      return "Erreur réseau. Vérifiez votre connexion.";
    case "auth/invalid-credential":
      return "Email ou mot de passe incorrect.";
    default:
      return "Une erreur est survenue. Veuillez réessayer.";
  }
}

// Helpers pour vérifier le rôle (équivalent de roleapp checks dans Flutter)
export const isAdmin = (userApp: UserApp | null) =>
  userApp?.roleapp === "Admin" || userApp?.roleapp === "SuperAdmin";

export const isSuperAdmin = (userApp: UserApp | null) =>
  userApp?.roleapp === "SuperAdmin";

// Peut publier dans le journal + voir qui a lu
// = Conducteur de Travaux, Service SAV/Expertises, Bureau Administratif, Admin, SuperAdmin
export const canPublishJournal = (userApp: UserApp | null) =>
  isAdmin(userApp) ||
  userApp?.type === "Conducteur de Travaux" ||
  userApp?.type === "Service SAV / Expertises" ||
  userApp?.type === "Bureau Administratif";

// Peut voir TOUS les documents du journal (Admin voit tout, les autres voient uniquement ceux qui leur sont destinés)
export const isJournalAdmin = (userApp: UserApp | null) =>
  isAdmin(userApp);

// Peut voir le tableau de bord (Admin, SuperAdmin, Conducteur de Travaux)
export const canViewDashboard = (userApp: UserApp | null) =>
  isAdmin(userApp) || userApp?.type === "Conducteur de Travaux";
