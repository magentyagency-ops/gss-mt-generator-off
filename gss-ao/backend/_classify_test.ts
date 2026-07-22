// Test manuel (NON COMMITÉ) — Ticket #4 : validation du classifieur LLM batché classifyFieldsLLM().
//   Lancer depuis gss-ao/backend :  npx ts-node --transpile-only _classify_test.ts
// L'import de ./src/core/config déclenche dotenv (charge gss-ao/.env) au chargement du module.
import { classifyFieldsLLM, MissingField } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';

// ── Compteur d'appels HTTP vers OpenAI + capture usage : preuve « 1 seul appel LLM pour le lot » ──
let openaiCalls = 0;
let lastUsage: unknown = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  const isOpenAI = String(url).includes('openai');
  if (isOpenAI) openaiCalls++;
  const res = await realFetch(input, init);
  if (isOpenAI) {
    try { lastUsage = (await res.clone().json())?.usage ?? null; } catch { /* non bloquant */ }
  }
  return res;
}) as typeof fetch;

const fields: MissingField[] = [
  // Clairement EXTERNE (public, vérifiable en ligne) → attendu 'public'.
  { id: 1, label: "SIRET de l'acheteur", context: "Identification administrative de l'acheteur public." },
  { id: 2, label: "forme juridique de l'acheteur public", context: "Statut juridique de l'entité acheteuse." },
  { id: 3, label: "adresse du siège de l'acheteur", context: "Coordonnées du siège social de l'acheteur." },
  // Clairement INTERNE (connu de nous seuls) → attendu 'internal'.
  { id: 4, label: "effectif dédié au marché", context: "Nombre d'agents que notre société affecte au marché." },
  { id: 5, label: "méthodologie proposée par notre équipe", context: "Approche technique proposée dans le mémoire." },
  { id: 6, label: "prix proposé", context: "Montant de notre offre financière." },
  // Ambigu / vide de sens → attendu 'internal' (règle du doute).
  { id: 7, label: "divers", context: "" },
];

const EXPECTED: Record<number, 'public' | 'internal'> = {
  1: 'public', 2: 'public', 3: 'public',
  4: 'internal', 5: 'internal', 6: 'internal',
  7: 'internal',
};

async function main() {
  const s = getSettings();
  console.log(`env → OPENAI_API_KEY:${!!s.openaiApiKey} | modèle:${process.env.EXTRACTION_MODEL || 'gpt-5.4-mini (défaut)'}`);

  console.log('\n=== CAS 1 — lot de 7 champs (un seul appel attendu) ===');
  openaiCalls = 0;
  const t0 = Date.now();
  const kinds = await classifyFieldsLLM(fields);
  const ms = Date.now() - t0;

  console.log('\n--- Map résultante (id → décision | attendu | OK?) ---');
  let allOk = true;
  for (const f of fields) {
    const got = kinds.get(f.id);
    const exp = EXPECTED[f.id];
    const ok = got === exp;
    if (!ok) allOk = false;
    console.log(`  #${f.id} ${JSON.stringify(f.label).padEnd(42)} → ${String(got).padEnd(8)} | attendu ${exp.padEnd(8)} | ${ok ? '✅' : '❌'}`);
  }

  console.log('\n--- Bilan ---');
  console.log(`  appels HTTP OpenAI (lot de 7) : ${openaiCalls}  ${openaiCalls === 1 ? '✅ (1 seul appel)' : openaiCalls === 0 ? '⚠️ (0 appel → fallback regex, pas de clé/erreur)' : '❌ (>1)'}`);
  console.log(`  latence                       : ${ms} ms`);
  console.log(`  usage tokens                  : ${lastUsage ? JSON.stringify(lastUsage) : 'non exposé'}`);
  console.log(`  classification globale        : ${allOk ? '✅ conforme (3 public, 3 internal, ambigu→internal)' : '❌ écart(s) ci-dessus'}`);

  console.log('\n=== CAS 2 — lot vide [] (aucun appel LLM attendu) ===');
  openaiCalls = 0;
  const t1 = Date.now();
  const empty = await classifyFieldsLLM([]);
  const ms1 = Date.now() - t1;
  console.log(`  taille Map : ${empty.size}  ${empty.size === 0 ? '✅ (vide)' : '❌'}`);
  console.log(`  appels HTTP OpenAI : ${openaiCalls}  ${openaiCalls === 0 ? '✅ (aucun appel)' : '❌'}`);
  console.log(`  latence : ${ms1} ms`);
}

main().catch((e) => { console.error('ERREUR TEST:', e); process.exit(1); });
