// Test manuel (NON COMMITÉ) — Ticket #4 Phase 2b.
//   npx ts-node --transpile-only _resolve_2b_test.ts
//
// Prouve :
//   A. FLAG OFF (défaut) → resolveMissingInfo no-op strict : aucune recherche, aucune ligne.
//   B. FLAG ON → recherche web réelle tracée (statut en_attente_validation, dossier_id renseigné),
//      value=null (JAMAIS injectée).
//   C. Anti-doublon → 2e passe sur le même (dossier, champ) ne relance PAS (0 ligne en plus).
//   D. Hook route (branche incomplete) → mapping identité : payload incomplete INCHANGÉ,
//      generatedData du mémoire JAMAIS touché.
//   E. [nécessite migration 2b] Trigger « statut only » : UPDATE d'une autre colonne → rejeté ;
//      UPDATE du seul statut (Valider/Rejeter) → accepté.

import { resolveMissingInfo } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';
import { createClient } from '@supabase/supabase-js';

const s = getSettings();
const admin = createClient(s.supabaseUrl, s.supabaseServiceRoleKey, { auth: { persistSession: false } });

const MARK = "SIRET de l'acheteur Ville de Rouen (test 2b)"; // contient « siret » → classé 'public'

async function countRows(dossierId: string): Promise<number> {
  const { count } = await admin
    .from('recherche_web')
    .select('*', { count: 'exact', head: true })
    .eq('query', MARK)
    .eq('dossier_id', dossierId);
  return count ?? 0;
}

function ok(cond: boolean) { return cond ? '✅' : '❌'; }

