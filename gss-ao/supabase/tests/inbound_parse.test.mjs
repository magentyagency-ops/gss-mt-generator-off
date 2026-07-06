/**
 * Tests unitaires du cœur §15 — extraction du question_id + vérification du secret entrant.
 * Importe le VRAI code Deno (functions/_shared/inbound.ts) ; Node 24 strippe les types.
 *
 * Exécution :  node supabase/tests/inbound_parse.test.mjs
 * (aucune base ni Docker requis — teste la logique pure de rattachement)
 */
import { parseInbound, verifyInboundAuth } from '../functions/_shared/inbound.ts';

const QID = 'qabcdef0123456789'; // 'q' + 16 hex
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? '  ✅ PASS' : '  ❌ FAIL'} — ${label}`);
  if (!cond) failures++;
}

console.log('\n== Extraction du question_id (payloads simulés type Postmark Inbound) ==\n');

// 1. MailboxHash (Postmark découpe ao+<hash>@ → hash) : voie la plus fiable
let r = parseInbound({ MailboxHash: QID, TextBody: 'Voici ma réponse.', FromFull: { Email: 'jean@gss.fr' } });
check('MailboxHash → question_id extrait (source mailbox_hash)', r.questionId === QID && r.source === 'mailbox_hash');
check('MailboxHash → from correct', r.fromEmail === 'jean@gss.fr');

// 2. Adresse plus-addressée dans ToFull
r = parseInbound({ ToFull: [{ Email: `ao+${QID}@ao.gss.fr`, MailboxHash: '' }], TextBody: 'Réponse.' });
check('ToFull ao+<id>@ → source plus_address', r.questionId === QID && r.source === 'plus_address');

// 3. Adresse plus-addressée dans To (string) avec nom affiché
r = parseInbound({ To: `"GSS AO" <ao+${QID}@ao.gss.fr>`, TextBody: 'Réponse.' });
check('To "<ao+<id>@>" → plus_address', r.questionId === QID && r.source === 'plus_address');

// 4. Fallback : référence de suivi dans le corps (destinataire sans hash)
r = parseInbound({
  To: 'ao@ao.gss.fr',
  TextBody: `Bonjour,\nla réponse est X.\n\nRéférence de suivi : AO-2026-08 / ${QID}\n`,
});
check('Corps « Référence de suivi : … / <id> » → body_reference', r.questionId === QID && r.source === 'body_reference');

// 5. AUCUN identifiant exploitable → questionId null (on ne rattache RIEN)
r = parseInbound({ To: 'ao@ao.gss.fr', TextBody: 'Réponse sans aucune référence.' });
check('Aucun id → questionId = null (source none)', r.questionId === null && r.source === 'none');

// 6. Id malformé (mauvaise longueur) → ignoré
r = parseInbound({ MailboxHash: 'qABC', To: 'ao+qABC@ao.gss.fr', TextBody: 'qxyz' });
check('Id trop court → non extrait (null)', r.questionId === null);

// 7. Payload vide → ne plante pas, renvoie null
r = parseInbound({});
check('Payload vide → questionId null, pas de crash', r.questionId === null);

console.log('\n== Vérification d\'authenticité du webhook (secret partagé) ==\n');
const SECRET = 's3cr3t-inbound';
const H = (obj) => new Headers(obj);

check('x-inbound-secret correct → accepté',
  verifyInboundAuth(H({ 'x-inbound-secret': SECRET }), SECRET) === true);
check('x-inbound-secret erroné → refusé',
  verifyInboundAuth(H({ 'x-inbound-secret': 'mauvais' }), SECRET) === false);
check('Basic auth user:secret → accepté',
  verifyInboundAuth(H({ authorization: 'Basic ' + btoa('postmark:' + SECRET) }), SECRET) === true);
check('Basic auth mauvais secret → refusé',
  verifyInboundAuth(H({ authorization: 'Basic ' + btoa('postmark:nope') }), SECRET) === false);
check('Aucun en-tête → refusé', verifyInboundAuth(H({}), SECRET) === false);
check('Aucun secret configuré (fail-closed) → refusé',
  verifyInboundAuth(H({ 'x-inbound-secret': SECRET }), undefined) === false);

console.log(`\n== Résultat : ${failures === 0 ? 'TOUS LES TESTS PASSENT ✅' : failures + ' ÉCHEC(S) ❌'} ==\n`);
process.exit(failures === 0 ? 0 : 1);
