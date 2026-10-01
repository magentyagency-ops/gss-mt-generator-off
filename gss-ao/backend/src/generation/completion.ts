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
import { reglagesIA } from '../core/modeles_ia';
import { personnesDuRole, retirerCommentairesInternes } from './base_memoires';
import { RETOUR_ARRIERE } from './themes';
import type { PlanMemoireType } from './memoire_type';
import type { AjoutLibre } from './reponse_libre_v2';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RESPONSE_DIR = path.resolve(__dirname, '../../response');
const ETATS_DIR = path.join(RESPONSE_DIR, 'etats');
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
  libre?: {
    sections: Record<string, string>;
    schemas: Record<string, string>;
    cover: any;
    /** Rubriques ajoutées avec l'assistant de modification, et propositions de réponse de l'IA aux questions
     *  nouvelles du DCE (réponse libre v2 : proposition = true tant que GSS ne l'a pas validée). */
    ajouts?: AjoutLibre[];
    /** Photos ajoutées aux rubriques avec l'assistant (une page par photo). */
    photos?: Record<string, Array<{ chemin: string; legende?: string }>>;
    /** Format court imposé par le RC (nombre de pages maximum et plan) : une partie par point du plan. */
    court?: { pagesMax: number; plan: Array<{ id: string; title: string; attendu?: string }>; source?: string };
    /** Thème de style du rendu (themes.ts) : une recomposition garde le même rendu. Absent (état écrit avant les
     *  thèmes) : « gss-2026-09 », le rendu de l'époque. */
    theme?: string;
    /** Réponse libre construite sur le mémoire type (refonte 2026-10) : 2. Absent : plan v1 (AI_SECTIONS_B). */
    version?: 2;
    /** Plan v2 : blocs et rubriques retenues du mémoire type (rendu « 1 à 2 pages de texte, puis 1 page de schéma »,
     *  titres et chapitres de l'assistant). Absent : plan v1. */
    plan?: PlanMemoireType;
    /** Plan v2 : titre-message de la page de schéma de chaque rubrique. */
    titresSchemas?: Record<string, string>;
    /** Plan v2 : indicateurs vrais du mémoire type et leurs raisons (DCE, analyse, matrice), pour contrôle. */
    indicateurs?: Record<string, string[]>;
  };
  /** Cadre imposé : réponses rédigées par GSS (signets GSS_CH_n), les seules que l'assistant peut modifier. */
  champs?: Array<{ cle: string; libelle: string }>;
  /** Demande particulière saisie avant la génération. */
  demande?: string;
  /** Échanges avec l'assistant de modification. */
  conversation?: Array<{ role: 'utilisateur' | 'assistant'; texte: string; date: string; modifies?: string[]; pieces?: string[] }>;
}

// ─── État ────────────────────────────────────────────────────────────────────────────────

/**
 * Verrou par dossier : saisie, réponse d'équipe et assistant modifient le même document ; exécutés en
 * même temps, le dernier écrivait un état qui ignorait l'autre modification (information perdue).
 * Les opérations d'un même dossier sont donc enchaînées, l'une après l'autre.
 */
const fileParDossier = new Map<string, Promise<unknown>>();
export function verrouiller<T>(dossierId: string, tache: () => Promise<T>): Promise<T> {
  const precedente = fileParDossier.get(dossierId) || Promise.resolve();
  const suite = precedente.catch(() => undefined).then(tache);
  fileParDossier.set(dossierId, suite);
  suite.finally(() => { if (fileParDossier.get(dossierId) === suite) fileParDossier.delete(dossierId); }).catch(() => undefined);
  return suite;
}

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
  const { libre, reponsesTraitees, champs, ...reste } = etat;
  return {
    ...reste,
    restants: etat.elements.filter((e) => e.statut === 'ouvert').length,
    // Format court imposé par le RC : limite de pages et plan (l'assistant n'y ajoute ni page ni photo).
    court: libre?.court ? { pagesMax: libre.court.pagesMax, parties: libre.court.plan.map((p) => p.title) } : undefined,
  };
}

// ─── Cadre imposé : signets autour des « [À COMPLÉTER] » ─────────────────────────────────

