/**
 * HARNAIS HORS LIGNE — CADRE IMPOSÉ ET FORMAT COURT SUR LE MÉMOIRE TYPE, AUCUN APPEL OPENAI :
 *  génération complète (generate) sur un DCE du corpus, appels au modèle interceptés au niveau du SDK (réponses
 *  simulées : _verif/cadre_court_simulation.ts ; embeddings en sac de mots), rendu réel (docx, ou PDF du format court).
 *  Contrôles :
 *   - cadre (etampes1, rouen_univ) : réponses développées reprises du mémoire type (fidélité ≥ 0,9 après recalage, décision D7),
 *     questions hors mémoire type signalées en proposition, valeurs d'identité de la référence (SIRET, CNAPS, contacts,
 *     signataire…) toujours présentes ;
 *   - format court (imm) : parties dans l'ordre du RC, pages ≤ maximum, part des phrases venues du mémoire type, aucune
 *     variable {{…}}, aucune mention « Non communiqué », aucun autre acheteur, propositions signalées.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/cadre_court_hors_ligne.ts <imm|etampes1|rouen_univ> <sortie> [<référence champs_avant>]
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import OpenAI from 'openai';
import PizZip from 'pizzip';
import { DB } from '../src/core/db';
import * as tempStorage from '../src/core/temp_storage';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import * as memoireType from '../src/generation/memoire_type';
import * as cadreMT from '../src/generation/memoire_type_cadre';
import { repondre, embedding, journal, inconnus, champs, CorpusCC } from './cadre_court_simulation';

const corpus = process.argv[2] as CorpusCC;
const SORTIE = path.resolve(process.argv[3] || path.join(__dirname, `sorties_cadre_court_${corpus}`));
const REF = process.argv[4];
if (!['imm', 'etampes1', 'rouen_univ', 'ca_normandie'].includes(corpus)) { console.error('Corpus : imm, etampes1, rouen_univ ou ca_normandie'); process.exit(2); }
const id = `cchl-${corpus}`;
const ROOT = path.resolve(__dirname, '../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve(__dirname, '../response/etats', `${id}.json`);
fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', corpus), dceDir, { recursive: true });

// Chrome sans synchronisation d'affichage (écran du Mac en veille : requestAnimationFrame bloqué).
if (!process.env.CHROME_PATH) {
  const lanceur = path.join(SORTIE, 'chrome.sh');
  fs.writeFileSync(lanceur, `#!/bin/sh\nexec "${require('puppeteer').executablePath()}" --disable-gpu-vsync --disable-frame-rate-limit --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows "$@"\n`);
  fs.chmodSync(lanceur, 0o755);
  process.env.CHROME_PATH = lanceur;
}

(DB as any).saveDossier = async () => null;
(DB as any).getDossier = async () => ({ id, dce_files: [] });
(tempStorage as any).uploadTempDocx = async () => null;
(MemoireGenerator.prototype as any).materializeDceFromStorage = async () => null;

const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
CP.create = async (body: any) => ({ choices: [{ message: { content: repondre(corpus, body) } }], usage: {}, model: body.model });
EP.create = async (body: any) => {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: embedding(String(t)) })) };
};
// Embeddings en sac de mots : similarités plus basses que text-embedding-3-small → seuil sémantique abaissé (simulation).
const cm: any = cadreMT;
const candidatsOrigine = cm.candidatsReference;
cm.candidatsReference = (mt: any, textes: any, q: string, o: any = {}) => candidatsOrigine(mt, textes, q, { ...o, seuil: 0.2, ecart: 0.06 });
// Textes publipostés (part des phrases du mémoire type dans le résultat).
const publies: Record<string, string> = {};
const mtm: any = memoireType;
const publierOrigine = mtm.publierMemoire;
mtm.publierMemoire = (...args: any[]) => { const r = publierOrigine(...args); for (const p of r) if (p.texte) publies[p.id] = p.texte; return r; };
// ── Schémas de process du bloc 1 dessinés (T2C-1) : étape vide ou tronquée, texte qui redit le titre, titres quasi
//    identiques, renvoi « bloc n » = anomalie. ──
const schemasBloc1: any[] = [];
{
  const ss: any = require('../src/generation/schema_service');
  const dessinerOrigine = ss.dessinerSpecs;
  ss.dessinerSpecs = async (specs: any[], ...autres: any[]) => {
    const r = await dessinerOrigine(specs, ...autres);
    for (const s of specs) if (/b1_comprehension/.test(String(s.id)) && r?.get?.(s.id)?.ok) schemasBloc1.push({ gabarit: s.gabarit, params: s.params });
    return r;
  };
}
const { anomaliesSchemaBloc1 } = require('../src/generation/reponse_libre_v2');
const journalLog: string[] = [];
const logOrigine = console.log.bind(console);
console.log = (...a: any[]) => { const l = a.map(String).join(' '); if (/Mémoire type|Format court|Adaptation|Condensation|répartition|sélection/i.test(l)) journalLog.push(l); logOrigine(...a); };

const ACHETEURS: Record<string, RegExp> = {
  imm: /Montsouris|Nouvel IMM/, etampes1: /[ÉE]tampes/, becquerel: /Becquerel/, caen: /ACOSS|URSSAF/, citedia: /Citédia|Citedia/, havre1: /Havre/, vitry: /Vitry/,
  rouen_univ: /Université de Rouen/, ca_normandie: /[Cc]our d.appel/, parc_expo: /Parc des Expositions/,
};
const texteDocx = (f: string) => new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText().split(/<w:p[ >]/).slice(1)
  .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('')).join('\n')
  .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

(async () => {
  const t0 = Date.now();
  let r: any;
  let erreur = '';
  try { r = await new MemoireGenerator().generate(id); } catch (e: any) { erreur = String(e?.stack || e).slice(0, 1500); }
  const res: any = { corpus, duree_s: Math.round((Date.now() - t0) / 1000), erreur, anomalies: [] as string[] };
  const anomalie = (x: string) => res.anomalies.push(x);
  for (const sp of schemasBloc1) for (const a of anomaliesSchemaBloc1(sp)) anomalie(`étape vide ou tronquée dans le schéma du bloc 1 : ${a}`);
  let etat: any = null;
  try { etat = JSON.parse(fs.readFileSync(etatF, 'utf-8')); } catch { anomalie('état de complétion absent'); }
  res.consultations = r?.consultations || [];
  res.propositions = res.consultations.filter((c: string) => /^Proposition de réponse à valider|^Réponse à relire/.test(c));
  if (r?.filePath && /\.docx$/.test(r.filePath)) {
    const texte = texteDocx(r.filePath);
    fs.writeFileSync(path.join(SORTIE, `${corpus}.docx.txt`), texte);
    fs.copyFileSync(r.filePath, path.join(SORTIE, `${corpus}.docx`));
    res.champs = champs;
    res.repris = champs.filter((c) => c.repris.length).length;
    res.sans_reference = champs.filter((c) => !c.candidats.length).length;
    res.essais_stricts = champs.filter((c) => c.strict).length;
    // Valeurs d'identité de la référence (modèle muet, code du commit 697d1ab) : toujours présentes.
    if (REF && fs.existsSync(path.join(REF, `${corpus}.complet.txt`))) {
      const ref = fs.readFileSync(path.join(REF, `${corpus}.complet.txt`), 'utf-8').split('=== DOCX ===\n')[1] || '';
      const lignes = ref.split('\n').map((l) => l.trim()).filter((l) => /\d{3}\s?\d{3}\s?\d{3}|AUT-|@|GLOBAL SECURITY|Dirigeant|\+33|0\d(?:[ .]?\d{2}){4}/i.test(l));
      const absentes = lignes.filter((l) => !texte.includes(l));
      res.identite = { lignes: lignes.length, absentes };
      if (absentes.length) anomalie(`${absentes.length} ligne(s) d'identité de la référence absente(s) : ${absentes.slice(0, 3).join(' | ')}`);
    }
    if (/\{\{|Non communiqué/.test(texte)) anomalie('variable {{…}} ou « Non communiqué » dans le docx');
    // Correction 3 : aucune phrase du mémoire type reprise deux fois ; schémas insérés ; premier message de l'assistant.
    const phrasesMT = new Set(Object.values(publies).flatMap((t) => cadreMT.texteBrut(t).split(/(?<=[.!?])\s+|\n+/)).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 12));
    const doublons = [...phrasesMT].filter((ph) => texte.split(ph).length > 2);
    res.phrases_mt_en_double = doublons.length;
    if (doublons.length) anomalie(`${doublons.length} phrase(s) du mémoire type reprise(s) deux fois : ${doublons.slice(0, 2).join(' | ').slice(0, 300)}`);
    const xml = new PizZip(fs.readFileSync(r.filePath)).file('word/document.xml')!.asText();
    res.schemas_inseres = [...xml.matchAll(/descr="Schéma GSS ([^"]+)"/g)].map((m) => m[1]);
    res.conversation = etat?.conversation || null;
    // Correction 7 : une ligne « - … » par réponse à relire, sans repère technique (« [GSS_CH_n] ») montré à GSS.
    const premier = etat?.conversation?.[0]?.role === 'assistant' ? etat.conversation[0].texte : '';
    const lignesARelire = premier.split('\n\n')[0].split('\n').filter((l: string) => /^- /.test(l));
    res.premier_message_lignes = lignesARelire.length;
    if (res.propositions.length && lignesARelire.length !== res.propositions.length) anomalie('propositions absentes du premier message de l\'assistant');
    if (/GSS_CH|GSS_AC/.test(premier)) anomalie('repère technique (GSS_CH_n) dans le premier message de l\'assistant');
    for (const [c, re] of Object.entries(ACHETEURS)) if (c !== corpus && re.test(texte)) anomalie(`nom d'un autre acheteur (${c}) dans le docx`);
  }
  if (r?.filePath && /\.pdf$/.test(r.filePath)) {
    fs.copyFileSync(r.filePath, path.join(SORTIE, `${corpus}.pdf`));
    res.pages = Number((/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [r.filePath], { encoding: 'utf-8' }).stdout || '') || [])[1] || 0);
    const texte = spawnSync('pdftotext', ['-layout', r.filePath, '-'], { encoding: 'utf-8', maxBuffer: 64e6 }).stdout;
    fs.writeFileSync(path.join(SORTIE, `${corpus}.pdf.txt`), texte);
    const court = etat?.libre?.court;
    if (!court) anomalie('état sans plan du format court');
    else {
      res.pagesMax = court.pagesMax;
      if (res.pages > court.pagesMax) anomalie(`${res.pages} pages pour ${court.pagesMax} autorisées`);
      // Parties dans l'ordre du RC.
      const norm = (x: string) => x.replace(/\s+/g, ' ');
      const plat = norm(texte);
      const positions = court.plan.map((p: any) => plat.indexOf(norm(p.title).slice(0, 40)));
      res.ordre_parties = positions;
      if (positions.some((x: number) => x < 0) || positions.some((x: number, i: number) => i && x < positions[i - 1])) anomalie(`parties absentes ou hors de l'ordre du RC (${positions.join(', ')})`);
      // Part des phrases du mémoire type : phrases du texte remis (hors engagements, propositions, remarques) venues des textes publipostés.
      const sections: Record<string, string> = etat.libre.sections;
      const toutMT = Object.values(publies).join('\n\n');
      res.parties = court.plan.map((p: any) => {
        const t = sections[p.id] || '';
        const blocsMT = t.split(/\n(?=## )/).filter((b) => !/^## (?:Nos engagements|Engagements sur|Cohérence du prix|Nos remarques)/.test(b));
        const mt = blocsMT.join('\n');
        return { id: p.id, titre: p.title, mots: (t.match(/\S+/g) || []).length, part_memoire_type: Math.round(memoireType.fidelite(mt, toutMT) * 100) / 100, sous_titres: (t.match(/^## .+$/gm) || []).map((x) => x.slice(3)) };
      });
      const global = memoireType.fidelite(court.plan.map((p: any) => (sections[p.id] || '').split(/\n(?=## )/).filter((b: string) => !/^## (?:Nos engagements|Engagements sur|Cohérence du prix|Nos remarques)/.test(b)).join('\n')).join('\n'), toutMT);
      res.part_memoire_type = Math.round(global * 100) / 100;
      if (global < 0.9) anomalie(`seulement ${Math.round(global * 100)} % des phrases viennent du mémoire type (90 % exigés, décision D7)`);
      if (/\{\{|Non communiqué|⟦AC:|\[CONSULTATION REQUISE/.test(texte)) anomalie('variable, mention « Non communiqué » ou marqueur interne dans le PDF');
      for (const [c, re] of Object.entries(ACHETEURS)) if (c !== corpus && re.test(texte)) anomalie(`nom d'un autre acheteur (${c}) dans le PDF`);
      if (!res.propositions.length) anomalie('aucune proposition signalée (le prix du RC n\'est pas dans le mémoire type)');
      // Tour 1 (T1C-12) : la compréhension du besoin a toujours son schéma de process (consigne 3) ; sous-titre jamais collé.
      if (res.consultations.some((c: string) => /schéma de process de la compréhension du besoin n'a pas pu être dessiné/.test(c))) anomalie('compréhension du besoin sans schéma de process');
      if (/[.!?]##\s/.test(texte)) anomalie('sous-titre « ## » collé au texte');
    }
    spawnSync('pdftoppm', ['-png', '-r', '50', r.filePath, path.join(SORTIE, 'p')]);
  }
  res.journal = journalLog;
  res.appels = journal.reduce((m: Record<string, number>, j) => { m[j.type] = (m[j.type] || 0) + 1; return m; }, {});
  res.inconnus = inconnus;
  if (inconnus.length) anomalie(`${inconnus.length} appel(s) non simulé(s)`);
  if (erreur) anomalie(`erreur : ${erreur.slice(0, 300)}`);
  fs.writeFileSync(path.join(SORTIE, 'resultat.json'), JSON.stringify(res, null, 1));
  fs.rmSync(dceDir, { recursive: true, force: true });
  fs.rmSync(etatF, { force: true });
  if (r?.filePath) fs.rmSync(r.filePath, { force: true });
  logOrigine(`\n═══ ${corpus} : ${res.anomalies.length} anomalie(s)${res.anomalies.length ? ` :\n- ${res.anomalies.join('\n- ')}` : ''}\n${res.pages ? `pages ${res.pages}/${res.pagesMax}, part du mémoire type ${res.part_memoire_type}` : `repris ${res.repris}, sans référence ${res.sans_reference}, essais stricts ${res.essais_stricts}`} ; propositions ${res.propositions.length} ; ${res.duree_s} s`);
  process.exit(0);
})();
