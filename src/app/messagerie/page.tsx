"use client";
// src/app/messagerie/page.tsx — sans orderBy (évite l'index Firestore manquant)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc, DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput } from "@/components/ui";
import { cn, formatDateRelative, getInitials } from "@/lib/utils";
import { MessageCircle, Plus } from "lucide-react";

interface Disc {
  id: string; objetMessage?: string; serviceInterlocuteur?: string;
  dateCreate?: Date; dateLastMessage?: Date;
  userCreate?: DocumentReference; userDestinataire?: DocumentReference;
  etatMessageDestinataire?: boolean; etatMessageExpediteur?: boolean;
  nomInterlocuteur?: string;
}

const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  if (typeof (v as any).toDate === "function") return (v as any).toDate();
  if (v instanceof Date) return v;
};

export default function MessageriePage() {
  const router = useRouter();
  const { firebaseUser } = useAuthStore();
  const [discussions, setDiscussions] = useState<Disc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const map = new Map<string, Disc>();
    let init1 = false, init2 = false;
    let resolved = false;

    const push = () => {
      if (!init1 || !init2) return;
      if (resolved) return;
      const arr = Array.from(map.values()).sort(
        (a, b) => (b.dateLastMessage?.getTime() ?? b.dateCreate?.getTime() ?? 0) -
                  (a.dateLastMessage?.getTime() ?? a.dateCreate?.getTime() ?? 0)
      );
      setDiscussions(arr);
      setLoading(false);
    };

    const resolveNom = async (raw: Disc): Promise<Disc> => {
      const myId = firebaseUser.uid;
      // L'interlocuteur est l'autre personne
      const isCreator = raw.userCreate?.id === myId;
      const other = isCreator ? raw.userDestinataire : raw.userCreate;
      if (!other) return { ...raw, nomInterlocuteur: "Inconnu" };
      try {
        const s = await getDoc(other);
        return { ...raw, nomInterlocuteur: s.exists() ? (s.data().display_name as string) ?? "Inconnu" : "Inconnu" };
      } catch { return { ...raw, nomInterlocuteur: "Inconnu" }; }
    };

    const fromDoc = (d: any): Disc => ({
      id: d.id,
      objetMessage: d.data().objet_message,
      serviceInterlocuteur: d.data().service_interlocuteur,
      dateCreate: toDate(d.data().date_create),
      dateLastMessage: toDate(d.data().date_last_message),
      userCreate: d.data().user_create,
      userDestinataire: d.data().user_destinataire,
      etatMessageDestinataire: d.data().etat_message_destinataire,
      etatMessageExpediteur: d.data().etat_message_expediteur,
    });

    // Query 1 : je suis créateur
    const u1 = onSnapshot(
      query(collection(db, "messagerie"), where("user_create", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs.map(async d => { map.set(d.id, await resolveNom(fromDoc(d))); }));
        init1 = true; push();
      },
      (err) => { console.warn("messagerie q1:", err.message); init1 = true; push(); }
    );

    // Query 2 : je suis destinataire
    const u2 = onSnapshot(
      query(collection(db, "messagerie"), where("user_destinataire", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs.map(async d => {
          // Ne pas écraser si déjà dans la map (évite les doublons)
          if (!map.has(d.id)) map.set(d.id, await resolveNom(fromDoc(d)));
        }));
        init2 = true; push();
      },
      (err) => { console.warn("messagerie q2:", err.message); init2 = true; push(); }
    );

    // Timeout de sécurité : 5s max
    const timeout = setTimeout(() => {
      console.warn("messagerie: timeout reached, forcing display");
      init1 = true; init2 = true; push();
    }, 5000);

    return () => { clearTimeout(timeout); u1(); u2(); };
  }, [firebaseUser]);

  const filtered = discussions.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.objetMessage?.toLowerCase().includes(q) ||
      d.nomInterlocuteur?.toLowerCase().includes(q) ||
      d.serviceInterlocuteur?.toLowerCase().includes(q);
  });

  const nonLus = discussions.filter(d => {
    const isMe = d.userCreate?.id === firebaseUser?.uid;
    return isMe ? d.etatMessageExpediteur === false : d.etatMessageDestinataire === false;
  }).length;

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Messagerie</h1>
            {nonLus > 0 && <p className="text-sm text-secondary-text mt-0.5">{nonLus} non lu{nonLus > 1 ? "s" : ""}</p>}
          </div>
          <button onClick={() => router.push("/messagerie/nouveau")} className="btn-primary flex items-center gap-2">
            <Plus size={16} /><span className="hidden sm:inline">Nouveau message</span>
          </button>
        </div>

        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une discussion…" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<MessageCircle size={28} />}
            title={search ? "Aucun résultat" : "Aucune discussion"}
            description={search ? "Modifiez votre recherche." : "Démarrez une nouvelle discussion."}
            action={!search ? (
              <button onClick={() => router.push("/messagerie/nouveau")} className="btn-primary flex items-center gap-2">
                <Plus size={15} />Nouveau message
              </button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(d => {
              const isMe = d.userCreate?.id === firebaseUser?.uid;
              const hasUnread = isMe ? d.etatMessageExpediteur === false : d.etatMessageDestinataire === false;
              return (
                <div key={d.id}
                  className={cn("card p-4 cursor-pointer hover:shadow-card-hover transition-all", hasUnread && "border-secondary/40 bg-secondary/5")}
                  onClick={() => router.push(`/messagerie/${d.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{getInitials(d.nomInterlocuteur ?? "?")}</span>
                      </div>
                      {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-error rounded-full border-2 border-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-semibold")}>
                          {d.nomInterlocuteur ?? "Inconnu"}
                        </p>
                        <span className="text-xs text-secondary-text shrink-0 ml-2">
                          {formatDateRelative(d.dateLastMessage ?? d.dateCreate)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-primary truncate">{d.objetMessage || "Sans objet"}</p>
                      {d.serviceInterlocuteur && <p className="text-xs text-secondary-text">{d.serviceInterlocuteur}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
