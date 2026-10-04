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
import { reglagesIA, creditEpuise, CreditOpenAIEpuise } from '../core/modeles_ia';
import { personnesDuRole, retirerCommentairesInternes } from './base_memoires';
import { RETOUR_ARRIERE } from './themes';
import type { PlanMemoireType } from './memoire_type';
import type { AjoutLibre } from './reponse_libre_v2';
import type { PhraseAdaptee } from './adaptations_cctp';
import { categorieDe } from './dimensionnement';

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

/**
 * Emplacements « [À COMPLÉTER] » du texte remis sans question (D7 : chaque donnée manquante a sa question) : un
 * emplacement venu de l'adaptation au CCTP (« Chargé d'affaire dédié : [À COMPLÉTER] », génération réelle imm 16) ou dont
 * la question a disparu à la fusion des consultations reçoit une question tirée de son libellé. Un paragraphe dont un
 * repère ⟦AC:n⟧ est déjà couvert par une question est laissé tel quel. Renvoie les éléments à ajouter.
 */
/**
 * Libellé de la donnée attendue à un emplacement « [À COMPLÉTER] » : la phrase qui le contient, sans ce qui suit le repère ni
 * le verbe d'état final (« Le chef de poste sur le terrain est [À COMPLÉTER]. » → « Le chef de poste sur le terrain »).
 */
export function libelleDuRepere(texte: string): string {
  const t = String(texte || '').replace(/\*\*/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '');
  const phrases = t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«])/);
  const ph = phrases.find((x) => x.includes('[À COMPLÉTER]')) || t;
  return ph.split('[À COMPLÉTER]')[0].replace(/[\s:,;–—-]+$/, '').replace(/\s+(?:est|sont|sera|seront|serait|reste|restent)$/i, '').trim();
}

export function questionsDesEmplacements(sections: Record<string, string>, elements: ElementACompleter[], titreDe: (id: string) => string = () => ''): ElementACompleter[] {
  const couverts = new Set(elements.flatMap((e) => e.reperes || []));
  const ajouts: ElementACompleter[] = [];
  for (const id of Object.keys(sections)) {
    for (const bloc of String(sections[id] || '').split(/\n{2,}/)) {
      if (!bloc.includes('[À COMPLÉTER]')) continue;
      const reperes = [...bloc.matchAll(REPERE_RE)].map((m) => Number(m[1]));
      if (reperes.some((r) => couverts.has(r))) continue;
      for (const ligne of bloc.split('\n').filter((l) => l.includes('[À COMPLÉTER]'))) {
        const propre = ligne.replace(REPERE_RE, '').trim();
        // Libellé tiré de la phrase qui porte l'emplacement, jamais du début du paragraphe (T3-CONS-13, imm 1353 : « Nous vous
        // présentons les collaborateurs… » pour « Le chef de poste sur le terrain est [À COMPLÉTER]. »).
        const libelle = libelleDuRepere(propre);
        const lib = (libelle || propre).replace(/\s+/g, ' ').trim();
        const question = `Information à fournir pour compléter le mémoire : « ${lib.length <= 160 ? lib : `${lib.slice(0, 161).replace(/\s+\S*$/, '').replace(/[\s,;:]+$/, '')}…`} ».`;
        if ([...elements, ...ajouts].some((e) => e.question === question)) continue;
        ajouts.push({ cle: `Q${elements.length + ajouts.length + 1}`, question, contexte: `${titreDe(id)} — …${propre.slice(0, 220)}`, statut: 'ouvert', reperes, pourAcheteur: false });
        reperes.forEach((r) => couverts.add(r));
      }
    }
  }
  return ajouts;
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
    /** Style « marine » v3 : articles du CCTP des chiffres du bloc 1 (bandeau des chiffres clés, sources). */
    articlesBloc1?: Record<string, string>;
    /** Plan v2 : indicateurs vrais du mémoire type et leurs raisons (DCE, analyse, matrice), pour contrôle. */
    indicateurs?: Record<string, string[]>;
    /** Plan v2 : valeurs écrites dans les schémas « spec » (EFFECTIF_AGENTS, NB_AGENTS_RENFORT…), pour redessiner un schéma
     *  quand GSS change ces valeurs après la génération (T10N-2). */
    variablesSchemas?: Record<string, string>;
  };
  /** Cadre imposé : réponses rédigées par GSS (signets GSS_CH_n), les seules que l'assistant peut modifier. */
  champs?: Array<{ cle: string; libelle: string }>;
  /** Demande particulière saisie avant la génération. */
  demande?: string;
  /** Échanges avec l'assistant de modification. */
  conversation?: Array<{ role: 'utilisateur' | 'assistant'; texte: string; date: string; modifies?: string[]; pieces?: string[] }>;
  /** Dispositif proposé pour les mises en situation (D5), avec l'empreinte de l'extrait du DCE dont il vient : repris tel
   *  quel à la génération suivante tant que le DCE ne change pas (vitry : 22 puis 45 agents d'une génération à l'autre). */
  dimensionnement?: { empreinte: string; misesEnSituation: any[] };
  /** Phrases de GSS adaptées au cahier des charges du client (D8) : signalées à GSS (consultations, premier message de
   *  l'assistant), validées, modifiées ou rétablies par l'assistant ; les choix de GSS sont repris à la génération suivante. */
  adaptations?: PhraseAdaptee[];
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
  const { libre, reponsesTraitees, champs, dimensionnement, adaptations, ...reste } = etat;
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

/** Premier numéro des emplacements de la grille de candidature (hors champs du cadre). */
export const CHAMP_GRILLE_CANDIDATURE = 990000;

/**
 * Grille « Éléments de candidature » d'un cadre (vitry 351 : « 2025 : ….. dont ….. cadres », « 2025 : ….. € »,
 * « 2025 – Dénomination sociale (public ou privé) / – n° de téléphone du contact / - Montant annuel HT ») : chaque donnée
 * de GSS laissée en pointillés reçoit un « [À COMPLÉTER] » et une question exacte à GSS (effectif moyen, cadres, chiffre
 * d'affaires HT, référence de l'année), jamais à l'acheteur ; aucune donnée n'est inventée. Les emplacements sont marqués
 * « [À COMPLÉTER]n » avec n = CHAMP_GRILLE_CANDIDATURE + rang de la question (signets posés ensuite par poserSignets).
 * Renvoie les questions, dans l'ordre.
 */
