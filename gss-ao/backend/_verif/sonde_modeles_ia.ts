// SONDE DU MODULE src/core/modeles_ia.ts (modèle OpenAI centralisé : gpt-6-luna, effort par usage, cache explicite).
// Usage (depuis backend/) :
//   npx ts-node --transpile-only _verif/sonde_modeles_ia.ts          contrôles HORS LIGNE seulement (aucun appel réseau)
//   npx ts-node --transpile-only _verif/sonde_modeles_ia.ts --reel   puis un appel réel minimal par combinaison de paramètres
// Hors ligne : le SDK OpenAI et fetch renvoient des réponses simulées ; on relève le corps EXACT des requêtes produites
// par les vrais chemins de code (callOpenAI, completion.json, decrirePhoto, transcrirePdf, SchemaService,
// evaluateMissingInfoChat) dans plusieurs configurations d'environnement, et on le compare à l'attendu.
// Réel : coût exact calculé à partir de l'objet usage renvoyé par l'API. Arrêt immédiat sur une erreur 4xx autre qu'une
// limite de débit (paramètre refusé) ou si le crédit est épuisé. Aucune écriture en base ; le cache OCR du PDF de test
// est supprimé. Les pièces de test (PNG, PDF, faux moteur de schémas) sont créées dans SONDE_DIR.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import OpenAI from 'openai';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { json as jsonCompletion } from '../src/generation/completion';
import { decrirePhoto } from '../src/generation/assistant_memoire';
import { transcrirePdf } from '../src/ingestion/ocr_pdf';
import { SchemaService } from '../src/generation/schema_service';

const REEL = process.argv.includes('--reel');
const DIR = process.env.SONDE_DIR || path.join(__dirname, '_sonde_modeles_ia');
const RAPPORT = path.join(DIR, 'rapport.json');
const CACHE_OCR = path.resolve(__dirname, '../response/ocr_cache');
const VARIABLES = ['GSS_IA_MODELE', 'GSS_IA_EFFORT', 'GSS_IA_EFFORT_REDACTION', 'GSS_IA_EFFORT_ANALYSE', 'GSS_IA_EFFORT_MECANIQUE', 'GSS_IA_CACHE', 'GSS_IA_SERVICE_TIER'];
const CLES_PERMISES = new Set(['model', 'messages', 'reasoning_effort', 'temperature', 'prompt_cache_options', 'service_tier', 'response_format']);

// Tarifs Standard (USD par million de jetons, relevés le 01/10/2026), identiques à _verif/gen.ts.
const TARIFS: Record<string, { entree: number; cache: number; ecrit: number; sortie: number }> = {
  'gpt-6-luna': { entree: 0.10, cache: 0.01, ecrit: 0.125, sortie: 0.50 },
  'gpt-5.6-luna': { entree: 0.20, cache: 0.02, ecrit: 0.25, sortie: 1.20 },
};
const coutAppel = (modele: string, u: any): number | null => {
  const t = TARIFS[Object.keys(TARIFS).find((m) => modele.startsWith(m)) || ''];
  if (!t || !u) return null;
  const entree = u.prompt_tokens || 0, cache = u.prompt_tokens_details?.cached_tokens || 0, ecrit = u.prompt_tokens_details?.cache_write_tokens || 0;
  return (Math.max(0, entree - cache - ecrit) * t.entree + cache * t.cache + ecrit * t.ecrit + (u.completion_tokens || 0) * t.sortie) / 1e6;
};

// ─── Interception du SDK et de fetch : corps exact de chaque requête ; réponse simulée hors ligne ───
// Le SDK openai v6 envoie ses requêtes par fetch (en-têtes x-stainless-*) : une requête du SDK est comptée UNE fois, à
// l'appel de create ; fetch ne compte que les appels directs (evaluateMissingInfoChat). Hors ligne, le SDK construit sa
// vraie requête HTTP et fetch lui renvoie une réponse simulée : on vérifie que le corps HTTP envoyé est identique aux
// paramètres passés à create (les paramètres non typés par le SDK, comme prompt_cache_options, sont bien transmis).
interface Trace { etape: string; corps: any; corpsHttp?: any; modele?: string; usage?: any; contenu?: string; erreur?: { status?: number; code?: string; message: string } }
const traces: Trace[] = [];
let etape = '';
let reel = false;

