// Correction 10, bug 5 : citations du CCTP sans rapport avec leur puce dans le bloc 1 (génération réelle ign 14, hors ligne).
import fs from 'fs';
import path from 'path';
import { citationsCoherentes } from '../src/generation/reponse_libre_v2';
const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-ign-14.json'), 'utf-8'));
const avant: string = d.sections.b1_comprehension;
const r = citationsCoherentes(avant);
let ko = 0;
const verif = (ok: boolean, msg: string) => { if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', msg); };
const puces = (t: string) => t.split('\n').filter((l) => /^\s*-\s/.test(l));
for (const l of puces(r.texte)) console.log('   ', l.slice(0, 190));
verif(!/confidentialité »\) : [^→]*PTI/.test(r.texte) && /Les chercheurs|les chercheurs/.test(r.texte), 'citation « confidentialité » retirée de la puce sur le PTI, puce gardée');
verif(/\(« la continuité doit toujours/.test(r.texte), 'citation cohérente (relève) gardée');
verif(/\(« au moins sept \(7\) jours avant/.test(r.texte), 'citation cohérente (sept jours avant le mois) gardée');
verif(/» \) : transmission au SAIMG|»\) : transmission au SAIMG/.test(r.texte), '« : Transmission au SAIMG » → minuscule');
verif(puces(r.texte).length === puces(avant).length, `aucune puce retirée (${puces(r.texte).length})`);
verif(/de Carnot-Cassini/.test(r.texte) && /de Coriolis/.test(r.texte) && /SAIMG/.test(r.texte), 'noms propres intacts');
verif(/\*\*Ce que vous attendez\*\* : les chercheurs portent/.test(r.texte), '« : Les chercheurs » après l’étiquette → minuscule');
// Puce ajoutée par le minimum (« **Ce que vous attendez** : Le prestataire… ») : traitée de même, nom propre gardé.
const t2 = citationsCoherentes('- **Ce que vous attendez** : Coriolis est fermé le week-end.\n- **Point de vigilance** : La relève a lieu à 19h. Le site de Coriolis ferme ; la relève est tracée.');
verif(/: Coriolis est fermé/.test(t2.texte) && /: la relève a lieu/.test(t2.texte), `minuscule sauf nom propre : ${t2.texte.replace(/\n/g, ' | ')}`);
console.log(`citations retirées : ${r.retirees}`);
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
