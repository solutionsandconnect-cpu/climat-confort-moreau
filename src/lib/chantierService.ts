// src/lib/chantierService.ts
// Toutes les opérations Firestore liées à un chantier (Operation)

import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  DocumentReference,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";
import type { Operation, Batiment, Logement, UserApp, ActeursAutre } from "@/types";

// ============================================
// OPÉRATION (Chantier)
// ============================================

export async function getOperation(id: string): Promise<Operation | null> {
  const snap = await getDoc(doc(db, "Operation", id));
  if (!snap.exists()) return null;
  return mapOperation(snap.id, snap.data());
}

export async function updateOperation(
  id: string,
  data: Partial<{ nomChantier: string; numChantier: string; etatChantier: string; conducteurTravaux: DocumentReference }>
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.nomChantier !== undefined) mapped.nom_chantier = data.nomChantier;
  if (data.numChantier !== undefined) mapped.num_chantier = data.numChantier;
  if (data.etatChantier !== undefined) mapped.etat_chantier = data.etatChantier;
  if (data.conducteurTravaux !== undefined) mapped.conducteur_travaux = data.conducteurTravaux;
  await updateDoc(doc(db, "Operation", id), mapped);
}

export async function checkNumChantierExists(
  num: string,
  excludeId: string
): Promise<boolean> {
  const q = query(collection(db, "Operation"), where("num_chantier", "==", num));
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.id !== excludeId);
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
// BÂTIMENTS du chantier
// ============================================

export function subscribeBatiments(
  operationId: string,
  callback: (batiments: Batiment[]) => void
) {
  const operationRef = doc(db, "Operation", operationId);
  // Flutter utilise 'ref_operation', on essaie les deux noms
  const q = query(
    collection(db, "Batiment"),
    where("ref_operation", "==", operationRef)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      // Fallback: essayer operation_ref
      const q2 = query(collection(db, "Batiment"), where("operation_ref", "==", operationRef));
      onSnapshot(q2, s2 => callback(s2.docs.map(d => mapBatiment(d.id, d.data()))));
    } else {
      callback(snap.docs.map((d) => mapBatiment(d.id, d.data())));
    }
  });
}

export async function deleteBatiment(
  batimentId: string,
  operationId: string
): Promise<{ ok: boolean; reason?: string }> {
  // Vérifier s'il y a des logements liés
  const batRef = doc(db, "Batiment", batimentId);
  const logsSnap = await getDocs(
    query(collection(db, "Logements"), where("batiment_ref", "==", batRef))
  );
  if (!logsSnap.empty) {
    return {
      ok: false,
      reason: `Ce bâtiment contient ${logsSnap.size} logement(s). Supprimez-les d'abord.`,
    };
  }
  await deleteDoc(doc(db, "Batiment", batimentId));
  return { ok: true };
}

function mapBatiment(id: string, data: Record<string, unknown>): Batiment {
  return {
    id,
    nomBatiment: data.nom_batiment as string | undefined,
    adresse: ((data.adresse_batiment ?? data.adresse) as string) || undefined,
    codePostal: ((data.code_postale_batiment ?? data.code_postal) as string) || undefined,
    ville: ((data.ville_batiment ?? data.ville) as string) || undefined,
    operationRef: (data.ref_operation ?? data.operation_ref) as DocumentReference | undefined,
    dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
  };
}

// ============================================
// LOGEMENTS du chantier
// ============================================

export function subscribeLogementsByOperation(
  operationId: string,
  callback: (logements: Logement[]) => void
) {
  const operationRef = doc(db, "Operation", operationId);
  const q = query(
    collection(db, "Logements"),
    where("operation_ref", "==", operationRef)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapLogement(d.id, d.data())));
  });
}

export function subscribeLogementsByBatiment(
  batimentId: string,
  callback: (logements: Logement[]) => void
) {
  const batRef = doc(db, "Batiment", batimentId);
  const q = query(
    collection(db, "Logements"),
    where("batiment_ref", "==", batRef)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapLogement(d.id, d.data())));
  });
}

export async function toggleLogementPrioritaire(
  logementId: string,
  current: boolean
): Promise<void> {
  await updateDoc(doc(db, "Logements", logementId), {
    prioritaire: !current,
  });
}

export async function deleteLogement(logementId: string): Promise<void> {
  // Supprimer les plannings liés
  const logRef = doc(db, "Logements", logementId);
  const planSnap = await getDocs(
    query(collection(db, "Planning"), where("ref_logement", "==", logRef))
  );
  await Promise.all(planSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(logRef);
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
    prioritaire: (data.priorite_logement as boolean) ?? false,
  };
}

// ============================================
// ACTEURS du chantier
// ============================================

export function subscribeActeurs(
  operationId: string,
  callback: (acteurs: ActeursAutre[]) => void
) {
  const operationRef = doc(db, "Operation", operationId);
  const q = query(
    collection(db, "Acteurs_autre"),
    where("operation_ref", "==", operationRef)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        nom: d.data().nom as string,
        prenom: d.data().prenom as string,
        societe: d.data().societe as string,
        role: d.data().role as string,
        telephone: d.data().telephone as string,
        email: d.data().email as string,
        operationRef: d.data().operation_ref as DocumentReference,
      }))
    );
  });
}

// ============================================
// CONDUCTEURS DE TRAVAUX (pour le dropdown)
// ============================================

export async function getConducteursTravaux(): Promise<UserApp[]> {
  const snap = await getDocs(
    query(
      collection(db, "usersapp"),
      where("type", "==", "Conducteur de Travaux")
    )
  );
  return snap.docs.map((d) => ({
    id: d.id,
    uid: d.data().uid as string,
    email: d.data().email as string,
    displayName: (d.data().display_name as string) ?? "",
    nom: (d.data().nom as string) ?? "",
    prenom: (d.data().prenom as string) ?? "",
    actif: (d.data().actif as boolean) ?? true,
  }));
}

export async function getConducteurNom(ref: DocumentReference): Promise<string> {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return "Non assigné";
    return (snap.data().display_name as string) ?? "Non assigné";
  } catch {
    return "Non assigné";
  }
}

// ============================================
// CRÉATION CHANTIER
// ============================================

export async function createChantier(data: {
  nomChantier: string;
  numChantier: string;
  conducteurRef?: DocumentReference;
  createParRef: DocumentReference;
}): Promise<string> {
  const { addDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = await addDoc(collection(db, "Operation"), {
    nom_chantier: data.nomChantier,
    num_chantier: data.numChantier,
    conducteur_travaux: data.conducteurRef ?? null,
    create_par: data.createParRef,
    etat_chantier: "En attente",
    date_create: serverTimestamp(),
  });
  return ref.id;
}
