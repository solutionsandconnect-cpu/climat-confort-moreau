// src/lib/formsService.ts
// Services Firestore : Ajout chantier, bâtiment, logement + détails intervention

import {
  collection, addDoc, updateDoc, doc, getDoc, onSnapshot,
  serverTimestamp, query, where, getDocs, Timestamp,
  DocumentReference, orderBy, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { firestoreTimestampToDate } from "./firestore";

// ============================================
// AJOUT CHANTIER
// ============================================

export async function createChantier(data: {
  nomChantier: string;
  numChantier: string;
  conducteurRef?: DocumentReference;
  createParRef: DocumentReference;
}): Promise<string> {
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

// ============================================
// AJOUT BÂTIMENT
// ============================================

export async function createBatiment(data: {
  nomBatiment: string;
  rue: string;
  codePostal: string;
  ville: string;
  operationRef: DocumentReference;
  createParRef: DocumentReference;
}): Promise<string> {
  const ref = await addDoc(collection(db, "Batiment"), {
    nom_batiment: data.nomBatiment,
    adresse: `${data.rue}, ${data.codePostal} ${data.ville}`,
    rue: data.rue,
    code_postal: data.codePostal,
    ville: data.ville,
    operation_ref: data.operationRef,
    create_par: data.createParRef,
    date_create: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBatiment(id: string, data: {
  nomBatiment?: string; rue?: string; codePostal?: string; ville?: string;
}): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.nomBatiment !== undefined) mapped.nom_batiment = data.nomBatiment;
  if (data.rue !== undefined) mapped.rue = data.rue;
  if (data.codePostal !== undefined) mapped.code_postal = data.codePostal;
  if (data.ville !== undefined) mapped.ville = data.ville;
  if (data.rue || data.codePostal || data.ville) {
    const snap = await getDoc(doc(db, "Batiment", id));
    const d = snap.data() ?? {};
    mapped.adresse = `${data.rue ?? d.rue}, ${data.codePostal ?? d.code_postal} ${data.ville ?? d.ville}`;
  }
  await updateDoc(doc(db, "Batiment", id), mapped);
}

// ============================================
// AJOUT LOGEMENT
// ============================================

export async function createLogement(data: {
  numLogement: string;
  nomOccupant: string;
  telOccupant?: string;
  mailOccupant?: string;
  roleContact?: string;
  typeContact?: string;
  etageLogement?: number;
  logementOccupe: boolean;
  batimentRef?: DocumentReference;
  operationRef: DocumentReference;
  createParRef: DocumentReference;
  prioritaire?: boolean;
}): Promise<string> {
  const ref = await addDoc(collection(db, "Logements"), {
    num_logement: data.numLogement,
    nom_occupant: data.nomOccupant,
    tel_occupant: data.telOccupant ?? "",
    mail_occupant: data.mailOccupant ?? "",
    role_contact: data.roleContact ?? "",
    type_contact: data.typeContact ?? "",
    etage_logement: data.etageLogement ?? 0,
    logement_occupe: data.logementOccupe,
    batiment_ref: data.batimentRef ?? null,
    operation_ref: data.operationRef,
    create_par: data.createParRef,
    priorite_logement: data.prioritaire ?? false,
    etat_chantier: "En attente",
    etat_quitus: "Non envoyé",
    etat_facturation: "Non facturé",
    etat_signature: "Non signé",
    date_create: serverTimestamp(),
  });
  return ref.id;
}

// ============================================
// DÉTAILS INTERVENTION (planning)
// ============================================

export interface InterventionDetail {
  id: string;
  dateRdv?: Date;
  heureRdv?: Date;
  heureFinRdv?: Date;
  heureDebutInter?: Date;
  heureFinInter?: Date;
  statutRdv?: string;
  descriptifTravaux?: string;
  typeDemande?: string;
  demandeFacturable?: string;
  tempsAlloue?: number;
  compteRenduTechnicien?: string;
  travauxFinis?: string;
  etatActuel?: string;
  presenceOccupant?: string;
  nomFacturation?: string;
  mailFacturation?: string;
  infosFacturation?: string;
  nomClientSignataire?: string;
  prenomClientSignature?: string;
  signatureClient?: string;
  signatureTechnicien?: string;
  heureArrivee?: string;
  heureDepart?: string;
  dateSignatureClient?: Date;
  dateSignatureTechnicien?: Date;
  quitusPdf?: string;
  numQuitus?: number;
  quitusNumero?: string;
  refUsers?: DocumentReference;
  refLogement?: DocumentReference;
  refOperation?: DocumentReference;
  sousTraitant?: string;
  etatFacturation?: string;
  // résolus
  technicienNom?: string;
  logementNum?: string;
  logementOccupant?: string;
  chantierNom?: string;
  chantierNum?: string;
  nbRelances?: number;
  dateDemande?: Date;
}

export function subscribeIntervention(
  id: string,
  callback: (item: InterventionDetail | null) => void
) {
  return onSnapshot(doc(db, "Planning", id), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    const d = snap.data();
    callback({
      id: snap.id,
      dateRdv: firestoreTimestampToDate(d.date_rdv as Timestamp),
      heureRdv: firestoreTimestampToDate(d.heure_rdv as Timestamp),
      heureFinRdv: firestoreTimestampToDate(d.heure_fin_rdv as Timestamp),
      heureDebutInter: firestoreTimestampToDate(d.heureDebutInter as Timestamp),
      heureFinInter: firestoreTimestampToDate(d.heureFinInter as Timestamp),
      statutRdv: d.statut_rdv as string,
      descriptifTravaux: d.descriptif_travaux as string,
      typeDemande: d.type_demande as string,
      demandeFacturable: d.demande_facturable as string,
      tempsAlloue: d.temps_alloue_demande as number,
      compteRenduTechnicien: d.compte_rendu_technicien as string,
      travauxFinis: d.travaux_finis as string,
      etatActuel: d.etat_actuel as string,
      presenceOccupant: d.presence_occupant as string,
      nomFacturation: d.nom_facturation as string,
      mailFacturation: d.mail_facturation as string,
      infosFacturation: d.infos_facturation as string,
      nomClientSignataire: d.nomClientSignataire as string,
      prenomClientSignature: d.prenomClientSignature as string,
      signatureClient: d.signatureClient as string,
      signatureTechnicien: d.signature_technicien as string,
      heureArrivee: d.heure_arrivee_tech as string | undefined,
      heureDepart: d.heure_depart_tech as string | undefined,
      dateSignatureClient: firestoreTimestampToDate(d.date_signature_client as Timestamp),
      dateSignatureTechnicien: firestoreTimestampToDate(d.date_signature_technicien as Timestamp),
      quitusPdf: d.quitus_pdf as string,
      numQuitus: d.num_quitus as number,
      quitusNumero: d.quitus_numero as string,
      refUsers: d.ref_users as DocumentReference,
      refLogement: d.ref_logement as DocumentReference,
      refOperation: d.ref_operation as DocumentReference,
      sousTraitant: d.sous_traitant_si_pas_tech as string,
      etatFacturation: d.etat_facturation as string,
      dateDemande: firestoreTimestampToDate(d.date_demande as Timestamp),
    });
  });
}

export async function updateIntervention(id: string, data: Partial<{
  statutRdv: string;
  travauxFinis: string;
  presenceOccupant: string;
  compteRenduTechnicien: string;
  etatActuel: string;
  demandeFacturable: string;
  nomFacturation: string;
  mailFacturation: string;
  infosFacturation: string;
  heureDebutInter: Date;
  heureFinInter: Date;
  etatFacturation: string;
}>): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.statutRdv !== undefined) mapped.statut_rdv = data.statutRdv;
  if (data.travauxFinis !== undefined) mapped.travaux_finis = data.travauxFinis;
  if (data.presenceOccupant !== undefined) mapped.presence_occupant = data.presenceOccupant;
  if (data.compteRenduTechnicien !== undefined) mapped.compte_rendu_technicien = data.compteRenduTechnicien;
  if (data.etatActuel !== undefined) mapped.etat_actuel = data.etatActuel;
  if (data.demandeFacturable !== undefined) mapped.demande_facturable = data.demandeFacturable;
  if (data.nomFacturation !== undefined) mapped.nom_facturation = data.nomFacturation;
  if (data.mailFacturation !== undefined) mapped.mail_facturation = data.mailFacturation;
  if (data.infosFacturation !== undefined) mapped.infos_facturation = data.infosFacturation;
  if (data.heureDebutInter !== undefined) mapped.heureDebutInter = Timestamp.fromDate(data.heureDebutInter);
  if (data.heureFinInter !== undefined) mapped.heureFinInter = Timestamp.fromDate(data.heureFinInter);
  if (data.etatFacturation !== undefined) mapped.etat_facturation = data.etatFacturation;
  await updateDoc(doc(db, "Planning", id), mapped);
}

