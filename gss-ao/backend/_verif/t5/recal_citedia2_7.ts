/** Recalage n° 7 du cadre citedia2 474 (capture qualite/rejeu_citedia2/recalage_7.json) avec le code courant (T5-COH-3). */
import fs from 'fs';
import { recalerSurReference } from '../../src/generation/memoire_type_cadre';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const r = recalerSurReference(d.reference, d.reponse, { ...d.options, dce: '' });
console.log(r.fideliteAvant.toFixed(2), r.fidelite.toFixed(2));
console.log(r.texte);
