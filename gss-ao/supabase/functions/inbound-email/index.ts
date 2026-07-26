// ════════════════════════════════════════════════════════════════════════════════════════
// Edge Function : inbound-email — Ticket #3, Phase 3 (LE cœur du risque §15)
// ════════════════════════════════════════════════════════════════════════════════════════
// Webhook PUBLIC recevant le POST du fournisseur à l'arrivée d'une réponse.
//   1. Vérifie l'authenticité (secret partagé) — refuse tout non signé.
//   2. Extrait le question_id (MailboxHash → plus-address → référence dans le corps).
//   3. Rattachement INFAILLIBLE : id absent/inconnu/ambigu → NE rattache RIEN, log propre, 200.
//   4. Réponse stockée et VALIDÉE AUTOMATIQUEMENT (`validee`) + apprise dans le RAG, sans clic humain.
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
    .select('id, statut, ao_id, user_id, critere_concerne, reponse_contenu')
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

  // 3d. Anti-doublon de RELIVRAISON uniquement : le fournisseur peut livrer 2× le MÊME e-mail.
  //     On ignore SEULEMENT si le texte reçu est STRICTEMENT identique à celui déjà enregistré.
  //     Toute réponse au contenu DIFFÉRENT (même sur une question déjà validée) est ré-apprise :
  //     les échanges successifs ENRICHISSENT le RAG au lieu d'être bloqués (chunk_id par contenu).
  const incoming = (parsed.replyText || '').trim();
  if (incoming && incoming === (question.reponse_contenu || '').trim()) {
    console.info('[inbound] réponse identique déjà enregistrée — rien à réindexer', question.id);
    return jsonResponse({ status: 'ignored', reason: 'duplicate_identical' }, 200);
  }

  // 4. Rattachement : stocke la réponse et VALIDE AUTOMATIQUEMENT (statut `validee`).
  //    Plus de validation manuelle ; chaque nouvelle réponse est apprise dans le RAG (étape 5).
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from('question_interne')
    .update({
      reponse_contenu: parsed.replyText,
      reponse_recue_at: now,
      statut: 'validee',
    })
    .eq('id', question.id);

  if (updErr) {
    console.error('[inbound] échec mise à jour', updErr.message);
    return jsonResponse({ error: 'update_failed' }, 500);
  }

  console.info('[inbound] réponse rattachée', {
    questionId: parsed.questionId, source: parsed.source, questionRow: question.id,
  });

  // 5. Apprentissage RAG : PLUS FAIT ICI (option B). L'affinage IA + l'indexation dans rag_chunk
  //    sont désormais réalisés par le BACKEND (endpoint /dossiers/:id/sollicitations/learn), qui
  //    possède déjà la clé OpenAI et l'accès RAG. L'Edge Function se limite à RATTACHER la réponse.
  return jsonResponse({
    status: 'attached',
    question_id: parsed.questionId,
    source: parsed.source,
  }, 200);
});
