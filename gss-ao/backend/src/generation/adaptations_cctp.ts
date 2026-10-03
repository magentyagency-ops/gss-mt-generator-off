// ════════════════════════════════════════════════════════════════════════════════════════
// PHRASES DE GSS ADAPTÉES AU CAHIER DES CHARGES DU CLIENT (décision D8, 2 octobre 2026, « A avec signalement »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Quand une étape du générateur modifie une phrase du texte de GSS (mémoire type) pour la mettre en accord avec le
// CCTP, le CCTP prime : la phrase adaptée reste dans le mémoire. Mais chaque phrase ainsi modifiée est signalée à GSS
// avant la remise (consultations et premier message de l'assistant, comme les propositions de réponse D5) : rubrique,
// phrase d'origine, phrase adaptée et exigence du CCTP citée. GSS la valide, la modifie ou rétablit sa phrase
// d'origine par l'assistant ; son choix est repris à la génération suivante du même dossier. Rien de ce signalement
// n'est écrit dans le mémoire remis à l'acheteur.
//
// Étapes suivies (celles qui modifient après coup une phrase de GSS sans contrôle de fidélité à 90 %) :
//  • « Cohérence avec le CCTP » (corrigerContradictions) : exigence citée par le contrôle ;
//  • « Horaires du CCTP » (verifierHoraires) : horaire du CCTP cité par le contrôle ;
//  • délais normands retirés sur un marché hors Normandie ou à sites mixtes, au publipostage ({{#si !HORS_NORMANDIE}},
//    variables « normandie_seulement ») et par le filtre delaisHorsNormandie ;
//  • passages retirés au publipostage par une interdiction ou une exclusion du DCE (rondes imposées à pied, photos
//    interdites, télésurveillance hors marché) ;
//  • interdits explicites du DCE (interditsDce) : rondes « à pied », photographies interdites, qualifications exigées
//    de tous les agents (condition retirée).
//  • délais et fréquences imposés par le CCTP qui remplacent, au publipostage, la valeur de GSS (registre, réponses de GSS) :
//    « le rondier arrive sur site en 45 minutes » devient « en 30 minutes » (caen 475, T6C-3) ; la phrase d'origine est
//    celle de GSS avec sa valeur (en Normandie), l'exigence est la phrase du CCTP.
// Ne sont PAS signalés : les autres variables du publipostage (nom de l'acheteur, effectifs…), une valeur du CCTP égale à
// celle de GSS (« 1 heure » pour « 60 minutes »), le terme du CCTP (« chef de poste ») qui remplace celui de GSS (phrase
// conservée au sens de D7), et les règles propres à GSS (Covid, article L. 1224-1, orthographe des noms du DCE), qui ne
// viennent pas du CCTP. Un délai normand retiré hors Normandie est signalé avec son motif (règle de GSS), jamais présenté
// comme une exigence du CCTP (T6C-10).

import { motsDePhrase, similarite, normaliser, listeFr, preparerMemoireType, publierRubrique, dureesIntervention, variableRenseignee, phraseDelaiDuDce, phrasesDelaisDuDce, sujetDelaiDePhrase, sujetsDelaisDuGabarit, phraseDuDceContenant, VARIABLES_IMPOSABLES, SUJET_VARIABLE_DELAI, type MemoireType, type ContexteMarche } from './memoire_type';
import { sitesDuMarche, lieuDuMarche, communesParCodePostal, interditPhotosDce, RX_RONDES_A_PIED } from './base_memoires';

export type StatutAdaptation = 'a_valider' | 'validee' | 'modifiee' | 'retablie';

export interface PhraseAdaptee {
  /** Numéro montré à GSS (1, 2…), dans l'ordre du mémoire. */
  n: number;
  /** Rubrique (réponse libre, format court) ou réponse du cadre (clé GSS_CH_n). */
  rubrique: string;
  /** Titre de la rubrique ou intitulé de la question du cadre. */
  titre: string;
  /** Phrase de GSS avant l'adaptation. */
  origine: string;
  /** Phrase adaptée au CCTP ('' : phrase retirée). */
  adaptee: string;
  /** Exigence du CCTP qui justifie l'adaptation (citation). */
  exigence: string;
  /** Étape du générateur qui a adapté la phrase. */
  etape: string;
  /** Phrase retirée : phrases voisines (pour rétablir la phrase à sa place). */
  avant?: string;
  apres?: string;
  statut: StatutAdaptation;
  /** Phrase écrite par GSS (statut « modifiee »). */
  texteGss?: string;
  /** Texte présent dans le mémoire pour cette phrase depuis le choix de GSS (sinon la phrase adaptée). */
  actuelle?: string;
  decideLe?: string;
}

/** Changement d'une phrase entre deux versions d'un texte. */
export interface Changement {
  origine: string;
  adaptee: string;
  avant?: string;
  apres?: string;
}

// ─── Phrases d'un texte ─────────────────────────────────────────────────────────────────────

const MARQUES = /⟦AC:\d+⟧|\u0001\d+\u0001/g;
const LIGNE_ENTIERE = /^(?:#{1,6}\s|\||(?:[-*•]|\d+[.)])\s|\[CONSULTATION REQUISE)/;

/**
 * Unités comparées : chaque ligne de liste, de tableau ou de titre entière ; ailleurs, chaque phrase. Chaque unité est
 * un extrait exact du texte (pour le remplacer ou s'y ancrer).
 */
export function unites(texte: string): string[] {
  const out: string[] = [];
  for (const ligne of String(texte || '').split('\n')) {
    const l = ligne.trim();
    if (!l) continue;
    if (LIGNE_ENTIERE.test(l)) { out.push(l); continue; }
    for (const ph of l.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(⟦*[])/)) if (ph.trim()) out.push(ph.trim());
  }
  return out;
}

const cle = (u: string) => normaliser(String(u || '').replace(MARQUES, '').replace(/\*\*|__/g, '')).replace(/\s+/g, ' ').trim();
const mots = (u: string) => motsDePhrase(String(u || '').replace(MARQUES, ''));

