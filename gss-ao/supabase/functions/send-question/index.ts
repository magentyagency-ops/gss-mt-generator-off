// ════════════════════════════════════════════════════════════════════════════════════════
// Edge Function : send-question — Ticket #3, Phase 2
// ════════════════════════════════════════════════════════════════════════════════════════
// Crée une question interne, compose l'e-mail EXACTEMENT selon le gabarit §11, l'envoie
// (Reply-To: ao+<question_id>@<domaine> = clé du rattachement) et passe le statut à `envoyee`.
//
// Sécurité :
//   • S'exécute avec le JWT de l'utilisateur appelant (client anon + Authorization) → la RLS
//     s'applique : impossible d'écrire hors de son organisation.
//   • L'organisation_id de la question est DÉRIVÉE de l'appel d'offres (jamais du client).
//   • Secrets (clés fournisseur, domaine) uniquement en env — jamais en dur (§14).
//   • Destinataire = paramètre d'entrée (pas de sélection auto pour ce spike §11).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { composeQuestionEmail, sendEmail } from '../_shared/email.ts';

interface SendQuestionBody {
  ao_id: string;
  critere_concerne: string;
  destinataire_email: string;
  question: string;
  exigence_id?: string;
  destinataire_nom?: string;
  categorie?: string;
  niveau_criticite?: string;
  contexte?: string;
  date_limite?: string; // 'YYYY-MM-DD'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  // Client scoping RLS : exécute au nom de l'utilisateur (son JWT) → isolation §14 garantie.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

  let body: SendQuestionBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  // Validation des champs obligatoires du §9/§11.
  const missing = ['ao_id', 'critere_concerne', 'destinataire_email', 'question']
    .filter((k) => !((body as Record<string, unknown>)[k]));
  if (missing.length) return jsonResponse({ error: 'missing_fields', fields: missing }, 400);

  // 1. Récupère l'AO (RLS-scoped) → référence, nom marché, organisation_id de confiance.
  const { data: ao, error: aoErr } = await supabase
    .from('appel_offres')
    .select('id, organisation_id, reference, nom_marche')
    .eq('id', body.ao_id)
    .single();
  if (aoErr || !ao) return jsonResponse({ error: 'appel_offres_introuvable' }, 404);

  // 2. Insère la question (organisation_id dérivé de l'AO ; RLS with-check re-valide l'appartenance).
  const { data: question, error: insErr } = await supabase
    .from('question_interne')
    .insert({
      organisation_id: ao.organisation_id,
      ao_id: ao.id,
      exigence_id: body.exigence_id ?? null,
      critere_concerne: body.critere_concerne,
      destinataire_email: body.destinataire_email,
      destinataire_nom: body.destinataire_nom ?? null,
      categorie: body.categorie ?? null,
      niveau_criticite: body.niveau_criticite ?? 'interne',
      contexte: body.contexte ?? null,
      question: body.question,
      date_limite: body.date_limite ?? null,
      statut: 'a_envoyer',
    })
    .select('*')
    .single();
  if (insErr || !question) {
    return jsonResponse({ error: 'insert_refuse', detail: insErr?.message }, 403);
  }

  // 3. Compose l'e-mail (gabarit §11) + Reply-To plus-addressé.
  const domaine = Deno.env.get('INBOUND_EMAIL_DOMAIN') || 'exemple-domaine.invalid';
  const email = composeQuestionEmail({
    referenceAO: ao.reference,
    nomMarche: ao.nom_marche,
    critereConcerne: question.critere_concerne,
    question: question.question,
    dateLimite: question.date_limite,
    aoId: ao.reference,
    questionId: question.question_id,
    domaine,
  });
  email.to = question.destinataire_email;
  email.toName = question.destinataire_nom ?? undefined;

  // 4. Envoi (dry-run si aucun fournisseur configuré).
  const send = await sendEmail(email);

  // Erreur d'envoi réelle (fournisseur configuré mais en échec) → on NE passe pas à `envoyee`.
  if (!send.sent && !send.dryRun) {
    return jsonResponse({
      error: 'envoi_echoue', detail: send.error,
      question, email: { subject: email.subject, replyTo: email.replyTo },
    }, 502);
  }

  // 5. Passage de statut → `envoyee` (envoi réel OU dry-run réussi).
  const { data: updated } = await supabase
    .from('question_interne')
    .update({ statut: 'envoyee' })
    .eq('id', question.id)
    .select('*')
    .single();

  return jsonResponse({
    ok: true,
    question: updated ?? question,
    email: { subject: email.subject, replyTo: email.replyTo },
    send, // { sent, provider, dryRun?, providerMessageId? }
  });
});
