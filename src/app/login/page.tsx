"use client";

// src/app/login/page.tsx
// Équivalent de connexion_widget.dart

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Eye, EyeOff, Mail, Lock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { login, resetPassword, loading, error, firebaseUser, initialized, clearError } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Si déjà connecté, rediriger
  useEffect(() => {
    if (initialized && firebaseUser) {
      router.replace("/dashboard");
    }
  }, [firebaseUser, initialized, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      router.replace("/accueil");
    } catch {
      // L'erreur est gérée dans le store
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await resetPassword(resetEmail);
      toast.success("Email de réinitialisation envoyé !");
      setShowReset(false);
    } catch {
      toast.error("Impossible d'envoyer l'email.");
    }
  };

  return (
    <div className="min-h-screen bg-secondary-bg flex flex-col items-center justify-start pt-8 pb-12 px-4 animate-page-enter">
      {/* Logo / Header */}
      <div className="w-full max-w-sm flex flex-col items-center gap-6 mb-8">
        <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-card border border-alternate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ccm.jpg" alt="Climat & Confort Moreau" className="w-full h-full object-cover" />
        </div>

        {/* Tagline */}
        <div className="text-center">
          <div
            className="inline-flex items-center px-5 py-2 rounded-xl border-2"
            style={{
              backgroundColor: "rgba(238,139,96,0.15)",
              borderColor: "#EE8B60",
            }}
          >
            <span className="font-bold text-lg text-primary-text">
              Accéder à mon espace
            </span>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <div className="w-full max-w-sm">
        {!showReset ? (
          /* === FORMULAIRE CONNEXION === */
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary-text">
                Adresse email
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary-text"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  autoComplete="email"
                  className={cn(
                    "input-base pl-10",
                    error && "input-error"
                  )}
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary-text">
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary-text"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className={cn(
                    "input-base pl-10 pr-10",
                    error && "input-error"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary-text transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle size={16} className="text-error mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Bouton connexion */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn-primary w-full py-3 text-base mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connexion…
                </span>
              ) : (
                "Se connecter"
              )}
            </button>

            {/* Mot de passe oublié */}
            <button
              type="button"
              onClick={() => {
                setShowReset(true);
                clearError();
              }}
              className="text-center text-sm text-secondary-text hover:text-primary transition-colors"
            >
              Mot de passe oublié ?
            </button>
          </form>
        ) : (
          /* === FORMULAIRE RESET === */
          <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
            <div className="text-center mb-2">
              <h2 className="text-lg font-bold text-primary-text">
                Réinitialiser le mot de passe
              </h2>
              <p className="text-sm text-secondary-text mt-1">
                Entrez votre email pour recevoir un lien de réinitialisation.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary-text">
                Adresse email
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary-text"
                />
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  className="input-base pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !resetEmail}
              className="btn-primary w-full py-3"
            >
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>

            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="text-center text-sm text-secondary-text hover:text-primary transition-colors"
            >
              ← Retour à la connexion
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="mt-10 text-xs text-secondary-text/60">
        © {new Date().getFullYear()} Climat & Confort Moreau
      </p>
    </div>
  );
}