/** Phrase lisible pour GSS : sans repère interne, sans Markdown, sans puce (ni puce de police Word, U+F0D8 : caen 475). */
export function phraseLisible(t: string, max = 420): string {
  const p = String(t || '').replace(/\[À COMPLÉTER\]⟦AC:\d+⟧/g, '[À COMPLÉTER]').replace(MARQUES, '').replace(/\[CONSULTATION REQUISE[^\]]*\]/g, '')
    .replace(/\*\*|__/g, '').replace(/[\uE000-\uF8FF]/g, ' ').replace(/^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '').replace(/\s+/g, ' ').trim();
  return p.length > max ? `${p.slice(0, max).replace(/\s+\S*$/, '')}…` : p;
}

/**
 * Phrase d'origine et phrase adaptée lisibles pour GSS, coupées de sorte que la différence se voie toujours (cstb 551,
 * T6N-4 : deux phrases de plus de 420 caractères qui ne diffèrent qu'à la fin s'affichaient identiques). Si la première
 * différence tombe au-delà de la coupe, les deux extraits commencent peu avant elle (« … » devant, coupe à un mot entier).
 */
export function pairesLisibles(origine: string, adaptee: string, max = 420): [string, string] {
  const o = phraseLisible(origine, Infinity), a = phraseLisible(adaptee, Infinity);
  if (!a || (o.length <= max && a.length <= max)) return [phraseLisible(origine, max), a ? phraseLisible(adaptee, max) : ''];
  let d = 0;
  while (d < o.length && d < a.length && o[d] === a[d]) d++;
  if (d <= max - 80) return [phraseLisible(origine, max), phraseLisible(adaptee, max)];
  const debut = Math.max(0, o.lastIndexOf(' ', Math.max(0, d - 160)) + 1);
  const extrait = (t: string) => { const x = t.slice(debut); return `${debut > 0 ? '… ' : ''}${x.length > max ? `${x.slice(0, max).replace(/\s+\S*$/, '')}…` : x}`; };
  return [extrait(o), extrait(a)];
}

/**
 * Changements de phrases entre deux versions d'un texte (plus longue sous-suite commune des unités) : phrase
 * remplacée (origine → adaptée) ou retirée (adaptée vide, avec ses voisines gardées). Les ajouts ne sont pas des
 * changements d'une phrase existante.
 */
export function changements(avant: string, apres: string): Changement[] {
  if (avant === apres) return [];
  const A = unites(avant), B = unites(apres);
  const ka = A.map(cle), kb = B.map(cle);
  const n = A.length, m = B.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Changement[] = [];
  let i = 0, j = 0;
  let derniere: string | undefined;
  while (i < n || j < m) {
    if (i < n && j < m && ka[i] === kb[j]) { derniere = B[j]; i++; j++; continue; }
    const vieux: string[] = [], neufs: string[] = [];
    while ((i < n || j < m) && !(i < n && j < m && ka[i] === kb[j])) {
      if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) vieux.push(A[i++]);
      else neufs.push(B[j++]);
    }
    const suivante = j < m ? B[j] : undefined;
    if (!vieux.length) continue;
    const pris = new Set<number>();
    for (const [k, v] of vieux.entries()) {
      let meilleur = -1, score = 0;
      neufs.forEach((x, q) => { if (pris.has(q)) return; const s = similarite(mots(v), mots(x)); if (s > score) { score = s; meilleur = q; } });
      // Une seule phrase de chaque côté : remplacement (« Le marché fixe des délais… » à la place du délai normand).
      if (meilleur >= 0 && (score >= 0.4 || (vieux.length === 1 && neufs.length === 1) || (k === 0 && neufs.length === 1))) {
        pris.add(meilleur);
        out.push({ origine: v, adaptee: neufs[meilleur] });
      } else {
        out.push({ origine: v, adaptee: '', avant: derniere, apres: suivante });
      }
    }
  }
  return out.filter((c) => cle(c.origine) !== cle(c.adaptee));
}

/** Unité de `texte` qui correspond à `phrase` (identique, sinon la plus ressemblante au-dessus du seuil). */
export function localiser(texte: string, phrase: string, seuil = 0.8): string | null {
  if (!phrase || !texte) return null;
  const k = cle(phrase);
  const m = mots(phrase);
  let meilleure: string | null = null, score = 0;
  for (const u of unites(texte)) {
    if (cle(u) === k) return u;
    const s = similarite(m, mots(u));
    if (s > score) { score = s; meilleure = u; }
  }
  return score >= seuil ? meilleure : null;
}

/** Écrit `cible` à la place de l'unité `loc`, avec sa puce s'il en avait une. */
function forme(loc: string, cible: string): string {
  const puce = (/^\s*(?:[-*•]|\d+[.)])\s+/.exec(loc) || [''])[0];
  const c = String(cible || '').trim();
  return puce && !/^\s*(?:[-*•]|\d+[.)])\s+/.test(c) ? `${puce}${c}` : c;
}

/**
 * Applique à `texte` le choix de GSS sur une phrase adaptée : `cible` remplace le texte actuel de la phrase (phrase
 * adaptée, ou dernier choix de GSS) ; une phrase retirée est remise à sa place (après sa voisine). `ok` faux si la
 * phrase n'est plus retrouvée dans le texte.
 */
export function appliquerChoix(texte: string, a: PhraseAdaptee, cible: string): { texte: string; ok: boolean } {
  const actuelle = a.actuelle ?? a.adaptee;
  if (actuelle) {
    const loc = localiser(texte, actuelle);
    if (!loc) return { texte, ok: false };
    const nouveau = cible.trim() ? forme(loc, cible) : '';
    if (cle(nouveau) === cle(loc)) return { texte, ok: true };
    if (nouveau) return { texte: texte.replace(loc, nouveau), ok: true };
    // Phrase retirée par GSS : la ligne disparaît si elle ne contenait que la phrase.
    return { texte: texte.split('\n').map((l) => (l.trim() === loc ? null : l.replace(loc, '').replace(/\s{2,}/g, ' '))).filter((l): l is string => l !== null).join('\n'), ok: true };
  }
  if (!cible.trim()) return { texte, ok: true };
  if (localiser(texte, cible, 0.95)) return { texte, ok: true };
  const ligne = LIGNE_ENTIERE.test(a.origine.trim());
  const av = a.avant ? localiser(texte, a.avant) : null;
  if (av) {
    if (ligne || LIGNE_ENTIERE.test(av)) {
      const lignes = texte.split('\n');
      const k = lignes.findIndex((l) => l.includes(av));
      lignes.splice(k + 1, 0, forme(ligne ? a.origine : '', cible));
      return { texte: lignes.join('\n'), ok: true };
    }
    return { texte: texte.replace(av, `${av} ${cible.trim()}`), ok: true };
  }
  const ap = a.apres ? localiser(texte, a.apres) : null;
  if (ap) {
    if (ligne || LIGNE_ENTIERE.test(ap)) {
      const lignes = texte.split('\n');
      const k = lignes.findIndex((l) => l.includes(ap));
      lignes.splice(k, 0, forme(ligne ? a.origine : '', cible));
      return { texte: lignes.join('\n'), ok: true };
    }
    return { texte: texte.replace(ap, `${cible.trim()} ${ap}`), ok: true };
  }
  return { texte: `${texte.trimEnd()}\n\n${cible.trim()}`, ok: true };
}

