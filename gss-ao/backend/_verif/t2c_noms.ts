import fs from 'fs';
import { nomsHorsMarche, motifsReferences } from '../src/generation/base_memoires';
console.log(motifsReferences().map((r) => r.nom).join(' | '));
const dce = fs.readFileSync('../_corpus_verif/_dce_textes/vitry.txt', 'utf-8');
const client = 'Ville de Vitry-sur-Seine, en qualité de coordonnateur des groupements de commandes Ville/Sidoresto et Ville/CCAS';
for (const q of ['Confirmer le délai de mobilisation opérationnelle applicable aux sites de Port-Jérôme-sur-Seine.', 'Combien d’agents titulaires composent l’équipe dédiée aux manifestations de la Ville de Vitry-sur-Seine ?', 'Quel est le délai de mobilisation ?'])
  console.log(JSON.stringify(nomsHorsMarche(q, dce, client)), q);
