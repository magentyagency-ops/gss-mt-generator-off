// Schéma de secours du bloc 1 d'après un texte de compréhension (fichier .md) : étapes de specSecoursPuces et specSecoursBesoin.
import fs from 'fs';
import { specSecoursPuces, specSecoursBesoin, etapesDesPuces } from '../../src/generation/reponse_libre_v2';
const t = fs.readFileSync(process.argv[2], 'utf-8');
console.log('etapesDesPuces', JSON.stringify(etapesDesPuces(t), null, 1));
console.log('specSecoursPuces', JSON.stringify(specSecoursPuces(t)?.params, null, 1));
console.log('specSecoursBesoin', JSON.stringify(specSecoursBesoin(t)?.params, null, 1));