export async function createRelance(data: {
  planningRef: DocumentReference;
  logementRef: DocumentReference;
  motif: string;
  createParRef: DocumentReference;
}): Promise<void> {
  await addDoc(collection(db, "relances"), {
    refPlanning: data.planningRef,
    logement_ref: data.logementRef,
    motif: data.motif,
    create_par: data.createParRef,
    date_create: serverTimestamp(),
    date_relance: serverTimestamp(),
  });
}

export async function countRelances(planningId: string): Promise<number> {
  const planRef = doc(db, "Planning", planningId);
  const snap = await getDocs(query(collection(db, "relances"), where("refPlanning", "==", planRef)));
  return snap.size;
}

export async function resolveUserNom(ref: DocumentReference): Promise<string> {
  try {
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data().display_name as string) ?? "Inconnu" : "Inconnu";
  } catch { return "Inconnu"; }
}

export async function resolveLogementInfo(ref: DocumentReference): Promise<{ num: string; occupant: string }> {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { num: "—", occupant: "—" };
    return { num: snap.data().num_logement as string ?? "—", occupant: snap.data().nom_occupant as string ?? "—" };
  } catch { return { num: "—", occupant: "—" }; }
}

export async function resolveOperationInfo(ref: DocumentReference): Promise<{ nom: string; num: string }> {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { nom: "—", num: "—" };
    return { nom: snap.data().nom_chantier as string ?? "—", num: snap.data().num_chantier as string ?? "—" };
  } catch { return { nom: "—", num: "—" }; }
}

