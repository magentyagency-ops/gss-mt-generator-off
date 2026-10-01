// Correction 9, bug 1 (hors ligne) : dimensionnement calculé depuis la lecture du DCE (réponses du modèle relevées par
// la sonde _verif/correction9_dim_sonde.ts), publipostage de l'équipe dédiée (IGN, Citédia) et cases du cas pratique
// (Étampes) ; une seule question à GSS.
import fs from 'fs';
import path from 'path';
import { calculerDimensionnement, remplirCasPratique, questionDimensionnement } from '../src/generation/dimensionnement';
import { preparerMemoireType, publierMemoire, questionsDuPubliposte } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const D = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/c9';
const dce = (c: string) => fs.readFileSync(`${D}/dce_${c}.txt`, 'utf-8');
const rep = (c: string) => JSON.parse(fs.readFileSync(`${D}/rep_${c}.json`, 'utf-8'));
// IGN
const dIgn = calculerDimensionnement(rep('ign'), dce('ign'))!;
console.log(`  IGN : ${dIgn.profils.map((x) => `${x.profil} ${x.heuresSemaine} h → ${x.etp} ETP → ${x.titulaires}`).join(' ; ')} ; suppléants ${dIgn.suppleants}`);
verifier('IGN : SSIAP 2 228 h, SSIAP 1 132 h, ADS 90 h', dIgn.profils.map((x) => `${x.profil}:${x.heuresSemaine}`).join(' ') === 'SSIAP 2:228 SSIAP 1:132 ADS:90');
verifier('IGN : 16 titulaires, 5 suppléants', dIgn.titulaires === 16 && dIgn.suppleants === 5);
verifier('IGN : poste dont la citation est absente du DCE écarté', !dIgn.profils.some((x) => /invent/i.test(x.profil)));
const ctx: any = { cover: { client: 'Client test' }, analyse: { projectTitle: 'x' }, dce: dce('ign'), dimensionnement: dIgn };
const prep = preparerMemoireType(ctx);
const pub = publierMemoire(prep);
const adequation = pub.find((r) => r.id === 'b3_adequation')?.texte || '';
const extrait = adequation.slice(0, adequation.indexOf('**La stabilité'));
console.log(extrait);
verifier('IGN : tableau et effectifs sans [À COMPLÉTER]', !/\[À COMPLÉTER\]/.test(extrait) && /équipe de 16 agents titulaires/.test(extrait) && /équipe suppléante de 5 agents/.test(extrait));
verifier('IGN : aucune ligne « Agent cynophile »', !/Agent cynophile \|/.test(extrait));
const qs = questionsDuPubliposte(pub).filter((q) => /dimensionnement|titulaires|équipe dédiée|catégorie/i.test(q));
qs.forEach((q) => console.log(`  question : ${q}`));
verifier('IGN : une seule question consolidée (proposition à valider)', qs.length === 1 && /^Proposition à valider/.test(qs[0]));
// Citédia
const dCit = calculerDimensionnement(rep('citedia2'), dce('citedia2'))!;
verifier('Citédia : 84 h par semaine (DQE), 3 948 h par an → 2,46 ETP → 3 titulaires', dCit.profils[0].heuresSemaine === 84 && dCit.profils[0].heuresAn === 3948 && dCit.titulaires === 3, JSON.stringify(dCit.profils[0]));
// Étampes : cas pratique
const dEt = calculerDimensionnement(rep('etampes1'), dce('etampes1'))!;
const et = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-etampes1-13.json'), 'utf-8')).texte_docx as string;
const i = et.indexOf('Dimensionnement proposé par plage');
const j = et.indexOf('Schéma opérationnel et répartition des effectifs\n');
const zone = `${et.slice(i, et.indexOf('\n', i))}\n${et.slice(et.indexOf('Dimanche férié, 6 h–21 h | Agent', j), et.indexOf('\n', et.indexOf('Lundi férié, 6 h–21 h | Encadrant', j)))}`;
const r = remplirCasPratique(zone, dEt);
console.log(r.texte);
verifier('Étampes : 12 cases et la phrase de dimensionnement remplies', r.n === 13 && !/\[À COMPLÉTER\]/.test(r.texte), `${r.n} remplacement(s)`);
verifier('Étampes : rotation 15 h = 2 vacations, nuit 9 h = 1', /Dimanche férié, 6 h–21 h \| Agent de sécurité \| en service : 2 \| rotation : 4/.test(r.texte) && /Nuit, 21 h–6 h \| Agent de sécurité \| en service : 2 \| rotation : 2/.test(r.texte) && /Agent de sécurité incendie \| en service : 0 \| rotation : 0/.test(r.texte));
console.log(`  question : ${questionDimensionnement(dEt)}`);
verifier('Étampes : équipe tirée du cas pratique (4 agents de sécurité + 2 maîtres-chiens, 2 suppléants)', dEt.titulaires === 6 && dEt.suppleants === 2 && !dEt.profils.some((x) => /incendie|encadr/i.test(x.profil)), JSON.stringify(dEt.profils.map((x) => [x.profil, x.titulaires])));
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
