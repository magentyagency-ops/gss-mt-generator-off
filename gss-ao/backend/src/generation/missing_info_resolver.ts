// ════════════════════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DES INFORMATIONS MANQUANTES — Brief §3 « Que faire s'il manque une information ? »
// ════════════════════════════════════════════════════════════════════════════════════════
// PISTE D'AMÉLIORATION — STUBS NON IMPLÉMENTÉS (présents pour figurer la feature, cf. cahier des
// charges « Outil Mémoire Technique », juin 2026).
//
// Principe (brief) : quand un champ ressort « [À COMPLÉTER] », l'outil NE DOIT PAS se bloquer. Selon
// la nature de l'information manquante :
//   🌐  PUBLIQUE  (ex. SIRET / adresse / forme juridique du CLIENT)  → la CHERCHER sur Internet et
//       l'insérer automatiquement dans le mémoire.
//   ✉️  INTERNE   (ex. nom du dirigeant GSS, n° d'agrément dirigeant) → la DEMANDER à l'équipe par
//       email ; dès que la personne répond, la réponse s'intègre au mémoire.
//
// État actuel : aucune des deux voies n'est branchée (pas de dépendance recherche web ni SMTP). Ces
// fonctions sont des points d'entrée typés + TODO, à implémenter lors d'une itération ultérieure.
// Désactivé par défaut côté pipeline (env RESOLVE_MISSING_INFO=true pour activer la passe — qui reste
// un no-op tant que les TODO ci-dessous ne sont pas implémentés).

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getSettings } from '../core/config';

/** Modèle utilitaire (le petit) pour la classification — même défaut que llmExtractor.ts. */
const CLASSIFY_MODEL = process.env.EXTRACTION_MODEL || 'gpt-5.4-mini';

/** Nature d'une information manquante (oriente vers web public ou demande interne). */
export type MissingInfoKind = 'public' | 'internal' | 'unknown';

/** Un champ resté « [À COMPLÉTER] » à l'issue de la génération. */
export interface MissingField {
  id: number;
  label: string;     // libellé/question du champ (ce qui est demandé)
  context: string;   // contexte complet du champ (section, tableau, etc.)
}

/** Résultat de résolution d'un champ manquant. */
export interface ResolvedInfo {
  id: number;
  value: string | null;                 // valeur trouvée (sinon null → reste [À COMPLÉTER])
  source: 'web' | 'team' | 'none';      // d'où vient la valeur
  pending?: boolean;                     // true si une demande équipe a été envoyée, en attente de réponse
}

/**
 * Classe une info manquante : PUBLIQUE (cherchable sur le web — identité du CLIENT/acheteur) vs
 * INTERNE (connue seulement d'un membre GSS — dirigeant, n° d'agrément dirigeant, coordonnées).
 * Heuristique de départ (affinable) ; sert à aiguiller vers searchPublicInfo ou requestInfoFromTeam.
 */
