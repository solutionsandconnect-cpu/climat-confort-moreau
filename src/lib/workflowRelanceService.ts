// src/lib/workflowRelanceService.ts
// Workflow de relance client en 4 phases avec notifications planifiées

import {
  collection, query, where, onSnapshot, addDoc, updateDoc, getDocs,
  doc, serverTimestamp, Timestamp, DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";

export interface WorkflowRelance {
  id: string;
  planningId: string;
  statut: "actif" | "arrete";
  datePhase1?: Date;
  dateRelance2?: Date;
  dateRelance3?: Date;
  dateRelance4?: Date;
  nomContact?: string;
  telContact?: string;
  mailContact?: string;
  numLogement?: string;
  quitusNumero?: string;
  noteInitiale?: string;
  notifPhase2Id?: string;
  notifPhase3Id?: string;
  notifPhase4Id?: string;
  dateArret?: Date;
  dateCreate?: Date;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function lancerWorkflow(params: {
  planningId: string;
  logementRef?: DocumentReference;
  nomContact: string;
  telContact: string;
  mailContact: string;
  numLogement: string;
  quitusNumero: string;
  noteInitiale: string;
  createParRef: DocumentReference;
  targetUserRef: DocumentReference;
}): Promise<string> {
  const now = new Date();
  const date2 = addDays(now, 7);
  const date3 = addDays(now, 12);
  const date4 = addDays(now, 17);
  const planRef = doc(db, "Planning", params.planningId);

  const baseNotif = (action: string, label: string, detail: string, date: Date) => ({
    refUsers: params.targetUserRef,
    type_notification: `Relance — ${label}`,
    notification: `${detail} — ${params.quitusNumero || "Intervention"} · Log. ${params.numLogement}${params.nomContact ? ` · ${params.nomContact}` : ""}`,
    etat_notification: "Non lue",
    date_declenchement: Timestamp.fromDate(date),
    date_create: serverTimestamp(),
    aller_vers_page: "Intervention",
    planning_id: params.planningId,
    workflow_action: action,
  });

  const [n2, n3, n4] = await Promise.all([
    addDoc(collection(db, "Notifications"), baseNotif("relance_appel", "Rappel téléphonique", "Rappeler le client par téléphone", date2)),
    addDoc(collection(db, "Notifications"), baseNotif("relance_mail_manuel", "Email manuel", "Envoyer un email de relance au client", date3)),
    addDoc(collection(db, "Notifications"), baseNotif("relance_mail_auto", "Email automatique", "Envoyer l'email automatique de relance", date4)),
  ]);

  const ref = await addDoc(collection(db, "Workflow_relance"), {
    planning_ref: planRef,
    logement_ref: params.logementRef ?? null,
    statut: "actif",
    date_phase1: serverTimestamp(),
    date_relance_2: Timestamp.fromDate(date2),
    date_relance_3: Timestamp.fromDate(date3),
    date_relance_4: Timestamp.fromDate(date4),
    nom_contact: params.nomContact,
    tel_contact: params.telContact,
    mail_contact: params.mailContact,
    num_logement: params.numLogement,
    quitus_numero: params.quitusNumero,
    note_initiale: params.noteInitiale,
    notif_phase2_id: n2.id,
    notif_phase3_id: n3.id,
    notif_phase4_id: n4.id,
    create_par: params.createParRef,
    date_create: serverTimestamp(),
  });

  return ref.id;
}

export async function arreterWorkflowByPlanning(planningId: string): Promise<void> {
  const planRef = doc(db, "Planning", planningId);
  const snap = await getDocs(query(
    collection(db, "Workflow_relance"),
    where("planning_ref", "==", planRef),
    where("statut", "==", "actif")
  ));
  await Promise.all(snap.docs.map(async d => {
    const data = d.data();
    const ids = [data.notif_phase2_id, data.notif_phase3_id, data.notif_phase4_id].filter(Boolean) as string[];
    await Promise.all(ids.map(nid =>
      updateDoc(doc(db, "Notifications", nid), {
        etat_notification: "Lue",
        notification: `[RDV PRIS — RELANCES ANNULÉES] ${data.nom_contact ?? ""}`,
        date_lecture: serverTimestamp(),
      }).catch(() => {})
    ));
    await updateDoc(d.ref, { statut: "arrete", date_arret: serverTimestamp() });
  }));
}

export function subscribeWorkflowByPlanning(
  planningId: string,
  callback: (w: WorkflowRelance | null) => void
) {
  const planRef = doc(db, "Planning", planningId);
  const q = query(collection(db, "Workflow_relance"), where("planning_ref", "==", planRef));
  return onSnapshot(
    q,
    snap => {
      if (snap.empty) { callback(null); return; }
      const docs = snap.docs.sort((a, b) =>
        ((b.data().date_create as Timestamp)?.toMillis() ?? 0) - ((a.data().date_create as Timestamp)?.toMillis() ?? 0)
      );
      const d = docs[0];
      const data = d.data();
      callback({
        id: d.id,
        planningId,
        statut: data.statut as "actif" | "arrete",
        datePhase1: firestoreTimestampToDate(data.date_phase1 as Timestamp),
        dateRelance2: firestoreTimestampToDate(data.date_relance_2 as Timestamp),
        dateRelance3: firestoreTimestampToDate(data.date_relance_3 as Timestamp),
        dateRelance4: firestoreTimestampToDate(data.date_relance_4 as Timestamp),
        nomContact: data.nom_contact as string,
        telContact: data.tel_contact as string,
        mailContact: data.mail_contact as string,
        numLogement: data.num_logement as string,
        quitusNumero: data.quitus_numero as string,
        noteInitiale: data.note_initiale as string,
        notifPhase2Id: data.notif_phase2_id as string,
        notifPhase3Id: data.notif_phase3_id as string,
        notifPhase4Id: data.notif_phase4_id as string,
        dateArret: firestoreTimestampToDate(data.date_arret as Timestamp),
        dateCreate: firestoreTimestampToDate(data.date_create as Timestamp),
      });
    },
    err => {
      console.error("subscribeWorkflowByPlanning error:", err);
      callback(null);
    }
  );
}
