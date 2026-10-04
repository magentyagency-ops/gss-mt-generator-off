// ════════════════════════════════════════════════════════════════════════════════════════
// FORMAT COURT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION (ex. « mémoire technique de douze pages
// maximum structuré comme suit : … »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Quand le RC fixe un nombre de pages maximum ET un plan, le mémoire suit CE plan (une partie par
// point du RC, dans l'ordre) et tient dans la limite : rendu A4 compact (en-tête GSS sur la première
// page, pas de page de garde ni de sommaire séparés), quelques schémas GSS validés, nombre de pages
// mesuré sur le PDF produit. Si le texte dépasse, la police est réduite par paliers (lisibilité
// conservée), puis les schémas sont retirés ; le générateur condense le texte si cela ne suffit pas.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { themeActif, styleDuTheme, fontFaceTheme, familleTexte, policesDuTheme, contraste, LOGO_FOND_CLAIR, LOGO_BLANC } from './themes';
import { RX_NOMBRE_LETTRES, nombreFr } from './base_memoires';

/**
 * Nombre de pages écrit en chiffres ou en lettres (T1-GEN-1 : « dix pages », « vingt (20) pages », « 10 p. », « 10 feuilles
 * A4 », « 15 feuillets », « 10 faces ») ; groupe 1 : le nombre, groupe 2 : le chiffre entre parenthèses éventuel.
 */
const RX_PAGES = String.raw`\(?(?<![\p{L}\d])(\d{1,3}|${RX_NOMBRE_LETTRES})\)?\s*(?:\(\s*(\d{1,3})\s*\)\s*)?(?:pages?(?![\p{L}])|p\.(?=\s|$)|feuillets?(?![\p{L}])|feuilles?(?![\p{L}])|faces?(?![\p{L}]))`;
/** « Le nombre de pages du mémoire technique est limité à 10 » : forme inverse ; groupe 1 : le nombre. */
const RX_PAGES_INVERSE = String.raw`nombre\s+(?:maxim(?:al|um)\s+)?de\s+(?:pages|feuillets|feuilles|faces)[^.;]{0,90}?(?:limit[ée]e?|fix[ée]e?|plafonn[ée]e?|maxim\p{L}*|ne\s+(?:doit|peut|devra|pourra)\s+(?:pas\s+)?(?:d[ée]passer|exc[ée]der)|est\s+de)\s*(?:[àa]\s+)?(\d{1,3}|${RX_NOMBRE_LETTRES})(?![\p{L}\d])`;
const valeurNombre = (a?: string, b?: string): number => (b && /^\d+$/.test(b) ? Number(b) : nombreFr(String(a || '')));
/** Durée ou mention de forme qui n'est jamais une limite : « hors annexes », « annexes non comprises ». */
const HORS_ANNEXES = /hors\s+annexes?|annexes?\s+(?:non\s+comprises?|exclues?|en\s+sus|non\s+compt[ée]es?)|sans\s+(?:les\s+)?annexes?|(?:non\s+compris|en\s+dehors\s+des?)\s+(?:les\s+)?annexes?/gi;

export interface PartieCourte { id: string; title: string; attendu?: string }
export interface FormatImpose {
  pagesMax: number;
  plan: PartieCourte[];
  source: string;
  /** Limite fixée pour CHAQUE critère ou partie (« 5 pages par critère », T2-GEN-9) : contrôlée partie par partie au rendu. */
  pagesParPartie?: number;
}

/** Limite qui porte sur chaque critère, sous-critère ou partie, et non sur tout le mémoire (« 5 pages par critère », T2-GEN-9). */
export const RX_LIMITE_PAR_PARTIE = /^\s*(?:maximum\s+|au\s+maximum\s+|max\.?\s+|au\s+plus\s+)?(?:pour\s+chaque|par)\s+(?:crit[èe]re|sous[- ]crit[èe]re|partie|question|th[èe]me|chapitre|item|rubrique|point|sous[- ]partie)/i;

const MARP_ASSETS = path.resolve(__dirname, 'marp');
const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const LEXEND = path.join(MOTEUR, 'polices', 'Lexend.ttf');

