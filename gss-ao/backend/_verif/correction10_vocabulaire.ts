// Correction 10, bug 3 : vocabulaire du CCTP de l'IGN (« chef de poste ») dans les titres du mémoire type et les textes
// des schémas dessinés ; schémas de la bibliothèque inchangés ; DCE qui parle de « chef de site » : rien ne change.
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, planMemoireType } from '../src/generation/memoire_type';
import { vocabulaireMemoireType, titreSchemaMemoireType, sectionsV2 } from '../src/generation/reponse_libre_v2';
import { vocabulaireDuCctp } from '../src/generation/base_memoires';
const dceIgn = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/ign.txt'), 'utf-8');
const mt = chargerMemoireType();
const v = vocabulaireMemoireType(mt, dceIgn);
let ko = 0;
const verif = (ok: boolean, msg: string) => { if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', msg); };
const RX = /(?:chefs?|responsables?) de site/i;
const titres = v.rubriques.flatMap((r) => [r.titre, ...(r.sous_parties || []).map((s) => s.titre)]);
verif(!titres.some((t) => RX.test(t)), `titres de rubrique et de sous-partie : ${titres.filter((t) => /chef de poste/i.test(t)).join(' | ')}`);
const fond = v.rubriques.find((r) => r.id === 'b5_controle_fond')!;
verif(fond.titre === 'Contrôle 1 : le contrôle de fond (chef de poste)', `titre b5_controle_fond : ${fond.titre}`);
for (const id of ['b5_nouveau_marche', 'b5_nouvel_agent', 'b4_moyens_acces', 'b5_controle_trois_niveaux']) {
  const s = v.rubriques.find((r) => r.id === id)!.schema!;
  const t = JSON.stringify([s.params, s.titre, titreSchemaMemoireType(id, v)]);
  verif(!RX.test(t) && /chefs? de poste/i.test(t), `schéma ${id} : ${t.match(/[^"]{0,30}chefs? de poste[^"]{0,20}/gi)?.join(' | ')}`);
}
const biblio = mt.rubriques.filter((r) => r.schema?.source === 'bibliotheque');
verif(biblio.every((r) => { const w = v.rubriques.find((x) => x.id === r.id)!.schema!; return w.ref === r.schema!.ref && JSON.stringify(w.params) === JSON.stringify(r.schema!.params); }), 'schémas de la bibliothèque : dessin d’origine (réf. et paramètres inchangés)');
const plan = planMemoireType(v, Object.fromEntries(Object.keys(v.indicateurs).map((k) => [k, true])));
verif(!sectionsV2(plan).some((r) => RX.test(r.title)), 'plan v2 : aucun titre de section avec l’ancien terme');
verif(vocabulaireDuCctp('en concertation avec l’IGN (responsable de site).', dceIgn) === 'en concertation avec l’IGN (responsable de site).', 'texte : « (responsable de site) » de l’acheteur inchangé');
const autre = 'Le chef de site est présent. '.repeat(3);
verif(vocabulaireMemoireType(mt, autre) === mt, 'DCE qui emploie « chef de site » : mémoire type inchangé');
verif(JSON.stringify(mt.rubriques.find((r) => r.id === 'b5_controle_fond')!.titre) === JSON.stringify('Contrôle 1 : le contrôle de fond (responsable de site)'), 'mémoire type d’origine non modifié');
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
