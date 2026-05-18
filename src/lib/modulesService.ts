// src/lib/modulesService.ts
// Services Firestore : Journal interne, Feuilles d'heures, Utilisateurs

import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc,
  doc, getDocs, where, serverTimestamp, deleteDoc,
  DocumentReference, Timestamp, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";
import type { UserApp } from "@/types";

// ============================================
// JOURNAL INTERNE
// ============================================

export interface JournalItem {
  id: string;
  titre?: string;
  text?: string;
  docEnvoye?: string;
  nomDocument?: string;
  dateCreate?: Date;
  userCreate?: DocumentReference;
  listeNomEnvoi?: string[];
  auteurNom?: string;
}

export function subscribeJournal(callback: (items: JournalItem[]) => void) {
  const q = query(
    collection(db, "Journal_interne"),
    orderBy("date_create", "desc"),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({
      id: d.id,
      titre: d.data().titre as string,
      text: d.data().text as string,
      docEnvoye: d.data().doc_envoye as string,
      nomDocument: d.data().nom_document as string,
      dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
      userCreate: d.data().user_create as DocumentReference,
      listeNomEnvoi: d.data().liste_nom_envoi as string[],
    })));
  });
}

export async function addJournalItem(data: {
  titre: string;
  text: string;
  userCreateRef: DocumentReference;
  listeNomEnvoi: string[];
}): Promise<void> {
  await addDoc(collection(db, "Journal_interne"), {
    titre: data.titre,
    text: data.text,
    user_create: data.userCreateRef,
    liste_nom_envoi: data.listeNomEnvoi,
    date_create: serverTimestamp(),
  });
}

export async function deleteJournalItem(id: string): Promise<void> {
  await deleteDoc(doc(db, "Journal_interne", id));
}

// ============================================
// FEUILLES D'HEURES (documents_fh)
// ============================================

export interface DocumentFH {
  id: string;
  nomDocument?: string;
  typeDocument?: string;
  categorieDocument?: string;
  service?: string;
  mois?: string;
  debutSemaine?: Date;
  finSemaine?: Date;
  dateCreate?: Date;
  dateSignature?: Date;
  refUser?: DocumentReference;
  signatureUser?: string;
  signatureChefEquipe?: string;
  signatureResponsable?: string;
  nomResponsable?: string;
  etatTraitementDocument?: string;
  nbJours?: number;
  typeAbsence?: string;
  observations?: string;
}

export function subscribeDocumentsFH(
  userRef: DocumentReference | null,
  isAdminUser: boolean,
  callback: (items: DocumentFH[]) => void
) {
  const q = isAdminUser || !userRef
    ? query(collection(db, "Documents_fh"), orderBy("date_create", "desc"), limit(200))
    : query(collection(db, "Documents_fh"), where("ref_user", "==", userRef), orderBy("date_create", "desc"), limit(100));

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({
      id: d.id,
      nomDocument: d.data().nom_document as string,
      typeDocument: d.data().type_document as string,
      categorieDocument: d.data().categorie_document as string,
      service: d.data().service as string,
      mois: d.data().mois as string,
      debutSemaine: firestoreTimestampToDate(d.data().debut_semaine as Timestamp),
      finSemaine: firestoreTimestampToDate(d.data().fin_semaine as Timestamp),
      dateCreate: firestoreTimestampToDate(d.data().date_create as Timestamp),
      dateSignature: firestoreTimestampToDate(d.data().date_signature as Timestamp),
      refUser: d.data().ref_user as DocumentReference,
      signatureUser: d.data().signature_user as string,
      signatureChefEquipe: d.data().signature_chef_equipe as string,
      signatureResponsable: d.data().signature_responsable as string,
      nomResponsable: d.data().nom_responsable as string,
      etatTraitementDocument: d.data().etat_traitement_document as string,
      nbJours: d.data().nb_jours as number,
      typeAbsence: d.data().type_absence as string,
      observations: d.data().observations as string,
    })));
  });
}

// ============================================
// UTILISATEURS
// ============================================

export function subscribeAllUsers(callback: (users: UserApp[]) => void) {
  const q = query(collection(db, "usersapp"), orderBy("nom"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({
      id: d.id,
      email: (d.data().email as string) ?? "",
      displayName: (d.data().display_name as string) ?? "",
      photoUrl: d.data().photo_url as string,
      uid: (d.data().uid as string) ?? "",
      nom: (d.data().nom as string) ?? "",
      prenom: (d.data().prenom as string) ?? "",
      type: d.data().type as string,
      actif: (d.data().actif as boolean) ?? false,
      lastLogin: firestoreTimestampToDate(d.data().last_login as Timestamp),
      roleapp: d.data().roleapp as UserApp["roleapp"],
      phoneNumber: d.data().phone_number as string,
      service: (d.data().service_appartenance as string) ?? d.data().service as string,
      createdTime: firestoreTimestampToDate(d.data().created_time as Timestamp),
    })));
  });
}

export async function updateUser(
  id: string,
  data: Partial<{
    nom: string; prenom: string; displayName: string;
    phoneNumber: string; type: string; roleapp: string;
    service: string; actif: boolean;
  }>
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.nom !== undefined) mapped.nom = data.nom;
  if (data.prenom !== undefined) mapped.prenom = data.prenom;
  if (data.displayName !== undefined) mapped.display_name = data.displayName;
  if (data.phoneNumber !== undefined) mapped.phone_number = data.phoneNumber;
  if (data.type !== undefined) mapped.type = data.type;
  if (data.roleapp !== undefined) mapped.roleapp = data.roleapp;
  if (data.service !== undefined) mapped.service_appartenance = data.service;
  if (data.actif !== undefined) mapped.actif = data.actif;
  await updateDoc(doc(db, "usersapp", id), mapped);
}

export async function toggleUserActif(id: string, current: boolean): Promise<void> {
  await updateDoc(doc(db, "usersapp", id), { actif: !current });
}
