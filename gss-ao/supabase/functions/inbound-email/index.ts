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
    .select('id, statut, ao_id, user_id')
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
      reponse_contenu: (parsed.text || '').trim(),
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
  return jsonResponse({
    status: 'attached',
    question_id: parsed.questionId,
    source: parsed.source,
  }, 200);
});
