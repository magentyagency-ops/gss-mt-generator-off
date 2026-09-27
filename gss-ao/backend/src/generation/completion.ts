// ════════════════════════════════════════════════════════════════════════════════════════
// COMPLÉTION DU MÉMOIRE GÉNÉRÉ — « [À COMPLÉTER] » remplis après la génération
// ════════════════════════════════════════════════════════════════════════════════════════
// Deux voies, un seul mécanisme :
//  1. SAISIE DIRECTE : dans l'aperçu, un clic sur « [À COMPLÉTER] » permet de saisir l'information ;
//     elle est insérée immédiatement dans le document (nouvelle version du fichier).
//  2. RÉPONSE PAR E-MAIL : quand un membre de l'équipe répond à une sollicitation (« Demander à
//     l'équipe »), la réponse est rattachée au dossier par l'Edge Function inbound-email ; la
//     surveillance ci-dessous la détecte et l'insère aux emplacements qu'elle renseigne.
//
// Chaque emplacement à compléter est repéré dans le document :
//  • cadre imposé (.docx) : un signet Word invisible « GSS_AC_n » entoure chaque « [À COMPLÉTER] » ;
//  • réponse libre (.pdf) : un repère ⟦AC:n⟧ est conservé dans le texte des rubriques (état), le PDF
//    est recomposé avec les schémas déjà construits (seules les pages nouvelles en reçoivent un).
// L'état de complétion d'un dossier est un fichier local (response/etats/<dossier>.json) : aucune
// écriture en base, hormis la capitalisation d'une saisie directe dans la base de connaissance.

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import OpenAI from 'openai';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSettings } from '../core/config';
import { personnesDuRole } from './base_memoires';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RESPONSE_DIR = path.resolve(__dirname, '../../response');
const ETATS_DIR = path.join(RESPONSE_DIR, 'etats');
const MODELE = process.env.MEMOIRE_MODEL || 'gpt-5.6-luna';
const EMBED_MODEL = process.env.RAG_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_MEMOIRE || 'text-embedding-3-small';
/** Marqueur interne posé par le générateur juste après chaque « [À COMPLÉTER] » : <champ>. */
export const MARQUE_CHAMP = (id: number) => `${id}`;
const MARQUE_RE = /\[À COMPLÉTER\](\d+)/;
export const PLACEHOLDER = '[À COMPLÉTER]';
/** Repère d'un manque dans le texte d'une rubrique (réponse libre). */
export const REPERE = (n: number) => `⟦AC:${n}⟧`;
export const REPERE_RE = /⟦AC:(\d+)⟧/g;

export interface ElementACompleter {
  cle: string;                 // GSS_AC_n (cadre) ou Qn (réponse libre)
  question: string;            // information attendue
  contexte: string;            // extrait du document autour de l'emplacement
  statut: 'ouvert' | 'complete';
  valeur?: string;
  source?: 'saisie' | 'equipe' | 'memoires';
  completeLe?: string;
  reperes?: number[];          // réponse libre : repères ⟦AC:n⟧ concernés
  pourAcheteur?: boolean;      // information à obtenir auprès de l'acheteur (jamais envoyée à GSS)
  groupe?: string;             // emplacements qui attendent la MÊME donnée : une seule question, une seule réponse
}

export interface EtatCompletion {
  dossierId: string;
  mode: 'cadre' | 'libre';
  fichier: string;
  majLe: string;
  elements: ElementACompleter[];
  reponsesTraitees: string[];  // question_interne.id:empreinte des réponses déjà intégrées
  libre?: { sections: Record<string, string>; schemas: Record<string, string>; cover: any };
}

// ─── État ────────────────────────────────────────────────────────────────────────────────

const cheminEtat = (dossierId: string) => path.join(ETATS_DIR, `${dossierId.replace(/[^\w.-]/g, '_')}.json`);

export function lireEtat(dossierId: string): EtatCompletion | null {
  try { return JSON.parse(fs.readFileSync(cheminEtat(dossierId), 'utf-8')); } catch { return null; }
}

export function ecrireEtat(etat: EtatCompletion): void {
  fs.mkdirSync(ETATS_DIR, { recursive: true });
  etat.majLe = new Date().toISOString();
  fs.writeFileSync(cheminEtat(etat.dossierId), JSON.stringify(etat, null, 1));
}

