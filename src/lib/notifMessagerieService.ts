// src/lib/notifMessagerieService.ts
// Services Firestore pour Notifications et Messagerie (groupes inclus)

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  limit,
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";

// ============================================
// NOTIFICATIONS
// ============================================

export interface NotificationItem {
  id: string;
  typeNotification?: string;
  notification?: string;
  etatNotification?: string; // 'Lue' | 'Non lue'
  dateCreate?: Date;
  dateLecture?: Date;
  dateDeclenchement?: Date;
  allerVersPage?: string;
  refUsers?: DocumentReference;
  planningId?: string;
  workflowAction?: "relance_appel" | "relance_mail_manuel" | "relance_mail_auto";
}

export function subscribeNotificationsNonLues(
  userRef: DocumentReference,
  callback: (items: NotificationItem[]) => void
) {
  const now = new Date();
  const q = query(
    collection(db, "Notifications"),
    where("refUsers", "==", userRef),
    where("etat_notification", "==", "Non lue"),
    where("date_declenchement", "<=", Timestamp.fromDate(now)),
    orderBy("date_declenchement", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapNotif(d.id, d.data())));
  });
}

export function subscribeNotificationsLues(
  userRef: DocumentReference,
  callback: (items: NotificationItem[]) => void
) {
  const q = query(
    collection(db, "Notifications"),
    where("refUsers", "==", userRef),
    where("etat_notification", "==", "Lue"),
    orderBy("date_create", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapNotif(d.id, d.data())));
  });
}

export function subscribeAllNotifications(
  userRef: DocumentReference,
  callback: (items: NotificationItem[]) => void
) {
  const q = query(
    collection(db, "Notifications"),
    where("refUsers", "==", userRef),
    orderBy("date_create", "desc"),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapNotif(d.id, d.data())));
  });
}

export async function marquerNotificationLue(id: string): Promise<void> {
  await updateDoc(doc(db, "Notifications", id), {
    etat_notification: "Lue",
    date_lecture: serverTimestamp(),
  });
}

export async function marquerToutesLues(userRef: DocumentReference): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "Notifications"), where("refUsers", "==", userRef), where("etat_notification", "==", "Non lue"))
  );
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { etat_notification: "Lue", date_lecture: serverTimestamp() })));
}

function mapNotif(id: string, data: Record<string, unknown>): NotificationItem {
  return {
    id,
    typeNotification: data.type_notification as string,
    notification: data.notification as string,
    etatNotification: data.etat_notification as string,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
    dateLecture: firestoreTimestampToDate(data.date_lecture as Timestamp),
    dateDeclenchement: firestoreTimestampToDate(data.date_declenchement as Timestamp),
    allerVersPage: data.aller_vers_page as string,
    refUsers: data.refUsers as DocumentReference,
    planningId: data.planning_id as string | undefined,
    workflowAction: data.workflow_action as NotificationItem["workflowAction"],
  };
}

// ============================================
// MESSAGERIE — Interfaces
// ============================================

export interface Discussion {
  id: string;
  objetMessage?: string;
  // Service: nouveau champ unifié (remplace serviceInterlocuteur)
  service?: string;
  serviceInterlocuteur?: string;  // backward compat
  // Type de discussion
  typeDiscussion?: "document" | "direct";
  // Lien document
  refDocumentFhId?: string;
  etatDocument?: string;
  // Dates
  dateCreate?: Date;
  dateLastMessage?: Date;
  // Nouveau format groupes
  participantsIds?: string[];
  nonLusIds?: string[];
  archivesPar?: string[];
  // Ancien format 1-à-1 (backward compat)
  userCreate?: DocumentReference;
  userDestinataire?: DocumentReference;
  etatMessageDestinataire?: boolean;
  etatMessageExpediteur?: boolean;
  archiveExpediteur?: boolean;
  archiveDestinataire?: boolean;
  // Résolu côté client
  nomInterlocuteur?: string;
  photoUrl?: string;
}

export interface Message {
  id: string;
  refUser?: DocumentReference;
  messageText?: string;
  dateCreate?: Date;
  documentPdfList?: string[];
  documentImageList?: string[];
  documentVideoList?: string[];
  nomAuteur?: string;
  isCurrentUser?: boolean;
}

// ============================================
// MESSAGERIE — Abonnements
// ============================================

/**
 * Abonnement aux discussions — supporte l'ancien format 1-à-1 ET le nouveau format groupe.
 * userId : Firestore usersapp doc ID du user courant (= userApp.id).
 * userRef : DocumentReference vers usersapp/{userId}.
 */
