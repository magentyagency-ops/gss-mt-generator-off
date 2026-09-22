import { DateEcheance, Lot, SourceMeta } from './common';

export enum TypePiece {
  CANDIDATURE = 'candidature',
  OFFRE = 'offre',
}

export interface PieceAFournir {
  nom: string;
  type: TypePiece;
  obligatoire: boolean;
  alternative: string | null;
  ref_texte: string | null;
}

export interface SousCritere {
  libelle: string;
  points: number;
  lots: number[];
}

export interface CriteresNotation {
  valeur_technique_pts: number;
  prix_pts: number;
  sous_criteres: SousCritere[];
}

export interface Visite {
  prevue: boolean;
  obligatoire: boolean | null;
  dates: DateEcheance[];
  lieu: string | null;
  ref_texte: string | null;
}

/** Personne à joindre pour la consultation (point 6 des retours GSS).
 *  Tous les champs sont facultatifs : un RC peut n'indiquer qu'une adresse générique. */
export interface Contact {
  nom: string | null;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  ref_texte: string | null;
}

export interface ModalitesRemise {
  plateforme: string | null;
  signature_formats: string[];
  date_limite: DateEcheance | null;
}

export interface RCDocument {
  objet: string | null;
  acheteur: string | null;
  ccag: string | null;
  cpv: string[];
  duree: string | null;
  allotissement: Lot[];
  visite: Visite;
  /** Facultatif : absent des RC qui n'indiquent aucun interlocuteur, et du parseur de repli. */
  contact?: Contact | null;
  pieces_candidature: PieceAFournir[];
  pieces_offre: PieceAFournir[];
  criteres: CriteresNotation | null;
  modalites_remise: ModalitesRemise;
  source: SourceMeta;
  analyse_risques?: { titre: string; detail: string; type: "warning" | "destructive" | "primary" }[];
}
