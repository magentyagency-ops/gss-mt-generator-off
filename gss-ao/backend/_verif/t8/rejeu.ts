/** Tour 8 (correction) : copie du rejeu du vérificateur (qualite/tour8/consignes/rejeu8.ts), identifiant r8k-*.
 *
 * REJEU HORS LIGNE « AU PLUS PROCHE » (AUCUN APPEL OPENAI), tour 7 : comme _verif/t6/rejouer_proche.ts, mais le message
 * système d'une requête du catalogue peut différer de quelques lignes (85 % de lignes communes au moins) : une correction
 * qui change le bloc du dimensionnement du message système (T7N-1, T7N-7) ne fait plus perdre toutes les réponses du cadre.
 *
 * Tour 6 : Comme _verif/t5/rejouer_variantes.ts, plus :
 * - REJEU_CATALOGUE_ECRIRE=<f.json> : écrit le texte de chaque requête (et la clé de la réponse servie, ou null) ;
 *   à lancer une fois avec le code de référence (HEAD avant correction) ;
 * - REJEU_CATALOGUE=<f.json> : une requête nouvelle (prompt changé par une correction) reçoit la réponse enregistrée de la
 *   requête du catalogue qui a le même message système et le texte utilisateur le plus proche (lignes communes, au moins
 *   75 %, chaque requête du catalogue utilisée une fois) : la même réponse que la référence (« {} » si la référence l'a
 *   reçu) ; sinon un objet JSON vide. Chaque substitution est journalisée.
 * - CAPTURE_CTX=1 : matrice et indicateurs écrits dans <sortie>/indicateurs_<n>.json.
 * Usage : [REJEU_CATALOGUE=…] npx ts-node --transpile-only -P tsconfig.json _verif/t6/rejouer_proche.ts <enreg.json> <code> <sortie>
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const OpenAI = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/node_modules/openai').default || require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/node_modules/openai');
const PizZip = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/node_modules/pizzip');

const [FICHIER, code, SORTIE_REL] = process.argv.slice(2);
// REJEU_VARIANTES=<module.js|ts> : liste de fonctions (texte d'un message → texte) qui ramènent une requête modifiée par
// une correction (prompt changé) à la forme enregistrée ; essayées une à une, puis toutes ensemble.
const VARIANTES: Array<(t: string) => string> = process.env.REJEU_VARIANTES ? require(path.resolve(process.env.REJEU_VARIANTES)).VARIANTES : [];
const SORTIE = path.resolve(SORTIE_REL);
const enreg: { chat: Record<string, any[]>; emb: Record<string, number[]> } = JSON.parse(fs.readFileSync(FICHIER, 'utf-8'));
const cleChat = (body: any) => crypto.createHash('sha1').update(JSON.stringify(body?.messages || [])).digest('hex');
const servis: Record<string, number> = {};
const texteMsg = (m: any): string => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((c: any) => c?.text ?? '').join('\n') : '');
const lignes = (body: any): string[] => (body?.messages || []).slice(1).map(texteMsg).join('\n').split(/\n+/).map((x: string) => x.trim()).filter(Boolean);
const CATALOGUE: Array<{ k: string | null; msgs: any[] }> | null = process.env.REJEU_CATALOGUE ? JSON.parse(fs.readFileSync(process.env.REJEU_CATALOGUE, 'utf-8')) : null;
const ECRIRE = process.env.REJEU_CATALOGUE_ECRIRE || '';
const CAT_ECRIT: Array<{ k: string | null; msgs: any[] }> = [];
const UTILISES = new Set<number>();
if (process.env.CAPTURE_CTX === '1') {
  const mt = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/memoire_type');
  const orig = mt.preparerMemoireType;
  let n = 0;
  mt.preparerMemoireType = (ctx: any, o: any) => {
    const r = orig(ctx, o);
    fs.mkdirSync(path.resolve(SORTIE_REL), { recursive: true });
    fs.writeFileSync(path.join(path.resolve(SORTIE_REL), `indicateurs_${++n}.json`), JSON.stringify({ matrice: ctx.matrice || [], etats: r.etatsIndicateurs, plan: r.plan }, null, 1));
    return r;
  };
}
const nouvelles: string[] = [];
{
  const cli: any = new OpenAI({ apiKey: 'rejeu' });
  const CP = Object.getPrototypeOf(cli.chat.completions);
  const EP = Object.getPrototypeOf(cli.embeddings);
  CP.create = async function (body: any) {
    let k = cleChat(body);
    if (!enreg.chat[k]?.length && VARIANTES.length) {
      const essais = [...VARIANTES.map((f) => [f]), VARIANTES];
      for (const fs2 of essais) {
        const b2 = { ...body, messages: (body?.messages || []).map((m: any) => ({ ...m, content: typeof m.content === 'string' ? fs2.reduce((t, f) => f(t), m.content)
          : Array.isArray(m.content) ? m.content.map((c: any) => (typeof c?.text === 'string' ? { ...c, text: fs2.reduce((t, f) => f(t), c.text) } : c)) : m.content })) };
        const k2 = cleChat(b2);
        if (enreg.chat[k2]?.length) { k = k2; break; }
      }
    }
    // Catalogue : toutes les requêtes du rejeu de référence (k = clé de l'enregistrement, ou null si la référence a
    // elle-même reçu « {} »). Une requête nouvelle reçoit ce qu'a reçu la requête de référence la plus proche.
    let vide = false;
    if (!enreg.chat[k]?.length && CATALOGUE) {
      const sys = texteMsg(body?.messages?.[0]);
      const u = lignes(body);
      const lignesSys = (t: string) => new Set(String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean));
      const ls = lignesSys(sys);
      const sysProche = (t: string) => { if (t === sys) return true; const v = lignesSys(t); return [...ls].filter((x) => v.has(x)).length / Math.max(ls.size, v.size, 1) >= 0.85; };
      let best = -1, score = 0;
      CATALOGUE.forEach((c, n) => {
        if (UTILISES.has(n) || !sysProche(texteMsg(c.msgs[0]))) return;
        const v = new Set(lignes({ messages: c.msgs }));
        const s2 = u.filter((x) => v.has(x)).length / Math.max(u.length, v.size, 1);
        if (s2 > score) { score = s2; best = n; }
      });
      if (best >= 0 && score >= 0.75) {
        UTILISES.add(best);
        console.log(`[rejeu] requête nouvelle servie comme la référence la plus proche (${score.toFixed(2)}${CATALOGUE[best].k ? '' : ', « {} »'}) : ${sys.slice(0, 80).replace(/\s+/g, ' ')}`);
        if (CATALOGUE[best].k) k = CATALOGUE[best].k!; else vide = true;
      }
    }
    if (ECRIRE) CAT_ECRIT.push({ k: enreg.chat[k]?.length ? k : null, msgs: (body?.messages || []).map((m: any) => ({ role: m.role, content: texteMsg(m) })) });
    const l = vide ? undefined : enreg.chat[k];
    if (l?.length) { const i = servis[k] || 0; servis[k] = i + 1; const rep = l[Math.min(i, l.length - 1)]; return { ...rep, usage: {} }; }
    nouvelles.push(String(body?.messages?.[0]?.content || '').slice(0, 120).replace(/\s+/g, ' '));
    if (process.env.REJEU_DUMP) fs.appendFileSync(process.env.REJEU_DUMP, `\n\n######## REQUÊTE NOUVELLE\n${(body?.messages || []).map((m: any) => `--- ${m.role}\n${typeof m.content === 'string' ? m.content : (m.content || []).map((c: any) => c?.text ?? JSON.stringify(c)).join('\n')}`).join('\n')}`);
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
  const mtc = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/memoire_type_cadre');
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
const { DB } = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/core/db');
const tempStorage = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/core/temp_storage');
const { MemoireGenerator } = require('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/memoire_generator');
const id = `r8k-${code}`;
const ROOT = path.resolve('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/response/etats', `${id}.json`);
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
DB.saveDossier = async () => null;
DB.getDossier = async () => ({ id, dce_files: [] });
tempStorage.uploadTempDocx = async () => null;
MemoireGenerator.prototype.materializeDceFromStorage = async () => null;
// Sans rendu : chaque section est réputée avoir sa page de schéma (pas d'alerte « schéma manquant » propre au rejeu).
if (process.env.GEN_RENDU !== '1') MemoireGenerator.prototype.rendreDepuisSections = async (sections: Record<string, string>) => ({ filePath: '', schemas: new Map(Object.keys(sections || {}).map((id) => [`${id}#schema`, '<svg/>'])), cover: {} });
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
  if (ECRIRE) fs.writeFileSync(ECRIRE, JSON.stringify(CAT_ECRIT));
  console.log('FIN rejeu', id, `${nouvelles.length} requête(s) nouvelle(s)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
