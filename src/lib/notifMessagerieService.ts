// src/lib/notifMessagerieService.ts
// Services Firestore pour Notifications et Messagerie

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
  // Workflow relance
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

export async function marquerToutesLues(
  userRef: DocumentReference
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "Notifications"),
      where("refUsers", "==", userRef),
      where("etat_notification", "==", "Non lue")
    )
  );
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(d.ref, {
        etat_notification: "Lue",
        date_lecture: serverTimestamp(),
      })
    )
  );
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
// MESSAGERIE (discussions)
// ============================================

export interface Discussion {
  id: string;
  objetMessage?: string;
  serviceInterlocuteur?: string;
  dateCreate?: Date;
  dateLastMessage?: Date;
  userCreate?: DocumentReference;
  userDestinataire?: DocumentReference;
  etatMessageDestinataire?: boolean; // false = non lu
  etatMessageExpediteur?: boolean;
  // Résolus côté client
  nomExpediteur?: string;
  nomDestinataire?: string;
}

export interface Message {
  id: string;
  refUser?: DocumentReference;
  messageText?: string;
  dateCreate?: Date;
  documentPdfList?: string[];
  documentImageList?: string[];
  documentVideoList?: string[];
  // Résolu côté client
  nomAuteur?: string;
  isCurrentUser?: boolean;
}

export function subscribeDiscussions(
  userRef: DocumentReference,
  callback: (items: Discussion[]) => void
) {
  // Firestore ne supporte pas OR natif facilement, on fait deux queries
  const qCreate = query(
    collection(db, "messagerie"),
    where("user_create", "==", userRef),
    orderBy("date_last_message", "desc")
  );
  const qDest = query(
    collection(db, "messagerie"),
    where("user_destinataire", "==", userRef),
    orderBy("date_last_message", "desc")
  );

  const map = new Map<string, Discussion>();
  let unsubCreate: () => void;
  let unsubDest: () => void;

  const notify = () => {
    const all = Array.from(map.values()).sort(
      (a, b) =>
        (b.dateLastMessage?.getTime() ?? 0) -
        (a.dateLastMessage?.getTime() ?? 0)
    );
    callback(all);
  };

  unsubCreate = onSnapshot(qCreate, (snap) => {
    snap.docs.forEach((d) => map.set(d.id, mapDiscussion(d.id, d.data())));
    notify();
  });
  unsubDest = onSnapshot(qDest, (snap) => {
    snap.docs.forEach((d) => map.set(d.id, mapDiscussion(d.id, d.data())));
    notify();
  });

  return () => {
    unsubCreate();
    unsubDest();
  };
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
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        refUser: d.data().ref_user as DocumentReference,
        messageText: d.data().message_text as string,
        dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
        documentPdfList: d.data().document_pdf_list as string[] ?? [],
        documentImageList: d.data().document_image_list as string[] ?? [],
        documentVideoList: d.data().document_video_list as string[] ?? [],
        isCurrentUser:
          (d.data().ref_user as DocumentReference)?.id === currentUserRef.id,
      }))
    );
  });
}

export async function sendMessage(
  discussionId: string,
  userRef: DocumentReference,
  text: string
): Promise<void> {
  await addDoc(
    collection(db, "messagerie", discussionId, "messages_messagerie"),
    {
      ref_user: userRef,
      message_text: text,
      date_create: serverTimestamp(),
    }
  );
  // Mettre à jour la date du dernier message + marquer non lu pour destinataire
  await updateDoc(doc(db, "messagerie", discussionId), {
    date_last_message: serverTimestamp(),
    etat_message_destinataire: false,
  });
}

export async function marquerDiscussionLue(
  discussionId: string,
  isDestinataire: boolean
): Promise<void> {
  const field = isDestinataire
    ? "etat_message_destinataire"
    : "etat_message_expediteur";
  await updateDoc(doc(db, "messagerie", discussionId), { [field]: true });
}

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

function mapDiscussion(
  id: string,
  data: Record<string, unknown>
): Discussion {
  return {
    id,
    objetMessage: data.objet_message as string,
    serviceInterlocuteur: data.service_interlocuteur as string,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
    dateLastMessage: firestoreTimestampToDate(
      data.date_last_message as Timestamp
    ),
    userCreate: data.user_create as DocumentReference,
    userDestinataire: data.user_destinataire as DocumentReference,
    etatMessageDestinataire: data.etat_message_destinataire as boolean,
    etatMessageExpediteur: data.etat_message_expediteur as boolean,
  };
}
