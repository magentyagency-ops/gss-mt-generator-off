// Test manuel (NON COMMITÉ) — Ticket #4 Phase 1 : searchPublicInfo() réel + règle « 0 inventé ».
//   Lancer depuis gss-ao/backend :  npx ts-node --transpile-only _search_public_info_test.ts
import { searchPublicInfo, groundedResultFromPerplexity } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';

async function main() {
  console.log('=== (b) Gating déterministe (hors réseau) ===');
  const withCite = { choices: [{ message: { content: 'Bordeaux.' } }], citations: ['https://fr.wikipedia.org/wiki/Gironde'] };
  const zeroCite = { choices: [{ message: { content: 'Plausible mais sans source.' } }], citations: [] };
  console.log('  avec citation → ', groundedResultFromPerplexity(withCite) ? 'OBJET ✅' : 'null ❌');
  console.log('  sans citation → ', groundedResultFromPerplexity(zeroCite) === null ? 'null ✅ (0 inventé)' : 'OBJET ❌');

  const s = getSettings();
  console.log(`\n  env → PERPLEXITY:${!!s.perplexityApiKey} | SUPABASE_URL:${s.supabaseUrl} | SERVICE_ROLE:${!!s.supabaseServiceRoleKey}`);

  console.log('\n=== (a) APPEL RÉEL — question factuelle ===');
  const qFact = 'Quelle est la capitale de l\'Australie ? Réponds en une phrase.';
  console.log('  question :', qFact);
  const rFact = await searchPublicInfo(qFact);
  if (!rFact) {
    console.log('  → null (inattendu pour une question factuelle)');
  } else {
    console.log('  ✅ answer   :', rFact.answer.replace(/\s+/g, ' ').slice(0, 260));
    console.log('  ✅ citations:', JSON.stringify(rFact.citations, null, 0));
    console.log('     model    :', rFact.model, '| usage:', JSON.stringify(rFact.rawUsage));
  }

  console.log('\n=== (g) GATING RÉEL — question sans source web attendue (arithmétique pure) ===');
  const qNo = 'Combien font 17 multiplié par 23 ? Réponds uniquement par le nombre, sans aucune source.';
  console.log('  question :', qNo);
  const rNo = await searchPublicInfo(qNo);
  console.log('  → résultat searchPublicInfo :', rNo === null ? 'null ✅ (aucune citation → aucune ligne écrite)' : `OBJET (citations=${rNo.citations.length}) — Perplexity a cité malgré tout`);
  if (rNo) console.log('     (note : sonar a renvoyé des citations ; voir le log ci-dessus)');

  console.log('\n=== FIN — vérifie la row en base pour la question factuelle ===');
}
main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });
