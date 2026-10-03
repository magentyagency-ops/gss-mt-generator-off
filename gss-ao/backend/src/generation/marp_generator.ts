import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import type { PooledIllustration, SlideContext } from './image_service';
import { D2Service } from './d2_service';
import { organigrammeSvg } from './organigramme';
import { themeActif, estRetourArriere, feuilleMarp, imagesTheme, pagesMarineV3, styleDuTheme } from './themes';
import {
  LIMITES_MARINE_V3, SEUIL_TEXTE_COURT, intertitresV3, surEtTitre, memesTitres, surtitre, enteteBloc, styleParcours, couvertureV3,
  legendeRoles, sommaireV3, ouvertureV3, essentielV3, signes, repereRubrique, typoV3, type CouleursV3,
} from './marp_pages_marine';

/** Illustrations attribuées, indexées par clé de slide (unicité globale garantie amont). */
export type SlideAssignments = Map<string, PooledIllustration>;

/** Schémas GSS (SVG sur une ligne, identifiants uniques), indexés par clé de slide : un par page. */
export type SlideSchemas = Map<string, string>;

/** Police Lexend des schémas GSS, embarquée une fois dans le document (mesure du texte identique). */
const LEXEND_PATH = path.resolve(__dirname, '../../python/schemas_gss/polices/Lexend.ttf');
const ORGANIGRAMME_GSS_PATH = path.resolve(__dirname, '../../python/schemas_gss/organigramme_gss.svg');

/** Dessins Phosphor (graisse bold) des pictogrammes de la légende des schémas du style « marine » v3 (contenu du SVG). */
function pictosLegende(): Record<string, string> {
  const dossier = path.resolve(__dirname, '../../python/schemas_gss/moteur_marine/pictos');
  const out: Record<string, string> = {};
  try {
    const corresp = JSON.parse(fs.readFileSync(path.join(dossier, 'correspondance.json'), 'utf-8'));
    for (const nom of ['check', 'alerte', 'loupe', 'main']) {
      const svg = fs.readFileSync(path.join(dossier, 'bold', `${corresp[nom]}.svg`), 'utf-8');
      out[nom] = (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1] || '').trim();
    }
  } catch (e: any) {
    console.warn(`[MarpGenerator] Pictogrammes de la légende illisibles : ${e?.message || e}`);
  }
  return out;
}

/** Organigramme GSS en SVG sur une ligne, identifiants préfixés (null si absent). Thème de la refonte : organigramme
 *  au format page (1 schéma = 1 page A4 portrait) ; retour arrière : organigramme d'origine. */
