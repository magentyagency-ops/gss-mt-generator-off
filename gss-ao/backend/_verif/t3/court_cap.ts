import fs from 'fs';
import { formesClient } from '../../src/generation/memoire_type';
const C = __dirname + '/../../../_corpus_verif/_dce_textes/';
console.log(JSON.stringify(formesClient("ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE ET ENVIRONNEMENTALE DU GRAND PARIS SUD - DIRECTION DES MOYENS GÉNÉRAUX ET DE LA LOGISTIQUE", fs.readFileSync(C + 'ign.txt', 'utf-8'))));
console.log(JSON.stringify(formesClient("Ministère de la Justice – Service administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen)", fs.readFileSync(C + 'ca_normandie.txt', 'utf-8'))));