export function completerGrilleCandidature(xmlDoc: any): string[] {
  const questions: string[] = [];
  const texte = (n: any) => elements(n, 't').map((t: any) => t.textContent || '').join('');
  // Marque avec ses délimiteurs (MARQUE_CHAMP), comme tout autre champ : le signet GSS_AC est posé par poserSignets, jamais
  // « [À COMPLÉTER]990000 » imprimé (vitry, T5N-1).
  const marque = (q: string) => { questions.push(q); return `${PLACEHOLDER}${MARQUE_CHAMP(CHAMP_GRILLE_CANDIDATURE + questions.length - 1)}`; };
  const POINTS = '(?:…|\\.){2,}';
  const tables = elements(xmlDoc, 'tbl').filter((tbl: any) => /chiffre d.affaires|effectifs? moyens|r[ée]f[ée]rences? professionnelles|capacit[ée] (?:technique|professionnelle|financi[èe]re)/i.test(texte(tbl)));
  for (const tbl of tables) {
    for (const cellule of elements(tbl, 'tc')) {
      let annee = '';
      for (const p of elements(cellule, 'p')) {
        const ts = elements(p, 't');
        if (!ts.length) continue;
        const t = ts.map((x: any) => x.textContent || '').join('');
        if (t.includes(PLACEHOLDER)) continue;
        let m: RegExpExecArray | null;
        let nouveau = '';
        if ((m = new RegExp(`^(\\s*((?:19|20)\\d{2})\\s*:\\s*)${POINTS}(\\s*dont\\s*)${POINTS}(\\s*cadres?\\s*)$`, 'i').exec(t))) {
          nouveau = `${m[1]}${marque(`Éléments de candidature : quel était l'effectif moyen annuel de GSS en ${m[2]} ?`)}${m[3]}${marque(`Éléments de candidature : combien de cadres GSS comptait-elle en ${m[2]} (part de l'encadrement) ?`)}${m[4]}`;
        } else if ((m = new RegExp(`^(\\s*((?:19|20)\\d{2})\\s*:\\s*)${POINTS}(\\s*(?:€|euros?)?\\s*(?:HT)?\\s*)$`, 'i').exec(t))) {
          // Unité écrite par le cadre après l'emplacement (« € ») : précisée dans la question, jamais redite (T6N-6).
          const unite = /€|euro/i.test(m[3]) ? ' (montant en euros, sans le signe €)' : '';
          nouveau = `${m[1]}${marque(`Éléments de candidature : quel a été le chiffre d'affaires HT de GSS pour l'exercice ${m[2]}${unite} ?`)}${m[3]}`;
        } else if ((m = /^\s*((?:19|20)\d{2})\s*[-–—]\s*d[ée]nomination sociale[^:]*?\s*$/i.exec(t))) {
          annee = m[1];
          nouveau = `${t.replace(/\s+$/, '')} : ${marque(`Éléments de candidature, référence ${annee} : quel établissement client (dénomination sociale, public ou privé) faut-il citer ?`)}`;
        } else if (annee && /^\s*[-–—]\s*n°\s*de\s*t[ée]l[ée]phone[^:]*?\s*$/i.test(t)) {
          nouveau = `${t.replace(/\s+$/, '')} : ${marque(`Éléments de candidature, référence ${annee} : quel est le numéro de téléphone du contact dans cet établissement ?`)}`;
        } else if (annee && /^\s*[-–—]\s*montant annuel(?: HT)?\s*$/i.test(t)) {
          nouveau = `${t.replace(/\s+$/, '')} : ${marque(`Éléments de candidature, référence ${annee} : quel est le montant annuel HT de cette prestation ?`)}`;
        }
        if (!nouveau) continue;
        ts[0].textContent = nouveau;
        ts[0].setAttribute('xml:space', 'preserve');
        for (const x of ts.slice(1)) x.textContent = '';
      }
    }
  }
  return questions;
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
 * Groupes des emplacements (une carte et une saisie par groupe) : des questions identiques forment un seul groupe ; un
 * groupe ne réunit jamais deux questions différentes (sauf les cases d'un même tableau, une question pour toutes), sinon la
 * réponse saisie pour l'une serait écrite à la place de l'autre. À rejouer après toute réécriture d'une question (T7N-3 :
 * questions de délai du cadre réécrites après preciserQuestionsCadre, intervention courante et urgence dans un même groupe).
 */
