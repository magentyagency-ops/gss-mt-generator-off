// ════════════════════════════════════════════════════════════════════════════════════════
// VERROU DE GÉNÉRATION — « pas de mémoire tant qu'il reste des informations manquantes »
// ════════════════════════════════════════════════════════════════════════════════════════
// Le blocage n'existait QUE dans l'UI (bouton désactivé dans /dossiers/:id/memoire), calculé par
// une simple SOUSTRACTION de compteurs : nbManques − (réponses reçues + recherches validées).
// Deux défauts :
//   • aucune barrière côté serveur → POST /dce/:id/memoire générait quoi qu'il arrive (onglet resté
//     ouvert, rechargement, appel direct, front pas encore rafraîchi) ;
//   • le compte ne dit RIEN sur QUELS champs sont couverts : « Demander à l'équipe » groupe N champs
//     dans UNE seule sollicitation, et une recherche web validée peut porter sur un champ déjà
//     couvert → les compteurs pouvaient s'égaliser alors que des champs restaient sans réponse.
//
// Ici, la résolution est calculée CHAMP PAR CHAMP, et c'est cette fonction qui fait autorité :
//   • champ couvert par une recherche web `validee` (recherche_web.champ_id = numéro du champ) ;
//   • champ couvert par une sollicitation dont la réponse est arrivée (statut `reponse_recue` /
//     `validee`, ou `reponse_contenu` non vide). Le rattachement se fait par `exigence_id`, qui
//     porte la liste des ids de champs couverts par l'e-mail groupé ; repli sur le libellé pour les
//     lignes créées avant ce rattachement.

import { getScopedClient } from '../core/supabase';
import { DB } from '../core/db';

/** Un champ manquant tel que persisté dans dossier.memoire_cadre_state.missingFields. */
export interface GateField {
  id: string;
  label: string;
  criticite?: string;
  demande?: string;
}

export interface GateStatus {
  /** true → la génération est autorisée (plus aucun champ manquant non résolu). */
  canGenerate: boolean;
  /** Nombre de champs manquants détectés à l'analyse du DCE. */
  total: number;
  /** Nombre de champs effectivement couverts (réponse équipe ou recherche web validée). */
  resolved: number;
  /** Champs encore sans réponse — c'est ce qui bloque. */
  unresolved: GateField[];
  /** true si l'analyse des infos manquantes n'a jamais tourné (rien à opposer → pas de blocage). */
  notAnalyzed: boolean;
}

/** « req-12 » → 12. Les recherches web stockent le champ ciblé sous forme d'entier (champ_id). */
function fieldNumber(id: string): number | null {
  const m = String(id).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

/** Normalisation d'un libellé pour le repli de rattachement par texte (lignes sans exigence_id). */
function normLabel(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Ids de champs couverts par une sollicitation. `exigence_id` porte soit un id unique (« req-3 »),
 * soit la liste des ids d'un envoi groupé (« req-3,req-4,req-6 »), cf. requestInfoFromTeamBulk.
 */
export function coveredFieldIds(exigenceId: string | null): string[] {
  if (!exigenceId) return [];
  return String(exigenceId)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Calcule l'état du verrou pour un dossier. Ne lève jamais sur les tables annexes : si la lecture
 * des sollicitations ou des recherches échoue, on considère simplement ces sources comme vides
 * (le verrou reste FERMÉ — on ne débloque jamais la génération sur une erreur de lecture).
 */
export async function getGenerationGate(dossierId: string): Promise<GateStatus> {
  const dossier = await DB.getDossier(dossierId);
  const raw = (dossier as any)?.memoire_cadre_state?.missingFields;

  // Analyse jamais faite → aucun manque connu : ce verrou n'a rien à dire (l'accès à l'écran de
  // génération est déjà conditionné à l'analyse côté UI).
  if (!Array.isArray(raw)) {
    return { canGenerate: true, total: 0, resolved: 0, unresolved: [], notAnalyzed: true };
  }

  const fields: GateField[] = raw
    .filter((f: any) => f && String(f.label ?? '') !== '')
    .map((f: any) => ({
      id: String(f.id),
      label: String(f.label ?? ''),
      criticite: f.criticite,
      demande: f.demande,
    }));

  if (fields.length === 0) {
    return { canGenerate: true, total: 0, resolved: 0, unresolved: [], notAnalyzed: false };
  }

  const supabase = getScopedClient();

  // ── Sollicitations répondues → ids de champs couverts + libellés (repli) ────────────────
  const answeredIds = new Set<string>();
  const answeredLabels = new Set<string>();
  try {
    const { data } = await supabase
      .from('question_interne')
      .select('exigence_id, critere_concerne, statut, reponse_contenu')
      .eq('ao_id', dossierId);
    for (const q of (data as any[]) ?? []) {
      const repondu =
        q.statut === 'reponse_recue' || q.statut === 'validee' || String(q.reponse_contenu ?? '').trim() !== '';
      if (!repondu) continue;
      for (const fid of coveredFieldIds(q.exigence_id)) answeredIds.add(fid);
      if (q.critere_concerne) answeredLabels.add(normLabel(q.critere_concerne));
    }
  } catch (e) {
    console.warn('[generationGate] lecture des sollicitations échouée :', (e as Error)?.message);
  }

  // ── Recherches web validées → numéros de champs couverts ────────────────────────────────
  const validatedNums = new Set<number>();
  try {
    const { data } = await supabase
      .from('recherche_web')
      .select('champ_id, statut')
      .eq('dossier_id', dossierId)
      .eq('statut', 'validee');
    for (const r of (data as any[]) ?? []) {
      if (typeof r.champ_id === 'number') validatedNums.add(r.champ_id);
    }
  } catch (e) {
    console.warn('[generationGate] lecture des recherches web échouée :', (e as Error)?.message);
  }

  const unresolved = fields.filter((f) => {
    if (answeredIds.has(f.id)) return false;
    if (answeredLabels.has(normLabel(f.label))) return false;   // repli lignes sans exigence_id
    const n = fieldNumber(f.id);
    if (n !== null && validatedNums.has(n)) return false;
    return true;
  });

  return {
    canGenerate: unresolved.length === 0,
    total: fields.length,
    resolved: fields.length - unresolved.length,
    unresolved,
    notAnalyzed: false,
  };
}
