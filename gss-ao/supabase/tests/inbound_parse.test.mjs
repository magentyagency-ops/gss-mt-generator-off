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

console.log('\n== Payloads ADVERSES — « en cas de doute, on ne rattache RIEN » (§15) ==\n');
const QID2 = 'q0f1e2d3c4b5a6978'; // second id distinct valide

// 8. AMBIGU : deux adresses de livraison autoritatives conflictuelles → RIEN
r = parseInbound({
  ToFull: [{ Email: `ao+${QID}@ao.gss.fr` }, { Email: `ao+${QID2}@ao.gss.fr` }],
  TextBody: 'reponse',
});
check('2 plus-address DISTINCTES → ambigu, questionId null', r.questionId === null && r.source === 'ambiguous');

// 9. AMBIGU : MailboxHash ≠ plus-address (conflit autoritatif) → RIEN
r = parseInbound({ MailboxHash: QID, To: `ao+${QID2}@ao.gss.fr`, TextBody: 'reponse' });
check('MailboxHash ≠ plus-address → ambigu, null', r.questionId === null && r.source === 'ambiguous');

// 10. NON ambigu : adresse autoritative unique + un AUTRE id cité dans le corps (fil de
//     discussion) → on rattache à l'adresse (le corps ne peut pas contredire la livraison).
r = parseInbound({
  MailboxHash: QID,
  To: `ao+${QID}@ao.gss.fr`,
  TextBody: `Ma reponse.\n> Le ... a ecrit : Référence de suivi : AO / ${QID2}`,
});
check('Adresse unique + autre id cité en corps → rattache à l\'adresse (pas ambigu)',
  r.questionId === QID && r.source === 'mailbox_hash');

// 11. Id dans le CORPS uniquement (pas en plus-address) → rattache via body_reference
r = parseInbound({ To: 'ao@ao.gss.fr', TextBody: `Référence de suivi : AO-2026 / ${QID}` });
check('Id seulement dans le corps → body_reference', r.questionId === QID && r.source === 'body_reference');

// 12. AMBIGU : aucune adresse, DEUX id distincts dans le corps → RIEN
r = parseInbound({ To: 'ao@ao.gss.fr', TextBody: `id1 ${QID} et id2 ${QID2}` });
check('2 id distincts dans le corps, sans adresse → ambigu, null', r.questionId === null && r.source === 'ambiguous');

// 13. Même id répété partout (adresse + corps) → NON ambigu (dédup)
r = parseInbound({
  MailboxHash: QID, ToFull: [{ Email: `ao+${QID}@ao.gss.fr` }],
  TextBody: `Référence de suivi : AO / ${QID}`,
});
check('Même id répété (adresse+corps) → rattache, pas ambigu', r.questionId === QID && r.source === 'mailbox_hash');

// 14. E-mail malformé : champs de type inattendu → ne plante pas, null
r = parseInbound({ To: 12345, ToFull: 'pas-un-tableau', MailboxHash: null, TextBody: 42 });
check('Champs de types inattendus → pas de crash, null', r.questionId === null);

// 15. Usurpation : le corps prétend un id, mais l'adresse en livre un autre → adresse prime,
//     et si elles diffèrent... ici seule l'adresse est autoritative → rattache à l'adresse.
r = parseInbound({ MailboxHash: QID, TextBody: `Tentative: ${QID2}` });
check('Adresse autoritative + id différent en corps → suit l\'adresse (corps ignoré)',
  r.questionId === QID && r.source === 'mailbox_hash');

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
check('Secret configuré vide (fail-closed) → refusé',
  verifyInboundAuth(H({ 'x-inbound-secret': '' }), '') === false);
check('En-tête Basic malformé (pas du base64) → refusé, pas de crash',
  verifyInboundAuth(H({ authorization: 'Basic @@@not-base64@@@' }), SECRET) === false);
check('Basic sans « : » mais = secret → accepté (secret seul)',
  verifyInboundAuth(H({ authorization: 'Basic ' + btoa(SECRET) }), SECRET) === true);
check('Secret proche mais longueur différente → refusé (comparaison stricte)',
  verifyInboundAuth(H({ 'x-inbound-secret': SECRET + 'x' }), SECRET) === false);

console.log(`\n== Résultat : ${failures === 0 ? 'TOUS LES TESTS PASSENT ✅' : failures + ' ÉCHEC(S) ❌'} ==\n`);
process.exit(failures === 0 ? 0 : 1);