/** Vue publique de l'état (sans le texte des rubriques ni les schémas). */
export function vueEtat(etat: EtatCompletion) {
  const { libre, reponsesTraitees, ...reste } = etat;
  return { ...reste, restants: etat.elements.filter((e) => e.statut === 'ouvert').length };
}

// ─── Cadre imposé : signets autour des « [À COMPLÉTER] » ─────────────────────────────────

function elements(node: any, name: string): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === name) out.push(n);
    if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  walk(node);
  return out;
}

function texte(node: any): string {
  return elements(node, 't').map((t) => t.textContent || '').join('');
}

function nouveauRun(xmlDoc: any, rPr: any): any {
  const r = xmlDoc.createElementNS(W_NS, 'w:r');
  if (rPr) r.appendChild(rPr.cloneNode(true));
  return r;
}

function nouveauT(xmlDoc: any, s: string): any {
  const t = xmlDoc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = s;
  return t;
}

/**
 * Isole chaque « [À COMPLÉTER] » marqué par le générateur dans son propre run, entouré d'un signet
 * GSS_AC_n. Retourne, dans l'ordre du document, le champ d'origine et le contexte de chaque emplacement.
 */
export function poserSignets(xmlDoc: any): Array<{ cle: string; champ: number; contexte: string; environnement: string }> {
  const out: Array<{ cle: string; champ: number; contexte: string; environnement: string }> = [];
  let n = 0;
  let idSignet = 90000;
  for (;;) {
    const tEl = elements(xmlDoc, 't').find((t) => MARQUE_RE.test(t.textContent || ''));
    if (!tEl) break;
    const run = tEl.parentNode;
    const s = tEl.textContent || '';
    const m = MARQUE_RE.exec(s)!;
    const avant = s.slice(0, m.index);
    const apres = s.slice(m.index + m[0].length);
    const champ = Number(m[1]);
    if (!run || run.localName !== 'r' || !run.parentNode) { tEl.textContent = avant + PLACEHOLDER + apres; continue; }
    const para = run.parentNode;
    // Contexte PROPRE à cet emplacement : texte du paragraphe juste avant et juste après lui.
    let avantTxt = '';
    let apresTxt = '';
    let vu = false;
    const parcourir = (nd: any) => {
      if (nd === tEl) { avantTxt += avant; apresTxt += apres; vu = true; return; }
      if (nd.nodeType === 1 && nd.localName === 't') { if (vu) apresTxt += nd.textContent || ''; else avantTxt += nd.textContent || ''; return; }
      if (nd.nodeType === 1 && (nd.localName === 'br' || nd.localName === 'tab')) { const c = nd.localName === 'br' ? '\n' : ' '; if (vu) apresTxt += c; else avantTxt += c; return; }
      if (nd.childNodes) for (let i = 0; i < nd.childNodes.length; i++) parcourir(nd.childNodes[i]);
    };
    parcourir(para);
    // Les AUTRES emplacements de la phrase sont notés « […] » : seul celui-ci reste « [À COMPLÉTER] ».
    const net = (x: string) => x.replace(/\uE000\d+\uE001/g, '').split(PLACEHOLDER).join('[…]').replace(/[ \t]+/g, ' ');
    const av = net(avantTxt);
    const ap = net(apresTxt);
    // Phrase EXACTE qui contient l'emplacement (du début de phrase au point final), sans coupure de mot.
    const mAvant = av.match(/(?:^|[.!?]\s|\n)([^.!?\n]*)$/);
    const phraseAvant = mAvant ? mAvant[1] : av;
    const finM = /[.!?](?=\s|$)|\n/.exec(ap);
    const phraseApres = finM ? ap.slice(0, finM.index + (ap[finM.index] === '\n' ? 0 : 1)) : ap;
    const contexte = `${phraseAvant}${PLACEHOLDER}${phraseApres}`.replace(/\s+/g, ' ').trim();
    const environnement = `${av.slice(-700)}${PLACEHOLDER}${ap.slice(0, 300)}`.replace(/\s+/g, ' ').trim();
    const rPr = run.childNodes ? Array.from({ length: run.childNodes.length }, (_, i) => run.childNodes[i]).find((c: any) => c.nodeType === 1 && c.localName === 'rPr') : null;

    // Run « après » : texte restant + tous les éléments qui suivaient le <w:t> dans le run.
    const runApres = nouveauRun(xmlDoc, rPr);
    if (apres) runApres.appendChild(nouveauT(xmlDoc, apres));
    while (tEl.nextSibling) runApres.appendChild(tEl.nextSibling);
    tEl.textContent = avant;

    n++;
    idSignet++;
    const cle = `GSS_AC_${n}`;
    const debut = xmlDoc.createElementNS(W_NS, 'w:bookmarkStart');
    debut.setAttribute('w:id', String(idSignet));
    debut.setAttribute('w:name', cle);
    const fin = xmlDoc.createElementNS(W_NS, 'w:bookmarkEnd');
    fin.setAttribute('w:id', String(idSignet));
    const runMilieu = nouveauRun(xmlDoc, rPr);
    runMilieu.appendChild(nouveauT(xmlDoc, PLACEHOLDER));

    const suivant = run.nextSibling;
    const inserer = (el: any) => (suivant ? para.insertBefore(el, suivant) : para.appendChild(el));
    inserer(debut); inserer(runMilieu); inserer(fin);
    if (runApres.childNodes.length > (rPr ? 1 : 0)) inserer(runApres);

    out.push({ cle, champ, contexte, environnement });
  }
  return out;
}

