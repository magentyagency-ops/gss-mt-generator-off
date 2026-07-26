// ════════════════════════════════════════════════════════════════════════════════════════
// Types + mapping d'affichage — Ticket #3 (feature « Sollicitation interne »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Le client Supabase est celui livré par le ticket #2 : `@/lib/supabase/client` (createClient).
// On NE duplique PAS de client ici.

// ── Modèle (miroir de la table question_interne — branchée sur profiles/dossiers) ──────────
export type QuestionStatut =
  | "a_envoyer"
  | "envoyee"
  | "reponse_en_attente"
  | "reponse_recue"
  | "validee"
  | "bloquante";

export interface QuestionInterne {
  id: string;
  user_id: string;
  ao_id: string;
  exigence_id: string | null;
  critere_concerne: string;
  question_id: string;
  destinataire_email: string;
  destinataire_nom: string | null;
  categorie: string | null;
  niveau_criticite: string;
  contexte: string | null;
  question: string;
  date_limite: string | null;
  statut: QuestionStatut;
  reponse_contenu: string | null;
  reponse_recue_at: string | null;
  nb_relances: number;
  created_at: string;
  updated_at: string;
}

/** Dossier (appel d'offres) — table réelle du ticket #2 (public.dossiers). */
export interface Dossier {
  id: string;
  nom: string;
  contenu?: Record<string, unknown> | null;
}

// ── Mapping ASCII (base) → libellés accentués (UI). Voir migration : pas d'accents en base. ──
export const STATUT_LABEL: Record<QuestionStatut, string> = {
  a_envoyer: "À envoyer",
  envoyee: "Envoyée",
  reponse_en_attente: "Réponse en attente",
  reponse_recue: "Réponse reçue",
  validee: "Intégrée au RAG",
  bloquante: "Bloquante",
};

export type BadgeVariant =
  | "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

export const STATUT_BADGE: Record<QuestionStatut, BadgeVariant> = {
  a_envoyer: "outline",
  envoyee: "secondary",
  reponse_en_attente: "warning",
  reponse_recue: "success",
  validee: "default",
  bloquante: "destructive",
};

// Vocabulaire §11.1 (base ASCII → libellé). CHECK en base : public/interne/deductible/facultatif/bloquant
export const CRITICITE_LABEL: Record<string, string> = {
  public: "Public",
  interne: "Interne",
  deductible: "Déductible",
  facultatif: "Facultatif",
  bloquant: "Bloquant",
};
export const CRITICITE_OPTIONS = Object.keys(CRITICITE_LABEL);
