// Tour 1 (B2, T1C-11) : schéma de process du bloc 1, jamais de repère interne ni de titre tronqué ; étapes qui
// recopient la conclusion ou dont la première nomme le site refusées.
import fs from 'fs';
import path from 'path';
import { specSecoursPuces, defautsEtapesBesoin } from '../src/generation/reponse_libre_v2';
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const R = path.resolve(__dirname, '../../_corpus_verif/_resultats/');
const ifits = JSON.parse(fs.readFileSync(path.join(R, 'v-ifits-171.json'), 'utf-8')).sections;
const b1 = String(Object.entries(ifits).find(([k]) => k.startsWith('b1'))![1]);
// Texte tel qu'au moment du schéma : repère de consultation encore présent sur la dernière ligne libre.
const avant = `${b1.replace(/⟦AC:\d+⟧/g, '')}\n\nVisite obligatoire effectuée : [À COMPLÉTER]⟦AC:1⟧\n[CONSULTATION REQUISE : confirmation de la visite obligatoire du site par GSS]`;
const spec = specSecoursPuces(avant);
const etapes = spec?.params?.etapes || [];
console.log(JSON.stringify(etapes, null, 1));
v('aucun repère interne dans le schéma', !!spec && !etapes.some((e: any) => /\[|⟦/.test(`${e.titre} ${e.texte || ''}`)));
v('aucun titre tronqué « Le site associe un bâtiment » ni « Le service »', !etapes.some((e: any) => /^Le site associe|^Le service$/i.test(e.titre)));
const fb = [
  { titre: 'Domaine de Fontainebleau', texte: 'Le domaine couvre 130 hectares et 40 000 m² de bâtiments.', role: 'rouge' },
  { titre: 'Remplacement sous 2 heures', texte: 'Le remplacement intervient dans un délai maximal de 2 heures.', role: 'rouge' },
  { titre: 'Agents qualifiés', texte: 'Les agents CQP-APS, SST ou PSC1 couvrent les postes requis.', role: 'orange' },
  { titre: 'Prise de poste', texte: 'Les autocontrôles ont lieu au minimum 2 fois par mois.', role: 'bleu' },
  { titre: 'Continuité des postes', texte: 'Aucun poste ne reste non pourvu pendant le service.', role: 'vert' },
];
const texteFb = '## Votre contexte et votre site\nLe domaine couvre 130 hectares et 40 000 m² de bâtiments.\n\n## Vos attentes\n- x\n\nLe remplacement intervient dans un délai maximal de 2 heures. Les agents CQP-APS, SST ou PSC1 couvrent les postes requis. Les autocontrôles ont lieu au minimum 2 fois par mois. Aucun poste ne reste non pourvu pendant le service.';
const d = defautsEtapesBesoin(fb, { texte: texteFb, sites: ['Château et domaine de Fontainebleau', 'Domaine de Fontainebleau'] });
v('fontainebleau : étapes refusées (site, conclusion recopiée)', d.some((x) => /nomme le site/.test(x)) && d.some((x) => /conclusion/.test(x)), d.join(' | '));
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