export function subscribeDiscussions(
  userId: string,
  userRef: DocumentReference,
  callback: (items: Discussion[]) => void
) {
  const map = new Map<string, Discussion>();
  let init1 = false, init2 = false, init3 = false;

  const notify = () => {
    if (!init1 || !init2 || !init3) return;
    const all = Array.from(map.values()).sort(
      (a, b) => (b.dateLastMessage?.getTime() ?? b.dateCreate?.getTime() ?? 0)
              - (a.dateLastMessage?.getTime() ?? a.dateCreate?.getTime() ?? 0)
    );
    callback(all);
  };

  // Ancien format — créateur
  const u1 = onSnapshot(
    query(collection(db, "messagerie"), where("user_create", "==", userRef)),
    snap => {
      snap.docs.forEach(d => { if (!d.data().participants_ids) map.set(d.id, mapDiscussion(d.id, d.data())); });
      init1 = true; notify();
    },
    () => { init1 = true; notify(); }
  );

  // Ancien format — destinataire
  const u2 = onSnapshot(
    query(collection(db, "messagerie"), where("user_destinataire", "==", userRef)),
    snap => {
      snap.docs.forEach(d => { if (!d.data().participants_ids) map.set(d.id, mapDiscussion(d.id, d.data())); });
      init2 = true; notify();
    },
    () => { init2 = true; notify(); }
  );

  // Nouveau format — participant (groupe)
  const u3 = onSnapshot(
    query(collection(db, "messagerie"), where("participants_ids", "array-contains", userId)),
    snap => {
      snap.docs.forEach(d => map.set(d.id, mapDiscussion(d.id, d.data())));
      init3 = true; notify();
    },
    () => { init3 = true; notify(); }
  );

  return () => { u1(); u2(); u3(); };
}

export function subscribeMessages(
  discussionId: string,
  currentUserRef: DocumentReference,
  callback: (items: Message[]) => void
) {
  const q = query(
    collection(db, "messagerie", discussionId, "messages_messagerie"),
    orderBy("date_create", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({
      id: d.id,
      refUser: d.data().ref_user as DocumentReference,
      messageText: d.data().message_text as string,
      dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
      documentPdfList: (d.data().document_pdf_list as string[]) ?? [],
      documentImageList: (d.data().document_image_list as string[]) ?? [],
      documentVideoList: (d.data().document_video_list as string[]) ?? [],
      isCurrentUser: (d.data().ref_user as DocumentReference)?.id === currentUserRef.id,
    })));
  });
}

// ============================================
// MESSAGERIE — Actions
// ============================================

/**
 * Envoie un message dans une discussion (supporte ancien et nouveau format).
 */
export async function sendMessage(
  discussionId: string,
  senderRef: DocumentReference,
  text: string
): Promise<void> {
  await addDoc(collection(db, "messagerie", discussionId, "messages_messagerie"), {
    ref_user: senderRef,
    message_text: text,
    date_create: serverTimestamp(),
  });

  const discDoc = await getDoc(doc(db, "messagerie", discussionId));
  if (!discDoc.exists()) return;
  const data = discDoc.data();

  if (data.participants_ids) {
    // Nouveau format groupe : marquer non lu pour tous sauf l'expéditeur
    const participantsIds = data.participants_ids as string[];
    await updateDoc(doc(db, "messagerie", discussionId), {
      date_last_message: serverTimestamp(),
      non_lus_ids: participantsIds.filter(id => id !== senderRef.id),
    });
  } else {
    // Ancien format 1-à-1
    await updateDoc(doc(db, "messagerie", discussionId), {
      date_last_message: serverTimestamp(),
      etat_message_destinataire: false,
    });
  }
}

/**
 * Marque une discussion comme lue pour un utilisateur (supporte les deux formats).
 * userId : Firestore usersapp doc ID.
 * isDestinataire : pour l'ancien format uniquement.
 */
export async function marquerLuParUser(
  discussionId: string,
  userId: string,
  isDestinataire?: boolean
): Promise<void> {
  const discDoc = await getDoc(doc(db, "messagerie", discussionId));
  if (!discDoc.exists()) return;

  if (discDoc.data().participants_ids) {
    await updateDoc(doc(db, "messagerie", discussionId), { non_lus_ids: arrayRemove(userId) });
  } else {
    const field = isDestinataire ? "etat_message_destinataire" : "etat_message_expediteur";
    await updateDoc(doc(db, "messagerie", discussionId), { [field]: true }).catch(() => {});
  }
}

/** @deprecated Utiliser marquerLuParUser */
export async function marquerDiscussionLue(discussionId: string, isDestinataire: boolean): Promise<void> {
  await marquerLuParUser(discussionId, "", isDestinataire);
}

/**
 * Ajoute des participants à une discussion groupe existante (idempotent).
 */
