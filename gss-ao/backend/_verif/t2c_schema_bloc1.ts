// Tour 2 (T2C-1) : schéma de secours du bloc 1 sur les textes réels de cstb 221 (réponse libre) et des corpus déjà générés.
import fs from 'fs';
import path from 'path';
import { specSecoursPuces, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
const R = path.resolve(__dirname, '../../_corpus_verif/_resultats');
let ko = 0, n = 0, nuls = 0;
for (const f of fs.readdirSync(R).filter((x) => /^v-.*\.json$/.test(x))) {
  let j: any; try { j = JSON.parse(fs.readFileSync(path.join(R, f), 'utf-8')); } catch { continue; }
  const t = j?.sections?.b1_comprehension;
  if (!t) continue;
  n++;
  const s = specSecoursPuces(t);
  if (!s) { nuls++; console.log(`—  ${f} : pas de secours sur les puces (secours suivant)`); continue; }
  const a = anomaliesSchemaBloc1(s);
  if (a.length) ko++;
  console.log(`${a.length ? 'KO' : 'OK'} ${f} : ${s.params.etapes.map((e: any) => `${e.titre} / ${e.texte || '∅'}`).join(' → ')}${a.length ? `\n   ${a.join('\n   ')}` : ''}`);
}
console.log(`${n} bloc(s) 1, ${nuls} sans secours sur les puces, ${ko} avec anomalie(s)`);
process.exit(ko ? 1 : 0);
