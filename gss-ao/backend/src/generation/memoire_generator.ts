import { MarpGenerator, AssembleChapter, AssembleSection, decouperPagesTexte } from './marp_generator';
import { ImageLibraryService } from './image_service';
import { D2Service } from './d2_service';
import { SchemaService, PageSchema, dessinerSpecs, finaliserSvg } from './schema_service';
import { insererSchemasReponses, choisir as choisirSchemasGss, schemasSelonDce, phraseContraireAuDce } from './visuels_cadre';
import { FormatImpose, PartieCourte, passagesLimitePages, passagesContenuOffre, limitePagesMemoire, phraseLimitePages, rendreFormatCourt, renvoisVersParties, nettoyerEngagements, voixDeGss, RX_LIMITE_PAR_PARTIE, pagesDesParties } from './format_court';
import { actualiserOrganigramme, organigrammeSvg } from './organigramme';
import { themeActif, schemasBibliotheque, estRetourArriere } from './themes';
import { poserSignets, poserSignetsChamps, preciserQuestionsCadre, regrouperQuestions, completerGrilleCandidature, CHAMP_GRILLE_CANDIDATURE, DEBUT_CHAMP, FIN_CHAMP, formulerQuestions, ecrireEtat, lireEtat, integrerDansRubrique, REPERE, REPERE_RE, MARQUE_CHAMP, ElementACompleter, EtatCompletion, REPERE_TECHNIQUE, questionsDesEmplacements, libelleDuRepere } from './completion';
import {
  chargerMemoireType, preparerMemoireType, reinitialiserJournalIndicateurs, publierMemoire, exigencesParRubrique, extraireValeursImposees, adapterRubrique,
  obligationsPourRubrique, donneesBesoin, themesPourMatrice, lireJson, estPlanV2, fidelite, SEUIL_FIDELITE,
  type MemoireType, type MemoirePrepare, type ContexteMarche, type AppelModele, type PlanMemoireType, type ExigenceMatrice,
  type DonneesBesoin, type RubriquePubliee, normaliser, formesClient, indicateursVrais, harmoniserNomClient, harmoniserVariantesAcheteur, formeCourteApresPremiere, phrasesGeneralesProtegees, ajoutContraireAuxDelaisGss,
  variablesDesSchemas, lotsDuMemoire, nomAcheteurAffiche, nomAcheteurCourtAffiche, rubriqueAdmetSujet, rechercherRubriques, rubriqueDuTheme,
  phrasesDeFrequenceDeControle, frequenceMensuelle, CLAUSE_PRIX, rubriqueDeLAjout,
  intituleSansRedite,
  motsDePhrase, similarite, lireRegistre,
  acheteurDuDce, objetDuDce,
  variableRenseignee, envoiPlanningsClientDce, phraseFrequenceReunionsDce, frequenceInopinesDce,
} from './memoire_type';
import {
  memoireTypeActif, rubriquesV2, sectionsV2, blocPagesReferences, titreSchemaMemoireType, CLE_SCHEMA, poserReperes, trierNouvelles, vocabulaireMemoireType,
  grouperNouvelles, idProposition, blocProposition, specProcessBesoin, specSecoursBesoin, texteSecoursBesoin, obligationsLisibles, analyseCompacte,
  sommaireProcess, renvoisHorsCadreRetires, consigneComprehension, consigneProposition, messagePropositions, enParallele, court, protegerGras, retablirGras, retirerAffirmationsQuestionnees, defautsEtapesBesoin, completerResultatBesoin, anomaliesSchemaBloc1, sansRediteDuPerimetre, plafonnerEngagementsPages, reduireBesoinAPages, exigenceTraitee, specSecoursPuces, specSecoursObligations, phraseDeRubriqueGss, alignerSchemaSurTexte, FORMALITES_OFFRE, questionFormalite, formalitesDuBloc1, sansClauseSanction, consultationsDuDce,
  CLAUSE_CONTRACTUELLE, ORGANISATION_ACHETEUR, sansPropositionSurLAcheteur, engagementSansRedite, reperesDansTableaux, valeursImposeesValides, titreSansPointFinal, completerBesoinMinimum, citationsCoherentes, nettoyerBloc1, libellesBloc1, messageEngagements, messageAjoutsAdaptation, retirerEngagementsRefuses, phraseAutour, planSelonRC, passagesPlanImpose, controlerProposition, resultatBesoin, retirerParagrapheEtapes,
  sansEngagementsEnDouble, sansEngagementsDejaDits, sansAjoutsRepetesEntreRubriques, similariteQuestions, recouvrementTextes, phraseAjouteeConjuguee, jalonEnvoiClient, harmoniserJalonPlanning, type AjoutLibre, type GroupeNouveau, type AdaptationCctp,
} from './reponse_libre_v2';
import { CONSIGNE_DIMENSIONNEMENT, exigenceDePosteDimensionne, reprendreMisesEnSituation, etapesSchemaDemande, calculerDimensionnement, extraitDimensionnement, texteDimensionnement, remplirCasPratique, questionDimensionnement, messageDimensionnement, completerMisesEnSituation, questionsMisesEnSituation, questionCouvertureCasPratique, questionRondes, casPratiqueRepris, type Dimensionnement } from './dimensionnement';
import { ajoutsAuTexteDeGss,
  type PartieRC, candidatsReference, blocReference, referencesRetenues, referencesPrincipales, nettoyerReponseCadre, signatureRubrique, cosinus, SEUIL_FIDELITE_CADRE, recalerSurReference, motsMaxChamp, libelleQuestionCadre, phrasesThematiques, completerParThematiques, completerMailUnique, COLONNE_VALEUR, colonneCase, sansPseudoTableau, textesSchemaSvg, ajusterPartiesLimitees, hauteurSchemaPt, geometrieCadre, paragraphesCadre, partiesDuDocument, hauteurPartie,
  consigneRepartition, lireRepartition, placeElementRC, selectionnerParPriorite, selectionnerDansPartie, repartirBudget, assemblerPartie, motsPartie,
  partiePourTexte, poidsPartie, rubriquesEssentielles, plafonnerEngagements, PIECES_ADMINISTRATIVES, reponseSousTraitance,
  attribuerRubriques, blocRenvois, completerDelaisCadre, ordonnerSelonReponse, questionHorsMemoireType, questionUtileChamp, questionComprehension, champValeur, intitulePrincipal, texteBrut,
  controlerFaitsNouveauxCadre, type SourcesFaitsCadre, type CandidatReference, motifRefusHarmonisation, completerSousTitresVides, retablirLignesLibelle, attendusDuChamp, attendusSansReponse,
  questionsPubliposteParEmplacement, questionDeLEmplacement, completerFamilles, referencesDeSecours, ecartEquipeTableau, questionAvecLibelle, regrouperQuestionsTelesurveillance,
} from './memoire_type_cadre';
import { articlesBloc1 } from './bloc1_marine';
import { SuiviAdaptations, adaptationsDuPubliposte, adaptationsDesValeursImposees, consultationsAdaptations, messageAdaptations, aValider, exigenceProche, phraseDuDceProche, phraseLisible, fondementDansDce, exigenceDeModification, ETAPE_ADAPTATION_MODELE, type PhraseAdaptee } from './adaptations_cctp';
import { questionCaseTableau, questionExacte, definirDceDesQuestions, avecDceDesQuestions, sansPropositionDeTiers } from './questions_gss';
import { typographieDce, exigenceDeGrillePenalites, estCahierDesChargesParContenu, estPieceAdministrative, teteAdministrative, perimetreDuLot, rechercherMemoires, blocMemoires, blocRegistre, REGLES_REUTILISATION, texteSourcesMemoires, extraireConfirmations, valeurRegistre, personnesDuRole, organigrammeGss, retirerCommentairesInternes, referencesGss, confirmationsRegistreUtilisees, sansRecopieCctp, texteCctp, nettoyerChampCadre, marcheHorsNormandie, limiterReferences, fondementReprise, delaisHorsNormandie, sansConsultationsDelaiHorsNormandie, nettoyerStructure, limiterRappelsSite, interditsDce, obligationsChiffrees, obligationsChiffreesAbsentes, horairesImposes, acheteursCites, vocabulaireSchemas, nomsHorsMarche, motifRefusAlignement, jalonsChronologiques, sansDonneesCnapsConnues, questionDonneeGss, montantsRegistre, questionDelaiInapplicable, questionLieuInconnu, lieuDuMarche, alerteHorsZone, estCahierDesCharges, dceCctpDAbord, motifsReferences, sansAnciensAcheteurs, RX_NOMBRE_LETTRES, nombreFr, RX_CCATP } from './base_memoires';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import PizZip from 'pizzip';
import OpenAI from 'openai';
import { Client as PgClient } from 'pg';
import { getSettings } from '../core/config';
import { modeleIA, reglagesIA, prefixeEnCache, UsageIA, creditEpuise, CreditOpenAIEpuise } from '../core/modeles_ia';
import { DB, FichiersDB } from '../core/db';
import { getScopedClient } from '../core/supabase';
import { extractText, loadDocxStructure, loadDocxTemplateAnnotated, convertDocToDocx, findTextutil, convertirDocAvecWord, pdfsIllisibles, pdfsPartiels } from '../ingestion/docConverter';
import { overlaySynthesis, loadTrebuchetFont, measureZonesCapacity, RefReplacement, RefContext } from './pdf_overlay';
import { resolveMissingInfo, classifyFieldsLLM, MissingField } from './missing_info_resolver';
import { uploadTempDocx, downloadTempDocx } from '../core/temp_storage';
import { setProgress } from '../core/progress';
// @ts-ignore
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// Modèle de génération : choisi dans core/modeles_ia.ts (gpt-6-luna par défaut, surchargeable par la
// variable d'environnement GSS_IA_MODELE), le même avec ou sans cadre imposé. L'effort de raisonnement
// dépend de l'usage de chaque appel (rédaction ou analyse) : voir callOpenAI.
const MEMOIRE_MODEL = modeleIA();
const MODEL_TEMPLATE = MEMOIRE_MODEL;

// Modèle de génération d'IMAGES pour remplir les cadres « Zone d'image » du template.
// Désactivable via GENERATE_IMAGES=false (étape coûteuse, non bloquante).
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-1';
const IMAGES_ENABLED = process.env.GENERATE_IMAGES !== 'false';

// Modèle d'EMBEDDINGS pour la recherche sémantique (index Doc GSS + DCE). text-embedding-3-small :
// 1536 dim, peu coûteux, TPM élevée → on peut indexer toute la doc + embedder chaque requête de champ.
const EMBED_MODEL = process.env.EMBEDDING_MODEL_MEMOIRE || 'text-embedding-3-small';

// Bucket privé où sont archivées les pièces des dossiers (cf. routes.ts /dce/upload).
const USER_FILES_BUCKET = 'user-files';

/**
 * Découpe un contexte DCE en segments d'au plus `maxLen` caractères, en coupant EN PRIORITÉ sur les
 * frontières de pièces (« \n\n--- label ---\n », posées par getDceContext) pour qu'un CCTP ne soit
 * pas scindé au milieu d'un article. Repli : coupure sur un saut de ligne, puis coupure sèche.
 * Un DCE qui tient dans `maxLen` ressort en un seul segment (cas le plus fréquent).
 * Invariant : la concaténation des segments redonne le texte entier (aucun caractère perdu).
 */
export function splitOnPieceBoundaries(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const re = /\n\n--- .+? ---\n/g;
  // Bornes des pièces : [0, début pièce 2, …, fin du texte].
  const bounds: number[] = [0];
  for (let m = re.exec(text); m; m = re.exec(text)) if (m.index > 0) bounds.push(m.index);
  bounds.push(text.length);

  /** Tronçonne un bloc plus long que maxLen, de préférence sur un saut de ligne. */
  const hardSplit = (block: string): string[] => {
    const parts: string[] = [];
    let rest = block;
    while (rest.length > maxLen) {
      const window = rest.slice(0, maxLen);
      const cut = window.lastIndexOf('\n');
      const end = cut > maxLen * 0.5 ? cut : maxLen;
      parts.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    if (rest.length > 0) parts.push(rest);
    return parts;
  };

  const out: string[] = [];
  let current = '';
  for (let i = 0; i < bounds.length - 1; i++) {
    const piece = text.slice(bounds[i], bounds[i + 1]);
    if (piece.length > maxLen) {
      // Pièce plus grosse que la fenêtre : on ferme le segment courant, puis on la tronçonne.
      if (current) { out.push(current); current = ''; }
      out.push(...hardSplit(piece));
      continue;
    }
    if (current.length + piece.length <= maxLen) current += piece;
    else { out.push(current); current = piece; }
  }
  if (current) out.push(current);
  return out.filter((s) => s.trim().length > 0);
}

/** Un manque détecté, avec sa criticité (bloquant = éliminatoire, facultatif = bonus, normal). */
type MissingFieldDetected = { id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal' };

/** Normalise la criticité renvoyée par l'IA vers l'un des 3 niveaux attendus. */
function normCriticite(c: any): 'bloquant' | 'facultatif' | 'normal' {
  const s = String(c || '').toLowerCase();
  if (s.includes('bloqu') || s.includes('élimin') || s.includes('elimin') || s.includes('obligat')) return 'bloquant';
  if (s.includes('facult') || s.includes('bonus') || s.includes('option')) return 'facultatif';
  return 'normal';
}

/** Un passage indexable pour la recherche sémantique (Doc GSS ou DCE). */
interface RetrievalChunk { source: 'GSS' | 'DCE'; label: string; text: string; embedding?: number[]; }

/**
 * Quand le DCE ne contient pas une information, l'analyse la remplit parfois par une MENTION
 * (« Non communiqué dans les documents transmis », « Non déterminable… », « N/A »). Ces mentions ne
 * sont pas des valeurs : reprises telles quelles, elles s'affichaient comme nom du client dans tout le
 * mémoire. Elles sont vidées, pour que les replis prévus (« le client », page de garde…) s'appliquent.
 */
const MENTION_NON_RENSEIGNEE = /^\s*(?:non[\s-]+(?:communiqu|pr[ée]cis|d[ée]termin|renseign|disponible|identifi|mentionn|indiqu|connu|sp[ée]cifi|fourni|trouv)|inconnu|ind[ée]termin|aucune?\s+(?:information|mention|donn[ée]e)|information\s+(?:non|absente)|(?:n\s*\/\s*a|nc|n\.c\.?)(?![\w])|[-—–?]+\s*$)/i;
function viderValeursNonRenseignees(v: any): any {
  if (typeof v === 'string') return v.length <= 160 && MENTION_NON_RENSEIGNEE.test(v) ? '' : v;
  if (Array.isArray(v)) {
    return v.map(viderValeursNonRenseignees)
      .filter((x) => x !== '' && !(x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((y) => y === '' || y == null)));
  }
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) o[k] = viderValeursNonRenseignees(x);
    return o;
  }
  return v;
}

/**
 * Texte d'un classeur .xlsx (une ligne par ligne de feuille, cellules séparées par « | »), sans
 * dépendance : un .xlsx est une archive de XML. Les cellules vides et les montants nuls sont ignorés.
 */
function lireTableur(chemin: string): string {
  const zip = new PizZip(fs.readFileSync(chemin));
  const xml = (n: string) => zip.file(n)?.asText() || '';
  const dec = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const partages = [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec(m[1]));
  const feuilles = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const lignes: string[] = [];
  for (const f of feuilles) {
    for (const r of xml(f).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cellules: string[] = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '');
        const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] || '');
        let val = v ? (/t="s"/.test(c[1]) ? partages[Number(v[1])] || '' : v[1]) : inline ? dec(inline[1]) : '';
        val = val.replace(/\s+/g, ' ').trim();
        if (val && !/^[-–\s€0.,]*$/.test(val)) cellules.push(val);
      }
      if (cellules.length) lignes.push(cellules.join(' | '));
    }
  }
  return lignes.join('\n');
}

/** Demande particulière de l'utilisateur pour UNE génération : consigne libre et/ou document complémentaire. */
export interface DemandeParticuliere { demande?: string; documentNom?: string; documentTexte?: string; }

/** Similarité cosinus entre deux vecteurs (0 si l'un est nul). */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ─── DOM Helpers ───

function findLocalNameChild(node: any, name: string): any {
  if (!node.childNodes) return null;
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1 && child.localName === name) return child;
  }
  return null;
}

function getElementsWithLocalName(node: any, name: string): any[] {
  const results: any[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === name) results.push(n);
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    }
  };
  walk(node);
  return results;
}

/** Pose [CHAMP_id] dans le 1er run pointillé d'un paragraphe du cadre (id != null) puis vide les autres runs pointillés. */
export function placerOuEffacerPointilles(pNode: any, placeId: number | null): boolean {
  // Mêmes règles que la détection des zones (generate) : une ligne à remplir compte au moins 5 points ou tirets.
  const DOT_RUN = /(?:[_.\-…]\s*){5,}/;
  const DOT_RUN_G = /(?:[_.\-…]\s*){5,}/g;
  const isDottedOnly = (s: string) => s.trim().length >= 5 && /^[_.\-…\s]+$/.test(s);
  const hasDottedRun = (s: string) => DOT_RUN.test(s);
  let placed = false;
  // Zone pointillée commencée : les restes qui la suivent dans le paragraphe (« … », « .. », « …… » dans d'autres
  // runs, point ASCII au milieu d'une suite de « … ») sont effacés, sinon ils restent imprimés après la réponse
  // (rouen_univ, T9CS-3 : « [À COMPLÉTER]… » puis « .. »). Le texte écrit avant la zone n'est jamais touché.
  let zone = false;
  const RESTE = (s: string) => s !== '' && /^[\s_.…]+$/.test(s) && /[_.…]/.test(s);
  getElementsWithLocalName(pNode, 't').forEach((tEl: any) => {
    const text = tEl.textContent || '';
    const dots = isDottedOnly(text) || hasDottedRun(text);
    if (!dots && !(zone && RESTE(text))) return;
    zone = true;
    if (placeId !== null && !placed && dots) {
      tEl.textContent = isDottedOnly(text)
        ? `[CHAMP_${placeId}]`
        : text.replace(DOT_RUN, `[CHAMP_${placeId}]`).replace(DOT_RUN_G, '').replace(/(\[CHAMP_\d+\])(?:[\s_.…]{2,}|[\s_…]*[_…][\s_.…]*)$/, '$1').replace(/(\[CHAMP_\d+\])[\s_.…]{2,}/, '$1');
      placed = true;
    } else {
      tEl.textContent = isDottedOnly(text) || RESTE(text) ? '' : text.replace(DOT_RUN_G, '');
    }
  });
  // Restes courts de pointillés (« …….. » dans un autre run) : effacés, sinon ils suivent la réponse.
  if (placeId !== null) getElementsWithLocalName(pNode, 't').forEach((tEl: any) => {
    const text = tEl.textContent || '';
    if (/^[\s_.…]+$/.test(text) && (text.match(/[_.…]/g) || []).length >= 2) tEl.textContent = '';
  });
  return placed;
}

function getParentWithLocalName(node: any, name: string): any {
  let parent = node.parentNode;
  while (parent) {
    if (parent.nodeType === 1 && parent.localName === name) return parent;
    parent = parent.parentNode;
  }
  return null;
}

function getDirectCells(tr: any): any[] {
  const cells: any[] = [];
  const walk = (node: any) => {
    if (node.nodeType === 1) {
      if (node.localName === 'tc') { cells.push(node); return; }
      if (node.localName === 'tbl' || node.localName === 'tr') return;
    }
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  };
  if (tr.childNodes) {
    for (let i = 0; i < tr.childNodes.length; i++) walk(tr.childNodes[i]);
  }
  return cells;
}

function getElementText(node: any): string {
  let text = '';
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === 't') text += n.textContent || '';
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    }
  };
  walk(node);
  return text;
}

function isHeadingParagraph(p: any): boolean {
  const text = getElementText(p).trim();
  if (!text || text.length > 120) return false;
  const pPr = findLocalNameChild(p, 'pPr');
  if (pPr) {
    const pStyle = findLocalNameChild(pPr, 'pStyle');
    if (pStyle) {
      const val = pStyle.getAttribute('w:val') || '';
      if (/heading|titre|title/i.test(val)) return true;
    }
  }
  if (/^(?:[I|V|X|L|C]+\.|[0-9]+(?:\.[0-9]+)*\.?|[A-Z]\.)\s+[A-ZÀ-ÿ]/i.test(text)) return true;
  if (text.length > 5 && text === text.toUpperCase() && /[A-Z]/.test(text)) return true;
  return false;
}

/** Largeur d'une cellule en colonnes de grille (w:gridSpan, défaut 1). */
function cellGridSpan(cell: any): number {
  const tcPr = findLocalNameChild(cell, 'tcPr');
  const gs = tcPr && findLocalNameChild(tcPr, 'gridSpan');
  const v = gs ? parseInt(gs.getAttribute('w:val') || '1', 10) : 1;
  return v > 0 ? v : 1;
}

/** Index de colonne-grille (0-based) où COMMENCE une cellule dans sa ligne (fusions comprises). */
function cellGridStart(cell: any, tr: any): number {
  let col = 0;
  for (const c of getDirectCells(tr)) {
    if (c === cell) break;
    col += cellGridSpan(c);
  }
  return col;
}

/** Cellule (texte + largeur) couvrant la colonne-grille `gridCol` d'une ligne donnée. */
function cellAtGrid(row: any, gridCol: number): { text: string; span: number } {
  let col = 0;
  for (const c of getDirectCells(row)) {
    const span = cellGridSpan(c);
    if (gridCol >= col && gridCol < col + span) return { text: getElementText(c).trim(), span };
    col += span;
  }
  return { text: '', span: 1 };
}

/** Cellule qui continue une fusion verticale (w:vMerge sans w:val="restart"). */
function fusionVerticale(cell: any): boolean {
  const tcPr = findLocalNameChild(cell, 'tcPr');
  const vm = tcPr ? findLocalNameChild(tcPr, 'vMerge') : null;
  return !!vm && (vm.getAttribute('w:val') || 'continue') !== 'restart';
}

function getTableCellContext(cell: any, tr: any): string {
  const directCells = getDirectCells(tr);
  // Libellé de ligne : les AUTRES cellules de la ligne (la 1re colonne porte l'intitulé de ligne).
  const rowContext = directCells.filter((c: any) => c !== cell).map((c: any) => getElementText(c).trim()).filter(Boolean).join(' | ');

  const tbl = getParentWithLocalName(tr, 'tbl');
  let colHeader = '';
  if (tbl) {
    const allRows = getElementsWithLocalName(tbl, 'tr');
    const targetIdx = allRows.indexOf(tr);
    if (targetIdx > 0) {
      // On mappe par COLONNE DE GRILLE (et non par index de cellule) pour rester juste malgré les
      // cellules fusionnées horizontalement (w:gridSpan) dans l'en-tête ou dans la ligne.
      const gridCol = cellGridStart(cell, tr);
      const h0 = cellAtGrid(allRows[0], gridCol);
      colHeader = h0.text;
      // En-tête groupé sur 2 lignes (1re ligne = groupe fusionné, 2e = sous-en-tête) ou 1re ligne
      // vide → on complète avec la 2e ligne au même emplacement de grille.
      if ((!h0.text || h0.span > 1) && targetIdx > 1) {
        const h1 = cellAtGrid(allRows[1], gridCol).text;
        if (h1) colHeader = h0.text && h0.text !== h1 ? `${h0.text} / ${h1}` : h1;
      }
    }
  }

  return colHeader
    ? `Colonne: "${colHeader}" | Ligne: "${rowContext}"`
    : `Ligne: "${rowContext}"`;
}

/**
 * Emplacement pointillé seul en tête de paragraphe, suivi dans le MÊME paragraphe par l'intitulé d'une autre question
 * (au moins quatre mots, majuscule initiale) : le cadre compte sur les pointillés pour renvoyer l'intitulé à la ligne.
 */
function intituleColleApres(tEl: any, placeholder: string): boolean {
  const text = String(tEl?.textContent || '');
  if (!text.trimEnd().endsWith(placeholder)) return false;
  const run = tEl.parentNode;
  if (!run || run.localName !== 'r' || !run.parentNode || run.parentNode.localName !== 'p') return false;
  const textes = (n: any) => getElementsWithLocalName(n, 't').map((t: any) => t.textContent || '').join('');
  // Rien d'écrit avant l'emplacement dans le paragraphe (ligne pointillée seule).
  for (let n = run.previousSibling; n; n = n.previousSibling) if (n.localName === 'r' && textes(n).trim()) return false;
  if (text.slice(0, text.lastIndexOf(placeholder)).trim()) return false;
  for (let n = run.nextSibling; n; n = n.nextSibling) {
    if (n.localName !== 'r') continue;
    const t = textes(n).trim();
    if (!t) continue;
    return /^[A-ZÀ-Ý][^\s]*(?:\s+\S+){3,}/.test(t);
  }
  return false;
}

/**
 * Intitulé du cadre écrit juste avant l'emplacement dans le même paragraphe, sans ponctuation finale (génération réelle
 * rouen_univ 705 : « Réduction des émissions de la flotte de véhicules……… » rempli en « … de véhiculesNous avons conscience… ») :
 * une réponse rédigée commence alors sur la ligne suivante.
 */
export function intituleColleAvant(tEl: any, placeholder: string): boolean {
  const text = String(tEl?.textContent || '');
  const i = text.indexOf(placeholder);
  if (i < 0) return false;
  let avant = text.slice(0, i);
  const run = tEl.parentNode;
  if (run && run.localName === 'r' && run.parentNode && run.parentNode.localName === 'p') {
    const textes = (n: any) => getElementsWithLocalName(n, 't').map((t: any) => t.textContent || '').join('');
    const precedents: string[] = [];
    for (let n = run.previousSibling; n; n = n.previousSibling) if (n.localName === 'r') precedents.unshift(textes(n));
    avant = `${precedents.join('')}${avant}`;
  }
  const t = avant.replace(/[\s\u00a0]+$/, '');
  // Un intitulé (trois mots au moins) qui finit par une lettre : pas « Nom : », ni une ligne vide, ni des pointillés.
  return /[A-Za-zÀ-ÿ)]$/.test(t) && /(?:\S+\s+){2,}\S+$/.test(t.split('\n').pop() || '');
}

function replaceTextInElement(xmlDoc: any, tEl: any, placeholder: string, value: string) {
  const text = tEl.textContent || '';
  if (!text.includes(placeholder)) return;
  if (!value.includes('\n')) {
    tEl.textContent = text.replace(placeholder, value);
    return;
  }
  const parentRun = tEl.parentNode;
  if (!parentRun || parentRun.localName !== 'r') {
    tEl.textContent = text.replace(placeholder, value.replace(/\r?\n/g, ' '));
    return;
  }
  const parts = text.split(placeholder);
  if (parts.length < 2) return;
  tEl.textContent = '';
  const elementsToInsert: any[] = [];
  if (parts[0]) {
    const tBefore = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tBefore.setAttribute('xml:space', 'preserve');
    tBefore.textContent = parts[0];
    elementsToInsert.push(tBefore);
  }
  const lines = value.split(/\r?\n/);
  lines.forEach((line: string, index: number) => {
    if (index > 0) {
      const br = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br');
      elementsToInsert.push(br);
    }
    const tLine = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tLine.setAttribute('xml:space', 'preserve');
    tLine.textContent = line;
    elementsToInsert.push(tLine);
  });
  if (parts[1]) {
    const tAfter = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tAfter.setAttribute('xml:space', 'preserve');
    tAfter.textContent = parts[1];
    elementsToInsert.push(tAfter);
  }
  elementsToInsert.forEach((el: any) => parentRun.insertBefore(el, tEl));
  parentRun.removeChild(tEl);
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Éléments de <w:compat> placés APRÈS doNotExpandShiftReturn dans l'ordre du schéma OOXML (CT_Compat). */
const COMPAT_APRES_SHIFT_RETURN = ['spacingInWholePoints', 'lineWrapLikeWord6', 'printBodyTextBeforeHeader', 'printColBlack', 'wpSpaceWidth', 'showBreaksInFrames', 'subFontBySize', 'suppressBottomSpacing', 'suppressTopSpacing', 'suppressSpacingAtTopOfPage', 'suppressTopSpacingWP', 'suppressSpBfAfterPgBrk', 'swapBordersFacingPages', 'convMailMergeEsc', 'truncateFontHeightsLikeWP6', 'mwSmallCaps', 'usePrinterMetrics', 'doNotSuppressParagraphBorders', 'wrapTrailSpaces', 'footnoteLayoutLikeWW8', 'shapeLayoutLikeWW8', 'alignTablesRowByRow', 'forgetLastTabAlignment', 'adjustLineHeightInTable', 'autoSpaceLikeWord95', 'noSpaceRaiseLower', 'doNotUseHTMLParagraphAutoSpacing', 'layoutRawTableWidth', 'layoutTableRowsApart', 'useWord97LineBreakRules', 'doNotBreakWrappedTables', 'doNotSnapToGridInCell', 'selectFldWithFirstOrLastChar', 'applyBreakingRules', 'doNotWrapTextWithPunct', 'doNotUseEastAsianBreakRules', 'useWord2002TableStyleRules', 'growAutofit', 'useFELayout', 'useNormalStyleForList', 'doNotUseIndentAsNumberingTabStop', 'useAltKinsokuLineBreakRules', 'allowSpaceOfSameStyleInTable', 'doNotSuppressIndentation', 'doNotAutofitConstrainedTables', 'autofitToFirstFixedWidthCell', 'underlineTabInNumList', 'displayHangulFixedWidth', 'splitPgBreakAndParaMark', 'doNotVertAlignCellWithSp', 'doNotBreakConstrainedForcedTable', 'doNotVertAlignInTxbx', 'useAnsiKerningPairs', 'cachedColBand', 'compatSetting'];
/** Éléments de <w:settings> placés APRÈS <w:compat> dans l'ordre du schéma OOXML (CT_Settings). */
const SETTINGS_APRES_COMPAT = ['docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping', 'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions', 'readModeInkLockDown', 'smartTagType', 'schemaLibrary', 'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator'];

/**
 * Option de compatibilité Word « ne pas étirer une ligne qui finit par un retour à la ligne » (<w:doNotExpandShiftReturn/>)
 * posée dans word/settings.xml, à sa place dans l'ordre du schéma : dans un paragraphe justifié, une réponse écrite sur
 * plusieurs lignes (<w:br/>) n'a plus ses lignes courtes étirées sur toute la largeur. Seul le rendu change.
 */
export function sansEtirementRetourLigne(zip: any): boolean {
  const f = zip?.file?.('word/settings.xml');
  if (!f) return false;
  let s: string = f.asText();
  if (/doNotExpandShiftReturn/.test(s)) return false;
  const balise = '<w:doNotExpandShiftReturn/>';
  const compat = /<w:compat\s*\/>|<w:compat>([\s\S]*?)<\/w:compat>/.exec(s);
  if (compat) {
    if (/^<w:compat\s*\/>$/.test(compat[0])) s = s.replace(compat[0], `<w:compat>${balise}</w:compat>`);
    else {
      const interieur = compat[1];
      const rx = new RegExp(`<w:(?:${COMPAT_APRES_SHIFT_RETURN.join('|')})\\b`);
      const m = rx.exec(interieur);
      const nouveau = m ? `${interieur.slice(0, m.index)}${balise}${interieur.slice(m.index)}` : `${interieur}${balise}`;
      s = s.replace(compat[0], `<w:compat>${nouveau}</w:compat>`);
    }
  } else {
    const rx = new RegExp(`<(?:w|m):(?:${SETTINGS_APRES_COMPAT.join('|')})\\b`);
    const m = rx.exec(s);
    const element = `<w:compat>${balise}</w:compat>`;
    if (m) s = `${s.slice(0, m.index)}${element}${s.slice(m.index)}`;
    else if (/<\/w:settings>/.test(s)) s = s.replace(/<\/w:settings>/, `${element}</w:settings>`);
    else return false;
  }
  zip.file('word/settings.xml', s);
  return true;
}

function getParagraphStyle(p: any): string {
  const pPr = findLocalNameChild(p, 'pPr');
  if (!pPr) return '';
  const pStyle = findLocalNameChild(pPr, 'pStyle');
  return pStyle ? (pStyle.getAttribute('w:val') || '') : '';
}

// ─── Préservation du maître AO RNE : duplication de "spreads" (pages conçues) ───
// On NE reconstruit plus le document : on garde AO RNE.docx INTACT (design + 221
// images) et on AJOUTE des pages en DUPLIQUANT des pages existantes. Une page conçue
// ("spread") = une section image+titre (image plein-cadre behindDoc + zone de texte
// de titre) SUIVIE d'une section de corps de texte (paragraphes 2 colonnes). Cloner
// ces sections telles quelles préserve le format/design ; il suffit ensuite de
// renuméroter les ids de dessin (wp:docPr / pic:cNvPr — uniques, sinon Word "répare")
// et de remplacer le titre + le corps par le texte personnalisé.

/** Découpe le corps en sections OOXML : une section = paragraphes consécutifs jusqu'au
 * (et incluant le) paragraphe portant <w:sectPr>. Le sectPr final est au niveau body. */
function splitBodyIntoSections(body: any): { sections: any[][]; finalSectPr: any | null } {
  const sections: any[][] = [];
  let cur: any[] = [];
  let finalSectPr: any = null;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1) continue;
    if (node.localName === 'p') {
      cur.push(node);
      const pPr = findLocalNameChild(node, 'pPr');
      if (pPr && findLocalNameChild(pPr, 'sectPr')) { sections.push(cur); cur = []; }
    } else if (node.localName === 'sectPr') {
      finalSectPr = node;
    }
  }
  if (cur.length) sections.push(cur);
  return { sections, finalSectPr };
}

const sectionHasBackgroundImage = (paras: any[]): boolean =>
  paras.some(p => getElementsWithLocalName(p, 'anchor').some((a: any) => a.getAttribute('behindDoc') === '1'));
const sectionHasTextbox = (paras: any[]): boolean =>
  paras.some(p => getElementsWithLocalName(p, 'txbxContent').length > 0);
const sectionIsPlainText = (paras: any[]): boolean =>
  !paras.some(p => getElementsWithLocalName(p, 'drawing').length > 0 || getElementsWithLocalName(p, 'pict').length > 0);

/** Couleur de l'aplat gris clair pleine page du template (corps des pages). */
const GREY_BG_HEX = 'D9D9D9';

/**
 * Trouve le run contenant le rectangle gris clair (#D9D9D9) pleine page utilisé comme
 * fond sur les pages de corps du template AO RNE. C'est un shape vectoriel (solidFill,
 * SANS image) ancré en behindDoc="1", de taille ~21cm × 29.7cm, positionné à page
 * offset (0,0). Attention : le template contient aussi 6 rectangles gris FONCÉ (#494545)
 * pleine page — on les écarte en exigeant explicitement la couleur #D9D9D9. On saute
 * également les premiers paragraphes pour ignorer la couverture. Renvoie le run à cloner.
 */
function findFullPageBackgroundRun(body: any): any | null {
  if (!body || !body.childNodes) return null;
  // On saute les premiers paragraphes (couverture / sommaire) pour cibler les pages de corps
  const MIN_PARA = 50;  // les pages de corps commencent bien après la couverture
  let paraCount = 0;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1 || node.localName !== 'p') continue;
    paraCount++;
    if (paraCount < MIN_PARA) continue;

    const runs = getElementsWithLocalName(node, 'r');
    for (const r of runs) {
      // On ne veut PAS d'image : uniquement l'aplat gris vectoriel
      if (getElementsWithLocalName(r, 'blip').length > 0) continue;
      const anchors = getElementsWithLocalName(r, 'anchor');
      for (const a of anchors) {
        if (a.getAttribute('behindDoc') !== '1') continue;
        const extent = findLocalNameChild(a, 'extent');
        if (!extent) continue;
        const cx = parseInt(extent.getAttribute('cx') || '0', 10);
        const cy = parseInt(extent.getAttribute('cy') || '0', 10);
        const wCm = cx / 914400 * 2.54;
        const hCm = cy / 914400 * 2.54;
        // Pleine page A4 : >19cm large, >28cm haut
        if (wCm < 19 || hCm < 28) continue;
        // Exiger la couleur gris clair #D9D9D9 (pas le gris foncé #494545)
        const colors = getElementsWithLocalName(a, 'srgbClr')
          .map((c: any) => (c.getAttribute('val') || '').toUpperCase());
        if (colors.includes(GREY_BG_HEX)) return r;
      }
    }
  }
  return null;
}

/**
 * Injecte un clone du rectangle gris clair pleine page dans le premier paragraphe d'un
 * ensemble de paragraphes (section corps d'un spread cloné). Les IDs de dessin sont
 * renumérotés pour éviter les doublons Word.
 */
function injectFullPageBackground(bodyParas: any[], bgRun: any, counter: { v: number }) {
  if (!bgRun || bodyParas.length === 0) return;
  const clone = bgRun.cloneNode(true);
  renumberDrawingIds(clone, counter);
  const firstPara = bodyParas[0];
  firstPara.insertBefore(clone, firstPara.firstChild);
}

/**
 * Trouve le run contenant le bandeau « GSS » (logo œil + GSS, image5.png) qui coiffe
 * le titre de chaque page de corps du template. C'est un groupe autonome (sans texte ni
 * zone de titre) ancré en behindDoc="1", de largeur pleine page (~21cm) mais PEU haut
 * (~3.3cm). On le distingue du fond pleine page (haut) par sa faible hauteur, et des
 * blocs de titre par l'absence de texte. Renvoie le run DOM à cloner, ou null.
 */
function findGssBannerRun(body: any): any | null {
  if (!body || !body.childNodes) return null;
  const MIN_PARA = 50;        // on saute la couverture / le sommaire
  const MAX_H_CM = 6;         // bandeau de titre : court (≠ fond pleine page)
  let paraCount = 0;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1 || node.localName !== 'p') continue;
    paraCount++;
    if (paraCount < MIN_PARA) continue;

    const runs = getElementsWithLocalName(node, 'r');
    for (const r of runs) {
      // bandeau image autonome : une image, pas de texte, pas de zone de titre
      if (getElementsWithLocalName(r, 'blip').length === 0) continue;
      if (getElementsWithLocalName(r, 't').length > 0) continue;
      if (getElementsWithLocalName(r, 'txbxContent').length > 0) continue;
      const anchors = getElementsWithLocalName(r, 'anchor');
      for (const a of anchors) {
        if (a.getAttribute('behindDoc') !== '1') continue;
        const extent = findLocalNameChild(a, 'extent');
        if (!extent) continue;
        const wCm = parseInt(extent.getAttribute('cx') || '0', 10) / 914400 * 2.54;
        const hCm = parseInt(extent.getAttribute('cy') || '0', 10) / 914400 * 2.54;
        // Pleine largeur mais court : c'est le bandeau de titre, pas le fond pleine page
        if (wCm >= 19 && hCm >= 2 && hCm <= MAX_H_CM) return r;
      }
    }
  }
  return null;
}

/**
 * Injecte un clone du bandeau « GSS » dans le premier paragraphe d'en-tête d'une page
 * clonée, afin que chaque titre généré porte le logo GSS comme sur les pages du template.
 */
function injectGssBanner(headingParas: any[], gssRun: any, counter: { v: number }) {
  if (!gssRun || headingParas.length === 0) return;
  const clone = gssRun.cloneNode(true);
  renumberDrawingIds(clone, counter);
  const firstPara = headingParas[0];
  firstPara.insertBefore(clone, firstPara.firstChild);
}

/** Plus grand id de dessin présent (wp:docPr / pic:cNvPr) — base pour la renumérotation. */
function maxDrawingId(xmlDoc: any): number {
  let max = 0;
  ['docPr', 'cNvPr'].forEach(name => {
    getElementsWithLocalName(xmlDoc.documentElement, name).forEach((el: any) => {
      const id = parseInt(el.getAttribute('id') || '0', 10);
      if (id > max) max = id;
    });
  });
  return max;
}

/** Réattribue un id unique à chaque dessin (wp:docPr / pic:cNvPr) d'un sous-arbre cloné. */
function renumberDrawingIds(node: any, counter: { v: number }) {
  ['docPr', 'cNvPr'].forEach(name => {
    getElementsWithLocalName(node, name).forEach((el: any) => { el.setAttribute('id', String(++counter.v)); });
  });
}

/**
 * Remplace le texte de toutes les zones de titre (txbxContent) de la section par `title`.
 * Le titre est mis en MAJUSCULES pour respecter l'écriture des titres du template
 * (ex. « NOS AGENTS CYNOPHILES », « NOS PREVENTEURS »).
 */
function setSectionHeading(paras: any[], title: string) {
  const upper = String(title || '').toUpperCase();
  paras.forEach(p => {
    getElementsWithLocalName(p, 'txbxContent').forEach((tx: any) => {
      const tEls = getElementsWithLocalName(tx, 't');
      if (tEls.length === 0) return;
      tEls[0].textContent = upper;
      for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
    });
  });
}

/** Découpe le texte généré en lignes de paragraphe (sans markdown, le mode B n'en produit pas). */
function bodyTextToLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[*_`#]+/g, '')              // garde-fou : retire un éventuel markdown résiduel
    .split('\n')
    .map(l => l.trim());
}

/**
 * Marqueur des zones éditables « Contexte sur mesure ». Une zone est ENCADRÉE par une balise
 * OUVRANTE (« Contexte sur mesure » ou « … début ») et une balise FERMANTE (« … fin »). Les
 * paragraphes vides entre les deux matérialisent l'espace réservé sur la page : le texte injecté
 * y est borné pour ne PAS casser la mise en forme (déborder sur la page conçue suivante).
 */
// Un marqueur = un paragraphe qui COMMENCE par « Contexte … » (« Contexte sur mesure début »,
// « Contexte Une réponse pour vos sites », « Contexte DES MOYENS CALIBRÉS »…). On ancre au DÉBUT
// (après un éventuel guillemet) pour ne PAS confondre avec les phrases du corps (« Dans le contexte… »).
const CONTEXT_MARKER_RE = /^[\s«»“”"'‹›]*Contexte\b/;   // C MAJUSCULE (≠ corps « Le contexte… », « Dans le contexte… »)
/** Balise FERMANTE d'une zone (un marqueur « Contexte … » qui contient « fin »). */
const CONTEXT_CLOSE_RE = /^[\s«»“”"'‹›]*Contexte\b[\s\S]*\bfin\b/i;
// Largeur de découpe (caractères) garantissant qu'une ligne tient sur UNE seule ligne physique
// (sinon le paragraphe déborde sur 2 lignes → décale tout le reste). On CONSERVE l'indentation native
// des lignes réservées (le cadrage voulu) : la largeur utile est donc réduite. Calé sur la géométrie
// d'AO RNE : colonne 2-col ≈ 5644 twips − indent 1906, texte 1-col ≈ 11485 − 1906, police sz 23.
// À AUGMENTER si l'espace réservé reste trop vide ; à RÉDUIRE si une ligne déborde.
const CHARS_PER_LINE_2COL = 26;
const CHARS_PER_LINE_1COL = 68;

/** Vrai si le nœud est à l'intérieur d'une zone de texte Word (txbxContent). */
function isInsideTextbox(node: any): boolean {
  let n = node ? node.parentNode : null;
  while (n) { if (n.localName === 'txbxContent') return true; n = n.parentNode; }
  return false;
}

/** Texte concaténé des runs d'un paragraphe (le texte peut être éclaté en plusieurs `<w:t>`). */
function paragraphText(p: any): string {
  return getElementsWithLocalName(p, 't').map((t: any) => t.textContent || '').join('');
}

/** Écrit `text` dans un paragraphe : tout dans le 1er run, les autres `<w:t>` vidés (style conservé). */
function setParagraphText(p: any, text: string) {
  const tEls = getElementsWithLocalName(p, 't');
  if (tEls.length === 0) return;
  tEls[0].textContent = text;
  // Préserver les espaces de début/fin si présents (texte justifié).
  if (/^\s|\s$/.test(text)) tEls[0].setAttribute('xml:space', 'preserve');
  for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
}

/** Vrai si le paragraphe porte un saut de section (sectPr) — structurel (définit les colonnes), à ne JAMAIS toucher. */
function paragraphHasSectPr(p: any): boolean {
  const pPr = findLocalNameChild(p, 'pPr');
  return !!(pPr && findLocalNameChild(pPr, 'sectPr'));
}

/** Vrai si le paragraphe est « vide » : aucun texte, aucune image/dessin, aucun saut de section (ligne blanche de gabarit). */
function isBlankFillerParagraph(p: any): boolean {
  const hasText = getElementsWithLocalName(p, 't').some((t: any) => (t.textContent || '').trim() !== '');
  const hasDrawing = getElementsWithLocalName(p, 'drawing').length > 0 || getElementsWithLocalName(p, 'pict').length > 0;
  return !hasText && !hasDrawing && !paragraphHasSectPr(p);
}

/**
 * Écrit `text` dans un paragraphe en préservant SA mise en forme et SA section (colonnes). Les
 * lignes vides du gabarit n'ont souvent pas de run/`<w:t>` : on en crée un, en reprenant le `rPr`
 * de la marque de paragraphe (`pPr/rPr`) pour conserver police et taille du gabarit.
 */
function fillParagraphText(p: any, text: string) {
  if (getElementsWithLocalName(p, 't').length > 0) { setParagraphText(p, text); return; }
  const doc = p.ownerDocument;
  const r = doc.createElementNS(W_NS, 'w:r');
  const pPr = findLocalNameChild(p, 'pPr');
  const markRPr = pPr ? findLocalNameChild(pPr, 'rPr') : null;
  if (markRPr) r.appendChild(markRPr.cloneNode(true));   // police/taille de la ligne réservée
  const t = doc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
}

/**
 * Repère, dans l'ordre du document, les paragraphes-marqueurs « Contexte sur mesure » du corps
 * (hors zones de texte). Travaille au niveau paragraphe car le marqueur peut être éclaté en runs.
 */
function findContextMarkers(body: any): any[] {
  return getElementsWithLocalName(body, 'p').filter((p: any) =>
    !isInsideTextbox(p) && CONTEXT_MARKER_RE.test(paragraphText(p)),
  );
}

/**
 * Une zone éditable. `blanks` = lignes vides réservées AVANT l'ancre (déjà en 2 colonnes) ;
 * `postBlanks` = lignes vides réservées APRÈS l'ancre, jusqu'à la fermante (généralement 1 colonne).
 * On ne remplit QUE ces lignes vides existantes, jamais d'ajout/suppression → le nombre de
 * paragraphes reste constant et rien ne se décale en dessous (titres, sections suivantes).
 */
interface ContextZone { open: any; close: any; anchor: any; blanks: any[]; postBlanks: any[]; }

/** sectPr d'un paragraphe (ou null). */
function paragraphSectPr(p: any): any | null {
  const pPr = findLocalNameChild(p, 'pPr');
  return pPr ? findLocalNameChild(pPr, 'sectPr') : null;
}

/** Vrai si ce sectPr met la section en 2 colonnes (w:cols w:num="2"). */
function sectPrIsTwoCol(sectPr: any): boolean {
  if (!sectPr) return false;
  const cols = findLocalNameChild(sectPr, 'cols');
  return !!cols && (cols.getAttribute('w:num') || '') === '2';
}

/** Découpe `text` en lignes de ≤ `maxChars` caractères sans couper les mots (les mots trop longs sont coupés). */
function wrapToLines(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > maxChars) {                       // mot plus long que la ligne → on le coupe
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Apparie les balises « Contexte sur mesure » en zones [ouvrante → fermante]. L'ANCRE = 1er paragraphe
 * à sectPr 2 colonnes entre les balises (la section 2 colonnes s'achève sur lui). Les lignes vides
 * AVANT l'ancre (`blanks`) sont donc en 2 colonnes ; celles APRÈS (`postBlanks`) en 1 colonne. Sans
 * sectPr 2 colonnes on se rabat sur la fermante (tout en 1 colonne). Fermantes orphelines ignorées.
 */
function findContextZones(body: any): ContextZone[] {
  const markers = findContextMarkers(body);
  const zones: ContextZone[] = [];
  for (let i = 0; i < markers.length; i++) {
    const open = markers[i];
    if (CONTEXT_CLOSE_RE.test(paragraphText(open))) continue;   // fermante seule → ignorée
    let close: any = null, ci = -1;
    for (let j = i + 1; j < markers.length; j++) {
      if (CONTEXT_CLOSE_RE.test(paragraphText(markers[j]))) { close = markers[j]; ci = j; break; }
    }
    if (!close) break;                                          // plus de fermante → fin du document
    if (open.parentNode !== close.parentNode) { i = ci; continue; }
    let anchor: any = null;
    for (let n = open.nextSibling; n && n !== close; n = n.nextSibling) {
      if (n.nodeType === 1 && n.localName === 'p' && sectPrIsTwoCol(paragraphSectPr(n))) { anchor = n; break; }
    }
    if (!anchor) anchor = close;                                // repli : pas de section 2 colonnes
    const blanks: any[] = [];      // lignes vides 2 colonnes (avant l'ancre)
    for (let n = open.nextSibling; n && n !== anchor; n = n.nextSibling) {
      if (n.nodeType === 1 && n.localName === 'p' && isBlankFillerParagraph(n)) blanks.push(n);
    }
    const postBlanks: any[] = [];  // lignes vides 1 colonne (après l'ancre, jusqu'à la fermante)
    if (anchor !== close) {
      for (let n = anchor.nextSibling; n && n !== close; n = n.nextSibling) {
        if (n.nodeType === 1 && n.localName === 'p' && isBlankFillerParagraph(n)) postBlanks.push(n);
      }
    }
    zones.push({ open, close, anchor, blanks, postBlanks });
    i = ci;                                                     // reprendre après la fermante consommée
  }
  return zones;
}

/**
 * Remplit les zones éditables SANS jamais changer le nombre de paragraphes (donc sans décaler les
 * titres/sections en dessous). Principe : le texte est découpé en lignes calibrées pour tenir sur UNE
 * ligne physique, puis écrit DANS les lignes vides déjà réservées (d'abord les lignes 2 colonnes, puis
 * les lignes 1 colonne). Si le texte dépasse le nombre de lignes réservées → tronqué ; s'il est plus
 * court → les lignes vides restantes conservent l'espace. Répartition ÉQUILIBRÉE entre les zones pour
 * étaler le texte sur toutes les pages. Renvoie un récap pour le log.
 */
function fillContextMarkers(body: any, generatedText: string): { markers: number; pagesUsed: number; truncated: boolean; linesFilled: number } {
  const zones = findContextZones(body);
  if (zones.length === 0) return { markers: 0, pagesUsed: 0, truncated: false, linesFilled: 0 };

  let paras = bodyTextToLines(generatedText).filter((l) => l.length > 0);
  const N = zones.length;
  // Si MOINS de paragraphes que de zones, le remplissage séquentiel sature les 1ères zones et laisse
  // les dernières VIDES (sections « disparues »). On redécoupe alors en PHRASES pour avoir assez de
  // blocs à étaler sur toutes les zones (chaque zone reçoit ainsi du texte).
  if (paras.length < N) {
    const sentences = paras.flatMap((p) =>
      (p.match(/[^.!?…]+[.!?…]+(?:["»)\]]+)?\s*|[^.!?…]+$/g) || [p]).map((s) => s.trim()).filter(Boolean));
    if (sentences.length > paras.length) paras = sentences;
  }
  // Largeur de découpe et capacité (en caractères) par zone : 2 colonnes si la zone a des lignes 2-col.
  const wrapWidth = zones.map((z) => (z.blanks.length > 0 ? CHARS_PER_LINE_2COL : CHARS_PER_LINE_1COL));
  const lineBudget = zones.map((z) => z.blanks.length + z.postBlanks.length);
  const charCap = zones.map((_, i) => lineBudget[i] * wrapWidth[i]);

  // Cible par zone = part équilibrée (total / N), plafonnée par la capacité (espace réservé) de la zone.
  const totalChars = paras.reduce((s, p) => s + p.length + 1, 0);
  const share = Math.max(1, Math.ceil(totalChars / N));
  const targets = charCap.map((c) => Math.min(c, share));

  // Répartition séquentielle des paragraphes : on remplit la zone i jusqu'à sa cible, puis i+1.
  const chunks: string[][] = Array.from({ length: N }, () => []);
  let zi = 0, used = 0, truncated = false;
  for (const para of paras) {
    while (zi < N && chunks[zi].length > 0 && used + para.length > targets[zi]) { zi++; used = 0; }
    if (zi >= N) { truncated = true; break; }
    chunks[zi].push(para);
    used += para.length + 1;
  }

  let pagesUsed = 0, linesFilled = 0;
  zones.forEach((z, idx) => {
    // Vider les balises (placeholders) sans rien ajouter/retirer — elles restent des paragraphes vides.
    setParagraphText(z.open, '');
    setParagraphText(z.close, '');
    if (chunks[idx].length === 0) return;
    pagesUsed++;

    // Découper le texte de la zone en lignes physiques contiguës (pas de ligne vide intercalée, qui
    // créerait de gros trous : l'espacement natif des lignes réservées suffit à aérer le texte).
    const phys: string[] = [];
    chunks[idx].forEach((para) => {
      wrapToLines(para, wrapWidth[idx]).forEach((l) => phys.push(l));
    });

    // Écrire UNE ligne par ligne vide réservée (2 colonnes d'abord, puis 1 colonne), en CONSERVANT
    // intégralement la mise en forme native (indentation/cadrage, police, espacement). Aucun paragraphe
    // n'est ajouté ni supprimé → mise en page en dessous inchangée. Surplus tronqué, manque laissé vide.
    const slots = [...z.blanks, ...z.postBlanks];
    if (phys.length > slots.length) truncated = true;
    for (let i = 0; i < slots.length && i < phys.length; i++) {
      fillParagraphText(slots[i], phys[i]);
      linesFilled++;
    }
  });

  return { markers: N, pagesUsed, truncated, linesFilled };
}

/**
 * Refonte V1 — sur une page DUPLIQUÉE, retire UNIQUEMENT les images de fond
 * PLEINE PAGE (photo de décor, anchor `behindDoc="1"` de taille ~21×29.7cm) afin de
 * laisser apparaître le fond gris uniforme. On préserve :
 *  - les runs porteurs d'une zone de titre (`txbxContent`) ;
 *  - le bandeau de titre « GSS » (image behindDoc large mais PEU haute, ~21×3.3cm),
 *    qui doit rester sur chaque titre.
 * Le critère discriminant est donc la HAUTEUR pleine page (≥ 20cm).
 * Renvoie le nombre de runs-images retirés.
 */
function stripStandaloneBgImages(paras: any[]): number {
  const FULLPAGE_MIN_H_CM = 20; // au-delà : fond pleine page ; en deçà : bandeau de titre, etc.
  let removed = 0;
  paras.forEach((p) => {
    const runs = getElementsWithLocalName(p, 'r');
    runs.forEach((r: any) => {
      const anchors = getElementsWithLocalName(r, 'anchor');
      const isFullPageBg = anchors.some((a: any) => {
        if (a.getAttribute('behindDoc') !== '1') return false;
        const extent = findLocalNameChild(a, 'extent');
        const cy = extent ? parseInt(extent.getAttribute('cy') || '0', 10) : 0;
        return (cy / 914400 * 2.54) >= FULLPAGE_MIN_H_CM;
      });
      const hasBlip = getElementsWithLocalName(r, 'blip').length > 0;
      const hasTitle = getElementsWithLocalName(r, 'txbxContent').length > 0;
      if (isFullPageBg && hasBlip && !hasTitle && r.parentNode) {
        r.parentNode.removeChild(r);
        removed++;
      }
    });
  });
  return removed;
}

/** Force la couleur de tous les runs (texte) d'un sous-arbre — lisibilité sur fond gris. */
function forceTextColor(paras: any[], color: string) {
  paras.forEach((p) => {
    getElementsWithLocalName(p, 'r').forEach((r: any) => {
      // ne pas toucher aux runs purement graphiques (drawing/pict) sans texte
      if (getElementsWithLocalName(r, 't').length === 0) return;
      let rPr = findLocalNameChild(r, 'rPr');
      if (!rPr) {
        rPr = r.ownerDocument.createElementNS(W_NS, 'w:rPr');
        r.insertBefore(rPr, r.firstChild);
      }
      let col = findLocalNameChild(rPr, 'color');
      if (!col) {
        col = r.ownerDocument.createElementNS(W_NS, 'w:color');
        rPr.appendChild(col);
      }
      col.setAttribute('w:val', color);
    });
  });
}

/**
 * Clone un spread (sections [titre+image] + [corps]) en injectant `title`
 * (zone de titre) et `bodyText` (corps), avec ids de dessin renumérotés. Renvoie les
 * nouveaux paragraphes prêts à être insérés. Préserve le sectPr d'origine de chaque
 * section (mise en page identique).
 *
 * Refonte V1 (`refonte=true`) : retire les images de fond pleine page des pages
 * dupliquées (fond gris uniforme à la place) et force le texte en sombre (lisibilité).
 */
function cloneSpread(
  xmlDoc: any, headingParas: any[], bodyParas: any[], counter: { v: number }, title: string, bodyText: string,
  refonte = false, stats?: { imagesRemoved: number },
): any[] {
  const newHeading = headingParas.map(p => p.cloneNode(true));
  newHeading.forEach(p => renumberDrawingIds(p, counter));
  if (title) setSectionHeading(newHeading, title);

  // Refonte V1 : sur la page dupliquée, retire l'image de fond pleine page (le
  // titre/bandeau est conservé) et force le texte en sombre pour rester lisible
  // sur le fond gris uniforme injecté au niveau du document.
  if (refonte) {
    const removed = stripStandaloneBgImages(newHeading);
    if (stats) stats.imagesRemoved += removed;
    forceTextColor(newHeading, DUP_TEXT_COLOR);
  }

  const lastBody = bodyParas[bodyParas.length - 1];
  const origSectPr = lastBody ? findLocalNameChild(findLocalNameChild(lastBody, 'pPr'), 'sectPr') : null;
  const sectPrClone = origSectPr ? origSectPr.cloneNode(true) : null;

  const lines = bodyTextToLines(bodyText);
  const newBody: any[] = [];

  // Pour conserver parfaitement la DA (Art Direction), on clone le premier paragraphe du template
  let templateP = bodyParas.find(p => getElementsWithLocalName(p, 't').length > 0) || bodyParas[0];

  if (!templateP) {
    // Fallback de sécurité (très rare)
    templateP = xmlDoc.createElementNS(W_NS, 'w:p');
  }

  lines.forEach((ln, idx) => {
    const pClone = templateP.cloneNode(true);

    // On retire le sectPr du clone (car sectPr ne doit être que sur le DERNIER paragraphe)
    let pPr = findLocalNameChild(pClone, 'pPr');
    if (pPr) {
      const sectPr = findLocalNameChild(pPr, 'sectPr');
      if (sectPr) pPr.removeChild(sectPr);
    } else {
      pPr = xmlDoc.createElementNS(W_NS, 'w:pPr');
      pClone.insertBefore(pPr, pClone.firstChild);
    }

    // Le user a explicitement demandé de RECENTRER le texte
    let jc = findLocalNameChild(pPr, 'jc');
    if (!jc) {
      jc = xmlDoc.createElementNS(W_NS, 'w:jc');
      pPr.appendChild(jc);
    }
    jc.setAttribute('w:val', 'center');

    // On conserve un bon espacement aéré
    let spacing = findLocalNameChild(pPr, 'spacing');
    if (!spacing) {
      spacing = xmlDoc.createElementNS(W_NS, 'w:spacing');
      pPr.appendChild(spacing);
    }
    spacing.setAttribute('w:after', '280'); // 14pt

    // Remplacement du texte tout en gardant les propriétés de police (rPr)
    const runs = getElementsWithLocalName(pClone, 'r');
    if (runs.length > 0) {
      // On garde uniquement le premier "run" pour éviter la duplication de styles hétérogènes
      for (let i = 1; i < runs.length; i++) {
        pClone.removeChild(runs[i]);
      }
      const tEls = getElementsWithLocalName(runs[0], 't');
      if (tEls.length > 0) {
        tEls[0].textContent = ln;
        tEls[0].setAttribute('xml:space', 'preserve');
        for (let i = 1; i < tEls.length; i++) runs[0].removeChild(tEls[i]);
      } else {
        const t = xmlDoc.createElementNS(W_NS, 'w:t');
        t.textContent = ln;
        t.setAttribute('xml:space', 'preserve');
        runs[0].appendChild(t);
      }
    } else {
      const r = xmlDoc.createElementNS(W_NS, 'w:r');
      const t = xmlDoc.createElementNS(W_NS, 'w:t');
      t.textContent = ln;
      t.setAttribute('xml:space', 'preserve');
      r.appendChild(t);
      pClone.appendChild(r);
    }

    // Le dernier paragraphe doit porter les propriétés de section (colonnes, marges, etc.)
    if (idx === lines.length - 1 && sectPrClone) {
      pPr.appendChild(sectPrClone);
    }

    newBody.push(pClone);
  });

  // Refonte V1 : corps de texte en sombre, lisible sur le fond gris uniforme.
  if (refonte) forceTextColor(newBody, DUP_TEXT_COLOR);

  return [...newHeading, ...newBody];
}

// ─── Construction d'un mémoire PROPRE (XML en chaîne, zéro DOM) ───
// On ne touche plus jamais au DOM d'AO RNE (le re-sérialiser dégrade sa maquette).
// À la place, on génère un document.xml NEUF, dont le rendu reprend l'identité
// visuelle d'AO RNE : fond anthracite, texte crème, titres clairs, accent vert GSS.

// Palette extraite d'AO RNE.docx (couleurs dominantes du design).
const COL_BG = '494545';       // fond de page anthracite
const COL_TITLE = 'FFFFFF';    // titres (blanc)
const COL_BODY = 'EFE7D3';     // corps de texte (crème, lisible sur fond sombre)
const COL_ACCENT = 'C81E1E';   // rouge GSS (filets / labels)
const COL_MUTED = 'D9D9D9';    // gris clair (sous-texte)

// ─── Refonte V1 : fond gris uniforme sur les pages dupliquées ───
// Couleur de fond de page (Word: <w:background>). Gris clair lisible, configurable.
// Repli possible sur 'FFFFFF' si le rendu Word pose problème (cf. garde-fou).
const BACKGROUND_COLOR = 'E5E5E5';
// Couleur de texte forcée sur les pages dupliquées (lisible sur fond gris clair).
const DUP_TEXT_COLOR = '1A1A1A';

// Tailles en demi-points (22 = 11 pt) ; espacements en twips (240 = 12 pt).
const SZ_BODY = 22;
const SZ_SECTION = 30;     // titre de section 15 pt
const SZ_SUBHEAD = 26;
const SZ_SUBHEAD2 = 24;
const SZ_CHAPTER = 40;     // titre de chapitre 20 pt
const LINE_AUTO = 276;     // interligne 1,15
const FONT = 'Trebuchet MS';

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface RunOpts { bold?: boolean; italic?: boolean; size?: number; color?: string; }
interface ParaOpts {
  align?: 'left' | 'center' | 'right' | 'both';
  before?: number; after?: number; line?: number;
  indent?: number; bullet?: boolean;
  accentRule?: boolean;   // filet vert sous le paragraphe (titres de chapitre)
  pageBreak?: boolean;    // saut de page avant
}

/** Run <w:r> en chaîne, police Trebuchet par défaut. */
function runX(text: string, o: RunOpts = {}): string {
  let rpr = `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`;
  if (o.bold) rpr += '<w:b/>';
  if (o.italic) rpr += '<w:i/>';
  if (o.color) rpr += `<w:color w:val="${o.color}"/>`;
  if (o.size) rpr += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

/** Paragraphe <w:p> en chaîne à partir de runs déjà sérialisés. */
function paraX(innerRuns: string, o: ParaOpts = {}): string {
  const { align, before = 0, after = 120, line = LINE_AUTO, indent = 0, bullet = false } = o;
  let ppr = '';
  if (o.pageBreak) ppr += '<w:pageBreakBefore/>';
  const left = bullet ? Math.max(indent, 360) : indent;
  if (left) ppr += `<w:ind w:left="${left}"${bullet ? ' w:hanging="240"' : ''}/>`;
  if (o.accentRule) ppr += `<w:pBdr><w:bottom w:val="single" w:sz="14" w:space="6" w:color="${COL_ACCENT}"/></w:pBdr>`;
  ppr += `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`;
  if (align) ppr += `<w:jc w:val="${align}"/>`;
  return `<w:p><w:pPr>${ppr}</w:pPr>${innerRuns}</w:p>`;
}

/** Découpe un texte selon le markdown inline (**gras**, __gras__, *italique*). */
function parseInlineMarkdown(text: string): Array<{ text: string; bold?: boolean; italic?: boolean }> {
  const segs: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) segs.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) segs.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) segs.push({ text: m[3], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs.filter((s) => s.text && s.text.length > 0);
}

/** Runs d'une ligne, markdown inline rendu, sur une base de style (couleur/taille). */
function inlineX(text: string, base: RunOpts): string {
  const segs = parseInlineMarkdown(text);
  if (segs.length === 0) return runX(text, base);
  return segs.map((s) => runX(s.text, { ...base, bold: base.bold || s.bold, italic: s.italic })).join('');
}

/** Normalise un titre pour comparer (minuscules, sans accents ni ponctuation). */
function normTitle(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Convertit un bloc markdown en paragraphes <w:p> (chaîne), couleur crème par défaut.
 * `skipTitle` : omet la 1re ligne si c'est un titre quasi identique au titre de section
 * (l'IA répète souvent le titre en tête de réponse).
 */
function markdownToParagraphsX(raw: string, skipTitle?: string): string {
  const out: string[] = [];
  const skipNorm = skipTitle ? normTitle(skipTitle) : '';
  let firstContent = true;
  const isDup = (t: string) => {
    if (!skipNorm) return false;
    const n = normTitle(t);
    return n === skipNorm || (n.length > 6 && (skipNorm.includes(n) || n.includes(skipNorm)));
  };

  for (const rawLine of String(raw || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').replace(/`+/g, '').trimEnd();
    const t = line.trim();
    if (t === '' || /^[-*_]{3,}$/.test(t)) continue;

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (firstContent && isDup(h[2])) { firstContent = false; continue; }
      firstContent = false;
      const sz = h[1].length <= 1 ? SZ_SUBHEAD : SZ_SUBHEAD2;
      out.push(paraX(inlineX(h[2], { bold: true, size: sz, color: COL_TITLE }), { before: 200, after: 100 }));
      continue;
    }
    const bo = t.match(/^\*\*(.+?)\*\*:?\.?$/);
    if (bo) {
      if (firstContent && isDup(bo[1])) { firstContent = false; continue; }
      firstContent = false;
      out.push(paraX(inlineX(bo[1], { bold: true, size: SZ_SUBHEAD2, color: COL_TITLE }), { before: 160, after: 80 }));
      continue;
    }
    firstContent = false;

    const bullet = t.match(/^[-*+•]\s+(.*)$/);
    if (bullet) {
      out.push(paraX(runX('•\t', { size: SZ_BODY, color: COL_ACCENT, bold: true }) + inlineX(bullet[1], { size: SZ_BODY, color: COL_BODY }), { bullet: true, after: 80 }));
      continue;
    }
    const num = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (num) {
      out.push(paraX(runX(`${num[1]}.\t`, { size: SZ_BODY, color: COL_ACCENT, bold: true }) + inlineX(num[2], { size: SZ_BODY, color: COL_BODY }), { indent: 360, after: 80 }));
      continue;
    }
    out.push(paraX(inlineX(t, { size: SZ_BODY, color: COL_BODY }), { align: 'both', after: 140 }));
  }
  return out.join('');
}


// ─── Mode B (réponse libre / sans cadre imposé) ───
// Mapping miroir de frontend/lib/ai/sections-b.ts : permet de regrouper la map
// plate {id_section: texte} renvoyée par l'export front en chapitres I..IV.
const CHAPTER_TITLES_B: Record<string, string> = {
  I: 'Présentation de notre structure',
  II: 'Les moyens humains',
  III: 'Les moyens opérationnels',
  IV: 'Les moyens organisationnels',
};

const AI_SECTIONS_B: Array<{ id: string; chapter: string; title: string }> = [
  // I — Présentation de notre structure
  { id: 'b_presentation', chapter: 'I', title: 'Présentation de la société GSS' },
  { id: 'b_implantation', chapter: 'I', title: 'Implantation régionale et agences de proximité' },
  { id: 'b_agrements', chapter: 'I', title: 'Autorisations, agréments CNAPS et conformité légale' },
  { id: 'b_engagement_rse', chapter: 'I', title: 'Engagement RSE et écologique' },
  // II — Les moyens humains
  { id: 'b_moyens_humains', chapter: 'II', title: 'Qualifications et profils des agents (CQP APS, SSIAP)' },
  { id: 'b_encadrement', chapter: 'II', title: 'Encadrement et organigramme opérationnel' },
  { id: 'b_reprise_personnel', chapter: 'II', title: 'Reprise du personnel en place' },
  { id: 'b_recrutement_formation', chapter: 'II', title: 'Recrutement, formation et montée en compétences' },
  { id: 'b_dispositif_absence', chapter: 'II', title: "Dispositif palliatif d'absence et remplacement" },
  { id: 'b_tenues_epi', chapter: 'II', title: 'Tenues et équipements de protection des agents' },
  // III — Les moyens opérationnels
  { id: 'b_moyens_materiels', chapter: 'III', title: 'Moyens matériels et équipements' },
  { id: 'b_rondes', chapter: 'III', title: 'Rondes, pointeaux et main courante électronique' },
  { id: 'b_controle_acces', chapter: 'III', title: 'Gestion des accès et contrôle des flux' },
  { id: 'b_telesurveillance', chapter: 'III', title: 'Télésurveillance et levée de doute' },
  { id: 'b_gestion_alarmes', chapter: 'III', title: "Gestion des alarmes et procédures d'intervention" },
  // IV — Les moyens organisationnels
  { id: 'b_organisation', chapter: 'IV', title: 'Organisation et démarrage de la prestation' },
  { id: 'b_planning', chapter: 'IV', title: 'Plannings et continuité de service' },
  { id: 'b_suivi_qualite', chapter: 'IV', title: 'Suivi qualité, contrôles inopinés et reporting' },
  { id: 'b_procedures', chapter: 'IV', title: 'Procédures opérationnelles et gestion des incidents' },
  { id: 'b_amelioration', chapter: 'IV', title: 'Amélioration continue et bilan de prestation' },
];

const CHAPTER_ORDER_B = ['I', 'II', 'III', 'IV'];
/** Exigence qui porte sur la composition du dossier de l'offre (pas sur la prestation) : ni question à GSS, ni texte du mémoire. */
// Prix et bordereaux (BPU, DPGF, DQE) : la phrase qui parle de REMPLIR ou de CHIFFRER une pièce financière n'est pas un
// engagement du mémoire technique (génération réelle imm 15 : « GSS complétera le BPU des prestations ponctuelles avec
// des taux distincts… »). Une prestation qui cite seulement le bordereau reste un engagement (Becquerel : « renforts
// exceptionnels commandés sur la base du BPU avec un délai de prévenance de 48 heures ouvrées »).
/** Montants de l'attestation d'assurance de GSS (Hiscox, contrat HA RCP0242762, réponse de GSS du 1er octobre 2026), en euros. */
export const MONTANTS_ATTESTATION_GSS = new Set(['300000', '50000', '8000000', '1500000', '500000', '800000', '30000']);
/**
 * Réponse du cadre : lignes de tableau écrites avec des « | » (avec ou sans « | » aux bords) écrites comme les tableaux de GSS
 * dans le cadre (texteBrut) : cellules séparées par « : » ; une cellule qui porte déjà « libellé : valeur » (« en service : 10 »)
 * fait séparer les cellules par « ; » après la première (« Dimanche férié, 6 h–21 h — Agent de sécurité ; en service : 10 ;
 * rotation : 20 »). Ligne de séparation « ---|--- » retirée. Aucun mot n'est changé.
 */
export function sansBarresTableau(texte: string): string {
  return String(texte || '').split('\n').map((l) => {
    if (/^\s*\|?\s*:?-{3,}[\s|:-]*$/.test(l)) return null;
    if ((l.match(/\s\|\s|^\s*\||\|\s*$/g) || []).length < 2) return l;
    const cellules = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean);
    if (cellules.length < 2) return l;
    if (cellules.some((c) => /\s:\s/.test(c))) return `${cellules[0]} — ${cellules.slice(1).join(' ; ')}`;
    return cellules.join(' : ');
  }).filter((l): l is string => l !== null).join('\n');
}
export const PIECES_OFFRE = /acte d.engagement|bordereau de prix|\b(?:compl[èée]t|rempli|renseign|chiffr|fourni)[a-zé]*\s+(?:aussi\s+|également\s+)?(?:les |le |des )?prix\b|(?:compl[ée]t|rempli|renseign|chiffr|joindr|fourni)[^.]{0,40}(?:\b(?:BPU|DPGF|DQE)\b|bordereaux? (?:de|des) prix)|(?:\b(?:BPU|DPGF|DQE)\b|bordereaux? (?:de|des) prix)[^.]{0,30}(?:compl[ée]t|rempli|renseign)|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?|interdictions? de soumissionner|\bL\.?\s?(?:21[34]\d|52\d\d)-\d|\b(?:DC[124]|DUME)\b|(?:attestations?|d[ée]clarations?) sur l.honneur|obligations? (?:sociales et fiscales|fiscales et sociales)|obligations? relatives? [àa] l.emploi des travailleurs handicap/i;
/**
 * Forme de comparaison d'un texte (cadre : garde-fous et libellés) : minuscules, sans accents, apostrophes typographiques
 * (’ ‘ ʼ) ramenées à « ' » et espaces insécables à l'espace (rouen_univ 472 : « Prime de fin d’année » rédigée avec ’ était
 * retirée comme « invention » alors que le mémoire type l'écrit avec « ' »).
 */
export function normComparaison(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ]/g, "'").replace(/[  ]/g, ' ');
}
/**
 * Nom de l'acheteur dans tout le mémoire (T4C-3) : le nom brut de l'analyse (imm : « ASSOCIATION … (Nouvel IMM) –
 * Association régie par la loi du 1er juillet 1901 ») devient la forme longue retenue (variable CLIENT), écrite à la
 * première mention seulement ; ensuite la forme courte (« l'IMM »). Sections données dans l'ordre du document.
 */
export function nomClientCourtApresPremiere(sections: Record<string, string>, cl: { valeur?: any; court?: any; articleCourt?: string; article?: string } | undefined, brut = ''): void {
  if (!cl?.valeur || !cl?.court) return;
  const ids = Object.keys(sections);
  const long = String(cl.valeur);
  const b = String(brut || '').replace(/\s+/g, ' ').trim();
  let textes = ids.map((id) => String(sections[id] ?? ''));
  if (b && b !== long && b.length > long.length) {
    const rx = new RegExp(b.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
    textes = textes.map((t) => t.replace(rx, long));
  }
  const sorties = formeCourteApresPremiere(textes, long, { article: cl.articleCourt ?? '', nom: String(cl.court) }, cl.article || '');
  ids.forEach((id, i) => { sections[id] = sorties[i]; });
}
/** Activité de l'autorisation CNAPS de GSS (même libellé dans le tableau des autorisations et dans le texte des cadres). */
const ACTIVITE_CNAPS_GSS = 'Surveillance humaine et gardiennage (activités privées de sécurité, livre VI du CSI)';

/**
 * Identité CNAPS de GSS écrite d'une seule source dans les réponses d'un cadre (T3-CONS-6, havre2 1352 : tableau des autorisations
 * rempli, puis plus bas « • Activité : [À COMPLÉTER]. • Agrément de l'entreprise : [À COMPLÉTER]. ») : un libellé d'identité CNAPS
 * suivi de « [À COMPLÉTER] » reçoit la valeur connue (activité, autorisation d'exercer AUT-…, sa date, agrément dirigeant AGD-…) ;
 * les dates encore inconnues (fins de validité) restent à compléter, demandées par la question unique de questions_gss_une_fois.
 */
export function completerIdentiteCnaps(texte: string): string {
  const date = (v: string) => v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
  const valeur = (libelle: string): string => {
    const l = normaliser(libelle).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/validit|expir|echeance/.test(l)) return /dirigeant/.test(l) ? valeurRegistre('fin_validite_agrement_dirigeant') : valeurRegistre('fin_validite_autorisation_cnaps');
    if (/^activit(?:e|es)(?: autorisee?s?| exercee?s?| de l'entreprise| cnaps| de l'autorisation)?$/.test(l)) return ACTIVITE_CNAPS_GSS;
    if (/dirigeant/.test(l) && /agrement|autorisation/.test(l) && !/date/.test(l)) return valeurRegistre('agrement_dirigeant');
    if (/date/.test(l) && /(?:autorisation|agrement)/.test(l) && /(?:obtention|delivrance)/.test(l) && !/dirigeant/.test(l)) return date(valeurRegistre('date_autorisation_cnaps'));
    if (/^(?:agrement|autorisation)(?: d'exercer)?(?: de l'entreprise| cnaps| de gss)?(?: n ?°?| numero)?$|^(?:n ?°?|numero) d'(?:autorisation|agrement)(?: de l'entreprise| cnaps)?$/.test(l)) return valeurRegistre('autorisation_cnaps');
    return '';
  };
  const rempli = String(texte || '').replace(/^(\s*(?:[•\-*]\s+)?)([^:\n\[]{3,80}?)\s*:\s*\[À COMPLÉTER\]/gm, (m, puce: string, libelle: string) => {
    const v = valeur(libelle.replace(/\*\*/g, ''));
    return v ? `${puce}${libelle} : ${v}` : m;
  });
  // Marqueur du modèle qui demandait une donnée CNAPS connue (« [CONSULTATION REQUISE : Transmettre les dates de fin de validité
  // de l'autorisation d'exercer et le numéro de l'agrément de l'entreprise.] », havre2 1352, T4N-3) : la donnée connue n'est
  // plus demandée ; le marqueur est retiré s'il ne demandait qu'elle.
  return rempli.replace(/\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/g, (m, q: string) => {
    const reste = sansDonneesCnapsConnues(q);
    if (reste === null) return '';
    return reste === q ? m : `[CONSULTATION REQUISE : ${reste}]`;
  }).replace(/\n{3,}/g, '\n\n');
}

/** Question unique des dates CNAPS (questions_gss_une_fois, rubrique b2_identite) ; '' si la liste ne la porte plus. */
function questionDatesCnaps(): string {
  try {
    const q = (((chargerMemoireType() as any).questions_gss_une_fois?.questions || []) as any[]).find((x: any) => /Autorisation CNAPS et agr[ée]ment dirigeant/.test(String(x?.question || '')));
    return String(q?.question || '');
  } catch { return ''; }
}

/** Libellés écrits sans modèle dans les cellules d'identité d'un cadre (tableau des autorisations CNAPS, signataire). */
const LIBELLES_IDENTITE_DETERMINISTES = 'Surveillance humaine et gardiennage (activités privées de sécurité, livre VI du CSI, Code de la sécurité intérieure) ; Dirigeant d\u2019entreprise de surveillance et de gardiennage ; Dirigeant de GLOBAL SECURITY SERVICES';

/**
 * Question exacte à GSS (D7) : une demande qui n'est ni une question ni une tâche de validation (« Pour un agent
 * cynophile affecté, le chien doit être tenu en laisse… », « durée du marché prévue aux pièces contractuelles ») est
 * présentée comme l'exigence du DCE à laquelle GSS doit répondre, avec une vraie question.
 */
/**
 * Alerte de la réponse libre quand des appels au modèle ont échoué pendant la génération (OpenAI en panne, T5-COH-2) :
 * étapes concernées, rubriques non adaptées au CCTP ; '' si tout a répondu.
 */
export function alerteRedactionIndisponible(labels: string[], nonAdaptees: string[] = []): string {
  if (!labels.length) return '';
  const etapes: string[] = [];
  const a = (rx: RegExp, nom: string) => { if (labels.some((l) => rx.test(l)) && !etapes.includes(nom)) etapes.push(nom); };
  a(/analyse dce/i, 'analyse du DCE');
  a(/format impos/i, 'lecture du format imposé par le RC (limite de pages et plan)');
  a(/matrice|exigences|couverture|coh[ée]rence/i, 'lecture et contrôle des exigences du CCTP');
  a(/obligations|horaires|valeurs impos/i, 'délais, fréquences et horaires imposés par le CCTP');
  a(/proposition|nouvelle/i, 'propositions de réponse aux questions nouvelles');
  a(/compr[ée]hension/i, 'compréhension du besoin');
  a(/^adaptation/i, 'adaptation des rubriques au CCTP');
  const n = labels.length;
  return `Rédaction automatique indisponible pendant la génération (${n} appel${n > 1 ? 's' : ''} au modèle sans réponse)${etapes.length ? ` : ${etapes.join(', ')}` : ''}${nonAdaptees.length ? ` ; rubrique${nonAdaptees.length > 1 ? 's' : ''} non adaptée${nonAdaptees.length > 1 ? 's' : ''} au CCTP : ${nonAdaptees.map((t) => `« ${t} »`).join(', ')}` : ''}. Le mémoire n'est pas complet : relancez la génération avant la remise.`;
}

/**
 * Vocabulaire des schémas de la bibliothèque pour ce marché : terme du CCTP (« chef de poste ») et fréquence des réunions de
 * suivi du DCE à la place de la fréquence habituelle de GSS (T2-CONS-4 : schéma « Réunions de suivi — Mensuelles ou
 * trimestrielles » à côté d'un texte « chaque année »).
 */
export function vocabulaireSchemasDuMarche(dce: string, variables: Record<string, any> = {}): Array<[string, string]> {
  const v = vocabulaireSchemas(dce);
  const f = variables.FREQ_REUNIONS?.valeur;
  if (typeof f === 'string' && f.trim()) v.push(['mensuelles ou trimestrielles', f.trim()]);
  return v;
}

/** Fréquences écrites dans les textes d'un schéma SVG (« Mensuelles ou trimestrielles ») et absentes d'un texte. */
export function frequencesAbsentes(svg: string, texte: string): string[] {
  const FREQ = /(?<![\p{L}])(?:quotidien|hebdomadaire|bimensuel|mensuel|bimestriel|trimestriel|semestriel|annuel)(?:le)?s?(?![\p{L}])/giu;
  const mots = (String(svg || '').match(/>([^<>]+)</g) || []).map((x) => x.slice(1, -1)).join(' ');
  const racine = (w: string) => w.toLowerCase().replace(/(?:le)?s?$/, '');
  const dansTexte = new Set((String(texte || '').match(FREQ) || []).map(racine));
  // Même fréquence écrite autrement (« une fois par mois », « chaque trimestre », « par an »).
  const t = String(texte || '').toLowerCase();
  const EQUIV: Array<[string, RegExp]> = [['quotidien', /par jour|chaque jour|tous les jours/], ['hebdomadaire', /par semaine|chaque semaine|toutes les semaines/],
    ['mensuel', /par mois|chaque mois|tous les mois/], ['bimestriel', /tous les deux mois/], ['trimestriel', /par trimestre|chaque trimestre|tous les trois mois|dans le trimestre/],
    ['semestriel', /par semestre|tous les six mois/], ['annuel', /par an\b|chaque année|tous les ans|par année/]];
  for (const [w, rx] of EQUIV) if (rx.test(t)) dansTexte.add(w);
  return [...new Set((mots.match(FREQ) || []).map(racine))].filter((w) => !dansTexte.has(w));
}

/** Familles de fréquence d'un texte (« une fois par trimestre », « trimestrielles », « dans le trimestre » → « trimestriel »). */
export function familleFrequence(t: string): string[] {
  const s = String(t || '').toLowerCase();
  const out: string[] = [];
  const f = (nom: string, rx: RegExp) => { if (rx.test(s)) out.push(nom); };
  f('quotidien', /quotidien|par jour\b|chaque jour/);
  f('hebdomadaire', /hebdomadaire|par semaine|chaque semaine/);
  f('mensuel', /mensuel|par mois\b|chaque mois|tous les mois/);
  f('trimestriel', /trimestr/);
  f('semestriel', /semestr/);
  f('annuel', /annuel|par an\b|chaque année|tous les ans/);
  return out;
}
/** Familles de fréquence d'un extrait de GSS absentes de son remplacement (fréquence changée). */
export function frequencesRetirees(extrait: string, remplacement: string): string[] {
  const apres = familleFrequence(remplacement);
  return familleFrequence(extrait).filter((x) => !apres.includes(x));
}

/** Exigence citée par une correction du modèle, sur une ligne. */
function exigenceDeCorrection(c: any): string {
  return String(c?.exigence || '').replace(/\s+/g, ' ').trim();
}

/**
 * Question exacte à GSS quand une valeur de GSS n'est pas alignée sur le CCTP (T5N-6) : un montant (assurance) garde la question
 * de garantie ; un délai, une fréquence ou un jalon demande si GSS s'engage sur l'exigence, ou quelle valeur écrire.
 */
export function questionAlignementRefuse(exigence: string, extrait: string, autres: string[] = []): string {
  const e = phraseLisible(exigence, 420).replace(/[.\s]+$/, '');
  const x = phraseLisible(extrait.replace(/[*_#]/g, ''), 420);
  if (/€|\beuros?\b|\bk€|\bM€/i.test(`${e} ${x}`) && !/minutes?|heures?|jours?|par (?:mois|an|trimestre|semaine)/i.test(e)) {
    return `Le DCE exige : « ${e} ». Le mémoire indique la valeur de GSS : « ${x} ». Disposez-vous d'une garantie ou d'une valeur conforme à cette exigence (extension, attestation), et laquelle faut-il écrire ?`;
  }
  return `Le DCE exige : « ${e} ». Le mémoire indique la pratique de GSS : « ${x} »${autres.length ? ` (même valeur écrite aussi dans ${autres.map((t) => `« ${t} »`).join(', ')})` : ''}. Pouvez-vous vous engager sur l'exigence du DCE${autres.length ? ' dans toutes ces rubriques' : ''}, ou quelle valeur faut-il écrire ?`;
}

/**
 * Question exacte à GSS pour une phrase ajoutée par l'IA (adaptation au CCTP) et refusée parce qu'elle promet un délai plus
 * court que celui de GSS, quand aucune phrase du DCE ne la fonde mot pour mot (T6C-2) : la phrase de l'IA est citée comme
 * telle, jamais comme une exigence du DCE.
 */
export function questionAjoutRefuse(phraseIA: string, extrait: string): string {
  return `Phrase proposée par l'IA d'après le cahier des charges : « ${phraseLisible(phraseIA, 420).replace(/[.\s]+$/, '')} ». Le mémoire indique la pratique de GSS : « ${phraseLisible(extrait.replace(/[*_#]/g, ''), 420)} ». Pouvez-vous vous engager sur cette phrase, ou quelle valeur faut-il écrire ?`;
}

/**
 * Rubriques du plan (et propositions de l'IA) dont la page de schéma est prévue mais absente du document rendu (T6-COH-4,
 * T6N-6) : schéma prévu par le mémoire type, rubrique « besoin » (schéma de process, consigne 3) ou proposition ; la
 * compréhension du besoin en tête. Une rubrique sans schéma prévu (introduction des références) n'est pas comptée.
 */
export function rubriquesSansSchema(plan: PlanMemoireType, ajouts: Array<{ id: string; title: string; emplacementRC?: boolean }>, textes: Record<string, string>, schemas: Map<string, string>): Array<{ id: string; titre: string; besoin: boolean }> {
  const out: Array<{ id: string; titre: string; besoin: boolean }> = [];
  for (const r of plan.rubriques) {
    if (!(textes[r.id] || '').trim() || schemas.has(CLE_SCHEMA(r.id))) continue;
    if (r.mode === 'besoin' || r.schema) out.push({ id: r.id, titre: r.titre, besoin: r.mode === 'besoin' });
  }
  for (const a of ajouts) if (!a.emplacementRC && (textes[a.id] || '').trim() && !schemas.has(CLE_SCHEMA(a.id))) out.push({ id: a.id, titre: a.title, besoin: false });
  return out.sort((a, b) => Number(b.besoin) - Number(a.besoin));
}

/** Ligne de consultation déjà formulée sans modèle (jamais envoyée à la fusion par le modèle, jamais reformulée). */
export const LIGNE_DETERMINISTE = /^(?:Proposition à valider|Le cahier des charges prévoit des rondes ponctuelles|Proposition de réponse à valider|Réponse à relire|Réponse «|Réponse du cadre\s*:|Phrases adaptées au cahier des charges|Partie «|Rubrique «|Rédaction automatique indisponible|Phrase proposée par l'IA d'après le cahier des charges|Phrases? ajoutées? au texte de GSS)/;

/**
 * Demande écrite à l'impératif ou en question fermée au sens inversé (T2-CONS-7 : « Joindre les CV… » devenu « GSS doit-elle
 * joindre les CV… ? », alors que le cadre les exige) : question ouverte à GSS (« Pouvez-vous fournir les CV… ? »).
 */
/** Sous-titre (ligne courte sans point final) écrit juste avant le `rang`-ième « [À COMPLÉTER] » d'une réponse du cadre ; '' sinon. */
export function sousTitreDeLEmplacement(valeur: string, rang: number): string {
  const morceaux = String(valeur || '').split('[À COMPLÉTER]');
  if (rang >= morceaux.length - 1) return '';
  const avant = morceaux.slice(0, rang + 1).join('[À COMPLÉTER]');
  const lignes = avant.split('\n');
  // L'emplacement est seul sur sa ligne : le sous-titre est la dernière ligne non vide qui le précède.
  if (lignes[lignes.length - 1].trim()) return '';
  const l = lignes.slice(0, -1).map((x) => x.trim()).filter(Boolean).pop() || '';
  const t = l.replace(/^[#*\s•-]+|[*\s:]+$/g, '').trim();
  return t && t.split(/\s+/).length <= 10 && !/[.;!?]$/.test(t) ? t : '';
}

/**
 * Pièces que la question du cadre demande pour une partie (« … encadrants, CV détaillés des encadrants, cartes professionnelles
 * CNAPS des agents… ») : morceaux de la question qui citent une pièce (CV, carte, attestation, certificat, agrément…), d'abord
 * ceux qui partagent un mot avec le sous-titre ; '' s'il n'y en a pas.
 */
export function piecesDemandeesParLeCadre(question: string, sousTitre: string): string {
  const PIECE = /(?<![\p{L}])(?:CV|curriculum|cartes?\s+professionnelles?|attestations?|certificats?|agr[ée]ments?|justificatifs?|dipl[ôo]mes?|habilitations?|pi[èe]ces?|copies?)(?![\p{L}])/iu;
  const morceaux = String(question || '').split(/\s*[;:()]\s*|,\s+(?=\p{Lu}|\p{Ll}{3,}\s)/u).map((x) => x.replace(/\s+/g, ' ').replace(/,?\s*etc\.?$/i, '').trim()).filter((x) => x.length >= 3 && PIECE.test(x));
  if (!morceaux.length) return '';
  const motsTitre = new Set(normaliser(sousTitre).split(/[^a-z]+/).filter((w) => w.length >= 5).map((w) => w.slice(0, 6)));
  const proches = morceaux.filter((m) => normaliser(m).split(/[^a-z]+/).some((w) => motsTitre.has(w.slice(0, 6))));
  const l = [...new Set([...proches, ...morceaux])].slice(0, 3).map((x) => `« ${x.length > 120 ? `${x.slice(0, 120).replace(/\s+\S*$/, '')}…` : x} »`);
  return l.join(', ');
}

/**
 * Motif de refus d'un alignement du texte de GSS sur le CCTP (étape « Cohérence avec le CCTP », D8, T2-CONS-9) ; '' s'il est
 * admis : l'exigence citée doit figurer mot pour mot dans le DCE (à la ponctuation près) ; une exigence tirée d'une grille de
 * pénalités ne fonde jamais une adaptation ; la phrase adaptée garde au moins la moitié des mots porteurs de la phrase de GSS
 * (même sujet, même action : un délai ou un chiffre change, pas la procédure).
 */
export function refusAlignementCctp(extrait: string, remplacement: string, exigence: string, dce: string): string {
  const plat = (t: string) => normaliser(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  const e = plat(String(exigence || '').replace(/^\s*horaire impos[ée]\s*:\s*/i, ''));
  if (!e || e.split(' ').length < 4) return 'exigence non citée';
  if (!plat(dce).includes(e)) {
    // Citation d'un fragment de tableau ou avec une coupure : les mots porteurs de l'exigence (85 % au moins) dans une même
    // phrase du DCE.
    const motsE = [...new Set(e.split(' ').filter((w) => w.length >= 4))];
    const phrase = String(dce || '').split(/(?<=[.;!?])\s+|\n{2,}/).find((ph) => { const p = ` ${plat(ph)} `; return motsE.length >= 3 && motsE.filter((w) => p.includes(` ${w} `)).length / motsE.length >= 0.85; });
    if (!phrase) return 'exigence absente du DCE';
  }
  if (/p[ée]nalit|€|euros?\b|\bHT\b|retenue sur facture/i.test(exigence)) return 'grille de pénalités';
  const mots = (t: string) => [...new Set(plat(t).split(' ').filter((w) => w.length >= 5))];
  const avant = mots(extrait);
  const garde = avant.filter((w) => mots(remplacement).includes(w)).length;
  if (avant.length >= 4 && garde / avant.length < 0.5) return 'phrase de GSS réécrite (sujet ou action changés)';
  return '';
}

/**
 * Schéma de process du bloc 1 construit sans modèle sur son texte (T2N-6) : périmètre et attentes (specSecoursBesoin), puces
 * des attentes et des points de vigilance, puis obligations chiffrées ; le premier dessin accepté par le moteur. '' si aucun.
 * La phrase de GSS d'une autre rubrique reprise pour la carte « nous » (phraseDe, T3-CONS-2) est une source autorisée du
 * contrôle du schéma, comme le texte du bloc 1 (T4N-1, becquerel 1401 : « Nous privilégions la stabilité sur les sites fixes »
 * refusé, aucun schéma de process) ; après un refus, les mêmes schémas sont reconstruits sur le seul texte du bloc 1.
 */
export async function dessinerProcessSecoursBloc1(texte: string, id: string, titre: string, theme?: string, phraseDe?: (titreRubrique: string) => string): Promise<string> {
  const phrasesGss: string[] = [];
  const phraseNotee = phraseDe ? (x: string) => { const p = phraseDe(x); if (p) phrasesGss.push(p); return p; } : undefined;
  const essais: Array<(t: string) => { gabarit: string; params: any } | null> = [
    (t) => specSecoursBesoin(t, phraseNotee), (t) => specSecoursPuces(t, phraseNotee),
    ...(phraseDe ? [(t: string) => specSecoursBesoin(t), (t: string) => specSecoursPuces(t)] : []),
    specSecoursObligations,
  ];
  const vus = new Set<string>();
  for (const f of essais) {
    phrasesGss.length = 0;
    const spec = f(String(texte || ''));
    if (!spec || vus.has(JSON.stringify(spec))) continue;
    vus.add(JSON.stringify(spec));
    const source = [texte, ...phrasesGss].join('\n');
    try {
      const d = (await dessinerSpecs([{ id, gabarit: spec.gabarit, params: spec.params, source, titre_section: titre }], 'page', theme)).get(id);
      if (d?.ok && d.svg) return d.svg;
      if (d?.erreurs?.length) console.warn(`[MemoireGenerator] Schéma de secours du bloc 1 refusé (${d.erreurs.slice(0, 2).join(' ; ')}) : secours suivant.`);
    } catch { /* moteur indisponible : secours suivant */ }
  }
  return '';
}

/**
 * Question (à GSS ou à l'acheteur) sur une fréquence que le DCE écrit déjà (T7-CONS-8, ifsem : « Pouvez-vous préciser la fréquence
 * attendue des réunions de suivi … ? » alors que le CCTP donne « Site de Pouchet : une fois tous les trois mois ; l'ensemble des
 * autres sites : une fois tous les mois », déjà reprise par la phrase adaptée D8) : jamais posée.
 */
export function questionSurFrequenceDuDce(q: string, dce: string): boolean {
  const t = String(q || '');
  if (!/fr[ée]quences?|p[ée]riodicit[ée]|rythme|combien de fois/i.test(t)) return false;
  if (/r[ée]unions?|comit[ée]s?\s+de\s+suivi|points?\s+de\s+suivi/i.test(t)) return !!phraseFrequenceReunionsDce(dce);
  if (/contr[ôo]les?\s+inopin/i.test(t)) return !!frequenceInopinesDce(dce);
  return false;
}

export function questionOuverte(q: string): string {
  const t = String(q || '').trim();
  if (!t || LIGNE_DETERMINISTE.test(t) || /^À demander à l.acheteur/i.test(t)) return t;
  const VERBES: Array<[RegExp, string]> = [
    [/^(?:joindre|fournir|transmettre|communiquer|remettre|produire|annexer)$/i, 'Pouvez-vous fournir'],
    [/^(?:pr[ée]ciser|indiquer|d[ée]crire|d[ée]tailler|expliquer|d[ée]finir|fixer)$/i, 'Pouvez-vous préciser'],
    [/^(?:valider|confirmer)$/i, 'Validez-vous'],
  ];
  const reformuler = (verbe: string, reste: string) => {
    // (proposition d'un tiers après « ; » retirée : « … ; le planning est validé par l'acheteur », T7-COH-4)
    const r = sansPropositionDeTiers(reste).replace(/[.?!\s]+$/, '').trim();
    const v = VERBES.find(([rx]) => rx.test(verbe));
    return v ? `${v[1]} ${r} ?` : `Pouvez-vous ${verbe.toLowerCase()} ${r} ?`;
  };
  let m = /^(?:GSS|la soci[ée]t[ée]|l['’]entreprise|le titulaire|le candidat)\s+(?:doit|devra|peut|pourra)-(?:t-)?(?:elle|il)\s+(\p{L}+)\s+(.+)$/iu.exec(t);
  if (m) return reformuler(m[1], m[2]);
  m = /^(?:GSS|le titulaire|le candidat)\s+(?:doit|devra)\s+(\p{L}+)\s+(.+)$/iu.exec(t);
  if (m && !/\?\s*$/.test(t)) return reformuler(m[1], m[2]);
  m = /^(joindre|fournir|transmettre|communiquer|remettre|produire|annexer|pr[ée]ciser|indiquer|d[ée]crire|d[ée]tailler|d[ée]finir|fixer)\s+(.+)$/iu.exec(t);
  if (m && !/\?\s*$/.test(t)) return reformuler(m[1], m[2]);
  return t;
}

/**
 * Questions à GSS sans redite (T2-CONS-7, T2N-7) : une question qui redit celle d'un emplacement à compléter est retirée
 * (l'emplacement la pose déjà) ; une question qui ne fait que reprendre une exigence déjà traitée par une proposition de
 * réponse (D5) est retirée ; deux questions sur le même sujet n'en font qu'une (sources réunies). Les lignes formulées sans
 * modèle et les questions rattachées à un repère du texte sont toujours gardées.
 */
/**
 * Question sans citation déjà traitée par le mémoire (T6-CONS-15 : « Quelle sera la fréquence des contrôles sur site ? » alors que
 * le mémoire imprime « contrôle de fond une fois par mois, contrôles inopinés une à trois fois par mois » ; « Quel plan de
 * remplacement prévoyez-vous… ? » sous les rubriques « Le remplacement d'un agent absent ») : la donnée qu'elle demande est
 * cherchée dans les titres et les phrases du mémoire. Fréquence : une phrase qui nomme l'objet avec une fréquence ; donnée
 * chiffrée (délai, nombre, durée…) : une phrase qui nomme l'objet avec un nombre ; plan, procédure, organisation : un titre
 * qui nomme l'objet. Jamais pour une personne ou des coordonnées.
 */
export function questionCouverteParLeMemoire(q: string, texte: string): boolean {
  if (/«/.test(q) || !texte) return false;
  const m = /^(?:Quel(?:le)?s?\s+(?:sera|seront|est|sont)\s+|Quel(?:le)?s?\s+)(.+?)(?:\s+(?:pr[ée]voyez|proposez|mettez|envisagez|comptez|assurez|appliquez|retenez|organisez|utilisez)-vous\b.*)?\s*\?\s*$/i.exec(String(q || '').trim());
  return !!m && objetTraiteParLeMemoire(m[1], texte);
}

/**
 * La donnée nommée par `objet` (« la fréquence des contrôles sur site », « Plan de remplacement en cas d'absence de l'agent »,
 * « Nombre d'agents présents au centre de permanence ») est-elle déjà traitée par le mémoire (T6-CONS-15, T6-CONS-11) ?
 * Fréquence : une phrase qui nomme l'objet avec une fréquence ; donnée chiffrée : une phrase qui nomme l'objet avec un nombre ;
 * plan, procédure, organisation : un titre qui nomme la tête de l'objet. Jamais une personne, des coordonnées ni des pièces.
 */
export function objetTraiteParLeMemoire(objetBrut: string, texte: string): boolean {
  if (!texte) return false;
  const objet = normaliser(objetBrut).replace(/[^a-z0-9 ]+/g, ' ');
  if (/\b(?:nom|noms|identite|coordonnees|interlocuteur|telephone|adresse|responsable|qui|cv|attestations?|certificats?|copies?|justificatifs?)\b/.test(objet)) return false;
  const VIDES = new Set(['informations', 'information', 'presenter', 'sujet', 'elements', 'donnees', 'points', 'frequence', 'periodicite', 'plan', 'procedure', 'procedures', 'organisation', 'modalites', 'methode', 'methodologie', 'dispositif', 'nature', 'liste', 'site', 'sites', 'prevue', 'prevu', 'mise', 'place', 'delai', 'delais', 'nombre', 'duree', 'cadre', 'mesures', 'moyens', 'votre', 'notre', 'pour', 'avec', 'dans', 'sera', 'sont', 'affecte', 'affectes', 'affectee', 'affectees', 'assurant', 'mis', 'utilises']);
  const chiffre = /\b(?:delai|delais|nombre|duree|effectif|montant|taux|date|heure|horaires?)\b/.test(objet);
  const frequence = /\b(?:frequence|periodicite)\b/.test(objet);
  // Tête de l'objet (avant son premier complément « en cas de », « pour », « sur », « avec »…) pour un plan ou une procédure ;
  // l'objet entier pour une donnée chiffrée (« … au centre de permanence » est la donnée elle-même).
  const tete = chiffre || frequence ? objet : objet.split(/\s(?:en cas|pour|sur|avec|dans|lors|aupres|aux?|selon)\s/)[0];
  const mots = tete.split(/\s+/).filter((w) => w.length >= 4 && !VIDES.has(w) && !['des', 'les', 'une', 'aux'].includes(w)).map((w) => w.replace(/s$/, '').slice(0, 6));
  if (!mots.length) return false;
  const n = (t: string) => normaliser(t).replace(/[^a-z0-9 ]+/g, ' ');
  // Titres Markdown, et sous-titres en ligne seule d'une réponse de cadre (« Écogestes »).
  const titres = [...String(texte).matchAll(/^(?:#{1,4}\s+(.+)|([A-ZÀ-Ý][^.!?;:\n]{2,80}))$/gm)].map((x) => n(x[1] || x[2]));
  const phrases = String(texte).split(/(?<=[.!?;])\s+|\n+/).map(n);
  const nomme = (t: string) => mots.every((w) => t.includes(w));
  if (frequence) return phrases.some((p) => nomme(p) && /\b(?:une?|deux|trois|quatre|cinq|six|\d+)\s+(?:a\s+(?:deux|trois|quatre|cinq|\d+)\s+)?fois\s+par\b|\bchaque\s+(?:jour|nuit|semaine|mois|trimestre|semestre|annee)|\b(?:hebdomadaire|mensuel|trimestriel|semestriel|annuel|quotidien)/.test(p));
  if (chiffre) return phrases.some((p) => nomme(p) && /\d/.test(p));
  return titres.some(nomme);
}

export function sansQuestionsRedites<T extends { question: string; sources?: number[] }>(qs: T[], o: { prioritaires?: string[]; exigencesProposees?: string[]; texteMemoire?: string; garder?: (q: T) => boolean } = {}): T[] {
  const prioritaires = (o.prioritaires || []).filter(Boolean);
  const clesPrioritaires = new Set(prioritaires.flatMap(cleDonnee));
  const clesFixes = new Set(qs.filter((q) => LIGNE_DETERMINISTE.test(q.question) || /^Proposition à valider/i.test(q.question)).flatMap((q) => cleDonnee(q.question)));
  const memoire = normaliser(o.texteMemoire || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  const out: T[] = [];
  for (const q of qs) {
    const fixe = LIGNE_DETERMINISTE.test(q.question) || !!o.garder?.(q);
    if (!fixe && !prioritaires.includes(q.question)) {
      const cles = cleDonnee(q.question);
      // Même donnée qu'une question fixe (proposition de dimensionnement, emplacement…) de la liste : la question fixe suffit (T6-CONS-4).
      if (cles.length && clesFixes.size && cles.every((k) => clesFixes.has(k))) continue;
      // Donnée déjà demandée par un emplacement (délais du cadre, remplacement d'un chien…) ou même demande.
      if (cles.length && cles.every((k) => clesPrioritaires.has(k))) continue;
      if (prioritaires.some((p) => memeDemande(p, q.question))) continue;
      // Exigence déjà traitée par une proposition de réponse (D5).
      if ((o.exigencesProposees || []).some((e) => recouvrementTextes(q.question, e) >= 0.6)) continue;
      // Document que le mémoire contient déjà (« Pouvez-vous fournir au mémoire le modèle de rapport journalier ? »).
      const doc = /^Pouvez-vous fournir\s+(?:au mémoire\s+)?(.+?)\s*\?$/i.exec(q.question);
      const d = doc ? normaliser(doc[1].replace(/^(?:le|la|les|l['’]|un|une|des)\s*/i, '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
      if (d && d.split(' ').length >= 3 && memoire.includes(d)) continue;
    }
    // Question sans citation dont la donnée est déjà dans les titres ou les phrases du mémoire (T6-CONS-15).
    if (!fixe && !prioritaires.includes(q.question) && o.texteMemoire && questionCouverteParLeMemoire(q.question, o.texteMemoire)) continue;
    // Exigence déjà traitée par un engagement ou une phrase du mémoire (T3N-4, parc_expo 1331 : « Quelle organisation
    // prévoyez-vous pour que l'agent cynophile garde les extérieurs… ? » alors que l'engagement est imprimé).
    if (!fixe && !prioritaires.includes(q.question) && o.texteMemoire) {
      const contenu = citationDe(q.question) || ((/\b(?:pour que|afin que)\s+(.+?)\s*\?\s*$/i.exec(q.question) || [])[1] || '');
      if (contenu && (exigenceTraitee(contenu, o.texteMemoire) || couvertParLeTexte(contenu, o.texteMemoire))) continue;
    }
    // Même phrase du DCE citée deux fois (T3N-6, mode dégradé : « … sur ce point : « Ne facturer qu'après… » » et « … que le
    // mémoire ne traite pas : « Ne facturer qu'après… » ») : une seule question, la forme « que le mémoire ne traite pas ».
    // Demande brute sans citation (consolidation indisponible, T4-COH-6 : « Souscrire une assurance couvrant… » avant sa mise en
    // forme) : son texte entier sert de citation.
    const citationOuTexte = (x: string) => citationDe(x) || (/«/.test(x) ? '' : x);
    const cq = citationOuTexte(q.question);
    const memeCitation = (x: T) => { const cx = citationOuTexte(x.question); return !!cq && !!cx && (normaliser(cx) === normaliser(cq) || recouvrementTextes(cx, cq) >= 0.6); };
    const double = LIGNE_DETERMINISTE.test(q.question) ? undefined : out.find((x) => !LIGNE_DETERMINISTE.test(x.question) && (memeDemande(x.question, q.question)
      || (cleDonnee(x.question).length > 0 && cleDonnee(x.question).join() === cleDonnee(q.question).join()) || memeCitation(x)));
    // Deux clauses du DCE sur le même sujet, chacune citée (T3N-6 : réversibilité au CCTP et au CCAP, confidentialité et données)
    // : une seule question qui cite les deux.
    const theme = !double && !fixe && cq && /^Quelle réponse GSS apporte-t-elle sur ce point/.test(q.question) ? THEMES_CLAUSES.find((rx) => rx.test(cq)) : undefined;
    const memeTheme = theme ? out.find((x) => /^Quelle réponse GSS apporte-t-elle sur ces? points?/.test(x.question) && theme.test(citationDe(x.question)) && !o.garder?.(x) && !prioritaires.includes(x.question)) : undefined;
    if (memeTheme) {
      const citations = [...memeTheme.question.matchAll(/«\s*([^«»]{20,}?)\s*»/g)].map((m) => m[1]);
      if (citations.length < 3) memeTheme.question = `Quelle réponse GSS apporte-t-elle sur ces points du DCE, que le mémoire ne traite pas : ${[...citations, cq].map((c) => `« ${c} »`).join(' ; ')} ?`;
      if (memeTheme.sources && q.sources) memeTheme.sources = [...new Set([...memeTheme.sources, ...q.sources])];
      continue;
    }
    if (double) {
      if (double.sources && q.sources) double.sources = [...new Set([...double.sources, ...q.sources])];
      const preferee = /que le mémoire ne traite pas/.test(q.question) && !/que le mémoire ne traite pas/.test(double.question);
      if ((preferee || (q.question.length > double.question.length && !memeCitation(double))) && !o.garder?.(double) && !prioritaires.includes(double.question)) double.question = q.question;
      continue;
    }
    out.push(q);
  }
  // Assurance : la question de l'attestation Hiscox la couvre ; une exigence d'assurance citée du DCE n'est pas redemandée (T3N-6).
  if (out.some((x) => /Hiscox/i.test(x.question))) return out.filter((x) => !(/\bassuranc/i.test(citationDe(x.question) || (/«/.test(x.question) ? '' : x.question)) && !/Hiscox/i.test(x.question) && !LIGNE_DETERMINISTE.test(x.question) && !o.garder?.(x) && !prioritaires.includes(x.question)));
  return out;
}

/**
 * Description factuelle du site tirée du DCE (site, adresse, surface, horaires d'ouverture, bâtiments), sans obligation du
 * titulaire : jamais une question à GSS (T5-CONS-9).
 */
/**
 * Clause contractuelle ou de durée du marché (CLAUSE_CONTRACTUELLE, durée, reconduction, notification, prise d'effet), T5N-5 :
 * ni une question nouvelle à proposer, ni une question à GSS.
 */
export function clauseContractuelleOuDuree(e: string): boolean {
  const t = String(e || '');
  return CLAUSE_CONTRACTUELLE.test(t) || /\bdur[ée]e (?:du march[ée]|de l['’]accord[- ]cadre|du contrat|de validit[ée])|\breconductible|\breconduit|\bnotification du (?:march[ée]|contrat)\b|\bprise d['’]effet\b|\bp[ée]riode (?:initiale|de reconduction)\b/i.test(t);
}

export function faitDuDce(e: string): boolean {
  const t = String(e || '').replace(/\s+/g, ' ').trim();
  const DESCRIPTION = /^(?:(?:le |la |les |l['’])?(?:sites?|lieux?|adresses?|surfaces?|superficies?|horaires? d['’]ouverture|b[âa]timents?|locaux|localisation|implantation|p[ée]rim[èe]tre g[ée]ographique|effectif du site))\b[^:;]{0,80}:/i;
  const OBLIGATION = /\b(?:doit|doivent|devra|devront|est tenue?|sont tenus|s['’]engage|assure|assurera|r[ée]alise|effectue|fournit|fournira|transmet|garantit|met en place|mettra|exige|exig[ée]e?s?|obligatoire|imp[ée]rati\w*|titulaire|prestataire)\b/i;
  return DESCRIPTION.test(t) && !OBLIGATION.test(t);
}

/**
 * Exigence couverte par un paragraphe du mémoire, à la conjugaison près (« garde, effectue, prévienne, dissuade » / « assurera
 * la garde, effectuera, préviendra, dissuadera ») : 70 % au moins de ses mots porteurs (racines de 5 lettres) et tous ses
 * chiffres dans un même paragraphe.
 */
function couvertParLeTexte(exigence: string, texte: string): boolean {
  const racines = (t: string) => normaliser(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
  const mots = [...new Set(racines(exigence))];
  if (mots.length < 5) return false;
  const chiffres = normaliser(exigence).match(/\d+/g) || [];
  return String(texte || '').split(/\n{2,}|\n(?=\s*[-*•]\s)/).some((p) => {
    if (!chiffres.every((c) => new RegExp(`(?<!\\d)${c}(?!\\d)`).test(normaliser(p)))) return false;
    const pr = new Set(racines(p));
    return mots.filter((w) => pr.has(w)).length / mots.length >= 0.7;
  });
}

/** Sujets de clauses du DCE réunies en une seule question quand deux pièces les écrivent (T3N-6). */
const THEMES_CLAUSES: RegExp[] = [
  /r[ée]versibilit|passation|changement de prestataire|fin (?:du|de) (?:march|contrat)|[àa] l['’]\s*[ée]ch[ée]ance/i,
  /visite (?:obligatoire|du site|des lieux)|attestation de visite/i,
  /factur/i,
  /confidentialit|secret professionnel|donn[ée]es (?:personnelles|du client)|\brgpd\b/i,
];

/** Première citation du DCE (« … », 20 signes au moins) d'une question ; '' sinon. */
function citationDe(q: string): string {
  return ((/«\s*([^«»]{20,}?)\s*»/.exec(String(q || '')) || [])[1] || '').trim();
}

export { questionCaseTableau, questionExacte } from './questions_gss';

/**
 * Éléments à compléter d'un document, sans doublon (T1C-13) : une même question sans emplacement n'est posée qu'une fois ;
 * des emplacements qui attendent la même donnée forment un groupe (la réponse les remplit tous) ; chaque question est
 * une question exacte (questionExacte).
 */
export function elementsSansDoublon(elements: ElementACompleter[]): ElementACompleter[] {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const vus = new Map<string, ElementACompleter>();
  const out: ElementACompleter[] = [];
  for (const e of elements) {
    if (e.statut === 'ouvert' && !/^Proposition à valider/i.test(e.question)) e.question = questionExacte(e.question);
    // (question vide : emplacement sans donnée nommée, T7N-3 ; jamais une carte sans question)
    if (e.statut === 'ouvert' && !String(e.question || '').trim()) continue;
    const k = norm(e.question);
    // Même demande formulée autrement (cstb 221 : « délai moyen maximum d'intervention sur site après appel de
    // télésurveillance pour une levée de doute » et « … le délai moyen maximum d'arrivée sur site du rondier après l'appel
    // de la télésurveillance… ? ») : une seule question, celle qui porte l'emplacement dans le texte.
    if (e.statut === 'ouvert' && !e.reperes?.length && !/^GSS_AC/.test(e.cle)) {
      const proche = out.find((x) => x.statut === 'ouvert' && !!x.pourAcheteur === !!e.pourAcheteur && memeDemande(x.question, e.question));
      if (proche) continue;
    }
    const deja = vus.get(k);
    if (deja && e.statut === 'ouvert' && deja.statut === 'ouvert') {
      if (!e.reperes?.length && !/^GSS_AC/.test(e.cle)) continue;
      e.groupe ||= deja.groupe || deja.cle;
      deja.groupe ||= e.groupe;
    } else vus.set(k, e);
    out.push(e);
  }
  // Question sans emplacement posée AVANT la même demande portée par un emplacement : retirée aussi.
  const filtres = out.filter((e, i) => !(e.statut === 'ouvert' && !e.reperes?.length && !/^GSS_AC/.test(e.cle)
    && out.some((x, j) => j > i && x.statut === 'ouvert' && (x.reperes?.length || /^GSS_AC/.test(x.cle)) && !!x.pourAcheteur === !!e.pourAcheteur && memeDemande(x.question, e.question))));
  // Même donnée demandée deux fois en d'autres termes (cstb 551, T5CP-11 : « délai moyen maximum d'intervention … après appel de
  // la télésurveillance » et « délai … pour l'arrivée du rondier après l'appel de la télésurveillance » ; « heure de début de
  // la ronde d'ouverture » et « horaire de départ permettant l'ouverture effective ») : une question sans emplacement est
  // retirée ; deux emplacements forment un groupe (une seule question, une seule réponse).
  const aEmplacement = (x: ElementACompleter) => !!x.reperes?.length || /^GSS_AC/.test(x.cle);
  const cles = new Map(filtres.map((x) => [x, cleDonnee(x.question)]));
  return filtres.filter((e) => {
    const k = cles.get(e)!;
    if (e.statut !== 'ouvert' || !k.length) return true;
    const memes = filtres.filter((x) => x !== e && x.statut === 'ouvert' && !!x.pourAcheteur === !!e.pourAcheteur && cles.get(x)!.length);
    if (!aEmplacement(e)) {
      const couvertes = new Set(memes.filter(aEmplacement).flatMap((x) => cles.get(x)!));
      if (k.every((c) => couvertes.has(c))) return false;
      const autre = memes.find((x) => !aEmplacement(x) && cles.get(x)!.join('|') === k.join('|'));
      return !autre || filtres.indexOf(autre) > filtres.indexOf(e);
    }
    // (cases d'un tableau de noms et de dates : chacune sa valeur, jamais groupées, T5N-14)
    const jumeau = k.some((c) => /^(?:liste_nominative_agents|cnaps_agents)$/.test(c)) ? undefined : memes.find((x) => aEmplacement(x) && cles.get(x)!.join('|') === k.join('|'));
    if (jumeau) { const g = jumeau.groupe || e.groupe || `donnee ${k.join('+')}`; jumeau.groupe = g; e.groupe = g; }
    return true;
  });
}

/** Questions ouvertes d'une liste d'éléments, une par groupe (emplacements qui attendent la même donnée) et sans doublon. */
export function questionsUniques(elements: ElementACompleter[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const e of elements) {
    if (e.statut !== 'ouvert') continue;
    const k = e.groupe ? `g:${e.groupe}` : `q:${e.question}`;
    if (vus.has(k) || out.includes(e.question)) continue;
    vus.add(k);
    out.push(e.question);
  }
  return out;
}

/**
 * Donnée précise demandée par une question à GSS (« même objet, même grandeur ») : délai d'intervention sur alarme ou levée
 * de doute, délai PTI, délai de mise en place d'une commande, délai d'urgence, délai sur SSI défaillant, horaire de la ronde
 * d'ouverture. [] si la question ne porte sur aucune de ces données.
 */
export function cleDonnee(question: string): string[] {
  const q = String(question || '').normalize('NFC');
  const out: string[] = [];
  const delai = /d[ée]lais?\b/i.test(q);
  if (delai && /PTI|DATI|travailleur isol/i.test(q)) out.push('delai_pti');
  else if (delai && /t[ée]l[ée]surveillance|lev[ée]e de doute|rondier|sur alarme|apr[èe]s (?:une |l['’])?alarme/i.test(q)) out.push('delai_alarme');
  if (delai && /mise en place (?:d['’]une |de la |des )?(?:commande|demande|prestation)|intervention courante|commande suppl[ée]mentaire|r[ée]ception du bon de commande/i.test(q)) out.push('delai_mise_en_place');
  if (delai && /urgen/i.test(q)) out.push('delai_urgence');
  if (delai && /\bSSI\b/.test(q)) out.push('delai_ssi');
  // Délai d'intervention ou de mobilisation sans autre précision (etampes2 1661, T6-CONS-4 : « Quels sont le délai d'intervention
  // et le délai de mobilisation de l'équipe… ? » à côté de « … pour une intervention courante ») : la même donnée.
  if (delai && !out.length && /d[ée]lais?\s+(?:d['’]\s*intervention|de\s+mobilisation|de\s+mise\s+en\s+place|d['’]\s*arriv[ée]e)/i.test(q)) out.push('delai_mise_en_place');
  if (/\b(?:heure|horaire)s?\b/i.test(q) && /ronde d['’]ouverture|ouverture effective|d[ée]part (?:de la ronde|permettant)/i.test(q)) out.push('horaire_ronde_ouverture');
  // Validation du dimensionnement proposé (etampes1 594 : « GSS valide-t-elle le dimensionnement proposé… » à côté de la
  // proposition à valider formulée sans modèle).
  if (/dimensionnement/i.test(q) && /valid/i.test(q)) out.push('validation_dimensionnement');
  // Remplacement d'un chien indisponible (etampes1 1202, T2-CONS-7 : « dispositif de remplacement d'un chien ne pouvant
  // exercer » et « En cas d'indisponibilité du chien… quelle solution de remplacement… »).
  if (/chiens?\b|cynophil|ma[îi]tres?[- ]chiens?/i.test(q) && /rempla|indisponib|absen|ne pouvant/i.test(q)) out.push('remplacement_chien');
  // Échéances d'envoi des plannings (ifsem 1001, T2N-7 : « échéances applicables à l'envoi du planning… J-10, J-7 et J-3 » et
  // « le calendrier proposé — envoi des plannings à J-10… »).
  if (/plannings?/i.test(q) && /J\s?-\s?\d|[ée]ch[ée]ances?|jours? ouvr|calendrier/i.test(q)) out.push('echeances_planning');
  // Couverture horaire du cas pratique (etampes2 553 : « 48 heures annoncées / 39 heures détaillées », « 9 heures non décrites »).
  // (« … la couverture des postes entre 21 h 00 et 22 h 30 », T6-CONS-4 : la même donnée)
  if (/cas pratique|plages?|intitul|non d[ée]crites|entre\s+\d{1,2}\s*h/i.test(q) && /\d+\s*h(?:eures)?(?:\s*\d{2})?\b[^?]{0,160}\d+\s*h(?:eures)?(?:\s*\d{2})?\b/i.test(q) && /couvr|couverture|intitul|non d[ée]crites|clarifi/i.test(q)) out.push('couverture_cas_pratique');
  // Liste nominative des agents et dates de leurs formations (havre2, T5N-14 : cases « SST » / « C.Q.P.A.D.S. » × « NOM / Prénom /
  // Date » du tableau du cadre, « Transmettre … les noms, prénoms et dates de formation SST … », « la liste nominative des agents …
  // et les dates de leurs formations ») : une seule donnée ; l'autorisation CNAPS en est une autre.
  if (/\b(?:noms?|pr[ée]noms?|nominative?s?)\b/i.test(q) && /\b(?:agents?|SST|CQP|C\.?\s?Q\.?\s?P|SSIAP|formations?|dipl[ôo]mes?)\b/i.test(q) && /\b(?:dates?|formations?|SST|CQP|C\.?\s?Q\.?\s?P|SSIAP|dipl[ôo]mes?)\b/i.test(q)) out.push('liste_nominative_agents');
  if (/\bCNAPS\b|carte professionnelle|autorisations? (?:pr[ée]alable|d['’]exercer)/i.test(q) && out.includes('liste_nominative_agents')) out.push('cnaps_agents');
  return out.sort();
}

/**
 * Deux questions à GSS qui demandent la même donnée (cstb 221 : « délai moyen maximum d'intervention sur site après appel
 * de télésurveillance pour une levée de doute » / « … délai moyen maximum d'arrivée sur site du rondier après l'appel de la
 * télésurveillance… ») : mêmes mots porteurs (racines de 6 lettres, synonymes ramenés à une racine, hors mots de
 * question et verbes de demande), 5 au moins. Un seul mot propre à l'une (« forum » / « concert », « 2024 » / « 2025 »,
 * « SSIAP 1 » / « SSIAP 2 », « agents de sécurité » / « agents de sécurité incendie ») : deux demandes distinctes.
 */
export function memeDemande(a: string, b: string): boolean {
  const VIDES = new Set(['quel', 'quelle', 'quels', 'quelles', 'est', 'sont', 'elle', 'gss', 'pour', 'apres', 'avant', 'dans', 'avec', 'sans', 'effect', 'indiqu', 'precis', 'confir', 'pouvez', 'vous', 'votre', 'notre', 'comment', 'repond', 'exigen', 'memoir', 'doit', 'cette', 'faut', 'donnee', 'ainsi', 'leurs', 'leur', 'aupres', 'rondie', 'laquel', 'fourni', 'delai,']);
  const SYNONYMES: Record<string, string> = { arrive: 'interv', arriva: 'interv', interv: 'interv' };
  // (sigles de 2 ou 3 lettres compris : « CQP APS » / « SSIAP 1 »)
  const racines = (t: string) => new Set(String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 4 || /^\d+$/.test(w) || /^[A-Z]{2,3}$/.test(w)).map((w) => w.toLowerCase().slice(0, 6)).map((w) => SYNONYMES[w] || w).filter((w) => !VIDES.has(w)));
  const x = racines(a), y = racines(b);
  const [petit, grand] = x.size <= y.size ? [x, y] : [y, x];
  return petit.size >= 5 && petit.size === grand.size && [...petit].every((w) => grand.has(w));
}

/**
 * Puce d'engagement (contrôle de couverture, obligations chiffrées) qui ne peut pas être remise à l'acheteur : pièce de
 * l'offre, pénalité, phrase sur le mémoire lui-même au lieu d'une réponse (« GSS indiquera… », « GSS précise dans le
 * mémoire technique le nombre de contrôleurs » : ifits 171, critères notés 2-1b et 2-1c sans réponse), fait que
 * faits_gss.md interdit (sous-traitance, intérim, Covid : fontainebleau 21, « GSS forme les agents sous-traitants… » alors
 * que GSS ne sous-traite pas) ou exigence conditionnelle qui ne s'applique pas à GSS (« en cas de recours à… »). L'exigence
 * reste alors traitée par les questions à GSS (écart non couvert). Renvoie le motif du refus, ou '' si la puce est gardée.
 */
export { sansClauseSanction } from './reponse_libre_v2';

export function motifRefusEngagement(x: string): string {
  const t = String(x || '');
  if (PIECES_OFFRE.test(t)) return 'pièce de l\'offre';
  if (/p[ée]nalit|plafonnement/i.test(t)) return 'pénalité';
  // Renvoi à un document de l'offre au lieu de l'engagement (caen 471 : « les délais et conditions de mobilisation des
  // personnels… sont indiqués dans le cadre de réponse technique ») : la puce n'engage à rien ; la question sur le
  // document manquant, s'il y a lieu, est posée par ailleurs (pas de question ici).
  if (/\b(?:indiqu|pr[ée]cis|d[ée]taill|d[ée]crit|mentionn|pr[ée]sent|repris|report|figur)[\wÀ-ÿ]*\s+(?:dans|au|aux|à|en)\s+(?:le |la |l['’]\s*|les |son |sa |ses |notre |nos |leur |leurs )?(?:cadre de r[ée]ponse|r[ée]ponse technique|BPU|DPGF|DQE|annexes?\b|bordereaux?|acte d.engagement|offre\b|m[ée]moire\b|documents? de (?:l.offre|la consultation)|pi[èe]ces? de l.offre)/i.test(t)) return 'renvoi à un document de l\'offre, sans l\'engagement';
  // Plan du mémoire imposé par le RC (imm 473 : « GSS présentera les moyens humains et l'encadrement, la continuité et les
  // situations dégradées, …, ainsi que la formation, la qualité, la démarche RSE et la cohérence du prix ») : la structure
  // de la réponse, pas un engagement d'exécution (un rapport, un bilan, un agent présentés au client restent des engagements).
  if (/\b(?:pr[ée]sentera|d[ée]crira|exposera|expliquera|d[ée]montrera|justifiera|abordera)\b/i.test(t) && (t.match(/,/g) || []).length >= 2
    && !/\b(?:rapports?|bilans?|comptes?[- ]rendus?|tableaux? de bord|plannings?|indicateurs?|synth[èe]ses?|factures?|fiches?|agents?|personnels?|candidats?|dossiers?)\b/i.test(t)) return 'plan du mémoire imposé par le RC, pas un engagement';
  // « GSS s'engage à préciser / indiquer / détailler… » (cstb 221, b4_equipements : « s'engage à préciser les moyens
  // matériels envisagés…, notamment le nombre de véhicules affectés ») : une promesse de donner l'information, pas la réponse.
  if (/\bs.engage(?:ra)? [àa] (?:lui )?(?:pr[ée]ciser|indiquer|d[ée]tailler|communiquer|fournir|transmettre|mentionner|renseigner|pr[ée]senter|d[ée]terminer|d[ée]finir)\b/i.test(t)) return 'phrase sur le mémoire, sans réponse';
  if (/\b(?:indiquera|précisera|détaillera|déterminera|communiquera ultérieurement|fournira|transmettra)\b/i.test(t)) return 'engagement futur sans réponse';
  if (/\b(?:pr[ée]cis|indiqu|d[ée]taill|communiqu|mentionn|pr[ée]sent|renseign)(?:e|er|era|ent)?\b[^.]{0,60}\b(?:le nombre|les effectifs|l.effectif|dans (?:le|son|ce|notre) m[ée]moire|dans (?:l.|son |notre )offre|ult[ée]rieurement)/i.test(t)
    || /\b(?:fourni(?:t|r|ra)?|transmet(?:tre|tra)?)\b[^.]{0,60}\b(?:le nombre|les effectifs|l.effectif|dans (?:le|son|ce|notre) m[ée]moire|dans (?:l.|son |notre )offre|ult[ée]rieurement)/i.test(t)
    || /dans (?:le|son|ce|notre) m[ée]moire technique/i.test(t)) return 'phrase sur le mémoire, sans réponse';
  if (/sous[- ]?trait|int[ée]rim|covid/i.test(t)) return 'fait interdit (faits_gss.md)';
  // Engagement qui porte sur une personne ou un service de l'acheteur (T7-CONS-7 : « GSS s'engage à ce que le responsable du pôle
  // logistique soit l'interlocuteur privilégié des campus ») : l'organisation de l'acheteur, jamais un engagement de GSS.
  if (new RegExp(`^(?:GSS|le titulaire|nous)\\s+(?:s['’]engage(?:ra)?\\s+)?(?:[àa]\\s+)?(?:ce\\s+qu(?:e|['’])|veille(?:ra)?\\s+[àa]\\s+ce\\s+qu(?:e|['’]))\\s*(?:le|la|les|l['’])\\s*[^,;.]{0,80}?${ORGANISATION_ACHETEUR.source}`, 'iu').test(sansPropositionSurLAcheteur(t).replace(/^[-•]\s*/, ''))) return 'organisation de l\'acheteur, pas un engagement de GSS';
  // Clause de prix ou de facturation (T3N-10 : « GSS applique la valorisation des heures de nuit… ») : pas un engagement technique.
  if (CLAUSE_PRIX.test(t)) return 'clause de prix ou de facturation';
  // Délai annoncé sans sa valeur (cstb 551, T5CP-7 : « dans un délai moyen maximum après l'appel de la télésurveillance… »,
  // « le délai d'intervention de levée de doute indiqué pour le marché » alors qu'aucun délai n'est indiqué).
  if (/d[ée]lai (?:moyen )?(?:maximum|maximal|minimum)(?! de\s*\d)\s+(?:apr[èe]s|[àa] compter|suivant|pour|d['’]intervention)|d[ée]lai[^.;]{0,60}\b(?:indiqu[ée]|pr[ée]vu|fix[ée]|demand[ée]|propos[ée])\s+(?:pour|dans|par|au)\s+(?:le|ce|la) (?:march[ée]|CCTP|contrat)/i.test(t) && !/\d/.test(t)) return 'délai sans valeur, sans réponse';
  // Faculté de l'acheteur écrite comme un acte de GSS (« GSS autorise l'intervenant à utiliser le portillon piéton » pour « Celui-ci
  // peut utiliser le portillon piéton ») : rôles inversés, pas un engagement de GSS.
  if (/^(?:GSS|le titulaire|nous)\s+(?:autoris|permet|accord|laisse)\w*\b/i.test(t.replace(/^[-•]\s*/, ''))) return 'faculté de l\'acheteur écrite comme un acte de GSS';
  // Garantie d'assurance absente de l'attestation de GSS (Hiscox : responsabilité civile professionnelle, exploitation et
  // employeur ; faits_gss.md) : « … en cas d'accident, d'incendie ou d'explosion, ainsi qu'en cas de perte de clés ».
  // Seulement une phrase qui parle d'assurance (caen 701 : « assurera la surveillance… protégera le site contre les risques
  // d'intrusion, de vol et de dégâts des eaux » est une mission, pas une garantie d'assurance : « assurera » n'est pas « assuré »).
  if (/\bassurances?\b|\bassureurs?\b|\bassur[ée]e?s?\s+(?:contre|pour|aupr[èe]s)\b|\bpolices? d['’]assurance|responsabilit[ée] civile/i.test(t) && /perte (?:de |des )?cl[ée]s|(?<![\p{L}])vols?(?![\p{L}])|incendie|explosion|d[ée]g[âa]ts? des eaux|bris de|catastrophe/iu.test(t)) return 'garantie d\'assurance absente de l\'attestation de GSS, sans réponse';
  // Montant de garantie ou garantie illimitée qui n'est pas sur l'attestation Hiscox de GSS (ifits 701 : « GSS souscrira une
  // assurance responsabilité civile… dommages corporels sans limitation de montant… 5 000 000 € par sinistre », sous la ligne
  // qui donne 300 000 €) : jamais promis, demandé à GSS.
  if (/\bassurances?\b|\bassureurs?\b|responsabilit[ée] civile|\bgaranties?\b/i.test(t)
    && (/sans limitation de montant|illimit[ée]e?s?/i.test(t) || (t.match(/\d[\d\s\u00a0\u202f.]*\s*(?:€|euros?\b|M€|millions? d.euros)/gi) || []).some((m) => !MONTANTS_ATTESTATION_GSS.has(m.replace(/[^\d]/g, ''))))) return 'garantie d\'assurance absente de l\'attestation de GSS, sans réponse';
  // « … dans le délai contractuel » sans délai chiffré (cstb 221 : « GSS s'engage à remplacer toute absence imprévue dans le
  // délai contractuel », alors que le CCTP ne fixe aucun délai de remplacement) : renvoi à un délai qui n'existe pas.
  if (/d[ée]lais? contractuels?|d[ée]lais? (?:pr[ée]vus?|fix[ée]s?) (?:au|par le) (?:contrat|march[ée]|CCTP|CCAP)/i.test(t) && !/\d/.test(t)) return 'renvoi à un délai que le DCE ne fixe pas';
  if (/\ben cas de recours\b|\bsi (?:GSS|le titulaire) (?:recourt|fait appel)/i.test(t)) return 'exigence conditionnelle qui ne s\'applique pas à GSS';
  // Faculté de l'acheteur, clause administrative ou simple description d'un lieu, écrites comme un engagement de GSS (s2e 1501,
  // T5N-6) : prestations similaires ou nouveaux accords-cadres confiés par l'acheteur (R2122-7), langue et traduction des
  // documents, notifications par le profil d'acheteur, « GSS prendra en compte le Hub Expo …, situé … » ; jamais imprimées.
  if (/prestations? similaires|nouveaux? (?:accords?[- ]cadres?|march[ée]s?)|R\.?\s?2122-7|march[ée]s? subs[ée]quents?\s+(?:qui lui|confi)/i.test(t)) return 'faculté de l\'acheteur, pas un engagement de GSS';
  if (/\b(?:r[ée]dig[ée]e?s?|[ée]crite?s?) en (?:langue )?fran[çc]aise?|traduction (?:en fran[çc]ais|certifi[ée]e)|traducteur asserment[ée]/i.test(t)) return 'clause administrative (langue des documents), pas un engagement de GSS';
  if (/profil d['’]acheteur|plateforme (?:de d[ée]mat[ée]rialisation|des march[ée]s)|faisant courir un d[ée]lai/i.test(t)) return 'clause administrative (notifications), pas un engagement de GSS';
  if (/^(?:GSS|le titulaire|nous)\s+(?:prendra|prend|prendront|tiendra|tient)\s+en (?:compte|consid[ée]ration)\s+(?:le|la|les|l['’])\s*[^,.;]{2,80},\s*(?:situ[ée]e?s?|sis|implant[ée]e?s?|localis[ée]e?s?)(?=[\s,]|$)/i.test(t.replace(/^[-•]\s*/, ''))) return 'description d\'un lieu, sans action de GSS';
  return '';
}

/** Question à GSS tirée d'une puce refusée parce qu'elle parle du mémoire au lieu de répondre (« GSS précise le nombre
 *  de contrôleurs affectés au site » → « Combien de contrôleurs seront affectés au site ? »). */
export function questionDEngagement(x: string): string {
  const entier = String(x || '').replace(/^[-•]\s*/, '').trim().replace(/[.;…]+\s*$/, '');
  const motif = motifRefusEngagement(entier);
  // Une question sur la première phrase de l'engagement, jamais une seconde phrase « GSS conservera… » gardée telle quelle
  // dans la question (T5-COH-1).
  // (proposition après « ; » au futur, « … ; tout équipement défaillant sera remplacé », retirée aussi : jamais un futur dans la question)
  const t = entier.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)[0].replace(/\s*;\s*[^;]*?(?<![\p{L}])(?:sera|seront|[a-zà-ÿ]{3,}(?:era|ira|ront))(?![\p{L}]).*$/iu, '').replace(/[.;…]+\s*$/, '');
  const exigence = t.replace(/^(?:GSS|le titulaire|nous)\s+(?:s['’]engage(?:ra)?\s+[àa]\s+)?/i, '');
  // Délai annoncé sans valeur (T5CP-7) : la valeur exacte est demandée à GSS.
  if (/^délai sans valeur/.test(motif)) return `Quel délai GSS annonce-t-elle pour cette exigence du CCTP : « ${exigence} » ?`;
  // Garantie absente de l'attestation d'assurance de GSS (T5CP-7) : jamais affirmée, demandée à GSS.
  if (/^garantie d'assurance/.test(motif)) return `Votre attestation d'assurance (Hiscox, contrat HA RCP0242762) couvre-t-elle ce que demande le CCTP : « ${exigence} » ? Si oui, quelle garantie et quel montant faut-il indiquer ; sinon, faut-il le signaler à l'acheteur ?`;
  const sansMemoire = (s: string) => s.replace(/\s+(?:dans|pour) (?:le|son|ce|notre) m[ée]moire(?: technique)?/i, '').trim();
  // Nombre seul (« GSS précise le nombre de contrôleurs affectés au site ») → « Combien de contrôleurs seront affectés au site ? ».
  const m = /^[^,]*?\ble nombre (d['’]|de |des )([^,;]+?)\s*$/i.exec(t);
  if (m) {
    const reste = sansMemoire(m[2]).replace(/\baffect[ée]s\b/, 'seront affectés').replace(/\bpr[ée]sents\b/, 'seront présents').trim();
    return `Combien ${m[1].toLowerCase() === 'des ' ? 'de ' : m[1].toLowerCase()}${reste} ? (exigence du CCTP à laquelle le mémoire doit répondre par un nombre)`;
  }
  // Objet annoncé (« s'engage à préciser les moyens matériels envisagés…, notamment le nombre de véhicules… ») : la donnée
  // attendue est demandée telle que le DCE la formule.
  // Verbe d'information juste après le sujet (« GSS (s'engage à) <verbe> »), jamais un participe ou un adjectif au milieu de la
  // phrase (« un compte-rendu détaillé », « un rapport précis », T5N-10, T5-COH-1).
  const o = /^(?:(?:GSS|le titulaire|nous)\s+)?(?:s.engage(?:ra)?\s+[àa]\s+(?:lui\s+)?)?(pr[ée]cis|indiqu|d[ée]taill|communiqu|fourni|transmet|mentionn|pr[ée]sent|renseign|d[ée]termin|d[ée]fini)[a-zé]*\s+(.+)$/i.exec(t);
  const objet = sansMemoire(o ? o[2] : t).replace(/\s+ult[ée]rieurement\b/i, '');
  // Le verbe reste dans la question, à l'infinitif, quel que soit le début de l'objet (cstb 551, T7CS-7 ; ign, T4-COH-5 : « GSS
  // fournira dès la notification les scénarios… » donnait « … exigence du CCTP : dès la notification les scénarios… ? », sans
  // verbe) ; les verbes coordonnés au futur aussi (« et mettra en place » → « et mettre en place », « et se coordonnera » →
  // « et vous coordonner »).
  // (aussi après une virgule ou un pronom complément : « et le transmettra » → « et le transmettre », « , la tiendra à jour » →
  // « , la tenir à jour », T5N-10, T5-COH-1)
  const coordonnes = (s: string) => s.replace(/(\bet\s+|,\s+)(se\s+|s['’])?((?:(?:le|la|les|lui|leur|en|y)\s+|l['’]))?([a-zà-ÿ]{3,}(?:era|ira|tra|dra|ra))\b/gi, (m, lien: string, se: string | undefined, pron: string | undefined, v: string) => {
    const inf = infinitifDuFutur(v);
    return inf ? `${lien}${se ? 'vous ' : ''}${pron || ''}${inf}` : m;
  });
  if (o) {
    const INFINITIFS: Record<string, string> = { precis: 'préciser', 'précis': 'préciser', indiqu: 'indiquer', detaill: 'détailler', 'détaill': 'détailler', communiqu: 'communiquer', fourni: 'fournir', transmet: 'transmettre', mentionn: 'mentionner', present: 'présenter', 'présent': 'présenter', renseign: 'renseigner', determin: 'déterminer', 'détermin': 'déterminer', defini: 'définir', 'défini': 'définir' };
    const verbe = INFINITIFS[o[1].toLowerCase()];
    // Verbe d'action (fournir, transmettre) : toujours gardé ; verbe d'information (préciser, indiquer…) devant un objet nominal :
    // la question porte sur l'objet lui-même (« … exigence du CCTP : les modalités de transmission des rapports ? »).
    // Le verbe est toujours gardé à l'infinitif (T5-COH-1 : « … exigence du CCTP : un planning détaillé à la Ville et
    // l'actualiser … ? » n'avait pas de verbe en tête).
    // Verbe d'information devant l'objet (« GSS précisera les modalités … ») : la donnée est demandée (« Pouvez-vous préciser … ? »).
    if (verbe && /^(?:préciser|indiquer|détailler|mentionner|renseigner|déterminer|définir)$/.test(verbe) && !/^(?:aux?|à|en|par|dans|pour|sur)\s/i.test(objet)) return `Pouvez-vous ${verbe} ${coordonnes(objet)} ?`;
    if (verbe) return `Que prévoyez-vous pour ${verbe} ${coordonnes(objet)} ?`;
  }
  // Phrase dont GSS est le sujet, verbe au futur ou au présent (« GSS organisera… ») : le verbe à l'infinitif.
  const sujet = /^(?:GSS|le titulaire|nous)\s+(?:s['’]engage(?:ra)?\s+[àa]\s+)?(se\s+|s['’])?([a-zà-ÿ]{3,})\s+(.+)$/i.exec(t);
  const inf = sujet ? infinitifDuFutur(sujet[2]) || infinitifDuPresent(sujet[2]) : '';
  if (sujet && inf) return `Que prévoyez-vous pour ${sujet[1] ? 'vous ' : ''}${inf} ${coordonnes(sansMemoire(sujet[3]))} ?`;
  return `Que prévoyez-vous pour répondre à cette exigence du CCTP : ${coordonnes(objet)} ?`;
}

/** Infinitif d'un verbe au futur (3e personne) : « fournira » → « fournir », « mettra » → « mettre », « coordonnera » →
 *  « coordonner » ; '' si la forme n'est pas un futur. */
export function infinitifDuFutur(v: string): string {
  const w = String(v || '').toLowerCase();
  const IRR: Record<string, string> = { sera: 'être', aura: 'avoir', fera: 'faire', ira: 'aller', devra: 'devoir', pourra: 'pouvoir', verra: 'voir', saura: 'savoir', viendra: 'venir', tiendra: 'tenir', prendra: 'prendre', voudra: 'vouloir', faudra: '', recevra: 'recevoir', enverra: 'envoyer', maintiendra: 'maintenir', interviendra: 'intervenir', obtiendra: 'obtenir', mettra: 'mettre', transmettra: 'transmettre', remettra: 'remettre', permettra: 'permettre' };
  if (w in IRR) return IRR[w];
  if (/[a-zà-ÿ]{2,}tra$/.test(w)) return w.replace(/tra$/, 'tre');
  if (/[a-zà-ÿ]{2,}dra$/.test(w)) return w.replace(/dra$/, 'dre');
  if (/[a-zà-ÿ]{2,}[^i]era$/.test(w) || /[a-zà-ÿ]{2,}iera$/.test(w)) return w.replace(/era$/, 'er');
  if (/[a-zà-ÿ]{2,}ira$/.test(w)) return w.replace(/ira$/, 'ir');
  return '';
}

/** Infinitif d'un verbe courant au présent (3e personne) : « transmet » → « transmettre », « organise » → « organiser ». */
function infinitifDuPresent(v: string): string {
  const w = String(v || '').toLowerCase();
  const IRR: Record<string, string> = { met: 'mettre', transmet: 'transmettre', remet: 'remettre', fournit: 'fournir', tient: 'tenir', maintient: 'maintenir', prend: 'prendre', fait: 'faire', assure: 'assurer', organise: 'organiser', réalise: 'réaliser', realise: 'réaliser', effectue: 'effectuer', désigne: 'désigner', informe: 'informer', établit: 'établir', etablit: 'établir', garantit: 'garantir', veille: 'veiller', applique: 'appliquer', affecte: 'affecter', mobilise: 'mobiliser', respecte: 'respecter', procède: 'procéder', intervient: 'intervenir', dispose: 'disposer', utilise: 'utiliser', remplace: 'remplacer', contrôle: 'contrôler', forme: 'former', prévoit: 'prévoir', participe: 'participer' };
  return IRR[w] || '';
}
/**
 * Questions du contrôle de couverture dont l'exigence est déjà traitée (T7CS-7, cstb 551 : « GSS fournira aux agents des tenues
 * propres permettant d'identifier le nom de la société titulaire », source de la phrase adaptée « un insigne reproduisant le nom
 * de la société titulaire ») : par une phrase de GSS adaptée au CCTP (D8, mêmes mots que son exigence à 70 %), ou par le texte
 * remis (exigenceTraitee). Elles sont retirées de `questions`.
 */
export function retirerQuestionsCouvertes(questions: Set<string>, sources: Map<string, string>, exigencesAdaptees: string[], texte: string): number {
  const racines = (x: string) => [...new Set(normaliser(String(x || '')).replace(/^(?:gss|le titulaire|nous)\s+/, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)))];
  const adaptees = exigencesAdaptees.flatMap((e) => String(e || '').split(/\s*;\s*/)).map((e) => new Set(racines(e)));
  let n = 0;
  for (const [q, puce] of sources) {
    if (!questions.has(q)) continue;
    const r = racines(puce);
    const parAdaptation = r.length >= 3 && adaptees.some((a) => r.filter((w) => a.has(w)).length / r.length >= 0.7);
    if (parAdaptation || exigenceTraitee(puce, texte)) { questions.delete(q); n++; }
  }
  return n;
}

/** Rubriques et chapitres de la réponse libre (lecture seule, pour l'assistant de modification). */
export { AI_SECTIONS_B as SECTIONS_REPONSE_LIBRE, CHAPTER_TITLES_B as CHAPITRES_REPONSE_LIBRE };

// ─── Mapping Documentation GSS → sections du mémoire ───
// Associe chaque catégorie de la Documentation GSS (21 dossiers PDF) aux mots-clés
// des spreads d'AO RNE.docx pour sélectionner automatiquement les sources pertinentes.
const GSS_DOC_KEYWORDS: Record<string, string[]> = {
  'ABSENCE ET RETARD': ['absence', 'retard', 'remplacement', 'palliatif', 'indisponibilite'],
  'EFFECTIFS ET ORGANIGRAMME': ['effectif', 'organigramme', 'encadrement', 'equipe', 'structure', 'moyens humains'],
  'ENGAGEMENT ECOLOGIQUE': ['ecologique', 'rse', 'environnement', 'durable', 'responsabilite'],
  'FORMATION': ['formation', 'competence', 'qualification', 'cqp', 'ssiap', 'mac'],
  'FORMATION INTERNE': ['formation interne', 'parcours', 'montee en competence', 'habilitation'],
  'INTERLOCUTEUR UNIQUE': ['interlocuteur', 'contact unique', 'referent', 'proximite'],
  'LMC': ['main courante electronique', 'lmc', 'logiciel'],
  'MAIN COURANTE': ['main courante', 'rapport', 'evenement', 'ronde', 'pointeau'],
  'MANAGEMENT': ['management', 'direction', 'presentation', 'societe', 'pilotage', 'qui sommes'],
  'MATERIEL': ['materiel', 'equipement', 'moyen technique', 'outil', 'vehicule', 'radio', 'pti', 'dati', 'communication'],
  'MISE EN PLACE': ['mise en place', 'demarrage', 'lancement', 'deploiement', 'phase preparatoire'],
  "MOYENS D'ACCES": ['acces', 'cle', 'badge', 'controle acces', 'securisation', 'flux'],
  'NOUVEAU MARCHE': ['nouveau marche', 'reprise', 'transition', 'personnel en place', 'l1224', 'prise de poste'],
  'NOUVEL AGENT': ['integration', 'nouvel agent', 'accueil'],
  'PARTENAIRES': ['partenaire', 'sous-traitant', 'prestataire'],
  'PLANNIFICATION': ['planning', 'planification', 'vacation', 'horaire', 'continuite', 'service'],
  'PROCEDURE': ['procedure', 'incident', 'alarme', 'intrusion', 'incendie', 'intervention', 'suspect', 'victime', 'perturbateur', 'consigne'],
  'RECRUTEMENT': ['recrutement', 'embauche', 'selection', 'candidat', 'profil'],
  'SUIVI QUALITE ET CONTROLES': ['qualite', 'controle', 'inopine', 'audit', 'suivi', 'reporting', 'indicateur', 'amelioration'],
  'TENUES': ['tenue', 'vestiaire', 'uniforme', 'epi', 'equipement de protection', 'habillement'],
  'VALEURS': ['valeur', 'engagement', 'ethique', 'mission', 'vision'],
};

// ─── Solutions GSS spécifiques par section × type de marché (public / privé) ───
// Pour chaque thématique du mémoire, liste les arguments stratégiques GSS différenciants
// selon que le client est un acheteur public (Code de la commande publique) ou privé.
// `common` = applicable quel que soit le cadre. Utilisé pour enrichir les prompts IA.

interface GssSolutionSet { public: string[]; prive: string[]; common: string[]; }
const GSS_SOLUTIONS_BY_CONTEXT: Record<string, GssSolutionSet> = {
  // ── I — Présentation de notre structure ──
  'presentation': {
    public: [
      `Conformité au Code de la commande publique (art. L2141-1 et suivants) et transparence des procédures`,
      `Référencement sur plateformes de dématérialisation (PLACE, AWS, profils acheteurs)`,
      `Expérience avérée auprès de collectivités territoriales, EPCI, universités et établissements publics`,
      `Capacité à produire les attestations fiscales et sociales exigées (DC1/DC2, NOTI1/NOTI2)`,
    ],
    prive: [
      `Souplesse contractuelle et adaptation rapide aux besoins évolutifs du client`,
      `Interlocuteur unique dédié avec engagement de réactivité < 1h`,
      `SLA personnalisés avec indicateurs de performance et bonus/malus`,
      `Confidentialité renforcée (NDA, habilitations spécifiques au secteur)`,
    ],
    common: [
      `Agréments CNAPS et autorisations préfectorales à jour sur toute la zone géographique`,
      `Assurance responsabilité civile professionnelle couvrant l'intégralité du périmètre`,
      `Certifications qualité (ISO 9001, Qualiopi pour la formation)`,
    ],
  },
  'implantation': {
    public: [
      `Maillage territorial permettant une couverture multi-sites (agences de proximité en région)`,
      `Connaissance des spécificités des ERP (Établissements Recevant du Public) et des campus`,
    ],
    prive: [
      `Implantation locale garantissant un temps d'intervention réduit (< 30 min)`,
      `Bureau opérationnel dédié sur site pour les contrats importants`,
    ],
    common: [
      `Réseau national d'agences GSS avec encadrement régional`,
      `Centre opérationnel 24/7 pour coordination et pilotage à distance`,
    ],
  },
  'agrements': {
    public: [
      `Production systématique de l'extrait K-bis, attestations URSSAF/impôts, casiers judiciaires des dirigeants`,
      `Renouvellement proactif des agréments CNAPS avant échéance (anticipation de 6 mois)`,
      `Conformité aux critères d'exclusion de la commande publique (art. L2141-1 à L2141-11)`,
    ],
    prive: [
      `Audit de conformité réglementaire inclus dans la prestation (veille CNAPS)`,
      `Garantie contractuelle de mise à jour permanente des autorisations`,
    ],
    common: [
      `Autorisation d'exercice CNAPS pour chaque agence du périmètre`,
      `Agréments dirigeants et cartes professionnelles de tous les agents vérifiées`,
    ],
  },
  'engagement_rse': {
    public: [
      `Réponse aux critères environnementaux et sociaux des marchés publics (art. L2112-2 du CCP)`,
      `Clause d'insertion professionnelle et engagement en faveur de l'emploi local`,
      `Bilan carbone annuel et plan de réduction des émissions`,
    ],
    prive: [
      `Labellisation RSE et reporting extra-financier adapté au secteur du client`,
      `Politique de mobilité durable (véhicules électriques/hybrides pour les rondes)`,
    ],
    common: [
      `Flotte de véhicules à faibles émissions pour les interventions`,
      `Dématérialisation complète (main courante électronique, reporting en ligne)`,
      `Politique zéro papier et tri sélectif sur les postes`,
    ],
  },
  // ── II — Les moyens humains ──
  'moyens_humains': {
    public: [
      `Transparence sur les qualifications : CV anonymisés et fiches de poste conformes au CCTP`,
      `Respect des grilles salariales conventionnelles et engagement anti-dumping social`,
      `Taux d'encadrement supérieur aux minimums réglementaires (1 chef d'équipe / 15 agents)`,
    ],
    prive: [
      `Sélection sur mesure des profils en fonction du secteur d'activité du client`,
      `Possibilité de validation préalable des agents par le client (entretien conjoint)`,
      `Programme de fidélisation (prime de site, avantages, parcours de carrière)`,
    ],
    common: [
      `Agents titulaires CQP APS, SSIAP 1/2/3, SST selon les postes`,
      `Vérification systématique carte CNAPS + casier judiciaire à l'embauche`,
      `Formation continue obligatoire (MAC APS, recyclage SSIAP, exercices incendie)`,
    ],
  },
  'encadrement': {
    public: [
      `Organigramme opérationnel dédié au marché, transmis à l'acheteur avec CVs`,
      `Réunions de suivi périodiques (trimestrielles) avec compte-rendu formalisé`,
      `Chef de site SSIAP 2/3 coordinateur sûreté-sécurité selon exigences du CCTP`,
    ],
    prive: [
      `Directeur de compte unique avec disponibilité 7j/7`,
      `Reporting personnalisé selon les KPIs définis conjointement`,
      `Comité de pilotage mensuel avec tableaux de bord opérationnels`,
    ],
    common: [
      `Management de proximité : responsable d'exploitation basé en région`,
      `Chaîne d'astreinte 24/7 (agent → chef d'équipe → responsable exploitation → direction)`,
    ],
  },
  'reprise_personnel': {
    public: [
      `Application stricte de l'article L1224-1 du Code du travail (obligation légale de reprise)`,
      `Transparence totale : entretiens individuels, maintien des droits acquis, information du CSE`,
      `Délai de transition structuré (J-45 à J+15) avec plan de reprise détaillé`,
    ],
    prive: [
      `Reprise volontaire du personnel en place pour garantir la continuité de service`,
      `Audit social préalable (ancienneté, qualifications, souhaits de mobilité)`,
      `Programme d'intégration accéléré aux process et à la culture GSS`,
    ],
    common: [
      `Maintien des conditions salariales et avantages acquis du personnel repris`,
      `Plan de formation passerelle pour mise à niveau aux standards GSS`,
      `Accompagnement RH personnalisé pendant la période de transition (3 mois)`,
    ],
  },
  'recrutement_formation': {
    public: [
      `Plan de formation annuel transmis à l'acheteur (obligation du CCTP)`,
      `Habilitations spécifiques aux sites publics (ERP, ICPE, ZRR, zones sensibles)`,
      `Partenariats avec les CFA et organismes de formation certifiés Qualiopi`,
    ],
    prive: [
      `Formation aux risques spécifiques du secteur client (industriel, logistique, tertiaire)`,
      `E-learning GSS Academy : modules accessibles 24/7 pour montée en compétences continue`,
    ],
    common: [
      `Processus de recrutement rigoureux en 5 étapes (sourcing, entretien, vérifications, formation, intégration)`,
      `Formation initiale renforcée (consignes de poste, procédures GSS, culture client)`,
      `Recyclages MAC APS / SSIAP dans les délais réglementaires`,
    ],
  },
  'dispositif_absence': {
    public: [
      `Engagement contractuel de remplacement en < 2h (pénalité applicable en cas de manquement)`,
      `Volant de réserve régional dimensionné selon les effectifs du marché (ratio 1 réserviste / 8 titulaires)`,
    ],
    prive: [
      `Remplacement garanti en < 1h grâce au vivier de proximité`,
      `Application mobile d'alerte pour mobilisation instantanée des agents disponibles`,
    ],
    common: [
      `Planning prévisionnel avec gestion anticipée des congés, formations et absences prévisibles`,
      `Agents remplaçants formés et habilités sur les consignes spécifiques du site`,
      `Système de binômage : chaque titulaire a un remplaçant attitré connaissant le site`,
    ],
  },
  'tenues_epi': {
    public: [
      `Tenues conformes au CCTP (logo, couleur, identification visible selon arrêté préfectoral)`,
      `Dotation individuelle complète fournie à la prise de poste (pas de partage d'EPI)`,
    ],
    prive: [
      `Personnalisation des tenues aux couleurs et au logo du client (co-branding)`,
      `Adaptation des EPI aux risques spécifiques du site (ATEX, froid, chaleur, chimique)`,
    ],
    common: [
      `Tenue professionnelle complète : veste, pantalon, polo, chaussures de sécurité, badge nominatif`,
      `EPI selon poste : gilet haute visibilité, lampe torche, PTI/DATI, radio`,
      `Renouvellement annuel et suivi de l'état des équipements`,
    ],
  },
  // ── III — Les moyens opérationnels ──
  'moyens_materiels': {
    public: [
      `Inventaire détaillé des équipements affectés au marché (annexe au mémoire)`,
      `Véhicules sérigraphiés conformes aux exigences du CCTP (éco-conduite, géolocalisation)`,
    ],
    prive: [
      `Dotation matérielle évolutive selon les besoins du client (scalabilité)`,
      `Intégration aux systèmes existants du client (vidéosurveillance, contrôle d'accès, GTC)`,
    ],
    common: [
      `Système de contrôle de rondes NFC/QR code avec horodatage et géolocalisation`,
      `PTI/DATI pour protection du travailleur isolé sur chaque agent`,
      `Radios numériques pour communication inter-agents et avec le PC sécurité`,
      `Véhicules d'intervention équipés (gyrophare, premier secours, extincteur)`,
    ],
  },
  'rondes': {
    public: [
      `Points de contrôle (pointeaux NFC) positionnés selon le plan de prévention du CCTP`,
      `Rapports de rondes horodatés consultables par l'acheteur via l'extranet GSS`,
    ],
    prive: [
      `Parcours de rondes personnalisés et modifiables en temps réel via l'application GSS`,
      `Rondes aléatoires programmables pour effet dissuasif renforcé`,
    ],
    common: [
      `Main courante électronique (TrackForce/LMC) : saisie terrain, photos, alertes en temps réel`,
      `Reporting automatique : synthèse quotidienne, hebdomadaire et mensuelle`,
      `Traçabilité complète : chaque ronde, chaque événement est horodaté et géolocalisé`,
    ],
  },
  'controle_acces': {
    public: [
      `Gestion des accès conforme aux exigences ZRR/zone sensible (contrôle visuel + badge)`,
      `Registre des entrées/sorties dématérialisé et consultable par l'administration`,
    ],
    prive: [
      `Interfaçage avec les systèmes de contrôle d'accès existants (NEDAP, TIL, Honeywell)`,
      `Gestion des visiteurs avec pré-enregistrement et QR code d'accès temporaire`,
    ],
    common: [
      `Procédure d'accueil et de filtrage : vérification d'identité, orientation, enregistrement`,
      `Gestion sécurisée des clés et badges (armoire à clés sécurisée, traçabilité)`,
      `Contrôle des livraisons et des prestataires extérieurs`,
    ],
  },
  'telesurveillance': {
    public: [
      `Station de télésurveillance certifiée APSAD P3/P5 (exigence fréquente des marchés publics)`,
      `Délais d'intervention contractuels conformes au CCTP (engagements chiffrés par site)`,
      `Intervenants véhiculés basés à moins de 20 km de chaque site (obligation APSAD)`,
    ],
    prive: [
      `Offre modulable : télésurveillance seule, levée de doute, ou intervention complète`,
      `Vidéosurveillance intelligente avec analyse comportementale (option)`,
    ],
    common: [
      `Centre de télésurveillance opéré 24/7 par des opérateurs qualifiés`,
      `Levée de doute vidéo et/ou physique selon protocole convenu`,
      `Report des alarmes intrusion, technique et incendie avec gestion des priorités`,
    ],
  },
  'gestion_alarmes': {
    public: [
      `Procédures d'intervention formalisées et validées par l'acheteur (annexe au marché)`,
      `Rapport d'intervention transmis sous 24h avec analyse causes/conséquences`,
    ],
    prive: [
      `Procédures d'escalade personnalisées selon la criticité (niveaux 1/2/3)`,
      `Intégration des protocoles d'alerte du client (astreinte direction, cellule de crise)`,
    ],
    common: [
      `Gestion des alarmes selon procédure graduée : vérification → alerte → intervention → rapport`,
      `Coordination avec les forces de l'ordre et services de secours`,
      `Retour d'expérience systématique après chaque incident significatif`,
    ],
  },
  // ── IV — Les moyens organisationnels ──
  'organisation': {
    public: [
      `Phase de transition structurée : visite des sites, rencontre du personnel, validation des consignes`,
      `Plan de démarrage formalisé (J-30 à J+30) présenté à l'acheteur avant la prise d'effet`,
      `Période de tuilage avec le prestataire sortant (si applicable)`,
    ],
    prive: [
      `Audit sécurité gratuit préalable au démarrage (diagnostic des vulnérabilités)`,
      `Mise en place progressive (montée en charge) pour les sites complexes`,
    ],
    common: [
      `Réunion de lancement avec l'ensemble des parties prenantes`,
      `Livret d'accueil et consignes de poste spécifiques au site`,
      `Test opérationnel avant démarrage effectif (simulation d'incident)`,
    ],
  },
  'planning': {
    public: [
      `Plannings mensuels transmis à l'acheteur pour validation avant exécution`,
      `Respect strict des amplitudes horaires et repos réglementaires (Convention collective)`,
      `Gestion des prestations supplémentaires sur devis préalable (bon de commande)`,
    ],
    prive: [
      `Plannings flexibles ajustables en temps réel via l'application GSS`,
      `Adaptation aux pics d'activité et événements exceptionnels du client`,
    ],
    common: [
      `Logiciel de planification Comète/SILAE : optimisation des roulements et continuité`,
      `Couverture 24/7 garantie avec chevauchements de vacation pour le passage de consignes`,
      `Anticipation des congés et formations : planning prévisionnel à 3 mois`,
    ],
  },
  'suivi_qualite': {
    public: [
      `Contrôles inopinés mensuels avec rapport transmis à l'acheteur`,
      `Réunions de suivi trimestrielles avec indicateurs de performance (taux de couverture, incidents, remplacements)`,
      `Extranet client : accès temps réel aux mains courantes, plannings et rapports`,
    ],
    prive: [
      `Dashboard personnalisé avec KPIs définis conjointement (SLA, satisfaction, incidents)`,
      `Enquête de satisfaction semestrielle auprès des utilisateurs du site`,
    ],
    common: [
      `Plan d'assurance qualité (PAQ) formalisé et mis à jour annuellement`,
      `Audit interne semestriel par la direction qualité GSS`,
      `Traçabilité complète de toutes les actions (rondes, incidents, remplacements)`,
    ],
  },
  'procedures': {
    public: [
      `Consignes de poste validées conjointement et mises à jour annuellement`,
      `Procédures d'urgence conformes au plan de sécurité de l'établissement (PPMS, POI)`,
      `Exercices d'évacuation et de mise en sûreté selon calendrier de l'acheteur`,
    ],
    prive: [
      `Procédures adaptées aux risques spécifiques du secteur (vol, intrusion, incendie, social)`,
      `Plan de continuité d'activité (PCA) intégré à celui du client`,
    ],
    common: [
      `Procédures opérationnelles : accueil, filtrage, ronde, incident, alarme, évacuation`,
      `Fiche réflexe par type d'événement (intrusion, incendie, accident, personne suspecte)`,
      `Mise à jour continue des procédures selon retours d'expérience`,
    ],
  },
  'amelioration': {
    public: [
      `Bilan annuel de prestation avec analyse des écarts et plan d'amélioration`,
      `Propositions d'optimisation formalisées à chaque reconduction du marché`,
    ],
    prive: [
      `Revue de performance trimestrielle avec propositions d'optimisation`,
      `Benchmark sectoriel et veille technologique au service du client`,
    ],
    common: [
      `Démarche d'amélioration continue (PDCA) intégrée au management GSS`,
      `Analyse des incidents avec actions correctives et préventives tracées`,
      `Veille réglementaire permanente (évolutions CNAPS, normes APSAD, droit du travail)`,
    ],
  },
};

// ─── Helpers stratégiques (type de marché, secteur, contexte réglementaire) ───

/** Détecte si le marché est public ou privé d'après les données d'analyse du DCE. */
function detectMarketType(analysisData: any): 'public' | 'prive' {
  if (!analysisData) return 'public'; // défaut conservateur (plus exigeant)
  const haystack = JSON.stringify(analysisData).toLowerCase();
  const publicIndicators = [
    'marche public', 'marché public', 'commande publique', 'code de la commande',
    'ccag', 'pouvoir adjudicateur', 'collectivite', 'collectivité',
    'universite', 'université', 'etablissement public', 'établissement public',
    'commune ', 'mairie', 'departement', 'département', 'region ', 'région ',
    'ministere', 'ministère', 'etat', 'état', 'hopital', 'hôpital', 'chu ',
    'prefecture', 'préfecture', 'tribunal', 'conseil general', 'conseil général',
    'conseil regional', 'conseil régional', 'communaute', 'communauté',
    'syndicat mixte', 'office public', 'opac', 'oph', 'epci', 'sivom', 'sivu',
    'dc1', 'dc2', 'noti1', 'noti2', 'dume', 'ae ', 'acte engagement',
    'reglement de consultation', 'règlement de consultation',
    'critere d\'attribution', 'critère d\'attribution',
    'offre economiquement', 'offre économiquement',
    'bulletin officiel des annonces', 'boamp', 'joue', 'ted ',
    'procedure ouverte', 'procédure ouverte', 'procedure restreinte', 'procédure restreinte',
    'accord-cadre', 'accord cadre', 'marche a procedure', 'marché à procédure',
  ];
  const privateIndicators = [
    'appel d\'offres prive', 'appel d\'offres privé', 'consultation privee', 'consultation privée',
    'societe ', 'société ', 'entreprise privee', 'entreprise privée',
    'groupe ', 'holding', 'filiale', 'sas ', 'sarl ', 'sa ', 'sasu ',
    'contrat de prestations', 'cahier des charges', 'rfp', 'rfi',
  ];

  let publicScore = 0, privateScore = 0;
  for (const p of publicIndicators) if (haystack.includes(p)) publicScore++;
  for (const p of privateIndicators) if (haystack.includes(p)) privateScore++;

  return publicScore >= privateScore ? 'public' : 'prive';
}

/** Détecte le secteur d'activité du client d'après les données d'analyse. */
function detectClientSector(analysisData: any): string {
  if (!analysisData) return 'tertiaire';
  const haystack = JSON.stringify(analysisData).toLowerCase();
  const sectors: Array<{ name: string; keywords: string[] }> = [
    { name: 'éducation / enseignement supérieur', keywords: ['universite', 'université', 'campus', 'faculte', 'faculté', 'ecole', 'école', 'lycee', 'lycée', 'college', 'collège', 'crous', 'rectorat', 'enseignement'] },
    { name: 'santé / hospitalier', keywords: ['hopital', 'hôpital', 'chu', 'clinique', 'ehpad', 'centre hospitalier', 'ars ', 'sante', 'santé', 'medico', 'médico'] },
    { name: 'industrie / logistique', keywords: ['usine', 'entrepot', 'entrepôt', 'plateforme logistique', 'zone industrielle', 'icpe', 'seveso', 'atex', 'industri'] },
    { name: 'distribution / commerce', keywords: ['centre commercial', 'magasin', 'hypermarche', 'hypermarchée', 'supermarche', 'galerie marchande', 'retail', 'enseigne'] },
    { name: 'événementiel / culture', keywords: ['parc des expositions', 'salle de spectacle', 'musee', 'musée', 'theatre', 'théâtre', 'stade', 'arena', 'festival', 'salon', 'congres', 'congrès', 'foire'] },
    { name: 'transport / infrastructure', keywords: ['gare', 'aeroport', 'aéroport', 'port ', 'tramway', 'metro', 'métro', 'autoroute', 'parking', 'transport'] },
    { name: 'tertiaire / bureaux', keywords: ['siege social', 'siège social', 'immeuble de bureaux', 'tour ', 'campus entreprise', 'coworking', 'tertiaire'] },
    { name: 'collectivité territoriale', keywords: ['mairie', 'hotel de ville', 'hôtel de ville', 'conseil departemental', 'conseil départemental', 'conseil regional', 'conseil régional', 'commune ', 'communaute de communes', 'communauté de communes'] },
    { name: 'résidentiel / habitat social', keywords: ['hlm', 'office public', 'bailleur', 'residence', 'résidence', 'copropriete', 'copropriété', 'habitat social'] },
  ];
  let best = 'tertiaire';
  let bestScore = 0;
  for (const s of sectors) {
    const score = s.keywords.filter(kw => haystack.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = s.name; }
  }
  return best;
}

/** Construit le cadre réglementaire applicable d'après le type de marché et le secteur. */
function buildRegulatoryFramework(marketType: 'public' | 'prive', sector: string, analysisData: any): string {
  const parts: string[] = [];
  // Obligations communes
  parts.push('Livre VI du Code de la sécurité intérieure (activités privées de sécurité)');
  parts.push('Autorisation CNAPS obligatoire (entreprise + dirigeants + agents)');

  if (marketType === 'public') {
    parts.push('Code de la commande publique (ordonnance n°2018-1074 et décret n°2018-1075)');
    parts.push('CCAG-FCS (Cahier des clauses administratives générales — Fournitures courantes et services)');
    parts.push('Obligation de publicité et mise en concurrence');
  } else {
    parts.push('Droit commercial et Code civil (obligations contractuelles)');
    parts.push('Convention collective nationale des entreprises de prévention et de sécurité');
  }

  // Obligations sectorielles
  const haystack = JSON.stringify(analysisData || {}).toLowerCase();
  if (haystack.includes('ssiap') || haystack.includes('incendie')) parts.push('Arrêté du 2 mai 2005 (SSIAP) — qualification incendie');
  if (haystack.includes('apsad') || haystack.includes('telesurveillance') || haystack.includes('télésurveillance')) parts.push('Certification APSAD R31 (télésurveillance)');
  if (haystack.includes('zrr') || haystack.includes('zone a regime restrictif') || haystack.includes('zone à régime restrictif')) parts.push('Habilitation ZRR (Zones à Régime Restrictif)');
  if (haystack.includes('icpe') || haystack.includes('seveso')) parts.push('Réglementation ICPE / Seveso (sites industriels classés)');
  if (haystack.includes('erp') || haystack.includes('etablissement recevant du public') || haystack.includes('établissement recevant du public')) parts.push('Réglementation ERP (sécurité incendie, accessibilité)');
  if (haystack.includes('l1224') || haystack.includes('reprise')) parts.push('Article L1224-1 du Code du travail (reprise du personnel)');

  return parts.join(' ; ');
}

/**
 * Construit le bloc de contexte stratégique à injecter dans les prompts IA pour une section donnée.
 * Sélectionne les solutions GSS pertinentes au type de marché (public/privé) et au thème de la section.
 */
function buildStrategicContext(sectionId: string, analysisData: any): string {
  const marketType = detectMarketType(analysisData);
  const sector = detectClientSector(analysisData);
  const regulatory = buildRegulatoryFramework(marketType, sector, analysisData);

  // Trouver la clé de solution la plus proche du sectionId
  const sectionKey = sectionId.replace(/^b_/, '').replace(/^(i+|iv)_/, '');
  const solutions = GSS_SOLUTIONS_BY_CONTEXT[sectionKey];

  let solutionsBlock = '';
  if (solutions) {
    const relevant = [
      ...solutions.common,
      ...(marketType === 'public' ? solutions.public : solutions.prive),
    ];
    solutionsBlock = relevant.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  const parts: string[] = [];
  parts.push(`TYPE DE MARCHÉ : ${marketType === 'public' ? 'Marché public (Code de la commande publique)' : 'Marché privé (contrat de prestations de services)'}`);
  parts.push(`SECTEUR CLIENT : ${sector}`);
  parts.push(`CADRE RÉGLEMENTAIRE : ${regulatory}`);
  if (solutionsBlock) {
    parts.push(`SOLUTIONS GSS DIFFÉRENCIANTES POUR CETTE SECTION :\n${solutionsBlock}`);
  }
  // Problématiques anticipées du DCE
  const issues = analysisData?.anticipatedIssues || [];
  if (issues.length > 0) {
    parts.push(`PROBLÉMATIQUES ANTICIPÉES (non formulées par l'acheteur) :\n${issues.map((i: string, idx: number) => `${idx + 1}. ${i}`).join('\n')}`);
  }
  // Arguments différenciants
  const strengths = analysisData?.proposalStrengths || [];
  if (strengths.length > 0) {
    parts.push(`ARGUMENTS DIFFÉRENCIANTS GSS :\n${strengths.map((s: string, idx: number) => `${idx + 1}. ${s}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

// ─── Stratégie sur-mesure : déclinaison page par page ───

/**
 * « Beats » stratégiques de la synthèse sur-mesure (pages « Contexte sur mesure »), dans l'ordre de
 * lecture. Chaque page reçoit un angle DISTINCT pour raconter une histoire cohérente plutôt que des
 * paragraphes interchangeables. Sont distribués sur le nombre réel de zones via `assignBeats`.
 */
const STRATEGY_BEATS: string[] = [
  "Compréhension du client et de son contexte : type d'organisation, usagers/parties prenantes, sites, rythme d'exploitation, et enjeux de sûreté PROPRES à ce profil. Termine en nommant les RISQUES concrets à couvrir dans ce type de lieu (ce qui amène les mesures décrites ensuite).",
  "Les MESURES CONCRÈTES que GSS met en place dans ce type de lieu : décris précisément le dispositif terrain (postes et rondes, filtrage et contrôle d'accès, gestion des flux/usagers, vidéosurveillance et levée de doute, ouverture/fermeture, gestion des incidents et alarmes…) et, pour chaque mesure, l'enjeu client précis auquel elle répond.",
  "Les moyens au service de ces mesures : agents qualifiés (CQP APS, SSIAP… selon le site), encadrement de proximité et interlocuteur unique, matériel et technologies déployés sur les sites — en montrant en quoi chaque moyen sert concrètement CE client.",
  "Pilotage, démarche qualité, réactivité et gestion des imprévus, continuité de service — avec les engagements concrets pris envers ce client (sans conclusion générique).",
];

/** Assigne un beat à chacune des `n` zones (réutilise/condense la liste si n ≠ STRATEGY_BEATS.length). */
function assignBeats(n: number): string[] {
  if (n <= 0) return [];
  if (n === STRATEGY_BEATS.length) return [...STRATEGY_BEATS];
  // Mappage proportionnel : la zone i prend le beat le plus proche dans la liste de référence.
  return Array.from({ length: n }, (_, i) =>
    STRATEGY_BEATS[Math.min(STRATEGY_BEATS.length - 1, Math.floor((i * STRATEGY_BEATS.length) / n))]);
}

/** Détermine si un spread doit être personnalisé (on garde intactes les pages partenaires/références). */
function shouldPersonalizeSpread(title: string): boolean {
  const n = normTitle(title);
  const skipPatterns = ['confiance', 'partenaire', 'reference client', 'nos clients', 'sommaire', 'table des matieres'];
  return n.length > 0 && !skipPatterns.some(p => n.includes(p));
}

// ─── Field Type Inference ───

function inferFieldHint(context: string): string {
  const n = context.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  if (/case (a|à) cocher|checkbox/.test(n)) return '[CASE A COCHER]';

  const shortPatterns = [
    'denomination', 'raison sociale', 'nom du candidat', 'nom de l\'entreprise',
    'siret', 'siren', 'cnaps', 'n° ', 'numero', 'reference', 'lot ',
    'adresse', 'code postal', 'ville', 'departement', 'siege', 'agence',
    'telephone', 'tel.', 'fax', 'email', 'mail', 'site web',
    'dirigeant', 'contact', 'interlocuteur', 'responsable', 'signataire',
    'statut', 'pme', 'forme juridique', 'capital social',
    'effectif', 'etp', 'nb agent', "nombre d'agent", 'nombre agents',
    'date ', 'annee', 'duree', 'delai',
    'montant', "chiffre d'affaire", 'ca ', 'code naf', 'code ape',
    'agrement', 'autorisation', 'station', 'siege social',
    // Cellules de tableau numériques (délais d'intervention par site, nb d'intervenants)
    'minute', 'intervenant', 'nombre d\'intervenant', 'taux de reprise', 'numero de certification',
  ];
  if (shortPatterns.some(p => n.includes(p))) return '[VALEUR COURTE]';

  const listPatterns = [
    'certification', 'diplome', 'qualification', 'habilitation',
    'materiel', 'equipement', 'tenue', 'vestiaire',
    'partenaire', 'reference client', 'sous-traitant',
    'logiciel', 'outil', 'systeme', 'moyen technique',
  ];
  if (listPatterns.some(p => n.includes(p))) return '[LISTE]';

  const paraPatterns = [
    'methodologie', 'methode', 'organisation', 'procedure',
    'description', 'presentation', 'demarche', 'engagement',
    'politique', 'gestion', 'management', 'encadrement',
    'suivi', 'controle qualite', 'surveillance', 'securite',
    'recrutement', 'integration', 'planning', 'remplacement',
    'absence', 'retard', 'amelioration', 'bilan', 'rapport',
    'intervention', 'alarme', 'incident', 'intrusion',
    'ecologique', 'environnement', 'developpement durable',
    'valeur', 'ethique', 'rse', 'formation continue',
  ];
  if (paraPatterns.some(p => n.includes(p))) return '[PARAGRAPHE]';

  return '[VALEUR COURTE]';
}

// ─── Identité légale du CANDIDAT (GSS) ───
// AUCUNE valeur légale n'est codée en dur : le N° CNAPS et la date d'autorisation ne sont remplis
// QUE s'ils sont fournis (et donc VÉRIFIÉS) via variables d'environnement. Sinon → vide → le champ
// part en « [À COMPLÉTER] » plutôt que de poser un numéro non sourcé (exigence « 0 inventé »).
// Historique : un n° CNAPS placeholder (« AUT-076-2122-12-15-20230456789 ») figurait en dur dans
// frontend/lib/gss-config.ts (commit cda45a2) sans aucune source documentaire → retiré.
// La dénomination (raison commerciale, non sensible) reste par défaut, surchargeable par env.
// SIRET / SIREN / adresse du siège : variables d'environnement, sinon valeur des mémoires GSS (registre).
/**
 * Le DCE cite un cadre de réponse imposé (« cadre de réponse technique », « cadre du mémoire ») mais aucun
 * n'est dans les pièces : la réponse libre risque d'être jugée irrégulière. GSS est prévenu.
 */
/** Libellé d'un délai normand retiré (hors Normandie, ou lieu du site introuvable : T7-COH-2). */
export function libelleDelaiRetire(analyse: any, dce: string): string {
  return lieuDuMarche(analyse || {}, dce || '').statut === 'inconnu' ? 'Délai retiré faute de lieu du site dans le DCE, à confirmer par GSS : ' : 'Délai proposé hors Normandie, à confirmer par GSS (organisation locale) : ';
}

export function alerteCadreAbsent(dce: string, cadreFourniAutreFormat = ''): string[] {
  const t = String(dce || '');
  // Cadre présent parmi les pièces sous un autre format (PDF, tableur) : son alerte propre est posée (T3-COH-5), jamais « n'est
  // pas parmi les pièces ».
  if (cadreFourniAutreFormat) return [];
  const pieces = [...t.matchAll(/\n--- ([^\n]+?) ---\n/g)].map((x) => x[1]);
  if (pieces.some((f) => /cadre\s*(?:de\s*|du\s*)?(?:r[ée]ponse|m[ée]moire)|m[ée]moire\s*technique|\bcrt\b/i.test(f.replace(/[_-]+/g, ' ')) && !/accord.cadre|candidature/i.test(f))) return [];
  // Nom du document seul (« cadre de réponse technique », « cadre de réponse technique et RSE », « cadre du mémoire
  // technique »), jamais la suite de la phrase (caen : « cadre de réponse technique les délais et conditions de
  // mobilisation des ») ; le plus précis des noms cités, avec la phrase du DCE qui le cite, entière.
  const occurrences = [...t.matchAll(/cadre\s+(?:(?:de|du)\s+)?(?:r[ée]ponse|m[ée]moire)(?:\s+technique)?(?:\s+et\s+RSE)?/gi)]
    .filter((x) => !/financi|prix|bordereau/i.test(t.slice(x.index || 0, (x.index || 0) + x[0].length + 20))
      && !/bordereau|financi/i.test(t.slice(Math.max(0, (x.index || 0) - 80), x.index || 0))
      // Locution « dans le cadre du mémoire technique » (« tout autre indicateur prévu dans le cadre du mémoire technique du
      // Titulaire », citedia) : pas un document du DCE.
      && !(/m[ée]moire/i.test(x[0]) && /\bdans\s+le\s*$/i.test(t.slice(Math.max(0, (x.index || 0) - 12), x.index || 0))
        // « … dans le cadre mémoire technique joint au DCE » (T3-COH-5) : le document, pas la locution.
        && !/^\s*(?:\(|,)?\s*(?:joint|ci-joint|fourni|annex|figurant|impos|type|mis\s+[àa]\s+disposition)/i.test(t.slice((x.index || 0) + x[0].length, (x.index || 0) + x[0].length + 40))));
  if (!occurrences.length) return [];
  const m = occurrences.reduce((a, b) => (b[0].replace(/\s+/g, ' ').length > a[0].replace(/\s+/g, ' ').length ? b : a));
  // Nom écrit en capitales dans le DCE (« CADRE DE REPONSE TECHNIQUE ») : en minuscules, jamais « cADRE ».
  const brutNom = m[0].replace(/\s+/g, ' ').trim();
  const nom = brutNom === brutNom.toUpperCase() ? brutNom.toLowerCase().replace(/\brse\b/, 'RSE') : brutNom.replace(/^C/, 'c');
  const i = m.index || 0;
  // Début de la phrase, ou de l'élément de liste en retrait qui la porte (« ⏎   -   Le cadre de réponse par lot », citedia).
  const puces = [...t.slice(Math.max(0, i - 400), i).matchAll(/\n[ \t]*[-•▪●○◦][ \t]+/g)].map((x) => Math.max(0, i - 400) + (x.index || 0) + x[0].length - 1);
  // Jamais au point d'une extension de fichier de l'en-tête interne d'une pièce (« \n--- RC.pdf ---\n » : « pdf --- … »).
  const entetes = [...t.slice(0, i).matchAll(/\n--- [^\n]+? ---\n/g)].map((x) => (x.index || 0) + x[0].length - 1);
  const debut = Math.max(t.lastIndexOf('.', i), t.lastIndexOf('\n\n', i), t.lastIndexOf('\n-', i), t.lastIndexOf('\n•', i), ...puces, ...entetes.slice(-1)) + 1;
  const finPoint = t.indexOf('.', i + m[0].length);
  const finBloc = t.indexOf('\n\n', i + m[0].length);
  // Élément de liste sans point final suivi d'un titre numéroté ou d'un autre élément (« … pour l'exécution du contrat ⏎ 3 -
  // Intervenants ⏎ 3.1 - Sous-traitance », s2e, T8CS-5) : la phrase s'arrête à la fin de la ligne.
  const suite = /\n[ \t]*(?:\d+(?:\.\d+)*[ \t]*[-–.)][ \t]|[-•▪●○◦][ \t])/.exec(t.slice(i + m[0].length));
  const finLigne = suite ? i + m[0].length + suite.index : -1;
  const fin = [finPoint >= 0 ? finPoint + 1 : -1, finBloc, finLigne].filter((x) => x >= 0).reduce((a, b) => Math.min(a, b), t.length);
  let phrase = t.slice(debut, fin).replace(/^[\s\-•]+/, '').replace(/\s+/g, ' ').trim();
  if (phrase.length > 260) phrase = `${phrase.slice(0, 260).replace(/\s+\S*$/, '')}…`;
  return [`Le DCE cite un « ${nom} »${phrase ? ` (« ${phrase.replace(/[«»]/g, '"')} »)` : ''} : ce document n'est pas parmi les pièces du dossier. Pouvez-vous l'ajouter au dossier, pour que le mémoire soit rédigé dans ce cadre imposé (sinon l'offre risque d'être jugée irrégulière) ?`];
}

/**
 * DCE sans cahier des charges (T8-COH-2) : aucune pièce nommée CCTP, CCP ou cahier des charges, ni dont le début se
 * présente comme tel (RC, AE, CCAP, bordereaux et cadre de réponse exclus). Le mémoire est alors rédigé sans le besoin
 * réel du client : GSS est prévenue en tête des consultations et du premier message de l'assistant, avec la phrase du
 * DCE qui cite le CCTP quand il y en a une. Rien n'est imprimé dans le mémoire.
 */
/**
 * Plusieurs lots sans pièce propre au lot du mémoire (T10-COH-3 : « (lots 1, 2 et 3) » imprimé alors que le RC demande un
 * mémoire par lot) : question exacte à GSS, en tête des consultations et du premier message de l'assistant.
 */
export function alerteLots(analyse: any, dce: string): string[] {
  const q = lotsDuMemoire(analyse, dce).question;
  return q ? [q] : [];
}

/** Nature d'une formalité de l'offre (visite, cadre de réponse, irrecevabilité) : une seule question par nature. */
export function typeFormalite(t: string): string {
  return /visite/i.test(t) ? 'visite' : /cadres? de r[ée]ponse/i.test(t) ? 'cadre' : /irr[ée]guli|irrecevab|rejet/i.test(t) ? 'rejet' : t;
}

export function alerteCctpAbsent(dce: string, illisibles: string[] = [], partielles: Array<{ nom: string; pages: string[] }> = []): string[] {
  // Pièce scannée illisible (T10-COH-4) : nommée à GSS ; un CCTP illisible n'est jamais annoncé « absent du dossier ».
  const NOM_CCTP_ILLISIBLE = /cctp|\bccp\b|cahier\s*des\s*(?:clauses\s*(?:techniques|particuli)|charges)|clauses?\s*techniques|programme\s*fonctionnel/i;
  const nomPropre = (n: string) => n.replace(/_/g, ' ');
  const cctpIllisibles = illisibles.filter((n) => (NOM_CCTP_ILLISIBLE.test(nomPropre(n)) && !/ccap|clauses\s*administratives/i.test(nomPropre(n))) || RX_CCATP.test(nomPropre(n)));
  const autresIllisibles = illisibles.filter((n) => !cctpIllisibles.includes(n));
  const alertesIllisibles = [
    ...cctpIllisibles.map((n) => `Le cahier des charges « ${n} » est un PDF scanné qui n'a pas pu être lu (transcription impossible) : relancez la génération, ou ajoutez au dossier une version texte (PDF texte ou Word) ; en attendant, le mémoire n'est pas adapté au CCTP.`),
    ...autresIllisibles.map((n) => `La pièce « ${n} » est un PDF scanné qui n'a pas pu être lu (transcription impossible) : relancez la génération, ou ajoutez au dossier une version texte (PDF texte ou Word) ; en attendant, le mémoire n'en tient pas compte.`),
  ];
  // PDF scanné transcrit en partie (REG6-3 : crédit épuisé ou échecs répétés) : pièce et pages non lues nommées à GSS, jamais
  // un CCTP tronqué lu en silence.
  const plages = (p: string[]) => listePages(p.map((x) => x.replace('-', ' à ')));
  for (const x of partielles) alertesIllisibles.push(`La pièce « ${x.nom} » est un PDF scanné dont ${x.pages.length > 1 || /-/.test(x.pages[0]) ? 'les pages' : 'la page'} ${plages(x.pages)} n'${x.pages.length > 1 || /-/.test(x.pages[0]) ? 'ont' : 'a'} pas pu être ${x.pages.length > 1 || /-/.test(x.pages[0]) ? 'lues' : 'lue'} (transcription interrompue) : relancez la génération pour les lire ; en attendant, le mémoire n'en tient pas compte.`);
  if (cctpIllisibles.length) return alertesIllisibles;
  return [...alerteCctpAbsentLu(dce), ...alertesIllisibles];
}
function listePages(l: string[]): string {
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '';
}

function alerteCctpAbsentLu(dce: string): string[] {
  const t = String(dce || '');
  const blocs = t.split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const pieces: Array<{ nom: string; corps: string }> = [];
  for (let i = 1; i < blocs.length; i += 3) pieces.push({ nom: blocs[i] || blocs[i + 1] || '', corps: blocs[i + 2] || '' });
  if (!pieces.length && t.trim()) pieces.push({ nom: '', corps: t });
  const NOM_CCTP = /cctp|\bccp\b|cahier\s*des\s*(?:clauses\s*(?:techniques|particuli)|charges)|clauses?\s*techniques|programme\s*fonctionnel/i;
  const AUTRE = /\bRC\b|r[èe]glement\s*(?:de\s*(?:la\s*)?)?consultation|acte\s*d.engagement|\bAE\b|DPGF|BPU|DQE|bordereau|\bDC\s?\d|attestation|cadre|m[ée]moire|candidature|lettre|avis|ccap|clauses\s*administratives/i;
  // Cahier des clauses administratives et techniques particulières (CCATP, T2-COH-6) : un cahier des charges.
  const DEBUT_CCTP = /cahier\s+des\s+(?:clauses\s+techniques|clauses\s+particuli[eè]res|clauses\s+administratives\s+et\s+techniques|charges)|\bC\.?\s?C\.?\s?T\.?\s?P\b|\bC\.?\s?C\.?\s?A\.?\s?T\.?\s?P\b|\bC\.C\.P\.|clauses\s+techniques\s+particuli/i;
  // DCE remis en un seul fichier (RC puis CCTP, T9-COH-5) : le CCTP commence plus loin que les 3 000 premiers caractères ;
  // il est présent quand la pièce porte, n'importe où, son titre en capitales seul sur sa ligne (« CAHIER DES CLAUSES
  // TECHNIQUES PARTICULIERES »), ou l'en-tête « CCTP » répété en haut de ses pages (au moins 3 fois).
  const TITRE_CCTP = /^[ \t]*(?:CAHIER DES CLAUSES TECHNIQUES PARTICULI[EÈ]RES|CAHIER DES CLAUSES PARTICULI[EÈ]RES|CAHIER DES CHARGES(?: TECHNIQUES?)?(?: PARTICULI[EÈ]RES)?)[ \t]*(?:\(\s*C\.?\s?C\.?\s?T?\.?\s?P\.?\s*\)[ \t]*)?\.?[ \t]*$/m;
  const ENTETE_CCTP = /^[ \t]*(?:CCTP|C\.C\.T\.P\.?)[ \t]*$/gm;
  const present = pieces.some((p) => {
    // Soulignés lus comme des espaces (T3-COH-6 : « RC_gardiennage_2026.pdf » est le RC, pas le cahier des charges).
    const nomEsp = p.nom.replace(/_/g, ' ');
    const nom = `${nomEsp} ${p.nom.replace(/[_.\s-]+/g, '')}`;
    if (((NOM_CCTP.test(nom) || estCahierDesCharges(p.nom)) && !/ccap|clauses\s*administratives/i.test(nom)) || RX_CCATP.test(nom)) return true;
    // Pièce administrative reconnue par son nom (« R_C.pdf », « ATTRI1.pdf », « Acte_engagement.pdf ») ou par son titre de tête :
    // jamais le cahier des charges, même si elle cite le CCTP dans la liste des pièces (T4-COH-1).
    // (un DCE remis en un seul fichier, RC puis CCTP, garde le titre du CCTP plus loin : T9-COH-5)
    if (AUTRE.test(nomEsp) || estPieceAdministrative(p.nom)) return false;
    if (teteAdministrative(p.corps) && !TITRE_CCTP.test(p.corps) && (p.corps.match(ENTETE_CCTP) || []).length < 3) return false;
    if (estCahierDesChargesParContenu(p.nom, p.corps)) return true;
    return DEBUT_CCTP.test(p.corps.slice(0, 3000)) || TITRE_CCTP.test(p.corps) || (p.corps.match(ENTETE_CCTP) || []).length >= 3;
  });
  if (present) return [];
  // Phrase du DCE (RC, AE…) qui cite le CCTP : citée telle quelle, entière.
  // (le nom le plus explicite d'abord : « Cahier des Clauses Techniques Particulières (CCTP) », puis CCTP, CCP, cahier des charges).
  const m = [/cahier\s+des\s+clauses\s+techniques\s+particuli[eè]res(?:\s*\(\s*C\.?C\.?T\.?P\.?\s*\))?/i, /\bC\.?C\.?T\.?P\b/, /cahier\s+des\s+clauses\s+particuli[eè]res(?:\s*\(\s*C\.?C\.?P\.?\s*\))?/i, /cahier\s+des\s+charges/i]
    .map((rx) => rx.exec(t)).find(Boolean);
  const suite = 'Pouvez-vous l\'ajouter au dossier, puis relancer la génération ? Si la consultation n\'en comporte pas, aucune action n\'est nécessaire.';
  if (!m) return [`Aucun cahier des charges (CCTP ou CCP) n'a été trouvé dans le dossier : s'il en existe un, le mémoire n'y est pas adapté. ${suite}`];
  const i = m.index;
  const puces = [...t.slice(Math.max(0, i - 400), i).matchAll(/\n[ \t]*[-•▪●○◦][ \t]+/g)].map((x) => Math.max(0, i - 400) + (x.index || 0) + x[0].length - 1);
  const debut = Math.max(t.lastIndexOf('. ', i), t.lastIndexOf('\n\n', i), ...puces) + 1;
  const apres = t.slice(i + m[0].length);
  const fins = [apres.search(/\.\s/), apres.indexOf('\n\n'), apres.search(/\n[ \t]*(?:\d+(?:\.\d+)*[ \t]*[-–.)][ \t]|[-•▪●○◦][ \t])/)].filter((x) => x >= 0);
  const fin = i + m[0].length + (fins.length ? Math.min(...fins) + (apres.search(/\.\s/) === Math.min(...fins) ? 1 : 0) : apres.length);
  let phrase = t.slice(debut, fin).replace(/^[\s\-•▪●○◦]+/, '').replace(/\s+/g, ' ').trim();
  if (phrase.length > 260) phrase = `${phrase.slice(0, 260).replace(/\s+\S*$/, '')}…`;
  const nom = m[0].replace(/\s+/g, ' ').trim();
  return [`Le DCE cite le « ${nom === nom.toUpperCase() ? nom : nom.charAt(0).toUpperCase() + nom.slice(1)} »${phrase ? ` (« ${phrase.replace(/[«»]/g, '"')} »)` : ''} : ce document n'est pas parmi les pièces du dossier ; le mémoire n'est donc pas adapté au cahier des charges du client. Pouvez-vous l'ajouter au dossier, puis relancer la génération ?`];
}

export const GSS_IDENTITE = {
  // Valeurs du registre des mémoires GSS (datées et sourcées) ; jamais de valeur fictive en repli : une
  // donnée absente reste « [À COMPLÉTER] » (auparavant « GSS — Sécurité privée », SIRET et adresse inventés).
  denomination: process.env.GSS_DENOMINATION || valeurRegistre('raison_sociale') || '',
  numCnaps: process.env.GSS_CNAPS || valeurRegistre('autorisation_cnaps') || '',
  dateAutorisation: process.env.GSS_DATE_AUTORISATION || valeurRegistre('date_autorisation_cnaps') || '',
  siret: process.env.GSS_SIRET || siretRegistre(),
  siren: process.env.GSS_SIREN || siretRegistre().slice(0, 11),
  adresse: process.env.GSS_ADRESSE || valeurRegistre('adresse_siege') || '',
  adresseAgence: process.env.GSS_ADRESSE_AGENCE || valeurRegistre('adresse_siege') || '',
};

/** SIRET de GSS tel qu'il figure dans ses mémoires (registre), au format « 805 295 516 00019 ». */
function siretRegistre(): string {
  const d = valeurRegistre('siret').replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : '';
}

/**
 * Renvoie la valeur d'identité connue de GSS (le candidat) si le LIBELLÉ du champ désigne la
 * dénomination, le N° CNAPS d'autorisation d'exercer ou la date d'autorisation — sinon ''.
 * On s'abstient explicitement si le libellé vise l'ACHETEUR (et non le candidat) pour ne jamais
 * écrire l'identité GSS dans une case « dénomination du pouvoir adjudicateur ». Fonction pure
 * (testable) : la liste d'identité est injectable.
 */
export function identiteCandidatForLabel(label: string, identite = GSS_IDENTITE): string {
  const n = (label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!n.trim()) return '';
  // Le champ vise l'acheteur / le client / le maître d'ouvrage → PAS l'identité du candidat GSS.
  if (/acheteur|adjudicateur|donneur d.ordre|ma[ii]tre d.ouvrage|pouvoir adjudic|\bclient\b/.test(n)) return '';
  // Le champ vise le DIRIGEANT (nom + N° agrément dirigeant CNAPS) : c'est l'identité d'une PERSONNE,
  // DISTINCTE de l'autorisation d'exercer de l'établissement. Inconnue ici → on laisse [À COMPLÉTER]
  // (NE JAMAIS y recopier le n° d'autorisation de l'entreprise). Testé avant date/CNAPS.
  if (/dirigeant|g[ée]rant|repr[ée]sentant l[ée]gal|signataire/.test(n)) return '';
  // Date d'autorisation / d'agrément (on évite les dates de validité / d'expiration, inconnues).
  // Testé AVANT le CNAPS : « Date d'autorisation d'exercer » contient « autorisation d'exercer ».
  if (/\bdate\b/.test(n) && /(autorisation|agrement)/.test(n) && !/(validit|expir|\bfin\b|echeance)/.test(n))
    return identite.dateAutorisation;
  // N° SIRET / SIREN
  if (/\bsiret\b/.test(n)) return identite.siret;
  if (/\bsiren\b/.test(n)) return identite.siren;
  // Adresse du siège / de l'entreprise / de l'agence (pour GSS)
  if (/\badresse\b/.test(n) && (/\bsiege\b|\bentreprise\b|\bsociete\b|\bagence\b|\bgss\b/.test(n)))
    return identite.adresse;
  // N° CNAPS d'autorisation d'exercer de l'ÉTABLISSEMENT. On EXIGE le contexte « autorisation /
  // exercer » (pas le simple mot « cnaps », qui apparaît aussi pour l'agrément dirigeant, déjà écarté).
  if (/autorisation d.exercer|num[ée]ro d.autorisation|(?=.*cnaps)(?=.*autoris)/.test(n)) return identite.numCnaps;
  // Dénomination / raison sociale / nom du candidat / soumissionnaire / titulaire.
  if (/denomination|raison sociale|nom (du |de la |d.)? ?(candidat|soumissionnaire|entreprise|societe|titulaire)/.test(n))
    return identite.denomination;
  return '';
}

/**
 * Rend un tableau (lignes×colonnes) sous forme ÉTIQUETÉE : pour chaque ligne de données, on associe
 * chaque cellule à l'en-tête de SA colonne (1re ligne) → « <libellé ligne> — <en-tête>: <valeur> ; … ».
 * Permet à l'IA de retrouver la valeur d'une cellule par (ligne, colonne) même quand l'extraction
 * en texte plat a désaligné le tableau. Renvoie '' s'il n'y a pas au moins un en-tête + une ligne.
 */
function renderTablePaired(rows: string[][]): string {
  const data = rows.filter((r) => r.some((c) => (c || '').trim()));
  if (data.length < 2) return '';
  // La première case (ligne et colonne) doit être vide pour un tableau à double entrée valide
  if ((data[0][0] || '').trim() !== '') return '';
  const headers = data[0].map((h) => (h || '').trim());
  const out: string[] = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const label = (r[0] || '').trim();
    const pairs: string[] = [];
    for (let c = 1; c < r.length; c++) {
      const v = (r[c] || '').trim();
      if (!v) continue;
      const h = (headers[c] || '').trim();
      pairs.push(h ? `${h}: ${v}` : v);
    }
    if (pairs.length) out.push(label ? `${label} — ${pairs.join(' ; ')}` : pairs.join(' ; '));
  }
  return out.join('\n');
}

/** Mots significatifs d'un en-tête de colonne (pour matcher « Campus Pasteur (UFR DESP) » ↔ « Pasteur »). */
function headerTokens(header: string): string[] {
  const STOP = new Set(['campus', 'site', 'sites', 'ufr', 'principal', 'rouen', 'detail', 'fonction', 'des', 'lot', 'le', 'la', 'du', 'de']);
  return Array.from(new Set(
    header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w))));
}

/**
 * Rend un tableau PAR COLONNE : pour chaque colonne de données (un site), un bloc listant ses lignes
 * « <libellé ligne>: <valeur> ». Permet d'injecter, pour une cellule, UNIQUEMENT la colonne du site
 * concerné → le modèle ne peut pas mélanger les sites. Renvoie [{header, tokens, block}].
 */
interface SiteColumn { header: string; tokens: string[]; block: string; rows: Array<{ label: string; value: string }>; }
function renderTableByColumn(rows: string[][]): SiteColumn[] {
  const data = rows.filter((r) => r.some((c) => (c || '').trim()));
  if (data.length < 2) return [];
  // La première case (ligne et colonne) doit être vide pour un tableau à double entrée valide
  if ((data[0][0] || '').trim() !== '') return [];
  const headers = data[0].map((h) => (h || '').replace(/\s+/g, ' ').trim());
  const cols: SiteColumn[] = [];
  const nbCols = Math.max(...data.map((r) => r.length));
  for (let c = 1; c < nbCols; c++) {
    const header = headers[c] || '';
    const tokens = headerTokens(header);
    if (!tokens.length) continue;                       // colonne sans en-tête exploitable (ex. colonne vide)
    const rowsCol: Array<{ label: string; value: string }> = [];
    for (let i = 1; i < data.length; i++) {
      const label = (data[i][0] || '').replace(/\s+/g, ' ').trim();
      const value = (data[i][c] || '').replace(/\s+/g, ' ').trim();
      if (label && value) rowsCol.push({ label, value });
    }
    if (rowsCol.length) cols.push({ header, tokens, block: rowsCol.map((r) => `${r.label}: ${deglue(r.value)}`).join('\n'), rows: rowsCol });
  }
  return cols;
}

/** Dé-colle légèrement un texte source extrait (« 1agentle matin » → « 1 agent le matin ») sans rien réécrire. */
function deglue(s: string): string {
  return s
    .replace(/(\d)([a-zA-Zà-ÿ])/g, '$1 $2')        // « 1agent » → « 1 agent »
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2')      // « journéeLundi » → « journée Lundi »
    .replace(/\s{2,}/g, ' ').trim();
}

/**
 * Remplissage DÉTERMINISTE d'une cellule de tableau à partir de la colonne SOURCE du site : on
 * sélectionne, dans les lignes de la colonne, celle(s) qui correspond(ent) au libellé de la ligne du
 * cadre, et on renvoie leur valeur VERBATIM (légèrement dé-collée). 0 IA, 0 invention. '' si rien.
 */
function siteCellVerbatim(rowLabel: string, col: SiteColumn): string {
  const n = (rowLabel || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const find = (kw: RegExp) => col.rows.filter((r) => kw.test(r.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
  let picked: Array<{ label: string; value: string }> = [];
  if (/moyen|humain|effectif|nombre|agent|chef|poste|profil/.test(n)) {
    // « moyens humains / nombre d'agents » → chef d'équipe (si présent) + nombre d'agents, VERBATIM.
    picked = [...find(/chef|maitrise|encadr/), ...find(/nombre|agent/)];
  } else if (/horaire|amplitude|plage/.test(n)) {
    picked = find(/horaire/);
  } else if (/d[ée]lai|minute|intervention/.test(n)) {
    picked = find(/d[ée]lai|minute|intervention/);
  } else if (/volume|heure/.test(n)) {
    picked = find(/volume|heure/);
  } else if (/fermeture|periode/.test(n)) {
    picked = find(/fermeture|periode/);
  }
  // dédoublonnage par valeur, concat verbatim
  const seen = new Set<string>();
  const parts = picked.map((r) => deglue(r.value)).filter((v) => { const k = v.toLowerCase(); if (!v || seen.has(k)) return false; seen.add(k); return true; });
  return parts.join(' + ');
}

// ─── Main Class ───


/**
 * Libellé d'une réponse du cadre dans l'état (premier message de l'assistant, éléments) : le même que dans les
 * consultations. Question qui porte son propre numéro (« 2.3 Le centre de permanence… » sous « 2.1 L'organisation… ») :
 * la question seule. Question qui n'est qu'un paragraphe de consigne (« Le renvoi vers un rapport général… », « Le
 * soumissionnaire décrit… ») : l'intitulé de la section seul, en minuscules s'il est écrit en capitales. Sinon
 * « section — question » (havre2 335, T3N-8).
 */
export function libelleChampEtat(section: string, question: string): string {
  const sec = String(section || '').replace(/\s+/g, ' ').trim();
  const q = String(question || '').replace(/\s+/g, ' ').trim();
  if (!sec || sec === q || q.includes(sec)) return q || sec;
  if (/^\d+(?:\.\d+)*\.?\s/.test(q)) return q;
  if (/^(?:le renvoi|tout renvoi|cela peut|le soumissionnaire|le candidat|le prestataire|il est demand|il convient|pour rappel|les réponses doivent)/i.test(q)) {
    return /[a-zà-ÿ]/.test(sec) ? sec : sec.charAt(0) + sec.slice(1).toLowerCase();
  }
  return `${sec} — ${q}`;
}

/**
 * Format court : questions dont le passage est encore dans le texte remis, après la sélection au rendu mesuré (imm 341 :
 * la rubrique PTI écartée, la question « délai PTI hors Normandie » restait posée). Retirées : question d'une rubrique dont
 * le sous-titre « ## titre » n'est plus dans aucune partie, question d'un repère disparu avec son passage, confirmation
 * d'une valeur du registre qui n'est plus écrite (`confirmationsPerdues`).
 */
export function demandesDesPassagesRepris<T extends { texte: string; repere?: number }>(
  demandes: T[], sections: Record<string, string>, rubriqueDeQuestion: Map<string, string>,
  titreDe: (id: string) => string | undefined, repere: (n: number) => string, confirmationsPerdues: Set<string> = new Set(),
): T[] {
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const titres = new Set(Object.values(sections).flatMap((t) => (t.match(/^## .+$/gm) || []).map((l) => norm(l.slice(3)))));
  const tout = Object.values(sections).join('\n');
  return demandes.filter((d) => {
    if (typeof d.repere === 'number' && !tout.includes(repere(d.repere))) return false;
    const rid = rubriqueDeQuestion.get(d.texte);
    const titre = rid ? titreDe(rid) : undefined;
    if (titre && !titres.has(norm(titre))) return false;
    return !confirmationsPerdues.has(d.texte);
  });
}

/**
 * Calendrier de GSS gardé alors que le DCE impose un autre délai (ifsem 335 : J-10, J-7, J-3 face à « au moins 10 jours
 * ouvrés avant le début du mois ») : une seule question précise, qui cite l'exigence et les jalons écrits dans le mémoire.
 * Une question de couverture sur la même obligation (même délai et même objet, « planning ») n'est pas reposée à part :
 * elle est remplacée par cette question, qui la reprend en entier.
 */
export function questionJalons(questions: Set<string>, exigence: string, section: string): string {
  const calendrier = section.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/[*_]/g, '').replace(/\s*;\s*$/, '').trim())
    .filter((l) => /(?<![A-Za-z0-9])J\s*[-−–+]\s*\d/.test(l));
  const ex = phraseLisible(exigence, 420).replace(/[.\s]+$/, '');
  const objet = (/(planning|rapport|bilan|compte rendu|facture|consigne|liste)s?/i.exec(ex) || [])[1]?.toLowerCase() || '';
  const delai = (/\d+\s*(?:jours?|heures?|h|semaines?|mois)(?:\s+(?:ouvr[ée]s|calendaires|francs|ouvrables))?/i.exec(ex) || [])[0] || '';
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const memes = [...questions].filter((q) => delai && objet && norm(q).includes(norm(delai)) && norm(q).includes(norm(objet)));
  memes.forEach((q) => questions.delete(q));
  const q = `Le DCE exige : « ${ex} ». Le calendrier de GSS écrit dans le mémoire est : « ${calendrier.join(' ; ')} ». Quelles échéances faut-il écrire pour ce marché (envoi des plannings, validation par les agents, envoi à l'acheteur) ?${memes.length ? ` ${memes.join(' ')}` : ''}`;
  questions.add(q);
  return q;
}
/**
 * Suppressions des répétitions entre rubriques désignées par le modèle (dedoublonnerRubriques), appliquées sans modèle :
 * seuls les extraits retrouvés mot pour mot, jamais une phrase dont la suivante dépend (pronom, possessif, connecteur, groupe
 * nominal de reprise « L'outil… », T6-CONS-5), jamais une partie d'une énumération (retirée en entier avec son introduction, ou
 * pas du tout), jamais le texte de référence de GSS. Renvoie le nombre de passages retirés ; `sections` est modifié.
 */
export function appliquerSuppressionsRepetitions(sections: Record<string, string>, rubriques: Array<{ id: string; title: string }>, ids: string[], liste: any, intouchables: string[] = [], references: Record<string, string> = {}): number {
  let n = 0;
  // Extraits désignés par rubrique : une énumération n'est retirée qu'en entier, avec sa phrase d'introduction (T6-CONS-5).
  const designes = new Map<string, Set<string>>();
  for (const s of Array.isArray(liste) ? liste : []) { const id = String(s?.id || ''); if (!designes.has(id)) designes.set(id, new Set()); designes.get(id)!.add(String(s?.extrait || '').trim()); }
  for (const s of Array.isArray(liste) ? liste : []) {
    const id = String(s?.id || ''), extrait = String(s?.extrait || '').trim(), garde = String(s?.garde || '');
    if (!ids.includes(id) || intouchables.includes(id) || id === garde || !ids.includes(garde) || extrait.length < 30 || /⟦AC:|CONSULTATION REQUISE/i.test(extrait)) continue;
    // Extrait qui traverse une fin de ligne ou un sous-titre en gras : jamais retiré (ifits 171 : sous-titres collés).
    if (/\n|\*\*/.test(extrait)) continue;
    const t = sections[id];
    if (!t.includes(extrait)) continue;
    // Rubrique « à adapter » : son texte de référence GSS publiposté ne s'élague jamais (D7) ; seuls les ajouts de
    // l'adaptation et du contrôle de couverture peuvent être retirés (ifits 171 : 42 % du texte de GSS restant).
    const ref = references[id];
    if (ref && fidelite(extrait, ref) >= 0.8) continue;
    // La phrase suivante renvoie à celle-ci (« Ces vacations… », « Elle constitue… ») : on la garde, sinon
    // la suivante devient orpheline.
    const suite = t.slice(t.indexOf(extrait) + extrait.length).replace(/^[\s.;:]+/, '');
    if (/^(?:Ces|Ce|Cet|Cette|Ils|Elles|Il|Elle|Celle|Celui|Ceux|Celles|Lui|Leur|Leurs|Là|Ainsi|De plus|En outre)\b/.test(suite)) continue;
    // Reprise par un groupe nominal défini (T6-CONS-5 : « GSS organise les vacations avec le logiciel de planification
    // Comète. » puis « L'outil intègre les obligations… ») : nom générique de reprise, ou nom déjà écrit dans l'extrait.
    const tete = /^(?:Le|La|Les|L['’])\s*([A-Za-zÀ-ÿ-]+)/.exec(suite);
    if (tete && (/^(?:outils?|logiciels?|applications?|dispositifs?|syst[èe]mes?|proc[ée]dures?|plateformes?|documents?|registres?|programmes?|d[ée]marches?|m[ée]thodes?|solutions?|modules?|supports?|tableaux?|rapports?|livrets?|guides?|process(?:us)?|[ée]quipes?|agents?|services?|outillages?|mesures?|organisations?|r[ée]unions?|contr[ôo]les?|formations?|partenaires?|prestataires?|actions?|[ée]tapes?)$/i.test(tete[1]) || normaliser(extrait).includes(normaliser(tete[1]).slice(0, 6)))) continue;
    // Reprise dans la première proposition de la phrase suivante, après un complément (« Pour les sites normands du marché,
    // son délai d'arrivée… »), ou connecteur dans cette phrase (« Les prestations … sont donc exécutées … ») : la phrase
    // suivante dépend de celle-ci, elle est gardée (s2e 1501, T5N-4).
    const phraseSuivante = (suite.split(/(?<=[.!?])\s+/)[0] || '').slice(0, 400);
    if (/^[^.!?]{0,90}?(?<![\p{L}])(?:son|sa|ses|leur|leurs|il|elle|ils|elles|lui|celui-ci|celle-ci|ceux-ci|celles-ci)(?![\p{L}])/iu.test(phraseSuivante)
      || /(?<![\p{L}])(?:donc|par cons[ée]quent|en cons[ée]quence|de ce fait|d[èe]s lors)(?![\p{L}])/iu.test(phraseSuivante)) continue;
    // Phrase qui porte la réponse au sujet de sa rubrique (mots du titre : « GSS n'envisage pas de recourir à la
    // sous-traitance… » sous « Sous-traitance du service public », T5N-4) : jamais retirée.
    const titreRub = rubriques.find((x) => x.id === id)?.title || '';
    const pleinsTitre = normaliser(titreRub).replace(/[^a-z0-9 -]+/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !/^(?:votre|notre|leurs?|dans|pour|avec|selon|entre)$/.test(w));
    const ex = normaliser(extrait);
    if (pleinsTitre.length && (ex.includes(pleinsTitre[0].slice(0, 7)) || pleinsTitre.filter((w) => ex.includes(w.slice(0, 7))).length >= Math.min(2, pleinsTitre.length))) continue;
    // Retire la puce entière, sinon la phrase seule. Puce d'une énumération introduite par « … : » : jamais une partie des
    // puces (« une procédure de recrutement en plusieurs étapes : » suivie d'une seule puce) ; l'énumération part en entier,
    // avec son introduction, seulement si toutes ses puces sont des redites (T6-CONS-5). Introduction seule : gardée.
    const lignes = t.split('\n');
    const k = lignes.findIndex((l) => l.replace(/^\s*[-*•]\s*/, '').trim() === extrait);
    const estPuce = k >= 0 && /^\s*[-*•]\s/.test(lignes[k]);
    if (!estPuce && /:\s*$/.test(extrait)) continue;
    let debutListe = k, finListe = k;
    if (estPuce) { while (debutListe > 0 && /^\s*[-*•]\s/.test(lignes[debutListe - 1])) debutListe--; while (finListe + 1 < lignes.length && /^\s*[-*•]\s/.test(lignes[finListe + 1])) finListe++; }
    const intro = estPuce && debutListe > 0 && /:\s*$/.test(lignes[debutListe - 1]) ? debutListe - 1 : -1;
    let nouveau: string;
    if (estPuce && finListe > debutListe) {
      const puces = lignes.slice(debutListe, finListe + 1).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim());
      if (!puces.every((p) => designes.get(id)?.has(p))) continue;
      const de = intro >= 0 ? intro : debutListe;
      nouveau = [...lignes.slice(0, de), ...lignes.slice(finListe + 1)].join('\n');
      for (const p of puces) designes.get(id)?.delete(p);
    } else if (estPuce) {
      // Puce unique sous une introduction « … : » : l'introduction part avec elle.
      nouveau = [...lignes.slice(0, intro >= 0 ? intro : k), ...lignes.slice(k + 1)].join('\n');
    } else nouveau = t.replace(extrait, '').replace(/ {2,}/g, ' ').replace(/\n[ \t]+\n/g, '\n\n');
    // Sous-titres restés sans contenu.
    nouveau = nouveau.replace(/^#{2,4}\s+.+\n+(?=#{2,4}\s|$(?![\s\S]))/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (nouveau.split(/\s+/).length < 120) continue; // jamais au point de vider la rubrique
    if (ref && fidelite(ref, nouveau) < SEUIL_FIDELITE) continue; // contrôle final de la fidélité (D7)
    sections[id] = nouveau;
    n++;
  }
  return n;
}

/**
 * Phrases signalées à GSS telles qu'elles sont imprimées dans le texte final d'une réponse (T6-CONS-2, T6-COH-1) : la phrase
 * retrouvée mot pour mot, sinon la phrase du texte final la plus proche (corrigée par la relecture, nom de l'acheteur
 * normalisé) ; une phrase absente du texte final n'est jamais signalée. Sans doublon ni entrée vide.
 */
export function phrasesImprimees(phrases: string[], final: string): string[] {
  const n = (x: string) => String(x || '').replace(/\s+/g, ' ').trim();
  const t = n(final);
  const candidates = String(final || '').replace(/\r/g, '').split('\n').flatMap((l) => l.replace(/^\s*(?:[•\-*]|\d+[.)])\s+/, '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«])/)).map(n).filter((x) => x.length >= 12);
  const out: string[] = [];
  for (const ph of phrases.map(n).filter((x) => x.length >= 12)) {
    let retenue = t.includes(ph) ? ph : '';
    if (!retenue) {
      const m = motsDePhrase(ph);
      let meilleur = 0;
      for (const c of candidates) { const s = similarite(m, motsDePhrase(c)); if (s > meilleur) { meilleur = s; retenue = c; } }
      if (meilleur < 0.7) retenue = '';
    }
    if (retenue && !out.includes(retenue)) out.push(retenue);
  }
  return out;
}

/** Premier message de l'assistant, cadre imposé (T6N-5) : phrases ajoutées par l'IA au texte de GSS, par réponse, à valider. */
export function messageAjoutsCadre(ajouts: Array<{ libelle: string; phrases: string[] }>): string {
  const n = ajouts.reduce((t, a) => t + a.phrases.length, 0);
  if (!n) return '';
  return [
    `J'ai ajouté au texte de GSS ${n === 1 ? 'une phrase rédigée' : `${n} phrases rédigées`} par l'IA dans les réponses du cadre. À relire avant la remise :`,
    ...ajouts.flatMap((a) => a.phrases.map((ph) => `- « ${libelleQuestionCadre(a.libelle)} » : « ${ph} »`)),
    '',
    "Pour chacune, vous pouvez la valider telle quelle, la modifier (« Dans la réponse sur …, remplace … par … ») ou la supprimer (« Dans la réponse sur …, supprime la phrase … »).",
  ].join('\n');
}

export class MemoireGenerator {
  private openai: OpenAI;
  private responseDir: string;
  private templateDir: string;
  // Tableaux du DCE rendus ÉTIQUETÉS (ligne — en-tête: valeur), capturés pendant getDceContext et
  // réinjectés tels quels dans les cellules de tableau (remplissage fiable, indépendant du RAG).
  private lastDceTables = '';
  // Tableaux du DCE vus PAR COLONNE (par site) : pour une cellule, on n'injecte QUE la colonne du
  // site concerné → le modèle ne peut PAS piocher les données d'un autre site (anti-mélange colonnes).
  private lastDceSiteCols: SiteColumn[] = [];
  // Modèle de rédaction effectif (core/modeles_ia.ts), noté dans le journal et les métadonnées du mémoire.
  private memoireModel: string = MEMOIRE_MODEL;
  /** « Demande particulière » saisie juste avant la génération (consigne et/ou document complémentaire). */
  /** Mises en situation proposées par la dernière lecture du DCE (état du dossier, reprises à la génération suivante). */
  private dimensionnementEtat?: { empreinte: string; misesEnSituation: any[] };
  private demandeParticuliere: DemandeParticuliere | null = null;
  /** Crédit OpenAI épuisé pendant cette génération : plus aucun appel, aucun document produit (CreditOpenAIEpuise). */
  private creditOpenAIEpuise = false;
  /** Appels au modèle échoués pendant cette génération (OpenAI en panne, erreur 5xx…) : libellés des étapes (T5-COH-2). */
  private appelsEchoues: string[] = [];
  /** Limite de pages du RC lue sans le modèle, ou non lue (T7CS-1) : alerte en tête des consultations et du premier message. */
  private alertesFormat: string[] = [];
  /** Cadre imposé présent mais non remplissable (PDF, tableur) : l'alerte « absent des pièces » ne doit pas être posée. */
  private cadreNonRemplissable: string | null = null;
  /** Pièces du DCE (PDF scannés) dont la transcription a échoué (T10-COH-4). */
  private piecesIllisibles: string[] = [];
  /** PDF scannés transcrits en partie (REG6-3) : nom de la pièce et pages non lues, nommés à GSS dans les alertes. */
  private piecesPartielles: Array<{ nom: string; pages: string[] }> = [];
  /** Pièces du cahier des charges tronquées ou écartées par le budget de lecture du DCE (T1-COH-3) : signalées à GSS. */
  private alertesDceTronque: string[] = [];
  private verifierCredit(): void {
    if (this.creditOpenAIEpuise) throw new CreditOpenAIEpuise();
  }
  private signalerCredit(e: any, label: string): void {
    if (!creditEpuise(e)) return;
    if (!this.creditOpenAIEpuise) console.error(`[MemoireGenerator] ${label} : crédit OpenAI épuisé (${e?.code || e?.status || ''}) — génération interrompue, aucun mémoire produit.`);
    this.creditOpenAIEpuise = true;
    throw new CreditOpenAIEpuise();
  }

  constructor(apiKey?: string) {
    const settings = getSettings();
    // BYO-key : la clé peut venir de la requête (front, localStorage) ou de l'env OPENAI_API_KEY.
    // Le SDK OpenAI lève une erreur cryptique (« Missing credentials ») si la clé est vide → on
    // émet ici un message clair et actionnable plutôt que de laisser remonter celui du SDK.
    const key = (apiKey || settings.openaiApiKey || '').trim();
    if (!key) {
      throw new Error(
        "Clé OpenAI manquante : renseigne OPENAI_API_KEY dans gss-ao/.env, ou transmets « api_key » " +
        "dans la requête. La génération du mémoire nécessite l'accès à l'API OpenAI.",
      );
    }
    this.openai = new OpenAI({ apiKey: key });
    const baseDir = path.resolve(__dirname, '../../');
    this.responseDir = path.resolve(baseDir, 'response');
    this.templateDir = path.resolve(baseDir, 'Template');
    if (!fs.existsSync(this.responseDir)) fs.mkdirSync(this.responseDir, { recursive: true });
    // T7-REG-3 : chaque génération lancée par le serveur a son propre DCE pour la mise en forme des questions à GSS
    // (questionExacte), jamais celui d'une autre génération en cours.
    for (const m of ['detectMissingInfo', 'generate', 'generateFullMemoire', 'generateFullMarpPdf'] as const) {
      const orig = (this as any)[m];
      if (typeof orig === 'function') (this as any)[m] = (...a: any[]) => avecDceDesQuestions(() => orig.apply(this, a));
    }
  }

  private findDceTemplate(dceDir: string): string | null {
    if (!fs.existsSync(dceDir)) return null;
    // Fichiers temporaires Office (« ~$… ») et fichiers cachés : jamais des pièces du DCE.
    const files = fs.readdirSync(dceDir).filter((f) => !f.startsWith('~$') && !f.startsWith('.'));
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_]+/g, ' ');
    // Les noms uploadés sont parfois en MOJIBAKE (nom UTF-8 lu en latin1 par multer :
    // « 5-Mémoire Technique… » écrit « 5-MÃ©moire Technique… » sur le disque). On teste donc
    // le nom brut ET sa réparation latin1→utf8, sinon « memoire » n'est jamais reconnu → repli
    // sur le mémoire GSS maître (génération « hors cadre ») au lieu de remplir le cadre imposé.
    const repaired = (s: string) => { try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; } };
    // Un cadre de réponse imposé s'appelle « …mémoire… », mais AUSSI « Cadre de réponse », « CRT »
    // (cadre de réponse technique), « CADRE_REP », « Trame mémoire technique », « Questionnaire
    // technique »… Un « accord-cadre », un cadre de réponse « candidatures » ou une pièce DC1/DC2 n'en
    // sont pas. S'il y a plusieurs candidats, on garde le cadre TECHNIQUE (score), puis le .docx.
    const score = (f: string, toutFormat = false): number => {
      const n = `${norm(f)} ${norm(repaired(f))}`;
      if (!/\.docx?$/i.test(f) && !(toutFormat && /\.(?:pdf|xlsx?|ods|odt|rtf)$/i.test(f))) return 0;
      if (/candidature|accord[- ]cadre|\bdc ?[1-4]\b|acte d.?engagement|\bbpu\b|\bdpgf\b|\bdqe\b|fiche contact/.test(n)) return 0;
      let sc = 0;
      if (/memoire technique|cadre (de )?(reponse|memoire)|\bcrt\b|cadre rep\b|trame|questionnaire technique|reponse technique/.test(n)) sc = 10;
      else if (/memoire|cadre/.test(n)) sc = 5;
      if (!sc) return 0;
      if (/technique/.test(n)) sc += 3;
      if (/\.docx$/i.test(f)) sc += 1;
      return sc;
    };
    const candidats = files.map((f) => ({ f, sc: score(f) })).filter((c) => c.sc > 0).sort((a, b) => b.sc - a.sc);
    if (!candidats.length) {
      // Cadre imposé fourni seulement en PDF ou en tableur (T3-COH-5) : impossible à remplir ; le mémoire est rédigé hors de ce
      // cadre et GSS en est prévenu en tête des consultations et du premier message de l'assistant.
      const autre = files.map((f) => ({ f, sc: score(f, true) })).filter((c) => c.sc >= 10).sort((a, b) => b.sc - a.sc)[0];
      if (autre) {
        const nom = repaired(autre.f);
        const format = /\.pdf$/i.test(nom) ? 'en PDF' : /\.(?:xlsx?|ods)$/i.test(nom) ? 'en tableur' : 'dans un format que la génération ne remplit pas';
        this.alertesFormat.push(`Le cadre de réponse imposé « ${nom} » n'est fourni qu'${format.startsWith('en') ? '' : 'e '}${format} : le mémoire a été rédigé hors de ce cadre. Pouvez-vous obtenir sa version Word, l'ajouter au dossier et relancer la génération ?`.replace("n'est fourni qu'en", "n'est fourni qu'en").replace("qu'e dans", 'que dans'));
        this.cadreNonRemplissable = nom;
        console.warn(`[MemoireGenerator] Cadre imposé « ${nom} » fourni ${format} : réponse libre, GSS prévenu.`);
      }
      return null;
    }
    if (candidats.length > 1) console.log(`[MemoireGenerator] Plusieurs cadres possibles (${candidats.map((c) => c.f).join(' ; ')}) → « ${candidats[0].f} ».`);
    return this.cadreEnDocx(path.join(dceDir, candidats[0].f));
  }

  /**
   * Cadre imposé au format Word 97-2003 (.doc) : converti en .docx (LibreOffice), seul format que le
   * remplissage sait traiter. Sans conversion possible, le cadre est ignoré (génération sans cadre)
   * plutôt que de faire échouer toute la génération.
   */
  /** Cadre .doc converti par textutil (tableaux aplatis) pour la génération en cours : signalé à GSS (T1-CONS-1). */
  private cadreAplati: string | null = null;

  private cadreEnDocx(fichier: string): string | null {
    this.cadreAplati = null;
    if (!/\.doc$/i.test(fichier)) return fichier;
    try {
      const sortie = convertDocToDocx(fichier, fs.mkdtempSync(path.join(os.tmpdir(), 'gss-cadre-')));
      console.log(`[MemoireGenerator] Cadre imposé .doc converti en .docx : ${path.basename(fichier)}.`);
      return sortie;
    } catch (e: any) {
      // Sans LibreOffice : Microsoft Word (macOS) convertit en conservant les tableaux du cadre.
      const parWord = convertirDocAvecWord(fichier, fs.mkdtempSync(path.join(os.tmpdir(), 'gss-cadre-')));
      if (parWord) {
        console.log(`[MemoireGenerator] Cadre imposé .doc converti en .docx (Microsoft Word) : ${path.basename(fichier)}.`);
        return parWord;
      }
      // Dernier recours : textutil (macOS) produit un .docx, mais aplatit les tableaux.
      const textutil = findTextutil();
      if (textutil) {
        const sortie = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gss-cadre-')), path.basename(fichier).replace(/\.doc$/i, '.docx'));
        const r = spawnSync(textutil, ['-convert', 'docx', '-output', sortie, fichier], { timeout: 120_000 });
        if (r.status === 0 && fs.existsSync(sortie)) {
          // textutil perd le fond coloré des bandeaux mais garde leur texte blanc : texte remis en noir, sinon invisible.
          try {
            const zip = new PizZip(fs.readFileSync(sortie));
            const xml = zip.file('word/document.xml')?.asText();
            if (xml) { zip.file('word/document.xml', xml.replace(/<w:color w:val="(?:FFFFFF|ffffff)"\/>/g, '')); fs.writeFileSync(sortie, zip.generate({ type: 'nodebuffer' })); }
          } catch { /* conversion gardée telle quelle */ }
          console.log(`[MemoireGenerator] Cadre imposé .doc converti en .docx (textutil) : ${path.basename(fichier)}.`);
          this.cadreAplati = path.basename(fichier);
          return sortie;
        }
      }
      console.warn(`[MemoireGenerator] Cadre imposé .doc non convertible (${e?.message || e}) : génération sans cadre.`);
      return null;
    }
  }

  /**
   * Lit dans l'ordre les LIBELLÉS des marqueurs « Contexte … » d'OUVERTURE d'AO RNE.docx (texte propre,
   * contrairement au PDF où les items sont éclatés « ap proc he »). Le libellé = l'ANGLE/le sujet voulu
   * de la zone (« Une réponse pour vos sites », « approche cousue-main », « DES MOYENS CALIBRÉS »…),
   * « Contexte / début / sur mesure / fin » retirés. Renvoie [] si illisible.
   */
  private getContextZoneLabels(): string[] {
    try {
      const docxPath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      if (!fs.existsSync(docxPath)) return [];
      const xml = new PizZip(fs.readFileSync(docxPath)).file('word/document.xml')!.asText();
      const paras = xml.split(/<w:p[ >]/).slice(1).map((p) => {
        const t = (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('');
        return t.replace(/&amp;/g, '&').trim();
      });
      return paras
        .filter((t) => CONTEXT_MARKER_RE.test(t) && !CONTEXT_CLOSE_RE.test(t))   // marqueurs d'OUVERTURE
        .map((t) => t.replace(/[«»“”"'‹›]/g, ' ').replace(/\bContexte\b/i, ' ')
          .replace(/\b(d[ée]but|sur\s+mesure|fin)\b/ig, ' ').replace(/\s+/g, ' ').trim());
    } catch { return []; }
  }

  /**
   * Charge les fichiers du DCE (DOC/DOCX/PDF), priorisés par pertinence pour un mémoire technique,
   * puis tronqués pour tenir dans la fenêtre de contexte du modèle (gpt-4o ≈ 128k tokens).
   * Sans ce plafond, le seul CCTP+annexes (~733k caractères) dépasse la limite → l'appel échoue
   * et le document ressort vierge.
   */
  /**
   * Matérialise les pièces DCE du dossier depuis Supabase Storage dans un dossier temporaire.
   * L'extraction (LibreOffice pour .doc, tableaux .docx) exige des fichiers réels sur disque :
   * on télécharge donc les octets le temps du traitement, puis l'appelant supprime le dossier.
   * Renvoie le chemin temporaire, ou null si aucune pièce en base → l'appelant retombe alors sur
   * l'ancien emplacement disque (data/output/dce_<id>), pour les dossiers créés avant la migration.
   */
  private async materializeDceFromStorage(dossierId: string): Promise<string | null> {
    let fichiers;
    try {
      fichiers = await FichiersDB.listByDossier(dossierId);
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Table fichiers illisible (${e?.message || e}) — repli sur le disque.`);
      return null;
    }
    const dce = fichiers.filter((f) => f.storage_path && /\/dce\//.test(f.storage_path));
    if (!dce.length) return null;

    const supabase = getScopedClient();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `dce_${dossierId}_`));
    let got = 0;
    for (const f of dce) {
      try {
        const { data, error } = await supabase.storage.from(USER_FILES_BUCKET).download(f.storage_path!);
        if (error || !data) { console.warn(`[MemoireGenerator] DCE Storage: ${f.nom} illisible (${error?.message || 'vide'})`); continue; }
        // `nom` peut porter un CHEMIN RELATIF (sous-dossiers) → on recrée l'arborescence dans le tmp.
        // Garde anti-traversée : on résout et on vérifie que la cible reste DANS tmpDir.
        const dest = path.resolve(tmpDir, f.nom);
        if (dest !== tmpDir && !dest.startsWith(tmpDir + path.sep)) {
          console.warn(`[MemoireGenerator] DCE Storage: chemin hors périmètre ignoré (${f.nom})`);
          continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
        got++;
      } catch (e: any) {
        console.warn(`[MemoireGenerator] DCE Storage: échec téléchargement ${f.nom} — ${e?.message || e}`);
      }
    }
    if (!got) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } return null; }
    console.log(`[MemoireGenerator] ${got} pièce(s) DCE téléchargée(s) depuis Storage (dossier temporaire, nettoyé après).`);
    return tmpDir;
  }

  /** DCE assemblé du dossier ; retenu aussi pour la mise en forme des questions à GSS (questionExacte : une consigne du modèle
   *  n'est présentée comme « Exigence du DCE » que si le DCE l'écrit, T6-CONS-8). */
  private async getDceContext(dossierId: string): Promise<string> {
    const dce = await this.lireDceContext(dossierId);
    definirDceDesQuestions(dce);
    return dce;
  }

  private async lireDceContext(dossierId: string): Promise<string> {
    const baseDir = path.resolve(__dirname, '../../');
    this.lastDceTables = '';   // réinitialisé à chaque analyse de DCE
    this.lastDceSiteCols = [];

    // Source des pièces DCE : Supabase Storage (via table fichiers) matérialisé en /tmp transitoire.
    // Repli sur l'ancien emplacement disque pour les dossiers antérieurs à la migration Storage.
    const materializedDir = await this.materializeDceFromStorage(dossierId);

    // Budget global et plafond par fichier (en caractères ; ~4 car/token)
    const TOTAL_BUDGET = 240_000;
    const PER_FILE_CAP = 130_000;

    // Score de priorité d'après le nom de fichier (le mémoire porte d'abord sur le CCTP et les effectifs)
    const priorityOf = (n: string): number => {
      // Cahier des charges sous tous ses noms (« C_C_T_P_ COMMUN », « CCP VF SECU EVEN », « Cahierdesclausesparticulieres »,
      // T1-COH-3) : toujours en tête, jamais derrière une annexe ou le CCAP.
      // Annexe du CCTP (« Annexe 1 CCTP - Besoin par sites ») : après le CCTP lui-même.
      if (estCahierDesCharges(n)) return /annexe/.test(n) ? 95 : 100;
      if (n.includes('rc ') || n.includes('reglement') || /\brc\b/.test(n)) return 90;
      if (n.includes('annexe 1') || n.includes('effectif') || n.includes('horaire')) return 85;
      if (n.includes('annexe 2') || n.includes('profil')) return 80;
      if (n.includes('ccap') || n.includes('cahier des clauses administ')) return 55;
      if (n.includes('acte') && n.includes('engagement')) return 45;
      if (n.includes('annexe')) return 35;
      return 25;
    };

    type DcePiece = { label: string; text: string; priority: number };
    const pieces: DcePiece[] = [];

    // 1. Sorties JSON pré-analysées (synthèses concises, très utiles) — priorité maximale
    const rcPath = path.resolve(baseDir, `../data/output/rc_${dossierId}.json`);
    const cctpPath = path.resolve(baseDir, `../data/output/cctp_${dossierId}.json`);
    if (fs.existsSync(cctpPath)) pieces.push({ label: 'CCTP (analysé)', text: fs.readFileSync(cctpPath, 'utf8'), priority: 120 });
    if (fs.existsSync(rcPath)) pieces.push({ label: 'RC (analysé)', text: fs.readFileSync(rcPath, 'utf8'), priority: 115 });

    // 2. Fichiers bruts (récursif), dédoublonnés.
    // On ne scanne QUE le dossier réellement uploadé pour CE dossier : scanner en plus des corpus
    // de référence (Rouen…) ralentissait fortement le démarrage (chaque .doc = conversion LibreOffice)
    // ET polluait le contexte avec les données d'un autre client → faux pour « n'importe quel client ».
    const dceDirs = [
      materializedDir || path.resolve(baseDir, `../data/output/dce_${dossierId}`),
    ];
    // Nettoyage du dossier temporaire (rien ne reste sur le disque de l'app après la génération).
    const cleanupTmp = () => {
      if (materializedDir) { try { fs.rmSync(materializedDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    };

    const loadedFiles = new Set<string>();
    this.piecesIllisibles = [];
    this.piecesPartielles = [];
    this.alertesDceTronque = [];
    const scanDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { await scanDir(fullPath); continue; }

        const normalized = entry.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.doc', '.docx', '.pdf', '.xlsx'].includes(ext)) continue;
        if (normalized.includes('bpu') || normalized.includes('dpgf')) continue;
        if (normalized.includes('memoire') && (normalized.includes('technique') || normalized.includes('gss'))) continue;
        if (loadedFiles.has(normalized)) continue;
        loadedFiles.add(normalized);

        let text = '';
        try {
          // Tableur (ex. DQE du cas pratique : créneaux horaires, profils attendus) : lu ligne par ligne.
          text = ext === '.xlsx' ? lireTableur(fullPath) : await extractText(fullPath, { texteBrutSiIllisible: true });
        } catch (e: any) {
          console.warn(`[MemoireGenerator] Impossible de lire: ${entry.name} — ${e.message}`);
          continue;
        }
        // Pour un .docx, le texte plat APLATIT les tableaux (en-têtes et valeurs sur des lignes
        // séparées → colonnes désalignées) : impossible de mapper « Campus Pasteur » à sa valeur.
        // On ajoute donc un rendu des tableaux ÉTIQUETÉ par en-tête de colonne :
        //   « <libellé de ligne> — <en-tête colonne>: <valeur> ; <en-tête colonne>: <valeur> … »
        // → chaque cellule devient retrouvable par (ligne, colonne), ce qui fiabilise le remplissage
        // des tableaux du cadre (effectifs/horaires par site, etc.) sans inventer.
        if (ext === '.docx') {
          try {
            const structTables = loadDocxStructure(fullPath).tables;
            // Vue PAR COLONNE (par site) → pour n'injecter que la colonne du site d'une cellule donnée.
            for (const t of structTables) {
              for (const col of renderTableByColumn(t.rows)) {
                if (this.lastDceSiteCols.length < 60) this.lastDceSiteCols.push(col);
              }
            }
            const tbls = structTables.map((t) => renderTablePaired(t.rows)).filter(Boolean);
            if (tbls.length) {
              const block = tbls.join('\n\n');
              text += '\n\n=== TABLEAUX (cellules étiquetées par en-tête de colonne) ===\n' + block;
              // Capture séparée (budgétée) pour réinjection directe dans les cellules de tableau.
              if (this.lastDceTables.length < 12_000) {
                this.lastDceTables += `\n--- ${entry.name.replace(/\.(docx?)$/i, '')} ---\n${block}\n`;
              }
            }
          } catch { /* table non exploitable → on garde le texte plat */ }
        }

        // PDF scanné dont la transcription a échoué (T10-COH-4) : nommé à GSS dans les alertes.
        if (ext === '.pdf' && pdfsIllisibles.has(fullPath) && !this.piecesIllisibles.includes(entry.name)) this.piecesIllisibles.push(entry.name);
        if (ext === '.pdf' && pdfsPartiels.has(fullPath) && !this.piecesPartielles.some((x) => x.nom === entry.name)) this.piecesPartielles.push({ nom: entry.name, pages: pdfsPartiels.get(fullPath)! });
        if (text.length > 100) {
          // Cahier des charges reconnu par son contenu quand son nom ne le dit pas (T3G-2) : priorité du CCTP.
          const prio = priorityOf(normalized) < 100 && estCahierDesChargesParContenu(entry.name, text) ? (/annexe/.test(normalized) ? 95 : 100) : priorityOf(normalized);
          pieces.push({ label: entry.name.replace(/\.(doc|docx|pdf|xlsx)$/i, ''), text, priority: prio });
          console.log(`[MemoireGenerator] DCE chargé: ${entry.name} (${text.length} chars, prio ${prio})`);
        }
      }
    };
    for (const dceDir of dceDirs) await scanDir(dceDir);

    if (pieces.length === 0) {
      cleanupTmp();
      throw new Error('[MemoireGenerator] Aucun contenu DCE trouvé. Vérifiez que les fichiers du DCE sont bien présents.');
    }

    // 3. Assemblage par priorité décroissante, dans le budget total
    pieces.sort((a, b) => b.priority - a.priority);
    let context = '';
    let used = 0;
    for (const p of pieces) {
      if (used >= TOTAL_BUDGET) {
        console.log(`[MemoireGenerator] DCE budget atteint — fichier ignoré: ${p.label}`);
        if (estCahierDesCharges(p.label)) this.alertesDceTronque.push(`Le cahier des charges « ${p.label} » n'a pas pu être lu (dossier trop volumineux) : le mémoire n'en tient pas compte. Vérifiez avant la remise que ses exigences sont traitées.`);
        continue;
      }
      const remaining = TOTAL_BUDGET - used;
      // Ligatures typographiques de certains PDF (« notiﬁcation », « afﬁchage ») ramenées à leurs lettres, fins de ligne Windows
      // ramenées à « \n » : les lectures sans modèle (obligations, délais, pièces) lisent le même texte quelle que soit l'extraction.
      let body = p.text.replace(/\r\n?/g, '\n').replace(/\uFB00/g, 'ff').replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl').replace(/\uFB03/g, 'ffi').replace(/\uFB04/g, 'ffl').replace(/[\uFB05\uFB06]/g, 'st');
      const cap = Math.min(PER_FILE_CAP, remaining);
      if (body.length > cap) body = body.slice(0, cap) + `\n[… document tronqué (${p.text.length - cap} caractères omis) …]`;
      // Pièce du cahier des charges tronquée (T1-COH-3) : GSS est prévenu, rien ne se perd en silence.
      if (p.text.length > cap && estCahierDesCharges(p.label)) this.alertesDceTronque.push(`Le cahier des charges « ${p.label} » est trop long pour être lu en entier : seuls ses ${cap.toLocaleString('fr-FR')} premiers caractères sur ${p.text.length.toLocaleString('fr-FR')} ont été pris en compte. Vérifiez avant la remise que les exigences de la fin de cette pièce sont traitées dans le mémoire.`);
      const block = `\n\n--- ${p.label} ---\n${body}`;
      context += block;
      used += block.length;
    }

    console.log(`[MemoireGenerator] Contexte DCE assemblé: ${context.length} chars (budget ${TOTAL_BUDGET}), ${pieces.length} fichiers candidats`);
    cleanupTmp();
    return context;
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Appel OpenAI avec retry/backoff sur 429 (la limite TPM du compte oblige à espacer les requêtes).
   * Modèle, effort de raisonnement (selon l'usage : rédaction ou analyse) et cache : core/modeles_ia.ts ;
   * la température n'est envoyée qu'à un modèle sans raisonnement. prefixe : n° du message dont la fin
   * marque un préfixe stable, mis en cache (consigne système identique d'un appel à l'autre).
   * Renvoie le contenu texte, ou null si échec définitif.
   */
  private async callOpenAI(messages: any[], temperature: number, label: string, jsonMode: boolean, usage: UsageIA = 'redaction', prefixe?: number): Promise<string | null> {
    // Garde-fou : le mode JSON d'OpenAI EXIGE que le mot « json » figure dans les messages, sinon
    // l'appel renvoie 400. On l'ajoute si absent (évite les échecs silencieux → 0 résultat).
    if (jsonMode && !messages.some((m) => typeof m?.content === 'string' && /json/i.test(m.content))) {
      messages = [...messages, { role: 'system', content: 'Réponds uniquement par un objet JSON valide.' }];
    }
    // Crédit épuisé plus tôt dans la génération : aucun nouvel appel (la génération s'interrompt).
    this.verifierCredit();
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          ...reglagesIA(usage, { temperature }),
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          messages: prefixe === undefined ? messages : prefixeEnCache(messages, prefixe),
        });
        return completion.choices[0].message.content || '';
      } catch (e: any) {
        const status = e?.status || e?.code || '';
        const msg = (e?.message || String(e)).toString();
        // Crédit OpenAI épuisé (insufficient_quota, credit_balance_exhausted) : jamais réessayé ; la génération est
        // interrompue avec une erreur explicite (aucun mémoire dégradé remis sans avertissement).
        if (e instanceof CreditOpenAIEpuise) throw e;
        this.signalerCredit(e, label);
        // Coupure réseau passagère (pas de statut HTTP) : même traitement qu'une limite de débit.
        if ((status === 429 || !e?.status) && attempt < maxAttempts) {
          const wait = 15000 * attempt; // 15s, 30s, 45s, 60s
          console.warn(`[MemoireGenerator] ${label}: ${e?.status ? '429 (TPM)' : 'connexion interrompue'} — attente ${wait / 1000}s puis réessai (${attempt}/${maxAttempts - 1})`);
          await this.sleep(wait);
          continue;
        }
        console.error(`[MemoireGenerator] ${label}: appel API échoué (status=${status}): ${msg.slice(0, 240)}`);
        this.appelsEchoues.push(label);
        return null;
      }
    }
    this.appelsEchoues.push(label);
    return null;
  }

  // ─── Recherche sémantique (embeddings) : index Doc GSS + DCE, récupération par champ ───

  /**
   * Découpe la Documentation GSS (par catégorie) et le DCE (par pièce) en chunks indexables.
   * Le DCE est assemblé en blocs « \n\n--- label ---\n<corps> » (cf. getDceContext) : on le
   * redécoupe sur ces frontières pour étiqueter chaque chunk (CCTP, RC, annexe…).
   */
  /** Consigne à insérer dans les prompts quand l'utilisateur a formulé une demande particulière. */
  /**
   * Réponse libre : répartition de la demande particulière entre les rubriques, décidée UNE fois pour
   * tout le mémoire. Chaque point de fond n'est transmis qu'aux rubriques dont il est le sujet (sinon
   * chaque rubrique le jugeait « concerné » et le répétait) ; les consignes de forme valent partout.
   */
  private async repartirDemande(rubriques: Array<{ id: string; title: string }>): Promise<{ forme: string; parRubrique: Record<string, string[]> } | null> {
    const d = this.demandeParticuliere;
    if (!d?.demande) return null;
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu répartis une demande particulière entre les rubriques d'un mémoire technique GSS (sécurité privée).
- "forme" : les consignes de FORME (ton, structure, conclusion des parties, niveau de détail), reformulées fidèlement ; "" s'il n'y en a pas.
- "points" : chaque point de FOND (dispositif, engagement, chiffre, élément à mettre en avant ou à éviter), reformulé fidèlement avec toutes ses précisions, et la liste des rubriques où il doit figurer : UNIQUEMENT celles dont il est directement le sujet (1 à 3 rubriques, jamais plus de 4). Exemple : un dispositif cynophile → rubriques sur les moyens humains ou les rondes et les alarmes ; la réactivité de l'encadrement → encadrement, continuité de service ; un indicateur de satisfaction → suivi qualité.
Renvoie UNIQUEMENT un objet JSON : {"forme": "…", "points": [{"texte": "…", "rubriques": ["id", "…"]}]}`,
      },
      { role: 'user', content: `Demande : « ${d.demande} »

Rubriques :
${rubriques.map((x) => `- ${x.id} : ${x.title}`).join('\n')}` },
    ], 0.1, 'Répartition de la demande particulière', true);
    try {
      const data = JSON.parse(r || '{}');
      const ids = new Set(rubriques.map((x) => x.id));
      const parRubrique: Record<string, string[]> = {};
      for (const p of Array.isArray(data.points) ? data.points : []) {
        const texte = String(p?.texte || '').trim();
        if (!texte) continue;
        for (const id of (Array.isArray(p.rubriques) ? p.rubriques : []).filter((x: string) => ids.has(x)).slice(0, 4)) (parRubrique[id] ||= []).push(texte);
      }
      console.log(`[MemoireGenerator] Demande particulière répartie : ${Object.entries(parRubrique).map(([k, v]) => `${k}(${v.length})`).join(', ') || 'forme uniquement'}.`);
      return { forme: String(data.forme || '').trim(), parRubrique };
    } catch {
      return null;
    }
  }

  private blocDemande(repartition?: { forme: string; points: string[] }): string {
    const d = this.demandeParticuliere;
    if (!d) return '';
    if (repartition) {
      // Réponse libre : seuls la forme et les points de fond propres à CETTE rubrique sont transmis.
      let out = '\n\nDEMANDE PARTICULIÈRE DE L\'UTILISATEUR POUR CE MÉMOIRE (prioritaire) :';
      if (repartition.forme) out += `\n- Forme, à appliquer dans cette partie : ${repartition.forme}`;
      if (repartition.points.length) {
        out += `\n- Points à faire figurer dans CETTE partie, rédigés naturellement comme des faits de l'offre GSS (jamais « GSS met en avant », jamais une formule qui recopie la consigne) :\n${repartition.points.map((p) => `  • ${p}`).join('\n')}`;
      }
      out += `\nChaque point listé ci-dessus DOIT figurer dans cette partie. S'il lui manque une donnée (une valeur, un chiffre), présente le point sans l'inventer et insère sur sa propre ligne [CONSULTATION REQUISE : <donnée précise à obtenir de GSS>]. Les autres points de la demande sont traités dans d'autres parties : n'en parle pas ici.`;
      if (d.documentTexte) out += `\nL'utilisateur a aussi fourni un DOCUMENT COMPLÉMENTAIRE « ${d.documentNom || 'document'} » : ses passages pertinents figurent dans les extraits ; ce sont des informations valables.`;
      return out;
    }
    let out = '\n\nDEMANDE PARTICULIÈRE DE L\'UTILISATEUR POUR CE MÉMOIRE (prioritaire) :';
    if (d.demande) out += `\n« ${d.demande} »\nApplique-la ainsi :\n- Consignes de FORME (ton, structure, conclusion de chaque partie, niveau de détail) : partout.\n- Points de FOND à mettre en avant (un dispositif, un engagement, un chiffre) : UNIQUEMENT dans la partie dont c'est directement le sujet (ex. un dispositif cynophile → dispositif, rondes, gestion des alarmes ; la réactivité de l'encadrement → encadrement, continuité de service). Ailleurs n'en parle pas : ne répète jamais le même point de rubrique en rubrique.\n- Intègre-les comme des faits de l'offre GSS, rédigés naturellement : n'écris jamais « GSS met en avant », « pour ce marché, GSS souhaite souligner » ni aucune formule qui recopie la consigne.\nLes informations qu'elle donne sont des données valables. Elle ne t'autorise jamais à inventer une donnée absente des sources : une donnée non fournie reste [À COMPLÉTER].`;
    if (d.documentTexte) out += `\nL'utilisateur a aussi fourni un DOCUMENT COMPLÉMENTAIRE « ${d.documentNom || 'document'} » : ses passages pertinents figurent dans les extraits (étiquette « Document complémentaire ») ; ce sont des informations valables à exploiter en priorité quand elles concernent le sujet.`;
    return out;
  }

  /** Passages du document complémentaire (même découpage que les autres sources). */
  private chunksDocumentComplementaire(): RetrievalChunk[] {
    const d = this.demandeParticuliere;
    if (!d?.documentTexte) return [];
    const label = `Document complémentaire — ${d.documentNom || 'document'}`;
    const out: RetrievalChunk[] = [];
    const clean = d.documentTexte.replace(/\r\n/g, '\n');
    for (let i = 0; i < clean.length; i += 1050) {
      const slice = clean.slice(i, i + 1200);
      if (slice.trim().length >= 80) out.push({ source: 'GSS', label, text: slice });
    }
    return out;
  }

  /**
   * Mémoire type (réponse libre v2, format court) : la demande particulière pour UNE rubrique, partie ou proposition,
   * comme en v1 : points de fond répartis sur elle, consignes de forme (partout) et passages du document complémentaire
   * proches de son sujet (cosinus ≥ 0,3, 3 au plus). Le document est indexé une seule fois et compte même sans texte
   * de demande. « consigne » : undefined si la demande ne concerne pas la rubrique ; « passages » : document seul.
   */
  private demandeMemoireType(repartition: { forme: string; parRubrique: Record<string, string[]> } | null): {
    consigne: (id: string | undefined, sujet: string) => Promise<string | undefined>;
    passages: (sujet: string) => Promise<string>;
  } {
    const d = this.demandeParticuliere;
    const chunks = this.chunksDocumentComplementaire();
    let index: Promise<void> | null = null;
    const passages = async (sujet: string): Promise<string> => {
      if (!chunks.length) return '';
      index ||= this.embedChunks(chunks).catch((e: any) => { console.warn(`[MemoireGenerator] Document complémentaire non indexé : ${e?.message || e}`); });
      await index;
      try {
        const [emb] = await this.embedTexts([sujet.slice(0, 1000)]);
        const choisis = chunks.filter((c) => c.embedding).map((c) => ({ c, s: cosine(emb, c.embedding!) })).filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.c.text.trim());
        return choisis.length ? `Document complémentaire « ${d?.documentNom || 'document'} » fourni par GSS (informations valables, à exploiter quand elles concernent le sujet) :\n${choisis.join('\n---\n')}` : '';
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Document complémentaire : recherche indisponible (${e?.message || e}).`);
        return '';
      }
    };
    const consigne = async (id: string | undefined, sujet: string): Promise<string | undefined> => {
      const parties: string[] = [];
      const points = id ? repartition?.parRubrique[id] || [] : [];
      if (points.length) parties.push(`Points à faire figurer ici, rédigés comme des faits de l'offre GSS : ${points.join(' ; ')}`);
      if (repartition?.forme) parties.push(`Forme, à appliquer ici : ${repartition.forme}`);
      const doc = await passages(sujet);
      if (doc) parties.push(doc);
      return parties.length ? parties.join('\n') : undefined;
    };
    return { consigne, passages };
  }

  /** Texte de la demande particulière pour les garde-fous : ce qu'elle apporte est une donnée sourcée. */
  private texteDemande(): string {
    const d = this.demandeParticuliere;
    return d ? ` ${d.demande || ''} ${d.documentTexte || ''} ` : '';
  }

  private buildRetrievalChunks(gssDocs: Record<string, string>, dceContext: string): RetrievalChunk[] {
    const chunks: RetrievalChunk[] = [];
    const CHUNK = 1200, STEP = 1050;   // ~300 tokens/chunk, léger chevauchement
    const pushChunks = (source: 'GSS' | 'DCE', label: string, text: string) => {
      const clean = (text || '').replace(/\r\n/g, '\n');
      for (let i = 0; i < clean.length; i += STEP) {
        const slice = clean.slice(i, i + CHUNK);
        if (slice.trim().length < 80) continue;
        chunks.push({ source, label, text: slice });
      }
    };
    for (const [cat, text] of Object.entries(gssDocs)) pushChunks('GSS', cat, text);
    const re = /\n\n--- (.+?) ---\n/g;
    let m: RegExpExecArray | null, lastIdx = 0, lastLabel = 'DCE';
    while ((m = re.exec(dceContext)) !== null) {
      if (m.index > lastIdx) pushChunks('DCE', lastLabel, dceContext.slice(lastIdx, m.index));
      lastLabel = m[1]; lastIdx = re.lastIndex;
    }
    pushChunks('DCE', lastLabel, dceContext.slice(lastIdx));
    return chunks;
  }

  /** Embeddings OpenAI par lots (retry/backoff sur 429). Renvoie un vecteur par texte d'entrée. */
  private async embedTexts(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    const BATCH = 96;
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH).map(t => (t && t.trim() ? t.slice(0, 8000) : ' '));
      for (let attempt = 1; ; attempt++) {
        try {
          const resp = await this.openai.embeddings.create({ model: EMBED_MODEL, input: batch });
          for (const d of resp.data) out.push(d.embedding as number[]);
          break;
        } catch (e: any) {
          this.signalerCredit(e, 'Embeddings');
          const status = e?.status || e?.code || '';
          if (status === 429 && attempt < 5) {
            const wait = 10000 * attempt;
            console.warn(`[MemoireGenerator] Embeddings: 429 (TPM) — attente ${wait / 1000}s puis réessai (${attempt}/4)`);
            await this.sleep(wait);
            continue;
          }
          throw e;
        }
      }
    }
    return out;
  }

  /** Calcule et stocke l'embedding de chaque chunk de l'index. */
  private async embedChunks(chunks: RetrievalChunk[]): Promise<void> {
    const embs = await this.embedTexts(chunks.map(c => c.text));
    chunks.forEach((c, i) => { c.embedding = embs[i]; });
  }

  /**
   * Charge les chunks Doc GSS DÉJÀ EMBEDDÉS depuis la table public.rag_chunk (Supabase),
   * au lieu de relire les 118 PDF et de rappeler OpenAI à chaque génération.
   *
   * → PERFORMANCE : les ~146 embeddings GSS ne sont plus recalculés (ni le risque de 429).
   * → PERTINENCE : identique — mêmes textes, mêmes vecteurs (text-embedding-3-small, 1536 dim) ;
   *   la recherche hybride retrieve() reste inchangée en aval.
   *
   * Activation : MEMOIRE_RAG_FROM_DB=true. Source : RAG_DATABASE_URL (sinon DATABASE_URL).
   * Robustesse : toute erreur (flag off, table vide, base injoignable) renvoie null → l'appelant
   * retombe sur le comportement historique (embeddings à la volée). Jamais bloquant.
   */
  private async loadGssChunksFromDb(): Promise<RetrievalChunk[] | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    try {
      await client.connect();
      const res = await client.query(
        `select source, categorie, text, embedding::text as embedding
           from public.rag_chunk
          where source in ('GSS', 'WEB', 'SOLLICITATION') and actif and embedding is not null`
      );
      const chunks: RetrievalChunk[] = [];
      for (const r of res.rows) {
        // pgvector renvoyé en texte '[0.1,0.2,…]' → tableau de nombres (JSON valide).
        let emb: number[] | undefined;
        try { emb = JSON.parse(r.embedding); } catch { emb = undefined; }
        if (!emb || !emb.length) continue;
        const isRagSrc = r.source === 'WEB' || r.source === 'SOLLICITATION';
        const label = isRagSrc ? 'RECHERCHES ET SOLLICITATIONS (RAG)' : (r.categorie || 'GSS');
        chunks.push({ source: r.source || 'GSS', label, text: r.text, embedding: emb });
      }
      return chunks.length ? chunks : null;
    } catch (e: any) {
      console.warn(`[MemoireGenerator] RAG depuis bdd indisponible (${e?.message || e}) — repli sur embeddings à la volée.`);
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /**
   * Client Postgres vers la base RAG, ou null si le mode bdd est désactivé / non configuré.
   * Source : MEMOIRE_RAG_FROM_DB=true + RAG_DATABASE_URL (sinon DATABASE_URL). SSL auto pour Supabase.
   */
  private ragDbClient(): PgClient | null {
    if (process.env.MEMOIRE_RAG_FROM_DB !== 'true') return null;
    const raw = process.env.RAG_DATABASE_URL || getSettings().databaseUrl || '';
    const url = raw.replace(/^postgresql\+psycopg:\/\//, 'postgresql://');
    if (!url) return null;
    const needsSsl = /supabase\.(co|com)/.test(url) || process.env.RAG_DB_SSL === 'true';
    return new PgClient({ connectionString: url, ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}) });
  }

  /**
   * Reconstitue la Documentation GSS (texte complet par catégorie) DEPUIS la bdd rag_chunk, au lieu
   * de relire les PDF du dossier Template. Concatène les chunks par catégorie, dans l'ordre du fichier.
   * Renvoie null si mode bdd off / base vide / injoignable → l'appelant relit alors les fichiers.
   */
  private async getGssDocsTextFromDb(): Promise<Record<string, string> | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    const PER_CAT_CAP = 15_000;   // même plafond que la lecture fichier
    try {
      await client.connect();
      const res = await client.query(
        `select source, categorie, source_file, text
           from public.rag_chunk
          where source in ('GSS', 'WEB', 'SOLLICITATION') and actif
          order by categorie, source_file, chunk_index`
      );
      const cats: Record<string, string> = {};
      let lastKey = '';
      for (const r of res.rows) {
        // Regrouper WEB et SOLLICITATION dans une catégorie prioritaire bien identifiée
        const isRagSrc = r.source === 'WEB' || r.source === 'SOLLICITATION';
        const cat = isRagSrc ? 'RECHERCHES ET SOLLICITATIONS (RAG)' : (r.categorie || 'GSS');
        const key = `${cat}|${r.source_file}`;
        if (!cats[cat]) cats[cat] = '';
        if (key !== lastKey) { cats[cat] += `\n--- ${r.source_file} ---\n`; lastKey = key; }
        cats[cat] += r.text + '\n';
      }
      // On enrichit avec TOUTES les recherches web (même en attente) et questions internes en base,
      // pour que l'analyse IA comparant au template ou CCTP voie bien toutes les infos disponibles en BDD.
      try {
        const webRes = await client.query(
          `select query, answer, valeur_retenue, statut
             from public.recherche_web
            where statut in ('validee', 'injectee', 'en_attente_validation') and (answer is not null or valeur_retenue is not null)`
        );
        if (webRes.rows.length > 0) {
          cats['RECHERCHES WEB BDD'] = webRes.rows.map(r => `--- Recherche Web : ${r.query} ---\nQuestion : ${r.query}\nRéponse BDD (${r.statut}) : ${r.valeur_retenue || r.answer}`).join('\n\n');
        }
        const qRes = await client.query(
          `select question, reponse_contenu
             from public.question_interne
            where reponse_contenu is not null and reponse_contenu != ''`
        );
        if (qRes.rows.length > 0) {
          cats['QUESTIONS INTERNES BDD'] = qRes.rows.map(r => `--- Question Équipe : ${r.question} ---\nQuestion : ${r.question}\nRéponse Équipe : ${r.reponse_contenu}`).join('\n\n');
        }
      } catch (eWeb: any) {
        console.warn(`[MemoireGenerator] Lecture recherche_web/question_interne depuis BDD ignorée : ${eWeb?.message || eWeb}`);
      }
      for (const k of Object.keys(cats)) {
        if (cats[k].length > PER_CAT_CAP) cats[k] = cats[k].slice(0, PER_CAT_CAP) + '\n[… tronqué …]';
      }
      return Object.keys(cats).length ? cats : null;
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Doc GSS depuis bdd indisponible (${e?.message || e}) — repli sur les fichiers.`);
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /** Texte de « EFFECTIFS MOYENS.pdf » depuis la bdd (pour le calcul d'effectif), ou null. */
  private async getEffectifTextFromDb(): Promise<string | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    try {
      await client.connect();
      const res = await client.query(
        `select text from public.rag_chunk
          where source = 'GSS' and actif and source_file ilike 'EFFECTIFS MOYENS%'
          order by chunk_index`
      );
      if (!res.rows.length) return null;
      return res.rows.map((r) => r.text).join('\n');
    } catch {
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /**
   * Top-K chunks pour une requête, en récupération HYBRIDE : similarité cosinus (sémantique) +
   * bonus LEXICAL sur les termes exacts de la question. L'embedding seul rate parfois la donnée
   * factuelle précise (un effectif, un nom de certification, une catégorie) qui vit dans un PDF
   * donné → le bonus lexical fait remonter les chunks contenant littéralement les mots de la
   * question, ce qui améliore le RAPPEL (remplir quand l'info existe) sans rien inventer (on ne
   * fait que mieux SURFACER les sources réelles ; la vérification anti-invention reste en aval).
   */
  private retrieve(queryEmb: number[], chunks: RetrievalChunk[], k: number, queryText = ''): RetrievalChunk[] {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const STOP = new Set(['pour', 'dans', 'avec', 'cette', 'votre', 'notre', 'leur', 'des', 'les', 'une', 'aux', 'sur', 'par', 'que', 'qui', 'sont', 'est', 'marche', 'entreprise', 'candidat', 'section', 'question']);
    const terms = Array.from(new Set(norm(queryText).split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOP.has(t))));
    const lexical = (text: string): number => {
      if (!terms.length) return 0;
      const t = norm(text);
      let hit = 0;
      for (const w of terms) if (t.includes(w)) hit++;
      return hit / terms.length;   // fraction des termes de la question présents littéralement
    };
    return chunks
      .filter(c => c.embedding && c.embedding.length > 0)
      .map(c => ({ c, score: cosine(queryEmb, c.embedding!) + 0.15 * lexical(c.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => x.c);
  }

  /**
   * Requête de recherche d'un champ. La QUESTION propre du champ est le signal PRINCIPAL : on
   * l'accentue (doublée) et on ÉCARTE le « Contexte proche » (= libellés des champs VOISINS), qui
   * faisait dériver la recherche/réponse vers un sujet adjacent (ex. moyens d'accès au lieu du
   * report des alarmes). À défaut de question (cellule de tableau), on prend l'intitulé Tableau.
   */
  private buildFieldQuery(f: { context: string }): string {
    const grab = (re: RegExp) => (f.context.match(re) || [])[1] || '';
    const question = grab(/Question:\s*"([^"]*)"/);
    const section = grab(/Section:\s*"([^"]*)"/);
    // Cellule de tableau : on combine la LIGNE (ce qui est demandé : délai, nb d'agents, horaire…)
    // ET la COLONNE (à quel site / département / lot), pour chercher l'info propre à CETTE intersection.
    const colonne = grab(/Colonne:\s*"([^"]*)"/);
    const ligne = grab(/Ligne:\s*"([^"]*)"/);
    const tableCore = (ligne || colonne) ? `${ligne} ${colonne}`.trim() : '';
    // Case à cocher : on cherche sur l'OPTION propre à la case + l'intitulé commun.
    const cbOption = grab(/option:\s*"([^"]*)"/);
    const cbIntitule = grab(/Intitul[ée]:\s*"([^"]*)"/);
    const cbCore = [cbOption, cbIntitule].filter(Boolean).join(' ').trim();
    // Zone « …… » sans question propre (« : ») : on prend le LIBELLÉ qui la PRÉCÈDE (dernier segment
    // du « Contexte proche »), pour comprendre/rechercher sur ce qui est réellement demandé juste avant.
    const near = grab(/Contexte(?: proche)?:\s*"([^"]*)"/);
    const nearLast = near.split('/').map(s => s.trim()).filter(Boolean).pop() || '';
    const qReal = question.replace(/[\s.:;,…\-—–/|()]+/g, '').length ? question : '';
    const core = (qReal || tableCore || cbCore || nearLast).replace(/\[CHAMP_\d+\]/g, '').trim();
    const base = core
      ? `${core} ${core} ${section}`
      : f.context.replace(/\[CHAMP_\d+\]/g, '').replace(/Contexte(?: proche)?:[^|]*/gi, ' ');
    return base.replace(/["|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Phase d'ANALYSE structurée (inspirée de l'app de référence gss-app, personas Sacha / Mme Vaché).
   * À partir du DCE (CCTP, RC, rapport de visite terrain, annexes), produit un JSON `analysisData`
   * compact et exploitable, qui sert ensuite de contexte unique au remplissage (au lieu du DCE brut).
   * En plus des faits, le modèle propose des arguments différenciants et des problématiques
   * anticipées — ce qui fait gagner un appel d'offres.
   */
  /**
   * Le DCE demande au candidat de formuler ses remarques / observations / réserves sur le cahier des
   * charges (ex. Centre Henri Becquerel §4.6) : GSS y répond par une liste factuelle des ambiguïtés et
   * contradictions relevées, avec l'article concerné. Renvoie '' si le DCE ne le demande pas.
   */
  private async remarquesCahierDesCharges(dceContext: string): Promise<string> {
    // Demande liée à l'offre ou au cahier des charges — jamais les « observations » d'une procédure de sanction.
    const demande = [...dceContext.matchAll(/(?:faire|formuler|émettre|emettre|présenter|presenter|indiquer)\s+(?:ses|des|toutes|les)\s+(?:éventuelles\s+)?(?:remarques|observations|réserves)|remarques?\s+(?:éventuelles\s+)?(?:sur|concernant|relatives?\s+au)\s+(?:le\s+|du\s+)?(?:cctp|cahier|dce)/gi)]
      .some((m) => {
        const autour = dceContext.slice(Math.max(0, (m.index || 0) - 150), (m.index || 0) + m[0].length + 120);
        return /offre|cahier|cctp|dce|prestations/i.test(autour) && !/mise en demeure|p[ée]nalit|r[ée]siliation|sanction/i.test(autour);
      });
    if (!demande) return '';
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Le DCE demande au candidat de formuler ses remarques sur le cahier des charges. En tant que GSS (sécurité privée), relève dans le DCE UNIQUEMENT les ambiguïtés, contradictions ou points à clarifier RÉELS (ex. qualification exigée différente selon deux articles, mission demandée sans poste pour l'assurer à certaines heures, pièce à fournir non accessible à un employeur privé), chacun avec l'article concerné et la clarification proposée, sur un ton constructif. 2 à 6 puces, factuelles, sans rien inventer ; liste vide s'il n'y en a pas.
Renvoie UNIQUEMENT un objet JSON : {"remarques": ["…"]}`,
      },
      { role: 'user', content: dceContext.slice(0, 110_000) },
    ], 0.1, 'Remarques sur le cahier des charges', true);
    try {
      const l = (JSON.parse(r || '{}').remarques || []).map((x: any) => String(x).trim()).filter(Boolean);
      return l.length ? `## Remarques sur le cahier des charges\n\n${l.map((x: string) => `- ${x.replace(/^[-•]\s*/, '')}`).join('\n')}` : '';
    } catch { return ''; }
  }

  /**
   * Périmètre RÉEL des prestations d'après le CCTP (postes fixes ou non, rondes, télésurveillance,
   * interventions, événementiel, horaires). Injecté dans la rédaction : sans lui, les rubriques d'un marché
   * de rondes ou de télésurveillance se remplissaient de contenus de gardiennage à poste fixe tirés des
   * anciens mémoires (responsable de site sur place, contrôle d'accès 7 h-19 h, tenue, vacations de nuit…).
   */
  private async perimetreMarche(dceContext: string): Promise<string> {
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu lis le DCE d'un marché de sécurité privée (CCTP en priorité) et tu décris en quelques lignes le PÉRIMÈTRE RÉEL des prestations, sans rien ajouter :
- postes fixes : oui / non ; si oui, le DISPOSITIF POSTE PAR POSTE : pour chaque poste, horaires et jours, qualification, missions (qui fait les rondes, les levées de doute, l'accueil, le standard, et à quelles heures), ce que le CCTP interdit ou impose à ce poste (ex. « ne quitte pas le PC », « attend la relève ») ; signale une mission demandée sans poste pour l'assurer à certaines heures ;
- rondes, télésurveillance, interventions sur alarme, levée de doute, prestations ponctuelles sur bon de commande, événementiel : oui / non et en quoi elles consistent ;
- sites et lots concernés ;
- ce qui est HORS périmètre et ne doit pas être décrit (ex. aucun poste fixe, aucun contrôle d'accès permanent, pas de SSIAP).
Renvoie UNIQUEMENT un objet JSON : {"perimetre": "texte de 5 à 15 lignes"}`,
      },
      { role: 'user', content: dceContext.slice(0, 110_000) },
    ], 0.1, 'Périmètre du marché', true);
    try { return String(JSON.parse(r || '{}').perimetre || '').trim(); } catch { return ''; }
  }

  /** Bloc de consigne associé au périmètre réel (vide si le périmètre n'a pas pu être établi). */
  private blocPerimetre(perimetre: string): string {
    return perimetre
      ? `\n\nPÉRIMÈTRE RÉEL DU MARCHÉ (d'après le CCTP) :\n${perimetre}\nNe décris QUE ces prestations : n'introduis aucun poste fixe, horaire de présence, responsable de site sur place, tenue, contrôle d'accès, vacation, équipement ou effectif que le CCTP ne prévoit pas (même s'ils figurent dans les mémoires GSS). Une rubrique dont le sujet sort du périmètre reste brève et ramène au périmètre réel. N'écris jamais ce qui est hors périmètre (« sans poste fixe… », « aucun poste n'est créé ») : décris seulement ce que GSS fait. Le dispositif décrit reprend EXACTEMENT ces postes (mêmes horaires, mêmes missions) : aucun rondier, chef de site, contrôleur sur place ou poste supplémentaire inventé ; une mission que le CCTP laisse sans poste à certaines heures donne lieu à [CONSULTATION REQUISE : …], jamais à une affectation inventée.`
      : '';
  }

  private async analyzeDce(dceContext: string): Promise<any> {
    const systemPrompt = `Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS (Global Security Service, ex-GIS).
Ton process s'appuie sur deux rôles : Sacha (amont : analyse du DCE, vérification de l'obligation de visite, comptes-rendus de visite terrain — 60% contiennent des contraintes du terrain absentes du CCTP) et Mme Vaché (rédaction du mémoire technique avec une personnalisation forte : anticiper des problématiques opérationnelles non formulées par l'acheteur).

Ta mission : analyser le CCTP, le RC, le rapport de visite terrain et les annexes pour en extraire, de façon structurée et exhaustive :
1. Le donneur d'ordre, la durée du marché, les sites concernés.
2. Le TYPE DE MARCHÉ : "public" (collectivité, université, hôpital, établissement public, CCAG, code de la commande publique) ou "privé" (entreprise, SAS, SARL, contrat de prestations) — IMPORTANT pour adapter le ton et les obligations légales.
3. Le SECTEUR D'ACTIVITÉ du client (éducation, santé, industrie, distribution, événementiel, tertiaire, collectivité territoriale, etc.).
4. Les besoins en agents (effectifs en ETP, profils : CQP APS, SSIAP 1/2/3, encadrement) et le taux de reprise du personnel en place (annexes).
5. Les contraintes matérielles (contrôle de rondes, pointeaux, PTI/DATI, tenues, véhicules).
6. L'obligation de visite (RC) croisée avec le rapport de visite.
7. Des "Arguments Différenciants" (forces de GSS) et des "Problématiques Anticipées" (risques techniques/humains non formulés par l'acheteur + la solution GSS associée).
8. Des "Recommandations stratégiques GSS" : pour chaque grand thème du mémoire (présentation, moyens humains, moyens opérationnels, moyens organisationnels), propose 2 à 3 arguments SPÉCIFIQUES à ce client que GSS devrait mettre en avant, en tenant compte du cadre public/privé.

Tu renvoies un objet JSON valide et exhaustif.`;

    const userPrompt = `Voici les documents du DCE (CCTP, RC, rapport de visite, annexes) :
${dceContext.slice(0, 120_000)}

Génère une réponse JSON valide respectant EXACTEMENT cette structure :
{
  "clientName": "Nom exact du donneur d'ordre, raison sociale complète telle qu'elle figure dans le DCE",
  "projectTitle": "Intitulé complet du marché",
  "marketRef": "Référence du marché (ex: MP n°AAAA-NN)",
  "marketType": "public ou privé — déterminé d'après le DCE (CCAG, commande publique, collectivité → public ; SAS/SARL, contrat privé → privé)",
  "clientSector": "Secteur d'activité du client (éducation, santé, industrie, distribution, événementiel, tertiaire, collectivité, résidentiel…)",
  "duration": "Durée exacte (ex: 1 an renouvelable 3 fois)",
  "lots": [ { "num": "1", "perimetre": "..." } ],
  "visitMandatory": true,
  "visitDetails": "Observations clés du terrain (rapport de visite). Vide si absent.",
  "sites": [ { "name": "Nom exact du site/campus", "requirements": "Effectifs ETP et qualifications" } ],
  "operationalSummary": {
    "agentProfiles": "Profils requis, taux de reprise du personnel, encadrement",
    "uniforms": "Tenues/équipements spécifiques",
    "equipment": "Rondes, pointeaux par site, PTI, véhicules",
    "qualityControls": "Contrôles inopinés, réunions de suivi, extranet"
  },
  "telesurveillance": "Télésurveillance/levée de doute (le cas échéant) : délais d'intervention max par site, nb d'intervenants, certifications APSAD demandées (vide si non concerné)",
  "legalRequirements": "Exigences d'autorisation (CNAPS, agréments dirigeants, agrément établissement local)",
  "keyRisks": [ "Risque/contrainte opérationnelle identifié" ],
  "proposalStrengths": [ "Argument différenciant technique de GSS pour ce marché" ],
  "anticipatedIssues": [ "Problématique non formulée par l'acheteur + solution concrète GSS" ],
  "gssStrategicRecommendations": {
    "presentation": "2-3 arguments spécifiques pour la présentation de GSS adaptés à CE client et CE cadre (public/privé)",
    "moyensHumains": "2-3 arguments spécifiques sur les moyens humains adaptés aux besoins du client",
    "moyensOperationnels": "2-3 arguments spécifiques sur les moyens opérationnels adaptés au secteur/sites",
    "moyensOrganisationnels": "2-3 arguments spécifiques sur l'organisation adaptés au cadre contractuel (public/privé)"
  }
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Analyse DCE', true, 'analyse',
    );
    try {
      const data = viderValeursNonRenseignees(JSON.parse(content || '{}'));
      // Rédaction indisponible ou réponse sans acheteur ni objet (T6N-2, mode dégradé) : lus sans modèle dans le DCE.
      if (!content) data.lectureSansModele = true;
      if (!data.clientName) data.clientName = acheteurDuDce(dceContext) || undefined;
      if (!data.projectTitle) data.projectTitle = objetDuDce(dceContext) || undefined;
      // Post-traitement : enrichir / valider les champs stratégiques via détection locale
      // (le modèle peut se tromper sur public/privé ; la détection par mots-clés est plus fiable)
      const detectedType = detectMarketType(data);
      const detectedSector = detectClientSector(data);
      data.marketType = data.marketType || detectedType;
      data.clientSector = data.clientSector || detectedSector;
      data.regulatoryFramework = buildRegulatoryFramework(
        data.marketType === 'privé' || data.marketType === 'prive' ? 'prive' : 'public',
        data.clientSector,
        data,
      );
      console.log(`[MemoireGenerator] Analyse DCE: client="${data.clientName || '?'}", type=${data.marketType}, secteur="${data.clientSector}", ${(data.sites || []).length} site(s), ${(data.anticipatedIssues || []).length} problématique(s) anticipée(s), cadre réglementaire: ${(data.regulatoryFramework || '').slice(0, 80)}…`);
      return data;
    } catch (e) {
      console.error('[MemoireGenerator] Analyse DCE: parse JSON échoué, repli sur extrait brut.');
      // Acheteur et objet lus sans modèle (T6N-2).
      return { rawExcerpt: dceContext.slice(0, 20_000), clientName: acheteurDuDce(dceContext) || undefined, projectTitle: objetDuDce(dceContext) || undefined, lectureSansModele: true };
    }
  }

  /**
   * Liste des informations à obtenir, SANS DOUBLONS : chaque rubrique et la matrice CCTP signalent
   * leurs manques indépendamment, si bien qu'un même sujet (certification, habilitation, reprise du
   * personnel…) revenait 4 à 6 fois sous des formulations différentes. On fusionne en une question
   * par sujet, en gardant toutes les précisions ; aucun sujet n'est ajouté ni retiré. Repli : simple
   * dédoublonnage exact si l'appel échoue.
   */
  private async consoliderConsultations(liste: string[], contexte?: { dce: string; horsNormandie: boolean }): Promise<string[]> {
    return (await this.consoliderAvecSources(liste, contexte)).map((q) => q.question);
  }

  /**
   * Comme consoliderConsultations, en indiquant pour chaque question les demandes d'origine (indices de `liste`). Avec le
   * contexte du marché, une question sur un délai chiffré absent du DCE est retirée hors Normandie, ou quand elle ne fait
   * que confirmer un délai déjà tranché au registre (cstb 221 : « … un délai maximal de 60 minutes… » pour Grenoble).
   */
  private async consoliderAvecSources(liste: string[], contexte?: { dce: string; horsNormandie: boolean }): Promise<Array<{ question: string; sources: number[] }>> {
    const brutes = await this.consoliderAvecSourcesBrut(liste);
    if (!contexte) return brutes;
    // Ligne déjà formulée sans modèle (proposition de dimensionnement : « 96 h par semaine », « 1 607 heures par an »,
    // T9N-2) : jamais retirée par ce filtre, qui ne vise que les questions de délai rédigées par le modèle.
    const gardees = brutes.filter((q) => LIGNE_DETERMINISTE.test(q.question) || (!questionDelaiInapplicable(q.question, contexte.dce, contexte.horsNormandie) && !questionSurFrequenceDuDce(q.question, contexte.dce)));
    if (gardees.length < brutes.length) console.log(`[MemoireGenerator] Consultations : ${brutes.length - gardees.length} question(s) sur un délai chiffré absent du DCE retirée(s) (${contexte.horsNormandie ? 'marché hors Normandie' : 'délai déjà au registre'}).`);
    return gardees;
  }

  private async consoliderAvecSourcesBrut(liste: string[]): Promise<Array<{ question: string; sources: number[] }>> {
    // Données CNAPS déjà connues du registre (numéros AUT et AGD, date d'obtention de l'autorisation) : jamais redemandées,
    // même dans une question fusionnée (havre2 341, T3C-8).
    // Donnée de GSS (référence, chiffre d'affaires, effectif) : posée à GSS, jamais « À demander à l'acheteur » (vitry 351).
    // Question restante sur les dates CNAPS de l'entreprise ou du dirigeant (« Pouvez-vous fournir les dates de fin de validité
    // de l'autorisation d'exercer ? », havre2 1352, T4N-3) : la question unique de questions_gss_une_fois, une seule carte.
    const qCnaps = questionDatesCnaps();
    const versUnique = (q: string) => (qCnaps && /(?:fin de validit|expiration|date)/i.test(q) && /autorisation d.exercer|agr[ée]ment (?:du |de l[ae] )?(?:dirigeant|entreprise)|cnaps/i.test(q) && !/\bagents?\b|cartes? professionnelles?/i.test(q) ? qCnaps : q);
    const connues = (l: Array<{ question: string; sources: number[] }>) => {
      const out: Array<{ question: string; sources: number[] }> = [];
      for (const q of l) {
        const question = questionDonneeGss(versUnique(sansDonneesCnapsConnues(q.question) || ''));
        if (!question) continue;
        const deja = out.find((x) => x.question === question);
        if (deja) deja.sources = [...new Set([...deja.sources, ...q.sources])]; else out.push({ ...q, question });
      }
      return out;
    };
    // Question rédigée par le modèle qui redemande une donnée déjà posée par une ligne formulée sans modèle (couverture du cas
    // pratique, délais…) : retirée, la ligne déterministe reste (T5CP-11, etampes2 553).
    const l = connues(await this.consoliderAvecSourcesFusion(liste));
    const couvertes = new Set(l.filter((q) => LIGNE_DETERMINISTE.test(q.question)).flatMap((q) => cleDonnee(q.question)));
    return l.filter((q) => { const k = cleDonnee(q.question); return LIGNE_DETERMINISTE.test(q.question) || !k.length || !k.every((c) => couvertes.has(c)); });
  }

  private async consoliderAvecSourcesFusion(liste: string[]): Promise<Array<{ question: string; sources: number[] }>> {
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const uniques: Array<{ texte: string; origines: number[] }> = [];
    // Réponse connue de GSS (registre recours_sous_traitance : « Non ») : aucune question sur ses sous-traitants ;
    // le mémoire répond par la phrase du mémoire type (« GSS n'envisage pas de recourir à la sous-traitance »).
    const sansSousTraitance = /^\s*non\b/i.test(valeurRegistre('recours_sous_traitance') || '');
    liste.forEach((c, i) => {
      const t = c.replace(/\*\*/g, '').trim();
      if (!t) return;
      // Question sur la sous-traitance (GSS n'en fait pas) : retirée ; jamais une ligne déjà formulée sans modèle dont seul le
      // libellé de la réponse cite la sous-traitance (etampes1 594 : « Réponse « Engagement… sous-traitance… » : le schéma n'a
      // pas pu être inséré… », T6-COH-3).
      if (sansSousTraitance && /sous[- ]?trait/i.test(t) && !LIGNE_DETERMINISTE.test(t)) return;
      const u = uniques.find((x) => norm(x.texte) === norm(t));
      if (u) u.origines.push(i); else uniques.push({ texte: t, origines: [i] });
    });
    const brut = () => uniques.map((u) => ({ question: questionOuverte(u.texte), sources: u.origines }));
    // Lignes déjà formulées sans modèle (proposition de dimensionnement, de mise en situation ou de couverture, phrase de GSS
    // retirée par un garde-fou, réponse à relire, phrases adaptées au CCTP, alertes) : jamais réécrites par la fusion, qui en
    // faisait une « Exigence du DCE » (etampes1 592 : « GSS doit valider ou modifier dans l'assistant le dimensionnement… ») ou
    // une question « À demander à l'acheteur » sur un texte de GSS (T5N-1, T5N-3). Elles sont gardées telles quelles, à leur
    // place dans la liste.
    const deterministe = (t: string) => LIGNE_DETERMINISTE.test(t);
    const fixes = uniques.filter((u) => deterministe(u.texte)).map((u) => ({ question: u.texte, sources: u.origines }));
    const aFusionner = uniques.filter((u) => !deterministe(u.texte));
    const avecFixes = (l: Array<{ question: string; sources: number[] }>) => [...l, ...fixes]
      .map((q, i) => ({ q, i, rang: q.sources.length ? Math.min(...q.sources) : Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.rang - b.rang || a.i - b.i).map((x) => x.q);
    if (aFusionner.length <= 3) return brut();
    const reponse = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu prépares la liste des informations à obtenir pour finaliser un mémoire technique GSS. La liste fournie a été produite rubrique par rubrique : beaucoup de demandes portent sur le MÊME sujet avec des formulations différentes.
- Fusionne toutes les demandes d'un même sujet en UNE seule question claire, qui reprend TOUTES leurs précisions (sites, bâtiments, normes, documents, délais, « dernière valeur connue : … (source) »).
- Ne supprime aucun sujet et n'en crée aucun ; n'ajoute aucune information absente de la liste. EXCEPTION : retire une demande qui ne fait que demander à GSS de CONFIRMER qu'elle respectera une obligation du cahier des charges (assurance, dépôt de pièces, délai de transmission d'un document, périodicité d'une réunion…) — GSS s'y engage dans le mémoire ; garde-la si elle demande un document, un nom, un chiffre, un moyen ou une organisation à fournir.
- Une demande sur un équipement ou un système de l'acheteur (ses caméras, ses écrans, sa GTB, ses commandes internes) ou sur une ambiguïté de son cahier des charges est « À demander à l'acheteur : ».
- Une demande « Confirmer … — dernière valeur connue : … » porte sur UNE information (un responsable, un effectif, un outil…) : ne la fusionne qu'avec des demandes sur cette MÊME information.
- Une demande qui ne peut être renseignée que par l'ACHETEUR (données qu'il doit transmettre, ses préférences, ses choix) commence par « À demander à l'acheteur : ».
- La validation par GSS de ce que propose le mémoire (dimensionnement, organisation, délais) est une question pour GSS, jamais « à demander à l'acheteur ».
- Les références de GSS (dénomination de l'établissement client, contact, montant), son chiffre d'affaires, ses effectifs et ses cadres sont des questions pour GSS, jamais « à demander à l'acheteur ».
- Les fiches techniques, notices ou documentations des moyens du soumissionnaire (« insérer ici les fiches techniques » : moyens de communication, contrôle de rondes, main courante) sont celles de GSS : question pour GSS, jamais « à demander à l'acheteur ».
- Ne redemande jamais une donnée déjà écrite dans une demande ou connue de GSS (numéro d'autorisation AUT ou d'agrément AGD du CNAPS) : en fusionnant, reprends seulement les données réellement demandées.
- Une phrase par question, sans Markdown. Une demande se pose en question ouverte (« Quel(le)s … ? », « Pouvez-vous fournir … ? », « Pouvez-vous préciser … ? ») ; jamais en question fermée « GSS doit-elle … ? », qui en changerait le sens (le cadre exige déjà la pièce : GSS doit la fournir).
- Pour chaque question, indique dans "sources" les numéros des demandes qu'elle regroupe.
Renvoie UNIQUEMENT un objet JSON : {"questions": [{"question": "...", "sources": [1, 4]}]}`,
      },
      { role: 'user', content: aFusionner.map((u, i) => `${i + 1}. ${u.texte}`).join('\n') },
    ], 0.1, 'Consolidation des consultations', true);
    try {
      const qs = JSON.parse(reponse || '{}').questions;
      if (Array.isArray(qs)) {
        const out = qs
          .map((q: any) => ({
            question: String((typeof q === 'string' ? q : q?.question) ?? '').trim(),
            sources: (Array.isArray(q?.sources) ? q.sources : []).map(Number)
              .filter((n: number) => n >= 1 && n <= aFusionner.length).flatMap((n: number) => aFusionner[n - 1].origines),
          }))
          .filter((q: { question: string }) => q.question)
          .map((q: { question: string; sources: number[] }) => ({ ...q, question: questionOuverte(q.question) }));
        if (out.length && out.length <= aFusionner.length) {
          console.log(`[MemoireGenerator] Consultations : ${liste.length} demande(s) → ${out.length + fixes.length} question(s) après fusion des doublons (${fixes.length} déjà formulée(s), gardée(s) telle(s) quelle(s)).`);
          return avecFixes(out);
        }
      }
    } catch { /* repli ci-dessous */ }
    console.warn('[MemoireGenerator] Consolidation des consultations indisponible → dédoublonnage exact uniquement.');
    return brut();
  }

  /**
   * Règle GSS (« ne pas nous faire rechercher ce que nous avons déjà fourni ») : avant de poser une
   * question à GSS, on vérifie si ses mémoires y répondent déjà. Si oui, la réponse est intégrée au
   * texte à l'emplacement du manque et la question n'est pas posée. Ne concerne ni les confirmations
   * d'informations qui évoluent, ni les questions pour l'acheteur, ni les données propres au marché.
   */
  private async completerParLesMemoires(elements: ElementACompleter[], sections: Record<string, string>, horsNormandie = false): Promise<void> {
    const candidats = elements.filter((e) => e.statut === 'ouvert' && !e.pourAcheteur && e.reperes?.length
      && !/derni[èe]re valeur connue/i.test(e.question));
    if (!candidats.length) return;
    let embs: number[][] = [];
    try { embs = await this.embedTexts(candidats.map((e) => e.question.slice(0, 1000))); } catch { return; }
    const blocs = candidats
      .map((e, i) => ({ e, extraits: rechercherMemoires(embs[i], 3, e.question, 2).filter((p) => p.score >= 0.4) }))
      .filter((b) => b.extraits.length);
    if (!blocs.length) return;
    const reponse = await this.callOpenAI([
      {
        role: 'system',
        content: `Pour chaque question posée à GSS, indique si les extraits de ses réponses d'appels d'offres précédentes y répondent DÉJÀ.
- Réponds uniquement si les extraits contiennent réellement l'information demandée, valable pour GSS en général (procédure, organisation, moyen, outil, formation, engagement).
- Jamais un chiffre, un nom de site, un effectif ou un dispositif propre à l'ancien client ; jamais une information qui dépend du nouveau marché (effectifs dédiés, horaires, dimensionnement, délais propres au site) ; jamais une confirmation de document à joindre.
- La réponse : 1 à 3 phrases factuelles, fidèles aux extraits, sans nommer l'ancien client ni parler de « mémoire » ou d'« extrait ».
- Si les extraits ne répondent qu'à UNE PARTIE de la question : donne cette partie dans "reponse" et, dans "reste", la question réduite à ce qui manque encore — une vraie question adressée à GSS, AUTONOME et complète (le sujet est nommé explicitement : jamais « ces autorisations », « celle-ci »… ; jamais une constatation du type « … ne sont pas précisées »).
- Si les extraits n'y répondent pas : "reponse": null.${horsNormandie ? `
- Le nouveau marché est HORS de Normandie (où GSS est implanté) : aucun délai chiffré d'intervention, de mobilisation, de remplacement ou d'alerte (minutes, heures) et aucune organisation locale (agence, astreinte, véhicules, rondier) tirés des extraits : ils ne valent que pour la Normandie ("reponse": null pour ces questions).` : ''}
- Jamais de commentaire sur ce qui manque, reste à définir ou à confirmer, ni sur l'implantation de GSS : uniquement des faits.
Renvoie UNIQUEMENT un objet JSON : {"reponses": [{"n": 1, "reponse": "..." | null, "reste": "..." | null}]}`,
      },
      { role: 'user', content: blocs.map((b, i) => `### ${i + 1}. ${b.e.question}\n${b.extraits.map((p) => p.texte).join('\n---\n')}`).join('\n\n') },
    ], 0.1, 'Réponses déjà données par GSS', true);
    let reponses: any[] = [];
    try { reponses = JSON.parse(reponse || '{}').reponses || []; } catch { return; }
    let n = 0;
    let partiels = 0;
    for (const r of reponses) {
      const b = blocs[Number(r?.n) - 1];
      const texte = String(r?.reponse ?? '').trim();
      if (!b || !texte || texte === 'null') continue;
      // Hors Normandie : un délai chiffré repris d'un ancien marché normand n'est jamais réutilisé.
      if (horsNormandie && /\d+\s*(?:minutes?|min\b|heures?\b|h\b)/i.test(texte) && /interven|mobilis|remplac|alerte|astreinte|rondier|d[ée]lai|arriv/i.test(texte)) continue;
      const reperes = b.e.reperes || [];
      const id = Object.keys(sections).find((k) => sections[k].includes(REPERE(reperes[0])));
      if (!id) continue;
      const reste = String(r?.reste ?? '').trim();
      // Réponse déjà présente dans le texte qui précède l'emplacement (même contenu, autre formulation) :
      // rien n'est inséré (sinon le paragraphe se répétait), l'emplacement est retiré et la question close.
      const motsCles = (x: string) => new Set(x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
      const avantRepere = sections[id].slice(Math.max(0, sections[id].indexOf(REPERE(reperes[0])) - 900), sections[id].indexOf(REPERE(reperes[0])));
      const mr = motsCles(texte), ma = motsCles(avantRepere);
      if (!(reste && reste !== 'null') && mr.size >= 4 && [...mr].filter((w) => ma.has(w)).length / mr.size >= 0.6) {
        for (const rp of reperes) for (const k of Object.keys(sections)) sections[k] = sections[k].split(REPERE(rp)).join('');
        Object.assign(b.e, { statut: 'complete', valeur: texte, source: 'memoires', completeLe: new Date().toISOString() });
        n++;
        continue;
      }
      // Intégration non bloquante : si l'IA est injoignable, la question reste simplement posée à GSS.
      try {
        if (reste && reste !== 'null') {
          // Réponse partielle : ce qui est connu entre dans le texte, seul le reste est demandé à GSS
          // (le repère est conservé juste après pour y insérer la suite).
          const suite = '⟦SUITE⟧';
          const avecSuite = sections[id].replace(REPERE(reperes[0]), `${REPERE(reperes[0])}${suite}`);
          sections[id] = (await integrerDansRubrique(avecSuite, REPERE(reperes[0]), b.e.question, texte)).replace(suite, ` ${REPERE(reperes[0])}`);
          b.e.question = reste;
          partiels++;
          continue;
        }
        sections[id] = await integrerDansRubrique(sections[id], REPERE(reperes[0]), b.e.question, texte);
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Réponse des mémoires non intégrée (${e?.message || e}) : la question reste posée à GSS.`);
        continue;
      }
      for (const rp of reperes.slice(1)) for (const k of Object.keys(sections)) sections[k] = sections[k].split(REPERE(rp)).join('');
      Object.assign(b.e, { statut: 'complete', valeur: texte, source: 'memoires', completeLe: new Date().toISOString() });
      n++;
    }
    if (n) console.log(`[MemoireGenerator] ${n} question(s) non posée(s) à GSS : la réponse figurait déjà dans ses mémoires (intégrée au texte).`);
    if (partiels) console.log(`[MemoireGenerator] ${partiels} question(s) réduite(s) à la seule partie absente des mémoires GSS.`);
  }

  /**
   * Analyse comparative « exigences du DCE ↔ ce que GSS a / fait ». Extrait les exigences du CCTP/RC
   * comme une CHECK-LIST (ce qui est écrit et demandé), puis confronte CHAQUE exigence à la
   * Documentation GSS (moyens, formations, procédures réels). Le résultat — une matrice
   * besoin → réponse GSS → écart — est INTERNE : il nourrit les prompts de rédaction pour que le
   * mémoire réponde point par point aux exigences, sans rien inventer.
   */
  private async analyzeRequirements(
    dceContext: string,
    gssContext: string,
    /** Rubriques auxquelles attribuer les exigences (par défaut : celles de la réponse libre). */
    rubriques: Array<{ id: string; title: string }> = AI_SECTIONS_B,
    /** Réponse libre v2 : thèmes du plan (« I=… ; II=… »), et « nouvelle » pour une exigence qu'aucune rubrique ne traite. */
    options: { themes?: string; nouvelles?: boolean } = {},
  ): Promise<Array<{ theme: string; exigence: string; reponseGss: string; couverture: string; criticite?: string; rubrique?: string; sujet?: string }>> {
    const systemPrompt = `Tu es responsable de l'analyse des appels d'offres de sécurité privée chez GSS.
Mission : dépouiller le DCE — le CCTP EN PRIORITÉ — pour en extraire une CHECK-LIST des GRANDES EXIGENCES du donneur d'ordre, puis confronter chacune à ce que GSS a / fait d'après la Documentation GSS fournie.
RÈGLES :
- ENGAGEMENTS CHIFFRÉS (prioritaires) : chaque obligation PRÉCISE et mesurable du CCTP/CCAP — délai (levée de doute, intervention, remplacement), fréquence (rondes, contrôles, réunions), échéance (rapports, plannings, listes nominatives, bilans, dossier de réversibilité), document à remettre, matériel ou qualification exigés, obligation assortie d'une pénalité, HORAIRE IMPOSÉ (pauses, rondes, ouverture/fermeture), modalité de traçabilité exigée (tampon, visa, signature), et la DESCRIPTION DU SITE (bâtiments, zones sensibles, accès, catégorie ERP) — est une exigence À PART, avec son chiffre exact et, s'il y en a une, sa pénalité.
- OBLIGATIONS DE MOYEN, DE MÉTHODE ET D'ORGANISATION : chaque obligation explicite du CCTP est aussi une exigence — liste des tâches d'un poste, contenu imposé d'un dossier, d'un rapport ou d'une réunion, INTERDITS et modalités imposées (rondes à pied, pas de photos, alerte par le poste central, maintien en poste jusqu'à la relève…), interlocuteurs désignés, points que « le candidat précisera / indiquera » dans son mémoire (délai, effectif, véhicules, organisation, bilan social…). Regroupe celles d'un même article en UNE exigence qui les énumère toutes. Ne descends pas au niveau du modèle d'équipement.
- Vise 25 à 45 exigences, plus tous les engagements chiffrés (au total 80 au maximum).
- Cite l'exigence de façon synthétique ; n'invente rien côté DCE.
- La réponse GSS s'appuie UNIQUEMENT sur la Documentation GSS ; n'invente AUCUN moyen absent.
- CLASSE la couverture STRICTEMENT ainsi :
    • "couvert"  = GSS a le moyen/la capacité ET c'est présent dans la Doc GSS.
    • "partiel"  = GSS a bien un moyen approchant, mais un DÉTAIL précis manque. NE PAS classer "écart" dans ce cas.
    • "écart"    = GSS N'A PAS ce moyen / ne fournit PAS cette prestation / RIEN dans la Doc GSS ne s'en approche.
  Dans le doute entre "partiel" et "écart", choisis "partiel". Réserve "écart" aux manques FRANCS.`;

    // DCE long : analysé par fenêtres successives (auparavant tronqué à 120 000 caractères, ce qui
    // perdait la fin du CCTP : matériel exigé, états périodiques, échéances des rapports…).
    const FEN = 110_000;
    const fenetres: string[] = [];
    if (dceContext.length > FEN) {
      for (let d = 0; d < dceContext.length - 5_000 && fenetres.length < 3; d += FEN - 5_000) fenetres.push(dceContext.slice(d, d + FEN));
    }
    if (fenetres.length > 1) {
      const lots = await Promise.all(fenetres.map((f) => this.analyzeRequirements(f, gssContext, rubriques, options)));
      const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const vus = new Set<string>();
      const fusion = lots.flat().filter((r) => { const k = norm(r.exigence).slice(0, 90); if (!k || vus.has(k)) return false; vus.add(k); return true; });
      console.log(`[MemoireGenerator] Matrice de conformité (DCE en ${fenetres.length} parties) : ${fusion.length} exigence(s).`);
      return fusion;
    }

    const userPrompt = `=== EXIGENCES DU MARCHÉ (CCTP EN PRIORITÉ, puis RC / annexes) ===
${dceContext.slice(0, FEN)}

=== CE QUE GSS A / FAIT (Documentation GSS) ===
${gssContext.slice(0, 120_000)}

Renvoie un JSON valide :
{
  "requirements": [
    {
      "theme": "${options.themes ? `${options.themes.split(' ; ').map((t) => t.split('=')[0]).join(' | ')}  (${options.themes})` : 'I | II | III | IV  (I=présentation société & conformité légale ; II=moyens humains ; III=moyens opérationnels & matériels ; IV=organisation, qualité, continuité)'}",
      "rubrique": "id de LA rubrique du mémoire qui doit traiter cette exigence (une seule, celle dont c'est directement le sujet) parmi : ${rubriques.map((x) => `${x.id} (${x.title})`).join(' ; ')}${options.nouvelles ? ' ; ou « nouvelle » si AUCUNE de ces rubriques ne traite ce sujet (thème nouveau pour GSS, et non un simple chiffre, délai ou modalité d\'un process existant)' : ''}",${options.nouvelles ? '\n      "sujet": "si rubrique = nouvelle : le sujet de l\'exigence en 8 mots au plus",' : ''}
      "exigence": "Ce que demande le DCE, précis (avec chiffre / délai / qualification si présent)",
      "reponseGss": "Ce que GSS propose concrètement en réponse (moyen / méthode / chiffre tiré de la Doc GSS)",
      "couverture": "couvert | partiel | écart",
      "criticite": "bloquant | facultatif | normal  (bloquant = éliminatoire/obligatoire, sans quoi l'offre est irrecevable ou fortement pénalisée ; facultatif = confort/bonus ; normal = attendu mais non éliminatoire)"
    }
  ]
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Analyse exigences ↔ GSS', true, 'analyse',
    );
    try {
      const data = JSON.parse(content || '{}');
      const reqs = Array.isArray(data.requirements) ? data.requirements : [];
      const by = (c: string) => reqs.filter((r: any) => (r.couverture || '').toLowerCase().includes(c)).length;
      console.log(`[MemoireGenerator] Matrice de conformité: ${reqs.length} exigence(s) (couvert=${by('couvert')}, partiel=${by('partiel')}, écart=${by('écart')}).`);
      return reqs;
    } catch {
      console.warn('[MemoireGenerator] Matrice de conformité: parse JSON échoué → non injectée.');
      return [];
    }
  }

  /**
   * Élimine de la liste des manques tout champ dont le sujet fait déjà l'objet d'une recherche web
   * ou d'une question interne en BDD (recherche_web / question_interne), même en attente de validation.
   */
  private async filterAlreadyKnownInDb(fields: MissingFieldDetected[], dossierId: string): Promise<MissingFieldDetected[]> {
    // We bypass this filter because it hides missing information from the user interface.
    // If an info is missing for THIS dossier, it must be displayed, even if a similar question
    // was asked in the past or for another dossier.
    return fields;
  }

  /**
   * Extrait la LISTE des besoins à couvrir (SANS juger la couverture) :
   *  - cadre imposé → les CHAMPS du formulaire ;
   *  - sans cadre   → les EXIGENCES du CCTP.
   */
  private async extractRequirementsList(
    templateText: string | null,
    dceContext: string,
  ): Promise<Array<{ label: string; theme?: string; kind?: 'champ' | 'case' | 'tableau'; criticite: 'bloquant' | 'facultatif' | 'normal' }>> {
    const parse = (content: string | null) => {
      if (content === null) console.warn('[MemoireGenerator] extractRequirements DIAG : callOpenAI a renvoyé NULL (échec IA/rate-limit).');
      try {
        const d = JSON.parse(content || '{}');
        const normKind = (t: any): 'champ' | 'case' | 'tableau' | undefined => {
          const s = String(t ?? '').toLowerCase();
          return s === 'case' || s === 'tableau' || s === 'champ' ? s as any : undefined;
        };
        const items = (Array.isArray(d.items) ? d.items : [])
          .map((c: any) => ({ label: String(c?.label ?? '').trim(), theme: c?.theme, kind: normKind(c?.type), criticite: normCriticite(c?.criticite), context: String(c?.context ?? '').trim() }))
          .filter((x: any) => x.label !== '');
        if (items.length === 0) console.warn(`[MemoireGenerator] extractRequirements DIAG : 0 item extrait. Réponse IA (200c) = ${(content || '').slice(0, 200)}`);
        return items;
      } catch { console.warn('[MemoireGenerator] extractRequirements DIAG : JSON illisible.'); return []; }
    };
    if (templateText) {
      const content = await this.callOpenAI(
        [
          {
            role: 'system',
            content:
              "Tu extrais la LISTE EXHAUSTIVE de TOUT ce qui reste À RENSEIGNER dans un cadre de réponse imposé (formulaire d'un acheteur public) pour GSS (sécurité privée). " +
              "Le texte est ANNOTÉ :\n" +
              "  • « [CHAMP À REMPLIR] … » = zone de saisie texte à compléter ;\n" +
              "  • « [CASE ☐ vide] libellé » = case à cocher NON cochée (choix/option à trancher) ; « [CASE ☒ cochée] » = déjà cochée ;\n" +
              "  • « [TABLEAU] … [/TABLEAU] » = tableau ; « ⬚ (à remplir — colonne: « X », ligne: « Y ») » marque une CELLULE VIDE, avec son en-tête de colonne et son libellé de ligne.\n" +
              "RÈGLES :\n" +
              "- Relève CHAQUE champ texte à compléter, CHAQUE case à cocher à trancher, et CHAQUE cellule de tableau à renseigner (⬚).\n" +
              "- Pour une cellule de tableau, REPRENDS dans le libellé la colonne ET la ligne indiquées (ex. « Tableau moyens humains — ligne « Chef de poste », colonne « Effectif » à compléter »). Regroupe si toute une colonne est vide.\n" +
              "- Un libellé court et clair par élément ; indique son type dans `type` : \"champ\" | \"case\" | \"tableau\". Ne recopie pas le formulaire entier.\n" +
              "- Fournis aussi dans `context` une ou deux phrases courtes expliquant la section ou l'intitulé parent pour donner du sens à l'élément.\n" +
              "- Ignore les cases DÉJÀ cochées et les zones déjà renseignées.",
          },
          { role: 'user', content: `=== CADRE (annoté) ===\n${templateText.slice(0, 80_000)}\n\nRenvoie un JSON : {"items":[{"label":"...","type":"champ|case|tableau","criticite":"bloquant|facultatif|normal","context":"..."}]}` },
        ],
        0.1, 'Extraction champs template', true, 'analyse',
      );
      return parse(content);
    }
    // Le DCE assemblé (getDceContext) va jusqu'à 240 000 caractères, et les DCE réels en dépassent
    // souvent 120 000 (130 000 à 240 000 relevés sur le corpus) : tronquer à 120 000 faisait disparaître
    // en silence les exigences des dernières pièces (annexes, RC, CCAP). Le DCE est donc découpé sur
    // les frontières de pièces ; un DCE de 120 000 caractères au plus reste lu en un seul appel,
    // identique à l'appel d'origine. Les parties suivantes ne renvoient que les grandes exigences qui
    // ne relèvent d'aucun thème déjà relevé (vue d'ensemble conservée, sans doublon).
    const segments = splitOnPieceBoundaries(dceContext, 120_000);
    const toutes: Array<{ label: string; theme?: string; kind?: 'champ' | 'case' | 'tableau'; criticite: 'bloquant' | 'facultatif' | 'normal' }> = [];
    const cle = (l: string) => l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const vues = new Set<string>();
    for (const [n, segment] of segments.entries()) {
      const dejaReleves = toutes.map((x) => `- ${x.label}`).join('\n');
      const content = await this.callOpenAI(
        [
          { role: 'system', content: "Tu extrais la CHECK-LIST des GRANDES EXIGENCES d'un DCE (CCTP en priorité) pour un marché de sécurité privée. ATTENTION: Reste UNIQUEMENT au niveau des grandes thématiques (ex: Dispositif humain global, Matériel et technologies, Astreinte, Politique RSE, Démarche qualité) et ne liste SURTOUT PAS les sous-détails précis (ne liste pas les modèles de radio, les types d'EPI, les plannings précis, etc.). Limite-toi à une quinzaine d'exigences globales maximum. Le but est d'avoir une vue d'ensemble, sois très général et concis. N'invente rien." },
          {
            role: 'user',
            content: n === 0
              ? `=== DCE ===\n${segment}\n\nRenvoie un JSON : {"items":[{"label":"...","theme":"I|II|III|IV","criticite":"bloquant|facultatif|normal"}]}`
              : `=== DCE (suite, partie ${n + 1}/${segments.length}) ===\n${segment}\n\n` +
                `=== GRANDES EXIGENCES DÉJÀ RELEVÉES SUR LES PARTIES PRÉCÉDENTES DU DCE (ne les répète pas) ===\n${dejaReleves || '(aucune)'}\n\n` +
                'Renvoie UNIQUEMENT les grandes exigences de cette partie qui ne relèvent d\'AUCUNE des exigences déjà relevées (liste vide si toutes sont déjà couvertes). ' +
                'Renvoie un JSON : {"items":[{"label":"...","theme":"I|II|III|IV","criticite":"bloquant|facultatif|normal"}]}',
          },
        ],
        0.2, segments.length > 1 ? `Extraction exigences CCTP (${n + 1}/${segments.length})` : 'Extraction exigences CCTP', true, 'analyse',
      );
      for (const x of parse(content) as typeof toutes) {
        const k = cle(x.label);
        if (!k || vues.has(k)) continue;
        vues.add(k);
        toutes.push(x);
      }
    }
    if (segments.length > 1) console.log(`[MemoireGenerator] extractRequirementsList : DCE de ${dceContext.length} car lu en ${segments.length} parties → ${toutes.length} grandes exigences.`);
    return toutes;
  }

  /**
   * Détection FONDÉE SUR LA RAG : pour CHAQUE exigence/champ, recherche sémantique dans la base de
   * connaissance (rag_chunk) → passages GSS les plus proches → l'IA juge COUVERT vs MANQUANT.
   * Renvoie null si la RAG n'est pas disponible (→ l'appelant retombe sur l'ancienne méthode).
   */
  private async detectMissingViaRag(
    requirements: Array<{ label: string; theme?: string; kind?: 'champ' | 'case' | 'tableau'; criticite: 'bloquant' | 'facultatif' | 'normal'; context?: string }>,
  ): Promise<{ fields: MissingFieldDetected[]; total: number; exigences: any[] } | null> {
    if (requirements.length === 0) return null;
    const gss = await this.loadGssChunksFromDb();
    if (!gss || gss.length === 0) return null;   // pas de RAG → repli sur l'ancienne méthode

    const embs = await this.embedTexts(requirements.map((r) => r.label));
    const withCtx = requirements.map((r, i) => {
      const top = this.retrieve(embs[i] || [], gss, 5, r.label);
      return {
        i, label: r.label, criticite: r.criticite, theme: r.theme, kind: r.kind, reqContext: r.context,
        ctx: top.map((c) => `- [${c.label}] ${c.text.replace(/\s+/g, ' ').slice(0, 350)}`).join('\n'),
      };
    });

    const missing: MissingFieldDetected[] = [];
    const exigences: any[] = [];
    const BATCH = 12;
    for (let b = 0; b < withCtx.length; b += BATCH) {
      const batch = withCtx.slice(b, b + BATCH);
      const payload = batch.map((x) => ({ index: x.i, exigence: x.label, passages_gss: x.ctx || '(aucun passage proche)' }));
      const content = await this.callOpenAI(
        [
          { role: 'system', content: "Pour CHAQUE exigence, on te donne les passages de la Documentation GSS les PLUS PROCHES (recherche sémantique dans la base de connaissance). Décide si GSS COUVRE l'exigence (le moyen/l'information est réellement présent dans ces passages) ou si elle MANQUE (rien de pertinent → à demander en interne ou à rechercher). N'invente RIEN : si les passages ne le prouvent pas, c'est MANQUANT." },
          { role: 'user', content: `Exigences + passages GSS (JSON) :\n${JSON.stringify(payload)}\n\nRenvoie un JSON : {"resultats":[{"index":<n>,"statut":"couvert|manquant"}]}` },
        ],
        0.1, 'Jugement couverture RAG', true,
      );
      const map = new Map<number, string>();
      try {
        const d = JSON.parse(content || '{}');
        for (const r of (Array.isArray(d.resultats) ? d.resultats : [])) {
          if (typeof r?.index === 'number') map.set(r.index, String(r?.statut ?? '').toLowerCase());
        }
      } catch { /* batch illisible → tout considéré manquant par prudence */ }
      for (const x of batch) {
        const statut = map.get(x.i);
        const manquant = statut ? statut.includes('manqu') : true;   // défaut prudent : manquant
        const kindLabel = x.kind === 'case' ? 'Case à cocher' : x.kind === 'tableau' ? 'Tableau' : x.kind === 'champ' ? 'Champ' : null;
        exigences.push({ id: `ex-${x.i}`, theme: x.theme || '', exigence: x.label, couverture: manquant ? 'écart' : 'couvert', criticite: x.criticite, ...(x.kind ? { kind: x.kind } : {}) });
        if (manquant) {
          const suffix = "(Absent de la base de connaissance GSS)";
          const ctxText = x.reqContext ? `${x.reqContext} ${suffix}` : `${kindLabel ? kindLabel + ' du cadre. ' : ''}${suffix}`;
          missing.push({
            id: `req-${x.i}`,
            label: x.label,
            context: ctxText,
            criticite: x.criticite,
          });
        }
      }
    }
    console.log(`[MemoireGenerator] Détection RAG : ${requirements.length} exigence(s) → ${missing.length} manque(s).`);
    return { fields: missing, total: requirements.length, exigences };
  }

  /**
   * Détecte les INFORMATIONS MANQUANTES d'un dossier APRÈS l'analyse du DCE. Compare chaque exigence
   * (CCTP) ou champ (cadre imposé) à la BASE DE CONNAISSANCE RAG (recherche sémantique) pour savoir
   * si l'information existe déjà chez GSS, ou doit être demandée / recherchée. Résultat PERSISTÉ dans
   * dossier.memoire_cadre_state.missingFields (consommé par « Demander à l'équipe » / recherche web).
   */
  public async detectMissingInfo(
    dossierId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ missingFields: Array<{ id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal'; demande: 'web' | 'equipe' }>; completude?: number | null; contradictions?: Array<{ sujet: string; detail: string }>; cached?: boolean }> {
    // Idempotence : la détection ne se fait QU'UNE FOIS. Si elle a déjà tourné pour ce dossier
    // (missingDetectedAt présent), on renvoie la liste en cache — sûr d'appeler depuis plusieurs
    // endroits (upload + repli fiche dossier). `force:true` permet de la relancer explicitement.
    if (!opts.force) {
      const existing = await DB.getDossier(dossierId);
      const st: any = existing?.memoire_cadre_state;
      if (st && st.missingDetectedAt && Array.isArray(st.missingFields)) {
        console.log(`[MemoireGenerator] Détection déjà faite (${st.missingFields.length}) — cache renvoyé.`);
        return { missingFields: st.missingFields, completude: st.completude ?? null, contradictions: st.contradictions ?? [], cached: true };
      }
    }

    const dceContext = await this.getDceContext(dossierId);
    const gssDocs = await this.getGssDocumentation();
    // Contexte GSS LARGE (≈120k car au lieu de 24k) : sinon l'IA ne voit qu'une tranche de la Doc
    // GSS et sur-signale des « écarts » sur des points en réalité couverts.
    const gssContext = this.buildFullGssContext(gssDocs, 12_000, 120_000);

    // Deux systèmes de détection, tous deux APRÈS l'upload :
    //  • CADRE IMPOSÉ (« Mémoire (cadre) ») → basé sur le TEMPLATE : champs du formulaire non
    //    renseignables depuis le DCE + la Doc GSS.
    //  • SANS CADRE (AO RNE)               → basé sur les EXIGENCES : écarts DCE ↔ Doc GSS.
    const templateText = await this.getClientTemplateText(dossierId);
    // 1) Extraire la LISTE des besoins (champs du template OU exigences du CCTP).
    // 2) Comparer CHACUN à la base de connaissance RAG (recherche sémantique) → couvert / manquant.
    // Repli sur l'ancienne méthode (contexte GSS complet) si la RAG n'est pas disponible.
    const requirements = await this.extractRequirementsList(templateText, dceContext);
    console.log(`[MemoireGenerator] detectMissing DIAG : template=${templateText ? `${templateText.length} car` : 'NON TROUVÉ'}, dceContext=${dceContext.length} car, exigences extraites=${requirements.length}`);
    const viaRag = await this.detectMissingViaRag(requirements);
    console.log(`[MemoireGenerator] detectMissing DIAG : RAG=${viaRag ? `${viaRag.fields.length} manque(s)/${viaRag.total} exigence(s)` : 'INDISPONIBLE → repli ancienne méthode'}`);
    const detected =
      viaRag ??
      (templateText
        ? await this.detectMissingFromTemplate(templateText, dceContext, gssContext)
        : await this.detectMissingFromRequirements(dceContext, gssContext));
    const rawFields = detected.fields;
    const filteredIdentite = rawFields.filter((m) => {
      if (identiteCandidatForLabel(m.label) !== '') {
        console.log(`[MemoireGenerator] Manque ignoré (identité légale GSS connue) : "${m.label}"`);
        return false;
      }
      const n = m.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/signature|cachet|fait [aà]|le \d{2}|date (de signature|du jour)|nom et qualite du signataire/.test(n)) {
        console.log(`[MemoireGenerator] Manque ignoré (signature/formalité) : "${m.label}"`);
        return false;
      }
      return true;
    });
    const baseFields = await this.filterAlreadyKnownInDb(filteredIdentite, dossierId);
    const total = detected.total;
    const exigences = (detected as any).exigences || null;   // matrice complète (cas sans cadre)

    // Score de complétude : part des besoins/champs déjà couverts (0..100). Le dénominateur est le
    // TOTAL (exigences pour le cas sans cadre, champs du template pour le cadre imposé).
    const completude = total > 0 ? Math.round(((total - baseFields.length) / total) * 100) : null;

    // Contradictions / ambiguïtés relevées dans le DCE (traçabilité, alerte à l'utilisateur).
    const contradictions = await this.detectContradictions(dceContext);

    // Moteur de décision : pour CHAQUE manque, vers quel canal aller le chercher —
    // 'web' (public, cherchable sur internet) vs 'equipe' (interne, à demander à un référent GSS).
    const kinds = await classifyFieldsLLM(baseFields.map(({ criticite, ...f }) => f));
    const missingFields = baseFields.map((m) => ({
      ...m,   // id, label, context, criticite
      demande: (kinds.get(m.id) === 'public' ? 'web' : 'equipe') as 'web' | 'equipe',
    }));

    // Persistance : on fusionne avec l'éventuel memoire_cadre_state existant (sans l'écraser).
    const dossier = await DB.getDossier(dossierId);
    const prevState = (dossier?.memoire_cadre_state && typeof dossier.memoire_cadre_state === 'object')
      ? dossier.memoire_cadre_state : {};
    await DB.saveDossier(dossierId, {
      memoire_cadre_state: {
        ...prevState,
        missingFields,
        completude,
        contradictions,
        ...(exigences ? { exigences } : {}),
        missingDetectedAt: new Date().toISOString(),
      },
    });

    const nbBloq = missingFields.filter((m) => m.criticite === 'bloquant').length;
    console.log(`[MemoireGenerator] Détection (${templateText ? 'cadre imposé' : 'sans cadre'}): ${missingFields.length} manque(s) dont ${nbBloq} bloquant(s), complétude ${completude ?? '?'}%, ${contradictions.length} contradiction(s).`);
    return { missingFields, completude, contradictions };
  }

  /**
   * Repère les CONTRADICTIONS / AMBIGUÏTÉS internes du DCE (chiffres qui se contredisent, exigences
   * incompatibles, informations manquantes structurantes). Une seule passe IA. Best-effort : en cas
   * d'échec, renvoie une liste vide (non bloquant).
   */
  private async detectContradictions(dceContext: string): Promise<Array<{ sujet: string; detail: string }>> {
    const content = await this.callOpenAI(
      [
        { role: 'system', content: "Tu relis un DCE (dossier de consultation) de marché de sécurité privée pour GSS. Repère uniquement les VRAIES contradictions ou ambiguïtés INTERNES au dossier : chiffres/dates/horaires qui se contredisent entre pièces, exigences incompatibles, renvois à des annexes absentes, formulations réellement ambiguës qui empêchent de répondre. N'invente rien ; si tout est cohérent, renvoie une liste vide." },
        { role: 'user', content: `=== DCE ===\n${dceContext.slice(0, 120_000)}\n\nRenvoie un JSON valide : { "contradictions": [ { "sujet": "de quoi il s'agit (court)", "detail": "la contradiction/ambiguïté constatée (1-2 phrases, cite les valeurs en conflit si possible)" } ] }` },
      ],
      0.1, 'Détection contradictions DCE', true, 'analyse',
    );
    try {
      const data = JSON.parse(content || '{}');
      const items = Array.isArray(data.contradictions) ? data.contradictions : [];
      return items
        .map((it: any) => ({ sujet: String(it?.sujet ?? '').trim(), detail: String(it?.detail ?? '').trim() }))
        .filter((c: any) => c.detail !== '');
    } catch {
      return [];
    }
  }

  /** Détection SANS cadre : écarts DCE ↔ Doc GSS (via analyzeRequirements). Renvoie aussi la
   *  matrice complète des exigences (à persister) et le total (pour le score de complétude). */
  private async detectMissingFromRequirements(
    dceContext: string,
    gssContext: string,
  ): Promise<{ fields: MissingFieldDetected[]; total: number; exigences: any[] }> {
    const reqs = await this.analyzeRequirements(dceContext, gssContext);
    const norm = (c: string) => (c || '').toLowerCase();
    const gaps = reqs.filter((r) => norm(r.couverture).includes('écart') || norm(r.couverture).includes('ecart'));
    const fields = gaps.map((r, i) => ({
      id: `req-${i}`,
      label: r.exigence || '',
      context: `[${r.couverture || 'écart'}] ${r.theme ? `Chapitre ${r.theme} — ` : ''}${r.reponseGss ? `Réponse GSS actuelle : ${r.reponseGss}` : 'Non couvert par la Documentation GSS'
        }`,
      criticite: normCriticite(r.criticite),
    })).filter((m) => m.label.trim() !== '');
    // Exigences persistées (fiches réutilisables) : toute la matrice, avec un id + statut.
    const exigences = reqs
      .filter((r: any) => (r.exigence || '').trim() !== '')
      .map((r: any, i: number) => ({
        id: `ex-${i}`,
        theme: r.theme || '',
        exigence: r.exigence,
        reponseGss: r.reponseGss || '',
        couverture: norm(r.couverture).includes('écart') || norm(r.couverture).includes('ecart')
          ? 'écart' : norm(r.couverture).includes('partiel') ? 'partiel' : 'couvert',
        criticite: normCriticite(r.criticite),
      }));
    return { fields, total: exigences.length, exigences };
  }

  /**
   * Texte du CADRE IMPOSÉ (« Mémoire (cadre) ») uploadé avec le DCE, ou null si le dossier n'a pas
   * de cadre client. Sert à détecter les champs du formulaire non renseignables, sans lancer la
   * génération. Matérialise le DCE depuis Storage (ou repli disque), extrait le texte, nettoie.
   */
  private async getClientTemplateText(dossierId: string): Promise<string | null> {
    // Détection ALIGNÉE sur la génération (cf. generate(), plus bas) : on ne se fie PAS au champ
    // `dce_files[].type === 'Mémoire (cadre)'` — il n'est jamais peuplé à l'upload, donc s'y fier
    // rendait CE chemin toujours « sans cadre » (bug : les champs du template ne ressortaient jamais).
    // On scanne DIRECTEMENT les pièces réellement uploadées du dossier via findDceTemplate (nom du
    // fichier « …mémoire… .docx »), exactement comme le fait la génération.
    const baseDir = path.resolve(__dirname, '../../');
    const uploadedDceDir = path.resolve(baseDir, `../data/output/dce_${dossierId}`);
    // Priorité au dossier disque s'il existe (moins coûteux) ; sinon on matérialise depuis Storage.
    let searchDir = uploadedDceDir;
    let tmpDir: string | null = null;
    if (!fs.existsSync(uploadedDceDir)) {
      tmpDir = await this.materializeDceFromStorage(dossierId);
      if (tmpDir) searchDir = tmpDir;
    }
    try {
      const tpl = this.findDceTemplate(searchDir);
      if (!tpl) return null;
      let text = '';
      try {
        // Extraction ANNOTÉE pour les .docx : préserve cases à cocher et cellules de tableau vides
        // (balises [CASE ☐], [CHAMP À REMPLIR], ⬚) — indispensable pour repérer TOUT ce qui reste à
        // renseigner. Repli sur extractText (aplati) pour les .doc ou en cas d'échec.
        text = tpl.toLowerCase().endsWith('.docx')
          ? loadDocxTemplateAnnotated(tpl)
          : await extractText(tpl);
      } catch {
        if (tpl.toLowerCase().endsWith('.docx')) {
          const xml = new PizZip(fs.readFileSync(tpl)).file('word/document.xml')?.asText() || '';
          text = xml.split(/<w:p[ >]/).slice(1)
            .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join(''))
            .map((t) => t.replace(/&amp;/g, '&').trim()).filter(Boolean).join('\n');
        }
      }
      return text && text.trim() ? text : null;
    } finally {
      if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    }
  }

  /**
   * Détection AVEC cadre imposé : une seule passe IA qui, vu le TEXTE DU TEMPLATE + le DCE + la Doc
   * GSS, liste les CHAMPS du formulaire qu'on ne peut PAS renseigner à partir des sources.
   * Abordable (1 appel) et sans toucher au moteur de génération (qui, lui, remplit champ par champ).
   */
  private async detectMissingFromTemplate(
    templateText: string,
    dceContext: string,
    gssContext: string,
  ): Promise<{ fields: MissingFieldDetected[]; total: number }> {
    const systemPrompt = `Tu analyses un CADRE DE RÉPONSE imposé par un acheteur public (formulaire de mémoire technique à remplir) pour GSS (sécurité privée).
Le texte est ANNOTÉ :
  • « [CHAMP À REMPLIR] … » = zone de saisie texte à compléter
  • « [CASE ☐ vide] libellé » = case à cocher NON cochée (choix à trancher)
  • « [TABLEAU] … [/TABLEAU] » avec cellules vides marquées par « ⬚ (à remplir — colonne: « X », ligne: « Y ») »
Mission : repérer TOUS LES ÉLÉMENTS À RENSEIGNER du cadre (champs textes, cases à cocher vides, cellules de tableaux vides) et déterminer, pour chacun, s'il est renseignable À PARTIR des sources fournies (le DCE et la Documentation GSS).
RÈGLES :
- Compte le NOMBRE TOTAL d'éléments à renseigner du cadre (total_champs) incluant les cases vides.
- Ne liste QUE les éléments qui NE PEUVENT PAS être renseignés depuis les sources (information réellement absente du DCE ET de la Doc GSS). Ignore ce qui est déjà renseignable.
- Sois exhaustif et rigoureux : si une information demandée par le cadre n'est pas clairement et explicitement écrite dans le DCE ou la Documentation GSS, liste-la comme champ manquant.
- Formule un libellé court et clair de l'information manquante (pas de recopie du formulaire entier).
- Indique la criticité de chaque champ manquant : "bloquant" (champ obligatoire/éliminatoire), "facultatif" (bonus/confort) ou "normal".`;

    const userPrompt = `=== CADRE DE RÉPONSE À REMPLIR (template acheteur) ===
${templateText.slice(0, 80_000)}

=== SOURCES DISPONIBLES : DCE ===
${dceContext.slice(0, 80_000)}

=== SOURCES DISPONIBLES : DOCUMENTATION GSS ===
${gssContext.slice(0, 80_000)}

Renvoie un JSON valide :
{
  "total_champs": 0,
  "manquants": [
    { "champ": "libellé court du champ / information non renseignable", "raison": "pourquoi c'est absent des sources (1 phrase)", "criticite": "bloquant | facultatif | normal" }
  ]
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Détection champs manquants (template)', true, 'analyse',
    );
    try {
      const data = JSON.parse(content || '{}');
      const items = Array.isArray(data.manquants) ? data.manquants : [];
      const fields: MissingFieldDetected[] = items
        .map((it: any, i: number) => ({
          id: `champ-${i}`,
          label: String(it?.champ ?? '').trim(),
          context: String(it?.raison ?? '').trim() || 'Champ du cadre non renseignable depuis le DCE et la Documentation GSS.',
          criticite: normCriticite(it?.criticite),
        }))
        .filter((m: any) => m.label !== '');
      const declared = Number(data.total_champs);
      const total = Number.isFinite(declared) && declared >= fields.length ? declared : fields.length;
      return { fields, total };
    } catch {
      console.warn('[MemoireGenerator] Détection template: parse JSON échoué → liste vide.');
      return { fields: [], total: 0 };
    }
  }

  /**
   * Personnalise le texte statique du maître AO RNE.docx (rédigé pour le marché « Parc des
   * Expositions de Rouen ») en remplaçant SON nom de client par celui du DCE. Le nom figure sur
   * la couverture / le sommaire et est découpé en plusieurs runs (« PARC » / « DES » /
   * « EXPOSITIONS DE ROUEN ») : on travaille donc au niveau du paragraphe (texte concaténé),
   * puis on réinjecte le résultat dans le 1er run (les autres sont vidés). On NE touche PAS au
   * « Rouen » isolé (villes d'agence GSS et références clients « ILS NOUS ONT FAIT CONFIANCE »
   * = preuves sociales à conserver) ni à l'identité GSS.
   */
  private adaptStaticText(xmlDoc: any, analysisData: any) {
    const clientName: string = (analysisData?.clientName || '').trim();
    if (!clientName) return;

    // Phrases complètes du client du maître uniquement (jamais le « Rouen » nu).
    const OLD_CLIENT =
      /PARC\s+DES\s+EXPOSITIONS\s+DE\s+ROUEN|Parc\s+des\s+[Ee]xpositions\s+de\s+Rouen|Parc\s+des\s+[Ee]xpositions|Parc\s+Expo/g;
    const replaceClient = (s: string) =>
      s.replace(OLD_CLIENT, (m) => (m === m.toUpperCase() ? clientName.toUpperCase() : clientName));

    let count = 0;
    getElementsWithLocalName(xmlDoc, 'p').forEach((p: any) => {
      const tEls = getElementsWithLocalName(p, 't');
      if (tEls.length === 0) return;
      const concat = tEls.map((t: any) => t.textContent || '').join('');
      if (!OLD_CLIENT.test(concat)) return;
      OLD_CLIENT.lastIndex = 0; // regex globale → réinitialiser après .test()
      const replaced = replaceClient(concat);
      if (replaced === concat) return;
      tEls[0].textContent = replaced;          // tout le texte dans le 1er run (style du titre conservé)
      for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
      count++;
    });
    console.log(`[MemoireGenerator] Personnalisation client: ${count} paragraphe(s) mis à jour → "${clientName}".`);
  }

  public async generate(
    dossierId: string,
    onProgress?: (progress: number, message: string) => void,
    demandeParticuliere?: DemandeParticuliere,
  ): Promise<{
    status?: 'completed' | 'incomplete';
    filePath?: string;
    generatedData?: Record<string, string>;
    missingFields?: any[];
    consultations?: string[];
  }> {
    const settings = getSettings();
    const baseDir = path.resolve(__dirname, '../../');
    const uploadedDceDir = path.resolve(baseDir, `../data/output/dce_${dossierId}`);
    this.appelsEchoues = [];
    reinitialiserJournalIndicateurs();
    const dp = demandeParticuliere || {};
    this.demandeParticuliere = (dp.demande?.trim() || dp.documentTexte?.trim())
      ? { demande: dp.demande?.trim() || '', documentNom: dp.documentNom, documentTexte: (dp.documentTexte || '').trim() }
      : null;
    if (this.demandeParticuliere) {
      console.log(`[MemoireGenerator] Demande particulière : ${this.demandeParticuliere.demande ? 'consigne' : ''}${this.demandeParticuliere.demande && this.demandeParticuliere.documentTexte ? ' + ' : ''}${this.demandeParticuliere.documentTexte ? `document « ${this.demandeParticuliere.documentNom} » (${this.demandeParticuliere.documentTexte.length} car.)` : ''}.`);
    }

    // 1. Find template. isClientTemplate=true → cadre imposé par l'acheteur (on remplit tel quel).
    // isClientTemplate=false → mémoire GSS maître réutilisé (on adapte d'abord client/sites).
    let templatePath: string | null = null;
    let isClientTemplate = true;

    // Un cadre imposé (« Mémoire (cadre) ») n'est valable que s'il provient des fichiers
    // RÉELLEMENT uploadés pour CE dossier. On ne cherche donc que dans uploadedDceDir et
    // jamais dans les corpus de référence (Cas-Univ-Rouen, corpusDce…), sinon chaque dossier
    // hériterait à tort du mémoire de référence comme « cadre client » → faux « cas template ».
    const dossier = await DB.getDossier(dossierId);
    // Nouveaux dossiers : les pièces vivent dans Storage, pas dans uploadedDceDir. On matérialise
    // pour y chercher un éventuel cadre imposé, puis on nettoie dès le template chargé en mémoire.
    let templateSearchDir = uploadedDceDir;
    let templateTmpDir: string | null = null;
    if (!fs.existsSync(uploadedDceDir)) {
      templateTmpDir = await this.materializeDceFromStorage(dossierId);
      if (templateTmpDir) templateSearchDir = templateTmpDir;
    }
    if (dossier && dossier.dce_files) {
      const templateFile = dossier.dce_files.find((f: any) => f.type === 'Mémoire (cadre)');
      if (templateFile && templateFile.nom) {
        const p = path.join(templateSearchDir, path.basename(templateFile.nom));
        if (fs.existsSync(p)) { templatePath = this.cadreEnDocx(p); }
      }
    }

    if (!templatePath) {
      templatePath = this.findDceTemplate(templateSearchDir);
    }

    if (!templatePath) {
      templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      isClientTemplate = false; // mémoire GSS maître, pas un cadre acheteur
      if (!fs.existsSync(templatePath)) {
        const fallbackPath = path.resolve(__dirname, '../../../AO RNE.docx');
        if (fs.existsSync(fallbackPath)) {
          templatePath = fallbackPath;
        } else {
          console.warn(`[MemoireGenerator] Aucun template trouvé ni dans le DCE ni dans ${templatePath} (ou fallback). On continue sans template (Marp)`);
        }
      }
    }

    console.log(`[MemoireGenerator] Using template: ${templatePath} (${isClientTemplate ? 'cadre client' : 'mémoire GSS maître'})`);

    // Modèle de rédaction (core/modeles_ia.ts) : le même avec ou sans cadre imposé.
    this.memoireModel = isClientTemplate ? MODEL_TEMPLATE : MEMOIRE_MODEL;
    console.log(`[MemoireGenerator] Modèle de rédaction : ${this.memoireModel} (${isClientTemplate ? 'cas template' : 'cas sans template'}).`);

    // ── Sans cadre imposé : synthèse IA superposée sur AO RNE.pdf (overlay, design figé) ──
    // On TRANSMET onProgress : sinon la barre de progression du front reste figée sur le dernier
    // état connu (5 %, « Démarrage ») pendant toute la génération Marp.
    if (!isClientTemplate) {
      return this.generateFullMarpPdf(dossierId, onProgress);
    }

    // 2. Analyse structurée du DCE (contexte unique de rédaction), avant toute manipulation du Word
    const dceComplet = await this.getDceContext(dossierId);
    const analyseComplete = await this.analyzeDce(dceComplet);
    // Cadre d'un seul lot (T3G-5) : DCE et analyse réduits à ce lot.
    const lotReduit = perimetreDuLot(analyseComplete, dceComplet);
    const dceContext = lotReduit?.dce ?? dceComplet;
    const analysisData = lotReduit?.analyse ?? analyseComplete;
    const analysisJson = JSON.stringify(analysisData, null, 2);
    if (onProgress) onProgress(12, 'Analyse du DCE terminée');

    // 2 bis. Connaissances GSS pour répondre au cadre client : on explore TOUS les sous-dossiers de
    // la Documentation GSS (moyens, procédures, organisation…) + le dossier « Personnes » (référents).
    // Le DCE reste le contexte primaire (les exigences) ; la Documentation GSS fournit la matière
    // pour y répondre. Toute info absente de ces sources → champ laissé « [À COMPLÉTER] ».
    const gssDocs = await this.getGssDocumentation();
    // Effectifs : le registre (mémoires datés) fait foi ; l'ancien document « EFFECTIFS » (152 / 93…) est écarté.
    if (valeurRegistre('effectif_total')) for (const k of Object.keys(gssDocs)) if (/^EFFECTIFS/i.test(k)) delete gssDocs[k];
    const gssDocContext = this.buildFullGssContext(gssDocs);
    const referentsContext = await this.getGssReferents();
    actualiserOrganigramme(referentsContext);
    if (onProgress) onProgress(18, 'Chargement de la documentation GSS…');
    console.log(`[MemoireGenerator] Contexte cadre client: ${Object.keys(gssDocs).length} catégorie(s) Doc GSS (${gssDocContext.length} chars) + référents (${referentsContext.length} chars).`);

    // Effectif TOTAL de l'entreprise = somme DÉTERMINISTE des effectifs par catégorie d'EFFECTIFS
    // MOYENS.pdf (agrégation de chiffres réels, pas une invention). Sert à remplir « effectif total
    // de l'entreprise / en France » sans laisser le modèle prendre une seule catégorie pour le total.
    // Le registre (mémoires GSS datés) fait foi ; l'ancienne somme des catégories (152 + 93 + … = 291) n'est plus utilisée.
    const effectifTotal = Number(valeurRegistre('effectif_total')) > 0
      ? { total: Number(valeurRegistre('effectif_total')), breakdown: 'registre des informations GSS' }
      : await this.getGssTotalEffectif();
    if (effectifTotal) console.log(`[MemoireGenerator] Effectif total GSS : ${effectifTotal.total} (${effectifTotal.breakdown}).`);

    // 3. Load DOCX and parse XML DOM
    const content = fs.readFileSync(templatePath);
    // Template chargé en mémoire → le dossier temporaire de recherche n'est plus utile.
    if (templateTmpDir) { try { fs.rmSync(templateTmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template');

    const docXmlStr = documentXml.asText();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');

    // Si c'est un mémoire GSS maître (et non un cadre acheteur), on adapte d'abord les textes
    // statiques (ancien client / référence marché / noms de sites) au nouveau marché.
    if (!isClientTemplate) {
      this.adaptStaticText(xmlDoc, analysisData);
      const hfSerializer = new XMLSerializer();
      Object.keys(zip.files).forEach(name => {
        if (name.startsWith('word/header') || name.startsWith('word/footer')) {
          const fd = zip.file(name);
          if (!fd) return;
          const hfDoc = parser.parseFromString(fd.asText(), 'text/xml');
          this.adaptStaticText(hfDoc, analysisData);
          zip.file(name, hfSerializer.serializeToString(hfDoc));
        }
      });
    }

    // 3. Walk the DOM to detect fillable fields
    const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    // Seuil ≥5 : les vraies lignes à remplir du formulaire sont longues. Un trait d'union isolé
    // ("sous-traitance") ou des points de suspension "..." en pleine phrase ne comptent PAS.
    const DOT_RUN = /(?:[_.\-…]\s*){5,}/;
    const DOT_RUN_G = /(?:[_.\-…]\s*){5,}/g;
    const isDottedOnly = (s: string) => s.trim().length >= 5 && /^[_.\-…\s]+$/.test(s);
    const hasDottedRun = (s: string) => DOT_RUN.test(s);
    const stripDots = (s: string) => s.replace(DOT_RUN_G, ' ').trim();
    const normCtx = normComparaison;
    const isIdentityCtx = (ctx: string) =>
      /adresse|denomination|raison sociale|candidat|cnaps|siret|siren|agrement|certification|\bstation\b|\bdate\b|n°|numero|delai|minute|intervenant|taux|effectif|\betp\b|telephone|email|mail|coordonnees|soussigne|agissant|qualite de|\bnom\b|prenom|fonction/.test(normCtx(ctx));
    // Libellés d'identité seuls sur leur ligne (« Raison sociale », « Siret ») : réponse courte à côté.
    const IDENTITE_SEULE = /^(raison sociale|siret|siren|d[ée]nomination(?: sociale)?(?: du candidat)?|nom du (?:candidat|soumissionnaire)|nom commercial|adresse(?: du si[èe]ge)?|t[ée]l[ée]phone|t[ée]l\.?|courriel|e-?mail|adresse [ée]lectronique|je soussign[ée]e?|agissant en qualit[ée] de|pr[ée]nom,? (?:et )?nom|nom,? (?:et )?pr[ée]nom|num[ée]ro de t[ée]l[ée]phone(?:\s*\([^)]{1,40}\))?)\s*:?\s*$/i;
    // Bloc de contacts (« Contact comptable : » puis « Prénom, Nom : », « Téléphone : »…) : le libellé du bloc
    // accompagne chaque champ, sinon les trois blocs recevaient la même réponse (et les doublons étaient vidés).
    /** Consigne entre parenthèses qui demande une description (« (le soumissionnaire décrit ci-dessous les modalités…) : »). */
    const CONSIGNE_DESCRIPTION = /^\(?\s*le (?:soumissionnaire|candidat|titulaire|prestataire) (?:d[ée]crit|d[ée]taille|pr[ée]cise|pr[ée]sente|indique)\b/i;
    const GROUPE_CONTACT = /^(?:contact|interlocuteur|correspondant|r[ée]f[ée]rent|responsable)\b[^:]{0,60}:\s*$/i;
    let groupeContact = '';
    // Bloc signature / cachet : ses lignes vides ne sont pas une zone de réponse.
    const SIGNATURE = /signature|cachet|lu et approuv|rayer la mention|fait [àa]\b|^le\s*:?$/i;
    /** Libellé de la zone de réponse d'une question (« Réponse du candidat : », « Votre réponse : », T7-COH-2). */
    const LIBELLE_ZONE_REPONSE = /^(?:(?:proposition|r[ée]ponse)s?\s+(?:du|de\s+l['’]|de\s+la)\s*(?:soumissionnaire|candidat|titulaire|entreprise|prestataire|opérateur|op[ée]rateur\s+[ée]conomique)|(?:votre|notre)\s+r[ée]ponse|r[ée]ponse(?:\s+(?:apport[ée]e|propos[ée]e|technique))?)\s*:\s*$/i;
    // Une ligne suivie d'un espace vide n'est une QUESTION que si elle en a la forme (numérotée, consigne,
    // thème de réponse technique) — jamais un élément d'en-tête (adresse, n° de marché, titre du document).
    const RESSEMBLE_QUESTION = /\?|^\d+(?:\.\d+)*\s*[-–—.)]\s*\S|d[ée]cri|pr[ée]cis|indiqu|pr[ée]sent|d[ée]taill|expliqu|justifi|organisation|modalit|moyens|m[ée]thod|compr[ée]hension|politique|gestion|suivi|proc[ée]dure|dispositif|mesures|contr[ôo]le|formation|environnement|responsabilit|qualit[ée] de la prestation|planning|astreinte|t[ée]l[ée]surveillance|mat[ée]riel|prise en charge|reprise/i;
    const ENTETE = /\b\d{5}\b|cedex|\bbp\s*\d|n°\s*de\s*march|^m[ée]moire technique$|^cadre de (?:r[ée]ponse|m[ée]moire)|^mp\s*n°|^march[ée]s? publics?|^accord[- ]cadre|^lot\s*n?°?\s*\d+\s*:?$|^\d{4}ma\d+$/i;
    const aDessin = (n: any) => getElementsWithLocalName(n, 'drawing').length > 0 || getElementsWithLocalName(n, 'pict').length > 0;
    const videsARetirer: any[] = [];

    interface FieldDesc {
      id: number;
      type: 'text' | 'legacy_checkbox' | 'sym_checkbox' | 'w14_checkbox';
      element?: any;
      context: string;
      kind: 'answer' | 'table' | 'checkbox';
      lineCount?: number;
      /** Réponse du candidat à un critère d'une GRILLE DE NOTATION (« sous-critère | ……/10 points »). */
      grille?: boolean;
      /** Zone de réponse faite de paragraphes vides : ses lignes vides suivantes sont retirées après remplissage. */
      vide?: boolean;
    }

    let fieldCounter = 1;
    const descriptors: FieldDesc[] = [];
    const filledCells = new Set<any>();
    let currentHeading = 'Introduction / Généralités';
    const recentParagraphs: string[] = [];
    let lastQuestionText = '';          // dernier paragraphe-question purement textuel
    let lastQuestionListe = false;      // ce paragraphe est un élément de liste (puce / numérotation Word)
    let openAnswerField: FieldDesc | null = null; // zone de réponse en cours de coalescence

    const addField = (f: Omit<FieldDesc, 'id'>): FieldDesc => {
      const fd: FieldDesc = { id: fieldCounter++, ...f };
      descriptors.push(fd);
      return fd;
    };

    /** Pose [CHAMP_id] dans le 1er run pointillé (id != null) puis vide les autres runs pointillés (placerOuEffacerPointilles). */
    const placeOrClearDotted = placerOuEffacerPointilles;

    // ── GRILLES DE NOTATION ──
    // Cadre du type « Critère / Sous-critère : composantes… | ……/10 points » (ex. Mairie d'Étampes) :
    // la colonne des points est la NOTE DE L'ACHETEUR (jamais remplie), et le candidat doit répondre à
    // chaque composante du sous-critère DANS la cellule du critère, sous son libellé.
    const SCORE_CELL = /^[\s_.…\-]*\/\s*\d+\s*(?:points?|pts)\b/i;
    const isSousCritere = (t: string) => /^sous[\s-]*crit[eè]re/i.test(t.trim());
    const childElems = (n: any, name: string): any[] => {
      const out: any[] = [];
      for (let i = 0; n.childNodes && i < n.childNodes.length; i++) {
        const c = n.childNodes[i];
        if (c.nodeType === 1 && c.localName === name) out.push(c);
      }
      return out;
    };
    const gridTables = new Set<any>();
    let gridParent = '';   // critère parent (ex. « Cas pratique : … ») détaillé par les sous-critères suivants
    const handleGridRow = (tr: any) => {
      const cells = getDirectCells(tr);
      if (!cells.length) return;
      // Colonnes de notation (points, cases vides d'en-tête) : réservées à l'acheteur.
      cells.slice(1).forEach((c: any) => filledCells.add(c));
      const scoreCell = cells.slice(1).find((c: any) => SCORE_CELL.test(getElementText(c).trim()));
      const crit = cells[0];
      const paras = childElems(crit, 'p');
      const lignes = paras.map((pp: any) => getElementText(pp).replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!scoreCell || !lignes.length || /^total\b/i.test(lignes[0])) return;
      filledCells.add(crit);
      let next = tr.nextSibling;
      while (next && !(next.nodeType === 1 && next.localName === 'tr')) next = next.nextSibling;
      const nextFirst = next ? getElementText(getDirectCells(next)[0] || next).trim() : '';
      const sous = isSousCritere(lignes[0]);
      if (!sous && isSousCritere(nextFirst)) { gridParent = lignes.join(' ; ').replace(/"/g, "'"); return; }
      if (!sous) gridParent = '';
      const corps = sous ? lignes.slice(1) : lignes;
      const net = (l: string) => l.replace(/[\s;:,.]+$/, '');
      const question = (corps.length > 1 && /:\s*$/.test(corps[0])
        ? `${net(corps[0])} : ${corps.slice(1).map(net).join(' ; ')}`
        : corps.map(net).join(' ; ')).replace(/"/g, "'");
      const bareme = getElementText(scoreCell).replace(/[_.…]+/g, ' ').replace(/\s+/g, ' ').trim();
      const fd = addField({
        type: 'text', kind: 'answer', lineCount: 1, grille: true,
        context: `Section: "${sectionAffichee()}" | Question: "${question}"${sous && gridParent ? ` | Critère: "${gridParent}"` : ''} | Barème: "${bareme}"`,
      });
      // Réponse écrite sous le libellé : dans le paragraphe vide final de la cellule, sinon un nouveau.
      const last = paras[paras.length - 1];
      let para = last && getElementText(last).trim() === '' ? last : null;
      if (!para) { para = xmlDoc.createElementNS(WNS, 'w:p'); crit.appendChild(para); }
      const r = xmlDoc.createElementNS(WNS, 'w:r');
      const markRPr = findLocalNameChild(findLocalNameChild(para, 'pPr') || para, 'rPr');
      // Réponse en graisse normale (le libellé du critère reste en gras) : b/bCs à 0, placés juste
      // après rFonts pour respecter l'ordre imposé par le format Word.
      const rPr = markRPr ? markRPr.cloneNode(true) : xmlDoc.createElementNS(WNS, 'w:rPr');
      // La réponse n'hérite ni de la couleur, ni du soulignement, ni de l'italique du libellé.
      for (const tag of ['bCs', 'b', 'color', 'u', 'i', 'iCs', 'highlight', 'shd']) {
        const ex = findLocalNameChild(rPr, tag);
        if (ex) rPr.removeChild(ex);
      }
      const rFonts = findLocalNameChild(rPr, 'rFonts');
      const ancre = rFonts ? rFonts.nextSibling : rPr.firstChild;
      for (const tag of ['b', 'bCs']) {
        const e = xmlDoc.createElementNS(WNS, `w:${tag}`);
        e.setAttribute('w:val', '0');
        if (ancre) rPr.insertBefore(e, ancre); else rPr.appendChild(e);
      }
      r.appendChild(rPr);
      const t = xmlDoc.createElementNS(WNS, 'w:t');
      t.setAttribute('xml:space', 'preserve');
      t.textContent = `[CHAMP_${fd.id}]`;
      r.appendChild(t); para.appendChild(r);
    };

    let sectionPropre = '';
    // Titre de section écrit dans le contexte d'un champ : jamais un repère « [CHAMP_n] » (titre réduit à une cellule déjà
    // détectée, R4-1 : rouen_univ, « [champ_24] » donné comme libellé des réponses à relire et transmis au modèle) ; la
    // détection des zones, elle, garde le titre brut.
    const sectionAffichee = () => currentHeading.replace(/\[CHAMP_\d+\]/gi, '').replace(/\s+/g, ' ').trim() || sectionPropre || currentHeading;
    const walkDOM = (node: any, inDrawing: boolean) => {
      if (node.nodeType !== 1) return;
      const localName = node.localName;
      // Ne pas détecter de champs dans les cartouches graphiques / zones de texte (titre)
      const nowInDrawing = inDrawing || localName === 'drawing' || localName === 'pict' || localName === 'txbxContent';

      if (!nowInDrawing) {
        // ── Suivi des titres / questions (paragraphes purement textuels) ──
        if (localName === 'p') {
          const pText = getElementText(node).trim();
          if (isHeadingParagraph(node)) {
            currentHeading = pText;
            // Titre réel (sans repère « [CHAMP_n] » d'une cellule déjà détectée) : libellé de section des cellules.
            if (pText.replace(/\[CHAMP_\d+\]/g, '').trim()) sectionPropre = pText.replace(/\[CHAMP_\d+\]/g, '').trim();
            recentParagraphs.length = 0;
            lastQuestionText = '';
            openAnswerField = null;
            groupeContact = '';
          } else if (pText && !isDottedOnly(pText) && !hasDottedRun(pText)) {
            if (GROUPE_CONTACT.test(pText)) groupeContact = pText.replace(/\s*:\s*$/, '');
            else if (!IDENTITE_SEULE.test(pText)) groupeContact = '';
            // paragraphe purement textuel → libellé/question, ferme toute zone ouverte
            const cleaned = pText.replace(/\[CHAMP_\d+\]/g, '').trim();
            if (cleaned) {
              recentParagraphs.push(cleaned);
              if (recentParagraphs.length > 3) recentParagraphs.shift();
              if (cleaned.length < 300) {
                lastQuestionText = cleaned;
                const pPr = findLocalNameChild(node, 'pPr');
                const style = pPr ? findLocalNameChild(pPr, 'pStyle') : null;
                lastQuestionListe = !!(pPr && findLocalNameChild(pPr, 'numPr')) || /liste|list/i.test(style?.getAttribute('w:val') || '');
              }
              openAnswerField = null;
            }
          }
        }

        if (localName === 'tbl' && childElems(node, 'tr').some((row: any) => {
          const c = getDirectCells(row);
          return c.length >= 2 && getElementText(c[0]).trim() !== ''
            && c.slice(1).some((x: any) => SCORE_CELL.test(getElementText(x).trim()));
        })) gridTables.add(node);

        // ── A0. Ligne d'une grille de notation ──
        if (localName === 'tr' && gridTables.has(getParentWithLocalName(node, 'tbl'))) {
          openAnswerField = null;
          handleGridRow(node);
        } else
        // ── A. Cellules de tableau : cellules vides dans une ligne à contenu mixte ──
        if (localName === 'tr') {
          openAnswerField = null;
          const directCells = getDirectCells(node);
          const cellInfos = directCells.map((cell: any) => ({ cell, isEmpty: getElementText(cell).trim() === '' }));
          const hasText = cellInfos.some((c: any) => !c.isEmpty);
          const hasEmpty = cellInfos.some((c: any) => c.isEmpty);
          if (hasText && hasEmpty) {
            cellInfos.forEach((cInfo: any, cellIdx: number) => {
              // La 1re cellule d'une ligne est la colonne LIBELLÉ (intitulé de la ligne) : on ne la
              // remplit jamais, même vide, pour ne pas écraser/inventer un en-tête de ligne.
              if (cellIdx === 0) return;
              // Cellule fusionnée verticalement avec celle du dessus (w:vMerge sans « restart ») : elle appartient à l'en-tête
              // ou à la cellule supérieure, jamais une case à remplir (havre1 : valeurs écrites dans le sous-en-tête du tableau
              // CNAPS « Date d'obtention | Date de fin de validité »).
              if (fusionVerticale(cInfo.cell)) return;
              if (cInfo.isEmpty && !filledCells.has(cInfo.cell)) {
                filledCells.add(cInfo.cell);
                const cellContext = getTableCellContext(cInfo.cell, node);
                const nearbyCtx = recentParagraphs.length > 0 ? ` | Contexte proche: "${recentParagraphs.slice(-2).join(' / ')}"` : '';
                const fd = addField({ type: 'text', kind: 'table', context: `Section: "${sectionPropre || sectionAffichee()}" | Tableau: ${cellContext}${nearbyCtx}` });
                let p = findLocalNameChild(cInfo.cell, 'p') || getElementsWithLocalName(cInfo.cell, 'p')[0];
                if (!p) { p = xmlDoc.createElementNS(WNS, 'w:p'); cInfo.cell.appendChild(p); }
                const r = xmlDoc.createElementNS(WNS, 'w:r');
                const t = xmlDoc.createElementNS(WNS, 'w:t');
                t.textContent = `[CHAMP_${fd.id}]`;
                r.appendChild(t); p.appendChild(r);
              }
            });
          }
        }

        // ── B. Paragraphes ──
        if (localName === 'p') {
          const parentCell = getParentWithLocalName(node, 'tc');
          if (!(parentCell && filledCells.has(parentCell))) {
            const fullText = getElementText(node).trim();

            // Cases à cocher de FORMULAIRE (legacy w:checkBox / Wingdings sym / w14) — détection
            // ORDONNÉE avec libellé PROPRE à chaque case : le texte qui SUIT la case (jusqu'à la
            // suivante) = SON option ; le texte avant la 1re case = l'intitulé commun. Sans ça, toutes
            // les cases d'une ligne (« ☐ Oui ☐ Non ») partageaient le même contexte → coche au hasard.
            {
              const isFormBox = (n: any): FieldDesc['type'] | null => {
                const ln = n.localName;
                if (ln === 'checkBox') return 'legacy_checkbox';
                if (ln === 'checkbox' && (n.namespaceURI === 'http://schemas.microsoft.com/office/word/2010/wordml' || n.prefix === 'w14')) return 'w14_checkbox';
                if (ln === 'sym') {
                  const font = n.getAttribute('w:font') || n.getAttributeNS('*', 'font');
                  const char = n.getAttribute('w:char') || n.getAttributeNS('*', 'char');
                  if (font === 'Wingdings' && (char === 'F0A8' || char === 'F0FE')) return 'sym_checkbox';
                }
                return null;
              };
              const boxes: Array<{ type: FieldDesc['type']; element: any }> = [];
              const cbLabels: string[] = [];
              let cbPre = '';
              let cbCur = -1;
              const walkCb = (n: any) => {
                if (n.nodeType === 1) {
                  const t = isFormBox(n);
                  if (t) { cbCur++; cbLabels[cbCur] = ''; boxes.push({ type: t, element: n }); return; }
                  if (n.localName === 't') {
                    const txt = n.textContent || '';
                    if (cbCur < 0) cbPre += txt; else cbLabels[cbCur] += txt;
                    return;
                  }
                }
                if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walkCb(n.childNodes[i]);
              };
              walkCb(node);
              const pre = cbPre.trim();
              boxes.forEach((b, i) => {
                const label = (cbLabels[i] || '').trim();
                addField({
                  type: b.type, element: b.element, kind: 'checkbox',
                  context: `Section: "${sectionAffichee()}" | Case à cocher — option: "${label}"${pre ? ` | Intitulé: "${pre}"` : ''}`
                });
              });
            }
            if (/☐|\[\s*\]|\(\s*\)/.test(fullText)) {
              // Libellé PROPRE à chaque case : on découpe le paragraphe sur les marqueurs de case.
              // Le texte AVANT la 1re case = l'intitulé commun ; le texte APRÈS chaque case (jusqu'à
              // la suivante) = SON option. Sans ça, toutes les cases d'une ligne (« ☐ Oui ☐ Non »)
              // partageaient le même contexte → le modèle cochait au hasard.
              const boxSplit = fullText.split(/☐|\[\s*\]|\(\s*\)/);
              const cbPreamble = (boxSplit[0] || '').trim();
              const cbOptions = boxSplit.slice(1).map((s: string) => s.replace(/\[CHAMP_\d+\]/g, '').trim());
              let boxSeq = 0;
              getElementsWithLocalName(node, 't').forEach((tEl: any) => {
                const text = tEl.textContent || '';
                const regex = /☐|\[\s*\]|\(\s*\)/g;
                let match; let out = text; let replaced = false;
                while ((match = regex.exec(text)) !== null) {
                  const label = cbOptions[boxSeq] || '';
                  boxSeq++;
                  const ctx = `Section: "${sectionAffichee()}" | Case à cocher — option: "${label}"${cbPreamble ? ` | Intitulé: "${cbPreamble}"` : ''}`;
                  const fd = addField({ type: 'text', kind: 'checkbox', context: ctx });
                  out = out.replace(match[0], `[CHAMP_${fd.id}]`); replaced = true;
                }
                if (replaced) tEl.textContent = out;
              });
            }

            // Libellé d'identité seul (« Raison sociale », « Siret ») : réponse courte sur la même ligne.
            if (IDENTITE_SEULE.test(fullText)) {
              const fd = addField({ type: 'text', kind: 'answer', lineCount: 1, context: `Section: "${sectionAffichee()}" | Question: "${fullText.replace(/:\s*$/, '')}"${groupeContact ? ` | Groupe: "${groupeContact}"` : ''}` });
              const r = xmlDoc.createElementNS(WNS, 'w:r');
              const t = xmlDoc.createElementNS(WNS, 'w:t');
              t.setAttribute('xml:space', 'preserve');
              t.textContent = `${/:\s*$/.test(fullText) ? ' ' : ' : '}[CHAMP_${fd.id}]`;
              r.appendChild(t); node.appendChild(r);
              lastQuestionText = '';
              openAnswerField = null;
            }

            // Zones de réponse : pointillés ou paragraphe vide → coalescence
            const dotted = hasDottedRun(fullText) || getElementsWithLocalName(node, 't').some((t: any) => isDottedOnly(t.textContent || ''));
            if (IDENTITE_SEULE.test(fullText)) {
              // traité ci-dessus
            } else if (dotted) {
              const inlineLabel = stripDots(fullText);
              if (openAnswerField && inlineLabel === '') {
                // ligne de pointillés qui prolonge la zone ouverte
                placeOrClearDotted(node, null);
                openAnswerField.lineCount = (openAnswerField.lineCount || 1) + 1;
              } else {
                // Ligne pointillée juste sous un titre (question stylée en titre ou en liste, ex. « 3.2 Les
                // effectifs ») : le titre EST la question. Sans cela, la ligne était rattachée à la
                // question précédente et recevait une réponse décalée.
                const ctxLabel = inlineLabel || lastQuestionText || recentParagraphs.slice(-1)[0] || (!/^introduction/i.test(currentHeading) ? currentHeading : '');
                const nearby = recentParagraphs.length ? ` | Contexte: "${recentParagraphs.slice(-2).join(' / ')}"` : '';
                const fd = addField({ type: 'text', kind: 'answer', lineCount: 1, context: `Section: "${sectionAffichee()}" | Question: "${ctxLabel}"${nearby}` });
                placeOrClearDotted(node, fd.id);
                openAnswerField = fd;
                if (!inlineLabel) lastQuestionText = ''; // question consommée
              }
            } else if (fullText === '' && !aDessin(node)) {
              // Question posée sous un titre de section (« 1.1 - Compréhension… ») : le titre sert de libellé.
              const libelle = lastQuestionText || (recentParagraphs.length === 0 && !/^introduction/i.test(currentHeading) ? currentHeading : '');
              // Nombre de paragraphes vides consécutifs à partir de celui-ci (espace de réponse laissé par l'acheteur).
              let vides = 1;
              for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
                if (sib.nodeType !== 1) continue;
                if (sib.localName === 'p' && getElementText(sib).trim() === '' && !aDessin(sib)) vides++; else break;
              }
              if (openAnswerField) {
                // ligne blanche au sein d'une zone de réponse en cours
                openAnswerField.lineCount = (openAnswerField.lineCount || 1) + 1;
                if (openAnswerField.vide) videsARetirer.push(node);
              } else if (libelle && !libelle.trimEnd().endsWith(':') && !SIGNATURE.test(libelle) && vides >= 3
                && RESSEMBLE_QUESTION.test(libelle) && !ENTETE.test(libelle.trim())
                // Dernier élément d'une liste d'« éléments attendus » : c'est la rubrique entière qui est la
                // question (passe des rubriques plus bas), pas ce seul élément.
                // (Sauf titre de sous-rubrique numéroté dans le texte, « 3.1 – Moyens… » : c'est bien la question.)
                && !(libelle === lastQuestionText && lastQuestionListe && !/^\d+(?:\.\d+)+\s*[-–—.)]\s*\S/.test(libelle))
                // « PROPOSITION DU SOUMISSIONNAIRE » n'est pas la question : la passe des rubriques (plus bas)
                // y place la réponse avec toute la description des attentes de l'acheteur.
                && !/^(?:proposition|r[ée]ponse)s?\s+du\s+(?:soumissionnaire|candidat|titulaire)/i.test(libelle)) {
                // Question suivie d'un espace de réponse fait de lignes vides (cadres « par rubriques »,
                // ex. Cour d'appel de Rouen) : zone de réponse développée. Sans cette règle, toutes les
                // rubriques notées de ce type de cadre restaient vides.
                const fd = addField({ type: 'text', kind: 'answer', lineCount: vides, vide: true, grille: true, context: `Section: "${sectionAffichee()}" | Question: "${libelle}"` });
                const r = xmlDoc.createElementNS(WNS, 'w:r');
                const t = xmlDoc.createElementNS(WNS, 'w:t');
                t.textContent = `[CHAMP_${fd.id}]`;
                r.appendChild(t); node.appendChild(r);
                openAnswerField = fd;
                lastQuestionText = '';
              } else if (lastQuestionText && lastQuestionText.trimEnd().endsWith(':') && !SIGNATURE.test(lastQuestionText)
                // T7-COH-2 : libellé de la zone de réponse (« Réponse du candidat : », « Votre réponse : », « Proposition du
                // soumissionnaire : ») : jamais un champ court à part ; la réponse développée de la question s'écrit dans la zone
                // vide qui suit (passe des rubriques), une seule fois.
                && !LIBELLE_ZONE_REPONSE.test(lastQuestionText.trim())
                // « Éléments de réponse attendus : » introduit une liste, ce n'est pas un champ à remplir.
                && (CONSIGNE_DESCRIPTION.test(lastQuestionText) || !/attendus?\s*:|ci-dessous\s*:|suivants?\s*:|notamment\s*:|comprenant\s*:/i.test(lastQuestionText))
                // « Contact pour les commandes : » suivi de « Nom : …… » : ce sont les lignes suivantes qu'on remplit.
                // (Jamais pour un libellé de donnée : « Date d'obtention de l'autorisation : » reste un champ.)
                && !(!CONSIGNE_DESCRIPTION.test(lastQuestionText) && !/date|n°|num[ée]ro|\bnom\b|adresse|t[ée]l[ée]phone|courriel|mail|siret|montant|effectif|d[ée]lai|autorisation|agr[ée]ment/i.test(lastQuestionText) && (() => {
                  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
                    if (sib.nodeType !== 1 || sib.localName !== 'p') continue;
                    const tx = getElementText(sib).trim();
                    if (!tx) continue;
                    return hasDottedRun(tx) || /:\s*$/.test(tx);
                  }
                  return false;
                })())) {
                // paragraphe vide juste après un libellé "… :" ; consigne de description (« (le soumissionnaire décrit
                // ci-dessous les modalités de prise des commandes…) : » suivie de lignes vides) : réponse développée, avec
                // le libellé qui la précède (havre1 : « Organisation et traitement des commandes » restait vide).
                const description = CONSIGNE_DESCRIPTION.test(lastQuestionText);
                const intitule = description && recentParagraphs.length >= 2 ? `${recentParagraphs[recentParagraphs.length - 2].replace(/\s*:\s*$/, '')} — ${lastQuestionText}` : lastQuestionText;
                const fd = addField({ type: 'text', kind: 'answer', lineCount: description ? Math.max(3, vides) : 1, context: `Section: "${sectionAffichee()}" | Question: "${intitule.replace(/"/g, "'")}"` });
                const r = xmlDoc.createElementNS(WNS, 'w:r');
                const t = xmlDoc.createElementNS(WNS, 'w:t');
                t.textContent = `[CHAMP_${fd.id}]`;
                r.appendChild(t); node.appendChild(r);
                openAnswerField = fd;
                lastQuestionText = '';
              }
            }
          }
        }
      }

      // Recurse
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) walkDOM(node.childNodes[i], nowInDrawing);
      }
    };

    walkDOM(xmlDoc.documentElement, false);

    // ── C. Rubriques à réponse IMPLICITE ──
    /** Rubriques numérotées ou notées du cadre restées sans zone de réponse (T10-COH-2) : signalées à GSS. */
    const rubriquesSansZone: string[] = [];
    // Cadres « par rubriques » (ex. Citédia : « SOUS-CRITÈRE 1 … Éléments de réponse attendus : • … • … »,
    // Vitry : « DESCRIPTION DES ATTENTES … PROPOSITION DU SOUMISSIONNAIRE ») : aucune ligne pointillée ni
    // cellule vide, le candidat écrit sous la rubrique. Chaque rubrique notée qui n'a encore aucune zone
    // de réponse développée en reçoit une, avec pour question TOUT le texte de la rubrique (attendus,
    // barème, limite de pages). Sans cela, ces rubriques restaient entièrement vides.
    {
      // (« Critère démarche environnementale – sur 100 points » : critère nommé, sans numéro.)
      // Une année suivie d'un tiret (vitry : « 2023 - Dénomination sociale (public ou privé) », grille de candidature) n'est
      // pas un titre numéroté.
      const DEBUT_RUBRIQUE = /^(?:sous[-\s]?crit[eè]res?|crit[eè]res?)\s*n?°?\s*\d|^(?!(?:19|20)\d{2}\s*[-–—])\d+(?:\.\d+)*\s*[-–—.)]\s*\S|^crit[eè]re\b[^;]{3,120}?[-–—]\s*sur\s+\d+\s*points?\b/i;
      // Mentions de forme d'une rubrique (limite de pages, annexes autorisées) : ce n'est pas une attente de contenu.
      const FORME_RUBRIQUE = /^(?:\d+|une?)\s+pages?\b|pages?\s+maximum|^nombre de pages?\b|^annexes?\s+(?:autoris|autorit)|^maximum\s+\d+\s+pages?/i;
      const EMPLACEMENT = /^(?:proposition|r[ée]ponse)s?\s+du\s+(?:soumissionnaire|candidat|titulaire)|^votre\s+r[ée]ponse|^r[ée]ponse\s+du\s+candidat/i;
      const paras = getElementsWithLocalName(xmlDoc.documentElement, 'p')
        .filter((pp: any) => !getParentWithLocalName(pp, 'txbxContent') && !getParentWithLocalName(pp, 'drawing'));
      const textes = paras.map((pp: any) => getElementText(pp).replace(/\s+/g, ' ').trim());
      const developpe = (t: string) => [...t.matchAll(/\[CHAMP_(\d+)\]/g)].some((m) => {
        const d = descriptors.find((x) => x.id === Number(m[1]));
        return !!d && (d.grille || (d.kind === 'answer' && (d.lineCount || 1) >= 3));
      });
      // Même critère annoncé deux fois (bandeau « SOUS CRITÈRE 1 : … » puis description « Sous critère 1 : … ») :
      // une seule rubrique, sinon la réponse était écrite deux ou trois fois.
      const cleCritere = (t: string) => { const m = /^(sous[-\s]?crit[eè]res?|crit[eè]res?)\s*n?°?\s*(\d+)/i.exec(t); return m ? `${/^sous/i.test(m[1]) ? 's' : 'c'}${m[2]}` : ''; };
      const debuts = textes.map((t, i) => (t && t.length < 250 && DEBUT_RUBRIQUE.test(t) ? i : -1)).filter((i) => i >= 0)
        .filter((i, k, tous) => !(k > 0 && cleCritere(textes[i]) && cleCritere(textes[i]) === cleCritere(textes[tous[k - 1]])));
      // Titre de section en capitales hors tableau (« MOYENS TECHNIQUES », « MOYENS HUMAINS ») : fin de la rubrique qui le
      // précède (havre1 : la réponse « 3.4 » était écrite sous le titre « MOYENS TECHNIQUES », avant « 4.1 »).
      // Jamais un intitulé du cadre lui-même (« DESCRIPTION DES ATTENTES DE L'ACHETEUR », « PROPOSITION DU SOUMISSIONNAIRE »,
      // « ÉLÉMENTS DE RÉPONSE ») : quand le cadre a perdu ses tableaux (conversion textutil, T1-CONS-1), ces bandeaux sont
      // des paragraphes en capitales hors tableau, et la rubrique notée se réduisait à son titre.
      const INTITULE_CADRE = /^(?:description\s+des\s+attentes|attentes\s+de\s+l.acheteur|[ée]l[ée]ments?\s+(?:de\s+r[ée]ponse|attendus)|crit[eè]res?\s+d.[ée]valuation|bar[eè]me)/i;
      const titreSection = (i: number) => {
        const t = textes[i];
        return !!t && t.length <= 80 && /[A-ZÀ-Ý]{3}/.test(t) && !/[a-zà-ÿ]/.test(t.replace(/\[CHAMP_\d+\]/g, '')) && !/\[CHAMP_/.test(t)
          && !getParentWithLocalName(paras[i], 'tc') && t.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 6
          && !EMPLACEMENT.test(t) && !INTITULE_CADRE.test(t);
      };
      const BAREME = /\(\s*(?:not[ée]e?\s+sur\s+)?\d+\s*points?\s*\)|\bsur\s+\d+\s*points?\b|[-–—:]\s*\d+\s*points?\s*$/i;
      // « 1. » puis « 1.1 » (ou « Critère 1 » puis « Sous-critère 1 ») : la seconde est une sous-rubrique de la première.
      const sousRubrique = (a: string, b: string) => {
        const na = /^(\d+(?:\.\d+)*)/.exec(a)?.[1], nb = /^(\d+(?:\.\d+)*)/.exec(b)?.[1];
        if (na && nb) return nb.startsWith(`${na}.`);
        return /^crit[eè]re/i.test(a) && /^sous[-\s]?crit[eè]re/i.test(b);
      };
      for (let k = 0; k < debuts.length; k++) {
        const deb = debuts[k];
        let fin = k + 1 < debuts.length ? debuts[k + 1] : paras.length;
        // Un titre en capitales ne termine la rubrique que si son emplacement de réponse (« PROPOSITION DU SOUMISSIONNAIRE »)
        // n'est pas encore passé (T1-CONS-1).
        const finRubrique = fin;
        for (let i = deb + 1; i < fin; i++) {
          if (!titreSection(i)) continue;
          if (textes.slice(i + 1, finRubrique).some((t) => EMPLACEMENT.test(t)) && !textes.slice(deb, i).some((t) => EMPLACEMENT.test(t))) continue;
          fin = i;
          break;
        }
        const zone = textes.slice(deb, fin);
        if (zone.some((t) => /\[CHAMP_\d+\]/.test(t) && developpe(t))) continue;
        const contenu = zone.slice(1).filter((t) => t && !FORME_RUBRIQUE.test(t));
        const emplacement = zone.findIndex((t) => EMPLACEMENT.test(t));
        // Espace de réponse laissé par l'acheteur sous la rubrique (au moins 3 lignes vides en fin de rubrique).
        let videsFin = 0;
        for (let i = zone.length - 1; i > 0 && !zone[i]; i--) videsFin++;
        // Consigne au présent comme à l'infinitif ou au futur (cvide3, T10-COH-2 : « Le candidat décrit les moyens humains… »).
        const attendus = contenu.some((t) => /attendu|[ée]l[ée]ments? de r[ée]ponse|d[ée]cri(?:re|ra|t|vent|vez)?(?![a-zà-ÿ])|d[ée]crir|pr[ée]cise|indique|d[ée]taill|pr[ée]sente|description|m[ée]thodolog|modalit|(?<![a-zà-ÿ])expos|expliqu|justifi|(?<![a-zà-ÿ])propos(?:e|er|era|ent|ez)(?![a-zà-ÿ])|fourni(?:t|r|ra)(?![a-zà-ÿ])|(?<![a-zà-ÿ])liste(?:r|ra)?(?![a-zà-ÿ])/i.test(t)) || contenu.length >= 3
          // « 7 – Mise en œuvre de la responsabilité environnementale » + « Éco-gestes, déchets… » + espace vide.
          || (contenu.length >= 1 && videsFin >= 3 && RESSEMBLE_QUESTION.test(textes[deb]))
          // Rubrique notée (« (30 points) », « sur 20 points ») : une réponse est attendue.
          || BAREME.test(textes[deb]);
        // Rubrique suivie de ses sous-rubriques numérotées (« 1. … » puis « 1.1 … ») : rien à écrire à ce niveau.
        const aSousRubriques = k + 1 < debuts.length && sousRubrique(textes[deb], textes[debuts[k + 1]]);
        // Titre numéroté seul, sans sous-rubrique ni zone de réponse (cvide, T10-COH-2 : « 1. Moyens humains », « 2. Moyens
        // matériels ») : c'est une rubrique à laquelle répondre.
        // Même règle pour un titre suivi d'une ou deux lignes courtes qui énumèrent le sujet (« 1. Moyens humains » + « Effectifs,
        // qualifications. ») ; jamais une section d'objet ou de consignes du document (« 1. Objet du présent cadre »).
        const titreSeul = emplacement < 0 && contenu.length <= 2 && contenu.every((t) => t.length <= 200) && !aSousRubriques && !zone.some((t) => /\[CHAMP_/.test(t))
          && /^\d+(?:\.\d+)*\s*[-–—.)]\s*\S/.test(textes[deb]) && (textes[deb].match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length >= 2
          && !/\b(?:objet|pr[ée]ambule|consignes?|instructions?|mode d.emploi|g[ée]n[ée]ralit[ée]s|sommaire|contexte de la consultation)\b/i.test(textes[deb]);
        if (emplacement < 0 && !attendus && !titreSeul) {
          // Rubrique numérotée ou notée sans zone de réponse ni sous-rubrique (T10-COH-2) : signalée à GSS, jamais vide en silence.
          if (!aSousRubriques && !zone.some((t) => /\[CHAMP_/.test(t)) && (BAREME.test(textes[deb]) || /^\d+(?:\.\d+)*\s*[-–—.)]\s*\S/.test(textes[deb]))) rubriquesSansZone.push(textes[deb].replace(/\s+/g, ' ').trim().slice(0, 160));
          continue;  // simple titre de chapitre (ses sous-rubriques suivent)
        }
        // Rubrique qui ne contient que des titres de sous-rubriques numérotées : rien à écrire à ce niveau. Une rubrique notée ou
        // numérotée sans sous-rubrique ni zone n'est jamais abandonnée en silence (T1-CONS-1, T10-COH-2) : signalée à GSS.
        if (emplacement < 0 && (aSousRubriques || (fin < paras.length && !contenu.length && !titreSeul))) {
          if (!aSousRubriques && !zone.some((t) => /\[CHAMP_/.test(t)) && (BAREME.test(textes[deb]) || /^\d+(?:\.\d+)*\s*[-–—.)]\s*\S/.test(textes[deb]))) rubriquesSansZone.push(textes[deb].replace(/\s+/g, ' ').trim().slice(0, 160));
          continue;
        }
        const question = zone.slice(0, emplacement >= 0 ? emplacement : zone.length).filter((t) => t && !/\[CHAMP_/.test(t)).join(' ; ').replace(/"/g, "'").slice(0, 1800);
        if (!question) continue;
        // Emplacement de la réponse : juste après « PROPOSITION DU SOUMISSIONNAIRE », sinon après le
        // dernier paragraphe non vide de la rubrique ; dans un paragraphe vide existant si possible.
        const apres = emplacement >= 0 ? deb + emplacement : deb + zone.map((t, i) => (t ? i : -1)).filter((i) => i >= 0).pop()!;
        const ancre = paras[apres];
        let cible = apres + 1 < fin && textes[apres + 1] === '' && paras[apres + 1].parentNode === ancre.parentNode ? paras[apres + 1] : null;
        if (!cible) {
          cible = xmlDoc.createElementNS(WNS, 'w:p');
          ancre.parentNode.insertBefore(cible, ancre.nextSibling);
        }
        // Rubrique notée : traitée comme un critère de grille (chaque élément attendu, longueur selon le barème).
        const fd = addField({ type: 'text', kind: 'answer', lineCount: 12, vide: true, grille: true, context: `Section: "${textes[deb].replace(/"/g, "'")}" | Question: "${question}"` });
        const r = xmlDoc.createElementNS(WNS, 'w:r');
        const t = xmlDoc.createElementNS(WNS, 'w:t');
        t.textContent = `[CHAMP_${fd.id}]`;
        r.appendChild(t); cible.appendChild(r);
        // Lignes vides réservées sous l'emplacement : retirées (on en garde une).
        for (let i = apres + 2; i < fin && textes[i] === '' && paras[i].parentNode === cible.parentNode; i++) videsARetirer.push(paras[i]);
      }
    }

    // Lignes vides réservées par l'acheteur sous une réponse : retirées (la réponse occupe l'espace),
    // la dernière est gardée pour aérer.
    for (let i = 0; i < videsARetirer.length; i++) {
      const n = videsARetirer[i];
      const suivant = videsARetirer[i + 1];
      const dernier = !suivant || n.nextSibling !== suivant && n.nextSibling?.nextSibling !== suivant;
      if (!dernier && n.parentNode) n.parentNode.removeChild(n);
    }

    // Cadre sans aucune zone de réponse développée (T10-COH-2 : titres seuls, consignes non reconnues) : le document ne serait
    // qu'un formulaire d'identité ; il n'est pas remis comme terminé.
    if (!descriptors.some((d) => d.grille || (d.kind === 'answer' && (d.lineCount || 1) >= 3))) {
      throw new Error(`Cadre de réponse « ${path.basename(templatePath)} » : aucune zone de réponse aux questions techniques n'a été trouvée${rubriquesSansZone.length ? ` (rubriques sans zone : ${rubriquesSansZone.map((x) => `« ${x} »`).join(', ')})` : ''}. Aucun document n'est remis : vérifiez que ce fichier est bien le cadre du mémoire technique, puis relancez la génération.`);
    }
    const alertesRubriquesCadre = [
      // Cadre .doc converti sans ses tableaux (textutil, faute de LibreOffice et de Word, T1-CONS-1) : signalé en tête.
      ...(this.cadreAplati ? [`Le cadre de réponse « ${this.cadreAplati} » (Word 97-2003) n'a pu être converti qu'en aplatissant ses tableaux (LibreOffice et Microsoft Word indisponibles) : vérifiez chaque zone de réponse et la mise en forme du document avant la remise.`] : []),
      ...rubriquesSansZone.map((x) => `La rubrique « ${x} » du cadre de réponse n'a reçu aucune réponse (aucune zone de réponse reconnue sous ce titre) : à rédiger directement dans le document avant la remise.`),
    ];
    if (rubriquesSansZone.length) console.warn(`[MemoireGenerator] ${rubriquesSansZone.length} rubrique(s) du cadre sans zone de réponse : ${rubriquesSansZone.join(' ; ')}.`);
    if (this.cadreAplati) console.warn(`[MemoireGenerator] Cadre ${this.cadreAplati} converti sans ses tableaux (textutil) : signalé à GSS.`);
    // Construit le libellé de prompt de chaque champ (hint de format + contexte)
    const buildPrompt = (f: FieldDesc): string => {
      // Les mots-codes de champs de formulaire Word ne doivent pas polluer l'inférence ni le prompt
      const cleanCtx = f.context.replace(/FORM(CHECKBOX|TEXT|DROPDOWN)/gi, ' ').replace(/\s{2,}/g, ' ').trim();
      let hint = inferFieldHint(cleanCtx);
      // Case de tableau dont la colonne attend une donnée (NOM, Prénom, Date, N°…) : valeur courte, jamais une phrase
      // (havre2 361 : une phrase sur les premiers secours écrite dans la case « NOM » de la ligne SST, T4-COH-2).
      if (f.kind === 'table' && COLONNE_VALEUR.test(colonneCase(cleanCtx))) hint = '[VALEUR COURTE]';
      if (f.kind === 'checkbox') hint = '[CASE A COCHER]';
      if (f.grille) hint = '[PARAGRAPHE]';
      // Une zone de réponse étalée sur plusieurs lignes appelle un paragraphe développé,
      // sauf s'il s'agit clairement d'un champ d'identité court.
      if (f.kind === 'answer' && (f.lineCount || 1) >= 3 && !isIdentityCtx(cleanCtx)) hint = '[PARAGRAPHE]';
      // Question qui demande de DÉCRIRE (organisation, modalités, moyens, formations, mesures…) : réponse
      // développée même si l'acheteur n'a laissé qu'une ligne (le cadre s'agrandit). Sinon « 2.1 L'organisation
      // mise en place pour le contrôle de la prestation » recevait 4 mots.
      const questionSeule = (cleanCtx.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      const identiteStricte = /adresse|d[ée]nomination|raison sociale|cnaps|siret|siren|agr[ée]ment|t[ée]l[ée]phone|e-?mail|courriel|coordonn[ée]es|soussign|agissant|qualit[ée] de|\bnom\b|pr[ée]nom|\bdate\b|n°|num[ée]ro/i;
      if (f.kind === 'answer' && hint !== '[PARAGRAPHE]' && questionSeule && !identiteStricte.test(questionSeule)
        && /organisation|modalit|moyens|m[ée]thod|d[ée]cri|pr[ée]sent|formations?|qualifications|proc[ée]dure|contr[ôo]le|dispositif|mesures|initiatives|politique|gestion|suivi|compr[ée]hension|rondes?|communication|permanence|astreinte|r[ée]activit|remplacement|continuit|encadrement|mat[ée]riels?|[ée]quipements|outils|d[ée]marche|traitement|actions|environnement|soci[ée]tal|responsabilit[ée]/i.test(questionSeule)) hint = '[PARAGRAPHE]';
      const extent = f.kind === 'answer' && (f.lineCount || 1) > 1
        ? ` (zone de ${f.lineCount} lignes — réponse développée attendue)` : '';
      return `Champ [CHAMP_${f.id}] ${hint} : ${cleanCtx}${extent}`;
    };
    // Rubrique à limite de pages courte partagée entre plusieurs zones de réponse (« 1 page maximum » pour
    // 1.1 + organisation des effectifs + méthodologie) : chaque réponse reçoit sa part du volume, sinon la
    // rubrique dépassait nettement la limite fixée par l'acheteur.
    {
      const limite = (d: FieldDesc) => {
        const m = /^Section:\s*"(\d+|une?)\s+pages?\s+maximum"/i.exec(d.context);
        return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : 1) : 0;
      };
      const parSection = new Map<string, FieldDesc[]>();
      for (const d of descriptors) if (d.kind === 'answer' && limite(d)) {
        const cle = (d.context.match(/^Section:\s*"([^"]*)"/) || [])[1] || '';
        (parSection.get(cle) ?? parSection.set(cle, []).get(cle)!).push(d);
      }
      for (const liste of parSection.values()) {
        const pages = limite(liste[0]);
        const mots = Math.round((pages * 420) / liste.length / 10) * 10;
        if (liste.length >= 2 && mots < 500) for (const d of liste) d.context += ` | Limite: "${pages} page(s) au total pour les ${liste.length} réponses de cette rubrique : environ ${mots} mots pour celle-ci, sans dépasser"`;
      }
    }
    const prompts: string[] = descriptors.map(buildPrompt);

    console.log(`[MemoireGenerator] Detected ${prompts.length} fillable fields in document.`);
    if (prompts.length === 0) throw new Error("Aucun champ à remplir détecté dans le template Word.");

    // Périmètre réel du marché (évite les contenus de gardiennage à poste fixe hors sujet).
    const blocPerimetreCadre = this.blocPerimetre(await this.perimetreMarche(dceContext));
    // Effectifs proposés à partir des postes, des horaires et du cas pratique du DCE (proposition à valider, D5) : repris
    // par les réponses au lieu de « [À COMPLÉTER] ».
    const texteDuCadre = getElementsWithLocalName(xmlDoc, 'p').map((p: any) => getElementsWithLocalName(p, 't').map((t: any) => t.textContent || '').join('')).filter((t: string) => t.trim()).join('\n').replace(/\[CHAMP_\d+\]/g, '');
    const dimensionnementCadre = await this.dimensionner(dceContext, texteDuCadre, dossierId);
    const systemPrompt = `Tu es un rédacteur chevronné de mémoires techniques pour l'entreprise GSS (Global Security Service, ex-GIS), expert des marchés publics de sécurité privée.
On te fournit (1) l'ANALYSE stratégique et opérationnelle du marché issue du DCE (client, sites, exigences, rapport de visite de Sacha, arguments différenciants de GSS, problématiques terrain anticipées), (2) la DOCUMENTATION GSS (moyens, procédures, organisation, formations… — connaissances internes), (3) les RÉFÉRENTS GSS (dossier « Personnes ») et (4) une liste de champs [CHAMP_X] repérés dans le cadre de réponse de l'acheteur. Tu rédiges la valeur à insérer dans chacun.

SOURCES À EXPLOITER (impératif) : pour CHAQUE champ, appuie-toi sur le DCE (ce que l'acheteur exige) ET sur la Documentation GSS (ce que GSS sait/fait pour y répondre). Pour un champ demandant un interlocuteur/référent/encadrant/contact, utilise les RÉFÉRENTS GSS (« Personnes »). AVANT de répondre, cherche réellement l'information dans CHAQUE bloc source fourni ci-dessous (EXTRAIT DU DCE PERTINENT, DOCUMENTATION GSS PERTINENTE *et* la liste « Autres catégories Doc GSS », RÉFÉRENTS GSS) : l'information y est souvent enfouie plus loin. N'écris EXACTEMENT "[À COMPLÉTER]" (plutôt que d'inventer) QUE si — et seulement si — après cette recherche l'information n'est présente NI dans le DCE, NI dans la Documentation GSS, NI dans les Référents.

══════════════════════════════════════
RÈGLE N°0 — QUI EST QUI (NE JAMAIS CONFONDRE)
══════════════════════════════════════
- LE CANDIDAT / SOUMISSIONNAIRE / "l'entreprise qui exécutera le marché" = GSS (Global Security Service). C'est TOI.
- L'ACHETEUR / CLIENT = l'organisme qui passe le marché (le clientName de l'analyse). Ce N'EST PAS le candidat.
- "Dénomination du candidat" = "GSS - Global Security Service" (JAMAIS le nom de l'acheteur).

══════════════════════════════════════
RÈGLE N°1 — FORMAT DE RÉPONSE (selon le tag de chaque champ)
══════════════════════════════════════
[VALEUR COURTE]   → 1 à 6 mots, valeur brute factuelle (ex: "93 ETP", "Site principal", "Oui"). Pas de phrase d'intro.
[LISTE]           → items séparés par "- " et un saut de ligne (ex: "- CQP APS\n- SSIAP 1").
[PARAGRAPHE]      → paragraphe dense, technique et engageant (5 à 9 phrases développées) qui VEND GSS. Jamais de réponse paresseuse ("Conforme", "Disponible", "Oui"), jamais de généralité interchangeable. Chaque paragraphe doit suivre une logique STRATÉGIQUE : (1) nomme l'enjeu/risque PRÉCIS du client (issu de l'analyse, du CCTP ou de la visite terrain), (2) propose la réponse GSS DIFFÉRENCIANTE qui y répond (un moyen, une méthode, un engagement concret — pas un slogan), (3) explicite le BÉNÉFICE mesurable pour le client. Le lecteur doit sentir que GSS a compris SON enjeu, pas récité un argumentaire générique.
[CASE A COCHER]   → UNIQUEMENT "☑" (GSS se conforme à 100%) ou "☐".
JAMAIS de markdown (pas de **gras**, pas de #). Sauts de ligne et tirets simples uniquement.

══════════════════════════════════════
RÈGLE N°2 — PERSONNALISATION (ce qui fait gagner)
══════════════════════════════════════
- Utilise le nom exact du client, des sites et le contexte de l'analyse pour un texte totalement sur-mesure.
- Exploite les observations de la visite terrain (visitDetails) pour prouver notre connaissance du site.
- Intègre les "proposalStrengths" et les "anticipatedIssues" (avec leur solution GSS) au cœur des [PARAGRAPHE], pour montrer que GSS anticipe des risques non formulés dans le CCTP.
- Décris concrètement : organisation, contrôle CNAPS, gestion des plannings, rondes/pointeaux NFC, PTI/DATI, gestion des alarmes, remplacement d'agents.
- VRAI AVANTAGE : ne te contente pas de "nous assurons X" — formule à chaque fois en quoi la manière GSS de faire X est SUPÉRIEURE (délai chiffré, taux de couverture, redondance, anticipation d'un risque que le concurrent ignore) et ce que le client y gagne concrètement.

══════════════════════════════════════
RÈGLE N°3 — DONNÉES LÉGALES : NE JAMAIS INVENTER
══════════════════════════════════════
Pour tout champ d'identité légale (SIRET, N° CNAPS, NOM du dirigeant, n° d'agrément dirigeant, dates
d'obtention/validité, n° de certification, adresses, coordonnées/téléphone/email) ou tout nom de référent :
n'utilise QUE des valeurs présentes dans l'analyse/DCE, la Documentation GSS ou les Référents GSS
(« Personnes »). Sinon écris EXACTEMENT "[À COMPLÉTER]" (rien d'autre, pas de nom inventé type
"Jean Dupont"). N'invente JAMAIS un nom, un numéro, une date, une adresse ou un contact.
ATTENTION SPÉCIFIQUE AUX COORDONNÉES : les RÉFÉRENTS GSS (« Personnes ») ne contiennent QUE des noms
et des rôles — AUCUN téléphone, AUCUN email, AUCUNE adresse. Donc pour tout numéro de téléphone, email
ou adresse postale qui n'est pas EXPLICITEMENT écrit dans les sources : écris "[À COMPLÉTER]". N'invente
JAMAIS "01 23 45 67 89", "prenom.nom@gss.fr" ni une adresse type "123 Rue de la Sécurité, 75000 Paris".
Pour un champ « coordonnées de l'interlocuteur », réponds le nom + rôle réel du référent puis
"[À COMPLÉTER]" pour le téléphone/email (ex : "MARCHANI Adil, Directeur d'agence — tél/email : [À COMPLÉTER]").

══════════════════════════════════════
RÈGLE N°4 — CADRE RÉGLEMENTAIRE ET SOLUTIONS GSS SPÉCIFIQUES
══════════════════════════════════════
${(() => {
        const mt = detectMarketType(analysisData);
        const sec = detectClientSector(analysisData);
        if (mt === 'public') return `Ce marché est un MARCHÉ PUBLIC (secteur : ${sec}).
- Respecte le vocabulaire du Code de la commande publique : pouvoir adjudicateur, acheteur, titulaire, sous-critères.
- Cite les articles pertinents du CCP et du CCAG-FCS quand approprié.
- Mets en avant les garanties de conformité, les mécanismes de contrôle (pénalités contractuelles, réunions périodiques, rapports de suivi formalisés).
- Souligne l'expérience de GSS auprès d'établissements publics similaires.
- Intègre les obligations de transparence (plannings transmis, CVs anonymisés, extranet).`;
        return `Ce marché est un MARCHÉ PRIVÉ (secteur : ${sec}).
- Adopte un ton commercial plus direct et orienté résultats.
- Mets en avant la flexibilité, la réactivité et les SLA sur mesure.
- Souligne l'adaptation aux process internes et à la culture du client.
- Propose des engagements chiffrés (délais de remplacement, taux de couverture, KPIs personnalisés).
- Mentionne la possibilité de co-construction du dispositif avec le client.`;
      })()}

══════════════════════════════════════
RÈGLE N°5 — CAPITALISER SUR LES MÉMOIRES DÉJÀ RÉDIGÉS PAR GSS
══════════════════════════════════════
${REGLES_REUTILISATION}
- Réponds précisément à la QUESTION du champ : n'utilise un extrait de mémoire que s'il répond à CETTE question.
- Champ court, d'identité ou de contact : une valeur présente dans le REGISTRE DES INFORMATIONS GSS ou dans un extrait de mémoire GSS EST une source valable → donne-la (ne réponds pas « [À COMPLÉTER] » si elle y figure).
- Une certification indiquée « en cours » n'est PAS obtenue : ne la présente jamais comme acquise.
- Dénomination / « NOM » du candidat : écris exactement la raison sociale du registre.${blocRegistre(marcheHorsNormandie(analysisData, dceContext))}${organigrammeGss(referentsContext)}${referencesGss()}${blocPerimetreCadre}${dimensionnementCadre ? texteDimensionnement(dimensionnementCadre) : ''}
${this.blocDemande()}

FORMAT DE RÉPONSE : JSON valide uniquement → {"replacements": [ {"id": 1, "value": "..."} ]}`;

    // Valeurs renvoyées par l'IA (une par champ [CHAMP_n]).
    const replacements: Array<{ id: number; value: string }> = [];

    /** Exécute des tâches avec une concurrence limitée (protège la limite TPM). */
    const runPool = async (jobs: Array<() => Promise<void>>, limit: number): Promise<void> => {
      let idx = 0;
      const worker = async () => { while (idx < jobs.length) { const j = jobs[idx++]; await j(); } };
      await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
    };

    // ── Remplissage QUESTION PAR QUESTION (recherche sémantique + 1 appel IA par champ) ──
    // Chaque champ [CHAMP_n] est traité INDIVIDUELLEMENT : on recherche dans la Documentation GSS
    // et le DCE (index d'embeddings) les passages réellement pertinents pour CE champ, puis on fait
    // UN appel IA dédié pour rédiger sa valeur. Plus de blob générique partagé par 20 champs :
    // chaque réponse est ancrée dans les bonnes sources (« fouiller là où il faut »).
    const retrievalChunks = this.buildRetrievalChunks(gssDocs, dceContext);
    // Chunks Doc GSS pré-embeddés en base (si MEMOIRE_RAG_FROM_DB=true) : on évite de recalculer
    // leurs embeddings à chaque génération. Le DCE (propre au marché) reste embeddé à la volée.
    const dbGss = await this.loadGssChunksFromDb();
    // OpenAI indisponible dès l'indexation (T4N-7 : « Erreur: 503 Service Unavailable » affiché tel quel) : le même message
    // clair que pour l'échec de la rédaction, à relancer ; l'erreur d'origine reste citée (crédit épuisé compris).
    const indisponible = (e: any) => new Error(`Rédaction automatique indisponible (OpenAI) : l'indexation du DCE a échoué (${String(e?.message || e).slice(0, 160)}). Aucun document n'est remis ; relancez la génération.`);
    try {
      if (dbGss && dbGss.length) {
        const dceChunks = retrievalChunks.filter(c => c.source === 'DCE');
        await this.embedChunks(dceChunks);              // seul le DCE est embeddé en direct
        retrievalChunks.length = 0;
        retrievalChunks.push(...dbGss, ...dceChunks);    // GSS depuis la bdd + DCE frais
        console.log(`[MemoireGenerator] Doc GSS chargée depuis la bdd (${dbGss.length} chunks pré-embeddés).`);
      } else {
        await this.embedChunks(retrievalChunks);         // comportement historique (repli)
      }
    } catch (e: any) { throw indisponible(e); }
    // Document complémentaire de la demande particulière : indexé avec les autres sources.
    const chunksComplement = this.chunksDocumentComplementaire();
    if (chunksComplement.length) {
      await this.embedChunks(chunksComplement);
      retrievalChunks.push(...chunksComplement);
      console.log(`[MemoireGenerator] Document complémentaire indexé (${chunksComplement.length} passage(s)).`);
    }
    const gssN = retrievalChunks.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source) && c.embedding).length;
    const dceN = retrievalChunks.filter(c => c.source === 'DCE' && c.embedding).length;
    console.log(`[MemoireGenerator] Index sémantique : ${gssN} chunks Doc GSS + ${dceN} chunks DCE.`);
    setProgress(dossierId, { phase: 'preparation', pct: 24, label: 'Indexation des sources (DCE + Doc GSS)…' });
    if (onProgress) onProgress(24, 'Indexation des sources (DCE + Doc GSS)…');

    // Embeddings de TOUTES les requêtes de champ en un lot → la récupération devient du calcul local.
    let queryEmbs: number[][];
    try { queryEmbs = await this.embedTexts(descriptors.map(d => this.buildFieldQuery(d))); } catch (e: any) { throw indisponible(e); }
    const queryEmbById = new Map<number, number[]>();
    descriptors.forEach((d, i) => queryEmbById.set(d.id, queryEmbs[i]));

    // ── Mémoire type (consigne 5 : « on reprend exactement le mémoire de base ») : texte de GSS publiposté pour ce
    //    marché, rubrique par rubrique ; chaque réponse développée reprend le texte des rubriques qui traitent sa
    //    question. Détection des champs, champs courts, identité, tableaux et cases : inchangés. Retour arrière :
    //    GSS_MEMOIRE_TYPE=non. ──
    const repriseMT = await this.textesMemoireTypeCadre(dossierId, analysisData, dceContext, referentsContext, descriptors, buildPrompt, dimensionnementCadre);
    // Phrases de GSS adaptées au CCTP (D8) : délais normands retirés au publipostage, puis filtres du CCTP ; signalées à GSS.
    const suiviCadre = repriseMT ? this.suiviAdaptations(dossierId, repriseMT.mt, repriseMT.ctx, Object.keys(repriseMT.textes), Object.values(repriseMT.textes)) : null;
    /** Lot événementiel (« LOT 2 : SECURISATION DES MANIFESTATIONS ») : la méthodologie de sécurisation des sites visés est le
     *  dispositif événementiel de GSS (THEMES_CADRE, T5CP-2). */
    const objetLot = texteDuCadre.split('\n').find((l) => /^\s*LOT\s*n?°?\s*\d+\s*[:–-]/i.test(l)) || String(analysisData?.projectTitle || '');
    const lotEvenementiel = !!repriseMT?.prep.indicateurs.EVENEMENTIEL && /manifestations?|[ée]v[ée]nement|festivals?|spectacles?|concerts?/i.test(objetLot);
    /** Questions développées rédigées hors mémoire type (propositions) et reprises à relire, pour GSS. */
    const propositionsCadre = new Map<number, string>();
    const repriseParChamp = new Map<number, { ids: string[]; fidelite: number; brute?: number }>();
    /** Schéma de process de la compréhension du besoin, inséré sous la réponse qui le reprend (consigne 3). */
    const svgComprehension = new Map<number, string>();
    /** Réponses de compréhension restées sans schéma de process (R4-2), signalées à GSS dans les consultations. */
    const alertesComprehension = new Set<string>();
    // Phrases ajoutées par l'IA au texte de GSS d'une réponse du cadre (consigne 5, T5-CONS-6) : signalées à GSS.
    const ajoutsCadreIA = new Set<string>();
    /** Phrases ajoutées par l'IA au texte de GSS, par réponse du cadre (T5-CONS-6) : rapprochées du texte final avant d'être
     *  signalées (T6-CONS-2, T6-COH-1, T6-COH-5 : jamais une phrase qui n'est pas imprimée). */
    const ajoutsParChamp = new Map<number, { libelle: string; phrases: string[] }>();
    // Texte de GSS au sens large (T6-COH-5) : toutes les rubriques du mémoire type, même celles que le marché n'a pas
    // publiées (b2_identite), et les valeurs retenues du registre ; une phrase qui les reprend n'est jamais « ajoutée par l'IA ».
    const textesGssComplets = (() => {
      const mtx = this.memoireTypeV2();
      return [...(mtx?.rubriques || []).map((r: any) => String(r.texte || '').replace(/\{\{[^}]*\}\}/g, ' ')), ...lireRegistre().map((e) => String(e.valeur_retenue || ''))].filter((x) => x.trim());
    })();
    /** Champs dont la rédaction automatique a échoué (OpenAI en panne, réponse illisible) : intitulé, et si le texte du
     *  mémoire type de GSS a été repris tel quel (T4-COH-1). */
    const echecsRedaction = new Map<number, { libelle: string; reference: boolean; developpee: boolean }>();
    /** Texte du mémoire type repris tel quel (rédaction indisponible) : questions exactes de ses emplacements (T7CS-3). */
    const questionsReprise = new Map<number, Array<{ contexte: string; question: string }>>();
    /** Puces d'engagement ajoutées par la couverture du CCTP, par champ (parties limitées en pages). */
    const ajoutsCouvertureCadre = new Map<number, string[]>();
    /** Hauteur maximale (EMU) des schémas par réponse, et place partagée des parties limitées en pages. */
    const hauteurSchemaMax = new Map<string, number>();
    const placeSchemas = new Map<string, { resteEmu: number }>();
    let partiesAjustees: Array<{ titre: string; section: string; pages: number; ids: number[] }> = [];
    /** Texte « Notre compréhension de votre besoin » (rédigé une seule fois, d'après le DCE), pour les questions de compréhension. */
    let comprehensionP: Promise<{ id: string; titre: string; texte: string; svg?: string; formalites?: string[] } | null> | null = null;
    const comprehensionCadre = () => (comprehensionP ||= (async () => {
      if (!repriseMT) return null;
      try {
        const b1 = repriseMT.mt.rubriques.find((r) => r.mode === 'besoin');
        const c = await this.redigerComprehension(repriseMT.prep, repriseMT.ctx, donneesBesoin(repriseMT.prep, repriseMT.ctx), {
          analyse: analyseCompacte(analysisData), format: 'paysage', sansSommaire: true,
          demande: "Cette réponse est placée dans le cadre de réponse imposé par l'acheteur, sous sa question : ne renvoie à aucun bloc ni à aucun numéro de bloc du mémoire (écris « notre réponse : … » sans « développée au bloc n »), ni à aucune rubrique entre guillemets.",
        });
        // Renvoi à un titre absent du cadre (« → notre réponse : « La planification » … », T1-COH-4) : retiré, la phrase reste.
        const intitulesCadre = descriptors.map((d) => d.context).join(' ');
        return { id: b1?.id || 'b1_comprehension', titre: b1?.titre || 'Notre compréhension de votre besoin', texte: renvoisHorsCadreRetires(texteBrut(c.texte), intitulesCadre), svg: c.svg, formalites: c.formalites };
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Compréhension du besoin (cadre) indisponible (${e?.message || e}) : réponse rédigée comme les autres.`);
        return null;
      }
    })());
    /** Rubriques du mémoire type attribuées aux champs développés (une rubrique reprise dans une seule réponse). */
    let attribution: ReturnType<typeof attribuerRubriques> | null = null;

    const strategicCtx = buildStrategicContext('', analysisData);

    // ── Référents par RÔLE (fichier « Personnes » : « NOM Prénom — Rôle1 / Rôle2 ») ──
    // Demande utilisateur : dès qu'un libellé nomme un RÔLE connu (« responsable qualité » →
    // VATTIER Marie, « directeur d'agence » → MARCHANI Adil…), on place LE bon référent de façon
    // DÉTERMINISTE (sans laisser le modèle choisir / inventer).
    const referentRoles: Array<{ name: string; role: string; roleNorm: string }> = [];
    for (const line of referentsContext.split(/\r?\n/)) {
      const m = line.match(/^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/);
      if (!m) continue;
      for (const role of m[2].split('/')) {
        const r = role.trim();
        const rn = normCtx(r);
        if (rn.length >= 8) referentRoles.push({ name: m[1].trim(), role: r, roleNorm: rn });
      }
    }
    referentRoles.sort((a, b) => b.roleNorm.length - a.roleNorm.length);  // rôle le plus spécifique d'abord
    /** Si le libellé mentionne un RÔLE connu d'un référent → « NOM — Rôle », sinon ''. */
    const referentForLabel = (label: string): string => {
      const n = normCtx(label);
      for (const { name, role, roleNorm } of referentRoles) {
        if (!n.includes(roleNorm)) continue;
        // Pôle tenu par plusieurs personnes (référents + mémoires GSS récents) : on les cite toutes.
        const nomsNorm = normCtx(name).replace(/[^a-z]+/g, ' ');
        const autres = personnesDuRole(role).filter((p) => !normCtx(p).split(/[^a-z]+/).filter((w) => w.length >= 3).every((w) => nomsNorm.includes(w)));
        return autres.length ? `${[name, ...autres].join(', ')} — ${role}` : `${name} — ${role}`;
      }
      return '';
    };

    /** Consigne des réponses aux critères d'une GRILLE DE NOTATION (notés composante par composante). */
    const CONSIGNE_GRILLE = `CE CHAMP EST LA RÉPONSE DE GSS À UN CRITÈRE NOTÉ PAR L'ACHETEUR (voir « Barème ») : l'acheteur attribue ses points composante par composante. Cette consigne prime sur celle du paragraphe unique :
- Traite CHAQUE composante listée dans la question, dans l'ordre, sans en omettre aucune : pour chacune, une ligne d'intitulé courte reprenant la composante, puis 3 à 6 phrases concrètes (méthode GSS, moyens, outils, procédure, exemple réel tiré des références GSS). Sépare les composantes par une ligne vide.
- Longueur proportionnée au barème : environ 150 à 250 mots pour 10 points, 300 à 500 mots au-delà. Si la rubrique fixe un nombre de pages maximum, vise environ la moitié de ce volume (≈ 450 mots par page) sans jamais le dépasser ; une rubrique de plusieurs pages appelle une réponse développée sur CHAQUE élément attendu.
- Si un « Critère » parent est indiqué (ex. un cas pratique sur un site précis), applique la réponse à CE cas (site, surface, accès, calendrier) et non en termes généraux.
- Donnée propre à ce marché absente des sources (nombre d'agents dimensionné pour ce site, rotations…) : n'invente rien, écris [À COMPLÉTER] à cet endroit et ajoute sur sa propre ligne : [CONSULTATION REQUISE : <information précise à obtenir de GSS>]. Ne commente jamais l'absence d'information (pas de « non précisé dans les sources », « à confirmer ») : le texte reste rédigé comme la réponse définitive de GSS, avec [À COMPLÉTER] à la place de la donnée.
- Si une composante demande de FOURNIR un document (CV, rapport type, cartes professionnelles, certificats…), décris ce que GSS fournit d'après les sources et ajoute sur sa propre ligne : [CONSULTATION REQUISE : Joindre <document> au mémoire].
- Texte brut : pas de Markdown (ni #, ni **, ni puces « - » ; utilise « • » pour une énumération).
- RÉDACTION : phrases simples, naturelles et exactes, comme les écrirait un responsable d'exploitation de GSS. Le site est déjà décrit par l'acheteur dans le cas pratique : ne recopie JAMAIS la liste de ses caractéristiques (surface, bâtiments, étages, accès, barrières, parking, clôture, quartier) et n'ouvre pas chaque composante par l'« enjeu » du site ; cite au plus UNE caractéristique, une seule fois, quand elle justifie concrètement un choix. Va directement à ce que fait GSS. Pas d'effet dramatique ni de formule creuse. La réponse ne contredit jamais une autre composante (même nombre d'équipes, mêmes responsables).
- Un [À COMPLÉTER] prend la place de la SEULE donnée manquante. Donnée chiffrée : dans une phrase naturelle (« GSS affecte [À COMPLÉTER] agents de sécurité au site », « intervention sous [À COMPLÉTER] minutes »). Donnée qualitative ou descriptive (recours à la sous-traitance, composition nominative…) : sous la forme « Libellé : [À COMPLÉTER]. ». Jamais de tournure du type « est défini comme suit : [À COMPLÉTER] ». Interdit : « est de [À COMPLÉTER] » ou « sont de [À COMPLÉTER] » pour autre chose qu'un nombre, « est la suivante : [À COMPLÉTER] ». Une seule donnée par [À COMPLÉTER], et une même donnée n'est laissée à compléter qu'à un seul endroit de la réponse.
- MISE EN SITUATION / CAS PRATIQUE : jamais « [À COMPLÉTER] agents » ni une fourchette vague (« de 1 à 20 PIF ») : chiffre le dispositif proposé, par catégorie de personnel et par poste (accès public, accès artistes/VIP, PIF, zones sensibles, scène, secours), à partir de la jauge, des accès et du plan décrits, puis la validation par GSS passe par la ligne [CONSULTATION REQUISE]. Une mise en situation notée sur 15 points ou plus appelle au moins 800 mots, et chaque situation décrite (ex. forum ET concert) est traitée complètement.
- CAS PRATIQUE (nombre d'agents, de maîtres-chiens, d'équipes, schéma opérationnel, rotations) : c'est à GSS de proposer son dispositif — propose un dimensionnement ARGUMENTÉ, cohérent avec le site décrit, les créneaux horaires et les profils du DQE s'ils figurent dans les extraits (ex. créneaux 6h-21h / 21h-6h ; agent, agent SSI, maître-chien, encadrant) et avec la réglementation (vacations de 12 h au plus, relèves), puis ajoute sur sa propre ligne [CONSULTATION REQUISE : GSS doit valider le dimensionnement proposé : <résumé chiffré>]. Le même dimensionnement vaut dans toutes les composantes. Si un DQE figure dans les extraits, respecte EXACTEMENT ses blocs (ex. une seule nuit s'il n'en compte qu'une) et ses profils : pour chaque bloc, présente sous forme de lignes « Bloc | profil | effectif en service | effectif pour la rotation », avec une rotation cohérente avec la durée du bloc (une seule vacation de 12 h au plus n'exige pas de relève). Justifie la répartition jour/nuit par les risques du site (ex. intrusion et vandalisme surtout la nuit) et précise si l'encadrant est présent en continu ou ponctuellement — identiquement partout.
- Nombre d'équipes et effectifs demandés ailleurs dans la grille : déduis-les du dimensionnement que tu proposes (ne laisse pas « [À COMPLÉTER] » une donnée que ton propre dimensionnement fixe). Justifie la présence de CHAQUE profil retenu (ex. agent de sécurité incendie : levée de doute sur alarme, vérification des installations ; maître-chien : rondes extérieures et dissuasion la nuit).
- Rétroplanning d'une prestation ponctuelle (bon de commande) : il part de la réception du bon de commande et du délai de mise en place (préparation, briefing, prise de poste, relèves, fin de mission, rapport), jamais du calendrier de démarrage d'un marché annuel (J-30, J-15).
- Chaque document porte le NOM exact que lui donne la composante : un « rapport journalier type » est intitulé « Modèle de rapport journalier » (rubriques à renseigner par l'agent), un « rapport d'exécution rempli » est intitulé « Exemple de rapport d'exécution rempli » — ne les confonds jamais.
- « Rapport d'exécution rempli » : fournis un EXEMPLE REMPLI pour le cas pratique, intitulé « Exemple de rapport d'exécution rempli », avec les horaires et les postes du dispositif proposé et des événements présentés comme types (ronde RAS, levée de doute, etc.) — jamais un modèle aux rubriques vides.
- Schéma opérationnel / répartition des effectifs sur le périmètre : affecte chaque poste à une ZONE du site décrit (accès, bâtiments, étages, parking, clôture) avec ses missions et ses horaires, en plus de la répartition par créneau.
- Composante « Fourniture d'un rapport type / d'un rapport d'exécution / d'un schéma / d'un rétroplanning » : fournis l'OBJET lui-même, sous forme structurée et adaptée au cas (intitulé « Modèle de … », puis lignes « Rubrique : contenu », horaires, cases à renseigner), jamais une simple description de ce qu'il contient.
- Composition des équipes / moyens de l'entreprise : appuie-toi sur l'autorisation CNAPS, les effectifs par qualification du registre et au moins une référence de marché comparable de GSS.
- Délais d'intervention dans un accord-cadre à bons de commande : distingue le délai de mise en place d'une prestation commandée (intervention courante) et le délai de réaction en cas d'urgence ; indique d'où partent les moyens.
- Matériel : choisis celui qui est adapté au site et aux risques (PTI pour un agent isolé, lampes, moyens de communication…) ; n'en propose pas qui soit sans intérêt pour ce site.
- Ne traite pas dans cette réponse ce qui relève d'un AUTRE critère de la grille (voir « Autres critères ») : pas de redite d'un critère à l'autre.
- Pour réduire au minimum ce que GSS doit compléter (SEULEMENT si le site est dans la zone d'intervention habituelle de GSS, en Normandie ; sinon applique la règle d'implantation) : un engagement que GSS a déjà pris de façon générale (valeur du REGISTRE DES INFORMATIONS GSS : délai d'intervention du rondier, mobilisation de l'astreinte, délai PTI, envoi des plannings…) est repris avec sa valeur au lieu d'un [À COMPLÉTER].`;

    /** Autres critères de la grille (pour éviter les redites d'un critère à l'autre). */
    const autresCriteres = (f: FieldDesc): string => {
      const autres = descriptors.filter((d) => d.grille && d.id !== f.id)
        .map((d) => ((d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').split(' : ')[0].slice(0, 120)).filter(Boolean);
      return autres.length ? `Autres critères de la grille (traités ailleurs) : ${autres.join(' | ')}` : '';
    };

    /**
     * Reprise du mémoire type pour un champ du cadre : réponse développée (paragraphe, hors case, cellule de tableau et
     * champ qui demande une valeur), question qui sert à la recherche, question hors mémoire type (cas pratique, mise en
     * situation, d'après son intitulé principal) et question de compréhension du besoin.
     */
    const infosReprise = (f: FieldDesc) => {
      const q = (f.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      const proche = (f.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '';
      const vide = q.replace(/[\s.:;,…\-—–/|()]+/g, '').length === 0;
      const precede = proche.split('/').map(s => s.trim()).filter(Boolean).pop() || '';
      const demande = ((vide ? precede : q) || q || precede).trim();
      const critere = (f.context.match(/Critère:\s*"([^"]*)"/) || [])[1] || '';
      const tableau = f.kind === 'table' || /\|\s*Tableau:/.test(f.context);
      const developpee = buildPrompt(f).includes('[PARAGRAPHE]') && f.kind !== 'checkbox' && !tableau && !!repriseMT && !champValeur(q || demande);
      return {
        developpee,
        // Question qui n'est qu'une consigne de forme (« Le renvoi vers un rapport général… est à proscrire ») : le sujet est
        // pris dans le titre du champ et ses paragraphes voisins (havre2, mesures sociétales).
        questionMT: questionUtileChamp(f.context) || `${q || demande} ${critere}`.trim(),
        sujetReconstruit: !!questionUtileChamp(f.context) && questionUtileChamp(f.context) !== `${q || demande} ${critere}`.trim(),
        hors: questionHorsMemoireType(q || demande, critere),
        // Question du champ seule (sans le critère parent) : composantes nommées (interlocuteur unique, agréments, absence…).
        questionSeule: `${q || demande}`.trim(),
        comprehension: developpee && questionComprehension(q || demande),
        libelle: intitulePrincipal(q || demande),
      };
    };

    /** Traite UN champ : recherche ciblée des passages pertinents + 1 appel IA dédié. */
    const answerField = async (f: FieldDesc, strict = false): Promise<void> => {
      const qEmb = queryEmbById.get(f.id);
      const top = qEmb ? this.retrieve(qEmb, retrievalChunks, 12, this.buildFieldQuery(f)) : [];
      const gssPassages = top.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source));
      const dcePassages = top.filter(c => c.source === 'DCE');
      // Réponses déjà rédigées par GSS sur cette question dans ses mémoires précédents.
      const memoiresChamp = qEmb ? blocMemoires(rechercherMemoires(qEmb, 5, this.buildFieldQuery(f))) : '';
      const fmtBlock = (title: string, cs: RetrievalChunk[]) => cs.length
        ? `\n--- ${title} ---\n` + cs.map((c, i) => `[${c.label} #${i + 1}]\n${c.text}`).join('\n\n') + '\n' : '';
      // Champ qui demande EXPLICITEMENT une personne/contact. On se base sur la QUESTION du champ,
      // pas sur tout le contexte : sinon le simple mot « responsable » d'un titre de section
      // (« Plan qualité interne – responsable qualité ») fait recopier le nom du référent dans TOUS
      // les champs de la section. Les référents ne sont injectés que pour ces champs-là.
      const qRaw = (f.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      const ctxNear = (f.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '';
      const qEmpty = qRaw.replace(/[\s.:;,…\-—–/|()]+/g, '').length === 0;
      // Zone « …… » sans question propre : pour COMPRENDRE ce qu'il faut écrire, on lit le LIBELLÉ qui
      // la précède dans le document (dernier segment du contexte proche). C'est ce libellé qu'on cherche
      // à remplir.
      const precedingLabel = ctxNear.split('/').map(s => s.trim()).filter(Boolean).pop() || '';
      const fieldAsk = ((qEmpty ? precedingLabel : qRaw) || qRaw || precedingLabel).trim();
      // isReferent reste basé sur la VRAIE question (qRaw) — PAS sur le libellé précédent : sinon le
      // nom du référent (« VATTIER Marie ») se réinjecterait dans toutes les lignes « …… » d'une
      // section « responsable qualité » (le flood qu'on a corrigé). On l'injecte là où une personne
      // est explicitement demandée par le libellé propre du champ.
      // On n'injecte un RÉFÉRENT que si le champ DEMANDE EXPLICITEMENT une personne (nom, coordonnées,
      // interlocuteur, contact…). Le simple mot « responsable/directeur » dans un libellé de PROCESS
      // (« responsable qualité », « contrôles par le responsable… ») ne suffit PAS — sinon le nom du
      // référent se retrouve injecté dans des lignes qui n'ont rien à voir (ex. « Certification ISO »).
      const isReferent = /\b(nom|noms|coordonn[ée]es|interlocuteur|personne[s]?\s*(?:à|a)?\s*contacter|courriel|t[ée]l[ée]phone|\bmail\b|\bcontact\b|r[ée]f[ée]rent)\b/i.test(qRaw);
      const hint = buildPrompt(f);
      const isParagraph = hint.includes('[PARAGRAPHE]');

      // CASE À COCHER : on lit l'OPTION propre à la case (texte qui la suit) + l'intitulé commun, pour
      // décider case par case — et ne JAMAIS cocher au hasard.
      const isCheckbox = f.kind === 'checkbox';
      const cbOpt = (f.context.match(/option:\s*"([^"]*)"/) || [])[1] || '';
      const cbInt = (f.context.match(/Intitul[ée]:\s*"([^"]*)"/) || [])[1] || '';

      // Cellule de TABLEAU : on lit la COLONNE (à quel site/département/lot se rapporte la cellule)
      // ET la LIGNE (la nature de l'info demandée) pour répondre à l'INTERSECTION précise — une cellule
      // à la fois, sans recopier la valeur d'une autre colonne.
      const colCell = (f.context.match(/Colonne:\s*"([^"]*)"/) || [])[1] || '';
      const rowCell = (f.context.match(/Ligne:\s*"([^"]*)"/) || [])[1] || '';
      const isTableCell = f.kind === 'table' || /\|\s*Tableau:/.test(f.context);
      // Colonne SITE correspondante dans le DCE : on n'injectera QUE ses données (anti-mélange de colonnes).
      const colTokens = headerTokens(colCell);
      const matchedSiteCol = colTokens.length
        ? this.lastDceSiteCols.find((sc) => sc.tokens.some((t) => colTokens.includes(t)))
        : undefined;

      // Mode B : on NE court-circuite PAS l'IA — elle reformate la cellule pour la lisibilité, mais
      // UNIQUEMENT à partir de la colonne source du site (injectée dans tableGuidance) → pas de mélange
      // de colonnes ; l'invention reste bloquée par les garde-fous (nombres ≥3 non sourcés, nature de
      // ligne, déduplication). (Le remplissage verbatim déterministe reste dispo via siteCellVerbatim.)
      const tableGuidance = (isTableCell && (colCell || rowCell))
        ? `Tu remplis UNE seule cellule de tableau, à l'INTERSECTION de la colonne « ${colCell || '(sans en-tête)'} » et de la ligne « ${rowCell || '(sans libellé)'} ».
(1) Identifie ce que demande la LIGNE (nombre d'agents, horaire, délai, taux…). (2) Repère le site / département / lot de la COLONNE — MÊME s'il est nommé un peu différemment dans les sources : « Campus Pasteur (UFR DESP) » ↔ « Pasteur », « Campus Evreux Tilly-Navarre » ↔ « Evreux » / « lot 2 », « Mont-Saint-Aignan + INSPE » ↔ « Mont Saint Aignan ». (3) Cherche dans les extraits (DCE — surtout l'annexe effectifs/horaires des postes — et Doc GSS) l'information PROPRE À CE SITE pour cette ligne.
RESPECTE LA NATURE DE LA LIGNE (impératif) : réponds UNIQUEMENT avec le TYPE d'information que demande la ligne « ${rowCell || ''} ». Le tableau source a PLUSIEURS lignes par site (nombre d'agents, horaires, volume horaire, période de fermeture…) : ne prends QUE la ligne correspondante. Si la ligne porte sur les MOYENS / EFFECTIFS humains (« moyens humains dédiés », « nombre d'agents »), donne SEULEMENT le nombre et le type d'agents (ex. « 1 chef de poste + 1 agent le matin + 1 agent l'après-midi ») et N'INCLUS PAS les horaires/plages ni les jours (« 09h00-12h30 », « du lundi au vendredi ») — ils appartiennent à la ligne « HORAIRES », pas ici. Inversement, une ligne « horaires » ne reçoit QUE des horaires. NE MÉLANGE JAMAIS les lignes du tableau source.
REMPLIS dès qu'une information existe pour ce site, même formulée autrement ou seulement PARTIELLE (ex. juste le nombre d'agents, ou juste l'horaire) : une réponse partielle FONDÉE sur la source vaut mieux qu'une case vide.
FIDÉLITÉ LITTÉRALE (impératif — QUE du vrai, vérifié) : reprends la formulation de la source TELLE QUELLE (ex. « 1 agent le matin, 1 agent l'après-midi »). N'ADDITIONNE pas et ne convertis pas en « X agents » (si la source dit « 1 agent le matin, 1 agent l'après-midi », n'écris PAS « 2 agents »). N'ARRONDIS pas, ne déduis pas un total. N'AJOUTE AUCUN créneau, horaire ni jour (samedi, soir, renfort, nuit, « 9h00-12h30 », « lundi au samedi »…) qui n'est PAS explicitement écrit dans la cellule source de ce site.
NE COMBLE JAMAIS UN BLANC DE LA SOURCE : si une mention est laissée VIDE dans le DCE (ex. « indice minimum : » suivi de RIEN), n'invente AUCUNE valeur (pas de « 170 », « 160 », ni aucun chiffre/indice/horaire non écrit) — omets la mention ou écris-la sans valeur. Tout nombre que tu écris (indice, horaire, effectif) doit figurer LITTÉRALEMENT dans la source de CE site ; sinon ne l'écris pas.
INTERDITS : recopier la valeur d'une AUTRE colonne/site ; inventer une donnée factice ; réutiliser un nombre qui parle d'autre chose (ex. la pénalité « retard d'ouverture 15 min », le « 12 heures » des agents supplémentaires) pour un délai d'intervention. N'écris "[À COMPLÉTER]" QUE si AUCUNE information sur CE site pour cette ligne n'existe dans les sources.${matchedSiteCol ? `\n\nDONNÉES DU SITE « ${colCell} » UNIQUEMENT (extrait du DCE — n'utilise QUE ces lignes, et SEULEMENT celle qui correspond à la ligne demandée) :\n${matchedSiteCol.block.slice(0, 2500)}` : (this.lastDceTables.trim() ? `\n\nTABLEAUX DU DCE (chaque cellule est étiquetée « ligne — en-tête de colonne: valeur » ; CHERCHE ICI en priorité la valeur propre à ce site) :\n${this.lastDceTables.slice(0, 6000)}` : '')}`
        : '';

      // RÔLE NOMMÉ → RÉFÉRENT déterministe : UNIQUEMENT si le champ demande explicitement une personne
      // (isReferent) ET que sa PROPRE question (qRaw, pas un libellé voisin) nomme un rôle connu
      // (« coordonnées du responsable qualité » → VATTIER). On NE déclenche PAS sur un « responsable »
      // d'un libellé de process voisin (évite « VATTIER » sous « Certification ISO/APSAD »).
      // Tableau nominatif d'agents (formations, habilitations : NOM / Prénom / Date) : les agents affectés
      // ne sont pas connus à ce stade → à compléter, jamais un paragraphe dans la cellule.
      if (isTableCell && /^\s*(nom|pr[ée]nom|dates?)\b/i.test(colCell) && /formation|sst|cqp|ssiap|habilitation|dipl[ôo]me|intitul|recyclage|carte/i.test(`${rowCell} ${f.context}`) && !/dirigeant|entreprise/i.test(rowCell)) {
        replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return;
      }
      const refMatch = isReferent ? referentForLabel(qRaw) : '';
      if (refMatch && !isParagraph) { replacements.push({ id: f.id, value: refMatch }); return; }

      // Bloc de contacts du candidat (« Contact administratif / comptable / commercial » : Prénom, Nom ; téléphone ;
      // adresse électronique) : le contact administratif est le dirigeant (coordonnées de l'entreprise), le contact
      // commercial le responsable commercial du registre ; le service comptable de GSS n'est pas connu. Une ligne
      // directe ou une adresse personnelle inconnue reste à compléter (jamais le numéro d'une autre personne).
      const groupe = normCtx((f.context.match(/Groupe:\s*"([^"]*)"/) || [])[1] || '');
      if (groupe && !isParagraph && !isTableCell) {
        const nq = normCtx(fieldAsk);
        const estNom = /\bnom\b|prenom/.test(nq);
        const estTel = /telephone|\btel\b/.test(nq);
        const estMail = /mail|electronique|courriel/.test(nq);
        if (estNom || estTel || estMail) {
          const prenomNom = (v: string) => { const m = v.trim().split(/\s+/); const p = m.pop() || ''; return m.length ? `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()} ${m.join(' ').toUpperCase()}` : v.trim(); };
          let val = '[À COMPLÉTER]';
          if (/comptab|factur/.test(groupe)) val = '[À COMPLÉTER]';
          else if (/commercial/.test(groupe)) val = estNom && valeurRegistre('responsable_commercial') ? prenomNom(valeurRegistre('responsable_commercial')) : '[À COMPLÉTER]';
          else if (/administrati|contact|interlocuteur|suivi|march/.test(groupe)) {
            val = (estNom ? (valeurRegistre('dirigeant') ? prenomNom(valeurRegistre('dirigeant')) : '')
              : estTel ? valeurRegistre('telephone_contact') : valeurRegistre('email_contact')) || '[À COMPLÉTER]';
          }
          replacements.push({ id: f.id, value: val }); return;
        }
      }
      // Bloc de signature et coordonnées de l'entreprise : valeurs du registre (dirigeant, qualité, téléphone, courriel).
      if (!isParagraph && !isTableCell) {
        const nq = normCtx(fieldAsk);
        const dirigeant = (valeurRegistre('dirigeant') || '').replace(/\b([A-Z])([A-Z]+)$/, (_m, a, b) => a + b.toLowerCase());
        if (/soussign/.test(nq) && dirigeant) { replacements.push({ id: f.id, value: dirigeant }); return; }
        if (/agissant en qualite|en qualite de|qualite du signataire|fonction du signataire/.test(nq)) { replacements.push({ id: f.id, value: 'Dirigeant de GLOBAL SECURITY SERVICES' }); return; }
        if (/^(?:nom du )?dirigeant\b|nom du (?:representant|gerant)/.test(nq) && dirigeant) {
          // « Nom du dirigeant et N° agrément dirigeant CNAPS » : les deux.
          const agd = /agrement/.test(nq) ? valeurRegistre('agrement_dirigeant') : '';
          replacements.push({ id: f.id, value: agd ? `${dirigeant} — agrément dirigeant CNAPS ${agd}` : dirigeant }); return;
        }
        if (/agrement (?:du )?dirigeant/.test(nq) && valeurRegistre('agrement_dirigeant')) { replacements.push({ id: f.id, value: valeurRegistre('agrement_dirigeant') }); return; }
        if (/^(?:n° de )?(?:telephone|tel)\b/.test(nq) && !/agent|site|astreinte|permanence/.test(nq) && valeurRegistre('telephone_contact')) { replacements.push({ id: f.id, value: valeurRegistre('telephone_contact') }); return; }
        if (/^(?:courriel|e-?mail|mail|adresse electronique)\b/.test(nq) && valeurRegistre('email_contact')) { replacements.push({ id: f.id, value: valeurRegistre('email_contact') }); return; }
        if (/^adresse\s*:?$/.test(nq.trim()) && GSS_IDENTITE.adresse) { replacements.push({ id: f.id, value: GSS_IDENTITE.adresse }); return; }
        // « NOM : » seul dans la présentation du prestataire ou du candidat (etampes1, T8N-4) : la raison sociale du registre,
        // comme l'adresse ; jamais le nom d'un contact (« Contact pour la facturation : Nom : », personne à indiquer).
        if (/^nom\s*:?$/.test(nq.trim()) && GSS_IDENTITE.denomination) {
          const section = normCtx((f.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '');
          const voisinage = normCtx((f.context.match(/Contexte:\s*"([^"]*)"/) || [])[1] || '');
          // Présentation reconnue par sa section, ou par les champs voisins de l'identité de l'entreprise (« ADRESSE : »,
          // « SIRET : », etampes1 et etampes2 où la section lue est la ligne « NOM : … » elle-même).
          const k = descriptors.findIndex((x) => x.id === f.id);
          const identiteVoisine = descriptors.slice(Math.max(0, k - 3), k + 4).filter((x) => x.id !== f.id)
            .some((x) => /^(?:adresse|siret|siren|raison sociale|forme juridique|code (?:naf|ape)|n° (?:siret|tva))\b/.test(normCtx((x.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').trim()));
          if ((/prestataire|candidat|soumissionnaire|entreprise|societe|titulaire|attributaire/.test(section) || identiteVoisine) && !/contact|interlocuteur|responsable|referent|correspondant|signataire|representant|dirigeant|gerant/.test(`${section} ${voisinage}`)) {
            replacements.push({ id: f.id, value: GSS_IDENTITE.denomination }); return;
          }
        }
      }
      // IDENTITÉ CANDIDAT connue → valeur DÉTERMINISTE : dénomination, N° CNAPS, date d'autorisation
      // sont des données stables de GSS (cf. GSS_IDENTITE) ; on les place sans appel IA ni risque
      // d'inventer/de répondre « [À COMPLÉTER] ». (Pas pour un [PARAGRAPHE] : on laisse rédiger.)
      // Cellule d'un tableau d'autorisations : la COLONNE dit quelle donnée écrire (la ligne « Autorisation
      // entreprise » ne veut pas dire que chaque cellule reçoit le n° CNAPS).
      // Tableau des autorisations CNAPS (havre1) : ligne « Autorisation dirigeant » → dirigeant et son agrément AGD ;
      // ligne « Autorisation entreprise » → dénomination, autorisation AUT et sa date (registre, valeurs confirmées).
      if (isTableCell && /autorisation|agr[ée]ment/i.test(rowCell) && /dirigeant|entreprise|soci[ée]t[ée]/i.test(rowCell)) {
        const dirigeantLigne = /dirigeant/i.test(rowCell);
        const nomDirigeant = (valeurRegistre('dirigeant') || '').trim().split(/\s+/).map((m, i) => (i === 0 ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())).join(' ');
        const val = /^\s*nom\b/i.test(colCell) ? (dirigeantLigne ? nomDirigeant : 'GLOBAL SECURITY SERVICES')
          : /n°|num[ée]ro/i.test(colCell) && /agr[ée]ment|autorisation/i.test(colCell) ? valeurRegistre(dirigeantLigne ? 'agrement_dirigeant' : 'autorisation_cnaps')
          : /d[ée]livrance|obtention/i.test(colCell) && !/validit/i.test(colCell) ? (dirigeantLigne ? valeurRegistre('date_agrement_dirigeant') || '[À COMPLÉTER]' : valeurRegistre('date_autorisation_cnaps'))
          // Dates encore inconnues (question posée une seule fois à GSS, questions_gss_une_fois) : reportées au registre,
          // elles sont écrites dans tous les cadres.
          : /validit|expir/i.test(colCell) ? valeurRegistre(dirigeantLigne ? 'fin_validite_agrement_dirigeant' : 'fin_validite_autorisation_cnaps') || '[À COMPLÉTER]' : '';
        if (val) { replacements.push({ id: f.id, value: val }); return; }
      }
      if (isTableCell && /activit/i.test(colCell) && /autorisation|cnaps|agr[ée]ment|dirigeant/i.test(`${rowCell} ${f.context}`)) {
        replacements.push({ id: f.id, value: /dirigeant/i.test(rowCell) ? 'Dirigeant d\u2019entreprise de surveillance et de gardiennage' : 'Surveillance humaine et gardiennage (activités privées de sécurité, livre VI du CSI)' });
        return;
      }
      if (isTableCell && /validit|fin\b|expir|[ée]ch[ée]ance/i.test(colCell)) { replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return; }
      // Tableau des contacts du candidat : le service comptable / facturation de GSS n'est pas connu (jamais
      // celui de l'acheteur) ; le suivi du marché est assuré par le responsable de marché (registre).
      if (isTableCell && /comptab|factur/i.test(rowCell)) { replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return; }
      if (isTableCell && /suivi du march|responsable (?:d[ée]sign|du march)|interlocuteur|r[ée]f[ée]rent/i.test(rowCell)) {
        const dir = (valeurRegistre('dirigeant') || '').trim().split(/\s+/);
        const val = /pr[ée]nom/i.test(colCell) ? (dir[1] ? dir[1].charAt(0) + dir[1].slice(1).toLowerCase() : '')
          : /^\s*nom\b/i.test(colCell) ? (dir[0] || '')
          : /t[ée]l/i.test(colCell) ? valeurRegistre('telephone_contact')
          : /mail|[ée]lectronique|courriel/i.test(colCell) ? valeurRegistre('email_contact') : '';
        if (val) { replacements.push({ id: f.id, value: val }); return; }
      }
      const idMatch = identiteCandidatForLabel(isTableCell && colCell ? `${colCell} ${rowCell}` : fieldAsk);
      if (idMatch && !isParagraph) { replacements.push({ id: f.id, value: idMatch }); return; }

      // Identité d'une PERSONNE DIRIGEANTE (nom du dirigeant + n° d'agrément dirigeant CNAPS) :
      // ABSENTE de nos sources (le fichier « Personnes » liste des RÔLES d'exploitation, pas le
      // dirigeant légal ; et l'agrément dirigeant ≠ l'autorisation de l'entreprise). → [À COMPLÉTER]
      // DÉTERMINISTE : on empêche le modèle d'y coller un référent + le n° d'autorisation entreprise
      // (= invention que les garde-fous ne rattrapent pas, ce n° étant par ailleurs « sourcé »).
      if (!isParagraph && /\b(dirigeant|g[ée]rant|repr[ée]sentant l[ée]gal)\b/.test(normCtx(fieldAsk))) {
        replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return;
      }


      // EFFECTIF TOTAL de l'entreprise / en France → somme DÉTERMINISTE de toutes les catégories
      // (EFFECTIFS MOYENS.pdf). On EXCLUT les variantes par département / par site / dédiées au
      // marché (inconnues → [À COMPLÉTER]), pour ne pas y coller le total entreprise.
      const nqEff = normCtx(fieldAsk);
      // Champ de VALEUR « Effectif … (transmis pour information) : …… » (même en zone de plusieurs lignes) : la seule
      // valeur publipostée du mémoire type (b2_identite : {{EFFECTIF_TOTAL}} salariés, dont {{EFFECTIF_76}} en
      // Seine-Maritime et {{EFFECTIF_27}} dans l'Eure), sans rédaction du modèle.
      if (/effectif/.test(nqEff) && champValeur(fieldAsk) && !/(dedie|au marche|affecte|par poste|\bsite\b|\betp\b)/.test(nqEff)) {
        const cleEff = /(\b76\b|seine.maritime)/.test(nqEff) ? 'effectif_departement_76'
          : /(\b27\b|\beure\b)/.test(nqEff) ? 'effectif_departement_27'
            : /(total|entreprise|france|national)/.test(nqEff) && !/departement/.test(nqEff) ? 'effectif_total' : '';
        if (cleEff) {
          const n = (/\d+/.exec(valeurRegistre(cleEff)) || [''])[0];
          replacements.push({ id: f.id, value: n ? `${n} salariés` : '[À COMPLÉTER]' });
          return;
        }
      }
      if (!isParagraph && effectifTotal) {
        const isTotalFrance = /effectif/.test(nqEff) && /total/.test(nqEff)
          && /(entreprise|france|national)/.test(nqEff)
          && !/(departement|\b76\b|\b27\b|\bsite\b|dedie|au marche|par poste)/.test(nqEff);
        // Effectif total : valeur du registre (mémoires GSS datés) prioritaire sur l'ancienne somme des catégories.
        if (isTotalFrance) { replacements.push({ id: f.id, value: valeurRegistre('effectif_total') ? `${valeurRegistre('effectif_total')} salariés` : `${effectifTotal.total} agents` }); return; }
      }
      // Effectif / agents / ETP DÉDIÉS au marché : le dimensionnement propre à CE marché n'est PAS
      // déterminable de façon fiable (l'Annexe 1 du DCE donne des postes/horaires non agrégeables
      // proprement) → [À COMPLÉTER] DÉTERMINISTE, plutôt que d'y coller l'effectif ENTREPRISE (ex. 93)
      // ou un ETP deviné. (Le vrai dédié relève du chiffrage de l'offre → validation humaine.)
      if (!isParagraph && /(effectif|agents?|\betp\b)/.test(nqEff) && /(dedie|au marche|affecte au marche)/.test(nqEff)) {
        replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return;
      }

      // Champ d'IDENTITÉ / LÉGAL / CONTACT : valeur qui ne peut PAS se déduire, elle doit exister
      // telle quelle dans les sources (nom de personne, SIRET/SIREN, CNAPS, agrément, certification,
      // date, adresse, siège, téléphone, email). On y applique la règle stricte « verbatim ou rien ».
      const isStrictId = /siret|siren|\bcnaps\b|agr[ée]ment|autorisation|certification|kbis|\bdate\b|adresse|si[èe]ge|d[ée]nomination|raison sociale|t[ée]l[ée]phone|\btel\b|email|\bmail\b|courriel|coordonn[ée]es/i.test(f.context)
        || isReferent;

      // Consigne adaptée au TYPE de champ — 3 niveaux :
      //  1) [PARAGRAPHE] → argumentaire sur-mesure qui vend GSS (ce qui marche déjà bien) ;
      //  2) champ COURT FACTUEL non-identité (effectif, taux, qualification, conformité, délai…) →
      //     réponse BRÈVE, synthétisée À PARTIR des sources (on autorise le calcul/synthèse) ;
      //  3) champ d'IDENTITÉ/LÉGAL/CONTACT → « verbatim ou [À COMPLÉTER] » : PAS DE DONNÉE INVENTÉE.
      const instruction = isCheckbox
        ? `Cette CASE À COCHER correspond à l'option « ${cbOpt || '(option non identifiée)'} »${cbInt ? ` (intitulé : « ${cbInt} »)` : ''}.
LIS bien le libellé de CETTE option et décide pour ELLE SEULE. Principe : COCHE CE QUE TU SAIS, ne coche PAS ce que tu ignores.
- Réponds "☑" si les extraits (DCE ou Documentation GSS) montrent que CETTE option est VRAIE / que GSS la fait, la propose ou la détient — autrement dit si tu SAIS qu'elle s'applique (ex. un engagement, un moyen, une procédure que la Doc GSS décrit). Si tu connais/fournis le contenu de cette option, alors COCHE-la : ne rédige pas le contenu en laissant la case vide.
- Réponds "☐" si l'option est FAUSSE pour GSS, ou si tu ne SAIS pas (information absente/incertaine, donnée que GSS ne maîtrise pas comme un statut PME, un lot non décidé…). Ne coche jamais au hasard ni « parce que ça paraît logique ».
Réponds STRICTEMENT "☑" ou "☐", rien d'autre.`
        : isParagraph
          ? `Rédige un paragraphe dense, technique et personnalisé qui répond à l'attente de l'acheteur et met en avant la valeur de GSS, en t'appuyant UNIQUEMENT sur les extraits ci-dessus.
STRATÉGIE & ATTRACTIVITÉ : le paragraphe doit faire comprendre CE QUE GSS APPORTE au client — sa valeur ajoutée et son engagement. Structure-le : (1) l'enjeu/risque concret du marché, (2) la réponse GSS DIFFÉRENCIANTE (un moyen, une méthode ou un engagement précis tiré des extraits — pas un slogan), (3) le bénéfice tangible pour le client (fiabilité, réactivité, continuité, expertise, accompagnement). Ton commercial, affirmé et rassurant : on doit avoir envie de choisir GSS. Évite le descriptif plat « nous faisons X » → montre EN QUOI la manière GSS est supérieure et ce que le client y gagne.
PERSONNALISATION & STRATÉGIE (priorité) : ancre le propos dans le CONTEXTE RÉEL du marché (type d'organisation, usagers, sites/campus concernés, départements, calendrier d'activité, fréquentation, contraintes et RISQUES propres) et METS EN AVANT UN AVANTAGE concret de GSS adapté à CE contexte — ce que le client GAGNE (fiabilité, réactivité, continuité de service, expertise, anticipation d'un risque). Choisis l'angle le plus PERTINENT pour le sujet du champ ; le texte doit être impossible à recycler pour un autre client.
NOM DU CLIENT — ANTI-REDONDANCE (impératif) : cite le nom complet de l'acheteur AU PLUS UNE FOIS dans le paragraphe (souvent inutile de le citer du tout). Pour toute autre référence, VARIE avec des substituts (« l'établissement », « vos campus », « le site concerné », « votre organisation », « ce marché »). NE répète JAMAIS « Université de Rouen Normandie » plusieurs fois dans le même paragraphe et ne le colle pas en fin de paragraphe. La personnalisation passe par le CONTEXTE et les ENJEUX, pas par la répétition du nom.
INTERDICTION D'INVENTER (PRIORITAIRE) : n'affirme AUCUN fait, chiffre ou détail précis absent des extraits. Proscrits s'ils ne figurent pas littéralement dans les sources : un délai chiffré (« 60 minutes », « moins d'une heure »), un effectif, un taux, une distance, un équipement précis (ex. « gilets pare-lame », « gants anti-feu »), un lieu précis (ex. véhicule stationné à tel campus), un nom, une date, un numéro. Décris la MÉTHODE et l'organisation de GSS de façon qualitative et reste VAGUE là où la source l'est (ex. « un agent d'astreinte est mobilisé » sans inventer de durée). Mieux vaut une formulation générale EXACTE qu'un détail précis INVENTÉ. Tu peux réutiliser les chiffres réellement présents dans les extraits (ex. recyclage SSIAP tous les 3 ans, préavis d'absence de 24h).
ANTI-ÉCHO DE LA QUESTION : si la QUESTION de l'acheteur mentionne un équipement, une certification, un moyen ou une prestation (ex. « gilets pare-lame / pare-balle », un logiciel, une norme), NE confirme PAS que GSS le fournit/le détient au seul motif que la question le cite — ne l'affirme QUE si un extrait de la Documentation GSS l'atteste explicitement. Sinon, n'en parle pas (ou reste sur ce que GSS documente réellement). Ne transforme jamais la demande de l'acheteur en capacité GSS non sourcée.`
          : isStrictId
            ? `Ce champ attend une donnée d'IDENTITÉ/LÉGALE/CONTACT précise. Donne UNIQUEMENT la valeur — aucune phrase, aucun argumentaire.
RÈGLE ABSOLUE — AUCUNE DONNÉE INVENTÉE : la valeur (nom de personne, date, n° SIRET/SIREN, n° CNAPS, agrément, certification, adresse, téléphone, email) doit figurer EXPLICITEMENT dans les extraits ci-dessus (DCE, Documentation GSS ou Référents). Sinon écris EXACTEMENT "[À COMPLÉTER]" et RIEN d'autre. N'invente JAMAIS, ne déduis JAMAIS et n'utilise JAMAIS d'exemple générique (proscrits : "Jean Dupont", "01/01/2020", "01 23 45 67 89", "prenom.nom@gss.fr", un SIRET au hasard). En cas de doute → "[À COMPLÉTER]".`
            : `Ce champ attend une réponse COURTE et FACTUELLE (quelques mots, une valeur, une liste, ou Oui/Non). Donne UNIQUEMENT la réponse — aucune phrase, aucun argumentaire.
RÈGLE DE FIABILITÉ (PRIORITAIRE) — deux faces indissociables :
1) Si l'information figure dans les extraits ci-dessus, tu DOIS la donner : ne réponds JAMAIS "[À COMPLÉTER]" par excès de prudence quand la donnée EST présente (lis bien CHAQUE extrait, l'info y est parfois enfouie : un effectif, une qualification, un délai, un nom de certification, un outil…).
2) Si l'information n'y figure PAS, écris EXACTEMENT "[À COMPLÉTER]". Mieux vaut une case vide qu'une donnée non fiable.
- N'invente, ne déduis, ne calcule ni n'extrapole AUCUNE donnée chiffrée, nominative ou légale (effectif, ETP, taux, délai, nom, date, SIRET, CNAPS, adresse, téléphone, email, montant) absente des sources.
- NE DÉTOURNE PAS une donnée GÉNÉRALE / D'ENTREPRISE pour répondre à une question SPÉCIFIQUE : un effectif TOTAL de l'entreprise (ou national) ne répond PAS à « effectif/agents DÉDIÉS à ce marché », ni « par département », ni « par site ». Si la valeur PROPRE à la question (dédiée au marché, à ce département, à ce site) n'est pas explicitement dans les extraits → "[À COMPLÉTER]".
- NE RECOPIE PAS l'intitulé de la question, ni les libellés des cases à cocher, ni les options proposées, comme si c'était une réponse.
En cas de doute → "[À COMPLÉTER]".`;

      // Réponse développée : textes du mémoire type candidats pour cette question (le modèle reprend ceux qui la traitent).
      // Champ qui demande une valeur (effectif, « si oui… ») : traité comme avant, sans texte de référence.
      const reprise = infosReprise(f);
      const developpee = reprise.developpee;
      const questionMT = reprise.questionMT;
      // Limite de pages, ou critère de grille (longueur fixée par le barème, réponse par composante) : la reprise intégrale
      // n'est pas toujours possible ; la fidélité retient aussi la part de la réponse venue du texte de GSS.
      const limiteChamp = /Limite:|pages? maximum/i.test(f.context) || !!f.grille;
      // Question de compréhension du besoin : le texte « Notre compréhension de votre besoin » (rédigé d'après le DCE) est
      // la référence ; son schéma de process est inséré sous la réponse. Autres questions : rubriques attribuées à ce champ
      // (une rubrique reprise dans une seule réponse ; les autres champs y renvoient).
      const comprehension = reprise.comprehension ? await comprehensionCadre() : null;
      // Formalités de l'offre retirées du bloc 1 (T6-CONS-12) : posées à GSS.
      for (const x of comprehension?.formalites || []) alertesComprehension.add(questionFormalite({ exigence: x }));
      const candidats: CandidatReference[] = !developpee ? []
        : comprehension ? [{ cle: 'R1', id: comprehension.id, titre: comprehension.titre, texte: comprehension.texte, score: 1 }]
          : attribution?.candidats.get(f.id) ?? candidatsReference(repriseMT!.mt, repriseMT!.textes, questionMT, { scores: repriseMT!.scores.get(f.id), hors: reprise.hors, secondeLexicale: reprise.sujetReconstruit, questionSeule: reprise.questionSeule, evenementiel: lotEvenementiel });
      const renvois = developpee && !comprehension ? attribution?.renvois.get(f.id) || [] : [];
      const userPrompt = `Analyse du marché (contexte de rédaction) :
${analysisJson}

--- CONTEXTE STRATÉGIQUE GSS ---
${strategicCtx}
${fmtBlock("EXTRAITS PERTINENTS DU DCE (exigences de l'acheteur)", dcePassages)}${fmtBlock('DOCUMENTATION GSS PERTINENTE (sources internes — appuie ta réponse dessus)', gssPassages)}${memoiresChamp}${isReferent && referentsContext ? `\n--- RÉFÉRENTS GSS (« Personnes ») ---\n${referentsContext}\nLIS BIEN LE LIBELLÉ : s'il demande UNE personne (singulier : « la personne », « l'interlocuteur », « le contact ») → donne EXACTEMENT UN référent, le plus pertinent au regard du libellé (le rôle nommé s'il y en a un ; sinon l'interlocuteur principal du marché). NE recopie PAS toute la liste. Il ne faut PLUSIEURS personnes QUE si le libellé le demande explicitement (« les personnes », « liste », « organigramme »).\n` : ''}
CHAMP UNIQUE À RÉDIGER :
${hint}

${instruction}
${f.grille ? CONSIGNE_GRILLE + '\n' + autresCriteres(f) + '\n' : ''}${tableGuidance ? tableGuidance + '\n' : ''}${fieldAsk && fieldAsk !== f.context ? `${qEmpty ? `Cette zone à remplir (les pointillés « … ») fait suite, dans le document, au libellé qui la PRÉCÈDE : « ${fieldAsk} ». LIS ce libellé pour comprendre ce qui est attendu et remplis la zone en conséquence.` : `RESTE SUR LE SUJET DE CETTE QUESTION : « ${fieldAsk} ».`} Ne réponds pas sur un thème VOISIN (ex. ne parle pas des moyens d'accès/clés si le sujet est le report des alarmes). Si les extraits apportent une information MÊME PARTIELLE sur CE sujet, donne une réponse (au moins partielle) fondée dessus plutôt que de laisser vide — sans rien inventer. N'écris "[À COMPLÉTER]" QUE si rien d'utile sur ce sujet n'est disponible.\n` : ''}${blocReference(candidats, { limite: limiteChamp, strict, grille: !!f.grille })}${blocRenvois(renvois)}Renvoie UNIQUEMENT un objet JSON : {"id": ${f.id}, "value": "..."${candidats.length ? ', "reference": ["R1"]' : ''}}`;

      // Températures basses = fidélité aux sources (priorité « 0 inventé ») : on baisse la rédaction
      // de paragraphe de 0.4 → 0.2 pour limiter les détails « brodés » non sourcés.
      // Cellule de tableau → 0.1 (fidélité littérale max à la source, pas de reformulation/recompte).
      const temperature = isTableCell ? 0.1 : isParagraph ? 0.2 : isStrictId ? 0.1 : 0.2;
      const label = `Champ ${f.id}`;
      const aiResponse = await this.callOpenAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature, label, true, 'redaction', 0,
      );
      // Rédaction impossible (OpenAI en panne, réponse vide ou illisible) : réponse développée → texte du mémoire type de GSS
      // repris tel quel (comme la réponse libre, « texte de référence conservé ») et signalé à relire ; sinon champ signalé.
      const echec = () => {
        let lib = libelleQuestionCadre(String(questionMT || '').replace(/\[CHAMP_\d+\]/gi, '').trim() || intitulePrincipal(((f.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').replace(/\[CHAMP_\d+\]/gi, '')) || `Champ ${f.id}`);
        // Libellé court répété dans le cadre (« Nom », « Coordonnées complètes ») : précédé du titre qui le porte dans le document
        // (« Contact pour la facturation — Nom »), pour que GSS sache quelle ligne compléter (havre1, T8CS-3).
        const caseT = /Colonne:\s*"([^"]*)"\s*\|\s*Ligne:\s*"([^"]*)"/.exec(f.context);
        if (caseT) lib = questionCaseTableau(caseT[2], caseT[1]).replace(/\s*:\s*quelle valeur faut-il écrire \?$/, '');
        else if (lib.split('(')[0].trim().split(/\s+/).length <= 4) {
          // Titre dans le contexte du champ, sinon dans celui des champs qui le précèdent dans la même section (« Coordonnées
          // complètes » sous « Contact pour les commandes : Nom : … »).
          const titreDe = (ctx: string) => ((ctx.match(/Contexte:\s*"([^"]*)"/) || [])[1] || '').split(' / ').reverse()
            .map((x) => x.replace(/\[CHAMP_\d+\]/gi, '').replace(/[\s:.…_]+$/, '').trim())
            .find((x) => x.split(/\s+/).length >= 3 && !/^\(/.test(x) && !x.toLowerCase().startsWith(lib.toLowerCase().split('(')[0].trim())) || '';
          const section = (f.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '';
          const k = descriptors.findIndex((x) => x.id === f.id);
          let titre = titreDe(f.context);
          for (let j = k - 1; !titre && j >= Math.max(0, k - 3); j--) {
            if (((descriptors[j].context.match(/Section:\s*"([^"]*)"/) || [])[1] || '') !== section) break;
            titre = titreDe(descriptors[j].context);
          }
          if (titre) lib = `${titre} — ${lib}`;
        }
        // Tous les textes de GSS attribués à cette réponse (les mêmes que le chemin normal sans le choix du modèle), dans l'ordre
        // de la question, jamais le premier seul (citedia2 474, T10C-3 : sous-critère des moyens humains réduit à l'adéquation).
        // Reprise enregistrée (fidélité 1) : phrases adaptées au CCTP signalées (D8), schéma de la bibliothèque et questions
        // d'échéance comme pour une réponse rédigée.
        const secours = developpee && candidats.length ? referencesDeSecours(candidats, `${questionMT || ''}\n${f.context}`) : [];
        const textes = secours.map((c) => ({ c, t: texteBrut(String(c.texte || '')).trim() })).filter((x) => x.t);
        const ref = textes.map((x) => (textes.length > 1 && !comprehension ? `${String(x.c.titre || '').replace(/[.:\s]+$/, '')}\n${x.t}` : x.t)).join('\n\n');
        if (ref) {
          replacements.push({ id: f.id, value: ref });
          questionsReprise.set(f.id, textes.flatMap((x) => repriseMT?.emplacements?.[x.c.id] || []));
          repriseParChamp.set(f.id, { ids: textes.map((x) => x.c.id), fidelite: 1, brute: 1 });
          console.warn(`[MemoireGenerator] Champ ${f.id} : rédaction indisponible, texte du mémoire type repris tel quel (${textes.map((x) => x.c.id).join(', ')} ; candidats : ${candidats.map((c) => c.id).join(', ')}${renvois.length ? ` ; repris ailleurs : ${renvois.map((r) => r.titre).join(', ')}` : ''}).`);
          if (comprehension?.svg && ![...svgComprehension.keys()].some((id) => id !== f.id)) svgComprehension.set(f.id, comprehension.svg);
          else if (comprehension && !comprehension.svg) alertesComprehension.add(`Réponse « ${lib} » : le schéma de process de la compréhension du besoin n'a pas pu être dessiné ; à demander via l'assistant avant la remise.`);
          // Éléments attendus du cadre qu'aucun texte repris ne traite : nommés à GSS (même règle que le chemin normal, T4N-4).
          const attendusE = attendusDuChamp(f.context).length ? attendusDuChamp(f.context) : attendusDuChamp(String(questionMT || ''));
          const sansRep = attendusSansReponse(ref, attendusE);
          propositionsCadre.set(f.id, `Réponse à relire (rédaction automatique indisponible : texte du mémoire type de GSS repris tel quel${sansRep.length ? ` ; élément${sansRep.length > 1 ? 's' : ''} attendu${sansRep.length > 1 ? 's' : ''} sans réponse : ${sansRep.map((x) => `« ${x} »`).join(', ')}` : ''}) : ${lib}`);
        }
        echecsRedaction.set(f.id, { libelle: lib, reference: !!ref, developpee });
      };
      if (aiResponse === null) { echec(); return; }
      let lisible = true;
      try { const d0 = JSON.parse(aiResponse || '{}'); lisible = (d0?.value ?? (Array.isArray(d0?.replacements) ? d0.replacements[0]?.value : undefined)) !== undefined; } catch { lisible = false; }
      // Réponse illisible ou sans « value » : échec aussi pour un champ simple (« Nom : », coordonnées, effectifs…), compté dans
      // le seuil de refus et signalé à GSS, jamais un champ laissé vide sans repère (havre1, T8CS-3).
      if (!lisible) { echec(); return; }
      try {
        const data = JSON.parse(aiResponse || '{}');
        let value = data.value ?? (Array.isArray(data.replacements) ? data.replacements[0]?.value : undefined);
        // Cellule de tableau : une valeur, pas un paragraphe (la cellule ne s'y prête pas).
        if (isTableCell && value && String(value).split(/\s+/).length > 45) {
          const phrases = String(value).split(/(?<=[.!?])\s+/);
          let court = '';
          for (const ph of phrases) { if ((court + ' ' + ph).split(/\s+/).length > 35) break; court = `${court} ${ph}`.trim(); }
          value = court || String(value).split(/\s+/).slice(0, 30).join(' ');
        }
        // Réponse développée : texte du mémoire type repris (fidélité contrôlée), sinon proposition de l'IA à valider.
        if (developpee && value !== undefined && value !== null && String(value).trim()) {
          // Une rubrique principale (et au plus une seconde de score voisin) : jamais trois rubriques mêlées (havre1, 3.4).
          // Plusieurs textes de GSS repris (une rubrique par composante) : dans l'ordre où la réponse les emploie, pour que chaque
          // texte reste sous l'intitulé de sa composante au recalage (etampes2 553, T5CP-2 : « Absence de 2 agents… » suivi du
          // texte de l'intrusion, sous-titre « Intrusion… » resté vide).
          // Familles inséparables (absence prévue puis non prévue, T7CS-2) gardées entières après le choix de la rubrique principale.
          // T7-CONS-1 (consigne 5, cadre_impose) : le modèle ne cite aucun texte de GSS pour une question développée que le mémoire
          // type traite (ni cas pratique ni mise en situation, rubriques candidates trouvées) : les rubriques sont choisies sans
          // modèle (thème de la question, table de correspondance), puis la réponse est recalée sur leurs textes ; jamais une
          // proposition de l'IA annoncée comme « question que le mémoire type ne traite pas ».
          let references = referencesRetenues(candidats, data.reference);
          if (!references.length && candidats.length && !reprise.hors && !comprehension) {
            references = referencesDeSecours(candidats, `${questionMT || ''}\n${f.context}`);
            if (references.length) console.log(`[MemoireGenerator] ${label} : aucun texte de GSS cité par le modèle, rubriques du mémoire type choisies sans modèle (${references.map((c) => c.id).join(', ')}).`);
          }
          const retenus = ordonnerSelonReponse(completerFamilles(referencesPrincipales(references), candidats), String(value));
          // Intitulé de la rubrique du cadre (titre de section) quand la « question » n'est qu'un paragraphe de consigne
          // (havre1 : « Le renvoi vers un rapport général… est à proscrire » au lieu de « Mesures et initiatives sociétales »).
          const sectionChamp = ((f.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '').replace(/\[CHAMP_\d+\]/gi, '').replace(/\s+/g, ' ').trim();
          // Titre de section en capitales seul (rouen_univ : « (UFR DESP) », etampes1 : « VALEURS TECHNIQUES ») : jamais à la place
          // d'une vraie question ou d'une liste d'attendus ; seulement si la « question » est une consigne de forme (suite de R4-1 :
          // réponses à relire distinctes fusionnées sous un même titre de section dans les consultations).
          const qTrim = (questionMT || '').trim();
          const consigneSeule = !!sectionChamp && sectionChamp !== qTrim && !/^\d/.test(qTrim)
            && /^(?:(?:le |tout )?renvoi|cela peut|le soumissionnaire|le candidat|le prestataire|il est demand|il convient|pour rappel|seront prises en compte|les réponses doivent)|\best à proscrire\b/i.test(qTrim);
          const titreSection = /[a-zà-ÿ]/.test(sectionChamp) ? sectionChamp : sectionChamp.charAt(0) + sectionChamp.slice(1).toLowerCase();
          const libelleBrut = libelleQuestionCadre(consigneSeule ? titreSection : questionMT || `Champ ${f.id}`);
          // Jamais un repère interne comme libellé : l'intitulé de la question, sinon celui du champ.
          const libelle = /\[?champ_\d+\]?/i.test(libelleBrut) || !/\p{L}{3}/u.test(libelleBrut)
            ? libelleQuestionCadre((questionMT || '').replace(/\[CHAMP_\d+\]/gi, '').trim() || intitulePrincipal(((f.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').replace(/\[CHAMP_\d+\]/gi, '')) || `Champ ${f.id}`)
            : libelleBrut;
          if (retenus.length) {
            // Consigne 5 et décision D7 : le texte de GSS repris EXACTEMENT, à 90 % au moins. Réponse du modèle sous ce
            // seuil : nouvel essai strict (recopie mot pour mot), gardé s'il est plus fidèle. Puis la réponse est recalée
            // sur le texte de référence, sans autre appel : phrase reformulée → phrase de GSS, phrase de GSS omise →
            // remise à sa place, phrases propres à la question gardées ; avec une limite de longueur, dans la limite de
            // mots (les ajouts cèdent la place au texte de GSS). Une phrase de GSS contraire au DCE n'est pas remise.
            // Éléments attendus du cadre (« Éléments de réponse attendus : … ») : jamais laissés sans réponse au recalage (T4N-4).
            const attendus = attendusDuChamp(f.context).length ? attendusDuChamp(f.context) : attendusDuChamp(String(questionMT || ''));
            const rec = recalerSurReference(retenus.map((c) => c.texte).join('\n\n'), String(value), {
              limite: limiteChamp, maxMots: motsMaxChamp(f.context), exclure: (ph) => phraseContraireAuDce(ph, dceContext), dce: dceContext, attendus,
            });
            if (rec.fideliteAvant < SEUIL_FIDELITE_CADRE && !strict) {
              console.log(`[MemoireGenerator] ${label} : fidélité ${rec.fideliteAvant.toFixed(2)} au mémoire type (${retenus.map((c) => c.id).join(', ')}) < ${SEUIL_FIDELITE_CADRE} → nouvel essai strict.`);
              const avant = replacements.length;
              await answerField(f, true);
              if (replacements.length > avant) {
                // Le nouvel essai (recalé lui aussi) n'est gardé que si le modèle y a repris davantage le texte de GSS.
                const second = repriseParChamp.get(f.id);
                if (!second || (second.brute ?? 0) < rec.fideliteAvant) {
                  const k = replacements.map((x) => x.id).lastIndexOf(f.id);
                  // Première réponse gardée : mêmes nettoyages que ci-dessous (etampes1 594, T6N-2 : sans eux, « CV détaillés,
                  // agréments, certificats et cartes professionnelles » restait un intitulé sans texte).
                  if (k >= 0) replacements[k].value = completerSousTitresVides(retablirLignesLibelle(nettoyerReponseCadre(rec.texte), retenus.map((c) => c.texte).join('\n\n')), [...retenus, ...renvois], phrasesThematiques(repriseMT!.textes), `${questionMT || ''}\n${f.context}`).texte;
                  // Première réponse gardée : ses phrases ajoutées au texte de GSS sont retirées (enrobage) ou signalées, et le
                  // signalement de l'essai écarté est remplacé (T6-CONS-2, T6-COH-1).
                  if (k >= 0) {
                    const aj1 = ajoutsAuTexteDeGss(String(replacements[k].value ?? ''), retenus.map((c) => c.texte).join('\n\n'), dceContext, [...Object.values(repriseMT!.textes || {}), ...textesGssComplets]);
                    if (aj1.texte.trim()) replacements[k].value = aj1.texte;
                    if (aj1.signalees.length) ajoutsParChamp.set(f.id, { libelle, phrases: aj1.signalees }); else ajoutsParChamp.delete(f.id);
                  }
                  repriseParChamp.set(f.id, { ids: retenus.map((c) => c.id), fidelite: rec.fidelite, brute: rec.fideliteAvant });
                  if (rec.fidelite < SEUIL_FIDELITE_CADRE) propositionsCadre.set(f.id, `Réponse à relire (mémoire type de GSS repris en partie, fidélité ${Math.round(rec.fidelite * 100)} %) : ${libelle}`);
                  else propositionsCadre.delete(f.id);
                }
                return;
              }
            }
            // Ligne « libellé : valeur » de GSS dont le modèle a changé la structure (havre2 701) : rétablie telle quelle.
            rec.texte = retablirLignesLibelle(nettoyerReponseCadre(rec.texte), retenus.map((c) => c.texte).join('\n\n'));
            // Sous-titre resté sans texte (ca_normandie 221, 2.2 « Besoin urgent de renfort hors astreinte ») : la phrase de GSS
            // qui traite ce sujet (rubriques reprises ici ou dans une autre réponse), sinon « [À COMPLÉTER] » demandé à GSS.
            const sousTitres = completerSousTitresVides(rec.texte, [...retenus, ...renvois], phrasesThematiques(repriseMT!.textes), `${questionMT || ''}\n${f.context}`);
            if (sousTitres.completes.length) console.log(`[MemoireGenerator] ${label} : sous-titre(s) sans texte complété(s) par le mémoire type (${sousTitres.completes.join(' ; ')}).`);
            rec.texte = sousTitres.texte;
            // Phrases ajoutées au texte de GSS (consigne 5 : « elle restructure et adapte juste le texte au client. Rien de
            // plus. », T5-CONS-6) : l'enrobage sans donnée propre retiré ; toute autre phrase absente du texte de GSS et du DCE
            // signalée à GSS (rubrique, phrase), comme en réponse libre ; rien de ce signalement n'est imprimé.
            {
              const aj = ajoutsAuTexteDeGss(rec.texte, retenus.map((c) => c.texte).join('\n\n'), dceContext, [...Object.values(repriseMT!.textes || {}), ...textesGssComplets]);
              if (aj.retirees.length) console.log(`[MemoireGenerator] ${label} : ${aj.retirees.length} phrase(s) d'enrobage ajoutée(s) par l'IA retirée(s) (${aj.retirees.map((x) => x.slice(0, 60)).join(' ; ')}).`);
              if (aj.texte.trim()) rec.texte = aj.texte;
              // Signalement rapproché du texte final plus bas (une ligne par réponse, jamais une consultation par phrase).
              if (aj.signalees.length) ajoutsParChamp.set(f.id, { libelle, phrases: aj.signalees }); else ajoutsParChamp.delete(f.id);
            }
            if (rec.texte !== String(value)) {
              console.log(`[MemoireGenerator] ${label} : réponse recalée sur le mémoire type (${retenus.map((c) => c.id).join(', ')}), fidélité ${rec.fideliteAvant.toFixed(2)} → ${rec.fidelite.toFixed(2)} (${rec.reformulees} phrase(s) reformulée(s) rétablie(s), ${rec.reinserees} remise(s), ${rec.bribesRetirees} bribe(s) et ${rec.ajoutsRetires} ajout(s) retiré(s)).`);
              value = rec.texte;
            }
            const fid = rec.fidelite;
            repriseParChamp.set(f.id, { ids: retenus.map((c) => c.id), fidelite: fid, brute: rec.fideliteAvant });
            // Élément attendu resté sans réponse après le recalage : signalé à GSS, avec la liste (T4N-4).
            const sansReponse = attendusSansReponse(String(value), attendus);
            if (sansReponse.length) console.warn(`[MemoireGenerator] ${label} : ${sansReponse.length} élément(s) attendu(s) sans réponse après recalage (${sansReponse.join(' ; ')}).`);
            if (sansReponse.length) propositionsCadre.set(f.id, `Réponse à relire (élément${sansReponse.length > 1 ? 's' : ''} attendu${sansReponse.length > 1 ? 's' : ''} sans réponse : ${sansReponse.map((x) => `« ${x} »`).join(', ')}${fid < SEUIL_FIDELITE_CADRE ? ` ; mémoire type de GSS repris en partie, fidélité ${Math.round(fid * 100)} %` : ''}) : ${libelle}`);
            else if (fid < SEUIL_FIDELITE_CADRE) propositionsCadre.set(f.id, `Réponse à relire (mémoire type de GSS repris en partie, fidélité ${Math.round(fid * 100)} %) : ${libelle}`);
            else propositionsCadre.delete(f.id);
            if (comprehension?.svg && ![...svgComprehension.keys()].some((id) => id !== f.id)) svgComprehension.set(f.id, comprehension.svg);
            // Compréhension sans schéma de process (R4-2, ca_normandie) : signalée à GSS comme en réponse libre et en format court.
            else if (comprehension && !comprehension.svg) alertesComprehension.add(`Réponse « ${libelle} » : le schéma de process de la compréhension du besoin n'a pas pu être dessiné ; à demander via l'assistant avant la remise.`);
          } else if (comprehension) {
            propositionsCadre.set(f.id, `Réponse à relire (compréhension du besoin rédigée d'après le DCE) : ${libelle}`);
            if (!comprehension.svg) alertesComprehension.add(`Réponse « ${libelle} » : le schéma de process de la compréhension du besoin n'a pas pu être dessiné ; à demander via l'assistant avant la remise.`);
          } else if (renvois.length) {
            // Le texte de GSS sur ce sujet est repris dans une autre réponse, à laquelle celle-ci renvoie. Une réponse qui
            // ajoute autour du renvoi des phrases rédigées par l'IA (havre1 21 : 3.3, 4.2, 4.4, 110 à 150 mots) n'est pas
            // le texte de GSS : elle est signalée à relire (consultations et premier message de l'assistant, D5).
            const horsRenvoi = String(value).split(/(?<=[.!?])\s+|\n+/).filter((ph) => !/voir notre r[ée]ponse|notre r[ée]ponse (?:à|a) la question/i.test(ph)).join(' ');
            if ((horsRenvoi.match(/[\wÀ-ÿ'’-]+/g) || []).length > 15) propositionsCadre.set(f.id, `Réponse à relire (texte rédigé par l'IA autour d'un renvoi à une autre réponse) : ${libelle}`);
            else propositionsCadre.delete(f.id);
          } else {
            propositionsCadre.set(f.id, `Proposition de réponse à valider (question que le mémoire type de GSS ne traite pas) : ${libelle}`);
          }
        }
        if (value !== undefined && value !== null) {
          // Champ rédigé à la passe de complétion après un premier échec : il n'est plus signalé comme non rédigé.
          if (!echecsRedaction.get(f.id)?.reference) echecsRedaction.delete(f.id);
          replacements.push({ id: f.id, value: String(value) });
        }
      } catch (e) {
        console.error(`[MemoireGenerator] ${label}: parse JSON échoué:`, (aiResponse || '').slice(0, 160));
      }
    };

    // ── Regroupement en ZONES de réponse ──
    // Une QUESTION/libellé ouvre une zone ; les lignes « …… » SANS question propre qui suivent en
    // font partie JUSQU'À la prochaine question (ou une case/un tableau, qui cassent la zone). Pour
    // une zone de PLUSIEURS lignes, on génère en UN SEUL appel N éléments DISTINCTS (un par ligne)
    // plutôt que N réponses indépendantes qui se répètent. (Doc order = ordre des id.)
    const qRealOf = (d: FieldDesc): string => {
      const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      return q.replace(/[\s.:;,…\-—–/|()]+/g, '').length ? q.trim() : '';
    };
    const precedingLabelOf = (d: FieldDesc): string =>
      ((d.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '')
        .split('/').map(s => s.trim()).filter(Boolean).pop() || '';
    interface AnswerZone { label: string; fields: FieldDesc[]; }
    const sectionDe = (d: FieldDesc): string => (d.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '';
    const zones: AnswerZone[] = [];
    let curZone: AnswerZone | null = null;
    for (const d of descriptors) {
      if (d.kind !== 'answer') { curZone = null; continue; }   // case/tableau → casse la zone
      const qReal = qRealOf(d);
      if (qReal) { curZone = { label: qReal, fields: [d] }; zones.push(curZone); }
      // ligne « …… » → suite de la zone, seulement sous la MÊME section (jamais d'une question à la suivante)
      else if (curZone && sectionDe(d) === sectionDe(curZone.fields[0])) { curZone.fields.push(d); }
      else { curZone = { label: precedingLabelOf(d), fields: [d] }; zones.push(curZone); }
    }

    /** Rédige une zone MULTI-lignes en 1 appel : N éléments distincts (un par ligne), lus du libellé. */
    const answerZone = async (zone: AnswerZone): Promise<void> => {
      const primary = zone.fields[0];
      const qEmb = queryEmbById.get(primary.id);
      const top = qEmb ? this.retrieve(qEmb, retrievalChunks, 12, this.buildFieldQuery(primary)) : [];
      const fmtBlock = (title: string, cs: RetrievalChunk[]) => cs.length
        ? `\n--- ${title} ---\n` + cs.map((c, i) => `[${c.label} #${i + 1}]\n${c.text}`).join('\n\n') + '\n' : '';
      const N = zone.fields.length;
      // Référents injectés UNIQUEMENT si la zone demande explicitement une personne (pas un simple
      // « responsable » de libellé de process → évite le flood du nom de référent hors-sujet).
      const isRef = /\b(nom|noms|coordonn[ée]es|interlocuteur|personne[s]?\s*(?:à|a)?\s*contacter|courriel|t[ée]l[ée]phone|\bmail\b|\bcontact\b|r[ée]f[ée]rent)\b/i.test(zone.label);
      const userPrompt = `Analyse du marché (contexte de rédaction) :
${analysisJson}

--- CONTEXTE STRATÉGIQUE GSS ---
${strategicCtx}
${fmtBlock("EXTRAITS PERTINENTS DU DCE (exigences de l'acheteur)", top.filter(c => c.source === 'DCE'))}${fmtBlock('DOCUMENTATION GSS PERTINENTE (sources internes — appuie ta réponse dessus)', top.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source)))}${qEmb ? blocMemoires(rechercherMemoires(qEmb, 5, this.buildFieldQuery(primary))) : ''}${isRef && referentsContext ? `\n--- RÉFÉRENTS GSS (« Personnes ») ---\n${referentsContext}\n` : ''}
LIBELLÉ / QUESTION À TRAITER : « ${zone.label} »
Sous ce libellé, il y a ${N} ligne(s) à remplir. Donne jusqu'à ${N} éléments de réponse COURTS, DISTINCTS et COMPLÉMENTAIRES (un par ligne), du plus important au moins important, fondés UNIQUEMENT sur les extraits ci-dessus, en restant sur le sujet du libellé. AUCUNE répétition entre les éléments.
RÈGLE DE FIABILITÉ (PRIORITAIRE) : donne TOUS les éléments que les extraits justifient DIRECTEMENT (ne laisse pas de côté une info réellement présente) ; mais ne donne un élément QUE s'il est fondé sur les extraits. N'invente, ne déduis ni n'extrapole aucune donnée (nom, date, SIRET/SIREN, CNAPS, agrément, adresse, téléphone, email, effectif, taux, montant) absente des sources. NE DÉTOURNE PAS une donnée d'entreprise/générale pour une question spécifique (dédié au marché / par site / par département). NE RECOPIE PAS l'intitulé ni les options des cases. Si tu n'as de quoi remplir que k < ${N} lignes (voire 0), ne donne QUE k éléments — ne meuble JAMAIS, mieux vaut vide que non fiable.
Renvoie UNIQUEMENT un objet JSON : {"items": ["ligne 1", "ligne 2", ...]} (au plus ${N} éléments, dans l'ordre).`;
      const aiResponse = await this.callOpenAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        0.15, `Zone "${zone.label.slice(0, 30)}" (${N}l)`, true, 'redaction', 0,
      );
      if (aiResponse === null) {
        for (const f of zone.fields) echecsRedaction.set(f.id, { libelle: libelleQuestionCadre(zone.label || `Champ ${f.id}`), reference: false, developpee: false });
        return;
      }
      try {
        const data = JSON.parse(aiResponse || '{}');
        const items: any[] = Array.isArray(data.items) ? data.items : [];
        zone.fields.forEach((f, i) => {
          const v = items[i];
          if (v !== undefined && v !== null && String(v).trim()) replacements.push({ id: f.id, value: String(v) });
        });
      } catch (e) {
        console.error(`[MemoireGenerator] Zone "${zone.label.slice(0, 30)}": parse JSON échoué:`, (aiResponse || '').slice(0, 160));
      }
    };

    // Aiguillage : zone multi-lignes → answerZone (1 appel, N éléments distincts) ; zone d'1 ligne →
    // answerField (logique 3 niveaux) ; cases/tableaux (hors zones) → answerField individuellement.
    const inZone = new Set(zones.flatMap(z => z.fields.map(f => f.id)));
    const others = descriptors.filter(d => !inZone.has(d.id));
    // Rubriques du mémoire type attribuées avant les appels (rédaction en parallèle) : chacune à un seul champ.
    if (repriseMT) {
      const individuels = [...zones.filter(z => z.fields.length === 1).map(z => z.fields[0]), ...others].sort((a, b) => a.id - b.id);
      attribution = attribuerRubriques(individuels.map((f) => ({ f, r: infosReprise(f) })).filter(({ r }) => r.developpee && !r.comprehension)
        .map(({ f, r }) => ({ id: f.id, libelle: r.libelle, candidats: candidatsReference(repriseMT.mt, repriseMT.textes, r.questionMT, { scores: repriseMT.scores.get(f.id), hors: r.hors, secondeLexicale: r.sujetReconstruit, questionSeule: r.questionSeule, evenementiel: lotEvenementiel }) })));
      const partages = [...attribution.renvois.entries()].map(([id, l]) => `champ ${id} → ${l.map((x) => x.titre).join(', ')}`);
      if (partages.length) console.log(`[MemoireGenerator] Mémoire type (cadre) : rubrique(s) déjà reprise(s) dans une autre réponse, renvoi : ${partages.join(' ; ')}.`);
    }
    const jobs: Array<() => Promise<void>> = [
      ...zones.map(z => z.fields.length > 1 ? () => answerZone(z) : () => answerField(z.fields[0])),
      ...others.map(d => () => answerField(d)),
    ];
    console.log(`[MemoireGenerator] Rédaction : ${zones.filter(z => z.fields.length > 1).length} zone(s) multi-lignes + ${jobs.length - zones.filter(z => z.fields.length > 1).length} champ(s) simples...`);
    // Progression CHAMP PAR CHAMP : on emballe chaque job pour faire avancer la barre à mesure que les
    // réponses tombent (la plage 30–90 % couvre tout le remplissage du cadre).
    const totalJobs = jobs.length;
    let doneJobs = 0;
    setProgress(dossierId, { phase: 'redaction', pct: 30, done: 0, total: totalJobs, label: `Remplissage du cadre — 0/${totalJobs} champ(s)…` });
    if (onProgress) onProgress(30, `Remplissage du cadre — 0/${totalJobs} champ(s)…`);
    const tracked = jobs.map((job) => async () => {
      await job();
      doneJobs++;
      const pct = 30 + Math.round(60 * doneJobs / Math.max(1, totalJobs));
      const label = `Remplissage du cadre — ${doneJobs}/${totalJobs} champ(s)…`;
      setProgress(dossierId, { phase: 'redaction', done: doneJobs, total: totalJobs, pct, label });
      if (onProgress) onProgress(pct, label);
    });
    await runPool(tracked, 2);
    // OpenAI en panne pendant le remplissage (T4-COH-1) : plus de la moitié des réponses non rédigées → aucun cadre remis
    // comme « terminé » (erreur claire, à relancer) ; sinon chaque réponse non rédigée est signalée à GSS.
    if (echecsRedaction.size) {
      console.warn(`[MemoireGenerator] Rédaction automatique indisponible pour ${echecsRedaction.size}/${totalJobs} champ(s) du cadre.`);
      if (echecsRedaction.size * 2 > totalJobs) {
        throw new Error(`Rédaction automatique indisponible (OpenAI) : ${echecsRedaction.size} réponse(s) du cadre sur ${totalJobs} n'ont pas pu être rédigées. Aucun document n'est remis ; relancez la génération.`);
      }
    }

    // Informations variables à confirmer par GSS (registre) : le marqueur ne doit JAMAIS apparaître dans le
    // document remis à l'acheteur → retiré de la valeur, remonté dans les consultations.
    const confirmationsGss = new Set<string>([...alertesComprehension, ...ajoutsCadreIA]);
    const confirmationsParChamp = new Map<number, string[]>();
    // Case « PME : Oui / Non » : réponse de GSS au registre (statut_pme) ; à défaut, aucune case cochée et la question
    // posée à GSS (le mémoire type écrit « PME » alors que l'effectif de 380 salariés dépasse le seuil européen).
    {
      const casesPme = descriptors.filter((d) => d.kind === 'checkbox' && /\bPME\b/.test((d.context.match(/Intitul[ée]:\s*"([^"]*)"/) || [])[1] || ''));
      if (casesPme.length) {
        const statut = valeurRegistre('statut_pme');
        for (const d of casesPme) {
          const opt = normCtx((d.context.match(/option:\s*"([^"]*)"/) || [])[1] || '').trim();
          const oui = /^oui\b/.test(opt);
          const non = /^non\b/.test(opt);
          if (!oui && !non) continue;
          const valeur = statut && (/^\s*(?:oui|pme)\b/i.test(statut) ? oui : non) ? '☑' : '☐';
          const k = replacements.findIndex((r) => r.id === d.id);
          if (k >= 0) replacements[k].value = valeur; else replacements.push({ id: d.id, value: valeur });
        }
        if (!statut) confirmationsGss.add(repriseMT?.mt.variables.STATUT_PME?.a_confirmer || 'GSS est-elle une PME au sens européen (moins de 250 salariés) ? Répondre Oui ou Non : la case « PME » du cadre de réponse en dépend.');
      }
    }
    const retirerConfirmations = () => {
      for (const r of replacements) {
        const { texte, confirmations: brutes } = extraireConfirmations(String(r.value ?? ''));
        // Question du rédacteur sur un autre marché (référence ou ancien acheteur de GSS absent du DCE, vitry 202 : « …
        // applicable aux sites de Port-Jérôme-sur-Seine ») : jamais posée.
        const confirmations = brutes.filter((c) => {
          // Valeur du registre citée avec sa source (« dernière valeur connue : … (Région Normandie lot 1, 2024) ») : gardée.
          const noms = /derni[èe]re valeur connue|valeur utilis[ée]e/i.test(c) ? [] : nomsHorsMarche(c, dceContext, analysisData?.clientName || '');
          if (noms.length) console.warn(`[MemoireGenerator] Champ ${r.id} : question sur un autre marché non posée (${noms.join(', ')}) : ${c.slice(0, 120)}`);
          return !noms.length;
        });
        if (brutes.length) {
          confirmations.forEach((c) => confirmationsGss.add(c));
          confirmationsParChamp.set(r.id, confirmations);
          r.value = texte || '[À COMPLÉTER]';
        }
      }
    };
    /** Question(s) à poser pour un critère de grille resté incomplet : les questions précises du rédacteur. */
    /** Question générique d'un critère (aucune question précise du rédacteur) → champ : remplacée, dans les consultations,
     *  par les questions précises de ses emplacements (vitry 241 : « Critère « SOUS CRITERE 3 » : quelle information… »,
     *  reformulée « À demander à l'acheteur » alors que les effectifs sont des données de GSS). */
    const questionsVaguesGrille = new Map<string, number>();
    const questionsGrille = (d: FieldDesc): string[] => {
      const precises = confirmationsParChamp.get(d.id) || [];
      if (precises.length) return precises;
      const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      const vague = `Critère « ${libelleQuestionCadre(q, 140)} » : quelle information faut-il écrire à la place du repère [À COMPLÉTER] ?`;
      questionsVaguesGrille.set(vague, d.id);
      return [vague];
    };

    /**
     * Grille de notation : les critères sont rédigés séparément ; une passe unique harmonise les
     * réponses (mêmes personnes, mêmes nombres d'équipes/agents, mêmes délais partout) et reprend dans un
     * critère une donnée qu'un autre critère fournit déjà au lieu d'un [À COMPLÉTER].
     */
    const harmoniserGrille = async (): Promise<void> => {
      const grille = replacements.filter((r) => descriptors.find((d) => d.id === r.id)?.grille && String(r.value || '').trim());
      if (grille.length < 2) return;
      const libelle = (id: number) => ((descriptors.find((d) => d.id === id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').slice(0, 200);
      // Corrections CIBLÉES (extrait exact → remplacement) : les réponses longues ne sont jamais réécrites en
      // entier (une réécriture complète les résumait ou les tronquait).
      const rep = await this.callOpenAI([
        {
          role: 'system',
          content: `Tu relis les réponses d'un mémoire technique GSS à une grille de notation, rédigées séparément, pour qu'elles soient COHÉRENTES entre elles.
- Repère les incohérences : personnes ou rôles différents, nombres différents (équipes, agents, maîtres-chiens), délais ou dispositifs différents d'une réponse à l'autre (retiens la version la plus précise et la plus complète).
- Repère aussi un « [À COMPLÉTER] » laissé pour une donnée qu'une AUTRE réponse fournit explicitement.
- Pour chacune, donne une correction ciblée : "extrait" = passage EXACT recopié caractère pour caractère depuis la réponse concernée (le plus court possible), "remplacement" = le passage corrigé. Ne touche à rien d'autre ; conserve toute ligne « [CONSULTATION REQUISE : …] ».
Renvoie UNIQUEMENT un objet JSON : {"corrections": [{"id": <id>, "extrait": "…", "remplacement": "…"}]} (liste vide si tout est cohérent).`,
        },
        { role: 'user', content: grille.map((r) => `### Réponse ${r.id} (question : ${libelle(r.id)})\n${r.value}`).join('\n\n') },
      ], 0.1, 'Cohérence de la grille', true);
      try {
        const corrections = JSON.parse(rep || '{}').corrections;
        let n = 0;
        // Sources des noms propres admis dans une correction : DCE, registre et organigramme de GSS (jamais le nom d'une
        // référence ou d'un acheteur d'un autre marché, vitry 202 : « Ville de Port-Jérôme-sur-Seine » à la place de l'acheteur).
        const sourcesNoms = `${dceContext}\n${blocRegistre(marcheHorsNormandie(analysisData, dceContext))}\n${organigrammeGss(referentsContext)}`;
        for (const c of Array.isArray(corrections) ? corrections : []) {
          const r = grille.find((x) => x.id === Number(c?.id));
          const extrait = String(c?.extrait || ''), remplacement = String(c?.remplacement ?? '');
          if (!r || extrait.length < 3 || !String(r.value).includes(extrait) || /CONSULTATION REQUISE/.test(extrait)) continue;
          // Réponse reprise du mémoire type (recalée) : ses phrases restent celles de GSS (consigne 5).
          const reprise = repriseParChamp.get(r.id);
          const reference = reprise && repriseMT ? reprise.ids.map((x) => repriseMT.textes[x] || '').join('\n\n') : '';
          const motif = motifRefusHarmonisation({ extrait, remplacement, valeur: String(r.value), reference, sources: sourcesNoms, client: analysisData?.clientName || '' });
          if (motif) {
            console.warn(`[MemoireGenerator] Cohérence de la grille : correction refusée sur la réponse ${r.id} (${motif}) : « ${extrait.slice(0, 80)} » → « ${remplacement.slice(0, 80)} ».`);
            continue;
          }
          r.value = String(r.value).replace(extrait, remplacement);
          n++;
        }
        if (n) console.log(`[MemoireGenerator] Cohérence de la grille : ${n} correction(s) ciblée(s).`);
      } catch { /* passe facultative */ }
    };

    // Passe de complétion : rattrape les champs sans valeur (appel ayant échoué).
    const answeredIds = new Set(replacements.map(r => r.id));
    const missing = descriptors.filter(d => !answeredIds.has(d.id));
    if (missing.length > 0) {
      console.log(`[MemoireGenerator] Passe de complétion : ${missing.length} champ(s) manquant(s).`);
      await runPool(missing.map(d => () => answerField(d)), 2);
    }
    // Réponses restées sans texte après la passe de complétion (T8CS-3 : un champ simple aussi) : signalées à GSS.
    {
      const sansTexte = [...echecsRedaction.values()].filter((x) => !x.reference).map((x) => x.libelle);
      if (sansTexte.length) {
        // Placé, comme avant, juste après les alertes de la compréhension (en tête des questions du cadre).
        const suite = [...confirmationsGss].filter((c) => !alertesComprehension.has(c));
        confirmationsGss.clear();
        alertesComprehension.forEach((c) => confirmationsGss.add(c));
        confirmationsGss.add(`Rédaction automatique indisponible pour ${sansTexte.length === 1 ? 'la réponse' : `${sansTexte.length} réponses`} du cadre ${[...new Set(sansTexte)].map((l) => `« ${l} »`).join(', ')} : à relire et compléter avant la remise (via l'assistant). Pouvez-vous indiquer les éléments à écrire ?`);
        suite.forEach((c) => confirmationsGss.add(c));
      }
    }

    await harmoniserGrille();
    retirerConfirmations();
    const horsNormandieCadre = marcheHorsNormandie(analysisData, dceContext);
    /** Délais d'intervention demandés par le cadre, laissés à compléter : ligne ajoutée → question exacte à GSS (T5N-2). */
    const questionsDelaisCadre = new Map<string, string>();
    // Couverture des exigences du CCTP dans les réponses développées (comme en réponse libre).
    try {
      const developpeesCadre = replacements
        .filter((r) => { const d = descriptors.find((x) => x.id === r.id); return d && d.kind !== 'checkbox' && String(r.value ?? '').length >= 400; })
        .map((r) => ({ id: r.id, question: ((descriptors.find((x) => x.id === r.id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').slice(0, 300), value: String(r.value ?? '') }));
      const avantCouverture = new Map(developpeesCadre.map((x) => [x.id, x.value] as const));
      await this.couvertureCadre(developpeesCadre, dceContext, analysisData, horsNormandieCadre);
      // Même engagement ajouté dans deux réponses du cadre (génération réelle rouen_univ 703 : « GSS mobilise 8 agents APS et/ou
      // SSIAP 1 supplémentaires dans un délai de 12 heures… » sous les absences et sous le contrôle des prestations) : gardé
      // dans la première réponse seulement, dans l'ordre du cadre.
      {
        const vus = new Set<string>();
        const cle = (l: string) => normaliser(l.replace(/^\s*[•\-*]\s*/, '')).replace(/[^a-z0-9]+/g, ' ').trim();
        for (const x of [...developpeesCadre].sort((a, b) => a.id - b.id)) {
          const avant = new Set(String(avantCouverture.get(x.id) || '').split('\n').map((l) => cle(l)));
          x.value = x.value.split('\n').filter((l) => {
            const k = cle(l);
            if (!k || avant.has(k) || k.split(' ').length < 6) return true;
            if (vus.has(k)) return false;
            vus.add(k);
            return true;
          }).join('\n').replace(/\n{3,}/g, '\n\n');
        }
      }
      for (const x of developpeesCadre) {
        const r = replacements.find((y) => y.id === x.id);
        if (r) r.value = x.value;
        // Puces ajoutées par la couverture : premières retirées d'une partie limitée en pages trop longue.
        const avant = new Set(String(avantCouverture.get(x.id) || '').split('\n').map((l) => l.trim()));
        const ajouts = x.value.split('\n').filter((l) => l.trim() && !avant.has(l.trim()));
        if (ajouts.length) ajoutsCouvertureCadre.set(x.id, ajouts);
      }
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Couverture du CCTP (cadre) indisponible : ${e?.message || e}`);
    }
    for (const r of replacements) {
      const d = descriptors.find((x) => x.id === r.id);
      if (!d || d.kind === 'checkbox') continue;
      const { texte, retires } = retirerCommentairesInternes(completerIdentiteCnaps(String(r.value ?? '')));
      // Exigence du CCTP recopiée à la voix de l'acheteur (« Le Titulaire doit… », « Elle ne devra pas… ») : retirée ;
      // le reste à la voix de GSS (« le titulaire » → « GSS »).
      const recopie = sansRecopieCctp(texte, dceContext);
      // Texte nettoyé toujours repris (reformulations et montants de pénalité retirés, même sans commentaire interne).
      const avantFiltres = fondementReprise(voixDeGss(recopie.texte), dceContext);
      const delais0 = delaisHorsNormandie(interditsDce(avantFiltres, dceContext), dceContext, horsNormandieCadre);
      // (T7-CONS-9 : consultation du modèle sur un délai hors Normandie, déjà posée une seule fois à GSS : retirée)
      const sansQ = sansConsultationsDelaiHorsNormandie(delais0.texte, horsNormandieCadre);
      if (sansQ.retires.length) console.log(`[MemoireGenerator] Champ ${r.id} : ${sansQ.retires.length} consultation(s) sur un délai hors Normandie retirée(s) (question posée une seule fois à GSS).`);
      const delais = { ...delais0, texte: sansQ.texte };
      suiviCadre?.noterFiltres(`GSS_CH_${r.id}`, avantFiltres, delais.texte, dceContext, horsNormandieCadre, analysisData);
      // Étiquette « … : » restée sans contenu, phrases répétées dans le même champ : retirées.
      r.value = nettoyerChampCadre(delais.texte).trim() || (retires.length || delais.retires.length || recopie.retires.length ? '[À COMPLÉTER]' : r.value);
      // Réponse développée sous un tableau : ni « [À COMPLÉTER] » seul en tête, ni pseudo-lignes du tableau (T4-COH-2).
      if (d.kind !== 'table' && String(r.value).length > 120) {
        const pt = sansPseudoTableau(String(r.value));
        if (pt.retires) { r.value = pt.texte; console.log(`[MemoireGenerator] Champ ${r.id} : ${pt.retires} pseudo-ligne(s) de tableau ou repère seul retiré(s).`); }
      }
      // Cas pratique : cases « en service : [À COMPLÉTER] | rotation : [À COMPLÉTER] » remplies avec le dispositif proposé.
      if (dimensionnementCadre) r.value = remplirCasPratique(String(r.value), dimensionnementCadre).texte;
      // Critère qui demande les délais d'intervention proposés : chaque sous-point porte une durée sourcée ou un « [À COMPLÉTER] »
      // avec sa question exacte à GSS (etampes1 592 : deux paragraphes de procédure, sans délai ni emplacement, T5N-2).
      if (d.kind !== 'table') {
        const qChamp = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
        const clientV = repriseMT?.prep.variables.CLIENT;
        const art = String(clientV?.article || '').trim();
        const nomClient = clientV?.valeur ? `${art ? (/['’]$/.test(art) ? art : `${art} `) : ''}${clientV.valeur}` : String(analysisData?.clientName || '');
        const dl = completerDelaisCadre(String(r.value), qChamp, { client: nomClient.trim() || undefined, horsNormandie: horsNormandieCadre });
        if (dl.ajouts.length) {
          r.value = dl.texte;
          dl.ajouts.forEach((a) => questionsDelaisCadre.set(a.ligne.replace(/\s*\[À COMPLÉTER\]\.?$/, '').trim(), a.question));
          console.log(`[MemoireGenerator] Champ ${r.id} : ${dl.ajouts.length} délai(s) d'intervention demandé(s) par le cadre sans valeur, laissé(s) à compléter avec leur question à GSS.`);
        }
      }
      // Sujet que GSS traite dans le mémoire type, resté « [À COMPLÉTER] » après la rédaction (ca_normandie 241, 2.2 :
      // renfort urgent hors astreinte) : la phrase publipostée de GSS, sans question.
      if (repriseMT) {
        // Courriel du point d'entrée unique laissé à compléter : la ligne « Mail unique » du mémoire type de GSS (T4C-8).
        const mailGss = (/Mail unique\s*:\s*([^\s;]+@[^\s;]+?)\.?\s*$/m.exec(String(repriseMT.mt.rubriques.find((x) => x.id === 'b3_interlocuteur_unique')?.texte || '')) || [])[1] || '';
        const mail = completerMailUnique(String(r.value), mailGss);
        if (mail.complete) { r.value = mail.texte; console.log(`[MemoireGenerator] Champ ${r.id} : courriel du point d'entrée unique repris du mémoire type (${mailGss}).`); }
        const theme = completerParThematiques(String(r.value), phrasesThematiques(repriseMT.textes));
        if (theme.completes.length) { r.value = theme.texte; console.log(`[MemoireGenerator] Champ ${r.id} : ${theme.completes.length} repère(s) remplacé(s) par la phrase du mémoire type (${theme.completes.join(' ; ')}).`); }
      }
      // Mise en situation événementielle (vitry 202 : forum et concert jusqu'à 10 000 personnes) : la réponse donne le nombre
      // d'agents, les catégories, les PIF et les détecteurs demandés ; sans dispositif proposé, le nombre est demandé à GSS.
      {
        const d = descriptors.find((x) => x.id === r.id);
        const intitule = intitulePrincipal(((d?.context || '').match(/Question:\s*"([^"]*)"/) || [])[1] || '');
        if (d && d.kind !== 'checkbox' && /mises? en situation/i.test(intitule) && !/barri[eè]rage|sch[ée]ma|plan/i.test(intitule) && String(r.value ?? '').length >= 200) {
          if (dimensionnementCadre?.misesEnSituation?.length) {
            // Seulement le dispositif de la mise en situation que décrit CE champ (sa question et son contexte proche, sans le
            // critère parent) : etampes2 552, la fête communale du cas pratique n'est pas la mise en situation « absence de 2
            // agents et d'1 chien ; intrusion et vandalisme ».
            const champ = `${((d.context || '').match(/Question:\s*"([^"]*)"/) || [])[1] || ''} ${((d.context || '').match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || ''}`;
            const c = completerMisesEnSituation(String(r.value), dimensionnementCadre, champ);
            if (c.n) console.log(`[MemoireGenerator] Champ ${r.id} : dispositif proposé de ${c.n} mise(s) en situation ajouté (nombre d'agents absent de la réponse).`);
            r.value = c.texte;
          } else if (!dimensionnementCadre?.casPratique.length && !/\d+\s+agents?\b/.test(String(r.value))) {
            r.value = `${String(r.value).trimEnd()}\n\nNombre d'agents mis en place, catégories de personnel, nombre de PIF et de détecteurs de métaux, pour chaque mise en situation : [À COMPLÉTER].`;
            console.log(`[MemoireGenerator] Champ ${r.id} : mise en situation sans dispositif proposé, nombre d'agents demandé à GSS.`);
          }
        }
      }
      // Nom de l'acheteur écrit d'une seule façon (graphie de la variable CLIENT).
      // Variantes d'une commune acheteuse (« la Ville d’Étampes » pour « la Mairie d'Etampes », T7CS-8) : même nom partout.
      if (repriseMT?.prep.variables.CLIENT?.valeur) r.value = harmoniserVariantesAcheteur(harmoniserNomClient(String(r.value), String(repriseMT.prep.variables.CLIENT.valeur)), String(repriseMT.prep.variables.CLIENT.valeur));
      if (recopie.retires.length) console.log(`[MemoireGenerator] Champ ${r.id} : ${recopie.retires.length} phrase(s) du CCTP recopiée(s) à la voix de l'acheteur retirée(s).`);
      retires.forEach((x) => confirmationsGss.add(`À confirmer : ${x}`));
      delais.retires.forEach((x) => confirmationsGss.add(`${libelleDelaiRetire(analysisData, dceContext)}${x}`));
    }
    // Forme longue de l'acheteur à la première mention, forme courte ensuite (ca_normandie 221 : « Ministère de la Justice –
    // Service administratif régional de Rouen / BOP Normand (…) » 11 fois → « le SAR de Rouen » après la première).
    {
      const cl = repriseMT?.prep.variables.CLIENT;
      if (cl?.valeur && cl.court) {
        const ordre = replacements.filter((r) => descriptors.find((d) => d.id === r.id)?.kind !== 'checkbox').sort((a, b) => a.id - b.id);
        const sorties = formeCourteApresPremiere(ordre.map((r) => String(r.value ?? '')), String(cl.valeur), { article: cl.articleCourt ?? '', nom: String(cl.court) }, cl.article || '', [String(analysisData?.clientName || '')]);
        ordre.forEach((r, i) => { r.value = sorties[i]; });
      }
    }
    // Valeurs du registre encore « à confirmer » reprises dans le document : GSS est prévenu.
    confirmationsRegistreUtilisees(replacements.map((r) => String(r.value ?? '')).join('\n'), marcheHorsNormandie(analysisData, dceContext)).forEach((c) => confirmationsGss.add(c));
    // Dimensionnement proposé et repris dans le document : une seule question à GSS (proposition à valider).
    if (dimensionnementCadre && (dimensionnementCadre.profils.length || dimensionnementCadre.casPratique.length) && replacements.some((r) => casPratiqueRepris(String(r.value ?? ''), dimensionnementCadre) || (dimensionnementCadre.titulaires && new RegExp(`\\b${dimensionnementCadre.titulaires} agents? titulaires`).test(String(r.value ?? ''))))) confirmationsGss.add(questionDimensionnement(dimensionnementCadre));
    // Rondes ponctuelles du DCE sans durée, sans autre poste (cstb, T9N-1) : la question exacte est posée à GSS.
    if (dimensionnementCadre && !dimensionnementCadre.profils.length && questionRondes(dimensionnementCadre)) confirmationsGss.add(questionRondes(dimensionnementCadre));
    // Couverture horaire du cas pratique contrôlée sans modèle (durée demandée, heures d'ouverture au public) : un écart est
    // posé à GSS, jamais présenté comme couvert (T5CP-5).
    {
      // (le cas pratique est souvent décrit dans le cadre de réponse lui-même : etampes2, heures d'ouverture au public)
      const q = questionCouvertureCasPratique(dimensionnementCadre, `${dceContext}\n${texteDuCadre}`);
      if (q) { confirmationsGss.add(q); console.log(`[MemoireGenerator] Cas pratique : couverture horaire incomplète, question posée à GSS.`); }
    }
    // Mises en situation : une question par dispositif proposé et repris dans une réponse (proposition à valider, D5).
    if (dimensionnementCadre?.misesEnSituation?.length) {
      const textes = replacements.map((r) => String(r.value ?? '')).join('\n');
      questionsMisesEnSituation(dimensionnementCadre).forEach((q, i) => { if (new RegExp(`(?<![\\d])${dimensionnementCadre.misesEnSituation![i].total}\\s+agents?\\b`).test(textes)) confirmationsGss.add(q); });
    }
    console.log(`[MemoireGenerator] GPT a renvoyé ${replacements.length} valeurs au total.`);
    // Échéance dépassée dans un texte de GSS repris (validité de l'assurance, ISO) : question exacte à GSS (T6-COH-6).
    for (const r of repriseParChamp.values()) for (const id of r.ids) for (const q of repriseMT?.echeances?.[id] || []) confirmationsGss.add(q);
    if (repriseMT) console.log(`[MemoireGenerator] Mémoire type : ${repriseParChamp.size} réponse(s) développée(s) reprise(s) (${[...repriseParChamp.entries()].map(([id, r]) => `champ ${id} ← ${r.ids.join('+')} ${r.fidelite.toFixed(2)}`).join(' ; ') || 'aucune'}), ${[...propositionsCadre.values()].filter((c) => /^Proposition/.test(c)).length} proposition(s) hors mémoire type.`);
    // Contrôle final (T10N-4) : « équipe de N agents titulaires » égale la somme du tableau de l'équipe dédiée de la même réponse ;
    // sinon l'écart est signalé à GSS (jamais remis en silence).
    for (const r of replacements) {
      const e = ecartEquipeTableau(String(r.value ?? ''));
      if (!e) continue;
      const lib = libelleQuestionCadre((descriptors.find((d) => d.id === r.id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || `Réponse ${r.id}`);
      console.warn(`[MemoireGenerator] Champ ${r.id} : équipe annoncée à ${e.annonce} agents titulaires, tableau de l'équipe dédiée à ${e.somme}.`);
      confirmationsGss.add(`Réponse « ${lib} » : l'équipe dédiée est annoncée à ${e.annonce} agents titulaires, mais le tableau de l'équipe dédiée en compte ${e.somme} ; quel effectif faut-il retenir ? À corriger via l'assistant avant la remise.`);
    }
    setProgress(dossierId, { phase: 'finalisation', pct: 94, label: 'Application des réponses au cadre…' });
    if (onProgress) onProgress(94, 'Application des réponses au cadre…');

    // ── Garde-fou anti-invention de DONNÉES FACTUELLES (le cœur du « pas de données inventées ») ──
    // Le LLM fabrique volontiers adresses, téléphones, emails, dates, n° SIRET/CNAPS plausibles.
    // On vérifie TOUTE donnée factuelle contre les sources réelles (DCE + Doc GSS + « Personnes ») :
    //  • champ d'IDENTITÉ stricte (SIRET, CNAPS, agrément, date, adresse, certification) → si un
    //    chiffre ou un email n'est pas dans les sources, la valeur entière devient [À COMPLÉTER] ;
    //  • champ de CONTACT (coordonnées, téléphone, email, interlocuteur) → on retire UNIQUEMENT le
    //    téléphone/email inventé (en gardant le nom réel du référent), le reste passe par guardNames.
    // L'identité connue de GSS (dénomination/CNAPS/date) fait partie des sources « réelles » :
    // sans cela, le garde-fou identité retirerait le N° CNAPS (chiffres « non sourcés ») qu'on
    // vient pourtant de poser de façon déterministe.
    const identiteText = `${GSS_IDENTITE.denomination} ${GSS_IDENTITE.numCnaps} ${GSS_IDENTITE.dateAutorisation}`;
    // Le total d'effectif calculé (somme de chiffres réels) est une donnée « sourcée » → on l'ajoute
    // aux sources pour que les garde-fous ne le considèrent pas comme un chiffre inventé.
    const effectifText = effectifTotal ? ` ${effectifTotal.total} ` : '';
    const sourceTextNorm = normCtx(identiteText + effectifText + ' ' + analysisJson + ' ' + dceContext + ' ' + gssDocContext + ' ' + referentsContext + ' ' + texteSourcesMemoires() + this.texteDemande());
    const sourceDigits = sourceTextNorm.replace(/\D/g, '');
    const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
    const PHONE_RE = /\+?\d(?:[\d ().\-]{7,})\d/g;     // n° téléphone (≥9 chiffres espacés/groupés)
    const digitsKnown = (s: string) => { const d = s.replace(/\D/g, ''); return d.length < 3 || sourceDigits.includes(d); };
    const isStrictIdentity = (ctx: string) => /siret|siren|\bcnaps\b|autorisation|agrement|certification|\bdate\b|adresse|siege|kbis/.test(normCtx(ctx));
    const isContactField = (ctx: string) => /coordonnees|telephone|\btel\b|\bemail\b|\bmail\b|courriel|interlocuteur|contact|renseignements/.test(normCtx(ctx));
    const guardFactual = (val: string, ctx: string): string => {
      const nctx = normCtx(ctx);
      // Champ d'identité stricte : toute valeur contenant un chiffre/email non sourcé → [À COMPLÉTER].
      if (isStrictIdentity(nctx)) {
        const emails = val.match(EMAIL_RE) || [];
        const digitRuns = val.match(/\d{3,}/g) || [];
        const invented = emails.some(e => !sourceTextNorm.includes(normCtx(e))) || digitRuns.some(d => !sourceDigits.includes(d));
        if (invented) {
          console.log(`[MemoireGenerator] Garde-fou identité: valeur non sourcée → [À COMPLÉTER] (ctx: ${ctx.slice(0, 60)})`);
          return '[À COMPLÉTER]';
        }
        return val;
      }
      // Champ de contact : on neutralise seulement les téléphones/emails inventés (on garde le nom).
      if (isContactField(nctx)) {
        return val
          .replace(EMAIL_RE, e => sourceTextNorm.includes(normCtx(e)) ? e : '[À COMPLÉTER]')
          .replace(PHONE_RE, p => digitsKnown(p) ? p : '[À COMPLÉTER]');
      }
      return val;
    };

    // ── Garde-fou CERTIFICATIONS DE SERVICE (ISO 9001/14001/45001, APSAD, R31) ──
    // Une certification de SERVICE de l'entreprise ne peut être affirmée que si la DOCUMENTATION GSS
    // l'atteste. Une EXIGENCE du DCE/CCTP (« APSAD R31 attendu », « surveillance certifiée APSAD P2/P3 »)
    // n'est PAS une preuve que GSS la détient → on ne se fie donc PAS aux sources DCE pour ces champs,
    // seulement à la Doc GSS. Si la certification citée n'y figure pas → [À COMPLÉTER] (anti-invention).
    // (Les qualifications d'AGENTS — CQP, SSIAP, SST, HOBO — ne sont pas concernées par ce filtre.)
    // Textes du mémoire type de GSS (publipostés) : ce sont des sources GSS (« prime de fin d'année », valeurs sociales).
    const gssDocCompact = normCtx(gssDocContext + ' ' + texteSourcesMemoires() + this.texteDemande() + ' ' + Object.values(repriseMT?.textes || {}).join(' ')).replace(/\s+/g, '');
    const SERVICE_CERT_RE = /ISO\s*\d{4,5}|APSAD(?:\s*R?\s*\d+)?|\bR\s?31\b/gi;
    // Garde-fou FAITS NOUVEAUX (nom propre, ville, certification « APSAD P5 », fréquence d'audit) : tout fait absent du
    // DCE, des textes du mémoire type, des mémoires et du registre de GSS devient [À COMPLÉTER] (réponse courte) ou est
    // retiré (phrase d'une réponse longue), avec une question à GSS ; le numéro unique ne va qu'avec l'interlocuteur unique.
    const textesMT = Object.values(repriseMT?.textes || {}).join(' ');
    const sourcesFaits: SourcesFaitsCadre = {
      // Libellés écrits par les remplissages déterministes d'identité (activité CNAPS, qualité du signataire) : ce sont des
      // faits de GSS, jamais des « faits nouveaux » (havre1 : « livre VI du CSI » remplacé par « [À COMPLÉTER] » et posé à GSS).
      toutes: normaliser(`${identiteText}${effectifText} ${analysisJson} ${dceContext} ${gssDocContext} ${referentsContext} ${texteSourcesMemoires()} ${this.texteDemande()} ${textesMT} ${LIBELLES_IDENTITE_DETERMINISTES}`),
      gss: normaliser(`${gssDocContext} ${texteSourcesMemoires()} ${this.texteDemande()} ${textesMT}`),
      telephoneUnique: valeurRegistre('telephone_contact') || undefined,
      telephoneFixe: valeurRegistre('telephone_fixe') || undefined,
      interlocuteurUnique: (valeurRegistre('dirigeant') || '').trim().split(/\s+/)[0] || undefined,
      interlocuteurNom: (valeurRegistre('dirigeant') || '').trim().split(/\s+/).map((m, i) => (i === 0 ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())).join(' ') || undefined,
      questionPartenaire: valeurRegistre('partenaire_telesurveillance') ? undefined
        : repriseMT?.mt.variables.PARTENAIRE_TELESURVEILLANCE?.question || 'Quel partenaire de télésurveillance retenez-vous pour ce marché, ERYMA ou Delta ?',
    };
    const guardServiceCert = (val: string, _ctx: string): string => {
      // On scanne la VALEUR (pas le contexte) : si elle CITE une certification de service et que la
      // Doc GSS ne l'atteste pas → non prouvée. Champ court → [À COMPLÉTER]. Paragraphe → on RETIRE
      // la mention inventée du texte (on ne laisse plus passer).
      const cited = val.match(SERVICE_CERT_RE) || [];
      if (!cited.length) return val;
      const unproven = cited.filter(c => !gssDocCompact.includes(normCtx(c).replace(/\s+/g, '')));
      if (!unproven.length) return val;
      // Champ court : tout remplacer
      if (val.length <= 200) {
        console.log(`[MemoireGenerator] Garde-fou certif: certification non attestée par la Doc GSS → [À COMPLÉTER] ("${val.slice(0, 60)}")`);
        return '[À COMPLÉTER]';
      }
      // Paragraphe : retirer les phrases contenant la certification inventée
      let cleaned = val;
      for (const cert of unproven) {
        const certEsc = cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentenceRe = new RegExp(`[^.;\n]*${certEsc}[^.;\n]*[.;]?\\s*`, 'gi');
        cleaned = cleaned.replace(sentenceRe, '');
      }
      console.log(`[MemoireGenerator] Garde-fou certif: ${unproven.length} certification(s) non attestée(s) retirée(s) du paragraphe.`);
      return cleaned.trim() || '[À COMPLÉTER]';
    };

    // ── Garde-fou ANTI-INVENTION de POLITIQUES/MESURES NON SOURCÉES ──
    // L'IA invente régulièrement des politiques sociales (primes, avances sur salaire), des mesures RH,
    // ou présente les pénalités CCAP du client comme une politique qualité de GSS.
    // On vérifie que chaque CLAIM technique figure dans la Doc GSS ; sinon on la retire.
    const INVENTED_CLAIMS_RE = /\b(prime[s]?(?:\s+de\s+fin\s+d.ann[ée]e)?|avance[s]?\s+sur\s+salaire|p[ée]nalit[ée][s]?\s+(?:CCAP|contractuelles?)|heures?\s+suppl[ée]mentaires?\s+mensualis[ée]es?|CCAP)\b/gi;
    const guardInventedClaims = (val: string, _ctx: string): string => {
      const claims = val.match(INVENTED_CLAIMS_RE) || [];
      if (!claims.length) return val;
      // Vérifier chaque claim dans la documentation GSS
      const inventedClaims = claims.filter(c => !gssDocCompact.includes(normCtx(c).replace(/\s+/g, '')));
      if (!inventedClaims.length) return val;
      // Champ court → [À COMPLÉTER]
      if (val.length <= 200) {
        console.log(`[MemoireGenerator] Garde-fou invention: claim non sourcée → [À COMPLÉTER] ("${val.slice(0, 60)}")`);
        return '[À COMPLÉTER]';
      }
      // Paragraphe : retirer les phrases contenant le claim inventé
      let cleaned = val;
      for (const claim of inventedClaims) {
        const claimEsc = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentenceRe = new RegExp(`[^.;\n]*${claimEsc}[^.;\n]*[.;]?\\s*`, 'gi');
        cleaned = cleaned.replace(sentenceRe, '');
      }
      console.log(`[MemoireGenerator] Garde-fou invention: ${inventedClaims.length} claim(s) non sourcée(s) retirée(s).`);
      return cleaned.trim() || '[À COMPLÉTER]';
    };

    // ── Garde-fou DÉTERMINISTE des CELLULES DE TABLEAU : « 0 inventé » garanti ──
    // Tout nombre de ≥3 chiffres (indice « 170/160 », montant, n°…) présent dans une cellule mais
    // ABSENT du texte source réel (DCE — annexes incluses — + Doc GSS) est RETIRÉ. On vise les ≥3
    // chiffres pour ne pas toucher aux horaires/effectifs courts (« 1 agent », « 07H », « 16h15 »).
    const guardTableNumbers = (val: string): string => {
      if (!/\d{3,}/.test(val)) return val;
      const MARK = ' ';
      let out = val.replace(/\d{3,}/g, (run) => sourceTextNorm.includes(run) ? run : MARK);
      if (!out.includes(MARK)) return val;
      out = out
        .replace(/[,;]?\s*indice\s*(?:minimum|min\.?)?\s*:?\s* /gi, '')  // « indice minimum 170 » → retiré en entier
        .replace(/ /g, '')
        .replace(/\(\s*[,;]*\s*\)/g, '').replace(/\[\s*[,;]*\s*\]/g, '')      // parenthèses/crochets devenus vides
        .replace(/\s+([,.;)\]])/g, '$1').replace(/([(\[])\s+/g, '$1')
        .replace(/[,;]\s*([)\]])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      console.log('[MemoireGenerator] Garde-fou tableau: nombre(s) non sourcé(s) retiré(s).');
      return out;
    };

    // ── Anti-redondance du NOM DU CLIENT (demande utilisateur : pas plusieurs fois sur la même page) ──
    // Dans une même valeur, on garde la 1re occurrence du nom de l'acheteur et on remplace les
    // suivantes par un substitut neutre — la personnalisation passe par le contexte, pas la répétition.
    const clientNameDedup = (analysisData?.clientName || '').trim();
    // L'article qui précède le nom est capturé (« l'Université… », « du Centre… ») : le substitut porte le sien
    // (jamais « l'l’établissement » ni « du l’établissement »).
    const clientNameRe = clientNameDedup.length >= 6
      ? new RegExp(`(\\b(?:[Ll]['’]|[Ll][ae]s? |[Dd]u |[Aa]u |[Dd]es |[Aa]ux )|)${clientNameDedup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g') : null;
    // Jamais « l'établissement » à la place d'un nom connu (consigne 2) : les occurrences suivantes prennent la forme
    // courte de l'acheteur (sigles : « l'ENPC et l'IGN ») ; un nom déjà court est gardé tel quel.
    const courtDedup = clientNameDedup ? formesClient(clientNameDedup).court : undefined;
    const dedupeClientName = (val: string): string => {
      if (!clientNameRe || !courtDedup) return val;
      let n = 0;
      return val.replace(clientNameRe, (m, art: string, pos: number, tout: string) => {
        if (++n === 1) return m;
        const a = (art || '').toLowerCase();
        const c = courtDedup.article ? (courtDedup.article.endsWith("'") ? `${courtDedup.article}${courtDedup.nom}` : `${courtDedup.article} ${courtDedup.nom}`) : courtDedup.nom;
        const sub = a === 'du ' || a === 'des ' ? `de ${c}` : a === 'au ' || a === 'aux ' ? `à ${c}` : c;
        const debut = /(?:^|[.!?]\s+|\n\s*(?:[-*•]\s+)?)$/.test(tout.slice(0, pos));
        return (art && /^[A-Z]/.test(art)) || debut ? sub.charAt(0).toUpperCase() + sub.slice(1) : sub;
      });
    };

    // Garde-fou anti-invention de NOMS de personnes ("c'est qui Jean Dupont ?") : tout nom propre
    // de personne présent dans une valeur générée mais ABSENT des sources réelles (DCE + Doc GSS +
    // fichier « Personnes ») est remplacé par [À COMPLÉTER]. On ne se fie donc PAS au LLM pour les
    // noms : seuls les référents/contacts effectivement présents dans tes données peuvent ressortir.
    const sourceNamesNorm = sourceTextNorm;
    // Sigles/organisations en capitales : ne JAMAIS traiter comme des personnes (sinon faux positifs).
    const NAME_STOPLIST = new Set(['gss', 'gis', 'cctp', 'ccap', 'ccag', 'fcs', 'cnaps', 'apsad', 'ssiap',
      'cqp', 'aps', 'sst', 'dati', 'pti', 'erp', 'icpe', 'zrr', 'rgpd', 'tva', 'siret', 'siren', 'kbis',
      'place', 'aws', 'dc1', 'dc2', 'noti1', 'noti2', 'pca', 'ppms', 'poi', 'rse', 'iso', 'mac', 'nfc',
      'qr', 'sla', 'kpi', 'etp', 'pc', 'gtc']);
    // Mots-indices d'une personne : permettent de repérer un nom même en casse normale ("Pierre Martin").
    const CUE = `(?:M\\.|Mme|Mr\\.?|Monsieur|Madame|Dr\\.?|interlocuteur|responsable|directeur|directrice|contact|r[ée]f[ée]rent|dirigeant|g[ée]rant|pr[ée]sident|pr[ée]sidente|chef|encadrant|nomm[ée]|assur[ée])`;
    // Un nom = 2 mots Capitalisés (l'un peut être en CAPITALES : convention NOM Prénom).
    // Majuscules seulement : la plage « À-Ÿ » contient aussi les minuscules accentuées (é, è, à…), si bien que
    // « GSS établit » ou « GSS équipe » étaient pris pour un « NOM Prénom » et remplacés par [À COMPLÉTER].
    const MAJ = 'A-ZÀ-ÖØ-ÞŒŸ';
    const NAME = `[${MAJ}][\\wÀ-ÿ'’-]+\\s+[${MAJ}][\\wÀ-ÿ'’-]+`;
    // Détecte un nom SOIT précédé d'un indice (cas casse normale), SOIT en convention CAPITALES/Capitale.
    const PERSON_NAME_RE = new RegExp(
      `(?:${CUE}[\\s,’'-]+)(${NAME})` +                                       // indice + Prénom Nom
      `|\\b([${MAJ}]{2,}(?:[-'’][${MAJ}]+)*\\s+[${MAJ}][a-zà-ÿ][\\wà-ÿ'’-]*)` + // NOM Prénom
      `|\\b([${MAJ}][a-zà-ÿ][\\wà-ÿ'’-]*\\s+[${MAJ}]{2,}(?:[-'’][${MAJ}]+)*)\\b`, // Prénom NOM
      'g');
    /** Vrai si CHAQUE composant du nom (≥3 lettres) est présent dans les sources (ordre indifférent). */
    const nameInSources = (name: string): boolean => {
      const tokens = normCtx(name).split(/[\s,’'-]+/).filter((t) => t.length >= 3 && !NAME_STOPLIST.has(t));
      if (tokens.length === 0) return true;                       // que des sigles/initiales → on laisse
      // Mot au pluriel d'un mot des sources (havre2 702 : intitulé « Autorisations CNAPS » pris pour « Prénom NOM » et remplacé
      // par « [À COMPLÉTER] », alors que « Autorisation CNAPS » figure dans le cadre).
      return tokens.every((t) => sourceNamesNorm.includes(t) || (/[sx]$/.test(t) && t.length > 5 && sourceNamesNorm.includes(t.slice(0, -1))));
    };
    const guardNames = (val: string): string =>
      val.replace(PERSON_NAME_RE, (full, cued, nomFirst, nomLast) => {
        const name = (cued || nomFirst || nomLast || '').trim();   // partie « nom » réellement capturée
        if (!name || nameInSources(name)) return full;             // nom présent dans tes données → OK
        console.log(`[MemoireGenerator] Garde-fou noms: "${name}" absent des sources → [À COMPLÉTER]`);
        // On ne remplace QUE le nom, en préservant l'éventuel mot-indice qui le précède.
        return full.replace(name, '[À COMPLÉTER]');
      });

    // Garde-fou « placeholders » : (1) normalise un "[À COMPLÉTER]" mal formé (ex. "À COMPLÉTER"
    // sans crochets, renvoyé par le modèle) ; (2) neutralise les EXEMPLES-TYPES que le LLM glisse
    // parfois malgré la consigne — faux noms/dates/numéros que guardNames/guardFactual ne couvrent
    // pas toujours (ex. "Jean Dupont" en Titlecase sans mot-indice). → [À COMPLÉTER].
    // Inclut les exemples factices du CADRE CLIENT lui-même (le template contient des valeurs de
    // démonstration — faux nom, fausse date, faux n° séquentiel — que le modèle recopie comme si
    // elles étaient sourcées, puisqu'elles figurent dans le DCE). On les neutralise explicitement.
    const FAKE_VALUE_RE = /\bjean\s+dupont\b|\bjohn\s+doe\b|prenom\.nom@|\b01\s?23\s?45\s?67\s?89\b|\b01\/01\/2020\b|\b123\s?456\s?789\b|\b987\s?654\s?321\b/gi;
    const guardPlaceholders = (val: string, ctx = ''): string => {
      let v = val.trim();
      if (!v) return '';   // valeur volontairement vidée (ligne parasite) → reste VIDE, pas « [À COMPLÉTER] »
      if (/^\[?\s*[àa]\s*compl[ée]ter\s*\]?\.?$/i.test(v)) return '[À COMPLÉTER]';
      v = v.replace(FAKE_VALUE_RE, '[À COMPLÉTER]');
      // Canonicalise les placeholders bracketés (le modèle templatise parfois plusieurs emplacements :
      // « Nom, N° agrément — Nom / N° » → « [À COMPLÉTER], [À COMPLÉTER] — [À COMPLÉTER] / [À COMPLÉTER] »).
      v = v.replace(/\[\s*[àa]\s*compl[ée]ter\s*\]/gi, '[À COMPLÉTER]');
      // Si, une fois retirés les placeholders et les séparateurs, il ne reste RIEN d'utile → un seul.
      const meaningful = v.replace(/\[À COMPLÉTER\]/g, '').replace(/[\s,;:/|.\-—–()]+/g, '');
      if (!meaningful) return '[À COMPLÉTER]';
      // Réponse développée (texte du mémoire type repris tel quel, paragraphe de plus de 40 mots ou sur plusieurs lignes,
      // T7CS-3) : chaque « [À COMPLÉTER] » reste à sa place, avec sa question ; la fusion ci-dessous ne vaut que pour une
      // cellule ou une réponse courte (« une équipe de agents titulaires », colonne Nombre vidée, sinon).
      if (/\n/.test(v) || v.split(/\s+/).length > 40) return v;
      // Fusionne les séquences de placeholders séparés par de la simple ponctuation.
      v = v.replace(/\[À COMPLÉTER\](?:\s*[,;/|—–-]+\s*\[À COMPLÉTER\])+/g, '[À COMPLÉTER]');
      // Il reste ≥2 placeholders → le modèle a recopié la STRUCTURE de la question avec des libellés
      // intermédiaires (« [À COMPLÉTER] / Date d'obtention de l'autorisation : [À COMPLÉTER] »). On
      // n'en garde qu'UN SEUL : on ne conserve que le texte qui n'est PAS un libellé déjà dans la
      // question (ex. un vrai nom de référent), et on termine par un unique [À COMPLÉTER].
      if ((v.match(/\[À COMPLÉTER\]/g) || []).length >= 2) {
        // Comparaison robuste : on ignore ponctuation/apostrophes/espaces (le libellé recopié et la
        // question ont parfois des apostrophes différentes) → "d'obtention" ≡ "d obtention".
        const alnum = (s: string) => normCtx(s).replace(/[^a-z0-9]+/g, '');
        const qn = alnum(ctx);
        const realParts = v.split(/\[À COMPLÉTER\]/)
          .map(s => s.replace(/^[\s,;:/|.\-—–()]+|[\s,;:/|.\-—–()]+$/g, '').trim())
          .filter(s => { const ns = alnum(s); return ns.length >= 3 && !qn.includes(ns); });
        return realParts.length ? `${realParts.join(' ')} [À COMPLÉTER]` : '[À COMPLÉTER]';
      }
      return v;
    };

    // ── Lignes-réponse PARASITES (sur-découpage du cadre client) ──
    // Sous un libellé, le gabarit a souvent PLUSIEURS lignes pointillées : seule la 1re porte le
    // libellé comme « Question: » ; les suivantes sont détectées comme des champs-réponse SANS
    // question propre (« Question: \":\" » ou vide). On ne les vide PAS systématiquement (ça
    // supprimait du contenu pertinent — « Réunions de suivi mensuelles », « Primes… »). On ne vide
    // QUE celles qui n'apportent AUCUNE info réelle : un placeholder seul, ou un simple LIBELLÉ déjà
    // présent dans le contexte (recopié par le modèle). Le contenu distinct est CONSERVÉ. On ne
    // touche ni aux cellules de tableau ni aux cases.
    {
      const valById = new Map<number, string>(replacements.map(r => [r.id, String(r.value)]));
      const alnum = (s: string) => normCtx(s).replace(/[^a-z0-9]+/g, '');
      let cleared = 0;
      for (const d of descriptors) {
        if (d.kind !== 'answer') continue;
        const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
        const qClean = q.replace(/[\s.:;,…\-—–/|()]+/g, '');
        if (qClean.length !== 0) continue;                       // a une vraie question → on GARDE
        const v = (valById.get(d.id) ?? '').trim();
        if (!v) continue;
        // Résidu = valeur sans les placeholders. Rien, ou un libellé déjà dans le contexte → on vide.
        const residual = alnum(v.replace(/\[?\s*[àa]\s*compl[ée]ter\s*\]?/gi, ''));
        const noRealInfo = residual.length < 3 || alnum(d.context).includes(residual);
        if (noRealInfo) { valById.set(d.id, ''); cleared++; }    // sinon : contenu distinct → CONSERVÉ
      }
      if (cleared) console.log(`[MemoireGenerator] Lignes parasites vidées (placeholder/libellé recopié): ${cleared}`);
      replacements.forEach(r => { if (valById.has(r.id)) r.value = valById.get(r.id)!; });
    }

    /** Ligne de continuation « : …… » (sans question propre) d'un libellé qui a déjà sa propre zone de réponse. */
    const continuationAvecPrincipale = (d: FieldDesc): boolean => {
      if (d.kind === 'checkbox') return false;
      const qD = ((d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').replace(/[\s.:;,…\-—–/|()]+/g, '');
      const libelleD = normCtx(((d.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '');
      return !qD && libelleD.length > 5 && descriptors.some((o) => o.id !== d.id && o.kind !== 'checkbox'
        && normCtx((o.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '') === libelleD);
    };

    // ── Déduplication des zones SUR-DÉCOUPÉES ──
    // Certaines zones de réponse (lignes pointillées consécutives sous un même libellé, ou plusieurs
    // cellules vides d'une même ligne de tableau) sont détectées comme PLUSIEURS champs → elles
    // reçoivent la même valeur, qui se répète en cascade dans le document. Deux dédoublonnages :
    //  • VALEURS RÉDIGÉES identiques au contexte identique → on garde la 1re, on vide les suivantes ;
    //  • « [À COMPLÉTER] » purs → une seule fois par LIGNE/zone (même ligne de tableau ou même
    //    question) : inutile d'écrire « [À COMPLÉTER] » dans chaque case vide d'une même ligne.
    {
      const dedupSig = (ctx: string) => normCtx(ctx.replace(/\[CHAMP_\d+\]/g, ''));
      // Signature « ligne/zone » (plus grossière) pour regrouper les [À COMPLÉTER] d'une même ligne.
      const lineSig = (ctx: string) => {
        const section = (ctx.match(/Section:\s*"([^"]*)"/) || [])[1] || '';
        const ligne = (ctx.match(/Ligne:\s*"([^"]*)"/) || [])[1];      // cellules d'une même ligne de tableau
        const question = (ctx.match(/Question:\s*"([^"]*)"/) || [])[1]; // lignes d'une même zone de réponse
        const groupe = (ctx.match(/Groupe:\s*"([^"]*)"/) || [])[1];     // bloc de contacts (comptable, commercial…)
        return normCtx(section + '||' + (ligne ?? question ?? '') + (groupe ? `||${groupe}` : ''));
      };
      const isPureBlank = (v: string) => /^\[?\s*[àa]\s*compl[ée]ter\s*\]?\.?$/i.test(v.trim());
      const valById = new Map<number, string>(replacements.map(r => [r.id, String(r.value)]));
      const seenVal = new Map<string, Set<string>>();   // valeurs rédigées déjà vues (par contexte complet)
      const blankLines = new Set<string>();             // lignes/zones portant déjà un [À COMPLÉTER]
      // ── Anti QUASI-doublons (même zone) : empêche de répéter « Prime fin d'année … » sur 3-4 lignes ──
      // On compare les VALEURS d'une même zone/ligne (lineSig) par recouvrement de mots significatifs ;
      // au-delà de ~78 %, c'est une redite → on vide (on garde la 1re formulation).
      const DUP_STOP = new Set(['avec', 'pour', 'dans', 'des', 'les', 'une', 'aux', 'sur', 'par', 'que', 'qui', 'sont', 'plus', 'leur', 'nos', 'notre']);
      const sigWords = (v: string) => new Set(
        normCtx(v).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !DUP_STOP.has(w)));
      const overlap = (a: Set<string>, b: Set<string>) => {
        if (!a.size || !b.size) return 0;
        let n = 0; for (const w of a) if (b.has(w)) n++;
        return n / Math.min(a.size, b.size);
      };
      const zoneWordSets = new Map<string, Array<Set<string>>>();   // mots déjà vus par zone (lineSig)
      const motsSection = new Map<string, Set<string>>();             // mots déjà écrits par section du cadre
      for (const d of descriptors.slice().sort((a, b) => a.id - b.id)) {
        if (d.kind === 'checkbox') continue;
        const v = (valById.get(d.id) ?? '').trim();
        if (!v) continue;
        if (isPureBlank(v)) {
          // Ligne de continuation « : …… » d'une question qui a déjà sa propre zone de réponse (même libellé) : pointillés
          // effacés, jamais un « [À COMPLÉTER] » sans objet (la question posée à GSS n'aurait pas de sujet).
          if (continuationAvecPrincipale(d)) {
            valById.set(d.id, '');
            console.log(`[MemoireGenerator] [À COMPLÉTER] retiré d'une ligne de continuation (CHAMP_${d.id})`);
            continue;
          }
          // Case du tableau des autorisations CNAPS (date de l'agrément dirigeant, fin de validité) : donnée de GSS à fournir
          // avant la remise, jamais une case vidée sans question (D7).
          // Une case qui attend une donnée de GSS (colonne NOM, Prénom, Date… d'une ligne nommée : « SST », « C.Q.P.A.D.S. »)
          // garde aussi son repère et sa question (T4-COH-2) ; les autres cases restent vides.
          if (d.kind === 'table' && !/Ligne:\s*"[^"]*(?:autorisation|agr[ée]ment)[^"]*(?:dirigeant|entreprise)/i.test(d.context)
            && !(COLONNE_VALEUR.test(colonneCase(d.context)) && /Ligne:\s*"\s*[A-Za-zÀ-ÿ]/.test(d.context) && /formation|dipl[ôo]me|qualification|SST|CQP|SSIAP|agent|personnel/i.test(d.context))) {
            valById.set(d.id, '');
            console.log(`[MemoireGenerator] [À COMPLÉTER] retiré pour cellule de tableau (CHAMP_${d.id})`);
            continue;
          }
          const ls = lineSig(d.context);
          if (blankLines.has(ls)) { valById.set(d.id, ''); console.log(`[MemoireGenerator] [À COMPLÉTER] en trop vidé: CHAMP_${d.id} (même ligne)`); }
          else blankLines.add(ls);
          continue;
        }
        const sig = dedupSig(d.context);
        const set = seenVal.get(sig) ?? seenVal.set(sig, new Set()).get(sig)!;
        const nv = normCtx(v);
        // Coordonnées d'un contact : la même personne peut être le contact de l'exécution et celui des commandes (havre1 :
        // coordonnées du contact pour les commandes vidées comme « doublon » de celles du contact d'exécution).
        const coordonnees = /Question:\s*"[^"]*(?:coordonn|t[ée]l[ée]phone|e-?mail|courriel|adresse)/i.test(d.context);
        if (set.has(nv) && !coordonnees) { valById.set(d.id, ''); console.log(`[MemoireGenerator] Doublon vidé: CHAMP_${d.id} (même contexte/valeur)`); continue; }
        set.add(nv);
        // Quasi-doublon dans la MÊME zone (lignes d'une même question/zone) → vidé.
        const ws = sigWords(v);
        // Ligne de continuation « : …… » remplie de mots déjà écrits plus haut dans la même section (génération réelle
        // rouen_univ 705 : sous « Certification de service ISO / APSAD », « Responsable qualité : VATTIER Marie — contrôles
        // inopinés, mensuels et trimestriels… » puis « … contrôle interne annuel… », redites du plan qualité) : vidée.
        {
          const section = normCtx((d.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '');
          const racine = (w: string) => w.replace(/(?:s|x)$/, '').slice(0, 7);
          const deja = new Set([...(motsSection.get(section) || [])].map(racine));
          const propres = [...ws].map(racine);
          const neufs = propres.filter((w) => !deja.has(w)).length;
          // Ligne qui parle du sujet de sa propre question (« Plan qualité interne – responsable qualité » : « Responsable
          // qualité : VATTIER Marie… ») : jamais vidée ; seule une redite hors sujet l'est (sous « Certification… »).
          // Question de la ligne : celle qui la précède dans le document (rouen_univ 708 : les lignes « : …… » sous « Certification
          // de service ISO / APSAD » portent dans leur contexte l'intitulé du plan qualité, au-dessus).
          const precedente = descriptors.filter((o) => o.id < d.id && o.kind !== 'checkbox' && !continuationAvecPrincipale(o)
            && ((o.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').replace(/[\s.:;,…\-—–/|()]+/g, '')).sort((a, b) => b.id - a.id)[0];
          const libelleQ = ((precedente?.context.match(/Question:\s*"([^"]*)"/) || [])[1])
            || ((d.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '').split('/').map((x) => x.trim()).filter(Boolean).pop() || '';
          const motsQ = new Set([...sigWords(libelleQ)].map(racine));
          const dansLeSujet = propres.some((w) => motsQ.has(w));
          // Sujet d'une autre question de la même section (« Responsable qualité : VATTIER Marie… » sous « Certification de
          // service ISO / APSAD », alors que « Plan qualité interne – responsable qualité » est une autre question, rouen_univ 707).
          const autreSujet = !dansLeSujet && descriptors.some((o) => o.id !== d.id && o.kind !== 'checkbox'
            && normCtx((o.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '') === section
            && (() => { const q = new Set([...sigWords((o.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '')].map(racine)); return propres.filter((w) => q.has(w)).length >= 2; })());
          // Redite pure (aucun mot porteur nouveau, rouen_univ 707 : « Responsable qualité : VATTIER Marie — contrôle global
          // trimestriel, réunions de suivi… » sous la certification, mots tous écrits dans le plan qualité) : vidée même dans le sujet.
          const rediteePure = neufs === 0 && propres.length >= 5;
          if (continuationAvecPrincipale(d) && section && (rediteePure || (!dansLeSujet && propres.length >= 3 && (neufs / propres.length <= 0.4 || autreSujet)))) {
            valById.set(d.id, '');
            console.log(`[MemoireGenerator] Ligne de continuation vidée : CHAMP_${d.id} (redite de la section)`);
            continue;
          }
          ws.forEach((w) => (motsSection.get(section) ?? motsSection.set(section, new Set()).get(section)!).add(w));
        }
        const ls = lineSig(d.context);
        const arr = zoneWordSets.get(ls) ?? zoneWordSets.set(ls, []).get(ls)!;
        if (ws.size >= 3 && !coordonnees && arr.some((prev) => overlap(ws, prev) >= 0.78)) {
          valById.set(d.id, '');
          console.log(`[MemoireGenerator] Quasi-doublon vidé: CHAMP_${d.id} (redite dans la même zone)`);
        } else {
          arr.push(ws);
        }
      }
      replacements.forEach(r => { if (valById.has(r.id)) r.value = valById.get(r.id)!; });
    }

    // ── (Brief §3) Résolution des infos manquantes — PISTE D'AMÉLIORATION, désactivée par défaut ──
    // Pour chaque champ resté « [À COMPLÉTER] », l'outil pourra (futur) chercher l'info publique sur
    // Internet (identité du client) ou la demander à l'équipe par email (info interne, ex. dirigeant),
    // puis réintégrer la réponse — au lieu de laisser un blanc. Stub non bloquant (no-op tant que les
    // voies web/email ne sont pas implémentées). Activable via RESOLVE_MISSING_INFO=true.

    const missingInfo = replacements
      .filter((r: any) => /\[À COMPLÉTER\]/.test(String(r.value)))
      .map((r: any) => {
        const d = descriptors.find((x: any) => x.id === r.id);
        const label = d?.grille ? questionsGrille(d).join(' ; ') : (d?.context.match(/Question:\s*"([^"]*)"|option:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/) || [])
          .slice(1).find(Boolean) || d?.context || '';
        return { id: r.id, label: String(label).trim(), context: d?.context || '' };
      });

    if (missingInfo.length > 0) {
      // Persistance de l'état « cadre » pour la reprise avec réponses utilisateur (fonctionnalité
      // désactivée : le `return incomplete` ci-dessous est commenté). NON ESSENTIEL → ne doit JAMAIS
      // faire échouer la génération. En particulier, si la ligne `dossiers` appartient à un autre
      // user_id, l'upsert est bloqué par la RLS Supabase : on log et on continue sans planter.
      try {
        const tempPath = require('path').join(this.responseDir, `temp_${dossierId}.docx`);
        const tempSerializer = new XMLSerializer();
        zip.file('word/document.xml', tempSerializer.serializeToString(xmlDoc));
        const tempBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        require('fs').writeFileSync(tempPath, tempBuf);

        // Persistance CROSS-POSTE : le temp local est lié à CETTE machine (injoignable ailleurs) →
        // on le pousse aussi dans un bucket privé et on stocke sa clé. L'upload a lieu ICI, à la
        // génération, donc AVANT toute suppression locale (finalizeMemoire) → temp récupérable après.
        let storageKey: string | null = null;
        try {
          storageKey = await uploadTempDocx(dossierId, tempBuf);
        } catch (e: any) {
          console.warn(`[MemoireGenerator] Upload temp Storage échoué (on garde le fallback local): ${e?.message || e}`);
        }

        const curDossier = await DB.getDossier(dossierId);
        const prevSt = (curDossier?.memoire_cadre_state && typeof curDossier.memoire_cadre_state === 'object')
          ? curDossier.memoire_cadre_state : {};
        await DB.saveDossier(dossierId, {
          memoire_cadre_state: { ...prevSt, tempPath, storageKey, missingFields: prevSt.missingFields || missingInfo }
        });
        console.log(`[MemoireGenerator] État cadre sauvegardé (${missingInfo.length} champ(s) manquant(s))${storageKey ? ` — temp uploadé (${storageKey})` : ''}.`);
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Sauvegarde de l'état cadre ignorée (non bloquant) : ${e?.message || e}`);
      }

      // ── Ticket #4 phase 2b — déclencheur GATÉ par RESOLVE_MISSING_INFO (OFF par défaut). ──
      // Réutilise missingInfo ({id,label,context}) déjà calculée ci-dessus — AUCUN re-parse du .docx.
      // FLAG OFF → aucun appel, génération STRICTEMENT inchangée (mémoire + missingFields identiques).
      // FLAG ON → fire-and-forget : recherche web en fond des champs 'public' → recherche_web
      // (statut « en_attente_validation », anti-doublon déjà en place). AUCUNE injection : le .docx
      // n'est PAS modifié ici. Le .catch() garantit qu'un échec ne casse jamais la génération.
      if (getSettings().resolveMissingInfoEnabled) {
        resolveMissingInfo(missingInfo as MissingField[], dossierId).catch((e: any) =>
          console.warn('[MemoireGenerator] resolveMissingInfo (fond) échec non bloquant:', e?.message));
      }
      // return { status: 'incomplete', missingFields: missingInfo };
    }

    // 5 ter. Parties limitées en pages (« 1 page maximum ») : hauteur de chaque partie estimée sur le document (titres et
    // questions du cadre, réponses, schéma de la compréhension) ; une partie trop longue est ramenée à sa limite par des
    // retraits de passages entiers, signalés à GSS (ca_normandie 221 : partie 1 débordant sur une deuxième page).
    try {
      const documentXml = new XMLSerializer().serializeToString(xmlDoc);
      const stylesXml = zip.file('word/styles.xml')?.asText() || '';
      const g = geometrieCadre(documentXml, stylesXml);
      const [idComp, svgComp] = [...svgComprehension.entries()][0] || [];
      const valeurs = new Map(replacements.filter((r) => descriptors.find((d) => d.id === r.id)?.kind !== 'checkbox').map((r) => [r.id, String(r.value ?? '')] as const));
      const aj = ajusterPartiesLimitees({
        documentXml, stylesXml, valeurs,
        comprehension: idComp !== undefined && svgComp ? { id: idComp, hauteurPt: hauteurSchemaPt(svgComp, g.largeurPt) } : null,
        ajoutsCouverture: ajoutsCouvertureCadre,
        etapesSchema: svgComp ? textesSchemaSvg(svgComp) : [],
      });
      partiesAjustees = aj.parties;
      for (const r of replacements) if (aj.valeurs.has(r.id)) r.value = aj.valeurs.get(r.id)!;
      for (const p of aj.parties) {
        const partageee = { resteEmu: Math.round(p.restePt * 12700) };
        for (const id of p.ids) {
          if (id === idComp && p.imageComprehensionPt !== undefined) hauteurSchemaMax.set(`GSS_CH_${id}`, Math.round(p.imageComprehensionPt * 12700));
          else placeSchemas.set(`GSS_CH_${id}`, partageee);
        }
        const libellePartie = `${p.titre}${p.titre.includes(p.section) ? '' : ` (${p.section})`}`;
        console.log(`[MemoireGenerator] Partie « ${libellePartie} » : ${(p.avantPt / (p.budgetPt / p.pages)).toFixed(2)} → ${(p.apresPt / (p.budgetPt / p.pages)).toFixed(2)} page(s) estimée(s) pour ${p.pages} autorisée(s)${p.retires.length ? `, ${p.retires.length} passage(s) retiré(s)` : ''}${p.imageComprehensionPt !== undefined ? `, schéma de la compréhension ${Math.round(p.imageComprehensionPt / 28.35 * 10) / 10} cm de haut au plus` : ''}.`);
        if (p.retires.length) {
          confirmationsGss.add(`Partie « ${libellePartie} » : pour tenir dans ${p.pages === 1 ? '1 page' : `${p.pages} pages`}, ${p.retires.length === 1 ? 'ce passage n\'a pas été repris' : `ces ${p.retires.length} passages n'ont pas été repris`} : ${p.retires.map((x) => `« ${x.texte.length > 140 ? `${x.texte.slice(0, 140).replace(/\s+\S*$/, '')}…` : x.texte} »`).join(' ; ')}. Faut-il en rétablir un à la place d'un autre ?`);
          for (const id of new Set(p.retires.filter((x) => x.origine === 'memoire_type').map((x) => x.id))) {
            const libelle = libelleQuestionCadre((descriptors.find((d) => d.id === id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || `Champ ${id}`);
            propositionsCadre.set(id, `Réponse à relire (mémoire type de GSS repris en partie pour tenir dans la limite de ${p.pages === 1 ? '1 page' : `${p.pages} pages`}) : ${libelle}`);
          }
        }
        if (p.depasse) confirmationsGss.add(`Partie « ${libellePartie} » : elle dépasse encore la limite de ${p.pages === 1 ? '1 page' : `${p.pages} pages`} fixée par l'acheteur. Quels passages faut-il retirer avant la remise ?`);
      }
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Contrôle des parties limitées en pages indisponible : ${e?.message || e}`);
    }

    // Phrases de GSS adaptées au CCTP (D8) : retrouvées dans les réponses finales ; choix de GSS de la génération
    // précédente appliqués aux réponses ; les autres signalées (consultations, premier message de l'assistant).
    let adaptationsCadre: PhraseAdaptee[] = [];
    if (suiviCadre) {
      const textesChamps: Record<string, string> = {};
      for (const r of [...replacements].sort((a, b) => a.id - b.id)) if (descriptors.find((d) => d.id === r.id)?.kind !== 'checkbox' && String(r.value ?? '').trim()) textesChamps[`GSS_CH_${r.id}`] = String(r.value);
      const libelle = (k: string) => { const id = Number(k.replace('GSS_CH_', '')); return libelleQuestionCadre((descriptors.find((d) => d.id === id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || `Réponse ${id}`); };
      // Phrase d'origine écrite dans la forme du cadre (texte brut, puces « • »), jamais en Markdown (T7N-2).
      adaptationsCadre = this.finaliserAdaptations(suiviCadre, textesChamps, libelle, [], Object.fromEntries([...repriseParChamp.entries()].map(([id, x]) => [`GSS_CH_${id}`, x.ids])), texteBrut);
      for (const r of replacements) { const t = textesChamps[`GSS_CH_${r.id}`]; if (t !== undefined && t !== String(r.value)) r.value = t; }
    }

    // 6. Apply replacements in the DOM
    let applied = 0;
    replacements.forEach((rep: any) => {
      const desc = descriptors.find(d => d.id === rep.id);
      if (!desc) return;
      if (desc.kind !== 'checkbox') {
        const faits = controlerFaitsNouveauxCadre(String(rep.value ?? ''), desc.context, sourcesFaits);
        if (faits.questions.length) {
          faits.questions.forEach((q) => confirmationsGss.add(q));
          console.log(`[MemoireGenerator] Garde-fou faits nouveaux (CHAMP_${rep.id}) : ${faits.questions.length} point(s) posé(s) à GSS.`);
        }
        rep.value = faits.texte;
      }
      let value = dedupeClientName(guardPlaceholders(guardNames(guardInventedClaims(guardServiceCert(guardFactual(String(rep.value), desc.context), desc.context), desc.context)), desc.context));
      // Ligne de continuation « : …… » vidée par un garde-fou : pointillés effacés plutôt qu'un « [À COMPLÉTER] » sans objet.
      if (/^\[À COMPLÉTER\]\.?$/.test(value.trim()) && continuationAvecPrincipale(desc)) value = '';
      // Sous-traitance d'une prestation (« … est-elle sous-traitée ? Si oui à quelle(s) entreprise(s) ») : réponse connue de
      // GSS (registre recours_sous_traitance : « Non »), jamais « [À COMPLÉTER] » ni question.
      if (/^\[À COMPLÉTER\]\.?$/.test(value.trim()) && desc.kind !== 'checkbox') {
        const st = reponseSousTraitance(desc.context, valeurRegistre('recours_sous_traitance'));
        if (st) { value = st; console.log(`[MemoireGenerator] CHAMP_${rep.id} : sous-traitance, réponse connue de GSS (« Non »).`); }
      }
      // Réponse développée d'une grille de notation : mêmes garde-fous, mais appliqués PHRASE par phrase
      // (téléphones/e-mails non sourcés retirés, certifications/claims non prouvées retirées) plutôt
      // qu'en effaçant toute la réponse ; la mise en forme en lignes est conservée.
      if (desc.grille) {
        value = dedupeClientName(guardInventedClaims(guardServiceCert(guardFactual(String(rep.value), 'coordonnees'), desc.context), desc.context)
          .split('\n').map((l) => guardNames(l)).join('\n'))
          .replace(/\*\*/g, '').replace(/^#+\s*/gm, '')
          .replace(FAKE_VALUE_RE, '[À COMPLÉTER]').replace(/\[\s*[àa]\s*compl[ée]ter\s*\]/gi, '[À COMPLÉTER]')
          .replace(/\n{3,}/g, '\n\n').trim() || '[À COMPLÉTER]';
      }
      // Cellule de tableau → garde-fou déterministe : retire tout nombre ≥3 chiffres non sourcé (« 170 »…).
      if (desc.kind === 'table') value = guardTableNumbers(value);
      // Contact SINGULIER : si le LIBELLÉ demande UNE personne (« la personne », « l'interlocuteur »…)
      // et que la valeur en liste plusieurs (plusieurs lignes), on ne garde QUE la 1re. Dynamique :
      // on lit le libellé, on ne présuppose AUCUN nom (≠ valeur en dur).
      {
        const q = normCtx((desc.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '')
          .replace(/['’]/g, ' ');
        const askOne = /\b(la personne|l ?interlocuteur|le contact|de la personne|du contact)\b/.test(q)
          && !/\b(personnes|interlocuteurs|liste|organigramme)\b/.test(q);
        if (askOne) {
          const lines = value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
          if (lines.length > 1) { value = lines[0]; console.log(`[MemoireGenerator] Contact singulier: liste réduite à 1 personne (CHAMP_${rep.id}).`); }
        }
      }
      // Lignes de tableau écrites avec des « | » (dispositif du cas pratique, générations réelles etampes2 701 et 702 : « Dimanche
      // férié, 6 h–21 h | Agent de sécurité | en service : 10 | rotation : 20 ») : jamais de « | » imprimé dans le cadre ; même
      // forme que les tableaux de GSS (texteBrut, « A : B : C »).
      if (desc.kind !== 'checkbox') value = sansBarresTableau(value);
      // Pour une CASE À COCHER : on ne coche QUE si le modèle a explicitement renvoyé ☑/☒ — jamais
      // parce qu'il a recopié un libellé « Oui » (sinon une option « Oui » serait cochée à tort).
      const isChecked = desc.kind === 'checkbox'
        ? /[☑☒]/.test(value)
        : (value.includes('☑') || value.toLowerCase() === 'oui' || value.toLowerCase() === 'yes' || value === '1' || value === 'true');
      // Récap fidèle au document : pour une case, on affiche son état réel (☑/☐), pas le texte brut.
      rep.value = desc.kind === 'checkbox' ? (isChecked ? '☑' : '☐') : value;

      if (desc.type === 'text') {
        // Case à cocher « texte » (☐ du gabarit) : on N'écrit JAMAIS la valeur brute du modèle
        // (qui pourrait être un libellé ou « [À COMPLÉTER] ») — uniquement ☑ (si prouvée) ou ☐.
        // Chaque « [À COMPLÉTER] » écrit porte le n° de son champ (marque interne, remplacée par un
        // signet Word invisible avant l'enregistrement) → complétion ultérieure au bon emplacement.
        // Chaque réponse rédigée est aussi encadrée (signet GSS_CH_n) : l'assistant de modification
        // pourra la réécrire sans jamais toucher au texte du cadre de l'acheteur.
        const marquee = value.split('[À COMPLÉTER]').join(`[À COMPLÉTER]${MARQUE_CHAMP(rep.id)}`);
        const writeVal = desc.kind === 'checkbox' ? (isChecked ? '☑' : '☐') : (value.trim() ? `${DEBUT_CHAMP(rep.id)}${marquee}${FIN_CHAMP(rep.id)}` : marquee);
        const tEls = getElementsWithLocalName(xmlDoc, 't');
        // Intitulé suivant collé dans le même paragraphe que la ligne pointillée (cadre de l'université de Rouen : « ………Moyens
        // d'ouverture des locaux pour la levée de doute », génération réelle rouen_univ 15 : « … : [À COMPLÉTER].Moyens
        // d'ouverture… ») : une réponse rédigée est suivie d'un retour à la ligne, l'intitulé garde sa ligne.
        tEls.forEach((tEl: any) => replaceTextInElement(xmlDoc, tEl, `[CHAMP_${rep.id}]`,
          (desc.kind !== 'checkbox' && /\n/.test(value.trim()) && intituleColleAvant(tEl, `[CHAMP_${rep.id}]`) ? '\n' : '')
          + writeVal + (desc.kind !== 'checkbox' && value.trim().length >= 40 && intituleColleApres(tEl, `[CHAMP_${rep.id}]`) ? '\n' : '')));
        applied++;
      } else if (desc.type === 'legacy_checkbox') {
        let checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w:val', isChecked ? '1' : '0');
        applied++;
      } else if (desc.type === 'sym_checkbox') {
        desc.element.setAttribute('w:char', isChecked ? 'F0FE' : 'F0A8');
        applied++;
      } else if (desc.type === 'w14_checkbox') {
        let checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = xmlDoc.createElementNS('http://schemas.microsoft.com/office/word/2010/wordml', 'w14:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w14:val', isChecked ? '1' : '0');
        let sdt = getParentWithLocalName(desc.element, 'sdt');
        if (sdt) {
          getElementsWithLocalName(sdt, 't').forEach((t: any) => { t.textContent = isChecked ? '☒' : '☐'; });
        }
        applied++;
      }
    });

    // 7. Clean up remaining placeholders
    getElementsWithLocalName(xmlDoc, 't').forEach((tEl: any) => {
      const text = tEl.textContent || '';
      if (/\[CHAMP_\d+\]/.test(text)) tEl.textContent = text.replace(/\[CHAMP_\d+\]/g, '');
    });

    console.log(`[MemoireGenerator] Applied ${applied}/${replacements.length} replacements.`);

    // 7 bis. Liste des champs restés « [À COMPLÉTER] » APRÈS garde-fous (fidèle au document remis)
    // → transformés en QUESTIONS à compléter, remontées comme notification (comme le no-template).
    /** Champ de chaque libellé de la liste (consultations : la question précise des emplacements du champ, T4C-7). */
    const champDuLibelle = new Map<string, number>();
    const aCompleter: string[] = replacements
      .filter((r: any) => /\[À COMPLÉTER\]/.test(String(r.value)))
      .flatMap((r: any) => {
        const d = descriptors.find((x: any) => x.id === r.id);
        if (d?.grille) return questionsGrille(d);
        const ctx = d?.context || '';
        // Pour un champ de tableau, on garde COLONNE + LIGNE (pas seulement la ligne) afin que la
        // question soit sans ambiguïté. Sinon on prend la Question / l'option de case à cocher.
        const m = ctx.match(/Question:\s*"([^"]*)"|option:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/);
        const label = (m ? m.slice(1).find(Boolean) : '') || ctx.replace(/\s*\|\s*Contexte proche:.*$/, '').trim();
        // Bloc de contacts : « Contact comptable — Prénom, Nom » (sinon trois questions identiques, sans le contact visé).
        const groupe = (ctx.match(/Groupe:\s*"([^"]*)"/) || [])[1];
        // Forme des cartes de l'assistant, sans consolidation par le modèle (T8CS-4) : case de tableau par ligne et colonne,
        // champ d'un contact « Cadre de réponse, « Contact comptable » : prénom, nom à indiquer ? ».
        const caseT = /^Colonne:\s*"([^"]*)"\s*\|\s*Ligne:\s*"([^"]*)"/.exec(label);
        const contact = groupe && /^(?:pr[ée]nom|nom\b|num[ée]ro|t[ée]l[ée]phone|portable|adresse (?:[ée]lectronique|mail|e-?mail)|courriel|e-?mail|fonction)/i.test(label.trim());
        const l = (caseT ? questionCaseTableau(caseT[2], caseT[1])
          : contact ? `Cadre de réponse, « ${groupe!.replace(/\s*:\s*$/, '')} » : ${label.trim().replace(/\s*:\s*$/, '').replace(/(?<![A-ZÀ-Ý])[A-ZÀ-Ý](?![A-ZÀ-Ý])/g, (c) => c.toLowerCase())} à indiquer ?`
            : groupe && label ? `${groupe} — ${label}` : label || `Champ ${r.id}`).trim();
        if (!champDuLibelle.has(l)) champDuLibelle.set(l, r.id);
        return l;
      })
      .filter((s: string, i: number, arr: string[]) => Boolean(s) && arr.indexOf(s) === i);
    if (aCompleter.length) {
      console.warn(`[MemoireGenerator] ⚠ ${aCompleter.length} champ(s) « [À COMPLÉTER] » à faire remplir :\n- ${aCompleter.join('\n- ')}`);
    }

    // 7 ter. Emplacements à compléter : un signet par « [À COMPLÉTER] », avec l'information attendue.
    const champsRediges = poserSignetsChamps(xmlDoc);
    // Grille « Éléments de candidature » laissée en pointillés (effectifs, cadres, chiffre d'affaires, références) : un
    // emplacement et une question exacte à GSS par donnée (vitry 351).
    const questionsGrilleCandidature = completerGrilleCandidature(xmlDoc);
    if (questionsGrilleCandidature.length) console.log(`[MemoireGenerator] Grille de candidature : ${questionsGrilleCandidature.length} donnée(s) de GSS à compléter, une question chacune.`);
    const signets = poserSignets(xmlDoc);
    const occurrenceParChamp = new Map<number, number>();
    const elementsACompleter: ElementACompleter[] = signets.map(({ cle, champ, contexte }) => {
      const d = descriptors.find((x) => x.id === champ);
      const k = occurrenceParChamp.get(champ) ?? 0;
      occurrenceParChamp.set(champ, k + 1);
      let question = '';
      if (d?.grille) {
        const qs = questionsGrille(d);
        question = qs[k] ?? qs.join(' ; ');
      } else if (d) {
        const m = d.context.match(/Question:\s*"([^"]*)"|option:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/);
        question = ((m ? m.slice(1).find(Boolean) : '') || d.context.replace(/\s*\|\s*Contexte proche:.*$/, '')).trim();
      }
      return { cle, question: question || contexte, contexte, statut: 'ouvert' };
    });
    // Question EXACTE de chaque emplacement, lue dans sa propre phrase (et non celle du sous-critère
    // entier) : c'est elle qui est affichée, envoyée à l'équipe et utilisée pour placer sa réponse.
    try {
      const precises = await formulerQuestions(signets.map(({ cle, champ, contexte, environnement }) => {
        const d = descriptors.find((x) => x.id === champ);
        return { cle, contexte, environnement, critere: ((d?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '').slice(0, 400) };
      }));
      for (const el of elementsACompleter) { const q = precises.get(el.cle); if (q) { el.question = q.question; el.groupe = q.groupe; } }
      // Aucune question ne cite un repère technique (« le champ GSS_AC_3 ») : question d'après la phrase de l'emplacement.
      // Dates CNAPS (fin de validité de l'autorisation, dates de l'agrément du dirigeant) : la question unique de
      // questions_gss_une_fois, une seule carte pour toutes ces cases, jamais une question nouvelle à chaque cadre ni la question
      // des agents pour les cases du dirigeant (T3-CONS-6).
      const qCnaps = questionDatesCnaps();
      for (const el of elementsACompleter) {
        const champ = signets.find((x) => x.cle === el.cle)?.champ;
        const ctx = `${el.contexte} ${descriptors.find((x) => x.id === champ)?.context || ''}`;
        if (qCnaps && /\[À COMPLÉTER\]/.test(el.contexte) && /(?:validit[ée]|expiration|obtention|d[ée]livrance)/i.test(el.contexte) && /autorisation|agr[ée]ment|cnaps|dirigeant/i.test(ctx) && !/agents?\b(?! de s)/i.test(el.contexte)) { el.question = qCnaps; el.groupe = 'dates_cnaps'; }
      }
      for (const el of elementsACompleter) if (REPERE_TECHNIQUE.test(el.question)) el.question = `Information à fournir pour compléter : « ${(el.contexte.includes('[À COMPLÉTER]') ? libelleDuRepere(el.contexte.replace(REPERE_TECHNIQUE, '')) : '') || el.contexte.replace(REPERE_TECHNIQUE, '').trim()} »`;
      // Question générique (« Quelle donnée précise doit figurer dans le passage laissé vide… ? », « … la partie manquante du
      // mémoire technique relative au site concerné ? », havre1 21) : elle cite la question du cadre et la phrase exacte.
      for (const el of elementsACompleter) {
        const champ = signets.find((s) => s.cle === el.cle)?.champ;
        const ctxChamp = descriptors.find((x) => x.id === champ)?.context || '';
        // Case de tableau dont la phrase se réduit à « [À COMPLÉTER] » : la question cite la ligne et la colonne en clair.
        const colonne = (ctxChamp.match(/Colonne:\s*"([^"]*)"/) || [])[1];
        const ligne = ((ctxChamp.match(/Ligne:\s*"([^"]*)"/) || [])[1] || '').split('|')[0].replace(/\[CHAMP_\d+\]/g, '').trim();
        const contexteVide = !el.contexte.replace(/\[À COMPLÉTER\]|\[CHAMP_\d+\]|[\s.:;…-]/g, '');        // Périodes neutralisées (« fermeture entreprise ») : celles de GSS, le soumissionnaire, jamais celles de l'acheteur.
        if (/p[ée]riodes? neutralis|fermeture (?:de l.)?entreprise/i.test(`${ctxChamp} ${el.contexte}`)) {
          el.question = 'Périodes neutralisées (fermeture de l\'entreprise) : GSS a-t-elle des périodes de fermeture à déclarer pour ce marché ? Si GSS assure la prestation sans interruption, la réponse est « Aucune ».';
          el.pourAcheteur = false;
          continue;
        }
        if (colonne && ligne && (contexteVide || /emplacement|laiss[ée]e? vide|partie manquante/i.test(el.question))) {
          el.question = `Tableau du cadre, ligne « ${ligne} », colonne « ${colonne.replace(/\s*\/\s*/g, ' — ')} » : quelle valeur faut-il écrire ?`;
          continue;
        }
        if (!contexteVide && !/laiss[ée]e? vide|partie manquante|passage manquant|donn[ée]e pr[ée]cise (?:doit figurer|manque)|emplacement [àa] compl[ée]ter|information manquante/i.test(el.question)) continue;
        const questionDuCadre = (ctxChamp.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
        const libelleCadre = libelleQuestionCadre(questionDuCadre);
        // Emplacement seul sous un sous-titre de la réponse (etampes1 1202, T2-CONS-7 : « Agrément et pièces justificatives »
        // puis « [À COMPLÉTER] ») : la question cite ce sous-titre et les pièces que le cadre demande (CV, cartes…).
        const rang = elementsACompleter.filter((x) => signets.find((y) => y.cle === x.cle)?.champ === champ).findIndex((x) => x.cle === el.cle);
        const sousTitre = contexteVide ? sousTitreDeLEmplacement(String(replacements.find((r: any) => r.id === champ)?.value ?? ''), Math.max(0, rang)) : '';
        if (sousTitre) {
          const pieces = piecesDemandeesParLeCadre(questionDuCadre, sousTitre);
          el.question = `Réponse à « ${libelleCadre || sousTitre} », partie « ${sousTitre} » : ${pieces ? `le cadre demande ${pieces} ; quelles informations ou quelles pièces GSS fournit-elle ici ?` : 'quelle information faut-il écrire ici ?'}`;
          continue;
        }
        el.question = `Quelle information faut-il écrire${libelleCadre ? ` dans la réponse à « ${libelleCadre} »` : ''}${contexteVide ? '' : `, à la place de « [À COMPLÉTER] » dans la phrase « ${el.contexte.replace(REPERE_TECHNIQUE, '').replace(/\s+/g, ' ').trim().slice(0, 220)} »`} ?`;
      }
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Formulation des questions par emplacement indisponible : ${e?.message || e}`);
    }
    // Texte du mémoire type repris tel quel (rédaction indisponible, T7CS-3) : chaque emplacement reçoit la question exacte du
    // publipostage (effectif titulaire, effectif suppléant, nombre par ligne du tableau), jamais l'intitulé du critère.
    for (const el of elementsACompleter) {
      const liste = questionsReprise.get(signets.find((x) => x.cle === el.cle)?.champ ?? -1);
      const q = liste?.length ? questionDeLEmplacement(el.contexte, liste) : '';
      if (q) { el.question = q; el.groupe = undefined; el.pourAcheteur = false; }
    }
    // Contacts : libellé du bloc du cadre dans la question ; cases d'un tableau : une question ; doublons : un groupe.
    try {
      preciserQuestionsCadre(elementsACompleter, signets, (champ) => (descriptors.find((x) => x.id === champ)?.context.match(/Groupe:\s*"([^"]*)"/) || [])[1] || '');
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Précision des questions du cadre indisponible : ${e?.message || e}`);
    }
    // Donnée de GSS (fiches techniques de ses équipements, références, chiffre d'affaires…) : posée à GSS (T4-COH-5).
    for (const el of elementsACompleter) {
      const q = questionDonneeGss(el.question);
      if (q !== el.question) { el.question = q; el.pourAcheteur = false; }
    }
    // Délai d'intervention demandé par le cadre et laissé à compléter : sa question exacte, posée à GSS (T5N-2).
    for (const el of elementsACompleter) {
      const k = [...questionsDelaisCadre.keys()].find((x) => el.contexte.replace(/\s+/g, ' ').includes(x));
      if (!k) continue;
      el.question = questionsDelaisCadre.get(k)!;
      el.pourAcheteur = false;
    }
    // Grille de candidature : la question exacte de chaque donnée, posée à GSS (jamais à l'acheteur), une par emplacement.
    for (const el of elementsACompleter) {
      const champ = signets.find((x) => x.cle === el.cle)?.champ ?? -1;
      const q = champ >= CHAMP_GRILLE_CANDIDATURE ? questionsGrilleCandidature[champ - CHAMP_GRILLE_CANDIDATURE] : undefined;
      if (!q) continue;
      el.question = q;
      el.groupe = `grille candidature ${champ}`;
      el.pourAcheteur = false;
    }
    // Questions réécrites après preciserQuestionsCadre (délais, grille) : groupes refaits, jamais deux questions différentes
    // dans un même groupe (T7N-3 : intervention courante et action d'urgence d'etampes2 réunies en une seule carte).
    regrouperQuestions(elementsACompleter);

    // 7 quater. Schémas GSS validés sous les réponses développées (retour GSS : visuels non réutilisés).
    // Schéma choisi mais non inséré (Chrome indisponible ou bloqué, T6-COH-3) : signalé à GSS, réponse par réponse.
    const alertesSchemasCadre: string[] = [];
    let reponsesAvecSchema: Array<{ cle: string; question: string; svgId?: string }> = [];
    const alerterSchemas = (cles: string[]) => {
      const rang = (x: { svgId?: string }) => (x.svgId === 'comprehension' ? 0 : x.svgId?.startsWith('demande_') ? 1 : 2);
      for (const x of reponsesAvecSchema.filter((y) => cles.includes(y.cle)).sort((a, b) => rang(a) - rang(b))) {
        const q = `Réponse « ${libelleQuestionCadre(x.question)} » : le schéma${x.svgId === 'comprehension' ? ' de process de la compréhension du besoin' : x.svgId?.startsWith('demande_') ? ' demandé par l\'acheteur' : ''} n'a pas pu être inséré (rendu des schémas indisponible) ; relancez la génération, ou demandez-le via l'assistant, avant la remise.`;
        if (!alertesSchemasCadre.includes(q)) alertesSchemasCadre.push(q);
      }
    };
    try {
      const libelleChamp = (id: number) => ((descriptors.find((x) => x.id === id)?.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '');
      const texteChamp = (id: number) => String(replacements.find((r) => r.id === id)?.value ?? '');
      // Schéma de la rubrique reprise : bibliothèque GSS, ou spécification du mémoire type dessinée au thème (toile
      // paysage) et contrôlée sur la réponse (refusée : schéma de remplacement du mémoire type, sinon choix par mots).
      // Schéma d'une rubrique du mémoire type seulement si la réponse la reprend réellement (fidélité au seuil du cadre).
      const schemasMT = new Map(champsRediges.map((id) => [id, (repriseParChamp.get(id)?.fidelite ?? 0) >= SEUIL_FIDELITE_CADRE ? repriseMT?.schemaDe(repriseParChamp.get(id)?.ids || []) : undefined] as const));
      const specs = [...schemasMT.entries()].filter(([id, s]) => s?.spec && !svgComprehension.has(id));
      const dessins = specs.length
        ? await dessinerSpecs(specs.map(([id, s]) => ({ id: `champ_${id}`, gabarit: s!.spec!.gabarit, params: s!.spec!.params, source: texteChamp(id), titre_section: s!.spec!.titre })), 'paysage', themeActif())
        : new Map<string, { ok: boolean; svg?: string; erreurs?: string[] }>();
      // Schéma demandé par l'intitulé du champ (« Schéma opérationnel (comprenant la répartition des effectifs) ») sans
      // schéma du mémoire type : répartition du cas pratique plage par plage, sinon process des sous-titres de la réponse.
      const contexteChamp = (id: number) => descriptors.find((x) => x.id === id)?.context || '';
      const demandes = champsRediges
        .filter((id) => /sch[ée]ma/i.test(contexteChamp(id)) && !svgComprehension.has(id) && !dessins.get(`champ_${id}`)?.ok)
        // Étape de résultat tirée du texte réel de la réponse (jamais une phrase fixe « en continu », T5CP-5).
        .map((id) => ({ id, spec: specProcessBesoin(etapesSchemaDemande(texteChamp(id), dimensionnementCadre, resultatBesoin(texteChamp(id))) || [], 'flux') }));
      // Schéma demandé par l'acheteur qui ne peut pas être construit sans couper un texte : signalé à GSS (D7).
      for (const x of demandes.filter((y) => !y.spec)) confirmationsGss.add(`Réponse « ${libelleQuestionCadre(libelleChamp(x.id))} » : le schéma demandé par l'acheteur n'a pas pu être construit automatiquement ; à demander via l'assistant avant la remise.`);
      const demandesSpec = demandes.filter((x) => x.spec);
      const dessinsDemandes = demandesSpec.length
        ? await dessinerSpecs(demandesSpec.map((x) => ({ id: `demande_${x.id}`, gabarit: x.spec!.gabarit, params: x.spec!.params, source: `${texteChamp(x.id)}\n${texteDuCadre}`, titre_section: libelleChamp(x.id).slice(0, 120) })), 'paysage', themeActif())
        : new Map<string, { ok: boolean; svg?: string; erreurs?: string[] }>();
      for (const x of demandesSpec) {
        const r = dessinsDemandes.get(`demande_${x.id}`);
        console.log(`[MemoireGenerator] Schéma demandé par le champ ${x.id} : ${r?.ok ? 'dessiné' : `refusé (${(r?.erreurs || ['moteur indisponible']).slice(0, 2).join(' | ')})`}.`);
      }
      // Schéma demandé refusé par le moteur (etampes1, T8N-2 : chiffres du dimensionnement absents du texte rédigé pour ce
      // champ) : second essai avec le process des sous-titres de la réponse seule (chaque mot et chaque chiffre du schéma
      // restent dans la page) ; encore refusé, ou impossible à construire : signalé à GSS, jamais perdu en silence.
      const refuses = demandesSpec.filter((x) => !dessinsDemandes.get(`demande_${x.id}`)?.ok && !!dimensionnementCadre?.casPratique.length);
      const secours = refuses.map((x) => ({ id: x.id, spec: specProcessBesoin(etapesSchemaDemande(texteChamp(x.id), null, resultatBesoin(texteChamp(x.id))) || [], 'flux') })).filter((x) => x.spec);
      if (secours.length) {
        const d2 = await dessinerSpecs(secours.map((x) => ({ id: `demande_${x.id}`, gabarit: x.spec!.gabarit, params: x.spec!.params, source: `${texteChamp(x.id)}\n${texteDuCadre}`, titre_section: libelleChamp(x.id).slice(0, 120) })), 'paysage', themeActif());
        for (const x of secours) {
          const r = d2.get(`demande_${x.id}`);
          console.log(`[MemoireGenerator] Schéma demandé par le champ ${x.id} (process des sous-titres de la réponse) : ${r?.ok ? 'dessiné' : `refusé (${(r?.erreurs || ['moteur indisponible']).slice(0, 2).join(' | ')})`}.`);
          if (r?.ok) dessinsDemandes.set(`demande_${x.id}`, r);
        }
      }
      for (const x of demandesSpec.filter((y) => !dessinsDemandes.get(`demande_${y.id}`)?.ok)) {
        // (consultations et premier message de l'assistant, comme un schéma non inséré)
        const q = `Réponse « ${libelleQuestionCadre(libelleChamp(x.id))} » : le schéma demandé par l'acheteur n'a pas pu être construit automatiquement ; à demander via l'assistant avant la remise.`;
        if (!alertesSchemasCadre.includes(q)) alertesSchemasCadre.push(q);
      }
      const developpees = champsRediges
        .map((id) => {
          const s = schemasMT.get(id);
          const d = dessins.get(`champ_${id}`);
          const dd = dessinsDemandes.get(`demande_${id}`);
          const svg = svgComprehension.get(id) || (d?.ok ? d.svg : undefined) || (dd?.ok ? dd.svg : undefined);
          const svgId = svgComprehension.has(id) ? 'comprehension' : d?.ok && s ? `mt_${s.id}` : dd?.ok ? `demande_${id}` : undefined;
          return { cle: `GSS_CH_${id}`, question: libelleChamp(id), texte: texteChamp(id), prefere: s?.ref || (s?.spec && !svg ? s.alternative : undefined), svg, svgId };
        })
        // Champ de valeur (« Effectif … (transmis pour information) ») : jamais de schéma dessous.
        .filter((x) => (x.texte.length >= 600 && !champValeur(x.question)) || x.svgId === 'comprehension' || !!x.svgId?.startsWith('demande_'));
      await schemasSelonDce(developpees, dceContext);
      reponsesAvecSchema = developpees.filter((x) => x.svg || x.prefere);
      const nonInseres: string[] = [];
      const nSchemas = await insererSchemasReponses(zip, xmlDoc, developpees, { seulementReprise: !!repriseMT, vocabulaire: vocabulaireSchemas(dceContext), hauteurMax: hauteurSchemaMax, places: placeSchemas, nonInseres });
      if (nSchemas) console.log(`[MemoireGenerator] ${nSchemas} schéma(s) GSS inséré(s) sous les réponses.`);
      alerterSchemas(nonInseres);
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Schémas GSS non insérés (non bloquant) : ${e?.message || e}`);
      alerterSchemas(reponsesAvecSchema.map((x) => x.cle));
      if (!reponsesAvecSchema.length) alertesSchemasCadre.push(`Schémas GSS du cadre non insérés (rendu des schémas indisponible : ${String(e?.message || e).slice(0, 120)}) ; relancez la génération avant la remise.`);
    }
    for (const q of alertesSchemasCadre) confirmationsGss.add(q);
    // Phrases ajoutées par l'IA au texte de GSS (T5-CONS-6), rapprochées du texte FINAL de leur réponse (après la relecture, la
    // normalisation du nom de l'acheteur et les limites de pages) : seule une phrase imprimée est signalée, telle qu'imprimée
    // (T6-CONS-2, T6-COH-1, T6-COH-5) ; jamais une entrée vide (T6N-4). En tête des consultations, comme avant.
    const ajoutsFinaux: Array<{ libelle: string; phrases: string[] }> = [];
    for (const [id, a] of ajoutsParChamp) {
      const k = replacements.map((x) => x.id).lastIndexOf(id);
      const final = k >= 0 ? String(replacements[k].value ?? '') : '';
      const phrases = phrasesImprimees(a.phrases, final);
      if (phrases.length) ajoutsFinaux.push({ libelle: a.libelle, phrases });
    }
    {
      const lignesAjouts = ajoutsFinaux.map((a) => (a.phrases.length === 1
        ? `Phrase ajoutée au texte de GSS (rédigée par l'IA), à valider : « ${a.libelle} » — « ${phraseLisible(a.phrases[0], 600)} »`
        : `Phrases ajoutées au texte de GSS (rédigées par l'IA), à valider : « ${a.libelle} » — ${a.phrases.map((ph) => `« ${phraseLisible(ph, 300)} »`).join(' ; ')}`));
      const autres = [...confirmationsGss].filter((c) => !alertesComprehension.has(c));
      confirmationsGss.clear();
      [...alertesComprehension, ...lignesAjouts, ...autres].forEach((c) => confirmationsGss.add(c));
    }

    // Contrôle final des parties limitées en pages, sur le document complet (réponses et schémas insérés).
    try {
      if (partiesAjustees.length) {
        const documentXml = new XMLSerializer().serializeToString(xmlDoc);
        const g = geometrieCadre(documentXml, zip.file('word/styles.xml')?.asText() || '');
        const paras = paragraphesCadre(documentXml);
        for (const p of partiesDuDocument(paras)) {
          const h = hauteurPartie(paras, p.debut, p.fin, g);
          const budget = p.pages * g.hauteurPt;
          console.log(`[MemoireGenerator] Partie « ${p.titre} » : ${(h / g.hauteurPt).toFixed(2)} page(s) estimée(s) sur le document final pour ${p.pages} autorisée(s).`);
          if (h > budget) confirmationsGss.add(`Partie « ${p.titre}${p.titre.includes(p.section) ? '' : ` (${p.section})`} » : elle dépasse la limite de ${p.pages === 1 ? '1 page' : `${p.pages} pages`} fixée par l'acheteur. Quels passages faut-il retirer avant la remise ?`);
        }
      }
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Contrôle final des parties limitées en pages indisponible : ${e?.message || e}`);
    }

    // 8. Serialize and save (jamais de document si le crédit OpenAI s'est épuisé en cours de génération)
    this.verifierCredit();
    if (onProgress) onProgress(98, 'Génération du document Word…');
    // Réponses écrites sur plusieurs lignes (<w:br/>) dans des paragraphes justifiés : la ligne qui finit par un retour à
    // la ligne n'est plus étirée sur toute la largeur (ca_normandie 221 : tableau de l'équipe dédiée « A : B : C »).
    sansEtirementRetourLigne(zip);
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Successfully generated ${outputPath}`);
    /** Intitulé d'un champ rédigé (état de complétion, consultations). */
    const champsEtatLibelle = (id: number): string => {
      const d = descriptors.find((x) => x.id === id);
      const m = d?.context.match(/Question:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/);
      const section = (d?.context.match(/Section:\s*"([^"]*)"/) || [])[1] || '';
      const net = (x: string) => x.replace(/\[CHAMP_\d+\]/gi, '').replace(/(?:[_.…]\s*){3,}/g, ' ').replace(/\s+/g, ' ').trim();
      const sec = net(section);
      const libelle = net((m ? m.slice(1).find(Boolean) : '') || section || '') || `Réponse ${id}`;
      return libelleChampEtat(sec, libelle);
    };
    try {
      const champsEtat = champsRediges.map((id) => ({ cle: `GSS_CH_${id}`, libelle: champsEtatLibelle(id) }));
      // Premier message de l'assistant : propositions de réponse et réponses à relire, validables ou modifiables (D5).
      // Aucun repère technique (« GSS_CH_n ») montré à GSS : l'assistant retrouve chaque réponse par son libellé.
      const aRelire = [...propositionsCadre.entries()].filter(([id]) => champsRediges.includes(id)).sort((a, b) => a[0] - b[0]);
      const dimRepris = dimensionnementCadre && [...confirmationsGss].some((c) => c.startsWith('Proposition à valider : dimensionnement') || questionsMisesEnSituation(dimensionnementCadre).includes(c));
      const conversation = aRelire.length || dimRepris ? [{ role: 'assistant' as const, date: new Date().toISOString(), texte: [
        ...(aRelire.length ? [
          `J'ai rempli le cadre de réponse avec le mémoire type de GSS. ${aRelire.length === 1 ? 'Une réponse est à relire' : `${aRelire.length} réponses sont à relire`} avant la remise :`,
          ...aRelire.map(([id, c]) => `- ${libelleQuestionCadre(champsEtat.find((x) => x.cle === `GSS_CH_${id}`)?.libelle || c.split(' : ').slice(1).join(' : '))} (${/^Proposition/.test(c) ? 'proposition de réponse : question que le mémoire type ne traite pas' : c.split(' : ')[0].replace(/^Réponse à relire \(/, '').replace(/\)$/, '')})`),
          '',
          'Pour chacune, vous pouvez :',
          '- la valider telle quelle : « Je valide la réponse sur … » (rien n\'est modifié) ;',
          '- la modifier : « Dans la réponse sur …, précise que … ».',
        ] : []),
        // Effectifs proposés à partir du DCE (D5) : à valider ou modifier avant la remise.
        ...(dimRepris ? [...(aRelire.length ? [''] : []), messageDimensionnement(dimensionnementCadre!, `${dceContext}\n${texteDuCadre}`)] : []),
      ].join('\n') }] : undefined;
      // Phrases de GSS adaptées au CCTP (D8) : seulement dans les réponses que l'assistant peut modifier ; annoncées dans le
      // premier message, à valider, modifier ou rétablir.
      adaptationsCadre = adaptationsCadre.filter((a) => champsEtat.some((c) => c.cle === a.rubrique));
      adaptationsCadre.forEach((a, i) => { a.n = i + 1; });
      // Phrases ajoutées par l'IA au texte de GSS (T6N-5) : annoncées dans le premier message, comme en réponse libre.
      const texteAjoutsCadre = messageAjoutsCadre(ajoutsFinaux);
      const texteAdaptations = [messageAdaptations(adaptationsCadre), texteAjoutsCadre].filter(Boolean).join('\n\n');
      let conversationFinale = texteAdaptations
        ? (conversation?.length ? [{ ...conversation[0], texte: `${conversation[0].texte}\n\n${texteAdaptations}` }] : [{ role: 'assistant' as const, date: new Date().toISOString(), texte: texteAdaptations }])
        : conversation;
      // DCE sans CCTP (T8-COH-2), rubriques du cadre sans réponse (T10-COH-2) : en tête du premier message de l'assistant.
      const alerteCctp = [...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext), ...alertesRubriquesCadre];
      if (alerteCctp.length) conversationFinale = conversationFinale?.length ? [{ ...conversationFinale[0], texte: `${alerteCctp.join('\n\n')}\n\n${conversationFinale[0].texte}` }] : [{ role: 'assistant' as const, date: new Date().toISOString(), texte: alerteCctp.join('\n\n') }];
      // Grille « Éléments de candidature » du cadre (vitry, T5N-1) : les données de GSS à y écrire sont annoncées dans le premier
      // message (une question chacune dans la liste des informations à compléter).
      if (questionsGrilleCandidature.length) {
        const texteGrille = `La grille « Éléments de candidature » du cadre attend ${questionsGrilleCandidature.length} donnée${questionsGrilleCandidature.length > 1 ? 's' : ''} de GSS (effectifs moyens et cadres, chiffres d'affaires, références avec leur contact et leur montant) : répondez aux questions « Éléments de candidature » de la liste des informations à compléter avant la remise.`;
        conversationFinale = conversationFinale?.length ? [{ ...conversationFinale[0], texte: `${conversationFinale[0].texte}\n\n${texteGrille}` }] : [{ role: 'assistant' as const, date: new Date().toISOString(), texte: texteGrille }];
      }
      // Schémas non insérés (T6-COH-3) : en tête du premier message de l'assistant.
      if (alertesSchemasCadre.length) {
        const texteSchemas = `Schémas manquants dans le cadre de réponse (${alertesSchemasCadre.length}) :\n${alertesSchemasCadre.map((x) => `- ${x}`).join('\n')}`;
        conversationFinale = conversationFinale?.length ? [{ ...conversationFinale[0], texte: `${texteSchemas}\n\n${conversationFinale[0].texte}` }] : [{ role: 'assistant' as const, date: new Date().toISOString(), texte: texteSchemas }];
      }
      ecrireEtat({
        dossierId, mode: 'cadre', fichier: outputPath, majLe: '', elements: elementsSansDoublon(elementsACompleter), reponsesTraitees: [],
        champs: champsEtat, demande: this.demandeParticuliere?.demande || undefined, conversation: conversationFinale,
        ...(this.dimensionnementEtat ? { dimensionnement: this.dimensionnementEtat } : {}),
        ...(adaptationsCadre.length ? { adaptations: adaptationsCadre } : {}),
      });
    } catch (e: any) {
      console.warn(`[MemoireGenerator] État de complétion non enregistré (non bloquant) : ${e?.message || e}`);
    }

    return {
      status: 'completed',
      filePath: outputPath,
      generatedData: {
        modele: this.memoireModel,
        total_suggestions: String(prompts.length),
        modifications_reussies: String(applied),
        details: JSON.stringify(replacements.map(r => ({
          recherche: `[CHAMP_${r.id}]`,
          remplacement: r.value
        })))
      },
      // Grille de notation : chaque sous-critère signale ses manques → fusion des questions en doublon.
      // Aucun repère technique (« [CHAMP_14] ») ni doublon dans les questions remises à GSS (havre1 21).
      consultations: [
        // DCE sans CCTP (T8-COH-2), rubriques du cadre sans réponse (T10-COH-2) : en tête des consultations.
        ...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext),
        ...alertesRubriquesCadre,
        // Même donnée inconnue (partenaire de télésurveillance, sa station, sa certification) : une seule question (T1-COH-8).
        // Questions sans redite (T2-CONS-7) : une question qui redit celle d'un emplacement à compléter est retirée.
        ...sansQuestionsRedites(regrouperQuestionsTelesurveillance([...new Set([
          ...(descriptors.some((d) => d.grille)
            ? await this.consoliderConsultations([...aCompleter.flatMap((q) => {
              // Question générique d'un critère : les questions précises de ses emplacements, une fois chacune. Champ hors
              // critère : les questions précises de ses emplacements aussi (celles des cartes de l'assistant, T8CS-4).
              const champ = questionsVaguesGrille.get(q) ?? champDuLibelle.get(q);
              if (champ === undefined) return [q];
              const precises = [...new Set(elementsACompleter.filter((el) => (questionsVaguesGrille.has(q) || el.statut === 'ouvert') && signets.find((x) => x.cle === el.cle)?.champ === champ).map((el) => el.question).filter((x) => x && !questionsVaguesGrille.has(x)).map((x) => questionAvecLibelle(x, champsEtatLibelle(champ))))];
              return precises.length ? precises : [q];
            }), ...confirmationsGss], { dce: dceContext, horsNormandie: marcheHorsNormandie(analysisData, dceContext) })
            // Champ hors grille : la question précise de chacun de ses emplacements (« En complément du téléphone, utilisez-
            // vous un courriel… ? »), jamais le seul libellé du cadre (« Si oui est-ce un courriel… ? », T4C-7).
            : [...aCompleter.flatMap((q) => {
              const champ = champDuLibelle.get(q);
              if (champ === undefined) return [q];
              const precises = [...new Set(elementsACompleter.filter((el) => el.statut === 'ouvert' && signets.find((x) => x.cle === el.cle)?.champ === champ).map((el) => el.question).filter(Boolean).map((x) => questionAvecLibelle(x, champsEtatLibelle(champ))))];
              return precises.length ? precises : [q];
            }), ...[...confirmationsGss].filter((c) => !aCompleter.includes(c))]),
        ].map((c) => (!LIGNE_DETERMINISTE.test(c) && /p[ée]riodes? neutralis|fermeture (?:de l.)?entreprise/i.test(c) ? 'Périodes neutralisées (fermeture de l\'entreprise) : GSS a-t-elle des périodes de fermeture à déclarer pour ce marché ? Si GSS assure la prestation sans interruption, la réponse est « Aucune ».' : c).replace(/\s*\[CHAMP_\d+\]\s*\|?/g, ' ').replace(/«\s*»|\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean).map(questionDonneeGss).map(questionExacte))]).map((question) => ({ question })), { prioritaires: elementsACompleter.filter((e) => e.statut === 'ouvert').map((e) => e.question), texteMemoire: replacements.map((r: any) => String(r.value ?? '')).join('\n') }).map((q) => q.question),
        // Lieu du site introuvable dans le DCE (T7-COH-2) : une seule question, aucun délai normand promis en attendant.
        ...questionLieuInconnu(analysisData, dceContext),
        // Grille de candidature : une question exacte par donnée de GSS (effectif, cadres, chiffre d'affaires, référence).
        ...questionsGrilleCandidature,
        // Une ligne par réponse à relire ou à valider ; jamais un repère interne (« [champ_24] ») : l'intitulé du champ ;
        // deux lignes identiques n'en font qu'une.
        ...new Set([...propositionsCadre.entries()].filter(([id]) => champsRediges.includes(id)).sort((a, b) => a[0] - b[0])
          .map(([id, c]) => c.replace(/\[?champ_\d+\]?/gi, () => libelleQuestionCadre(champsEtatLibelle(id)) || `réponse ${id}`))),
        // Phrases de GSS adaptées au CCTP (D8) : une ligne par phrase à valider.
        ...consultationsAdaptations(adaptationsCadre),
      ],
    };
  }

  /**
   * Cas "sans cadre imposé" (mode B / réponse libre) — approche PRÉSERVATION : on garde le
   * maître AO RNE.docx INTACT (design + 221 images) et on AJOUTE des pages en DUPLIQUANT des
   * pages existantes (`cloneSpread`) pour y injecter le texte personnalisé (généré côté front
   * à partir du DCE + Documentation GSS). Le nom du client du maître (« Parc des Expositions de
   * Rouen ») est remplacé par celui du DCE (`adaptStaticText`). Le round-trip DOM (xmldom)
   * préserve la maquette à l'identique (vérifié : embeds/drawings/textboxes/sections inchangés).
   */
  public async assembleFromSections(
    dossierId: string,
    chapters: AssembleChapter[],
    options: { refonte?: boolean } = {},
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    // Refonte V1 activée par défaut : fond gris uniforme + retrait des images de fond
    // pleine page sur les pages dupliquées (bandeau/titre conservé).
    const refonte = options.refonte !== false;
    // 0. Client (base DCE puis analyse) pour personnaliser la couverture / le sommaire.
    const cover = await this.getCoverInfo(dossierId);
    const clientName = cover.client && !/global security|^gss\b/i.test(cover.client) ? cover.client : '';

    // 1. Charger le maître AO RNE.docx et parser document.xml (médias/thème/styles conservés).
    const templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template de référence introuvable : ${templatePath}`);
    const zip = new PizZip(fs.readFileSync(templatePath));
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) throw new Error('word/document.xml introuvable dans AO RNE.docx');

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const xmlDoc = parser.parseFromString(documentXmlFile.asText(), 'text/xml');

    // Refonte V1 — fond gris uniforme : <w:background> en 1er enfant du document +
    // activation du rendu via <w:displayBackgroundShape/> dans settings.xml. Un fond déjà posé par le
    // maître (AO RNE.docx porte son propre gris D8D8D8 depuis juin 2026) est conservé tel quel.
    if (refonte) {
      const docEl = xmlDoc.documentElement;
      if (docEl && !findLocalNameChild(docEl, 'background')) {
        const bg = xmlDoc.createElementNS(W_NS, 'w:background');
        bg.setAttribute('w:color', BACKGROUND_COLOR);
        docEl.insertBefore(bg, docEl.firstChild);
      }
      const settingsFile = zip.file('word/settings.xml');
      if (settingsFile) {
        let s = settingsFile.asText();
        if (!/displayBackgroundShape/.test(s)) {
          s = s.replace(/(<w:settings[^>]*>)/, '$1<w:displayBackgroundShape/>');
          zip.file('word/settings.xml', s);
        }
      }
    }

    // Couleur de fond réellement appliquée (celle du maître si elle existe), pour le compte rendu.
    const fondApplique = refonte ? (findLocalNameChild(xmlDoc.documentElement, 'background')?.getAttribute('w:color') || BACKGROUND_COLOR) : '';

    // 2. Personnalisation du client (couverture/sommaire) sur le document + en-têtes/pieds.
    if (clientName) {
      this.adaptStaticText(xmlDoc, { clientName });
      Object.keys(zip.files).forEach((name) => {
        if (name.startsWith('word/header') || name.startsWith('word/footer')) {
          const fd = zip.file(name);
          if (!fd) return;
          const hf = parser.parseFromString(fd.asText(), 'text/xml');
          this.adaptStaticText(hf, { clientName });
          zip.file(name, serializer.serializeToString(hf));
        }
      });
    }

    // 3. Découper le corps en sections OOXML puis repérer les "spreads" (page image+titre + corps).
    const body = findLocalNameChild(xmlDoc.documentElement, 'body');
    if (!body) throw new Error('<w:body> introuvable dans AO RNE.docx');
    const { sections } = splitBodyIntoSections(body);

    interface Spread { headingParas: any[]; bodyParas: any[]; headingText: string; }
    const spreads: Spread[] = [];
    for (let i = 0; i < sections.length - 1; i++) {
      if (sectionHasBackgroundImage(sections[i]) && sectionHasTextbox(sections[i]) && sectionIsPlainText(sections[i + 1])) {
        const headingText = sections[i]
          .flatMap((p: any) => getElementsWithLocalName(p, 'txbxContent'))
          .flatMap((tx: any) => getElementsWithLocalName(tx, 't'))
          .map((t: any) => t.textContent || '')
          .join(' ');
        spreads.push({ headingParas: sections[i], bodyParas: sections[i + 1], headingText });
      }
    }
    if (spreads.length === 0) throw new Error('Aucune page-modèle (spread image+titre+corps) repérée dans AO RNE.docx.');

    // 4. Aplatir les sections générées ; pour chacune, dupliquer la page-modèle du bon thème
    //    et y injecter titre + texte. Insertion juste après la page-modèle correspondante.
    const flat: Array<{ title: string; text: string }> = [];
    chapters.forEach((ch) =>
      (ch?.sections || []).forEach((s) => { if (s?.text?.trim()) flat.push({ title: (s.title || '').trim(), text: s.text }); }),
    );
    if (flat.length === 0) throw new Error('Aucune section générée à insérer (sections vides).');

    const scoreMatch = (title: string, heading: string): number => {
      const want = new Set(normTitle(title).split(' ').filter((w) => w.length > 3));
      let s = 0;
      normTitle(heading).split(' ').forEach((w) => { if (w.length > 3 && want.has(w)) s++; });
      return s;
    };

    const counter = { v: maxDrawingId(xmlDoc) };
    const stats = { imagesRemoved: 0 };
    const lastInsertedByBody = new Map<any, any>(); // empile plusieurs ajouts après une même page-modèle
    // Récupérer le fond gris clair (#D9D9D9) pleine page pour l'injecter dans les corps dupliqués
    const bgRun = findFullPageBackgroundRun(body);
    if (bgRun) {
      console.log('[MemoireGenerator] Fond gris clair (#D9D9D9) pleine page trouvé — injection dans les pages dupliquées.');
    }
    // Récupérer le bandeau « GSS » de titre pour le poser sur chaque page générée
    const gssRun = findGssBannerRun(body);
    if (gssRun) {
      console.log('[MemoireGenerator] Bandeau « GSS » de titre trouvé — injection sur chaque titre généré.');
    } else {
      console.warn('[MemoireGenerator] Bandeau « GSS » de titre NON trouvé.');
    }
    let inserted = 0;
    flat.forEach((sec, idx) => {
      // Dernière page : utiliser le dernier spread du template (image pleine page étendue)
      const isLastPage = idx === flat.length - 1;
      let best = isLastPage ? spreads[spreads.length - 1] : spreads[idx % spreads.length];
      if (!isLastPage) {
        let bestScore = 0;
        spreads.forEach((sp) => { const sc = scoreMatch(sec.title, sp.headingText); if (sc > bestScore) { bestScore = sc; best = sp; } });
      }

      const useRefonte = refonte && !isLastPage;
      const newNodes = cloneSpread(xmlDoc, best.headingParas, best.bodyParas, counter, sec.title, sec.text, useRefonte, stats);

      const headingCount = best.headingParas.length;

      // La dernière page utilise le spread de clôture (image pleine page) : on retire son
      // image de fond pour laisser apparaître le fond gris, comme sur les autres pages.
      if (isLastPage) {
        stats.imagesRemoved += stripStandaloneBgImages(newNodes.slice(0, headingCount));
      }

      // Injecter le fond gris clair pleine page dans la section corps de TOUTES les pages
      // générées (y compris la dernière) — le client veut le fond gris partout.
      if (bgRun) {
        const bodyNodes = newNodes.slice(headingCount);
        if (bodyNodes.length > 0) {
          injectFullPageBackground(bodyNodes, bgRun, counter);
        }
      }

      // Poser le bandeau « GSS » sur le titre de chaque page générée (certains en-têtes
      // du template ne le portent pas) — garantit un titre cohérent partout.
      if (gssRun) {
        injectGssBanner(newNodes.slice(0, headingCount), gssRun, counter);
      }

      const anchorBody = best.bodyParas[best.bodyParas.length - 1];
      const ref = (lastInsertedByBody.get(anchorBody) || anchorBody).nextSibling;
      let last: any = null;
      newNodes.forEach((n) => { body.insertBefore(n, ref); last = n; });
      lastInsertedByBody.set(anchorBody, last);
      inserted++;
    });

    // 5. Sérialiser document.xml (médias conservés) et sauvegarder.
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] AO RNE personnalisé : ${inserted} page(s) ajoutée(s), ${spreads.length} page(s)-modèle, refonte=${refonte} (fond gris ${refonte ? fondApplique : 'off'}, ${stats.imagesRemoved} image(s) de fond retirée(s)), client="${clientName || '(non personnalisé)'}" → ${outputPath}`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: refonte
          ? `Refonte V1 : fond gris uniforme #${fondApplique} + bandeau conservé + images de fond retirées des pages dupliquées`
          : 'AO RNE préservé (design intact) + pages dupliquées',
        client: clientName || '(non personnalisé)',
        pages_ajoutees: String(inserted),
        pages_modeles: String(spreads.length),
        images_fond_retirees: String(stats.imagesRemoved),
      },
    };
  }

  /**
   * Construit un DOCX NU (sans cadre, sans le maître AO RNE) : styles Word par défaut,
   * aucun fond de page, aucun en-tête/pied, aucune page de garde. Sert de point de
   * comparaison « génération sans template » face au template refondu.
   */
  public async assembleNoTemplate(
    chapters: AssembleChapter[],
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const esc = (s: string) => escXml(s);
    const plainRun = (t: string, bold = false, sz?: number) =>
      `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${sz ? `<w:sz w:val="${sz}"/>` : ''}</w:rPr>` +
      `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    const plainPara = (inner: string) => `<w:p>${inner}</w:p>`;

    const body: string[] = [];
    let chaptersOut = 0;
    let sectionsOut = 0;
    chapters.forEach((chapter, idx) => {
      if (!chapter || !chapter.sections || chapter.sections.length === 0) return;
      const roman = chapter.key || ['I', 'II', 'III', 'IV', 'V', 'VI'][idx] || String(idx + 1);
      body.push(plainPara(plainRun(`${roman}. ${chapter.title || ''}`.trim(), true, 32)));
      for (const sec of chapter.sections) {
        const title = sec.title?.trim();
        if (title) body.push(plainPara(plainRun(title, true, 26)));
        for (const rawLine of String(sec.text || '').replace(/\r\n/g, '\n').split('\n')) {
          const line = rawLine.replace(/[`#*_>-]/g, '').trim();
          if (line) body.push(plainPara(plainRun(line)));
        }
        sectionsOut++;
      }
      chaptersOut++;
    });

    if (chaptersOut === 0) throw new Error('Aucun chapitre généré à exporter (sections vides).');

    const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<w:document xmlns:w="${W_NS}"><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

    const zip = new PizZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');

    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS (sans template)_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Mémoire NU (sans template) généré : ${chaptersOut} chapitre(s), ${sectionsOut} section(s) → ${outputPath}`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: 'Document nu (sans template, styles Word par défaut)',
        chapitres: String(chaptersOut),
        sections: String(sectionsOut),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION COMPLÈTE DU MÉMOIRE (sans cadre imposé dans le DCE)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Charge la Documentation GSS (Template/Documentation GSS/) — 21 catégories de PDFs
   * (ABSENCE ET RETARD, FORMATION, PROCEDURE, TENUES, etc.). Renvoie un dictionnaire
   * { catégorie: texte } budgétisé par catégorie.
   */
  private async getGssDocumentation(): Promise<Record<string, string>> {
    // Priorité à la bdd (si MEMOIRE_RAG_FROM_DB=true) : le dossier Template n'est plus lu.
    const fromDb = await this.getGssDocsTextFromDb();
    if (fromDb) {
      console.log(`[MemoireGenerator] Documentation GSS chargée depuis la bdd : ${Object.keys(fromDb).length} catégories (dossier Template non lu).`);
      return fromDb;
    }

    const gssDir = path.join(this.templateDir, 'Documentation GSS');
    if (!fs.existsSync(gssDir)) {
      console.warn('[MemoireGenerator] Documentation GSS introuvable:', gssDir);
      return {};
    }

    const PER_CAT_CAP = 15_000; // plafond par catégorie en caractères
    const categories: Record<string, string> = {};

    for (const entry of fs.readdirSync(gssDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Le dossier « Personnes » (référents GSS) est chargé à part via getGssReferents().
      if (entry.name.toLowerCase() === 'personnes') continue;
      const catDir = path.join(gssDir, entry.name);
      let catText = '';

      const files = fs.readdirSync(catDir).filter(f => f.toLowerCase().endsWith('.pdf'));
      for (const file of files) {
        try {
          const text = await extractText(path.join(catDir, file));
          if (text.length > 50) catText += `\n--- ${file} ---\n${text}`;
        } catch (e: any) {
          console.warn(`[MemoireGenerator] GSS doc: impossible de lire ${entry.name}/${file}: ${e.message}`);
        }
      }

      if (catText.trim()) {
        categories[entry.name] = catText.length > PER_CAT_CAP
          ? catText.slice(0, PER_CAT_CAP) + '\n[… tronqué …]'
          : catText;
        console.log(`[MemoireGenerator] GSS doc chargée: ${entry.name} — ${catText.length} chars (${files.length} fichiers)`);
      }
    }

    console.log(`[MemoireGenerator] Documentation GSS: ${Object.keys(categories).length} catégories chargées.`);
    return categories;
  }

  /**
   * Calcule l'effectif TOTAL de GSS = somme des effectifs par catégorie listés dans
   * « EFFECTIFS ET ORGANIGRAMME/EFFECTIFS MOYENS.pdf » (agrégation DÉTERMINISTE de chiffres réels).
   * Piège : « SSIAP 1/2/3 » contiennent un NIVEAU (pas un effectif) → on ignore tout nombre
   * précédé du mot « SSIAP ». Renvoie le total + le détail (pour traçabilité/log), ou null si la
   * source est absente/illisible (le champ restera alors « [À COMPLÉTER] »).
   */
  private async getGssTotalEffectif(): Promise<{ total: number; breakdown: string } | null> {
    // Priorité à la bdd (mode MEMOIRE_RAG_FROM_DB) ; repli sur le PDF du dossier Template.
    let text: string | null = await this.getEffectifTextFromDb();
    if (!text) {
      const p = path.join(this.templateDir, 'Documentation GSS', 'EFFECTIFS ET ORGANIGRAMME', 'EFFECTIFS MOYENS.pdf');
      if (!fs.existsSync(p)) return null;
      try { text = await extractText(p); } catch { return null; }
    }
    const tokens = text.replace(/\s+/g, ' ').trim().split(/\s+/);
    let total = 0;
    const parts: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const n = parseInt(tokens[i], 10);
      if (!Number.isInteger(n) || String(n) !== tokens[i].replace(/[^\d]/g, '') || n <= 0 || n > 100_000) continue;
      const prev = (tokens[i - 1] || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (prev === 'SSIAP') continue;          // « SSIAP 1/2/3 » = niveau, pas un effectif
      total += n; parts.push(n);
    }
    return total > 0 ? { total, breakdown: parts.join('+') } : null;
  }

  /**
   * Concatène TOUTE la Documentation GSS (toutes les catégories/sous-dossiers) en un seul
   * contexte de connaissances budgétisé, pour le remplissage d'un cadre client : chaque champ
   * du formulaire doit pouvoir être renseigné à partir de ce que GSS sait faire. Plafonné par
   * catégorie ET globalement pour rester sous la limite TPM.
   */
  private buildFullGssContext(gssDocs: Record<string, string>, perCatCap = 2500, totalCap = 24_000): string {
    let ctx = '';
    
    // Toujours inclure les recherches web et sollicitations en priorité absolue
    if (gssDocs['RECHERCHES ET SOLLICITATIONS (RAG)']) {
      ctx += `\n\n=== Doc GSS : RECHERCHES ET SOLLICITATIONS (RAG) ===\n${gssDocs['RECHERCHES ET SOLLICITATIONS (RAG)'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }
    if (gssDocs['RECHERCHES WEB BDD']) {
      ctx += `\n\n=== Doc GSS : RECHERCHES WEB BDD ===\n${gssDocs['RECHERCHES WEB BDD'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }
    if (gssDocs['QUESTIONS INTERNES BDD']) {
      ctx += `\n\n=== Doc GSS : QUESTIONS INTERNES BDD ===\n${gssDocs['QUESTIONS INTERNES BDD'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }

    for (const [cat, text] of Object.entries(gssDocs)) {
      if (cat === 'RECHERCHES ET SOLLICITATIONS (RAG)' || cat === 'RECHERCHES WEB BDD' || cat === 'QUESTIONS INTERNES BDD') continue;
      if (ctx.length >= totalCap) break;
      ctx += `\n\n=== Doc GSS : ${cat} ===\n${text.slice(0, perCatCap)}`;
    }
    return ctx.length > totalCap ? ctx.slice(0, totalCap) + '\n[… tronqué …]' : ctx;
  }

  /**
   * Charge la liste des RÉFÉRENTS GSS depuis « Template/Documentation GSS/Personnes » (interlocuteurs
   * uniques, encadrants, contacts, dirigeants). « Personnes » peut être SOIT un fichier texte simple
   * (un référent par ligne, sans extension), SOIT un dossier de fiches (pdf/docx/doc/txt) : les deux
   * cas sont gérés. Renvoie le texte concaténé (budgétisé) ou '' si absent/vide — dans ce dernier cas
   * les champs « référent » resteront « [À COMPLÉTER] » plutôt qu'inventés.
   */
  private async getGssReferents(): Promise<string> {
    const target = path.join(this.templateDir, 'Documentation GSS', 'Personnes');
    if (!fs.existsSync(target)) {
      console.warn('[MemoireGenerator] « Personnes » (référents GSS) introuvable:', target);
      return '';
    }

    const CAP = 12_000;
    /** Lit un fichier : texte brut s'il n'a pas d'extension exploitable, sinon via extractText. */
    const readOne = async (filePath: string): Promise<string> => {
      try {
        if (/\.(pdf|docx?)$/i.test(filePath)) return await extractText(filePath);
        return fs.readFileSync(filePath, 'utf8'); // .txt ou fichier sans extension (liste texte)
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Référents: impossible de lire ${path.basename(filePath)}: ${e.message}`);
        return '';
      }
    };

    let out = '';
    if (fs.statSync(target).isDirectory()) {
      for (const file of fs.readdirSync(target)) {
        const text = (await readOne(path.join(target, file))).trim();
        if (text.length > 30) out += `\n--- ${file} ---\n${text}`;
      }
    } else {
      out = (await readOne(target)).trim();
    }

    out = out.trim();
    if (out.length > CAP) out = out.slice(0, CAP) + '\n[… tronqué …]';
    console.log(`[MemoireGenerator] Référents GSS (Personnes): ${out.length} chars chargés.`);
    return out;
  }

  /**
   * Trouve les catégories de Documentation GSS pertinentes pour un titre de spread donné,
   * par correspondance de mots-clés dans GSS_DOC_KEYWORDS. Si `analysisData` est fourni,
   * les catégories sont pondérées par pertinence au secteur du client (ex : FORMATION
   * prioritaire pour l'éducation, PROCEDURE pour l'industrie).
   */
  private matchGssCategories(spreadTitle: string, availableCategories: string[], analysisData?: any): string[] {
    const n = normTitle(spreadTitle);

    // Score de base : correspondance titre ↔ mots-clés de la catégorie
    const scored: Array<{ cat: string; score: number }> = [];

    for (const [cat, keywords] of Object.entries(GSS_DOC_KEYWORDS)) {
      if (!availableCategories.includes(cat)) continue;
      let score = 0;
      for (const kw of keywords) {
        if (n.includes(kw)) score += 2;
      }
      if (score > 0) scored.push({ cat, score });
    }

    // Fallback : correspondance par mots du titre dans les noms de catégories
    if (scored.length === 0) {
      const words = n.split(' ').filter(w => w.length > 3);
      for (const cat of availableCategories) {
        const catNorm = normTitle(cat);
        if (words.some(w => catNorm.includes(w))) scored.push({ cat, score: 1 });
      }
    }

    // Bonus sectoriel : prioriser les catégories pertinentes au secteur du client
    if (analysisData) {
      const sector = detectClientSector(analysisData).toLowerCase();
      const sectorBoosts: Record<string, string[]> = {
        'education': ['FORMATION', 'FORMATION INTERNE', 'SUIVI QUALITE ET CONTROLES', 'PROCEDURE'],
        'enseignement': ['FORMATION', 'FORMATION INTERNE', 'SUIVI QUALITE ET CONTROLES', 'PROCEDURE'],
        'sante': ['PROCEDURE', 'FORMATION', 'TENUES', 'SUIVI QUALITE ET CONTROLES'],
        'hospitalier': ['PROCEDURE', 'FORMATION', 'TENUES', 'SUIVI QUALITE ET CONTROLES'],
        'industrie': ['PROCEDURE', 'MATERIEL', 'TENUES', 'FORMATION'],
        'logistique': ['PROCEDURE', 'MATERIEL', "MOYENS D'ACCES", 'PLANNIFICATION'],
        'distribution': ["MOYENS D'ACCES", 'PROCEDURE', 'TENUES', 'MATERIEL'],
        'commerce': ["MOYENS D'ACCES", 'PROCEDURE', 'TENUES', 'MATERIEL'],
        'evenementiel': ['PLANNIFICATION', 'PROCEDURE', 'MATERIEL', 'EFFECTIFS ET ORGANIGRAMME'],
        'culture': ['PLANNIFICATION', 'PROCEDURE', 'MATERIEL', 'EFFECTIFS ET ORGANIGRAMME'],
        'transport': ['PROCEDURE', 'MATERIEL', "MOYENS D'ACCES", 'SUIVI QUALITE ET CONTROLES'],
        'collectivite': ['MANAGEMENT', 'SUIVI QUALITE ET CONTROLES', 'ENGAGEMENT ECOLOGIQUE', 'VALEURS'],
        'residentiel': ['PROCEDURE', 'INTERLOCUTEUR UNIQUE', 'PLANNIFICATION', "MOYENS D'ACCES"],
      };
      for (const [sectorKey, boostedCats] of Object.entries(sectorBoosts)) {
        if (sector.includes(sectorKey)) {
          for (const s of scored) {
            if (boostedCats.includes(s.cat)) s.score += 1;
          }
          break;
        }
      }

      // Bonus marché public : prioriser MANAGEMENT et SUIVI QUALITE
      const marketType = detectMarketType(analysisData);
      if (marketType === 'public') {
        for (const s of scored) {
          if (['MANAGEMENT', 'SUIVI QUALITE ET CONTROLES', 'ENGAGEMENT ECOLOGIQUE', 'VALEURS'].includes(s.cat)) {
            s.score += 1;
          }
        }
      }
    }

    // Tri par score décroissant, 4 catégories max
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(s => s.cat);
  }

  /**
   * Génération COMPLÈTE du mémoire technique quand AUCUN cadre de réponse n'est dans le DCE.
   *
   * Approche en 3 temps :
   * A) MODIFIER les 119 pages existantes d'AO RNE.docx : pour chaque spread (page image+titre
   *    + page corps de texte), on génère un texte personnalisé via IA en se basant UNIQUEMENT
   *    sur le DCE + Documentation GSS, et on remplace le corps de texte en conservant le design.
   * B) AJOUTER des pages supplémentaires pour les thématiques du DCE non couvertes, en dupliquant
   *    des pages-modèles existantes (cloneSpread) pour préserver le design complexe.
   * C) Personnaliser le nom du client sur la couverture, en-têtes et pieds de page.
   *
   * Sources de données : DCE (CCTP, RC, annexes) + Documentation GSS (21 catégories de PDFs).
   */
  public async generateFullMemoire(dossierId: string): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    console.log(`[MemoireGenerator] ═══ Génération ciblée du mémoire (AO RNE intact + synthèse personnalisée) ═══`);

    // ── 1. Analyse structurée du DCE ──
    const dceContext = await this.getDceContext(dossierId);
    const analysisData = await this.analyzeDce(dceContext);
    const analysisJson = JSON.stringify(analysisData, null, 2);
    const clientName = analysisData?.clientName || 'le client';
    console.log(`[MemoireGenerator] Analyse DCE terminée: client="${clientName}"`);

    // ── 2. Chargement de la Documentation GSS (Limité pour la synthèse) ──
    const gssDocs = await this.getGssDocumentation();
    let gssContext = '';
    const priorityCats = ['RECHERCHES ET SOLLICITATIONS (RAG)', 'MANAGEMENT', 'INTERLOCUTEUR UNIQUE', 'MISE EN PLACE', 'VALEURS', 'SUIVI QUALITE ET CONTROLES'];
    for (const cat of priorityCats) {
      if (gssDocs[cat]) {
        gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 5000)}`;
      }
    }

    // ── 3. Charger et parser AO RNE.docx ──
    const templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template AO RNE introuvable: ${templatePath}`);
    const zip = new PizZip(fs.readFileSync(templatePath));
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) throw new Error('word/document.xml introuvable dans AO RNE.docx');

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const xmlDoc = parser.parseFromString(documentXmlFile.asText(), 'text/xml');

    // ── 4. Personnaliser le nom du client (couverture + en-têtes/pieds) ──
    this.adaptStaticText(xmlDoc, analysisData);
    Object.keys(zip.files).forEach(name => {
      if (name.startsWith('word/header') || name.startsWith('word/footer')) {
        const fd = zip.file(name);
        if (!fd) return;
        const hfDoc = parser.parseFromString(fd.asText(), 'text/xml');
        this.adaptStaticText(hfDoc, analysisData);
        zip.file(name, serializer.serializeToString(hfDoc));
      }
    });

    // ── 5. Récupérer le corps du document ──
    const body = findLocalNameChild(xmlDoc.documentElement, 'body');
    if (!body) throw new Error('<w:body> introuvable dans AO RNE.docx');

    const zones = findContextZones(body);
    if (zones.length === 0) {
      throw new Error('Aucune zone « Contexte sur mesure » (balise début/fin) trouvée dans AO RNE.docx — impossible d\'insérer la synthèse.');
    }

    // ── 6. Génération IA de la synthèse personnalisée (1 seule génération ciblée) ──
    // Capacité = nombre de lignes vides réservées (entre début/fin) × largeur de ligne ; on vise de
    // quoi remplir l'espace réservé sans déborder (le surplus serait tronqué pour ne rien décaler).
    const totalLines = zones.reduce((s, z) => s + z.blanks.length + z.postBlanks.length, 0);
    const totalCapacity = totalLines * CHARS_PER_LINE_2COL;
    console.log(`[MemoireGenerator] ${zones.length} zone(s) « Contexte sur mesure » (début/fin), ${totalLines} ligne(s) réservée(s), capacité ~${totalCapacity} caractères. Génération IA de la synthèse...`);
    const targetWords = Math.max(400, Math.round(totalCapacity / 6.5)); // ~6.5 car/mot
    const marketType = detectMarketType(analysisData);
    const clientSector = detectClientSector(analysisData);
    const strategicCtx = buildStrategicContext('presentation', analysisData);
    const systemPrompt = `Tu es un expert en sécurité privée chez GSS. Rédige une "Synthèse de l'offre" complète (environ ${targetWords} mots) qui sera ajoutée en introduction du mémoire technique.
- Basé UNIQUEMENT sur l'analyse du DCE et les atouts GSS.
- Personnalise par le CONTEXTE et la STRATÉGIE : type d'établissement, usagers, sites/campus, départements, enjeux/risques RÉELS (issus de l'analyse), et METS EN AVANT pour chacun un AVANTAGE concret de GSS (ce que le client gagne). Le texte ne doit pas être recyclable pour un autre client.
- ANTI-REDONDANCE DU NOM : ne répète PAS le nom du client (acheteur) plusieurs fois sur une même page/paragraphe ; cite-le au plus une fois puis utilise des substituts (« l'établissement », « vos sites », « le site concerné »). La personnalisation vient du contexte et des enjeux, pas de la répétition du nom.
- STRATÉGIE & VALEUR : chaque paragraphe doit faire comprendre ce que GSS APPORTE — sa valeur ajoutée et son engagement (fiabilité, réactivité, continuité de service, expertise, accompagnement). Ton commercial et affirmé : donner envie de choisir GSS.
- Mets en avant l'accompagnement GSS (interlocuteur unique, qualité, réactivité).
- CADRE DU MARCHÉ : Ce marché est un marché ${marketType === 'public' ? 'PUBLIC — utilise le vocabulaire de la commande publique (pouvoir adjudicateur, titulaire, sous-critères), cite les obligations du CCP et mets en avant les garanties de conformité et la transparence' : 'PRIVÉ — adopte un ton commercial direct, mets en avant la flexibilité, les SLA sur mesure et l\'adaptation aux process internes du client'}. Secteur : ${clientSector}.
- STRATÉGIE : chaque paragraphe doit démontrer que GSS a COMPRIS L'ENJEU du client. Structure-le ainsi : (1) l'enjeu/risque concret de CE client (issu de l'analyse), (2) la réponse GSS DIFFÉRENCIANTE qui y répond (un moyen, une méthode ou engagement précis, pas un slogan), (3) le bénéfice tangible pour le client. Propose un VRAI AVANTAGE, pas une promesse interchangeable.
- INTÈGRE les solutions GSS spécifiques fournies dans le contexte stratégique ci-dessous. Ce sont des arguments concrets et vérifiés que tu dois reformuler naturellement dans le texte.
- Rédige plusieurs paragraphes bien développés (un paragraphe par idée, séparés par un saut de ligne).
- IMPORTANT : N'utilise AUCUNE liste à puces (aucun tiret, aucun bullet point, aucun symbole). Rédige UNIQUEMENT sous forme de texte continu en paragraphes complets. Pas de markdown.
- Le ton doit être professionnel, rassurant et très commercial (vendre l'offre).`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${analysisJson}\n\n--- CONTEXTE STRATÉGIQUE GSS (solutions spécifiques à ce client ${marketType}) ---\n${strategicCtx}\n\nATOUTS GSS (Extrait doc) :\n${gssContext}\n\nRédige le texte de la synthèse de notre offre sur mesure pour ce client.`;

    const generatedText = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.5, 'Génération Synthèse', false
    );

    if (!generatedText) throw new Error('Échec de la génération IA de la synthèse.');

    // ── 7. Remplir les zones « Contexte sur mesure » (texte en continuité, sur place) ──
    // On ne reconstruit plus la DA : les pages sont déjà designées (titre, fond, bandeau, colonnes).
    // On écrit le texte dans les lignes vides réservées (entre début et fin), sans déborder, en
    // préservant la section de chaque ligne → les zones prévues en 2 colonnes coulent gauche→droite.
    const fillResult = fillContextMarkers(body, generatedText);
    console.log(`[MemoireGenerator] Synthèse insérée : ${generatedText.length} caractères sur ${fillResult.pagesUsed}/${fillResult.markers} zone(s), ${fillResult.linesFilled} ligne(s) réservée(s) remplie(s)${fillResult.truncated ? ', texte tronqué pour ne pas déborder' : ''}.`);

    // ── 8. Sérialiser et sauvegarder (structure AO RNE 100% intacte + 1 section ajoutée) ──
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] ═══ Mémoire généré : AO RNE intact + page synthèse ajoutée → ${outputPath} ═══`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: 'AO RNE intact + Synthèse personnalisée insérée (DCE + GSS)',
        client: clientName,
        texte_ajoute: String(generatedText.length) + ' caractères',
      },
    };
  }

  /**
   * Construit, en UN appel IA, une stratégie de sûreté propre au client puis le texte de CHAQUE page
   * de synthèse (un angle distinct par page, cf. STRATEGY_BEATS). L'entrée est `analysisData` (compact),
   * PAS le DCE brut → prompt léger (évite la limite TPM). Réutilise les helpers de profilage existants
   * (type marché, secteur, cadre réglementaire, solutions GSS) et active enfin keyRisks /
   * gssStrategicRecommendations. Renvoie { profile, stakes[], axes[], pages[] } avec pages.length == nZones.
   */
  private async buildClientStrategy(
    analysisData: any, nZones: number, gssContext: string, perZoneCapWords: number[],
    retrievalChunks: RetrievalChunk[] = [], zoneLabels: string[] = [],
  ): Promise<{ profile: string; stakes: string[]; axes: string[]; pages: string[] }> {
    const clientName = analysisData?.clientName || 'le client';
    const sites: string[] = (analysisData?.sites || []).map((s: any) => (s?.name || '').trim()).filter(Boolean);
    const marketType = detectMarketType(analysisData);
    const sector = detectClientSector(analysisData);
    const regulatory = buildRegulatoryFramework(marketType, sector, analysisData);
    const strategicCtx = buildStrategicContext('presentation', analysisData);
    // ANGLE de chaque zone : le LIBELLÉ écrit après « Contexte … » (ex. « Une réponse pour vos sites »,
    // « approche cousue-main », « DES MOYENS CALIBRÉS ») PRIME sur l'angle générique. C'est le SUJET
    // imposé de la zone → le texte de la page doit traiter ce sujet.
    const genericBeats = assignBeats(nZones);
    const beats = genericBeats.map((b, i) => {
      const lbl = (zoneLabels[i] || '').trim();
      return lbl.length >= 3 ? lbl : b;
    });

    // RECHERCHE PAR PAGE dans le DCE + Documentation GSS : pour CHAQUE angle de page, on récupère les
    // exigences réelles de l'acheteur (CCTP : missions attendues, sites, contraintes) et les atouts GSS
    // qui y répondent. C'est ce qui rend la page argumentée et ancrée dans CE marché (pas un résumé).
    const fmtChunks = (cs: RetrievalChunk[]) =>
      cs.map((c, i) => `[${c.source} · ${c.label} #${i + 1}]\n${c.text.slice(0, 700).trim()}`).join('\n\n');
    let beatExtracts: string[] = beats.map(() => '');
    if (retrievalChunks.length) {
      const beatQueries = beats.map((b) =>
        `${clientName} ${sector} ${sites.slice(0, 6).join(' ')} ${b} exigences missions sûreté sécurité incendie prestations attendues`);
      try {
        const beatEmbs = await this.embedTexts(beatQueries);
        beatExtracts = beats.map((_, i) => {
          const top = this.retrieve(beatEmbs[i], retrievalChunks, 7);
          const dce = fmtChunks(top.filter((c) => c.source === 'DCE').slice(0, 5));
          const gss = fmtChunks(top.filter((c) => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source)).slice(0, 3));
          return `${dce ? `EXIGENCES DU DCE À TRAITER ICI :\n${dce}\n` : ''}${gss ? `ATOUTS GSS MOBILISABLES :\n${gss}\n` : ''}`;
        });
      } catch (e) {
        console.warn('[MemoireGenerator] Recherche par page (synthèse) échouée → génération sur résumé seul:', (e as Error).message);
      }
    }

    const pagesSpec = beats.map((b, i) =>
      `Page ${i + 1} (~${perZoneCapWords[i] ?? 180} mots) — TITRE/ANGLE IMPOSÉ : « ${b} » → traite EXACTEMENT ce sujet (c'est le titre de la section), sans déborder sur les autres pages.\n${beatExtracts[i] || ''}`).join('\n\n');

    const systemPrompt = `Tu es un expert en sûreté/sécurité privée chez GSS (Global Security Service). Tu prépares la "Synthèse de notre offre sur mesure" d'un mémoire technique, à partir de l'analyse d'un DCE.

DÉMARCHE OBLIGATOIRE :
0) EXPLOITE LE DCE : chaque page est accompagnée d'« EXIGENCES DU DCE À TRAITER ICI » (extraits réels du CCTP/RC : missions attendues, sites, horaires, contraintes, critères de l'acheteur). RÉPONDS À CES EXIGENCES PRÉCISES — reprends-les, cite ce que l'acheteur demande, et montre comment GSS y répond. C'est la base de l'argumentation : une page qui n'exploite pas ces exigences est à refaire. N'invente aucune donnée chiffrée absente des extraits.
1) COMPRENDS le client : déduis son TYPE d'organisation, sa mission, ses USAGERS et parties prenantes (ex. université publique → étudiants, enseignants, personnels, visiteurs, campus multi-sites, calendrier universitaire, vie nocturne ; hôpital → patients, soignants, urgences 24/7 ; site industriel → ouvriers, ICPE, flux logistiques…), et les caractéristiques de ses sites.
2) DÉDUIS les ENJEUX de sûreté SPÉCIFIQUES à ce profil (pas génériques), en partant des exigences du DCE ci-dessus.
3) POSE 3 à 4 AXES STRATÉGIQUES différenciants GSS qui répondent précisément à ces enjeux.
4) RÉDIGE le texte de CHAQUE page selon l'angle imposé ci-dessous, en t'appuyant sur le profil et les axes. Le but central : EXPLIQUER CONCRÈTEMENT CE QUE GSS FAIT POUR CE CLIENT dans SON cas précis — quelles mesures de sûreté GSS déploie dans CE type de lieu (ex. campus → contrôle d'accès des amphis/bibliothèques, rondes nocturnes, gestion des événements étudiants et de la vie nocturne, filtrage des visiteurs ; hôpital → maîtrise des accès urgences/maternité, gestion de l'agressivité, présence 24/7 ; site industriel → filtrage poids lourds, rondes ICPE, levée de doute…). Appuie-toi sur la DOCUMENTATION GSS (procédures, matériel, contrôle d'accès, mise en place) fournie pour citer des mesures RÉELLES, pas inventées.
5) ADAPTE au caractère ${marketType === 'public' ? 'PUBLIC' : 'PRIVÉ'} du marché, concrètement (pas seulement le vocabulaire) : ${marketType === 'public' ? "exigences du CCTP, conformité et transparence (traçabilité, reporting à l'acheteur, respect des grilles conventionnelles, gestion des ERP/campus, continuité de service public et pénalités)." : "réactivité et souplesse (interlocuteur unique, SLA sur mesure, adaptation aux process internes et horaires du client, confidentialité)."}
6) VÉRIFIE, avant de valider chaque page, sa PERTINENCE STRATÉGIQUE ET COMMERCIALE pour CE client : chaque idée doit (a) viser un enjeu RÉEL et propre à ce client/secteur (pas un lieu commun), et (b) donner une raison COMMERCIALE concrète de choisir GSS (avantage différenciant, gain mesurable, réduction de risque/coût, engagement). Si une phrase resterait vraie pour n'importe quel autre marché, RÉÉCRIS-LA ou supprime-la.

RÈGLES DE RÉDACTION (champ "pages") :
- Marché ${marketType === 'public' ? 'PUBLIC : vocabulaire de la commande publique, obligations du CCP, conformité, transparence, pénalités' : 'PRIVÉ : ton commercial, flexibilité, SLA sur mesure, adaptation aux process internes'}. Secteur : ${sector}.
- PERSONNALISE : cite le nom du client (${clientName})${sites.length ? ` et ses sites (${sites.slice(0, 6).join(', ')})` : ''}, ses enjeux réels.
- CONCRÉTUDE : nomme des mesures, dispositifs et moyens PRÉCIS (postes, rondes, contrôle d'accès, vidéosurveillance/levée de doute, filtrage, gestion des flux, procédures d'incident, qualifications d'agents) plutôt que des intentions vagues. Le lecteur doit visualiser ce que GSS fait sur SON site.
- ANCRAGE DCE : reprends explicitement au moins une exigence/mission/contrainte tirée des « EXIGENCES DU DCE À TRAITER ICI » de la page, et réponds-y. Ne te contente pas de généralités sur le secteur.
- Chaque paragraphe = (1) enjeu PRÉCIS du client → (2) réponse GSS différenciante (un moyen, une méthode, un engagement chiffré) → (3) bénéfice concret et ARGUMENT COMMERCIAL (pourquoi GSS plutôt qu'un autre). Jamais de slogan vague ni de texte recyclable pour un autre marché.
- Reste COHÉRENT avec les axes posés. Respecte l'angle de chaque page (pas de redite d'une page à l'autre).
- MISE EN FORME : structure chaque page en 2 ou 3 PARAGRAPHES distincts (une idée par paragraphe), SÉPARÉS par une LIGNE VIDE (deux sauts de ligne « \\n\\n »). Reviens à la ligne entre les idées : il faut un texte AÉRÉ et agréable à lire, pas un seul bloc compact. AUCUN markdown, puce, symbole ni titre. Pas de conclusion générique.
- Vise le nombre de mots indiqué par page (remplir le cadre sans le dépasser largement).

Réponds en JSON valide : { "profile": string, "stakes": string[], "axes": string[], "pages": string[] } où pages a EXACTEMENT ${nZones} éléments (1 par page, dans l'ordre).`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :
${JSON.stringify(analysisData, null, 2).slice(0, 20_000)}

--- CONTEXTE STRATÉGIQUE GSS (cadre ${marketType}) ---
${strategicCtx}

CADRE RÉGLEMENTAIRE : ${regulatory}

DOCUMENTATION GSS — CE QUE GSS FAIT CONCRÈTEMENT (général ; des extraits ciblés sont aussi fournis page par page) :
${(gssContext || '').slice(0, 10_000)}

PLAN DES PAGES — chaque page porte un angle distinct ET ses extraits DCE/GSS à exploiter :
${pagesSpec}

Rends le JSON décrit (profile, stakes, axes, pages[${nZones}]).`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.5, 'Stratégie client + texte par page', true,
    );
    let parsed: any = {};
    try { parsed = JSON.parse(content || '{}'); } catch { parsed = {}; }
    let pages: string[] = Array.isArray(parsed.pages) ? parsed.pages.map((p: any) => String(p || '').trim()) : [];
    // Garantir EXACTEMENT nZones entrées (le remplissage par zone l'exige).
    if (pages.length > nZones) pages = pages.slice(0, nZones);
    while (pages.length < nZones) pages.push('');
    return {
      profile: String(parsed.profile || '').trim(),
      stakes: Array.isArray(parsed.stakes) ? parsed.stakes.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      axes: Array.isArray(parsed.axes) ? parsed.axes.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      pages,
    };
  }

  /**
   * Génère le mémoire en SUPERPOSANT la synthèse IA sur AO RNE.pdf (design figé) : le texte est
   * dessiné dans le cadre délimité par les balises « Contexte sur mesure début/fin » (pages 5–8),
   * en 2 colonnes, sans déborder. Aucun reflux possible → la mise en page reste intacte. Sortie PDF.
   */
  public async generateFullMarpPdf(
    dossierId: string,
    onProgress?: (progress: number, message: string, status?: string) => void
  ): Promise<{ filePath: string, generatedData: Record<string, string>, consultations: string[] }> {
    console.log('[MemoireGenerator] ═══ Génération PDF (Marp Complet) ═══');
    reinitialiserJournalIndicateurs();

    if (onProgress) onProgress(10, 'Analyse du DCE et lecture du contexte...');

    const dceComplet = await this.getDceContext(dossierId);
    const analyseComplete = await this.analyzeDce(dceComplet);
    // Mémoire d'un seul lot d'un DCE à plusieurs lots (T3G-5) : le DCE et l'analyse réduits à ce lot (parties communes gardées)
    // pour toute la rédaction et toutes les lectures du DCE ; la limite de pages du RC reste lue sur le DCE entier.
    const lotReduit = perimetreDuLot(analyseComplete, dceComplet);
    if (lotReduit) console.log(`[MemoireGenerator] Mémoire du lot ${lotReduit.lot} : DCE réduit à ce lot (${dceComplet.length} → ${lotReduit.dce.length} car.).`);
    const dceContext = lotReduit?.dce ?? dceComplet;
    const analysisData = lotReduit?.analyse ?? analyseComplete;
    // Mémoire limité en pages avec plan imposé par le RC : format court conforme (demande Clarence).
    const formatImpose = await this.detecterFormatImpose(dceComplet);
    if (formatImpose) return this.genererFormatCourt(dossierId, dceContext, analysisData, formatImpose, onProgress);
    // Réponse libre v2 (refonte 2026-10) : le mémoire type de GSS en 5 blocs, personnalisé par publipostage et adapté au
    // CCTP. Retour arrière : GSS_MEMOIRE_TYPE=non → rédaction rubrique par rubrique du plan v1 ci-dessous, inchangée.
    const memoireType = this.memoireTypeV2();
    if (memoireType) {
      // Ordre imposé par le RC sans limite de pages (consigne 5 : seule la construction change).
      const planImpose = await this.detecterPlanImpose(dceContext);
      return this.genererReponseLibreV2(dossierId, dceContext, analysisData, memoireType, onProgress, planImpose);
    }
    const analysisJson = JSON.stringify(analysisData, null, 2);
    const clientName = analysisData?.clientName || 'le client';

    const gssDocs = await this.getGssDocumentation();
    // Effectifs : le registre (mémoires datés) fait foi ; l'ancien document « EFFECTIFS » (152 / 93…) est écarté.
    if (valeurRegistre('effectif_total')) for (const k of Object.keys(gssDocs)) if (/^EFFECTIFS/i.test(k)) delete gssDocs[k];
    const availableCategories = Object.keys(gssDocs);

    // Matrice de conformité INTERNE : exigences du CCTP/RC ↔ ce que GSS a / fait. On la calcule une
    // seule fois, puis on injecte dans chaque section les exigences de SON chapitre pour que la
    // rédaction réponde point par point aux besoins du DCE (sans rien inventer).
    if (onProgress) onProgress(13, 'Analyse des exigences du CCTP et comparaison aux capacités GSS…');
    const gssFullContext = this.buildFullGssContext(gssDocs, 3000, 60_000);
    const requirementsMatrix = await this.analyzeRequirements(dceContext, gssFullContext);
    const reqsByTheme: Record<string, typeof requirementsMatrix> = {};
    for (const r of requirementsMatrix) {
      const t = (r.theme || '').toString().toUpperCase().replace(/[^IV]/g, '').trim();
      (reqsByTheme[t] ||= []).push(r);
    }

    const sectionsMap: Record<string, string> = {};
    const totalSections = AI_SECTIONS_B.length;
    let completed = 0;

    // Base de mémoires GSS : pour chaque rubrique, les réponses que GSS a déjà rédigées sur le même sujet
    // (recherche sémantique sur l'intitulé de la rubrique et le contexte du marché), + le registre des
    // informations variables. Une seule requête d'embeddings pour les 20 rubriques.
    const marcheCtx = [analysisData?.clientName, analysisData?.objet, analysisData?.secteur].filter(Boolean).join(' — ');
    let rubriqueEmbs: number[][] = [];
    try {
      rubriqueEmbs = await this.embedTexts(AI_SECTIONS_B.map((s) => `${s.title}. ${marcheCtx}`.slice(0, 1000)));
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Recherche dans les mémoires GSS indisponible (${e?.message || e}).`);
    }
    const horsNormandieLibre = marcheHorsNormandie(analysisData, dceContext);
    const registreGss = blocRegistre(horsNormandieLibre) + organigrammeGss(await this.getGssReferents()) + referencesGss() + this.blocPerimetre(await this.perimetreMarche(dceContext));
    const repartition = await this.repartirDemande(AI_SECTIONS_B);
    const commentairesRetires = new Set<string>();
    const secoursMemoires: Record<string, string> = {};
    // Document complémentaire de la demande particulière : ses passages les plus proches de chaque rubrique.
    const chunksComplement = this.chunksDocumentComplementaire();
    if (chunksComplement.length) {
      try { await this.embedChunks(chunksComplement); } catch (e: any) { console.warn(`[MemoireGenerator] Document complémentaire non indexé : ${e?.message || e}`); }
    }

    for (let i = 0; i < totalSections; i++) {
      const section = AI_SECTIONS_B[i];
      if (onProgress) {
        onProgress(15 + Math.round((completed / totalSections) * 70), `Génération section ${i + 1}/${totalSections}: ${section.title}...`);
      }

      const matchedCats = this.matchGssCategories(section.title, availableCategories);
      if (availableCategories.includes('RECHERCHES ET SOLLICITATIONS (RAG)') && !matchedCats.includes('RECHERCHES ET SOLLICITATIONS (RAG)')) {
        matchedCats.unshift('RECHERCHES ET SOLLICITATIONS (RAG)');
      }
      if (availableCategories.includes('RECHERCHES WEB BDD') && !matchedCats.includes('RECHERCHES WEB BDD')) {
        matchedCats.unshift('RECHERCHES WEB BDD');
      }
      if (availableCategories.includes('QUESTIONS INTERNES BDD') && !matchedCats.includes('QUESTIONS INTERNES BDD')) {
        matchedCats.unshift('QUESTIONS INTERNES BDD');
      }
      let gssContext = '';
      for (const cat of matchedCats) {
        gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 4000)}`;
      }
      if (!gssContext) {
        // Fallback si pas de correspondance
        for (const cat of ['MANAGEMENT', 'INTERLOCUTEUR UNIQUE', 'MISE EN PLACE', 'VALEURS', 'SUIVI QUALITE ET CONTROLES']) {
          if (gssDocs[cat]) gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 3000)}`;
        }
      }

      const systemPrompt = `Tu es un expert en sécurité privée chez GSS qui rédige un mémoire technique GAGNANT pour répondre à l'appel d'offres du client ${clientName}. Tu rédiges la partie intitulée "${section.title}".

OBJECTIF : un contenu SUR-MESURE, directement branché sur les exigences réelles du marché — surtout pas un texte générique interchangeable.

RÈGLES DE PERTINENCE (le plus important) :
- Reprends explicitement les exigences, contraintes et enjeux identifiés dans l'analyse du DCE (sites, horaires, risques, prestations attendues, contraintes réglementaires) et montre CONCRÈTEMENT comment GSS y répond.
- Chaque affirmation doit être adossée à une preuve tirée des atouts GSS fournis : un moyen, un chiffre, une méthode, une certification ou un engagement concret. Bannis les formules creuses ("leader du secteur", "qualité irréprochable") sans preuve.
- Personnalise FORTEMENT pour ${clientName} et son secteur d'activité : ancre le propos dans le contexte réel du marché, pas dans des généralités.${analysisData?.clientName ? '' : "\n- Le nom de l'acheteur n'est pas connu : désigne-le par « le client », « la collectivité » ou « l'établissement » selon le contexte, sans jamais inventer de nom ni écrire de mention du type « non communiqué »."}
- N'invente JAMAIS une information absente à la fois du DCE et des atouts GSS ; reste factuel.

PERTINENCE À L'INTITULÉ (impératif) : chaque sous-partie traite directement « ${section.title} ». N'introduis aucun contenu d'un autre thème, même s'il figure dans les extraits.
Les autres rubriques du mémoire traitent déjà : ${AI_SECTIONS_B.filter((x) => x.id !== section.id).map((x) => x.title).join(' ; ')}. Ne traite pas ici ce qui relève de l'une d'elles et ne répète pas leur contenu (rétroplanning de démarrage, liste des fonctions de la main courante, démarche RSE, effectifs, astreinte…) : chaque sujet est développé une seule fois, dans sa rubrique.
EXIGENCES DU DCE : quand l'acheteur fixe un chiffre (délai, fréquence, échéance, nombre de postes, qualification, document à remettre, matériel exigé), reprends-le à l'identique et engage GSS dessus explicitement (sans recopier les montants de pénalités du CCAP : GSS s'engage sur l'obligation elle-même, une seule fois, dans la rubrique concernée) ; décris le site réel d'après le DCE (bâtiments, accès, spécificités) quand la rubrique s'y rapporte ; le fondement juridique (reprise du personnel, convention collective…) est celui qu'indique le DCE.
- Organigramme : chaque fois que tu cites l'équipe d'encadrement, reprends l'ORGANIGRAMME GSS DE RÉFÉRENCE à l'identique (toutes les personnes d'un rôle cité).
- Lots : ne cite que les sites et prestations du lot de la réponse, jamais ceux d'un autre lot.
- Références clients : cite chacune au plus dans deux rubriques, là où elle est la plus pertinente.
- Matériel : ne propose que du matériel utile pour ce site et ces missions.
- ETP : calcule-les à partir des heures réelles (un poste 24 h/24 toute l'année = 8 760 h ≈ 5,5 ETP sur une base de 1 607 h par ETP).
- Numéros d'autorisation, d'agrément ou SIRET : recopie-les exactement tels qu'au registre.
- Ne mentionne jamais tes propres consignes de rédaction (implantation, zone d'intervention, délais non annoncés…) ni ce que « GSS indique » : écris directement l'engagement ou l'organisation.

${REGLES_REUTILISATION}
- Tableaux : un tableau Markdown est autorisé quand il reprend un tableau de GSS (effectifs, qualifications, fréquences…).${repartition ? this.blocDemande({ forme: repartition.forme, points: repartition.parRubrique[section.id] || [] }) : this.blocDemande()}

RÈGLES DE FORME (rendu Marp) :
- NE répète PAS le titre principal "${section.title}" (il est ajouté automatiquement).
- Structure le texte avec des sous-titres en Markdown : "## Sous-titre" (et "### " pour un niveau plus fin). Ces titres seront affichés en rouge et en grande police, utilise-les pour rythmer la lecture.
- Sépare TOUJOURS un sous-titre du paragraphe qui suit par une ligne vide.
- Alterne paragraphes courts et listes à puces ("- …") pour aérer.
- Mets en gras (**…**) les mots-clés, chiffres et engagements forts.
- Ne rédige QUE le contenu de cette section : SANS introduction globale, SANS conclusion générale, SANS salutations.
- Développe la section EN PROFONDEUR : vise 600 à 800 mots, répartis en 3 à 5 sous-parties (chacune introduite par un "## Sous-titre"), pour couvrir le sujet de façon complète et convaincante.
- Traite EXPLICITEMENT chaque exigence du CCTP listée ci-dessous en montrant la réponse concrète de GSS. Si — et SEULEMENT si — GSS n'a aucune réponse spécifique à une exigence (aucun élément dans les atouts GSS), n'invente RIEN : insère à cet endroit, sur sa propre ligne, exactement \`[CONSULTATION REQUISE : <information précise à obtenir auprès de GSS>]\` en décrivant l'information manquante.`;

      // Chaque exigence est attribuée à UNE rubrique (sinon aucune des 5 rubriques du chapitre ne s'en
      // estimait responsable) ; repli sur le chapitre pour une exigence sans rubrique reconnue.
      const idsRubriques = new Set(AI_SECTIONS_B.map((x) => x.id));
      const chapterReqs = requirementsMatrix.filter((r: any) => (idsRubriques.has(r.rubrique)
        ? r.rubrique === section.id
        : (r.theme || '').toString().toUpperCase().replace(/[^IV]/g, '').trim() === section.chapter));
      const reqBlock = chapterReqs.length
        ? `\n\nEXIGENCES DU CCTP À TRAITER OBLIGATOIREMENT DANS CETTE SECTION (chacune doit figurer explicitement dans ton texte, avec son chiffre exact — délai, fréquence, échéance, document, matériel — et l'engagement de GSS ; si le DCE fixe un minimum, l'engagement de GSS le respecte ; signale un écart via [CONSULTATION REQUISE : …]) :\n` +
        chapterReqs
          .map((r) => `- Le cahier des charges demande : ${r.exigence}\n  Réponse GSS connue : ${r.reponseGss || '(non documentée)'}${r.couverture && r.couverture.toLowerCase() !== 'couvert' ? `  → couverture : ${r.couverture}` : ''}`)
          .join('\n')
        : '';

      const passagesMemoires = rubriqueEmbs[i] ? rechercherMemoires(rubriqueEmbs[i], 8, section.title, 3) : [];
      const memoiresBlock = blocMemoires(passagesMemoires);
      const passagesComplement = rubriqueEmbs[i]
        ? chunksComplement.filter((c) => c.embedding).map((c) => ({ c, s: cosine(rubriqueEmbs[i], c.embedding!) })).filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.c)
        : [];
      const complementBlock = passagesComplement.length
        ? `\n\nDOCUMENT COMPLÉMENTAIRE FOURNI PAR L'UTILISATEUR (passages en lien avec cette partie) :\n${passagesComplement.map((c) => c.text).join('\n---\n')}`
        : '';
      // Ce que les rubriques précédentes ont déjà développé (sous-titres et phrases porteuses de faits) :
      // la rubrique ne le redit pas (retour : références, délais, dispositifs répétés d'une rubrique à l'autre).
      const dejaRedige = AI_SECTIONS_B.slice(0, i).filter((x) => sectionsMap[x.id]).map((x) => `• ${x.title} : ${this.faitsDeRubrique(sectionsMap[x.id])}`).join('\n');
      const dejaBlock = dejaRedige ? `\n\nDÉJÀ DÉVELOPPÉ DANS LES RUBRIQUES PRÉCÉDENTES (ne le redéveloppe pas ; si c'est utile, renvoie-y en une demi-phrase) :\n${dejaRedige}` : '';
      const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${analysisJson}\n\nATOUTS GSS (Extrait doc) :\n${gssContext}${memoiresBlock}${registreGss}${complementBlock}${reqBlock}${dejaBlock}\n\nRédige le contenu de cette partie de manière experte.`;

      // Une rubrique ne doit JAMAIS sortir vide (« page quasi vide » signalée par GSS) : nouvel essai si
      // l'appel échoue ou si le texte est manifestement tronqué.
      const assezLong = (t: string | null) => !!t && t.split(/\s+/).length >= 150;
      let text: string | null = null;
      for (let essai = 1; essai <= 3 && !assezLong(text); essai++) {
        const t = await this.callOpenAI(
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          0.5, `Génération ${section.id}${essai > 1 ? ` (essai ${essai})` : ''}`, false
        );
        if (t && (!text || t.length > text.length)) text = t;
      }
      if (!assezLong(text) && passagesMemoires.length) {
        // Dernier recours : la rubrique reprend les réponses GSS existantes plutôt que de rester vide.
        const repris = passagesMemoires.filter((p) => p.score >= 0.3).slice(0, 3)
          .map((p) => `## ${p.rubrique.split(' — ').pop() || section.title}\n\n${p.texte}`).join('\n\n');
        if (repris) {
          text = repris;
          secoursMemoires[section.id] = section.title;
          console.warn(`[MemoireGenerator] Rubrique « ${section.title} » : rédaction IA indisponible → contenu repris des mémoires GSS.`);
        }
      }
      // Contrôle de couverture : chaque exigence attribuée à la rubrique doit y figurer. Celles qui manquent
      // sont ajoutées en fin de rubrique, sous forme d'engagements précis (chiffres du CCTP).
      if (text && chapterReqs.length) text = await this.completerCouverture(text, chapterReqs, section.id);

      // Commentaires internes (diagnostic des manques) : retirés du texte remis à l'acheteur, remontés en
      // points à confirmer.
      if (text) {
        const nettoye = retirerCommentairesInternes(text);
        text = nettoye.texte;
        nettoye.retires.forEach((x) => commentairesRetires.add(`À confirmer : ${x}`));
        const delais = delaisHorsNormandie(text, dceContext, horsNormandieLibre);
        text = delais.texte;
        delais.retires.forEach((x) => commentairesRetires.add(`${libelleDelaiRetire(analysisData, dceContext)}${x}`));
      }
      sectionsMap[section.id] = text || '';
      if (!text) console.error(`[MemoireGenerator] Rubrique « ${section.title} » non rédigée (IA indisponible, aucune réponse GSS à reprendre).`);
      completed++;
    }

    if (onProgress) onProgress(86, 'Contrôle des répétitions entre rubriques…');
    await this.dedoublonnerRubriques(sectionsMap, AI_SECTIONS_B);
    // Obligations chiffrées relevées mot à mot dans le CCTP en tête : contrôlées même si la matrice les a manquées.
    await this.corrigerContradictions(sectionsMap, AI_SECTIONS_B, [...obligationsChiffrees(dceContext).map((o) => ({ exigence: o.phrase })), ...requirementsMatrix, ...horairesImposes(dceContext).map((h) => ({ exigence: `Horaire imposé : ${h}` }))]);
    await this.verifierHoraires(sectionsMap, AI_SECTIONS_B, dceContext);
    await this.engagementsChiffresManquants(sectionsMap, AI_SECTIONS_B, dceContext);
    const remarques = await this.remarquesCahierDesCharges(dceContext);
    if (remarques && sectionsMap.b_organisation) sectionsMap.b_organisation = `${sectionsMap.b_organisation.trim()}\n\n${remarques}`;
    limiterRappelsSite(sectionsMap, AI_SECTIONS_B.map((x) => x.id));
    const refsRetirees = limiterReferences(sectionsMap, AI_SECTIONS_B.map((x) => x.id));
    if (refsRetirees) console.log(`[MemoireGenerator] Références clients : citées dans deux rubriques au plus (${refsRetirees} rubrique(s) allégée(s)).`);

    // ── Consultations requises : exigences que GSS ne couvre pas et qui doivent être précisées ──
    // Deux sources : (1) les écarts détectés par la matrice de conformité ; (2) les marqueurs
    // [CONSULTATION REQUISE : …] que le rédacteur a insérés faute de réponse spécifique dans la Doc GSS.
    const consultations = new Set<string>([
      ...this.alertesFormat, ...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext), ...alerteCadreAbsent(dceContext), ...questionLieuInconnu(analysisData, dceContext),
      ...commentairesRetires,
      // Valeurs du registre encore « à confirmer » reprises dans le texte : GSS est prévenu.
      ...confirmationsRegistreUtilisees(Object.values(sectionsMap).join('\n'), horsNormandieLibre),
    ]);
    for (const r of requirementsMatrix) {
      if ((r.couverture || '').toLowerCase().includes('écart') && r.exigence && !PIECES_OFFRE.test(r.exigence)) {
        consultations.add(r.exigence.trim());
      }
    }
    const markerRe = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;
    // Chaque marqueur devient un repère ⟦AC:n⟧ dans le texte conservé : il garde l'EMPLACEMENT du manque,
    // où la réponse de l'équipe (e-mail ou saisie) sera insérée ensuite.
    const demandes: Array<{ texte: string; repere?: number }> = [...consultations].filter(Boolean).map((texte) => ({ texte }));
    const sectionsReperes: Record<string, string> = {};
    let nRepere = 0;
    for (const [id, txt] of Object.entries(sectionsMap)) {
      sectionsReperes[id] = txt.replace(markerRe, (_m: string, q: string) => {
        nRepere++;
        demandes.push({ texte: String(q).trim(), repere: nRepere });
        return REPERE(nRepere);
      });
    }
    const questionsGss = await this.consoliderAvecSources(demandes.map((d) => d.texte), { dce: dceContext, horsNormandie: horsNormandieLibre });
    const elementsLibres: ElementACompleter[] = questionsGss.map((q, i) => {
      const reperes = [...new Set(q.sources.map((k) => demandes[k]?.repere).filter((x): x is number => typeof x === 'number'))];
      const idSection = reperes.length ? Object.keys(sectionsReperes).find((k) => sectionsReperes[k].includes(REPERE(reperes[0]))) : undefined;
      let contexte = '';
      if (idSection) {
        const t = sectionsReperes[idSection];
        const p = t.indexOf(REPERE(reperes[0]));
        const titre = AI_SECTIONS_B.find((x) => x.id === idSection)?.title || '';
        contexte = `${titre} — …${t.slice(Math.max(0, p - 220), p).replace(REPERE_RE, '').replace(/^[^\s⟦]*⟧/, '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim()}`;
      }
      return { cle: `Q${i + 1}`, question: q.question, contexte, statut: 'ouvert', reperes, pourAcheteur: /^À demander à l.acheteur/i.test(q.question) };
    });
    await this.completerParLesMemoires(elementsLibres, sectionsReperes, marcheHorsNormandie(analysisData, dceContext));
    // Nettoyage final : les phrases insérées depuis les mémoires GSS passent aussi par le filtre des
    // commentaires internes et des formulations « GSS indique… ».
    for (const id of Object.keys(sectionsReperes)) sectionsReperes[id] = nettoyerStructure(interditsDce(delaisHorsNormandie(fondementReprise(retirerCommentairesInternes(sectionsReperes[id]).texte, dceContext), dceContext, horsNormandieLibre).texte, dceContext));
    const consultationList = elementsLibres.filter((e) => e.statut === 'ouvert').map((e) => e.question);
    for (const titre of Object.values(secoursMemoires)) {
      consultationList.push(`Rubrique « ${titre} » : contenu repris tel quel des mémoires GSS (rédaction automatique indisponible), à relire et adapter au client.`);
    }

    // Les marqueurs sont des flags INTERNES (pour GSS) : on les retire du texte pour qu'ils
    // n'apparaissent pas dans le PDF remis au client.
    for (const id of Object.keys(sectionsMap)) {
      sectionsMap[id] = sectionsReperes[id].replace(REPERE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    if (consultationList.length) {
      console.warn(`[MemoireGenerator] ⚠ ${consultationList.length} consultation(s) GSS requise(s) :\n- ${consultationList.join('\n- ')}`);
      if (onProgress) {
        onProgress(
          89,
          `⚠ ${consultationList.length} information(s) à obtenir auprès de GSS : ${consultationList.slice(0, 3).join(' ; ')}${consultationList.length > 3 ? '…' : ''}`,
        );
      }
    }

    if (onProgress) onProgress(90, 'Assemblage final de la présentation Marp...');
    const rendu = await this.exportFromSectionsMap(sectionsMap, dossierId, onProgress, analysisData);
    const { schemas: schemasRendus, cover: coverRendu, ...result } = rendu;
    try {
      ecrireEtat({
        dossierId, mode: 'libre', fichier: result.filePath, majLe: '', elements: elementsSansDoublon(elementsLibres), reponsesTraitees: [],
        libre: { sections: sectionsReperes, schemas: Object.fromEntries(schemasRendus || []), cover: coverRendu, theme: themeActif() },
        demande: this.demandeParticuliere?.demande || undefined,
      });
    } catch (e: any) {
      console.warn(`[MemoireGenerator] État de complétion non enregistré (non bloquant) : ${e?.message || e}`);
    }

    // On remonte les consultations dans generatedData (→ « data_generee_par_ia » côté API/front) pour
    // que l'utilisateur voie précisément quelles informations restent à obtenir auprès de GSS.
    const generatedData: Record<string, string> = { ...result.generatedData };
    consultationList.forEach((c, i) => {
      generatedData[`⚠ Consultation requise #${i + 1}`] = c;
    });

    return { ...result, generatedData, consultations: consultationList };
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // RÉPONSE LIBRE v2 — MÉMOIRE TYPE EN 5 BLOCS (refonte 2026-10)
  // ════════════════════════════════════════════════════════════════════════════════════════

  /** Mémoire type de référence (memoire_type/memoire_type.json), ou null : retour arrière demandé
   *  (GSS_MEMOIRE_TYPE=non) ou fichier absent ou invalide → réponse libre v1, inchangée. */
  private memoireTypeV2(): MemoireType | null {
    if (!memoireTypeActif()) {
      console.log('[MemoireGenerator] GSS_MEMOIRE_TYPE=non : réponse libre v1 (rédaction rubrique par rubrique).');
      return null;
    }
    try {
      return chargerMemoireType();
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Mémoire type indisponible (${e?.message || e}) : réponse libre v1.`);
      return null;
    }
  }

  /**
   * RÉPONSE LIBRE v2 — le mémoire type de GSS, en 5 blocs, repris et personnalisé pour l'appel d'offres (consignes 2 à 8
   * du dirigeant de GSS) :
   *  1. plan et variables du marché d'après le DCE (rubriques retenues selon leurs conditions, publipostage sans modèle) ;
   *  2. matrice des exigences rattachées aux rubriques du mémoire type, questions nouvelles, valeurs imposées par le CCTP ;
   *  3. rubriques « fixe » reprises telles quelles ; rubriques « adapte » modifiées seulement par extraits exacts, avec
   *     contrôle de fidélité au texte de GSS ; bloc « Notre compréhension de votre besoin » rédigé depuis le CCTP, avec
   *     son schéma de process ; proposition de réponse de l'IA à chaque question nouvelle, à valider par GSS ;
   *  4. toute la technologie d'adaptation de la réponse libre : couverture des exigences, répétitions, contradictions
   *     chiffrées, horaires, obligations chiffrées, remarques sur le CCTP, filtres (commentaires internes, délais hors
   *     Normandie, interdits du DCE), consultations et repères ⟦AC:n⟧, réponses déjà données dans les mémoires ;
   *  5. rendu « 1 à 2 pages de texte, puis 1 page de schéma » par rubrique, et état v2 (assistant, complétion).
   */
  private async genererReponseLibreV2(
    dossierId: string,
    dceContext: string,
    analysisData: any,
    mt: MemoireType,
    onProgress?: (progress: number, message: string, status?: string) => void,
    planImpose: PartieRC[] | null = null,
  ): Promise<{ filePath: string, generatedData: Record<string, string>, consultations: string[] }> {
    console.log('[MemoireGenerator] ═══ Réponse libre v2 : mémoire type en 5 blocs ═══');
    // Vocabulaire du CCTP (« chef de poste ») aussi dans les titres et les textes des schémas dessinés (génération ign 12).
    mt = vocabulaireMemoireType(mt, dceContext);
    const progres = (p: number, m: string) => onProgress?.(p, m);

    // ── 1. Plan et variables du marché (sans modèle) ──
    progres(12, 'Mémoire type : rubriques retenues et personnalisation…');
    const referents = await this.getGssReferents();
    const cover = await this.getCoverInfo(dossierId, analysisData);
    const horsNormandie = marcheHorsNormandie(analysisData, dceContext);
    const ctxBase: ContexteMarche = { analyse: analysisData, dce: dceContext, cover, referents, horsNormandie };
    // Effectifs proposés à partir des postes et des horaires du DCE (proposition à valider par GSS, D5).
    ctxBase.dimensionnement = await this.dimensionner(dceContext, '', dossierId);
    let prep: MemoirePrepare = preparerMemoireType(ctxBase, { memoireType: mt });

    const gssDocs = await this.getGssDocumentation();
    // Effectifs : le registre (mémoires datés) fait foi ; l'ancien document « EFFECTIFS » (152 / 93…) est écarté.
    if (valeurRegistre('effectif_total')) for (const k of Object.keys(gssDocs)) if (/^EFFECTIFS/i.test(k)) delete gssDocs[k];
    const perimetre = await this.perimetreMarche(dceContext);

    // ── 2. Matrice des exigences sur les rubriques du mémoire type (« nouvelle » si aucune ne traite le sujet) ──
    progres(14, 'Analyse des exigences du CCTP et rattachement au mémoire type…');
    const gssFullContext = this.buildFullGssContext(gssDocs, 3000, 60_000);
    const rubriquesMatrice = mt.rubriques.filter((r) => r.ancienne_rubrique !== 'b_references').map((r) => ({ id: r.id, title: r.titre }));
    // Lignes d'une grille de pénalités (T3-CONS-8) : jamais des exigences de prestation (ni question nouvelle, ni engagement).
    const matrice = (await this.analyzeRequirements(dceContext, gssFullContext, rubriquesMatrice, { themes: themesPourMatrice(prep.plan), nouvelles: true }))
      .filter((e: any) => !exigenceDeGrillePenalites(String(e?.exigence || ''), dceContext));
    prep = preparerMemoireType({ ...ctxBase, matrice }, { memoireType: mt });
    // Délais et fréquences imposés par le CCTP (citation vérifiée) : ils remplacent la valeur de GSS dans tout le mémoire.
    const appelAnalyse: AppelModele = async (messages, libelle) => (await this.callOpenAI(messages, 0.1, libelle, true, 'analyse')) ?? '';
    const valeursImposees = await extraireValeursImposees(mt, dceContext, prep.variables, appelAnalyse);
    // Seulement une valeur de la forme attendue par sa phrase (délai chiffré, fréquence, nombre de contrôles).
    const imposees = valeursImposeesValides(valeursImposees.imposees);
    if (imposees.ecartees.length) console.log(`[MemoireGenerator] Valeurs du CCTP écartées (forme inadaptée à la phrase du mémoire type) : ${imposees.ecartees.map((x) => `${x.variable} = « ${x.valeur} »`).join(' ; ')}.`);
    if (Object.keys(imposees.valides).length) {
      prep = preparerMemoireType({ ...ctxBase, matrice, imposees: imposees.valides }, { memoireType: mt });
      console.log(`[MemoireGenerator] Valeurs imposées par le CCTP : ${Object.entries(imposees.valides).map(([k, v]) => `${k} = ${v.valeur}`).join(' ; ')}.`);
    }
    const plan = prep.plan;
    plan.vocabulaireSchemas = vocabulaireSchemasDuMarche(dceContext, prep.variables);
    // Plan imposé par le RC (ordre et numérotation des pièces, sans limite de pages) : les blocs deviennent les parties du
    // RC ; chaque rubrique du mémoire type va dans la partie qui la reçoit (répartition du format court, rubriques que le
    // modèle ne place pas gardées dans leur bloc d'origine) ; un élément attendu qu'aucune rubrique ne traite est demandé à GSS.
    const questionsRC: string[] = [];
    /** Sous-éléments numérotés du RC qu'aucune rubrique ne traite : un emplacement à leur place (T6-CONS-11). */
    const elementsRCSansRubrique: Array<{ partie: PartieRC; element: string; cle: string; apres: string }> = [];
    if (planImpose?.length) {
      const repRC = lireRepartition((await this.callOpenAI(consigneRepartition(mt, plan, planImpose), 0.1, 'Plan imposé par le RC : répartition du mémoire type', true, 'analyse')) || '', mt, plan, planImpose);
      const secondaires = new Set(repRC.source === 'modele' ? repRC.secondaires : []);
      const parPartie = Object.fromEntries(Object.entries(repRC.parPartie).map(([k, l]) => [k, l.filter((id) => !secondaires.has(id))]));
      Object.assign(plan, planSelonRC(plan, planImpose, parPartie));
      // Texte du mémoire type publié pour ce plan (titres compris) : un élément que le RC attend et qu'il traite déjà n'est ni
      // une question ni un emplacement (T6-CONS-15, T6-CONS-11).
      const publieMT = publierMemoire(prep).map((r) => `## ${plan.rubriques.find((x) => x.id === r.id)?.titre || ''}\n${r.texte || ''}`).join('\n\n');
      for (const p of planImpose) for (const e of repRC.nonCouverts[p.id] || []) {
        if (objetTraiteParLeMemoire(e, publieMT)) { console.log(`[MemoireGenerator] Plan imposé par le RC : « ${e} » déjà traité par le mémoire type (ni question ni emplacement).`); continue; }
        // Sous-élément numéroté du RC sans rubrique : il garde sa place dans la partie, avec son emplacement et sa question
        // (T6-CONS-11) ; sinon la question seule.
        const bloc = plan.blocs.find((b) => b.id === `rc_${p.id}`);
        const apres = bloc ? placeElementRC(mt, p, e, bloc.rubriques) : null;
        if (bloc && apres) { elementsRCSansRubrique.push({ partie: p, element: e, cle: bloc.cle, apres }); continue; }
        questionsRC.push(`Pièce attendue par le règlement de consultation (partie « ${p.title} ») qu'aucune rubrique du mémoire type ne traite : « ${e} ». Quelle réponse GSS y apporte-t-elle ?`);
      }
    }
    const mtParId = new Map(mt.rubriques.map((r) => [r.id, r]));
    console.log(`[MemoireGenerator] Plan v2 : ${plan.blocs.map((b) => `${b.cle} ${b.titre} (${b.rubriques.length})`).join(' | ')} ; ${plan.exclues.length} rubrique(s) écartée(s) par leur condition.`);

    // ── 3. Demande particulière (points de fond par rubrique), publipostage, exigences par rubrique ──
    const repartition = await this.repartirDemande(plan.rubriques.map((r) => ({ id: r.id, title: r.titre })));
    const publiees = publierMemoire(prep, { marquerConsultations: true });
    const sections: Record<string, string> = {};
    for (const p of publiees) if (p.texte) sections[p.id] = p.texte;
    // Phrases de GSS adaptées au CCTP (D8) : délais normands retirés au publipostage, puis étapes qui alignent le texte de
    // GSS sur le CCTP ; signalées à GSS en fin de génération.
    const suivi = this.suiviAdaptations(dossierId, mt, { ...ctxBase, matrice, imposees: imposees.valides }, publiees.filter((p) => p.texte).map((p) => p.id), publiees.map((p) => p.texte || ''), { marquerConsultations: true });
    const { parRubrique, nouvelles: nouvellesMatrice } = exigencesParRubrique(mt, plan, matrice);
    const tri = trierNouvelles(mt, plan, nouvellesMatrice);
    for (const [id, l] of Object.entries(tri.rattachees)) (parRubrique[id] ||= []).push(...l);
    // Formalités de l'offre (visite obligatoire, cadre de réponse à joindre…) : jamais une rubrique, une question à GSS.
    const formalitesOffre = tri.nouvelles.filter((e) => FORMALITES_OFFRE.test(`${e.sujet || ''} ${e.exigence}`));
    // Poste et horaires déjà repris par le dimensionnement (ifsem 335 : ADS permanent à Ivry) : pas une question nouvelle ;
    // l'exigence va à la rubrique de l'équipe dédiée (contrôle de couverture).
    const postesDimensionnes = tri.nouvelles.filter((e) => !formalitesOffre.includes(e) && exigenceDePosteDimensionne(`${e.sujet || ''} ${e.exigence}`, ctxBase.dimensionnement));
    if (postesDimensionnes.length) {
      if (plan.rubriques.some((r) => r.id === 'b3_adequation')) (parRubrique.b3_adequation ||= []).push(...postesDimensionnes);
      console.log(`[MemoireGenerator] ${postesDimensionnes.length} exigence(s) de poste déjà dimensionné rattachée(s) à l'équipe dédiée, sans proposition à part.`);
    }
    // Clause contractuelle ou de durée du marché (durée, reconduction, notification, résiliation, confidentialité, litiges,
    // facturation : s2e 1501, « Durée et reconduction de l'accord-cadre », T5N-5) : jamais une proposition de réponse ; elle reste
    // dans la matrice et le bloc 1.
    const clausesContrat = tri.nouvelles.filter((e) => !formalitesOffre.includes(e) && clauseContractuelleOuDuree(`${e.sujet || ''} ${e.exigence}`));
    if (clausesContrat.length) console.log(`[MemoireGenerator] ${clausesContrat.length} clause(s) contractuelle(s) ou de durée du marché sans proposition de réponse.`);
    const { groupes, ecartees } = grouperNouvelles(tri.nouvelles.filter((e) => !formalitesOffre.includes(e) && !postesDimensionnes.includes(e) && !clausesContrat.includes(e)), 6);
    const besoin = donneesBesoin(prep, ctxBase);

    // ── 4. Adaptation ciblée des rubriques « adapte » (et des rubriques fixes visées par la demande particulière) ──
    const registreGss = blocRegistre(horsNormandie) + organigrammeGss(referents);
    const analyseResumee = analyseCompacte(analysisData);
    const appelAdaptation: AppelModele = async (messages, libelle) => {
      // Partie commune (analyse, périmètre, registre) séparée de la partie propre à la rubrique : préfixe mis en cache.
      const user = String(messages[1]?.content || '');
      const coupe = user.indexOf('\n\nRUBRIQUE : ');
      const msgs = coupe > 0 ? [messages[0], { role: 'user', content: user.slice(0, coupe) }, { role: 'user', content: user.slice(coupe + 2) }] : messages;
      return (await this.callOpenAI(msgs, 0.2, libelle, true, 'redaction', coupe > 0 ? 1 : 0)) ?? '';
    };
    const aAdapter = plan.rubriques.filter((r) => sections[r.id] && (r.mode === 'adapte' || (r.mode === 'fixe' && repartition?.parRubrique[r.id]?.length)));
    // Demande particulière : points de fond, forme et passages du document complémentaire (sources GSS autorisées).
    const demandeMT = this.demandeMemoireType(repartition);
    /** Rubriques dont le cahier des charges exclut la mission (T5CP-1) et rubriques non adaptées faute de modèle (T5-COH-2). */
    const rubriquesExclues: Array<{ id: string; titre: string; extrait: string; par: string }> = [];
    const rubriquesNonAdaptees: string[] = [];
    /** Phrases ajoutées par l'adaptation (signalées à GSS) et questions des ajouts refusés (T5N-5). */
    const ajoutsAdaptation: Array<{ id: string; titre: string; phrase: string }> = [];
    const questionsAjoutsRefuses: string[] = [];
    const ajoutsRefusesExigences: string[] = [];
    /** Phrases ajoutées hors du sujet de leur rubrique, à placer dans la rubrique de leur sujet (T4N-6). */
    const deplacementsAjouts: Array<{ de: string; vers: string; phrase: string }> = [];
    const texteGssPublie = Object.values(sections).join('\n');
    let adaptees = 0;
    await enParallele(aAdapter, 4, async (rp) => {
      const r = mtParId.get(rp.id)!;
      const avantAdaptation = sections[rp.id];
      const res = await adapterRubrique({ ...r, mode: 'adapte' }, sections[rp.id], {
        client: besoin.client,
        exigences: parRubrique[rp.id] || [],
        obligations: obligationsPourRubrique(r, dceContext),
        perimetre,
        analyseCompacte: analyseResumee,
        registre: registreGss,
        demande: await demandeMT.consigne(rp.id, r.titre),
        dce: dceContext,
        horsNormandie,
      }, appelAdaptation, {
        nombresAutorises: [registreGss, this.texteDemande()], nomsAutorises: [registreGss, referents, this.texteDemande()],
        // D8 (T2-CONS-3) : une phrase de GSS n'est modifiée que si une phrase du DCE le fonde ; elle est alors signalée à GSS.
        fondement: (m, ph) => fondementDansDce(m, ph, dceContext),
      });
      sections[rp.id] = res.texte;
      suivi.noter(rp.id, avantAdaptation, res.texte, (c) => exigenceDeModification(c, res.appliquees), ETAPE_ADAPTATION_MODELE);
      // Mission décrite par la rubrique niée par le cahier des charges (cstb 551 : « Gestion des entrées : pendant l'ouverture
      // du site, celui-ci n'est pas surveillé » proposé à la place du filtrage) : rubrique retirée, signalée à GSS (T5CP-1).
      if (res.missionExclue) rubriquesExclues.push({ id: rp.id, titre: r.titre, ...res.missionExclue });
      if (res.repli && /appel au modèle impossible|réponse du modèle illisible/.test(res.raison || '')) rubriquesNonAdaptees.push(r.titre);
      // Phrases ajoutées au texte de GSS par l'adaptation (becquerel 591, T5N-5) : refusées quand elles promettent un autre délai
      // que celui de GSS écrit dans le mémoire (question à GSS), sinon signalées à GSS comme les engagements rédigés par l'IA.
      for (const m of res.appliquees.filter((x) => x.type === 'ajout' && x.par)) {
        const contraire = ajoutContraireAuxDelaisGss(m.par!, texteGssPublie);
        if (contraire && sections[rp.id].includes(m.par!)) {
          sections[rp.id] = sections[rp.id].replace(m.par!, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
          // Exigence citée : la phrase du DCE qui fonde l'ajout, jamais la justification du modèle (m.motif, T6C-2).
          const fondement = phraseDuDceProche(m.par!, dceContext);
          questionsAjoutsRefuses.push(fondement ? questionAlignementRefuse(fondement, contraire) : questionAjoutRefuse(m.par!, contraire));
          ajoutsRefusesExigences.push(fondement || m.par!);
          console.warn(`[MemoireGenerator] Adaptation ${rp.id} : ajout refusé, contraire au délai de GSS (« ${m.par!.slice(0, 100)} »).`);
          continue;
        }
        // Phrase qui parle du mémoire au lieu de répondre (ifits 701 : « Les CV et attestations de formation des équipes… sont
        // présentés dans le mémoire », alors qu'aucun CV n'y figure) : retirée, la donnée est demandée à GSS.
        const motifAjout = motifRefusEngagement(m.par!);
        if (/^(?:phrase sur le mémoire|renvoi à un document|engagement futur|plan du mémoire)/.test(motifAjout) && sections[rp.id].includes(m.par!)) {
          sections[rp.id] = sections[rp.id].replace(m.par!, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
          questionsAjoutsRefuses.push(questionDEngagement(m.par!));
          console.warn(`[MemoireGenerator] Adaptation ${rp.id} : ajout refusé (${motifAjout}) : « ${m.par!.slice(0, 100)} ».`);
          continue;
        }
        // Phrase recopiée du CCTP à l'infinitif (« Effectuer la ronde d'ouverture… ») : engagement de GSS (« GSS s'engage à… »).
        const conjuguee = phraseAjouteeConjuguee(m.par!);
        if (conjuguee !== m.par && sections[rp.id].includes(m.par!)) sections[rp.id] = sections[rp.id].replace(m.par!, conjuguee);
        // Phrase hors du sujet de la rubrique (becquerel 1401, T4N-6 : confidentialité ajoutée sous « La reprise du personnel en
        // place ») : déplacée dans la rubrique de son sujet après toutes les adaptations, sinon retirée.
        const phraseAjoutee = sections[rp.id].includes(conjuguee) ? conjuguee : m.par!;
        const cibleAjout = rubriqueDeLAjout(mt, plan.rubriques.map((x) => x.id), rp.id, phraseAjoutee);
        if (cibleAjout !== rp.id && sections[rp.id].includes(phraseAjoutee)) {
          sections[rp.id] = sections[rp.id].replace(phraseAjoutee, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
          deplacementsAjouts.push({ de: rp.id, vers: cibleAjout, phrase: phraseAjoutee });
          continue;
        }
        ajoutsAdaptation.push({ id: rp.id, titre: r.titre, phrase: phraseAjoutee });
      }
      adaptees++;
      progres(18 + Math.round((30 * adaptees) / Math.max(1, aAdapter.length)), `Adaptation au CCTP : ${adaptees}/${aAdapter.length} rubrique(s)…`);
      console.log(`[MemoireGenerator] Adaptation ${rp.id} : ${res.appliquees.length} modification(s) appliquée(s), ${res.refusees.length} refusée(s), fidélité ${res.fidelite.toFixed(2)}${res.repli ? ` — texte de référence conservé (${res.raison})` : ''}.`);
    });

    // Phrases ajoutées hors du sujet de leur rubrique (T4N-6) : à la fin du texte de la rubrique de leur sujet (avant ses
    // engagements), signalées à GSS comme phrases ajoutées de cette rubrique ; sans rubrique de leur sujet, retirées.
    for (const d of deplacementsAjouts) {
      const rv = plan.rubriques.find((x) => x.id === d.vers);
      if (!rv || !sections[d.vers]) { console.warn(`[MemoireGenerator] Adaptation ${d.de} : phrase ajoutée hors sujet retirée (aucune rubrique de son sujet) : « ${d.phrase.slice(0, 100)} ».`); continue; }
      const t = sections[d.vers];
      const k = t.indexOf('\n## Nos engagements');
      sections[d.vers] = k >= 0 ? `${t.slice(0, k).trimEnd()}\n\n${d.phrase}\n${t.slice(k)}` : `${t.trimEnd()}\n\n${d.phrase}`;
      ajoutsAdaptation.push({ id: d.vers, titre: rv.titre, phrase: d.phrase });
      console.log(`[MemoireGenerator] Adaptation ${d.de} : phrase ajoutée hors du sujet de la rubrique placée dans « ${rv.titre} » : « ${d.phrase.slice(0, 100)} ».`);
    }
    // Rubrique dont la mission est exclue par le cahier des charges : retirée du plan et du mémoire, signalée (T5CP-1).
    for (const x of rubriquesExclues) {
      delete sections[x.id];
      const k = plan.rubriques.findIndex((r) => r.id === x.id);
      if (k >= 0) plan.rubriques.splice(k, 1);
      console.warn(`[MemoireGenerator] Rubrique ${x.id} retirée : le cahier des charges exclut sa mission (proposition du modèle : « ${x.par.slice(0, 160)} »).`);
    }
    // ── 5. Remarques sur le CCTP (si le DCE les demande), puis bloc « Notre compréhension de votre besoin » ──
    const remarques = await this.remarquesCahierDesCharges(dceContext);
    const schemasGeneres = new Map<string, string>();
    const titresSchemas: Record<string, string> = {};
    const avisSecours: string[] = rubriquesExclues.map((x) => `Rubrique « ${x.titre} » retirée du mémoire : le cahier des charges exclut la mission qu'elle décrit (à la place de « ${phraseLisible(x.extrait, 160)} », le modèle proposait « ${phraseLisible(x.par, 160)} »). Si GSS assure bien cette mission sur ce marché, demandez via l'assistant de rétablir la rubrique.`);
    const b1 = plan.rubriques.find((r) => r.mode === 'besoin');
    /** Formalités de l'offre retirées du bloc 1 (T6-CONS-12) : posées à GSS. */
    const formalitesBloc1: string[] = [];
    if (b1) {
      progres(50, 'Notre compréhension de votre besoin : explication et schéma de process…');
      const c = await this.redigerComprehension(prep, ctxBase, besoin, {
        perimetre, exigences: matrice.filter((e) => e.exigence && !PIECES_OFFRE.test(e.exigence)), remarques,
        analyse: analyseResumee, demande: await demandeMT.consigne(b1.id, b1.titre),
      });
      sections[b1.id] = remarques ? `${c.texte.trim()}\n\n${remarques}` : c.texte;
      formalitesBloc1.push(...c.formalites);
      // 1 à 2 pages d'explication (consigne 3) : la rédaction qui dépasse sa limite de mots est ramenée à 2 pages, sans modèle.
      if (!estRetourArriere(themeActif())) {
        const r = reduireBesoinAPages(sections[b1.id], (t) => decouperPagesTexte(t, false, true).length);
        if (r.texte !== sections[b1.id]) { sections[b1.id] = r.texte; console.log(`[MemoireGenerator] Compréhension du besoin : ${r.retirees.length} ligne(s) retirée(s)${r.depasse ? ', toujours plus de 2 pages de texte' : ' et texte resserré pour tenir en 2 pages de texte'}.`); }
        // Consigne 3 (1 à 2 pages d'explication) non tenue malgré la réduction (T3N-1) : GSS est prévenu.
        if (r.depasse) avisSecours.unshift(`Rubrique « ${b1.titre} » : le texte occupe plus de 2 pages avant son schéma (consigne : 1 à 2 pages d'explication) ; à raccourcir via l'assistant avant la remise.`);
      }
      titresSchemas[b1.id] = c.titre;
      if (c.svg) schemasGeneres.set(CLE_SCHEMA(b1.id), c.svg);
      // Aucun schéma de process construit sur le contenu du texte (étapes du modèle refusées, secours impossibles) : signalé à
      // GSS (T3C-3), le schéma construit au rendu est à relire.
      else if (!c.secours) avisSecours.push(`Rubrique « ${b1.titre} » : le schéma de process n'a pas pu être construit sur les étapes du texte (schéma construit au rendu d'après le texte) ; à relire et à corriger via l'assistant avant la remise.`);
      if (c.secours) avisSecours.push(`Rubrique « ${b1.titre} » : rédaction automatique indisponible, texte construit à partir des données du DCE, à relire et compléter.`);
    }

    // ── 6. Questions nouvelles du DCE : proposition de réponse de l'IA, en fin du bloc de son thème ──
    const ajouts: AjoutLibre[] = [];
    const enProposition = new Set<ExigenceMatrice>();
    const alertesAcheteurs: string[] = [];
    if (groupes.length) {
      progres(56, `Questions nouvelles du DCE : ${groupes.length} proposition(s) de réponse…`);
      const idsPris = new Set([...mt.rubriques.map((r) => r.id), ...Object.keys(sections)]);
      const availableCategories = Object.keys(gssDocs);
      const propositions: Array<AjoutLibre | null> = groupes.map(() => null);
      await enParallele(groupes, 3, async (g, i) => {
        const cle = blocProposition(mt, plan, g);
        const bloc = plan.blocs.find((b) => b.cle === cle)!;
        const p = await this.proposerReponse(g, {
          client: besoin.client, bloc: `${bloc.numero}. ${bloc.titre}`, perimetre, horsNormandie, analyse: analyseResumee,
          registre: registreGss, gssDocs, availableCategories, dce: dceContext,
          demande: await demandeMT.consigne(undefined, `${g.sujet}. ${g.exigences.map((e) => e.exigence).join(' ')}`),
        });
        if (!p) { ecartees.push(...g.exigences); return; }
        const id = idProposition(g.sujet, idsPris);
        sections[id] = p.texte;
        alertesAcheteurs.push(...p.questions);
        if (p.acheteurs.length) alertesAcheteurs.push(`Proposition de réponse « ${p.titre} » : la rédaction citait ${p.acheteurs.join(', ')}, acheteur(s) d'un ancien mémoire de GSS qui ne figure(nt) pas parmi vos références validées ; ${p.acheteurs.length > 1 ? 'ces phrases ont été retirées' : 'cette phrase a été retirée'} du mémoire. GSS souhaite-t-elle citer ce marché comme référence (avec quelles caractéristiques) ?`);
        g.exigences.forEach((e) => enProposition.add(e));
        propositions[i] = { id, chapter: cle, title: p.titre, apres: bloc.rubriques[bloc.rubriques.length - 1], proposition: true, sujet: g.sujet };
      });
      ajouts.push(...propositions.filter((a): a is AjoutLibre => !!a));
      console.log(`[MemoireGenerator] Questions nouvelles : ${ajouts.length} proposition(s) de réponse (${ajouts.map((a) => a.title).join(' ; ')}).`);
    }
    // Élément attendu par le RC sans rubrique (T6-CONS-11) : rubrique à sa place, réduite à l'emplacement de la donnée et à sa
    // question ; aucun texte n'est inventé.
    for (const x of elementsRCSansRubrique) {
      const idsPris = new Set([...mt.rubriques.map((r) => r.id), ...Object.keys(sections)]);
      const id = idProposition(`rc ${x.element}`, idsPris);
      const libelle = x.element.replace(/[\s.;:]+$/, '');
      sections[id] = `${libelle} : [À COMPLÉTER].\n[CONSULTATION REQUISE : Pièce attendue par le règlement de consultation (partie « ${x.partie.title} ») qu'aucune rubrique du mémoire type ne traite : « ${libelle} ». Quelle réponse GSS y apporte-t-elle ?]`;
      ajouts.push({ id, chapter: x.cle, title: libelle.charAt(0).toUpperCase() + libelle.slice(1), apres: x.apres, emplacementRC: true });
    }

    // ── 7. Couverture : une exigence qu'une rubrique ne traite pas devient un engagement (puce) ──
    progres(62, 'Contrôle de couverture des exigences du CCTP…');
    const aCouvrir = plan.rubriques.filter((r) => r.mode !== 'besoin' && sections[r.id] && parRubrique[r.id]?.length).map((r) => r.id);
    const questionsCouverture = new Set<string>();
    const sourcesCouverture = new Map<string, string>();
    await enParallele(aCouvrir, 4, async (id) => { sections[id] = await this.completerCouverture(sections[id], parRubrique[id], id, false, questionsCouverture, sourcesCouverture); });
    // Postes du CCTP déjà présentés dans le tableau du périmètre du bloc 1 : leurs puces de couverture ne sont pas redites
    // ailleurs (génération réelle ign 15 : 5 pages de texte pour « L'adéquation de nos moyens humains », consignes 3 et 6).
    if (b1 && sections[b1.id]) {
      for (const id of aCouvrir) {
        const r = sansRediteDuPerimetre(sections[id], sections[b1.id]);
        if (r.retirees.length) { sections[id] = r.texte; console.log(`[MemoireGenerator] Rubrique ${id} : ${r.retirees.length} engagement(s) déjà présenté(s) dans le périmètre du bloc 1 retiré(s).`); }
      }
    }
    // Même exigence du CCTP ajoutée dans plusieurs rubriques (T2-CONS-13) : gardée dans la rubrique de son sujet seulement.
    {
      const idsPlan = plan.rubriques.map((r) => r.id).filter((id) => id !== b1?.id);
      const corps: Record<string, string> = Object.fromEntries(Object.entries(sections).filter(([id]) => idsPlan.includes(id)));
      const retires = sansAjoutsRepetesEntreRubriques(corps, ajoutsAdaptation, (phrase, ids) => rubriqueDuTheme(phrase, ids) || rechercherRubriques(mt, phrase, 1, ids)[0]?.id || ids.sort((a, b) => idsPlan.indexOf(a) - idsPlan.indexOf(b))[0]);
      Object.assign(sections, corps);
      if (retires.length) console.log(`[MemoireGenerator] ${retires.length} exigence(s) du CCTP déjà ajoutée(s) dans la rubrique de leur sujet retirée(s) d'une autre rubrique : ${retires.map((x) => `${x.id} « ${x.phrase.slice(0, 70)} »`).join(' ; ')}.`);
    }

    const questionsJalon: string[] = [];
    // Jalon d'envoi des plannings au client : celui de « La planification », jamais un autre dans un texte rédigé par l'IA
    // (génération réelle caen 701 : proposition « … transmis à l'ACOSS à J-10 » face à « J-3 : envoi des plannings à l'ACOSS »).
    {
      const jalon = jalonEnvoiClient(sections['b4_planification'] || '');
      const joursDce = envoiPlanningsClientDce(dceContext)?.jours || 0;
      if (jalon) for (const id of Object.keys(sections)) {
        if (id === 'b4_planification') continue;
        const h = harmoniserJalonPlanning(sections[id], jalon, besoin.client, joursDce);
        if (h.corriges.length) { sections[id] = h.texte; console.log(`[MemoireGenerator] Rubrique ${id} : jalon d'envoi des plannings au client ramené à ${jalon} (${h.corriges.length} phrase(s)).`); }
        // (T7G-4 : jalon qui cite le CCTP ou vaut le délai du DCE, gardé : l'écart est signalé à GSS)
        for (const ph of h.ecarts) questionsJalon.push(`Le jalon d'envoi des plannings au client diffère entre « La planification » (${jalon}) et cette phrase, qui cite le cahier des charges : « ${ph.slice(0, 240)} ». Quel jalon faut-il garder dans tout le mémoire ?`);
      }
    }

    // ── 8. Filtres de chaque rubrique : commentaires internes et délais hors Normandie (remontés en consultations) ──
    const commentairesRetires = new Set<string>();
    for (const id of Object.keys(sections)) {
      const nettoye = retirerCommentairesInternes(protegerGras(sections[id]));
      nettoye.retires.forEach((x) => commentairesRetires.add(`À confirmer : ${retablirGras(x)}`));
      const delais0 = delaisHorsNormandie(retablirGras(nettoye.texte), dceContext, horsNormandie);
      // (T7-CONS-9 : consultation du modèle sur un délai hors Normandie, déjà posée une seule fois à GSS : retirée)
      const delais = { ...delais0, texte: sansConsultationsDelaiHorsNormandie(delais0.texte, horsNormandie).texte };
      delais.retires.forEach((x) => commentairesRetires.add(`${libelleDelaiRetire(analysisData, dceContext)}${x}`));
      suivi.noterFiltres(id, retablirGras(nettoye.texte), delais.texte, dceContext, horsNormandie, analysisData);
      sections[id] = delais.texte;
    }

    // ── 9. Passes de cohérence sur tout le mémoire (le texte de référence des rubriques fixes n'est jamais élagué) ──
    const rubriquesDoc = sectionsV2(plan, ajouts).filter((r) => (sections[r.id] || '').trim());
    const fixes = plan.rubriques.filter((r) => r.mode === 'fixe' && !repartition?.parRubrique[r.id]?.length).map((r) => r.id);
    progres(70, 'Contrôle des répétitions entre rubriques…');
    // Le bloc 1 annonce ce que les blocs 2 à 5 développent (consigne 3) : ses attentes et points de vigilance ne sont
    // jamais des redites à retirer (ils disparaissaient tous, génération réelle ign 12 et 13).
    await this.dedoublonnerRubriques(sections, rubriquesDoc, [...fixes, ...(b1 ? [b1.id] : [])],
      Object.fromEntries(publiees.filter((p) => p.mode === 'adapte' && p.texte).map((p) => [p.id, p.texte!])));
    progres(74, 'Cohérence avec les exigences chiffrées et les horaires du CCTP…');
    // Valeurs habituelles de GSS dont l'engagement renforcé n'est dû que si le DCE l'exige (indicateur faux) : protégées.
    const proteges = [
      ...Object.values(mt.variables).filter((v) => v.valeur_gss && v.valeur_si_exige && v.indicateur_exige && !prep.indicateurs[v.indicateur_exige]).map((v) => v.valeur_gss!),
      // Pratique générale de GSS suivie de la phrase propre au client (« Pour le CSTB, les réunions de suivi ont lieu une fois
      // par an… ») : la phrase propre au client répond au CCTP, la phrase générale reste celle de GSS (T5CP-8).
      ...plan.rubriques.flatMap((r) => phrasesGeneralesProtegees(mt.rubriques.find((x) => x.id === r.id)?.texte || '', sections[r.id] || '')),
    ];
    const exigencesCoherence = [...obligationsChiffrees(dceContext).map((o) => ({ exigence: o.phrase })), ...matrice, ...horairesImposes(dceContext).map((h) => ({ exigence: `Horaire imposé : ${h}` }))];
    const exigencesRefusees: string[] = [...ajoutsRefusesExigences];
    await this.corrigerContradictions(sections, rubriquesDoc, exigencesCoherence, proteges, questionsCouverture, undefined, (id, a, b, e) => suivi.noterCoherence(id, a, b, e, exigencesCoherence.map((x) => String(x.exigence || ''))), exigencesRefusees, dceContext);
    // Exigence du CCTP que GSS n'a pas pu reprendre (jalon, délai ou fréquence de GSS gardés, question posée) : le bloc 1 ne la
    // présente plus comme un engagement, et son schéma de process ne la reprend plus (becquerel 591, T5N-5).
    if (b1 && sections[b1.id] && exigencesRefusees.length) {
      const r = retirerEngagementsRefuses(sections[b1.id], exigencesRefusees);
      if (r.retirees.length) {
        sections[b1.id] = r.texte;
        console.log(`[MemoireGenerator] Compréhension du besoin : ${r.retirees.length} engagement(s) contraire(s) à une pratique de GSS gardée retiré(s) (${r.retirees.map((x) => x.slice(0, 60)).join(' ; ')}).`);
        const svg = schemasGeneres.get(CLE_SCHEMA(b1.id));
        if (svg && r.marques.some((m) => normaliser(svg.replace(/<[^>]+>/g, ' ')).includes(normaliser(m)))) {
          // Schéma de process reconstruit sur le texte corrigé, avec toute la chaîne de secours du process (T2N-6 : jamais une
          // grille de cartes construite au rendu sous le titre « en un process »).
          const nouveau = await dessinerProcessSecoursBloc1(sections[b1.id], b1.id, titresSchemas[b1.id] || b1.titre, undefined, (x) => phraseDeRubriqueGss(this.memoireTypeV2(), x));
          if (nouveau) { schemasGeneres.set(CLE_SCHEMA(b1.id), nouveau); titresSchemas[b1.id] = mt.rubriques.find((x) => x.mode === 'besoin')?.schema?.titre || titresSchemas[b1.id]; }
          else { schemasGeneres.delete(CLE_SCHEMA(b1.id)); avisSecours.push(`Rubrique « ${b1.titre} » : le schéma de process reprenait une exigence que GSS doit d'abord confirmer, et aucun schéma de process n'a pu être construit sur le texte corrigé : la page de schéma n'est pas imprimée. Demandez-le via l'assistant avant la remise.`); }
        }
      }
    }
    await this.verifierHoraires(sections, rubriquesDoc, dceContext, undefined, (id, a, b, e) => suivi.noterCoherence(id, a, b, e, [], 'Horaires du CCTP'));
    await this.engagementsChiffresManquants(sections, rubriquesDoc, dceContext);
    limiterRappelsSite(sections, rubriquesDoc.map((x) => x.id));
    const refsRetirees = limiterReferences(sections, rubriquesDoc.map((x) => x.id).filter((id) => plan.rubriques.find((r) => r.id === id)?.ancienne_rubrique !== 'b_references'));
    if (refsRetirees) console.log(`[MemoireGenerator] Références clients : citées dans deux rubriques au plus (${refsRetirees} rubrique(s) allégée(s)).`);

    // ── 10. Consultations et repères des données à compléter ──
    // Exigence déjà traitée par une phrase de GSS adaptée au CCTP (D8) ou par le texte remis : pas de question (T7CS-7).
    retirerQuestionsCouvertes(questionsCouverture, sourcesCouverture, suivi.exigencesNotees(), Object.values(sections).join('\n\n'));
    progres(80, 'Données à compléter et questions à GSS…');
    const titreDe = (id: string) => rubriquesDoc.find((r) => r.id === id)?.title || id;
    const consultations = new Set<string>([
      ...alerteCadreAbsent(dceContext, this.cadreNonRemplissable || ''), ...questionLieuInconnu(analysisData, dceContext),
      ...commentairesRetires,
      ...alertesAcheteurs,
      ...questionsCouverture,
      ...questionsAjoutsRefuses,
      ...questionsRC,
      ...questionsJalon,
      // Objet du marché inconnu (lecture du DCE sans modèle, T6N-2) : jamais « Mémoire technique » en objet, la question est posée.
      ...(!variableRenseignee(prep.variables.OBJET_MARCHE) && mt.variables.OBJET_MARCHE?.question ? [mt.variables.OBJET_MARCHE.question] : []),
      ...formalitesOffre.map(questionFormalite),
      ...formalitesBloc1.filter((x) => !formalitesOffre.some((e) => typeFormalite(`${e.sujet || ''} ${e.exigence}`) === typeFormalite(x))).map((x) => questionFormalite({ exigence: x })),
      ...confirmationsRegistreUtilisees(Object.values(sections).join('\n'), horsNormandie),
      // Publipostage : valeurs du registre à confirmer, passages retirés faute de valeur (délai hors Normandie…).
      ...publiees.flatMap((p) => [...p.aConfirmer.map((x) => x.question), ...p.manquantes.filter((m) => !m.repere).map((m) => m.question)]).flatMap((q) => q.split('\n')).map((q) => q.trim()).filter(Boolean),
    ]);
    for (const r of matrice) {
      // Description du site tirée du DCE (« Site de Caen : 20 rue Alfred Kastler… ; surface utile brute de 2 820 m² ; horaires
      // d'ouverture… », caen 1501, T5-CONS-9) : un fait du DCE, déjà imprimé au bloc 1, jamais une question à GSS.
      if (r.exigence && (faitDuDce(r.exigence) || clauseContractuelleOuDuree(r.exigence))) continue;
      if ((r.couverture || '').toLowerCase().includes('écart') && r.exigence && !PIECES_OFFRE.test(r.exigence) && !enProposition.has(r)
        && !exigenceTraitee(r.exigence, Object.values(sections).join('\n\n'))) consultations.add(FORMALITES_OFFRE.test(r.exigence) ? questionFormalite(r) : r.exigence.trim());
    }
    // (clause de l'acheteur : facturation, réexamen, responsabilité des détériorations…, T7N-11 : jamais une question à GSS)
    for (const e of ecartees) if (!PIECES_OFFRE.test(e.exigence) && !clauseContractuelleOuDuree(e.exigence)) consultations.add(`Exigence du DCE sans réponse dans le mémoire : ${e.exigence.trim()}`);
    const { enPlace, enLigne } = poserReperes(sections, rubriquesDoc.map((r) => r.id), 0);
    // Emplacements sans question (adaptation, rédactions du modèle) : question formulée d'après leur phrase, comme
    // pour un « [À COMPLÉTER] » écrit par l'assistant.
    const sansQuestion = enPlace.filter((e) => !e.question);
    if (sansQuestion.length) {
      try {
        const qs = await formulerQuestions(sansQuestion.map((e) => ({ cle: `A${e.n}`, contexte: e.contexte, environnement: e.environnement, critere: titreDe(e.id) })));
        for (const e of sansQuestion) e.question = qs.get(`A${e.n}`)?.question;
        // Deux emplacements de libellés différents avec la même question (T3N-4, parc_expo 1331 : « Modalités d'évaluation des
        // réparations » et « Délai de prise en charge ») : chacun sa question, tirée de son libellé.
        for (const e of sansQuestion) {
          const memes = sansQuestion.filter((x) => x.question && x.question === e.question);
          if (memes.length > 1 && new Set(memes.map((x) => normaliser(libelleDuRepere(x.contexte)))).size === memes.length) for (const x of memes) x.question = questionExacte(`Information à fournir pour compléter : « ${libelleDuRepere(x.contexte)} »`);
        }
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Questions des emplacements à compléter non formulées (${e?.message || e}).`);
      }
      for (const e of sansQuestion) e.question ||= `Information à fournir pour compléter : « ${libelleDuRepere(e.contexte) || e.contexte} »`;
    }
    const demandes: Array<{ texte: string; repere?: number }> = [...consultations].filter(Boolean).map((texte) => ({ texte }));
    for (const r of enLigne) demandes.push({ texte: r.question, repere: r.n });
    // Questions sans redite (T2-CONS-7, T2N-7) : rien de ce qu'un emplacement ou une proposition de réponse (D5) pose déjà.
    const questionsGss = sansQuestionsRedites(await this.consoliderAvecSources(demandes.map((d) => d.texte), { dce: dceContext, horsNormandie: horsNormandie }), {
      prioritaires: enPlace.map((e) => e.question || '').filter(Boolean),
      exigencesProposees: [...enProposition].map((e) => String(e.exigence || '')).filter(Boolean),
      // Texte des réponses de GSS, sans la compréhension du besoin (qui cite le CCTP sans y répondre).
      // (titres des rubriques compris : une question sur le remplacement est traitée par « Le remplacement d'un agent absent », T6-CONS-15)
      texteMemoire: Object.entries(sections).filter(([id]) => !/b1_|comprehension/i.test(id)).map(([id, t]) => `## ${titreDe(id)}\n${t}`).join('\n\n').replace(REPERE_RE, ''),
      garder: (q) => q.sources.some((k) => typeof demandes[k]?.repere === 'number'),
    });
    // Un élément par emplacement « [À COMPLÉTER] » (sa réponse remplace ce seul emplacement), puis les autres questions.
    const elementsLibres: ElementACompleter[] = enPlace.map((e, i) => ({
      cle: `Q${i + 1}`, question: e.question!, contexte: `${titreDe(e.id)} — ${e.contexte}`, statut: 'ouvert' as const, reperes: [e.n],
    }));
    const autres: ElementACompleter[] = questionsGss.map((q, i) => {
      const reperes = [...new Set(q.sources.map((k) => demandes[k]?.repere).filter((x): x is number => typeof x === 'number'))];
      const idSection = reperes.length ? Object.keys(sections).find((k) => sections[k].includes(REPERE(reperes[0]))) : undefined;
      let contexte = '';
      if (idSection) {
        const t = sections[idSection];
        const p = t.indexOf(REPERE(reperes[0]));
        contexte = `${titreDe(idSection)} — …${t.slice(Math.max(0, p - 220), p).replace(REPERE_RE, '').replace(/^[^\s⟦]*⟧/, '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim()}`;
      }
      return { cle: `Q${enPlace.length + i + 1}`, question: q.question, contexte, statut: 'ouvert', reperes, pourAcheteur: /^À demander à l.acheteur/i.test(q.question) };
    });
    elementsLibres.push(...autres);
    await this.completerParLesMemoires(autres, sections, horsNormandie);
    // Propositions de réponse : une phrase qui affirme un point posé en question à GSS est retirée (la réponse de
    // GSS la remplacera), comme une variable « à compléter ».
    const questionsOuvertes = elementsLibres.filter((e) => e.statut === 'ouvert').map((e) => e.question);
    for (const a of ajouts) {
      if (!sections[a.id]) continue;
      const r = retirerAffirmationsQuestionnees(sections[a.id], questionsOuvertes);
      if (r.retires.length) console.log(`[MemoireGenerator] Proposition « ${a.title} » : ${r.retires.length} phrase(s) qui tranchaient une question posée à GSS retirée(s).`);
      sections[a.id] = r.texte;
    }
    // Nettoyage final (mêmes filtres que la réponse libre v1), sur tout le texte remis à l'acheteur ; exigences du CCTP
    // recopiées à la voix de l'acheteur retirées (hors bloc 1, qui cite l'acheteur, et hors liste « Nos engagements »,
    // qui reprend les exigences) et voix de GSS partout (« le titulaire » → « GSS »).
    const ENGAGEMENTS = '## Nos engagements sur les exigences du cahier des charges';
    const sansRecopie = (id: string, t: string) => {
      if (id === 'b1_comprehension') return t;
      const i = t.indexOf(ENGAGEMENTS);
      return i < 0 ? sansRecopieCctp(t, dceContext).texte : `${sansRecopieCctp(t.slice(0, i), dceContext).texte.trimEnd()}\n\n${t.slice(i)}`;
    };
    for (const id of Object.keys(sections)) {
      const avantFiltres = fondementReprise(retablirGras(retirerCommentairesInternes(protegerGras(sections[id])).texte), dceContext);
      const filtre = interditsDce(delaisHorsNormandie(avantFiltres, dceContext, horsNormandie).texte, dceContext);
      suivi.noterFiltres(id, avantFiltres, filtre, dceContext, horsNormandie, analysisData);
      sections[id] = voixDeGss(sansRecopie(id, nettoyerStructure(filtre)));
      // Engagement en double dans la même liste (T9N-4) : la puce la plus complète reste.
      const doubles = sansEngagementsEnDouble(sections[id]);
      if (doubles.retirees.length) { sections[id] = doubles.texte; console.log(`[MemoireGenerator] Rubrique ${id} : ${doubles.retirees.length} engagement(s) en double retiré(s) : ${doubles.retirees.map((x) => x.slice(0, 80)).join(' ; ')}.`); }
      // Engagement qui redit une phrase du texte de la rubrique (citedia 701, « Le contrôleur de rondes ») : retiré.
      const dits = sansEngagementsDejaDits(sections[id]);
      if (dits.retirees.length) { sections[id] = dits.texte; console.log(`[MemoireGenerator] Rubrique ${id} : ${dits.retirees.length} engagement(s) déjà écrit(s) dans le texte retiré(s) : ${dits.retirees.map((x) => x.slice(0, 80)).join(' ; ')}.`); }
    }
    // Nom de l'acheteur écrit d'une seule façon partout (casse et accents de la variable CLIENT, parc_expo 202).
    { const nomClient = String(prep.variables.CLIENT?.valeur || ''); if (nomClient) for (const id of Object.keys(sections)) sections[id] = harmoniserVariantesAcheteur(harmoniserNomClient(sections[id], nomClient), nomClient); }
    nomClientCourtApresPremiere(sections, prep.variables.CLIENT as any, analysisData?.clientName || '');
    // 1 à 2 pages d'explication par rubrique (consignes 3 et 6) : puces de couverture au-delà retirées, texte de GSS intact.
    if (!estRetourArriere(themeActif())) {
      for (const id of Object.keys(sections)) {
        if (id === b1?.id) continue;
        const r = plafonnerEngagementsPages(sections[id], (t) => decouperPagesTexte(t.replace(REPERE_RE, '')).length);
        if (r.retirees.length) { sections[id] = r.texte; console.log(`[MemoireGenerator] Rubrique ${id} : ${r.retirees.length} engagement(s) non repris pour tenir en 2 pages de texte : ${r.retirees.map((x) => x.slice(0, 80)).join(' ; ')}.`); }
      }
    }
    // Phrases de GSS adaptées au CCTP (D8) : retrouvées dans le texte final ; choix de GSS de la génération précédente
    // appliqués (texte remis), les autres signalées à GSS. Aucun signalement dans le mémoire remis.
    const adaptations = this.finaliserAdaptations(suivi, sections, titreDe, elementsLibres);
    // Questions à GSS mises en forme (vraies questions, sans doublon) comme dans l'état de l'assistant.
    const consultationList = questionsUniques(elementsSansDoublon(elementsLibres));
    // OpenAI en panne pendant la génération (T5-COH-2) : jamais un publipostage non adapté présenté comme complet.
    // DCE sans CCTP (T8-COH-2) : en tête des consultations et du premier message de l'assistant, comme la limite de pages.
    const alertePanne = [...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext), ...this.alertesFormat, alerteRedactionIndisponible(this.appelsEchoues, rubriquesNonAdaptees)].filter(Boolean).join('\n\n');
    if (alertePanne) { consultationList.unshift(...alertePanne.split('\n\n')); console.warn(`[MemoireGenerator] ${alertePanne}`); }
    consultationList.push(...avisSecours);
    // Propositions de réponse de l'IA : signalées APRÈS les éléments (jamais envoyées à l'équipe comme des questions).
    for (const a of ajouts.filter((x) => !x.emplacementRC)) consultationList.push(`Proposition de réponse à valider (question nouvelle du DCE) : ${a.title}`);
    // Engagements rédigés par l'IA d'après le CCTP (contrôle de couverture) : signalés à GSS par rubrique, comme en format
    // court (D5, T4C-10 : caen 471, 37 engagements sur 17 rubriques, aucun signalé).
    const engagementsIA = Object.entries(sections).map(([id, t]) => {
      const i = t.indexOf(ENGAGEMENTS);
      return { id, n: i < 0 ? 0 : (t.slice(i).match(/^\s*[-*•]\s+\S/gm) || []).length };
    }).filter((x) => x.n > 0);
    for (const x of engagementsIA) consultationList.push(`Engagements à valider (exigences du CCTP rédigées par l'IA) : « ${titreDe(x.id)} » — ${x.n} engagement${x.n > 1 ? 's' : ''}`);
    // Phrases ajoutées au texte de GSS par l'adaptation au CCTP et restées dans le texte (T5N-5) : signalées à GSS.
    const ajoutsRestes = ajoutsAdaptation.filter((a) => (sections[a.id] || '').includes(a.phrase.slice(0, 60)));
    for (const a of ajoutsRestes) consultationList.push(`Phrase ajoutée au texte de GSS d'après le cahier des charges (rédigée par l'IA), à valider : « ${titreDe(a.id)} » — « ${phraseLisible(a.phrase, 600)} »`);
    // Phrases de GSS adaptées au CCTP (D8) : une ligne par phrase à valider (aucune s'il n'y en a pas).
    consultationList.push(...consultationsAdaptations(adaptations));
    if (consultationList.length) {
      console.warn(`[MemoireGenerator] ⚠ ${consultationList.length} consultation(s) GSS :\n- ${consultationList.join('\n- ')}`);
      progres(86, `⚠ ${consultationList.length} information(s) à obtenir ou à valider auprès de GSS : ${consultationList.slice(0, 3).join(' ; ')}${consultationList.length > 3 ? '…' : ''}`);
    }

    // ── 11. Schémas (1 par rubrique, sans modèle quand le mémoire type les fixe) et rendu ──
    const propres: Record<string, string> = {};
    for (const [id, t] of Object.entries(sections)) propres[id] = t.replace(REPERE_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    progres(88, 'Schémas du mémoire type : 1 page de schéma par rubrique…');
    const theme = themeActif();
    actualiserOrganigramme(referents);
    await this.schemasMemoireType(plan, mt, publiees, propres, schemasGeneres, titresSchemas, theme);
    progres(90, 'Assemblage final du mémoire…');
    // Nom de l'acheteur affiché (couverture, sommaire, ouvertures, pieds de page) : forme corrigée de CLIENT (T1-COH-6).
    cover.client = nomAcheteurAffiche(prep.variables.CLIENT, cover.client);
    // Forme courte (« ENPC et IGN ») pour le pied de page d'un nom long (T3-CONS-1).
    cover.clientCourt = nomAcheteurCourtAffiche(prep.variables.CLIENT);
    // Intitulé du marché affiché : celui du mémoire, mis en casse normale s'il était en capitales (T2-CONS-14).
    if (typeof prep.variables.OBJET_MARCHE?.valeur === 'string' && prep.variables.OBJET_MARCHE.valeur.trim() && cover.title && cover.title === cover.title.toUpperCase()) cover.title = prep.variables.OBJET_MARCHE.valeur.trim();
    // Intitulé de la couverture sans redite (« Sécurité - incendie - sûreté — prestations de sécurité, incendie, sûreté », T5-CONS-12).
    if (cover.title) cover.title = intituleSansRedite(cover.title);
    // Articles du CCTP des chiffres du bloc 1 (style « marine » v3 : bandeau des chiffres clés et lignes de source, T1-CONS-5).
    const articlesB1 = articlesBloc1(propres.b1_comprehension || '', dceContext);
    const rendu = await this.rendreDepuisSections(propres, dossierId, { onProgress, cover, schemas: schemasGeneres, ajouts, theme, plan, titresSchemas, articlesBloc1: articlesB1 });
    // Page de schéma prévue et absente du document rendu (moteur de schémas indisponible ou hors délai, schéma refusé :
    // T6-COH-4, T6N-6) : signalée à GSS, compréhension du besoin en tête (consigne 3, D4). Rien n'est imprimé dans le mémoire.
    const alertesSchemas = rubriquesSansSchema(plan, ajouts, propres, rendu.schemas).map((r) => `Rubrique « ${r.titre} » : le schéma${r.besoin ? ' de process' : ''} n'a pas pu être dessiné (moteur de schémas indisponible ou schéma refusé) ; la page de schéma manque dans le mémoire. Relancez la génération, ou demandez le schéma via l'assistant, avant la remise.`);
    // Rubrique imprimée sur plus de 2 pages de texte avant son schéma (consignes 3 et 6, T3-CONS-1) : signalée à GSS (le bloc 1
    // l'est déjà s'il dépassait avant le rendu).
    for (const titre of rendu.rubriquesLongues || []) {
      const r = plan.rubriques.find((x) => normaliser(x.titre).replace(/[^a-z0-9]+/g, ' ').trim() === normaliser(titre).replace(/[^a-z0-9]+/g, ' ').trim());
      const nom = r?.titre || titre;
      if (!consultationList.some((x) => x.startsWith(`Rubrique « ${nom} » : le texte occupe plus de 2 pages`))) consultationList.unshift(`Rubrique « ${nom} » : le texte occupe plus de 2 pages avant son schéma (consigne : 1 à 2 pages d'explication) ; à raccourcir via l'assistant avant la remise.`);
    }
    // Une seule alerte par page de schéma du bloc 1 (T4N-1, becquerel 1401 : deux alertes pour la même page manquante) : les
    // avis émis avant le rendu sur le schéma de process du bloc 1 sont retirés ; celui du rendu (page absente) reste seul, et
    // aucun n'est gardé quand le rendu a construit la page.
    if (b1) for (let i = consultationList.length - 1; i >= 0; i--) {
      if (consultationList[i].startsWith(`Rubrique « ${b1.titre} » : le schéma de process reprenait une exigence`)
        || (!rendu.schemas.has(CLE_SCHEMA(b1.id)) && consultationList[i].startsWith(`Rubrique « ${b1.titre} » : le schéma de process n'a pas pu être construit`))) consultationList.splice(i, 1);
    }
    if (alertesSchemas.length) {
      console.warn(`[MemoireGenerator] ${alertesSchemas.length} rubrique(s) sans page de schéma dans le document rendu.`);
      consultationList.unshift(...alertesSchemas);
    }

    // ── 12. État v2 (assistant, complétion) ; premier message de l'assistant : les propositions à valider ──
    const etat: EtatCompletion = {
      dossierId, mode: 'libre', fichier: rendu.filePath, majLe: '', elements: elementsLibres, reponsesTraitees: [],
      // Valeurs des schémas « spec » gardées : un schéma est redessiné quand GSS change ces valeurs (effectifs, T10N-2).
      libre: { sections, schemas: Object.fromEntries(rendu.schemas), cover: rendu.cover, theme, version: 2, plan, titresSchemas, articlesBloc1: articlesB1, ajouts, indicateurs: indicateursVrais(prep.etatsIndicateurs), variablesSchemas: variablesDesSchemas(mt, prep.variables) },
      demande: this.demandeParticuliere?.demande || undefined,
      ...(this.dimensionnementEtat ? { dimensionnement: this.dimensionnementEtat } : {}),
    };
    if (ajouts.some((x) => !x.emplacementRC)) {
      try {
        const { pageDe } = await import('./assistant_memoire');
        const texte = messagePropositions(ajouts.filter((x) => !x.emplacementRC).map((a) => ({ titre: a.title, page: pageDe(rendu.filePath, a.title) })));
        etat.conversation = [{ role: 'assistant', texte, date: new Date().toISOString() }];
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Message des propositions non préparé (${e?.message || e}).`);
      }
    }
    // Rédaction automatique indisponible (T5-COH-2) : en tête du premier message de l'assistant.
    if (alertePanne) {
      if (etat.conversation?.length) etat.conversation[0].texte = `${alertePanne}\n\n${etat.conversation[0].texte}`;
      else etat.conversation = [{ role: 'assistant', texte: alertePanne, date: new Date().toISOString() }];
    }
    // Pages de schéma manquantes (T6-COH-4, T6N-6) : en tête du premier message de l'assistant.
    if (alertesSchemas.length) {
      const texteSchemas = `Schémas manquants dans le mémoire (${alertesSchemas.length}) :\n${alertesSchemas.map((x) => `- ${x}`).join('\n')}`;
      if (etat.conversation?.length) etat.conversation[0].texte = `${texteSchemas}\n\n${etat.conversation[0].texte}`;
      else etat.conversation = [{ role: 'assistant', texte: texteSchemas, date: new Date().toISOString() }];
    }
    // Engagements rédigés par l'IA (exigences du CCTP), y compris les phrases ajoutées par l'adaptation : annoncés dans le
    // premier message, à valider ou modifier (D5, T5N-5).
    if (engagementsIA.length || ajoutsRestes.length) {
      const texteEng = [messageEngagements(engagementsIA.map((x) => ({ titre: titreDe(x.id), n: x.n }))), messageAjoutsAdaptation(ajoutsRestes.map((a) => ({ titre: titreDe(a.id), phrase: a.phrase })))].filter(Boolean).join('\n\n');
      if (etat.conversation?.length) etat.conversation[0].texte = `${etat.conversation[0].texte}\n\n${texteEng}`;
      else etat.conversation = [{ role: 'assistant', texte: texteEng, date: new Date().toISOString() }];
    }
    // Phrases de GSS adaptées au CCTP (D8) : annoncées dans le premier message, à valider, modifier ou rétablir.
    const texteAdaptations = messageAdaptations(adaptations);
    if (texteAdaptations) {
      if (etat.conversation?.length) etat.conversation[0].texte = `${etat.conversation[0].texte}\n\n${texteAdaptations}`;
      else etat.conversation = [{ role: 'assistant', texte: texteAdaptations, date: new Date().toISOString() }];
    }
    if (adaptations.length) etat.adaptations = adaptations;
    // Dimensionnement proposé (D5) : annoncé dans le premier message de l'assistant, à valider ou modifier.
    if (ctxBase.dimensionnement?.titulaires) {
      const texteDim = `${messageDimensionnement(ctxBase.dimensionnement)}`;
      if (etat.conversation?.length) etat.conversation[0].texte = `${etat.conversation[0].texte}\n\n${texteDim}`;
      else etat.conversation = [{ role: 'assistant', texte: texteDim, date: new Date().toISOString() }];
    }
    try {
      etat.elements = elementsSansDoublon(etat.elements);
      ecrireEtat(etat);
    } catch (e: any) {
      console.warn(`[MemoireGenerator] État de complétion non enregistré (non bloquant) : ${e?.message || e}`);
    }
    const generatedData: Record<string, string> = {};
    consultationList.forEach((c, i) => { generatedData[`⚠ Consultation requise #${i + 1}`] = c; });
    return { filePath: rendu.filePath, generatedData, consultations: consultationList };
  }

  /**
   * Cadre de réponse imposé : textes du mémoire type publipostés pour ce marché (sans modèle : nom de l'acheteur,
   * sites, valeurs du registre ; rubrique « besoin » exclue) et proximité sémantique (embeddings) de chaque question
   * développée avec chaque rubrique. null si le mémoire type est désactivé (GSS_MEMOIRE_TYPE=non) ou illisible : le
   * cadre est alors rempli exactement comme avant.
   */
  private async textesMemoireTypeCadre(
    dossierId: string,
    analysisData: any,
    dceContext: string,
    referents: string,
    descriptors: Array<{ id: number; context: string; kind: string }>,
    buildPrompt: (f: any) => string,
    dimensionnement?: Dimensionnement | null,
  ): Promise<{
    mt: MemoireType; textes: Record<string, string>; scores: Map<number, Record<string, number>>; prep: MemoirePrepare; ctx: ContexteMarche;
    echeances?: Record<string, string[]>;
    /** Question exacte de chaque « [À COMPLÉTER] » des textes publipostés, par rubrique (T7CS-3). */
    emplacements?: Record<string, Array<{ contexte: string; question: string }>>;
    schemaDe: (ids: string[]) => { id: string; ref?: string; spec?: { gabarit: string; params: any; titre: string }; alternative?: string } | undefined;
  } | null> {
    const mt = this.memoireTypeV2();
    if (!mt) return null;
    try {
      const cover = await this.getCoverInfo(dossierId, analysisData);
      const horsNormandie = marcheHorsNormandie(analysisData, dceContext);
      const ctx: ContexteMarche = { analyse: analysisData, dce: dceContext, cover, referents, horsNormandie, dimensionnement };
      const prep = preparerMemoireType(ctx, { memoireType: mt });
      const textes: Record<string, string> = {};
      const publiees = publierMemoire(prep);
      for (const p of publiees) if (p.texte && p.mode !== 'besoin') textes[p.id] = p.texte;
      // Même question que pour la recherche lexicale (consigne de forme remplacée par le sujet du champ).
      const question = (d: { context: string }) => questionUtileChamp(d.context);
      const developpees = descriptors.filter((d) => d.kind !== 'checkbox' && buildPrompt(d).includes('[PARAGRAPHE]') && question(d));
      const scores = new Map<number, Record<string, number>>();
      if (developpees.length) {
        try {
          const ids = Object.keys(textes);
          const embs = await this.embedTexts([...ids.map((id) => signatureRubrique(mt.rubriques.find((r) => r.id === id)!)), ...developpees.map(question)]);
          developpees.forEach((d, i) => {
            const v = embs[ids.length + i];
            scores.set(d.id, Object.fromEntries(ids.map((id, k) => [id, cosinus(v, embs[k])])));
          });
        } catch (e: any) {
          console.warn(`[MemoireGenerator] Mémoire type (cadre) : recherche sémantique indisponible (${e?.message || e}) → recherche par mots-clés.`);
        }
      }
      // Schéma de la première rubrique reprise qui en a un : bibliothèque GSS, ou spécification publipostée (avec son
      // schéma de remplacement de la bibliothèque, si le mémoire type en prévoit un).
      const schemaDe = (ids: string[]) => {
        for (const id of ids) {
          const r = mt.rubriques.find((x) => x.id === id);
          const s = publiees.find((p) => p.id === id)?.schema || r?.schema;
          if (s?.source === 'bibliotheque' && s.ref) return { id, ref: s.ref };
          if (s?.source === 'spec' && s.gabarit && s.params) {
            const alt = r?.schema?.alternative;
            return { id, spec: { gabarit: s.gabarit, params: s.params, titre: r?.titre || id }, alternative: alt?.source === 'bibliotheque' && alt.ref ? alt.ref : undefined };
          }
        }
        return undefined;
      };
      console.log(`[MemoireGenerator] Mémoire type (cadre) : ${Object.keys(textes).length} rubrique(s) publipostée(s) pour ${developpees.length} réponse(s) développée(s).`);
      // Échéances dépassées du texte de GSS (assurance, ISO) : questions posées si la rubrique est reprise (T6-COH-6).
      const echeances: Record<string, string[]> = {};
      for (const p of publiees) { const q = p.aConfirmer.filter((x) => x.variable.startsWith('echeance:')).map((x) => x.question); if (q.length) echeances[p.id] = q; }
      const emplacements: Record<string, Array<{ contexte: string; question: string }>> = {};
      for (const p of publiees) if (p.texte && /\[À COMPLÉTER\]/.test(p.texte)) emplacements[p.id] = questionsPubliposteParEmplacement(p.texte, p.manquantes);
      return { mt, textes, scores, schemaDe, prep, ctx, echeances, emplacements };
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Mémoire type (cadre) indisponible (${e?.message || e}) : cadre rempli sans texte de référence.`);
      return null;
    }
  }

  /**
   * Bloc « Notre compréhension de votre besoin » (consigne 3 du dirigeant : « qu'est-ce que tu as compris de mon
   * besoin ? ») : 1 à 2 pages d'explication rédigées depuis le CCTP (contexte, périmètre, attentes et engagements, points
   * de vigilance), puis 1 schéma de process (étapes de la même réponse, dessinées par le moteur sans nouvel appel et
   * contrôlées : chaque mot et chaque chiffre du schéma figurent dans le texte). Schéma refusé : une correction des
   * seules étapes, puis les sous-titres du texte en phases ; modèle indisponible : texte de secours (faits du DCE).
   */
  private async redigerComprehension(
    prep: MemoirePrepare,
    ctx: ContexteMarche,
    besoin: DonneesBesoin,
    o: { perimetre?: string; exigences?: ExigenceMatrice[]; remarques?: string; analyse?: string; demande?: string; format?: 'page' | 'paysage'; sansSommaire?: boolean },
  ): Promise<{ texte: string; titre: string; svg?: string; secours: boolean; formalites: string[] }> {
    const titreDefaut = prep.mt.rubriques.find((r) => r.mode === 'besoin')?.schema?.titre || 'Votre besoin, notre réponse en un process';
    let formalites: string[] = [];
    const messages = consigneComprehension(besoin, {
      // Cadre imposé (T1-COH-4) : jamais les rubriques du mémoire type comme renvois, elles ne sont pas des parties du cadre.
      perimetre: o.perimetre, exigences: o.exigences, remarques: o.remarques, sommaire: o.sansSommaire ? undefined : sommaireProcess(prep.plan), analyse: o.analyse,
      dce: dceCctpDAbord(String(ctx.dce || ''), 60_000), demande: o.demande, motsMin: o.remarques ? 350 : 400, motsMax: o.remarques ? 600 : 700,
    });
    let rep: any = null;
    let brut = '';
    for (let essai = 1; essai <= 2 && !(String(rep?.texte || '').split(/\s+/).length >= 150); essai++) {
      brut = (await this.callOpenAI(messages, 0.3, `Compréhension du besoin${essai > 1 ? ` (essai ${essai})` : ''}`, true, 'analyse', 0)) || '';
      rep = lireJson(brut);
    }
    // Typographie des données du DCE (« 05H30 », « Ronde d'Ouverture », T5-CONS-10) : texte et étapes du schéma.
    let texte = typographieDce(String(rep?.texte || '').replace(/^#\s+.*\n+/, '').trim());
    if (Array.isArray(rep?.etapes)) for (const e of rep.etapes) if (e && typeof e === 'object') { if (typeof e.titre === 'string') e.titre = typographieDce(e.titre); if (typeof e.texte === 'string') e.texte = typographieDce(e.texte); }
    const secours = texte.split(/\s+/).length < 150;
    if (secours) {
      console.warn('[MemoireGenerator] Compréhension du besoin : rédaction indisponible → texte de secours (faits du DCE).');
      texte = texteSecoursBesoin(besoin, o.perimetre);
    }
    // Minimum de la compréhension (consigne 3) : 4 attentes et 3 points de vigilance, complétés depuis les exigences
    // du DCE (sanctionnées d'abord) quand la rédaction en donne moins.
    {
      // Sans matrice, les obligations chiffrées du CCTP passent par les mêmes contrôles que dans le texte de secours (T8CS-1).
      const sources = (o.exigences || []).length ? o.exigences! : obligationsLisibles(besoin.obligations).map((x) => ({ exigence: x }));
      // Méta-commentaires retirés d'abord (retirés de toute façon au nettoyage final) : le minimum compte les puces remises.
      texte = retirerCommentairesInternes(texte).texte;
      // Citation du CCTP sans rapport avec le contenu de sa puce : retirée, la puce reste (génération réelle ign 14).
      const cit = citationsCoherentes(texte);
      if (cit.retirees) console.log(`[MemoireGenerator] Compréhension du besoin : ${cit.retirees} citation(s) du CCTP sans rapport avec leur puce retirée(s).`);
      texte = cit.texte;
      // Redites du chapeau, durée inconnue écrite « [À COMPLÉTER] », renvois au mauvais bloc (fontainebleau 21).
      const nb = nettoyerBloc1(texte, prep.plan, besoin.duree, Array.isArray(rep?.etapes) ? rep.etapes : []);
      if (nb.retirees.length || nb.renvois) console.log(`[MemoireGenerator] Compréhension du besoin : ${nb.retirees.length} redite(s) ou phrase(s) sans donnée retirée(s), ${nb.renvois} renvoi(s) de bloc corrigé(s).`);
      texte = nb.texte;
      // Formalité de l'offre (« Visite obligatoire ») : jamais une attente ni un point de vigilance renvoyé à une rubrique qui
      // n'en parle pas ; posée à GSS (T6-CONS-12). Retirée avant le minimum, qui complète depuis les exigences du DCE.
      const fo = formalitesDuBloc1(texte);
      texte = fo.texte;
      formalites = fo.formalites;
      const m = completerBesoinMinimum(texte, sources, prep.plan, String(ctx.dce || ''));
      if (m.ajoutees) {
        texte = m.texte;
        console.log(`[MemoireGenerator] Compréhension du besoin : ${m.ajoutees} attente(s) ou point(s) de vigilance ajouté(s) depuis les exigences du DCE (minimum 4 et 3).`);
      }
      // Libellés génériques (« Point de vigilance : ») remplacés par le nom du point ; titres de rubrique cités en gras au
      // milieu d'une phrase écrits entre guillemets (T4N-8, T4C-1).
      texte = libellesBloc1(texte);
    }
    // Titre du schéma écrit par le modèle : sans point final (D11, T4-CONS-11).
    const titre = titreSansPointFinal(court(rep?.titre_schema, 70)) || titreDefaut;
    let titreFinal = titre;
    // Schéma de process : étapes de la réponse, puis correction des seules étapes, puis sous-titres du texte en phases.
    const dessiner = async (spec: { gabarit: string; params: any } | null): Promise<{ svg?: string; erreurs: string[] }> => {
      if (!spec) return { erreurs: ['étapes absentes ou incomplètes'] };
      const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: texte, titre_section: titreFinal }], o.format || 'page')).get('b1_comprehension');
      return r?.ok ? { svg: r.svg, erreurs: [] } : { erreurs: r?.erreurs || ['moteur de schémas indisponible'] };
    };
    // Étapes sans contenu propre au marché (titre « Votre besoin », « … nous consulte pour le marché », « Le PC réalise
    // les rondes ») : refusées comme un schéma invalide (correction des seules étapes, puis schéma de secours).
    // Étapes du modèle : défauts de fond, puis anomalies de forme (étape vide ou tronquée, texte qui redit le titre, titres
    // quasi identiques, renvoi « bloc n ») ; une dernière étape qui dit un moyen est complétée d'une étape « Votre
    // résultat » tirée du texte au lieu de refuser tout le schéma (génération réelle cstb 221).
    const etapesRecevables = (etapes: any): { etapes: any; defauts: string[] } => {
      let d = defautsEtapesBesoin(etapes, { texte, sites: besoin.sites, dce: String(ctx.dce || '') });
      const completees = completerResultatBesoin(etapes, texte, d);
      // (seul défaut des étapes du modèle : la dernière étape ; l'étape ajoutée « Votre résultat » est le vocabulaire du moteur)
      if (completees) { etapes = completees; d = []; }
      const spec = d.length ? null : specProcessBesoin(etapes, 'flux');
      const anomalies = d.length ? d : spec ? anomaliesSchemaBloc1(spec) : ['étapes absentes ou incomplètes'];
      // Anomalies de forme qui ne portent que sur la dernière étape (caen 475 : « étape 5 « Continuité des prestations » : le
      // texte redit le titre ») : étape remplacée par « Votre résultat » tiré du texte, au lieu de refuser tout le schéma (T4N-7).
      if (!d.length && spec && anomalies.length) {
        const derniere = completerResultatBesoin(spec.params.etapes, texte, anomalies);
        const spec2 = derniere ? specProcessBesoin(derniere, 'flux') : null;
        if (spec2 && !anomaliesSchemaBloc1(spec2).length) return { etapes: derniere, defauts: [] };
      }
      return { etapes, defauts: anomalies };
    };
    const initiales = secours ? { etapes: null, defauts: [] as string[] } : etapesRecevables(rep?.etapes);
    const defautsInitiaux = initiales.defauts;
    let schema = secours ? { erreurs: ['texte de secours'] } as { svg?: string; erreurs: string[] }
      : defautsInitiaux.length ? { erreurs: defautsInitiaux } : await dessiner(specProcessBesoin(initiales.etapes, 'flux'));
    /** Étapes du modèle (première réponse et correction) et étapes du schéma dessiné (T5CP-9). */
    const etapesModele: Array<{ texte?: string }> = Array.isArray(rep?.etapes) ? [...rep.etapes] : [];
    let etapesDessinees: any[] | null = schema.svg ? initiales.etapes : null;
    // Deux corrections au plus des seules étapes (générations réelles du 3 octobre 2026 : 3 schémas de process sur 4 refusés
    // après une seule correction, « rennais », « doit », étapes qui recopient la conclusion) avant les schémas de secours.
    if (!schema.svg && !secours && brut) {
      const echanges: Array<{ role: 'assistant' | 'user'; content: string }> = [{ role: 'assistant', content: brut }];
      for (let essai = 0; essai < 2 && !schema.svg; essai++) {
        echanges.push({ role: 'user', content: `Le schéma de process est refusé :\n- ${schema.erreurs.slice(0, 8).join('\n- ')}\nCorrige SEULEMENT les étapes (4 ou 5, dernière étape verte) en recopiant des mots EXACTS de ton texte (même orthographe, mêmes accords), sans aucun chiffre absent du texte. Renvoie UNIQUEMENT {"etapes": [{"titre": "…", "texte": "…", "role": "…"}]}.` });
        const correction = await this.callOpenAI([...messages, ...echanges], 0.2, 'Compréhension du besoin : schéma corrigé', true, 'redaction', 0);
        if (!correction) break;
        echanges.push({ role: 'assistant', content: correction });
        const corrigees = etapesRecevables(lireJson(correction || '')?.etapes);
        if (Array.isArray(corrigees.etapes)) etapesModele.push(...corrigees.etapes);
        schema = corrigees.defauts.length ? { erreurs: corrigees.defauts } : await dessiner(specProcessBesoin(corrigees.etapes, 'flux'));
        if (schema.svg) etapesDessinees = corrigees.etapes;
      }
    }
    // Paragraphe fait des seuls textes d'étapes non retenues (cstb 551, T5CP-9) : retiré avant les schémas de secours ; après un
    // schéma dessiné sur d'autres étapes, retiré seulement si ce schéma reste valide sur le texte sans lui.
    {
      const r = retirerParagrapheEtapes(texte, etapesModele, etapesDessinees || []);
      if (r.retire) {
        const valide = !schema.svg || !etapesDessinees ? true : !!(await dessiner(specProcessBesoin(etapesDessinees, 'flux')).then((x) => x.svg).catch(() => undefined));
        if (valide) { texte = r.texte; console.log(`[MemoireGenerator] Compréhension du besoin : paragraphe des textes d'étapes non retenues retiré (« ${r.retire.slice(0, 80)}… »).`); }
      }
    }
    if (!schema.svg) console.warn(`[MemoireGenerator] Compréhension du besoin : étapes du schéma refusées (${schema.erreurs.slice(0, 3).join(' | ')}) ; schéma de secours d'après le périmètre, les attentes et les points de vigilance.`);
    // Secours sur le contenu : d'abord le périmètre du DCE (postes et horaires), puis les attentes et les points de vigilance
    // (caen 475, T6C-6 : un marché de rondes dont le schéma ne montrait aucune ronde) ; sinon attentes et vigilance seules.
    // Le titre de la page est alors celui du mémoire type : jamais le titre que le modèle avait donné à ses étapes refusées
    // (« Des rondes suivies, des alarmes tracées… » au-dessus de cartes qui n'en parlaient pas).
    if (!schema.svg) {
      titreFinal = titreDefaut;
      schema = await dessiner(specSecoursBesoin(texte, (x) => phraseDeRubriqueGss(this.memoireTypeV2(), x)));
      if (!schema.svg) schema = await dessiner(specSecoursPuces(texte, (x) => phraseDeRubriqueGss(this.memoireTypeV2(), x)));
      // Dernier secours (T10C-4) : les obligations chiffrées citées dans « Vos attentes », sinon les prestations du périmètre.
      if (!schema.svg) schema = await dessiner(specSecoursObligations(texte));
    }
    if (!schema.svg) console.warn(`[MemoireGenerator] Compréhension du besoin : schéma de process non dessiné (${schema.erreurs.slice(0, 3).join(' | ')}) ${o.format === 'paysage' ? '' : ' ; en réponse libre, construit au rendu d\'après le texte'}.`);
    return { texte, titre: titreFinal, svg: schema.svg, secours, formalites };
  }

  /**
   * Proposition de réponse de l'IA à une question nouvelle du DCE (sujet que le mémoire type ne traite pas) : 250 à
   * 450 mots, appuyés sur les réponses déjà rédigées par GSS, sa documentation et son registre ; une donnée inconnue
   * reste « [À COMPLÉTER] » avec sa question. null si le modèle n'a pas répondu.
   */
  private async proposerReponse(
    g: GroupeNouveau,
    o: { client?: string; bloc?: string; perimetre?: string; horsNormandie?: boolean; analyse?: string; registre?: string; gssDocs: Record<string, string>; availableCategories: string[]; demande?: string; dce?: string },
  ): Promise<{ titre: string; texte: string; acheteurs: string[]; questions: string[] } | null> {
    const requete = `${g.sujet}. ${g.exigences.map((e) => e.exigence).join(' ')}`.slice(0, 2000);
    let memoires = '';
    try {
      const [emb] = await this.embedTexts([requete]);
      memoires = blocMemoires(rechercherMemoires(emb, 6, requete, 2));
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Proposition « ${g.sujet} » : recherche dans les mémoires GSS indisponible (${e?.message || e}).`);
    }
    const doc = this.matchGssCategories(g.sujet, o.availableCategories).slice(0, 3)
      .map((c) => `=== Doc GSS : ${c} ===\n${(o.gssDocs[c] || '').slice(0, 3000)}`).join('\n\n');
    const messages = consigneProposition(g, {
      client: o.client, bloc: o.bloc, perimetre: o.perimetre, horsNormandie: o.horsNormandie, analyse: o.analyse,
      regles: REGLES_REUTILISATION, sources: [memoires.trim(), doc, (o.registre || '').trim(), o.demande ? `DEMANDE PARTICULIÈRE DE GSS POUR CE MÉMOIRE (prioritaire ; ses informations sont des données valables) :\n${o.demande}` : ''].filter(Boolean).join('\n\n'),
    });
    const brut = (await this.callOpenAI(messages, 0.3, `Proposition de réponse : ${g.sujet}`, true, 'analyse', 0)) || '';
    let rep = lireJson(brut);
    let texte = String(rep?.texte || '').replace(/^#\s+.*\n+/, '').trim();
    if (texte.split(/\s+/).length < 80) {
      console.warn(`[MemoireGenerator] Proposition « ${g.sujet} » non rédigée (réponse du modèle vide ou trop courte).`);
      return null;
    }
    // Garde-fou : un ancien acheteur de GSS repris des anciens mémoires (destinataire d'une autre réponse) → une
    // relance ; s'il reste cité, la proposition est gardée et GSS est prévenu (consultations).
    let acheteurs = acheteursCites(texte, o.client);
    if (acheteurs.length) {
      const corrige = lireJson((await this.callOpenAI([
        ...messages,
        { role: 'assistant', content: brut },
        // « sur le marché de … » réservé aux références validées de GSS (T1F-14) : un ancien acheteur n'est jamais présenté
        // comme une référence.
        { role: 'user', content: `Ta réponse cite ${acheteurs.map((a) => `« ${a} »`).join(', ')}, acheteur(s) d'anciens mémoires de GSS, qui ne sont pas des références validées de GSS. Elle s'adresse à ${o.client || 'ce nouveau client'} : remplace ce nom par le nouveau client quand il désigne le destinataire, sinon retire la phrase qui le cite. N'écris « sur le marché de … » que pour une de ces références de GSS : ${motifsReferences().map((r) => r.nom).join(', ') || 'aucune'}. Ne change rien d'autre. Renvoie le même objet JSON.` },
      ], 0.2, `Proposition de réponse : ${g.sujet} (ancien acheteur)`, true, 'analyse', 0)) || '');
      const texte2 = String(corrige?.texte || '').replace(/^#\s+.*\n+/, '').trim();
      if (texte2.split(/\s+/).length >= 80) {
        rep = { ...rep, ...corrige, titre: corrige?.titre || rep?.titre };
        texte = texte2;
        acheteurs = acheteursCites(texte, o.client);
      }
      // Ancien acheteur toujours cité (T1-CONS-3, T1F-14 : « Sur le marché de la CAF du Val-de-Marne, les équipes GSS
      // vérifient déjà… » imprimé au mémoire de l'EPCF) : ses phrases sont retirées, jamais imprimées ; GSS est prévenu.
      if (acheteurs.length) {
        const avant = texte;
        texte = sansAnciensAcheteurs(texte, o.client);
        console.warn(`[MemoireGenerator] Proposition « ${g.sujet} » : ancien(s) acheteur(s) cité(s) (${acheteurs.join(', ')}) : ${avant === texte ? 'aucune phrase retirée' : 'phrase(s) retirée(s)'}, signalé à GSS.`);
      }
    }
    // Contrôle sans modèle : sous-traitance ou intérim (même au conditionnel), amorce « … si : [À COMPLÉTER] », montant
    // de garantie qui n'est pas celui du registre de GSS (parc_expo 202) : phrases retirées, écart demandé à GSS.
    const ctrl = controlerProposition(texte, montantsRegistre(), o.dce || '');
    if (ctrl.retirees.length) console.log(`[MemoireGenerator] Proposition « ${g.sujet} » : ${ctrl.retirees.length} phrase(s) retirée(s) (sous-traitance, amorce sans objet ou garantie qui n'est pas celle de GSS).`);
    texte = ctrl.texte;
    // Donnée demandée à GSS alors que le DCE l'écrit (T7CS-6) : la référence du DCE à sa place, sinon question à l'acheteur.
    if (o.dce) {
      const d = consultationsDuDce(texte, o.dce);
      if (d.remplacees.length) console.log(`[MemoireGenerator] Proposition « ${g.sujet} » : ${d.remplacees.length} donnée(s) du DCE écrite(s) à la place d'une question à GSS.`);
      texte = d.texte;
    }
    if (texte.split(/\s+/).length < 60) {
      console.warn(`[MemoireGenerator] Proposition « ${g.sujet} » non retenue (trop courte après contrôle).`);
      return null;
    }
    const titre = court(rep?.titre, 80) || `${g.sujet.charAt(0).toUpperCase()}${g.sujet.slice(1)}`;
    return { titre, texte, acheteurs, questions: ctrl.questions };
  }

  /**
   * Schémas des rubriques du mémoire type, dessinés SANS modèle : bibliothèque GSS redessinée au thème (format page),
   * spécification du mémoire type publipostée (contrôlée sur le texte final de la rubrique : un chiffre changé par
   * l'adaptation la fait refuser ; alors schéma de remplacement du mémoire type, sinon schéma construit au rendu
   * d'après le texte), organigramme de référence. Complète `schemas` (clé « id#schema ») et `titres`.
   */
  private async schemasMemoireType(
    plan: PlanMemoireType,
    mt: MemoireType,
    publiees: RubriquePubliee[],
    textes: Record<string, string>,
    schemas: Map<string, string>,
    titres: Record<string, string>,
    theme: string,
  ): Promise<void> {
    const presentes = plan.rubriques.filter((r) => (textes[r.id] || '').trim() && !schemas.has(CLE_SCHEMA(r.id)));
    const schemaDe = (id: string) => publiees.find((p) => p.id === id)?.schema || null;
    // Spécifications du mémoire type.
    const specs = presentes.map((r) => ({ r, s: schemaDe(r.id) })).filter((x) => x.s?.source === 'spec' && x.s.gabarit && x.s.params)
      // Schéma aligné sur la phrase adaptée au CCTP (T3-CONS-11) : jamais une durée du texte de GSS que le texte final a remplacée.
      .map(({ r, s }) => {
        const a = alignerSchemaSurTexte(s!.params, publiees.find((p) => p.id === r.id)?.texte || '', textes[r.id] || '');
        if (a.changees.length) console.log(`[MemoireGenerator] Schéma de ${r.id} aligné sur le texte adapté : ${a.changees.map((c) => `« ${c.avant} » → « ${c.apres} »`).join(' ; ')}.`);
        return { r, s: a.changees.length ? { ...s!, params: a.params } : s };
      });
    const dessins = await dessinerSpecs(specs.map(({ r, s }) => ({ id: r.id, gabarit: s!.gabarit, params: s!.params, source: textes[r.id], titre_section: r.titre })), 'page', theme);
    const remplacements: Array<{ id: string; ref: string }> = [];
    for (const { r, s } of specs) {
      const d = dessins.get(r.id);
      if (d?.ok && d.svg) {
        schemas.set(CLE_SCHEMA(r.id), d.svg);
        titres[r.id] ||= s!.titre || titreSchemaMemoireType(r.id, mt) || r.titre;
        continue;
      }
      const alt = mt.rubriques.find((x) => x.id === r.id)?.schema?.alternative;
      console.warn(`[MemoireGenerator] Schéma de ${r.id} refusé par le moteur (${(d?.erreurs || ['moteur indisponible']).slice(0, 2).join(' | ')})${alt?.ref ? ` : schéma ${alt.ref} de la bibliothèque` : ' : construction d\'après le texte tentée au rendu'}.`);
      if (alt?.source === 'bibliotheque' && alt.ref) remplacements.push({ id: r.id, ref: alt.ref });
    }
    // Bibliothèque GSS (et schémas de remplacement) redessinée au thème, format page.
    const biblio = [
      ...presentes.filter((r) => schemaDe(r.id)?.source === 'bibliotheque' && schemaDe(r.id)?.ref).map((r) => ({ id: r.id, ref: schemaDe(r.id)!.ref! })),
      ...remplacements,
    ];
    if (biblio.length) {
      const svgs = schemasBibliotheque(biblio.map((b) => b.ref), 'page', theme, plan.vocabulaireSchemas || []);
      const index = new Map<string, string>();
      try {
        for (const x of JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../python/schemas_gss/bibliotheque/index.json'), 'utf-8'))) index.set(String(x.id), String(x.titre || ''));
      } catch { /* titres de la bibliothèque indisponibles : titre de la rubrique */ }
      for (const b of biblio) {
        const svg = svgs.get(b.ref);
        if (!svg) continue;
        // Fréquence écrite dans le schéma de la bibliothèque (IV-QUA-04 : « Mensuelles ou trimestrielles ») absente du texte
        // final de la rubrique (fréquence du CCTP) : le schéma contredirait le texte ; il est construit d'après le texte au
        // rendu (T5CP-8).
        const ecart = frequencesAbsentes(svg, textes[b.id] || '');
        if (ecart.length) { console.warn(`[MemoireGenerator] Schéma ${b.ref} de ${b.id} écarté : fréquence « ${ecart.join(', ')} » absente du texte de la rubrique ; schéma construit d'après le texte.`); continue; }
        schemas.set(CLE_SCHEMA(b.id), finaliserSvg(svg, `b${b.id}`));
        titres[b.id] ||= index.get(b.ref) || plan.rubriques.find((r) => r.id === b.id)?.titre || '';
      }
    }
    // Organigramme de référence (annuaire « Personnes » et registre), format page.
    for (const r of presentes.filter((x) => schemaDe(x.id)?.source === 'organigramme')) {
      const svg = organigrammeSvg('page', theme);
      if (svg) {
        schemas.set(CLE_SCHEMA(r.id), finaliserSvg(svg, `o${r.id}`));
        titres[r.id] ||= titreSchemaMemoireType(r.id, mt) || 'Notre organigramme';
      }
    }
    const n = plan.rubriques.filter((r) => schemas.has(CLE_SCHEMA(r.id))).length;
    console.log(`[MemoireGenerator] Schémas du mémoire type : ${n} page(s) de schéma dessinée(s) sans modèle ou à la génération (${specs.length} spécification(s), ${biblio.length} de la bibliothèque).`);
  }

  /**
   * Rendu de la réponse libre v2 : sommaire et ouvertures des blocs du plan, puis, pour chaque rubrique, 1 à 2 pages
   * de texte et 1 page de schéma (1 schéma = 1 page, en grand). Les schémas viennent de l'état ou de la génération
   * (clé « id#schema ») ; ceux qui manquent sont redessinés sans modèle quand le mémoire type les fixe (bibliothèque,
   * organigramme), sinon construits d'après le texte de la rubrique (rubriques ajoutées, propositions, schéma de
   * process ou spécification indisponibles), sans schéma de la bibliothèque d'un autre sujet. Pages « Ils nous font
   * confiance » : seulement si le plan n'a pas ses propres rubriques de références (bloc Présentation).
   */
  private async rendreDepuisSectionsV2(
    sectionsMap: Record<string, string>,
    dossierId: string,
    plan: PlanMemoireType,
    opts: { onProgress?: (progress: number, message: string) => void; schemas?: Map<string, string>; cover?: any; ajouts?: AjoutLibre[]; photos?: Record<string, Array<{ chemin: string; legende?: string }>>; titresSchemas?: Record<string, string>; articlesBloc1?: Record<string, string> },
    theme: string,
  ): Promise<{ filePath: string; schemas: Map<string, string>; cover: any; rubriquesLongues?: string[] }> {
    this.verifierCredit();
    const onProgress = opts.onProgress;
    const blocs = rubriquesV2(plan, opts.ajouts || []);
    const avecTexte = (id: string) => !!(sectionsMap[id] || '').trim();
    const presentes = blocs.flatMap((b) => b.rubriques).filter((r) => avecTexte(r.id));
    if (!presentes.length) throw new Error('Aucune section générée à exporter (map vide ou ids inconnus).');
    const cover = opts.cover ?? await this.getCoverInfo(dossierId);
    actualiserOrganigramme(await this.getGssReferents());

    onProgress?.(91, 'Pages de schéma (1 schéma par rubrique)…');
    const schemas = new Map<string, string>();
    for (const r of presentes) {
      const svg = opts.schemas?.get(CLE_SCHEMA(r.id));
      if (svg) schemas.set(CLE_SCHEMA(r.id), svg);
    }
    const sourceDe = (id: string) => plan.rubriques.find((r) => r.id === id)?.schema || null;
    const manquantes = presentes.filter((r) => !schemas.has(CLE_SCHEMA(r.id)));
    const biblio = manquantes.filter((r) => sourceDe(r.id)?.source === 'bibliotheque' && sourceDe(r.id)?.ref);
    if (biblio.length) {
      const svgs = schemasBibliotheque(biblio.map((r) => sourceDe(r.id)!.ref!), 'page', theme, plan.vocabulaireSchemas || []);
      for (const r of biblio) {
        const svg = svgs.get(sourceDe(r.id)!.ref!);
        if (svg) schemas.set(CLE_SCHEMA(r.id), finaliserSvg(svg, `b${r.id}`));
      }
    }
    for (const r of manquantes.filter((x) => sourceDe(x.id)?.source === 'organigramme')) {
      const svg = organigrammeSvg('page', theme);
      if (svg) schemas.set(CLE_SCHEMA(r.id), finaliserSvg(svg, `o${r.id}`));
    }
    // Compréhension du besoin sans schéma (T2N-6) : la chaîne de secours du process, jamais une grille de cartes sans ordre ni
    // résultat sous le titre « en un process » ; aucun process possible : pas de page de schéma (signalé à la génération).
    const b1Rendu = presentes.find((r) => plan.rubriques.find((x) => x.id === r.id)?.mode === 'besoin');
    if (b1Rendu && !schemas.has(CLE_SCHEMA(b1Rendu.id))) {
      const svg = await dessinerProcessSecoursBloc1(sectionsMap[b1Rendu.id], b1Rendu.id, opts.titresSchemas?.[b1Rendu.id] || b1Rendu.title, theme, (x) => phraseDeRubriqueGss(this.memoireTypeV2(), x));
      if (svg) schemas.set(CLE_SCHEMA(b1Rendu.id), svg);
    }
    // Rubrique sans schéma prévu par le mémoire type (introduction des références) : pages de texte seules.
    // (élément attendu par le RC réduit à son emplacement, T6-CONS-11 : jamais de schéma construit sur une ligne)
    const aConstruire = presentes.filter((r) => !schemas.has(CLE_SCHEMA(r.id)) && ((r.ajout && !r.ajout.emplacementRC) || sourceDe(r.id)) && r.id !== b1Rendu?.id);
    if (aConstruire.length) {
      const pages: PageSchema[] = aConstruire.map((r) => ({ key: `v2_${r.id}`, sectionId: r.id, sectionTitle: r.title, text: sectionsMap[r.id] }));
      const construits = await new SchemaService().construirePourPages(pages, (msg) => onProgress?.(93, msg), { format: 'page', theme, secours: false });
      for (const p of pages) {
        const svg = construits.get(p.key);
        if (svg) schemas.set(CLE_SCHEMA(p.sectionId!), svg);
      }
    }

    // Titre de page de schéma : jamais de point final, même pour un état enregistré avant la correction (D11, T4-CONS-11).
    const titreSchema = (r: { id: string; title: string; ajout?: AjoutLibre }) =>
      titreSansPointFinal(opts.titresSchemas?.[r.id] || (r.ajout ? r.title : titreSchemaMemoireType(r.id)) || r.title);
    const blocReferences = blocPagesReferences(plan);
    const chapters: AssembleChapter[] = blocs.map((b) => ({
      key: b.cle,
      title: b.titre,
      pagesReferences: b.cle === blocReferences,
      sections: b.rubriques.filter((r) => avecTexte(r.id)).map((r): AssembleSection => {
        const svg = schemas.get(CLE_SCHEMA(r.id));
        return {
          title: r.title,
          text: sectionsMap[r.id],
          id: r.id,
          photos: opts.photos?.[r.id],
          ...(r.id === 'b1_comprehension' && opts.articlesBloc1 ? { articlesBloc1: opts.articlesBloc1 } : {}),
          ...(r.id === 'b1_comprehension' ? { blocsRubriques: Object.fromEntries(blocs.flatMap((b, i) => b.rubriques.map((x) => [x.title, Number((plan.blocs.find((y) => y.cle === b.cle) as any)?.numero) || i + 1] as [string, number]))) } : {}),
          ...(svg ? { schemaPleinePage: { titre: titreSchema(r), svg } } : { texteSeul: true }),
        };
      }),
    }));

    onProgress?.(95, `Rendu du PDF (${schemas.size} page(s) de schéma)…`);
    const generator = new MarpGenerator(this.responseDir);
    const result = await generator.generatePdf(chapters, cover, new Map(), new Map(), { theme });
    return { filePath: result.filePath, schemas, cover, rubriquesLongues: result.rubriquesLongues || [] };
  }

  /**
   * Contrôle de couverture d'une rubrique : chaque exigence du CCTP qui lui est attribuée et qu'elle ne traite pas
   * explicitement devient une puce d'engagement (chiffre exact du CCTP), en fin de rubrique. Étape non bloquante.
   */
  private async completerCouverture(text: string, chapterReqs: any[], sectionId: string, horsNormandie = false, questions?: Set<string>, sources?: Map<string, string>): Promise<string> {
    // Hors Normandie, GSS n'annonce aucun délai qui ne vient pas du CCTP (même règle que le registre, base_memoires.ts).
    const regleDelais = horsNormandie ? ` CE MARCHÉ EST HORS DE NORMANDIE : n'écris AUCUN délai chiffré (astreinte, intervention, remplacement, mobilisation) qui ne figure pas mot pour mot dans l'exigence du CCTP ; jamais un délai repris d'un ancien marché normand (ex. 60 minutes).` : '';
    try {
      const verif = await this.callOpenAI([
        { role: 'system', content: `On te donne le texte d'une rubrique de mémoire technique et une liste numérotée d'exigences du CCTP. Pour chaque exigence qui n'est PAS traitée explicitement dans le texte (avec son chiffre s'il y en a un), rédige UNE puce d'engagement de GSS, factuelle, qui reprend l'exigence avec son chiffre exact (sans montant de pénalité, sans inventer de moyen absent de la « réponse GSS connue » ; si GSS n'a pas de réponse connue, engage GSS à respecter l'exigence telle qu'écrite). Jamais « s'engage à confirmer » ni « s'engage à formaliser » : écris l'engagement lui-même. Une exigence déjà traitée dans le texte, même formulée autrement, n'est PAS reprise. Ne cite jamais le numéro d'une exigence. Ignore les exigences qui portent sur la composition du dossier de l'offre (pièces à remettre, nombre de pages du mémoire, visite, signature) : elles ne s'écrivent pas dans le mémoire. Pas de numéro en tête de puce. Renvoie UNIQUEMENT un objet JSON : {"puces": ["…"]} (liste vide si tout est couvert).${regleDelais}` },
        { role: 'user', content: `TEXTE :\n${text}\n\nEXIGENCES :\n${chapterReqs.map((r: any, k: number) => `${k + 1}. ${r.exigence} (réponse GSS connue : ${r.reponseGss || '—'})`).join('\n')}` },
      ], 0.1, `Couverture ${sectionId}`, true);
      // « GSS indiquera / précise dans le mémoire… », sous-traitance, pièces de l'offre : jamais remis (motifRefusEngagement).
      // Une puce qui parle du mémoire au lieu de répondre (« GSS précise le nombre de contrôleurs ») devient une question à GSS.
      // Proposition qui renvoie aux sanctions de l'acheteur retirée, l'obligation reste (T6-CONS-10).
      const brutes = (JSON.parse(verif || '{}').puces || []).map((x: any) => sansClauseSanction(String(x).trim().replace(/^(?:[-•]\s*)?\d+[.)]\s+/, ''))).filter(Boolean);
      for (const x of brutes) if (questions && /sans réponse/.test(motifRefusEngagement(x))) { const q = questionDEngagement(x); questions.add(q); sources?.set(q, x); }
      // T7-CONS-2 : jamais une exigence déjà écrite dans le texte de la rubrique (même valeur, mêmes mots pleins), seule la
      // partie de l'engagement qui n'y est pas encore reste.
      const puces = brutes.filter((x: string) => !motifRefusEngagement(x)).map((x: string) => engagementSansRedite(x, text)).filter(Boolean);
      if (puces.length) {
        text = `${text.trim()}\n\n## Nos engagements sur les exigences du cahier des charges\n\n${puces.map((x: string) => `- ${x.replace(/^[-•]\s*/, '')}`).join('\n')}`;
        console.log(`[MemoireGenerator] Rubrique ${sectionId} : ${puces.length} exigence(s) du CCTP ajoutée(s) après contrôle de couverture.`);
      }
    } catch { /* contrôle facultatif */ }
    return text;
  }

  /**
   * Dimensionnement proposé (consignes 2 et 4) : le modèle relève dans le DCE les postes, les horaires, les volumes
   * horaires et, s'il y en a un, le cas pratique ; les effectifs sont calculés sans modèle (dimensionnement.ts). null si
   * rien d'exploitable ou modèle indisponible. Étape non bloquante.
   */
  private async dimensionner(dce: string, cadre = '', dossierId = ''): Promise<Dimensionnement | null> {
    this.dimensionnementEtat = undefined;
    try {
      const extrait = extraitDimensionnement(dce, cadre);
      if (!extrait.trim()) return null;
      const r = await this.callOpenAI([
        { role: 'system', content: CONSIGNE_DIMENSIONNEMENT },
        { role: 'user', content: extrait },
      ], 0.1, 'Dimensionnement (lecture du DCE)', true, 'analyse');
      const d = calculerDimensionnement(lireJson(r || ''), dce + (cadre ? `\n${cadre}` : ''));
      // Mises en situation : la proposition déjà présentée à GSS pour ce même DCE est reprise telle quelle (D5).
      const empreinte = crypto.createHash('sha1').update(extrait).digest('hex');
      if (d?.misesEnSituation?.length) {
        const r2 = reprendreMisesEnSituation(d.misesEnSituation, dossierId ? lireEtat(dossierId)?.dimensionnement : undefined, empreinte);
        if (r2.reprises) console.log(`[MemoireGenerator] Mises en situation : dispositif de la génération précédente repris tel quel (même DCE).`);
        d.misesEnSituation = r2.misesEnSituation;
        this.dimensionnementEtat = { empreinte, misesEnSituation: d.misesEnSituation };
      }
      if (d) console.log(`[MemoireGenerator] Dimensionnement proposé : ${d.profils.map((x) => `${x.profil} ${x.heuresSemaine} h/sem → ${x.etp} ETP → ${x.titulaires}`).join(' ; ') || 'aucun poste'} ; titulaires ${d.titulaires}, suppléants ${d.suppleants} ; cas pratique : ${d.casPratique.length} ligne(s).`);
      else console.log('[MemoireGenerator] Dimensionnement : aucun poste ni cas pratique exploitable dans le DCE.');
      return d;
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Dimensionnement indisponible : ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Cadre imposé : contrôle de couverture des exigences du CCTP, comme en réponse libre (completerCouverture). Les
   * réponses développées et le CCTP (sans CCAP) sont confrontés en un appel : pour chaque réponse, les exigences de son
   * thème qui n'y figurent pas (pointage des rondes NFC, rapport avant 9 h, qualifications SST/H0B0, permis B…) sont
   * ajoutées en puces d'engagement de GSS, sous le sous-titre de la réponse qui les attend. Étape non bloquante.
   */
  private async couvertureCadre(reponses: Array<{ id: number; question: string; value: string }>, dce: string, analysisData: any, horsNormandie: boolean): Promise<number> {
    const cctp = texteCctp(dce, 120_000);
    if (!reponses.length || !cctp.trim()) return 0;
    const lots = (Array.isArray(analysisData?.lots) ? analysisData.lots : []).map((l: any) => `${l?.num || ''} ${l?.perimetre || ''}`.trim()).filter(Boolean).join(' ; ');
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu contrôles les réponses de GSS (sécurité privée) au cadre de réponse d'un appel d'offres avant la remise. On te donne chaque réponse (identifiant, question du cadre, texte) puis le CCTP.
Pour chaque réponse, relève les exigences du CCTP qui relèvent directement de SA question et qu'elle ne traite pas (moyen ou outil imposé, échéance ou horaire de transmission, qualification exigée des agents, véhicule ou permis, volume d'heures, classement ou contenu d'un rapport…) ; une exigence déjà traitée, même formulée autrement, n'est pas reprise.
Pour chacune, rédige UNE puce d'engagement de GSS, courte et factuelle, au présent, qui reprend l'exigence avec ses mots et chiffres EXACTS (« GSS équipe chaque agent d'un outil de pointage NFC des points de contrôle lors des rondes à pied »), jamais à la voix de l'acheteur (ni « le titulaire », ni « devra ») ni recopiée mot pour mot.
- Uniquement les exigences du lot de ce marché${lots ? ` (${lots})` : ''} : ignore celles d'un autre lot.
- Ignore la procédure et l'administratif (offre, prix, facturation, pénalités, durée), les obligations de l'acheteur et ce qui figure déjà dans une autre réponse.
- Jamais de montant de pénalité, de nom de personne, de chiffre absent du CCTP.${horsNormandie ? ' Marché hors de Normandie : aucun délai d\'intervention, d\'astreinte ou de mise à disposition chiffré.' : ''}
- "apres" : le sous-titre de la réponse (recopié exactement) sous lequel la puce s'insère, ou "" pour la fin de la réponse.
- Au plus 4 puces par réponse.
Renvoie UNIQUEMENT un objet JSON : {"ajouts": [{"id": <id>, "apres": "…", "texte": "…"}]} (liste vide si tout est couvert).`,
      },
      { role: 'user', content: `RÉPONSES :\n${reponses.map((x) => `### Réponse ${x.id} — question : ${x.question}\n${x.value.slice(0, 6000)}`).join('\n\n')}\n\nCCTP :\n${cctp}` },
    ], 0.1, 'Couverture du CCTP (cadre)', true, 'analyse');
    let n = 0;
    try {
      const parId = new Map<number, Array<{ apres: string; texte: string }>>();
      for (const a of JSON.parse(r || '{}').ajouts || []) {
        const id = Number(a?.id);
        const texte = String(a?.texte || '').trim().replace(/^[-•]\s*/, '');
        if (!reponses.some((x) => x.id === id) || texte.length < 20 || PIECES_OFFRE.test(texte) || motifRefusEngagement(texte) || /p[ée]nalit|\btitulaire\b|\bdevra\b/i.test(texte)) continue;
        const l = parId.get(id) ?? parId.set(id, []).get(id)!;
        if (l.length < 4) l.push({ apres: String(a?.apres || '').trim(), texte });
      }
      for (const [id, ajouts] of parId) {
        const rep = reponses.find((x) => x.id === id)!;
        let v = rep.value;
        for (const a0 of ajouts) {
          // T7-CONS-2 : exigence déjà écrite dans la réponse (phrase de GSS, phrase ajoutée ou puce précédente) : jamais redite.
          const reste = engagementSansRedite(a0.texte, v);
          if (!reste) continue;
          const a = { ...a0, texte: reste };
          const lignes = v.split('\n');
          const k = a.apres ? lignes.findIndex((l) => l.trim() === a.apres) : -1;
          // Sans rattachement : à la fin, séparée par une ligne vide quand la réponse finit par une liste de GSS (havre2 341 :
          // « GSS n'autorise pas l'accès des véhicules… » imprimée comme une puce du « Numérique »).
          // Jamais après une ligne d'annonce terminée par « : » restée sans sa liste (etampes2 1661, T6-CONS-4) : l'annonce orpheline
          // est retirée, l'ajout suit le paragraphe précédent.
          if (k < 0) { let fin = v.trimEnd(); if (/(?:^|\n)(?!\s*(?:[•\-*]|\d+[.)])\s)[^\n]*:\s*$/.test(fin)) fin = fin.replace(/\n?[^\n]*:\s*$/, '').trimEnd(); v = `${fin}\n${/(?:^|\n)\s*(?:[•\-*]|\d+[.)])\s[^\n]*$/.test(fin) ? '\n' : ''}• ${a.texte}`; n++; continue; }
          // Fin du paragraphe (et de la liste) qui suit le sous-titre.
          let fin = k + 1;
          while (fin < lignes.length && lignes[fin].trim()) fin++;
          lignes.splice(fin, 0, `• ${a.texte}`);
          v = lignes.join('\n');
          n++;
        }
        rep.value = v;
      }
    } catch { /* étape facultative */ }
    if (n) console.log(`[MemoireGenerator] Couverture du CCTP (cadre) : ${n} exigence(s) ajoutée(s) aux réponses.`);
    return n;
  }

  /**
   * Suivi des phrases de GSS adaptées au CCTP (D8) pour une génération : textes de GSS publipostés (référence), délais
   * normands retirés au publipostage (marché hors Normandie ou à sites mixtes) et choix de GSS de la génération précédente
   * du dossier (état de complétion).
   */
  private suiviAdaptations(dossierId: string, mt: MemoireType, ctx: ContexteMarche, ids: string[], textes: string[], options: { marquerConsultations?: boolean } = {}): SuiviAdaptations {
    let horsNormandie: ReturnType<typeof adaptationsDuPubliposte> = [];
    try {
      horsNormandie = adaptationsDuPubliposte(mt, ctx, ids, options);
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Délais normands retirés au publipostage : comparaison indisponible (${e?.message || e}).`);
    }
    // Délais et fréquences imposés par le CCTP à la place de ceux de GSS (caen 475 : 45 → 30 minutes, T6C-3).
    let imposees: ReturnType<typeof adaptationsDesValeursImposees> = [];
    try {
      imposees = adaptationsDesValeursImposees(mt, ctx, ids, options);
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Valeurs imposées par le CCTP au publipostage : comparaison indisponible (${e?.message || e}).`);
    }
    const decisions = dossierId ? (lireEtat(dossierId)?.adaptations || []) : [];
    const suivi = new SuiviAdaptations({ reference: [...textes, ...horsNormandie.map((x) => x.reference), ...imposees.map((x) => x.reference)], decisions });
    suivi.noterPubliposte(horsNormandie);
    suivi.noterPubliposte(imposees);
    return suivi;
  }

  /**
   * Fin de génération (D8) : phrases adaptées retrouvées dans le texte final, choix de GSS de la génération précédente
   * appliqués ; un emplacement « [À COMPLÉTER] » disparu avec une phrase rétablie n'est plus demandé.
   */
  private finaliserAdaptations(suivi: SuiviAdaptations, sections: Record<string, string>, titreDe: (id: string) => string, elements: ElementACompleter[] = [], correspondance: Record<string, string[]> = {}, formeOrigine?: (t: string) => string): PhraseAdaptee[] {
    const avant = Object.values(sections).join('\n');
    const liste = suivi.finaliser(sections, titreDe, correspondance, formeOrigine);
    const apres = Object.values(sections).join('\n');
    if (apres !== avant) {
      for (let i = elements.length - 1; i >= 0; i--) {
        const r = elements[i].reperes || [];
        if (elements[i].statut === 'ouvert' && r.length && r.every((n) => avant.includes(REPERE(n)) && !apres.includes(REPERE(n)))) elements.splice(i, 1);
      }
    }
    if (liste.length) console.log(`[MemoireGenerator] Phrases de GSS adaptées au CCTP (D8) : ${liste.length}, dont ${aValider(liste).length} à valider par GSS${liste.length > aValider(liste).length ? ` (choix repris : ${liste.filter((a) => a.statut !== 'a_valider').map((a) => `n° ${a.n} ${a.statut}`).join(', ')})` : ''}.`);
    return liste;
  }

  /**
   * Cohérence avec le CCTP : une phrase dont un chiffre contredit une exigence chiffrée du DCE (fréquence
   * inférieure au minimum imposé, délai plus long que le maximum…) est reformulée pour s'aligner sur
   * l'exigence. Seuls les remplacements retrouvés MOT POUR MOT sont appliqués. Étape non bloquante.
   */
  private async corrigerContradictions(sections: Record<string, string>, rubriques: Array<{ id: string; title: string }>, exigences: Array<{ exigence: string; rubrique?: string }>, proteges: string[] = [], questions?: Set<string>, adaptations?: AdaptationCctp[], noter?: (id: string, avant: string, apres: string, exigence: string) => void, refusees?: string[], dce?: string): Promise<void> {
    const ids = rubriques.map((r) => r.id).filter((id) => (sections[id] || '').trim());
    // Une rubrique à la fois, avec les exigences chiffrées qui lui sont attribuées (contexte court : résultat stable).
    // Chaque rubrique est confrontée à TOUTES les exigences (une contradiction se trouve souvent hors de la
    // rubrique à laquelle l'exigence est attribuée : « 1 à 3 contrôles » écrit dans une autre rubrique).
    const toutes = exigences.map((r) => String(r.exigence || '')).filter(Boolean).slice(0, 130);
    const lots = ids.map((id) => ({ id, chiffrees: toutes })).filter((l) => l.chiffrees.length);
    let n = 0;
    const jalonsRefuses = new Map<string, string>();
    await Promise.all(lots.map(async ({ id: idLot, chiffrees }) => {
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu relis un mémoire technique de sécurité privée au regard des exigences du CCTP. Repère chaque phrase ou puce qui CONTREDIT une exigence : chiffre non conforme (fréquence inférieure au minimum imposé, délai supérieur au maximum, échéance plus tardive, effectif ou qualification inférieurs), pratique contraire à un interdit ou à une modalité imposée (ex. rondes « en voiture ou à vélo » alors que le CCTP les impose à pied ; photos alors qu'elles sont interdites), ou passage qui contredit un autre passage du mémoire appliquant l'exigence. Propose pour chacune un remplacement qui s'aligne exactement sur l'exigence du CCTP, en gardant le reste de la phrase.
- "extrait" = texte EXACT recopié caractère pour caractère depuis le mémoire (Markdown compris) ; "remplacement" = la version corrigée.
- Uniquement quand la phrase et l'exigence portent sur EXACTEMENT la même obligation (même objet, même acteur, même destinataire) : par exemple, le délai de prévenance d'une modification de planning envers l'acheteur n'est PAS le délai dans lequel un agent signale son absence à GSS. En revanche, « la méthode prévoit des contrôles de 1 à 3 fois par mois » alors que le CCTP impose au moins 3 visites inopinées par mois EST une contradiction à corriger (même obligation : fréquence des contrôles inopinés). En cas de doute réel sur l'objet, ne corrige pas.
- Ne touche pas aux chiffres qui ne concernent pas une exigence, ni aux phrases contenant ⟦AC:…⟧ ou [CONSULTATION REQUISE.
- "meme_obligation" : explique en quelques mots pourquoi c'est la même obligation.
Renvoie UNIQUEMENT un objet JSON : {"corrections": [{"id": "rubrique", "extrait": "…", "remplacement": "…", "exigence": "…", "meme_obligation": "…"}]} (liste vide si tout est cohérent).`,
      },
      { role: 'user', content: `EXIGENCES DU CCTP :\n${chiffrees.map((e) => `- ${e}`).join('\n')}\n\nMÉMOIRE :\n=== ${idLot} — ${rubriques.find((x) => x.id === idLot)?.title} ===\n${sections[idLot]}` },
    ], 0.1, `Cohérence ${idLot} avec le CCTP`, true);
    try {
      for (const c of JSON.parse(r || '{}').corrections || []) {
        const id = idLot, extrait = String(c?.extrait || ''), remplacement = String(c?.remplacement || '').trim();
        if (!ids.includes(id) || extrait.length < 12 || !remplacement || /⟦AC:|CONSULTATION REQUISE/i.test(extrait) || !sections[id].includes(extrait)) continue;
        // Pratique de GSS gardée quand le DCE n'exige rien (« une à trois fois par mois » : contrôles inopinés non exigés).
        if (proteges.some((x) => extrait.includes(x) && !remplacement.includes(x))) continue;
        // Fréquence d'un contrôle ou d'une réunion qualité de GSS (T3-CONS-3, imm 1353 : « au moins trois fois par mois »
        // devenu « plusieurs fois par mois ») : jamais réécrite par cette étape, comme par l'adaptation (T2-CONS-3) ; elle ne
        // change que par les fréquences imposées du publipostage. Une fréquence du DCE plus élevée est demandée à GSS.
        if (phrasesDeFrequenceDeControle(sections[id]).some((ph) => ph.includes(extrait.trim().slice(0, 60)) || extrait.includes(ph.slice(0, 60)))) {
          const avantN = frequenceMensuelle(extrait), apresN = frequenceMensuelle(remplacement);
          console.warn(`[MemoireGenerator] Cohérence ${id} avec le CCTP : remplacement refusé (fréquence de contrôle de GSS) : « ${extrait.slice(0, 100)} ».`);
          if (avantN !== null && apresN !== null && apresN > avantN && questions && exigenceDeCorrection(c)) { questions.add(questionAlignementRefuse(exigenceDeCorrection(c), extrait)); refusees?.push(exigenceDeCorrection(c)); }
          continue;
        }
        const exigenceC = String(c?.exigence || '').replace(/\s+/g, ' ').trim();
        // Mémoire type (D8, T2-CONS-9 : format court imm 1203, l'étape de mobilisation de l'astreinte remplacée par « Le marché
        // pénalise toute absence… de plus de 60 minutes ») : seulement une contradiction avec une exigence citée mot pour mot
        // dans le DCE, jamais tirée d'une grille de pénalités, et la phrase adaptée garde le sujet et l'action de la phrase de GSS.
        if (dce !== undefined) {
          const refus = refusAlignementCctp(extrait, remplacement, exigenceC, dce);
          if (refus) { console.warn(`[MemoireGenerator] Cohérence ${id} avec le CCTP : remplacement refusé (${refus}) : « ${extrait.slice(0, 100)} ».`); continue; }
        }
        // Réunion exigée par le CCTP : c'est l'obligation des réunions de suivi, que leur rubrique traite (becquerel 591, T5N-4 :
        // « au minimum une réunion par mois entre le Responsable sécurité et les représentants du prestataire » appliquée au
        // contrôle global du responsable qualité) ; jamais alignée dans une autre rubrique.
        if (/\br[ée]unions?\b/i.test(exigenceC) && id !== 'b5_reunions_indicateurs' && (sections.b5_reunions_indicateurs || '').trim()) {
          console.warn(`[MemoireGenerator] Cohérence ${id} avec le CCTP : alignement refusé (réunion exigée, traitée par les réunions de suivi) : « ${extrait.slice(0, 100)} ».`);
          continue;
        }
        // Fréquence de GSS écrite aussi dans d'autres rubriques (« une fois par trimestre », « trimestrielles ») : l'aligner ici
        // seulement ferait se contredire le mémoire (T5N-4) ; refusée, la question est posée à GSS.
        const autresRubriques = frequencesRetirees(extrait, remplacement).length
          ? ids.filter((x) => x !== id && frequencesRetirees(extrait, remplacement).some((f) => familleFrequence(sections[x] || '').includes(f)))
          : [];
        if (autresRubriques.length) {
          console.warn(`[MemoireGenerator] Cohérence ${id} avec le CCTP : alignement refusé (fréquence de GSS écrite aussi dans ${autresRubriques.join(', ')}) : « ${extrait.slice(0, 100)} ».`);
          if (questions && exigenceC) questions.add(questionAlignementRefuse(exigenceC, extrait, autresRubriques.map((x) => rubriques.find((r) => r.id === x)?.title || x)));
          if (exigenceC) refusees?.push(exigenceC);
          continue;
        }
        // Fait de GSS (montant d'assurance, numéro de contrat, valeur du registre) : jamais remplacé par le seuil du DCE ;
        // l'écart est demandé à GSS (parc_expo 202 : RC professionnelle Hiscox 300 000 € devenue « 10 000 000 € »).
        const motif = motifRefusAlignement(extrait, remplacement)
          || (jalonsChronologiques(sections[id]) && !jalonsChronologiques(sections[id].replace(extrait, remplacement)) ? 'jalon du calendrier de GSS' : '');
        if (motif) {
          console.warn(`[MemoireGenerator] Cohérence ${id} avec le CCTP : remplacement refusé (${motif}) : « ${extrait.slice(0, 100)} ».`);
          const exigence = String(c?.exigence || '').replace(/\s+/g, ' ').trim();
          // Calendrier de GSS (« J-10 », « J-3 ») : une seule question par rubrique, qui cite l'exigence et les jalons écrits.
          if (motif === 'jalon du calendrier de GSS') {
            if (questions && exigence && !jalonsRefuses.has(id)) jalonsRefuses.set(id, exigence);
            if (exigence) refusees?.push(exigence);
            continue;
          }
          if (questions && exigence) questions.add(questionAlignementRefuse(exigence, extrait));
          if (exigence) refusees?.push(exigence);
          continue;
        }
        const texteAvant = sections[id], pos = texteAvant.indexOf(extrait);
        sections[id] = sections[id].replace(extrait, remplacement);
        // D8 : le CCTP prime, mais la phrase de GSS adaptée est signalée à GSS (phrase d'origine, phrase adaptée, exigence).
        adaptations?.push({ id, avant: phraseAutour(texteAvant, pos, extrait.length).replace(/\*\*|__/g, ''), apres: phraseAutour(sections[id], pos, remplacement.length).replace(/\*\*|__/g, ''), exigence: String(c?.exigence || '').replace(/\s+/g, ' ').trim() });
        noter?.(id, texteAvant, sections[id], String(c?.exigence || '').replace(/\s+/g, ' ').trim());
        n++;
      }
    } catch { /* étape facultative */ }
    }));
    if (n) console.log(`[MemoireGenerator] Cohérence avec le CCTP : ${n} passage(s) aligné(s) sur les exigences chiffrées.`);
    if (questions) for (const [id, exigence] of jalonsRefuses) questionJalons(questions, exigence, sections[id] || '');
  }

  /**
   * Horaires du mémoire confrontés, en une seule passe sur tout le document, aux horaires imposés par le CCTP
   * (ouverture, fermeture aux usagers, mise sous alarme, présence des postes, rondes, relèves). Le contrôle par
   * rubrique en laissait passer (« fermeture de Coriolis à 19 h » répété dans plusieurs rubriques alors que le CCTP
   * fixe la fermeture aux usagers à 21 h et la mise sous alarme à 22 h). Seule la phrase fautive est remplacée,
   * partout où elle figure. Étape non bloquante.
   */
  private async verifierHoraires(sections: Record<string, string>, rubriques: Array<{ id: string; title: string }>, dce: string, adaptations?: AdaptationCctp[], noter?: (id: string, avant: string, apres: string, exigence: string) => void): Promise<void> {
    // Ouverture, fermeture et mise sous alarme des bâtiments seulement : les horaires de rondes et de présence des
    // postes sont contrôlés rubrique par rubrique (corrigerContradictions), avec le détail de chaque site.
    const OBJET = /ouvert|ferm|alarme/i;
    const horaires = horairesImposes(dce, 60, OBJET);
    if (!horaires.length) return;
    const ids = rubriques.map((r) => r.id).filter((id) => (sections[id] || '').trim());
    // Chaque phrase est accompagnée de son contexte (sous-titre et phrase d'introduction d'une liste : « À Thiais, GSS
    // s'engage à organiser : ») : sans lui, une puce d'horaires propre à un site était « corrigée » avec ceux d'un autre.
    const contexte = new Map<string, string>();
    for (const id of ids) {
      let titre = '', intro = '';
      for (const ligne of sections[id].split('\n')) {
        const l = ligne.trim();
        if (!l) continue;
        if (/^#{1,4}\s/.test(l)) { titre = l.replace(/^#+\s*/, ''); intro = ''; continue; }
        const puce = /^(?:[-*•]|\d+[.)])\s/.test(l);
        for (const ph of l.split(/(?<=[.!?;])\s+/)) {
          const p = ph.trim();
          if (p.length >= 20 && /\b\d{1,2}\s*h\s*\d{0,2}\b/i.test(p) && OBJET.test(p) && !/⟦AC:|CONSULTATION REQUISE/.test(p) && !contexte.has(p)) {
            contexte.set(p, [titre, puce ? intro : ''].filter(Boolean).join(' — ').replace(/\*\*/g, '').slice(0, 220));
          }
        }
        if (!puce) intro = l.slice(0, 200);
      }
    }
    const liste = [...contexte.keys()].slice(0, 200);
    if (!liste.length) return;
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu vérifies les horaires d'un mémoire technique de sécurité privée au regard des horaires imposés par le cahier des charges (CCTP).
Pour chaque phrase numérotée dont un horaire CONTREDIT le CCTP pour le MÊME objet (même bâtiment ou site, même action : ouverture, fermeture aux usagers, mise sous alarme, présence d'un poste, ronde, relève, pause), réécris la phrase avec l'horaire du CCTP, sans rien changer d'autre (Markdown compris).
Identifie l'objet de chaque phrase avec son CONTEXTE (sous-titre, phrase d'introduction de la liste) : quand le CCTP fixe des horaires différents selon les sites, bâtiments ou campus, compare uniquement avec ceux du site visé ; si le site ne peut pas être identifié, ne corrige pas.
Attention : l'heure de relève ou de fin de présence d'un poste n'est pas l'heure de fermeture d'un bâtiment ; une phrase qui ne précise pas l'objet de l'horaire, ou pour laquelle le CCTP ne donne pas d'horaire, n'est pas corrigée. En cas de doute, ne corrige pas.
Renvoie UNIQUEMENT un objet JSON : {"corrections": [{"n": <numéro>, "phrase": "phrase corrigée", "horaire_cctp": "citation courte du CCTP"}]} (liste vide si tout est conforme).`,
      },
      { role: 'user', content: `HORAIRES IMPOSÉS PAR LE CCTP :\n${horaires.map((h) => `- ${h}`).join('\n')}\n\nPHRASES DU MÉMOIRE :\n${liste.map((p, i) => `${i + 1}. ${contexte.get(p) ? `[contexte : ${contexte.get(p)}] ` : ''}${p}`).join('\n')}` },
    ], 0.1, 'Horaires du CCTP', true);
    let n = 0;
    try {
      const squelette = (x: string) => x.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
      for (const c of JSON.parse(r || '{}').corrections || []) {
        const avant = liste[Number(c?.n) - 1];
        const apres = String(c?.phrase || '').trim();
        // Correction d'horaire seulement : la phrase garde l'essentiel de son texte (pas de réécriture).
        if (!avant || !apres || apres === avant || Math.abs(squelette(apres).length - squelette(avant).length) > 45) continue;
        for (const id of ids) {
          if (!sections[id].includes(avant)) continue;
          const texteAvant = sections[id];
          sections[id] = sections[id].split(avant).join(apres);
          n++;
          // D8 : phrase de GSS adaptée à l'horaire du CCTP, signalée à GSS.
          adaptations?.push({ id, avant: avant.replace(/\*\*|__/g, '').trim(), apres: apres.replace(/\*\*|__/g, '').trim(), exigence: String(c?.horaire_cctp || '').replace(/\s+/g, ' ').trim() });
          noter?.(id, texteAvant, sections[id], String(c?.horaire_cctp || '').replace(/\s+/g, ' ').trim() || exigenceProche(apres, horaires));
        }
      }
    } catch { /* étape facultative */ }
    if (n) console.log(`[MemoireGenerator] Horaires du CCTP : ${n} phrase(s) corrigée(s).`);
  }

  /**
   * Obligations chiffrées du cahier des charges (échéances, délais, fréquences) dont le chiffre n'apparaît nulle
   * part dans le mémoire : le modèle vérifie qu'elles ne sont pas déjà traitées autrement et, sinon, rédige
   * l'engagement correspondant, ajouté à la rubrique dont c'est le sujet. Étape non bloquante.
   */
  private async engagementsChiffresManquants(sections: Record<string, string>, rubriques: Array<{ id: string; title: string }>, dce: string): Promise<void> {
    const ids = rubriques.map((r) => r.id).filter((id) => (sections[id] || '').trim());
    const absentes = obligationsChiffreesAbsentes(dce, ids.map((id) => sections[id]).join('\n\n')).slice(0, 25);
    if (!ids.length || !absentes.length) return;
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu contrôles un mémoire technique de GSS (sécurité privée) avant sa remise. On te donne le mémoire, rubrique par rubrique (identifiant entre crochets), puis des obligations chiffrées du cahier des charges dont le chiffre n'a pas été retrouvé tel quel dans le mémoire.
Pour CHAQUE obligation :
- si le mémoire la traite déjà avec le même chiffre, même formulé autrement (« une journée », « trimestrielle », « 48 h »), ignore-la ;
- ignore-la aussi si elle incombe à l'acheteur, ou si elle relève de la procédure ou de l'administratif du marché (offre, prix, facturation, pénalités, durée du marché) ;
- sinon, rédige UNE puce d'engagement de GSS, courte et factuelle, qui reprend l'obligation avec son chiffre EXACT (échéance, délai, fréquence, destinataire), et choisis la rubrique dont c'est directement le sujet.
Jamais de montant de pénalité, jamais « s'engage à confirmer / à formaliser » (écris l'engagement lui-même), jamais de numéro d'article ni de référence au « cahier des charges » en tête de puce.
Renvoie UNIQUEMENT un objet JSON : {"puces": [{"rubrique": "identifiant", "texte": "…"}]} (liste vide si tout est déjà traité).`,
      },
      { role: 'user', content: `MÉMOIRE :\n${ids.map((id) => `[${id}] ${rubriques.find((x) => x.id === id)?.title || ''}\n${sections[id]}`).join('\n\n')}\n\nOBLIGATIONS CHIFFRÉES DU CAHIER DES CHARGES NON RETROUVÉES :\n${absentes.map((x) => `- ${x}`).join('\n')}` },
    ], 0.1, 'Obligations chiffrées du CCTP', true);
    let n = 0;
    try {
      const parRubrique = new Map<string, string[]>();
      for (const p of JSON.parse(r || '{}').puces || []) {
        const id = String(p?.rubrique || '').trim();
        const texte = String(p?.texte || '').trim().replace(/^[-•]\s*/, '');
        // Procédure et administratif du marché (consigne du prompt), contrôlés sans modèle : facturation et paiement
        // (« GSS s'engage à ce que la dernière facture puisse être différée », génération réelle ign 12).
        if (!ids.includes(id) || texte.length < 15 || motifRefusEngagement(texte) || /factur|paiement|imput[ée]e?s? [àa] GSS/i.test(texte)) continue;
        // Rubrique de présentation pure hors de son sujet (« Nos valeurs », T1-CONS-7) : la rubrique du sujet de l'engagement.
        const mtv2 = this.memoireTypeV2();
        const cible = rubriqueAdmetSujet(id, texte) ? id : (mtv2 ? rechercherRubriques(mtv2, texte, 1, ids.filter((x) => x !== id && rubriqueAdmetSujet(x, texte)))[0]?.id || '' : '');
        if (!cible) continue;
        (parRubrique.get(cible) ?? parRubrique.set(cible, []).get(cible)!).push(texte);
      }
      for (const [id, puces] of parRubrique) {
        const liste = puces.map((x) => `- ${x}`).join('\n');
        const titres = [...sections[id].matchAll(/^#{2,4}\s+(.+)$/gm)];
        const dernier = titres.length ? titres[titres.length - 1][1] : '';
        // À la suite de la liste d'engagements déjà présente en fin de rubrique, sinon sous un nouveau sous-titre.
        sections[id] = /engagements sur les exigences du cahier des charges/i.test(dernier)
          ? `${sections[id].trim()}\n${liste}`
          : `${sections[id].trim()}\n\n## Nos engagements sur les exigences du cahier des charges\n\n${liste}`;
        n += puces.length;
      }
    } catch { /* étape facultative */ }
    console.log(`[MemoireGenerator] Obligations chiffrées du CCTP : ${absentes.length} non retrouvée(s), ${n} engagement(s) ajouté(s).`);
  }

  /** Sous-titres et phrases porteuses de faits (chiffres, gras, noms propres) d'une rubrique, en bref. */
  private faitsDeRubrique(texte: string): string {
    const sousTitres = [...texte.matchAll(/^#{2,4}\s+(.+)$/gm)].map((m) => m[1].trim());
    const phrases = texte.replace(/^#{1,4}\s+.+$/gm, '').split(/(?<=[.!?])\s+|\n+/)
      .map((x) => x.replace(/^[-*•]\s*/, '').trim())
      .filter((x) => x.length > 25 && (/\d|\*\*/.test(x) || /\b[A-Z][A-Z]{2,}\b/.test(x)));
    return `${sousTitres.join(' / ')} — ${phrases.join(' ').replace(/\*\*/g, '')}`.replace(/\s+/g, ' ').slice(0, 1400);
  }

  /**
   * Répétitions entre rubriques : un fait (référence client, délai, dispositif, procédure) n'est
   * développé qu'une fois, dans la rubrique dont c'est le sujet. L'IA désigne les phrases ou puces qui
   * redisent ailleurs ce qui est déjà développé ; seules celles retrouvées MOT POUR MOT sont retirées
   * (jamais un repère ⟦AC:n⟧, jamais un chiffre exigé par le CCTP propre à la rubrique), puis les
   * sous-titres restés vides sont supprimés. Étape non bloquante.
   */
  private async dedoublonnerRubriques(sections: Record<string, string>, rubriques: Array<{ id: string; title: string }>, intouchables: string[] = [], references: Record<string, string> = {}): Promise<void> {
    const ids = rubriques.map((r) => r.id).filter((id) => (sections[id] || '').trim());
    if (ids.length < 2) return;
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu relis un mémoire technique découpé en rubriques pour supprimer les RÉPÉTITIONS entre rubriques. Une répétition = une phrase ou une puce qui redit dans une rubrique ce qu'une AUTRE rubrique développe déjà (même référence client décrite, même délai ou même dispositif expliqué, même procédure, même liste de moyens).
- Garde chaque fait dans la rubrique dont il est le SUJET (celle dont le titre correspond) ; désigne les redites dans les autres.
- Ne désigne jamais : un engagement chiffré propre au sujet de la rubrique, une phrase qui apporte un élément nouveau, un titre, ni une phrase contenant ⟦AC:…⟧.
- "extrait" = la phrase ou la puce EXACTE, recopiée caractère pour caractère depuis le texte (sans le tiret de puce).${intouchables.length ? `
- Les rubriques suivantes reprennent le texte de référence de GSS : n'y désigne JAMAIS de phrase à retirer (elles peuvent seulement être la rubrique « garde ») : ${intouchables.join(', ')}.` : ''}
Renvoie UNIQUEMENT un objet JSON : {"suppressions": [{"id": "rubrique où retirer", "extrait": "…", "garde": "rubrique où le fait reste développé"}]} (liste vide s'il n'y a aucune répétition).`,
      },
      { role: 'user', content: ids.map((id) => `=== ${id} — ${rubriques.find((x) => x.id === id)?.title} ===\n${sections[id]}`).join('\n\n') },
    ], 0.1, 'Répétitions entre rubriques', true);
    let n = 0;
    try { n = appliquerSuppressionsRepetitions(sections, rubriques, ids, JSON.parse(r || '{}').suppressions || [], intouchables, references); } catch { /* étape facultative */ }
    if (n) console.log(`[MemoireGenerator] Répétitions entre rubriques : ${n} passage(s) retiré(s).`);
  }

  /**
   * Plan imposé par le RC SANS limite de pages (IFITS, art. 11.2 et 12.4 : « en respectant l'ordre et la numérotation des
   * pièces » : 2-1 Moyens humains, 2-2 Moyens organisationnels, 2-3 Moyens techniques et matériels). Repérage sans modèle
   * des passages (passagesPlanImpose), puis lecture IA du plan ; chaque intitulé lu doit figurer dans le DCE (aucun
   * plan inventé). null : pas de plan imposé, la réponse libre suit les 5 blocs (D1).
   */
  private async detecterPlanImpose(dce: string): Promise<PartieRC[] | null> {
    const passages = passagesPlanImpose(dce);
    if (!passages.length) return null;
    const r = await this.callOpenAI([
      {
        role: 'system',
        content: `Tu lis des extraits du règlement de consultation d'un marché de sécurité privée. Le RC impose-t-il l'ORDRE (et éventuellement la numérotation) des parties du MÉMOIRE TECHNIQUE ? Ignore les pièces administratives et financières (acte d'engagement, BPU, DPGF…) : seulement les parties du mémoire technique.
Si oui, liste ses parties de premier niveau DANS L'ORDRE DU RC : "numero" = numérotation du RC telle qu'écrite (ex. « 2-1 »), "titre" = intitulé exact recopié du RC, "attendu" = TOUS les sous-éléments cités pour cette partie (ex. « 2-1a Nombre d'agents… ; 2-1b … »), recopiés fidèlement.
Renvoie UNIQUEMENT un objet JSON : {"impose": true|false, "parties": [{"numero": "…", "titre": "…", "attendu": "…"}]}`,
      },
      { role: 'user', content: passages.join('\n---\n') },
    ], 0.1, 'Plan imposé par le RC', true, 'analyse');
    try {
      const d = lireJson(r || '');
      if (!d?.impose) return null;
      const dn = normaliser(dce).replace(/[^a-z0-9]+/g, ' ');
      const parties: PartieRC[] = (Array.isArray(d.parties) ? d.parties : []).map((p: any, i: number) => {
        const numero = String(p?.numero || '').trim();
        const titre = String(p?.titre || '').trim();
        const propre = titre.charAt(0) + (titre === titre.toUpperCase() ? titre.slice(1).toLowerCase() : titre.slice(1));
        return { id: `c${i + 1}`, title: `${numero ? `${numero} ` : ''}${propre}`.trim(), attendu: String(p?.attendu || '').trim(), brut: titre };
      }).filter((p: any) => p.brut && dn.includes(normaliser(p.brut).replace(/[^a-z0-9]+/g, ' ').trim()));
      if (parties.length < 2) return null;
      console.log(`[MemoireGenerator] Plan imposé par le RC (sans limite de pages) : ${parties.map((p) => p.title).join(' | ')}.`);
      return parties.map(({ id, title, attendu }) => ({ id, title, attendu }));
    } catch {
      return null;
    }
  }

  /**
   * Limite du RC par critère ou par partie (T2-GEN-9) : pages de chaque partie mesurées sur le PDF rendu ; chaque partie
   * qui dépasse est signalée à GSS (consultations et premier message de l'assistant). [] sans limite par partie.
   */
  private controlePagesParPartie(pdf: string, format: FormatImpose, plan: PartieCourte[]): string[] {
    if (!format.pagesParPartie) return [];
    const pages = pagesDesParties(pdf, plan.map((p) => p.title));
    if (!pages.length) return [`Le RC limite chaque partie du mémoire technique à ${format.pagesParPartie} pages : vérifiez dans le PDF que chaque partie respecte cette limite avant la remise.`];
    return plan.map((p, i) => ({ p, n: pages[i] })).filter((x) => x.n > format.pagesParPartie!)
      .map((x) => `La partie « ${x.p.title} » occupe ${x.n} pages pour ${format.pagesParPartie} autorisées par le RC pour chaque partie : à raccourcir avec l'assistant avant la remise.`);
  }

  /**
   * Format imposé par le RC : nombre de pages maximum du mémoire technique et plan à suivre. Repérage
   * déterministe des mentions « … pages maximum » puis lecture IA de ces seuls passages (une limite qui
   * vise une autre pièce — CV, lettre, annexe — est écartée). null = pas de limite pour le mémoire.
   */
  private async detecterFormatImpose(dce: string): Promise<FormatImpose | null> {
    // Repérage sans modèle pour choisir les extraits, jamais pour décider seul qu'il n'y a pas de limite (T1-GEN-1).
    let passages = passagesLimitePages(dce);
    const limiteRepereeSansModele = passages.length > 0;
    if (!passages.length) passages = passagesContenuOffre(dce);
    if (!passages.length) return null;
    const criteres: string[] = [];
    const reC = /crit[èe]res?\s+(de\s+jugement|d.attribution|de\s+choix|de\s+s[ée]lection|pond[ée]r)/gi;
    let m: RegExpExecArray | null;
    while ((m = reC.exec(dce)) && criteres.length < 3) criteres.push(dce.slice(m.index, m.index + 2500));
    const messages: any[] = [
      {
        role: 'system',
        content: `Tu lis des extraits du règlement de consultation d'un marché de sécurité privée.
1. Le MÉMOIRE TECHNIQUE (ou offre technique, note méthodologique, mémoire justificatif) est-il limité à un nombre de pages ? Ignore les limites qui portent sur une autre pièce (CV, lettre de candidature, annexe, fiche…).
2. Si oui, le RC impose-t-il un plan / une structure à ce mémoire ? Liste ses parties DANS L'ORDRE du RC : "titre" = intitulé fidèle et court de la partie ; "attendu" = TOUS les éléments que le RC cite pour cette partie (ce qui est entre parenthèses, les sous-points), recopiés fidèlement.
3. Sans plan imposé, reprends comme plan les sous-critères de la valeur technique s'ils figurent dans les extraits, sinon "plan": [].
4. "criteres" : chaque sous-critère technique noté (libellé exact, pondération) et l'index (0 = première partie) de la partie du plan où il doit être traité.
5. Si la limite porte sur CHAQUE critère, sous-critère ou partie (« 5 pages par critère », « 3 pages maximum par sous-critère ») : "pagesParPartie" = ce nombre, le plan = ces critères ou parties, et "pagesMax" = le total que le RC fixe, sinon ce nombre multiplié par le nombre de parties. Sinon "pagesParPartie": null.
Renvoie UNIQUEMENT un objet JSON : {"limite": true|false, "pagesMax": nombre, "pagesParPartie": nombre|null, "citation": "phrase exacte du RC", "plan": [{"titre": "…", "attendu": "…"}], "criteres": [{"libelle": "…", "poids": "…", "partie": 0}]}`,
      },
      { role: 'user', content: `EXTRAITS QUI MENTIONNENT UN NOMBRE DE PAGES :\n${passages.join('\n---\n')}\n\nEXTRAITS SUR LES CRITÈRES DE JUGEMENT :\n${criteres.join('\n---\n') || '(aucun)'}` },
    ];
    // Réponse absente, illisible ou sans « limite » (T7CS-1 : imm sans réponse du modèle, 135 pages remises pour un RC limité à
    // 12) : un second essai, puis la limite lue sans modèle dans la phrase du RC ; jamais la réponse libre en silence.
    let d: any = null;
    for (let essai = 1; essai <= 2 && typeof d?.limite !== 'boolean'; essai++) {
      const r = await this.callOpenAI(messages, 0.1, `Format imposé par le RC${essai > 1 ? ' (essai 2)' : ''}`, true, 'analyse');
      try { d = JSON.parse(r || 'null'); } catch { d = null; }
    }
    if (typeof d?.limite !== 'boolean') {
      const lue = limitePagesMemoire(passages);
      const extrait = (x: string) => (x.length > 220 ? `${x.slice(0, 220).replace(/\s+\S*$/, '')}…` : x);
      if (lue) {
        const plan = CHAPTER_ORDER_B.map((ch, i) => ({ id: `c${i + 1}`, title: CHAPTER_TITLES_B[ch], attendu: AI_SECTIONS_B.filter((s) => s.chapter === ch).map((s) => s.title).join(' ; ') }));
        this.alertesFormat.push(`Le RC limite le mémoire technique à ${lue.pages} pages (« ${extrait(lue.citation)} ») : la rédaction automatique n'a pas pu lire le plan que le RC impose, le mémoire est rédigé en ${lue.pages} pages au plus selon le plan par défaut. Vérifiez le plan du RC et relancez la génération avant la remise.`);
        console.warn(`[MemoireGenerator] Format imposé par le RC : réponse du modèle indisponible ; ${lue.pages} pages maximum lues dans le RC (plan par défaut).`);
        return { pagesMax: lue.pages, plan, source: lue.citation };
      }
      // Phrase qui contient le nombre de pages (T9CS-2), jamais le début du passage (en-tête d'une autre pièce). Sans phrase de
      // limite (T3-REG-1, T3N-7 : DCE du CSTB, de l'IFITS, d'Étampes, sans aucune limite, où seuls des pieds de page « page
      // 9/17 » faisaient passer le repli) : une limite repérée par son nombre de pages est signalée sans citation, sinon le RC
      // ne parle pas de pages et rien n'est signalé ; jamais un extrait brut cité.
      const phrase = passages.map(phraseLimitePages).find(Boolean);
      if (phrase) this.alertesFormat.push(`Le RC mentionne une limite de pages (« ${extrait(phrase)} ») que la rédaction automatique n'a pas pu lire : le mémoire est rédigé sans limite de pages. Vérifiez si cette limite porte sur le mémoire technique et relancez la génération avant la remise.`);
      else if (limiteRepereeSansModele) this.alertesFormat.push(`La rédaction automatique n'a pas pu vérifier si le RC limite le nombre de pages du mémoire technique : le mémoire est rédigé sans limite de pages. Vérifiez-le dans le RC avant la remise.`);
      console.warn(`[MemoireGenerator] Format imposé par le RC : réponse du modèle indisponible et limite du mémoire technique non lue dans le RC${phrase || limiteRepereeSansModele ? ' ; alerte posée' : ' ; aucune phrase de limite de pages dans le RC'}.`);
      return null;
    }
    try {
      let pagesMax = Number(d.pagesMax);
      // T2-COH-2 : une limite de plus de 40 pages est appliquée (le mémoire libre en fait 120 à 145), jusqu'à 300 pages.
      if (!d.limite || !Number.isFinite(pagesMax) || pagesMax < 2 || pagesMax > 300) return null;
      // T2-GEN-9 : limite par critère ou par partie (donnée par le modèle, ou écrite ainsi dans la phrase citée) : le total est
      // le nombre de pages par partie multiplié par le nombre de parties (sauf total fixé par le RC), chaque partie est
      // contrôlée au rendu.
      let pagesParPartie = Number(d.pagesParPartie);
      const citationPages = String(d.citation || '');
      const mPar = new RegExp(`(\\d{1,3}|${RX_NOMBRE_LETTRES})\\s*(?:\\(\\s*\\d{1,3}\\s*\\)\\s*)?(?:pages?|feuillets?|faces?)`, 'giu');
      for (const x of citationPages.matchAll(mPar)) {
        if (RX_LIMITE_PAR_PARTIE.test(citationPages.slice((x.index || 0) + x[0].length, (x.index || 0) + x[0].length + 60))) { pagesParPartie = nombreFr(x[1]); break; }
      }
      if (!Number.isFinite(pagesParPartie) || pagesParPartie < 1) pagesParPartie = NaN;
      // Nombre de pages absent des extraits du RC (en chiffres ou en lettres) : jamais une limite inventée (T1-GEN-1).
      const nombresExtraits = new Set([...passages.join(' ').matchAll(new RegExp(`(?<![\\p{L}\\d])(\\d{1,3}|${RX_NOMBRE_LETTRES})(?![\\p{L}\\d])`, 'giu'))].map((x) => nombreFr(x[1])));
      // (« 10 feuillets recto-verso » : 20 pages, T7G-1)
      for (const x of passages.join(' ').matchAll(new RegExp(`(?<![\\p{L}\\d])(\\d{1,3}|${RX_NOMBRE_LETTRES})\\s*(?:feuillets?|feuilles?)\\s+recto[\\s-]*(?:\\/|et|-)?\\s*verso`, 'giu'))) nombresExtraits.add(2 * nombreFr(x[1]));
      if (!nombresExtraits.has(pagesMax) && !(Number.isFinite(pagesParPartie) && nombresExtraits.has(pagesParPartie))) {
        console.warn(`[MemoireGenerator] Format imposé par le RC : ${pagesMax} pages annoncées par le modèle, nombre absent des extraits du RC ; ignoré.`);
        return null;
      }
      let plan: PartieCourte[] = (Array.isArray(d.plan) ? d.plan : [])
        .map((p: any, i: number) => ({ id: `c${i + 1}`, title: String(p?.titre || '').trim().replace(/^./, (c) => c.toUpperCase()), attendu: String(p?.attendu || '').trim() }))
        .filter((p: PartieCourte) => p.title);
      // Plan du RC lu (avant le plan par défaut) : une limite par partie ne vaut que pour les parties du RC.
      const planDuRc = plan.length >= 2;
      if (plan.length < 2) plan = CHAPTER_ORDER_B.map((ch, i) => ({ id: `c${i + 1}`, title: CHAPTER_TITLES_B[ch], attendu: AI_SECTIONS_B.filter((s) => s.chapter === ch).map((s) => s.title).join(' ; ') }));
      for (const c of Array.isArray(d.criteres) ? d.criteres : []) {
        const p = plan[Number(c?.partie)];
        if (p && c?.libelle) p.attendu = `${p.attendu ? `${p.attendu}. ` : ''}Critère de jugement traité ici : « ${String(c.libelle).trim()} »${c.poids ? ` (${String(c.poids).trim()})` : ''}`;
      }
      if (Number.isFinite(pagesParPartie)) {
        if (!planDuRc) {
          this.alertesFormat.push(`Le RC limite chaque partie du mémoire technique à ${pagesParPartie} pages (« ${citationPages.slice(0, 220)} ») mais son plan n'a pas pu être lu : le mémoire est rédigé sans limite de pages. Vérifiez le plan du RC et relancez la génération avant la remise.`);
          return null;
        }
        // Total fixé par le RC seulement s'il est cohérent (au plus la somme des parties), sinon parties × limite par partie.
        if (!(pagesMax > pagesParPartie && pagesMax <= pagesParPartie * plan.length && nombresExtraits.has(pagesMax))) pagesMax = pagesParPartie * plan.length;
      }
      console.log(`[MemoireGenerator] Format imposé par le RC : ${pagesMax} pages maximum${Number.isFinite(pagesParPartie) ? ` (${pagesParPartie} par partie)` : ''}, plan en ${plan.length} partie(s) — « ${String(d.citation || '').slice(0, 160)} »`);
      return { pagesMax, plan, source: String(d.citation || '').trim(), ...(Number.isFinite(pagesParPartie) ? { pagesParPartie } : {}) };
    } catch {
      return null;
    }
  }

  /**
   * Mémoire au format court imposé par le RC : une partie par point du plan du RC, rédigées dans
   * l'ordre (chaque partie connaît les précédentes : aucun sujet traité deux fois), budget de mots
   * calculé sur la limite de pages, contrôle de couverture des exigences du CCTP, puis rendu A4 mesuré
   * et condensation tant que la limite est dépassée.
   */
  private async genererFormatCourt(
    dossierId: string,
    dceContext: string,
    analysisData: any,
    format: FormatImpose,
    onProgress?: (progress: number, message: string, status?: string) => void,
  ): Promise<{ filePath: string, generatedData: Record<string, string>, consultations: string[] }> {
    // Mémoire type (consigne 5 : « on reprend exactement le mémoire de base, on n'adapte que la construction ») : les
    // parties du RC assemblent les textes de GSS. Retour arrière : GSS_MEMOIRE_TYPE=non → rédaction partie par partie
    // ci-dessous, inchangée.
    const memoireType = this.memoireTypeV2();
    if (memoireType) return this.genererFormatCourtMT(dossierId, dceContext, analysisData, format, memoireType, onProgress);
    const clientName = analysisData?.clientName || 'le client';
    const plan = format.plan;
    onProgress?.(12, `Format imposé par le RC : ${format.pagesMax} pages maximum, ${plan.length} parties…`);

    const gssDocs = await this.getGssDocumentation();
    if (valeurRegistre('effectif_total')) for (const k of Object.keys(gssDocs)) if (/^EFFECTIFS/i.test(k)) delete gssDocs[k];
    const gssFullContext = this.buildFullGssContext(gssDocs, 3000, 60_000);
    onProgress?.(15, 'Analyse des exigences du CCTP et comparaison aux capacités GSS…');
    const requirementsMatrix = await this.analyzeRequirements(dceContext, gssFullContext, plan.map((p) => ({ id: p.id, title: `${p.title}${p.attendu ? ` — ${p.attendu}` : ''}` })));

    const horsNormandie = marcheHorsNormandie(analysisData, dceContext);
    const referents = await this.getGssReferents();
    actualiserOrganigramme(referents);
    const registreGss = blocRegistre(horsNormandie) + organigrammeGss(referents) + referencesGss() + this.blocPerimetre(await this.perimetreMarche(dceContext));
    const marcheCtx = [analysisData?.clientName, analysisData?.objet, analysisData?.secteur].filter(Boolean).join(' — ');
    let embs: number[][] = [];
    try { embs = await this.embedTexts(plan.map((p) => `${p.title}. ${p.attendu || ''}. ${marcheCtx}`.slice(0, 1000))); } catch { /* base de mémoires indisponible */ }
    const repartition = await this.repartirDemande(plan);
    const analysisJson = JSON.stringify(analysisData, null, 2);

    // Schémas GSS validés : au plus un par partie, un pour quatre pages (la place va d'abord au texte).
    const nbSchemas = Math.max(1, Math.floor(format.pagesMax / 4));
    const choixSchemas = choisirSchemasGss(plan.map((p) => ({ cle: p.id, question: `${p.title} ${p.attendu || ''}`, texte: '' }))).slice(0, nbSchemas);
    const schemaDe = (id: string) => choixSchemas.find((c) => c.cle === id);
    const motsTotal = Math.max(900, format.pagesMax * 560 - choixSchemas.length * 200 - 120);
    const budget = (p: PartieCourte) => {
      const poids = (x: PartieCourte) => { const m = /\((\d+)\s*%\)/g; let s = 0, k; while ((k = m.exec(x.attendu || ''))) s += Number(k[1]); return s || 10; };
      const total = plan.reduce((a, x) => a + poids(x), 0);
      return Math.max(250, Math.round((motsTotal * poids(p)) / total / 10) * 10);
    };

    const sections: Record<string, string> = {};
    const commentairesRetires = new Set<string>();
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      onProgress?.(20 + Math.round((i / plan.length) * 55), `Rédaction partie ${i + 1}/${plan.length} : ${p.title}…`);
      const reqs = requirementsMatrix.filter((r: any) => r.rubrique === p.id);
      const prix = /prix|co[uû]t|financ|d[ée]composition/i.test(`${p.title} ${p.attendu}`);
      const precedentes = plan.slice(0, i).filter((x) => sections[x.id]).map((x) => `### ${x.title}\n${sections[x.id]}`).join('\n\n');
      const passages = embs[i] ? rechercherMemoires(embs[i], 6, p.title, 3) : [];
      const systemPrompt = `Tu es un expert en sécurité privée chez GSS et tu rédiges UNE partie d'un mémoire technique pour ${clientName}, au FORMAT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION : ${format.pagesMax} pages maximum pour tout le mémoire${format.source ? ` (« ${format.source} »)` : ''}.
PARTIE À RÉDIGER : « ${p.title} »${p.attendu ? `\nCE QUE LE RC ATTEND DANS CETTE PARTIE (chaque élément doit être traité explicitement, dans cet ordre) : ${p.attendu}` : ''}
PLAN COMPLET IMPOSÉ : ${plan.map((x, k) => `${k + 1}. ${x.title}`).join(' ; ')}. Ne traite ici que ce qui relève de cette partie.

LONGUEUR : ${budget(p)} mots environ, JAMAIS plus de ${Math.round(budget(p) * 1.1)} mots. Style dense et factuel : chaque phrase apporte un fait, un chiffre, une méthode ou un engagement ; aucune phrase d'introduction, de transition ou de conclusion, aucune formule creuse. Les tableaux compacts sont bienvenus (dispositif, fréquences, délais, engagements).
SUR-MESURE : reprends les exigences réelles du CCTP (sites, horaires, postes, délais, fréquences, documents, matériel) avec leurs chiffres exacts et engage GSS dessus (sans montant de pénalité) ; décris le site d'après le DCE quand la partie s'y rapporte. N'invente JAMAIS une information absente du DCE et des éléments GSS fournis.
- Organigramme : quand tu cites l'encadrement, reprends l'ORGANIGRAMME GSS DE RÉFÉRENCE à l'identique.
- Lots : ne cite que les sites et prestations du lot de la réponse.
- ETP : calcule-les à partir des heures réelles (un poste 24 h/24 toute l'année = 8 760 h ≈ 5,5 ETP sur une base de 1 607 h par ETP).
- Numéros d'autorisation, d'agrément ou SIRET : recopie-les exactement tels qu'au registre.
- Ne mentionne jamais tes propres consignes ni ce que « GSS indique » : écris directement l'engagement ou l'organisation.
- Aucun montant de pénalité (GSS s'engage sur l'obligation, pas sur la sanction) ; ne décris pas la composition du dossier de l'offre (pièces remises, nombre de pages, visite) ; pas de bloc de code.${schemaDe(p.id)?.id === 'organigramme' ? "\n- L'organigramme GSS est inséré automatiquement en schéma à la fin de cette partie : ne le recopie pas, ne crée pas de sous-titre « Organigramme », n'écris aucun emplacement ni aucune mention de schéma ; cite les responsables utiles dans les phrases." : ''}
- AUCUNE RÉPÉTITION : les parties déjà rédigées sont fournies ; ne redis rien de ce qu'elles contiennent (ni référence client, ni délai, ni dispositif déjà décrits) — au besoin, renvoie en quelques mots à la partie concernée (« cf. partie 2 »).${prix ? `
- COHÉRENCE DU PRIX (décomposition justificative) : pars des volumes du CCTP — pour chaque poste : horaires, jours, heures annuelles, qualification (ADS, SSIAP 1, SSIAP 2, chef d'équipe…) — et présente-les en tableau avec le total d'heures et les ETP. Explique ensuite la composition du prix horaire (salaire conventionnel IDCC 1351 selon la qualification, majorations de nuit, dimanche et jours fériés, primes conventionnelles, charges sociales, encadrement et contrôles, formation, équipements et outils, frais de structure). Les montants et taux ne sont pas connus : ne les invente pas, insère à leur place une seule ligne [CONSULTATION REQUISE : taux horaires par qualification et montants de la décomposition, cohérents avec le bordereau de prix remis].` : ''}

${REGLES_REUTILISATION}
- Si — et SEULEMENT si — GSS n'a aucune réponse à une exigence, n'invente rien : insère sur sa propre ligne exactement \`[CONSULTATION REQUISE : <information précise à obtenir auprès de GSS>]\`.${repartition ? this.blocDemande({ forme: repartition.forme, points: repartition.parRubrique[p.id] || [] }) : this.blocDemande()}

FORME : ne répète pas le titre de la partie ; sous-titres « ## » courts ; paragraphes courts et listes à puces ; gras (**…**) pour les chiffres et engagements forts ; pas de conclusion.`;
      const reqBlock = reqs.length
        ? `\n\nEXIGENCES DU CCTP À TRAITER DANS CETTE PARTIE (chacune explicitement, avec son chiffre exact et l'engagement de GSS ; si le DCE fixe un minimum, l'engagement le respecte) :\n${reqs.map((r: any) => `- ${r.exigence}\n  Réponse GSS connue : ${r.reponseGss || '(non documentée)'}`).join('\n')}`
        : '';
      const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${analysisJson}\n\nDOCUMENTATION GSS :\n${gssFullContext.slice(0, 25_000)}${blocMemoires(passages)}${registreGss}${reqBlock}${precedentes ? `\n\nPARTIES DÉJÀ RÉDIGÉES (ne rien répéter) :\n${precedentes}` : ''}\n\nRédige la partie « ${p.title} ».`;
      let texte: string | null = null;
      for (let essai = 1; essai <= 3 && !(texte && texte.split(/\s+/).length >= 120); essai++) {
        const t = await this.callOpenAI([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], 0.4, `Format court ${p.id}${essai > 1 ? ` (essai ${essai})` : ''}`, false);
        if (t && (!texte || t.length > texte.length)) texte = t;
      }
      // Contrôle de couverture : une exigence oubliée est ajoutée en une ligne, avec son chiffre.
      if (texte && reqs.length) {
        try {
          const verif = await this.callOpenAI([
            { role: 'system', content: `On te donne une partie de mémoire technique et une liste numérotée d'exigences du CCTP. Pour chaque exigence qui n'est PAS traitée explicitement dans le texte (avec son chiffre s'il y en a un), rédige UNE puce d'engagement de GSS, courte et factuelle, avec le chiffre exact (sans pénalité, sans inventer de moyen absent de la « réponse GSS connue » ; si GSS n'a pas de réponse connue, engage GSS à respecter l'exigence telle qu'écrite). Jamais « s'engage à confirmer » ni « s'engage à formaliser » : écris l'engagement lui-même. Une exigence déjà traitée dans le texte, même formulée autrement, n'est PAS reprise. Ne cite jamais le numéro d'une exigence. Ignore les exigences qui portent sur la composition du dossier de l'offre (pièces à remettre, nombre de pages du mémoire, visite, signature) : elles ne s'écrivent pas dans le mémoire. Pas de numéro en tête de puce. Renvoie UNIQUEMENT un objet JSON : {"puces": ["…"]} (liste vide si tout est couvert).` },
            { role: 'user', content: `TEXTE :\n${texte}\n\nEXIGENCES :\n${reqs.map((r: any, k: number) => `${k + 1}. ${r.exigence} (réponse GSS connue : ${r.reponseGss || '—'})`).join('\n')}` },
          ], 0.1, `Couverture ${p.id}`, true);
          // « GSS indiquera / précise dans le mémoire… », sous-traitance, pièces de l'offre : jamais remis (motifRefusEngagement).
          const puces = (JSON.parse(verif || '{}').puces || []).map((x: any) => sansClauseSanction(String(x).trim().replace(/^(?:[-•]\s*)?\d+[.)]\s+/, ''))).filter((x: string) => x && !motifRefusEngagement(x));
          if (puces.length) texte = `${texte.trim()}\n\n## Engagements sur les exigences du cahier des charges\n\n${puces.map((x: string) => `- ${x.replace(/^[-•]\s*/, '')}`).join('\n')}`;
        } catch { /* contrôle facultatif */ }
      }
      if (texte) {
        const nettoye = retirerCommentairesInternes(texte);
        texte = nettoye.texte;
        nettoye.retires.forEach((x) => commentairesRetires.add(`À confirmer : ${x}`));
        const delais = delaisHorsNormandie(texte, dceContext, horsNormandie);
        texte = delais.texte;
        delais.retires.forEach((x) => commentairesRetires.add(`${libelleDelaiRetire(analysisData, dceContext)}${x}`));
      }
      sections[p.id] = (texte || '').replace(/^#\s+[^\n]*\n+/, '').trim();
    }

    onProgress?.(78, 'Contrôle des répétitions entre parties…');
    await this.dedoublonnerRubriques(sections, plan);
    await this.corrigerContradictions(sections, plan, [...obligationsChiffrees(dceContext).map((o) => ({ exigence: o.phrase })), ...requirementsMatrix, ...horairesImposes(dceContext).map((h) => ({ exigence: `Horaire imposé : ${h}` }))]);
    await this.verifierHoraires(sections, plan, dceContext);
    await this.engagementsChiffresManquants(sections, plan, dceContext);
    const remarquesCourt = await this.remarquesCahierDesCharges(dceContext);
    if (remarquesCourt) {
      const cible = plan.find((p) => /enjeux|compr[ée]hension/i.test(p.title)) || plan[plan.length - 1];
      if (cible && sections[cible.id] !== undefined) sections[cible.id] = `${sections[cible.id].trim()}\n\n${remarquesCourt}`;
    }
    limiterReferences(sections, plan.map((p) => p.id), '');
    limiterRappelsSite(sections, plan.map((p) => p.id));

    // ── Points à compléter (même logique que la réponse libre) ──
    const consultations = new Set<string>([
      ...this.alertesFormat, ...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext), ...alerteCadreAbsent(dceContext), ...questionLieuInconnu(analysisData, dceContext),...commentairesRetires, ...confirmationsRegistreUtilisees(Object.values(sections).join('\n'), horsNormandie)]);
    for (const r of requirementsMatrix) if ((r.couverture || '').toLowerCase().includes('écart') && r.exigence && !PIECES_OFFRE.test(r.exigence)) consultations.add(r.exigence.trim());
    const markerRe = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;
    const demandes: Array<{ texte: string; repere?: number }> = [...consultations].filter(Boolean).map((texte) => ({ texte }));
    let nRepere = 0;
    for (const id of Object.keys(sections)) {
      sections[id] = sections[id].replace(markerRe, (_m: string, q: string) => { nRepere++; demandes.push({ texte: String(q).trim(), repere: nRepere }); return REPERE(nRepere); });
    }

    // ── Rendu mesuré ; condensation tant que la limite du RC est dépassée ──
    const cover = await this.getCoverInfo(dossierId, analysisData);
    // L'organigramme (exigé par le RC dans la partie « moyens humains ») n'est jamais retiré pour gagner de la place.
    const schemas: Record<string, string> = Object.fromEntries(choixSchemas.map((c) => [c.id === 'organigramme' ? `${c.cle}#court#organigramme` : `${c.cle}#court`, c.svg]));
    let rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    for (let tour = 1; rendu.pages > format.pagesMax && tour <= 3; tour++) {
      const ratio = (format.pagesMax / rendu.pages) * 0.92;
      onProgress?.(86, `Le mémoire fait ${rendu.pages} pages pour ${format.pagesMax} autorisées : condensation (passe ${tour})…`);
      for (const p of plan) {
        const t = sections[p.id];
        const mots = t.split(/\s+/).length;
        const r = await this.callOpenAI([
          { role: 'system', content: `Tu condenses une partie de mémoire technique pour tenir dans la limite de pages du règlement de consultation. Cible : ${Math.round(mots * ratio)} mots au plus (actuellement ${mots}). Conserve TOUS les chiffres, délais, fréquences, noms, engagements et exigences du CCTP traitées, les tableaux (compactés) et les repères de la forme ⟦AC:n⟧ à l'identique ; fusionne les puces d'engagements dans le texte ; supprime les redites et les phrases générales. Même format Markdown (## sous-titres, puces, gras). Renvoie uniquement le texte.` },
          { role: 'user', content: t },
        ], 0.2, `Condensation ${p.id}`, false);
        const reps = (x: string) => (x.match(/⟦AC:\d+⟧/g) || []).sort().join();
        if (r && r.split(/\s+/).length < mots && reps(r) === reps(t)) sections[p.id] = r.replace(/^#\s+[^\n]*\n+/, '').trim();
      }
      rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    }

    const questionsGss = await this.consoliderAvecSources(demandes.map((d) => d.texte), { dce: dceContext, horsNormandie: horsNormandie });
    const elements: ElementACompleter[] = questionsGss.map((q, i) => {
      const reperes = [...new Set(q.sources.map((k) => demandes[k]?.repere).filter((x): x is number => typeof x === 'number'))];
      const id = reperes.length ? Object.keys(sections).find((k) => sections[k].includes(REPERE(reperes[0]))) : undefined;
      let contexte = '';
      if (id) {
        const t = sections[id];
        const pos = t.indexOf(REPERE(reperes[0]));
        contexte = `${plan.find((x) => x.id === id)?.title || ''} — …${t.slice(Math.max(0, pos - 220), pos).replace(REPERE_RE, '').replace(/^[^\s⟦]*⟧/, '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim()}`;
      }
      return { cle: `Q${i + 1}`, question: q.question, contexte, statut: 'ouvert', reperes, pourAcheteur: /^À demander à l.acheteur/i.test(q.question) };
    });
    await this.completerParLesMemoires(elements, sections, horsNormandie);
    for (const id of Object.keys(sections)) sections[id] = nettoyerStructure(interditsDce(delaisHorsNormandie(fondementReprise(retirerCommentairesInternes(sections[id]).texte, dceContext), dceContext, horsNormandie).texte, dceContext));
    // Complétions reprises des mémoires : le PDF est recomposé si un repère a été rempli.
    rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    const consultationList = questionsUniques(elementsSansDoublon(elements));
    if (rendu.pages > format.pagesMax) consultationList.push(`Le mémoire fait ${rendu.pages} pages pour ${format.pagesMax} autorisées par le RC : à raccourcir avec l'assistant avant la remise.`);
    consultationList.push(...this.controlePagesParPartie(rendu.filePath, format, plan));
    console.log(`[MemoireGenerator] Format court : ${rendu.pages} page(s) / ${format.pagesMax} autorisée(s).`);

    try {
      ecrireEtat({
        dossierId, mode: 'libre', fichier: rendu.filePath, majLe: '', elements: elementsSansDoublon(elements), reponsesTraitees: [],
        libre: { sections, schemas, cover, court: { pagesMax: format.pagesMax, plan, source: format.source }, theme: themeActif() },
        demande: this.demandeParticuliere?.demande || undefined,
      });
    } catch (e: any) {
      console.warn(`[MemoireGenerator] État de complétion non enregistré (non bloquant) : ${e?.message || e}`);
    }
    const generatedData: Record<string, string> = { 'Format imposé par le RC': `${format.pagesMax} pages maximum — mémoire de ${rendu.pages} page(s)` };
    consultationList.forEach((c, i) => { generatedData[`⚠ Consultation requise #${i + 1}`] = c; });
    return { filePath: rendu.filePath, generatedData, consultations: consultationList };
  }

  /**
   * Format court imposé par le RC, construit sur le MÉMOIRE TYPE (consigne 5 du dirigeant : « on reprend exactement le
   * mémoire de base et on ne l'adapte que sur la construction ») : plan et limite de pages du RC inchangés ; chaque
   * partie du RC assemble, dans l'ordre du mémoire type, les textes publipostés des rubriques qui lui sont rattachées
   * (rubriques « adapte » : modifications ciblées contrôlées, comme la réponse libre v2) ; la limite de pages est tenue
   * d'abord en retirant les sous-parties puis les rubriques les moins prioritaires, ensuite seulement par condensation
   * (acceptée si au moins 90 % des phrases restent celles de GSS : SEUIL_FIDELITE, décision D7). Un élément attendu par le RC qu'aucune rubrique ne
   * traite est rédigé comme avant et signalé à GSS comme proposition. Contrôles, schémas, rendu et état : inchangés.
   */
  private async genererFormatCourtMT(
    dossierId: string,
    dceContext: string,
    analysisData: any,
    format: FormatImpose,
    mt: MemoireType,
    onProgress?: (progress: number, message: string, status?: string) => void,
  ): Promise<{ filePath: string, generatedData: Record<string, string>, consultations: string[] }> {
    mt = vocabulaireMemoireType(mt, dceContext);
    const plan = format.plan;
    const progres = (p: number, m: string) => onProgress?.(p, m);
    console.log(`[MemoireGenerator] ═══ Format court sur le mémoire type : ${format.pagesMax} pages, ${plan.length} parties ═══`);
    progres(12, `Format imposé par le RC : ${format.pagesMax} pages maximum, ${plan.length} parties — mémoire type de GSS réordonné…`);

    // ── 1. Mémoire type publiposté pour ce marché, matrice des exigences sur ses rubriques, valeurs imposées ──
    const referents = await this.getGssReferents();
    actualiserOrganigramme(referents);
    const cover = await this.getCoverInfo(dossierId, analysisData);
    const horsNormandie = marcheHorsNormandie(analysisData, dceContext);
    const ctxBase: ContexteMarche = { analyse: analysisData, dce: dceContext, cover, referents, horsNormandie };
    // Effectifs proposés à partir des postes et des horaires du DCE (proposition à valider par GSS, D5), comme en réponse
    // libre : sans eux, le tableau de l'équipe dédiée restait à « [À COMPLÉTER] » (génération réelle imm 15).
    ctxBase.dimensionnement = await this.dimensionner(dceContext, '', dossierId);
    let prep: MemoirePrepare = preparerMemoireType(ctxBase, { memoireType: mt });
    const gssDocs = await this.getGssDocumentation();
    if (valeurRegistre('effectif_total')) for (const k of Object.keys(gssDocs)) if (/^EFFECTIFS/i.test(k)) delete gssDocs[k];
    const gssFullContext = this.buildFullGssContext(gssDocs, 3000, 60_000);
    const perimetre = await this.perimetreMarche(dceContext);
    progres(15, 'Analyse des exigences du CCTP et rattachement au mémoire type…');
    const rubriquesMatrice = mt.rubriques.filter((r) => r.ancienne_rubrique !== 'b_references').map((r) => ({ id: r.id, title: r.titre }));
    // Lignes d'une grille de pénalités (T3-CONS-8) : jamais des exigences de prestation (ni question nouvelle, ni engagement).
    const matrice = (await this.analyzeRequirements(dceContext, gssFullContext, rubriquesMatrice, { themes: themesPourMatrice(prep.plan), nouvelles: true }))
      .filter((e: any) => !exigenceDeGrillePenalites(String(e?.exigence || ''), dceContext));
    prep = preparerMemoireType({ ...ctxBase, matrice }, { memoireType: mt });
    const appelAnalyse: AppelModele = async (messages, libelle) => (await this.callOpenAI(messages, 0.1, libelle, true, 'analyse')) ?? '';
    const imposees = valeursImposeesValides((await extraireValeursImposees(mt, dceContext, prep.variables, appelAnalyse)).imposees);
    if (Object.keys(imposees.valides).length) prep = preparerMemoireType({ ...ctxBase, matrice, imposees: imposees.valides }, { memoireType: mt });
    const planMT = prep.plan;
    const mtParId = new Map(mt.rubriques.map((r) => [r.id, r]));

    // ── 2. Construction : chaque rubrique du mémoire type rattachée à une partie du RC (titres et attendus seulement) ──
    progres(18, 'Rattachement des rubriques du mémoire type aux parties imposées par le RC…');
    const rep = lireRepartition((await this.callOpenAI(consigneRepartition(mt, planMT, plan), 0.1, 'Format court : répartition du mémoire type', true, 'analyse')) || '', mt, planMT, plan);
    console.log(`[MemoireGenerator] Format court — répartition (${rep.source}) : ${plan.map((p) => `${p.id} ${rep.parPartie[p.id].length} rubrique(s)${rep.nonCouverts[p.id]?.length ? `, ${rep.nonCouverts[p.id].length} attendu(s) hors mémoire type` : ''}`).join(' | ')}.`);
    const repartition = await this.repartirDemande(planMT.rubriques.map((r) => ({ id: r.id, title: r.titre })));
    // Demande particulière : points de fond, forme et passages du document complémentaire (sources GSS autorisées).
    const demandeMT = this.demandeMemoireType(repartition);
    const publiees = publierMemoire(prep, { marquerConsultations: true });
    const textes: Record<string, string> = {};
    for (const p of publiees) if (p.texte) textes[p.id] = p.texte;
    // Phrases de GSS adaptées au CCTP (D8), comme en réponse libre.
    const suivi = this.suiviAdaptations(dossierId, mt, { ...ctxBase, matrice, imposees: imposees.valides }, publiees.filter((p) => p.texte).map((p) => p.id), publiees.map((p) => p.texte || ''), { marquerConsultations: true });
    const { parRubrique, nouvelles: nouvellesMatrice } = exigencesParRubrique(mt, planMT, matrice);
    const tri = trierNouvelles(mt, planMT, nouvellesMatrice);
    for (const [id, l] of Object.entries(tri.rattachees)) (parRubrique[id] ||= []).push(...l);
    const besoin = donneesBesoin(prep, ctxBase);
    const analyseResumee = analyseCompacte(analysisData);

    // ── 3. Compréhension du besoin, si une partie du RC la demande ──
    const b1 = planMT.rubriques.find((r) => r.mode === 'besoin');
    const partieB1 = b1 ? plan.find((p) => rep.parPartie[p.id].includes(b1.id)) : undefined;
    const avisSecours: string[] = [];
    // Consigne 3 : la compréhension du besoin a toujours son schéma de process, même au format court (dans le texte).
    let svgComprehension: string | undefined;
    /** Formalités de l'offre retirées du bloc 1 (T6-CONS-12) : posées à GSS. */
    const formalitesBloc1Court: string[] = [];
    if (b1 && partieB1) {
      progres(22, 'Notre compréhension de votre besoin…');
      const c = await this.redigerComprehension(prep, ctxBase, besoin, {
        perimetre, exigences: matrice.filter((e) => e.exigence && !PIECES_OFFRE.test(e.exigence)), analyse: analyseResumee,
        // Format court : process dessiné sur toile portrait, affiché en grand en tête de sa partie (consigne 3).
        demande: await demandeMT.consigne(b1.id, b1.titre), format: 'page',
      });
      textes[b1.id] = c.texte;
      svgComprehension = c.svg;
      formalitesBloc1Court.push(...c.formalites);
      // Consigne 3 : jamais de compréhension sans schéma ; le format court n'a pas de schéma construit au rendu.
      if (!c.svg) avisSecours.push(`Partie « ${partieB1.title} » : le schéma de process de la compréhension du besoin n'a pas pu être dessiné ; à demander via l'assistant avant la remise.`);
      if (c.secours) avisSecours.push(`Partie « ${partieB1.title} » : compréhension du besoin construite à partir des données du DCE (rédaction automatique indisponible), à relire.`);
    }

    // Exigences du CCTP par partie (contrôle de couverture) : celles des rubriques rattachées, puis les questions nouvelles
    // (sauf pièces administratives de l'offre). Le format court n'en garde que les plus importantes (bloquantes, chiffrées),
    // 8 au plus par partie, et au plus 6 engagements ajoutés : la place va d'abord au texte de GSS (génération réelle imm :
    // sans plafond, les engagements occupaient 31 % du mémoire).
    const exigencesDe: Record<string, any[]> = Object.fromEntries(plan.map((p) => [p.id, rep.parPartie[p.id].flatMap((id) => parRubrique[id] || [])]));
    const formalitesCourt = tri.nouvelles.filter((e) => e?.exigence && FORMALITES_OFFRE.test(`${e.sujet || ''} ${e.exigence}`));
    const nouvellesCourt = tri.nouvelles.filter((e) => e?.exigence && !PIECES_OFFRE.test(e.exigence) && !PIECES_ADMINISTRATIVES.test(`${e.sujet || ''} ${e.exigence}`) && !formalitesCourt.includes(e));
    for (const e of nouvellesCourt) exigencesDe[partiePourTexte(plan, `${e.sujet || ''} ${e.exigence}`).id].push(e);
    const questionsCouverture = new Set<string>();
    const sourcesCouverture = new Map<string, string>();
    const reqsCouverture = (pid: string) => {
      const rang = (e: any) => (/bloquant/i.test(e.criticite || '') ? 0 : /\d/.test(e.exigence) ? 1 : 2);
      return exigencesDe[pid].filter((e: any) => e?.exigence && !PIECES_OFFRE.test(e.exigence) && !PIECES_ADMINISTRATIVES.test(e.exigence))
        .map((e: any, i: number) => ({ e, i })).sort((a: any, b: any) => rang(a.e) - rang(b.e) || a.i - b.i).slice(0, 8).map((x: any) => x.e);
    };
    const reserveEngagements = (pid: string) => Math.min(6, reqsCouverture(pid).length) * 25;

    // ── 4. Budget de mots par partie et sélection par priorité (aucune réécriture) ──
    const nbSchemas = Math.max(1, Math.floor(format.pagesMax / 4));
    // Schéma de process de la compréhension : il passe avant le choix de la bibliothèque pour sa partie et s'ajoute aux
    // autres (sous 6 pages, il prend la place du seul schéma permis).
    const choixTous = choisirSchemasGss(plan.map((p) => ({
      cle: p.id, question: `${p.title} ${p.attendu || ''}`, texte: '',
      ...(svgComprehension && p.id === partieB1?.id ? { svg: svgComprehension, svgId: 'comprehension' } : {}),
    })), undefined, { vocabulaire: vocabulaireSchemasDuMarche(dceContext, prep.variables) });
    const schemaProcess = choixTous.filter((c) => c.id === 'comprehension');
    const choixSchemas = [...schemaProcess, ...choixTous.filter((c) => c.id !== 'comprehension').slice(0, schemaProcess.length && format.pagesMax < 6 ? nbSchemas - 1 : nbSchemas)]
      // Organigramme : toile portrait, affiché en grand (noms lisibles) au lieu d'une vignette paysage.
      .map((c) => (c.id === 'organigramme' ? { ...c, svg: organigrammeSvg('page', themeActif()) || c.svg } : c));
    // Densité mesurée du rendu à 10 pt : 710 à 760 mots par page pleine. La sélection est volontairement large : c'est le
    // rendu mesuré (étape 9) qui tranche, en retirant les passages de plus faible priorité jusqu'à tenir la limite.
    // Un schéma dans le texte compte pour 200 mots ; un schéma en grand (process, organigramme : 150 mm) pour 420.
    const motsTotal = Math.max(900, format.pagesMax * 760 - choixSchemas.reduce((s, c) => s + (c.id === 'comprehension' || c.id === 'organigramme' ? 420 : 200), 0) - 120);
    const poids: Record<string, number> = Object.fromEntries(plan.map((p) => [p.id, poidsPartie(p)]));
    const sommePoids = plan.reduce((s, p) => s + poids[p.id], 0) || 1;
    // Rubrique qui répond directement à un élément cité par le RC (« démarche RSE », « organigramme »…) : jamais retirée
    // en entier ; rubrique placée faute de mieux (non rattachée par le modèle) : retirée en premier.
    const essentielles = new Set(plan.flatMap((p) => [...rubriquesEssentielles(mt, p, rep.parPartie[p.id], rep.secondaires)]));
    const infosDe = (pid: string) => rep.parPartie[pid].filter((id) => (textes[id] || '').trim()).map((id) => {
      const r = mtParId.get(id)!;
      // La référence du secteur du client garde sa priorité même placée faute de mieux (client de santé : référence santé).
      return { id, titre: r.titre, priorite: rep.secondaires.includes(id) && id !== planMT.secteurReference?.id ? 4 : r.priorite, sousParties: r.sous_parties, texte: textes[id], garder: r.mode === 'besoin' || essentielles.has(id) };
    });
    // Part réservée aux éléments attendus par le RC hors mémoire type (rédigés à part, proposés à GSS).
    const aCompleterRC = (pid: string) => !!rep.nonCouverts[pid]?.length || !infosDe(pid).length;
    const besoinsMots: Record<string, number> = Object.fromEntries(plan.map((p) => [p.id, infosDe(p.id).length
      ? motsPartie(infosDe(p.id)) + (aCompleterRC(p.id) ? 200 : 0)
      : (motsTotal * poids[p.id]) / sommePoids]));
    const budgets = repartirBudget(besoinsMots, poids, motsTotal);
    const budgetComplement = (pid: string) => (!infosDe(pid).length ? budgets[pid] : aCompleterRC(pid) ? Math.min(300, Math.max(120, Math.round(budgets[pid] * 0.25))) : 0);
    const retenues: Record<string, string[]> = {};
    const retraitsSelection: string[] = [];
    for (const p of plan) {
      const sel = selectionnerParPriorite(infosDe(p.id), Math.max(150, budgets[p.id] - budgetComplement(p.id) - reserveEngagements(p.id)));
      retenues[p.id] = sel.gardees;
      for (const id of sel.gardees) textes[id] = sel.textes[id];
      retraitsSelection.push(...sel.retraits);
    }
    if (retraitsSelection.length) console.log(`[MemoireGenerator] Format court — sélection (${motsTotal} mots pour ${format.pagesMax} pages) : ${retraitsSelection.length} passage(s) du mémoire type non repris : ${retraitsSelection.join(' ; ')}.`);

    // ── 5. Adaptation ciblée des rubriques « adapte » retenues (et des rubriques fixes visées par la demande particulière) ──
    const registreGss = blocRegistre(horsNormandie) + organigrammeGss(referents);
    const appelAdaptation: AppelModele = async (messages, libelle) => {
      const user = String(messages[1]?.content || '');
      const coupe = user.indexOf('\n\nRUBRIQUE : ');
      const msgs = coupe > 0 ? [messages[0], { role: 'user', content: user.slice(0, coupe) }, { role: 'user', content: user.slice(coupe + 2) }] : messages;
      return (await this.callOpenAI(msgs, 0.2, libelle, true, 'redaction', coupe > 0 ? 1 : 0)) ?? '';
    };
    const toutesRetenues = plan.flatMap((p) => retenues[p.id]);
    const rubriquesExcluesCourt: string[] = [];
    const nonAdapteesCourt: string[] = [];
    const aAdapter = toutesRetenues.map((id) => planMT.rubriques.find((r) => r.id === id)!).filter((r) => r && (r.mode === 'adapte' || (r.mode === 'fixe' && repartition?.parRubrique[r.id]?.length)));
    let adaptees = 0;
    await enParallele(aAdapter, 4, async (rp) => {
      const r = mtParId.get(rp.id)!;
      const avantAdaptation = textes[rp.id];
      const res = await adapterRubrique({ ...r, mode: 'adapte' }, textes[rp.id], {
        client: besoin.client, exigences: parRubrique[rp.id] || [], obligations: obligationsPourRubrique(r, dceContext), perimetre,
        analyseCompacte: analyseResumee, registre: registreGss, demande: await demandeMT.consigne(rp.id, r.titre),
        dce: dceContext, horsNormandie,
      }, appelAdaptation, {
        nombresAutorises: [registreGss, this.texteDemande()], nomsAutorises: [registreGss, referents, this.texteDemande()],
        // Sujets traités par les autres rubriques gardées : pas de « [À COMPLÉTER] » ajouté sur eux.
        titresTraites: toutesRetenues.filter((id) => id !== rp.id).map((id) => mtParId.get(id)?.titre || '').filter(Boolean),
        // D8 (T2-CONS-3) : une phrase de GSS n'est modifiée que si une phrase du DCE le fonde ; elle est alors signalée à GSS.
        fondement: (m, ph) => fondementDansDce(m, ph, dceContext),
      });
      textes[rp.id] = res.texte;
      suivi.noter(rp.id, avantAdaptation, res.texte, (c) => exigenceDeModification(c, res.appliquees), ETAPE_ADAPTATION_MODELE);
      // Mission niée par le cahier des charges : rubrique non reprise, signalée (T5CP-1) ; échec du modèle signalé (T5-COH-2).
      if (res.missionExclue) { textes[rp.id] = ''; rubriquesExcluesCourt.push(`Rubrique « ${r.titre} » non reprise : le cahier des charges exclut la mission qu'elle décrit (à la place de « ${phraseLisible(res.missionExclue.extrait, 160)} », le modèle proposait « ${phraseLisible(res.missionExclue.par, 160)} »). Si GSS assure bien cette mission sur ce marché, demandez via l'assistant de la rétablir.`); }
      if (res.repli && /appel au modèle impossible|réponse du modèle illisible/.test(res.raison || '')) nonAdapteesCourt.push(r.titre);
      adaptees++;
      progres(26 + Math.round((24 * adaptees) / Math.max(1, aAdapter.length)), `Adaptation au CCTP : ${adaptees}/${aAdapter.length} rubrique(s)…`);
      console.log(`[MemoireGenerator] Adaptation ${rp.id} : ${res.appliquees.length} modification(s) appliquée(s), ${res.refusees.length} refusée(s), fidélité ${res.fidelite.toFixed(2)}${res.repli ? ` — texte de référence conservé (${res.raison})` : ''}.`);
    });

    // Renvois « au bloc n » de la compréhension : le mémoire suit les parties du RC → renvoi à la partie qui reprend
    // réellement les rubriques du bloc, ou renvoi retiré si aucune ne les reprend.
    if (b1 && textes[b1.id]) textes[b1.id] = renvoisVersParties(textes[b1.id], planMT.blocs, plan, retenues, Object.fromEntries(planMT.rubriques.map((r) => [r.id, r.titre])));

    // ── 6. Assemblage dans l'ordre du RC ; éléments attendus hors mémoire type rédigés à part (propositions) ──
    const sections: Record<string, string> = {};
    const propositions: string[] = [];
    // Propositions de l'IA par partie (titres rédigés), pour le premier message de l'assistant et l'action « valider » (D5).
    const propositionsCourt: Array<{ pid: string; titres: string[]; dansLeTexte: boolean; phrase?: string }> = [];
    const analysisJson = JSON.stringify(analysisData, null, 2);
    const registreComplet = registreGss + referencesGss() + this.blocPerimetre(perimetre);
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      progres(52 + Math.round((i / plan.length) * 14), `Partie ${i + 1}/${plan.length} : ${p.title}…`);
      let texte = assemblerPartie(retenues[p.id].map((id) => ({ titre: mtParId.get(id)!.titre, texte: textes[id] })));
      if (aCompleterRC(p.id)) {
        const elements = rep.nonCouverts[p.id]?.length ? rep.nonCouverts[p.id] : [p.attendu || p.title];
        const complement = await this.redigerComplementCourt(p, elements, budgetComplement(p.id), texte, {
          format, analysisJson, gssFullContext, registre: registreComplet, clientName: analysisData?.clientName || 'le client',
          precedentes: plan.slice(0, i).filter((x) => sections[x.id]).map((x) => `### ${x.title}\n${sections[x.id]}`).join('\n\n'),
          document: await demandeMT.passages(`${p.title}. ${elements.join(' ; ')}`),
        });
        if (complement) {
          texte = `${texte}\n\n${complement}`.trim();
          propositions.push(`Proposition de réponse à valider (attendu du RC que le mémoire type de GSS ne traite pas) : ${p.title} — ${elements.join(' ; ')}`.slice(0, 400));
          const sousTitres = [...complement.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
          propositionsCourt.push({ pid: p.id, titres: sousTitres.length ? sousTitres : [elements.join(' ; ')], dansLeTexte: sousTitres.length > 0 });
        }
      }
      // Contrôle de couverture conservé : une exigence du CCTP que la partie ne traite pas devient un engagement.
      const reqs = reqsCouverture(p.id);
      if (texte && reqs.length) texte = plafonnerEngagements(nettoyerEngagements(await this.completerCouverture(texte, reqs, p.id, horsNormandie, questionsCouverture, sourcesCouverture)), 6);
      sections[p.id] = texte.trim();
    }
    // Poste et horaires déjà repris par le dimensionnement : couverts par la partie (engagement), sans proposition à part.
    // Annoncées « en engagement dans la partie X » seulement après vérification sur le texte final (étape 10, T6N-3).
    const nouvellesEnEngagement = grouperNouvelles(nouvellesCourt.filter((e) => !exigenceDePosteDimensionne(`${e.sujet || ''} ${e.exigence}`, ctxBase.dimensionnement)), 6).groupes
      .map((g) => ({ g, partie: partiePourTexte(plan, `${g.sujet} ${g.exigences.map((e) => e.exigence).join(' ')}`) }));

    // ── 7. Filtres, contrôles de cohérence avec le CCTP (inchangés), remarques ──
    const commentairesRetires = new Set<string>();
    for (const id of Object.keys(sections)) {
      const nettoye = retirerCommentairesInternes(protegerGras(sections[id]));
      nettoye.retires.forEach((x) => commentairesRetires.add(`À confirmer : ${retablirGras(x)}`));
      const delais = delaisHorsNormandie(retablirGras(nettoye.texte), dceContext, horsNormandie);
      delais.retires.forEach((x) => commentairesRetires.add(`${libelleDelaiRetire(analysisData, dceContext)}${x}`));
      suivi.noterFiltres(id, retablirGras(nettoye.texte), delais.texte, dceContext, horsNormandie, analysisData);
      sections[id] = delais.texte;
    }
    progres(70, 'Cohérence avec les exigences chiffrées et les horaires du CCTP…');
    const exigencesCoherence = [...obligationsChiffrees(dceContext).map((o) => ({ exigence: o.phrase })), ...matrice, ...horairesImposes(dceContext).map((h) => ({ exigence: `Horaire imposé : ${h}` }))];
    await this.corrigerContradictions(sections, plan, exigencesCoherence, toutesRetenues.flatMap((id) => phrasesGeneralesProtegees(mtParId.get(id)?.texte || '', textes[id] || '')), questionsCouverture, undefined, (id, a, b, e) => suivi.noterCoherence(id, a, b, e, exigencesCoherence.map((x) => String(x.exigence || ''))), undefined, dceContext);
    await this.verifierHoraires(sections, plan, dceContext, undefined, (id, a, b, e) => suivi.noterCoherence(id, a, b, e, [], 'Horaires du CCTP'));
    await this.engagementsChiffresManquants(sections, plan, dceContext);
    const remarquesCourt = await this.remarquesCahierDesCharges(dceContext);
    if (remarquesCourt) {
      const cible = partieB1 || plan.find((p) => /enjeux|compr[ée]hension/i.test(p.title)) || plan[plan.length - 1];
      if (cible && sections[cible.id] !== undefined) sections[cible.id] = `${sections[cible.id].trim()}\n\n${remarquesCourt}`;
    }
    const partieRefs = plan.find((p) => rep.parPartie[p.id].includes('b2_references_intro'))?.id || '';
    limiterReferences(sections, plan.map((p) => p.id), partieRefs);
    limiterRappelsSite(sections, plan.map((p) => p.id));

    // ── 8. Points à compléter (même logique que le format court d'avant) ──
    retirerQuestionsCouvertes(questionsCouverture, sourcesCouverture, suivi.exigencesNotees(), Object.values(sections).join('\n\n'));
    const confirmationsAvantSelection = confirmationsRegistreUtilisees(Object.values(sections).join('\n'), horsNormandie);
    const consultations = new Set<string>([
      ...alerteCadreAbsent(dceContext, this.cadreNonRemplissable || ''), ...questionLieuInconnu(analysisData, dceContext), ...commentairesRetires, ...questionsCouverture, ...formalitesCourt.map(questionFormalite), ...(!variableRenseignee(prep.variables.OBJET_MARCHE) && mt.variables.OBJET_MARCHE?.question ? [mt.variables.OBJET_MARCHE.question] : []), ...formalitesBloc1Court.filter((x) => !formalitesCourt.some((e: any) => typeFormalite(`${e.sujet || ''} ${e.exigence}`) === typeFormalite(x))).map((x) => questionFormalite({ exigence: x })), ...confirmationsAvantSelection,
      ...publiees.filter((p) => toutesRetenues.includes(p.id)).flatMap((p) => [...p.aConfirmer.map((x) => x.question), ...p.manquantes.filter((m) => !m.repere).map((m) => m.question)])
        .flatMap((q) => q.split('\n')).map((q) => q.trim()).filter(Boolean),
    ]);
    // Exigence en écart mais traitée dans le texte final (engagement de couverture, proposition) : pas de question à GSS.
    for (const r of matrice) if ((r.couverture || '').toLowerCase().includes('écart') && r.exigence && !PIECES_OFFRE.test(r.exigence) && !exigenceTraitee(r.exigence, Object.values(sections).join('\n\n'))) consultations.add(FORMALITES_OFFRE.test(r.exigence) ? questionFormalite(r) : r.exigence.trim());
    // Rubrique d'origine des questions du publipostage : une rubrique écartée ensuite par la sélection au rendu mesuré
    // n'a plus de question (imm 341 : PTI non reprise, question sur le délai PTI hors Normandie quand même posée).
    const rubriqueDeQuestion = new Map<string, string>();
    for (const p of publiees.filter((x) => toutesRetenues.includes(x.id))) {
      for (const q of [...p.aConfirmer.map((x) => x.question), ...p.manquantes.filter((m) => !m.repere).map((m) => m.question)].flatMap((x) => x.split('\n')).map((x) => x.trim()).filter(Boolean)) {
        if (!rubriqueDeQuestion.has(q)) rubriqueDeQuestion.set(q, p.id);
      }
    }
    const markerRe = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;
    const demandes: Array<{ texte: string; repere?: number }> = [...consultations].filter(Boolean).map((texte) => ({ texte }));
    let nRepere = 0;
    // T7N-4 : tableau dont plusieurs cases attendent une donnée (effectifs de l'équipe dédiée) suivi d'une seule consultation :
    // un repère et une question par case, précisée par sa ligne, comme en réponse libre (jamais un repère sous le tableau).
    const casesTableaux: Array<{ n: number; question: string; id: string }> = [];
    for (const id of Object.keys(sections)) {
      const rt = reperesDansTableaux(sections[id], nRepere);
      if (rt.demandes.length) { sections[id] = rt.texte; nRepere = rt.dernier; rt.demandes.forEach((d) => casesTableaux.push({ ...d, id })); }
    }
    for (const id of Object.keys(sections)) {
      sections[id] = sections[id].replace(markerRe, (_m: string, q: string) => { nRepere++; demandes.push({ texte: String(q).trim(), repere: nRepere }); return REPERE(nRepere); });
    }

    // ── 9. Rendu mesuré ; d'abord la sélection (passages entiers du mémoire type), ensuite seulement la condensation ──
    const infosRubriques = plan.flatMap((p) => infosDe(p.id));
    // Organigramme et schéma de process de la compréhension : jamais retirés pour gagner de la place.
    const schemas: Record<string, string> = Object.fromEntries(choixSchemas.map((c) => [c.id === 'organigramme' ? `${c.cle}#court#organigramme` : c.id === 'comprehension' ? `${c.cle}#court#process` : `${c.cle}#court`, c.svg]));
    // Nom de l'acheteur affiché (couverture, en-têtes) : forme corrigée de CLIENT (T1-COH-6).
    cover.client = nomAcheteurAffiche(prep.variables.CLIENT, cover.client);
    // Forme courte (« ENPC et IGN ») pour le pied de page d'un nom long (T3-CONS-1).
    cover.clientCourt = nomAcheteurCourtAffiche(prep.variables.CLIENT);
    // Intitulé du marché affiché : celui du mémoire, mis en casse normale s'il était en capitales (T2-CONS-14).
    if (typeof prep.variables.OBJET_MARCHE?.valeur === 'string' && prep.variables.OBJET_MARCHE.valeur.trim() && cover.title && cover.title === cover.title.toUpperCase()) cover.title = prep.variables.OBJET_MARCHE.valeur.trim();
    let rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    // Le rendu mesuré fait foi : on garde la plus grande part des passages de GSS qui tient dans la limite à la police
    // normale (10 pt), en retirant d'abord les passages de plus faible priorité (jamais de réécriture). Recherche par
    // dichotomie sur la part gardée de chaque partie ; aucune page laissée libre tant qu'un passage retiré y tient.
    // Limite par critère ou par partie (T2-GEN-9) : chaque partie mesurée sur le rendu doit aussi la tenir.
    const partiesTiennent = (pdf: string) => !format.pagesParPartie || pagesDesParties(pdf, plan.map((p) => p.title)).every((n) => n <= format.pagesParPartie!);
    const tientNet = (r: { pages: number; corps: number; filePath: string }) => r.pages <= format.pagesMax && r.corps >= 10 && partiesTiennent(r.filePath);
    if (!tientNet(rendu)) {
      const sectionsAvant = { ...sections };
      const motsAvant: Record<string, number> = Object.fromEntries(plan.map((p) => [p.id, motsPartie([{ titre: '', texte: sectionsAvant[p.id] || '' }])]));
      // s : part gardée du volume de chaque partie (un nombre pour toutes, ou une part propre à chaque partie).
      const selection = (s: number | Record<string, number>) => {
        const textesSel: Record<string, string> = { ...sectionsAvant };
        const retraitsSel: string[] = [];
        for (const p of plan) {
          if (!(sectionsAvant[p.id] || '').trim()) continue;
          const part = typeof s === 'number' ? s : s[p.id];
          if (part >= 1) continue;
          const sel = selectionnerDansPartie(sectionsAvant[p.id], infosRubriques, Math.round(motsAvant[p.id] * part));
          textesSel[p.id] = sel.texte;
          retraitsSel.push(...sel.retraits);
        }
        return { textes: textesSel, retraits: retraitsSel };
      };
      // Rendu d'origine compris : supprimé lui aussi s'il est remplacé par un essai retenu.
      const essais: string[] = [rendu.filePath];
      const rendre = async (textesSel: Record<string, string>) => {
        // Essai à 10 pt seulement : un essai qui ne tient pas n'est pas repris en police réduite.
        const r = await this.rendreCourtDepuisSections(textesSel, { pagesMax: format.pagesMax, plan }, cover, schemas, undefined, 10);
        essais.push(r.filePath);
        return r;
      };
      // Une erreur de rendu pendant la recherche (navigateur indisponible…) laisse le texte et le rendu d'avant intacts.
      try {
        progres(86, `Le mémoire fait ${rendu.pages} pages pour ${format.pagesMax} autorisées : sélection des passages prioritaires…`);
        const plancher = selection(0);
        let meilleur = { ...plancher, rendu: await rendre(plancher.textes) };
        if (tientNet(meilleur.rendu)) {
          let bas = 0;
          let haut = 1;
          for (let k = 0; k < 6; k++) {
            const s = (bas + haut) / 2;
            const essai = selection(s);
            const r = await rendre(essai.textes);
            if (tientNet(r)) { bas = s; meilleur = { ...essai, rendu: r }; } else haut = s;
          }
          // Affinage partie par partie : une part commune retire un passage dans chaque partie alors qu'un ou deux
          // suffisent ; on relève donc la part de chaque partie, l'une après l'autre, tant que le rendu tient à 10 pt.
          const parts: Record<string, number> = Object.fromEntries(plan.map((p) => [p.id, bas]));
          for (const p of plan) {
            if (!(sectionsAvant[p.id] || '').trim() || selection(parts).textes[p.id] === sectionsAvant[p.id]) continue;
            let b = parts[p.id];
            let h = 1;
            for (let k = 0; k < 3; k++) {
              const s = k === 0 ? 1 : (b + h) / 2;
              const essai = selection({ ...parts, [p.id]: s });
              if (essai.textes[p.id] === selection({ ...parts, [p.id]: b }).textes[p.id]) { if (k === 0) break; b = s; continue; }
              const r = await rendre(essai.textes);
              if (tientNet(r)) { b = s; meilleur = { ...essai, rendu: r }; if (s >= 1) break; } else h = s;
            }
            parts[p.id] = b;
          }
          Object.assign(sections, meilleur.textes);
          rendu = meilleur.rendu;
          console.log(`[MemoireGenerator] Format court — rendu mesuré : ${rendu.pages} page(s) / ${format.pagesMax} à 10 pt, part gardée ${plan.map((p) => `${p.id} ${Math.round(parts[p.id] * 100)} %`).join(', ')} ; ${meilleur.retraits.length} passage(s) non repris : ${meilleur.retraits.join(' ; ')}.`);
        }
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Format court — recherche de la mise en page à 10 pt interrompue (${e?.message || e}) : texte non modifié.`);
      }
      // PDF d'essai non retenus : supprimés (seul le rendu gardé reste).
      for (const f of essais) if (f !== rendu.filePath) { try { fs.unlinkSync(f); } catch { /* déjà absent */ } }
    }
    // Repli (le texte gardé ne tient pas à 10 pt même sans aucun passage retirable) : police réduite par le rendu, puis
    // sélection par passes et condensation si la limite reste dépassée.
    for (let tour = 1; rendu.pages > format.pagesMax && tour <= 3; tour++) {
      const ratio = (format.pagesMax / rendu.pages) * 0.92;
      progres(86, `Le mémoire fait ${rendu.pages} pages pour ${format.pagesMax} autorisées : sélection des passages prioritaires (passe ${tour})…`);
      const retraits: string[] = [];
      for (const p of plan) {
        const t = sections[p.id] || '';
        const cible = Math.round(motsPartie([{ titre: '', texte: t }]) * ratio);
        const sel = selectionnerDansPartie(t, infosRubriques, cible);
        retraits.push(...sel.retraits);
        sections[p.id] = sel.texte;
        // Condensation seulement si la sélection ne suffit pas, et refusée si moins de 90 % des phrases du texte condensé
        // viennent mot pour mot du texte de GSS (SEUIL_FIDELITE, décision D7) : la partie reste alors le texte de GSS sélectionné.
        const mots = motsPartie([{ titre: '', texte: sections[p.id] }]);
        if (mots <= cible * 1.05) continue;
        const r = await this.callOpenAI([
          { role: 'system', content: `Tu condenses une partie de mémoire technique pour tenir dans la limite de pages du règlement de consultation. Cible : ${cible} mots au plus (actuellement ${mots}). Le texte est celui de GSS : RETIRE des phrases ou des puces entières (redites, phrases générales) plutôt que de reformuler ; les phrases gardées restent MOT POUR MOT. Conserve TOUS les chiffres, délais, fréquences, noms, engagements et exigences du CCTP traitées, les tableaux et les repères de la forme ⟦AC:n⟧ à l'identique. Même format Markdown (## sous-titres, puces, gras). Renvoie uniquement le texte.` },
          { role: 'user', content: sections[p.id] },
        ], 0.2, `Condensation ${p.id}`, false);
        const reps = (x: string) => (x.match(/⟦AC:\d+⟧/g) || []).sort().join();
        if (r && r.split(/\s+/).length < mots && reps(r) === reps(sections[p.id])) {
          const fid = fidelite(r, sections[p.id]);
          if (fid >= SEUIL_FIDELITE) sections[p.id] = r.replace(/^#\s+[^\n]*\n+/, '').trim();
          else console.log(`[MemoireGenerator] Condensation ${p.id} refusée : ${Math.round(fid * 100)} % des phrases seulement viennent du texte de GSS (${Math.round(SEUIL_FIDELITE * 100)} % exigés).`);
        }
      }
      if (retraits.length) console.log(`[MemoireGenerator] Format court — passe ${tour} : ${retraits.length} passage(s) non repris : ${retraits.join(' ; ')}.`);
      rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    }

    // ── 10. Questions à GSS, complétion par les mémoires, nettoyage final, état ──
    // Questions d'un passage non repris par la sélection (rubrique entière, ou repère disparu avec son passage) : retirées.
    {
      const avant = demandes.length;
      const gardees = demandesDesPassagesRepris(demandes, sections, rubriqueDeQuestion, (rid) => mtParId.get(rid)?.titre, REPERE,
        new Set(confirmationsAvantSelection.filter((c) => !confirmationsRegistreUtilisees(Object.values(sections).join('\n'), horsNormandie).includes(c))));
      demandes.splice(0, demandes.length, ...gardees);
      if (demandes.length < avant) console.log(`[MemoireGenerator] Format court : ${avant - demandes.length} question(s) d'un passage non repris retirée(s).`);
    }
    // Deux questions sur le même sujet n'en font qu'une (T2N-7) ; une question rattachée à un repère du texte est gardée.
    const questionsGss = sansQuestionsRedites(await this.consoliderAvecSources(demandes.map((d) => d.texte), { dce: dceContext, horsNormandie: horsNormandie }), {
      // Texte des réponses de GSS, sans la compréhension du besoin (qui cite le CCTP sans y répondre).
      texteMemoire: Object.entries(sections).filter(([id]) => !/b1_|comprehension/i.test(id)).map(([, t]) => t).join('\n\n').replace(REPERE_RE, ''),
      garder: (q) => q.sources.some((k) => typeof demandes[k]?.repere === 'number'),
    });
    const elements: ElementACompleter[] = questionsGss.map((q, i) => {
      const reperes = [...new Set(q.sources.map((k) => demandes[k]?.repere).filter((x): x is number => typeof x === 'number'))];
      const id = reperes.length ? Object.keys(sections).find((k) => sections[k].includes(REPERE(reperes[0]))) : undefined;
      let contexte = '';
      if (id) {
        const t = sections[id];
        const pos = t.indexOf(REPERE(reperes[0]));
        contexte = `${plan.find((x) => x.id === id)?.title || ''} — …${t.slice(Math.max(0, pos - 220), pos).replace(REPERE_RE, '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim()}`;
      }
      return { cle: `Q${i + 1}`, question: q.question, contexte, statut: 'ouvert', reperes, pourAcheteur: /^À demander à l.acheteur/i.test(q.question) };
    });
    // Cases de tableau (T7N-4) : un élément par case encore imprimée (sa réponse remplace cette seule case), en tête.
    {
      const cases: ElementACompleter[] = casesTableaux.filter((c) => (sections[c.id] || '').includes(REPERE(c.n)))
        .map((c) => ({ cle: '', question: c.question, contexte: `${plan.find((x) => x.id === c.id)?.title || ''} — tableau`, statut: 'ouvert' as const, reperes: [c.n] }));
      elements.unshift(...cases);
      elements.forEach((e, i) => { e.cle = `Q${i + 1}`; });
    }
    // Tout « [À COMPLÉTER] » du texte remis a sa question (D7), y compris un emplacement venu de l'adaptation au CCTP.
    elements.push(...questionsDesEmplacements(sections, elements, (id) => plan.find((x) => x.id === id)?.title || ''));
    await this.completerParLesMemoires(elements, sections, horsNormandie);
    // « Le titulaire » des exigences recopiées du CCTP est GSS : voix de GSS dans tout le texte remis.
    for (const id of Object.keys(sections)) {
      const avantFiltres = fondementReprise(retablirGras(retirerCommentairesInternes(protegerGras(sections[id])).texte), dceContext);
      const filtre = interditsDce(delaisHorsNormandie(avantFiltres, dceContext, horsNormandie).texte, dceContext);
      suivi.noterFiltres(id, avantFiltres, filtre, dceContext, horsNormandie, analysisData);
      sections[id] = voixDeGss(nettoyerStructure(filtre));
    }
    // Nom de l'acheteur écrit d'une seule façon partout (casse et accents de la variable CLIENT, parc_expo 202).
    { const nomClient = String(prep.variables.CLIENT?.valeur || ''); if (nomClient) for (const id of Object.keys(sections)) sections[id] = harmoniserVariantesAcheteur(harmoniserNomClient(sections[id], nomClient), nomClient); }
    nomClientCourtApresPremiere(sections, prep.variables.CLIENT as any, analysisData?.clientName || '');
    // Phrases de GSS adaptées au CCTP (D8) : retrouvées dans les parties finales (rubriques du mémoire type reprises par
    // chaque partie) ; choix de GSS de la génération précédente appliqués, les autres signalées.
    const adaptations = this.finaliserAdaptations(suivi, sections, (id) => plan.find((x) => x.id === id)?.title || id, elements, rep.parPartie);
    rendu = await this.rendreCourtDepuisSections(sections, { pagesMax: format.pagesMax, plan }, cover, schemas);
    // Questions nouvelles du DCE (T6N-3) : « proposition en engagement dans la partie X » seulement si le texte final de la
    // partie traite l'exigence (engagement écrit, gardé par le plafond et par la sélection au rendu) ; traitée dans une autre
    // partie : cette partie est annoncée ; traitée nulle part : question exacte à GSS, jamais une proposition qui n'existe pas.
    const propositionsHorsPages: Array<{ sujet: string; partie: string; texte: string }> = [];
    for (const { g, partie } of nouvellesEnEngagement) {
      // Le bloc de la compréhension (contexte, périmètre, attentes, points de vigilance) cite l'exigence sans y répondre (imm :
      // « Plan de continuité en cas de grève… remis au démarrage », point de vigilance sans réponse) : il ne compte pas.
      const sansComprehension = (t: string) => t.replace(/^#{2,3}\s+(?:Votre contexte|Le p[ée]rim[èe]tre|Vos attentes|Les points de vigilance)[^\n]*\n[\s\S]*?(?=^#{1,3}\s|(?![\s\S]))/gm, '');
      // Exigence déjà prise en compte par une phrase de GSS adaptée au CCTP (D8, T1F-12 : « au minimum 2 vacations en supplément
      // de l'équipe opérationnelle » pour l'exigence des 2 vacations de formation) : traitée dans la partie de cette phrase.
      const parAdaptation = (pid: string) => g.exigences.some((e) => adaptations.some((a) => a.rubrique === pid && !!a.adaptee
        && (exigenceTraitee(e.exigence, a.exigence) || exigenceTraitee(a.exigence, e.exigence) || exigenceTraitee(e.exigence, a.adaptee))));
      const traiteeDans = (pid: string) => g.exigences.some((e) => exigenceTraitee(e.exigence, sansComprehension(sections[pid] || ''))) || parAdaptation(pid);
      const cible = traiteeDans(partie.id) ? partie : plan.find((p) => traiteeDans(p.id));
      if (cible) {
        propositions.push(`Proposition de réponse à valider (question nouvelle du DCE, en engagement dans la partie « ${cible.title} ») : ${g.sujet}`);
        // Page de la phrase qui traite l'exigence, jamais la page d'ouverture de la partie (T3-CONS-8).
        const paragraphe = sansComprehension(sections[cible.id] || '').split(/\n{2,}|\n(?=\s*[-*•]\s)/).find((x) => g.exigences.some((e) => exigenceTraitee(e.exigence, x)));
        propositionsCourt.push({ pid: cible.id, titres: [g.sujet], dansLeTexte: false, ...(paragraphe ? { phrase: paragraphe.trim() } : {}) });
        continue;
      }
      // Traitée nulle part dans les pages remises (D5, T3-CONS-7) : une proposition de réponse est rédigée et remise à GSS dans
      // l'assistant (non imprimée faute de place), à valider puis à insérer à la place d'un autre passage, ou à laisser de côté.
      let proposition: { titre: string; texte: string } | null = null;
      try {
        proposition = await this.proposerReponse(g, {
          client: besoin.client, bloc: partie.title, perimetre, horsNormandie, analyse: analyseResumee, registre: registreGss,
          gssDocs, availableCategories: Object.keys(gssDocs), dce: dceContext,
        });
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Format court : proposition « ${g.sujet} » non rédigée (${e?.message || e}).`);
      }
      if (proposition) {
        console.warn(`[MemoireGenerator] Format court : question nouvelle « ${g.sujet} » hors des ${format.pagesMax} pages ; proposition de réponse remise à GSS dans l'assistant.`);
        propositionsHorsPages.push({ sujet: g.sujet, partie: partie.title, texte: proposition.texte });
        elements.push({ cle: `Q${elements.length + 1}`, question: `Proposition de réponse à valider (question nouvelle du DCE, non imprimée faute de place dans les ${format.pagesMax} pages du RC) : ${g.sujet} — « ${phraseLisible(proposition.texte.replace(/^#+\s.*$/gm, '').replace(/\s+/g, ' '), 900)} »`, contexte: partie.title, statut: 'ouvert', reperes: [], pourAcheteur: false });
        continue;
      }
      console.warn(`[MemoireGenerator] Format court : question nouvelle « ${g.sujet} » sans engagement dans le texte final ; posée à GSS.`);
      for (const e of g.exigences) {
        elements.push({ cle: `Q${elements.length + 1}`, question: `Quelle réponse GSS apporte-t-elle sur ce point du DCE, que le mémoire ne traite pas : « ${phraseLisible(e.exigence, 300).replace(/[.\s]+$/, '')} » ?`, contexte: partie.title, statut: 'ouvert', reperes: [], pourAcheteur: false });
      }
    }
    const consultationList = questionsUniques(elementsSansDoublon(elements));
    if (rendu.pages > format.pagesMax) consultationList.push(`Le mémoire fait ${rendu.pages} pages pour ${format.pagesMax} autorisées par le RC : à raccourcir avec l'assistant avant la remise.`);
    consultationList.push(...this.controlePagesParPartie(rendu.filePath, format, plan));
    const alertePanneCourt = [...alerteCctpAbsent(dceContext, this.piecesIllisibles, this.piecesPartielles), ...this.alertesDceTronque, ...alerteLots(analysisData, dceContext), ...alerteHorsZone(analysisData, dceContext), ...this.alertesFormat, alerteRedactionIndisponible(this.appelsEchoues, nonAdapteesCourt)].filter(Boolean).join('\n\n');
    if (alertePanneCourt) { consultationList.unshift(...alertePanneCourt.split('\n\n')); console.warn(`[MemoireGenerator] ${alertePanneCourt}`); }
    consultationList.push(...rubriquesExcluesCourt, ...avisSecours, ...propositions);
    // Phrases de GSS adaptées au CCTP (D8) : une ligne par phrase à valider (aucune s'il n'y en a pas).
    consultationList.push(...consultationsAdaptations(adaptations));
    console.log(`[MemoireGenerator] Format court (mémoire type) : ${rendu.pages} page(s) / ${format.pagesMax} autorisée(s) ; ${toutesRetenues.length} rubrique(s) du mémoire type reprise(s), ${propositions.length} proposition(s).`);
    // Premier message de l'assistant : les propositions de l'IA, à valider ou modifier avant la remise (D5) ; chaque
    // partie qui en contient est marquée « proposition à valider » pour l'action « valider » de l'assistant.
    const pidsPropositions = [...new Set(propositionsCourt.map((x) => x.pid))].filter((pid) => (sections[pid] || '').trim());
    const ajoutsCourt: AjoutLibre[] = pidsPropositions.map((pid) => ({
      id: pid, chapter: '', title: plan.find((x) => x.id === pid)?.title || pid, proposition: true,
      sujet: propositionsCourt.filter((x) => x.pid === pid).flatMap((x) => x.titres).join(' ; '),
    }));
    let conversation: EtatCompletion['conversation'];
    if (propositionsCourt.length) {
      try {
        const { pageDe, pageDePhrase } = await import('./assistant_memoire');
        const titrePartie = (pid: string) => plan.find((x) => x.id === pid)?.title || '';
        const texte = messagePropositions(propositionsCourt.flatMap((x) => x.titres.map((t) => ({
          titre: t, page: (x.dansLeTexte ? pageDe(rendu.filePath, t) : undefined) ?? (x.phrase ? pageDePhrase(rendu.filePath, x.phrase) : undefined) ?? pageDe(rendu.filePath, titrePartie(x.pid)),
        })))).replace(/- la supprimer : « Supprime la proposition sur … »\./, '- la retirer : « Dans la partie …, retire la proposition sur … » (le reste de la partie est conservé).');
        conversation = [{ role: 'assistant', texte, date: new Date().toISOString() }];
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Message des propositions non préparé (${e?.message || e}).`);
      }
    }
    // Propositions non imprimées faute de place (D5, T3-CONS-7) : annoncées avec leur texte, à valider ou à insérer.
    if (propositionsHorsPages.length) {
      const texteHors = [`${propositionsHorsPages.length === 1 ? 'Une question nouvelle du cahier des charges n\'a' : `${propositionsHorsPages.length} questions nouvelles du cahier des charges n'ont`} pas trouvé de place dans les ${format.pagesMax} pages imposées par le RC. J'ai rédigé une proposition de réponse pour ${propositionsHorsPages.length === 1 ? 'elle' : 'chacune'}, non imprimée ; vous pouvez la valider et me demander de l'insérer à la place d'un autre passage, ou la laisser de côté :`,
        ...propositionsHorsPages.map((x) => `- « ${x.sujet} » (partie « ${x.partie} ») : ${phraseLisible(x.texte.replace(/^#+\s.*$/gm, '').replace(/\s+/g, ' '), 600)}`)].join('\n');
      if (conversation?.length) conversation[0].texte = `${conversation[0].texte}\n\n${texteHors}`;
      else conversation = [{ role: 'assistant', texte: texteHors, date: new Date().toISOString() }];
    }
    if (alertePanneCourt) {
      if (conversation?.length) conversation[0].texte = `${alertePanneCourt}\n\n${conversation[0].texte}`;
      else conversation = [{ role: 'assistant', texte: alertePanneCourt, date: new Date().toISOString() }];
    }
    // Dimensionnement proposé (D5) : annoncé dans le premier message de l'assistant, à valider ou modifier.
    if (ctxBase.dimensionnement?.titulaires) {
      const texteDim = messageDimensionnement(ctxBase.dimensionnement);
      if (conversation?.length) conversation[0].texte = `${conversation[0].texte}\n\n${texteDim}`;
      else conversation = [{ role: 'assistant', texte: texteDim, date: new Date().toISOString() }];
    }
    // Phrases de GSS adaptées au CCTP (D8) : annoncées dans le premier message, à valider, modifier ou rétablir.
    const texteAdaptations = messageAdaptations(adaptations);
    if (texteAdaptations) {
      if (conversation?.length) conversation[0].texte = `${conversation[0].texte}\n\n${texteAdaptations}`;
      else conversation = [{ role: 'assistant', texte: texteAdaptations, date: new Date().toISOString() }];
    }
    try {
      ecrireEtat({
        dossierId, mode: 'libre', fichier: rendu.filePath, majLe: '', elements: elementsSansDoublon(elements), reponsesTraitees: [],
        libre: { sections, schemas, cover, court: { pagesMax: format.pagesMax, plan, source: format.source }, theme: themeActif(), ...(ajoutsCourt.length ? { ajouts: ajoutsCourt } : {}) },
        demande: this.demandeParticuliere?.demande || undefined, conversation,
        ...(this.dimensionnementEtat ? { dimensionnement: this.dimensionnementEtat } : {}),
        ...(adaptations.length ? { adaptations } : {}),
      });
    } catch (e: any) {
      console.warn(`[MemoireGenerator] État de complétion non enregistré (non bloquant) : ${e?.message || e}`);
    }
    const generatedData: Record<string, string> = { 'Format imposé par le RC': `${format.pagesMax} pages maximum — mémoire de ${rendu.pages} page(s)` };
    consultationList.forEach((c, i) => { generatedData[`⚠ Consultation requise #${i + 1}`] = c; });
    return { filePath: rendu.filePath, generatedData, consultations: consultationList };
  }

  /**
   * Format court : éléments attendus par le RC qu'aucune rubrique du mémoire type ne traite (décomposition du prix,
   * dimensionnement propre au site…), rédigés comme le format court d'avant, à la suite des textes de GSS de la partie.
   */
  private async redigerComplementCourt(
    p: PartieCourte,
    elements: string[],
    mots: number,
    textePartie: string,
    o: { format: FormatImpose; analysisJson: string; gssFullContext: string; registre: string; clientName: string; precedentes: string; document?: string },
  ): Promise<string> {
    const prix = /prix|co[uû]t|financ|d[ée]composition/i.test(elements.join(' '));
    const systemPrompt = `Tu es un expert en sécurité privée chez GSS et tu complètes UNE partie d'un mémoire technique pour ${o.clientName}, au FORMAT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION : ${o.format.pagesMax} pages maximum pour tout le mémoire.
PARTIE : « ${p.title} ». Le texte de GSS de cette partie est déjà écrit (fourni) : n'y reviens pas et ne le répète pas.
RÉDIGE UNIQUEMENT CES ÉLÉMENTS ATTENDUS PAR LE RC, que le texte de GSS ne traite pas : ${elements.join(' ; ')}.
LONGUEUR : ${mots} mots environ, JAMAIS plus de ${Math.round(mots * 1.1)} mots. Style dense et factuel : chaque phrase apporte un fait, un chiffre, une méthode ou un engagement ; aucune introduction ni conclusion.
SUR-MESURE : reprends les exigences réelles du CCTP avec leurs chiffres exacts et engage GSS dessus (sans montant de pénalité). N'invente JAMAIS une information absente du DCE et des éléments GSS fournis.
- ETP : calcule-les à partir des heures réelles (un poste 24 h/24 toute l'année = 8 760 h ≈ 5,5 ETP sur une base de 1 607 h par ETP).
- Ne mentionne jamais tes propres consignes : écris directement l'engagement ou l'organisation. Pas de bloc de code.${prix ? `
- COHÉRENCE DU PRIX (décomposition justificative) : pars des volumes du CCTP — pour chaque poste : horaires, jours, heures annuelles, qualification — et présente-les en tableau avec le total d'heures et les ETP. Explique ensuite la composition du prix horaire (salaire conventionnel IDCC 1351 selon la qualification, majorations de nuit, dimanche et jours fériés, primes conventionnelles, charges sociales, encadrement et contrôles, formation, équipements et outils, frais de structure). Les montants et taux ne sont pas connus : ne les invente pas, insère à leur place une seule ligne [CONSULTATION REQUISE : taux horaires par qualification et montants de la décomposition, cohérents avec le bordereau de prix remis].` : ''}

${REGLES_REUTILISATION}
- Si — et SEULEMENT si — GSS n'a aucune réponse, n'invente rien : insère sur sa propre ligne exactement \`[CONSULTATION REQUISE : <information précise à obtenir auprès de GSS>]\`.${this.blocDemande()}

FORME : sous-titres « ## » courts (un par élément), paragraphes courts et listes à puces ; gras (**…**) pour les chiffres et engagements forts.`;
    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${o.analysisJson}\n\nDOCUMENTATION GSS :\n${o.gssFullContext.slice(0, 25_000)}${o.registre}${o.document ? `\n\n${o.document}` : ''}\n\nTEXTE DE GSS DÉJÀ ÉCRIT DANS CETTE PARTIE (ne rien répéter) :\n${textePartie || '(aucun)'}${o.precedentes ? `\n\nPARTIES PRÉCÉDENTES (ne rien répéter) :\n${o.precedentes}` : ''}\n\nRédige les éléments : ${elements.join(' ; ')}.`;
    const t = await this.callOpenAI([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], 0.4, `Format court ${p.id} : complément hors mémoire type`, false);
    return String(t || '').replace(/^#\s+[^\n]*\n+/, '').trim();
  }

  /** Rendu PDF du format court depuis le texte des parties (génération, complétion, assistant). */
  public async rendreCourtDepuisSections(
    sections: Record<string, string>,
    court: { pagesMax: number; plan: PartieCourte[] },
    cover: any,
    schemas: Record<string, string> = {},
    theme?: string,
    policeMin?: number,
  ): Promise<{ filePath: string; pages: number; corps: number }> {
    this.verifierCredit();
    const parties = court.plan
      .filter((p) => (sections[p.id] || '').trim())
      .map((p) => ({
        titre: p.title,
        // Repères retirés avec la ponctuation qui les suivait (aucun « . » orphelin).
        texte: sections[p.id].replace(new RegExp(`${REPERE_RE.source}[ \\t]*[.;,]?`, 'g'), '').replace(/^[ \t]*[.;,][ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
        schema: schemas[`${p.id}#court`] ?? schemas[`${p.id}#court#organigramme`] ?? schemas[`${p.id}#court#process`],
        garder: !!(schemas[`${p.id}#court#organigramme`] || schemas[`${p.id}#court#process`]),
        // Process de la compréhension : juste après l'explication de la compréhension (consigne 6), avant les autres rubriques
        // de la partie (format_court.coupeApresComprehension).
        tete: !schemas[`${p.id}#court`] && !schemas[`${p.id}#court#organigramme`] && !!schemas[`${p.id}#court#process`],
      }));
    const r = await rendreFormatCourt(parties, cover || {}, court.pagesMax, this.responseDir, theme, policeMin);
    return { filePath: r.filePath, pages: r.pages, corps: r.corps };
  }

  /**
   * Remplacement DÉTERMINISTE des balises <entreprise> (et synonymes : <client>, <société>…) par le
   * nom du client du DCE, via le script Python, en conservant POLICE, TAILLE et COULEUR d'origine et en
   * retirant le surlignage. Opère SUR PLACE (via un fichier temporaire). Étape non bloquante : en cas
   * d'échec, le PDF d'origine est conservé (balises intactes).
   */
  private replacePlaceholdersPython(pdfPath: string, analysisData: any): { replaced: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/replace_placeholders.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → balises non remplacées.`);
      return { replaced: 0 };
    }

    const ctx = { clientName: analysisData?.clientName || '' };
    const ctxPath = path.join(this.responseDir, `_phctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');
    const tmpOut = pdfPath.replace(/\.pdf$/, '.ph.pdf');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', pdfPath, '--output', tmpOut, '--context', ctxPath],
      { env: { ...process.env }, encoding: 'utf8', timeout: 120000 },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py-ph] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(tmpOut)) {
      console.warn(`[MemoireGenerator] Script balises échec (status=${proc.status}, err=${proc.error?.message || ''}) → balises conservées.`);
      try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
      return { replaced: 0 };
    }
    try { fs.renameSync(tmpOut, pdfPath); } catch { try { fs.copyFileSync(tmpOut, pdfPath); fs.unlinkSync(tmpOut); } catch { /* ignore */ } }

    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      return { replaced: Number(JSON.parse(line).replaced) || 0 };
    } catch {
      return { replaced: 0 };
    }
  }

  /**
   * Réécriture des passages SURLIGNÉS via le script Python (PyMuPDF → GPT → PyMuPDF). PyMuPDF détecte
   * les surlignages jaunes posés par l'utilisateur DANS le PDF et extrait le texte, GPT réécrit chaque
   * passage adapté au client du DCE, puis PyMuPDF supprime l'ancien texte et insère le nouveau à la
   * même taille. Le contexte client (analyse DCE + atouts GSS) est passé en JSON ; la clé OpenAI et le
   * modèle via l'environnement. En cas d'échec, on recopie le PDF intermédiaire (génération non bloquée).
   */
  private rewriteHighlightsPython(
    inputPdf: string, outputPdf: string, analysisData: any, gssContext: string, sites: string[],
  ): { regions: number; filled: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/rewrite_highlights.py');
    const fallback = () => { try { fs.copyFileSync(inputPdf, outputPdf); } catch { /* ignore */ } return { regions: 0, filled: 0 }; };
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → surlignages non traités.`);
      return fallback();
    }

    // Contexte transmis au script (le client/secteur/enjeux servent à personnaliser la réécriture).
    const ctx = {
      clientName: analysisData?.clientName || 'le client',
      sites: (sites || []).filter(Boolean),
      analysis: analysisData ?? {},
      gssContext: (gssContext || '').slice(0, 8000),
    };
    const ctxPath = path.join(this.responseDir, `_hlctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', inputPdf, '--output', outputPdf, '--context', ctxPath],
      {
        env: { ...process.env, OPENAI_API_KEY: getSettings().openaiApiKey, MEMOIRE_MODEL: MEMOIRE_MODEL },
        encoding: 'utf8',
        // 600s : marge large pour le page-par-page. Le script s'auto-borne en réalité (REWRITE_TIME_BUDGET)
        // pour toujours finir et retirer le surlignage même si GPT est lent ; ce timeout n'est qu'un garde-fou.
        timeout: 600000,
      },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(outputPdf)) {
      console.warn(`[MemoireGenerator] Script Python échec (status=${proc.status}, err=${proc.error?.message || ''}) → repli sans réécriture.`);
      return fallback();
    }
    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      const r = JSON.parse(line);
      return { regions: Number(r.regions) || 0, filled: Number(r.filled) || 0 };
    } catch {
      return { regions: 0, filled: 0 };
    }
  }

  /**
   * Remplit les cadres « Zone d'image » du PDF par des images GÉNÉRÉES (OpenAI Images) via le script
   * Python (PyMuPDF → OpenAI Images → PyMuPDF). PyMuPDF repère chaque cadre blanc et le contexte texte
   * de la page, OpenAI génère une image photoréaliste adaptée au thème/au client, puis PyMuPDF dessine
   * l'image pour remplir le cadre. Opère SUR PLACE (input = output, via un fichier temporaire). Étape
   * non bloquante : en cas d'échec, le PDF d'origine est conservé (cadres intacts).
   */
  private fillImageZonesPython(
    pdfPath: string, analysisData: any, gssContext: string, sites: string[],
  ): { zones: number; filled: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/fill_image_zones.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → cadres image non remplis.`);
      return { zones: 0, filled: 0 };
    }

    const ctx = {
      clientName: analysisData?.clientName || 'le client',
      sites: (sites || []).filter(Boolean),
      analysis: analysisData ?? {},
      gssContext: (gssContext || '').slice(0, 8000),
    };
    const ctxPath = path.join(this.responseDir, `_imgctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');
    const tmpOut = pdfPath.replace(/\.pdf$/, '.img.pdf');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', pdfPath, '--output', tmpOut, '--context', ctxPath],
      {
        env: { ...process.env, OPENAI_API_KEY: getSettings().openaiApiKey, IMAGE_MODEL },
        encoding: 'utf8',
        timeout: 900000, // jusqu'à 15 min : ~11 images générées en parallèle, avec backoff sur 429
      },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py-img] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(tmpOut)) {
      console.warn(`[MemoireGenerator] Script image échec (status=${proc.status}, err=${proc.error?.message || ''}) → cadres conservés.`);
      try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
      return { zones: 0, filled: 0 };
    }
    // Remplace le PDF par la version avec images (in-place).
    try { fs.renameSync(tmpOut, pdfPath); } catch { try { fs.copyFileSync(tmpOut, pdfPath); fs.unlinkSync(tmpOut); } catch { /* ignore */ } }

    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      const r = JSON.parse(line);
      return { zones: Number(r.zones) || 0, filled: Number(r.filled) || 0 };
    } catch {
      return { zones: 0, filled: 0 };
    }
  }

  /** Récupère client / titre / référence pour la page de garde (base puis analyse DCE). */
  private async getCoverInfo(dossierId: string, analyseConnue?: any): Promise<{ client: string; title: string; ref: string; clientCourt?: string }> {
    // Le client affiché est l'ACHETEUR : jamais GSS. Inconnu → ligne omise sur la page de garde.
    const fallback = { client: '', title: 'Mémoire technique', ref: '' };
    // Mentions de remplissage (« Non spécifié », « Acheteur inconnu »…) : ce ne sont pas des valeurs.
    const propre = (v?: string) => {
      const t = String(v || '').trim();
      return t && !MENTION_NON_RENSEIGNEE.test(t) && !/^(acheteur inconnu|objet non sp[ée]cifi[ée]|non sp[ée]cifi[ée])$/i.test(t) ? t : '';
    };
    if (!dossierId || dossierId === 'export') return fallback;
    try {
      // Dossier illisible (coupure, identifiant inconnu) : on passe à l'analyse du DCE.
      const dossier = await DB.getDossier(dossierId).catch(() => null);
      const acheteur = propre(dossier?.acheteur), objet = propre(dossier?.objet), reference = propre(dossier?.reference);
      if (dossier && (acheteur || reference || objet)) {
        return {
          client: acheteur || fallback.client,
          title: objet || fallback.title,
          ref: reference,
        };
      }
      // Analyse déjà faite par la génération : réutilisée (une nouvelle analyse pouvait échouer sur une
      // coupure réseau et laisser la page de garde sans client ni objet).
      const analysis = analyseConnue?.clientName || analyseConnue?.projectTitle ? analyseConnue : await this.analyzeDce(await this.getDceContext(dossierId));
      return {
        client: propre(analysis?.clientName) || fallback.client,
        title: propre(analysis?.projectTitle) || fallback.title,
        ref: propre(analysis?.marketRef),
      };
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Infos page de garde indisponibles: ${e.message}`);
      return fallback;
    }
  }

  /** Page de garde : label vert, gros titre blanc, client crème, référence. */
  private buildCoverXml(cover: { client: string; title: string; ref: string }): string {
    const spacer = () => paraX('', { after: 0 });
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) parts.push(spacer());
    parts.push(paraX(runX('MÉMOIRE TECHNIQUE', { bold: true, size: 28, color: COL_ACCENT }), { align: 'center', after: 200 }));
    parts.push(paraX(runX((cover.title || '').toUpperCase(), { bold: true, size: 52, color: COL_TITLE }), { align: 'center', after: 240 }));
    parts.push(paraX(runX(cover.client || '', { bold: true, size: 32, color: COL_BODY }), { align: 'center', after: 120 }));
    if (cover.ref) parts.push(paraX(runX(cover.ref, { size: 24, color: COL_MUTED }), { align: 'center', after: 120 }));
    for (let i = 0; i < 4; i++) parts.push(spacer());
    parts.push(paraX(runX('GSS — Global Security Service', { bold: true, size: 24, color: COL_ACCENT }), { align: 'center', after: 0 }));
    return parts.join('');
  }

  /**
   * Export DOCX du cas "sans cadre imposé" (Mode B) tel que GSS-MT-Generator :
   * on reçoit la map plate des sections générées côté front ({id: texte}),
   * on la regroupe par chapitre via le mapping AI_SECTIONS_B, puis on assemble
   * le mémoire de référence GSS via assembleFromSections. Renvoie le chemin du
   * .docx produit (à streamer en téléchargement par la route /export-docx).
   */
  public async exportFromSectionsMap(
    sectionsMap: Record<string, string>,
    dossierId: string = 'export',
    onProgress?: (progress: number, message: string) => void,
    analyseDce?: any,
  ): Promise<{ filePath: string; generatedData: Record<string, string>; schemas?: Map<string, string>; cover?: any }> {
    this.verifierCredit();
    const cover = analyseDce ? await this.getCoverInfo(dossierId, analyseDce) : undefined;
    const r = await this.rendreDepuisSections(sectionsMap, dossierId, { onProgress, cover });
    return { filePath: r.filePath, generatedData: {}, schemas: r.schemas, cover: r.cover };
  }

  /**
   * Rendu PDF d'une réponse libre depuis le texte des rubriques. `schemas` / `cover` permettent de
   * recomposer un mémoire déjà généré (complétion) : les schémas existants sont réutilisés et seules
   * les pages qui n'en ont pas encore en reçoivent un.
   */
  public async rendreDepuisSections(
    sectionsMap: Record<string, string>,
    dossierId: string,
    opts: {
      onProgress?: (progress: number, message: string) => void;
      /** Schémas déjà construits, par « idRubrique#page » (réutilisés tels quels). */
      schemas?: Map<string, string>;
      cover?: any;
      /** Rubriques ajoutées après la génération (assistant de modification, propositions de réponse de l'IA). */
      ajouts?: AjoutLibre[];
      /** Photos ajoutées aux rubriques (assistant de modification), par id de rubrique. */
      photos?: Record<string, Array<{ chemin: string; legende?: string }>>;
      /** Thème de style du mémoire déjà rendu (état) ; à défaut, GSS_THEME / style par défaut (themes.ts). */
      theme?: string;
      /** Réponse libre v2 : plan du mémoire type (blocs, rubriques) → mise en page « 1 à 2 pages de texte, puis 1 page de
       *  schéma » ; absent (états v1) : rendu v1 inchangé. */
      plan?: PlanMemoireType;
      /** Réponse libre v2 : titre-message de la page de schéma de chaque rubrique. */
      titresSchemas?: Record<string, string>;
      /** Style « marine » v3 : articles du CCTP des chiffres du bloc 1 (bandeau des chiffres clés, sources), T1-CONS-5. */
      articlesBloc1?: Record<string, string>;
    } = {},
  ): Promise<{ filePath: string; schemas: Map<string, string>; cover: any; rubriquesLongues?: string[] }> {
    this.verifierCredit();
    const onProgress = opts.onProgress;
    const theme = themeActif(opts.theme);
    if (estPlanV2(opts.plan)) return this.rendreDepuisSectionsV2(sectionsMap, dossierId, opts.plan, opts, theme);
    const ordreChapitre = (ch: string): Array<{ id: string; chapter: string; title: string }> => {
      const liste: Array<{ id: string; chapter: string; title: string }> = AI_SECTIONS_B.filter((s) => s.chapter === ch);
      for (const a of (opts.ajouts || []).filter((x) => x.chapter === ch)) {
        const i = a.apres ? liste.findIndex((x) => x.id === a.apres) : -1;
        if (i >= 0) liste.splice(i + 1, 0, a); else liste.push(a);
      }
      return liste;
    };
    const chapters: AssembleChapter[] = CHAPTER_ORDER_B.map((ch) => ({
      key: ch,
      title: CHAPTER_TITLES_B[ch],
      sections: ordreChapitre(ch)
        .filter((s) => sectionsMap[s.id]?.trim())
        .map((s): AssembleSection => ({
          title: s.title,
          text: sectionsMap[s.id],
          id: s.id,
          illustration: undefined,
          d2Code: undefined,
          photos: opts.photos?.[s.id],
        })),

    }));

    if (chapters.every((c) => c.sections.length === 0)) {
      throw new Error('Aucune section générée à exporter (map vide ou ids inconnus).');
    }

    const cover = opts.cover ?? await this.getCoverInfo(dossierId);
    // Organigramme de la rubrique encadrement : mêmes personnes que le texte.
    actualiserOrganigramme(await this.getGssReferents());

    // Un schéma GSS par page de contenu (demande GSS / Clarence) : construit d'après le sujet de la
    // section et le texte exact de la page, dessiné par le moteur de la planche validée. Remplace les
    // photos de la bibliothèque d'images et les schémas D2 de ce rendu.
    onProgress?.(91, 'Construction des schémas GSS (un par page)…');
    const pages: PageSchema[] = MarpGenerator.enumerateContentSlides(chapters).map((sl) => {
      const [ci, si] = sl.key.split('_').map(Number);
      return { key: sl.key, sectionId: chapters[ci]?.sections[si]?.id, sectionTitle: sl.title, text: sl.text };
    });
    // Clé STABLE d'un schéma : rubrique + n° de page dans la rubrique (indépendante de la position de la
    // rubrique dans le chapitre, qui change quand une rubrique est ajoutée ou supprimée).
    const stable = (p: PageSchema) => `${p.sectionId}#${p.key.split('_').pop()}`;
    const existants = opts.schemas;
    const aConstruire = existants ? pages.filter((p) => !existants.has(stable(p))) : pages;
    const nouveaux = aConstruire.length
      ? await new SchemaService().construirePourPages(aConstruire, (msg) => onProgress?.(93, msg), { theme })
      : new Map<string, string>();
    const schemas = new Map<string, string>();
    const schemasStables = new Map<string, string>();
    for (const p of pages) {
      const svg = existants?.get(stable(p)) ?? nouveaux.get(p.key);
      if (svg) { schemas.set(p.key, svg); schemasStables.set(stable(p), svg); }
    }

    // Le rendu Marp/Chromium est bloquant et peut durer plusieurs minutes : on signale l'étape.
    onProgress?.(95, `Rendu du PDF (${schemas.size} schéma(s))…`);
    const generator = new MarpGenerator(this.responseDir);
    const result = await generator.generatePdf(chapters, cover, new Map(), schemas, { theme });

    return { filePath: result.filePath, schemas: schemasStables, cover };
  }

  /**
   * Finalise la génération du mémoire avec cadre imposé après intervention de l'utilisateur.
   */
  public async finalizeMemoire(dossierId: string, userAnswers: Record<string, string>): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    const dossier = await DB.getDossier(dossierId);
    if (!dossier || !dossier.memoire_cadre_state) {
      throw new Error("État de génération introuvable ou expiré.");
    }
    const state = dossier.memoire_cadre_state;

    // Charger le docx temporaire : local en priorité, sinon récupération CROSS-POSTE depuis le Storage
    // (le temp a pu être généré sur une autre machine → tempPath local injoignable ici).
    let content: Buffer;
    if (state.tempPath && fs.existsSync(state.tempPath)) {
      content = fs.readFileSync(state.tempPath);
    } else if (state.storageKey) {
      console.log(`[MemoireGenerator] Temp local absent → download depuis le Storage (${state.storageKey}).`);
      content = await downloadTempDocx(state.storageKey);
    } else {
      throw new Error("Le fichier temporaire est introuvable (ni local, ni Storage).");
    }
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template temporaire');

    const docXmlStr = documentXml.asText();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');

    // Appliquer les réponses utilisateur sur les [CHAMP_XXX] restants
    let applied = 0;
    const tEls = getElementsWithLocalName(xmlDoc, 't');

    for (const mf of state.missingFields) {
      const answer = userAnswers[mf.id];
      if (answer) {
        tEls.forEach((tEl: any) => replaceTextInElement(xmlDoc, tEl, `[CHAMP_${mf.id}]`, answer));
        applied++;
      }
    }

    console.log(`[MemoireGenerator] Finalisation : ${applied} champs remplis par l'utilisateur.`);

    // Sauvegarde finale
    const serializer = new XMLSerializer();
    documentXml.name = 'word/document.xml';
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));

    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const finalPath = path.join(this.responseDir, `memoire_${dossierId}_${Date.now()}.docx`);
    fs.writeFileSync(finalPath, buf);

    // Nettoyage de l'état
    try { fs.unlinkSync(state.tempPath); } catch { /* ignore */ }
    await DB.saveDossier(dossierId, { memoire_cadre_state: null });

    return { filePath: finalPath, generatedData: userAnswers };
  }

  async evaluateMissingInfoChat(context: string, chatHistory: any[]): Promise<{ status: 'accepted' | 'rejected', extracted_value?: string, bot_reply: string }> {
    const prompt = `Vous êtes un assistant IA qui aide un utilisateur à remplir les informations manquantes d'un document professionnel (mémoire technique ou appel d'offres).

L'information manquante requise est décrite par ce contexte : 
"${context}"

Voici l'historique de la conversation actuelle (si vide, c'est que vous devez poser la première question) :
${JSON.stringify(chatHistory, null, 2)}

TACHE :
Si l'historique est vide ou si c'est le début de l'échange pour ce champ :
- status = "rejected"
- bot_reply = "Posez une question claire, courte et naturelle pour demander l'information décrite dans le contexte."

Si l'utilisateur a répondu, analysez son dernier message. Déterminez si l'information fournie répond complètement au contexte demandé.
1. Si la réponse est complète :
   - Extrayez la valeur formelle exacte et propre qui devra être insérée dans le document (ex: "12 Rue de la Paix, 75000 Paris", "M. Jean Dupont").
   - status = "accepted"
   - bot_reply = "Un message court de confirmation (ex: Merci, c'est noté.)"
2. Si la réponse est incomplète ou hors-sujet :
   - status = "rejected"
   - bot_reply = "Posez une question claire et polie pour demander la précision manquante."

FORMAT DE SORTIE (JSON EXACT) :
{
  "status": "accepted" ou "rejected",
  "extracted_value": "la valeur propre (uniquement si accepted)",
  "bot_reply": "votre message naturel à l'utilisateur"
}
`;

    const { getSettings } = require('../core/config');
    const openAiKey = getSettings().openaiApiKey;
    if (!openAiKey) throw new Error("Clé OpenAI manquante");

    const payload = {
      model: 'gpt-5.4-mini',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erreur OpenAI: ${err}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }
}