export async function ajouterParticipants(
  discussionId: string,
  participantRefs: DocumentReference[]
): Promise<void> {
  if (participantRefs.length === 0) return;
  const discDoc = await getDoc(doc(db, "messagerie", discussionId));
  if (!discDoc.exists() || !discDoc.data().participants_ids) return;

  const existingIds = discDoc.data().participants_ids as string[];
  const newRefs = participantRefs.filter(r => !existingIds.includes(r.id));
  if (newRefs.length === 0) return;

  await updateDoc(doc(db, "messagerie", discussionId), {
    participants_ids: arrayUnion(...newRefs.map(r => r.id)),
    participants: arrayUnion(...newRefs),
  });
}

/**
 * Met à jour l'état du document lié dans toutes les discussions associées.
 */
export async function updateDiscussionEtatDocument(
  docFhRef: DocumentReference,
  etat: string
): Promise<void> {
  const snap = await getDocs(query(collection(db, "messagerie"), where("ref_document_fh", "==", docFhRef)));
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { etat_document: etat }).catch(() => {})));
}

// ============================================
// MESSAGERIE — Création de discussions
// ============================================

/**
 * Crée une discussion de groupe (nouveau format).
 * participants : tous les participants, incluant le créateur.
 */
export async function creerDiscussionGroupe(
  participants: DocumentReference[],
  createurRef: DocumentReference,
  objet: string,
  service: string,
  premierMessage: string,
  refDocumentFh?: DocumentReference | null,
  etatDocument?: string,
): Promise<string> {
  const participantsIds = participants.map(p => p.id);

  const data: Record<string, unknown> = {
    participants,
    participants_ids: participantsIds,
    createur: createurRef,
    objet_message: objet,
    service,
    service_interlocuteur: service,
    type_discussion: refDocumentFh ? "document" : "direct",
    date_create: serverTimestamp(),
    date_last_message: serverTimestamp(),
    non_lus_ids: participantsIds.filter(id => id !== createurRef.id),
    archives_par: [],
  };
  if (refDocumentFh) data.ref_document_fh = refDocumentFh;
  if (etatDocument) data.etat_document = etatDocument;

  const ref = await addDoc(collection(db, "messagerie"), data);

  if (premierMessage.trim()) {
    await addDoc(collection(db, "messagerie", ref.id, "messages_messagerie"), {
      ref_user: createurRef,
      message_text: premierMessage,
      date_create: serverTimestamp(),
    });
  }
  return ref.id;
}

/**
 * Crée une discussion 1-à-1 (ancien format, utilisé pour les messages manuels).
 */
export async function creerDiscussion(
  userCreateRef: DocumentReference,
  userDestRef: DocumentReference,
  objet: string,
  service: string,
  premierMessage: string
): Promise<string> {
  const ref = await addDoc(collection(db, "messagerie"), {
    user_create: userCreateRef,
    user_destinataire: userDestRef,
    objet_message: objet,
    service_interlocuteur: service,
    date_create: serverTimestamp(),
    date_last_message: serverTimestamp(),
    etat_message_destinataire: false,
    etat_message_expediteur: true,
  });
  if (premierMessage.trim()) {
    await sendMessage(ref.id, userCreateRef, premierMessage);
  }
  return ref.id;
}

export async function getUserNom(ref: DocumentReference): Promise<string> {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return "Inconnu";
    return (snap.data().display_name as string) ?? "Inconnu";
  } catch {
    return "Inconnu";
  }
}

// ============================================
// MESSAGERIE — Mapping interne
// ============================================

function mapDiscussion(id: string, data: Record<string, unknown>): Discussion {
  const refDocFh = data.ref_document_fh as DocumentReference | null | undefined;
  return {
    id,
    objetMessage: data.objet_message as string,
    service: (data.service as string) || (data.service_interlocuteur as string),
    serviceInterlocuteur: data.service_interlocuteur as string,
    typeDiscussion: data.type_discussion as "document" | "direct" | undefined,
    etatDocument: data.etat_document as string | undefined,
    refDocumentFhId: refDocFh?.id,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
    dateLastMessage: firestoreTimestampToDate(data.date_last_message as Timestamp),
    participantsIds: data.participants_ids as string[] | undefined,
    nonLusIds: data.non_lus_ids as string[] | undefined,
    archivesPar: data.archives_par as string[] | undefined,
    userCreate: data.user_create as DocumentReference | undefined,
    userDestinataire: data.user_destinataire as DocumentReference | undefined,
    etatMessageDestinataire: data.etat_message_destinataire as boolean | undefined,
    etatMessageExpediteur: data.etat_message_expediteur as boolean | undefined,
    archiveExpediteur: data.archive_expediteur as boolean | undefined,
    archiveDestinataire: data.archive_destinataire as boolean | undefined,
  };
}