/** Texte voulu par GSS pour une phrase décidée (validée, modifiée, rétablie). */
export function texteDecide(a: Pick<PhraseAdaptee, 'statut' | 'origine' | 'adaptee' | 'texteGss'>): string {
  const t = a.statut === 'retablie' ? a.origine : a.statut === 'modifiee' ? (a.texteGss || '') : a.adaptee;
  return String(t || '').replace(MARQUES, '');
}

// ─── Exigences citées ───────────────────────────────────────────────────────────────────────

/** Phrases du DCE (pour citer une exigence). */
function phrasesDce(dce: string): string[] {
  return String(dce || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
    .split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/)
    .map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦−]\s*/, '').trim())
    .filter((x) => x.length >= 12);
}

/** Première phrase du DCE qui correspond à `rx`, citée (300 caractères au plus). */
export function citerDce(dce: string, rx: RegExp): string {
  const p = phrasesDce(dce).find((x) => rx.test(x)) || '';
  return p.length > 300 ? `${p.slice(0, 300).replace(/\s+\S*$/, '')}…` : p;
}

const DUREE = /\d+(?:[,.]\d+)?\s*(?:minutes?|min\b|heures?\b|h\b)|\bmoins de (?:deux|trois|une) heures?/i;
const PRESENCE = /interven|mobilis|rempla[cç]|astreinte|rondier|arriv|sur place|se rend|d[ée]plac|renfort|lev[ée]e de doute|service|absence|mise à disposition|mis à disposition|d[ée]lais?|urgen/i;

/**
 * Exigence citée pour un délai normand retiré d'un marché hors Normandie : le lieu d'exécution tel que le DCE l'écrit
 * (site hors Normandie), et pour un marché à sites mixtes la mention des sites concernés.
 */
export function exigenceHorsNormandie(dce: string, analyse: any): string {
  const sites = sitesDuMarche(analyse || {}, dce || '');
  const hors = sites.horsNormandie;
  // Adresse du site telle que le DCE l'écrit : la ligne du code postal et de la commune, avec la ligne de la voie qui la
  // précède (« 19, avenue de Maison Blanche / 93330 – Neuilly-sur-Marne »).
  let citation = '';
  const lignes = String(dce || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  for (const c of hors) {
    const commune = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- ]');
    const rx = new RegExp(`\\b\\d{5}\\b[^.\\n]{0,8}${commune}|${commune}[^.\\n]{0,20}\\(?\\b\\d{5}\\b`, 'i');
    const k = lignes.findIndex((l) => rx.test(l) && !/cedex|b\.?p\.?\s*\d|bo[îi]te postale/i.test(l));
    if (k < 0) continue;
    const l = lignes[k];
    const voie = /\b(?:rue|avenue|av\.|boulevard|bd|place|chemin|all[ée]e|route|quai|impasse|cours|square|parvis|esplanade|zone|za|zi)\b/i;
    const prec = k > 0 && voie.test(lignes[k - 1]) && !voie.test(l) ? `${lignes[k - 1]} ` : '';
    const m = rx.exec(l)!;
    // Ligne longue (phrase) : la phrase du DCE qui contient l'adresse ; sinon la ligne d'adresse.
    citation = l.length > 160 ? (citerDce(l, rx) || l.slice(Math.max(0, m.index - 80), m.index + m[0].length + 20)) : `${prec}${l}`;
    break;
  }
  // Aucun site hors Normandie reconnu (etampes1 : seule l'adresse de la mairie, « BP 109 / 91152 ETAMPES CEDEX ») : la
  // commune hors Normandie écrite avec son code postal dans le DCE, même dans une adresse postale (T6C-10).
  // (commune lue sur la ligne du code postal, jamais un pays : « Fontainebleau 77300 France », T8CS-2).
  const commune = hors.length ? '' : (() => {
    for (const c of communesParCodePostal(String(dce || ''))) {
      const dep = Number(c.code.slice(0, 2));
      if (dep < 1 || dep > 95 || [14, 27, 50, 61, 76].includes(dep)) continue;
      return c.commune;
    }
    return '';
  })();
  const de = (x: string) => (/^[aeiouyàâéèêëîïôöûüh]/i.test(x) ? `d'${x}` : `de ${x}`);
  // Communes nommées sans code postal (« Métropole de Lyon … Lyon 3e », T7-COH-2) ; lieu introuvable : dit tel quel.
  const lieuMarche = lieuDuMarche(analyse || {}, dce || '');
  const nommees = !hors.length && !commune ? lieuMarche.horsNormandie : [];
  const lieu = hors.length ? `${hors.length > 1 ? 'sites' : 'site'} ${de(listeFr(hors))}` : commune ? `marché ${de(commune)}` : nommees.length ? `marché ${de(listeFr(nommees))}` : 'site du marché';
  const motif = lieuMarche.statut === 'inconnu' && !hors.length && !commune
    ? "Lieu du site introuvable dans le DCE : les délais et les moyens de mobilisation que GSS annonce en Normandie ne sont pas promis tant que GSS n'a pas confirmé que le site est en Normandie, et le DCE ne les impose pas"
    : `${sites.mixte ? 'Marché en partie hors Normandie' : 'Marché hors Normandie'} (${lieu}) : les délais et les moyens de mobilisation que GSS annonce en Normandie ne sont pas promis ici, et le DCE ne les impose pas`;
  return citation ? `${motif}. Lieu d'exécution cité par le DCE : « ${citation.length > 220 ? `${citation.slice(0, 220).replace(/\s+\S*$/, '')}…` : citation} »` : `${motif}.`;
}

