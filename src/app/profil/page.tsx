"use client";

// src/app/profil/page.tsx
// Équivalent de mon_profil_widget.dart + profile_edit_widget.dart

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { cn, formatDate, formatDateRelative, getInitials } from "@/lib/utils";
import { Pencil, Check, X, Lock, User, Phone, Mail, Shield, Calendar, Eye, EyeOff, Camera } from "lucide-react";
import toast from "react-hot-toast";

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <span className="text-secondary-text shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-secondary-text">{label}</p>
        <p className={cn("text-sm font-medium mt-0.5", !value ? "text-secondary-text italic" : "text-primary-text")}>
          {value || "Non renseigné"}
        </p>
      </div>
    </div>
  );
}

export default function ProfilPage() {
  const { userApp, firebaseUser } = useAuthStore();

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Champs édition
  const [editNom, setEditNom] = useState(userApp?.nom ?? "");
  const [editPrenom, setEditPrenom] = useState(userApp?.prenom ?? "");
  const [editPhone, setEditPhone] = useState(userApp?.phoneNumber ?? "");
  const [editPhoneType, setEditPhoneType] = useState<"Pro" | "Perso">(userApp?.phoneType ?? "Pro");
  const [editEmailType, setEditEmailType] = useState<"Pro" | "Perso">(userApp?.emailType ?? "Pro");
  const [editType, setEditType] = useState(userApp?.type ?? "");
  const [editService, setEditService] = useState(userApp?.service ?? "");

  // Changement mot de passe
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (userApp) {
      setEditNom(userApp.nom ?? "");
      setEditPrenom(userApp.prenom ?? "");
      setEditPhone(userApp.phoneNumber ?? "");
      setEditPhoneType(userApp.phoneType ?? "Pro");
      setEditEmailType(userApp.emailType ?? "Pro");
      setEditType(userApp.type ?? "");
      setEditService(userApp.service ?? "");
    }
  }, [userApp]);

  const handlePhoto = async (file: File) => {
    if (!userApp || !firebaseUser) return;
    setUploadingPhoto(true);
    try {
      const r = storageRef(storage, `users/${userApp.id}/photo_${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "usersapp", userApp.id), { photo_url: url });
      toast.success("Photo de profil mise à jour !");
    } catch { toast.error("Erreur lors de l'upload de la photo"); }
    finally { setUploadingPhoto(false); }
  };

  const handleSave = async () => {
    if (!userApp || !firebaseUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "usersapp", userApp.id), {
        nom: editNom,
        prenom: editPrenom,
        display_name: `${editPrenom} ${editNom}`,
        phone_number: editPhone,
        phone_type: editPhoneType,
        email_type: editEmailType,
        type: editType,
        service_appartenance: editService,
      });
      setEditMode(false);
      toast.success("Profil mis à jour !");
    } catch { toast.error("Erreur lors de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async () => {
    if (!firebaseUser?.email || !currentPwd || !newPwd) {
      toast.error("Remplissez tous les champs");
      return;
    }
    if (newPwd.length < 6) { toast.error("Le mot de passe doit faire au moins 6 caractères"); return; }
    setChangingPwd(true);
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, currentPwd);
      await reauthenticateWithCredential(firebaseUser, cred);
      await updatePassword(firebaseUser, newPwd);
      toast.success("Mot de passe modifié !");
      setShowPwdForm(false);
      setCurrentPwd(""); setNewPwd("");
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/wrong-password") toast.error("Mot de passe actuel incorrect");
      else toast.error("Erreur lors du changement");
    } finally { setChangingPwd(false); }
  };

  if (!userApp) return <AppShell><div className="p-8 text-center"><Spinner /></div></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">

        {/* Avatar + nom */}
        <div className="card p-6 mb-4 flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-md overflow-hidden">
              {userApp.photoUrl
                ? <img src={userApp.photoUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-white text-2xl font-bold">{getInitials(userApp.nom, userApp.prenom)}</span>
              }
            </div>
            <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-600 transition-colors shadow">
              {uploadingPhoto ? <Spinner size="sm" /> : <Camera size={13} className="text-white" />}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
            </label>
          </div>
          <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>
            {userApp.displayName || `${userApp.prenom} ${userApp.nom}`}
          </h1>
          <p className="text-sm text-secondary-text mt-0.5">{userApp.email}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <span className={cn("badge border text-xs",
              userApp.roleapp === "SuperAdmin" ? "bg-purple-100 text-purple-800 border-purple-200"
              : userApp.roleapp === "Admin" ? "bg-blue-100 text-blue-800 border-blue-200"
              : "bg-gray-100 text-gray-700 border-gray-200")}>
              <Shield size={10} className="mr-1" />{userApp.roleapp ?? "Utilisateur"}
            </span>
            {userApp.actif
              ? <span className="badge bg-green-100 text-green-800 border-green-200 text-xs">Actif</span>
              : <span className="badge bg-red-100 text-red-700 border-red-200 text-xs">Inactif</span>
            }
          </div>
          {userApp.lastLogin && (
            <p className="text-xs text-secondary-text mt-2">Dernière connexion : {formatDateRelative(userApp.lastLogin)}</p>
          )}
        </div>

        {/* Infos */}
        {!editMode ? (
          <div className="card overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Informations</p>
              <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-600 font-semibold transition-colors">
                <Pencil size={12} />Modifier
              </button>
            </div>
            <div className="divide-y divide-alternate/60">
              <InfoRow icon={<User size={15} />} label="Prénom" value={userApp.prenom} />
              <InfoRow icon={<User size={15} />} label="Nom" value={userApp.nom} />
              <InfoRow icon={<Phone size={15} />} label={`Téléphone${userApp.phoneType ? ` (${userApp.phoneType})` : ""}`} value={userApp.phoneNumber} />
              <InfoRow icon={<Mail size={15} />} label={`Email${userApp.emailType ? ` (${userApp.emailType})` : ""}`} value={userApp.email} />
              {userApp.createdTime && <InfoRow icon={<Calendar size={15} />} label="Compte créé le" value={formatDate(userApp.createdTime)} />}
            </div>
          </div>
        ) : (
          <div className="card p-4 mb-4 space-y-3">
            <h3 className="text-xs font-bold text-secondary-text uppercase tracking-wide mb-1">Modifier le profil</h3>
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
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 flex-1">
                {saving ? <Spinner size="sm" /> : <Check size={14} />} Sauvegarder
              </button>
              <button onClick={() => setEditMode(false)} className="btn-outline px-4"><X size={14} /></button>
            </div>
          </div>
        )}

        {/* Mentions légales */}
        <div className="flex items-center justify-center gap-4 py-3 mt-2">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-secondary-text hover:text-primary transition-colors">Politique de confidentialité</a>
          <span className="text-secondary-text/40">·</span>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-xs text-secondary-text hover:text-primary transition-colors">Conditions d&apos;utilisation</a>
        </div>

        {/* Mot de passe */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-bg border-b border-alternate">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Mot de passe</p>
            <button onClick={() => setShowPwdForm(!showPwdForm)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-600 font-semibold transition-colors">
              <Lock size={12} />{showPwdForm ? "Annuler" : "Modifier"}
            </button>
          </div>
          {!showPwdForm ? (
            <div className="px-4 py-3">
              <p className="text-sm text-secondary-text">••••••••••••</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Mot de passe actuel</label>
                <div className="relative mt-1">
                  <input className="input-base pr-10" type={showCurrent ? "text" : "password"} value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••" />
                  <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary transition-colors">
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Nouveau mot de passe</label>
                <div className="relative mt-1">
                  <input className="input-base pr-10" type={showNew ? "text" : "password"} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 caractères" />
                  <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary transition-colors">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button onClick={handleChangePwd} disabled={changingPwd || !currentPwd || !newPwd} className="btn-primary w-full flex items-center justify-center gap-2">
                {changingPwd ? <Spinner size="sm" /> : <Lock size={14} />} Changer le mot de passe
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
