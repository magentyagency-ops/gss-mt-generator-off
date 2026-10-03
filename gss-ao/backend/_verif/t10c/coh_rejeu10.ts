/**
 * Tour 9, cohérence : génération HORS LIGNE (aucun appel OpenAI) d'un dossier (corpus ou dossier source quelconque),
 * avec un modèle simulé :
 *   FAUX=vide   : chaque appel reçoit « {} » (OpenAI muet / réponse inutilisable)
 *   FAUX=quota  : chaque appel lève l'erreur réelle de crédit épuisé (429 You have no credits remaining)
 *   FAUX=quota_milieu:N : les N premiers appels répondent « {} », puis crédit épuisé
 *   FAUX=flex429 : un appel Flex reçoit 429 (ressource indisponible) ; le repli standard répond « {} »
 *   FAUX=enreg (ENREG=<f.json>) : réponses enregistrées, « {} » sinon
 * Usage : DOSSIER_SOURCE=<dir> npx ts-node --transpile-only -P <backend>/tsconfig.json rejeu8.ts <code> <sortie>
 */
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require(B + '/node_modules/openai').default || require(B + '/node_modules/openai');
const PizZip = require(B + '/node_modules/pizzip');
const [code, SORTIE_REL] = process.argv.slice(2);
const SORTIE = path.resolve(SORTIE_REL);
const FAUX = process.env.FAUX || 'vide';
const enreg = FAUX === 'enreg' ? JSON.parse(fs.readFileSync(process.env.ENREG, 'utf-8')) : { chat: {}, emb: {} };
const cleChat = (body: any) => crypto.createHash('sha1').update(JSON.stringify(body?.messages || [])).digest('hex');
let nAppels = 0; const tiers: Record<string, number> = {};
const systemes: string[] = []; const tailles: number[] = [];
{
  const cli: any = new OpenAI({ apiKey: 'rejeu' });
  const CP = Object.getPrototypeOf(cli.chat.completions);
  const EP = Object.getPrototypeOf(cli.embeddings);
  const creerOrig = CP.create; // déjà enveloppé par le repli Flex de modeles_ia ? non : modeles_ia n'est pas encore chargé
  const base = async function (body: any) {
    nAppels++;
    { const k = [body?.model, body?.service_tier || 'standard', body?.reasoning_effort || '-', body?.temperature ?? '-', body?.prompt_cache_options ? 'cache' : 'nocache'].join('|'); tiers[k] = (tiers[k] || 0) + 1; }
    tailles.push(JSON.stringify(body?.messages||[]).length); systemes.push(String(typeof body?.messages?.[0]?.content === 'string' ? body.messages[0].content : JSON.stringify(body?.messages?.[0]?.content || '')).slice(0, 90).replace(/\s+/g, ' '));
    const quota = () => { const e: any = new Error('429 You have no credits remaining. Add credits to continue using the API.'); e.status = 429; throw e; };
    if (FAUX === 'quota') quota();
    if (FAUX.startsWith('quota_milieu')) { const n = Number(FAUX.split(':')[1] || 5); if (nAppels > n) quota(); }
    if (FAUX === 'ctx' && JSON.stringify(body?.messages||[]).length > Number(process.env.CTX_MAX||400000)) { const e: any = new Error("400 This model's maximum context length is exceeded"); e.status = 400; e.code='context_length_exceeded'; throw e; }
    if (FAUX === 'flex429' && body?.service_tier === 'flex') { const e: any = new Error('429 Resource unavailable'); e.status = 429; throw e; }
    if (FAUX === 'analyse' && JSON.stringify(body?.messages || []).includes('gssStrategicRecommendations')) return { choices: [{ message: { content: process.env.ANALYSE_JSON || '{}' } }], usage: {}, model: body.model };
    // FAUX=champ (correction T10-COH-2) : chaque champ du cadre reçoit une réponse qui reprend le premier texte de GSS proposé.
    if (FAUX === 'champ') {
      const u = JSON.stringify(body?.messages || []);
      const m = /CHAMP UNIQUE À RÉDIGER/.exec(u);
      if (m) { const id = Number((/\{\\"id\\": (\d+)/.exec(u) || [])[1] || 0); return { choices: [{ message: { content: JSON.stringify({ id, value: 'Réponse rédigée.', reference: /\[R1\]/.test(u) ? ['R1'] : [] }) } }], usage: {}, model: body.model }; }
    }
    if (FAUX === 'enreg') { const l = enreg.chat[cleChat(body)]; if (l?.length) return { ...l[0], usage: {} }; }
    return { choices: [{ message: { content: '{}' } }], usage: {}, model: body.model };
  };
  CP.create = function (body: any) { return base(body); };
  EP.create = async function (body: any) {
    const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
    return { data: inp.map((t: string, i: number) => ({ index: i, embedding: enreg.emb[String(t)] || new Array(1536).fill(0) })) };
  };
}
const { DB } = require(B + '/src/core/db');
const tempStorage = require(B + '/src/core/temp_storage');
const { MemoireGenerator } = require(B + '/src/generation/memoire_generator');
const id = `coh10-${code}`;
const ROOT = path.resolve(B, '..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve(B, 'response/etats', `${id}.json`);
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.rmSync(etatF, { force: true });
fs.cpSync(process.env.DOSSIER_SOURCE || path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
DB.saveDossier = async () => null;
DB.getDossier = async () => ({ id, dce_files: [] });
tempStorage.uploadTempDocx = async () => null;
MemoireGenerator.prototype.materializeDceFromStorage = async () => null;
if (process.env.GEN_RENDU !== '1') MemoireGenerator.prototype.rendreDepuisSections = async () => ({ filePath: '', schemas: new Map(), cover: {} });
const texteDocx = (f: string) => {
  const x = new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText();
  return x.split(/<w:p[ >]/).slice(1).map((p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>|<w:br\/>|<w:tab\/>/g) || []).map((m: string) => (m === '<w:br/>' ? '\n' : m === '<w:tab/>' ? ' ' : m.replace(/<[^>]+>/g, ''))).join(''))
    .map((t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')).join('\n');
};
const t0 = Date.now();
(async () => {
  let r: any; let erreur: any = null;
  try { r = await new MemoireGenerator().generate(id); } catch (e: any) { erreur = { name: e?.name, message: e?.message }; }
  const res: any = { duree_s: (Date.now() - t0) / 1000, appels: nAppels, tiers, tailles, erreur, consultations: r?.consultations || [], cle_resultat: Object.keys(r || {}), filePath: r?.filePath, systemes };
  try { const e = JSON.parse(fs.readFileSync(etatF, 'utf-8')); res.etat_cles = Object.keys(e); res.elements = e.elements; res.conversation = e.conversation; if (e.libre) res.sections = e.libre.sections; } catch { /* pas d'état */ }
  if (r?.filePath && /\.docx$/.test(r.filePath) && fs.existsSync(r.filePath)) { res.texte_docx = texteDocx(r.filePath); fs.copyFileSync(r.filePath, path.join(SORTIE, `${id}.docx`)); fs.writeFileSync(path.join(SORTIE, 'texte.txt'), res.texte_docx); }
  if (r?.filePath && /\.pdf$/.test(r.filePath) && fs.existsSync(r.filePath)) fs.copyFileSync(r.filePath, path.join(SORTIE, code + '.pdf'));
  if (r?.markdown) fs.writeFileSync(path.join(SORTIE, 'memoire.md'), String(r.markdown));
  fs.writeFileSync(path.join(SORTIE, 'resultat.json'), JSON.stringify(res, null, 1));
  console.log('FIN', id, 'duree', res.duree_s, 's appels', nAppels, JSON.stringify(tiers), 'erreur', JSON.stringify(erreur));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
