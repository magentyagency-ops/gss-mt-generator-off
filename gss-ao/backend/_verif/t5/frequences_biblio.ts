/** Schémas de la bibliothèque du mémoire type : fréquences écrites absentes du texte publiposté (faux écarts ?). */
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, preparerMemoireType, publierMemoire } from '../../src/generation/memoire_type';
import { frequencesAbsentes } from '../../src/generation/memoire_generator';
const mt = chargerMemoireType();
for (const code of process.argv.slice(2)) {
  const dce = fs.readFileSync(path.resolve(__dirname, `../../../_corpus_verif/_dce_textes/${code}.txt`), 'utf-8');
  const prep = preparerMemoireType({ analyse: {}, dce, cover: {}, referents: '' } as any, { memoireType: mt });
  for (const p of publierMemoire(prep)) {
    const ref = p.schema?.source === 'bibliotheque' ? p.schema.ref : undefined;
    if (!ref || !p.texte) continue;
    const svg = fs.readFileSync(path.resolve(__dirname, `../../python/schemas_gss/bibliotheque/${ref}.svg`), 'utf-8');
    const e = frequencesAbsentes(svg, p.texte);
    if (e.length) console.log(code, p.id, ref, e);
  }
}
console.log('fin');
