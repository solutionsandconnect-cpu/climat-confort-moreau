// src/lib/planningService.ts
// Requêtes Firestore pour la collection planning

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  Timestamp,
  DocumentReference,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";

export interface PlanningItem {
  id: string;
  refUsers?: DocumentReference;
  dateRdv?: Date;
  heureRdv?: Date;
  heureFinRdv?: Date;
  descriptifTravaux?: string;
  affectationPlanning?: string;
  statutRdv?: string;
  logementRef?: DocumentReference;
  operationRef?: DocumentReference;
  // Résolu côté client
  technicienNom?: string;
}

// Souscription aux plannings d'une date donnée
export function subscribePlanningByDate(
  date: Date,
  callback: (items: PlanningItem[]) => void
) {
  // On normalise la date au début de journée
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "Planning"),
    where("date_rdv", ">=", Timestamp.fromDate(start)),
    where("date_rdv", "<=", Timestamp.fromDate(end)),
    orderBy("date_rdv"),
    orderBy("heure_rdv")
  );

  return onSnapshot(q, async (snap) => {
    const items: PlanningItem[] = snap.docs.map((d) => ({
      id: d.id,
      refUsers: d.data().ref_users as DocumentReference | undefined,
      dateRdv: firestoreTimestampToDate(d.data().date_rdv as Timestamp),
      heureRdv: firestoreTimestampToDate(d.data().heure_rdv as Timestamp),
      heureFinRdv: firestoreTimestampToDate(d.data().heure_fin_rdv as Timestamp),
      descriptifTravaux: d.data().descriptif_travaux as string,
      affectationPlanning: d.data().affectation_planning as string,
      statutRdv: d.data().statut_rdv as string,
      logementRef: d.data().logement_ref as DocumentReference | undefined,
      operationRef: d.data().operation_ref as DocumentReference | undefined,
    }));
    callback(items);
  });
}

// Suppression d'un planning
export async function deletePlanning(id: string): Promise<void> {
  await deleteDoc(doc(db, "Planning", id));
}

// Récupère le nom du technicien depuis sa ref
export async function getTechnicienNom(
  ref: DocumentReference
): Promise<string> {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return "Inconnu";
    const data = snap.data();
    return (data.display_name as string) || `${data.prenom} ${data.nom}` || "Inconnu";
  } catch {
    return "Inconnu";
  }
}
