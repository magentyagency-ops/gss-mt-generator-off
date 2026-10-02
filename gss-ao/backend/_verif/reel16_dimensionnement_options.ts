/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — dimensionnement de l'IMM (génération réelle imm 16) : la lecture du DCE
 * relevait les trois postes permanents N1, N2, N3 (24 h/24) ET les trois options (« l'option 1 : 1 SSIAP 1 7j/7 24h/24… »),
 * d'où 36 titulaires ; les options sont écartées (18 titulaires pour 3 postes 24 h/24) et le tableau de l'équipe dédiée
 * n'a plus deux lignes identiques « Agent de sécurité | SSIAP 1, SST, carte CNAPS ».
 */
import fs from 'fs';
import path from 'path';
import { calculerDimensionnement, lignesEquipe } from '../src/generation/dimensionnement';
const dce = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/imm.txt'), 'utf-8');
const plage = [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '00:00', fin: '24:00' }];
const permanents = [
  { profil: "Chef d'équipe / Agent N1", qualification: 'SSIAP 2, SST, carte CNAPS', citation: "1er Chef d’équipe ou agent N1 : 24h/24h au poste de sécurité" },
  { profil: 'Agent de sécurité N2', qualification: 'SSIAP 1, SST, carte CNAPS', citation: '2ème Agent de sécurité ou agent N2 : 24h/24h au poste de sécurité' },
  { profil: 'Agent de sécurité N3', qualification: 'SSIAP 1, SST, carte CNAPS', citation: '3ème Agent de sécurité ou agent N3 : 24h/24h au poste de sécurité' },
];
const options = [
  { profil: '1 SSIAP 1', qualification: 'SSIAP 1', citation: 'l’option 1 : 1 SSIAP 1 7j/7 24h/24 ou en vacations de 12h (08h00-20h00/20h00-08h00)' },
  { profil: '1 SSIAP 2', qualification: 'SSIAP 2', citation: 'l’option 2 : 1 SSIAP 2 7j/7 7j/7 24h/24 ou en vacations de 12h (08h00-20h00/20h00-08h00)' },
  { profil: '1 APS', qualification: 'CQP APS', citation: 'l’option 3 : 1 APS 7j/7 7j/7 24h/24 ou en vacations de 12h (08h00-20h00/20h00-08h00)' },
];
const d = calculerDimensionnement({ postes: [...permanents, ...options].map((p) => ({ ...p, plages: plage })) }, dce);
let ko = 0;
if (!d) { console.log('ÉCHEC : aucun dimensionnement'); process.exit(1); }
console.log(d.profils.map((x) => `${x.profil} : ${x.heuresSemaine} h/sem, ${x.etp} ETP → ${x.titulaires}`).join('\n'));
if (d.profils.length !== 3) { ko++; console.log(`ÉCHEC : ${d.profils.length} profils (3 attendus, options écartées)`); }
if (d.titulaires !== 18) { ko++; console.log(`ÉCHEC : ${d.titulaires} titulaires (18 attendus)`); }
const lignes = lignesEquipe(d).split('\n');
console.log(lignes.join('\n'));
if (lignes.length !== 2 || new Set(lignes).size !== lignes.length) { ko++; console.log('ÉCHEC : lignes du tableau en double'); }
console.log(ko ? `${ko} échec(s)` : 'Options écartées, 18 titulaires, une ligne par catégorie et qualification.');
process.exit(ko ? 1 : 0);