/**
 * Formule, pour CHAQUE emplacement, la question exacte à poser à l'équipe : elle ne porte que sur la
 * donnée manquante à cet endroit précis (lue dans sa phrase), pas sur le sous-critère entier.
 */
export async function formulerQuestions(
  items: Array<{ cle: string; contexte: string; environnement: string; critere: string }>,
): Promise<Map<string, { question: string; groupe: string }>> {
  const out = new Map<string, { question: string; groupe: string }>();
  if (!items.length) return out;
  const systeme = `Dans un mémoire technique GSS (sécurité privée), des données manquent aux emplacements « [À COMPLÉTER] » (les autres emplacements de la même phrase sont notés « […] »). Pour CHAQUE emplacement listé, formule la question exacte à poser à un collègue de GSS pour obtenir LA donnée qui manque À CET ENDROIT PRÉCIS.
- La question ne porte que sur cet emplacement, pas sur les « […] » ni sur le reste du paragraphe.
- Elle est autonome et concrète : elle nomme le site ou le sujet, et indique la forme attendue (nombre d'agents, durée en minutes, nom de société, horaires…).
- Une seule phrase interrogative, sans formule de politesse.
- "groupe" : un libellé court de la DONNÉE attendue (ex. « nombre d'équipes affectées au site », « recours à la sous-traitance et à l'intérim »). Des emplacements qui attendent exactement la même donnée reçoivent le MÊME groupe (et la même question) : GSS n'y répondra qu'une fois.
Renvoie {"questions": [{"cle": "...", "question": "...", "groupe": "..."}]} avec TOUS les emplacements listés.`;
  const demander = async (lot: typeof items) => {
    const r = await json(systeme, lot.map((i) => `### ${i.cle}\nSous-critère : ${i.critere || '—'}\nPhrase : ${i.contexte}\nTexte autour : ${i.environnement}`).join('\n\n'));
    for (const q of Array.isArray(r.questions) ? r.questions : []) {
      if (q?.cle && String(q.question || '').trim()) {
        out.set(String(q.cle), { question: String(q.question).trim(), groupe: String(q.groupe || q.question).trim() });
      }
    }
  };
  await demander(items);
  const manquants = items.filter((i) => !out.has(i.cle));
  if (manquants.length) await demander(manquants);
  // Regroupement : même libellé de donnée → même question (celle du premier emplacement).
  const parGroupe = new Map<string, string>();
  for (const i of items) {
    const v = out.get(i.cle);
    if (!v) continue;
    const g = v.groupe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    v.groupe = g;
    if (parGroupe.has(g)) v.question = parGroupe.get(g)!; else parGroupe.set(g, v.question);
  }
  return out;
}

/**
 * Adapte une même information à plusieurs phrases (emplacements d'un même groupe) : pour chacune, le
 * fragment exact qui remplace « [À COMPLÉTER] » en gardant la phrase correcte.
 */
