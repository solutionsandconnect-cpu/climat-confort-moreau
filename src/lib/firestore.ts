// src/lib/firestore.ts
// Fonctions utilitaires pour Firestore
// Équivalent des queryXxxRecordOnce / queryXxxRecord de Flutter

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  DocumentReference,
  QueryConstraint,
  Timestamp,
  Query,
  CollectionReference,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  UserApp,
  Operation,
  Logement,
  Planning,
  Batiment,
  Notification,
  Messagerie,
  JournalInterne,
} from "@/types";

// ============================================
// HELPERS génériques
// ============================================

export function firestoreTimestampToDate(
  value: Timestamp | Date | undefined | null
): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  return value;
}

export function docRefToId(ref: DocumentReference | string | undefined): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  return ref.id;
}

// ============================================
// COLLECTION: usersapp
// ============================================

export async function getUserApp(uid: string): Promise<UserApp | null> {
  const q = query(
    collection(db, "usersapp"),
    where("uid", "==", uid),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapUserApp(d.id, d.data());
}

export async function getAllUsers(): Promise<UserApp[]> {
  const snap = await getDocs(collection(db, "usersapp"));
  return snap.docs.map((d) => mapUserApp(d.id, d.data()));
}

export function subscribeUsers(callback: (users: UserApp[]) => void) {
  return onSnapshot(collection(db, "usersapp"), (snap) => {
    callback(snap.docs.map((d) => mapUserApp(d.id, d.data())));
  });
}

function mapUserApp(id: string, data: Record<string, unknown>): UserApp {
  return {
    id,
    email: (data.email as string) ?? "",
    displayName: (data.display_name as string) ?? "",
    photoUrl: data.photo_url as string | undefined,
    uid: (data.uid as string) ?? "",
    createdTime: firestoreTimestampToDate(data.created_time as Timestamp),
    nom: (data.nom as string) ?? "",
    prenom: (data.prenom as string) ?? "",
    type: data.type as string | undefined,
    actif: (data.actif as boolean) ?? false,
    lastLogin: firestoreTimestampToDate(data.last_login as Timestamp),
    roleapp: data.roleapp as UserApp["roleapp"],
    phoneNumber: data.phone_number as string | undefined,
    phoneType: data.phone_type as UserApp["phoneType"],
    emailType: data.email_type as UserApp["emailType"],
    service: (data.service_appartenance as UserApp["service"]) ?? data.service as UserApp["service"],
  };
}

// ============================================
// COLLECTION: Operation (Chantiers)
// ============================================

export async function getAllOperations(): Promise<Operation[]> {
  const snap = await getDocs(collection(db, "Operation"));
  return snap.docs.map((d) => mapOperation(d.id, d.data()));
}

export function subscribeOperations(callback: (ops: Operation[]) => void) {
  return onSnapshot(
    query(collection(db, "Operation"), orderBy("date_create", "desc")),
    (snap) => {
      callback(snap.docs.map((d) => mapOperation(d.id, d.data())));
    }
  );
}

export async function getOperationById(id: string): Promise<Operation | null> {
  const snap = await getDoc(doc(db, "Operation", id));
  if (!snap.exists()) return null;
  return mapOperation(snap.id, snap.data());
}

export async function deleteOperation(id: string): Promise<void> {
  await deleteDoc(doc(db, "Operation", id));
}

function mapOperation(id: string, data: Record<string, unknown>): Operation {
  return {
    id,
    nomChantier: (data.nom_chantier as string) ?? "",
    numChantier: (data.num_chantier as string) ?? "",
    conducteurTravaux: data.conducteur_travaux as DocumentReference | undefined,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
    etatChantier: (data.etat_chantier as string) ?? "",
    createPar: data.create_par as DocumentReference | undefined,
  };
}

// ============================================
// COLLECTION: logements
// ============================================

export async function getAllLogements(): Promise<Logement[]> {
  const snap = await getDocs(collection(db, "Logements"));
  return snap.docs.map((d) => mapLogement(d.id, d.data()));
}

export async function getLogementsByOperation(
  operationRef: DocumentReference
): Promise<Logement[]> {
  const q = query(
    collection(db, "Logements"),
    where("operation_ref", "==", operationRef)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapLogement(d.id, d.data()));
}

export function subscribeLogements(callback: (logements: Logement[]) => void) {
  return onSnapshot(collection(db, "Logements"), (snap) => {
    callback(snap.docs.map((d) => mapLogement(d.id, d.data())));
  });
}

function mapLogement(id: string, data: Record<string, unknown>): Logement {
  return {
    id,
    numLogement: (data.num_logement as string) ?? "",
    nomOccupant: (data.nom_occupant as string) ?? "",
    telOccupant: data.tel_occupant as string | undefined,
    mailOccupant: data.mail_occupant as string | undefined,
    logementOccupe: (data.logement_occupe as boolean) ?? false,
    batimentRef: data.batiment_ref as DocumentReference | undefined,
    etageLogement: data.etage_logement as number | undefined,
    operationRef: data.operation_ref as DocumentReference | undefined,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
    etatChantier: data.etat_chantier as string | undefined,
    etatQuitus: data.etat_quitus as string | undefined,
    etatFacturation: data.etat_facturation as string | undefined,
    etatSignature: data.etat_signature as string | undefined,
    prioritaire: data.priorite_logement as boolean | undefined,
  };
}

// ============================================
// COLLECTION: notifications
// ============================================

export function subscribeNotifications(
  userId: string,
  callback: (notifs: Notification[]) => void
) {
  const q = query(
    collection(db, "Notifications"),
    where("destinataire_ref", "==", doc(db, "usersapp", userId)),
    orderBy("date_create", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        titre: d.data().titre as string,
        message: d.data().message as string,
        dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
        lu: d.data().lu as boolean,
        destinataire: d.data().destinataire_ref as DocumentReference,
        type: d.data().type as string,
      }))
    );
  });
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await updateDoc(doc(db, "Notifications", id), { lu: true });
}

// ============================================
// COLLECTION: messagerie
// ============================================

export function subscribeMessagerie(
  userId: string,
  callback: (msgs: Messagerie[]) => void
) {
  const userRef = doc(db, "usersapp", userId);
  const q = query(
    collection(db, "messagerie"),
    where("participants", "array-contains", userRef),
    orderBy("date_dernier_message", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        nomDiscussion: d.data().nom_discussion as string,
        participants: d.data().participants as DocumentReference[],
        dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
        dernierMessage: d.data().dernier_message as string,
        dateDernierMessage: firestoreTimestampToDate(
          d.data().date_dernier_message as Timestamp
        ),
        nbMessagesNonLus: d.data().nb_messages_non_lus as number,
      }))
    );
  });
}

// ============================================
// COLLECTION: journal_interne
// ============================================

export function subscribeJournalInterne(
  callback: (items: JournalInterne[]) => void
) {
  const q = query(
    collection(db, "Journal_interne"),
    orderBy("date_create", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        titre: d.data().titre as string,
        contenu: d.data().contenu as string,
        auteur: d.data().auteur_ref as DocumentReference,
        dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
        important: d.data().important as boolean,
      }))
    );
  });
}
