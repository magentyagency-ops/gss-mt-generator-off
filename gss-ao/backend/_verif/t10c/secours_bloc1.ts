// T10C-4 : schéma de secours du bloc 1 sur le texte de secours de citedia (modèle muet).
import fs from 'fs';
import { specSecoursBesoin, specSecoursPuces, specSecoursObligations, anomaliesSchemaBloc1 } from '../../src/generation/reponse_libre_v2';
const t = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).sections.b1_comprehension;
console.log('specSecoursBesoin', JSON.stringify(specSecoursBesoin(t)));
console.log('specSecoursPuces', JSON.stringify(specSecoursPuces(t)));
const s = specSecoursObligations(t);
console.log('specSecoursObligations', JSON.stringify(s, null, 1), anomaliesSchemaBloc1(s));
const sans = t.replace(/## Vos attentes[\s\S]*$/, '');
console.log('liste seule', JSON.stringify(specSecoursObligations(sans)));
