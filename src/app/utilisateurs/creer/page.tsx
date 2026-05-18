"use client";
// src/app/utilisateurs/creer/page.tsx — création de compte utilisateur

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { LISTE_SERVICES } from "@/types";
import { ArrowLeft, UserPlus, Check, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

const ROLES = ["Utilisateur", "Admin", "SuperAdmin"];
const TYPES = ["Conducteur de Travaux", "Technicien", "Service SAV / Expertises", "Bureau Administratif", "Magasin", "Chiffrage"];

export default function CreerComptePage() {
  const router = useRouter();
  const { userApp } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("");
  const [role, setRole] = useState("Utilisateur");
  const [service, setService] = useState("");
  const [forfait, setForfait] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isAdmin(userApp)) return <AppShell><div className="p-8 text-center text-secondary-text">Accès réservé aux administrateurs.</div></AppShell>;

  const handleSubmit = async () => {
    if (!email || !password || !nom || !prenom) { toast.error("Email, mot de passe, nom et prénom obligatoires"); return; }
    if (password !== confirmPwd) { toast.error("Les mots de passe ne correspondent pas"); return; }
    if (password.length < 6) { toast.error("Mot de passe minimum 6 caractères"); return; }
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "usersapp", cred.user.uid), {
        uid: cred.user.uid, email, display_name: `${prenom} ${nom}`,
        nom, prenom, phone_number: phone, type, roleapp: role,
        service_appartenance: service, acces_forfait_jour: forfait,
        actif: true, created_time: serverTimestamp(),
      });
      toast.success("Compte créé !");
      router.replace("/utilisateurs");
    } catch (e: any) {
      if (e.code === "auth/email-already-in-use") toast.error("Cet email est déjà utilisé");
      else toast.error("Erreur lors de la création");
    } finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div><h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Créer un compte</h1><p className="text-xs text-secondary-text">Nouvel utilisateur de l&apos;application</p></div>
        </div>

        <div className="flex justify-center mb-5"><div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-primary/20"><UserPlus size={28} className="text-primary" /></div></div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Identifiants *</p>
            <div><label className="text-xs font-medium text-secondary-text">Email *</label><input className="input-base mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" /></div>
            <div><label className="text-xs font-medium text-secondary-text">Mot de passe * (min. 6 caractères)</label>
              <div className="relative mt-1"><input className="input-base pr-10" type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <button onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text">{showPwd ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Confirmer le mot de passe *</label><input className="input-base mt-1" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="••••••••" /></div>
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations personnelles *</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Prénom *</label><input className="input-base mt-1" value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom" /></div>
              <div><label className="text-xs font-medium text-secondary-text">Nom *</label><input className="input-base mt-1" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom" /></div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Téléphone</label><input className="input-base mt-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 00 00 00 00" /></div>
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Rôle & Service</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Rôle</label><select className="input-base mt-1" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div><label className="text-xs font-medium text-secondary-text">Type</label><select className="input-base mt-1" value={type} onChange={e => setType(e.target.value)}><option value="">—</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Service</label><select className="input-base mt-1" value={service} onChange={e => setService(e.target.value)}><option value="">—</option>{LISTE_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div>
              <label className="text-xs font-medium text-secondary-text mb-1.5 block">Forfait Jour</label>
              <div className="flex gap-2">
                {["Forfait Jour", "Pas de forfait jour"].map(o => <button key={o} onClick={() => setForfait(o)} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${forfait === o ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text"}`}>{o}</button>)}
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving || !email || !password || !nom || !prenom} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}{saving ? "Création…" : "Créer le compte"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
