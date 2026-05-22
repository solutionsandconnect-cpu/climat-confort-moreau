"use client";
// src/app/messagerie/page.tsx

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, DocumentReference, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput } from "@/components/ui";
import { cn, formatDateRelative, getInitials } from "@/lib/utils";
import { MessageCircle, Plus, CheckCheck, Circle, X, CheckSquare, Archive, ArchiveRestore, FileText, Users } from "lucide-react";
import toast from "react-hot-toast";

interface Disc {
  id: string;
  objetMessage?: string;
  service?: string;
  typeDiscussion?: "document" | "direct";
  etatDocument?: string;
  refDocumentFhId?: string;
  dateCreate?: Date;
  dateLastMessage?: Date;
  // Ancien format
  userCreate?: DocumentReference;
  userDestinataire?: DocumentReference;
  etatMessageDestinataire?: boolean;
  etatMessageExpediteur?: boolean;
  archiveExpediteur?: boolean;
  archiveDestinataire?: boolean;
  // Nouveau format groupes
  participantsIds?: string[];
  nonLusIds?: string[];
  archivesPar?: string[];
  // Résolu
  nomInterlocuteur?: string;
  photoUrl?: string;
  participantCount?: number;
}

const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  if (typeof (v as any).toDate === "function") return (v as any).toDate();
  if (v instanceof Date) return v;
};

const ETAT_COLORS: Record<string, string> = {
  "Validé":               "bg-green-100 text-green-700",
  "Refusé":               "bg-red-100 text-red-700",
  "En cours de traitement": "bg-blue-100 text-blue-700",
  "En attente":           "bg-yellow-100 text-yellow-700",
};

