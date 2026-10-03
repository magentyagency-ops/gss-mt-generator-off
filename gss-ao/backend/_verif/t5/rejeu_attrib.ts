/**
 * Rejeu hors ligne (rejouer.ts) avec relevé de l'attribution des rubriques du mémoire type aux champs du cadre
 * (candidats, scores sémantiques et lexicaux, rubriques gardées et renvois) dans <sortie>/attribution.json.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/t5/rejeu_attrib.ts <enregistrement.json> <code> <sortie>
 */
import fs from 'fs';
import path from 'path';
const mtc = require('../../src/generation/memoire_type_cadre');
const SORTIE = path.resolve(process.argv[4]);
const orig = mtc.attribuerRubriques;
mtc.attribuerRubriques = (champs: any[]) => {
  const r = orig(champs);
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'attribution.json'), JSON.stringify({
    champs: champs.map((c) => ({ id: c.id, libelle: c.libelle, candidats: c.candidats.map((x: any) => `${x.id} ${x.score.toFixed(3)} lex ${Number(x.lexical || 0).toFixed(1)}`) })),
    gardes: [...r.candidats.entries()].map(([id, l]: any) => ({ id, ids: l.map((x: any) => x.id) })),
    renvois: [...r.renvois.entries()].map(([id, l]: any) => ({ id, titres: l.map((x: any) => x.titre) })),
  }, null, 1));
  return r;
};
const origCand = mtc.candidatsReference;
const scoresVus: any[] = [];
mtc.candidatsReference = (mt: any, textes: any, question: string, o: any = {}) => {
  const r = origCand(mt, textes, question, o);
  const sc = Object.entries(o.scores || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12).map(([id, v]: any) => `${id} ${v.toFixed(3)}`);
  const lex = mtc.__lex ? [] : require('../../src/generation/memoire_type').rechercherRubriques(mt, question, 8, Object.keys(textes)).map((x: any) => `${x.id} ${x.score.toFixed(1)}`);
  scoresVus.push({ question: question.slice(0, 300), hors: o.hors, sem: sc, lex, retenus: r.map((x: any) => x.id) });
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'scores.json'), JSON.stringify(scoresVus, null, 1));
  return r;
};
const mtm = require('../../src/generation/memoire_type');
const origPrep = mtm.preparerMemoireType;
mtm.preparerMemoireType = (ctx: any, o: any) => {
  const prep = origPrep(ctx, o);
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, `prep_${Date.now()}.json`), JSON.stringify({ indicateurs: prep.indicateurs, etats: prep.etatsIndicateurs, plan: prep.plan.rubriques.map((r: any) => r.id) }, null, 1));
  return prep;
};
require('../rejouer');
