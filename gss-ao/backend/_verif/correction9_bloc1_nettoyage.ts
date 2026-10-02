// Tour 1 (T1C-04) : bloc 1 sans redite du chapeau, sans « La durée du marché est [À COMPLÉTER] » quand le DCE ne donne
// pas la durée, et renvois au bon bloc (fontainebleau 21).
import fs from 'fs';
import path from 'path';
import { nettoyerBloc1 } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType, planMemoireType } from '../src/generation/memoire_type';
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const r = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-fontainebleau-21.json'), 'utf-8'));
const texte = String(r.sections.b1_comprehension).replace(/⟦AC:\d+⟧/g, '');
const mt = chargerMemoireType();
const plan = planMemoireType(mt, { HORS_NORMANDIE: true, SURVEILLANCE: true, EVENEMENTIEL: true } as any);
const n = nettoyerBloc1(texte, plan, '');
v('plus de « durée du marché est [À COMPLÉTER] »', !/dur[ée]e du marché est \[À COMPLÉTER\]/.test(n.texte), n.retirees.join(' | '));
v('chapeau non redit (130 hectares une seule fois)', (n.texte.match(/130 hectares/g) || []).length === 1);
v('« La planification » renvoyée au bloc 4', !/bloc 5, « La planification »/.test(n.texte) && /bloc 4, « La planification »/.test(n.texte), (n.texte.match(/[^.]*La planification[^.]*/g) || []).join(' || '));
v('tableau gardé', (n.texte.match(/^\|/gm) || []).length === (texte.match(/^\|/gm) || []).length);
const avecDuree = nettoyerBloc1('La durée du marché est de 4 ans.\n\n## Votre contexte et votre site\nLe marché dure 4 ans.', plan, '4 ans');
v('durée connue gardée', /4 ans/.test(avecDuree.texte));
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
