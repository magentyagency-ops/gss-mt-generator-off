// Tour 2 (T2C-1) : schémas de secours du bloc 1 (cstb 221, et tous les blocs 1 déjà générés) acceptés par le moteur de schémas.
import fs from 'fs';
import path from 'path';
import { dessinerSpecs } from '../src/generation/schema_service';
import { specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
const R = path.resolve(__dirname, '../../_corpus_verif/_resultats');
(async () => {
  let ko = 0, n = 0;
  for (const f of fs.readdirSync(R).filter((x) => /^v-.*\.json$/.test(x))) {
    let j: any; try { j = JSON.parse(fs.readFileSync(path.join(R, f), 'utf-8')); } catch { continue; }
    const texte = j?.sections?.b1_comprehension; if (!texte) continue;
    for (const [nom, fn] of [['puces', specSecoursPuces], ['sous-titres', specSecoursBesoin]] as const) {
      const spec = fn(texte); if (!spec) continue;
      n++;
      const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: texte, titre_section: 'Notre compréhension de votre besoin' } as any], 'page')).get('b1_comprehension');
      const a = anomaliesSchemaBloc1(spec);
      const ok = !!r?.ok && !a.length;
      if (!ok) ko++;
      console.log(`${ok ? 'OK' : 'KO'} ${f} ${nom}${r?.ok ? '' : ` moteur : ${JSON.stringify(r?.erreurs)}`}${a.length ? ` anomalies : ${a.join(' | ')}` : ''}`);
    }
  }
  console.log(`${n} schéma(s), ${ko} refusé(s) ou avec anomalie`);
  process.exit(ko ? 1 : 0);
})();
