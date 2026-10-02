// Les schémas de secours du bloc 1 (T3C-3) passent le contrôle du moteur de schémas (mots de la page ou du vocabulaire).
import fs from 'fs';
import path from 'path';
import { specSecoursPuces, specSecoursBesoin } from '../../src/generation/reponse_libre_v2';
import { dessinerSpecs } from '../../src/generation/schema_service';
const RES = path.resolve(__dirname, '../../../_corpus_verif/_resultats');
(async () => {
  let ko = 0;
  for (const f of ['v-imm-341.json', 'v-citedia-341.json', 'v-ifsem-335.json']) {
    const d = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf-8'));
    let t: string = d.sections.b1_comprehension || (Object.values(d.sections).find((v: any) => /## Vos attentes/.test(v)) as string);
    if (t.includes('## Décomposition')) t = t.slice(t.indexOf('## Votre contexte'), t.indexOf('## Décomposition'));
    for (const [n, spec] of [['puces', specSecoursPuces(t)], ['besoin', specSecoursBesoin(t)]] as const) {
      if (!spec) { console.log(f, n, 'null'); continue; }
      const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: t, titre_section: 'Votre besoin, notre réponse en un process' }], 'page')).get('b1_comprehension');
      console.log(f, n, r?.ok ? 'OK moteur' : `REFUS ${JSON.stringify(r?.erreurs)}`);
      if (!r?.ok) ko++;
      if (r?.ok && r.svg) fs.writeFileSync(path.join(process.argv[2] || '/tmp', `${f}.${n}.svg`), r.svg);
    }
  }
  process.exit(ko ? 1 : 0);
})();
