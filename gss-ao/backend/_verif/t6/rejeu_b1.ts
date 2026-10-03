// Rejeu au plus proche avec capture du bloc 1 (texte, titre et textes du schéma de process dessiné) dans <sortie>/b1.json.
import fs from 'fs';
import path from 'path';
const { MemoireGenerator } = require('../../src/generation/memoire_generator');
const SORTIE = path.resolve(process.argv[4]);
const orig = MemoireGenerator.prototype.redigerComprehension;
MemoireGenerator.prototype.redigerComprehension = async function (...a: any[]) {
  const r = await orig.apply(this, a);
  const textes = String(r.svg || '').match(/<text[^>]*>([^<]*)<\/text>/g)?.map((x: string) => x.replace(/<[^>]+>/g, '')) || [];
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'b1.json'), JSON.stringify({ titre: r.titre, secours: r.secours, svg: !!r.svg, textesSchema: textes, texte: r.texte }, null, 1));
  if (r.svg) fs.writeFileSync(path.join(SORTIE, 'b1.svg'), r.svg);
  return r;
};
require('./rejouer_proche');
