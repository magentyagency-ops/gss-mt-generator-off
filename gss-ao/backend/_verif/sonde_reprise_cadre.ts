// SONDE (appels réels limités) : reprise du mémoire type dans des réponses développées d'un cadre, après réglage de la
// consigne. Tous les appels au modèle sont simulés (_verif/cadre_court_simulation.ts) SAUF ceux des champs listés, envoyés
// à OpenAI ; embeddings réels (recherche des textes de référence). Coût mesuré (tarif gpt-6-luna) et affiché.
// Usage : sonde_reprise_cadre.ts <corpus> <n° de champ>[,<n°>…] <sortie>
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import '../src/core/config';
import { DB } from '../src/core/db';
import * as tempStorage from '../src/core/temp_storage';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { repondre, CorpusCC } from './cadre_court_simulation';

const [corpus, liste, sortie] = process.argv.slice(2) as [CorpusCC, string, string];
const cibles = liste.split(',').map((x) => `[CHAMP_${x.trim()}]`);
const id = `sonde-${corpus}`;
const ROOT = path.resolve(__dirname, '../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
fs.mkdirSync(sortie, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', corpus), dceDir, { recursive: true });
(DB as any).saveDossier = async () => null;
(DB as any).getDossier = async () => ({ id, dce_files: [] });
(tempStorage as any).uploadTempDocx = async () => null;
(MemoireGenerator.prototype as any).materializeDceFromStorage = async () => null;
(MemoireGenerator.prototype as any).analyzeDce = async function () { return JSON.parse(repondre(corpus, { messages: [{ role: 'system', content: "Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS" }] })); };
const cli: any = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CP = Object.getPrototypeOf(cli.chat.completions);
const creer = CP.create;
let cout = 0;
const reponses: any[] = [];
CP.create = async function (this: any, body: any, ...reste: any[]) {
  const u = (body.messages || []).map((m: any) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  const champ = cibles.find((c) => u.includes(`CHAMP UNIQUE À RÉDIGER :\nChamp ${c}`));
  if (!champ) return { choices: [{ message: { content: repondre(corpus, body) } }], usage: {}, model: body.model };
  const r = await creer.call(this, body, ...reste);
  const us = r?.usage || {};
  const cache = us.prompt_tokens_details?.cached_tokens || 0;
  cout += (Math.max(0, (us.prompt_tokens || 0) - cache) * 0.10 + cache * 0.01 + (us.completion_tokens || 0) * 0.50) / 1e6 * (String(r?.service_tier).toLowerCase() === 'flex' ? 0.5 : 1);
  reponses.push({ champ, modele: r?.model, strict: /Ton essai précédent a reformulé/.test(u), reponse: r?.choices?.[0]?.message?.content });
  return r;
};
(async () => {
  let r: any;
  try { r = await new MemoireGenerator().generate(id); } catch (e: any) { console.log('ERREUR', String(e?.message || e).slice(0, 400)); }
  fs.writeFileSync(path.join(sortie, 'reponses.json'), JSON.stringify(reponses, null, 1));
  fs.rmSync(dceDir, { recursive: true, force: true });
  fs.rmSync(path.resolve(__dirname, '../response/etats', `${id}.json`), { force: true });
  if (r?.filePath) fs.renameSync(r.filePath, path.join(sortie, `${corpus}.docx`));
  console.log(`SONDE ${corpus} ${liste} : ${reponses.length} appel(s) réel(s), coût ≈ ${cout.toFixed(4)} $`);
  process.exit(0);
})();
