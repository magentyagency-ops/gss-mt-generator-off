/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — forme courte de l'acheteur quand son nom se termine par un nom d'usage entre
 * parenthèses (génération réelle imm 15 : « l'Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM) »
 * imprimé 21 fois en 12 pages) : « l'IMM » (sigle employé seul par le DCE), pronoms accordés sur la forme imprimée ;
 * formes des autres acheteurs du corpus inchangées (ign, becquerel, Citédia, université de Rouen).
 */
import fs from 'fs';
import path from 'path';
import { formesClient, publiposter } from '../src/generation/memoire_type';
const DCE = path.resolve(__dirname, '../../_corpus_verif/_dce_textes');
const lire = (c: string) => { try { return fs.readFileSync(path.join(DCE, `${c}.txt`), 'utf-8'); } catch { return ''; } };
let ko = 0;
const verifier = (libelle: string, obtenu: unknown, attendu: unknown) => {
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) { ko++; console.log(`ÉCHEC ${libelle}\n  obtenu  : ${JSON.stringify(obtenu)}\n  attendu : ${JSON.stringify(attendu)}`); }
};
const imm = formesClient('Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)', lire('imm'));
verifier('IMM, forme courte', imm.court, { article: "l'", nom: 'IMM', genre: '' });
const sansDce = formesClient('Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)', '');
verifier('IMM sans DCE, nom d\'usage', sansDce.court, { article: 'le', nom: 'Nouvel IMM', genre: 'm' });
// Autres acheteurs : formes inchangées.
verifier('Becquerel', formesClient('Centre Henri Becquerel', lire('becquerel')).court, undefined);
verifier('Université de Rouen', formesClient('Université de Rouen Normandie', lire('rouen_univ')).court, undefined);
const ign = formesClient("École Nationale des Ponts et Chaussées (ENPC) et Institut national de l'information géographique et forestière (IGN), pour l'École Nationale des Sciences Géographiques (ENSG, dénommée Géodata Paris)", lire('ign'));
verifier('IGN', ign.court?.nom, "ENPC et l'IGN");
// Publipostage : forme courte après la première mention, pronom accordé sur la forme imprimée.
const v = {
  CLIENT: { valeur: imm.long, article: "l'", court: imm.court!.nom, articleCourt: imm.court!.article, genreCourt: imm.court!.genre },
} as any;
const p = publiposter('Pour {{CLIENT}}, votre interlocuteur unique est joignable. {{CLIENT}} peut, s\'il le souhaite, consulter la main courante.', v);
verifier('publipostage IMM', p.texte, "Pour l'IMM, votre interlocuteur unique est joignable. L'IMM peut, s'il le souhaite, consulter la main courante.");
const pl = publiposter('{{CLIENT}} peut, s\'il le souhaite, consulter la main courante.', v, { clientLong: true });
verifier('publipostage IMM forme longue', pl.texte, "L'Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM) peut, si elle le souhaite, consulter la main courante.");
console.log(ko ? `${ko} échec(s)` : '7/7 cas conformes');
process.exit(ko ? 1 : 0);
