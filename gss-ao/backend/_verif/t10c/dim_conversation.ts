// T10N-1, T10N-2, T10N-3 : réponse à la proposition de dimensionnement écrite dans la conversation de l'assistant, sur l'état
// becquerel du harnais v2 (_verif/reponse_libre_v2.ts) ; modèle simulé (compte des appels), rendu PDF remplacé (le schéma,
// lui, est redessiné par le moteur réel).
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/t10c/dim_conversation.ts <etat.json>
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
const B = path.resolve(__dirname, '../..');
let appels = 0;
const cli: any = new OpenAI({ apiKey: 'x' });
Object.getPrototypeOf(cli.chat.completions).create = async () => { appels++; return { choices: [{ message: { content: JSON.stringify({ reponse: 'Réponse simulée.', actions: [] }) } }], usage: {} }; };
const { MemoireGenerator } = require('../../src/generation/memoire_generator');
MemoireGenerator.prototype.rendreDepuisSections = async (_s: any, _id: string, o: any) => ({ filePath: '/tmp/simule.pdf', schemas: o.schemas, cover: o.cover });
const { discuter } = require('../../src/generation/assistant_memoire');
const { lignesTableauEquipe } = require('../../src/generation/completion');
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
let ko = 0;
(async () => {
  for (const [i, msg] of ['Je valide les effectifs proposés', "Mets 7 agents SSIAP 2 dans l'équipe dédiée", 'Passe les SSIAP 1 à 4', 'SSIAP 1 : 4', 'Ajoute 2 rondes par nuit'].entries()) {
    const id = `t10c-dim-${i}`;
    const etat = JSON.parse(JSON.stringify(src)); etat.dossierId = id;
    fs.writeFileSync(`${B}/response/etats/${id}.json`, JSON.stringify(etat));
    appels = 0;
    const r = await discuter(id, msg);
    const el = r.etat.elements.find((e: any) => /^Proposition à valider\s*:\s*dimensionnement/i.test(e.question));
    const sec = r.etat.libre.sections;
    const idT = Object.keys(sec).find((k) => lignesTableauEquipe(sec[k]).length)!;
    const lignes = lignesTableauEquipe(sec[idT]);
    const somme = lignes.reduce((t: number, l: any) => t + (l.nombre || 0), 0);
    const phrase = (/équipe (?:dédiée )?de (\d+) agents? titulaires?/.exec(Object.values(sec).join('\n')) || [])[1];
    const svg = String(r.etat.libre.schemas['b3_adequation#schema'] || '');
    const nombresSchema = [...svg.matchAll(/>(\d+)</g)].map((m) => m[1]);
    const attendu = i === 4 ? el.statut === 'ouvert' && appels === 1 : el.statut === 'complete' && appels === 0 && String(somme) === phrase && nombresSchema[0] === phrase && !/À COMPLÉTER/.test(sec[idT].split('\n').filter((l: string) => /^\|/.test(l)).join('\n'));
    if (!attendu) ko++;
    console.log(`${attendu ? 'OK ' : 'KO '} « ${msg} » → appels au modèle ${appels} ; élément ${el.statut} ; tableau ${lignes.map((l: any) => `${l.qualification || l.categorie}=${l.nombre}`).join(' + ')} = ${somme} ; phrase « équipe de ${phrase} » ; schéma ${nombresSchema[0]} ; réponse : ${r.reponse}`);
    fs.unlinkSync(`${B}/response/etats/${id}.json`);
  }
  console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