export function classifyMissingInfo(label: string, context = ''): MissingInfoKind {
  const n = `${label} ${context}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Identité d'une personne GSS / donnée interne → demande à l'équipe.
  if (/dirigeant|gerant|representant legal|agrement dirigeant|nom du signataire/.test(n)) return 'internal';
  // Identité administrative du CLIENT/acheteur → potentiellement publique (registre des entreprises).
  if (/(acheteur|client|donneur d.ordre).*(siret|siren|adresse|forme juridique|naf|ape)|siret|siren|kbis|forme juridique/.test(n)) return 'public';
  return 'unknown';
}

const CLASSIFY_SYSTEM_PROMPT =
  "Tu classes des informations manquantes d'un mémoire de réponse à un appel d'offres. Pour chaque " +
  "champ, décide s'il est EXTERNE (public, vérifiable par recherche internet : SIRET, SIREN, forme " +
  "juridique, KBIS, adresse de siège, dirigeants publics d'une entreprise tierce/acheteur, " +
  "certifications publiques, données publiées) ou INTERNE (connu seulement de l'entreprise qui répond " +
  "ou d'un humain : effectif dédié, moyens, méthodologie, prix, références, capacité, intentions, " +
  "signataire interne). En cas de doute, réponds INTERNE.";

/**
 * Classifieur LLM BATCHÉ (1 seul appel pour tout le lot) : décide EXTERNE ('public') vs INTERNE
 * ('internal') pour chaque champ manquant. Remplace l'heuristique regex `classifyMissingInfo`, qui
 * ne sert plus que de FILET DE SECOURS si l'appel LLM échoue.
 *
 * Robustesse « en cas de doute → INTERNE » : tout champ dont l'id n'est pas renvoyé, ou dont la
 * décision est absente/invalide, retombe sur 'internal'. Si l'appel LLM entier échoue (API, JSON
 * illisible), fallback champ par champ sur la regex `classifyMissingInfo` ('public' conservé, sinon
 * 'internal'). Ne lève jamais.
 */
export async function classifyFieldsLLM(fields: MissingField[]): Promise<Map<number, 'public' | 'internal'>> {
  const result = new Map<number, 'public' | 'internal'>();
  if (fields.length === 0) return result; // aucun champ → aucun appel LLM

  const regexFallback = (): Map<number, 'public' | 'internal'> => {
    const m = new Map<number, 'public' | 'internal'>();
    for (const f of fields) {
      const kind = classifyMissingInfo(f.label, f.context) === 'public' ? 'public' : 'internal';
      m.set(f.id, kind);
      console.log(`[classifyFieldsLLM] champ ${f.id} → ${kind} (origine: fallback regex)`);
    }
    return m;
  };

  const key = getSettings().openaiApiKey;
  if (!key) {
    console.warn('[classifyFieldsLLM] OPENAI_API_KEY absente → fallback regex.');
    return regexFallback();
  }

  try {
    const client = new OpenAI({ apiKey: key });
    const userPayload = fields.map((f) => ({ id: f.id, label: f.label, context: f.context }));
    const completion = await client.chat.completions.create({
      model: CLASSIFY_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Champs à classer (JSON) :\n' +
            JSON.stringify(userPayload) +
            '\n\nRéponds UNIQUEMENT par un objet JSON de la forme ' +
            '{"classifications":[{"id":<number>,"decision":"externe"|"interne"}]}.',
        },
      ],
      temperature: 0.1,
    });
    const content = completion.choices[0].message.content || '{}';
    const data = JSON.parse(content);
    const decided = new Map<number, 'public' | 'internal'>();
    if (Array.isArray(data?.classifications)) {
      for (const c of data.classifications) {
        if (typeof c?.id !== 'number') continue;
        const kind = c?.decision === 'externe' ? 'public' : c?.decision === 'interne' ? 'internal' : null;
        if (kind) decided.set(c.id, kind);
      }
    }
    // Règle du doute : id non renvoyé ou décision invalide → 'internal'.
    for (const f of fields) {
      const kind = decided.get(f.id) ?? 'internal';
      result.set(f.id, kind);
      console.log(`[classifyFieldsLLM] champ ${f.id} → ${kind} (origine: LLM)`);
    }
    return result;
  } catch (e) {
    console.warn(`[classifyFieldsLLM] appel LLM échoué (${(e as Error)?.message}) → fallback regex.`);
    return regexFallback();
  }
}

/** Résultat structuré d'une recherche web publique (Perplexity), ou null si rien de sourcé. */
export interface PublicSearchResult {
  answer: string;
  citations: string[];   // URLs sources — au moins 1 obligatoire (règle « 0 inventé »)
  model: string;
  rawUsage: unknown;     // objet `usage` brut de Perplexity (tokens, coût éventuel)
}

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'sonar';
const PERPLEXITY_TIMEOUT_MS = 20000;

/**
 * Extrait les URLs de citation d'une réponse Perplexity (`citations` et/ou `search_results`).
 * Exporté pour testabilité.
 */
export function extractCitations(data: any): string[] {
  const fromCitations = Array.isArray(data?.citations)
    ? data.citations.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '')
    : [];
  const fromResults = Array.isArray(data?.search_results)
    ? data.search_results
        .map((r: any) => r?.url)
        .filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  return [...new Set([...fromCitations, ...fromResults])];
}

/**
 * Construit un PublicSearchResult à partir d'une réponse brute Perplexity — ou null.
 * RÈGLE « 0 INVENTÉ » : null si réponse vide OU s'il n'y a AUCUNE citation. Exporté pour testabilité.
 */
export function groundedResultFromPerplexity(data: any, model = PERPLEXITY_MODEL): PublicSearchResult | null {
  const answer = (data?.choices?.[0]?.message?.content ?? '').trim();
  const citations = extractCitations(data);
  if (!answer || citations.length === 0) return null;   // jamais de réponse sans source
  return { answer, citations, model, rawUsage: data?.usage ?? null };
}

/**
 * Recherche d'une information PUBLIQUE sur Internet via l'API Perplexity (modèle `sonar`).
 * RÈGLE ABSOLUE « 0 inventé » : ne renvoie une réponse QUE si Perplexity fournit au moins une
 * citation. Sinon → null. Erreurs (clé absente, 401, timeout, rate limit) : log clair + null,
 * sans jamais casser l'appelant.
 */
export async function searchPublicInfo(
  query: string,
  sollicitationId: string | null = null,
  dossierId: string | null = null,
): Promise<PublicSearchResult | null> {
  const key = getSettings().perplexityApiKey;
  if (!key) {
    console.warn('[searchPublicInfo] PERPLEXITY_API_KEY absente → null (aucune recherche).');
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);
  try {
    const res = await fetch(PERPLEXITY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          { role: 'system', content: "Réponds de façon concise et factuelle, uniquement à partir de sources vérifiables." },
          { role: 'user', content: query },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[searchPublicInfo] Perplexity HTTP ${res.status} → null. ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const result = groundedResultFromPerplexity(data, PERPLEXITY_MODEL);
    if (!result) {
      console.info('[searchPublicInfo] réponse sans citation → null (règle « 0 inventé »).');
      return null;
    }
    // Traçabilité (non bloquante) : un échec d'insertion ne casse pas le retour.
    await logRechercheWeb(query, result, sollicitationId, dossierId).catch((e) =>
      console.warn('[searchPublicInfo] insertion recherche_web échouée (non bloquant):', (e as Error)?.message));
    return result;
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError' ? 'timeout' : (e as Error)?.message;
    console.warn(`[searchPublicInfo] échec appel Perplexity (${msg}) → null.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Client Supabase service_role (backend de confiance, contourne la RLS) — null si non configuré. */
function adminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

/**
 * Anti-doublon : true s'il existe déjà, pour ce (dossier, champ=query), une recherche
 * 'en_attente_validation' ou 'validee'. Dans ce cas on NE relance PAS. Non bloquant.
 */
export async function hasActiveRecherche(dossierId: string | null, query: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin || !dossierId) return false;
  const { data, error } = await admin
    .from('recherche_web')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('query', query)
    .in('statut', ['en_attente_validation', 'validee'])
    .limit(1);
  if (error) {
    console.warn('[searchPublicInfo] anti-doublon check échoué (non bloquant):', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function logRechercheWeb(
  query: string,
  r: PublicSearchResult,
  sollicitationId: string | null = null,
  dossierId: string | null = null,
): Promise<void> {
  const admin = adminClient();
  if (!admin) {
    console.info('[searchPublicInfo] traçabilité désactivée (SUPABASE_URL/SERVICE_ROLE_KEY absents).');
    return;
  }
  // Coût de l'appel : Perplexity le fournit dans usage.cost.total_cost (ex. 0.00506).
  const totalCost = (r.rawUsage as any)?.cost?.total_cost;
  const { error } = await admin.from('recherche_web').insert({
    query,
    answer: r.answer,
    citations: r.citations,
    model: r.model,
    cost_usd: typeof totalCost === 'number' ? totalCost : null,
    sollicitation_id: sollicitationId,
    dossier_id: dossierId,
  });
  if (error) throw error;
}

/**
 * [STUB] Envoie un email à l'équipe GSS pour obtenir une information INTERNE (ex. nom du dirigeant),
 * et crée un suivi ; à la réponse, la valeur devra être réinjectée dans le mémoire.
 * TODO: brancher un envoi SMTP (nodemailer) + un magasin de tickets (id de suivi) + un webhook/relance
 * pour intégrer la réponse au document une fois reçue.
 */
export async function requestInfoFromTeam(_field: MissingField, _dossierId: string): Promise<{ sent: boolean; ticketId?: string }> {
  // Non implémenté : pas d'envoi d'email branché pour l'instant.
  return { sent: false };
}

/**
 * Orchestrateur (brief §3) — phase 2a. GATÉ par le flag RESOLVE_MISSING_INFO (OFF par défaut).
 *
 *  • FLAG OFF (défaut) → NO-OP STRICT : aucune classification, aucune recherche, aucune écriture,
 *    aucun effet de bord. Chaque champ ressort « non résolu » → génération STRICTEMENT INCHANGÉE.
 *  • FLAG ON → pour chaque champ : classifyMissingInfo() ; si 'public' → searchPublicInfo() dont le
 *    résultat sourcé est TRACÉ dans recherche_web (statut « en_attente_validation »). RIEN n'est
 *    injecté dans le dossier ici : on renvoie value=null + pending=true (validation humaine = 2b).
 *    Aucune citation → null → rien stocké, champ « non résolu ».
 */
export async function resolveMissingInfo(
  fields: MissingField[],
  dossierId: string,
  sollicitationId: string | null = null,
): Promise<ResolvedInfo[]> {
  // FLAG OFF → NO-OP STRICT (zéro régression, zéro effet de bord).
  if (!getSettings().resolveMissingInfoEnabled) {
    return fields.map((f) => ({ id: f.id, value: null, source: 'none' as const }));
  }

  // Classification LLM batchée : UN SEUL appel pour tout le lot (regex = filet de secours interne).
  const kinds = await classifyFieldsLLM(fields);

  const out: ResolvedInfo[] = [];
  for (const f of fields) {
    const kind = kinds.get(f.id) ?? 'internal';
    if (kind === 'public') {
      // Anti-doublon : si une recherche 'en_attente_validation'/'validee' existe déjà pour
      // ce (dossier, champ), on NE relance PAS (évite les appels + lignes redondantes).
      if (await hasActiveRecherche(dossierId, f.label)) {
        out.push({ id: f.id, value: null, source: 'web', pending: true });
        continue;
      }
      // Recherche web + traçabilité « en attente » ; JAMAIS d'injection automatique ici (value=null).
      const r = await searchPublicInfo(f.label, sollicitationId, dossierId);
      out.push({ id: f.id, value: null, source: r ? 'web' : 'none', pending: r ? true : undefined });
    } else if (kind === 'internal') {
      const { sent } = await requestInfoFromTeam(f, dossierId);
      out.push({ id: f.id, value: null, source: 'none', pending: sent });
    } else {
      out.push({ id: f.id, value: null, source: 'none' });
    }
  }
  return out;
}
