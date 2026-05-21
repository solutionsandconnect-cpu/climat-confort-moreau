"use client";
// src/app/messagerie/[id]/page.tsx — avec pièces jointes

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, collection, query, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, DocumentReference, getDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, FileText, X, Play } from "lucide-react";
import toast from "react-hot-toast";

interface Message {
  id: string;
  refUser?: DocumentReference;
  messageText?: string;
  dateCreate?: Date;
  documentImageList?: string[];
  documentPdfList?: string[];
  documentVideoList?: string[];
  isCurrentUser?: boolean;
  auteurNom?: string;
}

const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  if (typeof (v as any).toDate === "function") return (v as any).toDate();
  if (v instanceof Date) return v;
};

export default function DiscussionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { firebaseUser } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [discussion, setDiscussion] = useState<{ objet?: string; refDocumentFh?: string } | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());

  // Pièces jointes en attente
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingPdfs, setPendingPdfs] = useState<File[]>([]);
  const [pendingVideos, setPendingVideos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // ID du destinataire de la discussion (chargé depuis Firestore)
  const destIdRef = useRef<string | null>(null);

  const planRef = doc(db, "messagerie", id);
  const currentUserRef = firebaseUser ? doc(db, "usersapp", firebaseUser.uid) : null;

  useEffect(() => {
    // Charger infos discussion + marquer comme lu dès l'ouverture
    getDoc(planRef).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        const refDocFh = d.ref_document_fh as DocumentReference | null;
        const userDestRef = d.user_destinataire as DocumentReference | null;
        destIdRef.current = userDestRef?.id ?? "";
        setDiscussion({ objet: d.objet_message, refDocumentFh: refDocFh?.id });
        // Marquer comme lu dès l'ouverture (champ correct selon le rôle)
        const field = userDestRef?.id === firebaseUser?.uid
          ? "etat_message_destinataire"
          : "etat_message_expediteur";
        updateDoc(planRef, { [field]: true }).catch(() => {});
      }
    });

    setLoading(true);
    const q = query(collection(db, "messagerie", id, "messages_messagerie"), orderBy("date_create", "asc"));
    const unsub = onSnapshot(q, async snap => {
      const msgs: Message[] = snap.docs.map(d => ({
        id: d.id,
        refUser: d.data().ref_user as DocumentReference,
        messageText: d.data().message_text,
        dateCreate: toDate(d.data().date_create),
        documentImageList: d.data().document_image_list ?? [],
        documentPdfList: d.data().document_pdf_list ?? [],
        documentVideoList: d.data().document_video_list ?? [],
        isCurrentUser: (d.data().ref_user as DocumentReference)?.id === firebaseUser?.uid,
      }));

      // Résoudre noms auteurs manquants
      const newMap = new Map(userNames);
      await Promise.all(msgs.map(async m => {
        if (m.refUser && !newMap.has(m.refUser.id)) {
          try {
            const s = await getDoc(m.refUser);
            if (s.exists()) newMap.set(s.id, (s.data().display_name as string) ?? "Inconnu");
          } catch {}
        }
      }));
      setUserNames(new Map(newMap));
      setMessages(msgs.map(m => ({ ...m, auteurNom: m.refUser ? newMap.get(m.refUser.id) ?? "…" : "Inconnu" })));
      setLoading(false);

      // Marquer comme lu si le rôle est connu (chargé depuis getDoc)
      if (destIdRef.current !== null) {
        const field = destIdRef.current === firebaseUser?.uid
          ? "etat_message_destinataire"
          : "etat_message_expediteur";
        await updateDoc(planRef, { [field]: true }).catch(() => {});
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, firebaseUser?.uid]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const uploadFiles = async (): Promise<{ images: string[]; pdfs: string[]; videos: string[] }> => {
    const upload = async (file: File, path: string) => {
      try {
        const r = storageRef(storage, path);
        const snap = await uploadBytes(r, file);
        return getDownloadURL(snap.ref);
      } catch (e: any) {
        console.error("Upload error:", e);
        toast.error(`Erreur upload ${file.name}: ${e?.message ?? "Vérifiez les règles Firebase Storage"}`);
        throw e;
      }
    };
    const images = await Promise.all(pendingImages.map(f => upload(f, `messagerie/${id}/${Date.now()}_${f.name.replace(/\s/g, "_")}`)));
    const pdfs = await Promise.all(pendingPdfs.map(f => upload(f, `messagerie/${id}/${Date.now()}_${f.name.replace(/\s/g, "_")}`)));
    const videos = await Promise.all(pendingVideos.map(f => upload(f, `messagerie/${id}/${Date.now()}_${f.name.replace(/\s/g, "_")}`)));
    return { images, pdfs, videos };
  };

  const handleSend = async () => {
    if (!messageText.trim() && !pendingImages.length && !pendingPdfs.length && !pendingVideos.length) return;
    if (!currentUserRef) return;
    setSending(true);
    try {
      let images: string[] = [], pdfs: string[] = [], videos: string[] = [];
      if (pendingImages.length || pendingPdfs.length || pendingVideos.length) {
        setUploading(true);
        try {
          const r = await uploadFiles();
          images = r.images; pdfs = r.pdfs; videos = r.videos;
        } catch {
          // Upload a échoué — envoyer quand même le texte s'il y en a un
          if (!messageText.trim()) { setSending(false); setUploading(false); return; }
        }
        setUploading(false);
      }
      await addDoc(collection(db, "messagerie", id, "messages_messagerie"), {
        ref_user: currentUserRef,
        message_text: messageText.trim(),
        date_create: serverTimestamp(),
        document_image_list: images.length > 0 ? images : [],
        document_pdf_list: pdfs.length > 0 ? pdfs : [],
        document_video_list: videos.length > 0 ? videos : [],
      });
      // Marquer non lu pour l'autre personne, lu pour soi
      const amIDestinataire = destIdRef.current === firebaseUser?.uid;
      await updateDoc(planRef, {
        date_last_message: serverTimestamp(),
        ...(amIDestinataire
          ? { etat_message_expediteur: false, etat_message_destinataire: true }
          : { etat_message_destinataire: false, etat_message_expediteur: true }),
      });
      setMessageText("");
      setPendingImages([]); setPendingPdfs([]); setPendingVideos([]);
    } catch (e: any) {
      console.error("Send error:", e);
      toast.error(`Erreur envoi : ${e?.message ?? "Vérifiez Firebase Storage"}`);
    }
    finally { setSending(false); setUploading(false); inputRef.current?.focus(); }
  };

  const grouped = messages.reduce<{ date: string; msgs: Message[] }[]>((acc, msg) => {
    const dateStr = msg.dateCreate ? format(msg.dateCreate, "EEEE dd MMMM yyyy", { locale: fr }) : "Date inconnue";
    const last = acc[acc.length - 1];
    if (last?.date === dateStr) last.msgs.push(msg);
    else acc.push({ date: dateStr, msgs: [msg] });
    return acc;
  }, []);

  const hasPending = pendingImages.length + pendingPdfs.length + pendingVideos.length > 0;

  return (
    <AppShell>
      <div className="flex flex-col" style={{ height: "calc(100dvh - 0px)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-secondary-bg border-b border-alternate shrink-0">
          <button onClick={() => router.push("/messagerie")} className="p-2 rounded-lg hover:bg-primary-bg text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-primary-text text-sm truncate">{discussion?.objet ?? "Discussion"}</p>
          </div>
          {discussion?.refDocumentFh && (
            <button onClick={() => router.push(`/feuilles-heures/${discussion.refDocumentFh}`)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0">
              <FileText size={13} />Document
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 bg-primary-bg">
          {grouped.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-alternate" />
                <span className="text-xs text-secondary-text capitalize bg-alternate px-3 py-1 rounded-full">{group.date}</span>
                <div className="flex-1 h-px bg-alternate" />
              </div>
              <div className="space-y-2">
                {group.msgs.map(msg => {
                  const isMe = msg.isCurrentUser;
                  return (
                    <div key={msg.id} className={cn("flex gap-2.5", isMe ? "flex-row-reverse" : "flex-row")}>
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-auto mb-1">
                          <span className="text-primary text-xs font-bold">{getInitials(msg.auteurNom ?? "?")}</span>
                        </div>
                      )}
                      <div className={cn("max-w-[75%] flex flex-col", isMe ? "items-end" : "items-start")}>
                        {!isMe && <span className="text-xs text-secondary-text mb-1 ml-1">{msg.auteurNom}</span>}
                        {msg.messageText && (
                          <div className={cn("px-4 py-2.5 rounded-2xl text-sm leading-relaxed", isMe ? "bg-primary text-white rounded-tr-sm" : "bg-secondary-bg text-primary-text shadow-sm rounded-tl-sm border border-alternate")}>
                            {msg.messageText}
                          </div>
                        )}
                        {/* Images */}
                        {msg.documentImageList && msg.documentImageList.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {msg.documentImageList.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="Image" className="w-24 h-24 object-cover rounded-xl border border-alternate" />
                              </a>
                            ))}
                          </div>
                        )}
                        {/* PDFs */}
                        {msg.documentPdfList && msg.documentPdfList.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {msg.documentPdfList.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border", isMe ? "bg-primary-bg text-primary border-primary/20" : "bg-primary-bg text-primary border-primary/20")}>
                                <FileText size={14} />PDF document
                              </a>
                            ))}
                          </div>
                        )}
                        {/* Vidéos */}
                        {msg.documentVideoList && msg.documentVideoList.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {msg.documentVideoList.map((url, i) => (
                              <video key={i} src={url} controls className="rounded-xl max-w-[200px] border border-alternate" />
                            ))}
                          </div>
                        )}
                        <span className="text-[10px] text-secondary-text mt-1 mx-1">{msg.dateCreate ? format(msg.dateCreate, "HH:mm") : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mb-4"><Send size={24} className="text-secondary" /></div>
              <p className="text-sm font-semibold text-primary-text">Démarrez la conversation</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Pièces jointes en attente */}
        {hasPending && (
          <div className="px-4 py-2 bg-secondary-bg border-t border-alternate flex flex-wrap gap-2 shrink-0">
            {pendingImages.map((f, i) => (
              <div key={i} className="relative group">
                <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 rounded-lg object-cover border border-alternate" />
                <button onClick={() => setPendingImages(p => p.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-error rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={9} />
                </button>
              </div>
            ))}
            {pendingPdfs.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-primary-bg rounded-lg px-2 py-1 text-xs">
                <FileText size={12} className="text-primary" />{f.name.length > 12 ? f.name.substring(0, 12) + "…" : f.name}
                <button onClick={() => setPendingPdfs(p => p.filter((_, j) => j !== i))}><X size={10} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Zone de saisie */}
        <div className="shrink-0 bg-secondary-bg border-t border-alternate px-4 py-3">
          <div className="flex items-end gap-2">
            {/* Bouton pièces jointes */}
            <div className="flex gap-1 shrink-0">
              <button onClick={() => imageInputRef.current?.click()} className="p-2 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all" title="Photo">
                <ImageIcon size={18} />
              </button>
              <button onClick={() => pdfInputRef.current?.click()} className="p-2 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10 transition-all" title="PDF">
                <Paperclip size={18} />
              </button>
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { setPendingImages(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
            <input ref={pdfInputRef} type="file" accept="application/pdf,video/*" multiple className="hidden" onChange={e => {
              const files = Array.from(e.target.files ?? []);
              setPendingPdfs(p => [...p, ...files.filter(f => f.type === "application/pdf")]);
              setPendingVideos(p => [...p, ...files.filter(f => f.type.startsWith("video/"))]);
              e.target.value = "";
            }} />

            <div className="flex-1 relative">
              <textarea ref={inputRef} value={messageText} onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Écrire… (Entrée pour envoyer)" rows={1}
                className="w-full px-4 py-2.5 rounded-2xl border border-alternate bg-primary-bg text-primary-text text-sm placeholder:text-secondary-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                style={{ minHeight: "44px", maxHeight: "120px" }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }} />
            </div>
            <button onClick={handleSend} disabled={(!messageText.trim() && !hasPending) || sending}
              className={cn("w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all",
                (messageText.trim() || hasPending) ? "bg-primary text-white hover:bg-primary-600 shadow-sm" : "bg-alternate text-secondary-text cursor-not-allowed")}>
              {sending || uploading ? <Spinner size="sm" /> : <Send size={18} />}
            </button>
          </div>
          <p className="text-[10px] text-secondary-text mt-1 text-center">Entrée pour envoyer · Maj+Entrée pour saut de ligne</p>
        </div>
      </div>
    </AppShell>
  );
}