async function fragmentsPourPhrases(info: string, cibles: ElementACompleter[]): Promise<Array<{ cle: string; valeur: string }>> {
  if (!cibles.length) return [];
  const r = await json(
    `Une information a été fournie pour compléter un mémoire technique. Pour chaque phrase, donne le fragment exact qui remplace « [À COMPLÉTER] » afin que la phrase reste grammaticalement correcte et naturelle. N'utilise QUE l'information fournie, sans rien ajouter. Renvoie {"remplissages": [{"cle": "...", "valeur": "..."}]}.`,
    `Information fournie : ${info}\n\n${cibles.map((c) => `- ${c.cle} | phrase : ${c.contexte}`).join('\n')}`,
  );
  const ok = new Set(cibles.map((c) => c.cle));
  return (Array.isArray(r.remplissages) ? r.remplissages : [])
    .filter((x: any) => x && ok.has(x.cle) && String(x.valeur || '').trim())
    .map((x: any) => ({ cle: String(x.cle), valeur: String(x.valeur).trim() }));
}

/**
 * Saisie directe : la valeur tapée va telle quelle à l'emplacement cliqué ; les autres emplacements
 * du même groupe (même donnée ailleurs dans le document) sont remplis avec l'information adaptée à leur phrase.
 */
export async function remplirSaisie(dossierId: string, cle: string, valeur: string): Promise<EtatCompletion> {
  const etat = lireEtat(dossierId);
  if (!etat) throw new Error('Aucun document généré à compléter pour ce dossier.');
  const el = etat.elements.find((e) => e.cle === cle);
  const autres = el?.groupe ? etat.elements.filter((e) => e.cle !== cle && e.statut === 'ouvert' && e.groupe === el.groupe) : [];
  const complements = etat.mode === 'cadre' ? await fragmentsPourPhrases(valeur, autres) : [];
  return remplir(dossierId, [{ cle, valeur }, ...complements], 'saisie');
}

/** Remplace le contenu du signet `cle` par `valeur` et enregistre une NOUVELLE version du .docx. */
function remplirSignet(fichier: string, cle: string, valeur: string): string {
  const zip = new PizZip(fs.readFileSync(fichier));
  const xmlDoc = new DOMParser().parseFromString(zip.file('word/document.xml')!.asText(), 'text/xml');
  const debut = elements(xmlDoc, 'bookmarkStart').find((b) => b.getAttribute('w:name') === cle);
  if (!debut) throw new Error(`Emplacement ${cle} introuvable dans le document.`);
  const id = debut.getAttribute('w:id');
  const runs: any[] = [];
  for (let n = debut.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.localName === 'bookmarkEnd' && n.getAttribute('w:id') === id) break;
    if (n.nodeType === 1 && n.localName === 'r') runs.push(n);
  }
  if (!runs.length) throw new Error(`Emplacement ${cle} vide.`);
  const [premier, ...autres] = runs;
  autres.forEach((r) => r.parentNode.removeChild(r));
  for (let i = premier.childNodes.length - 1; i >= 0; i--) {
    const c = premier.childNodes[i];
    if (!(c.nodeType === 1 && c.localName === 'rPr')) premier.removeChild(c);
  }
  valeur.split(/\r?\n/).forEach((ligne, i) => {
    if (i > 0) premier.appendChild(xmlDoc.createElementNS(W_NS, 'w:br'));
    premier.appendChild(nouveauT(xmlDoc, ligne));
  });
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
  const sortie = path.join(path.dirname(fichier), `Mémoire technique GSS_${Date.now()}.docx`);
  fs.writeFileSync(sortie, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return sortie;
}

// ─── Réponse libre : insertion au repère puis recomposition du PDF ────────────────────────

let openaiClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!openaiClient) {
    const key = getSettings().openaiApiKey;
    if (!key) throw new Error('Clé OpenAI manquante.');
    openaiClient = new OpenAI({ apiKey: key, timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 300_000 });
  }
  return openaiClient;
}

