// Test manuel (NON COMMITÉ) — Preuve du gating « 0 inventé » sur DONNÉES RÉELLES Perplexity.
//   npx ts-node --transpile-only _gate_real_test.ts
// N'appelle PAS searchPublicInfo() → n'écrit AUCUNE ligne (utilise juste groundedResultFromPerplexity).
import { groundedResultFromPerplexity } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';

async function main() {
  const key = getSettings().perplexityApiKey;
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'Quelle est la capitale du Canada ?' }] }),
  });
  const raw: any = await res.json();
  const nCit = (Array.isArray(raw.citations) ? raw.citations.length : 0)
    + (Array.isArray(raw.search_results) ? raw.search_results.length : 0);
  console.log('Réponse RÉELLE Perplexity — nombre de citations renvoyées :', nCit);

  const asIs = groundedResultFromPerplexity(raw);
  const stripped = groundedResultFromPerplexity({ ...raw, citations: [], search_results: [] });

  console.log('  gate(réponse réelle telle quelle)  →', asIs ? `OBJET (citations=${asIs.citations.length}) ✅` : 'null');
  console.log('  gate(MÊME réponse SANS citations)  →',
    stripped === null ? 'null ✅  → 0 inventé : aucune réponse renvoyée, donc aucune ligne écrite' : 'OBJET ❌');
}
main().catch((e) => { console.error(e); process.exit(1); });
