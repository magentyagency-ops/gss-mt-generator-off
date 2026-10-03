/**
 * Rejeu hors ligne (_verif/rejouer.ts) avec capture du contexte du publipostage : matrice des exigences et état de
 * chaque indicateur, écrits dans <sortie>/indicateurs.json. AUCUN APPEL OPENAI.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/t6/rejouer_capture.ts <enregistrement.json> <code> <sortie>
 */
import fs from 'fs';
import path from 'path';
const SORTIE = path.resolve(process.argv[4]);
const mt = require('../../src/generation/memoire_type');
const orig = mt.preparerMemoireType;
let n = 0;
mt.preparerMemoireType = (ctx: any, o: any) => {
  const r = orig(ctx, o);
  fs.mkdirSync(SORTIE, { recursive: true });
  const etats: Record<string, any> = {};
  for (const [k, v] of Object.entries(r.etatsIndicateurs)) etats[k] = v;
  fs.writeFileSync(path.join(SORTIE, `indicateurs_${++n}.json`), JSON.stringify({ matrice: ctx.matrice || [], etats }, null, 1));
  return r;
};
require('../rejouer');
