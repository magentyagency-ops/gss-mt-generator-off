// ════════════════════════════════════════════════════════════════════════════════════════
// Edge Function : inbound-veille — réception des alertes d'appels d'offres
// ════════════════════════════════════════════════════════════════════════════════════════
// Reçoit les e-mails d'alerte (Nukema et assimilés) et les STOCKE, rien de plus.
//
// ⚠️  CLOISONNEMENT STRICT AVEC `inbound-email`
// `inbound-email` porte le rattachement des réponses aux sollicitations — son propre code le
// désigne comme « le cœur du risque ». Cette fonction-ci NE LA TOUCHE PAS, ne partage ni son
// adresse entrante, ni son secret, ni sa table. Les deux flux ne se croisent jamais :
//
//     ao+<question_id>@<domaine>  ──▶  inbound-email   ──▶  question_interne
//     veille@<domaine>            ──▶  inbound-veille  ──▶  veille_alerte
//
// Une règle de routage doit viser l'adresse EXACTE de veille, jamais un motif générique qui
// pourrait capter les réponses de sollicitation.
//
// ⚠️  AUCUN APPEL AU MODÈLE ICI — délibéré. Analyser à la réception ferait payer un appel pour
// chaque message reçu, y compris ceux que personne n'ouvrira jamais. L'analyse est déclenchée
// à la demande par le backend et son résultat mis en cache dans `veille_alerte.parsed`.
//
// Sécurité : secret partagé propre (VEILLE_WEBHOOK_SECRET), fail-closed — sans secret
// configuré, tout est refusé. Filtre d'expéditeurs en complément.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/cors.ts';
import { verifyInboundAuth } from '../_shared/inbound.ts';

/** Expéditeurs acceptés, en clair dans l'env : « nukema.com, alerte@autre.fr ».
 *  Vide → on refuse tout, plutôt que d'accepter tout : une boîte ouverte à tous les vents
 *  remplirait la table et, à terme, ferait consommer des analyses pour du courrier indésirable. */
function expediteurAutorise(email: string): boolean {
  const brut = Deno.env.get('VEILLE_EXPEDITEURS_AUTORISES') || '';
  const motifs = brut.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean);
  if (motifs.length === 0) return false;
  const adresse = email.toLowerCase();
  // Un motif contenant « @ » doit correspondre à l'adresse entière ; sinon c'est un domaine.
  return motifs.some((m) => (m.includes('@') ? adresse === m : adresse.endsWith(`@${m}`) || adresse.endsWith(`.${m}`)));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  // 1. Authenticité. Secret PROPRE à la veille : jamais celui de inbound-email.
  if (!verifyInboundAuth(req.headers, Deno.env.get('VEILLE_WEBHOOK_SECRET'))) {
    console.warn('[veille] requête refusée : secret absent ou invalide');
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    console.warn('[veille] corps JSON invalide');
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const expediteur: string = payload?.FromFull?.Email ?? payload?.From ?? '';
  if (!expediteur) {
    console.warn('[veille] message sans expéditeur — ignoré');
    return jsonResponse({ status: 'ignored', reason: 'no_sender' }, 200);
  }

  // 2. Filtre d'expéditeurs (maîtrise du coût et du bruit).
  if (!expediteurAutorise(expediteur)) {
    console.info('[veille] expéditeur non autorisé — ignoré', expediteur);
    return jsonResponse({ status: 'ignored', reason: 'sender_not_allowed' }, 200);
  }

  const corps: string = payload?.TextBody ?? payload?.StrippedTextReply ?? payload?.HtmlBody ?? '';
  if (!corps.trim()) {
    console.info('[veille] message vide — ignoré', expediteur);
    return jsonResponse({ status: 'ignored', reason: 'empty_body' }, 200);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 3. Stockage. `message_id` est UNIQUE : une relivraison du même message par le fournisseur
  //    est refusée par la base (code 23505) et traitée comme un doublon, pas comme une erreur.
  const { data, error } = await admin
    .from('veille_alerte')
    .insert({
      message_id: payload?.MessageID ?? null,
      expediteur,
      expediteur_nom: payload?.FromFull?.Name ?? null,
      sujet: payload?.Subject ?? '',
      corps,
      recu_at: payload?.Date ? new Date(payload.Date).toISOString() : new Date().toISOString(),
      statut: 'recue',
    })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      console.info('[veille] message déjà reçu — ignoré', payload?.MessageID);
      return jsonResponse({ status: 'ignored', reason: 'duplicate' }, 200);
    }
    console.error('[veille] échec insertion', error.message);
    return jsonResponse({ error: 'insert_failed' }, 500);
  }

  console.info('[veille] alerte enregistrée', { id: data?.id, expediteur });
  return jsonResponse({ status: 'stored', id: data?.id }, 200);
});
