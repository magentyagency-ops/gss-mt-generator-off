// Tour 1 (T1C-05, COH-T1-08, B4) : acheteur en capitales repris avec la graphie du DCE ; forme juridique jamais prise
// comme forme courte (IFITS) ; sigle du DCE après la première mention (EPCF).
import fs from 'fs';
import path from 'path';
import { casseDuDce, formesClient, variablesDuMarche, chargerMemoireType } from '../src/generation/memoire_type';
const C = path.resolve(__dirname, '../../_corpus_verif/_dce_textes/');
const lire = (f: string) => fs.readFileSync(path.join(C, f), 'utf-8');
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const fb = lire('fontainebleau.txt');
const ifits = lire('ifits.txt');
const mt = chargerMemoireType();
const cf = variablesDuMarche(mt, { cover: { client: 'ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU' }, analyse: { clientName: 'ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU' }, dce: fb, registre: [] } as any, {}).CLIENT;
v('Fontainebleau : graphie du DCE', cf.valeur === 'Établissement public du château de Fontainebleau' && cf.article === "l'", JSON.stringify(cf));
v('Fontainebleau : sigle EPCF après la première mention', (cf as any).court === 'EPCF' && (cf as any).articleCourt === "l'", JSON.stringify(cf));
const ci = variablesDuMarche(mt, { cover: { client: 'Institut de Formation Interhospitalier Théodore Simon (Groupement d’Intérêt Public)' }, analyse: { clientName: 'Institut de Formation Interhospitalier Théodore Simon (Groupement d’Intérêt Public)' }, dce: ifits, registre: [] } as any, {}).CLIENT;
v('IFITS : forme courte « l\'IFITS », jamais la forme juridique', (ci as any).court === 'IFITS' && (ci as any).articleCourt === "l'", JSON.stringify(ci));
v('Petit-Quevilly sans le DCE : capitales gardées (rien d\'inventé)', casseDuDce('MAIRIE DE PETIT-QUEVILLY', 'Gardiennage, 76000 Rouen.') === '');
v('Petit-Quevilly avec le DCE', casseDuDce('MAIRIE DE PETIT-QUEVILLY', 'La Mairie de Petit-Quevilly lance. La mairie de Petit-Quevilly. Petit-Quevilly.') === 'Mairie de Petit-Quevilly', casseDuDce('MAIRIE DE PETIT-QUEVILLY', 'La Mairie de Petit-Quevilly lance. La mairie de Petit-Quevilly. Petit-Quevilly.'));
v('Rouvray avec le DCE', casseDuDce('CENTRE HOSPITALIER DU ROUVRAY', 'Le centre hospitalier du Rouvray. Le CH du Rouvray.') === 'Centre hospitalier du Rouvray');
v('Nom déjà en minuscules : inchangé', casseDuDce('Université de Rouen Normandie', 'x') === '');
v('Citédia : inchangé', !formesClient('Citédia Métropole').court);
v('IMM : forme courte inchangée', formesClient('Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)', lire('imm.txt')).court?.nom === 'IMM');
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
