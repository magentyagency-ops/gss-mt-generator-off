// Correction 9, bug 10 : contrôles inopinés « au moins trois fois par mois » seulement si le DCE les exige lui-même.
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, evaluerIndicateurs, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const mt = chargerMemoireType();
const dceIgn = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/ign.txt'), 'utf-8');
const matrice = [{ exigence: 'Le titulaire réalise des contrôles inopinés au moins une fois par mois sur le site (autocontrôles)', rubrique: 'b5_controle_trois_niveaux' }];
const e1 = evaluerIndicateurs(mt, { dce: dceIgn, matrice } as any).CONTROLES_INOPINES_EXIGES;
verifier('IGN : matrice seule (« inopin » absent du DCE) → faux', !e1.valeur, JSON.stringify(e1.raisons));
const prep = preparerMemoireType({ dce: dceIgn, matrice, cover: { client: 'Client test' }, analyse: { projectTitle: 'x' } } as any);
const txt = publierMemoire(prep).find((r) => r.id === 'b5_controle_trois_niveaux')?.texte || '';
verifier('IGN : pratique GSS « une à trois fois par mois selon les besoins du site »', /une à trois fois par mois selon les besoins du site/.test(txt) && !/au moins trois/.test(txt), (/Contrôle 2[^\n]*/.exec(txt) || [''])[0]);
const dce2 = 'Le titulaire effectue des contrôles inopinés au moins deux fois par mois sur chaque site.';
const e2 = evaluerIndicateurs(mt, { dce: dce2, matrice } as any).CONTROLES_INOPINES_EXIGES;
verifier('DCE qui exige des contrôles inopinés → vrai', e2.valeur, JSON.stringify(e2.raisons));
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
