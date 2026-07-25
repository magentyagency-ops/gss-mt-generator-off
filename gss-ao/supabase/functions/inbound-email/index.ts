// ════════════════════════════════════════════════════════════════════════════════════════
// Edge Function : inbound-email — Ticket #3, Phase 3 (LE cœur du risque §15)
// ════════════════════════════════════════════════════════════════════════════════════════
// Webhook PUBLIC recevant le POST du fournisseur à l'arrivée d'une réponse.
//   1. Vérifie l'authenticité (secret partagé) — refuse tout non signé.
//   2. Extrait le question_id (MailboxHash → plus-address → référence dans le corps).
//   3. Rattachement INFAILLIBLE : id absent/inconnu/ambigu → NE rattache RIEN, log propre, 200.
//   4. Réponse stockée à l'état `reponse_recue` — PAS de validation auto (§11.8).
//
// Utilise la clé service_role (canal serveur de confiance, authentifié par la signature du
// fournisseur) qui contourne la RLS de façon légitime. L'infaillibilité vient de la logique :
// on ne touche QUE la ligne dont le question_id correspond exactement.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/cors.ts';
import { parseInbound, verifyInboundAuth } from '../_shared/inbound.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  // 1. Authenticité (fail-closed : pas de secret configuré → refus).
  if (!verifyInboundAuth(req.headers, Deno.env.get('INBOUND_WEBHOOK_SECRET'))) {
    console.warn('[inbound] requête refusée : signature/secret invalide ou absent');
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    console.warn('[inbound] corps JSON invalide (e-mail malformé)');
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  // 2. Extraction robuste du question_id.
  const parsed = parseInbound(payload);

  // 3a. Id ambigu (adresses/références conflictuelles) → on ne rattache RIEN (§15).
  if (parsed.source === 'ambiguous') {
    console.warn('[inbound] références de question CONFLICTUELLES — réponse NON rattachée', {
      from: parsed.fromEmail,
    });
    return jsonResponse({ status: 'ignored', reason: 'ambiguous_question_id' }, 200);
  }

  // 3b. Aucun id exploitable → on ne rattache RIEN (jamais de rattachement « au petit bonheur »).
  if (!parsed.questionId) {
    console.warn('[inbound] aucune référence de question trouvée — réponse NON rattachée', {
      from: parsed.fromEmail,
    });
    return jsonResponse({ status: 'ignored', reason: 'no_question_id' }, 200);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Recherche par question_id (colonne UNIQUE → jamais ambigu).
  const { data: question, error: qErr } = await admin
    .from('question_interne')
    .select('id, statut, ao_id, user_id, critere_concerne')
    .eq('question_id', parsed.questionId)
    .maybeSingle();

  if (qErr) {
    console.error('[inbound] erreur lookup question', qErr.message);
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }

  // 3c. Id inconnu → on ne rattache RIEN.
  if (!question) {
    console.warn('[inbound] question_id inconnu — réponse NON rattachée', {
      questionId: parsed.questionId, source: parsed.source, from: parsed.fromEmail,
    });
    return jsonResponse({ status: 'ignored', reason: 'unknown_question_id' }, 200);
  }

  // 3d. Doublons / états terminaux : ne jamais écraser une réponse déjà validée ni ré-écrire.
  if (question.statut === 'validee') {
    console.info('[inbound] réponse déjà validée — ignorée (pas de régression)', question.id);
    return jsonResponse({ status: 'ignored', reason: 'already_validated' }, 200);
  }
  if (question.statut === 'reponse_recue') {
    console.info('[inbound] réponse déjà reçue — doublon ignoré', question.id);
    return jsonResponse({ status: 'ignored', reason: 'duplicate' }, 200);
  }

  // 4. Rattachement : stocke la réponse, passe à `reponse_recue` (jamais `validee` — §11.8).
  const { error: updErr } = await admin
    .from('question_interne')
    .update({
      reponse_contenu: parsed.replyText,
      reponse_recue_at: new Date().toISOString(),
      statut: 'reponse_recue',
    })
    .eq('id', question.id);

  if (updErr) {
    console.error('[inbound] échec mise à jour', updErr.message);
    return jsonResponse({ error: 'update_failed' }, 500);
  }

  console.info('[inbound] réponse rattachée', {
    questionId: parsed.questionId, source: parsed.source, questionRow: question.id,
  });

  // 5. Apprentissage RAG : la réponse devient une connaissance réutilisable (table rag_chunk),
  //    embeddée et interrogeable par match_rag_chunk. Automatique, sans validation humaine.
  //    Best-effort : un échec ici n'annule PAS le rattachement de la réponse (déjà persisté).
  try {
    await learnFromResponse(admin, {
      questionRowId: question.id,
      aoId: question.ao_id,
      critere: question.critere_concerne,
      text: parsed.replyText,
    });
  } catch (e) {
    console.error('[inbound] apprentissage RAG échoué (réponse tout de même enregistrée) :', (e as Error).message);
  }

  return jsonResponse({
    status: 'attached',
    question_id: parsed.questionId,
    source: parsed.source,
  }, 200);
});