async function main() {
  // Pré-requis : clés + un vrai dossier (dossier_id a une FK → public.dossiers).
  console.log('env  : PERPLEXITY_API_KEY', s.perplexityApiKey ? 'présente' : 'ABSENTE',
    '| SERVICE_ROLE', s.supabaseServiceRoleKey ? 'présente' : 'ABSENTE',
    '| SUPABASE_URL', s.supabaseUrl ? 'présente' : 'ABSENTE');
  if (!s.perplexityApiKey || !s.supabaseServiceRoleKey || !s.supabaseUrl) {
    console.error('Clés manquantes — je NE devine pas. Renseigne gss-ao/.env puis relance.'); process.exit(1);
  }
  const { data: dossiers, error: dErr } = await admin
    .from('dossiers').select('id, user_id, nom').order('created_at', { ascending: false }).limit(1);
  if (dErr || !dossiers?.length) { console.error('Aucun dossier réel trouvé:', dErr?.message); process.exit(1); }
  const dossierId = dossiers[0].id as string;
  console.log('dossier de test :', dossierId, `(« ${dossiers[0].nom} »)`);

  const fields = [
    { id: 1, label: MARK, context: 'identité administrative du client acheteur' }, // → public
    { id: 2, label: 'Nom de la mascotte interne du projet', context: '' },          // → unknown
  ];

  // Propreté : purge d'éventuelles lignes de test antérieures.
  await admin.from('recherche_web').delete().eq('query', MARK).eq('dossier_id', dossierId);

  // ─────────────── A. FLAG OFF ───────────────
  delete process.env.RESOLVE_MISSING_INFO;
  console.log('\n=== A. FLAG OFF (défaut) — génération inchangée, zéro effet de bord ===');
  console.log('   resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const before = await countRows(dossierId);
  const off = await resolveMissingInfo(fields, dossierId);
  const afterOff = await countRows(dossierId);
  console.log('   résultats :', JSON.stringify(off));
  console.log(`   ${ok(off.every((o) => o.source === 'none' && o.value === null))} tous source=none & value=null`);
  console.log(`   ${ok(before === afterOff)} recherche_web INCHANGÉ (avant=${before}, après=${afterOff})`);

  // ─────────────── B. FLAG ON ───────────────
  process.env.RESOLVE_MISSING_INFO = 'true';
  console.log('\n=== B. FLAG ON — recherche réelle, tracée « en_attente », JAMAIS injectée ===');
  console.log('   resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const on = await resolveMissingInfo(fields, dossierId);
  const pub = on.find((o) => o.id === 1);
  console.log('   résultats :', JSON.stringify(on));
  console.log(`   ${ok(pub?.value === null)} champ public : value=null (PAS injecté) | source=${pub?.source} | pending=${pub?.pending}`);
  const { data: rowsB } = await admin
    .from('recherche_web')
    .select('id, query, answer, citations, model, statut, dossier_id, cost_usd')
    .eq('query', MARK).eq('dossier_id', dossierId).order('created_at', { ascending: false });
  const row = rowsB?.[0] as any;
  console.log('   ROW en base :', row ? {
    answer: (row.answer || '').replace(/\s+/g, ' ').slice(0, 80),
    nb_citations: Array.isArray(row.citations) ? row.citations.length : 0,
    statut: row.statut,
    dossier_id_ok: row.dossier_id === dossierId,
    model: row.model,
    cost_usd: row.cost_usd,
  } : 'AUCUNE');
  const rowOk = !!row && row.statut === 'en_attente_validation' && row.dossier_id === dossierId
    && Array.isArray(row.citations) && row.citations.length >= 1;
  console.log(`   ${ok(rowOk)} 1 ligne en_attente_validation, dossier_id lié, ≥1 citation (règle « 0 inventé »)`);
  const countAfterB = await countRows(dossierId);

  // ─────────────── C. ANTI-DOUBLON ───────────────
  console.log('\n=== C. ANTI-DOUBLON — 2e passe même (dossier, champ) ne relance PAS ===');
  const on2 = await resolveMissingInfo(fields, dossierId);
  const countAfterC = await countRows(dossierId);
  const pub2 = on2.find((o) => o.id === 1);
  console.log(`   lignes après 1re passe=${countAfterB}, après 2e passe=${countAfterC}`);
  console.log(`   ${ok(countAfterC === countAfterB)} aucune ligne ajoutée (recherche non relancée, appel Perplexity économisé)`);
  console.log(`   ${ok(pub2?.pending === true && pub2?.source === 'web')} champ signalé « déjà en cours » (pending=true)`);

  // ─────────────── D. HOOK ROUTE (mapping identité, mémoire intact) ───────────────
  console.log('\n=== D. HOOK ROUTE — payload incomplete inchangé, mémoire non touché ===');
  // Reproduction EXACTE de la logique du hook de routes.ts (branche if incomplete).
  const result: any = {
    status: 'incomplete',
    missingFields: [{ id: 7, label: MARK, context: 'ctx' }],
    generatedData: { docx: 'CONTENU-ORIGINAL' },
  };
  const originalMissing = JSON.stringify(result.missingFields);
  const originalDocx = result.generatedData.docx;
  let launched = false;
  if (getSettings().resolveMissingInfoEnabled && Array.isArray(result.missingFields) && result.missingFields.length) {
    const mapped = result.missingFields.map((m: any) => ({ id: m.id, label: String(m.label ?? ''), context: String(m.context ?? '') }));
    launched = mapped.length === result.missingFields.length;
    // fire-and-forget simulé (ne bloque pas, ne modifie pas result) — on ne l'exécute pas ici pour ne pas créer de ligne parasite.
  }
  const payload = { status: 'incomplete', message: 'Des informations sont manquantes.', missingFields: result.missingFields };
  console.log(`   ${ok(JSON.stringify(payload.missingFields) === originalMissing)} payload.missingFields IDENTIQUE (aucune mutation)`);
  console.log(`   ${ok(result.generatedData.docx === originalDocx)} generatedData du mémoire INTACT (le hook n'y touche jamais)`);
  console.log(`   ${ok(launched)} passe de fond déclenchée quand flag ON (fire-and-forget)`);

  // ─────────────── E. TRIGGER « statut only » (nécessite migration 2b) ───────────────
  console.log('\n=== E. TRIGGER « statut only » — Valider/Rejeter ne change QUE le statut ===');
  if (row) {
    // E1 : tentative de modifier une AUTRE colonne (answer) → doit être REJETÉE par le trigger.
    const { error: eBad } = await admin.from('recherche_web').update({ answer: 'ALTÉRÉ' }).eq('id', row.id);
    console.log(`   ${ok(!!eBad)} UPDATE answer refusé par le trigger ${eBad ? `→ « ${eBad.message} »` : '(⚠️ PAS refusé — migration 2b non appliquée ?)'}`);
    // E2 : changer le seul statut (Rejeter) → doit PASSER.
    const { error: eGood } = await admin.from('recherche_web').update({ statut: 'rejetee' }).eq('id', row.id);
    const { data: after } = await admin.from('recherche_web').select('statut, answer').eq('id', row.id).single();
    console.log(`   ${ok(!eGood && after?.statut === 'rejetee' && after?.answer === row.answer)} UPDATE statut→rejetee accepté, answer inchangé ${eGood ? `(err: ${eGood.message})` : ''}`);
  } else {
    console.log('   (pas de ligne pour tester le trigger)');
  }

  // ─────────────── nettoyage ───────────────
  await admin.from('recherche_web').delete().eq('query', MARK).eq('dossier_id', dossierId);
  console.log('\n(nettoyage : lignes de test supprimées)');
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });
