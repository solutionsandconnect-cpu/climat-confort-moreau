"use client";
// src/app/messagerie/nouveau/page.tsx
// Sélection par SERVICE puis par PERSONNE dans le service — comme Flutter

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { LISTE_SERVICES } from "@/types";
import type { UserApp } from "@/types";
import { Spinner } from "@/components/ui";
import { cn, getInitials } from "@/lib/utils";
import { ArrowLeft, Send } from "lucide-react";
import toast from "react-hot-toast";

export default function NouvelleDiscussionPage() {
  const router = useRouter();
  const { firebaseUser } = useAuthStore();

  // Étape 1 : choix du service
  const [serviceSelectionne, setServiceSelectionne] = useState("");
  // Étape 2 : choix de la personne dans le service
  const [usersService, setUsersService] = useState<UserApp[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserApp | null>(null);
  // Étape 3 : message
  const [objet, setObjet] = useState("");
  const [premierMessage, setPremierMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Quand service change → charger les utilisateurs de ce service
  useEffect(() => {
    if (!serviceSelectionne) { setUsersService([]); setSelectedUser(null); return; }
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

  const handleSubmit = async () => {
    if (!selectedUser) { toast.error("Sélectionnez un destinataire"); return; }
    if (!objet.trim()) { toast.error("L'objet est obligatoire"); return; }
    if (!premierMessage.trim()) { toast.error("Le message est obligatoire"); return; }
    if (!firebaseUser) return;

    setSending(true);
    try {
      const userCreateRef = doc(db, "usersapp", firebaseUser.uid);
      const userDestRef = doc(db, "usersapp", selectedUser.id);

      const discRef = await addDoc(collection(db, "messagerie"), {
        user_create: userCreateRef,
        user_destinataire: userDestRef,
        objet_message: objet,
        service_interlocuteur: serviceSelectionne,
        date_create: serverTimestamp(),
        date_last_message: serverTimestamp(),
        etat_message_destinataire: false,
        etat_message_expediteur: true,
      });

      // Premier message
      await addDoc(collection(db, "messagerie", discRef.id, "messages_messagerie"), {
        ref_user: userCreateRef,
        message_text: premierMessage,
        date_create: serverTimestamp(),
      });

      toast.success("Discussion créée !");
      router.replace(`/messagerie/${discRef.id}`);
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
            <p className="text-xs text-secondary-text">Sélectionnez un service puis un destinataire</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Étape 1 : Service */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-3">1. Service destinataire</label>
            <div className="flex flex-wrap gap-2">
              {LISTE_SERVICES.map(s => (
                <button key={s} onClick={() => { setServiceSelectionne(s); setSelectedUser(null); }}
                  className={cn("px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                    serviceSelectionne === s ? "bg-primary text-white border-primary" : "border-alternate text-secondary-text hover:border-primary/50")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Étape 2 : Personne dans le service */}
          {serviceSelectionne && (
            <div className="card p-4">
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-3">
                2. Destinataire ({serviceSelectionne})
              </label>
              {loadingUsers ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : usersService.length === 0 ? (
                <p className="text-sm text-secondary-text italic">Aucun utilisateur actif dans ce service.</p>
              ) : (
                <div className="space-y-2">
                  {usersService.map(u => (
                    <button key={u.id} onClick={() => setSelectedUser(u)}
                      className={cn("w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        selectedUser?.id === u.id ? "border-primary bg-primary/5" : "border-alternate hover:border-primary/40")}>
                      <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center", selectedUser?.id === u.id ? "border-primary" : "border-alternate")}>
                        {selectedUser?.id === u.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                        {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-white text-xs font-bold">{getInitials(u.nom, u.prenom)}</span>}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-text">{u.displayName}</p>
                        <p className="text-xs text-secondary-text">{u.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Étape 3 : Message */}
          {selectedUser && (
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

          {selectedUser && (
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