function lireOrganigrammeGss(theme: string = themeActif()): string | null {
  try {
    if (!estRetourArriere(theme)) {
      const svg = organigrammeSvg('page', theme);
      if (svg) {
        return svg
          .replace(/id="([^"]+)"/g, (_m, id) => `id="org-${id}"`)
          .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#org-${id})`)
          .replace(/(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"/, '$1 width="100%" preserveAspectRatio="xMidYMid meet"')
          .replace(/\s*\n\s*/g, ' ')
          .trim();
      }
    }
    // Organigramme dessiné d'après l'organigramme GSS de référence (mêmes personnes que le texte).
    return (organigrammeSvg('paysage', theme) ?? fs.readFileSync(ORGANIGRAMME_GSS_PATH, 'utf-8'))
      .replace(/id="([^"]+)"/g, (_m, id) => `id="org-${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#org-${id})`)
      .replace(/width="1200" height="\d+"/, 'width="100%" preserveAspectRatio="xMidYMid meet"')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
  } catch {
    return null;
  }
}

// ─── Constants ───
/** Maximum words per slide body before splitting to a new slide.
 *  Abaissé (vs 220) pour réserver l'espace de l'illustration placée sous le texte. */
const MAX_WORDS_PER_SLIDE = 170;
/** Hauteur de texte maximale par slide, en lignes estimées (≈ 90 caractères par ligne, un
 *  intervalle entre paragraphes compte pour 0,7 ligne). Au-delà, le schéma GSS placé sous le
 *  texte serait repoussé hors de la page : on coupe avant. */
const MAX_LINES_PER_SLIDE = 19;
const CHARS_PER_LINE = 90;
/** Limites d'une page de texte SANS schéma dessous (mise en page « 1 à 2 pages de texte, puis 1 page de schéma ») :
 *  thèmes de la refonte (corps de 10 pt) et thème d'origine (corps de 15 px, marges plus grandes).
 *  Refonte, calée sur 81 pages de texte rendues par Chromium (réponse libre v2, DCE becquerel et caen) : avec des lignes
 *  de 105 caractères, les lignes de tableau comptées 1,8 fois (cellules repliées) et les lignes de séparation d'un
 *  tableau comptées pour rien, une page tient au moins 44,6 lignes ; 40 lignes laissent une marge de 10 %. L'ancienne
 *  limite (400 mots, lignes de 90 caractères) coupait en deux pages des rubriques qui tiennent sur une seule.
 *  Les lignes de tableau sont désormais estimées d'après leur hauteur réelle (voir lignesParagraphe) ; « ligneTableau »
 *  marque la mise en page v2. */
const LIMITES_TEXTE_SEUL = {
  refonte: { mots: 560, lignes: 40, caracteres: 105, ligneTableau: 1.8 },
  origine: { mots: 280, lignes: 28 },
  // Mémoire type (v2) rendu dans le thème de retour arrière « gss-2026-09 » (T10N-5) : mesure d'origine du thème (pages remplies
  // à 0,89 au plus avec 280 mots et 28 lignes), un peu plus pleine, et regroupement des paragraphes d'une rubrique en 2 pages
  // de texte au plus quand elles suffisent (main courante : 7, 20 puis 6 lignes sur 3 pages) ; jamais de page resserrée (la
  // classe « texte-serre » n'existe que dans les thèmes de la refonte).
  ancienThemeV2: { mots: 300, lignes: 30, serre: false, regrouper: true },
};

/** Limites de découpage d'une page de texte : mots, lignes estimées et, pour la mise en page v2 de la refonte, longueur
 *  d'une ligne et poids d'une ligne de tableau (absents : estimation d'origine, lignes de 90 caractères). */
interface LimitesPage { mots: number; lignes: number; caracteres?: number; ligneTableau?: number; /** false : jamais de page resserrée. */ serre?: boolean; /** Regroupement des pages d'une rubrique (dernière page courte, 2 pages au lieu de 3). */ regrouper?: boolean; /** Lignes réservées en tête de la première page (surtitre et titre du style « marine » v3). */ reserve?: number; /** Intertitres dans la colonne de titrage, à côté du texte (style « marine » v3) : ils ne prennent presque aucune hauteur. */ titresEnMarge?: boolean }
/** Path to Marp assets (CSS + logo) bundled with the backend. */
const MARP_ASSETS_DIR = path.resolve(__dirname, 'marp');

/** Lanceur de Chrome pour conteneur Linux (scripts/chrome-conteneur.sh) : ajoute --disable-dev-shm-usage. */
const LANCEUR_CHROME_CONTENEUR = path.resolve(__dirname, '../../scripts/chrome-conteneur.sh');

/**
 * Chemin du lanceur à donner à Marp (CHROME_PATH) à la place de Chrome, ou null pour lancer Chrome directement.
 * Conteneur Linux (Railway) : /dev/shm y est souvent limité à 64 Mo et un long mémoire peut faire planter l'onglet de
 * Chrome ; le lanceur ajoute --disable-dev-shm-usage puis exécute le vrai Chrome (GSS_CHROME_REEL). Mac et Windows :
 * aucun lanceur, rendu inchangé. GSS_CHROME_LANCEUR=non le désactive, GSS_CHROME_LANCEUR=oui l'impose (essais).
 */
export function lanceurChromeConteneur(chromePath: string | undefined, plateforme: string = process.platform): string | null {
  const choix = (process.env.GSS_CHROME_LANCEUR || '').trim().toLowerCase();
  if (!chromePath || choix === 'non' || (plateforme !== 'linux' && choix !== 'oui')) return null;
  if (path.resolve(chromePath) === LANCEUR_CHROME_CONTENEUR) return null; // CHROME_PATH désigne déjà le lanceur
  try {
    fs.accessSync(LANCEUR_CHROME_CONTENEUR, fs.constants.X_OK);
  } catch {
    try {
      fs.chmodSync(LANCEUR_CHROME_CONTENEUR, 0o755); // droit d'exécution perdu à la copie des fichiers
      fs.accessSync(LANCEUR_CHROME_CONTENEUR, fs.constants.X_OK);
    } catch (e: any) {
      console.warn(`[MarpGenerator] Lanceur Chrome inutilisable (${e?.message || e}) : Chrome lancé sans --disable-dev-shm-usage.`);
      return null;
    }
  }
  console.log(`[MarpGenerator] Chrome lancé par ${LANCEUR_CHROME_CONTENEUR} (--disable-dev-shm-usage).`);
  return LANCEUR_CHROME_CONTENEUR;
}

// ─── Helpers ───
/**
 * Escape markdown special characters in generated text so Marp renders
 * it as plain paragraphs (the AI sometimes produces raw markdown).
 * We keep line breaks (\n) but strip markdown headings, bold markers, etc.
 */
function cleanTextForMarp(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    // Convertit les sous-titres soulignés que l'IA produit parfois (**<u>Titre</u>**) en vrais
    // titres Markdown niveau 2 → rendus en ROUGE et plus grands par le thème gss.
    .replace(/^\s*\*{0,3}<u>\s*(.+?)\s*<\/u>\*{0,3}\s*$/gim, '## $1')
    // On PRÉSERVE les titres Markdown (##/###) et le gras (**…**) : le thème les met en rouge et
    // en plus grande police. On escape seulement les caractères qui casseraient le rendu Marp.
    .replace(/([\\()[\]{}])/g, '\\$1')
    // Guillemets français : espace insécable à l'intérieur, jamais un « » » seul en début de ligne (fontainebleau 21 p. 8).
    .replace(/«[ \t]+/g, '«\u00a0').replace(/[ \t]+»/g, '\u00a0»')
    .trim();
}

/**
 * Split a long text block into chunks of ~MAX_WORDS_PER_SLIDE words,
 * splitting on paragraph boundaries (\n\n) when possible.
 */
/** Lignes estimées occupées par un paragraphe (chaque retour à la ligne interne compte) + intervalle. Mise en page v2
 *  de la refonte : une ligne de tableau pèse davantage (cellules repliées), sa ligne de séparation ne pèse rien. */
function lignesParagraphe(p: string, limites: LimitesPage): number {
  // Style « marine » v3 : un intertitre seul est posé dans la colonne de titrage, en regard du texte qui le suit.
  if (limites.titresEnMarge && /^#{1,6}\s/.test(p) && !p.includes('\n')) return 0.6;
  const caracteres = limites.caracteres ?? CHARS_PER_LINE;
  const ligneTableau = limites.ligneTableau;
  // Mise en page v2 de la refonte : seule la ligne de sous-titre pèse 1,5 ligne. Un sous-titre suivi de son texte sans
  // ligne vide (« ## Votre contexte et votre site\nL'École… ») multipliait tout le paragraphe par 1,5 (tableau compris) :
  // la compréhension du besoin de l'IGN (génération réelle ign 15) occupait 4 pages de texte au lieu de 2 (consigne 3).
  if (ligneTableau !== undefined) {
    return p.split('\n').reduce((n, l) => {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return n;
      // Ligne de tableau : hauteur relevée dans Chromium sur les tableaux des réponses libres v2 (becquerel, caen, ign) :
      // ≈ 0,7 ligne de marges de cellule + 0,87 ligne par ligne repliée (≈ 90 caractères de Markdown par ligne repliée) ;
      // l'ancien poids (1,8 × lignes de 105 caractères) comptait 3,6 lignes pour une ligne de tableau qui en fait 2,4.
      if (/^\s*\|/.test(l)) return n + 0.75 + 0.9 * Math.max(1, Math.ceil(l.length / 90));
      return n + Math.max(1, Math.ceil(l.length / caracteres)) * (/^#{1,6}\s/.test(l) ? 1.5 : 1);
    }, 0) + 0.7;
  }
  return p.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / caracteres)), 0) * (/^#{1,6}\s/.test(p) ? 1.5 : 1) + 0.7;
}

/** Lignes estimées d'un texte (somme de ses paragraphes). */
function lignesTexte(texte: string, limites: LimitesPage): number {
  return texte.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).reduce((n, p) => n + lignesParagraphe(p, limites), 0);
}

/** Mise en page v2 de la refonte : une dernière page de rubrique remplie à moins de ce taux (quelques lignes) est
 *  évitée ; elle est regroupée avec la page précédente si l'ensemble tient dans la page resserrée (classe
 *  « texte-serre » : interlignes et espacements légèrement réduits). La page tient au moins 44,6 lignes estimées à
 *  l'espacement normal (voir LIMITES_TEXTE_SEUL) : 1,1 × 40 = 44 lignes restent dans cette mesure, l'espacement
 *  resserré ajoute une marge. Rubrique sans schéma de quelques lignes : chapeau de la rubrique suivante. */
const SEUIL_PAGE_ORPHELINE = 0.25;
const MARGE_PAGE_SERREE = 1.1;

/** Découpage d'un texte de rubrique en pages de texte seules (mise en page v2 de la refonte), pour les contrôles. */
export function decouperPagesTexte(texte: string, retourArriere = false): string[] {
  return splitIntoSlideChunks(texte, retourArriere ? LIMITES_TEXTE_SEUL.origine : LIMITES_TEXTE_SEUL.refonte);
}

