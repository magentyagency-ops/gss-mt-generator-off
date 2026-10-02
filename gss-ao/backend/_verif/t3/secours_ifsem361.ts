// Schéma de secours du bloc 1 sur le texte réel ifsem 361, après nettoyage, dessiné par le moteur (hors ligne).
import fs from 'fs'; import path from 'path';
import { nettoyerBloc1, specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1 } from '../../src/generation/reponse_libre_v2';
import { dessinerSpecs } from '../../src/generation/schema_service';
(async () => {
  const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../_corpus_verif/_resultats/v-ifsem-361.json'), 'utf-8'));
  const t = nettoyerBloc1(d.sections.b1_comprehension, undefined, 'x').texte;
  console.log('process restant :', /process GSS/.test(t));
  for (const [nom, spec] of [['puces', specSecoursPuces(t)], ['besoin', specSecoursBesoin(t)]] as const) {
    if (!spec) { console.log(nom, 'aucune spec'); continue; }
    console.log(nom, JSON.stringify(spec.params.etapes), 'anomalies', JSON.stringify(anomaliesSchemaBloc1(spec)));
    const r = (await dessinerSpecs([{ id: 'b1', gabarit: spec.gabarit, params: spec.params, source: t, titre_section: 'Compréhension' }], 'page')).get('b1');
    console.log(nom, 'moteur :', r?.ok ? 'OK' : JSON.stringify(r?.erreurs));
  }
})();
