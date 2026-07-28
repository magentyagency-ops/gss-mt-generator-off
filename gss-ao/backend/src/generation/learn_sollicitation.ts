// ════════════════════════════════════════════════════════════════════════════════════════
// APPRENTISSAGE RAG DES RÉPONSES DE SOLLICITATION — côté BACKEND (option B)
// ════════════════════════════════════════════════════════════════════════════════════════
// Les réponses d'équipe (question_interne.reponse_contenu) arrivent via l'Edge Function
// inbound-email, qui se contente désormais de RATTACHER la réponse (pas d'affinage). C'est le
// BACKEND — qui possède déjà la clé OpenAI et l'accès RAG — qui, à la demande de l'app, affine la
// réponse et l'indexe dans public.rag_chunk (source='SOLLICITATION'). Une seule clé à gérer.
//
// Idempotence SANS migration : on marque chaque connaissance avec extra.reply_hash = hash du texte
// de réponse. Un ré-appel qui retombe sur le MÊME texte est ignoré (déjà indexé) ; un texte DIFFÉRENT
// (échange enrichi) crée de nouveaux chunks au lieu d'écraser les précédents.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getSettings } from '../core/config';

/** Modèles alignés sur le reste du RAG (embedding = celui de la lecture, cf. memoire_generator). */
const REFINE_MODEL = process.env.RAG_REFINE_MODEL || process.env.EXTRACTION_MODEL || 'gpt-5.6-luna';
const EMBED_MODEL = process.env.RAG_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_MEMOIRE || 'text-embedding-3-small';

/** Même délai que la génération de mémoire (5 min) — évite les « Request timed out » sur l'affinage. */
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 300_000;

/** Client service_role (backend de confiance, contourne la RLS) — null si Supabase non configuré. */
function adminClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

/** Petit hash déterministe (djb2) → empreinte stable du texte de réponse. */
function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Découpe chevauchante — les réponses d'équipe sont généralement courtes (1 chunk). */
function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + size, clean.length);
    const piece = clean.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/**
 * Affine la réponse e-mail brute en un ÉNONCÉ DE CONNAISSANCE propre (factuel, autonome, sans
 * salutations/signatures). Renvoie '' si aucune info exploitable. En cas d'échec IA → texte brut
 * (best-effort : mieux vaut une connaissance brute que rien).
 */
