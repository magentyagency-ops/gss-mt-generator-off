/** Recalage du champ 6 du cadre etampes2 552 (réponse enregistrée du modèle, essai strict) sur b5_nouvel_agent publipostée. */
import fs from 'fs';
import { recalerSurReference, texteBrut, nettoyerReponseCadre } from '../../src/generation/memoire_type_cadre';
import { chargerMemoireType } from '../../src/generation/memoire_type';
const mt = chargerMemoireType();
const ref = texteBrut(mt.rubriques.find((r) => r.id === 'b5_nouvel_agent')!.texte!.replace(/\{\{CLIENT\}\}/g, "la Mairie d'Etampes"));
const enreg = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const rep = JSON.parse(enreg.chat['8f8d377bcf674e3415c651232eba07c4e69ca929'][0].choices[0].message.content).value;
console.log('--- RÉFÉRENCE\n' + ref);
const r = recalerSurReference(ref, rep, { limite: true });
console.log('--- RECALÉ', r.fideliteAvant.toFixed(2), r.fidelite.toFixed(2), r.reinserees, r.reformulees);
console.log(nettoyerReponseCadre(r.texte));