/** Passages du DCE qui fixent un nombre de pages (repérage déterministe, avant toute analyse IA). */
export function passagesLimitePages(dce: string): string[] {
  // « 12 pages », « (12) pages », « vingt (20) pages », « 15 feuillets », « 10 faces » … accompagné, à
  // proximité, d'un terme de limite (maximum, limité, ne pas dépasser, au plus…).
  const re = new RegExp(`${RX_PAGES}|${RX_PAGES_INVERSE}`, 'giu');
  const limite = /maxim|limit|d[ée]pass|exc[èé]d|au plus|plafon|n.exc[èé]d/i;
  const out: Array<{ pos: number; texte: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(dce)) && out.length < 8) {
    // Pagination d'une pièce (« Le présent CCTP comporte 9 pages numérotées de 1 à 9 », ifits, T9CS-2) : pas une limite,
    // sauf si la phrase dit une limite (« Le mémoire technique comporte 10 pages au maximum », T1-GEN-1).
    const avant = dce.slice(Math.max(0, m.index - 60), m.index);
    const phrase = dce.slice(Math.max(0, dce.lastIndexOf('.', m.index) + 1), (dce.indexOf('.', m.index + m[0].length) + 1 || dce.length));
    const pagination = (/\bcomporte(?:nt)?\s*$/i.test(avant) && (/pr[ée]sente?\b|\bce\s+document|\bcette\s+pi[èe]ce/i.test(avant) || /^\s+num[ée]rot/i.test(dce.slice(m.index + m[0].length, m.index + m[0].length + 14))))
      || /^\s+num[ée]rot/i.test(dce.slice(m.index + m[0].length, m.index + m[0].length + 14));
    if (pagination && !limite.test(phrase)) continue;
    // « Date limite de réception des offres », « heure limite », « délai limite de remise » : pas une limite de pages.
    const autour = dce.slice(Math.max(0, m.index - 90), m.index + m[0].length + 90)
      .replace(/(?:dates?|heures?|d[ée]lais?)\s+limites?|limites?\s+(?:de\s+|d['’]\s*)?(?:r[ée]ception|remise|d[ée]p[ôo]t|validit[ée]|ex[ée]cution)/gi, ' ');
    if (!limite.test(autour) || out.some((o) => Math.abs(o.pos - m!.index) < 800)) continue;
    out.push({ pos: m.index, texte: dce.slice(Math.max(0, m.index - 700), m.index + 1300) });
  }
  return out.map((o) => o.texte);
}

/**
 * Repli du repérage (T1-GEN-1) : aucun passage avec un nombre de pages lisible, mais le RC parle du contenu de l'offre
 * technique avec des pages ou une limite (« … ne devra pas excéder… », « pages ») : ces paragraphes sont donnés au modèle,
 * jamais « aucune limite » décidé sans lui.
 */
export function passagesContenuOffre(dce: string): string[] {
  const out: string[] = [];
  const t = String(dce || '');
  for (const m of t.matchAll(/m[ée]moire\s+(?:technique|justificatif)|offre\s+technique|note\s+m[ée]thodologique/gi)) {
    // Numéros de page des pieds de page (« Marché n°26R045 page 9/17 », « Page 1 sur 12 ») et « date / heure / délai
    // limite » ne parlent pas du nombre de pages du mémoire (T3-REG-1, T3N-7) : retirés avant le repérage.
    const zone = t.slice(Math.max(0, m.index! - 300), m.index! + 500)
      .replace(/\bpages?\s*(?:n[°o]\s*)?\d+\s*(?:\/|sur)\s*\d+/gi, ' ')
      .replace(/(?:dates?|heures?|d[ée]lais?)\s+(?:et\s+heures?\s+)?limites?|limites?\s+(?:de\s+|d['’]\s*)?(?:r[ée]ception|remise|d[ée]p[ôo]t|validit[ée]|ex[ée]cution)/gi, ' ');
    if (!/pages?|feuillets?|feuilles?|limit|n.exc[èé]d|ne\s+(?:doit|devra|pourra)\s+pas\s+(?:d[ée]passer|exc[èé]der)/i.test(zone)) continue;
    if (out.some((o) => o.includes(t.slice(m.index!, m.index! + 40)))) continue;
    out.push(t.slice(Math.max(0, m.index! - 700), m.index! + 1300));
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Phrase d'un passage qui contient le nombre de pages et le terme de limite (« Maximum 7 pages recto »), pour la citer à
 * GSS (T9CS-2 : jamais le début du passage de 2 000 caractères, en-tête d'une autre pièce compris). '' si aucune.
 */
export function phraseLimitePages(passage: string): string {
  const LIMITE = /maxim|limit|d[ée]pass|exc[èé]d|au plus|plafon|n.exc[èé]d/i;
  const phrases = String(passage || '').replace(/\s+/g, ' ').split(/(?<=[.;!?])\s+(?=[A-ZÀ-Ý•–—-])|\s+[–—•|]\s+/);
  const ph = phrases.find((x) => new RegExp(`${RX_PAGES}|${RX_PAGES_INVERSE}`, 'iu').test(x) && LIMITE.test(x.replace(/(?:dates?|heures?|d[ée]lais?)\s+limites?/gi, ' ')));
  return ph ? ph.replace(/^\s*[–—•-]\s*/, '').trim() : '';
}

/**
 * Limite de pages du MÉMOIRE TECHNIQUE lue sans modèle dans les passages du RC (T7CS-1 : rédaction indisponible, imm « un
 * mémoire technique (douze (12) pages maximum) ») : la phrase qui nomme le mémoire technique (ou offre technique, note
 * méthodologique, mémoire justificatif, réponse technique) avec un nombre de pages et un terme de limite. null si aucune
 * phrase ne le dit clairement, ou si la phrase porte aussi sur une autre pièce (CV, annexe, lettre).
 */
export function limitePagesMemoire(passages: string[]): { pages: number; citation: string } | null {
  const MEMOIRE = /m[ée]moire\s+(?:technique|justificatif|m[ée]thodologique)|offre\s+technique|note\s+m[ée]thodologique|r[ée]ponse\s+technique|proposition\s+technique/i;
  const LIMITE = /maxim|limit|d[ée]pass|exc[èé]d|au plus|plafon|n.exc[èé]d/i;
  const AUTRE = /\bCV\b|curriculum|annexe|lettre|fiche|attestation|bordereau|DPGF|BPU/i;
  for (const passage of passages) {
    // Phrases et éléments de liste (« – un mémoire technique (douze (12) pages maximum) … ») : jamais un pied de page collé.
    const phrases = String(passage || '').replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-ZÀ-Ý•–—-])|\s+[–—•]\s+/);
    for (const ph of phrases) {
      if (!MEMOIRE.test(ph) || !LIMITE.test(ph)) continue;
      const m = new RegExp(RX_PAGES, 'iu').exec(ph) || new RegExp(RX_PAGES_INVERSE, 'iu').exec(ph);
      if (!m) continue;
      const n = valeurNombre(m[1], m[2]);
      // Distance entre le mémoire et le nombre : même proposition (120 caractères au plus).
      const iMem = ph.search(MEMOIRE);
      // T2-COH-2 : une limite de plus de 40 pages est une vraie limite (un mémoire libre en fait 120 à 145) ; T2-GEN-9 : une
      // limite « par critère » n'est pas celle de tout le mémoire (le modèle la lit avec le plan, sinon alerte à GSS).
      if (!Number.isFinite(n) || n < 2 || n > 300 || Math.abs(m.index - iMem) > 120) continue;
      if (RX_LIMITE_PAR_PARTIE.test(ph.slice(m.index + m[0].length, m.index + m[0].length + 60))) continue;
      // « hors annexes », « annexes non comprises » : la limite porte bien sur le mémoire (T1-GEN-1) ; « renvoyer à des annexes
      // dans la limite de 10 pages » (rouen_univ) : la limite porte sur les annexes.
      const voisinage = ph.slice(Math.max(0, Math.min(iMem, m.index) - 40), Math.max(iMem, m.index) + m[0].length + 20).replace(HORS_ANNEXES, ' ');
      if (AUTRE.test(voisinage)) continue;
      return { pages: n, citation: ph.replace(/^\s*[–—•-]\s*/, '').trim().slice(0, 300) };
    }
  }
  return null;
}

/**
 * Format court : le texte de compréhension renvoie aux « blocs » du mémoire type (« développée au bloc 5 »), alors que le
 * mémoire suit les parties du RC. Chaque renvoi devient celui de la partie du RC qui reprend réellement les rubriques
 * du bloc (« dans la partie 2 « Continuité de service » ») ; un bloc dont aucune rubrique n'a été reprise, ou réparti
 * sur trop de parties, perd son renvoi (avec le participe qui l'introduit : « , développée au bloc 4 »).
 */
export function renvoisVersParties(
  texte: string,
  blocs: Array<{ numero: number; rubriques: string[] }>,
  parties: Array<{ id: string; title: string }>,
  retenues: Record<string, string[]>,
  /** Titres des rubriques du mémoire type (id → titre) : un renvoi qui cite ses rubriques (« bloc 4 : « La
   *  planification » ») est rattaché à la partie qui reprend CES rubriques. */
  titres: Record<string, string> = {},
): string {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const partiesDe = (ids: string[]): number[] => parties.map((p, i) => ((retenues[p.id] || []).some((id) => ids.includes(id)) ? i : -1)).filter((i) => i >= 0);
  const partiesDuBloc = (n: number): number[] => partiesDe(blocs.find((x) => x.numero === n)?.rubriques || []);
  const partiesDesTitres = (cites: string[]): number[] => {
    const ids = Object.keys(titres).filter((id) => cites.some((c) => norm(titres[id]) === norm(c)));
    return ids.length ? partiesDe(ids) : [];
  };
  const libelle = (idx: number[]) => (idx.length > 1
    ? `${idx.slice(0, -1).map((i) => i + 1).join(', ')} et ${idx[idx.length - 1] + 1}`
    : (parties[idx[0]].title.trim().length <= 60 ? `${idx[0] + 1} « ${parties[idx[0]].title.trim()} »` : `${idx[0] + 1}`));
  // « bloc 5 », « blocs 3 et 5 », éventuellement suivis des rubriques citées : « bloc 4 : « La planification » et « … » »,
  // « bloc 5 dans « La gestion d'une commande supplémentaire » et « … » » (T2-CONS-10).
  const RX = /(,\s*)?(\b(?:d[ée]velopp|d[ée]crit|pr[ée]sent|d[ée]taill|trait)[ée]?e?s?\s+)?\b(au|aux|du|des|le|les|dans les?|en)?\s*\b[Bb]locs?\s+(\d)((?:\s*(?:,|et)\s*\d)*)(?![\d])(\s*(:|dans|avec|selon|par)\s*«[^»]{1,120}»(?:\s*(?:,|et|;)\s*«[^»]{1,120}»)*)?/g;
  const SUPPR = '\u0003';
  /** Rubrique du mémoire type citée par son titre, absente des parties du document : jamais nommée. */
  const estTitre = (c: string) => Object.values(titres).some((t) => norm(t) === norm(c));
  const presente = (c: string) => !estTitre(c) || partiesDesTitres([c]).length > 0;
  const prepNouvelle = (prep: string | undefined, pluriel: boolean) => {
    const p = (prep || '').toLowerCase();
    return /^(?:au|aux|dans|en)/.test(p) ? (pluriel ? 'dans les parties' : 'dans la partie')
      : /^(?:du|des)$/.test(p) ? (pluriel ? 'des parties' : 'de la partie')
        : /^(?:le|les)$/.test(p) ? (pluriel ? 'les parties' : 'la partie')
          : (pluriel ? 'parties' : 'partie');
  };
  const sortie = String(texte || '').replace(RX, (m, virgule: string | undefined, participe: string | undefined, prep: string | undefined, n1: string, suite: string, cites: string | undefined, intro: string | undefined, pos: number, tout: string) => {
    const citations = [...String(cites || '').matchAll(/«\s*([^»]+?)\s*»/g)].map((x) => x[1]);
    const presentes = citations.filter(presente);
    if (presentes.length && intro === ':') {
      // Rubriques citées : elles restent (titres de sous-parties du mémoire), précédées de leur partie si elle est unique.
      const idx = partiesDesTitres(presentes);
      const liste = presentes.map((c) => `« ${c} »`).join(presentes.length > 2 ? ', ' : ' et ');
      return `${virgule || ''}${idx.length === 1 ? `partie ${idx[0] + 1} : ` : ''}${liste}`;
    }
    if (presentes.length) {
      // « développé au bloc 5 dans « Rubrique » » : la partie qui reprend la rubrique citée (une ou deux), sans redire le
      // titre de la rubrique (« dans les parties 2 et 3 dans « … » », T2-CONS-10).
      const idx = partiesDesTitres(presentes).sort((a, b) => a - b);
      if (idx.length && idx.length <= 2) return `${virgule || ''}${participe || ''}${prepNouvelle(prep, idx.length > 1)} ${libelle(idx)}`;
    }
    const numeros = [Number(n1), ...[...(suite || '').matchAll(/\d/g)].map((x) => Number(x[0]))];
    // Rubrique citée juste AVANT le renvoi (« → notre réponse : « Le contrôleur de rondes », développée au bloc 4 », forme
    // du bloc 1, imm, T8N-3) : les parties qui reprennent CETTE rubrique, jamais toutes celles du bloc ; rubrique reprise
    // nulle part : le renvoi est retiré, et le titre de la rubrique absente aussi (T2-CONS-10).
    const citeeAvant = /«\s*([^«»]{1,160}?)\s*»\s*$/.exec(tout.slice(0, pos));
    const estRubrique = !!citeeAvant && estTitre(citeeAvant[1]);
    // Rubriques citées après le renvoi, toutes absentes du document : le renvoi ne vise rien (retiré).
    const idx = citations.length ? [] : estRubrique ? partiesDesTitres([citeeAvant![1]]).sort((a, b) => a - b) : [...new Set(numeros.flatMap(partiesDuBloc))].sort((a, b) => a - b);
    if (!idx.length || idx.length > 2) {
      if (estRubrique && !citations.length) return '\u0005';
      // Participe attribut après un auxiliaire (« le processus de reprise est détaillé au bloc 3 ») : retirer seulement
      // le renvoi laisserait « le processus de reprise est. » ; toute la proposition est retirée (marquée ici).
      if (participe && !virgule && /\b(?:est|sont|sera|seront|serait|soit|été|étaient|était)\s+$/i.test(tout.slice(0, pos))) return SUPPR;
      // Incise entre deux virgules (« La procédure, développée au bloc 3, garantit… ») : la virgule fermante part aussi.
      return virgule ? '\u0004' : '';
    }
    return `${virgule || ''}${participe || ''}${prepNouvelle(prep, idx.length > 1)} ${libelle(idx)}`;
  });
  const nettoyee = retirerPropositionsMarquees(sortie, SUPPR)
    // Rubrique absente citée comme réponse (« → notre réponse : « Le contrôleur de rondes », développée au bloc 4 ») : la
    // citation et son introduction partent avec le renvoi.
    .replace(/\s*(?:→\s*(?:notre r[ée]ponse\s*:\s*)?|,?\s*\b(?:selon|avec|par|dans)\s+)?«[^«»]*»\s*,?\s*\u0005/g, '')
    .split('\u0005').join('')
    .replace(/\u0004\s*,\s*/g, ' ').split('\u0004').join('');
  return nettoyee.replace(/\(\s*[:;,]\s*/g, '(').replace(/[;,]\s*[:;,]\s*/g, '; ').replace(/\(\s*\)/g, '').replace(/ +([,.)])/g, '$1').replace(/ {2,}/g, ' ')
    // Ligne au gras déséquilibré après un retrait (« **« … courriel. dans … », T2-CONS-10) : marques retirées de la ligne.
    .split('\n').map((l) => ((l.match(/\*\*/g) || []).length % 2 ? l.replace(/\*\*/g, '') : l)).join('\n')
    .replace(/\s*:\s*([.;])/g, '$1');
}

/**
 * Proposition marquée par `marque` retirée entière, bornée hors des citations « … » (T2-CONS-10 : le point final d'une
 * citation, « … courriel. » », n'est pas une fin de phrase) : depuis le « ; » qui la précède (le point final reste), depuis le
 * « : » d'un libellé (« **« citation »** : le traitement … est développé au bloc 5 » → « **« citation »** »), ou la phrase
 * entière.
 */
export function retirerPropositionsMarquees(texte: string, marque: string): string {
  let t = String(texte || '');
  for (let k = t.indexOf(marque); k >= 0; k = t.indexOf(marque)) {
    let prof = 0;
    let debut = 0;
    let sep = '';
    for (let i = k - 1; i >= 0; i--) {
      const c = t[i];
      if (c === '»') { prof++; continue; }
      if (c === '«') { prof = Math.max(0, prof - 1); continue; }
      if (prof) continue;
      if (c === '\n') { debut = i + 1; sep = 'ligne'; break; }
      if (c === ';') { debut = i; sep = ';'; break; }
      if (c === ':' && /\s/.test(t[i + 1] || '')) { debut = i; sep = ':'; break; }
      if (/[.!?]/.test(c) && /\s/.test(t[i + 1] || '')) { debut = i + 1; sep = '.'; break; }
    }
    let fin = t.length;
    prof = 0;
    for (let i = k + marque.length; i < t.length; i++) {
      const c = t[i];
      if (c === '«') { prof++; continue; }
      if (c === '»') { prof = Math.max(0, prof - 1); continue; }
      if (prof) continue;
      if (c === '\n') { fin = i; break; }
      if (/[.!?;]/.test(c)) { fin = sep === ';' || sep === ':' ? i : i + 1; break; }
    }
    // Phrase entière : les espaces qui la suivent partent avec elle.
    if (sep === '.' || sep === 'ligne' || !sep) while (fin < t.length && t[fin] === ' ') fin++;
    t = `${t.slice(0, debut)}${t.slice(fin)}`;
  }
  return t;
}

const TITRE_ENGAGEMENTS = '## Nos engagements sur les exigences du cahier des charges';
const MOTS_NEUTRES_ENGAGEMENT = new Set(['gss', 'prendra', 'prend', 'compte', 'les', 'des', 'aux', 'une', 'un', 'de', 'du', 'la', 'le', 'et', 'en', 'au', 'ses', 'sur', 'pour', 'dans', 'par', 'est', 'sont', 'ainsi', 'que', 'qui', 'avec', 'l', 'd', 's', 'ceux', 'celles', 'pris']);
const motsEngagement = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter((w) => w && (w.length >= 3 || /\d/.test(w)) && !MOTS_NEUTRES_ENGAGEMENT.has(w)));

/**
 * « Le titulaire » du CCTP est GSS : dans le texte remis par GSS, l'exigence recopiée se dit à la voix de GSS (« une
 * copie est remise au titulaire » → « à GSS », « le titulaire gère » → « GSS gère »). « Titulaire du SSIAP, du poste… »
 * (diplôme, poste tenu par un agent) n'est pas touché.
 */
export function voixDeGss(texte: string): string {
  // Citation du DCE entre guillemets (« … », “ … ” ou " … ") : gardée mot pour mot (cstb 551 : « Le titulaire devra donc
  // veiller… » ne devient jamais « GSS devra donc veiller… »). Seul le texte hors citation passe à la voix de GSS.
  const s = String(texte || '');
  const CITATION = /«[^«»]*»|“[^“”]*”|"[^"\n]*"/g;
  let sortie = '', dernier = 0;
  for (let m: RegExpExecArray | null; (m = CITATION.exec(s)); ) {
    sortie += voixDeGssHorsCitation(s.slice(dernier, m.index)) + m[0];
    dernier = m.index + m[0].length;
  }
  return sortie + voixDeGssHorsCitation(s.slice(dernier));
}

function voixDeGssHorsCitation(texte: string): string {
  if (!texte) return texte;
  // Autre titulaire que GSS (citedia 341 : « le cas échéant, avec le Titulaire sortant » devenu « GSS sortant ») : le
  // titulaire sortant, précédent, actuel, en place, antérieur, ancien, entrant, futur… n'est jamais GSS.
  const AUTRE = String.raw`(?!(?:\s+du\s+march[ée])?\s+(?:sortants?|pr[ée]c[ée]dents?|actuels?|en\s+place|ant[ée]rieurs?|anciens?|nouveaux?|entrants?|suivants?|futurs?|initial|retenus?|pressentis?)(?![\p{L}]))`;
  const SAUF = String.raw`${AUTRE}(?!\s+(?:du|d['’]un|d['’]une|des)\s+(?:SSIAP|dipl|poste|PC|carte|permis|CQP|titre|certificat|habilitation|SST|brevet))`;
  return String(texte || '')
    .replace(new RegExp(String.raw`\b([Aa])u titulaire(?: du march[ée])?(?![\p{L}])${SAUF}`, 'gu'), (_m, a: string) => (a === 'A' ? 'À GSS' : 'à GSS'))
    .replace(new RegExp(String.raw`\b([Dd])u titulaire(?: du march[ée])?(?![\p{L}])${SAUF}`, 'gu'), (_m, d: string) => `${d}e GSS`)
    .replace(new RegExp(String.raw`\b[Ll]e titulaire(?: du march[ée])?(?![\p{L}])${SAUF}`, 'gu'), 'GSS')
    // « Le candidat » du DCE recopié dans un ajout (becquerel 591, T5N-5 : « employé comme salarié du candidat ») : GSS ; jamais
    // un autre candidat (retenu, évincé, attributaire, concurrent…), ni le candidat à l'embauche d'un texte de recrutement
    // (T1F-1 : « jauger la compatibilité du candidat avec la mission », « évalue les connaissances du candidat par un
    // entretien » ne deviennent jamais « de GSS ») : la phrase qui parle de recrutement garde « candidat ».
    .replace(/[^.!?;\n]+[.!?;]?/g, (ph) => (RECRUTEMENT.test(ph) ? ph : ph
      .replace(new RegExp(String.raw`\b([AaDd])u candidat(?![\p{L}])${CAND}`, 'gu'), (_m, x: string) => (/[Aa]/.test(x) ? `${x === 'A' ? 'À' : 'à'} GSS` : `${x}e GSS`))
      .replace(new RegExp(String.raw`\b[Ll]e candidat(?![\p{L}])${CAND}`, 'gu'), 'GSS')))
    // Coquille du DCE sur le sigle de l'autorité de GSS (cstb 551 : « agrément préfectoral CNPAS ») : CNAPS hors citation (T6N-7).
    .replace(/(?<![A-Za-z])CNPAS(?![A-Za-z])/g, 'CNAPS');
}
/** Phrase de recrutement : le « candidat » est le candidat à l'embauche (entretien, CV, affectation, connaissances…). */
const RECRUTEMENT = /(?<![\p{L}])(?:entretiens?|CV|curriculum|embauch\p{L}*|recrut\p{L}*|connaissances|r[ée]f[ée]rences mises en avant|compatibilit[ée]|aptitudes?|motivations?|savoir-[êe]tre|mises? en situation|pr[ée]s[ée]lection\p{L}*|s[ée]lection\p{L}*|jauger|parcours|exp[ée]riences? professionnelles?|test\p{L}*|candidature)(?![\p{L}])/iu;
const CAND = String.raw`(?!\s+(?:retenus?|[ée]vinc[ée]s?|attributaires?|concurrents?|sortants?|pressentis?|non\s+retenus?|suivants?|class[ée]s?)(?![\p{L}]))`;

/**
 * Puces « Nos engagements » du format court : une puce dont les mots sont repris à 60 % au moins (3 mots ou plus) par
 * une puce déjà gardée est une redite (« accès du boulevard Jourdan… » répété trois fois) et disparaît ; les
 * exigences recopiées passent à la voix de GSS.
 */
export function nettoyerEngagements(texte: string): string {
  const i = texte.indexOf(`\n${TITRE_ENGAGEMENTS}\n`);
  if (i < 0) return texte;
  const debut = texte.slice(0, i + TITRE_ENGAGEMENTS.length + 2);
  const gardees: Array<Set<string>> = [];
  const sortie: string[] = [];
  for (const ligne of texte.slice(i + TITRE_ENGAGEMENTS.length + 2).split('\n')) {
    if (!/^- /.test(ligne)) { sortie.push(ligne); continue; }
    const mots = motsEngagement(ligne);
    const redite = mots.size > 0 && gardees.some((g) => {
      const communs = [...mots].filter((w) => g.has(w)).length;
      return communs >= 3 && communs / mots.size >= 0.6;
    });
    if (redite) continue;
    gardees.push(mots);
    sortie.push(voixDeGss(ligne));
  }
  return `${debut}${sortie.join('\n')}`.replace(/\n{3,}/g, '\n\n');
}

/**
 * Pages occupées par chaque partie d'un mémoire au format court (titre « n. Titre » cherché page à page, dans l'ordre) : une
 * page partagée entre deux parties compte pour les deux. [] si le texte du PDF est illisible (T2-GEN-9).
 */
export function pagesDesParties(pdf: string, titres: string[]): number[] {
  const r = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return [];
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pages = r.stdout.split('\f').map(norm);
  if (pages.length && !pages[pages.length - 1]) pages.pop();
  const debuts: number[] = [];
  let depuis = 0;
  for (const [i, t] of titres.entries()) {
    const cle = norm(`${i + 1} ${t}`).split(' ').slice(0, 8).join(' ');
    const k = pages.findIndex((p, j) => j >= depuis && p.includes(cle));
    if (k < 0) return [];
    debuts.push(k);
    depuis = k;
  }
  return debuts.map((d, i) => (i + 1 < debuts.length ? debuts[i + 1] : pages.length - 1) - d + 1);
}

/** Nombre de pages d'un PDF (pdfinfo, sinon comptage des objets /Page). */
export function nombrePages(pdf: string): number {
  const r = spawnSync('pdfinfo', [pdf], { encoding: 'utf-8' });
  const m = /Pages:\s+(\d+)/.exec(r.stdout || '');
  if (m) return Number(m[1]);
  const brut = fs.readFileSync(pdf).toString('latin1');
  return (brut.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

const echapper = (t?: string) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Règle @font-face de la police du texte du thème, graisse la plus proche de 400 seulement (pied de page). */
function fontFacePied(theme: string): string {
  const famille = styleDuTheme(theme)?.polices?.texte?.famille;
  const p = policesDuTheme(theme).filter((x) => x.famille === famille).sort((a, b) => Math.abs(a.poids - 400) - Math.abs(b.poids - 400))[0];
  if (!p) return '';
  try {
    const b64 = fs.readFileSync(p.chemin).toString('base64');
    return `<style>@font-face{font-family:'${p.famille}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;}</style>`;
  } catch { return ''; }
}

/** Couleurs et polices du format court : celles du thème (themes.ts), ou celles d'avant les thèmes (retour arrière,
 *  rendu identique). */
function jetonsCourt(theme: string) {
  const p = styleDuTheme(theme)?.pages;
  if (!p) {
    return { police: 'Arial, Helvetica, sans-serif', encre: '#1f2937', accent: '#dc2626', fort: '#111827', gris: '#4b5563', bandeau: '#494545',
      bandeauTexte: '#fff', numero: '#fca5a5', titre: '#dc2626', teteTableau: '#484545', teteTableauTexte: '#F5F5DE', filet: '#CFC9C5',
      ligne: '#F7F5EF', pied: '#6b7280', piedPolice: 'Arial', piedStyle: '', logo: 'logogss.png', extra: '' };
  }
  const v = (k: string, d: string) => p[k] || d;
  const bandeau = v('--gss-tableau-tete', '#0B2545');
  const bandeauTexte = v('--gss-tableau-tete-texte', '#FFFFFF');
  const accentCouv = v('--gss-couverture-accent', v('--gss-accent', '#E85D15'));
  const enteteFond = v('--gss-entete-fond', '#0B2545');
  const enteteTexte = v('--gss-entete-texte', '#FFFFFF');
  const fond = v('--gss-fond-page', '#FFFFFF');
  // En-tête de la première page dans le bandeau du thème (logo, titre de l'offre), polices du thème embarquées.
  // Fond de page aussi sous les marges @page (Chromium ne les peint qu'avec le fond de @page) : un thème sombre n'a
  // plus de cadre blanc autour de la page, et le pied de page s'y écrit en couleur claire.
  const extra = `${fontFaceTheme(theme)}
@page { background: ${fond}; }
html, body { background: ${fond}; }
h1, h2, h3, h4, header.tete .t1, header.tete .t2 { font-family: ${v('--gss-police-titre', 'sans-serif')}; }
header.tete { background: ${enteteFond}; padding: 7px 12px; border-bottom: 3px solid ${v('--gss-entete-filet', accentCouv)}; }
header.tete .t1 { color: ${contraste(accentCouv, enteteFond) >= 4.5 ? accentCouv : enteteTexte}; }
header.tete .t2 { color: ${enteteTexte}; }
header.tete .t3 { color: ${enteteTexte}; opacity: .8; }
h1 { font-weight: ${v('--gss-titre-graisse', '600')}; padding: 4px 9px; }
li::marker { color: ${v('--gss-puce', v('--gss-accent', accentCouv))}; }
${styleDuTheme(theme)?.logo === 'monochrome_blanc_sur_marine' ? 'header.tete img { width: 56px; height: 41px; object-fit: contain; }\n' : ''}`;
  return {
    police: familleTexte(theme) || 'Arial, Helvetica, sans-serif', encre: v('--gss-encre', '#1f2937'), accent: v('--gss-accent', '#dc2626'),
    fort: v('--gss-titre', '#111827'), gris: v('--gss-encre-2', '#4b5563'), bandeau, bandeauTexte,
    // Numéro de partie : texte du titre de partie (corps + 3 pt en gras, sous 14 pt gras) → 4,5:1.
    numero: contraste(accentCouv, bandeau) >= 4.5 ? accentCouv : bandeauTexte, titre: v('--gss-titre', '#dc2626'), teteTableau: bandeau,
    teteTableauTexte: bandeauTexte, filet: v('--gss-filet', '#CFC9C5'), ligne: v('--gss-tableau-ligne', '#F7F5EF'),
    pied: v('--gss-encre-3', '#6b7280'),
    // Pied de page dans la police du texte du thème : le modèle de pied de page de Chromium ne voit pas les @font-face
    // de la page, la police (graisse normale) y est donc embarquée.
    piedPolice: familleTexte(theme) || 'Arial', piedStyle: fontFacePied(theme),
    logo: styleDuTheme(theme)?.logo === 'encre' ? LOGO_FOND_CLAIR : styleDuTheme(theme)?.logo === 'monochrome_blanc_sur_marine' ? LOGO_BLANC : 'logogss.png', extra,
  };
}

/** Schéma dessiné sur une toile portrait (format « page » du moteur) : affiché en grand, sur au moins la moitié de la page. */
function schemaPortrait(svg?: string): boolean {
  const m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(String(svg || '').slice(0, 2000));
  return !!m && Number(m[2]) > Number(m[1]);
}

/** Sous-titres du texte « Notre compréhension de votre besoin » (bloc 1) dans une partie du format court. */
const SOUS_TITRES_COMPREHENSION = /^#{1,3}\s+(?:Notre compr[ée]hension|Votre contexte|Le p[ée]rim[èe]tre|Vos attentes|Les points de vigilance|Nos engagements sur les exigences|Nos remarques)/i;

/** Texte d'une partie coupé à la fin de l'explication de la compréhension du besoin (premier sous-titre « ## » d'une autre
 *  rubrique qui suit les sous-titres du bloc 1) ; tout le texte sinon. */
export function coupeApresComprehension(texte: string): { avant: string; apres: string } {
  const lignes = String(texte || '').split('\n');
  const debut = lignes.findIndex((l) => SOUS_TITRES_COMPREHENSION.test(l));
  if (debut < 0) return { avant: texte, apres: '' };
  const fin = lignes.findIndex((l, k) => k > debut && /^#{1,3}\s+\S/.test(l) && !SOUS_TITRES_COMPREHENSION.test(l));
  return fin < 0 ? { avant: texte, apres: '' } : { avant: lignes.slice(0, fin).join('\n'), apres: lignes.slice(fin).join('\n') };
}

function html(
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean; tete?: boolean }>,
  cover: { client?: string; title?: string; ref?: string },
  corps: number,
  theme: string = themeActif(),
): string {
  const md = new (require('markdown-it'))({ html: false, breaks: false, linkify: false });
  const j = jetonsCourt(theme);
  const police = fs.existsSync(LEXEND) ? `@font-face{font-family:'Lexend';src:url('file://${LEXEND}') format('truetype');font-weight:100 900;}` : '';
  const logo = path.join(MARP_ASSETS, j.logo);
  // Objet du marché ; « Mémoire technique » (valeur par défaut) ferait doublon avec le bandeau.
  const objet = /^m[ée]moire technique$/i.test((cover.title || '').trim()) ? '' : (cover.title || '').trim();
  // Schéma de toile portrait (process de la compréhension, organigramme) : en grand (consigne 3 : lisible en 5 secondes),
  // après l'explication de la compréhension pour le process ; schéma paysage : dans le texte, comme avant.
  const figure = (p: { schema?: string }) => (p.schema ? `<figure class="schema${schemaPortrait(p.schema) ? ' grand' : ''}">${p.schema}</figure>` : '');
  const rendre = (t: string) => md.render(t.replace(/^#\s+/gm, '## ').replace(/«[ \t]+/g, '«\u00a0').replace(/[ \t]+»/g, '\u00a0»'));
  const blocs = parties.map((p, i) => {
    // Process de la compréhension (consigne 6 : « 1 à 2 pages d'explication suivies d'1 page de schéma », T5CP-12) : placé
    // juste après l'explication de la compréhension du besoin, avant les rubriques suivantes de la partie.
    const { avant, apres } = p.tete ? coupeApresComprehension(p.texte) : { avant: p.texte, apres: '' };
    return `
<section>
  <h1><span class="num">${i + 1}.</span> ${echapper(p.titre)}</h1>
  ${rendre(avant)}
  ${figure(p)}
  ${apres.trim() ? rendre(apres) : ''}
</section>`;
  }).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${police}
@page { size: A4; margin: 13mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ${j.police}; font-size: ${corps}pt; line-height: 1.32; color: ${j.encre}; }
header.tete { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid ${j.accent}; padding-bottom: 7px; margin-bottom: 9px; }
header.tete img { width: 46px; height: 46px; }
header.tete .t1 { font-size: 8.5pt; font-weight: bold; letter-spacing: .08em; color: ${j.accent}; }
header.tete .t2 { font-size: 13pt; font-weight: bold; color: ${j.fort}; text-transform: uppercase; }
header.tete .t3 { font-size: 9pt; color: ${j.gris}; }
h1 { font-size: ${corps + 3}pt; color: ${j.bandeauTexte}; background: ${j.bandeau}; padding: 3px 8px; margin: 10px 0 5px; break-after: avoid; }
h1 .num { color: ${j.numero}; }
h2 { font-size: ${corps + 1}pt; color: ${j.titre}; margin: 7px 0 3px; break-after: avoid; }
h3, h4 { font-size: ${corps + 0.5}pt; color: ${j.titre}; margin: 5px 0 2px; break-after: avoid; }
p { margin: 0 0 4px; text-align: justify; }
ul, ol { margin: 0 0 4px; padding-left: 16px; }
li { margin: 0 0 1px; }
strong { color: ${j.fort}; }
table { border-collapse: collapse; width: 100%; margin: 3px 0 6px; font-size: ${corps - 0.5}pt; break-inside: avoid; }
th { background: ${j.teteTableau}; color: ${j.teteTableauTexte}; text-align: left; padding: 2px 5px; }
td { border: 1px solid ${j.filet}; padding: 2px 5px; vertical-align: top; }
tr:nth-child(even) td { background: ${j.ligne}; }
figure.schema { margin: 5px auto 7px; text-align: center; break-inside: avoid; }
figure.schema svg { width: 100%; height: auto; max-height: 72mm; }
figure.schema.grand svg { width: auto; max-width: 100%; height: 150mm; max-height: 150mm; display: block; margin: 0 auto; }
${j.extra}</style></head><body>
<header class="tete">
  ${fs.existsSync(logo) ? `<img src="file://${logo}" alt="">` : ''}
  <div><div class="t1">MÉMOIRE TECHNIQUE — GLOBAL SECURITY SERVICES</div>
  <div class="t2">${echapper(objet || cover.client || '')}</div>
  <div class="t3">${[objet ? cover.client : '', cover.ref].filter(Boolean).map(echapper).join(' — ')}</div></div>
</header>
${blocs}
</body></html>`;
}

/**
 * Rend le mémoire au format court et renvoie le PDF et son nombre de pages. Réduit la police par
 * paliers (10 → 9 pt) puis retire les schémas (du dernier au premier) tant que la limite est dépassée.
 */
export async function rendreFormatCourt(
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean; tete?: boolean }>,
  cover: { client?: string; title?: string; ref?: string },
  pagesMax: number,
  dossierSortie: string,
  themeDemande?: string,
  /** Police minimale essayée (10 : essai de mise en page à la police normale seulement, sans retrait de schéma). */
  policeMin = 9,
): Promise<{ filePath: string; pages: number; corps: number; schemasRetires: number }> {
  // Thème de style : celui du mémoire déjà rendu s'il est fourni, sinon GSS_THEME / style par défaut.
  const theme = themeActif(themeDemande);
  const { pied, piedPolice, piedStyle } = jetonsCourt(theme);
  const puppeteer = require('puppeteer');
  const navigateur = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-court-'));
  const pdf = path.join(dossierSortie, `Mémoire technique GSS (format RC)_${Date.now()}.pdf`);
  try {
    const page = await navigateur.newPage();
    const essai = async (pts: typeof parties, corps: number): Promise<number> => {
      const f = path.join(travail, 'memoire.html');
      fs.writeFileSync(f, html(pts, cover, corps, theme), 'utf-8');
      await page.goto(`file://${f}`, { waitUntil: 'load', timeout: 120_000 });
      await page.pdf({
        path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: `${piedStyle}<div style="width:100%;font-size:7.5pt;color:${pied};padding:0 14mm;display:flex;justify-content:space-between;font-family:${piedPolice.replace(/"/g, "'")}"><span>GSS — Global Security Services</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        timeout: 300_000,
      });
      return nombrePages(pdf);
    };
    let pts = parties.map((p) => ({ ...p }));
    let schemasRetires = 0;
    for (const corps of [10, 9.5, 9].filter((c) => c >= policeMin)) {
      const n = await essai(pts, corps);
      if (n <= pagesMax || corps === policeMin) return { filePath: pdf, pages: n, corps, schemasRetires };
    }
    // Police minimale atteinte : les schémas cèdent la place au texte (le contenu prime).
    for (let i = pts.length - 1; i >= 0; i--) {
      if (!pts[i].schema || pts[i].garder) continue;
      pts = pts.map((p, k) => (k === i ? { ...p, schema: undefined } : p));
      schemasRetires++;
      const n = await essai(pts, 9);
      if (n <= pagesMax) return { filePath: pdf, pages: n, corps: 9, schemasRetires };
    }
    return { filePath: pdf, pages: nombrePages(pdf), corps: 9, schemasRetires };
  } finally {
    await navigateur.close();
    fs.rmSync(travail, { recursive: true, force: true });
  }
}
