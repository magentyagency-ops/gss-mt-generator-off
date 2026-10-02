/**
 * REJEU HORS LIGNE (AUCUN APPEL OPENAI) d'une génération enregistrée par _verif/gen_enreg.ts : chaque requête au modèle
 * reçoit la réponse enregistrée pour les mêmes messages (dans l'ordre en cas de doublon) ; une requête nouvelle (prompt
 * changé par une correction) est signalée et reçoit la réponse enregistrée la plus proche par son message système et
 * son début (sinon un objet JSON vide). Écrit le document produit et l'état dans <sortie>.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/rejouer.ts <enregistrement.json> <code corpus> <sortie>
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import PizZip from 'pizzip';

const [FICHIER, code, SORTIE_REL] = process.argv.slice(2);
const SORTIE = path.resolve(SORTIE_REL);
const enreg: { chat: Record<string, any[]>; emb: Record<string, number[]> } = JSON.parse(fs.readFileSync(FICHIER, 'utf-8'));
const cleChat = (body: any) => crypto.createHash('sha1').update(JSON.stringify(body?.messages || [])).digest('hex');
const servis: Record<string, number> = {};
const nouvelles: string[] = [];
{
  const cli: any = new OpenAI({ apiKey: 'rejeu' });
  const CP = Object.getPrototypeOf(cli.chat.completions);
  const EP = Object.getPrototypeOf(cli.embeddings);
  CP.create = async function (body: any) {
    const k = cleChat(body);
    const l = enreg.chat[k];
    if (l?.length) { const i = servis[k] || 0; servis[k] = i + 1; const rep = l[Math.min(i, l.length - 1)]; return { ...rep, usage: {} }; }
    nouvelles.push(String(body?.messages?.[0]?.content || '').slice(0, 120).replace(/\s+/g, ' '));
    return { choices: [{ message: { content: '{}' } }], usage: {}, model: body.model };
  };
  EP.create = async function (body: any) {
    const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
    return { data: inp.map((t, i) => ({ index: i, embedding: enreg.emb[String(t)] || new Array(1536).fill(0) })) };
  };
}
// CAPTURE_RECALAGE=1 : entrées de chaque recalage du cadre écrites dans <sortie>/recalage_<n>.json (référence, réponse,
// options, phrases exclues), pour rejouer le recalage seul.
if (process.env.CAPTURE_RECALAGE === '1') {
  const mtc = require('../src/generation/memoire_type_cadre');
  const orig = mtc.recalerSurReference;
  let n = 0;
  mtc.recalerSurReference = (reference: string, reponse: string, o: any = {}) => {
    const exclues: string[] = [];
    const exclure = o.exclure ? (ph: string) => { const x = o.exclure(ph); if (x) exclues.push(ph); return x; } : undefined;
    const r = orig(reference, reponse, { ...o, exclure });
    fs.mkdirSync(SORTIE, { recursive: true });
    fs.writeFileSync(path.join(SORTIE, `recalage_${++n}.json`), JSON.stringify({ reference, reponse, options: { ...o, exclure: undefined, dce: undefined, dceLong: (o.dce || '').length }, exclues, resultat: r }, null, 1));
    return r;
  };
}
const { DB } = require('../src/core/db');
const tempStorage = require('../src/core/temp_storage');
const { MemoireGenerator } = require('../src/generation/memoire_generator');
const id = `rejeu-${code}`;
const ROOT = path.resolve(__dirname, '../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve(__dirname, '../response/etats', `${id}.json`);
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
DB.saveDossier = async () => null;
DB.getDossier = async () => ({ id, dce_files: [] });
tempStorage.uploadTempDocx = async () => null;
MemoireGenerator.prototype.materializeDceFromStorage = async () => null;
if (process.env.GEN_RENDU !== '1') MemoireGenerator.prototype.rendreDepuisSections = async () => ({ filePath: '', schemas: new Map(), cover: {} });
const texteDocx = (f: string) => {
  const x = new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText();
  return x.split(/<w:p[ >]/).slice(1).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>|<w:br\/>|<w:tab\/>/g) || []).map((m) => (m === '<w:br/>' ? '\n' : m === '<w:tab/>' ? ' ' : m.replace(/<[^>]+>/g, ''))).join(''))
    .map((t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')).join('\n');
};
(async () => {
  const r: any = await new MemoireGenerator().generate(id);
  const res: any = { consultations: r?.consultations || [], requetes_nouvelles: nouvelles };
  try { const e = JSON.parse(fs.readFileSync(etatF, 'utf-8')); res.elements = e.elements; res.conversation = e.conversation; if (e.libre) res.sections = e.libre.sections; } catch { /* pas d'état */ }
  if (r?.filePath && /\.docx$/.test(r.filePath)) { res.texte_docx = texteDocx(r.filePath); fs.copyFileSync(r.filePath, path.join(SORTIE, `${id}.docx`)); }
  fs.writeFileSync(path.join(SORTIE, 'resultat.json'), JSON.stringify(res, null, 1));
  if (res.texte_docx) fs.writeFileSync(path.join(SORTIE, 'texte.txt'), res.texte_docx);
  console.log('FIN rejeu', id, `${nouvelles.length} requête(s) nouvelle(s)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
