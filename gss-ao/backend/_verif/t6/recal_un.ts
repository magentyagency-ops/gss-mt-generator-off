/** Un recalage capturé : texte de HEAD (_verif/t6/avant) et texte du code courant, en entier. */
import fs from 'fs';
import { recalerSurReference } from '../../src/generation/memoire_type_cadre';
import * as avant from './avant/memoire_type_cadre';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const o = { ...d.options, dce: '' };
console.log('===== AVANT\n' + avant.recalerSurReference(d.reference, d.reponse, o).texte + '\n===== APRÈS\n' + recalerSurReference(d.reference, d.reponse, o).texte);
