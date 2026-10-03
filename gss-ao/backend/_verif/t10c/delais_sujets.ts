// T10C-2 / T10-COH-1 : phrases du DCE retenues par delaiDuDce pour chaque sujet, et valeurs lues.
import fs from 'fs';
import { delaiDuDce, phraseDelaiDuDce } from '../../src/generation/memoire_type';
const f = process.argv[2]; const dce = fs.readFileSync(f, 'utf8');
const sujets = (process.argv[3] || 'alarme,remplacement,pti,commande,ssi').split(',');
const ph = String(dce).replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+/);
for (const s of sujets) {
  console.log(`== ${s} : delaiDuDce = « ${delaiDuDce(dce, s as any)} » | phrase = ${phraseDelaiDuDce(dce, s as any).slice(0, 200)}`);
}