export function regrouperQuestions(elements: ElementACompleter[]): void {
  const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const parQuestion = new Map<string, string>();
  for (const el of elements) {
    const k = norm(el.question);
    if (!k) continue;
    if (parQuestion.has(k)) el.groupe = parQuestion.get(k)!;
    else { el.groupe = el.groupe || k; parQuestion.set(k, el.groupe); }
  }
  const questionsDuGroupe = new Map<string, Set<string>>();
  for (const el of elements) if (el.groupe) (questionsDuGroupe.get(el.groupe) ?? questionsDuGroupe.set(el.groupe, new Set()).get(el.groupe)!).add(norm(el.question));
  for (const el of elements) {
    if (el.groupe && !el.groupe.startsWith('tableau du champ') && (questionsDuGroupe.get(el.groupe)?.size || 0) > 1) el.groupe = norm(el.question) || el.cle;
  }
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
    // Lignes à « | », ou écrites sans « | » dans le cadre (sansBarresTableau : « plage — profil ; en service : … ; rotation : … »).
    if (s && ((s.contexte.match(/\|/g) || []).length >= 2 || /\s—\s[^;\n]*;[^;\n]*;/.test(s.contexte))) (cases.get(s.champ) ?? cases.set(s.champ, []).get(s.champ)!).push(el);
  }
  for (const [champ, l] of cases) {
    if (l.length < 2) continue;
    const lignes = l.map((el) => signet.get(el.cle)!.contexte.split(/\s*\|\s*|\s+—\s+|\s*;\s+/).map((x) => x.trim()));
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
  // Case de tableau réécrite par ligne et colonne (« Tableau du cadre, ligne « Autorisation dirigeant », colonne « … Date
  // d'obtention » ») : une donnée par case, jamais le groupe générique du modèle (« contenu de rubrique non precise », qui
  // réunissait trois cases du tableau CNAPS de havre2 : une saisie remplissait les trois avec la même date). Sa phrase,
  // réduite à « [À COMPLÉTER] », devient « ligne — colonne : [À COMPLÉTER] » pour que l'assistant sache quelle donnée
  // elle attend. La question en clair qui porte sur la même donnée (« date de fin de validité de l'autorisation d'exercer
  // de GSS », « dates de délivrance et de fin de validité de l'agrément du dirigeant ») rejoint ses cases : une seule
  // question, la sienne.
  const CASE = /^Tableau du cadre, ligne « ([^»]+) », colonne « ([^»]+) »/;
  const cellules = elements.map((el) => ({ el, m: CASE.exec(el.question) })).filter((x) => x.m) as Array<{ el: ElementACompleter; m: RegExpExecArray }>;
  for (const { el, m } of cellules) {
    el.groupe = norm(`case ${m[1]} ${m[2]}`);
    if (!el.contexte.replace(/\[À COMPLÉTER\]|\[CHAMP_\d+\]|[\s.:;…-]/g, '')) el.contexte = `${m[1]} — ${m[2].split(' — ').pop()} : [À COMPLÉTER]`;
  }
  const marques = (t: string): Set<string> => {
    const n = ` ${norm(t)} `;
    const out = new Set<string>();
    if (/ dirigeant| gerant| agrement /.test(n)) out.add('dirigeant');
    if (/ entreprise| societe| global security services | gss /.test(n)) out.add('entreprise');
    if (/ dates? d obtention| dates? de delivrance| delivrance et /.test(n)) out.add('obtention');
    if (/ fin de validite| dates? d expiration| echeance/.test(n)) out.add('fin');
    return out;
  };
  for (const el of elements) {
    if (CASE.test(el.question) || el.statut !== 'ouvert') continue;
    const q = marques(el.question);
    const liees = cellules.filter(({ el: c, m }) => {
      if (c.groupe?.startsWith('tableau du champ') || c.statut !== 'ouvert') return false;
      const l = marques(m[1]), col = marques(m[2].split(' — ').pop() || m[2]);
      return l.size > 0 && col.size > 0 && [...l, ...col].every((x) => q.has(x));
    }).map((x) => x.el);
    if (!liees.length) continue;
    el.groupe = norm(el.question);
    for (const c of liees) { c.question = el.question; c.groupe = el.groupe; }
  }
  regrouperQuestions(elements);
}

/**
 * Adapte une même information à plusieurs phrases (emplacements d'un même groupe) : pour chacune, le
 * fragment exact qui remplace « [À COMPLÉTER] » en gardant la phrase correcte.
 */
