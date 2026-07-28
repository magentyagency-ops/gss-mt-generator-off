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
const CLASSIFY_MODEL = process.env.EXTRACTION_MODEL || 'gpt-5.6-luna';

/** Même délai que la génération de mémoire (5 min) : un « Request timed out » ici fait rejouer la
 *  détection des besoins et duplique les sollicitations. */
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 300_000;

/** Nature d'une information manquante (oriente vers web public ou demande interne). */
export type MissingInfoKind = 'public' | 'internal' | 'unknown';

/** Un champ resté « [À COMPLÉTER] » à l'issue de la génération. */
export interface MissingField {
  id: string;
  label: string;     // libellé/question du champ (ce qui est demandé)
  context: string;   // contexte complet du champ (section, tableau, etc.)
}

/** Résultat de résolution d'un champ manquant. */
export interface ResolvedInfo {
  id: string;
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
  // Certifications, qualifications, agréments DE GSS (APSAD, MASE, ISO, SSIAP, CNAPS…) → interne.
  if (/certifi|apsad|mase|ssiap|agrement|habilitation|conformite|qualification|accreditation/.test(n)) return 'internal';
  // Identité administrative du CLIENT/acheteur → potentiellement publique (registre des entreprises).
  if (/(acheteur|client|donneur d.ordre).*(siret|siren|adresse|forme juridique|naf|ape)|siret|siren|kbis|forme juridique/.test(n)) return 'public';
  return 'unknown';
}

