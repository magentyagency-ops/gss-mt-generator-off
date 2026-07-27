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

// ── Apprentissage RAG des réponses reçues (option B) ──────────────────────────────────────
// L'affinage IA + l'indexation dans rag_chunk sont faits par le BACKEND
// (POST /dossiers/:id/sollicitations/learn). Rien ne les déclenche à la réception du mail :
// l'Edge Function inbound-email ne fait qu'enregistrer la réponse. Il faut donc que l'app le
// demande — depuis TOUTE page où une réponse est visible, sinon une réponse lue ailleurs que
// dans la boîte de réception n'est jamais indexée (le cas rencontré).
// Le backend est idempotent (extra.reply_hash) : appeler à chaque chargement est sans risque.
export async function learnReponsesRecues(
  questions: Array<{ ao_id: string; reponse_contenu: string | null }>,
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<void> {
  const dossiers = [...new Set(
    questions.filter((q) => (q.reponse_contenu ?? "").trim() !== "").map((q) => q.ao_id),
  )];
  for (const aoId of dossiers) {
    try {
      await apiFetch(`/api/dossiers/${aoId}/sollicitations/learn`, { method: "POST" });
    } catch (e) {
      // Best-effort : un échec n'empêche pas l'affichage. On le TRACE quand même — l'échec
      // silencieux d'origine rendait l'absence d'indexation impossible à diagnostiquer.
      console.warn(`[sollicitations] apprentissage RAG échoué pour le dossier ${aoId}`, e);
    }
  }
}