const reponseSimulee = (corps: any) => ({
  id: 'simule', object: 'chat.completion', model: corps.model,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: corps.response_format?.type === 'json_object'
    ? JSON.stringify({ sujet: 'simulé', gabarit: 'grille', params: {}, status: 'rejected', bot_reply: 'Question simulée', reponse: 'OK', value: 'simulé' })
    : 'Texte simulé.' } }],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});

function resume(): any[] {
  return traces.filter((t) => t.usage || t.erreur).map((t) => ({
    etape: t.etape, modele_repondu: t.modele, erreur: t.erreur,
    envoye: { model: t.corps.model, reasoning_effort: t.corps.reasoning_effort, temperature: t.corps.temperature, prompt_cache_options: t.corps.prompt_cache_options, point_d_arret: pointDArret(t.corps), response_format: t.corps.response_format?.type },
    usage: t.usage, cout_usd: t.usage ? coutAppel(String(t.modele || t.corps.model), t.usage) : 0,
  }));
}
function arreter(raison: string, code: number): never {
  const r = resume();
  fs.writeFileSync(RAPPORT, JSON.stringify({ arret: raison, appels: r, cout_total_usd: r.reduce((s, x) => s + (x.cout_usd || 0), 0) }, null, 1));
  console.log(`\nARRÊT : ${raison}\n${JSON.stringify(r, null, 1)}`);
  process.exit(code);
}
/** Crédit épuisé → arrêt immédiat ; paramètre refusé (4xx hors limite de débit) → arrêt immédiat (pas de nouvel essai). */
function verifierErreur(t: Trace) {
  const e = t.erreur!;
  if (/insufficient_quota|credit_balance|no credits/i.test(`${e.code} ${e.message}`)) arreter(`crédit OpenAI épuisé (${t.etape})`, 2);
  if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) arreter(`requête refusée ${e.status} (${t.etape}) : ${e.message}`, 3);
}

const CP: any = Object.getPrototypeOf(new OpenAI({ apiKey: 'sonde' }).chat.completions);
const creerReel = CP.create;
CP.create = function (corps: any, ...rest: any[]) {
  const t: Trace = { etape, corps: JSON.parse(JSON.stringify(corps)) };
  traces.push(t);
  const p = creerReel.call(this, corps, ...rest);
  Promise.resolve(p).then(
    (rep: any) => { if (reel) { t.modele = rep?.model; t.usage = rep?.usage; } t.contenu = rep?.choices?.[0]?.message?.content ?? ''; },
    (e: any) => { t.erreur = { status: e?.status, code: e?.code || e?.error?.code, message: String(e?.message || e).slice(0, 400) }; verifierErreur(t); },
  );
  return p;
};
const fetchReel = globalThis.fetch;
const viaSdk = (init?: any) => [...new Headers(init?.headers || {}).keys()].some((k) => k.startsWith('x-stainless-'));
const reponseHttp = (corps: any) => new Response(JSON.stringify(reponseSimulee(corps)), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (url: any, init?: any) => {
  if (!String(url).includes('/v1/chat/completions')) return fetchReel(url, init);
  const corps = JSON.parse(String(init?.body || '{}'));
  if (viaSdk(init)) {
    // Requête construite par le SDK : déjà comptée à l'appel de create (dernière trace sans corps HTTP).
    const t = [...traces].reverse().find((x) => !x.corpsHttp && !x.etape.endsWith('[fetch]'));
    if (t) t.corpsHttp = corps;
    return reel ? fetchReel(url, init) : reponseHttp(corps);
  }
  const t: Trace = { etape: `${etape} [fetch]`, corps, corpsHttp: corps };
  traces.push(t);
  if (!reel) return reponseHttp(corps);
  const rep = await fetchReel(url, init);
  const texte = await rep.clone().text();
  let j: any = {};
  try { j = JSON.parse(texte); } catch { /* corps non JSON */ }
  t.modele = j.model; t.usage = j.usage; t.contenu = j.choices?.[0]?.message?.content ?? '';
  if (!rep.ok || j.error) { t.erreur = { status: rep.status, code: j.error?.code, message: String(j.error?.message || texte).slice(0, 400) }; verifierErreur(t); }
  return rep;
}) as any;