export default function MessageriePage() {
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();
  const userId = userApp?.id ?? firebaseUser?.uid ?? "";

  const [discussions, setDiscussions] = useState<Disc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"tous" | "non_lus" | "document" | "direct" | "archives">("tous");
  const [serviceFilter, setServiceFilter] = useState<string>("");

  // Mode sélection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markingAs, setMarkingAs] = useState<"lu" | "non_lu" | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const map = new Map<string, Disc>();
    let init1 = false, init2 = false, init3 = false;

    const push = () => {
      if (!init1 || !init2 || !init3) return;
      const arr = Array.from(map.values()).sort(
        (a, b) => (b.dateLastMessage?.getTime() ?? b.dateCreate?.getTime() ?? 0)
                - (a.dateLastMessage?.getTime() ?? a.dateCreate?.getTime() ?? 0)
      );
      setDiscussions(arr);
      setLoading(false);
    };

    const resolveNom = async (raw: Disc): Promise<Disc> => {
      const other = raw.userCreate?.id === firebaseUser.uid ? raw.userDestinataire : raw.userCreate;
      if (!other) return { ...raw, nomInterlocuteur: "Inconnu" };
      try {
        const s = await getDoc(other);
        const data = s.exists() ? s.data() : null;
        return {
          ...raw,
          nomInterlocuteur: data ? (data.display_name as string) ?? "Inconnu" : "Inconnu",
          photoUrl: (data?.photo_url as string) || undefined,
        };
      } catch { return { ...raw, nomInterlocuteur: "Inconnu" }; }
    };

    const fromDoc = (d: any): Disc => {
      const data = d.data();
      const refDocFh = data.ref_document_fh as DocumentReference | null;
      return {
        id: d.id,
        objetMessage: data.objet_message,
        service: data.service || data.service_interlocuteur,
        typeDiscussion: data.type_discussion,
        etatDocument: data.etat_document,
        refDocumentFhId: refDocFh?.id,
        dateCreate: toDate(data.date_create),
        dateLastMessage: toDate(data.date_last_message),
        userCreate: data.user_create,
        userDestinataire: data.user_destinataire,
        etatMessageDestinataire: data.etat_message_destinataire,
        etatMessageExpediteur: data.etat_message_expediteur,
        archiveExpediteur: data.archive_expediteur ?? false,
        archiveDestinataire: data.archive_destinataire ?? false,
        participantsIds: data.participants_ids,
        nonLusIds: data.non_lus_ids,
        archivesPar: data.archives_par,
        participantCount: (data.participants_ids as string[] | undefined)?.length,
      };
    };

    // Ancien format — créateur
    const u1 = onSnapshot(
      query(collection(db, "messagerie"), where("user_create", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs
          .filter(d => !d.data().participants_ids)
          .map(async d => { map.set(d.id, await resolveNom(fromDoc(d))); })
        );
        init1 = true; push();
      },
      (err) => { console.warn("messagerie q1:", err.message); init1 = true; push(); }
    );

    // Ancien format — destinataire
    const u2 = onSnapshot(
      query(collection(db, "messagerie"), where("user_destinataire", "==", userRef)),
      async snap => {
        await Promise.all(snap.docs
          .filter(d => !d.data().participants_ids)
          .map(async d => { map.set(d.id, await resolveNom(fromDoc(d))); })
        );
        init2 = true; push();
      },
      (err) => { console.warn("messagerie q2:", err.message); init2 = true; push(); }
    );

    // Nouveau format — participant groupe
    const u3 = onSnapshot(
      query(collection(db, "messagerie"), where("participants_ids", "array-contains", userId)),
      snap => {
        snap.docs.forEach(d => map.set(d.id, fromDoc(d)));
        init3 = true; push();
      },
      (err) => { console.warn("messagerie q3:", err.message); init3 = true; push(); }
    );

    const timeout = setTimeout(() => { init1 = true; init2 = true; init3 = true; push(); }, 5000);
    return () => { clearTimeout(timeout); u1(); u2(); u3(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, userId]);

  const isUnread = useCallback((d: Disc) => {
    if (d.participantsIds && d.nonLusIds !== undefined) {
      return d.nonLusIds.includes(userId);
    }
    const isMe = d.userCreate?.id === firebaseUser?.uid;
    return isMe ? d.etatMessageExpediteur === false : d.etatMessageDestinataire === false;
  }, [firebaseUser?.uid, userId]);

  const isArchived = useCallback((d: Disc) => {
    if (d.archivesPar !== undefined) {
      return d.archivesPar.includes(userId);
    }
    const isMe = d.userCreate?.id === firebaseUser?.uid;
    return isMe ? d.archiveExpediteur === true : d.archiveDestinataire === true;
  }, [firebaseUser?.uid, userId]);

  // Services disponibles pour le filtre
  const availableServices = useMemo(() => {
    const set = new Set<string>();
    discussions.forEach(d => { if (d.service) set.add(d.service); });
    return Array.from(set).sort();
  }, [discussions]);

  const filtered = discussions.filter(d => {
    if (filter === "archives") return isArchived(d);
    if (isArchived(d)) return false;
    if (filter === "non_lus" && !isUnread(d)) return false;
    if (filter === "document" && d.typeDiscussion !== "document") return false;
    if (filter === "direct" && d.typeDiscussion === "document") return false;
    if (serviceFilter && d.service !== serviceFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.objetMessage?.toLowerCase().includes(q) ||
      d.nomInterlocuteur?.toLowerCase().includes(q) ||
      d.service?.toLowerCase().includes(q);
  });

  const nonLus = discussions.filter(d => !isArchived(d) && isUnread(d)).length;
  const nbArchives = discussions.filter(isArchived).length;

  // ── Actions sélection ──────────────────────────────────────────────────────

  const handleMarkAs = async (read: boolean) => {
    if (!firebaseUser || selected.size === 0) return;
    setMarkingAs(read ? "lu" : "non_lu");
    try {
      await Promise.all(Array.from(selected).map(async discId => {
        const disc = discussions.find(d => d.id === discId);
        if (!disc) return;
        if (disc.participantsIds) {
          // Nouveau format
          await updateDoc(doc(db, "messagerie", discId), {
            non_lus_ids: read ? arrayRemove(userId) : arrayUnion(userId),
          });
        } else {
          // Ancien format
          const amIDestinataire = disc.userDestinataire?.id === firebaseUser.uid;
          const field = amIDestinataire ? "etat_message_destinataire" : "etat_message_expediteur";
          await updateDoc(doc(db, "messagerie", discId), { [field]: read });
        }
      }));
      toast.success(read ? `${selected.size} marquée(s) comme lue(s)` : `${selected.size} marquée(s) comme non lue(s)`);
      setSelected(new Set()); setSelectMode(false);
    } catch { toast.error("Erreur"); }
    finally { setMarkingAs(null); }
  };

  const handleArchive = async (archive: boolean) => {
    if (!firebaseUser || selected.size === 0) return;
    setArchiving(true);
    try {
      await Promise.all(Array.from(selected).map(async discId => {
        const disc = discussions.find(d => d.id === discId);
        if (!disc) return;
        if (disc.participantsIds) {
          await updateDoc(doc(db, "messagerie", discId), {
            archives_par: archive ? arrayUnion(userId) : arrayRemove(userId),
          });
        } else {
          const amIDestinataire = disc.userDestinataire?.id === firebaseUser.uid;
          const field = amIDestinataire ? "archive_destinataire" : "archive_expediteur";
          await updateDoc(doc(db, "messagerie", discId), { [field]: archive });
        }
      }));
      toast.success(archive ? `${selected.size} archivée(s)` : `${selected.size} désarchivée(s)`);
      setSelected(new Set()); setSelectMode(false);
    } catch { toast.error("Erreur"); }
    finally { setArchiving(false); }
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
            {filter !== "archives" ? (
              <>
                <button onClick={() => handleMarkAs(true)} disabled={!!markingAs || archiving}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50">
                  <CheckCheck size={13} />Marquer lue(s)
                </button>
                <button onClick={() => handleMarkAs(false)} disabled={!!markingAs || archiving}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors disabled:opacity-50">
                  <Circle size={13} />Marquer non lue(s)
                </button>
                <button onClick={() => handleArchive(true)} disabled={!!markingAs || archiving}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50">
                  <Archive size={13} />Archiver
                </button>
              </>
            ) : (
              <button onClick={() => handleArchive(false)} disabled={archiving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                <ArchiveRestore size={13} />Désarchiver
              </button>
            )}
          </div>
        )}

        {/* Recherche */}
        <div className="mb-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une discussion…" />
        </div>

        {/* Filtres par type */}
        <div className="flex gap-2 mb-2 flex-wrap">
          {([
            ["tous",      "Toutes"],
            ["non_lus",  `Non lues${nonLus > 0 ? ` (${nonLus})` : ""}`],
            ["document", "Documents"],
            ["direct",   "Directes"],
            ["archives", `Archivées${nbArchives > 0 ? ` (${nbArchives})` : ""}`],
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setFilter(val); setSelected(new Set()); }}
              className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all flex items-center gap-1.5",
                filter === val ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>
              {val === "archives" && <Archive size={11} />}
              {val === "document" && <FileText size={11} />}
              {label}
            </button>
          ))}
        </div>

        {/* Filtre par service */}
        {availableServices.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setServiceFilter("")}
              className={cn("px-3 py-1 rounded-badge text-xs font-semibold border transition-all",
                !serviceFilter ? "bg-secondary text-white border-secondary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-secondary/50")}>
              Tous les services
            </button>
            {availableServices.map(s => (
              <button key={s} onClick={() => setServiceFilter(s === serviceFilter ? "" : s)}
                className={cn("px-3 py-1 rounded-badge text-xs font-semibold border transition-all",
                  serviceFilter === s ? "bg-secondary text-white border-secondary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-secondary/50")}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Liste */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={filter === "archives" ? <Archive size={28} /> : <MessageCircle size={28} />}
            title={filter === "non_lus" ? "Aucun message non lu" : filter === "archives" ? "Aucune conversation archivée" : filter === "document" ? "Aucun document partagé" : search ? "Aucun résultat" : "Aucune discussion"}
            description={filter === "non_lus" ? "Tous vos messages sont lus." : filter === "archives" ? "Archivez des conversations pour les retrouver ici." : search ? "Modifiez votre recherche." : "Démarrez une nouvelle discussion."}
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
              const isGroupe = !!d.participantsIds;

              return (
                <div key={d.id}
                  className={cn(
                    "card p-4 cursor-pointer transition-all",
                    hasUnread ? "border-primary/30 bg-primary/5 shadow-sm" : "hover:shadow-card-hover",
                    isSelected && "ring-2 ring-primary border-primary"
                  )}
                  onClick={() => selectMode ? toggleSelect(d.id) : router.push(`/messagerie/${d.id}`)}>
                  <div className="flex items-start gap-3">
                    {/* Checkbox select mode */}
                    {selectMode && (
                      <div className={cn("w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5 transition-all",
                        isSelected ? "bg-primary border-primary" : "border-alternate")}>
                        {isSelected && <CheckCheck size={11} className="text-white" />}
                      </div>
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {isGroupe ? (
                        <div className={cn("w-11 h-11 rounded-full flex items-center justify-center",
                          hasUnread ? "bg-primary" : "bg-primary/70")}>
                          <Users size={18} className="text-white" />
                        </div>
                      ) : d.photoUrl ? (
                        <img src={d.photoUrl} alt={d.nomInterlocuteur ?? ""} className={cn("w-11 h-11 rounded-full object-cover", hasUnread && "ring-2 ring-primary")} />
                      ) : (
                        <div className={cn("w-11 h-11 rounded-full flex items-center justify-center", hasUnread ? "bg-primary" : "bg-primary/70")}>
                          <span className="text-white text-sm font-bold">{getInitials(d.nomInterlocuteur ?? "?")}</span>
                        </div>
                      )}
                      {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-error rounded-full border-2 border-white" />}
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5 gap-2">
                        <p className={cn("text-sm truncate", hasUnread ? "font-bold text-primary-text" : "font-semibold text-primary-text")}>
                          {isGroupe
                            ? (d.service ?? "Groupe")
                            : (d.nomInterlocuteur ?? "Inconnu")}
                          {isGroupe && d.participantCount && (
                            <span className="ml-1.5 text-xs font-normal text-secondary-text">({d.participantCount})</span>
                          )}
                        </p>
                        <span className="text-xs text-secondary-text shrink-0">
                          {formatDateRelative(d.dateLastMessage ?? d.dateCreate)}
                        </span>
                      </div>

                      <p className={cn("text-xs truncate", hasUnread ? "font-bold text-primary" : "font-semibold text-primary/80")}>
                        {d.objetMessage || "Sans objet"}
                      </p>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {d.service && !isGroupe && (
                          <span className="text-xs text-secondary-text">{d.service}</span>
                        )}
                        {d.typeDiscussion === "document" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                            <FileText size={9} />Document
                          </span>
                        )}
                        {d.etatDocument && (
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", ETAT_COLORS[d.etatDocument] ?? "bg-gray-100 text-gray-600")}>
                            {d.etatDocument}
                          </span>
                        )}
                      </div>
                    </div>

                    {hasUnread && !selectMode && (
                      <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-1" />
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
