// src/lib/logementService.ts
// Toutes les opérations Firestore liées à un logement

import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";
import type { Logement, Batiment, Planning } from "@/types";

// ============================================
// LOGEMENT
// ============================================

export function subscribeLogement(
  id: string,
  callback: (logement: Logement | null) => void
) {
  return onSnapshot(doc(db, "Logements", id), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(mapLogement(snap.id, snap.data()));
  });
}

export async function updateLogement(
  id: string,
  data: {
    numLogement?: string;
    nomOccupant?: string;
    telOccupant?: string;
    mailOccupant?: string;
    roleContact?: string;
    typeContact?: string;
    etageLogement?: number;
    logementOccupe?: boolean;
    batimentRef?: DocumentReference | null;
    etatChantier?: string;
    etatFacturation?: string;
    etatSignature?: string;
    etatQuitus?: string;
    prioritaire?: boolean;
  }
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.numLogement !== undefined) mapped.num_logement = data.numLogement;
  if (data.nomOccupant !== undefined) mapped.nom_occupant = data.nomOccupant;
  if (data.telOccupant !== undefined) mapped.tel_occupant = data.telOccupant;
  if (data.mailOccupant !== undefined) mapped.mail_occupant = data.mailOccupant;
  if (data.roleContact !== undefined) mapped.role_contact = data.roleContact;
  if (data.typeContact !== undefined) mapped.type_contact = data.typeContact;
  if (data.etageLogement !== undefined) mapped.etage_logement = data.etageLogement;
  if (data.logementOccupe !== undefined) mapped.logement_occupe = data.logementOccupe;
  if (data.batimentRef !== undefined) mapped.batiment_ref = data.batimentRef;
  if (data.etatChantier !== undefined) mapped.etat_chantier = data.etatChantier;
  if (data.etatFacturation !== undefined) mapped.etat_facturation = data.etatFacturation;
  if (data.etatSignature !== undefined) mapped.etat_signature = data.etatSignature;
  if (data.etatQuitus !== undefined) mapped.etat_quitus = data.etatQuitus;
  if (data.prioritaire !== undefined) mapped.priorite_logement = data.prioritaire;
  await updateDoc(doc(db, "Logements", id), mapped);
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
    roleContact: data.role_contact as string | undefined,
    typeContact: data.type_contact as string | undefined,
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
// BÂTIMENT lié au logement
// ============================================

export async function getBatiment(id: string): Promise<Batiment | null> {
  const snap = await getDoc(doc(db, "Batiment", id));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    nomBatiment: snap.data().nom_batiment as string,
    adresse: ((snap.data().adresse_batiment ?? snap.data().adresse) as string) || "",
    codePostal: ((snap.data().code_postale_batiment ?? snap.data().code_postal) as string) || "",
    ville: ((snap.data().ville_batiment ?? snap.data().ville) as string) || "",
    operationRef: snap.data().operation_ref as DocumentReference,
  };
}

export async function getBatimentsForOperation(
  operationRef: DocumentReference
): Promise<Batiment[]> {
  // Flutter schema uses 'ref_operation', fallback to 'operation_ref'
  let snap = await getDocs(
    query(collection(db, "Batiment"), where("ref_operation", "==", operationRef))
  );
  if (snap.empty) {
    snap = await getDocs(
      query(collection(db, "Batiment"), where("operation_ref", "==", operationRef))
    );
  }
  return snap.docs.map((d) => ({
    id: d.id,
    nomBatiment: d.data().nom_batiment as string,
    adresse: ((d.data().adresse_batiment ?? d.data().adresse) as string) || "",
    codePostal: ((d.data().code_postale_batiment ?? d.data().code_postal) as string) || "",
    ville: ((d.data().ville_batiment ?? d.data().ville) as string) || "",
    operationRef: (d.data().ref_operation ?? d.data().operation_ref) as DocumentReference,
  }));
}

// ============================================
// PLANNING lié au logement
// ============================================

export interface PlanningLogement {
  id: string;
  dateRdv?: Date;
  heureRdv?: Date;
  heureFinRdv?: Date;
  statutRdv?: string;
  descriptifTravaux?: string;
  technicienNom?: string;
  signatureClient?: string;
  signatureTechnicien?: string;
  refUsers?: DocumentReference;
}

export function subscribePlanningByLogement(
  logementId: string,
  callback: (items: PlanningLogement[]) => void
) {
  const logRef = doc(db, "Logements", logementId);
  // Pas d'orderBy pour éviter l'index composite Firestore — tri côté client
  const q = query(
    collection(db, "Planning"),
    where("ref_logement", "==", logRef)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({
      id: d.id,
      dateRdv: firestoreTimestampToDate(d.data().date_rdv as Timestamp),
      heureRdv: firestoreTimestampToDate(d.data().heure_rdv as Timestamp),
      heureFinRdv: firestoreTimestampToDate(d.data().heure_fin_rdv as Timestamp),
      statutRdv: d.data().statut_rdv as string,
      descriptifTravaux: d.data().descriptif_travaux as string,
      typeDemande: d.data().type_demande as string,
      signatureClient: d.data().signature_client as string,
      signatureTechnicien: d.data().signature_technicien as string,
      refUsers: d.data().ref_users as DocumentReference | undefined,
    }));
    // Tri côté client : plus récent en premier
    items.sort((a, b) => (b.dateRdv?.getTime() ?? 0) - (a.dateRdv?.getTime() ?? 0));
    callback(items);
  }, (err) => {
    console.warn("subscribePlanningByLogement error:", err.message);
    callback([]);
  });
}

// ============================================
// RELANCES liées au logement
// ============================================

export interface RelanceLogement {
  id: string;
  dateRelance?: Date;
  motif?: string;
  createParNom?: string;
}

export function subscribeRelancesByLogement(
  logementId: string,
  callback: (items: RelanceLogement[]) => void
) {
  const logRef = doc(db, "Logements", logementId);
  const q = query(
    collection(db, "relances"),
    where("logement_ref", "==", logRef),
    orderBy("date_create", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        dateRelance: firestoreTimestampToDate(d.data().date_relance as Timestamp),
        motif: d.data().motif as string,
      }))
    );
  });
}
