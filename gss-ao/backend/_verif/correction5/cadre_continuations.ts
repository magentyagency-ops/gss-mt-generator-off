// Correction 5, bug 6 : modèle simulé qui répond « [À COMPLÉTER] » à chaque champ (aucun appel OpenAI) ; contrôle que les
// lignes de continuation « : …… » d'une question déjà pourvue n'en gardent aucun.
// NON-RÉGRESSION DU CADRE IMPOSÉ, SANS AUCUN APPEL OPENAI (SDK intercepté : réponses « {} », embeddings simulés).
// Usage :
//   cadre_champs_hors_ligne.ts <code corpus> champs   → exécute _verif/champs.ts tel quel (40 premiers appels)
//   cadre_champs_hors_ligne.ts <code corpus> complet  → génération complète du cadre, modèle muet : TOUS les champs vus
//                                                        par le modèle + le texte du .docx produit (seuls les remplissages
//                                                        déterministes y figurent : identité, SIRET, CNAPS, contacts,
//                                                        signataire, effectif…) dans $SORTIE/<code>.complet.txt
// Sert à comparer l'état de départ (code du commit 697d1ab extrait dans un dossier temporaire) et l'état actuel.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';

const [code, mode = 'champs'] = process.argv.slice(2);
const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
const vecteur = (t: string) => {
  let g = crypto.createHash('md5').update(t).digest().readUInt32LE(0);
  return Array.from({ length: 1536 }, () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296 - 0.5; });
};
CP.create = async (body: any) => ({ choices: [{ message: { content: '{}' } }], usage: {}, model: body.model });
EP.create = async (body: any) => {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: vecteur(String(t)) })) };
};

{

  const { DB } = require('../../src/core/db');
  const tempStorage = require('../../src/core/temp_storage');
  const { MemoireGenerator } = require('../../src/generation/memoire_generator');
  const id = `champsc-${code}`;
  const ROOT = path.resolve(__dirname, '../../..');
  const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
  fs.rmSync(dceDir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
  DB.getDossier = async () => ({ id, dce_files: [] });
  DB.saveDossier = async () => null;
  tempStorage.uploadTempDocx = async () => null;
  const P: any = MemoireGenerator.prototype;
  P.materializeDceFromStorage = async () => null;
  P.getDceContext = async () => '';
  P.analyzeDce = async () => ({});
  P.getGssDocumentation = async () => ({});
  P.getGssReferents = async () => '';
  P.getGssTotalEffectif = async () => null;
  P.perimetreMarche = async () => '';
  const vus = new Set<string>();
  P.callOpenAI = async (messages: any[]) => {
    const u = messages.map((m: any) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    const champs = u.split('\n').filter((l) => /^Champ \[CHAMP_\d+\]/.test(l));
    champs.forEach((c) => vus.add(c));
    const m = /^Champ \[CHAMP_(\d+)\]/.exec(champs[0] || '');
    if (!m || champs.length !== 1 || /CASE A COCHER/.test(champs[0])) return '{}';
    // Ligne de continuation (« Question: ":" ») : une politique tirée du texte de GSS, puis une mesure non sourcée.
    // (cadre rouen_univ : CHAMP_47 et CHAMP_48 suivent « Politique sociale en faveur des employés… »).
    if (m[1] === '47') return JSON.stringify({ id: 47, value: 'Application des pénalités CCAP aux agents.' });
    if (m[1] === '48') return JSON.stringify({ id: 48, value: "Prime de fin d'année qui récompense nos agents selon leur efficacité." });
    if (/Question: ":"/.test(champs[0])) return '{}';
    return JSON.stringify({ id: Number(m[1]), value: '[À COMPLÉTER]' });
  };
  (async () => {
    let texte = '';
    let erreur = '';
    try {
      const r: any = await new MemoireGenerator().generate(id);
      if (process.env.CONSULTATIONS) console.log('CONSULTATIONS', JSON.stringify(r?.consultations || []));
      if (r?.filePath) {
        const x = new (require('pizzip'))(fs.readFileSync(r.filePath)).file('word/document.xml').asText();
        texte = x.split(/<w:p[ >]/).slice(1).map((pp: string) => (pp.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m: string) => m.replace(/<[^>]+>/g, '')).join('')).join('\n');
        fs.rmSync(r.filePath, { force: true });
      }
    } catch (e: any) { erreur = String(e?.stack || e).slice(0, 800); }
    const champs = [...vus].sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
    const sortie = process.env.SORTIE || '/tmp';
    fs.writeFileSync(path.join(sortie, `${code}.continuations.txt`), `${erreur ? `ERREUR ${erreur}\n` : ''}=== CHAMPS (${champs.length}) ===\n${champs.join('\n')}\n=== DOCX ===\n${texte}\n`);
    console.log(`${code} : ${champs.length} champ(s) vus par le modèle${erreur ? ` — ERREUR ${erreur.slice(0, 200)}` : ''}`);
    fs.rmSync(dceDir, { recursive: true, force: true });
    try { fs.rmSync(path.resolve(__dirname, '../../response/etats', `${id}.json`), { force: true }); } catch { /* rien */ }
    process.exit(0);
  })();
}