function splitIntoSlideChunks(text: string, limites: LimitesPage = { mots: MAX_WORDS_PER_SLIDE, lignes: MAX_LINES_PER_SLIDE }): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const isHeading = (p: string) => /^#{1,6}\s/.test(p);
  const wordCount = (p: string) => p.split(/\s+/).length;
  const lineCount = (p: string) => lignesParagraphe(p, limites);

  // Un bloc plus haut qu'une slide (longue liste sans ligne vide) est scindé par groupes de lignes.
  for (let i = 0; i < paragraphs.length; i++) {
    const lignes = paragraphs[i].split('\n');
    // Mise en page v2 de la refonte : aussi un bloc de plus de mots qu'une page (longue liste de puces courtes).
    const tropDeMots = limites.ligneTableau !== undefined && wordCount(paragraphs[i]) > limites.mots;
    if (lignes.length > 1 && (lineCount(paragraphs[i]) > limites.lignes || tropDeMots)) {
      const groupes: string[] = [];
      let g: string[] = [];
      // Mise en page v2 de la refonte : le premier groupe laisse la place du sous-titre qui le précède, sinon le
      // sous-titre restait seul sur sa page (« Nos engagements sur les exigences du cahier des charges », ign 15 p. 42).
      const titre = limites.ligneTableau !== undefined && i > 0 && isHeading(paragraphs[i - 1]);
      const reserve = titre ? lineCount(paragraphs[i - 1]) : 0;
      const reserveMots = titre ? wordCount(paragraphs[i - 1]) : 0;
      const motsMax = limites.ligneTableau !== undefined ? limites.mots : Infinity;
      for (const l of lignes) {
        const essai = [...g, l].join('\n');
        if (g.length && (lineCount(essai) > limites.lignes - (groupes.length ? 0 : reserve) || wordCount(essai) > motsMax - (groupes.length ? 0 : reserveMots))) { groupes.push(g.join('\n')); g = []; }
        g.push(l);
      }
      if (g.length) groupes.push(g.join('\n'));
      paragraphs.splice(i, 1, ...groupes);
      i += groupes.length - 1;
    }
  }

  const chunks: string[] = [];
  let current = '';
  let currentWords = 0;
  // Style « marine » v3 : la première page de la rubrique porte le surtitre et le titre (lignes réservées).
  let currentLines = limites.reserve || 0;

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
    currentWords = 0;
    currentLines = 0;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWords = wordCount(para);

    if (isHeading(para) && current.trim()) {
      // Un titre ne doit JAMAIS rester seul en bas d'une slide : on le garde collé au paragraphe
      // qui le suit. Si le bloc « titre + son 1er paragraphe » ne tient pas sur la slide en cours,
      // on coupe AVANT le titre pour qu'il ouvre la slide suivante avec son contenu.
      // Mise en page v2 de la refonte : un sous-titre suivi de son texte dans le même paragraphe (« ## Le périmètre…\n| … »)
      // a déjà son contenu ; le paragraphe suivant n'a pas à tenir avec lui sur la même page.
      const next = limites.ligneTableau !== undefined && para.includes('\n') ? undefined : paragraphs[i + 1];
      const blockWords = paraWords + (next && !isHeading(next) ? wordCount(next) : 0);
      const blockLines = lineCount(para) + (next && !isHeading(next) ? lineCount(next) : 0);
      if (currentWords + blockWords > limites.mots || currentLines + blockLines > limites.lignes) {
        flush();
      }
    } else if ((currentWords + paraWords > limites.mots || currentLines + lineCount(para) > limites.lignes) && current.trim()) {
      flush();
    }

    current += (current ? '\n\n' : '') + para;
    currentWords += paraWords;
    currentLines += lineCount(para);
  }
  flush();

  // Mise en page v2 de la refonte (pages de texte seules) : pas de dernière page de quelques lignes. Elle rejoint la
  // page précédente quand l'ensemble tient dans une page resserrée (la page est alors rendue en « texte-serre »).
  // Thème de retour arrière avec le mémoire type (T10N-5) : 3 pages ou plus alors que 2 suffisent → 2 pages, la coupe la plus
  // équilibrée entre paragraphes (chacune dans les limites).
  if (limites.regrouper && chunks.length >= 3) {
    // Unités de coupe : les lignes des paragraphes (un paragraphe ou une liste peut continuer sur la page suivante), jamais
    // après un sous-titre (« ## … », ligne « **…** » seule) ni après une amorce de liste (« … : »).
    const unites: Array<{ t: string; p: number }> = [];
    chunks.join('\n\n').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).forEach((para, p) => {
      for (const l of para.split('\n')) unites.push({ t: l, p });
    });
    const texteDe = (u: Array<{ t: string; p: number }>) => u.map((x, i) => (i && u[i - 1].p !== x.p ? `\n\n${x.t}` : i ? `\n${x.t}` : x.t)).join('');
    let meilleur: { k: number; ecart: number } | null = null;
    for (let k = 1; k < unites.length; k++) {
      if (isHeading(unites[k - 1].t) || /^\s*\*\*[^*]+\*\*\s*$/.test(unites[k - 1].t) || /:\s*$/.test(unites[k - 1].t)) continue;
      // Ligne de tableau : jamais coupée au milieu d'un tableau.
      if (/^\s*\|/.test(unites[k - 1].t) && /^\s*\|/.test(unites[k].t)) continue;
      const a = texteDe(unites.slice(0, k)), b = texteDe(unites.slice(k));
      const la = lignesTexte(a, limites), lb = lignesTexte(b, limites);
      if (la > limites.lignes || lb > limites.lignes || wordCount(a) > limites.mots || wordCount(b) > limites.mots) continue;
      if (!meilleur || Math.abs(la - lb) < meilleur.ecart) meilleur = { k, ecart: Math.abs(la - lb) };
    }
    if (meilleur) chunks.splice(0, chunks.length, texteDe(unites.slice(0, meilleur.k)), texteDe(unites.slice(meilleur.k)));
  }
  const n = chunks.length;
  if ((limites.ligneTableau !== undefined || limites.regrouper) && n >= 2) {
    const derniere = lignesTexte(chunks[n - 1], limites);
    const ensemble = lignesTexte(chunks[n - 2], limites) + derniere;
    const mots = wordCount(chunks[n - 2]) + wordCount(chunks[n - 1]);
    const marge = limites.serre === false ? 1 : MARGE_PAGE_SERREE;
    if (derniere < limites.lignes * SEUIL_PAGE_ORPHELINE && ensemble <= limites.lignes * marge && mots <= limites.mots * marge) {
      chunks.splice(n - 2, 2, `${chunks[n - 2]}\n\n${chunks[n - 1]}`);
    }
  }

  return chunks.length > 0 ? chunks : [''];
}

/** Page de texte de la v2 plus haute que la limite normale (regroupement d'une fin de rubrique) : rendu resserré. */
function pageSerree(chunk: string, limites?: LimitesPage): boolean {
  return !!limites && limites.ligneTableau !== undefined && limites.serre !== false && lignesTexte(chunk, limites) > limites.lignes;
}

/**
 * Sections d'un chapitre à paginer, avec leur indice d'origine (clés des slides inchangées). Mise en page v2 de la
 * refonte : une rubrique SANS schéma dont le texte tient en quelques lignes (introduction des références) n'a pas de
 * page à elle ; son titre et son texte, inchangés, deviennent le chapeau de la première page de la rubrique suivante
 * du même bloc. Ailleurs (thème de retour arrière, mise en page d'origine), rien ne change.
 */
function sectionsAPaginer(chapter: AssembleChapter, theme: string): Array<{ section: AssembleSection; si: number; texte: string; sansPageTexte?: boolean }> {
  const sortie: Array<{ section: AssembleSection; si: number; texte: string; sansPageTexte?: boolean }> = [];
  let chapeau = '';
  chapter.sections.forEach((section, si) => {
    let texte = cleanTextForMarp(section.text);
    // Style « marine » v3 : intertitres en gras devenus intertitres de la colonne de titrage (aucun mot changé).
    if (pagesMarineV3(theme)) texte = intertitresV3(texte);
    if (chapeau) { texte = `${chapeau}\n\n${texte}`; chapeau = ''; }
    const limites = limitesSection(section, theme);
    const suivante = chapter.sections[si + 1];
    // Deux rubriques avec schéma ne partagent jamais une page de texte : chaque rubrique garde sa page de texte puis sa
    // page de schéma (consigne 6 : « 1 à 2 pages d'explication suivies d'1 page de schéma »). Le regroupement des
    // rubriques courtes attend la décision du patron de GSS sur le volume du mémoire (fontainebleau 21 : textes de deux
    // rubriques sur une page, puis deux schémas d'affilée).
    if (section.texteSeul && !section.photos?.length && limites?.ligneTableau !== undefined && suivante && limitesSection(suivante, theme)?.ligneTableau !== undefined
      && lignesTexte(texte, limites) < limites.lignes * SEUIL_PAGE_ORPHELINE) {
      const titre = titreSchema(section.title);
      chapeau = titre ? `## ${titre}\n\n${texte}` : texte;
      return;
    }
    sortie.push({ section, si, texte });
  });
  return sortie;
}

