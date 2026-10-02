/**
 * D7 (seuils de conformité) — part du texte de GSS conservée dans chaque rubrique remise d'un harnais hors ligne :
 * références capturées par _verif/seuils_capture_refs.ts, rubriques finales de l'état (etat.libre.sections).
 *  - réponse libre : fidelite(texte publiposté, rubrique remise, seuil de phrase, DCE) pour chaque rubrique « fixe » ou
 *    « adapte » (la mesure de l'adaptation au CCTP, appliquée au texte remis) ;
 *  - format court : part des phrases de chaque partie (hors engagements, cohérence du prix, remarques) venues des textes
 *    publipostés (mesure du harnais cadre_court_hors_ligne.ts).
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/seuils_rl_final.ts <références.json> <etat.json> <code DCE> <sortie.json>
 */
import fs from 'fs';
import path from 'path';
import { fidelite } from '../src/generation/memoire_type';

const [refsF, etatF, code, sortie] = process.argv.slice(2);
const refs: Record<string, { mode: string; texte: string | null }> = JSON.parse(fs.readFileSync(refsF, 'utf-8')).references;
const etat = JSON.parse(fs.readFileSync(etatF, 'utf-8'));
const dce = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes', `${code}.txt`), 'utf-8');
const sections: Record<string, string> = etat.libre?.sections || {};
// Repère interne ⟦AC:n⟧ (signet, invisible) retiré ; question à GSS « [CONSULTATION REQUISE : …] » du texte publiposté =
// la mention « [À COMPLÉTER] » imprimée.
const ac = (t: string) => String(t || '').replace(/⟦AC:\d+⟧/g, '').replace(/\[CONSULTATION REQUISE[^\]]*\]/g, '[À COMPLÉTER]');
const lignes: any[] = [];
if (etat.libre?.court) {
  const toutMT = ac(Object.values(refs).map((r) => r.texte || '').join('\n\n'));
  for (const p of etat.libre.court.plan) {
    const t = (sections[p.id] || '').split(/\n(?=## )/).filter((b: string) => !/^## (?:Nos engagements|Engagements sur|Cohérence du prix|Nos remarques)/.test(b)).join('\n');
    lignes.push({ id: p.id, titre: p.title, f08: +fidelite(ac(t), toutMT, 0.8).toFixed(3), f09: +fidelite(ac(t), toutMT, 0.9).toFixed(3) });
  }
} else {
  for (const [id, r] of Object.entries(refs)) {
    if (!r.texte || (r.mode !== 'fixe' && r.mode !== 'adapte') || !sections[id]) continue;
    lignes.push({ id, mode: r.mode, f08: +fidelite(ac(r.texte), ac(sections[id]), 0.8, dce).toFixed(3), f09: +fidelite(ac(r.texte), ac(sections[id]), 0.9, dce).toFixed(3) });
  }
}
const stat = (v: number[]) => {
  v = [...v].sort((a, b) => a - b);
  return { n: v.length, min: v[0], mediane: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, sous_0_9: v.filter((x) => x < 0.9).length };
};
const bilan = { f08: stat(lignes.map((x) => x.f08)), f09: stat(lignes.map((x) => x.f09)), lignes };
fs.writeFileSync(sortie, JSON.stringify(bilan, null, 1));
console.log(JSON.stringify({ f08: bilan.f08, f09: bilan.f09 }));
for (const x of lignes.filter((y) => y.f08 < 0.9 || y.f09 < 0.9)) console.log(`  ${x.id} ${x.mode || x.titre} : ${x.f08} / ${x.f09}`);