async function json(system: string, user: string): Promise<any> {
  const r = await openai().chat.completions.create({
    model: MODELE,
    messages: [{ role: 'system', content: `${system}\nRéponds uniquement par un objet JSON.` }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  });
  // Le modèle écrit parfois l'espace insécable sous une forme invalide (« \\u0000a0 ») : on la rétablit.
  const brut = (r.choices?.[0]?.message?.content || '{}').replace(/\\u0000a0/gi, '\\u00a0').replace(/\\u0000/g, '');
  try { return JSON.parse(brut); } catch { return {}; }
}

/**
 * Rédige la phrase à insérer au repère d'une rubrique, à partir de l'information fournie UNIQUEMENT.
 * Renvoie le nouveau texte de la rubrique.
 */
export async function integrerDansRubrique(texteRubrique: string, repere: string, question: string, info: string): Promise<string> {
  const pos = texteRubrique.indexOf(repere);
  const extrait = pos >= 0 ? texteRubrique.slice(Math.max(0, pos - 700), pos + 300) : texteRubrique.slice(-900);
  const r = await json(
    `Tu complètes un mémoire technique GSS (sécurité privée). Une information manquait à l'endroit marqué ${repere}. Rédige 1 à 2 phrases à insérer à cet endroit, dans le ton du texte, qui intègrent l'information fournie. N'ajoute AUCUN fait absent de l'information fournie. Pas de titre, pas de Markdown de titre. Renvoie {"phrase": "..."}.`,
    `Information attendue : ${question}\nInformation fournie : ${info}\n\nTexte autour de l'emplacement :\n${extrait}`,
  );
  const phrase = String(r.phrase || info).trim();
  return pos >= 0 ? texteRubrique.replace(repere, phrase) : `${texteRubrique.trim()}\n\n${phrase}`;
}

/** Recompose le PDF d'une réponse libre depuis l'état (schémas déjà construits réutilisés). */
async function recomposerPdf(etat: EtatCompletion): Promise<string> {
  // Import différé : evite une dépendance circulaire avec le générateur.
  const { MemoireGenerator } = await import('./memoire_generator');
  const gen = new MemoireGenerator();
  const propres: Record<string, string> = {};
  for (const [id, t] of Object.entries(etat.libre!.sections)) propres[id] = t.replace(REPERE_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const res = await gen.rendreDepuisSections(propres, etat.dossierId, {
    cover: etat.libre!.cover,
    schemas: new Map(Object.entries(etat.libre!.schemas || {})),
  });
  etat.libre!.schemas = Object.fromEntries(res.schemas);
  return res.filePath;
}

// ─── Remplissage d'un emplacement ─────────────────────────────────────────────────────────

/** Remplit un ou plusieurs emplacements puis enregistre la nouvelle version du document. */
export async function remplir(
  dossierId: string,
  remplissages: Array<{ cle: string; valeur: string }>,
  source: ElementACompleter['source'],
): Promise<EtatCompletion> {
  const etat = lireEtat(dossierId);
  if (!etat) throw new Error('Aucun document généré à compléter pour ce dossier.');
  let fichier = etat.fichier;
  let modifie = false;
  for (const { cle, valeur } of remplissages) {
    const el = etat.elements.find((e) => e.cle === cle);
    const v = String(valeur || '').trim();
    if (!el || !v) continue;
    if (etat.mode === 'cadre') {
      fichier = remplirSignet(fichier, cle, v);
    } else {
      const reperes = el.reperes?.length ? el.reperes : [];
      const sections = etat.libre!.sections;
      const cible = reperes.map((n) => ({ n, id: Object.keys(sections).find((id) => sections[id].includes(REPERE(n))) }))
        .find((x) => x.id);
      if (cible?.id) {
        sections[cible.id] = await integrerDansRubrique(sections[cible.id], REPERE(cible.n), el.question, v);
      }
      // Les autres repères du même manque n'ont plus lieu d'être.
      for (const n of reperes) for (const id of Object.keys(sections)) sections[id] = sections[id].split(REPERE(n)).join('');
      if (!cible?.id) {
        // Manque sans emplacement dans le texte (exigence du CCTP) : rubrique la plus proche du sujet.
        const ids = Object.keys(sections);
        const choix = await json(
          'Choisis la rubrique du mémoire où intégrer une information. Renvoie {"id": "<id>"} parmi la liste.',
          `Information : ${el.question} — ${v}\nRubriques :\n${ids.map((id) => `${id} : ${sections[id].split('\n')[0].slice(0, 120)}`).join('\n')}`,
        );
        const id = ids.includes(choix.id) ? choix.id : ids[0];
        sections[id] = await integrerDansRubrique(sections[id], '⟦fin⟧', el.question, v);
      }
    }
    el.statut = 'complete';
    el.valeur = v;
    el.source = source;
    el.completeLe = new Date().toISOString();
    modifie = true;
  }
  if (modifie && etat.mode === 'libre') fichier = await recomposerPdf(etat);
  etat.fichier = fichier;
  ecrireEtat(etat);
  return etat;
}

// ─── Réponse de l'équipe (e-mail) → emplacements qu'elle renseigne ───────────────────────

/** Détermine, parmi les emplacements encore ouverts, ceux que renseigne une réponse, et la valeur à y mettre. */
async function correspondances(etat: EtatCompletion, question: string, reponse: string, cles?: string[]): Promise<Array<{ cle: string; valeur: string }>> {
  // Si l'e-mail portait sur des emplacements précis (envoi « Demander à l'équipe »), la réponse ne peut
  // renseigner qu'eux ; sinon (ancienne sollicitation), tous les emplacements ouverts sont candidats.
  const demandes = new Set((cles || []).filter((c) => etat.elements.some((e) => e.cle === c)));
  const ouverts = etat.elements.filter((e) => e.statut === 'ouvert' && !e.pourAcheteur && (!demandes.size || demandes.has(e.cle)));
  if (!ouverts.length) return [];
  const r = await json(
    `Un membre de l'équipe GSS a répondu par e-mail à une question. Indique quels emplacements « à compléter » du mémoire cette réponse renseigne, et le texte exact à y insérer.
- N'utilise QUE l'information présente dans la réponse ; n'invente rien.
- Cadre imposé : la valeur remplace « [À COMPLÉTER] » dans la phrase donnée en contexte → donne uniquement le fragment qui s'insère pour que la phrase soit correcte et naturelle (ex. « 3 », « 45 minutes », « la société X »), sans répéter les mots déjà présents autour.
- Ignore un emplacement que la réponse ne renseigne pas clairement.
Renvoie {"remplissages": [{"cle": "...", "valeur": "..."}]} (liste vide si aucun).`,
    `Question posée : ${question}\nRéponse reçue : ${reponse}\n\nEmplacements ouverts (des emplacements du même groupe attendent la même donnée : remplis-les tous, chacun adapté à sa phrase) :\n${ouverts.map((e) => `- ${e.cle} | groupe : ${e.groupe || e.cle} | information attendue : ${e.question} | phrase : ${e.contexte}`).join('\n')}`,
  );
  const permises = new Set(ouverts.map((e) => e.cle));
  return (Array.isArray(r.remplissages) ? r.remplissages : [])
    .filter((x: any) => x && permises.has(x.cle) && String(x.valeur || '').trim())
    .map((x: any) => ({ cle: x.cle, valeur: String(x.valeur).trim() }));
}

/**
 * Intègre une réponse d'équipe fournie directement (démonstration : simule la réception d'un e-mail,
 * sans envoi ni lecture en base). Même traitement que pour un e-mail réel.
 */
export async function integrerReponse(dossierId: string, question: string, reponse: string, cles?: string[]): Promise<{ etat: EtatCompletion; cles: string[] }> {
  const etat = lireEtat(dossierId);
  if (!etat) throw new Error('Aucun document généré à compléter pour ce dossier.');
  const rems = await correspondances(etat, question, reponse, cles);
  if (!rems.length) return { etat, cles: [] };
  return { etat: await remplir(dossierId, rems, 'equipe'), cles: rems.map((r) => r.cle) };
}

function admin(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Intègre dans le document d'un dossier les réponses d'équipe reçues depuis le dernier passage. */
export async function integrerReponsesEquipe(dossierId: string): Promise<number> {
  const etat = lireEtat(dossierId);
  if (!etat || !etat.elements.some((e) => e.statut === 'ouvert')) return 0;
  const db = admin();
  if (!db) return 0;
  const { data, error } = await db
    .from('question_interne')
    .select('id, critere_concerne, question, exigence_id, reponse_contenu')
    .eq('ao_id', dossierId)
    .not('reponse_contenu', 'is', null);
  if (error || !data) return 0;
  let n = 0;
  for (const q of data as any[]) {
    const rep = String(q.reponse_contenu || '').trim();
    const cle = `${q.id}:${empreinte(rep)}`;
    if (!rep || etat.reponsesTraitees.includes(cle)) continue;
    const courant = lireEtat(dossierId)!;
    const cles = String(q.exigence_id || '').split(/[,+]/).map((x: string) => x.trim()).filter(Boolean);
    const rems = await correspondances(courant, `${q.critere_concerne || ''}\n${q.question || ''}`.trim(), rep, cles);
    let maj = courant;
    if (rems.length) {
      maj = await remplir(dossierId, rems, 'equipe');
      n += rems.length;
      console.log(`[completion] ${dossierId} : réponse d'équipe intégrée dans ${rems.length} emplacement(s) (${rems.map((x) => x.cle).join(', ')}).`);
    }
    maj.reponsesTraitees.push(cle);
    ecrireEtat(maj);
    etat.reponsesTraitees.push(cle);
  }
  return n;
}

// ─── Surveillance des réponses reçues ─────────────────────────────────────────────────────

const INTERVALLE_S = Number(process.env.COMPLETION_WATCH_INTERVAL_SEC ?? 30);
let enCours = false;

async function balayer(): Promise<void> {
  if (enCours) return;
  enCours = true;
  try {
    if (!fs.existsSync(ETATS_DIR)) return;
    for (const f of fs.readdirSync(ETATS_DIR).filter((x) => x.endsWith('.json'))) {
      const etat = lireEtat(f.replace(/\.json$/, ''));
      if (!etat || etat.dossierId.startsWith('demo-')) continue;
      try { await integrerReponsesEquipe(etat.dossierId); }
      catch (e) { console.warn(`[completion] ${etat.dossierId} : intégration impossible —`, (e as Error)?.message); }
    }
  } finally {
    enCours = false;
  }
}

/** Démarre la surveillance (sans effet si l'intervalle vaut 0). */
export function startCompletionWatcher(): void {
  if (!Number.isFinite(INTERVALLE_S) || INTERVALLE_S <= 0) return;
  console.log(`[completion] intégration automatique des réponses d'équipe — contrôle toutes les ${INTERVALLE_S} s.`);
  const t = setInterval(() => void balayer(), INTERVALLE_S * 1000);
  t.unref?.();
  void balayer();
}

// ─── Capitalisation d'une saisie directe ──────────────────────────────────────────────────

/**
 * Une information saisie par l'équipe est une connaissance GSS datée : elle rejoint la base de
 * connaissance (source SOLLICITATION, comme les réponses par e-mail) et prime aux générations suivantes.
 */
export async function capitaliser(dossierId: string, el: ElementACompleter): Promise<void> {
  if (dossierId.startsWith('demo-') || !el.valeur) return;
  const db = admin();
  if (!db) return;
  const txt = `${el.question} : ${el.valeur}`;
  const emb = await openai().embeddings.create({ model: EMBED_MODEL, input: [txt] });
  const { error } = await db.from('rag_chunk').upsert([{
    chunk_id: `completion-${dossierId}-${el.cle}-${empreinte(txt)}`,
    text: txt,
    source: 'SOLLICITATION',
    categorie: el.question.slice(0, 200),
    source_file: `completion:${dossierId}:${el.cle}`,
    source_path: `completion/${dossierId}/${el.cle}`,
    chunk_index: 0,
    extra: { ao_id: dossierId, saisie: true, date: el.completeLe },
    embedding: `[${emb.data[0].embedding.join(',')}]`,
    actif: true,
  }], { onConflict: 'chunk_id' });
  if (error) console.warn('[completion] capitalisation impossible :', error.message);
}

// ─── Destinataires proposés (« Demander à l'équipe ») ─────────────────────────────────────

const MOTS_NEUTRES = new Set(['responsable', 'responsables', 'service', 'services', 'agent', 'agents', 'chef', 'charge', 'de', 'du', 'des', 'la', 'le', 'les', 'et']);
const normMots = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z]+/).map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 3 && !MOTS_NEUTRES.has(w) && !MOTS_NEUTRES.has(`${w}s`));

/** Vrai si deux fonctions relèvent du même pôle (ex. « Responsable d'exploitation » / « Services Exploitations »). */
export function memePole(f1: string, f2: string): boolean {
  const a = new Set(normMots(f1));
  return normMots(f2).some((w) => a.has(w));
}

/**
 * Personnes connues de GSS pour un rôle (référents « Personnes » + mémoires récents), pour signaler
 * celles qui ne sont pas encore dans l'annuaire (sans adresse e-mail, on ne peut pas leur écrire).
 */
export function personnesConnuesDuRole(fonction: string): string[] {
  const noms = new Set<string>(personnesDuRole(fonction));
  try {
    const f = path.resolve(__dirname, '../../Template/Documentation GSS/Personnes');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      for (const ligne of fs.readFileSync(f, 'utf-8').split(/\r?\n/)) {
        const m = ligne.match(/^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/);
        if (m && m[2].split('/').some((r) => memePole(r, fonction))) noms.add(m[1].trim());
      }
    }
  } catch { /* fichier facultatif */ }
  return [...noms];
}