async function refineAnswer(openai: OpenAI, critere: string | null, rawText: string): Promise<string> {
  const system =
    "Tu prépares une base de connaissance interne pour GSS (sécurité privée). On te donne une " +
    "question interne et la réponse d'un collègue par e-mail. Reformule la réponse en un texte " +
    "FACTUEL, clair et AUTONOME (compréhensible sans la question), utilisable tel quel dans un " +
    "mémoire technique. Enlève salutations, formules de politesse, signatures et mentions d'e-mail. " +
    "N'ajoute AUCUNE information absente de la réponse. Si la réponse ne contient aucune information " +
    "exploitable, réponds STRICTEMENT par une chaîne vide.";
  const user = `Question interne : "${critere || '(non précisée)'}"\n\nRéponse reçue :\n${rawText}\n\nÉnoncé de connaissance :`;
  try {
    const completion = await openai.chat.completions.create({
      model: REFINE_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return (completion.choices?.[0]?.message?.content ?? '').trim();
  } catch (e) {
    console.warn('[learnSollicitation] affinage IA échoué → texte brut conservé :', (e as Error)?.message);
    return rawText.trim();
  }
}

export interface LearnResult {
  processed: number;   // réponses examinées (avec un contenu)
  indexed: number;     // réponses réellement indexées cette fois
  skipped: number;     // déjà indexées / sans info exploitable
  reason?: string;     // motif global si rien ne s'est fait (ex. missing_openai_key)
  details: Array<{ questionId: string | null; indexed: boolean; reason: string; chunks: number }>;
}

/**
 * Affine + indexe dans le RAG toutes les réponses reçues d'un dossier qui ne le sont pas encore.
 * Idempotent (extra.reply_hash). Ne lève jamais — renvoie un compte-rendu détaillé.
 */
export async function learnSollicitationsForDossier(dossierId: string): Promise<LearnResult> {
  return learnSollicitations({ dossierId });
}

/**
 * Balayage GLOBAL : toutes les réponses reçues, tous dossiers confondus, qui ne sont pas encore
 * dans le RAG. C'est ce qui rend l'apprentissage indépendant de l'app — l'Edge Function
 * inbound-email se contente d'écrire `reponse_contenu`, ce balayage récupère la suite.
 */
export async function learnPendingSollicitations(): Promise<LearnResult> {
  return learnSollicitations({});
}

/** Cœur commun : affine + indexe les réponses reçues (d'un dossier, ou de tous si `dossierId` est absent). */
async function learnSollicitations(opts: { dossierId?: string }): Promise<LearnResult> {
  const { dossierId } = opts;
  const portee = dossierId ? `dossier ${dossierId}` : 'tous dossiers';
  const empty: LearnResult = { processed: 0, indexed: 0, skipped: 0, details: [] };
  const admin = adminClient();
  if (!admin) return { ...empty, reason: 'supabase_not_configured' };

  const apiKey = getSettings().openaiApiKey;
  if (!apiKey) return { ...empty, reason: 'missing_openai_key' };
  const openai = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });

  // Réponses reçues (contenu non nul), filtrées sur le dossier si demandé.
  let query = admin
    .from('question_interne')
    .select('id, question_id, ao_id, critere_concerne, reponse_contenu')
    .not('reponse_contenu', 'is', null);
  if (dossierId) query = query.eq('ao_id', dossierId);
  const { data: rows, error } = await query;
  if (error) return { ...empty, reason: `query_failed: ${error.message}` };

  const result: LearnResult = { processed: 0, indexed: 0, skipped: 0, details: [] };

  for (const row of rows ?? []) {
    const raw = (row.reponse_contenu || '').trim();
    if (!raw) continue;
    result.processed++;
    const hash = contentHash(raw);

    // Déjà indexée pour CE texte exact ? (idempotence sans migration)
    const { data: existing } = await admin
      .from('rag_chunk')
      .select('chunk_id')
      .eq('source_file', `sollicitation:${row.id}`)
      .filter('extra->>reply_hash', 'eq', hash)
      .limit(1);
    if (existing && existing.length > 0) {
      result.skipped++;
      result.details.push({ questionId: row.question_id, indexed: false, reason: 'already_indexed', chunks: 0 });
      continue;
    }

    const refined = await refineAnswer(openai, row.critere_concerne, raw);
    const chunks = chunkText(refined);
    if (chunks.length === 0) {
      result.skipped++;
      result.details.push({ questionId: row.question_id, indexed: false, reason: 'no_usable_content', chunks: 0 });
      continue;
    }

    let embeddings: number[][] | null = null;
    try {
      const resp = await openai.embeddings.create({ model: EMBED_MODEL, input: chunks });
      embeddings = resp.data.map((d) => d.embedding as number[]);
    } catch (e) {
      result.details.push({ questionId: row.question_id, indexed: false, reason: `embed_failed: ${(e as Error)?.message}`, chunks: 0 });
      continue;
    }

    const chunkRows = chunks.map((text, i) => ({
      chunk_id: `sollicitation-${row.id}-${hash}-${i}`,
      text,
      source: 'SOLLICITATION',
      categorie: row.critere_concerne || 'Réponse équipe',
      source_file: `sollicitation:${row.id}`,
      source_path: `sollicitation/${row.ao_id}/${row.id}`,
      chunk_index: i,
      extra: { ao_id: row.ao_id, question_row: row.id, critere: row.critere_concerne, reply_hash: hash },
      embedding: embeddings[i] ? `[${embeddings[i].join(',')}]` : null,
      actif: true,
    }));

    const { error: upErr } = await admin.from('rag_chunk').upsert(chunkRows, { onConflict: 'chunk_id' });
    if (upErr) {
      result.details.push({ questionId: row.question_id, indexed: false, reason: `upsert_failed: ${upErr.message}`, chunks: 0 });
      continue;
    }
    result.indexed++;
    result.details.push({ questionId: row.question_id, indexed: true, reason: 'ok', chunks: chunkRows.length });
  }

  // Le balayage global tourne en boucle : on ne loggue que s'il s'est passé quelque chose.
  // Un appel ciblé (depuis l'app) reste tracé dans tous les cas.
  if (dossierId || result.indexed > 0) {
    console.log(`[learnSollicitation] ${portee} : ${result.indexed} indexée(s), ${result.skipped} ignorée(s) / ${result.processed} réponse(s).`);
  }
  return result;
}
