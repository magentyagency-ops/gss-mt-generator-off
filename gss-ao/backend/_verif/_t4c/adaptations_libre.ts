/**
 * T4C-13 (D8) hors ligne, AUCUN APPEL OPENAI : génération complète en réponse libre v2 (caen) ou en format court (imm),
 * modèle simulé (reponse_libre_v2_simulation) ; la passe de cohérence renvoie la correction réelle de caen 471 sur la
 * rubrique fixe « écologie, mobilité, numérique ». Contrôle : phrase adaptée dans le texte, signalée dans les
 * consultations et dans le premier message de l'assistant.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/_t4c/adaptations_libre.ts <caen|imm>
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

const corpus = (process.argv[2] || 'caen') as any;
const { repondre, embedding } = (corpus === 'imm' ? simCourt : simLibre) as any;
if (!process.env.CHROME_PATH) {
  const lanceur = path.join(require('os').tmpdir(), 't4c13_chrome.sh');
  fs.writeFileSync(lanceur, `#!/bin/sh\nexec "${require('puppeteer').executablePath()}" --disable-gpu-vsync --disable-frame-rate-limit --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows "$@"\n`);
  fs.chmodSync(lanceur, 0o755);
  process.env.CHROME_PATH = lanceur;
}
const id = `t4c13-${corpus}`;
const ROOT = path.resolve(__dirname, '../../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
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
const EXTRAIT = "et n'imprimons plus de documents.";
CP.create = async function (body: any) {
  const sys = String(body.messages?.[0]?.content || ''), user = String(body.messages?.[1]?.content || '');
  if (/qui CONTREDIT une exigence/.test(sys) && user.includes(EXTRAIT)) {
    const rub = (/=== (\S+) — /.exec(user) || [])[1];
    return { choices: [{ message: { content: JSON.stringify({ corrections: [{ id: rub, extrait: EXTRAIT, remplacement: "et imprimons les rapports d'intervention requis au format papier.", exigence: "Les rapports d'intervention sont remis au format papier.", meme_obligation: 'impression des rapports' }] }) } }], usage: {}, model: body.model };
  }
  // Format court : la rubrique écologie peut être écartée ; une phrase de la partie « moyens humains » est adaptée.
  const memo = user.split('MÉMOIRE :')[1] || '';
  const m = /[^\n.*]{12}(?:en|sous|de) (\d+) (heures?|minutes)/.exec(memo);
  if (corpus === 'imm' && /qui CONTREDIT une exigence/.test(sys) && m && !(globalThis as any).__adapte) {
    (globalThis as any).__adapte = m[0];
    const rub = (/=== (\S+) — /.exec(user) || [])[1];
    return { choices: [{ message: { content: JSON.stringify({ corrections: [{ id: rub, extrait: m[0], remplacement: m[0].replace(m[1], String(Number(m[1]) + 7)), exigence: `Délai maximal imposé : ${Number(m[1]) + 7} ${m[2]}.`, meme_obligation: 'même délai' }] }) } }], usage: {}, model: body.model };
  }
  return { choices: [{ message: { content: repondre(corpus, body) } }], usage: {}, model: body.model };
};
EP.create = async function (body: any) {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: embedding(String(t)) })) };
};
(async () => {
  const r: any = await new MemoireGenerator().generate(id, () => undefined);
  const etat: any = lireEtat(id);
  const sections = etat?.libre?.sections || {};
  const adapte = String((globalThis as any).__adapte || '').replace(/(\d+)/, (x) => String(Number(x) + 7));
  const ou = Object.keys(sections).filter((k) => /imprimons les rapports d'intervention requis/.test(sections[k]) || (adapte && sections[k].includes(adapte)));
  console.log('adaptation simulée :', (globalThis as any).__adapte, '→', adapte);
  const lignes = (r.consultations || []).filter((c: string) => /adaptée au cahier des charges/.test(c));
  const msg = String(etat?.conversation?.[0]?.texte || '');
  console.log(JSON.stringify({ rubriques_adaptees: ou, consultations: lignes, premier_message_adaptation: msg.split('\n').filter((l) => /adapté|devient|rétablir/.test(l)) }, null, 1));
  const ok = ou.length > 0 && lignes.length === ou.length && /devient/.test(msg);
  console.log(ok ? 'OK' : 'KO');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