/**
 * Phrases du CCTP qui imposent des délais pour un sujet (T10C-2 : citedia impose 15 et 30 minutes pour les alarmes) : quand
 * un délai de GSS est retiré sur ce sujet, c'est l'exigence citée à GSS (D8), jamais « le DCE n'en impose aucun ». '' sinon.
 */
export function exigenceDelaisDuSujet(dce: string, sujet: string | null): string {
  if (!sujet) return '';
  return phrasesDelaisDuDce(dce, sujet as any).map((p) => (p.length > 300 ? `${p.slice(0, 300).replace(/\s+\S*$/, '')}…` : p)).join(' […] ');
}

/**
 * Exigence du DCE qui explique un changement fait par les filtres déterministes (délais hors Normandie, interdits du DCE).
 * '' quand le changement ne vient pas du CCTP (règles propres à GSS : Covid, article L. 1224-1, orthographe d'un nom,
 * terme du CCTP qui remplace celui de GSS) : il n'est pas signalé.
 */
export function exigenceDuFiltre(c: Changement, dce: string, horsNormandie: boolean, analyse?: any): string {
  const o = c.origine, a = c.adaptee;
  const perdu = (rx: RegExp) => rx.test(o) && !rx.test(a);
  // Terme du CCTP à la place de celui de GSS (« chef de poste »), seul changement : phrase conservée, non signalée.
  if (a && cle(o.replace(/\b([Cc]hef|[Rr]esponsable)(s?) de site\b/g, (_m, _f: string, s: string) => `chef${s} de poste`)) === cle(a)) return '';
  const d = String(dce || '').replace(/\s+/g, ' ');
  if (perdu(/vélo|trottinette|gyropode|en voiture|en véhicule|motoris/i) && RX_RONDES_A_PIED.test(d)) {
    return citerDce(dce, RX_RONDES_A_PIED);
  }
  // Interdit des photos ou des vidéos : la phrase entière du DCE, exception comprise (T10C-1).
  const ph = interditPhotosDce(dce);
  if (ph && perdu(ph.photos ? /\bphotos?\b|photographi(?!e d.identité)|\bvidéos?\b/i : /(?<![a-zà-ÿ])vidéos?(?![a-zà-ÿ])/i)) return ph.citation;
  if (perdu(/lorsqu['’](?:elle|il)s? (?:est|sont) (?:requise?s?|exigée?s?|nécessaires?)|lorsque (?:nécessaire|requis|cela est requis)|le cas échéant|si (?:nécessaire|requis|exigé|le poste l.exige)|selon (?:les |le )?(?:postes?|missions?(?: commandées)?|besoins?)|en fonction (?:des|du) (?:postes?|missions?)/i)) {
    const q = citerDce(dce, /(?:agents?|personnel|chaque prestation|chaque agent)[^.:]{0,140}?(?:doivent|devront|doit|devra)\s+(?:obligatoirement\s+)?(?:être\s+)?(?:détenteurs?|titulaires?|posséder|disposer)/i);
    if (q) return q;
  }
  // Délai d'intervention retiré ou remplacé par les délais du marché (delaisHorsNormandie) : seul changement de ce filtre
  // sur une phrase qui promet une présence dans un délai chiffré.
  if (horsNormandie && DUREE.test(o) && PRESENCE.test(o)) return exigenceDelaisDuSujet(dce, sujetDelaiDePhrase(o)) || exigenceHorsNormandie(dce, analyse);
  return '';
}

// ─── Suivi des adaptations d'une génération ────────────────────────────────────────────────

interface Note extends Changement {
  rubrique: string;
  exigence: string;
  etape: string;
  /** Adaptation du publipostage (rubrique du mémoire type) : retrouvée dans les textes qui reprennent la rubrique. */
  publipostage?: boolean;
}

/**
 * Suivi, pendant une génération, des phrases de GSS adaptées au CCTP. `reference` : textes de GSS (mémoire type
 * publiposté) ; seule une phrase qui en vient est signalée (jamais un engagement, une proposition ou le bloc 1, rédigés
 * par l'IA). `decisions` : choix de GSS de la génération précédente du dossier (repris tels quels).
 */
export class SuiviAdaptations {
  private notes: Note[] = [];
  private reference: string[][] = [];
  private decisions: PhraseAdaptee[];

  constructor(o: { reference?: string[]; decisions?: PhraseAdaptee[] } = {}) {
    for (const t of o.reference || []) for (const u of unites(t)) if (!/^#|^\[CONSULTATION/.test(u)) { const m = mots(u); if (m.length >= 3) this.reference.push(m); }
    this.decisions = (o.decisions || []).filter((d) => d && d.statut && d.statut !== 'a_valider');
  }

  /** Vrai si la phrase vient du texte de GSS (ressemblance de 80 % au moins avec une phrase du mémoire type publiposté). */
  estDeGss(phrase: string): boolean {
    if (!this.reference.length) return true;
    if (/^\s*#/.test(phrase)) return false;
    const m = mots(phrase);
    if (m.length < 4) return false;
    const jeu = new Set(m);
    for (const r of this.reference) {
      let communs = 0;
      for (const w of r) if (jeu.has(w)) communs++;
      if (communs / Math.max(r.length, m.length) < 0.45) continue;
      if (similarite(r, m) >= 0.8) return true;
    }
    return false;
  }

  /**
   * Enregistre les phrases de GSS changées par une étape entre `avant` et `apres` (texte d'une rubrique). `exigence`
   * donne l'exigence du CCTP citée pour chaque changement ('' : changement non signalé).
   */
  noter(rubrique: string, avant: string, apres: string, exigence: string | ((c: Changement) => string), etape: string, publipostage = false): number {
    let n = 0;
    for (const c of changements(avant, apres)) {
      // Phrase déjà adaptée par une étape précédente, adaptée de nouveau : une seule adaptation, de la phrase de GSS à la
      // dernière version, avec les deux exigences.
      const prec = this.notes.find((x) => x.rubrique === rubrique && x.adaptee && cle(x.adaptee) === cle(c.origine));
      if (prec) {
        const e = String(typeof exigence === 'function' ? exigence(c) : exigence).replace(/\s+/g, ' ').trim() || exigenceProche(c.adaptee, [prec.exigence]);
        Object.assign(prec, { adaptee: c.adaptee, avant: c.avant, apres: c.apres, exigence: e && !prec.exigence.includes(e) ? `${prec.exigence} ; ${e}` : prec.exigence });
        n++;
        continue;
      }
      if (!publipostage && !this.estDeGss(c.origine)) continue;
      if (/^\s*#|^\s*\[CONSULTATION/.test(c.origine)) continue;
      const e = String(typeof exigence === 'function' ? exigence(c) : exigence).replace(/\s+/g, ' ').trim();
      if (!e) continue;
      this.notes.push({ ...c, rubrique, exigence: e, etape, publipostage });
      n++;
    }
    return n;
  }

  /** Filtres déterministes (délais hors Normandie, interdits du DCE) appliqués à une rubrique. */
  noterFiltres(rubrique: string, avant: string, apres: string, dce: string, horsNormandie: boolean, analyse?: any): number {
    return this.noter(rubrique, avant, apres, (c) => exigenceDuFiltre(c, dce, horsNormandie, analyse), horsNormandie ? 'Délais hors Normandie et interdits du CCTP' : 'Interdits du CCTP');
  }

  /**
   * Cohérence avec le CCTP : l'exigence citée par le contrôle ; à défaut, l'exigence de la liste la plus proche de la
   * phrase adaptée.
   */
  noterCoherence(rubrique: string, avant: string, apres: string, exigence: string, exigences: string[], etape = 'Cohérence avec le CCTP'): number {
    return this.noter(rubrique, avant, apres, (c) => exigence || exigenceProche(c.adaptee || c.origine, exigences), etape);
  }

  /** Adaptations du publipostage (délais normands retirés hors Normandie), par rubrique du mémoire type. */
  noterPubliposte(liste: Array<{ rubrique: string; avant: string; apres: string; exigence: string; etape: string }>): void {
    for (const x of liste) this.noter(x.rubrique, x.avant, x.apres, x.exigence, x.etape, true);
  }

  get nombreNotes(): number { return this.notes.length; }

  /** Exigences du CCTP citées par les phrases de GSS adaptées jusqu'ici (T7CS-7 : pas de question sur une exigence déjà traitée). */
  exigencesNotees(): string[] { return this.notes.map((x) => x.exigence).filter(Boolean); }

  /**
   * Fin de génération : chaque phrase adaptée est retrouvée dans le texte final (texte exact, pour que l'assistant la
   * remplace) ; celles dont le passage a disparu sont oubliées. Les choix de GSS de la génération précédente sont
   * appliqués au texte (`sections` est modifié) et reportés. `correspondance` : rubriques du mémoire type reprises par
   * chaque texte final (format court : parties du RC ; cadre : réponses GSS_CH_n).
   */
  finaliser(sections: Record<string, string>, titreDe: (id: string) => string, correspondance: Record<string, string[]> = {}, formeOrigine: (t: string) => string = (t) => t): PhraseAdaptee[] {
    const ordre = Object.keys(sections);
    const cibles = (r: string) => [...new Set([...(sections[r] !== undefined ? [r] : []), ...ordre.filter((k) => (correspondance[k] || []).includes(r))])];
    const liste: PhraseAdaptee[] = [];
    const vus = new Set<string>();
    for (const note of this.notes) {
      for (const k of cibles(note.rubrique)) {
        const texte = sections[k] || '';
        if (!texte.trim()) continue;
        const id = `${k}|${cle(note.origine)}`;
        if (vus.has(id)) continue;
        let adaptee = '', avant: string | undefined, apres: string | undefined;
        if (note.adaptee) {
          const loc = localiser(texte, note.adaptee);
          if (!loc) continue;
          // Phrase de GSS de nouveau présente telle quelle (rétablie par une autre étape) : plus d'adaptation.
          if (localiser(texte, note.origine, 0.97) && cle(note.origine) !== cle(loc)) continue;
          adaptee = loc;
          // Même phrase finale adaptée par deux étapes (publipostage, puis cohérence) : une seule phrase signalée, avec
          // la phrase d'origine de GSS et les deux exigences.
          const deja = liste.find((x) => x.rubrique === k && x.adaptee && cle(x.adaptee) === cle(loc));
          if (deja) {
            if (!deja.exigence.includes(note.exigence)) deja.exigence = `${deja.exigence} ; ${note.exigence}`;
            vus.add(id);
            continue;
          }
        } else {
          if (localiser(texte, note.origine, 0.9)) continue;
          avant = note.avant ? localiser(texte, note.avant) || undefined : undefined;
          apres = note.apres ? localiser(texte, note.apres) || undefined : undefined;
          // Passage repris ailleurs (cadre, format court) : la phrase retirée n'est signalée que là où ses voisines sont.
          if ((note.avant || note.apres) && !avant && !apres) continue;
          if (!note.avant && !note.apres && note.publipostage && k !== note.rubrique) continue;
        }
        vus.add(id);
        // Phrase d'origine dans la forme du texte remis (cadre .docx : « • Préparation : … », jamais « - **Préparation** : »,
        // T7N-2) : c'est elle que « Rétablis ma phrase d'origine » écrit.
        liste.push({ n: 0, rubrique: k, titre: titreDe(k) || k, origine: formeOrigine(note.origine), adaptee, exigence: note.exigence, etape: note.etape, ...(avant ? { avant } : {}), ...(apres ? { apres } : {}), statut: 'a_valider' });
      }
    }
    // Choix de GSS de la génération précédente : appliqués au texte, la phrase n'est plus à valider.
    const reportes: PhraseAdaptee[] = [];
    for (const d of this.decisions) {
      const memeOrigine = (x: PhraseAdaptee) => x.rubrique === d.rubrique && (cle(x.origine) === cle(d.origine) || similarite(mots(x.origine), mots(d.origine)) >= 0.9);
      const x = liste.find((y) => memeOrigine(y) && y.statut === 'a_valider');
      const cible = texteDecide(d);
      if (x) {
        const r = appliquerChoix(sections[x.rubrique] || '', x, cible);
        if (r.ok) {
          sections[x.rubrique] = r.texte;
          Object.assign(x, { statut: d.statut, texteGss: d.texteGss, decideLe: d.decideLe, actuelle: cible ? localiser(r.texte, cible) || cible : '' });
          continue;
        }
      }
      // Phrase non adaptée cette fois (étape du modèle qui varie) : la phrase de GSS est là, le choix validé ou modifié
      // la remplace ; une phrase rétablie l'est déjà.
      const texte = sections[d.rubrique];
      if (texte === undefined || liste.some(memeOrigine)) continue;
      if (d.statut !== 'retablie' && cible && !localiser(texte, cible, 0.95)) {
        const loc = localiser(texte, d.origine, 0.9);
        if (loc) sections[d.rubrique] = texte.replace(loc, forme(loc, cible));
      }
      reportes.push({ ...d, n: 0, titre: titreDe(d.rubrique) || d.titre, actuelle: cible ? localiser(sections[d.rubrique], cible) || undefined : '' });
    }
    const tous = [...liste, ...reportes];
    tous.sort((a, b) => ordre.indexOf(a.rubrique) - ordre.indexOf(b.rubrique));
    tous.forEach((a, i) => { a.n = i + 1; });
    return tous;
  }
}

/**
 * Phrase du DCE, citée mot pour mot, qui fonde une phrase ajoutée par l'adaptation sur un délai (caen 475, T6C-2 : « le
 * personnel de remplacement est dépêché sur le site dans l'heure » → « … dépêcher sur le site le personnel de remplacement
 * dans les UNE (1) heure suivant la constatation ») : la phrase du DCE la plus proche parmi celles qui écrivent un délai ;
 * '' si aucune n'est assez proche (la justification du modèle n'est jamais citée comme exigence).
 */
export function phraseDuDceProche(phrase: string, dce: string): string {
  const p = exigenceProche(phrase, phrasesDce(dce).filter((x) => dureesIntervention(x).length > 0));
  return p ? phraseLisible(p, 420) : '';
}

/** Exigence de la liste la plus proche d'une phrase (mots en commun). */
export function exigenceProche(phrase: string, exigences: string[]): string {
  const m = new Set(mots(phrase).filter((w) => w.length >= 4));
  let meilleure = '', score = 0;
  for (const e of exigences) {
    const me = mots(e).filter((w) => w.length >= 4);
    const s = me.filter((w) => m.has(w)).length / Math.max(4, me.length);
    if (s > score) { score = s; meilleure = e; }
  }
  return score >= 0.2 ? meilleure : '';
}

// ─── Publipostage : passages du texte de GSS retirés par une contrainte du CCTP ─────────────────

/**
 * Indicateurs du mémoire type qui retirent ou changent un passage du texte de GSS parce que le DCE l'impose : marché hors
 * Normandie ou à sites mixtes (délais normands), rondes imposées à pied, photos interdites, télésurveillance hors marché.
 */
export const CONTRAINTES_CCTP: Record<string, string> = {
  HORS_NORMANDIE: 'Délais normands retirés (marché hors Normandie)',
  RONDES_A_PIED: 'Rondes imposées à pied par le CCTP',
  PHOTOS_INTERDITES: 'Photos interdites par le CCTP',
  TELESURVEILLANCE_HORS_MARCHE: 'Télésurveillance hors du marché (CCTP)',
};

/**
 * Passages du texte de GSS retirés ou changés au publipostage par une contrainte du CCTP : chaque rubrique est publipostée
 * comme si la contrainte n'existait pas (marché normand, rondes libres…), puis comparée au texte publiposté pour ce
 * marché ; une contrainte à la fois, avec l'exigence du DCE qui la déclenche. Aucun appel au modèle. Les valeurs imposées
 * par le CCTP (variables prévues par le mémoire type) ne sont pas comparées.
 */
export function adaptationsDuPubliposte(mt: MemoireType, ctx: ContexteMarche, ids: string[], options: { marquerConsultations?: boolean } = {}): Array<{ rubrique: string; avant: string; apres: string; exigence: string; etape: string; reference: string }> {
  const base: ContexteMarche = { ...ctx, imposees: undefined };
  const reel = preparerMemoireType(base, { memoireType: mt });
  const actives = Object.keys(CONTRAINTES_CCTP).filter((k) => reel.indicateurs[k] && mt.indicateurs[k]);
  const out: Array<{ rubrique: string; avant: string; apres: string; exigence: string; etape: string; reference: string }> = [];
  for (const k of actives) {
    const sans = preparerMemoireType({ ...base, ...(k === 'HORS_NORMANDIE' ? { horsNormandie: false } : {}), choix: { ...(base.choix || {}), indicateurs: { ...(base.choix?.indicateurs || {}), [k]: false } } }, { memoireType: mt });
    const def = mt.indicateurs[k];
    const exigenceCommune = k === 'HORS_NORMANDIE' ? exigenceHorsNormandie(ctx.dce || '', ctx.analyse)
      : k === 'PHOTOS_INTERDITES' ? interditPhotosDce(ctx.dce || '')?.citation || def.description
      : (def.dce ? citerDce(ctx.dce || '', new RegExp(def.dce, 'i')) : '') || (reel.etatsIndicateurs[k]?.raisons || []).find((r) => /^DCE/.test(r)) || def.description;
    for (const id of ids) {
      const r = mt.rubriques.find((x) => x.id === id);
      if (!r || r.mode === 'besoin' || !r.texte) continue;
      const a = publierRubrique(mt, r, sans.variables, sans.indicateurs, '', options).texte || '';
      const b = publierRubrique(mt, r, reel.variables, reel.indicateurs, '', options).texte || '';
      // Délai de la rubrique que le CCTP fixe lui-même (plusieurs délais selon le cas, T10C-2) : ses phrases sont l'exigence.
      const exigence = (k === 'HORS_NORMANDIE' && sujetsDelaisDuGabarit(r.texte).map((x) => exigenceDelaisDuSujet(ctx.dce || '', x)).filter(Boolean).join(' […] ')) || exigenceCommune;
      if (a !== b) out.push({ rubrique: id, avant: a, apres: b, exigence, etape: CONTRAINTES_CCTP[k], reference: a });
    }
  }
  return out;
}

/** Étape des délais et fréquences imposés par le CCTP au publipostage (D8, T6C-3). */
export const ETAPE_VALEUR_IMPOSEE = 'Délai ou fréquence imposé par le CCTP';

/**
 * Délais et fréquences du CCTP qui remplacent, au publipostage, la valeur de GSS (caen 475, T6C-3 : « Le rondier arrive sur
 * site en 45 minutes au maximum », délai confirmé par GSS le 1er octobre 2026, imprimé « en 30 minutes ») : chaque rubrique
 * est publipostée avec la valeur de GSS (registre, réponses de GSS ; en Normandie) à la place de celle du CCTP, une
 * variable à la fois, puis comparée au texte publiposté pour ce marché. L'exigence est la phrase du CCTP. Une valeur du
 * CCTP de même durée que celle de GSS (« 1 heure » pour « 60 minutes ») n'est pas une adaptation. Sur un marché hors
 * Normandie, la phrase d'origine est celle que GSS écrit en Normandie (GSS n'a annoncé aucun délai hors Normandie) : la
 * valeur du CCTP reste, mais elle est signalée. Aucun appel au modèle ; rien n'est imprimé de plus dans le mémoire.
 */
export function adaptationsDesValeursImposees(mt: MemoireType, ctx: ContexteMarche, ids: string[], options: { marquerConsultations?: boolean } = {}): Array<{ rubrique: string; avant: string; apres: string; exigence: string; etape: string; reference: string }> {
  const reel = preparerMemoireType(ctx, { memoireType: mt });
  const gss = preparerMemoireType({ ...ctx, imposees: undefined, delaisDuDce: false, horsNormandie: false, choix: { ...(ctx.choix || {}), indicateurs: { ...(ctx.choix?.indicateurs || {}), HORS_NORMANDIE: false } } }, { memoireType: mt });
  const out: Array<{ rubrique: string; avant: string; apres: string; exigence: string; etape: string; reference: string }> = [];
  const texte = (v: unknown) => (Array.isArray(v) ? v.join(' ; ') : String(v ?? ''));
  for (const nom of VARIABLES_IMPOSABLES) {
    const r = reel.variables[nom];
    const source = String(r?.source || '');
    // Plusieurs délais imposés par le CCTP (T10C-2) : la phrase de GSS est imprimée sans son délai, signalée avec les
    // phrases du CCTP.
    const plusieurs = /^Le CCTP impose plusieurs délais/.test(String(r?.question || ''));
    if (!/imposé par le DCE/.test(source) && !plusieurs) continue;
    const g = gss.variables[nom];
    if (!variableRenseignee(g) || (!variableRenseignee(r) && !plusieurs)) continue;
    // Valeur « de GSS » elle-même lue dans le DCE (fréquence des réunions, cstb 551 : « chaque année » puis « une fois par
    // an ; … ») : pas une phrase de GSS, rien à signaler.
    if (/^(?:DCE$|délai imposé par le DCE|imposé par le DCE|déduit de la fréquence imposée)/.test(String(g.source || '').trim())) continue;
    const vr = texte(r.valeur), vg = texte(g.valeur);
    if (normaliser(vr) === normaliser(vg)) continue;
    const sujet = SUJET_VARIABLE_DELAI[nom];
    if (sujet !== undefined) {
      const dr = dureesIntervention(`en ${vr}`), dg = dureesIntervention(`en ${vg}`);
      if (dr.length && dg.length && Math.min(...dr) === Math.min(...dg) && Math.max(...dr) === Math.max(...dg)) continue;
    }
    const imposee = ctx.imposees?.[nom];
    const exigence = plusieurs && sujet ? exigenceDelaisDuSujet(ctx.dce || '', sujet)
      : imposee?.citation ? phraseDuDceContenant(ctx.dce || '', imposee.citation)
      : sujet ? phraseDelaiDuDce(ctx.dce || '', sujet as any) : '';
    if (!exigence) continue;
    const variables = { ...reel.variables, [nom]: g };
    // Contrôles inopinés déduits de la fréquence imposée du contrôle 2 : la valeur de GSS revient avec elle.
    if (nom === 'FREQ_CONTROLE_2' && /fréquence imposée/.test(String(reel.variables.CONTROLES_INOPINES_MENSUELS?.source || '')) && gss.variables.CONTROLES_INOPINES_MENSUELS) variables.CONTROLES_INOPINES_MENSUELS = gss.variables.CONTROLES_INOPINES_MENSUELS;
    for (const id of ids) {
      const rub = mt.rubriques.find((x) => x.id === id);
      if (!rub || rub.mode === 'besoin' || !rub.texte) continue;
      const a = publierRubrique(mt, rub, variables, reel.indicateurs, '', options).texte || '';
      const b = publierRubrique(mt, rub, reel.variables, reel.indicateurs, '', options).texte || '';
      if (a !== b) out.push({ rubrique: id, avant: a, apres: b, exigence, etape: ETAPE_VALEUR_IMPOSEE, reference: a });
    }
  }
  return out;
}

// ─── Messages à GSS ─────────────────────────────────────────────────────────────────────────

export const TITRE_ADAPTATIONS = 'Phrases adaptées au cahier des charges du client';

/** Phrases encore à valider par GSS. */
export const aValider = (liste: PhraseAdaptee[] | undefined) => (liste || []).filter((a) => a.statut === 'a_valider');

/**
 * Motif qui n'est pas une exigence du CCTP mais une règle de GSS (délais normands non promis hors Normandie,
 * exigenceHorsNormandie) : montré à GSS comme « Motif (règle de GSS) », jamais comme une citation du CCTP (T6C-10).
 */
export const estRegleGss = (exigence: string) => /^Marché (?:en partie )?hors Normandie \(/.test(String(exigence || '').trim());
/** Exigence d'une phrase adaptée, avec son libellé : « exigence du CCTP : « … » » ou « motif (règle de GSS) : … ». */
const libelleExigence = (a: PhraseAdaptee, max: number, majuscule = false) => (estRegleGss(a.exigence)
  ? `${majuscule ? 'M' : 'm'}otif (règle de GSS, pas une exigence du CCTP) : ${phraseLisible(a.exigence, max).replace(/[.\s]+$/, '')}`
  : `${majuscule ? 'E' : 'e'}xigence du CCTP : « ${phraseLisible(a.exigence, max)} »`);

/** Lignes des consultations (une par phrase adaptée à valider) ; aucune s'il n'y en a pas. */
export function consultationsAdaptations(liste: PhraseAdaptee[] | undefined): string[] {
  const l = aValider(liste);
  return l.map((a) => { const [o, ad] = pairesLisibles(a.origine, a.adaptee); return `${TITRE_ADAPTATIONS} (${l.length}) — n° ${a.n}, « ${a.titre} » : phrase d'origine de GSS : « ${o} » ; phrase adaptée : ${a.adaptee ? `« ${ad} »` : '(phrase retirée)'} ; ${libelleExigence(a, 500)}. À valider, modifier ou rétablir via l'assistant avant la remise.`; });
}

/** Paragraphe du premier message de l'assistant ; '' s'il n'y a aucune phrase adaptée à valider. */
export function messageAdaptations(liste: PhraseAdaptee[] | undefined): string {
  const l = aValider(liste);
  if (!l.length) return '';
  return [
    `${TITRE_ADAPTATIONS} (${l.length}) : le cahier des charges prime sur votre texte, ${l.length === 1 ? 'cette phrase de votre mémoire type a été modifiée' : 'ces phrases de votre mémoire type ont été modifiées'} pour s'y conformer. À relire avant la remise :`,
    ...l.flatMap((a) => [
      `${a.n}. « ${a.titre} »`,
      `   - Phrase d'origine de GSS : « ${pairesLisibles(a.origine, a.adaptee)[0]} »`,
      `   - Phrase adaptée : ${a.adaptee ? `« ${pairesLisibles(a.origine, a.adaptee)[1]} »` : '(phrase retirée du mémoire)'}`,
      `   - ${libelleExigence(a, 500, true)}`,
    ]),
    '',
    l.length === 1 ? 'Pour cette phrase, vous pouvez :' : 'Pour chacune, vous pouvez :',
    '- valider la phrase adaptée : « Je valide la phrase adaptée n° … » ;',
    '- la modifier : « Pour la phrase adaptée n° …, écris : … » ;',
    '- rétablir votre phrase d\'origine : « Rétablis ma phrase d\'origine n° … ».',
  ].join('\n');
}

/** Bloc des phrases adaptées pour la consigne de l'assistant (numéro, statut, phrases, exigence). */
export function blocAdaptationsAssistant(liste: PhraseAdaptee[] | undefined): string {
  const l = liste || [];
  if (!l.length) return '';
  const statut = (a: PhraseAdaptee) => ({ a_valider: 'à valider', validee: 'validée', modifiee: 'modifiée par GSS', retablie: 'phrase d\'origine rétablie' }[a.statut]);
  return `\n\n${TITRE_ADAPTATIONS.toUpperCase()} (adaptées par le générateur ; le cahier des charges prime, GSS valide, modifie ou rétablit) :\n${l.map((a) => `- n° ${a.n} | ${a.titre} | ${statut(a)} | origine : « ${pairesLisibles(a.origine, a.adaptee, 300)[0]} » | adaptée : ${a.adaptee ? `« ${pairesLisibles(a.origine, a.adaptee, 300)[1]} »` : '(retirée)'}${a.statut === 'modifiee' ? ` | texte de GSS : « ${phraseLisible(a.texteGss || '', 300)} »` : ''} | ${estRegleGss(a.exigence) ? `motif (règle de GSS) : ${phraseLisible(a.exigence, 200)}` : `exigence : « ${phraseLisible(a.exigence, 200)} »`}`).join('\n')}`;
}

/** Consigne de l'action « adaptation » pour l'assistant (ajoutée quand des phrases adaptées existent). */
export const ACTION_ADAPTATION = `"adaptation" : l'utilisateur répond sur une PHRASE ADAPTÉE AU CAHIER DES CHARGES (liste numérotée ci-dessous) : {"type": "adaptation", "n": <numéro>, "choix": "valider" | "modifier" | "retablir", "texte": "…"}. « Je valide la phrase adaptée n° 2 » → "valider" (rien n'est réécrit) ; « rétablis ma phrase d'origine » → "retablir" ; « pour la phrase n° 1, écris … » ou toute correction de cette phrase → "modifier", avec "texte" = la phrase complète voulue par l'utilisateur (ses mots, sans rien inventer). Une phrase adaptée se traite uniquement par cette action, jamais par "modifier" sur la rubrique entière.`;

/**
 * Choix de GSS sur une phrase adaptée, appliqué à `texte` (texte de la rubrique ou de la réponse). Renvoie le nouveau
 * texte, et met à jour la phrase (statut, texte de GSS, date). `ok` faux : phrase introuvable ou choix invalide.
 */
export function deciderAdaptation(texte: string, a: PhraseAdaptee, choix: string, texteGss = ''): { texte: string; ok: boolean; change: boolean; message: string } {
  const c = String(choix || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const statut: StatutAdaptation | null = /^valid/.test(c) ? 'validee' : /^modif|^corrig|^rempla/.test(c) ? 'modifiee' : /^retabl|^restaur|^origine/.test(c) ? 'retablie' : null;
  if (!statut) return { texte, ok: false, change: false, message: `Choix non compris pour la phrase adaptée n° ${a.n}.` };
  if (statut === 'modifiee' && !String(texteGss || '').trim()) return { texte, ok: false, change: false, message: `Pour modifier la phrase adaptée n° ${a.n}, donnez-moi la phrase à écrire.` };
  const cible = texteDecide({ statut, origine: a.origine, adaptee: a.adaptee, texteGss });
  const r = appliquerChoix(texte, a, cible);
  if (!r.ok) return { texte, ok: false, change: false, message: `Je n'ai pas retrouvé la phrase adaptée n° ${a.n} dans « ${a.titre} » : elle a peut-être été réécrite depuis.` };
  a.statut = statut;
  a.texteGss = statut === 'modifiee' ? String(texteGss).trim() : undefined;
  a.decideLe = new Date().toISOString();
  a.actuelle = cible ? localiser(r.texte, cible) || cible.trim() : '';
  const change = r.texte !== texte;
  const message = statut === 'validee' ? `Phrase adaptée n° ${a.n} validée (« ${a.titre} »).`
    : statut === 'retablie' ? `Phrase d'origine de GSS rétablie pour la phrase n° ${a.n} (« ${a.titre} »).`
      : `Phrase n° ${a.n} remplacée par votre texte (« ${a.titre} »).`;
  return { texte: r.texte, ok: true, change, message };
}