// ============================================
// BÂTIMENT étendu (code interphone + infos accès + date réception)
// ============================================

export async function createBatimentFull(data: {
  nomBatiment: string;
  rue: string;
  codePostal: string;
  ville: string;
  codeInterphone?: string;
  informationsAcces?: string;
  dateReception?: Date;
  operationRef: DocumentReference;
  createParRef: DocumentReference;
}): Promise<string> {
  const ref = await addDoc(collection(db, "Batiment"), {
    nom_batiment: data.nomBatiment,
    adresse_batiment: `${data.rue}, ${data.codePostal} ${data.ville}`,
    rue_batiment: data.rue,
    code_postale_batiment: data.codePostal,
    ville_batiment: data.ville,
    code_interphone: data.codeInterphone ?? "",
    informations_acces: data.informationsAcces ?? "",
    date_reception: data.dateReception ? Timestamp.fromDate(data.dateReception) : null,
    ref_operation: data.operationRef,   // champ Flutter
    operation_ref: data.operationRef,   // champ fallback
    create_par: data.createParRef,
    date_create: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBatimentFull(id: string, data: {
  nomBatiment?: string;
  rue?: string;
  codePostal?: string;
  ville?: string;
  codeInterphone?: string;
  informationsAcces?: string;
  dateReception?: Date | null;
}): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.nomBatiment !== undefined) mapped.nom_batiment = data.nomBatiment;
  if (data.rue !== undefined) mapped.rue_batiment = data.rue;
  if (data.codePostal !== undefined) mapped.code_postale_batiment = data.codePostal;
  if (data.ville !== undefined) mapped.ville_batiment = data.ville;
  if (data.codeInterphone !== undefined) mapped.code_interphone = data.codeInterphone;
  if (data.informationsAcces !== undefined) mapped.informations_acces = data.informationsAcces;
  if (data.dateReception !== undefined) mapped.date_reception = data.dateReception ? Timestamp.fromDate(data.dateReception) : null;
  // Reconstruire adresse
  if (data.rue || data.codePostal || data.ville) {
    const snap = await getDoc(doc(db, "Batiment", id));
    const d = snap.data() ?? {};
    mapped.adresse_batiment = `${data.rue ?? d.rue_batiment}, ${data.codePostal ?? d.code_postale_batiment} ${data.ville ?? d.ville_batiment}`;
  }
  await updateDoc(doc(db, "Batiment", id), mapped);
}