// ── Apprentissage RAG ──────────────────────────────────────────────────────────────────────
// Modèle d'embeddings aligné sur rag_chunk.embedding = vector(1536).
const RAG_EMBEDDING_MODEL = 'text-embedding-3-small';
// Modèle de nettoyage/reformulation de la réponse (configurable ; défaut économique).
const RAG_REFINE_MODEL = Deno.env.get('RAG_REFINE_MODEL') || 'gpt-4o-mini';

/**
 * Passe la réponse brute à l'IA pour en tirer un ÉNONCÉ DE CONNAISSANCE propre : factuel, autonome
 * (compréhensible sans la question), débarrassé des salutations, signatures et bruit d'e-mail.
 * Renvoie '' si la réponse ne contient aucune information exploitable. En cas d'échec IA, on
 * retombe sur le texte brut (best-effort : mieux vaut une connaissance brute que rien).
 */
async function refineAnswer(apiKey: string, critere: string | null, rawText: string): Promise<string> {
  const system =
    "Tu prépares une base de connaissance interne pour GSS (sécurité privée). On te donne une " +
    "question interne et la réponse d'un collègue par e-mail. Reformule la réponse en un texte " +
    "FACTUEL, clair et AUTONOME (compréhensible sans la question), utilisable tel quel dans un " +
    "mémoire technique. Enlève salutations, formules de politesse, signatures et mentions d'e-mail. " +
    "N'ajoute AUCUNE information absente de la réponse. Si la réponse ne contient aucune information " +
    "exploitable, réponds STRICTEMENT par une chaîne vide.";
  const user = `Question interne : "${critere || '(non précisée)'}"\n\nRéponse reçue :\n${rawText}\n\nÉnoncé de connaissance :`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RAG_REFINE_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`chat ${res.status} : ${await res.text()}`);
    const json = await res.json();
    const out = (json.choices?.[0]?.message?.content ?? '').trim();
    return out;
  } catch (e) {
    console.warn('[inbound] nettoyage IA échoué → texte brut conservé :', (e as Error).message);
    return rawText.trim();
  }
}

/** Découpe simple, chevauchante — les réponses d'équipe sont généralement courtes (1 chunk). */
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

/** Embeddings OpenAI (par lot). Renvoie un vecteur par texte. */
async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RAG_EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status} : ${await res.text()}`);
  const json = await res.json();
  return (json.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
}

/**
 * Indexe la réponse d'une sollicitation dans public.rag_chunk (source='SOLLICITATION').
 * chunk_id déterministe (basé sur l'id de la question) → un ré-appel fait un UPSERT, jamais
 * de doublon. Nécessite OPENAI_API_KEY côté Edge Function (sinon on saute proprement).
 */
async function learnFromResponse(
  admin: ReturnType<typeof createClient>,
  p: { questionRowId: string; aoId: string; critere: string | null; text: string },
): Promise<void> {
  if (!(p.text || '').trim()) return;   // réponse vide → rien à apprendre

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.warn('[inbound] OPENAI_API_KEY absent → réponse NON indexée dans le RAG (rattachement OK).');
    return;
  }

  // Nettoyage IA : réponse e-mail brute → énoncé de connaissance propre, avant embedding.
  const refined = await refineAnswer(apiKey, p.critere, p.text);
  const chunks = chunkText(refined);
  if (chunks.length === 0) {
    console.info('[inbound] réponse sans information exploitable → non indexée.', p.questionRowId);
    return;
  }

  const embeddings = await embedTexts(apiKey, chunks);
  const rows = chunks.map((text, i) => ({
    chunk_id: `sollicitation-${p.questionRowId}-${i}`,
    text,
    source: 'SOLLICITATION',
    categorie: p.critere || 'Réponse équipe',
    source_file: `sollicitation:${p.questionRowId}`,
    source_path: `sollicitation/${p.aoId}/${p.questionRowId}`,
    chunk_index: i,
    extra: { ao_id: p.aoId, question_row: p.questionRowId, critere: p.critere },
    embedding: embeddings[i] ? `[${embeddings[i].join(',')}]` : null,
    actif: true,
  }));

  const { error } = await admin.from('rag_chunk').upsert(rows, { onConflict: 'chunk_id' });
  if (error) throw new Error(error.message);
  console.info(`[inbound] réponse indexée dans le RAG (${rows.length} chunk(s)) — question ${p.questionRowId}`);
}
