// src/types/index.ts
// Types TypeScript mappés depuis les schémas Firestore de Flutter
// Chaque type correspond à une collection Firestore

import { DocumentReference, Timestamp } from "firebase/firestore";

// ============================================
// ENUMS (mappés depuis lib/backend/schema/enums/enums.dart)
// ============================================

export type Roleapp = "SuperAdmin" | "Admin" | "Utilisateur";

export type EtatChantier = "En attente" | "A planifier" | "Planifié";

export type EtatFacturation = "Facturé" | "Non facturé" | "Non facturable";

export type EtatSignature = "Signé" | "Non signé";

export type EtatQuitus = "Envoyé" | "Non envoyé";

export type EtatOperation =
  | "A planifier"
  | "En attente"
  | "Travaux finis"
  | "Clos"
  | "A compléter";

export type TypeFeuillesHeures =
  | "Plomberie"
  | "Electricité"
  | "SAV"
  | "Atelier"
  | "Dessin"
  | "Magasin";

export type Service =
  | "Comptabilité"
  | "RH"
  | "Magasin"
  | "SAV"
  | "Conducteur travaux"
  | "Bureau d'étude"
  | "Travaux"
  | "Chiffrage";

// ============================================
// COLLECTION: usersapp
// ============================================

export interface UserApp {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  uid: string;
  createdTime?: Date;
  nom: string;
  prenom: string;
  type?: string;
  actif: boolean;
  lastLogin?: Date;
  roleapp?: Roleapp;
  phoneNumber?: string;
  phonePerso?: string;
  phonePro?: string;
  phoneType?: "Pro" | "Perso";
  emailType?: "Pro" | "Perso";
  service?: Service;
  forfaitJour?: string;
  adresseDepart?: string;
  adresseDepartLat?: number;
  adresseDepartLon?: number;
}

// ============================================
// COLLECTION: Operation (= Chantiers)
// ============================================

export interface Operation {
  id: string;
  nomChantier: string;
  numChantier: string;
  conducteurTravaux?: DocumentReference | string;
  dateCreate?: Date;
  etatChantier: EtatChantier | string;
  createPar?: DocumentReference | string;
}

// ============================================
// COLLECTION: logements
// ============================================

export interface Logement {
  id: string;
  numLogement: string;
  nomOccupant: string;
  telOccupant?: string;
  mailOccupant?: string;
  logementOccupe: boolean;
  batimentRef?: DocumentReference | string;
  etageLogement?: number;
  roleContact?: string;
  operationRef?: DocumentReference | string;
  typeContact?: string;
  nomTypeContact?: DocumentReference | string;
  dateCreate?: Date;
  createPar?: DocumentReference | string;
  etatChantier?: EtatChantier | string;
  etatQuitus?: EtatQuitus | string;
  etatFacturation?: EtatFacturation | string;
  etatSignature?: EtatSignature | string;
  prioritaire?: boolean;
}

// ============================================
// COLLECTION: planning
// ============================================

export interface Planning {
  id: string;
  refUsers?: DocumentReference | string;
  statutRdv?: string;
  dateRdv?: Date;
  signatureClient?: string;
  nomClientSignataire?: string;
  dateSignatureClient?: Date;
  signatureTechnicien?: string;
  dateSignatureTechnicien?: Date;
  heureDebutInter?: Date;
  heureFinInter?: Date;
  presenceOccupant?: string;
  quitusPdf?: string;
  prenomClientSignature?: string;
  logementRef?: DocumentReference | string;
  operationRef?: DocumentReference | string;
}

// ============================================
// COLLECTION: batiment
// ============================================

export interface Batiment {
  id: string;
  nomBatiment?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  operationRef?: DocumentReference | string;
  dateCreate?: Date;
  createPar?: DocumentReference | string;
}

// ============================================
// COLLECTION: notifications
// ============================================

export interface Notification {
  id: string;
  titre?: string;
  message?: string;
  dateCreate?: Date;
  lu?: boolean;
  destinataire?: DocumentReference | string;
  type?: string;
  refDocument?: string;
}

// ============================================
// COLLECTION: messagerie
// ============================================

export interface Messagerie {
  id: string;
  nomDiscussion?: string;
  participants?: (DocumentReference | string)[];
  dateCreate?: Date;
  dernierMessage?: string;
  dateDernierMessage?: Date;
  nbMessagesNonLus?: number;
}

// ============================================
// COLLECTION: messages_messagerie
// ============================================

export interface MessageMessagerie {
  id: string;
  messagerieRef?: DocumentReference | string;
  auteur?: DocumentReference | string;
  contenu?: string;
  dateEnvoi?: Date;
  type?: "texte" | "image" | "video";
  mediaUrl?: string;
  lu?: boolean;
}

// ============================================
// COLLECTION: journal_interne
// ============================================

export interface JournalInterne {
  id: string;
  titre?: string;
  contenu?: string;
  auteur?: DocumentReference | string;
  dateCreate?: Date;
  destinataires?: (DocumentReference | string)[];
  pieceJointe?: string;
  important?: boolean;
}

// ============================================
// COLLECTION: feuilles_heures
// ============================================

export interface FeuillesHeures {
  id: string;
  typeFeuilleHeure?: TypeFeuillesHeures;
  dateDebut?: Date;
  dateFin?: Date;
  technicien?: DocumentReference | string;
  operationRef?: DocumentReference | string;
  statut?: string;
  totalHeures?: number;
  dateCreate?: Date;
}

// ============================================
// COLLECTION: relances
// ============================================

export interface Relance {
  id: string;
  logementRef?: DocumentReference | string;
  planningRef?: DocumentReference | string;
  dateRelance?: Date;
  motif?: string;
  createPar?: DocumentReference | string;
  dateCreate?: Date;
}

// ============================================
// COLLECTION: acteurs_autre
// ============================================

export interface ActeursAutre {
  id: string;
  nom?: string;
  prenom?: string;
  societe?: string;
  role?: string;
  telephone?: string;
  email?: string;
  operationRef?: DocumentReference | string;
  dateCreate?: Date;
}

// ============================================
// CONSTANTES (mappées depuis app_constants.dart)
// ============================================

export const LISTE_ETATS: EtatOperation[] = [
  "A planifier",
  "En attente",
  "Travaux finis",
  "Clos",
  "A compléter",
];

export const LISTE_SERVICES: Service[] = [
  "Comptabilité",
  "RH",
  "Magasin",
  "SAV",
  "Conducteur travaux",
  "Bureau d'étude",
  "Travaux",
  "Chiffrage",
];

export const LISTE_ETAT_FACTURATION: EtatFacturation[] = [
  "Facturé",
  "Non facturé",
  "Non facturable",
];

export const LISTE_ETAT_SIGNATURE: EtatSignature[] = ["Signé", "Non signé"];

export const LISTE_ETAT_QUITUS: EtatQuitus[] = ["Envoyé", "Non envoyé"];

export const LISTE_ETAT_CHANTIER: EtatChantier[] = [
  "En attente",
  "A planifier",
  "Planifié",
];

export const LISTE_TYPES_FH: TypeFeuillesHeures[] = [
  "Plomberie",
  "Electricité",
  "SAV",
  "Atelier",
  "Dessin",
  "Magasin",
];
