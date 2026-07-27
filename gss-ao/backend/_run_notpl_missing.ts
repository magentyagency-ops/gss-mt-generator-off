/**
 * Rejoue le pipeline « détection des manques » de l'app dans le CAS SANS CADRE (no-template),
 * sur un DCE donné en argument, SANS écriture en base (pas de DB.saveDossier, pas de RLS requise).
 *
 * Reprend la séquence de MemoireGenerator.detectMissingInfo(), branche `else` :
 *   1. extractRequirementsList(null, dce)        → thèmes généraux (plan du mémoire)
 *   2. extractDetailedRequirements(dce, thèmes)  → exigences atomiques vérifiables
 *   3. detectMissingViaRag(exigences)            → embed + retrieve rag_chunk + jugement IA
 *   4. identiteCandidatForLabel                  → retire les manques d'identité légale GSS
 *   5. detectContradictions(dce)
 *   6. classifyFieldsLLM                         → canal 'web' vs 'equipe'
 *
 * Usage : npx ts-node _run_notpl_imm.ts <chemin .txt du DCE> [sortie .json]
 */
import fs from 'fs';
import path from 'path';
import { MemoireGenerator, identiteCandidatForLabel } from './src/generation/memoire_generator';
import { classifyFieldsLLM } from './src/generation/missing_info_resolver';

const SRC = process.argv[2];
const OUT = process.argv[3] || SRC.replace(/\.txt$/, '') + '_notpl.json';
if (!SRC || !fs.existsSync(SRC)) { console.error('Usage : npx ts-node _run_notpl_imm.ts <DCE.txt> [out.json]'); process.exit(1); }

(async () => {
  const gen: any = new MemoireGenerator();
  const dceContext = `\n\n--- ${path.basename(SRC)} ---\n` + fs.readFileSync(SRC, 'utf8');
  console.log(`dceContext = ${dceContext.length} car`);

  const themes = await gen.extractRequirementsList(null, dceContext);
  console.log(`[1] thèmes : ${themes.length}`);

  const detailed = await gen.extractDetailedRequirements(dceContext, themes);
  console.log(`[2] exigences détaillées : ${detailed.length}`);

  const viaRag = await gen.detectMissingViaRag(detailed.length > 0 ? detailed : themes);
  if (!viaRag) { console.log('RAG INDISPONIBLE'); return; }
  console.log(`[3] RAG : ${viaRag.fields.length} manque(s) / ${viaRag.total}`);

  const filtered = viaRag.fields.filter((m: any) => identiteCandidatForLabel(m.label) === '');
  const completude = viaRag.total > 0 ? Math.round(((viaRag.total - filtered.length) / viaRag.total) * 100) : null;
  console.log(`[4] après filtre identité : ${filtered.length} — complétude ${completude}%`);

  const contradictions = await gen.detectContradictions(dceContext);
  const kinds = await classifyFieldsLLM(filtered.map(({ criticite, ...f }: any) => f));
  const missingFields = filtered.map((m: any) => ({ ...m, demande: kinds.get(m.id) === 'public' ? 'web' : 'equipe' }));

  fs.writeFileSync(OUT, JSON.stringify({ themes, exigences: viaRag.exigences, missingFields, completude, contradictions }, null, 2));

  const byTheme = new Map<string, any[]>();
  for (const e of viaRag.exigences) {
    const k = e.theme || '(sans thème)';
    if (!byTheme.has(k)) byTheme.set(k, []);
    byTheme.get(k)!.push(e);
  }
  console.log('\n=== MATRICE PAR THÈME ===');
  for (const [t, list] of byTheme) {
    const ko = list.filter((e) => e.couverture === 'écart').length;
    console.log(`\n## ${t}  (${list.length - ko}/${list.length} couverts)`);
    for (const e of list) console.log(`  ${e.couverture === 'couvert' ? '✅' : '❌'} [${e.criticite}] ${e.exigence}${e.ref ? `  (${e.ref})` : ''}`);
  }
  console.log(`\n=== ${missingFields.length} MANQUE(S) — complétude ${completude}% — ${contradictions.length} contradiction(s) ===`);
})().catch((e) => { console.error('ERREUR', e.message); console.error(e.stack?.split('\n').slice(0, 5).join('\n')); });