export function elements(node: any, name: string): any[] {
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

export function nouveauRun(xmlDoc: any, rPr: any): any {
  const r = xmlDoc.createElementNS(W_NS, 'w:r');
  if (rPr) r.appendChild(rPr.cloneNode(true));
  return r;
}

export function nouveauT(xmlDoc: any, s: string): any {
  const t = xmlDoc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = s;
  return t;
}

/**
 * Isole chaque « [À COMPLÉTER] » marqué par le générateur dans son propre run, entouré d'un signet
 * GSS_AC_n. Retourne, dans l'ordre du document, le champ d'origine et le contexte de chaque emplacement.
 */
export function poserSignets(xmlDoc: any, depart = 0): Array<{ cle: string; champ: number; contexte: string; environnement: string }> {
  const out: Array<{ cle: string; champ: number; contexte: string; environnement: string }> = [];
  let n = depart;
  let idSignet = 90000 + depart;
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
    const net = (x: string) => x.replace(/\uE000\d+\uE001/g, '').replace(/[\uE002\uE004]\d+[\uE003\uE005]/g, '').split(PLACEHOLDER).join('[…]').replace(/[ \t]+/g, ' ');
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

// ─── Cadre imposé : signets autour de chaque réponse rédigée (assistant de modification) ────

/** Marques internes encadrant la valeur d'un champ : début <id> … fin <id>. */
export const DEBUT_CHAMP = (id: number) => `\uE002${id}\uE003`;
export const FIN_CHAMP = (id: number) => `\uE004${id}\uE005`;
const DEBUT_RE = /\uE002(\d+)\uE003/;
const FIN_RE = /\uE004(\d+)\uE005/;

/** Coupe le run de `tEl` à la position `pos` (en retirant `longueur` caractères) et insère `el` à cet endroit. */
function insererDansRun(xmlDoc: any, tEl: any, pos: number, longueur: number, el: any): void {
  const run = tEl.parentNode;
  const s = tEl.textContent || '';
  const avant = s.slice(0, pos);
  const apres = s.slice(pos + longueur);
  const rPr = Array.from({ length: run.childNodes.length }, (_, i) => run.childNodes[i]).find((c: any) => c.nodeType === 1 && c.localName === 'rPr');
  const runApres = nouveauRun(xmlDoc, rPr);
  if (apres) runApres.appendChild(nouveauT(xmlDoc, apres));
  while (tEl.nextSibling) runApres.appendChild(tEl.nextSibling);
  tEl.textContent = avant;
  const para = run.parentNode;
  const suivant = run.nextSibling;
  const inserer = (x: any) => (suivant ? para.insertBefore(x, suivant) : para.appendChild(x));
  inserer(el);
  if (runApres.childNodes.length > (rPr ? 1 : 0)) inserer(runApres);
}

/**
 * Remplace les marques de début/fin de chaque réponse par un signet Word invisible GSS_CH_<champ> qui
 * l'entoure. Le texte du cadre de l'acheteur reste hors de tout signet : l'assistant ne peut pas le toucher.
 */
export function poserSignetsChamps(xmlDoc: any): number[] {
  const champs: number[] = [];
  let idSignet = 80000;
  for (;;) {
    const tEl = elements(xmlDoc, 't').find((t) => DEBUT_RE.test(t.textContent || '') || FIN_RE.test(t.textContent || ''));
    if (!tEl) break;
    const s = tEl.textContent || '';
    const d = DEBUT_RE.exec(s);
    const f = FIN_RE.exec(s);
    const m = d && (!f || d.index < f.index) ? d : f!;
    const champ = Number(m[1]);
    if (!tEl.parentNode || tEl.parentNode.localName !== 'r' || !tEl.parentNode.parentNode) { tEl.textContent = s.replace(m[0], ''); continue; }
    if (m === d) {
      const b = xmlDoc.createElementNS(W_NS, 'w:bookmarkStart');
      b.setAttribute('w:id', String(idSignet + champ));
      b.setAttribute('w:name', `GSS_CH_${champ}`);
      insererDansRun(xmlDoc, tEl, m.index, m[0].length, b);
      champs.push(champ);
    } else {
      const b = xmlDoc.createElementNS(W_NS, 'w:bookmarkEnd');
      b.setAttribute('w:id', String(idSignet + champ));
      insererDansRun(xmlDoc, tEl, m.index, m[0].length, b);
    }
  }
  return champs;
}

/**
 * Formule, pour CHAQUE emplacement, la question exacte à poser à l'équipe : elle ne porte que sur la
 * donnée manquante à cet endroit précis (lue dans sa phrase), pas sur le sous-critère entier.
 */
/** Identifiant interne d'emplacement ou de champ (jamais dans une question posée à GSS). */
export const REPERE_TECHNIQUE = /\b(?:GSS_AC|GSS_CH|CHAMP)_?\d+\b/i;

export async function formulerQuestions(
  items: Array<{ cle: string; contexte: string; environnement: string; critere: string }>,
): Promise<Map<string, { question: string; groupe: string }>> {
  const out = new Map<string, { question: string; groupe: string }>();
  if (!items.length) return out;
  const systeme = `Dans un mémoire technique GSS (sécurité privée), des données manquent aux emplacements « [À COMPLÉTER] » (les autres emplacements de la même phrase sont notés « […] »). Pour CHAQUE emplacement listé, formule la question exacte à poser à un collègue de GSS pour obtenir LA donnée qui manque À CET ENDROIT PRÉCIS.
- La question ne porte que sur cet emplacement, pas sur les « […] » ni sur le reste du paragraphe.
- Elle est autonome et concrète : elle nomme le site ou le sujet, et indique la forme attendue (nombre d'agents, durée en minutes, nom de société, horaires…).
- Une seule phrase interrogative, sans formule de politesse.
- Ne cite jamais l'identifiant de l'emplacement (« GSS_AC_3 », « A12 », « CHAMP_5 ») : c'est un repère technique, inconnu du collègue.
- "groupe" : un libellé court de la DONNÉE attendue (ex. « nombre d'équipes affectées au site », « recours à la sous-traitance et à l'intérim »). Des emplacements qui attendent exactement la même donnée reçoivent le MÊME groupe (et la même question) : GSS n'y répondra qu'une fois.
Renvoie {"questions": [{"cle": "...", "question": "...", "groupe": "..."}]} avec TOUS les emplacements listés.`;
  const demander = async (lot: typeof items) => {
    const r = await json(systeme, lot.map((i) => `### ${i.cle}\nSous-critère : ${i.critere || '—'}\nPhrase : ${i.contexte}\nTexte autour : ${i.environnement}`).join('\n\n'));
    for (const q of Array.isArray(r.questions) ? r.questions : []) {
      // Une question qui cite un repère technique (« le champ GSS_AC_3 ») n'a pas de sens pour GSS : écartée (relance,
      // puis question d'origine de l'emplacement).
      if (q?.cle && String(q.question || '').trim() && !REPERE_TECHNIQUE.test(String(q.question))) {
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
 * Questions des emplacements du cadre, précisées sans modèle :
 * - champ d'un bloc de coordonnées (« Prénom, Nom », « Adresse électronique »…) : la question reprend le libellé du
 *   bloc du cadre (« Contact comptable »), sinon trois blocs de contacts posent des questions identiques et ambiguës ;
 * - cases d'un même tableau (lignes « plage | profil | en service : … | rotation : … ») : une seule question et un seul
 *   groupe pour tout le tableau, avec la question globale du même champ qui les recoupe (dimensionnement, effectifs) ;
 * - questions identiques : un seul groupe (GSS n'y répond qu'une fois).
 */
export function preciserQuestionsCadre(
  elements: ElementACompleter[],
  signets: Array<{ cle: string; champ: number; contexte: string; environnement: string }>,
  blocDuChamp: (champ: number) => string = () => '',
): void {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const CHAMP_CONTACT = /^(?:pr[ée]nom|nom\b|num[ée]ro|t[ée]l[ée]phone|portable|adresse (?:[ée]lectronique|mail|e-?mail)|courriel|e-?mail|fonction)/i;
  const signet = new Map(signets.map((x) => [x.cle, x]));
  for (const el of elements) {
    const s = signet.get(el.cle);
    if (!s) continue;
    const champ = (/^([^:|\[]{2,70}?)\s*:\s*\[À COMPLÉTER\]/.exec(s.contexte) || [])[1]?.trim();
    if (!champ || !CHAMP_CONTACT.test(champ)) continue;
    let bloc = blocDuChamp(s.champ).trim();
    if (!bloc) {
      const avant = s.environnement.slice(0, Math.max(0, s.environnement.lastIndexOf(PLACEHOLDER)));
      bloc = [...avant.matchAll(/((?:Contact|Interlocuteur|R[ée]f[ée]rent|Correspondant|Responsable)[^:.;|]{0,40}?)\s*:/g)]
        .map((m) => m[1].trim()).filter((b) => !CHAMP_CONTACT.test(b)).pop() || '';
    }
    if (!bloc) continue;
    el.question = `Cadre de réponse, « ${bloc.replace(/\s*:\s*$/, '')} » : ${champ.replace(/(?<![A-ZÀ-Ý])[A-ZÀ-Ý](?![A-ZÀ-Ý])/g, (c) => c.toLowerCase())} à indiquer ?`;
    el.groupe = norm(`${bloc} ${champ}`);
  }
  // Cases d'un même tableau (au moins deux cases du même champ dans des lignes à colonnes « | »).
  const cases = new Map<number, ElementACompleter[]>();
  for (const el of elements) {
    const s = signet.get(el.cle);
    if (s && (s.contexte.match(/\|/g) || []).length >= 2) (cases.get(s.champ) ?? cases.set(s.champ, []).get(s.champ)!).push(el);
  }
  for (const [champ, l] of cases) {
    if (l.length < 2) continue;
    const lignes = l.map((el) => signet.get(el.cle)!.contexte.split('|').map((x) => x.trim()));
    const premieres = [...new Set(lignes.map((c) => c[0]).filter(Boolean))];
    const secondes = [...new Set(lignes.map((c) => (c.length > 3 ? c[1] : '')).filter(Boolean))];
    const colonnes = [...new Set(lignes.flatMap((c) => c.filter((x) => /\[(?:À COMPLÉTER|…)\]/.test(x)).map((x) => x.replace(/\s*:?\s*\[(?:À COMPLÉTER|…)\]\s*/g, '').trim()).filter(Boolean)))];
    const groupe = `tableau du champ ${champ}`;
    const question = `Tableau du cadre de réponse (${premieres.join(' ; ')}${secondes.length ? ` — ${secondes.join(', ')}` : ''}) : pour chaque ligne, ${colonnes.length ? colonnes.join(' et ') : 'la valeur attendue'} ?`;
    for (const el of l) { el.question = question; el.groupe = groupe; }
    // Question globale du même champ qui recoupe le tableau (dimensionnement, effectifs par plage) : même groupe.
    for (const el of elements) {
      const s = signet.get(el.cle);
      if (s && s.champ === champ && !l.includes(el) && /dimensionnement|effectifs? (?:propos|par)|nombre d.agents|par plage|par profil/i.test(`${s.contexte} ${el.question}`)) {
        el.question = question; el.groupe = groupe;
      }
    }
  }
  // Questions identiques : un seul groupe.
  const parQuestion = new Map<string, string>();
  for (const el of elements) {
    const k = norm(el.question);
    if (!k) continue;
    if (parQuestion.has(k)) el.groupe = parQuestion.get(k)!;
    else { el.groupe = el.groupe || k; parQuestion.set(k, el.groupe); }
  }
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
export function openai(): OpenAI {
  if (!openaiClient) {
    const key = getSettings().openaiApiKey;
    if (!key) throw new Error('Clé OpenAI manquante.');
    openaiClient = new OpenAI({ apiKey: key, timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 300_000 });
  }
  return openaiClient;
}

export async function json(system: string, user: string): Promise<any> {
  // Coupure réseau, limite de débit ou erreur serveur passagères : nouvel essai (5 s, 15 s, 30 s).
  let r: any;
  for (let essai = 1; ; essai++) {
    try {
      r = await openai().chat.completions.create({
        ...reglagesIA('redaction'),
        messages: [{ role: 'system', content: `${system}\nRéponds uniquement par un objet JSON.` }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
      });
      break;
    } catch (e: any) {
      const passagere = (!e?.status || e.status === 429 || e.status >= 500) && e?.code !== 'insufficient_quota';
      if (!passagere || essai >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, [5_000, 15_000, 30_000][essai - 1]));
    }
  }
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
  // Réponse libre v2 (mémoire type) : le repère suit immédiatement le « [À COMPLÉTER] » qu'il complète, au milieu de sa
  // phrase ou de sa ligne de tableau : l'information remplace ce « [À COMPLÉTER] », sous la forme du fragment qui garde
  // la phrase correcte (comme dans un cadre imposé). Les repères de la réponse libre v1 ne suivent jamais un
  // « [À COMPLÉTER] » : leur intégration est inchangée (1 à 2 phrases insérées à l'emplacement).
  if (pos >= PLACEHOLDER.length && texteRubrique.slice(pos - PLACEHOLDER.length, pos) === PLACEHOLDER) {
    const debut = pos - PLACEHOLDER.length;
    const ligneDebut = texteRubrique.lastIndexOf('\n', debut - 1) + 1;
    const ligneFin = texteRubrique.indexOf('\n', pos);
    const ligne = texteRubrique.slice(ligneDebut, ligneFin < 0 ? texteRubrique.length : ligneFin);
    // Les autres emplacements de la ligne sont notés « […] » : seul celui-ci reste « [À COMPLÉTER] ».
    const net = (x: string) => x.replace(/⟦AC:\d+⟧/g, '').split(PLACEHOLDER).join('[…]');
    const cible = `${net(ligne.slice(0, debut - ligneDebut))}${PLACEHOLDER}${net(ligne.slice(pos + repere.length - ligneDebut))}`;
    let valeur = '';
    try {
      const r = await json(
        `Tu complètes un mémoire technique GSS (sécurité privée). Dans la phrase (ou la ligne de tableau) donnée, l'emplacement « ${PLACEHOLDER} » attend une information. Donne le fragment EXACT qui remplace « ${PLACEHOLDER} » pour que la phrase reste correcte et naturelle (ex. « 6 », « ERYMA », « 45 minutes », « CQP APS et SST »), sans répéter les mots déjà présents autour. N'utilise QUE l'information fournie, sans rien ajouter ; jamais de commentaire. Renvoie {"valeur": "..."}.`,
        `Information attendue : ${question}\nInformation fournie : ${info}\nPhrase : ${cible}`,
      );
      valeur = retirerCommentairesInternes(String(r.valeur || '').trim()).texte.trim();
    } catch { /* l'information fournie est insérée telle quelle */ }
    if (!valeur) valeur = info.replace(/\s+/g, ' ').trim();
    if (/^\s*\|/.test(ligne)) valeur = valeur.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ');
    return texteRubrique.slice(0, debut) + valeur + texteRubrique.slice(pos + repere.length);
  }
  const extrait = pos >= 0 ? texteRubrique.slice(Math.max(0, pos - 700), pos + 300) : texteRubrique.slice(-900);
  const r = await json(
    `Tu complètes un mémoire technique GSS (sécurité privée). Une information manquait à l'endroit marqué ${repere}. Rédige 1 à 2 phrases à insérer à cet endroit, dans le ton du texte, qui intègrent l'information fournie. N'ajoute AUCUN fait absent de l'information fournie. Pas de titre, pas de Markdown de titre. Écris l'information comme un fait ou un engagement de GSS : jamais « GSS indique / précise / confirme », jamais de commentaire sur ce qui manque ou reste à définir. Renvoie {"phrase": "..."}.`,
    `Information attendue : ${question}\nInformation fournie : ${info}\n\nTexte autour de l'emplacement :\n${extrait}`,
  );
  // Même filtre que le texte généré (formulations « GSS indique… », commentaires internes).
  const nettoyee = retirerCommentairesInternes(String(r.phrase || info).trim()).texte.trim();
  const phrase = nettoyee || String(r.phrase || info).trim();
  return pos >= 0 ? texteRubrique.replace(repere, phrase) : `${texteRubrique.trim()}\n\n${phrase}`;
}

/** Recompose le PDF d'une réponse libre depuis l'état (schémas déjà construits réutilisés). */
export async function recomposerPdf(etat: EtatCompletion): Promise<string> {
  // Import différé : evite une dépendance circulaire avec le générateur.
  const { MemoireGenerator } = await import('./memoire_generator');
  const gen = new MemoireGenerator();
  const propres: Record<string, string> = {};
  for (const [id, t] of Object.entries(etat.libre!.sections)) propres[id] = t.replace(REPERE_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  // Même thème que le rendu d'origine (schémas déjà construits réutilisés) ; état d'avant les thèmes : retour arrière.
  const theme = etat.libre!.theme || RETOUR_ARRIERE;
  if (etat.libre!.court) {
    const r = await gen.rendreCourtDepuisSections(propres, etat.libre!.court, etat.libre!.cover, etat.libre!.schemas || {}, theme);
    return r.filePath;
  }
  const res = await gen.rendreDepuisSections(propres, etat.dossierId, {
    cover: etat.libre!.cover,
    schemas: new Map(Object.entries(etat.libre!.schemas || {})),
    ajouts: etat.libre!.ajouts,
    photos: etat.libre!.photos,
    theme,
    // Réponse libre v2 (mémoire type) : même plan, mêmes pages de schéma ; état v1 : rendu v1 inchangé.
    plan: etat.libre!.plan,
    titresSchemas: etat.libre!.titresSchemas,
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
      if (!etat || typeof etat.dossierId !== 'string' || etat.dossierId.startsWith('demo-')) continue;
      try { await verrouiller(etat.dossierId, () => integrerReponsesEquipe(etat.dossierId)); }
      catch (e) { console.warn(`[completion] ${etat.dossierId} : intégration impossible —`, (e as Error)?.message); }
    }
  } catch (e) {
    // Ne doit jamais faire tomber le serveur (fichier d'état illisible…).
    console.warn('[completion] balayage impossible :', (e as Error)?.message);
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