async function fragmentsPourPhrases(info: string, cibles: ElementACompleter[]): Promise<Array<{ cle: string; valeur: string }>> {
  if (!cibles.length) return [];
  const r = await json(
    `Une information a été fournie pour compléter un mémoire technique. Pour chaque phrase, donne le fragment exact qui remplace « [À COMPLÉTER] » afin que la phrase reste grammaticalement correcte et naturelle. N'utilise QUE l'information fournie, sans rien ajouter. Chaque phrase attend une donnée précise (voir « donnée attendue » et la phrase elle-même : date d'obtention ou date de fin de validité, dirigeant ou entreprise…) : si l'information fournie ne contient pas CETTE donnée, ne renvoie rien pour cette phrase (jamais une autre donnée à sa place). Renvoie {"remplissages": [{"cle": "...", "valeur": "..."}]}.`,
    `Information fournie : ${info}\n\n${cibles.map((c) => `- ${c.cle} | donnée attendue : ${c.question} | phrase : ${c.contexte}`).join('\n')}`,
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

/**
 * Valeur saisie sans l'unité que le texte du document écrit déjà juste après l'emplacement (T6N-6 : « 15 200 000 € » devant
 * « € » → « 15 200 000 », jamais « 15 200 000 € € ») : euros (€, euro(s), EUR), HT, TTC, %, heures, minutes, jours.
 */
export function sansUniteRedite(valeur: string, suite: string): string {
  const famille = (u: string): string => {
    const x = u.toLowerCase();
    if (/^(?:€|euros?|eur)$/.test(x)) return '€';
    if (/^(?:heures?|h)$/.test(x)) return 'h';
    if (/^(?:minutes?|min)$/.test(x)) return 'min';
    if (/^jours?$/.test(x)) return 'j';
    return x;
  };
  const UNITE = '€|euros?|EUR|HT|TTC|%|heures?|h|minutes?|min|jours?';
  const tete = new RegExp(`^[\\s\\u00a0\\u202f]*(${UNITE})(?![\\p{L}\\d])`, 'iu');
  const familles = new Set<string>();
  let reste = String(suite || '');
  for (let m = tete.exec(reste); m; m = tete.exec(reste)) { familles.add(famille(m[1])); reste = reste.slice(m[0].length); }
  if (!familles.size) return valeur;
  let v = String(valeur || '').replace(/[\s\u00a0\u202f]+$/, '');
  const queue = new RegExp(`(?:^|[\\s\\u00a0\\u202f]+|(?<=\\d))(${UNITE})\\.?$`, 'iu');
  for (let m = queue.exec(v); m && familles.has(famille(m[1])); m = queue.exec(v)) v = v.slice(0, m.index).replace(/[\s\u00a0\u202f]+$/, '');
  return v || valeur;
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
  // Texte qui suit l'emplacement dans le même paragraphe : l'unité qu'il écrit déjà n'est pas redite (T6N-6).
  let suite = '';
  let fin: any = null;
  for (let n = debut.nextSibling; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === 'bookmarkEnd' && n.getAttribute('w:id') === id) { fin = n; break; }
  for (let n = fin?.nextSibling; n && suite.length < 40; n = n.nextSibling) if (n.nodeType === 1) suite += elements(n, 't').map((t: any) => t.textContent || '').join('');
  valeur = sansUniteRedite(valeur, suite);
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
      // Crédit OpenAI épuisé (insufficient_quota, credit_balance_exhausted) : jamais réessayé, erreur explicite.
      if (creditEpuise(e)) throw new CreditOpenAIEpuise();
      const passagere = !e?.status || e.status === 429 || e.status >= 500;
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

/**
 * Effectifs de l'équipe dédiée écrits dans le texte (T10N-2) : « équipe de N agents titulaires » (la somme du tableau de
 * l'équipe dédiée quand il est entièrement chiffré) et « équipe suppléante de N ».
 */
export function effectifsDuTexte(sections: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const ids = Object.keys(sections);
  const avecTableau = ids.find((id) => lignesTableauEquipe(sections[id]).length);
  const lignes = avecTableau ? lignesTableauEquipe(sections[avecTableau]) : [];
  const phrase = ids.map((id) => /équipe (?:dédiée )?de (\d+) agents? titulaires?/i.exec(sections[id].replace(REPERE_RE, ''))).find((m) => m);
  if (lignes.length && lignes.every((l) => l.nombre !== null)) out.EFFECTIF_AGENTS = String(lignes.reduce((t, l) => t + (l.nombre || 0), 0));
  else if (phrase) out.EFFECTIF_AGENTS = phrase[1];
  const supp = ids.map((id) => /équipe suppléante de (\d+)/i.exec(sections[id])).find((m) => m);
  if (supp) out.NB_AGENTS_RENFORT = supp[1];
  return out;
}

/**
 * Schémas « spec » accordés au texte avant chaque recomposition (T10N-2 : saisie « 8 » ou « Mets 7 agents SSIAP 2 », texte et
 * tableau à jour, schéma « Une équipe dédiée… » resté à 9) : les valeurs gardées à la génération sont comparées aux
 * effectifs du texte ; un schéma qui écrit une valeur changée est publié de nouveau avec la nouvelle valeur et redessiné,
 * sans modèle. État écrit avant cette correction (valeurs non gardées) : le schéma dont le nombre ne figure plus dans le
 * texte est retiré, et reconstruit au rendu d'après le texte (jamais un ancien chiffre). Renvoie les rubriques redessinées.
 */
export async function accorderSchemasEffectifs(etat: EtatCompletion): Promise<string[]> {
  const lib = etat.libre;
  if (!lib?.plan || lib.court) return [];
  const { chargerMemoireType, variablesDuSchema, republierSchemaSpec } = await import('./memoire_type');
  let mt: any;
  try { mt = chargerMemoireType(); } catch { return []; }
  const texte = effectifsDuTexte(lib.sections);
  const avant = lib.variablesSchemas;
  const changes = Object.keys(texte).filter((k) => !avant || avant[k] !== texte[k]);
  if (!changes.length) return [];
  const touches: string[] = [];
  const valeurs = { ...(avant || {}), ...texte };
  const aRedessiner = lib.plan.rubriques.filter((r) => r.schema?.source === 'spec' && lib.schemas?.[`${r.id}#schema`] && variablesDuSchema(mt, r.id).some((v) => changes.includes(v)));
  if (!avant) {
    // Valeurs non gardées : le schéma n'est retiré que s'il contredit le texte (nombre du texte absent du schéma).
    for (const r of aRedessiner) {
      const svg = String(lib.schemas[`${r.id}#schema`] || '').replace(/<[^>]+>/g, ' ');
      if (Object.values(texte).every((n) => new RegExp(`(?<![\\d,.])${n}(?![\\d,.])`).test(svg))) continue;
      delete lib.schemas[`${r.id}#schema`];
      touches.push(r.id);
    }
    return touches;
  }
  const { dessinerSpecs } = await import('./schema_service');
  const indicateurs: Record<string, boolean> = { ...(lib.plan.indicateurs || {}) };
  for (const r of aRedessiner) {
    const spec = republierSchemaSpec(mt, r.id, valeurs, indicateurs);
    if (!spec?.gabarit || !spec.params) continue;
    const d = (await dessinerSpecs([{ id: r.id, gabarit: spec.gabarit, params: spec.params, source: lib.sections[r.id] || '', titre_section: r.titre }], 'page', lib.theme || RETOUR_ARRIERE)).get(r.id);
    if (d?.ok && d.svg) lib.schemas[`${r.id}#schema`] = d.svg;
    // Moteur indisponible : le schéma qui écrit l'ancien nombre est retiré (reconstruit au rendu d'après le texte).
    else delete lib.schemas[`${r.id}#schema`];
    touches.push(r.id);
  }
  lib.variablesSchemas = valeurs;
  if (touches.length) console.log(`[Completion] Schéma(s) accordé(s) aux effectifs du texte (${changes.map((k) => `${k} = ${texte[k]}`).join(', ')}) : ${touches.join(', ')}.`);
  return touches;
}

/** Recompose le PDF d'une réponse libre depuis l'état (schémas déjà construits réutilisés). */
export async function recomposerPdf(etat: EtatCompletion): Promise<string> {
  // Import différé : evite une dépendance circulaire avec le générateur.
  const { MemoireGenerator } = await import('./memoire_generator');
  const gen = new MemoireGenerator();
  // Schémas qui écrivent les effectifs accordés au texte (T10N-2).
  await accorderSchemasEffectifs(etat);
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
    articlesBloc1: etat.libre!.articlesBloc1,
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
  /** Réponses à la proposition de dimensionnement qui changent les effectifs : appliquées après, comme une modification. */
  const effectifs: Array<{ el: ElementACompleter; v: string }> = [];
  for (const { cle, valeur } of remplissages) {
    const el = etat.elements.find((e) => e.cle === cle);
    const v = String(valeur || '').trim();
    if (!el || !v) continue;
    // Proposition de dimensionnement (D5) : « je valide » la garde telle quelle ; une autre réponse change les effectifs
    // publipostés (phrase, tableau de l'équipe dédiée), jamais une phrase de plus collée ailleurs (deux chiffres).
    if (etat.mode === 'libre' && PROPOSITION_DIMENSIONNEMENT.test(el.question)) {
      if (!estValidation(v)) { effectifs.push({ el, v }); continue; }
    } else if (etat.mode === 'libre' && QUESTION_NOM_ACHETEUR.test(el.question)) {
      // Nom de l'acheteur (T6N-2) : traité comme la variable {{CLIENT}}, publipostée dans toutes les rubriques (article accordé,
      // pronoms et verbes), sur la page de garde et dans les pieds de page, puis recomposition ; jamais une ligne ajoutée.
      const { remplacerRepliClient } = await import('./memoire_type');
      const lib = etat.libre!;
      for (const id of Object.keys(lib.sections)) lib.sections[id] = remplacerRepliClient(lib.sections[id], v);
      lib.cover = { ...(lib.cover || {}), client: v.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim(), clientCourt: '' };
      for (const n of el.reperes || []) for (const id of Object.keys(lib.sections)) lib.sections[id] = lib.sections[id].split(REPERE(n)).join('');
    } else if (etat.mode === 'libre' && QUESTION_OBJET_MARCHE.test(el.question)) {
      // Objet du marché (T6N-2) : la page de garde, jamais une phrase ajoutée dans une rubrique.
      const lib = etat.libre!;
      lib.cover = { ...(lib.cover || {}), title: v.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim() };
    } else if (etat.mode === 'cadre') {
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
  if (!effectifs.length) return etat;
  return appliquerEffectifs(dossierId, effectifs, source);
}

/** Question du nom de l'acheteur (variable CLIENT du mémoire type, T6N-2). */
export const QUESTION_NOM_ACHETEUR = /quel est le nom exact de l['’]acheteur/i;
/** Question de l'objet du marché (variable OBJET_MARCHE du mémoire type, T6N-2). */
export const QUESTION_OBJET_MARCHE = /quel est l['’]objet du march[ée]/i;

/** Proposition de dimensionnement calculée à la génération (dimensionnement.ts, questionDimensionnement). */
export const PROPOSITION_DIMENSIONNEMENT = /^Proposition à valider\s*:\s*dimensionnement/i;
/** Réponse qui valide une proposition telle quelle. */
const VALIDATION = /^\s*(?:oui|ok|okay|d['’]accord|je valide|valid[ée]e?s?|c['’]est (?:bon|ok|validé)|confirm[ée]e?s?|je confirme|parfait|ça me va|cela me va)\b[\s.!]*$/i;
const DEBUT_VALIDATION = /^\s*(?:oui|ok|okay|d['’]accord|je valide|nous validons|on valide|valid[ée]e?s?|c['’]est (?:bon|ok|validé)|confirm[ée]e?s?|je confirme|nous confirmons|parfait|ça me va|cela me va)(?![\p{L}])/iu;
/**
 * Réponse qui valide la proposition sans rien changer (T9N-3 : « Je valide les effectifs proposés », exemple donné par le
 * premier message de l'assistant, n'était pas reconnu) : formule de validation, sans aucun chiffre, sans réserve ni
 * demande de changement (« mais », « sauf », « pas », « mets », « retire »…).
 */
export function estValidation(v: string): boolean {
  const t = String(v || '');
  if (VALIDATION.test(t)) return true;
  return DEBUT_VALIDATION.test(t) && !/\d/.test(t) && !/(?<![\p{L}])(?:mais|sauf|pas|ne|n['’]|non|plut[ôo]t|chang|modifi|remplac|retir|ajout|mets?|mettez|passe[rz]?|enl[èe]v|r[ée]dui|augment|diminu|corrig)/iu.test(t);
}

/** Profil de l'équipe dédiée nommé dans une saisie de GSS (« agents SSIAP 2 », « ADS », « maîtres-chiens », « chef d'équipe »). */
const PROFIL = String.raw`(?:agents?\s+)?(?:SSIAP\s*(?:[123]|I{1,3})(?![\wÀ-ÿ])|ADS(?![\wÀ-ÿ])|CQP(?:\s*APS)?|cynophiles?|rondiers?(?:\s+intervenants?)?)|agents?\s+de\s+s[ée]curit[ée](?:\s+incendie)?|agents?\s+cynophiles?|ma[îi]tres?[- ]chiens?|encadrants?|chefs?\s+d['’][ée]quipe(?:\s+(?:SSIAP\s*\d|de\s+s[ée]curit[ée]\s+incendie))?|chefs?\s+de\s+(?:poste|site|service)`;
/** Profil nommé après un effectif dans une saisie de GSS (« 7 agents SSIAP 2 », « 6 ADS », « 2 maîtres-chiens »). */
const PROFIL_SAISI = new RegExp(String.raw`(?<![\d,.])(\d+)\s+(${PROFIL})`, 'giu');
/** Profil nommé avant son effectif (T10N-3) : « SSIAP 1 : 4 », « SSIAP 1 = 4 », « passe les SSIAP 1 à 4 », « les SSIAP 1
 *  passent à 4 » ; et « 4 pour les SSIAP 1 ». Jamais un horaire (« à 4 h ») ni une durée. */
const PROFIL_AVANT = new RegExp(String.raw`(?:^|[^\p{L}\d])(${PROFIL})\s*(?::|=|→|(?:passe(?:nt)?\s+)?(?:[àa]|de\s+\d+\s+[àa]))\s*(\d+)(?![\d,.]|\s*(?:h(?![\p{L}])|heures?|min|%|€|ans?))`, 'giu');
const PROFIL_POUR = new RegExp(String.raw`(?<![\d,.])(\d+)\s+pour\s+(?:les?\s+|l['’])?(${PROFIL})`, 'giu');

/** Effectifs par profil donnés par GSS (« Mets 7 agents SSIAP 2 dans l'équipe dédiée » → [{nombre: 7, profil: « agents SSIAP 2 »}] ;
 *  « Passe les SSIAP 1 à 4 », « SSIAP 1 : 4 » → [{nombre: 4, profil: « SSIAP 1 »}]), dans l'ordre du message. */
export function lireEffectifsParProfil(v: string): Array<{ nombre: number; profil: string }> {
  const t = String(v || '');
  const out: Array<{ i: number; nombre: number; profil: string }> = [];
  const pris: Array<[number, number]> = [];
  const libre = (a: number, b: number) => !pris.some(([x, y]) => a < y && b > x);
  const ajouter = (i: number, fin: number, nombre: number, profil: string) => { if (!libre(i, fin)) return; pris.push([i, fin]); out.push({ i, nombre, profil: profil.replace(/\s+/g, ' ').trim() }); };
  for (const m of t.matchAll(PROFIL_POUR)) ajouter(m.index!, m.index! + m[0].length, Number(m[1]), m[2]);
  for (const m of t.matchAll(PROFIL_AVANT)) ajouter(m.index!, m.index! + m[0].length, Number(m[2]), m[1]);
  for (const m of t.matchAll(PROFIL_SAISI)) ajouter(m.index!, m.index! + m[0].length, Number(m[1]), m[2]);
  return out.sort((a, b) => a.i - b.i).map(({ nombre, profil }) => ({ nombre, profil }));
}

/** Le message nomme un profil de l'équipe dédiée (sans effectif lisible) : « les SSIAP 1 doivent être 4 ». */
const NOMME_PROFIL = new RegExp(String.raw`(?:^|[^\p{L}\d])(?:${PROFIL})`, 'iu');

/**
 * Effectifs par profil reportés sans modèle dans le tableau de l'équipe dédiée (T9N-3 : « Mets 7 agents SSIAP 2 dans
 * l'équipe dédiée » ne change que la ligne SSIAP 2) : chaque profil saisi doit correspondre à une seule ligne (même
 * catégorie de personnel, ou même qualification) ; le nombre de titulaires écrit dans les rubriques (« équipe de N agents
 * titulaires ») devient la somme du tableau. null si une saisie ne correspond à aucune ligne, ou à plusieurs.
 */
export function appliquerEffectifsParProfil(sections: Record<string, string>, saisies: Array<{ nombre: number; profil: string }>, ancien?: string): { sections: Record<string, string>; total: number; lignes: string[] } | null {
  if (!saisies.length) return null;
  const norm = (t: string) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const id = Object.keys(sections).find((k) => lignesTableauEquipe(sections[k]).length);
  if (!id) return null;
  const lignes = lignesTableauEquipe(sections[id]);
  if (lignes.some((l) => l.nombre === null)) return null;
  const brut = sections[id].split('\n');
  const touchees: string[] = [];
  // Singulier et pluriel confondus, apostrophes ' ou ’ (T1F-11 : « Mets 9 chefs d'équipe » face à la ligne « Chef d’équipe »).
  const singulier = (t: string) => norm(t).split(' ').map((w) => (w.length > 3 ? w.replace(/(?<=[a-z]{3})[sx]$/, '') : w)).join(' ');
  for (const s of saisies) {
    const profil = s.profil.replace(/^agents?\s+(?=SSIAP|ADS|CQP|cynophile|rondier)/i, '');
    const profilSingulier = profil.split(/\s+/).map((w) => (w.length > 3 ? w.replace(/(?<=[A-Za-zÀ-ÿ]{3})[sx]$/, '') : w)).join(' ');
    const cat = singulier(categorieDe(profilSingulier));
    const q = singulier(profil);
    let ok = lignes.filter((l) => singulier(l.categorie) === cat || singulier(l.qualification) === q || singulier(l.categorie) === q);
    // Profil saisi plus court que le libellé de la ligne (T6N-3 : « chef d'équipe » face à « Chef d'équipe de sécurité incendie »,
    // exemple proposé par l'assistant lui-même) : la seule ligne dont la catégorie commence par ce profil.
    if (!ok.length) ok = lignes.filter((l) => q.length >= 4 && `${singulier(l.categorie)} `.startsWith(`${q} `));
    if (ok.length !== 1) return null;
    const c = brut[ok[0].index].split('|');
    c[3] = ` ${s.nombre} `;
    brut[ok[0].index] = c.join('|');
    ok[0].nombre = s.nombre;
    touchees.push(`${ok[0].categorie}${ok[0].qualification ? ` · ${ok[0].qualification}` : ''}`);
  }
  const total = lignes.reduce((t, l) => t + (l.nombre || 0), 0);
  const out: Record<string, string> = { ...sections, [id]: brut.join('\n') };
  const rx = new RegExp(`(équipe (?:dédiée )?de )${ancien || '\\d+'}( agents?) (titulaires?)`, 'gi');
  for (const k of Object.keys(out)) out[k] = out[k].replace(rx, (_m, a: string) => `${a}${total} ${total > 1 ? 'agents titulaires' : 'agent titulaire'}`);
  return { sections: out, total, lignes: touchees };
}

/**
 * Effectifs donnés par GSS en réponse à la proposition de dimensionnement : total des titulaires, suppléants, et nombre
 * de détails par profil (« 8 agents titulaires, dont 6 agents de sécurité et 2 SSIAP 1, et 3 suppléants » : 2 détails).
 * Les niveaux de qualification (« SSIAP 1 ») ne sont jamais lus comme des effectifs.
 */
export function lireEffectifsSaisis(v: string): { titulaires?: number; suppleants?: number; details: number } {
  let t = ` ${String(v || '')} `.replace(/SSIAP\s*(?:[123]|I{1,3})(?![\wÀ-ÿ])/gi, 'SSIAP').replace(/H0\s*-?\s*B0/gi, '').replace(/\d+\s*(?:h|heures?|ETP)\b/gi, '');
  let suppleants: number | undefined, titulaires: number | undefined;
  const supp = /(\d+)\s*(?:agents?\s+)?suppl[ée]ants?/i.exec(t);
  if (supp) { suppleants = Number(supp[1]); t = t.replace(supp[0], ' '); }
  const tit = /(\d+)\s*(?:agents?\s+)?titulaires?/i.exec(t);
  if (tit) { titulaires = Number(tit[1]); t = t.replace(tit[0], ' '); }
  const restes = (t.match(/\d+/g) || []).map(Number);
  // « 7 agents SSIAP 2 », « SSIAP 1 : 4 » : un effectif par profil, jamais un total (T9N-3, T10N-3) ; un profil nommé sans le
  // mot « titulaires » non plus (« les SSIAP 1 doivent être 4 »).
  if (titulaires === undefined && restes.length === 1 && !lireEffectifsParProfil(v).length && !NOMME_PROFIL.test(v)) return { titulaires: restes[0], suppleants, details: 0 };
  return { titulaires, suppleants, details: restes.length };
}

/** Lignes du tableau de l'équipe dédiée (« Catégorie de personnel | Qualification | Nombre | Observations »). */
export function lignesTableauEquipe(texte: string): Array<{ index: number; categorie: string; qualification: string; nombre: number | null }> {
  const lignes = String(texte || '').split('\n');
  const out: Array<{ index: number; categorie: string; qualification: string; nombre: number | null }> = [];
  for (let i = 0; i < lignes.length; i++) {
    // Tableau de l'équipe dédiée seulement (colonne Observations) : jamais celui des ressources de GSS (même en-tête sans elle).
    if (!/^\s*\|\s*Cat[ée]gorie de personnel\s*\|[^\n]*\|\s*Nombre\s*\|\s*Observations\s*\|/i.test(lignes[i])) continue;
    for (let j = i + 1; j < lignes.length && /^\s*\|/.test(lignes[j]); j++) {
      const cellules = lignes[j].split('|').slice(1, -1).map((c) => c.trim());
      if (cellules.length < 3 || /^:?-{2,}:?$/.test(cellules[0])) continue;
      const brut = cellules[2].replace(REPERE_RE, '').trim();
      out.push({ index: j, categorie: cellules[0].replace(/\*\*/g, ''), qualification: cellules[1].replace(/\*\*/g, ''), nombre: /^\d+$/.test(brut) ? Number(brut) : null });
    }
  }
  return out;
}

/**
 * Tableau de l'équipe dédiée accordé au total de titulaires donné par GSS (T4N-6 : saisie de « 8 », phrase passée à 8,
 * tableau resté à 6 + 3 = 9). Une seule ligne : elle prend le total. Plusieurs lignes et un total seul : les effectifs
 * par profil deviennent « [À COMPLÉTER] » (avec leur repère), chacun demandé à GSS. Plusieurs lignes et des effectifs
 * détaillés qui ne font pas le total : incohérent (l'élément reste ouvert). Renvoie le texte, les cases à compléter et
 * la cohérence finale.
 */
export function accorderTableauEquipe(texte: string, total: number, totalSeul: boolean, repere: () => string): { texte: string; aCompleter: Array<{ categorie: string; qualification: string; repere: string }>; coherent: boolean } {
  const lignes = lignesTableauEquipe(texte);
  if (!lignes.length || lignes.some((l) => l.nombre === null)) return { texte, aCompleter: [], coherent: true };
  const somme = lignes.reduce((t, l) => t + (l.nombre || 0), 0);
  if (somme === total) return { texte, aCompleter: [], coherent: true };
  const brut = texte.split('\n');
  const remplacerNombre = (i: number, valeur: string) => {
    const c = brut[i].split('|');
    c[3] = ` ${valeur} `;
    brut[i] = c.join('|');
  };
  if (lignes.length === 1) { remplacerNombre(lignes[0].index, String(total)); return { texte: brut.join('\n'), aCompleter: [], coherent: true }; }
  if (!totalSeul) return { texte, aCompleter: [], coherent: false };
  const aCompleter = lignes.map((l) => {
    const r = repere();
    remplacerNombre(l.index, `[À COMPLÉTER]${r}`);
    return { categorie: l.categorie, qualification: l.qualification, repere: r };
  });
  return { texte: brut.join('\n'), aCompleter, coherent: true };
}

/**
 * Réponse de GSS à la proposition de dimensionnement qui change les effectifs (« 8 », « 8 titulaires et 3 suppléants ») :
 * les rubriques qui portent ces effectifs (phrase « équipe de N agents titulaires », tableau de l'équipe dédiée, équipe
 * suppléante) sont réécrites avec les effectifs de GSS, par l'assistant (action « modifier »), puis le PDF est
 * recomposé. L'élément n'est marqué complété que si les nombres de GSS figurent bien dans le texte ; sinon il reste
 * ouvert et l'assistant l'explique dans la conversation.
 */
async function appliquerEffectifs(dossierId: string, effectifs: Array<{ el: ElementACompleter; v: string }>, source: ElementACompleter['source']): Promise<EtatCompletion> {
  const { modifierRubriquesLibre } = await import('./assistant_memoire');
  let etat = lireEtat(dossierId)!;
  for (const { el, v } of effectifs) {
    const sections = etat.libre!.sections;
    const ancien = (/équipe dédiée de (\d+) agents? titulaires?/i.exec(el.question) || [])[1];
    // Effectifs par profil seulement (« Mets 7 agents SSIAP 2 dans l'équipe dédiée », T9N-3) : la ligne du profil change,
    // et le nombre de titulaires devient la somme du tableau, sans modèle ; jamais toutes les lignes en [À COMPLÉTER].
    const parProfilSaisi = lireEffectifsParProfil(v);
    const saisieBrute = lireEffectifsSaisis(v);
    if (parProfilSaisi.length && saisieBrute.titulaires === undefined && saisieBrute.suppleants === undefined) {
      const r = appliquerEffectifsParProfil(sections, parProfilSaisi, ancien);
      if (r) {
        etat.libre!.sections = r.sections;
        etat.fichier = await recomposerPdf(etat);
        const e = etat.elements.find((x) => x.cle === el.cle)!;
        e.statut = 'complete';
        e.valeur = v;
        e.source = source;
        e.completeLe = new Date().toISOString();
        (etat.conversation ||= []).push({ role: 'assistant', texte: `J'ai reporté vos effectifs dans le tableau de l'équipe dédiée (${parProfilSaisi.map((x, i) => `${x.nombre} pour « ${r.lignes[i]} »`).join(', ')}) : l'équipe dédiée compte désormais ${r.total} ${r.total > 1 ? 'agents titulaires' : 'agent titulaire'}.`, date: new Date().toISOString() });
        ecrireEtat(etat);
        continue;
      }
    }
    const PORTE = new RegExp(`(?:équipe (?:dédiée )?de ${ancien || '\\d+'} agents? titulaires?|équipe suppléante de \\d+|^\\|[^\\n]*\\|\\s*\\d+\\s*\\|[^\\n]*ETP)`, 'im');
    const ids = Object.keys(sections).filter((id) => PORTE.test(sections[id] || ''));
    if (!ids.length) continue;
    const consigne = `Réponse de GSS à la proposition de dimensionnement : « ${v} ». Remplace les effectifs proposés de l'équipe dédiée (nombre d'agents titulaires${ancien ? `, aujourd'hui ${ancien}` : ''}, effectifs par profil du tableau de l'équipe dédiée, équipe suppléante) par ceux que donne GSS. Le total des lignes du tableau égale le nombre de titulaires. Si GSS ne donne qu'un total et que le tableau a plusieurs profils, écris [À COMPLÉTER] dans les cellules d'effectif par profil. Ne change rien d'autre : aucun autre mot, aucune autre phrase.`;
    // État avant la réécriture : remis tel quel si le report n'est pas sûr (T1F-10), pour que le document corresponde
    // toujours au message envoyé à GSS (« Je n'ai pas pu reporter… »).
    const avant = JSON.parse(JSON.stringify({ libre: etat.libre, elements: etat.elements, conversation: etat.conversation || [] }));
    const r = await modifierRubriquesLibre(dossierId, ids.map((id) => ({ id, consigne })), `Effectifs de l'équipe dédiée : ${v}`, `Effectifs de l'équipe dédiée mis à jour d'après votre réponse (« ${v} »).`);
    etat = r.etat;
    const nombres: string[] = v.match(/\d+/g) || [];
    const texte = ids.map((id) => etat.libre!.sections[id] || '').join('\n');
    const ok = r.modifies.length > 0 && nombres.every((n) => new RegExp(`(?<![\\d,.])${n}(?![\\d,.])`).test(texte))
      && !(ancien && !nombres.includes(ancien) && new RegExp(`équipe (?:dédiée )?de ${ancien} agents? titulaires?`, 'i').test(texte));
    // Tableau de l'équipe dédiée accordé au total de GSS, sans modèle (T4N-6) : la somme des effectifs par profil égale
    // le nombre de titulaires ; un total seul pour plusieurs profils laisse chaque effectif à compléter, avec sa question.
    const saisie = lireEffectifsSaisis(v);
    let coherent = true;
    if (ok && saisie.titulaires) {
      let dernier = Math.max(0, ...etat.elements.flatMap((x) => x.reperes || []), ...Object.values(etat.libre!.sections).flatMap((t) => [...t.matchAll(REPERE_RE)].map((m) => Number(m[1]))));
      let nQ = Math.max(0, ...etat.elements.map((x) => Number((/^Q(\d+)$/.exec(x.cle) || [])[1]) || 0));
      let change = false;
      const parProfil: string[] = [];
      for (const id of Object.keys(etat.libre!.sections)) {
        const acc = accorderTableauEquipe(etat.libre!.sections[id], saisie.titulaires, saisie.details === 0, () => REPERE(++dernier));
        if (!acc.coherent) { coherent = false; continue; }
        if (acc.texte === etat.libre!.sections[id]) continue;
        etat.libre!.sections[id] = acc.texte;
        change = true;
        for (const c of acc.aCompleter) {
          const n = Number((/\d+/.exec(c.repere) || [])[0]);
          const libelle = `${c.categorie}${c.qualification ? ` · ${c.qualification}` : ''}`;
          parProfil.push(libelle);
          etat.elements.push({ cle: `Q${++nQ}`, question: `Combien d'agents « ${libelle} » compte l'équipe dédiée de ${saisie.titulaires} agents titulaires ?`, contexte: `Tableau de l'équipe dédiée — ligne « ${libelle} »`, statut: 'ouvert', reperes: [n], pourAcheteur: false });
        }
      }
      if (change) {
        etat.fichier = await recomposerPdf(etat);
        if (parProfil.length) (etat.conversation ||= []).push({ role: 'assistant', texte: `J'ai reporté ${saisie.titulaires} agents titulaires. Le tableau de l'équipe dédiée a plusieurs profils : indiquez l'effectif de chacun pour que le total fasse ${saisie.titulaires} (${parProfil.map((x) => `« ${x} »`).join(', ')}).`, date: new Date().toISOString() });
      }
    }
    const e = etat.elements.find((x) => x.cle === el.cle)!;
    if (ok && coherent) {
      e.statut = 'complete';
      e.valeur = v;
      e.source = source;
      e.completeLe = new Date().toISOString();
    } else {
      // Réécriture annulée : sections, schémas, éléments et conversation remis comme avant, document recomposé.
      const modifie = r.modifies.length > 0;
      etat.libre = avant.libre;
      etat.elements = avant.elements;
      etat.conversation = avant.conversation;
      if (modifie) etat.fichier = await recomposerPdf(etat);
      (etat.conversation ||= []).push({ role: 'assistant', texte: `Je n'ai pas pu reporter les effectifs « ${v} » dans le mémoire de façon sûre : le mémoire est resté tel qu'il était. Précisez-les dans l'assistant (par exemple « 8 agents titulaires, dont 6 agents de sécurité et 2 SSIAP 1, et 3 suppléants »).`, date: new Date().toISOString() });
    }
    ecrireEtat(etat);
  }
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
