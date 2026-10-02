/**
 * D7 (seuils de conformité) — lance un harnais hors ligne (reponse_libre_v2.ts, cadre_court_hors_ligne.ts) en
 * enregistrant les textes de GSS publipostés pendant la génération (publierMemoire : nom de l'acheteur, valeurs imposées
 * par le CCTP, registre), pour mesurer ensuite la part du texte de GSS conservée dans les rubriques remises
 * (_verif/seuils_rl_final.ts). Aucun appel OpenAI (les harnais interceptent le SDK).
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/seuils_capture_refs.ts <références.json> <harnais.ts> <arguments du harnais…>
 */
import fs from 'fs';
import path from 'path';

const [sortieRefs, harnais, ...args] = process.argv.slice(2);
const captures: Array<Record<string, { mode: string; texte: string | null }>> = [];
// require (et non import *) : on modifie l'objet des exports lu par le générateur.
const mt: any = require('../src/generation/memoire_type');
const original = mt.publierMemoire;
mt.publierMemoire = (...a: any[]) => {
  const r = original(...a);
  captures.push(Object.fromEntries(r.map((p: any) => [p.id, { mode: p.mode, texte: p.texte }])));
  return r;
};
// État de complétion supprimé en fin de harnais (cadre_court_hors_ligne.ts) : copié à côté des références.
const rmSync = fs.rmSync;
(fs as any).rmSync = (p: any, o?: any) => {
  if (/response[\\/]etats[\\/][^\\/]+\.json$/.test(String(p)) && fs.existsSync(p)) fs.copyFileSync(p, sortieRefs.replace(/\.json$/, '') + '.etat.json');
  return rmSync(p, o);
};
process.on('exit', () => {
  // Dernière publication complète (la plus riche : celle de la génération, après valeurs imposées et registre).
  const plus = captures.reduce((a, c) => (Object.keys(c).length >= Object.keys(a).length ? c : a), {} as Record<string, any>);
  fs.writeFileSync(sortieRefs, JSON.stringify({ publications: captures.length, references: plus }, null, 1));
});
process.argv = [process.argv[0], path.resolve(__dirname, harnais), ...args];
require(path.resolve(__dirname, harnais));
