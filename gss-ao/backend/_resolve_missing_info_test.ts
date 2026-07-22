// Test manuel (NON COMMITÉ) — Ticket #4 Phase 2a : gating de resolveMissingInfo().
//   npx ts-node --transpile-only _resolve_missing_info_test.ts
import { resolveMissingInfo } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';
import { createClient } from '@supabase/supabase-js';

const s = getSettings();
const admin = createClient(s.supabaseUrl, s.supabaseServiceRoleKey, { auth: { persistSession: false } });

const MARK = "SIRET de l'acheteur Ville de Rouen (test 2a)"; // contient « siret » → classé 'public'
const fields = [
  { id: 1, label: MARK, context: 'identité administrative du client acheteur' }, // → public
  { id: 2, label: 'Nom de la mascotte interne du projet', context: '' },          // → unknown
];

async function countRows(): Promise<number> {
  const { count } = await admin
    .from('recherche_web')
    .select('*', { count: 'exact', head: true })
    .eq('query', MARK);
  return count ?? 0;
}

async function main() {
  // ─────────────── FLAG OFF (défaut) ───────────────
  delete process.env.RESOLVE_MISSING_INFO;
  console.log('=== FLAG OFF (défaut) — comportement génération inchangé ===');
  console.log('  resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const before = await countRows();
  const off = await resolveMissingInfo(fields, 'dossier-test');
  const afterOff = await countRows();
  console.log('  résultats  :', JSON.stringify(off));
  console.log('  → toutes source=none :', off.every((o) => o.source === 'none'),
    '| aucune valeur injectée :', off.every((o) => o.value === null));
  console.log(`  → recherche_web INCHANGÉ : ${before === afterOff} (avant=${before}, après=${afterOff})  ✅ zéro effet de bord`);

  // ─────────────── FLAG ON ───────────────
  process.env.RESOLVE_MISSING_INFO = 'true';
  console.log('\n=== FLAG ON — recherche stockée « en attente », rien injecté ===');
  console.log('  resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const on = await resolveMissingInfo(fields, 'dossier-test');
  console.log('  résultats  :', JSON.stringify(on));
  const pub = on.find((o) => o.id === 1);
  console.log(`  → champ 'public' : value=${JSON.stringify(pub?.value)} (doit être null → PAS injecté) | source=${pub?.source} | pending=${pub?.pending}`);

  const row = (await admin
    .from('recherche_web')
    .select('query, answer, citations, model, statut, sollicitation_id, cost_usd')
    .eq('query', MARK)
    .order('created_at', { ascending: false })
    .limit(1)).data?.[0];
  console.log('  ROW en base :', row ? {
    query: row.query,
    answer: (row.answer || '').replace(/\s+/g, ' ').slice(0, 90),
    nb_citations: Array.isArray(row.citations) ? row.citations.length : 0,
    statut: row.statut,
    model: row.model,
    sollicitation_id: row.sollicitation_id,
    cost_usd: row.cost_usd,
  } : 'AUCUNE');

  // ─────────────── nettoyage ───────────────
  await admin.from('recherche_web').delete().eq('query', MARK);
  console.log('\n(nettoyage : rows de test supprimées)');
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });
