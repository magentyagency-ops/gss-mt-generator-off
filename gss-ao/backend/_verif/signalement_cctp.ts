/**
 * HARNAIS HORS LIGNE — DÉCISION D8 (« A avec signalement ») : phrases de GSS adaptées au cahier des charges du client,
 * AUCUN APPEL OPENAI (réponses simulées du modèle, rendu réel Marp/Chromium ou docx) :
 *  1. génération complète sur un DCE du corpus ; la passe « Cohérence avec le CCTP » reçoit la correction relevée en
 *     génération réelle (ifits 181 : tablette Trackforce → main courante du CCTP ; cstb 221 : rétroplanning de GSS → phase de
 *     prise en charge du CCTP) ; marchés hors Normandie (délais normands) et interdits du CCTP (cstb : rondes à pied, photos) ;
 *  2. contrôles : liste « Phrases adaptées au cahier des charges du client (n) » dans les consultations et le premier message
 *     de l'assistant (rubrique, phrase d'origine, phrase adaptée, exigence du CCTP) ; phrase adaptée présente dans le
 *     mémoire (le CCTP prime) ; aucun signalement dans le document remis ;
 *  3. assistant : valider, modifier, rétablir (document recomposé) ;
 *  4. seconde génération du même dossier : choix de GSS repris dans le document, phrases décidées non signalées.
 *  Corpus sans adaptation (caen, Normandie) : aucune liste, aucun message.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/signalement_cctp.ts <ifits|cstb|caen|imm|etampes1> <sortie>
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import OpenAI from 'openai';
import PizZip from 'pizzip';
import { DB } from '../src/core/db';
import * as tempStorage from '../src/core/temp_storage';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { lireEtat, EtatCompletion } from '../src/generation/completion';
import { discuter } from '../src/generation/assistant_memoire';
import { TITRE_ADAPTATIONS, phraseLisible, type PhraseAdaptee } from '../src/generation/adaptations_cctp';
import * as libre from './reponse_libre_v2_simulation';
import * as cc from './cadre_court_simulation';
import * as cadreMT from '../src/generation/memoire_type_cadre';

const corpus = process.argv[2];
const SORTIE = path.resolve(process.argv[3] || path.join(__dirname, `sorties_signalement_${corpus}`));
const MODE: 'libre' | 'cc' = ['imm', 'etampes1'].includes(corpus) ? 'cc' : 'libre';
if (!['ifits', 'cstb', 'caen', 'imm', 'etampes1'].includes(corpus)) { console.error('Corpus : ifits, cstb, caen, imm ou etampes1'); process.exit(2); }
const id = `d8-${corpus}`;
const ROOT = path.resolve(__dirname, '../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const etatF = path.resolve(__dirname, '../response/etats', `${id}.json`);
fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.rmSync(etatF, { force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', corpus), dceDir, { recursive: true });

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
// Cas construit (cadre et format court, DCE sans interdit) : le CCTP impose les rondes à pied.
const AJOUT_DCE = MODE === 'cc' ? '\n\nARTICLE 9 - RONDES\nLes rondes de surveillance sont effectuées exclusivement à pied.\n' : '';
if (AJOUT_DCE) {
  const P: any = MemoireGenerator.prototype;
  const lire = P.getDceContext;
  P.getDceContext = async function (...a: any[]) { return `${await lire.apply(this, a)}${AJOUT_DCE}`; };
}

// ─── Réponses simulées propres à D8 ────────────────────────────────────────────────────────────

const ANALYSES: Record<string, any> = {
  ifits: { clientName: 'IFITS', projectTitle: "Gardiennage du site de l'IFITS avec un agent conducteur de chien", marketRef: '2026-04', marketType: 'public', clientSector: 'formation sanitaire et sociale', duration: '', lots: [], sites: [{ name: 'IFITS — Institut de formation interhospitalier Théodore Simon', requirements: 'Surveillance des entrées et sorties, rondes intérieures et extérieures, mise en fonction de l\'alarme', address: '1 rue Théodore Simon, 93330 Neuilly-sur-Marne' }], operationalSummary: { agentProfiles: 'Agent de sécurité conducteur de chien', uniforms: '', equipment: 'Main courante fournie par le titulaire', qualityControls: '' }, telesurveillance: '', keyRisks: [], visitDetails: '' },
  cstb: { clientName: 'CSTB', projectTitle: 'Prestations de rondes de surveillance du site du CSTB Grenoble', marketRef: '26R045', marketType: 'public', clientSector: 'établissement public de recherche', duration: '', lots: [], sites: [{ name: 'CSTB Grenoble', requirements: 'Rondes de surveillance à pied, levées de doute', address: "24 rue Joseph Fourier, 38400 Saint Martin d'Hères" }], operationalSummary: { agentProfiles: 'Agent de sécurité rondier', uniforms: '', equipment: '', qualityControls: '' }, telesurveillance: 'Alarmes gérées par une entreprise de télésurveillance (hors marché)', keyRisks: [], visitDetails: '' },
};
const PERIMETRE: Record<string, string> = {
  ifits: "- Postes fixes : non.\n- Vacations de gardiennage avec un agent conducteur de chien, de 5 h à 8 h et de 17 h à 20 h en semaine, sur le site de l'IFITS à Neuilly-sur-Marne : surveillance des entrées et sorties, rondes intérieures et extérieures, mise en fonction de l'alarme.",
  cstb: "- Postes fixes : non.\n- Rondes de surveillance à pied sur le site du CSTB Grenoble, à Saint-Martin-d'Hères, et levées de doute sur alarme.",
};
const EXIGENCE_IFITS = "Dans ce local, l’agent de surveillance présent dispose d’une main courante, fournie par le titulaire, sur laquelle il consigne tous les évènements inhérents à sa vacation (rondes, incidents, mise en fonction de l’alarme, passage du personnel à des horaires inhabituels, évènement inhabituel, etc…).";
const EXIGENCE_CSTB = "Article 2.5.2 - Phase de prise en charge : le titulaire démarre la prise en charge dès la prise d'effet et la notification du marché et la termine au plus tard 2 semaines après la notification.";
const MATRICE: Record<string, (ids: Set<string>) => any[]> = {
  ifits: () => [
    { theme: 'IV', rubrique: 'b4_main_courante', exigence: EXIGENCE_IFITS, reponseGss: 'Main courante', couverture: 'couvert', criticite: 'normal' },
    { theme: 'IV', rubrique: 'b4_rondes', exigence: 'Rondes intérieures et extérieures, contrôle des pièces, portes et fenêtres pendant les vacations', reponseGss: 'Rondes', couverture: 'couvert', criticite: 'normal' },
  ],
  cstb: () => [
    { theme: 'V', rubrique: 'b5_nouveau_marche', exigence: EXIGENCE_CSTB, reponseGss: 'Mise en place', couverture: 'couvert', criticite: 'bloquant' },
    { theme: 'IV', rubrique: 'b4_rondes', exigence: 'Les rondes de surveillance sont effectuées à pied', reponseGss: 'Rondes', couverture: 'couvert', criticite: 'normal' },
  ],
};
const COMPREHENSION: Record<string, any> = {
  ifits: { texte: "L'IFITS nous consulte pour le gardiennage de son site de Neuilly-sur-Marne, assuré par un agent conducteur de chien pendant les vacations du matin et du soir.\n\n## Le périmètre de la prestation demandée\n\n- Surveillance des entrées et sorties du site pendant les vacations.\n- Rondes intérieures et extérieures, contrôle des pièces, portes et fenêtres.\n- Mise en fonction de l'alarme au départ de l'agent.\n\n## Vos attentes et nos engagements\n\n- **Traçabilité** : chaque événement de la vacation consigné dans la main courante → notre réponse : notre main courante, développée au bloc 4.", titre_schema: 'Votre besoin, notre réponse en un process', etapes: [
    { titre: 'Votre besoin', texte: 'Surveillance des entrées et sorties du site', role: 'rouge' },
    { titre: 'Nos rondes', texte: 'Rondes intérieures et extérieures', role: 'orange' },
    { titre: 'Notre traçabilité', texte: 'Chaque événement de la vacation consigné', role: 'bleu' },
    { titre: 'Votre résultat', texte: "Mise en fonction de l'alarme au départ de l'agent", role: 'vert' },
  ] },
  cstb: { texte: "Le CSTB nous consulte pour les rondes de surveillance de son site de Grenoble, à Saint-Martin-d'Hères.\n\n## Le périmètre de la prestation demandée\n\n- Rondes de surveillance effectuées à pied sur tout le site.\n- Levées de doute sur alarme.\n- Phase de prise en charge dès la notification du marché.\n\n## Vos attentes et nos engagements\n\n- **Discrétion** : aucune photo des bâtiments ni des installations → notre réponse : nos consignes, développées au bloc 4.", titre_schema: 'Votre besoin, notre réponse en un process', etapes: [
    { titre: 'Votre besoin', texte: 'Rondes de surveillance effectuées à pied', role: 'rouge' },
    { titre: 'Nos levées de doute', texte: 'Levées de doute sur alarme', role: 'orange' },
    { titre: 'Notre mise en place', texte: 'Phase de prise en charge dès la notification', role: 'bleu' },
    { titre: 'Votre résultat', texte: 'Rondes de surveillance sur tout le site', role: 'vert' },
  ] },
};

/** Correction de la passe « Cohérence avec le CCTP » (relevée en génération réelle), si la phrase de GSS est dans le lot. */
function contradiction(tout: string): any[] {
  const lot = (/=== (\S+) — /.exec(tout) || [])[1] || '';
  if (corpus === 'ifits' || corpus === 'imm' || corpus === 'etampes1') {
    const m = /(d'une \*\*tablette équipée de la main courante électronique Trackforce\*\*, qui permet de remplir la main courante facilement et (?:au client|à [^\n]{1,60}?) de la consulter en temps réel)/.exec(tout);
    if (m) return [{ id: lot, extrait: m[1], remplacement: "d'une **main courante fournie par GSS et mise à disposition dans l’accueil**, qui permet de consigner les événements de vacation", exigence: EXIGENCE_IFITS, meme_obligation: 'outil de consignation des événements de la vacation' }];
  }
  if (corpus === 'cstb') {
    const m = /(selon un rétroplanning qui court de 30 jours avant à 30 jours après le début du marché : il nous faut en général un mois pour nous préparer et préparer nos agents, puis un mois de recul et d'observation pour valider définitivement l'équipe\.)/.exec(tout);
    // Exigence non citée par le contrôle : retrouvée dans la liste des exigences (la plus proche).
    if (m) return [{ id: lot, extrait: m[1], remplacement: "selon un rétroplanning qui court de la notification à deux semaines après la notification : nous organisons la préparation et l'observation nécessaires pour valider définitivement l'équipe dans le délai du marché.", exigence: '', meme_obligation: 'calendrier de mise en place' }];
  }
  return [];
}

/** Plan d'actions de l'assistant pour le prochain appel (scénario). */
let planAssistant: any = null;
const contenu = (m: any) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((x: any) => x?.text || '').join('') : '');
function repondre(body: any): string {
  const msgs: any[] = body.messages || [];
  const sys = contenu(msgs[0]);
  const tout = msgs.map(contenu).join('\n');
  const json = (o: any) => JSON.stringify(o);
  if (/Tu es l'assistant de modification d'un mémoire technique GSS/.test(sys)) return json(planAssistant || { reponse: 'Je n\'ai rien modifié.', actions: [] });
  if (/qui CONTREDIT une exigence/.test(sys)) return json({ corrections: contradiction(tout) });
  if (MODE === 'cc') return cc.repondre(corpus as cc.CorpusCC, body);
  if (corpus !== 'caen') {
    if (/Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS/.test(sys)) return json(ANALYSES[corpus]);
    if (/PÉRIMÈTRE RÉEL des prestations/.test(sys)) return json({ perimetre: PERIMETRE[corpus] });
    if (/^Tu lis le DCE d'un marché de sécurité privée pour GSS\. Tu ne calcules aucun total/.test(sys)) return json({ postes: [], cas_pratique: null });
    if (/CHECK-LIST des GRANDES EXIGENCES/.test(sys)) return json({ requirements: MATRICE[corpus](new Set()) });
    if (/indique la valeur que le DCE IMPOSE explicitement/.test(sys)) return json({ valeurs: [] });
    if (/^Tu adaptes UNE rubrique du mémoire technique de GSS/.test(sys)) return json({ remplacements: [], retraits: [], ajouts: [] });
    if (/formuler ses remarques sur le cahier des charges/.test(sys)) return json({ remarques: [] });
    if (/le bloc « Notre compréhension de votre besoin »/.test(sys)) return /Le schéma de process est refusé/.test(contenu(msgs[msgs.length - 1])) ? json({ etapes: COMPREHENSION[corpus].etapes }) : json(COMPREHENSION[corpus]);
  }
  return libre.repondre('caen', body);
}
const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
CP.create = async (body: any) => ({ choices: [{ message: { content: repondre(body) } }], usage: {}, model: body.model });
EP.create = async (body: any) => {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: (MODE === 'cc' ? cc.embedding : libre.embedding)(String(t)) })) };
};
if (MODE === 'cc') {
  // Embeddings en sac de mots : seuil sémantique abaissé, comme le harnais du cadre (cadre_court_hors_ligne.ts).
  const cm: any = cadreMT;
  const candidatsOrigine = cm.candidatsReference;
  cm.candidatsReference = (mt: any, textes: any, q: string, o: any = {}) => candidatsOrigine(mt, textes, q, { ...o, seuil: 0.2, ecart: 0.06 });
}

// ─── Contrôles ─────────────────────────────────────────────────────────────────────────────────

const texteDocx = (f: string) => new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText().split(/<w:p[ >]/).slice(1)
  .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>|<w:br\/>/g) || []).map((m) => (m === '<w:br/>' ? '\n' : m.replace(/<[^>]+>/g, ''))).join('')).join('\n')
  .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textePdf = (f: string) => spawnSync('pdftotext', [f, '-'], { encoding: 'utf-8', maxBuffer: 256 << 20 }).stdout || '';
const texteDoc = (f: string) => (/\.docx$/.test(f) ? texteDocx(f) : textePdf(f));
/** Texte comparable (PDF : mots coupés en fin de ligne, espaces) : minuscules, sans accents ni ponctuation. */
const plat = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/-\n/g, '').replace(/[^a-zA-Z0-9']+/g, ' ').toLowerCase().trim();
const contient = (doc: string, phrase: string) => plat(doc).includes(plat(phraseLisible(phrase)).slice(0, 160));
/** Phrase entière présente (phrase d'origine encore là) ; la phrase adaptée peut n'être qu'un début de la phrase d'origine. */
const entiere = (doc: string, phrase: string) => plat(doc).includes(plat(phraseLisible(phrase, 2000)));
/** La phrase adaptée a disparu du document (indécidable quand elle est contenue dans la phrase d'origine). */
const adapteeRetiree = (doc: string, a: PhraseAdaptee) => !a.adaptee || plat(phraseLisible(a.origine, 2000)).includes(plat(phraseLisible(a.adaptee, 2000))) || !contient(doc, a.adaptee);
const SIGNAL = /Phrases? adaptées? au cahier|Phrase d'origine de GSS|Exigence du CCTP|phrase adaptée|À valider, modifier ou rétablir/i;

const anomalies: string[] = [];
const anomalie = (x: string) => { anomalies.push(x); console.log(`  ✗ ${x}`); };

function controlerGeneration(nom: string, r: any, etat: EtatCompletion, attendues: { min: number; decidees?: PhraseAdaptee[] }): any {
  const liste = etat.adaptations || [];
  const aValider = liste.filter((a) => a.statut === 'a_valider');
  const lignes = (r.consultations || []).filter((c: string) => c.startsWith(TITRE_ADAPTATIONS));
  const premier = etat.conversation?.[0]?.texte || '';
  const doc = texteDoc(r.filePath);
  const bilan: any = {
    adaptations: liste.map((a) => ({ n: a.n, rubrique: a.rubrique, titre: a.titre, statut: a.statut, etape: a.etape, origine: phraseLisible(a.origine, 200), adaptee: a.adaptee ? phraseLisible(a.adaptee, 200) : '(retirée)', exigence: phraseLisible(a.exigence, 200) })),
    consultations_d8: lignes,
    premier_message: premier,
  };
  if (aValider.length < attendues.min) anomalie(`${nom} : ${aValider.length} phrase(s) adaptée(s) à valider, ${attendues.min} au moins attendue(s)`);
  if (lignes.length !== aValider.length) anomalie(`${nom} : ${lignes.length} ligne(s) dans les consultations pour ${aValider.length} phrase(s) à valider`);
  if (aValider.length) {
    if (!premier.includes(`${TITRE_ADAPTATIONS} (${aValider.length})`)) anomalie(`${nom} : liste absente du premier message de l'assistant`);
    if (!lignes.every((l: string) => l.startsWith(`${TITRE_ADAPTATIONS} (${aValider.length}) — n° `))) anomalie(`${nom} : titre des lignes des consultations inattendu`);
    for (const a of aValider) {
      if (!a.titre || !a.origine || !a.exigence) anomalie(`${nom} : phrase n° ${a.n} incomplète (rubrique, origine ou exigence manquante)`);
      if (!premier.includes(`${a.n}. « ${a.titre} »`)) anomalie(`${nom} : phrase n° ${a.n} absente du premier message`);
      // Le CCTP prime : la phrase adaptée est dans le document remis, la phrase d'origine n'y est plus.
      if (a.adaptee && !contient(doc, a.adaptee)) anomalie(`${nom} : phrase adaptée n° ${a.n} absente du document : ${phraseLisible(a.adaptee, 120)}`);
      if (entiere(doc, a.origine)) anomalie(`${nom} : phrase d'origine n° ${a.n} encore dans le document : ${phraseLisible(a.origine, 120)}`);
    }
  } else {
    if (SIGNAL.test(premier)) anomalie(`${nom} : signalement dans le premier message sans phrase adaptée`);
    if (lignes.length) anomalie(`${nom} : lignes dans les consultations sans phrase adaptée`);
  }
  if (SIGNAL.test(doc)) anomalie(`${nom} : signalement imprimé dans le document remis à l'acheteur`);
  for (const d of attendues.decidees || []) {
    const x = liste.find((a) => a.rubrique === d.rubrique && plat(a.origine) === plat(d.origine));
    if (!x) { anomalie(`${nom} : choix de GSS n° ${d.n} (${d.statut}) perdu`); continue; }
    if (x.statut !== d.statut) anomalie(`${nom} : choix n° ${d.n} repris avec le statut ${x.statut} au lieu de ${d.statut}`);
    if (lignes.some((l: string) => contient(l, d.origine))) anomalie(`${nom} : phrase n° ${d.n} décidée (${d.statut}) encore signalée`);
    const attendu = d.statut === 'retablie' ? d.origine : d.statut === 'modifiee' ? d.texteGss! : d.adaptee;
    if (attendu && !contient(doc, attendu)) anomalie(`${nom} : texte choisi par GSS (n° ${d.n}, ${d.statut}) absent du document : ${phraseLisible(attendu, 120)}`);
  }
  return bilan;
}

(async () => {
  const t0 = Date.now();
  const out: any = { corpus };
  // ── 1. Première génération ──
  const r1: any = await new MemoireGenerator().generate(id);
  const etat1 = lireEtat(id)!;
  fs.copyFileSync(r1.filePath, path.join(SORTIE, `generation1${path.extname(r1.filePath)}`));
  const avecAdaptation = corpus !== 'caen';
  out.generation1 = controlerGeneration('génération 1', r1, etat1, { min: avecAdaptation ? 2 : 0 });
  if (!avecAdaptation) {
    if ((etat1.adaptations || []).length) anomalie(`caen (Normandie, aucune contradiction simulée) : ${etat1.adaptations!.length} phrase(s) adaptée(s)`);
  } else {
    // ── 2. Assistant : valider la n° 1, modifier la n° 2, rétablir la n° 3 (ou la n° 2 s'il n'y en a que deux) ──
    const liste = etat1.adaptations!.filter((a) => a.statut === 'a_valider');
    const [a1, a2, a3] = liste;
    const fichier0 = etat1.fichier;
    planAssistant = { reponse: 'C\'est noté.', actions: [{ type: 'adaptation', n: a1.n, choix: 'valider' }] };
    let r = await discuter(id, `Je valide la phrase adaptée n° ${a1.n}`);
    const e1 = lireEtat(id)!;
    out.valider = { reponse: r.reponse, modifies: r.modifies, statut: e1.adaptations!.find((a) => a.n === a1.n)?.statut, document_inchange: e1.fichier === fichier0 };
    if (out.valider.statut !== 'validee') anomalie('validation non enregistrée');
    if (!out.valider.document_inchange) anomalie('document recomposé pour une simple validation');
    const cibleModif = a3 ? a2 : null;
    const cibleRetab = a3 || a2;
    if (cibleModif) {
      const texteGss = 'GSS met en place le dispositif demandé par le cahier des charges et en rend compte à chaque réunion de suivi.';
      planAssistant = { reponse: 'Phrase remplacée.', actions: [{ type: 'adaptation', n: cibleModif.n, choix: 'modifier', texte: texteGss }] };
      r = await discuter(id, `Pour la phrase adaptée n° ${cibleModif.n}, écris : ${texteGss}`);
      const e2 = lireEtat(id)!;
      const doc2 = texteDoc(e2.fichier);
      out.modifier = { reponse: r.reponse, modifies: r.modifies, statut: e2.adaptations!.find((a) => a.n === cibleModif.n)?.statut, texte_dans_document: contient(doc2, texteGss), adaptee_retiree: adapteeRetiree(doc2, cibleModif) };
      if (out.modifier.statut !== 'modifiee' || !out.modifier.texte_dans_document || !out.modifier.adaptee_retiree) anomalie(`modification de la phrase n° ${cibleModif.n} non appliquée au document`);
    }
    planAssistant = { reponse: 'Phrase d\'origine rétablie.', actions: [{ type: 'adaptation', n: cibleRetab.n, choix: 'retablir' }] };
    r = await discuter(id, `Rétablis ma phrase d'origine n° ${cibleRetab.n}`);
    const e3 = lireEtat(id)!;
    const doc3 = texteDoc(e3.fichier);
    out.retablir = { reponse: r.reponse, modifies: r.modifies, statut: e3.adaptations!.find((a) => a.n === cibleRetab.n)?.statut, origine_dans_document: contient(doc3, cibleRetab.origine), adaptee_retiree: adapteeRetiree(doc3, cibleRetab) };
    if (out.retablir.statut !== 'retablie' || !out.retablir.origine_dans_document || !out.retablir.adaptee_retiree) anomalie(`rétablissement de la phrase n° ${cibleRetab.n} non appliqué au document`);
    if (SIGNAL.test(doc3)) anomalie('signalement imprimé dans le document après l\'assistant');
    fs.copyFileSync(e3.fichier, path.join(SORTIE, `apres_assistant${path.extname(e3.fichier)}`));
    // ── 3. Seconde génération : choix repris ──
    const decidees = e3.adaptations!.filter((a) => a.statut !== 'a_valider');
    planAssistant = null;
    const r2: any = await new MemoireGenerator().generate(id);
    const etat2 = lireEtat(id)!;
    fs.copyFileSync(r2.filePath, path.join(SORTIE, `generation2${path.extname(r2.filePath)}`));
    out.generation2 = controlerGeneration('génération 2', r2, etat2, { min: Math.max(0, liste.length - decidees.length), decidees });
    if (etat2.adaptations!.filter((a) => a.statut === 'a_valider').length !== liste.length - decidees.length) anomalie(`génération 2 : ${etat2.adaptations!.filter((a) => a.statut === 'a_valider').length} phrase(s) à valider pour ${liste.length - decidees.length} attendue(s)`);
  }
  out.duree_s = Math.round((Date.now() - t0) / 1000);
  out.anomalies = anomalies;
  fs.writeFileSync(path.join(SORTIE, 'bilan.json'), JSON.stringify(out, null, 1));
  fs.rmSync(dceDir, { recursive: true, force: true });
  fs.rmSync(etatF, { force: true });
  console.log(`\n═══ D8 ${corpus} : ${anomalies.length} anomalie(s)${anomalies.length ? ` :\n- ${anomalies.join('\n- ')}` : ''} ; ${out.duree_s} s`);
  process.exit(anomalies.length ? 1 : 0);
})().catch((e) => { console.error(e); fs.rmSync(dceDir, { recursive: true, force: true }); process.exit(1); });
