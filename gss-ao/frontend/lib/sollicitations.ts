// ════════════════════════════════════════════════════════════════════════════════════════
// Client Supabase + types + mapping d'affichage — Ticket #3 (feature « Sollicitation interne »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Le front n'avait aucun client Supabase jusqu'ici (maquette v1). On l'ajoute UNIQUEMENT pour
// cette feature. Variables publiques attendues (cf. frontend/.env.local.example) :
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Client navigateur (singleton). Renvoie null si l'env n'est pas configuré (maquette). */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

// ── Modèle (miroir de la table question_interne) ─────────────────────────────────────────
export type QuestionStatut =
  | "a_envoyer"
  | "envoyee"
  | "reponse_en_attente"
  | "reponse_recue"
  | "validee"
  | "bloquante";

export interface QuestionInterne {
  id: string;
  organisation_id: string;
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

export interface AppelOffres {
  id: string;
  organisation_id: string;
  reference: string;
  nom_marche: string;
}

// ── Mapping ASCII (base) → libellés accentués (UI). Voir migration : pas d'accents en base. ──
export const STATUT_LABEL: Record<QuestionStatut, string> = {
  a_envoyer: "À envoyer",
  envoyee: "Envoyée",
  reponse_en_attente: "Réponse en attente",
  reponse_recue: "Réponse reçue",
  validee: "Validée",
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