/** Clé stable d'une slide de contenu, partagée entre l'énumération et le rendu. */
function slideKeyOf(chapterIdx: number, sectionIdx: number, chunkIdx: number): string {
  return `${chapterIdx}_${sectionIdx}_${chunkIdx}`;
}

/** Découpage du texte d'une rubrique : pages plus pleines quand son schéma a sa propre page (ou qu'elle n'en a pas,
 *  dans la mise en page « 1 à 2 pages de texte, puis 1 page de schéma »). */
function limitesSection(section: AssembleSection, theme: string): LimitesPage | undefined {
  if (!section.schemaPleinePage && !section.texteSeul) return undefined;
  if (pagesMarineV3(theme)) return LIMITES_MARINE_V3;
  return estRetourArriere(theme) ? LIMITES_TEXTE_SEUL.ancienThemeV2 : LIMITES_TEXTE_SEUL.refonte;
}

/** Pages statiques « Ils nous font confiance » après ce chapitre : choix explicite du plan (réponse libre v2), sinon
 *  règle d'origine (après le chapitre I). */
function avecPagesReferences(chapter: AssembleChapter): boolean {
  return chapter.pagesReferences ?? (chapter.key === 'I' || chapter.key === '1');
}

/** Ouverture de bloc : au-delà de ce nombre de rubriques, liste resserrée pour tenir sur la page. */
const RUBRIQUES_OUVERTURE_COMPACTE = 11;

/** Titre d'une page de schéma : une ligne, sans balise. */
function titreSchema(t?: string): string {
  return String(t || '').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').replace(/^#+\s*/, '').trim();
}

export interface AssembleSection {
  title: string;
  text: string;
  id?: string;
  illustration?: string;
  d2Code?: string;
  d2SvgFileName?: string;
  /** Photos ajoutées à la rubrique avec l'assistant de modification : une page par photo, après le texte. */
  photos?: Array<{ chemin: string; legende?: string }>;
  /**
   * Mise en page « 1 à 2 pages de texte, puis 1 page de schéma » (1 schéma = 1 page, en grand) : le schéma de la
   * rubrique (SVG sur une ligne, identifiants uniques, format page du moteur de schémas) et son titre-message. Les
   * pages de texte de la rubrique n'ont alors plus de schéma dessous.
   */
  schemaPleinePage?: { titre?: string; svg: string };
  /**
   * Mise en page « 1 à 2 pages de texte, puis 1 page de schéma » pour une rubrique SANS schéma (réponse libre v2) :
   * pages de texte pleines, aucun schéma sous le texte.
   */
  texteSeul?: boolean;
}

export interface AssembleChapter {
  key: string;
  title: string;
  sections: AssembleSection[];
  /**
   * Pages statiques « Ils nous font confiance » (gss_memoire_master.md) à la fin de ce chapitre. Absent : règle
   * d'origine (après le chapitre I). La réponse libre v2 le fixe pour chaque chapitre (bloc Présentation, ou aucun
   * quand le mémoire type contient ses propres rubriques de références).
   */
  pagesReferences?: boolean;
}

export interface CoverInfo {
  client?: string;
  title?: string;
  ref?: string;
  objet?: string;
}