const CLASSIFY_SYSTEM_PROMPT =
  "Tu classes des informations manquantes d'un mémoire de réponse à un appel d'offres pour GSS " +
  "(entreprise de sécurité privée). Pour chaque champ, décide s'il est EXTERNE (public, vérifiable " +
  "par recherche internet : SIRET, SIREN, forme juridique, KBIS, adresse de siège, dirigeants " +
  "publics d'une entreprise TIERCE/acheteur, données publiées d'organismes tiers) ou INTERNE (connu " +
  "seulement de GSS ou d'un humain GSS). ATTENTION : les certifications, qualifications, agréments, " +
  "habilitations et conformités DE GSS (ex. APSAD, MASE, ISO, SSIAP, agrément CNAPS…) sont TOUJOURS " +
  "INTERNES — seule GSS sait si elle les détient. De même : effectif dédié, moyens, méthodologie, " +
  "prix, références, capacité, intentions, signataire interne. En cas de doute, réponds INTERNE.";

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
export async function classifyFieldsLLM(fields: MissingField[]): Promise<Map<string, 'public' | 'internal'>> {
  const result = new Map<string, 'public' | 'internal'>();
  if (fields.length === 0) return result; // aucun champ → aucun appel LLM

  const regexFallback = (): Map<string, 'public' | 'internal'> => {
    const m = new Map<string, 'public' | 'internal'>();
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
    const client = new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
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
            '{"classifications":[{"id":<string>,"decision":"externe"|"interne"}]}.',
        },
      ],
      temperature: 1,
    });
    const content = completion.choices[0].message.content || '{}';
    const data = JSON.parse(content);
    const decided = new Map<string, 'public' | 'internal'>();
    if (Array.isArray(data?.classifications)) {
      for (const c of data.classifications) {
        if (typeof c?.id !== 'string') continue;
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
  champId: string | null = null,
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
    await logRechercheWeb(query, result, sollicitationId, dossierId, champId).catch((e) =>
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

/** Une personne de l'annuaire (pour le routage des questions internes). */
export interface Personne { id: string; nom: string; fonction: string; email: string; }

/**
 * Moteur de décision « QUI ENVOYER » (brief §11). Pour CHAQUE question interne, l'IA choisit la
 * personne la PLUS ADAPTÉE de l'annuaire (d'après sa FONCTION). Renvoie une Map field.id → personne.id.
 * Robuste : sans clé OpenAI, ou en cas d'échec, renvoie une map vide → l'appelant retombe sur un
 * destinataire par défaut. Ne lève jamais.
 */
export async function matchQuestionsToPeople(
  fields: MissingField[],
  people: Personne[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (fields.length === 0 || people.length === 0) return result;

  const key = getSettings().openaiApiKey;
  if (!key) {
    console.warn('[matchQuestionsToPeople] OPENAI_API_KEY absente → aucun routage (destinataire par défaut).');
    return result;
  }
  try {
    const client = new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
    const questions = fields.map((f) => ({ id: f.id, question: f.label, contexte: f.context }));
    const annuaire = people.map((p) => ({ id: p.id, nom: p.nom, fonction: p.fonction }));
    const completion = await client.chat.completions.create({
      model: CLASSIFY_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Tu affectes des questions internes d'une entreprise de sécurité privée (GSS) aux bonnes personnes. " +
            "On te donne une liste de PERSONNES (avec leur fonction) et une liste de QUESTIONS. Pour CHAQUE question, " +
            "choisis l'id de la personne DONT LA FONCTION est la plus pertinente pour y répondre. Une question = une " +
            "personne. Si aucune personne n'est clairement adaptée, choisis la plus plausible. N'invente pas d'id.",
        },
        {
          role: 'user',
          content:
            'PERSONNES (JSON) :\n' + JSON.stringify(annuaire) +
            '\n\nQUESTIONS (JSON) :\n' + JSON.stringify(questions) +
            '\n\nRéponds UNIQUEMENT par un objet JSON : {"affectations":[{"question_id":<string>,"personne_id":<string>}]}.',
        },
      ],
      temperature: 1,
    });
    const data = JSON.parse(completion.choices[0].message.content || '{}');
    const validIds = new Set(people.map((p) => p.id));
    if (Array.isArray(data?.affectations)) {
      for (const a of data.affectations) {
        if (typeof a?.question_id === 'string' && typeof a?.personne_id === 'string' && validIds.has(a.personne_id)) {
          result.set(a.question_id, a.personne_id);
        }
      }
    }
    return result;
  } catch (e) {
    console.warn(`[matchQuestionsToPeople] échec LLM (${(e as Error)?.message}) → routage par défaut.`);
    return result;
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
  champId: string | null = null,
): Promise<void> {
  const admin = adminClient();
  if (!admin) {
    console.info('[searchPublicInfo] traçabilité désactivée (SUPABASE_URL/SERVICE_ROLE_KEY absents).');
    return;
  }
  // Coût de l'appel : Perplexity le fournit dans usage.cost.total_cost (ex. 0.00506).
  const totalCost = (r.rawUsage as any)?.cost?.total_cost;
  // Niveau de confiance (0..1) : proportion de citations par rapport à une CIBLE configurable
  // (RECHERCHE_WEB_CONFIANCE_CIBLE, jamais en dur). Plus il y a de sources concordantes, plus la
  // confiance est élevée ; plafonnée à 1.
  const cible = Math.max(1, parseInt(process.env.RECHERCHE_WEB_CONFIANCE_CIBLE || '3', 10) || 3);
  const niveauConfiance = Math.min(1, (r.citations?.length || 0) / cible);
  let parsedChampId: number | null = null;
  if (champId !== null && champId !== undefined) {
    const match = String(champId).match(/\d+/);
    if (match) {
      parsedChampId = parseInt(match[0], 10);
      if (isNaN(parsedChampId)) parsedChampId = null;
    }
  }
  const { error } = await admin.from('recherche_web').insert({
    query,
    answer: r.answer,
    citations: r.citations,
    model: r.model,
    cost_usd: typeof totalCost === 'number' ? totalCost : null,
    niveau_confiance: niveauConfiance,
    sollicitation_id: sollicitationId,
    dossier_id: dossierId,
    champ_id: parsedChampId, // id stable du champ en entier (cible univoque de l'injection) — cf. migration phase 3
  });
  if (error) throw error;
}

/**
 * Appelle l'Edge Function `send-question` (API atomique : insert `question_interne` + composition
 * e-mail gabarit §11 + envoi Postmark + passage statut → `envoyee`). Exactement le même chemin
 * que `supabase.functions.invoke("send-question")` côté frontend (sollicitations/page.tsx).
 *
 * Mapping : MissingField → SendQuestionBody (contrat de l'Edge Function).
 *
 * Auth : le `authToken` (JWT de l'utilisateur, transmis depuis le endpoint Express) est passé
 * en Bearer à l'Edge Function, qui fait `auth.getUser()` pour isoler le `user_id` (RLS §14).
 * Fallback : `SUPABASE_SERVICE_ROLE_KEY` quand appelé depuis `resolveMissingInfo` (pipeline
 * sans contexte HTTP) — le service_role contourne la RLS côté Edge Function.
 *
 * Ne lève jamais (cohérent avec `searchPublicInfo`).
 */
export async function requestInfoFromTeamBulk(
  fields: MissingField[],
  dossierId: string,
  destinataireEmail?: string,
  authToken?: string,
): Promise<{ sent: boolean; ticketId?: string }> {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl) {
    console.warn('[requestInfoFromTeam] SUPABASE_URL absent → skip.');
    return { sent: false };
  }

  // Destinataire configurable sans recompiler — jamais d'adresse en dur.
  const to = destinataireEmail || process.env.DEFAULT_TEAM_EMAIL;
  if (!to) {
    console.warn('[requestInfoFromTeam] Aucun destinataire (DEFAULT_TEAM_EMAIL absent) → skip.');
    return { sent: false };
  }

  // Token d'auth : JWT utilisateur (priorité) ou service_role (fallback pipeline).
  const bearer = authToken || (supabaseServiceRoleKey ? `Bearer ${supabaseServiceRoleKey}` : '');
  if (!bearer) {
    console.warn('[requestInfoFromTeam] Aucun token d\'auth disponible → skip.');
    return { sent: false };
  }

  // Mapping MissingField[] → SendQuestionBody
  const isSingle = fields.length === 1;
  const labelText = isSingle ? fields[0].label : `Informations manquantes (${fields.length} éléments)`;
  
  const questionText = isSingle 
    ? `Pourriez-vous fournir l'information suivante pour compléter le mémoire technique : ${fields[0].label} ?`
    : `Pourriez-vous fournir les informations suivantes pour compléter le mémoire technique ?\n\n${fields.map(f => `- ${f.label}${f.context ? ` (Contexte: ${f.context})` : ''}`).join('\n')}`;

  const body = {
    ao_id: dossierId,
    // Rattachement CHAMP↔SOLLICITATION : un envoi groupé couvre N champs → on liste leurs ids.
    // C'est ce qui permet au verrou de génération de savoir QUELS manques une réponse couvre
    // (generation_gate.ts), au lieu de comparer des compteurs.
    exigence_id: fields.map((f) => f.id).join(','),
    critere_concerne: labelText,
    destinataire_email: to,
    question: questionText,
    contexte: isSingle ? fields[0].context : undefined,
    niveau_criticite: 'interne',
  };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearer.toLowerCase().startsWith('bearer ') ? bearer : `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn(`[requestInfoFromTeam] send-question HTTP ${res.status}:`, data?.error || data);
      return { sent: false };
    }

    const ticketId = data?.question?.question_id;
    const provider = data?.send?.provider || 'unknown';
    const dryRun = data?.send?.dryRun;
    console.info(
      `[requestInfoFromTeam] question envoyée via ${provider}${dryRun ? ' (dry-run)' : ''}, ticketId=${ticketId}`,
    );
    return { sent: true, ticketId };
  } catch (e) {
    console.warn(`[requestInfoFromTeam] appel send-question échoué: ${(e as Error)?.message}`);
    return { sent: false };
  }
}

/**
 * Reformule un label d'exigence brut (texte du DCE) en une QUESTION de recherche ciblée pour
 * Perplexity. Le label brut (ex. « prestation certifiée APSAD type P2 ou P3 préférable ; contrat
 * conforme APSAD R31 ») est trop technique et mal formulé pour un moteur de recherche conversationnel.
 * On le transforme en question naturelle incluant le contexte (GSS, sécurité privée, appel d'offres).
 *
 * Utilise un appel LLM léger (nano, rapide + pas cher) avec un FALLBACK template en cas d'échec.
 */
async function reformulateForSearch(label: string, context: string = ''): Promise<string> {
  const key = getSettings().openaiApiKey;
  if (!key) {
    // Fallback template : préfixe le label avec une recherche ciblée GSS.
    return `Quelle est la donnée exacte concernant la société GSS (GSS Sécurité Privée en France) pour : ${label} ?`;
  }
  try {
    const client = new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
    const completion = await client.chat.completions.create({
      model: process.env.EXTRACTION_MODEL || 'gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content:
            'Tu es un expert en recherche web d\'informations d\'entreprise pour compléter un mémoire technique d\'appel d\'offres. ' +
            'Ta tâche est de transformer l\'intitulé d\'une information manquante (ex: SIRET, adresse du siège, statut PME, effectif, certifications) ' +
            'en une QUESTION de recherche web ultra-précise, factuelle et directe destinée à Perplexity.\n' +
            'RÈGLES CRUCIALES :\n' +
            '1. Nous voulons trouver la donnée CONCRÈTE, CHIFFRÉE ou FACTUELLE (numéro, date, adresse officielle, oui/non, effectif) concernant l\'entreprise candidate, qui est la société GSS (GSS Sécurité Privée en France), ou concernant le client/marché public.\n' +
            '2. INTERDICTION FORMELLE de poser des questions d\'ordre juridique, réglementaire, général ou théorique (ne demande jamais si c\'est obligatoire dans le DCE, quelles sont les règles du code des marchés, etc.).\n' +
            '3. Exemple pour "SIRET" -> "Quel est le numéro SIRET exact et officiel de la société de sécurité privée GSS (GSS Sécurité) en France ?"\n' +
            '4. Exemple pour "Statut PME" -> "La société GSS Sécurité Privée en France a-t-elle le statut de PME ? Quels sont son effectif et son chiffre d\'affaires ?"\n' +
            '5. Exemple pour "Adresse du siège" -> "Quelle est l\'adresse officielle du siège social de la société GSS Sécurité Privée ?"\n' +
            '6. Exemple pour "Effectif total" -> "Quel est l\'effectif total de la société GSS Sécurité Privée en France ?"\n' +
            'Réponds UNIQUEMENT par la question reformulée, sans guillemets ni commentaire.',
        },
        {
          role: 'user',
          content: `Information manquante à chercher : ${label}${context ? `\nContexte / Raison : ${context}` : ''}`,
        },
      ],
      temperature: 1,
      max_completion_tokens: 200,
    });
    const reformulated = (completion.choices[0].message.content || '').trim();
    if (reformulated && reformulated.length > 10) {
      console.log(`[reformulateForSearch] "${label.slice(0, 60)}…" → "${reformulated.slice(0, 80)}…"`);
      return reformulated;
    }
  } catch (e) {
    console.warn(`[reformulateForSearch] échec LLM (${(e as Error)?.message}) → fallback template.`);
  }
  // Fallback template
  return `Quelle est la donnée exacte concernant la société GSS (GSS Sécurité Privée en France) pour : ${label} ?`;
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
  opts: { forcePublic?: boolean } = {},
): Promise<ResolvedInfo[]> {
  // FLAG OFF → NO-OP STRICT (zéro régression, zéro effet de bord).
  if (!getSettings().resolveMissingInfoEnabled) {
    return fields.map((f) => ({ id: f.id, value: null, source: 'none' as const }));
  }

  // forcePublic : l'appelant a DÉJÀ décidé (moteur de décision : demande='web') que ces champs sont
  // publics → on ne re-classifie PAS (sinon double décision contradictoire → « aucune recherche »).
  const kinds = opts.forcePublic
    ? new Map(fields.map((f) => [f.id, 'public' as const]))
    : await classifyFieldsLLM(fields);

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
      // Reformulation : le label brut (exigence DCE) est un mauvais prompt Perplexity. On le
      // transforme en question ciblée incluant le contexte (GSS, appel d'offres sécurité).
      const searchQuery = await reformulateForSearch(f.label, f.context).catch(() => f.label);
      // Recherche web + traçabilité « en attente » ; JAMAIS d'injection automatique ici (value=null).
      // champ_id = f.id : lien STABLE ligne↔champ (marqueur [CHAMP_<id>]), remplace le lien fragile par label.
      const r = await searchPublicInfo(searchQuery, sollicitationId, dossierId, f.id);
      out.push({ id: f.id, value: null, source: r ? 'web' : 'none', pending: r ? true : undefined });
    } else if (kind === 'internal') {
      out.push({ id: f.id, value: null, source: 'none', pending: false });
    } else {
      out.push({ id: f.id, value: null, source: 'none' });
    }
  }
  return out;
}
