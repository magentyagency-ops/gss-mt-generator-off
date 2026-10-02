/**
 * Génération hors ligne (AUCUN APPEL OPENAI, modèle simulé) en réponse libre v2 (caen, becquerel) ou format court (imm),
 * sans rendu : sections et consultations écrites dans <sortie>/sections.json.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/_t4c/gen_hl.ts <corpus> <sortie> [analyse.json]
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { DB } from '../../src/core/db';
import * as tempStorage from '../../src/core/temp_storage';
import { MemoireGenerator } from '../../src/generation/memoire_generator';
import { lireEtat } from '../../src/generation/completion';
import * as simLibre from '../reponse_libre_v2_simulation';
import * as simCourt from '../cadre_court_simulation';

const corpus = process.argv[2] as any;
const SORTIE = path.resolve(process.argv[3]);
const ANALYSE = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf-8')) : null;
const { repondre, embedding } = (corpus === 'imm' ? simCourt : simLibre) as any;
const id = `hl-${corpus}`;
const ROOT = path.resolve(__dirname, '../../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', corpus), dceDir, { recursive: true });
(DB as any).saveDossier = async () => null;
(DB as any).getDossier = async () => ({ id, dce_files: [] });
(tempStorage as any).uploadTempDocx = async () => null;
const P: any = MemoireGenerator.prototype;
P.materializeDceFromStorage = async () => null;
P.rendreDepuisSections = async () => ({ filePath: '', schemas: new Map(), cover: {} });
P.schemasMemoireType = async () => null;
const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
CP.create = async function (body: any) {
  const sys = String(body.messages?.[0]?.content || '');
  // Analyse du DCE remplacée (cas réel de caen 441 : « aucun agent SSIAP exigé »).
  if (ANALYSE && /Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS/.test(sys)) return { choices: [{ message: { content: JSON.stringify(ANALYSE) } }], usage: {}, model: body.model };
  return { choices: [{ message: { content: repondre(corpus, body) } }], usage: {}, model: body.model };
};
EP.create = async function (body: any) {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: embedding(String(t)) })) };
};
(async () => {
  const r: any = await new MemoireGenerator().generate(id, () => undefined);
  const etat: any = lireEtat(id);
  fs.writeFileSync(path.join(SORTIE, 'sections.json'), JSON.stringify({ consultations: r.consultations, sections: etat?.libre?.sections, elements: etat?.elements, conversation: etat?.conversation }, null, 1));
  console.log('écrit', path.join(SORTIE, 'sections.json'));
})().catch((e) => { console.error(e); process.exit(2); });
