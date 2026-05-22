"use client";
// src/app/messagerie/nouveau/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc } from "firebase/firestore";
import type { DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { creerDiscussionGroupe } from "@/lib/notifMessagerieService";
import { LISTE_SERVICES } from "@/types";
import type { UserApp } from "@/types";
import { Spinner } from "@/components/ui";
import { cn, getInitials } from "@/lib/utils";
import { ArrowLeft, Send, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function NouvelleDiscussionPage() {
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [serviceSelectionne, setServiceSelectionne] = useState("");
  const [usersService, setUsersService] = useState<UserApp[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserApp[]>([]);
  const [objet, setObjet] = useState("");
  const [premierMessage, setPremierMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!serviceSelectionne) { setUsersService([]); setSelectedUsers([]); return; }
    setLoadingUsers(true);
    getDocs(query(collection(db, "usersapp"),
      where("service_appartenance", "==", serviceSelectionne),
      where("actif", "==", true)
    )).then(snap => {
      const list: UserApp[] = snap.docs
        .map(d => ({
          id: d.id, uid: d.data().uid, email: d.data().email ?? "",
          displayName: (d.data().display_name as string) ?? `${d.data().prenom} ${d.data().nom}`,
          nom: d.data().nom ?? "", prenom: d.data().prenom ?? "",
          actif: d.data().actif ?? true,
          photoUrl: d.data().photo_url,
        } as UserApp))
        .filter(u => u.uid !== firebaseUser?.uid);
      setUsersService(list);
      setLoadingUsers(false);
    });
  }, [serviceSelectionne, firebaseUser?.uid]);

  const toggleUser = (u: UserApp) => {
    setSelectedUsers(prev =>
      prev.some(s => s.id === u.id) ? prev.filter(s => s.id !== u.id) : [...prev, u]
    );
  };

  const handleSubmit = async () => {
    if (selectedUsers.length === 0) { toast.error("Sélectionnez au moins un destinataire"); return; }
    if (!objet.trim()) { toast.error("L'objet est obligatoire"); return; }
    if (!premierMessage.trim()) { toast.error("Le message est obligatoire"); return; }
    if (!firebaseUser) return;

    setSending(true);
    try {
      const createurRef = doc(db, "usersapp", firebaseUser.uid) as DocumentReference;
      const destRefs = selectedUsers.map(u => doc(db, "usersapp", u.id) as DocumentReference);
      const allParticipants = [createurRef, ...destRefs.filter(r => r.id !== createurRef.id)];

      const discId = await creerDiscussionGroupe(
        allParticipants, createurRef, objet.trim(), serviceSelectionne, premierMessage.trim()
      );

      toast.success("Discussion créée !");
      router.replace(`/messagerie/${discId}`);
    } catch (e) { console.error(e); toast.error("Erreur lors de la création"); }
    finally { setSending(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter max-w-xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Nouveau message</h1>
            <p className="text-xs text-secondary-text">Sélectionnez un service puis les destinataires</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Étape 1 : Service */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-3">1. Service destinataire</label>
            <div className="flex flex-wrap gap-2">
              {LISTE_SERVICES.map(s => (
                <button key={s} onClick={() => { setServiceSelectionne(s); setSelectedUsers([]); }}
                  className={cn("px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                    serviceSelectionne === s ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Étape 2 : Personnes dans le service (multi-select) */}
          {serviceSelectionne && (
            <div className="card p-4">
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-1">
                2. Destinataires ({serviceSelectionne})
              </label>
              {selectedUsers.length > 0 && (
                <p className="text-xs text-primary mb-3">{selectedUsers.length} sélectionné{selectedUsers.length > 1 ? "s" : ""}</p>
              )}
              {loadingUsers ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : usersService.length === 0 ? (
                <p className="text-sm text-secondary-text italic">Aucun utilisateur actif dans ce service.</p>
              ) : (
                <div className="space-y-2">
                  {usersService.map(u => {
                    const isSelected = selectedUsers.some(s => s.id === u.id);
                    return (
                      <button key={u.id} onClick={() => toggleUser(u)}
                        className={cn("w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                          isSelected ? "border-primary bg-primary/5" : "border-alternate hover:border-primary/40")}>
                        <div className={cn("w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-all",
                          isSelected ? "border-primary bg-primary" : "border-alternate")}>
                          {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 overflow-hidden">
                          {u.photoUrl
                            ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="text-white text-xs font-bold">{getInitials(u.nom, u.prenom)}</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary-text truncate">{u.displayName}</p>
                          <p className="text-xs text-secondary-text truncate">{u.email}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Étape 3 : Message */}
          {selectedUsers.length > 0 && (
            <div className="card p-4 space-y-3">
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block">3. Message</label>
              <div>
                <label className="text-xs font-medium text-secondary-text">Objet *</label>
                <input className="input-base mt-1" value={objet} onChange={e => setObjet(e.target.value)} placeholder="Sujet de la discussion…" />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Message *</label>
                <textarea className="input-base mt-1 resize-none" rows={4} value={premierMessage} onChange={e => setPremierMessage(e.target.value)} placeholder="Écrivez votre message…" />
              </div>
            </div>
          )}

          {selectedUsers.length > 0 && (
            <button onClick={handleSubmit} disabled={sending || !objet.trim() || !premierMessage.trim()}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {sending ? <Spinner size="sm" /> : <Send size={16} />}
              {sending ? "Envoi…" : "Envoyer le message"}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
