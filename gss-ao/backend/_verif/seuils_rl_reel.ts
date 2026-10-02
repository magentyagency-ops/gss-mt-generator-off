/**
 * D7 (seuils de conformité) — part du texte de GSS conservée dans les rubriques RÉELLES de la réponse libre (mémoire
 * type en 5 blocs), SANS AUCUN APPEL OPENAI :
 *  - rubriques : sections finales des générations réelles (_corpus_verif/_resultats/<run>.json, clés « bN_… ») ;
 *  - références : mémoire type publiposté pour le même acheteur (analyse du fichier de test pour becquerel, caen et ign,
 *    sinon nom de l'acheteur seul), rubriques « fixe » et « adapte » ;
 *  - mesure : fidelite(référence, rubrique remise, seuil de phrase, DCE) (même mesure que l'adaptation au CCTP), au seuil
 *    de phrase courant (0,8) et au seuil de phrase de 0,9. Limite : la référence est rebâtie sans l'analyse réelle de la
 *    génération (valeurs imposées par le CCTP, vocabulaire du CCTP) : un nom ou un délai imposé par le DCE y compte comme un écart.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/seuils_rl_reel.ts <runs.json> <sortie.json>
 *   runs.json : [{ "run": "v-ign-16", "code": "ign", "client": "IGN" }]
 */
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, preparerMemoireType, publierMemoire, fidelite, type ContexteMarche } from '../src/generation/memoire_type';

const RACINE = path.resolve(__dirname, '../..');
const RES = path.join(RACINE, '_corpus_verif/_resultats');
const DCE = path.join(RACINE, '_corpus_verif/_dce_textes');
const PERSONNES = path.resolve(__dirname, '../Template/Documentation GSS/Personnes');
const ANALYSES: Record<string, any> = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
const [entree, sortie] = process.argv.slice(2);
const runs: Array<{ run: string; code: string; client: string }> = JSON.parse(fs.readFileSync(entree, 'utf-8'));
const mt = chargerMemoireType();
const referents = fs.existsSync(PERSONNES) ? fs.readFileSync(PERSONNES, 'utf-8') : '';
const lignes: any[] = [];
for (const r of runs) {
  const res = JSON.parse(fs.readFileSync(path.join(RES, `${r.run}.json`), 'utf-8'));
  const sections: Record<string, string> = res.sections || {};
  const dce = fs.readFileSync(path.join(DCE, `${r.code}.txt`), 'utf-8');
  const ctx: ContexteMarche = { analyse: ANALYSES[r.code] || { clientName: r.client }, dce, referents };
  for (const p of publierMemoire(preparerMemoireType(ctx, { memoireType: mt }))) {
    if (!p.texte || (p.mode !== 'fixe' && p.mode !== 'adapte')) continue;
    const t = sections[p.id];
    if (!t) continue;
    const ref = p.texte.replace(/⟦AC:\d+⟧/g, '').replace(/\[CONSULTATION REQUISE[^\]]*\]/g, '[À COMPLÉTER]');
    const remis = t.replace(/⟦AC:\d+⟧/g, '');
    lignes.push({ run: r.run, id: p.id, mode: p.mode, f08: +fidelite(ref, remis, 0.8, dce).toFixed(3), f09: +fidelite(ref, remis, 0.9, dce).toFixed(3) });
  }
}
const stat = (v: number[]) => {
  v = [...v].sort((a, b) => a - b);
  return { n: v.length, min: v[0], mediane: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, sous_0_9: v.filter((x) => x < 0.9).length };
};
const parRun: Record<string, any> = {};
for (const run of [...new Set(lignes.map((x) => x.run))]) {
  const l = lignes.filter((x) => x.run === run);
  parRun[run] = { f08: stat(l.map((x) => x.f08)), f09: stat(l.map((x) => x.f09)) };
}
fs.writeFileSync(sortie, JSON.stringify({ parRun, lignes }, null, 1));
for (const [run, s] of Object.entries(parRun)) console.log(run, JSON.stringify(s));
for (const x of lignes.filter((y) => y.f08 < 0.9 || y.f09 < 0.9)) console.log(`  ${x.run} ${x.id} (${x.mode}) : ${x.f08} / ${x.f09}`);
