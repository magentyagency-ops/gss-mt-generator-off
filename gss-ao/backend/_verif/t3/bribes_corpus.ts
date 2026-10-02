// T3N-3 : bribes retirées après les renvois du bloc 1, sur tous les résultats réels disponibles (relecture).
import fs from 'fs';
import path from 'path';
import { sansBribesApresRenvoi } from '../../src/generation/reponse_libre_v2';
const RES = path.resolve(__dirname, '../../../_corpus_verif/_resultats');
let total = 0;
for (const f of fs.readdirSync(RES).filter((x) => x.endsWith('.json'))) {
  let d: any; try { d = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf-8')); } catch { continue; }
  const textes = Object.values(d.sections || {}).filter((v: any) => typeof v === 'string' && /## Vos attentes|## Les points de vigilance/.test(v)) as string[];
  for (const t of textes) {
    const r = sansBribesApresRenvoi(t);
    if (r.retirees.length) { total += r.retirees.length; console.log(f, '→', JSON.stringify(r.retirees)); }
  }
}
console.log('total', total);
