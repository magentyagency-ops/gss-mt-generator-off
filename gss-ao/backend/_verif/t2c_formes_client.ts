import fs from 'fs';
import { formesClient, variablesDuMarche, chargerMemoireType } from '../src/generation/memoire_type';
const dce = fs.readFileSync('../_corpus_verif/_dce_textes/ca_normandie.txt', 'utf-8');
const n = "Ministère de la Justice – Service administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen)";
console.log(JSON.stringify(formesClient(n, dce)));
const mt = chargerMemoireType();
console.log(JSON.stringify(variablesDuMarche(mt, { cover: { client: n }, analyse: { clientName: n }, dce, registre: [] } as any, {}).CLIENT));
const v = "Ville de Vitry-sur-Seine, en qualité de coordonnateur des groupements de commandes Ville/Sidoresto et Ville/CCAS";
console.log(JSON.stringify(formesClient(v, fs.readFileSync('../_corpus_verif/_dce_textes/vitry.txt', 'utf-8'))));
