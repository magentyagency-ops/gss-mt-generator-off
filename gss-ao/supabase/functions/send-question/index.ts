// ════════════════════════════════════════════════════════════════════════════════════════
// Edge Function : send-question — Ticket #3, Phase 2
// ════════════════════════════════════════════════════════════════════════════════════════
// Crée une question interne, compose l'e-mail EXACTEMENT selon le gabarit §11, l'envoie
// (Reply-To: ao+<question_id>@<domaine> = clé du rattachement) et passe le statut à `envoyee`.
//
// Sécurité :
//   • S'exécute avec le JWT de l'utilisateur appelant (client anon + Authorization) → la RLS
//     s'applique : impossible d'écrire au nom d'un autre utilisateur.
//   • user_id = auth.uid() (défaut en base), jamais fourni par le client ; ao_id = dossier réel.
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

  // 1. Récupère le DOSSIER (appel d'offres) — RLS-scoped (ticket #2 : dossiers.user_id).
  //    Le dossier riche est dans `contenu` (jsonb) : on y lit la « Référence » si présente.
  const { data: ao, error: aoErr } = await supabase
    .from('dossiers')
    .select('id, nom, contenu')
    .eq('id', body.ao_id)
    .single();
  if (aoErr || !ao) return jsonResponse({ error: 'dossier_introuvable' }, 404);

  // Mapping gabarit §11 depuis le modèle réel :
  //   Nom du marché = dossiers.nom (ou contenu.objet) ; Référence = contenu.reference sinon id court.
  const contenu = (ao.contenu ?? {}) as Record<string, unknown>;
  const nomMarche = (typeof contenu.objet === 'string' && contenu.objet) || ao.nom;
  const referenceAO = (typeof contenu.reference === 'string' && contenu.reference)
    || `AO-${String(ao.id).slice(0, 8)}`;

  // 2. Insère la question. user_id = auth.uid() (défaut en base) ; RLS with-check re-valide.
  const { data: question, error: insErr } = await supabase
    .from('question_interne')
    .insert({
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
    referenceAO,
    nomMarche,
    critereConcerne: question.critere_concerne,
    question: question.question,
    dateLimite: question.date_limite,
    aoId: referenceAO,
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
