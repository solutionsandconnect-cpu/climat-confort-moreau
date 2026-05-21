"use client";
// src/app/messagerie/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput } from "@/components/ui";
import { cn, formatDateRelative, getInitials } from "@/lib/utils";
import { MessageCircle, Plus, CheckCheck, Circle, X, CheckSquare } from "lucide-react";
import toast from "react-hot-toast";

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
  const [filter, setFilter] = useState<"tous" | "non_lus">("tous");

  // Mode sélection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markingAs, setMarkingAs] = useState<"lu" | "non_lu" | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const map = new Map<string, Disc>();
    let init1 = false, init2 = false;

    const push = () => {
      if (!init1 || !init2) return;
      const arr = Array.from(map.values()).sort(
        (a, b) => (b.dateLastMessage?.getTime() ?? b.dateCreate?.getTime() ?? 0) -
                  (a.dateLastMessage?.getTime() ?? a.dateCreate?.getTime() ?? 0)
      );
      setDiscussions(arr);
      setLoading(false);
    };

    const resolveNom = async (raw: Disc): Promise<Disc> => {
      const myId = firebaseUser.uid;
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

    const u1 = onSnapshot(
      query(collection(db, "messagerie"), where("user_create", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs.map(async d => { map.set(d.id, await resolveNom(fromDoc(d))); }));
        init1 = true; push();
      },
      (err) => { console.warn("messagerie q1:", err.message); init1 = true; push(); }
    );

    const u2 = onSnapshot(
      query(collection(db, "messagerie"), where("user_destinataire", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs.map(async d => {
          map.set(d.id, await resolveNom(fromDoc(d)));
        }));
        init2 = true; push();
      },
      (err) => { console.warn("messagerie q2:", err.message); init2 = true; push(); }
    );

    const timeout = setTimeout(() => { init1 = true; init2 = true; push(); }, 5000);
    return () => { clearTimeout(timeout); u1(); u2(); };
  }, [firebaseUser]);

  const isUnread = useCallback((d: Disc) => {
    const isMe = d.userCreate?.id === firebaseUser?.uid;
    return isMe ? d.etatMessageExpediteur === false : d.etatMessageDestinataire === false;
  }, [firebaseUser?.uid]);

  const filtered = discussions.filter(d => {
    if (filter === "non_lus" && !isUnread(d)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.objetMessage?.toLowerCase().includes(q) ||
      d.nomInterlocuteur?.toLowerCase().includes(q) ||
      d.serviceInterlocuteur?.toLowerCase().includes(q);
  });

  const nonLus = discussions.filter(isUnread).length;

  const handleMarkAs = async (read: boolean) => {
    if (!firebaseUser || selected.size === 0) return;
    setMarkingAs(read ? "lu" : "non_lu");
    try {
      await Promise.all(Array.from(selected).map(async discId => {
        const disc = discussions.find(d => d.id === discId);
        if (!disc) return;
        const amIDestinataire = disc.userDestinataire?.id === firebaseUser.uid;
        const field = amIDestinataire ? "etat_message_destinataire" : "etat_message_expediteur";
        await updateDoc(doc(db, "messagerie", discId), { [field]: read });
      }));
      toast.success(read ? `${selected.size} marquée(s) comme lue(s)` : `${selected.size} marquée(s) comme non lue(s)`);
      setSelected(new Set());
      setSelectMode(false);
    } catch { toast.error("Erreur"); }
    finally { setMarkingAs(null); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-2xl mx-auto px-4 lg:px-6 py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Messagerie</h1>
            {nonLus > 0 && <p className="text-sm text-secondary-text mt-0.5">{nonLus} non lu{nonLus > 1 ? "s" : ""}</p>}
          </div>
          <div className="flex items-center gap-2">
            {!selectMode ? (
              <>
                <button onClick={() => setSelectMode(true)} className="btn-outline flex items-center gap-1.5 text-sm px-2.5 py-2" title="Sélectionner">
                  <CheckSquare size={15} /><span className="hidden sm:inline">Sélectionner</span>
                </button>
                <button onClick={() => router.push("/messagerie/nouveau")} className="btn-primary flex items-center gap-2">
                  <Plus size={16} /><span className="hidden sm:inline">Nouveau</span>
                </button>
              </>
            ) : (
              <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="btn-outline flex items-center gap-1.5 text-sm px-2.5 py-2">
                <X size={15} /><span className="hidden sm:inline">Annuler</span>
              </button>
            )}
          </div>
        </div>

        {/* Action bar sélection */}
        {selectMode && selected.size > 0 && (
          <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-2 flex-wrap animate-page-enter">
            <span className="text-sm font-semibold text-primary flex-1">{selected.size} sélectionnée(s)</span>
            <button
              onClick={() => handleMarkAs(true)}
              disabled={!!markingAs}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50">
              <CheckCheck size={13} />Marquer lue(s)
            </button>
            <button
              onClick={() => handleMarkAs(false)}
              disabled={!!markingAs}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors disabled:opacity-50">
              <Circle size={13} />Marquer non lue(s)
            </button>
          </div>
        )}

        {/* Recherche */}
        <div className="mb-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une discussion…" />
        </div>

        {/* Filtres */}
        <div className="flex gap-2 mb-4">
          {([["tous", "Toutes"], ["non_lus", `Non lues${nonLus > 0 ? ` (${nonLus})` : ""}`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all",
                filter === val ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<MessageCircle size={28} />}
            title={filter === "non_lus" ? "Aucun message non lu" : search ? "Aucun résultat" : "Aucune discussion"}
            description={filter === "non_lus" ? "Tous vos messages sont lus." : search ? "Modifiez votre recherche." : "Démarrez une nouvelle discussion."}
            action={!search && filter === "tous" ? (
              <button onClick={() => router.push("/messagerie/nouveau")} className="btn-primary flex items-center gap-2">
                <Plus size={15} />Nouveau message
              </button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(d => {
              const hasUnread = isUnread(d);
              const isSelected = selected.has(d.id);
              return (
                <div key={d.id}
                  className={cn(
                    "card p-4 cursor-pointer transition-all",
                    hasUnread
                      ? "border-primary/30 bg-primary/5 shadow-sm"
                      : "hover:shadow-card-hover",
                    isSelected && "ring-2 ring-primary border-primary"
                  )}
                  onClick={() => selectMode ? toggleSelect(d.id) : router.push(`/messagerie/${d.id}`)}>
                  <div className="flex items-center gap-3">
                    {/* Checkbox select mode */}
                    {selectMode && (
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                        isSelected ? "bg-primary border-primary" : "border-alternate"
                      )}>
                        {isSelected && <CheckCheck size={11} className="text-white" />}
                      </div>
                    )}
                    <div className="relative shrink-0">
                      <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center",
                        hasUnread ? "bg-primary" : "bg-primary/70"
                      )}>
                        <span className="text-white text-sm font-bold">{getInitials(d.nomInterlocuteur ?? "?")}</span>
                      </div>
                      {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-error rounded-full border-2 border-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={cn("text-sm truncate", hasUnread ? "font-bold text-primary-text" : "font-semibold text-primary-text")}>
                          {d.nomInterlocuteur ?? "Inconnu"}
                        </p>
                        <span className="text-xs text-secondary-text shrink-0 ml-2">
                          {formatDateRelative(d.dateLastMessage ?? d.dateCreate)}
                        </span>
                      </div>
                      <p className={cn("text-xs truncate", hasUnread ? "font-bold text-primary" : "font-semibold text-primary/80")}>
                        {d.objetMessage || "Sans objet"}
                      </p>
                      {d.serviceInterlocuteur && <p className="text-xs text-secondary-text">{d.serviceInterlocuteur}</p>}
                    </div>
                    {hasUnread && !selectMode && (
                      <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                    )}
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
