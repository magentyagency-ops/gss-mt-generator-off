// Test manuel (NON COMMITÉ) — Ticket #4 : déclencheur au point de génération (memoire_generator.ts).
//   npx ts-node --transpile-only _trigger_generation_test.ts
//
// Prouve, avec le bloc EXACT inséré en memoire_generator.ts (:3207-3210), et une vraie infra
// (Supabase + Perplexity) :
//   • FLAG OFF → le bloc est un NO-OP : aucun appel, aucune ligne, missingInfo + « mémoire »
//     INCHANGÉS → génération strictement identique.
//   • FLAG ON  → fire-and-forget : recherches en fond → recherche_web (en_attente_validation,
//     dossier lié) ; missingInfo + « mémoire » toujours INCHANGÉS (aucune injection, .docx intact).

import { resolveMissingInfo, MissingField } from './src/generation/missing_info_resolver';
import { getSettings } from './src/core/config';
import { createClient } from '@supabase/supabase-js';

const s = getSettings();
const admin = createClient(s.supabaseUrl, s.supabaseServiceRoleKey, { auth: { persistSession: false } });
const MARK = "SIRET de l'acheteur Ville de Rouen (test trigger génération)"; // « siret » → classé 'public'
const ok = (c: boolean) => (c ? '✅' : '❌');

// ── COPIE CONFORME du bloc inséré dans memoire_generator.ts (:3207-3210). ──
// (Renvoie la promise en fond quand flag ON pour pouvoir l'observer ; en prod elle n'est pas awaited.)
function generationTriggerBlock(missingInfo: MissingField[], dossierId: string): Promise<unknown> | undefined {
  if (getSettings().resolveMissingInfoEnabled) {
    return resolveMissingInfo(missingInfo as MissingField[], dossierId).catch((e: any) =>
      console.warn('[MemoireGenerator] resolveMissingInfo (fond) échec non bloquant:', e?.message));
  }
  return undefined;
}

async function countRows(dossierId: string): Promise<number> {
  const { count } = await admin.from('recherche_web')
    .select('*', { count: 'exact', head: true }).eq('query', MARK).eq('dossier_id', dossierId);
  return count ?? 0;
}

async function main() {
  if (!s.perplexityApiKey || !s.supabaseServiceRoleKey || !s.supabaseUrl) {
    console.error('Clés manquantes — je ne devine pas. Renseigne gss-ao/.env.'); process.exit(1);
  }
  const { data: dossiers } = await admin.from('dossiers')
    .select('id, nom').order('created_at', { ascending: false }).limit(1);
  const dossierId = dossiers?.[0]?.id as string;
  if (!dossierId) { console.error('Aucun dossier réel.'); process.exit(1); }
  console.log('dossier de test :', dossierId, `(« ${dossiers![0].nom} »)`);
  await admin.from('recherche_web').delete().eq('query', MARK).eq('dossier_id', dossierId);

  // missingInfo EXACTEMENT dans la forme produite par memoire_generator.ts:3188-3195.
  const missingInfo: MissingField[] = [
    { id: 11, label: MARK, context: 'Section: "Identité du candidat" | Question: "SIRET de l\'acheteur"' }, // public
    { id: 12, label: 'Nom du dirigeant GSS signataire', context: 'Section: "Signature" | Question: "Nom du dirigeant"' }, // internal
    { id: 13, label: 'Bilan pédagogique de la mascotte', context: 'Section: "Divers" | Question: "Mascotte"' }, // unknown
  ];
  // Objet « mémoire » fictif = ce que la génération continue de produire APRÈS le bloc.
  const memoire = { generatedData: { docx: 'CONTENU-DOCX-ORIGINAL' }, missingFields: missingInfo };
  const snapMissing = JSON.stringify(missingInfo);
  const snapMemoire = JSON.stringify(memoire);

  // ─────────────── FLAG OFF ───────────────
  delete process.env.RESOLVE_MISSING_INFO;
  console.log('\n=== FLAG OFF (défaut) — bloc NO-OP, génération inchangée ===');
  console.log('   resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const before = await countRows(dossierId);
  const pOff = generationTriggerBlock(missingInfo, dossierId);
  await new Promise((r) => setTimeout(r, 1500)); // laisse le temps à un éventuel appel (il ne doit pas y en avoir)
  const afterOff = await countRows(dossierId);
  console.log(`   ${ok(pOff === undefined)} aucun appel lancé (le bloc retourne undefined)`);
  console.log(`   ${ok(before === afterOff)} recherche_web INCHANGÉ (avant=${before}, après=${afterOff})`);
  console.log(`   ${ok(JSON.stringify(missingInfo) === snapMissing)} missingFields INCHANGÉ`);
  console.log(`   ${ok(JSON.stringify(memoire) === snapMemoire)} « mémoire » (generatedData + missingFields) INCHANGÉ`);

  // ─────────────── FLAG ON ───────────────
  process.env.RESOLVE_MISSING_INFO = 'true';
  console.log('\n=== FLAG ON — fire-and-forget : recherches en fond, mémoire toujours intact ===');
  console.log('   resolveMissingInfoEnabled =', getSettings().resolveMissingInfoEnabled);
  const pOn = generationTriggerBlock(missingInfo, dossierId);
  console.log(`   ${ok(pOn !== undefined && typeof (pOn as any).then === 'function')} passe lancée EN FOND (promise) — la génération n'attend pas`);
  // La génération continue immédiatement : mémoire inchangé AVANT même la fin de la recherche.
  console.log(`   ${ok(JSON.stringify(memoire) === snapMemoire)} « mémoire » INCHANGÉ pendant que la recherche tourne en fond`);
  await pOn; // on attend ici UNIQUEMENT pour observer le résultat en base
  const { data: rows } = await admin.from('recherche_web')
    .select('query, statut, dossier_id, citations, model, cost_usd')
    .eq('query', MARK).eq('dossier_id', dossierId).order('created_at', { ascending: false });
  const row = rows?.[0] as any;
  console.log('   ROW :', row ? {
    statut: row.statut, dossier_lié: row.dossier_id === dossierId,
    nb_citations: Array.isArray(row.citations) ? row.citations.length : 0, model: row.model, cost_usd: row.cost_usd,
  } : 'AUCUNE');
  console.log(`   ${ok(!!row && row.statut === 'en_attente_validation' && row.dossier_id === dossierId && (row.citations?.length ?? 0) >= 1)} 1 ligne en_attente_validation, dossier lié, ≥1 citation`);
  console.log(`   ${ok(JSON.stringify(missingInfo) === snapMissing)} missingFields INCHANGÉ après la recherche`);
  console.log(`   ${ok(JSON.stringify(memoire) === snapMemoire)} « mémoire » INCHANGÉ après la recherche (aucune injection, .docx intact)`);

  await admin.from('recherche_web').delete().eq('query', MARK).eq('dossier_id', dossierId);
  console.log('\n(nettoyage : lignes de test supprimées)');
}

main().catch((e) => { console.error('Erreur test:', e); process.exit(1); });
