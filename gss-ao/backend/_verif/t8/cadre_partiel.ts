/**
 * Tour 8 (T8CS-3) : cadre imposé rejoué hors ligne avec un modèle simulé, sans aucun appel OpenAI. Les champs dont la
 * question contient MOTIF (expression régulière, défaut « \bNom\b|Coordonn ») reçoivent « {} » (réponse sans « value ») ;
 * les champs dont la question contient ACOMPLETER (facultatif) reçoivent {"value": "[À COMPLÉTER]"} ; les autres champs
 * reçoivent {"value": "Réponse simulée n."}. Tous les autres appels (analyse, consolidation…) : « {} ».
 * Usage : MOTIF='…' npx ts-node --transpile-only -P tsconfig.json _verif/t8/cadre_partiel.ts <code> <sortie>
 */
import fs from 'fs';
import path from 'path';
const PizZip = require('pizzip');
const [code, SORTIE_REL] = process.argv.slice(2);
const SORTIE = path.resolve(SORTIE_REL);
const MOTIF = new RegExp(process.env.MOTIF || String.raw`\bNom\b|Coordonn`, 'i');
{
  // Client OpenAI hors ligne (appels hors callOpenAI : embeddings, analyse) : « {} » et vecteurs nuls.
  const OpenAI = require('openai').default || require('openai');
  const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
  Object.getPrototypeOf(cli.chat.completions).create = async (body: any) => ({ choices: [{ message: { content: '{}' } }], usage: {}, model: body.model });
  Object.getPrototypeOf(cli.embeddings).create = async (body: any) => ({ data: (Array.isArray(body.input) ? body.input : [body.input]).map((_t: string, i: number) => ({ index: i, embedding: new Array(1536).fill(0) })) });
}
const { DB } = require('../../src/core/db');
const tempStorage = require('../../src/core/temp_storage');
const { MemoireGenerator } = require('../../src/generation/memoire_generator');
const id = `r8k-p-${code}`;
const ROOT = path.resolve(__dirname, '../../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve(__dirname, '../../response/etats', `${id}.json`);
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
DB.saveDossier = async () => null;
DB.getDossier = async () => ({ id, dce_files: [] });
tempStorage.uploadTempDocx = async () => null;
MemoireGenerator.prototype.materializeDceFromStorage = async () => null;
MemoireGenerator.prototype.rendreDepuisSections = async (sections: Record<string, string>) => ({ filePath: '', schemas: new Map(Object.keys(sections || {}).map((x) => [`${x}#schema`, '<svg/>'])), cover: {} });
const vides: string[] = [];
let n = 0;
MemoireGenerator.prototype.callOpenAI = async function (messages: any[], _t: number, label: string) {
  const m = /^Champ (\d+)/.exec(label || '');
  if (!m) return '{}';
  const user = String(messages?.[1]?.content || '');
  const champ = (/CHAMP UNIQUE À RÉDIGER :\n([\s\S]{0,400})/.exec(user) || [])[1] || '';
  if (process.env.ACOMPLETER && new RegExp(process.env.ACOMPLETER, 'i').test(champ)) return JSON.stringify({ id: Number(m[1]), value: '[À COMPLÉTER]' });
  if (MOTIF.test(champ)) { vides.push(`${m[1]} : ${champ.split('\n')[0].slice(0, Number(process.env.LONG || 120))}`); return '{}'; }
  return JSON.stringify({ id: Number(m[1]), value: `Réponse simulée ${++n}.` });
};
const texteDocx = (f: string) => {
  const x = new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText();
  return x.split(/<w:p[ >]/).slice(1).map((p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')).join('\n');
};
(async () => {
  let r: any = null, erreur = '';
  try { r = await new MemoireGenerator().generate(id); } catch (e: any) { erreur = String(e?.message || e); }
  const res: any = { erreur, champs_vides: vides, consultations: r?.consultations || [] };
  try { const e = JSON.parse(fs.readFileSync(etatF, 'utf-8')); res.conversation = (e.conversation || []).slice(0, 1); } catch { /* pas d'état */ }
  if (r?.filePath && /\.docx$/.test(r.filePath)) fs.writeFileSync(path.join(SORTIE, 'texte.txt'), texteDocx(r.filePath));
  fs.writeFileSync(path.join(SORTIE, 'resultat.json'), JSON.stringify(res, null, 1));
  console.log('FIN', id, erreur || 'document remis', `${vides.length} champ(s) « {} »`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