// ─── Main Generator ───
export class MarpGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    const baseDir = path.resolve(__dirname, '../../../../');
    this.outputDir = outputDir || path.resolve(baseDir, 'response');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * Énumère, dans l'ORDRE DE RENDU, toutes les slides de contenu (une par chunk
   * de section) avec leur clé stable. Utilisé en amont pour attribuer les images
   * selon le contexte : `buildMarkdown` recalcule EXACTEMENT les mêmes clés.
   */
  public static enumerateContentSlides(chapters: AssembleChapter[], theme: string = themeActif()): SlideContext[] {
    const slides: SlideContext[] = [];
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections || chapter.sections.length === 0) return;
      sectionsAPaginer(chapter, theme).forEach(({ section, si, texte, sansPageTexte }) => {
        const chunks = sansPageTexte ? [] : splitIntoSlideChunks(texte, limitesSection(section, theme));
        chunks.forEach((chunk, k) => {
          slides.push({ key: slideKeyOf(ci, si, k), title: section.title, text: chunk });
        });
      });
    });
    return slides;
  }

  /**
   * Generate a full Marp markdown document from chapters + sections,
   * then render it to PDF using @marp-team/marp-cli.
   * Returns the path to the generated PDF.
   */
  public async generatePdf(
    chapters: AssembleChapter[],
    cover: CoverInfo = {},
    assignments: SlideAssignments = new Map(),
    schemas: SlideSchemas = new Map(),
    opts: { theme?: string } = {},
  ): Promise<{ filePath: string; markdownPath: string }> {
    // Thème de style (themes.ts) : celui du mémoire déjà rendu s'il est fourni, sinon GSS_THEME / style par défaut.
    const theme = themeActif(opts.theme);
    // Write markdown + copy assets to a temp working directory
    const workDir = path.join(this.outputDir, `marp_work_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const cssPath = path.join(workDir, 'gss-theme.css');
    const logoSrc = path.join(MARP_ASSETS_DIR, 'logogss.png');
    const logoDst = path.join(workDir, 'logogss.png');

    // Check if css exists
    const cssSrc = path.join(MARP_ASSETS_DIR, 'gss-theme.css');
    if (fs.existsSync(cssSrc)) {
      if (estRetourArriere(theme)) {
        fs.copyFileSync(cssSrc, cssPath);
      } else {
        // Variables du thème, polices embarquées (aucune dépendance réseau) et mise en page de la refonte.
        fs.writeFileSync(cssPath, feuilleMarp(theme, fs.readFileSync(cssSrc, 'utf-8')), 'utf-8');
        for (const image of imagesTheme(theme)) {
          if (fs.existsSync(image)) fs.copyFileSync(image, path.join(workDir, path.basename(image)));
        }
      }
    } else {
      console.warn(`[MarpGenerator] Warning: CSS file not found at ${cssSrc}`);
    }

    if (fs.existsSync(logoSrc)) {
      fs.copyFileSync(logoSrc, logoDst);
    }

    const mediaSrc = path.join(MARP_ASSETS_DIR, 'media');
    const mediaDst = path.join(workDir, 'media');
    if (fs.existsSync(mediaSrc)) {
      fs.cpSync(mediaSrc, mediaDst, { recursive: true });
    } else {
      fs.mkdirSync(mediaDst, { recursive: true });
    }

    // Traitement et compilation des schémas D2 pour chaque section (doit être fait AVANT buildMarkdown)
    await this.processD2Diagrams(chapters, mediaDst, cover.client || 'Client');

    const markdown = this.buildMarkdown(chapters, cover, assignments, schemas, theme);
    const mdPath = path.join(workDir, 'memoire_template.md');
    fs.writeFileSync(mdPath, markdown, 'utf-8');

    // Écrit dans media/ UNIQUEMENT les images réellement attribuées (unicité déjà
    // garantie en amont) → media/<fileName> référencé par le markdown.
    if (assignments.size > 0) {
      fs.mkdirSync(mediaDst, { recursive: true });
      const written = new Set<string>();
      for (const illus of assignments.values()) {
        if (written.has(illus.fileName)) continue;
        fs.writeFileSync(path.join(mediaDst, illus.fileName), illus.data);
        written.add(illus.fileName);
      }
      // Réduit les images « db_ » à leur taille d'affichage : les images pleine
      // résolution ralentissent énormément (voire bloquent) le rendu Chromium.
      this.downscaleDbImages(mediaDst);
    }

    // Render to PDF via marp-cli
    const pdfName = `Mémoire_Technique_GSS_Template_${Date.now()}.pdf`;
    const pdfPath = path.join(this.outputDir, pdfName);

    console.log(`[MarpGenerator] Rendering PDF with Template: ${mdPath} → ${pdfPath}`);

    // Sous Windows, npx est « npx.cmd » : spawnSync('npx') échoue en ENOENT, et le spawn direct
    // d'un .cmd est désormais bloqué par Node (EINVAL, suite à CVE-2024-27980). On passe donc par
    // le shell sur Windows. Comme shell:true concatène les arguments SANS les échapper, on
    // guillemète les chemins (susceptibles de contenir des espaces).
    const isWin = process.platform === 'win32';
    const q = (p: string) => (isWin ? `"${p}"` : p);

    let chromePath: string | undefined = process.env.CHROME_PATH;
    if (!chromePath) {
      // Utilise le Chromium embarqué par puppeteer (installé via npm install)
      try {
        const puppeteer = require('puppeteer');
        chromePath = puppeteer.executablePath();
        console.log(`[MarpGenerator] Chromium trouvé via puppeteer: ${chromePath}`);
      } catch (e) {
        console.warn('[MarpGenerator] puppeteer non disponible, recherche système…');
      }
    }
    if (!chromePath) {
      // Fallback : chercher dans le système
      try {
        chromePath = require('child_process').execSync('which chromium || which chromium-browser || which google-chrome').toString().trim();
      } catch (e) {
        console.warn('[MarpGenerator] Aucun navigateur trouvé sur le système.');
      }
    }
    console.log(`[MarpGenerator] CHROME_PATH final: ${chromePath || 'NON DÉFINI'}`);

    // Utilise le binaire marp-cli installé localement (en dependencies) au lieu de npx
    const marpBin = path.resolve(__dirname, '../../node_modules/.bin/marp');
    const useMarpBin = !isWin && fs.existsSync(marpBin);
    const cmd = useMarpBin ? marpBin : 'npx';
    // Options de Chrome : Marp CLI 4.4 n'a aucune option pour en transmettre (l'ancienne « --puppeteer-launch-args »
    // n'existe pas et était ignorée). Il ajoute lui-même --no-sandbox en conteneur ou en administrateur. Pour
    // --disable-dev-shm-usage (conteneur Linux, /dev/shm limité), CHROME_PATH désigne un lanceur qui l'ajoute.
    const lanceur = lanceurChromeConteneur(chromePath);
    const baseArgs = [
      q(mdPath), '--theme', q(cssPath), '--pdf', '-o', q(pdfPath),
      '--allow-local-files', '--html', '--no-stdin',
    ];
    const args = useMarpBin
      ? baseArgs
      : ['-y', '@marp-team/marp-cli@latest', ...baseArgs];

    const result = spawnSync(
      cmd,
      args,
      {
        cwd: workDir,
        // 15 min max : un mémoire de ~180 pages avec un schéma par page peut dépasser 5 min de rendu
        // (machine chargée, rendus simultanés) — l'ancienne limite faisait échouer la génération à la toute fin.
        timeout: 900_000,
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: isWin,
        // Marp/Puppeteer abandonne la conversion après 30 s par défaut : insuffisant
        // pour un mémoire volumineux illustré d'images (base de données). On aligne
        // ce délai interne sur le timeout du process (cause du « Timed out after 30000ms »).
        env: { 
          ...process.env, 
          PUPPETEER_TIMEOUT: '900000',
          PUPPETEER_PROTOCOL_TIMEOUT: '900000',
          CHROME_PATH: lanceur || chromePath || '',
          ...(lanceur ? { GSS_CHROME_REEL: chromePath } : {}),
        },
      }
    );

    if (result.error) {
      console.error('[MarpGenerator] marp-cli spawn error:', result.error);
      throw new Error(`Marp CLI failed to start: ${result.error.message}`);
    }

    if (result.status !== 0) {
      console.error('[MarpGenerator] marp-cli stderr:', result.stderr);
      throw new Error(`Marp CLI exited with code ${result.status}: ${result.stderr?.slice(0, 500)}`);
    }

    console.log(`[MarpGenerator] PDF generated successfully: ${pdfPath}`);

    // Cleanup work directory (keep only the PDF)
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }

    return { filePath: pdfPath, markdownPath: mdPath };
  }

  /**
   * Scanne et compile tous les schémas D2 des sections en images SVG dans le dossier media.
   * Si la section contient un bloc ```d2 ... ```, il est extrait et compilé.
   */
  private async processD2Diagrams(chapters: AssembleChapter[], mediaDir: string, clientName: string): Promise<void> {
    const promises: Promise<void>[] = [];
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections) return;
      chapter.sections.forEach((section, si) => {
        let d2Code = section.d2Code || '';

        // Extrait du code D2 noyé dans le texte de la section
        if (!d2Code && section.text && section.text.includes('```d2')) {
          const match = section.text.match(/```d2([\s\S]*?)```/);
          if (match) {
            d2Code = match[1].trim();
            section.text = section.text.replace(/```d2[\s\S]*?```/g, '').trim();
          }
        }

        if (!d2Code) return;

        const compilePromise = (async () => {
          try {
            const fileName = `schema_${ci}_${si}.svg`;
            const filePath = path.join(mediaDir, fileName);

            const svgBuffer = await D2Service.compileD2ToSvg(d2Code);
            fs.writeFileSync(filePath, svgBuffer);
            section.d2SvgFileName = fileName;
            console.log(`[MarpGenerator] Schéma D2 compilé avec succès: ${fileName}`);
          } catch (e: any) {
            console.warn(`[MarpGenerator] Échec compilation D2 pour section ${section.title}:`, e.message || e);
          }
        })();
        promises.push(compilePromise);
      });
    });
    await Promise.all(promises);
  }

  /**
   * Réduit (in place) les images « db_ » du dossier media à leur taille
   * d'affichage via Pillow. Étape best-effort : si Python/Pillow est absent ou
   * échoue, on conserve les images d'origine (le rendu reste possible).
   */
  private downscaleDbImages(mediaDir: string): void {

    try {
      const script = path.resolve(__dirname, '../../python/downscale_images.py');
      if (!fs.existsSync(script)) return;
      const pythonBin = this.findPythonBin();
      if (!pythonBin) {
        console.warn('[MarpGenerator] Redimensionnement images ignoré (aucun interpréteur Python trouvé).');
        return;
      }
      const isWin = process.platform === 'win32';
      const q = (p: string) => (isWin ? `"${p}"` : p);
      const proc = spawnSync(
        pythonBin,
        [q(script), '--dir', q(mediaDir), '--max', '1000', '--prefix', 'db_'],
        { encoding: 'utf-8', timeout: 120_000, shell: isWin },
      );
      if (proc.status === 0 && proc.stdout) {
        console.log(`[MarpGenerator] Redimensionnement images: ${proc.stdout.trim()}`);
      } else if (proc.error || proc.status !== 0) {
        console.warn(
          `[MarpGenerator] Redimensionnement images ignoré (${proc.error?.message || 'status ' + proc.status}).`,
        );
      }
    } catch (err: any) {
      console.warn(`[MarpGenerator] Redimensionnement images ignoré: ${err.message || err}`);
    }
  }

  /**
   * Détecte le binaire Python disponible sur le système.
   * Priorité : variable d'env PYTHON_BIN, puis python3 / python / py.
   */
  private findPythonBin(): string | null {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
    const isWin = process.platform === 'win32';
    const candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
    for (const bin of candidates) {
      try {
        const check = spawnSync(bin, ['--version'], {
          encoding: 'utf-8',
          timeout: 5_000,
          shell: isWin,
          stdio: 'pipe',
        });
        if (!check.error && check.status === 0) {
          console.log(`[MarpGenerator] Python trouvé: ${bin} → ${(check.stdout || '').trim()}`);
          return bin;
        }
      } catch { /* essai suivant */ }
    }
    return null;
  }

  /**
   * Build the full Marp markdown string.
   */
  private buildMarkdown(
    chapters: AssembleChapter[],
    cover: CoverInfo = {},
    assignments: SlideAssignments = new Map(),
    schemas: SlideSchemas = new Map(),
    theme: string = themeActif(),
  ): string {
    const lines: string[] = [];
    // Thèmes de la refonte : ouverture de bloc numérotée avec ses rubriques, organigramme et schémas en pleine page.
    // Retour arrière (« gss-2026-09 ») : Markdown identique à celui d'avant les thèmes.
    const refonte = !estRetourArriere(theme);
    // Style « marine » v3 (planche validée, décision D11) : gabarits de pages de la planche (marp_pages_marine.ts).
    const v3 = pagesMarineV3(theme);
    const st = v3 ? styleDuTheme(theme) : null;
    const couleurs: CouleursV3 | null = st ? { marine: st.couleurs.structure, accent: st.couleurs.accent,
      clair: st.couleurs.clair_sur_structure, structure2: st.couleurs.structure_2 } : null;
    const visibles = chapters.filter((c) => c.sections && c.sections.length > 0);
    const rangBloc = (c: AssembleChapter) => visibles.indexOf(c) + 1;
    const enteteDe = (c: AssembleChapter) => enteteBloc(this.romanToNumber(c.key), c.title);

    // ── Frontmatter ──
    lines.push('---');
    lines.push('marp: true');
    lines.push('theme: gss');
    lines.push('size: a4');
    lines.push('paginate: true');
    lines.push("header: 'GLOBAL SECURITY SERVICES'");
    // Style « marine » v3 : pied de page « Mémoire technique · acheteur ».
    if (v3) lines.push(`footer: '${`Mémoire technique${cover.client ? ` · ${cover.client}` : ''}`.replace(/[\r\n]+/g, ' ').replace(/'/g, "''")}'`);
    lines.push('---');
    lines.push('');
    if (v3 && couleurs) {
      lines.push(styleParcours(visibles.length, couleurs.structure2, couleurs.accent));
      lines.push('');
    }
    if (fs.existsSync(LEXEND_PATH)) {
      // Police des schémas GSS : embarquée une seule fois pour tout le document.
      const b64 = fs.readFileSync(LEXEND_PATH).toString('base64');
      lines.push(`<style>@font-face{font-family:'Lexend';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:100 900;}</style>`);
      lines.push('');
    }

    // ── Cover page (lead) ──
    lines.push('<!-- _class: lead -->');
    lines.push('');
    if (v3 && couleurs) {
      // Style « marine » v3 : couverture, puis sommaire (une entrée par bloc, légende des schémas), comme la planche.
      lines.push(couvertureV3(cover, couleurs));
      lines.push('');
      const blocsSommaire = visibles.map((chapter) => ({
        numero: this.romanToNumber(chapter.key), titre: chapter.title,
        rubriques: [...chapter.sections.map((sec) => sec.title), ...(avecPagesReferences(chapter) && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])],
      }));
      const legende = legendeRoles(Object.fromEntries(Object.entries(st.roles).map(([k, v]: [string, any]) => [k, v.fonce])), pictosLegende(),
        couleurs, st.couleurs.filet_fort);
      for (const page of sommaireV3(blocsSommaire, cover.client || '', legende)) {
        lines.push('---');
        lines.push(page);
      }
      return this.buildChapitres(lines, chapters, assignments, schemas, theme, { v3, refonte, couleurs, visibles, rangBloc, enteteDe, client: cover.client || '' });
    }
    lines.push('# GLOBAL SECURITY SERVICES');
    lines.push('## VOTRE PARTENAIRE SÉCURITÉ');
    lines.push('### MÉMOIRE TECHNIQUE');
    if (cover.objet || cover.title) {
      lines.push(`#### ${(cover.objet || cover.title || '').toUpperCase()}`);
    } else {
      lines.push('#### SÉCURITÉ INCENDIE & SÛRETÉ');
    }

    if (cover.client) {
      lines.push('');
      lines.push(`##### ${cover.client.toUpperCase()}`);
    }
    lines.push('');

    // ── Table of contents ──
    lines.push('---');
    lines.push('<!-- _header: "" -->');
    lines.push('');
    lines.push('## SOMMAIRE');
    lines.push('');

    let tocItemCount = 0;
    const tocPages: string[][] = [[]];

    for (const chapter of chapters) {
      if (!chapter.sections || chapter.sections.length === 0) continue;

      const chapterLine = `${this.romanToNumber(chapter.key)}. __${chapter.title.toUpperCase()}__`;

      // Numérotation des rubriques propre à chaque chapitre (1, 2, 3… rendus i, ii, iii) : un compteur
      // global faisait démarrer les chapitres suivants à 6, 13… (sommaire « 6. 7. … 11 »).
      // Les pages de références « Ils nous font confiance » suivent le chapitre I : elles figurent au sommaire.
      const titresToc = [...chapter.sections.map((sec) => sec.title), ...(avecPagesReferences(chapter) && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])];
      // Thèmes de la refonte : un chapitre qui ne tient plus sur la page en cours passe entier à la page suivante
      // (une sous-liste reprise en milieu de chapitre, « 9. », ne peut pas suivre la ligne du chapitre en Markdown).
      if (refonte && tocPages[tocPages.length - 1].length && tocPages[tocPages.length - 1].length + 1 + titresToc.length > 28) tocPages.push([]);
      tocPages[tocPages.length - 1].push(chapterLine);
      tocItemCount++;
      titresToc.forEach((titre, idx) => {
        const sectionLine = `\t${idx + 1}. __${titre.toUpperCase()}__`;
        tocPages[tocPages.length - 1].push(sectionLine);
        tocItemCount++;

        // Split TOC across pages if it gets too long (~18 items per page)
        if (tocPages[tocPages.length - 1].length >= (refonte ? 28 : 18)) {
          // Thèmes de la refonte (corps de texte plus petit) : 28 lignes par page ; tous les thèmes, retour arrière compris : la
          // page suivante reprend la ligne du chapitre en cours (sinon la sous-rubrique qui l'ouvre, « \t5. __…__ » en tête
          // de page, était lue comme un bloc de code : sommaire de la recomposition v1 becquerel et d'un état v1 réel).
          // Ligne vide après la ligne du chapitre : la sous-liste reprise (« 28. ») ne peut pas interrompre un paragraphe.
          tocPages.push(idx < titresToc.length - 1 ? [chapterLine, ''] : []);
        }
      });
    }

    // First TOC page already has the "## SOMMAIRE" header
    if (tocPages[0]) {
      for (const item of tocPages[0]) {
        lines.push(item);
      }
    }

    // Additional TOC pages
    for (let i = 1; i < tocPages.length; i++) {
      if (tocPages[i].length === 0) continue;
      lines.push('');
      lines.push('---');
      lines.push('<!-- _header: "" -->');
      lines.push('');
      lines.push('## SOMMAIRE');
      lines.push('');
      for (const item of tocPages[i]) {
        lines.push(item);
      }
    }

    lines.push('');

    return this.buildChapitres(lines, chapters, assignments, schemas, theme, { v3, refonte, couleurs, visibles, rangBloc, enteteDe, client: cover.client || '' });
  }

  /**
   * Pages des chapitres (ouvertures de bloc, pages de texte, pages de schéma, photos, organigramme, références), à la suite
   * du Markdown déjà écrit (page de garde et sommaire). Style « marine » v3 (ctx.v3) : gabarits de la planche validée ;
   * autres thèmes : Markdown inchangé.
   */
  private buildChapitres(
    lines: string[],
    chapters: AssembleChapter[],
    assignments: SlideAssignments,
    schemas: SlideSchemas,
    theme: string,
    ctx: { v3: boolean; refonte: boolean; couleurs: CouleursV3 | null; visibles: AssembleChapter[]; rangBloc: (c: AssembleChapter) => number;
      enteteDe: (c: AssembleChapter) => string; client: string },
  ): string {
    const { v3, refonte } = ctx;
    // ── Chapters & sections ──
    chapters.forEach((chapter, ci) => {
      if (!chapter.sections || chapter.sections.length === 0) return;

      // Intercalaire (chapter divider page)
      lines.push('---');
      lines.push('<!-- _class: intercalaire -->');
      lines.push(`<!-- _header: "" -->`);
      lines.push('');
      if (v3 && ctx.couleurs) {
        // Style « marine » v3 : grand numéro orange, titre du bloc, rubriques, parcours du mémoire.
        const titresBloc = [...chapter.sections.map((sec) => sec.title), ...(avecPagesReferences(chapter) && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])];
        lines.push(ouvertureV3(this.romanToNumber(chapter.key), chapter.title, titresBloc, ctx.visibles.map((c) => c.title), ctx.client, ctx.couleurs));
        lines.push('');
      } else if (refonte) {
        // Ouverture de bloc (planche de l'agent design) : numéro du bloc en grand, comme au sommaire.
        lines.push(`<div class="gss-bloc-numero">${String(this.romanToNumber(chapter.key)).padStart(2, '0')}</div>`);
        lines.push('');
      }
      if (!v3) lines.push(`# ${chapter.title.toUpperCase()}`);
      if (!v3) lines.push('');
      if (refonte && !v3) {
        // … puis les rubriques du bloc, dans l'ordre et avec les titres du sommaire.
        const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const titresBloc = [...chapter.sections.map((sec) => sec.title), ...(avecPagesReferences(chapter) && this.getReferencesSlides().length ? ['Ils nous font confiance'] : [])];
        // Bloc chargé (réponse libre v2 : jusqu'à une vingtaine de rubriques) : liste resserrée pour tenir sur la page.
        const classe = titresBloc.length > RUBRIQUES_OUVERTURE_COMPACTE ? 'gss-bloc-rubriques compacte' : 'gss-bloc-rubriques';
        lines.push(`<ul class="${classe}">${titresBloc.map((t) => `<li>${echapper(t)}</li>`).join('')}</ul>`);
        lines.push('');
      }

      // Sections
      sectionsAPaginer(chapter, theme).forEach(({ section, si, texte: cleanedText, sansPageTexte }) => {
        const headerTitle = section.title.toUpperCase();
        const limites = limitesSection(section, theme);
        // Texte regroupé sur la page de la rubrique précédente : seule la page de schéma reste à rendre.
        const chunks = sansPageTexte ? [] : splitIntoSlideChunks(cleanedText, limites);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          lines.push('---');
          if (v3) {
            // Style « marine » v3 : en-tête du bloc, parcours, surtitre et titre en tête de la rubrique, colonne de titrage ;
            // texte court (une seule page, sous 1 300 signes, suivie de son schéma) : corps plus grand et « l'essentiel ».
            const court = chunks.length === 1 && !!section.schemaPleinePage && signes(chunk) < SEUIL_TEXTE_COURT;
            const classes = ['texte', court ? 'court' : '', !court && pageSerree(chunk, limites) ? 'texte-serre' : '', `bloc-${ctx.rangBloc(chapter)}`];
            lines.push(`<!-- _class: ${classes.filter(Boolean).join(' ')} -->`);
            lines.push(ctx.enteteDe(chapter));
            lines.push(repereRubrique(section.title));
            lines.push('');
            const [sur, titre] = surEtTitre(section.title, chapter.title);
            if (i === 0) {
              if (!memesTitres(sur, titre)) lines.push(surtitre(sur), '');
              lines.push(`# ${typoV3(titre.replace(/[<>]/g, ''))}`, '');
            } else {
              lines.push(surtitre(`${section.title} (suite)`), '');
            }
            lines.push(typoV3(chunk));
            lines.push('');
            const essentiel = court ? essentielV3(chunk) : null;
            if (essentiel) lines.push(essentiel, '');
          } else {
          if (pageSerree(chunk, limites)) lines.push('<!-- _class: texte-serre -->');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(chunk);
          lines.push('');
          }

          // Rubrique dont le schéma a sa propre page (ou rubrique v2 sans schéma) : aucun schéma sous le texte.
          if (section.schemaPleinePage || section.texteSeul) continue;
          const schemaGss = schemas.get(slideKeyOf(ci, si, i));
          if (schemaGss) {
            // Un schéma GSS par page, à l'emplacement réservé à l'illustration (sous le texte).
            // Largeur du texte (plus grand qu'avant, centrage et marges latérales symétriques conservés).
            lines.push(`<div class="schema-gss" style="width: 100%; margin: 15px auto 0;">`);
            lines.push(schemaGss.replace('<svg ', '<svg style="display: block; width: 100%; height: auto; max-height: 440px; margin: 0 auto;" '));
            lines.push(`</div>`);
            lines.push('');
            continue;
          }

          const hasSchema = section.d2SvgFileName && i === chunks.length - 1;
          const illus = assignments.get(slideKeyOf(ci, si, i));

          if (hasSchema) {
            lines.push(`<div style="text-align: center; margin: 15px 0; width: 100%;">`);
            lines.push(`  <img src="./media/${section.d2SvgFileName}" alt="Schéma - ${section.title.replace(/"/g, '&quot;')}" style="width: 85%; height: auto; max-height: 440px; object-fit: contain; display: block; margin: 0 auto;" />`);
            lines.push(`</div>`);
            lines.push('');
            lines.push(`<div class="box" style="margin-top: 0.5rem; font-size: 0.85em; padding: 0.5rem;">`);
            lines.push(`⚠️ Dispositif sur-mesure : l'architecture technique et humaine présentée répond spécifiquement aux exigences de sécurité de ce chapitre.`);
            lines.push(`</div>`);
            lines.push('');
          }

          if (illus && !hasSchema) {
            // Illustration attribuée à CETTE slide selon son contexte (ignorée s'il y a déjà un schéma D2).
            lines.push(`![${illus.alt}](media/${illus.fileName})`);
            lines.push('');
          }
        }

        // Page de schéma (1 à 2 pages de texte, puis 1 page de schéma) : le titre-message du schéma, puis le schéma
        // en grand, sans autre texte (toile portrait du moteur de schémas : dessin sur au moins 85 % de la hauteur utile).
        if (section.schemaPleinePage?.svg) {
          lines.push('---');
          lines.push(v3 ? `<!-- _class: schema bloc-${ctx.rangBloc(chapter)} -->` : '<!-- _class: schema -->');
          lines.push(v3 ? ctx.enteteDe(chapter) : `<!-- header: "${headerTitle}" -->`);
          if (v3) lines.push(repereRubrique(section.title));
          lines.push('');
          const titre = titreSchema(section.schemaPleinePage.titre);
          // Style « marine » v3 : la rubrique en surtitre, masquée si elle répète le titre du schéma.
          // Surtitre masqué : sa place est gardée (titre et schéma au même endroit sur toutes les pages de schéma).
          if (v3) lines.push(memesTitres(section.title, titre) ? '<div class="gss-sur gss-sur-vide"></div>' : surtitre(section.title), '');
          if (titre) {
            lines.push(`## ${v3 ? typoV3(titre) : titre}`);
            lines.push('');
          }
          lines.push('<div class="schema-page">');
          lines.push(section.schemaPleinePage.svg.replace(/\s*\n\s*/g, ' ').trim());
          lines.push('</div>');
          lines.push('');
        }

        // Photos ajoutées par l'utilisateur (assistant de modification) : une page par photo, à la suite
        // du texte de la rubrique. Sans photo, rien ne change.
        for (const photo of section.photos || []) {
          let src = '';
          try {
            const ext = path.extname(photo.chemin).toLowerCase() === '.png' ? 'png' : 'jpeg';
            src = `data:image/${ext};base64,${fs.readFileSync(photo.chemin).toString('base64')}`;
          } catch { continue; }
          const legende = (photo.legende || '').replace(/[<>]/g, '');
          lines.push('---');
          if (v3) lines.push(`<!-- _class: photo bloc-${ctx.rangBloc(chapter)} -->`);
          lines.push(v3 ? ctx.enteteDe(chapter) : `<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(`<div class="photo-gss" style="width: 100%; margin: 20px auto 0; text-align: center;">`);
          lines.push(`<img src="${src}" alt="${legende.replace(/"/g, '&quot;')}" style="display: block; max-width: 100%; max-height: 470px; height: auto; margin: 0 auto; border-radius: 4px;" />`);
          if (legende) lines.push(`<p style="margin-top: 10px; font-size: 0.8em; font-style: italic;">${legende}</p>`);
          lines.push(`</div>`);
          lines.push('');
        }

        // Organigramme GSS (section encadrement) : dessiné dans le design validé des schémas GSS,
        // contenu identique à l'ancienne image organigramme.png. Intégré dans la page (police Lexend).
        // Rubrique qui a déjà son schéma en pleine page (mémoire type) : pas d'organigramme en plus.
        const organigramme = section.id === 'b_encadrement' && !section.schemaPleinePage ? lireOrganigrammeGss(theme) : null;
        if (organigramme && refonte) {
          // Thème de la refonte : l'organigramme est une page de schéma (format page, en grand).
          lines.push('---');
          lines.push(v3 ? `<!-- _class: schema bloc-${ctx.rangBloc(chapter)} -->` : '<!-- _class: schema -->');
          lines.push(v3 ? ctx.enteteDe(chapter) : `<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push('<div class="schema-page">');
          lines.push(organigramme);
          lines.push('</div>');
          lines.push('');
        } else if (organigramme) {
          lines.push('---');
          lines.push(`<!-- header: "${headerTitle}" -->`);
          lines.push('');
          lines.push(`<div class="schema-gss" style="width: 100%; margin: 40px auto 0;">`);
          lines.push(organigramme.replace('<svg ', '<svg style="display: block; width: 100%; height: auto; margin: 0 auto;" '));
          lines.push(`</div>`);
          lines.push('');
        }

        // Dynamic illustrations mapping based on section id
        const illustrationMap: Record<string, string> = {
          // More illustrations will be added here pas à pas
        };

        if (section.id && illustrationMap[section.id] && !section.d2SvgFileName) {
          lines.push('---');
          lines.push('<!-- _class: lead -->');
          lines.push('<!-- _header: "" -->');
          lines.push(`![bg contain](media/${illustrationMap[section.id]})`);
          lines.push('');
        }


      });

      if (avecPagesReferences(chapter)) {
        const refSlides = this.getReferencesSlides();
        for (const slide of refSlides) {
          lines.push('---');
          if (v3) {
            // Style « marine » v3 : en-tête du bloc et mise en page neutre (pas de colonne de titrage).
            lines.push(`<!-- _class: references bloc-${ctx.rangBloc(chapter)} -->`);
            lines.push(slide.replace(/<!--\s*header:\s*"[^"]*"\s*-->/g, ctx.enteteDe(chapter)));
          } else {
          lines.push(slide);
          }
          lines.push('');
        }
      }
    });

    return lines.join('\n');
  }

  /**
   * Extract the static references slides from the master template.
   */
  private getReferencesSlides(): string[] {
    try {
      const masterPath = path.join(MARP_ASSETS_DIR, 'gss_memoire_master.md');
      if (!fs.existsSync(masterPath)) return [];
      const content = fs.readFileSync(masterPath, 'utf-8');
      const slides = content.replace(/\r\n/g, '\n').split('\n---');
      const refSlides: string[] = [];
      let inRef = false;

      for (const slide of slides) {
        const cleanSlide = slide.trim();
        const norm = cleanSlide.toUpperCase();

        if (norm.includes('ILS NOUS ONT FAIT CONFIANCEZONE D’IMAGE') || norm.includes('ILS NOUS ONT FAIT CONFIANCEZONE D\'IMAGE')) {
          inRef = true;
        } else if (norm.includes('LES MOYENS HUMAINS')) {
          inRef = false;
        }

        if (inRef) {
          // Le repère « Zone d’image » du modèle sert à détecter les pages de références ; il ne doit
          // jamais apparaître dans le PDF : la ligne titre devient l'en-tête de page.
          refSlides.push(
            cleanSlide
              .replace(/^ILS NOUS ONT FAIT CONFIANCE\s*Zone d[’']image\s*$/m, '<!-- header: "ILS NOUS ONT FAIT CONFIANCE" -->\n')
              .replace(/Zone d[’']image/g, '')
              // Pages de la distribution titrées « I. PRESENTATION » / « PRESENTATION » dans le modèle : même
              // en-tête que les autres pages de références.
              .replace(/<!--\s*header:\s*"(?:I\.\s*)?PRESENTATION"\s*-->/g, '<!-- header: "ILS NOUS FONT CONFIANCE" -->')
              .trim(),
          );
        }
      }
      return refSlides;
    } catch (err) {
      console.error('[MarpGenerator] Error reading references slides:', err);
      return [];
    }
  }

  /**
   * Convert roman numeral key to number for TOC numbering.
   */
  private romanToNumber(key: string): number {
    const map: Record<string, number> = {
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
      'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
    };
    return map[key.toUpperCase()] || parseInt(key, 10) || 1;
  }
}