// ─── Pièces de test ───
const pointDArret = (corps: any) => (corps.messages || []).flatMap((m: any, i: number) => Array.isArray(m.content)
  ? m.content.filter((p: any) => p.prompt_cache_breakpoint).map((p: any) => `message ${i} ${JSON.stringify(p.prompt_cache_breakpoint)}`) : []).join(', ') || undefined;
/** Consigne stable de plus de 1 024 jetons (seuil du cache) : préfixe mis en cache, comme la consigne système du cadre. */
const CONSIGNE_LONGUE = 'Tu remplis un champ du cadre de réponse d\'un mémoire technique de sécurité privée pour GSS.\n' +
  Array.from({ length: 45 }, (_, i) => `Règle ${i + 1} : l'agent de sécurité vérifie le point de contrôle numéro ${i + 1} et consigne l'heure de passage dans la main courante électronique.`).join('\n');
const CHAMP = 'Champ de test : nombre d\'agents SSIAP 1 présents en journée selon l\'extrait « 2 agents SSIAP 1 de 7 h à 19 h ». Renvoie UNIQUEMENT un objet JSON : {"id": 1, "value": "..."}';

async function preparerPieces() {
  fs.mkdirSync(DIR, { recursive: true });
  const png = path.join(DIR, 'photo.png');
  const py = spawnSync('python3', ['-c', `from PIL import Image, ImageDraw
im = Image.new('RGB', (260, 90), 'white'); d = ImageDraw.Draw(im)
d.rectangle([4, 4, 255, 85], outline='navy', width=3); d.text((18, 36), 'GSS - poste de garde - 24 h/24', fill='black')
im.save(${JSON.stringify(png)})`], { encoding: 'utf-8' });
  if (py.status !== 0) throw new Error(`PNG de test : ${py.stderr}`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText('CCTP - Article 3 : presence de 2 agents SSIAP 1 de 7 h a 19 h, du lundi au vendredi.', { x: 50, y: 780, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  const pdf = path.join(DIR, 'cctp_scanne.pdf');
  fs.writeFileSync(pdf, await doc.save());
  const moteur = path.join(DIR, 'faux_moteur_schemas.sh');
  fs.writeFileSync(moteur, '#!/bin/sh\ncat > /dev/null\nprintf \'%s\' \'{"resultats":[{"id":"sonde","ok":true,"svg":"<svg></svg>"}]}\'\n');
  fs.chmodSync(moteur, 0o755);
  return { png, pdf, moteur };
}

// ─── Chemins de code exercés (une étape = un chemin ; usage et température d'origine de l'appel) ───
// horsPerimetre : appel hors rédaction (cartographie, « à ne pas toucher ») qui garde son modèle d'origine, indépendant des
// variables GSS_IA_* (et donc jamais en niveau Flex).
interface Etape { nom: string; usage: 'redaction' | 'analyse' | 'mecanique'; temperature?: number; prefixe?: boolean; json: boolean; horsPerimetre?: () => string; lancer: () => Promise<any> }
function etapes(p: { png: string; pdf: string; moteur: string }): Etape[] {
  const gen: any = new MemoireGenerator();
  const schemas: any = new SchemaService();
  schemas.python = p.moteur; // faux moteur : accepte toute spécification (seul l'appel OpenAI est éprouvé)
  const page = { key: 'b_sonde_1', sectionId: 'b_sonde', sectionTitle: 'Contrôle des prestations', text: 'Le chef de poste contrôle chaque jour la main courante. En cas d\'écart, il alerte le responsable de site, qui corrige le planning sous 24 heures. Un bilan mensuel est remis au client.' };
  return [
    { nom: 'completion.json (assistant, complétion)', usage: 'redaction', json: true,
      lancer: () => jsonCompletion('Tu réponds à un test de bon fonctionnement.', 'Réponds {"reponse": "OK"}.') },
    { nom: 'callOpenAI rédaction (texte)', usage: 'redaction', temperature: 0.5, json: false,
      lancer: () => gen.callOpenAI([{ role: 'system', content: 'Tu rédiges une phrase courte en français.' }, { role: 'user', content: 'Écris une phrase de 8 mots sur la sécurité privée.' }], 0.5, 'Sonde rédaction', false) },
    { nom: 'callOpenAI analyse (JSON)', usage: 'analyse', temperature: 0.2, json: true,
      lancer: () => gen.callOpenAI([{ role: 'system', content: 'Tu analyses un extrait de cahier des charges de sécurité privée.' }, { role: 'user', content: 'Extrait : « Le titulaire assure la présence de 2 agents SSIAP 1 de 7 h à 19 h, du lundi au vendredi. » Renvoie un objet JSON {"agents": nombre, "qualification": "…", "horaires": "…"}.' }], 0.2, 'Sonde analyse', true, 'analyse') },
    { nom: 'SchemaService (consigne mise en cache, JSON)', usage: 'redaction', prefixe: true, json: true,
      lancer: async () => { const r = await schemas.construireUne(page, []); return r ? r.gabarit : null; } },
    { nom: 'callOpenAI cadre (consigne mise en cache, écriture)', usage: 'redaction', temperature: 0.2, prefixe: true, json: true,
      lancer: () => gen.callOpenAI([{ role: 'system', content: CONSIGNE_LONGUE }, { role: 'user', content: CHAMP }], 0.2, 'Sonde cadre 1', true, 'redaction', 0) },
    { nom: 'callOpenAI cadre (consigne mise en cache, lecture)', usage: 'redaction', temperature: 0.2, prefixe: true, json: true,
      lancer: () => gen.callOpenAI([{ role: 'system', content: CONSIGNE_LONGUE }, { role: 'user', content: CHAMP.replace('nombre d\'agents SSIAP 1', 'qualification des agents') }], 0.2, 'Sonde cadre 2', true, 'redaction', 0) },
    { nom: 'decrirePhoto (image)', usage: 'mecanique', json: false, lancer: () => decrirePhoto(p.png) },
    { nom: 'transcrirePdf (OCR, PDF en pièce file)', usage: 'mecanique', json: false,
      horsPerimetre: () => process.env.OCR_MODEL || process.env.MEMOIRE_MODEL || 'gpt-5.6-luna',
      lancer: async () => {
        const cache = path.join(CACHE_OCR, `${crypto.createHash('sha1').update(fs.readFileSync(p.pdf)).digest('hex')}.txt`);
        try { return await transcrirePdf(p.pdf); } finally { fs.rmSync(cache, { force: true }); }
      } },
    { nom: 'evaluateMissingInfoChat (fetch direct, JSON)', usage: 'mecanique', temperature: 0.2, json: true,
      horsPerimetre: () => 'gpt-5.4-mini',
      lancer: () => gen.evaluateMissingInfoChat('Nom et fonction du responsable de site désigné pour le marché.', []) },
  ];
}

// ─── Attendus selon la configuration ───
interface Config { nom: string; env: Record<string, string> }
const CONFIGS: Config[] = [
  { nom: 'défaut', env: {} },
  { nom: 'retour arrière : modèle et effort', env: { GSS_IA_MODELE: 'gpt-5.6-luna', GSS_IA_EFFORT: 'medium' } },
  { nom: 'retour arrière complet (cache implicite)', env: { GSS_IA_MODELE: 'gpt-5.6-luna', GSS_IA_EFFORT: 'medium', GSS_IA_CACHE: 'implicite' } },
  { nom: 'modèle sans raisonnement', env: { GSS_IA_MODELE: 'gpt-4.1-mini' } },
  { nom: 'effort de rédaction surchargé', env: { GSS_IA_EFFORT_REDACTION: 'medium' } },
  { nom: 'effort global + effort propre à un usage', env: { GSS_IA_EFFORT: 'high', GSS_IA_EFFORT_MECANIQUE: 'none' } },
  { nom: 'effort invalide', env: { GSS_IA_EFFORT_ANALYSE: 'maximum' } },
  { nom: 'effort « minimal » (refusé par gpt-6-luna)', env: { GSS_IA_EFFORT: 'minimal' } },
  { nom: 'palier flex', env: { GSS_IA_SERVICE_TIER: 'flex' } },
  { nom: 'niveau standard (Flex désactivé)', env: { GSS_IA_SERVICE_TIER: 'standard' } },
  { nom: 'retour arrière + niveau standard', env: { GSS_IA_MODELE: 'gpt-5.6-luna', GSS_IA_EFFORT: 'medium', GSS_IA_SERVICE_TIER: 'standard' } },
];
function attendu(c: Config, e: Etape) {
  if (e.horsPerimetre) {
    const m = e.horsPerimetre();
    return { model: m, reasoning_effort: undefined, temperature: e.temperature, prompt_cache_options: undefined, point_d_arret: undefined, service_tier: undefined, response_format: e.json ? 'json_object' : undefined };
  }
  const modele = c.env.GSS_IA_MODELE || 'gpt-6-luna';
  const raisonne = /^(gpt-5|gpt-6)/.test(modele);
  const defaut = { redaction: 'low', analyse: 'medium', mecanique: 'none' }[e.usage];
  let effort = c.env[`GSS_IA_EFFORT_${e.usage.toUpperCase()}`] || c.env.GSS_IA_EFFORT || defaut;
  if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) effort = defaut;
  if (effort === 'minimal') effort = 'low';
  const cache = /^gpt-(5\.6|6)/.test(modele) && c.env.GSS_IA_CACHE !== 'implicite';
  return {
    model: modele,
    reasoning_effort: raisonne ? effort : undefined,
    temperature: raisonne ? undefined : e.temperature,
    prompt_cache_options: cache ? { mode: 'explicit' } : undefined,
    point_d_arret: cache && e.prefixe ? 'message 0 {"mode":"explicit"}' : undefined,
    // Flex par défaut pour gpt-6-luna ; « standard » le désactive ; toute autre valeur est transmise telle quelle.
    service_tier: (() => { const v = (c.env.GSS_IA_SERVICE_TIER || '').toLowerCase(); if (v === 'standard') return undefined; if (v) return v; return /^gpt-6-luna/.test(modele) ? 'flex' : undefined; })(),
    response_format: e.json ? 'json_object' : undefined,
  };
}
const viderEnv = () => { for (const v of VARIABLES) delete process.env[v]; };

async function horsLigne(p: { png: string; pdf: string; moteur: string }): Promise<number> {
  let echecs = 0;
  const textesConsigne = new Map<string, Set<string>>(); // étape → textes du message 0 (identiques avec ou sans point d'arrêt)
  for (const c of CONFIGS) {
    viderEnv(); Object.assign(process.env, c.env);
    console.log(`\n── Configuration « ${c.nom} » ${JSON.stringify(c.env)}`);
    for (const e of etapes(p)) {
      etape = `${c.nom} / ${e.nom}`;
      const debut = traces.length;
      await e.lancer();
      const t = traces[debut];
      if (!t || traces.length !== debut + 1) { console.log(`  ÉCHEC ${e.nom} : ${traces.length - debut} requête(s) au lieu d'une`); echecs++; continue; }
      const att = attendu(c, e);
      const obtenu = { model: t.corps.model, reasoning_effort: t.corps.reasoning_effort, temperature: t.corps.temperature, prompt_cache_options: t.corps.prompt_cache_options, point_d_arret: pointDArret(t.corps), service_tier: t.corps.service_tier, response_format: t.corps.response_format?.type };
      const ecarts = Object.keys(att).filter((k) => JSON.stringify((att as any)[k]) !== JSON.stringify((obtenu as any)[k]));
      const intrus = Object.keys(t.corps).filter((k) => !CLES_PERMISES.has(k));
      const m0 = t.corps.messages?.[0]?.content;
      const texte0 = typeof m0 === 'string' ? m0 : Array.isArray(m0) && m0.length === 1 && m0[0].type === 'text' ? m0[0].text : JSON.stringify(m0);
      if (e.prefixe) (textesConsigne.get(e.nom) ?? textesConsigne.set(e.nom, new Set()).get(e.nom)!).add(texte0);
      const httpIdentique = t.corpsHttp !== undefined && JSON.stringify(t.corpsHttp) === JSON.stringify(t.corps);
      const ok = !ecarts.length && !intrus.length && httpIdentique;
      if (!ok) echecs++;
      console.log(`  ${ok ? 'OK   ' : 'ÉCHEC'} ${e.nom.padEnd(52)} ${JSON.stringify(obtenu)}${ecarts.length ? `  écarts : ${ecarts.join(', ')} (attendu ${JSON.stringify(att)})` : ''}${intrus.length ? `  paramètres en trop : ${intrus.join(', ')}` : ''}${httpIdentique ? '' : '  corps HTTP absent ou différent des paramètres'}`);
    }
  }
  for (const [nom, textes] of textesConsigne) {
    const ok = textes.size === 1;
    if (!ok) echecs++;
    console.log(`${ok ? 'OK   ' : 'ÉCHEC'} texte de la consigne mise en cache identique dans toutes les configurations (${nom})`);
  }
  viderEnv();
  return echecs;
}

async function appelsReels(p: { png: string; pdf: string; moteur: string }) {
  reel = true;
  const resultats: any[] = [];
  const lancer = async (nom: string, e: Etape) => {
    etape = nom;
    const debut = traces.length;
    let sortie: any;
    try { sortie = await e.lancer(); } catch (x: any) { sortie = `EXCEPTION ${x?.message || x}`; }
    const ts = traces.slice(debut);
    for (const t of ts) if (t.erreur) verifierErreur(t);
    let jsonLisible: boolean | undefined;
    if (e.json) jsonLisible = ts.length > 0 && ts.every((t) => { try { return typeof JSON.parse(t.contenu || '') === 'object'; } catch { return false; } });
    const r = {
      etape: nom, requetes: ts.length, modele_repondu: ts.map((t) => t.modele).join(', '),
      envoye: ts.map((t) => ({ model: t.corps.model, reasoning_effort: t.corps.reasoning_effort, temperature: t.corps.temperature, prompt_cache_options: t.corps.prompt_cache_options, point_d_arret: pointDArret(t.corps), response_format: t.corps.response_format?.type, cles: Object.keys(t.corps).sort().join(',') })),
      usage: ts.map((t) => t.usage), cout_usd: ts.reduce((s, t) => s + (coutAppel(String(t.modele || t.corps.model), t.usage) || 0), 0),
      json_lisible: jsonLisible, sortie: typeof sortie === 'string' ? sortie.slice(0, 160) : JSON.stringify(sortie)?.slice(0, 160),
    };
    resultats.push(r);
    console.log(`\n${nom}\n${JSON.stringify(r, null, 1)}`);
  };
  viderEnv();
  for (const e of etapes(p)) await lancer(`défaut / ${e.nom}`, e);
  // Retour arrière (GSS_IA_MODELE=gpt-5.6-luna GSS_IA_EFFORT=medium) : un appel avec consigne mise en cache.
  Object.assign(process.env, { GSS_IA_MODELE: 'gpt-5.6-luna', GSS_IA_EFFORT: 'medium' });
  const cadre = etapes(p).find((e) => e.nom.includes('écriture'))!;
  await lancer('retour arrière gpt-5.6-luna / callOpenAI cadre (consigne mise en cache)', cadre);
  viderEnv();
  const total = resultats.reduce((s, r) => s + r.cout_usd, 0);
  fs.writeFileSync(RAPPORT, JSON.stringify({ appels: resultats, cout_total_usd: total }, null, 1));
  console.log(`\nAppels réels : ${resultats.reduce((s, r) => s + r.requetes, 0)} requête(s), coût exact total ${total.toFixed(6)} $ (rapport : ${RAPPORT})`);
}

(async () => {
  const definies = VARIABLES.filter((v) => process.env[v]);
  if (definies.length) console.log(`Variables présentes au lancement (ignorées par la sonde) : ${definies.join(', ')}`);
  const pieces = await preparerPieces();
  const echecs = await horsLigne(pieces);
  console.log(`\nContrôles hors ligne : ${echecs ? `${echecs} ÉCHEC(S)` : 'tous conformes'}`);
  if (echecs) process.exit(1);
  if (REEL) await appelsReels(pieces);
  process.exit(0);
})();
