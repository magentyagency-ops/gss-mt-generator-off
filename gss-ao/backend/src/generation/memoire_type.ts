import fs from 'fs';
import path from 'path';
import { motDuDictionnaire } from './dictionnaire_fr';
import { lignesEquipe, questionDimensionnement, questionRondes, PART_SUPPLEANTS, type Dimensionnement } from './dimensionnement';
import { estNomDeLieu, lieuxConnus, horairesImposes, jalonsDe, jalonsChronologiques, marcheHorsNormandie, lieuDuMarche, sitesDuMarche, communesParCodePostal, obligationsChiffrees, retirerCommentairesInternes, rolesOrganigramme, ZONE_GSS, recopieDuDce, motifCovidInterdit, graphieMinusculeGss, interditPhotosDce, normaliserExpressionsDelai, minutesDe, dureesEnMinutes, nombreFr, RX_NOMBRE_LETTRES, adresseAdministrative, lotsDuMemoireDce, perimetreDuLot, normaliserSsiap, contracterArticlesNomsPropres, MONTANT_PENALITE, textePreuvesIndicateurs } from './base_memoires';

/**
 * MÉMOIRE TYPE DE RÉFÉRENCE GSS ET PUBLIPOSTAGE (refonte « mémoire type », consignes 2, 4 et 8 du dirigeant).
 *
 * Le mémoire type (memoire_type/memoire_type.json) contient, bloc par bloc, le texte GSS de référence de chaque
 * rubrique, avec ses variables {{NOM}}, ses passages conditionnels {{#si EXPR}}…{{/si}}, son schéma, ses mots-clés
 * et ses sources. Ce module :
 *  1. charge et valide le JSON (cache) ;
 *  2. évalue les indicateurs (conditions d'inclusion) d'après le DCE, l'analyse du DCE et la matrice des exigences ;
 *  3. calcule les variables du marché (analyse du DCE, registre GSS, annuaire « Personnes », DCE) sans rien inventer ;
 *  4. établit le plan (blocs dans l'ordre du JSON, rubriques retenues, référence du secteur du client en premier) ;
 *  5. publiposte de façon déterministe : aucune variable {{…}} ne reste ; une valeur inconnue devient un repère
 *     « [À COMPLÉTER] » accompagné d'une question à GSS, jamais une valeur inventée ;
 *  6. adapte une rubrique « adapte » par modifications ciblées (extrait exact → remplacement) proposées par le
 *     modèle (fonction d'appel reçue en paramètre), avec contrôle de fidélité au texte de référence ;
 *  7. assure la correspondance avec les anciennes rubriques AI_SECTIONS_B (états v1, assistant).
 *
 * Fonctions pures (hors lecture des fichiers de données) : aucun appel réseau dans ce module.
 */

// ─── Types du mémoire type (JSON) ────────────────────────────────────────────────────────────────

export type ModeRubrique = 'fixe' | 'adapte' | 'besoin';
export type SiAbsente = 'a_completer' | 'retirer_phrase' | 'vide' | 'repli';

export interface BlocMemoireType {
  id: string;
  titre: string;
  chapitre_v1: string | null;
  description?: string;
}

export interface IndicateurMemoireType {
  description: string;
  /** Calcul particulier fait dans le code (ex. « hors_normandie »). */
  calcul?: string;
  /** Motif (regex JavaScript, drapeau i) cherché dans le texte du DCE (et dans les exigences de la matrice). */
  dce?: string;
  /** Motif cherché dans les champs de l'analyse du DCE (profils, équipements, contrôles, sites, lots…). */
  analyse?: string;
  /** Motif du DCE qui rend l'indicateur FAUX malgré les autres motifs (« Pas de personnel transférable » : pas de reprise). */
  dce_exclure?: string;
  /** Motif cherché dans le secteur d'activité du client (analyse.clientSector). */
  secteur?: string;
  /**
   * Rubriques : une exigence de la matrice rattachée à l'une d'elles rend l'indicateur vrai, à condition que son texte
   * contienne le motif « dce » de l'indicateur (le rattachement du modèle seul ne suffit pas : caen 475, « mobiliser les
   * équipes … en cas de sinistre » rattaché à l'événementiel ; cstb 551, une levée de doute rattachée à la défaillance SSI).
   */
  matrice?: string[];
  /**
   * Mot du DCE sans lequel une exigence de la matrice (extraite par le modèle) ne suffit pas à rendre l'indicateur
   * vrai (ex. « inopin ») ; sans ce champ, un indicateur qui déclenche un engagement (valeur_si_exige) exige le motif
   * « dce » dans le texte du DCE.
   */
  motif_dce?: string;
  /**
   * « titulaire » : le motif « dce » ne compte que dans une proposition dont l'auteur est le titulaire (ou n'est pas nommé),
   * jamais l'acheteur (T2-GEN-6 : « Le pouvoir adjudicateur pourra procéder à des contrôles inopinés … au moins une fois par
   * mois » n'exige rien du titulaire).
   */
  auteur?: 'titulaire';
  /**
   * Motif d'une proposition où la mention « dce » ne prouve rien (T5G-11 : « Le bâtiment est fermé la nuit », « la nuit, le
   * bâtiment est placé sous alarme » ne sont pas des vacations de nuit) : la mention est ignorée, la suivante est lue.
   */
  dce_ignorer?: string;
  /**
   * Preuve exigée dans le texte du DCE (motif « dce ») : l'analyse, le secteur ou une rubrique de la matrice ne
   * suffisent pas à rendre l'indicateur vrai quand le DCE est lisible (caen : aucun SSIAP dans le DCE, indicateur
   * rendu vrai par l'analyse « aucun agent SSIAP exigé » ou par une exigence rattachée à une rubrique SSIAP).
   */
  preuve_dce?: boolean;
  /** Choix de GSS (assistant, demande particulière) : jamais déduit du DCE. */
  choix_gss?: boolean;
  defaut?: boolean;
}

export interface VariableMemoireType {
  description: string;
  origine: string;
  type: 'texte' | 'liste' | 'nombre' | 'markdown' | 'client';
  si_absente: SiAbsente;
  repli?: string;
  question?: string;
  registre?: string;
  valeur_gss?: string;
  /** Valeur de GSS quand l'indicateur « indicateur_exige » est vrai (engagement pris quand le cahier des charges l'exige). */
  valeur_si_exige?: string;
  indicateur_exige?: string;
  normandie_seulement?: boolean;
  a_confirmer?: string;
  /** Question qui ne dépend pas du marché : posée une seule fois à GSS (questions_gss_une_fois), jamais à chaque génération. */
  question_une_fois?: boolean;
  seulement_si_confirmee?: boolean;
}

export interface SchemaRubrique {
  source: 'bibliotheque' | 'spec' | 'organigramme' | 'process_besoin';
  ref?: string;
  gabarit?: string;
  titre?: string;
  params?: any;
  origine?: string;
  fond?: string;
  remarque?: string;
  alternative?: SchemaRubrique & { a_corriger?: string };
  etapes?: any[];
  variante?: string;
  objectif?: string;
  regles?: string[];
}

export interface SousPartie {
  titre: string;
  priorite: number;
  indicateur?: string;
}

export interface RubriqueMemoireType {
  id: string;
  bloc: string;
  titre: string;
  mode: ModeRubrique;
  /** Expression d'indicateurs (« toujours », « SSIAP », « AGENT_ISOLE|TELESURVEILLANCE »…). */
  condition: string;
  condition_texte: string;
  priorite: number;
  texte: string | null;
  sous_parties: SousPartie[];
  ordre_sous_parties?: 'indicateurs';
  /** Ordre des sous-parties prioritaires (indicateurs vrais) : « SSIAP » avant « SURVEILLANCE »… */
  ordre_indicateurs?: string[];
  schema: SchemaRubrique | null;
  mots_cles: string[];
  sources: string[];
  a_confirmer: string[];
  ancienne_rubrique: string | null;
  anciennes_rubriques: string[];
  reference?: { secteur: string; libelle: string };
  variantes?: Array<{ statut: string; texte: string; motif: string }>;
  specification?: any;
  nettoyage?: string[];
  notes?: string[];
  longueur_mots?: number;
  /** Sujet étroit de la rubrique (ex. intégration d'un nouveau marché : la période de démarrage) : une obligation du CCTP
   *  ou un ajout de l'adaptation n'y est rattaché que s'il correspond à « exige » et pas à « exclut » (expressions
   *  régulières, insensibles à la casse) ; sinon il relève d'une autre rubrique ou des questions à GSS. */
  sujet_ajouts?: { exige?: string; exclut?: string; motif?: string };
}

/** Expressions du sujet d'une rubrique (sujet_ajouts), ou null. */
export function sujetDeRubrique(r: RubriqueMemoireType): { exige?: RegExp; exclut?: RegExp } | null {
  const s = r.sujet_ajouts;
  if (!s || (!s.exige && !s.exclut)) return null;
  return { exige: s.exige ? new RegExp(s.exige, 'i') : undefined, exclut: s.exclut ? new RegExp(s.exclut, 'i') : undefined };
}

/** Vrai si un texte (obligation du CCTP, ajout) relève du sujet étroit de la rubrique. */
export function dansLeSujet(texte: string, sujet: { exige?: RegExp; exclut?: RegExp } | null | undefined): boolean {
  if (!sujet) return true;
  if (sujet.exclut && sujet.exclut.test(texte)) return false;
  return !sujet.exige || sujet.exige.test(texte);
}

export interface MemoireType {
  titre: string;
  version: string;
  statut: string;
  reference: string;
  principes: string[];
  blocs: BlocMemoireType[];
  indicateurs: Record<string, IndicateurMemoireType>;
  variables: Record<string, VariableMemoireType>;
  rubriques: RubriqueMemoireType[];
  correspondance_v1: Record<string, string[]>;
  cadre_impose?: any;
  questions_nouvelles?: any;
  documentation?: any;
}

// ─── Chargement et validation ────────────────────────────────────────────────────────────────────

/** Emplacements du JSON : à côté du module (src), ou depuis dist/ vers src/. */
const CHEMINS_MEMOIRE_TYPE = [
  path.resolve(__dirname, 'memoire_type', 'memoire_type.json'),
  path.resolve(__dirname, '../../src/generation/memoire_type/memoire_type.json'),
];

let cacheMemoireType: { chemin: string; mt: MemoireType } | null = null;

/**
 * Lot(s) auxquels répond le mémoire (T10-COH-3) : marché non alloti ou un seul lot → ce lot ; plusieurs lots → le lot des
 * pièces propres à un seul lot (« CADRE DE REPONSE LOT N°2 », « AE - LOT 2 », « BPU lot n°1 »), ou les lots du cadre de réponse
 * commun (« Mémoire Technique - lots 1-2-3 ») ; sinon question exacte à GSS (« pour quel lot ce mémoire est-il remis ? »), avec
 * les lots du DCE et l'exigence d'une offre distincte par lot quand le RC l'impose.
 */
export function lotsDuMemoire(analyse: any, dce: string): { lots: string[]; question?: string } {
  // Règle partagée avec le lieu du marché (base_memoires, T2-GEN-5) ; marché non alloti seulement sur une affirmation (T2-COH-5).
  return lotsDuMemoireDce(analyse, dce, valeurPropre);
}

/** Variables que ce module sait calculer (une variable déclarée dans le JSON sans calcul est signalée). */
export const VARIABLES_CALCULEES = new Set<string>([
  'CLIENT', 'OBJET_MARCHE', 'REF_MARCHE', 'LOTS', 'DUREE_MARCHE', 'DATE_DEBUT_MARCHE', 'SITE', 'VILLE', 'SECTEUR_CLIENT',
  'SECTEUR_REFERENCE', 'QUALIFICATIONS_REQUISES', 'PROFILS_DEMANDES', 'DIPLOMES_EQUIPE', 'TENUE_RETENUE', 'LIGNES_EQUIPE_DEDIEE',
  'STATUT_PME', 'EFFECTIF_AGENTS', 'NB_AGENTS_RENFORT', 'EFFECTIF_ADS_CQP', 'EFFECTIF_TOTAL', 'EFFECTIF_76', 'EFFECTIF_27', 'EFFECTIF_SSIAP1',
  'EFFECTIF_SSIAP2', 'EFFECTIF_SSIAP3', 'EFFECTIF_CONTROLEURS', 'EFFECTIF_CYNOPHILES', 'VIVIER_EVENEMENTIEL', 'AGENTS_MOBILISABLES_48H',
  'VEHICULES_ASTREINTE', 'LOGICIEL_MAIN_COURANTE', 'ORGANIGRAMME', 'INTERLOCUTEUR_UNIQUE', 'FONCTION_INTERLOCUTEUR', 'TEL_INTERLOCUTEUR',
  'TAUX_REPRISE', 'FONDEMENT_REPRISE_DCE', 'PARTENAIRE_TELESURVEILLANCE', 'ENGAGEMENTS_TELESURVEILLANCE', 'SITES_RONDES',
  'FICHE_POSTE_EXEMPLE', 'DELAI_ASTREINTE', 'DELAI_ASTREINTE_NORMANDIE', 'DELAI_PTI', 'DELAI_INTERVENTION_ALARME',
  'DELAI_ENVOI_PLANNINGS', 'DELAI_COMMANDE_SUPPLEMENTAIRE', 'DELAI_DEFAILLANCE_SSI', 'FREQ_CONTROLE_1', 'FREQ_CONTROLE_2',
  'FREQ_CONTROLE_3', 'CONTROLES_INOPINES_MENSUELS', 'FREQ_REUNIONS', 'RESPONSABLE_APR', 'JALON_ENVOI_CLIENT',
]);

/** Variables qu'un CCTP peut imposer (délais, fréquences) : la valeur du CCTP remplace celle de GSS. */
export const VARIABLES_IMPOSABLES = [
  'DELAI_ASTREINTE', 'DELAI_PTI', 'DELAI_INTERVENTION_ALARME', 'DELAI_COMMANDE_SUPPLEMENTAIRE', 'DELAI_DEFAILLANCE_SSI',
  'FREQ_CONTROLE_1', 'FREQ_CONTROLE_2', 'FREQ_CONTROLE_3', 'CONTROLES_INOPINES_MENSUELS', 'FREQ_REUNIONS',
];

const RX_VARIABLE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
const RX_SECTION = /\{\{#si\s+([^}]+?)\s*\}\}|\{\{\/si\}\}/g;

/** Noms cités par une expression de condition (« A|!B&C » → A, B, C). */
function nomsExpression(expr: string): string[] {
  return expr.split(/[|&]/).map((x) => x.trim().replace(/^!/, '').trim()).filter(Boolean);
}

/** Contrôle d'un texte à publiposter : sections équilibrées, noms connus. Renvoie les anomalies. */
function controlerGabarit(id: string, texte: string, mt: MemoireType): string[] {
  const erreurs: string[] = [];
  let pile = 0;
  for (const m of texte.matchAll(RX_SECTION)) {
    if (m[0].startsWith('{{#si')) {
      pile++;
      for (const nom of nomsExpression(m[1])) {
        if (!mt.indicateurs[nom] && !mt.variables[nom]) erreurs.push(`${id} : condition sur un nom inconnu « ${nom} »`);
      }
    } else if (--pile < 0) {
      erreurs.push(`${id} : {{/si}} sans ouverture`);
      pile = 0;
    }
  }
  if (pile !== 0) erreurs.push(`${id} : {{#si}} non fermé`);
  for (const m of texte.matchAll(RX_VARIABLE)) {
    if (!mt.variables[m[1]]) erreurs.push(`${id} : variable non déclarée {{${m[1]}}}`);
  }
  const reste = texte.replace(RX_SECTION, '').replace(RX_VARIABLE, '');
  if (/\{\{|\}\}/.test(reste)) erreurs.push(`${id} : accolades orphelines`);
  return erreurs;
}

/** Validation complète du mémoire type. Renvoie la liste des anomalies (vide si le JSON est valide). */
export function validerMemoireType(mt: MemoireType): string[] {
  const erreurs: string[] = [];
  if (!mt || !Array.isArray(mt.blocs) || !mt.blocs.length) return ['aucun bloc'];
  if (!Array.isArray(mt.rubriques) || !mt.rubriques.length) return ['aucune rubrique'];
  const blocs = new Set<string>();
  for (const b of mt.blocs) {
    if (!b.id || !b.titre) erreurs.push('bloc sans id ou sans titre');
    if (blocs.has(b.id)) erreurs.push(`bloc en double : ${b.id}`);
    blocs.add(b.id);
  }
  const ids = new Set<string>();
  for (const r of mt.rubriques) {
    if (!r.id || !r.titre) erreurs.push('rubrique sans id ou sans titre');
    if (ids.has(r.id)) erreurs.push(`rubrique en double : ${r.id}`);
    ids.add(r.id);
    if (!blocs.has(r.bloc)) erreurs.push(`${r.id} : bloc inconnu « ${r.bloc} »`);
    if (!['fixe', 'adapte', 'besoin'].includes(r.mode)) erreurs.push(`${r.id} : mode inconnu « ${r.mode} »`);
    if (r.mode !== 'besoin' && !r.texte) erreurs.push(`${r.id} : texte de référence absent`);
    if (r.condition !== 'toujours') {
      for (const nom of nomsExpression(r.condition)) if (!mt.indicateurs[nom]) erreurs.push(`${r.id} : indicateur inconnu « ${nom} »`);
    }
    if (r.texte) erreurs.push(...controlerGabarit(r.id, r.texte, mt));
    const sc = r.schema;
    if (sc?.source === 'spec') {
      if (!sc.gabarit || !sc.params) erreurs.push(`${r.id} : spécification de schéma incomplète`);
      else erreurs.push(...controlerGabarit(`${r.id} (schéma)`, JSON.stringify(sc.params), mt));
    }
    if (sc?.source === 'bibliotheque' && !sc.ref) erreurs.push(`${r.id} : schéma de bibliothèque sans identifiant`);
    for (const sp of r.sous_parties || []) {
      if (sp.indicateur && !mt.indicateurs[sp.indicateur]) erreurs.push(`${r.id} : sous-partie liée à un indicateur inconnu`);
    }
  }
  for (const [nom, v] of Object.entries(mt.variables || {})) {
    if (!VARIABLES_CALCULEES.has(nom)) erreurs.push(`variable « ${nom} » déclarée sans calcul dans memoire_type.ts`);
    if (!['a_completer', 'retirer_phrase', 'vide', 'repli'].includes(v.si_absente)) erreurs.push(`variable « ${nom} » : règle si_absente inconnue`);
    if (v.si_absente === 'repli' && !v.repli) erreurs.push(`variable « ${nom} » : repli absent`);
  }
  for (const [ancien, nouveaux] of Object.entries(mt.correspondance_v1 || {})) {
    for (const n of nouveaux) if (!ids.has(n)) erreurs.push(`correspondance v1 ${ancien} → rubrique inconnue ${n}`);
  }
  for (const [nom, ind] of Object.entries(mt.indicateurs || {})) {
    for (const motif of [ind.dce, ind.analyse, ind.secteur]) {
      if (!motif) continue;
      try { new RegExp(motif, 'i'); } catch { erreurs.push(`indicateur ${nom} : motif invalide`); }
    }
  }
  return erreurs;
}

/**
 * Charge le mémoire type (cache). Lève une erreur si le fichier est absent ou invalide : l'appelant garde alors
 * le comportement actuel (plan v1).
 */
export function chargerMemoireType(chemin?: string): MemoireType {
  const candidat = chemin || CHEMINS_MEMOIRE_TYPE.find((c) => fs.existsSync(c));
  if (!candidat) throw new Error(`[MemoireType] Fichier introuvable (${CHEMINS_MEMOIRE_TYPE.join(' ; ')})`);
  if (cacheMemoireType && cacheMemoireType.chemin === candidat) return cacheMemoireType.mt;
  const mt = JSON.parse(fs.readFileSync(candidat, 'utf-8')) as MemoireType;
  const erreurs = validerMemoireType(mt);
  if (erreurs.length) throw new Error(`[MemoireType] Mémoire type invalide : ${erreurs.slice(0, 12).join(' ; ')}`);
  cacheMemoireType = { chemin: candidat, mt };
  return mt;
}

// ─── Outils de texte ─────────────────────────────────────────────────────────────────────────────

/**
 * Copie de MENTION_NON_RENSEIGNEE (memoire_generator.ts) : une mention de remplissage (« Non communiqué dans les
 * documents transmis », « N/A »…) n'est jamais une valeur.
 */
const MENTION_NON_RENSEIGNEE = /^\s*(?:non[\s-]+(?:communiqu|pr[ée]cis|d[ée]termin|renseign|disponible|identifi|mentionn|indiqu|connu|sp[ée]cifi|fourni|trouv)|inconnu|ind[ée]termin|aucune?\s+(?:information|mention|donn[ée]e)|information\s+(?:non|absente)|(?:n\s*\/\s*a|nc|n\.c\.?)(?![\w])|[-—–?]+\s*$)/i;

/** Valeur exploitable (texte court non vide, sans mention de remplissage), sinon ''. */
export function valeurPropre(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Objet renvoyé par l'analyse (« lance le marché « [object Object] » », T7-COH-1) ou liste d'objets : jamais imprimé ; une
  // liste de textes garde sa forme d'avant (« a,b »).
  if (typeof v === 'object' && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === 'object'))) return '';
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 400) return '';
  if (MENTION_NON_RENSEIGNEE.test(t) || /^(acheteur inconnu|objet non sp[ée]cifi[ée]|non sp[ée]cifi[ée]|undefined|null)$/i.test(t)) return '';
  return t;
}

/** Texte propre qui contient au moins un mot : un nom, un intitulé, un site (jamais « 42 » ni « 12 », T7-COH-1). */
export function textePropre(v: unknown): string {
  const t = valeurPropre(v);
  return /[A-Za-zÀ-ÿ]{2}/.test(t) ? t : '';
}

/** Normalisation pour comparer des mots : minuscules, sans accents, apostrophes droites, espaces simples. */
export function normaliser(t: string): string {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Liste en français : « a », « a et b », « a, b et c ». */
export function listeFr(items: string[]): string {
  const l = items.map((x) => String(x).trim()).filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`;
}

const majuscule = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texte du DCE en phrases (comme obligationsChiffrees de base_memoires.ts). */
/** Ligne de sommaire (points de conduite, numéro de page : « a. Réunions de suivi mensuelles …… 37 », imm, T4N-4) : jamais une
 *  phrase du DCE (l'exigence est dans le corps de l'article). */
export const LIGNE_SOMMAIRE = /\.{5,}|…{2,}|(?:\.\s){5,}|_{5,}/;

function phrasesDuDce(dce: string): string[] {
  return String(dce || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
    .split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/)
    .map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦−]\s*/, '').trim())
    .filter((x) => x.length >= 12 && x.length <= 600 && !LIGNE_SOMMAIRE.test(x));
}

// ─── Registre des informations GSS ───────────────────────────────────────────────────────────────

export interface EntreeRegistre {
  cle: string;
  libelle: string;
  categorie: string;
  valeur_retenue: string;
  date_retenue: string;
  source_retenue: string;
  statut: 'confirmee' | 'a_confirmer';
  /** Valeur à confirmer posée une seule fois à GSS (questions_gss_une_fois) : utilisée telle quelle, jamais reposée. */
  question_une_fois?: boolean;
}

const FICHIER_REGISTRE = path.resolve(__dirname, '../../python/base_memoires/registre_informations.json');
const CATEGORIES_VARIABLES = new Set(['effectifs', 'organisation', 'coordonnees', 'moyens', 'certifications', 'delais', 'partenaires']);
let cacheRegistre: EntreeRegistre[] | null = null;

/** Registre des informations GSS (lecture seule, même fichier que base_memoires.ts). */
export function lireRegistre(): EntreeRegistre[] {
  if (cacheRegistre) return cacheRegistre;
  try {
    // Informations internes (prix horaire) : jamais utilisées pour la rédaction.
    cacheRegistre = (JSON.parse(fs.readFileSync(FICHIER_REGISTRE, 'utf-8')).informations || []).filter((e: any) => !e.interne);
  } catch {
    cacheRegistre = [];
  }
  return cacheRegistre!;
}

function moisDepuis(date: string, maintenant = new Date()): number {
  const m = /^(\d{4})-(\d{2})/.exec(date || '');
  if (!m) return 999;
  return (maintenant.getFullYear() - Number(m[1])) * 12 + (maintenant.getMonth() + 1 - Number(m[2]));
}

/** Valeur du registre « à confirmer » (statut, ou dernière source de plus de 12 mois pour une information variable). Une
 *  valeur dont la question est posée une seule fois à GSS (question_une_fois : ALAMAT, ATTOU, DA SILVA) n'est pas reposée
 *  à chaque génération. */
function aConfirmerRegistre(e: EntreeRegistre): boolean {
  if (e.question_une_fois) return false;
  return e.statut === 'a_confirmer' || (CATEGORIES_VARIABLES.has(e.categorie) && moisDepuis(e.date_retenue) > 12);
}

/** Question de confirmation d'une variable, posée à chaque génération ; aucune si elle est posée une seule fois à GSS. */
function questionParGeneration(def?: VariableMemoireType): string | undefined {
  return def && !def.question_une_fois ? def.a_confirmer : undefined;
}

/** Premier nombre d'une valeur du registre (« 500 agents » → « 500 »). */
function nombreDe(v: string): string {
  return (/\d+(?:[.,]\d+)?/.exec(v || '') || [''])[0];
}

/** Délai normalisé (« 60 MINUTES MAXI » → « 60 minutes », « 2 h » → « 2 heures »). */
/**
 * Délai imposé réduit à la durée (« 30 minutes maximum », « dans un délai maximal de 2 heures », « moins de 1 heure » →
 * « 30 minutes », « 2 heures », « 1 heure ») : les phrases de GSS écrivent déjà « en {{DELAI}} au maximum » (caen 475 :
 * « en 30 minutes maximum au maximum »). Un qualificatif de la durée (« 48 heures ouvrées ») est gardé.
 */
export function delaiNu(v: string): string {
  return valeurPropre(v)
    .replace(/^(?:(?:dans\s+)?un\s+d[ée]lai\s+(?:maximal\s+|maximum\s+|de\s+)?(?:de\s+)?|en\s+|sous\s+|moins\s+de\s+|au\s+plus\s+tard\s+(?:en\s+|sous\s+)?|au\s+maximum\s+|maximum\s+)/i, '')
    .replace(/\s*(?:au\s+)?(?:maximum|max\.?)\s*$/i, '')
    .replace(/\s*au\s+plus(?:\s+tard)?\s*$/i, '')
    .trim();
}

/**
 * Délai imposé par le CCTP réduit à sa durée, pour la phrase de GSS qui porte déjà « en … au maximum » (citedia 1461,
 * T4-CONS-4 : « 30 minutes maximum (alarme intrusion) » imprimé « en 30 minutes maximum (alarme intrusion) au maximum ») :
 * qualificatifs entre parenthèses, « maximum », « au plus », « au maximum » retirés. '' si autre chose qu'une durée reste
 * (« 30 minutes pour une alarme intrusion ») : la valeur n'est pas insérée.
 */
export function delaiImposeNet(v: string): string {
  const net = delaiNu(String(v || '').replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim())
    .replace(/\s+(?:au\s+)?(?:maximum|max\.?|maximal)(?=\s|$)/gi, '').replace(/\s+au\s+plus(?:\s+tard)?(?=\s|$)/gi, '').trim();
  return /^\d+(?:[.,]\d+)?\s*(?:minutes?|mn|min|h|heures?|jours?(?:\s+ouvr[ée]s)?)(?:\s*\d{2})?$/i.test(net) ? net : '';
}

export function normaliserDelai(v: string): string {
  // Heures et minutes (« 1h30 », « 1 h 30 », « 1 heure 30 ») : « 1 h 30 » (T1-GEN-3), jamais « 1 heure ».
  const hm = /(?<![\d.,])(\d{1,2})\s*(?:h|heures?)\s*(\d{2})(?![\d])/i.exec(v || '');
  if (hm && Number(hm[2]) > 0 && Number(hm[2]) < 60) return `${Number(hm[1])} h ${hm[2]}`;
  const m = /(\d+)\s*(minutes?|mn|min|heures?|h)(?![\wÀ-ÿ])/i.exec(v || '');
  if (!m) return valeurPropre(v);
  const n = Number(m[1]);
  return /^m/i.test(m[2]) ? `${n} minute${n > 1 ? 's' : ''}` : `${n} heure${n > 1 ? 's' : ''}`;
}

/** « MARCHANI ADIL » → « MARCHANI Adil » ; « ATTOU NESRINE » → « ATTOU Nesrine ». */
function nomPropre(n: string): string {
  const t = String(n || '').replace(/^(?:m(?:r|me|\.)|monsieur|madame)\s+/i, '').trim();
  const mots = t.split(/\s+/);
  if (mots.length === 2 && /^[A-ZÀ-Ý' -]+$/.test(t)) return `${mots[0]} ${mots[1].charAt(0)}${mots[1].slice(1).toLowerCase()}`;
  return t;
}

// ─── Contexte du marché ──────────────────────────────────────────────────────────────────────────

/** Exigence de la matrice (analyzeRequirements). */
export interface ExigenceMatrice {
  exigence: string;
  rubrique?: string;
  theme?: string;
  reponseGss?: string;
  couverture?: string;
  criticite?: string;
  sujet?: string;
}

export interface ContexteMarche {
  /** Analyse du DCE (analyzeDce) : clientName, projectTitle, lots, sites, operationalSummary, clientSector… */
  analyse?: any;
  /** Texte du DCE (getDceContext). */
  dce?: string;
  /** Page de garde (getCoverInfo) : prioritaire sur l'analyse pour le client, l'objet et la référence. */
  cover?: { client?: string; title?: string; ref?: string };
  /** Annuaire « Personnes » (getGssReferents) : organigramme et fonction de l'interlocuteur unique. */
  referents?: string;
  /** Matrice des exigences (analyzeRequirements). */
  matrice?: ExigenceMatrice[];
  /** Choix de GSS (assistant, demande particulière) : prioritaires sur tout le reste. */
  choix?: { variables?: Record<string, string | string[]>; indicateurs?: Record<string, boolean> };
  /** Valeurs imposées par le CCTP et vérifiées (extraireValeursImposees). */
  imposees?: Record<string, { valeur: string; citation: string }>;
  /** Marché hors Normandie (sinon calculé par marcheHorsNormandie). */
  horsNormandie?: boolean;
  /**
   * false : les délais lus dans le texte du DCE (delaiDuDce) ne remplacent pas ceux de GSS. Sert seulement à retrouver la
   * phrase de GSS d'origine d'un délai imposé par le CCTP, pour la signaler à GSS (D8, T6C-3).
   */
  delaisDuDce?: boolean;
  /** Registre (tests) : sinon registre_informations.json. */
  registre?: EntreeRegistre[];
  /** Dimensionnement proposé à partir des postes et des horaires du DCE (dimensionnement.ts), à valider par GSS. */
  dimensionnement?: Dimensionnement | null;
}

// ─── Indicateurs (conditions d'inclusion) ────────────────────────────────────────────────────────

export interface EtatIndicateur {
  valeur: boolean;
  raisons: string[];
}

/**
 * Propositions qui nient ce qu'elles citent (« aucun agent SSIAP exigé », « pas de télésurveillance », « hors
 * périmètre ») retirées : une mention niée n'est jamais une preuve (T4N-3).
 */
// T2-GEN-3 : aussi l'interdiction (« l'emploi d'agents cynophiles est interdit ») et la négation d'un verbe d'inclusion ou de
// présence (« ne font pas partie du marché », « n'accueille pas de public », « n'emporte aucune reprise ») ; jamais la
// négation d'une action du titulaire (« ne pourra pas employer d'agent non titulaire du SSIAP » reste une exigence).
const NEGATION = /(?<![\wÀ-ÿ])(?:(?:aucune?|ni|exclue?s?)(?![\wÀ-ÿ])|pas\s+d(?:e(?![\wÀ-ÿ])|['’])|hors\s+(?:du\s+)?p[ée]rim[èe]tre|non\s+(?:exig|requis|demand|pr[ée]vu|concern|applicable|inclu)|n['’](?:est|exige|implique)\s+pas(?![\wÀ-ÿ])|ne\s+(?:sont|requi[eè]r[\wÀ-ÿ]*|n[ée]cessit[\wÀ-ÿ]*|compren[\wÀ-ÿ]*|comprend)\s+pas(?![\wÀ-ÿ])|sans\s+objet|(?:est|sont|seront?)\s+(?:formellement\s+|strictement\s+)?(?:interdite?s?|proscrite?s?)(?![\wÀ-ÿ])|interdiction\s+d|ne\s+(?:fait|font)\s+pas\s+partie|(?:ne\s+|n['’])(?:comporte|concerne|pr[ée]voi[tr]|inclu[te]|couvre|accueill\w*|dispose|emporte|vise|porte|demande|exige|y\s+a)(?:nt)?\s+(?:pas|jamais|plus)(?![\wÀ-ÿ]))/i;
export function sansMentionsNiees(texte: string): string {
  return String(texte || '').split(/(?<=[.,;!?\n])|(?=[()])|(?<=[()])/).filter((p) => !NEGATION.test(p)).join('');
}

/** Champs de l'analyse du DCE consultés par les indicateurs. */
function texteAnalyse(analyse: any): string {
  if (!analyse || typeof analyse !== 'object') return '';
  const o = analyse.operationalSummary || {};
  const morceaux = [o.agentProfiles, o.uniforms, o.equipment, o.qualityControls, analyse.telesurveillance, analyse.projectTitle,
    ...(Array.isArray(analyse.sites) ? analyse.sites.map((s: any) => `${s?.name || ''} ${s?.requirements || ''}`) : []),
    ...(Array.isArray(analyse.lots) ? analyse.lots.map((l: any) => `${l?.perimetre || ''}`) : [])];
  return morceaux.map((x) => sansMentionsNiees(valeurPropre(x))).filter((x) => x.trim()).join(' \n ');
}

function extrait(t: string, i: number, n: number): string {
  return t.slice(Math.max(0, i - 40), Math.min(t.length, i + n + 40)).replace(/\s+/g, ' ').trim();
}

// Journal des décisions d'indicateurs écrit une seule fois par génération (T7-COH-6) : preparerMemoireType est appelé
// plusieurs fois par génération (matrice, valeurs imposées, adaptations D8) et répétait 4 à 5 fois chaque message.
const journalIndicateurs = new Set<string>();
/** Remet à zéro le journal des indicateurs (début d'une génération). */
export function reinitialiserJournalIndicateurs(): void { journalIndicateurs.clear(); }
function journalIndicateur(message: string): void {
  if (journalIndicateurs.has(message)) return;
  if (journalIndicateurs.size > 5000) journalIndicateurs.clear();
  journalIndicateurs.add(message);
  console.log(message);
}

/** Auteur ACHETEUR d'une action dans une proposition (contrôle de l'acheteur, faculté qu'il se réserve). */
const AUTEUR_ACHETEUR = /pouvoir adjudicateur|(?<![\p{L}])acheteur|ma[îi]tre d['’]ouvrage|personne publique|entit[ée] adjudicatrice|(?:par|de la part d[eu']?)\s*(?:l['’]|le |la |les |ses |son |sa )?(?:services?|direction|repr[ée]sentants?|responsables?|agents?|r[ée]f[ée]rents?)\b[^.;]{0,50}?(?:de l['’][ée]tablissement|du client|de l['’]acheteur|de la (?:ville|collectivit[ée]|commune)|de l['’]universit[ée]|du (?:CHU|centre|d[ée]partement))|(?:par|de la part d[eu']?)\s*(?:l['’][ée]tablissement|le client|la collectivit[ée]|la ville|la commune)|se r[ée]serve(?:nt)? le droit|(?:pourra|pourront|peut|peuvent)\s+(?:proc[ée]der|effectuer|r[ée]aliser|diligenter|organiser)/iu;
/** Auteur TITULAIRE nommé dans une proposition. */
const AUTEUR_TITULAIRE = /(?<![\p{L}])(?:titulaire|prestataire|soumissionnaire|candidat|entreprise retenue)(?![\p{L}])/iu;

/** Proposition (entre « . », « ; ») d'un texte autour d'une position. */
function propositionAutour(t: string, debut: number, fin: number): string {
  const avant = t.slice(0, debut);
  const i = Math.max(avant.lastIndexOf('.'), avant.lastIndexOf(';'), avant.lastIndexOf('\n'));
  const apres = t.slice(fin);
  const j = apres.search(/[.;\n]/);
  return t.slice(i + 1, j < 0 ? t.length : fin + j);
}

/**
 * Sujet grammatical ACHETEUR en tête de proposition (T4G-6 : « La Ville effectuera des contrôles inopinés… », « Le représentant de
 * la collectivité effectue… ») : une collectivité ou un établissement nommé sans le titulaire, ou son représentant / ses services ;
 * ou l'acheteur nommé par l'une de ses formes (nom, forme courte, sigle).
 */
const SUJET_ACHETEUR = /^\s*(?:[-•▪*]\s*)?(?:(?:en outre|par ailleurs|de plus|enfin),?\s+)?(?:(?:le|la|les|l['’])\s*)?(?:(?:repr[ée]sentants?|services?(?:\s+techniques)?|agents?|responsables?|r[ée]f[ée]rents?|direction)\s+(?:de\s+(?:la|l['’]|le)\s*|du\s+|des\s+))?(?:ville|commune|collectivit[ée]|d[ée]partement|r[ée]gion|m[ée]tropole|[ée]tablissement|universit[ée]|chu|centre hospitalier|h[ôo]pital|mairie|administration|ma[îi]tre d['’]ouvrage|pouvoir adjudicateur|acheteur|client|institut|office|agence|syndicat)(?![\p{L}])/iu;

/** La proposition est-elle une obligation du titulaire (et non une action ou une faculté de l'acheteur) ? */
function propositionDuTitulaire(prop: string, formesAcheteur: string[] = []): boolean {
  if (AUTEUR_TITULAIRE.test(prop) && !/(?:par|de la part d[eu']?)\s*(?:l['’]|le |la )?(?:pouvoir adjudicateur|acheteur)/i.test(prop)) return true;
  if (SUJET_ACHETEUR.test(prop)) return false;
  // Sujet juste avant le premier verbe d'action (proposition précédée d'un intitulé d'article sans point : « Article 9 -
  // Contrôles La Ville effectuera… »).
  {
    const avantVerbe = prop.split(/\s(?:effectu|r[ée]alis|organis|proc[èe]d|pourr?a(?:ient)?\b|peu[tv]|contr[ôo]l(?:e|era|ent)\b|v[ée]rifi|se r[ée]serv|diligent|assur)/i)[0];
    // Groupe nominal de l'acheteur qui finit juste avant le verbe (« … La Ville | effectuera »).
    const SUJET_AVANT_VERBE = /(?<![\p{L}])(?:le|la|les|l['’])\s*(?:(?:repr[ée]sentants?|services?(?:\s+techniques)?|agents?|responsables?|r[ée]f[ée]rents?|direction)\s+(?:de\s+(?:la|l['’]|le)\s*|du\s+|des\s+))?(?:ville|commune|collectivit[ée]|d[ée]partement|r[ée]gion|m[ée]tropole|[ée]tablissement|universit[ée]|chu|centre hospitalier|h[ôo]pital|mairie|administration|ma[îi]tre d['’]ouvrage|pouvoir adjudicateur|acheteur|client|institut|office|agence|syndicat)(?:\s+[A-ZÀ-Ý][\p{L}'’-]*){0,3}\s*$/iu;
    if (avantVerbe.length < prop.length && SUJET_AVANT_VERBE.test(avantVerbe)) return false;
  }
  // Acheteur nommé en sujet (« Rouen Habitat effectuera… », « Le SDIS 76 réalise… »).
  const tete = normaliser(prop.replace(/^\s*(?:[-•▪*]\s*)?/, '')).replace(/^(?:le|la|les|l')\s*/, '');
  if (formesAcheteur.some((f) => { const k = normaliser(f).replace(/^(?:le|la|les|l')\s*/, '').trim(); return k.length >= 3 && tete.startsWith(`${k} `); })) return false;
  return !AUTEUR_ACHETEUR.test(prop);
}

/** Évalue chaque indicateur du mémoire type (vrai/faux, avec les raisons). */
export function evaluerIndicateurs(mt: MemoireType, ctx: ContexteMarche): Record<string, EtatIndicateur> {
  const dce = String(ctx.dce || '').replace(/[’`]/g, "'").replace(/\s+/g, ' ');
  // Preuves cherchées dans les seules pièces techniques, sans références réglementaires ni RIB (T3G-8).
  const dceAffirme = sansMentionsNiees(textePreuvesIndicateurs(String(ctx.dce || '')).replace(/[’`]/g, "'")).replace(/\s+/g, ' ');
  const analyse = texteAnalyse(ctx.analyse);
  const secteur = valeurPropre(ctx.analyse?.clientSector);
  const matrice = (ctx.matrice || []).filter((e) => e && e.exigence);
  const out: Record<string, EtatIndicateur> = {};
  // Indicateurs qui déclenchent un engagement de GSS (valeur_si_exige : « au moins trois fois par mois ») : une
  // exigence de la matrice, reformulée par le modèle, ne compte que si le DCE contient lui-même le motif.
  const engageants = new Set(Object.values(mt.variables).filter((v) => v.valeur_si_exige && v.indicateur_exige).map((v) => v.indicateur_exige!));
  const dceNorm = normaliser(dce);
  // Formes du nom de l'acheteur (nom, forme courte, sigle), pour reconnaître l'acheteur en sujet (T4G-6).
  const formesAcheteur = (() => {
    const nom = textePropre(ctx.cover?.client) || textePropre(ctx.analyse?.clientName);
    if (!nom) return [] as string[];
    try { const f = formesClient(nom, ctx.dce || ''); return [f.long, f.court?.nom || '', nom].filter(Boolean); } catch { return [nom]; }
  })();
  for (const [nom, def] of Object.entries(mt.indicateurs)) {
    const raisons: string[] = [];
    let valeur = false;
    if (def.choix_gss) {
      valeur = ctx.choix?.indicateurs?.[nom] ?? def.defaut ?? false;
      if (valeur) raisons.push('choix de GSS');
    } else if (def.calcul === 'hors_normandie') {
      valeur = ctx.horsNormandie ?? marcheHorsNormandie(ctx.analyse || {}, ctx.dce || '');
      const lieu = ctx.horsNormandie === undefined ? lieuDuMarche(ctx.analyse || {}, ctx.dce || '') : null;
      raisons.push(lieu ? `${lieu.statut === 'inconnu' ? 'lieu du site introuvable dans le DCE' : lieu.statut === 'mixte' ? 'sites en Normandie et hors Normandie' : lieu.statut === 'hors' ? 'site hors Normandie' : 'site en Normandie'} (${lieu.source})` : valeur ? 'marché hors Normandie (choix)' : 'marché en Normandie (choix)');
    } else if (def.calcul === 'photos_interdites') {
      // Interdit des photos du DCE, sauf l'exception qu'il donne lui-même (photographies nécessaires aux rapports, T10C-1).
      const ph = interditPhotosDce(ctx.dce || '');
      valeur = !!ph?.photos;
      if (ph) raisons.push(`DCE : « ${ph.citation.slice(0, 200)} »${ph.photos ? '' : ' (photos permises par le DCE, vidéos interdites)'}`);
    } else {
      if (def.dce) {
        const rx = new RegExp(def.dce, 'i');
        // Une mention niée du DCE n'est jamais une preuve (T4N-3, T2-GEN-3 : « L'emploi d'agents cynophiles est interdit »,
        // « La télésurveillance du site n'est pas comprise ») ; l'exclusion « dce_exclure » reste lue sur le DCE brut.
        let m = rx.exec(dceAffirme);
        const ignorer = def.dce_ignorer ? new RegExp(def.dce_ignorer, 'i') : null;
        // Indicateur d'une obligation du titulaire : la première mention dont l'auteur n'est pas l'acheteur (T2-GEN-6) ; mention
        // dans une proposition à ignorer (« fermé la nuit », T5G-11) : la suivante.
        if (def.auteur === 'titulaire' || ignorer) {
          m = null;
          for (const x of dceAffirme.matchAll(new RegExp(def.dce, 'gi'))) {
            const prop = propositionAutour(dceAffirme, x.index || 0, (x.index || 0) + x[0].length);
            if (ignorer && ignorer.test(prop)) continue;
            if (def.auteur !== 'titulaire' || propositionDuTitulaire(prop, formesAcheteur)) { m = x as RegExpExecArray; break; }
          }
        }
        if (m) raisons.push(`DCE : « ${extrait(dceAffirme, m.index, m[0].length)} »`);
        const e = matrice.find((x) => rx.test(sansMentionsNiees(x.exigence)) && !(ignorer && ignorer.test(x.exigence)) && (def.auteur !== 'titulaire' || propositionDuTitulaire(x.exigence, formesAcheteur)));
        const sourceDce = !engageants.has(nom) || (def.motif_dce ? dceNorm.includes(normaliser(def.motif_dce)) : !!m);
        if (e && sourceDce) raisons.push(`exigence : « ${e.exigence.slice(0, 120)} »`);
        else if (e) journalIndicateur(`[MemoireType] Indicateur ${nom} : exigence de la matrice écartée, motif absent du DCE (« ${e.exigence.slice(0, 120)} »).`);
      }
      if (def.analyse) {
        const m = new RegExp(def.analyse, 'i').exec(analyse);
        if (m) raisons.push(`analyse : « ${extrait(analyse, m.index, m[0].length)} »`);
      }
      if (def.secteur && secteur && new RegExp(def.secteur, 'i').test(secteur)) raisons.push(`secteur du client : ${secteur}`);
      if (def.matrice?.length && (!engageants.has(nom) || (def.motif_dce ? dceNorm.includes(normaliser(def.motif_dce)) : raisons.some((r) => r.startsWith('DCE'))))) {
        const rxDce = def.dce ? new RegExp(def.dce, 'i') : null;
        const rattachees = matrice.filter((x) => x.rubrique && def.matrice!.includes(x.rubrique));
        const ign = def.dce_ignorer ? new RegExp(def.dce_ignorer, 'i') : null;
        const e = rattachees.find((x) => (!rxDce || rxDce.test(x.exigence.replace(/[’`]/g, "'"))) && !(ign && ign.test(x.exigence)) && (def.auteur !== 'titulaire' || propositionDuTitulaire(x.exigence, formesAcheteur)));
        if (e) raisons.push(`exigence rattachée à ${e.rubrique} : « ${e.exigence.slice(0, 120)} »`);
        else if (rattachees.length && !raisons.length) journalIndicateur(`[MemoireType] Indicateur ${nom} : exigence rattachée à ${rattachees[0].rubrique} écartée, motif de l'indicateur absent de son texte (« ${rattachees[0].exigence.slice(0, 120)} »).`);
      }
      // Preuve exigée dans le DCE lisible : l'analyse, le secteur ou la matrice seuls ne suffisent pas (T4N-3).
      if (def.preuve_dce && dce.length >= 2000 && raisons.length && !raisons.some((r) => r.startsWith('DCE'))) {
        journalIndicateur(`[MemoireType] Indicateur ${nom} : écarté, aucune mention dans le DCE (${raisons.join(' ; ').slice(0, 200)}).`);
        raisons.splice(0, raisons.length);
      }
      valeur = raisons.length > 0;
      // Le DCE dit lui-même que la condition n'existe pas (IFITS : « Pas de personnel transférable ») : faux.
      const exclu = def.dce_exclure ? new RegExp(def.dce_exclure, 'i').exec(dce) : null;
      if (valeur && exclu) {
        valeur = false;
        raisons.splice(0, raisons.length, `écarté, DCE : « ${extrait(dce, exclu.index, exclu[0].length)} »`);
      }
    }
    const force = ctx.choix?.indicateurs?.[nom];
    if (force !== undefined && !def.choix_gss) {
      valeur = force;
      raisons.unshift(`imposé par GSS (${force ? 'oui' : 'non'})`);
    }
    out[nom] = { valeur, raisons };
  }
  return out;
}

/** Indicateurs vrais et leurs raisons (journal de l'état, contrôle des engagements déclenchés). */
export function indicateursVrais(etats: Record<string, EtatIndicateur>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(etats).filter(([, v]) => v.valeur).map(([k, v]) => [k, v.raisons]));
}

/** Valeurs booléennes seules. */
export function valeursIndicateurs(etats: Record<string, EtatIndicateur>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(etats).map(([k, v]) => [k, v.valeur]));
}

/** Évalue une expression de condition (« toujours », « A|B », « !A&B »). Les noms inconnus valent faux. */
export function evaluerCondition(expr: string, indicateurs: Record<string, boolean>, variables?: Variables): boolean {
  const e = String(expr || '').trim();
  if (!e || e === 'toujours') return true;
  return e.split('|').some((ou) => ou.split('&').every((et) => {
    const t = et.trim();
    const neg = t.startsWith('!');
    const nom = t.replace(/^!/, '').trim();
    let v: boolean;
    if (nom in indicateurs) v = !!indicateurs[nom];
    else if (variables && nom in variables) v = variableRenseignee(variables[nom]);
    else v = false;
    return neg ? !v : v;
  }));
}

// ─── Plan du mémoire ─────────────────────────────────────────────────────────────────────────────

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface RubriquePlan {
  id: string;
  bloc: string;
  /** Numéro de chapitre (I, II…) selon la position du bloc dans le plan. */
  cle: string;
  titre: string;
  mode: ModeRubrique;
  priorite: number;
  schema: { source: SchemaRubrique['source']; ref?: string } | null;
  ancienne_rubrique: string | null;
}

export interface PlanMemoireType {
  version: 2;
  /** Version du mémoire type utilisée. */
  memoireType: string;
  blocs: Array<{ id: string; cle: string; numero: number; titre: string; rubriques: string[] }>;
  rubriques: RubriquePlan[];
  exclues: Array<{ id: string; raison: string }>;
  indicateurs: Record<string, boolean>;
  /** Référence GSS du secteur du client, présentée en premier. */
  secteurReference?: { id: string; libelle: string };
  /** Vocabulaire du CCTP pour les textes des schémas de la bibliothèque (vocabulaireSchemas) : gardé dans l'état pour
   *  qu'un schéma redessiné à la recomposition suive le même terme. */
  vocabulaireSchemas?: Array<[string, string]>;
}

export interface OptionsPlan {
  /** Ordre des blocs imposé (identifiants de blocs) : cadre imposé par l'acheteur (consigne 5). */
  ordreBlocs?: string[];
  /** Secteur d'activité du client (sinon analyse.clientSector). */
  secteurClient?: string;
}

/**
 * Plan du mémoire : blocs dans l'ordre du JSON (ou imposé), rubriques dont la condition est vraie, dans l'ordre
 * du JSON ; la référence GSS du secteur du client passe en tête des références.
 */
export function planMemoireType(mt: MemoireType, indicateurs: Record<string, boolean>, options: OptionsPlan = {}): PlanMemoireType {
  let blocs = [...mt.blocs];
  if (options.ordreBlocs?.length) {
    const connus = options.ordreBlocs.filter((id) => blocs.some((b) => b.id === id));
    blocs = [...connus.map((id) => blocs.find((b) => b.id === id)!), ...blocs.filter((b) => !connus.includes(b.id))];
  }
  const exclues: Array<{ id: string; raison: string }> = [];
  const secteur = normaliser(options.secteurClient || '');
  let secteurReference: PlanMemoireType['secteurReference'];
  const planBlocs: PlanMemoireType['blocs'] = [];
  const rubriques: RubriquePlan[] = [];
  blocs.forEach((b, i) => {
    const cle = ROMAINS[i] || String(i + 1);
    let retenues = mt.rubriques.filter((r) => r.bloc === b.id).filter((r) => {
      if (evaluerCondition(r.condition, indicateurs)) return true;
      exclues.push({ id: r.id, raison: `condition « ${r.condition} » non remplie` });
      return false;
    });
    // Référence du secteur du client en premier parmi les références.
    const refs = retenues.filter((r) => r.reference);
    const enTete = secteur ? refs.find((r) => new RegExp(r.reference!.secteur, 'i').test(secteur)) : undefined;
    if (enTete && refs.length > 1) {
      const premier = retenues.indexOf(refs[0]);
      retenues = retenues.filter((r) => r !== enTete);
      retenues.splice(premier, 0, enTete);
      secteurReference = { id: enTete.id, libelle: enTete.reference!.libelle };
    } else if (enTete) {
      secteurReference = { id: enTete.id, libelle: enTete.reference!.libelle };
    }
    planBlocs.push({ id: b.id, cle, numero: i + 1, titre: b.titre, rubriques: retenues.map((r) => r.id) });
    for (const r of retenues) {
      rubriques.push({
        id: r.id, bloc: b.id, cle, titre: r.titre, mode: r.mode, priorite: r.priorite,
        schema: r.schema ? { source: r.schema.source, ...(r.schema.ref ? { ref: r.schema.ref } : {}) } : null,
        ancienne_rubrique: r.ancienne_rubrique,
      });
    }
  });
  return { version: 2, memoireType: mt.version, blocs: planBlocs, rubriques, exclues, indicateurs: { ...indicateurs }, secteurReference };
}

// ─── Variables du marché ─────────────────────────────────────────────────────────────────────────

export interface ValeurVariable {
  /** Valeur (texte, liste ou booléen) ; null ou '' = inconnue. */
  valeur: string | string[] | boolean | null;
  /** Article du client (« le », « la », « l' », « les » ou ''). */
  article?: string;
  source?: string;
  /** Valeur reprise mais à confirmer par GSS : question de confirmation. */
  aConfirmer?: string;
  /** Question à GSS si la valeur est inconnue ou partielle. */
  question?: string;
  /** Acheteur : forme courte (sigles ou nom principal) et son article, employée après la première mention. */
  court?: string;
  articleCourt?: string;
  /** Acheteur : genre de la forme courte quand il diffère de la forme longue (« l'Association … (Nouvel IMM) » → « l'IMM » :
   *  '' = pas d'accord imposé). Absent : genre de la forme longue. */
  genreCourt?: 'f' | 'm' | 'p' | '';
  /** Acheteur : genre grammatical quand ni l'article ni le premier mot ne le donnent (société : féminin). */
  genre?: 'f' | 'm' | 'p';
  /** Acheteur sans article commençant par un h muet (« Habitat 76 » : « d'Habitat 76 », T2-COH-3), forme longue et courte. */
  hMuet?: boolean;
  hMuetCourt?: boolean;
}

/** Mots usuels en h muet (élision « d' »), quand le DCE ne tranche pas lui-même. */
const H_MUET = /^(?:habitat|habitations?|h[ôo]pital|h[ôo]pitaux|h[ôo]tel|hospice|hospitali\p{L}*|h[ée]bergement|h[ée]rouville|honfleur|harfleur|hippodrome|histoire|historique|horizons?|hygi[èe]ne|humanit\p{L}*|homme|horloge)(?![\p{L}])/iu;

/**
 * Le nom de l'acheteur sans article s'élide-t-il après « de » (« d'Habitat 76 ») ? Voyelle initiale ; h initial : la forme que
 * le DCE emploie lui-même (« d'Habitat 76 » contre « de Habitat 76 »), sinon un mot usuel en h muet (T2-COH-3).
 */
export function elisionDevantNom(nom: string, dce = ''): boolean {
  const t = String(nom || '').trim();
  if (/^[aeiouyâàäéèêëîïôöûüœ]/i.test(t)) return true;
  if (!/^h/i.test(t)) return false;
  const cle = echapper(normaliser(t).split(/\s+/).slice(0, 2).join(' '));
  const d = normaliser(dce);
  const elide = (d.match(new RegExp(`(?<![a-z0-9])d'${cle}(?![a-z0-9])`, 'g')) || []).length;
  const plein = (d.match(new RegExp(`(?<![a-z0-9])de ${cle}(?![a-z0-9])`, 'g')) || []).length;
  if (elide || plein) return elide >= plein;
  return H_MUET.test(t);
}

export type Variables = Record<string, ValeurVariable>;

/**
 * Nom de l'acheteur affiché sur la couverture, le sommaire, les ouvertures de bloc et les pieds de page : la forme
 * longue corrigée de la variable CLIENT (casse et accents du DCE), jamais le nom brut de l'analyse en capitales
 * (T1-COH-6 : « ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU » 133 fois). Inconnue : le nom brut.
 */
export function nomAcheteurAffiche(v: ValeurVariable | undefined, brut: string): string {
  if (!v || !variableRenseignee(v) || typeof v.valeur !== 'string') return brut;
  const nom = v.valeur.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : brut;
}

/**
 * Forme courte de l'acheteur pour le pied de page et les surtitres (« ENPC et IGN » pour « l'ENPC et l'IGN ») : la forme
 * courte de la variable CLIENT sans ses articles, majuscule initiale ; '' sans forme courte.
 */
export function nomAcheteurCourtAffiche(v: ValeurVariable | undefined): string {
  const court = typeof (v as any)?.court === 'string' ? String((v as any).court).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!court) return '';
  const sans = court.replace(/(^|\s)(?:l['’]|le |la |les )(?=[A-ZÀ-Ý0-9])/g, '$1').trim();
  return sans.charAt(0).toUpperCase() + sans.slice(1);
}

/** Vrai si la variable a une valeur exploitable. */
export function variableRenseignee(v?: ValeurVariable): boolean {
  if (!v) return false;
  const x = v.valeur;
  if (typeof x === 'boolean') return x;
  if (Array.isArray(x)) return x.some((y) => String(y).trim());
  return !!x && !!String(x).trim() && String(x).trim() !== '[À COMPLÉTER]';
}

const ARTICLES_MASCULINS = /^(?:groupe|foyer|haras|hospice|centre|conseil|d[ée]partement|minist[èe]re|mus[ée]e|syndicat|groupement|chu|chr|chb|service|p[ôo]le|parc|port|palais|tribunal|th[ée][âa]tre|lyc[ée]e|coll[èe]ge|rectorat|cr[ée]dit|comit[ée]|campus|grand|bailleur|crous|sdis|march[ée]|conservatoire|stade|ccas|centre-?ville)$/i;
const INSTITUTION_VOYELLE = /^(?:universit[ée]|[ée]cole|[ée]tablissement|office|institut|institution|h[ôo]tel|h[ôo]pital|agence|op[ée]ra|acad[ée]mie|assembl[ée]e|administration|a[ée]roport|association|entreprise|ehpad|espace|observatoire|union|inspection|organisme|ordre|[ée]tat|[ée]glise|abbaye|amphith[ée][âa]tre|auditorium|arsenal|atelier|[ée]quipement|ensemble|internat|unit[ée]|immeuble|archives)$/i;
const ARTICLES_FEMININS = /^(?:r[ée]gion|ville|mairie|commune|communaut[ée]|m[ée]tropole|caisse|caf|cpam|chambre|direction|pr[ée]fecture|fondation|banque|cour|mutualit[ée]|maison|cit[ée]|soci[ée]t[ée]|r[ée]gie|r[ée]sidence|clinique|f[ée]d[ée]ration|biblioth[èe]que|m[ée]diath[èe]que|sncf|ratp|direction)$/i;

/**
 * Article du nom de l'acheteur, lu d'abord dans le DCE (« sites de l'ACOSS », « du Centre Henri Becquerel »), puis
 * déduit du premier mot (« Région » → la ; « Centre » → le ; voyelle → l'). Sans indice : pas d'article.
 */
export function articleEtNom(brut: string, dce = ''): { article: string; nom: string } {
  let nom = brut.replace(/\s+/g, ' ').trim();
  const m0 = /^(le|la|les)\s+(.+)$/i.exec(nom) || /^(l['’])\s*(.+)$/i.exec(nom);
  // Article qui fait partie du nom propre (T3-COH-3 : « Le Havre Seine Métropole », « La Poste », « Le Volcan », « Les Docks
  // Vauban ») : article écrit avec sa majuscule et suivi d'un nom propre, pas d'un nom commun d'institution (« La Région
  // Normandie », « Le Centre Henri Becquerel ») : gardé dans le nom, sans article ajouté (« pour Le Havre Seine Métropole » ;
  // « à Le » et « de Le » deviennent « au » et « du » au nettoyage des textes, contracterArticlesNomsPropres).
  if (m0 && /^L/.test(m0[1]) && /^[A-ZÀ-Ý]/.test(m0[2]) && !teteInstitution(m0[2]) && !/^[A-ZÀ-Ý0-9&]{2,}(?![A-Za-zÀ-ÿ])/.test(m0[2])) return { article: '', nom };
  if (m0) return { article: m0[1].toLowerCase().replace('’', "'"), nom: m0[2] };
  const d = normaliser(dce);
  const cle = normaliser(nom.split(/\s+/).slice(0, 3).join(' '));
  if (d && cle.length >= 3) {
    const compte: Record<string, number> = {};
    const rx = new RegExp(`(?:^|[^a-z0-9])(de la|de l'|a la|a l'|du|des|au|aux|le|la|les|l')\\s*${echapper(cle)}(?![a-z0-9])`, 'g');
    for (const m of d.matchAll(rx)) {
      const a = m[1];
      const art = a === 'du' || a === 'au' || a === 'le' ? 'le' : a === 'des' || a === 'aux' || a === 'les' ? 'les' : /l'$/.test(a) ? "l'" : 'la';
      compte[art] = (compte[art] || 0) + 1;
    }
    // Emplois SANS article (T1-GEN-5 : le DCE de Paris La Défense écrit « de Paris La Défense » 46 fois, « à Paris La
    // Défense » 27 fois et « au Paris la Défense » une seule fois ; « Enedis confie…, les sites d'Enedis ») : « de X »,
    // « d'X », « à X », « par X », « pour X », « avec X », « chez X », et X en sujet en début de phrase. Un article
    // n'est retenu que s'il est majoritaire face à ces emplois.
    // Un nom qui commence par un nom commun d'institution (« Ville », « Centre », « Hôtel ») prend toujours l'article :
    // « Hôtel de Ville de Rouen » ne compte pas comme un emploi sans article de « Ville de Rouen ».
    const premierMot = nom.split(/[\s(]/)[0];
    const nomCommun = ARTICLES_MASCULINS.test(premierMot) || ARTICLES_FEMININS.test(premierMot) || INSTITUTION_VOYELLE.test(premierMot);
    const rxSans = new RegExp(`(?:(?:^|[^a-z0-9'])(?:de|a|par|pour|avec|chez|aupres de)\\s+|(?:^|[^a-z0-9'])d'\\s*|(?:^|[.!?]\\s+))${echapper(cle)}(?![a-z0-9])`, 'g');
    const sans = nomCommun ? 0 : (d.match(rxSans) || []).length;
    const totalArticles = Object.values(compte).reduce((a, b) => a + b, 0);
    const meilleur = Object.entries(compte).sort((a, b) => b[1] - a[1])[0];
    if (sans > totalArticles) return { article: '', nom };
    if (meilleur) return { article: meilleur[0], nom };
  }
  const premier = nom.split(/[\s(]/)[0];
  // Sans indice dans le DCE : « l' » devant voyelle ou h muet seulement pour un nom commun d'institution (« l'Université »,
  // « l'Hôtel de Ville ») ou un sigle (« l'ACOSS ») ; jamais pour un nom propre ou une marque (T1-GEN-5 : « l'Enedis »,
  // « l'Orange », « l'Alcéane », « l'Habitat 76 »).
  if (INSTITUTION_VOYELLE.test(premier) || /^[AEIOUÉÈ][A-Z0-9&.]{1,9}$/.test(premier)) return { article: "l'", nom };
  if (ARTICLES_MASCULINS.test(premier)) return { article: 'le', nom };
  if (ARTICLES_FEMININS.test(premier)) return { article: 'la', nom };
  return { article: '', nom };
}

/** Forme juridique d'une société (« S.P.L. », « SAS », « SEM »…) : l'acheteur est une société, donc féminin. */
// Forme juridique écrite en entier, jamais coupée (T9-COH-1 : « Société publique locale Citédia Métropole » donnait
// « locale Citédia Métropole »).
const FORME_SOCIETE = /^(?:s\.?\s?p\.?\s?l\.?\s?a?\.?|s\.?\s?e\.?\s?m\.?\s?l?\.?|s\.?\s?a\.?\s?s?\.?\s?u?\.?(?:\s+(?:d['’]\s*)?HLM)?|s\.?\s?a\.?\s?r\.?\s?l\.?|soci[ée]t[ée]\s+(?:publique\s+locale(?:\s+d['’]am[ée]nagement)?|d['’][ée]conomie\s+mixte(?:\s+locale)?|anonyme(?:\s+d['’]HLM)?|par\s+actions\s+simplifi[ée]e(?:\s+unipersonnelle)?))(?=\s)/i;

/** Article d'un sigle : « l' » devant une voyelle, sinon celui de l'entité (« le CHU ») ; '' si inconnu. */
function articleSigle(sigle: string, articleEntite: string): string {
  if (/^[AEIOUYÉÈ]/.test(sigle)) return "l'";
  return articleEntite === 'le' || articleEntite === 'la' || articleEntite === 'les' ? articleEntite : '';
}

/** Forme juridique (jamais une forme courte du nom de l'acheteur : « le Groupement d'Intérêt Public » n'est pas l'IFITS). */
const FORME_JURIDIQUE = /^(?:groupement d.int[ée]r[êe]t public|g\.?i\.?p\.?|[ée]tablissement public(?: [àa] caract[èe]re [^)]*| administratif| industriel et commercial| local)?|e\.?p\.?[ai]\.?c?\.?|association(?: loi 1901)?|syndicat mixte|soci[ée]t[ée] (?:publique locale|d.[ée]conomie mixte|anonyme|par actions simplifi[ée]e)|s\.?e\.?m\.?|s\.?p\.?l\.?|s\.?a\.?s\.?u?|s\.?a\.?r\.?l\.?)$/i;

/** Noms communs composés des marchés écrits en capitales (jamais pris pour un nom de lieu). */
const COMPOSES_COMMUNS = new Set(['accord-cadre', 'accords-cadres', 'centre-ville', 'proces-verbal', 'proces-verbaux', 'sous-traitance', 'sous-traitant', 'sous-traitants', 'rez-de-chaussee', 'apres-midi', 'bien-etre', 'demi-journee', 'garde-corps', 'chef-lieu', 'contre-visite', 'avant-projet', 'non-conformite', 'auto-entrepreneur', 'sous-sol', 'sous-sols', 'week-end', 'week-ends', 'main-d-oeuvre', 'maitre-chien', 'maitres-chiens', 'agent-cynophile', 'porte-parole', 'mi-temps', 'temps-plein', 'pre-requis', 'check-list', 'plan-masse']);

const MOTS_OUTILS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'pour', 'aux', 'au', 'a', 'd', 'l']);

/**
 * Sigle de l'acheteur employé par le DCE : celui que le DCE écrit entre parenthèses juste après le nom
 * (« établissement public du château de fontainebleau (EPCF) », « … Théodore Simon (IFITS) »), sinon les initiales des
 * mots du nom (IFITS), retenu seulement si le DCE l'emploie au moins 3 fois avec un article (« l'IFITS », « de l'EPCF »).
 * '' sinon (jamais inventé).
 */
function sigleDuDce(nom: string, dce: string): string {
  const d = normaliser(dce);
  if (!d) return '';
  const cle = normaliser(nom).replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const candidats: string[] = [];
  if (cle.split(' ').length >= 2) {
    const rx = new RegExp(`${cle.split(' ').map(echapper).join("[\\s'-]+")}\\s*\\(\\s*([a-z][a-z0-9&]{1,11})\\s*[),]`, 'g');
    for (const m of d.matchAll(rx)) candidats.push(m[1].toUpperCase());
  }
  const initiales = normaliser(nom).replace(/[^a-z0-9' -]+/g, ' ').split(/[\s'-]+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w)).map((w) => w[0]).join('').toUpperCase();
  if (initiales.length >= 3) candidats.push(initiales);
  for (const sigle of candidats) {
    if (FORME_JURIDIQUE.test(sigle) || !new RegExp(`(?<![A-Za-z0-9])${echapper(sigle)}(?![A-Za-z0-9])`).test(dce)) continue;
    const n = (d.match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |du |de l'|au |a l'|les |des )${echapper(sigle.toLowerCase())}(?![a-z0-9])`, 'g')) || []).length;
    if (n >= 3) return sigle;
  }
  return '';
}

/**
 * Nom de l'acheteur écrit d'une seule façon dans tout le mémoire (parc_expo 202 : « Rouen Normandie événements » 24 fois,
 * « Rouen Normandie Événements » 7 fois) : toute occurrence du nom entier qui ne diffère que par la casse ou les accents
 * prend la graphie retenue (variable CLIENT). Les noms d'un seul mot ne sont pas touchés.
 */
export function harmoniserNomClient(texte: string, nom: string): string {
  const t = String(texte || '');
  const mots = String(nom || '').match(/[A-Za-zÀ-ÿ]+/g) || [];
  if (mots.length < 2 || !t) return t;
  let plat = '';
  const pos: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const x of c) { plat += x; pos.push(i); }
  }
  const rx = new RegExp(`(?<![a-z])${mots.map((w) => normaliser(w).replace(/[^a-z]/g, '')).join("[ '’-]+")}(?![a-z])`, 'g');
  const morceaux: Array<[number, number]> = [];
  for (const m of plat.matchAll(rx)) morceaux.push([pos[m.index!], pos[m.index! + m[0].length - 1] + 1]);
  let sortie = t;
  for (const [a, b] of morceaux.reverse()) {
    const actuel = sortie.slice(a, b);
    if (actuel === nom || actuel.replace(/\s+/g, ' ') !== actuel) continue;
    // Début de phrase : la majuscule initiale est gardée.
    const debut = /(?:^|[.!?:]\s+|\n\s*(?:[-*•]\s+)?|«\s*)$/.test(sortie.slice(Math.max(0, a - 4), a));
    const remplacement = debut ? nom.charAt(0).toUpperCase() + nom.slice(1) : nom;
    sortie = sortie.slice(0, a) + remplacement + sortie.slice(b);
  }
  return sortie;
}

/**
 * Variantes du nom d'une commune acheteuse écrites par la rédaction (T7CS-8, etampes2 553 : « la Ville d’Étampes », forme
 * absente du DCE, à côté de « la Mairie d'Etampes ») : « Ville / Mairie / Commune de X », accents et casse compris, sont
 * ramenées au nom retenu pour le publipostage (« Mairie d'Etampes »). Sans effet si le nom n'a pas cette forme.
 */
export function harmoniserVariantesAcheteur(texte: string, nom: string): string {
  const m = /^(?:mairie|ville|commune)\s+(?:de\s+|d['’]\s*)(.+)$/i.exec(String(nom || '').trim());
  const t = String(texte || '');
  if (!m || !t) return t;
  const commune = m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[aeiouc]/gi, (c) => ({ a: '[aàâäAÀÂÄ]', e: '[eéèêëEÉÈÊË]', i: '[iîïIÎÏ]', o: '[oôöOÔÖ]', u: '[uùûüUÙÛÜ]', c: '[cçCÇ]' } as Record<string, string>)[c.toLowerCase()] || c)
    .replace(/[- ]/g, "[-\u2011 ]+").replace(/'/g, "['’]");
  const rx = new RegExp(`(?<![\\p{L}])(?:mairie|ville|commune)\\s+(?:de\\s+|d['’]\\s*)${commune}(?![\\p{L}])`, 'giu');
  return t.replace(rx, (x: string, off: number, tout: string) => {
    if (x === nom) return x;
    const debut = /(?:^|[.!?:]\s+|\n\s*(?:[-*•]\s+)?|«\s*)$/.test(tout.slice(Math.max(0, off - 4), off));
    return debut ? nom.charAt(0).toUpperCase() + nom.slice(1) : nom;
  });
}

/**
 * Forme longue de l'acheteur à la première mention du document, forme courte ensuite (consigne 2 : on met le bon nom, sans
 * alourdir ; règle déjà appliquée par la réponse libre) : textes donnés dans l'ordre du document (réponses du cadre).
 * Seul le nom est remplacé (l'article et la préposition qui le précèdent restent : « au Ministère … » → « au SAR de Rouen ») ;
 * rien n'est fait si la forme courte n'a pas le même article que la forme longue.
 */
export function formeCourteApresPremiere(textes: string[], long: string, court: { article: string; nom: string } | undefined, articleLong = '', variantes: string[] = []): string[] {
  if (!court?.nom || !long || long === court.nom || (court.article && articleLong && court.article !== articleLong)) return textes;
  // Variantes du nom entier écrites par la rédaction (ca_normandie 241 : nom de l'analyse du DCE « …(SAR de Rouen), BOP
  // Normand, pour… » à côté de la forme longue « …(SAR de Rouen) et le BOP Normand, pour… ») : traitées comme la forme longue.
  const formes = [...new Set([long, ...variantes.map((v) => String(v || '').replace(/\s+/g, ' ').trim())])].filter((f) => f && f !== court.nom && f.length > court.nom.length).sort((a, b) => b.length - a.length);
  const rx = new RegExp(formes.map((f) => f.split(/\s+/).map(echapper).join('\\s+')).join('|'), 'g');
  let vu = false;
  return textes.map((t) => String(t ?? '').replace(rx, (x) => { const r = vu ? court.nom : x; vu = true; return r; }));
}

/** Nom entier tel que le DCE l'écrit en casse mêlée (au moins une majuscule et une minuscule), la graphie la plus fréquente. */
function graphieEntiereDuDce(nom: string, dce: string): string {
  const mots = nom.match(/[A-Za-zÀ-ÿ]+/g) || [];
  if (mots.length < 2) return '';
  // Texte du DCE sans accents ni casse, caractère par caractère (positions conservées).
  let plat = '';
  const pos: number[] = [];
  for (let i = 0; i < dce.length; i++) {
    const c = dce[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const x of c) { plat += x; pos.push(i); }
  }
  const rx = new RegExp(`(?<![a-z])${mots.map((w) => normaliser(w).replace(/[^a-z]/g, '')).join("[\\s'’-]+")}(?![a-z])`, 'g');
  const compte = new Map<string, number>();
  for (const m of plat.matchAll(rx)) {
    const brut = dce.slice(pos[m.index!], pos[m.index! + m[0].length - 1] + 1).replace(/\s+/g, ' ');
    // Casse mêlée significative : une majuscule ailleurs qu'en tête (celle d'un début de phrase ne dit rien du nom).
    if (!/[A-ZÀ-Ý]/.test(brut.slice(1)) || !/[a-zà-ÿ]/.test(brut)) continue;
    compte.set(brut, (compte.get(brut) || 0) + 1);
  }
  const meilleure = [...compte].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return meilleure ? meilleure.charAt(0).toUpperCase() + meilleure.slice(1) : '';
}

/**
 * Nom de l'acheteur écrit en capitales (« ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU », « MAIRIE DE
 * PETIT-QUEVILLY ») : chaque mot reprend la graphie que le DCE emploie le plus (accents et casse : « établissement »,
 * « château », « Fontainebleau »), la majuscule initiale étant rétablie ; un sigle que le DCE n'écrit qu'en capitales le
 * reste. Si un mot est absent du DCE, le nom reste tel quel (jamais d'accent ni de casse inventés). '' si rien à faire.
 */
/** Nom commun en « -ité » absent du dictionnaire (« ATTRACTIVITE » → « attractivité », T4-COH-8) ; '' sinon. */
function nomEnIte(mot: string): string {
  return mot.length >= 7 && /^[A-ZÀ-Ý]+ITE(S?)$/.test(mot) ? mot.toLowerCase().replace(/ite(s?)$/, 'ité$1') : '';
}

/** Graphie usuelle d'un mot écrit en capitales : mot du dictionnaire en minuscules accentuées, sinon nom propre. */
function graphieUsuelle(mot: string): string {
  if (MOTS_OUTILS.has(normaliser(mot))) return mot.toLowerCase();
  const d = motDuDictionnaire(mot) || nomEnIte(mot);
  if (d) return d;
  return mot.split('-').map((x) => (x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : x)).join('-');
}

/**
 * Mot court écrit en capitales qui est un sigle (« CHU », « SDIS », « CCAS », « IGN ») et non un mot ou un nom propre écrit en
 * capitales (T3-COH-4 : « PAYS », « SITE », « MIXTE », « LYCEE », « CAUX », « ROUEN ») : 3 lettres au plus ou sans voyelle ;
 * employé après un article en minuscules dans le DCE (« le SDIS », « l'INSA ») ; ni mot du dictionnaire ni prononçable
 * (3 consonnes de suite, ou 2 consonnes en tête hors attaques usuelles : « CSTB », « SDIS »).
 */
function sigleProbable(mot: string, dce: string): boolean {
  if (!/[AEIOUYÀ-Ý]/.test(mot)) return true;
  // 3 lettres : sigle, sauf mot courant des textes de GSS (« PAR », « SUR », « LES »).
  if (mot.length <= 3) return !graphieMinusculeGss(mot);
  // Mot écrit en capitales par le DCE au milieu d'un texte en casse mêlée, après un article ou devant « de … » (T4G-8 :
  // « L'ESID de Rennes ») : un sigle, article en capitale compris.
  if (new RegExp(`(?:^|[^A-Za-zÀ-ÿ])(?:[Ll]['’]|[Ll]e |[Ll]a |[Ll]es |[Dd]u |[Dd]es |[Aa]u |[Aa]ux )${echapper(mot)}(?![A-Za-zÀ-ÿ])`).test(dce)) return true;
  if (new RegExp(`(?<![A-Za-zÀ-ÿ])${echapper(mot)}\\s+(?:de|du|des|d['’])\\s*[A-ZÀ-Ý][a-zà-ÿ]`).test(dce)) return true;
  if (motDuDictionnaire(mot)) return false;
  // Mot court hors dictionnaire suivi de « DE <Lieu> » (« ESID DE RENNES », T4G-8) : un sigle d'établissement, jamais un nom de lieu.
  if (!estNomDeLieu(mot) && new RegExp(`(?<![A-Za-zÀ-ÿ])${echapper(mot)}\\s+(?:DE|DU|DES|D['’]|de|du|des|d['’])\\s*[A-ZÀ-Ý]`).test(dce)) return true;
  if (/[^AEIOUYÀ-Ý]{3}/.test(mot)) return true;
  return /^[^AEIOUYÀ-Ý]{2}/.test(mot) && !/^(?:BL|BR|CH|CL|CR|DR|FL|FR|GL|GR|PH|PL|PR|TR|VR|ST|SC|SP|TH|GN)/.test(mot);
}

/**
 * Texte du DCE sans adresses électroniques, adresses web ni noms de fichiers (T5G-4 : « valerie.lefort@neoma-bs.fr »,
 * « www.neoma-bs.fr », « achats@cnrs.fr ») : leur graphie en minuscules ne dit rien de celle du nom de l'acheteur.
 */
export function sansAdressesWeb(dce: string): string {
  return String(dce || '')
    .replace(/[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/(?:https?:\/\/|www\.)[^\s)>\]»"]+/gi, ' ')
    .replace(/(?<![\wÀ-ÿ@])[\w-]+(?:\.[\w-]+)*\.(?:fr|com|org|net|eu|info|gouv\.fr)(?:\/[^\s)>\]»"]*)?(?![\wÀ-ÿ])/gi, ' ')
    .replace(/[^\s/\\]+\.(?:pdf|docx?|xlsx?|odt|ods|zip|rtf|pptx?)(?![\wÀ-ÿ])/gi, ' ');
}

/**
 * Prénoms usuels (sans accents) : dans un nom d'institution écrit en capitales, un prénom ouvre un nom de personne
 * (« LYCÉE PIERRE CORNEILLE » → « Lycée Pierre Corneille », « UNIVERSITÉ PIERRE ET MARIE CURIE », T5-COH-2), même quand
 * le prénom ou le nom est aussi un mot du dictionnaire.
 */
const PRENOMS = new Set(('adrien agathe agnes alain albert alexandre alexis alfred alice alphonse amelie andre andree anne annie antoine antonin aristide arthur auguste augustin aurelie benjamin bernard berthe blaise brigitte bruno camille carole catherine cecile celestin charles charlotte christian christine claire claude clement colette danielle daniel denis denise didier dominique edgar edith edmond edouard elisabeth elise emile emilie emmanuel ernest etienne eugene eugenie fernand fernande ferdinand florence francis francois francoise frederic gabriel gaston genevieve georges georgette gerard germaine gilbert gilles guillaume gustave guy helene henri henriette hector honore hubert hugues irene isabelle jacqueline jacques jean jeanne jeannine joel joseph josephine jules julie julien juliette justin laurent leo leon leonard leonie louis louise lucie lucien madeleine marc marcel marcelle marguerite marie marius martin maurice max maxime michel michele monique nicolas noel odette olivier pascal patrick paul paule paulette philippe pierre raoul raymond rene renee robert roger roland romain samuel sebastien serge simon simone sophie suzanne theodore therese thomas valentin victor victorine vincent xavier yves yvonne').split(' '));
/**
 * Noms communs qui suivent « de / du / des / d' » dans les noms d'institution (« de l'habitat », « d'action sociale », « de
 * santé mentale ») : jamais un nom propre à faire confirmer par GSS.
 */
const NOMS_COMMUNS_INSTITUTION = new Set(('sang action actions agglomeration agriculture amenagement arts artisanat assainissement beaux bassin batiment batiments cancer chambre commerce communes compagnons culture danse defense departement developpement eau eaux education emploi enfance enseignement environnement etudes etudiants familles famille formation france habitat habitation handicapes handicapees incendie industrie insertion jeunesse jeunes justice logement logements lutte metiers metropole musique patrimoine pays personnes police prevention readaptation recherche reeducation region retraite sante secours securite services social sociale soins solidarite sport sports territoire territoires tourisme transport transports travail travailleurs universite ville villes').split(' '));

/** Sigle d'après l'usage du DCE seul (« l'ESID », « le SDIS ») : article en minuscules devant le mot en capitales. */
function sigleParArticle(mot: string, dce: string): boolean {
  return new RegExp(`(?:^|[^A-Za-zÀ-ÿ])(?:[Ll]['’]|[Ll]e |[Ll]a |[Ll]es |[Dd]u |[Dd]es |[Aa]u |[Aa]ux )${echapper(mot)}(?![A-Za-zÀ-ÿ])`).test(dce);
}

export function casseDuDce(nom: string, dceBrut: string, intitule = false): string {
  return casseDuDceDetail(nom, dceBrut, intitule).forme;
}

/**
 * Graphie d'un nom écrit en capitales (casseDuDce) et mots dont la casse n'a pu être tirée du DCE ni d'une liste de lieux :
 * leur graphie est à faire confirmer par GSS (T5-COH-2 : « VILLE DU TRAIT », « MAISON DE RETRAITE LES ROSES »).
 */
export function casseDuDceDetail(nom: string, dceBrut: string, intitule = false): { forme: string; incertains: string[] } {
  const dce = sansAdressesWeb(dceBrut);
  // Nom avec une parenthèse (imm : « ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM) ») : la partie
  // hors parenthèse prend la graphie du DCE, la parenthèse (nom d'usage, sigle) reste telle quelle.
  const par = /^([^()]+?)(\s*\([^()]*\).*)$/.exec(nom);
  if (par) {
    const tete = casseDuDceDetail(par[1], dce, intitule);
    return tete.forme ? { forme: `${tete.forme}${par[2]}`, incertains: tete.incertains } : { forme: '', incertains: [] };
  }
  const lettres = nom.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!lettres || lettres.replace(/[^A-ZÀ-Ý]/g, '').length / lettres.length <= 0.7 || !dce) return { forme: '', incertains: [] };
  // 1. Le nom entier écrit en casse mêlée dans le DCE (comparaison sans casse ni accents, mots consécutifs) : graphie reprise
  //    telle quelle (parc_expo 202 : « Rouen Normandie Evènements », jamais « Rouen Normandie événements », nom commun).
  const entier = graphieEntiereDuDce(nom, dce);
  if (entier) return { forme: entier !== nom ? entier : '', incertains: [] };
  const cle = (w: string) => normaliser(w);
  const formes = new Map<string, Map<string, number>>();
  for (const m of dce.matchAll(/[A-Za-zÀ-ÿ]+/g)) {
    const k = cle(m[0]);
    if (!formes.has(k)) formes.set(k, new Map());
    const f = formes.get(k)!;
    f.set(m[0], (f.get(m[0]) || 0) + 1);
  }
  let ok = true;
  let premier = true;
  // Nom de lieu composé en capitales (« GRAND-QUEVILLY ») dont une partie n'est pas un mot du dictionnaire : nom propre,
  // chaque partie prend sa majuscule (« Grand-Quevilly », jamais « GRAND-Quevilly » ni « grand-Quevilly »).
  // Intitulé du marché (T2-CONS-14) : mêmes règles qu'un nom d'institution (mot du dictionnaire en minuscules, nom propre).
  const institutionnel = intitule || teteInstitution(nom.replace(/^(?:l['’]\s*|le\s+|la\s+|les\s+)/i, ''));
  const composes: Array<[number, number]> = [];
  for (const m of nom.matchAll(/[A-ZÀ-Ý]+(?:-[A-ZÀ-Ý]+)+/g)) {
    const parts = m[0].split('-');
    const formeDce = (w: string) => [...(formes.get(cle(w))?.keys() || [])].some((x) => x !== x.toUpperCase());
    // Tout composé en capitales est un nom de lieu (T3-COH-4 : « SEINE-MARITIME », « SAINT-ETIENNE-DU-ROUVRAY ») sauf les noms
    // communs composés des marchés (« ACCORD-CADRE », « CENTRE-VILLE »).
    if (!COMPOSES_COMMUNS.has(normaliser(m[0])) && (parts.some((w) => !motDuDictionnaire(w) && !formeDce(w)) || parts.every((w) => motDuDictionnaire(w)))) composes.push([m.index!, m.index! + m[0].length]);
  }
  // Décision prise pour chaque mot (src) : graphie du DCE, mot-outil, sigle, nom composé, ou casse tirée du dictionnaire ou des
  // textes de GSS (« dico ») ou nom propre hors dictionnaire (« propre ») : ces deux dernières sont revues plus bas.
  type Mot = { debut: number; fin: number; mot: string; r: string; src: 'dce' | 'outil' | 'sigle' | 'compose' | 'dico' | 'propre' | 'brut' };
  const mots: Mot[] = [];
  for (const m of nom.matchAll(/[A-Za-zÀ-ÿ]+/g)) {
    const mot = m[0];
    const offset = m.index!;
    const k = cle(mot);
    let r: string;
    let src: Mot['src'];
    const f = formes.get(k);
    if (institutionnel && composes.some(([a, b]) => offset >= a && offset < b)) {
      const debutCompose = composes.some(([a]) => offset === a);
      premier = false;
      // Mot-outil au milieu du nom de lieu (« Saint-Étienne-du-Rouvray », « Val-de-Marne ») en minuscules ; sinon la graphie
      // capitalisée du DCE (« Étienne ») ou la majuscule initiale.
      if (!debutCompose && MOTS_OUTILS.has(k)) { mots.push({ debut: offset, fin: offset + mot.length, mot, r: mot.toLowerCase(), src: 'compose' }); continue; }
      const cap = [...(f?.keys() || [])].find((w) => w.length > 1 && w[0] !== w[0].toLowerCase() && w.slice(1) === w.slice(1).toLowerCase());
      mots.push({ debut: offset, fin: offset + mot.length, mot, r: cap || mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase(), src: 'compose' });
      continue;
    }
    const minuscules = [...(f?.entries() || [])].filter(([w]) => w === w.toLowerCase()).sort((a, b) => b[1] - a[1]);
    const capitalises = [...(f?.entries() || [])].filter(([w]) => w.length > 1 && w[0] !== w[0].toLowerCase() && w.slice(1) === w.slice(1).toLowerCase()).sort((a, b) => b[1] - a[1]);
    const nbMin = minuscules.reduce((t, x) => t + x[1], 0);
    const nbCap = capitalises.reduce((t, x) => t + x[1], 0);
    // « A » seul en capitales : la préposition « à » (T3-COH-4 : « … CITEDIA METROPOLE A RENNES », « ACCORD-CADRE A BONS DE
    // COMMANDE ») ; un intitulé ou un nom ne porte jamais le verbe « a ».
    if (/^[AÀ]$/.test(mot)) { r = 'à'; src = 'outil'; }
    else if (MOTS_OUTILS.has(k) && !premier) { r = mot.toLowerCase(); src = 'outil'; }
    // Gentilé après un nom commun (« L'AGGLOMERATION ROUENNAISE » → « l'agglomération rouennaise », T4-COH-9) : en minuscules.
    else if (institutionnel && !premier && GENTILES[k] && !minuscules.length && !capitalises.length) { r = GENTILES[k]; src = 'dce'; }
    else if (nbCap && nbCap > 2 * nbMin) { r = capitalises[0][0]; src = 'dce'; }
    else if (nbMin) { r = minuscules[0][0]; src = 'dce'; }
    else if (nbCap) { r = capitalises[0][0]; src = 'dce'; }
    // Mot court du dictionnaire écrit seulement en capitales dans un nom d'institution (« MUSÉE D'ART », « … SUD EST », « JEANNE
    // D'ARC », T5-COH-2) : un mot, jamais un sigle, sauf emploi de sigle dans le DCE (« l'ART »).
    else if (institutionnel && !premier && mot.length <= 5 && /[AEIOUYÀ-Ý]/.test(mot) && motDuDictionnaire(mot) && !PRENOMS.has(k) && !sigleParArticle(mot, dce)) { r = graphieUsuelle(mot); src = 'dico'; }
    // Prénom écrit en capitales (« ANDRÉ », « JEAN ») : jamais un sigle.
    else if (institutionnel && !premier && PRENOMS.has(k)) { r = mot.charAt(0) + mot.slice(1).toLowerCase(); src = 'dico'; }
    // Sigle écrit en capitales dans le DCE : mot court ou sans voyelle (« IGN », « SDIS ») ; un mot plein (« CENTRE », cstb
    // 221 : « Le CENTRE scientifique… ») prend la graphie en minuscules des textes de GSS, sinon le nom reste en capitales.
    else if (f?.has(mot) && (mot.length <= 5 ? sigleProbable(mot, dce) : !/[AEIOUYÀ-Ý]/.test(mot))) { r = mot; src = 'sigle'; }
    // Nom de marque (« SEM HAVRE DEVELOPPEMENT », « PORT DE ROUEN SERVICES ») : chaque mot plein prend sa majuscule.
    else if (graphieMinusculeGss(mot)) { r = institutionnel ? graphieMinusculeGss(mot) : graphieMinusculeGss(mot).charAt(0).toUpperCase() + graphieMinusculeGss(mot).slice(1); src = institutionnel ? 'dico' : 'brut'; }
    // Mot que ni le DCE ni les textes de GSS n'écrivent autrement qu'en capitales (T1-COH-6 : « CENTRE HOSPITALIER DU
    // ROUVRAY », « MAIRIE DE GRAND-QUEVILLY ») : mot du dictionnaire en minuscules avec ses accents ; sinon nom propre,
    // majuscule initiale (« Rouvray », « Grand-Quevilly »). Un sigle court reste en capitales (règle ci-dessus).
    // Seulement pour un nom d'institution (« Centre … », « Mairie … ») : un nom de marque (« CITEDIA METROPOLE ») reste tel quel.
    else if (mot.length >= 2 && institutionnel) { r = graphieUsuelle(mot); src = /^[a-zà-ÿ]/.test(r) ? 'dico' : 'propre'; }
    else { ok = false; r = mot; src = 'brut'; }
    if (premier) r = r.charAt(0).toUpperCase() + r.slice(1);
    mots.push({ debut: offset, fin: offset + mot.length, mot, r, src: premier && src !== 'dce' ? 'brut' : src });
    // Nom précédé de son article (« LE CENTRE SCIENTIFIQUE… ») : le premier mot du nom garde sa majuscule (« Le Centre… »).
    premier = premier && /^(?:le|la|les|l)$/.test(k);
  }
  const incertains: string[] = [];
  if (institutionnel) revoirNomsPropres(nom, mots, intitule, incertains, dce);
  let sortie = '';
  let pos = 0;
  for (const x of mots) { sortie += nom.slice(pos, x.debut) + x.r; pos = x.fin; }
  sortie += nom.slice(pos);
  // Lieux connus dans leur graphie usuelle (« porte Oceane » → « Porte Océane », « ST Étienne du Rouvray » →
  // « Saint-Étienne-du-Rouvray », T4-COH-9), aussi après une contraction (« du havre » → « du Havre », T5-COH-2).
  const lieux = institutionnel ? lieuxEnGraphieUsuelle(sortie) : { texte: sortie, reconnus: new Set<string>() };
  const finale = lieux.texte;
  const restants = [...new Set(incertains)].filter((w) => !lieux.reconnus.has(cleCommune(w)));
  return ok && finale !== nom ? { forme: finale, incertains: restants } : { forme: '', incertains: [] };
}

/**
 * Noms propres d'un nom d'institution écrit en capitales, mis en casse mot par mot (T5-COH-2) : prénom et nom de personne
 * (« Lycée Pierre Corneille », « Centre hospitalier Jean Martin Charcot », « Lycée Jeanne d'Arc ») ; nom propre introduit par un
 * article après un nom commun (« Maison de retraite Les Roses ») ; suite d'un nom propre (« Le Havre Seine Métropole »,
 * « Rouen Vallée de Seine ») ; « Grand » devant un nom de lieu (« du Grand Reims ») ; gentilé en minuscules après un nom
 * commun (« l'agglomération lilloise », « du bassin rennais »). Mots dont la casse vient du seul dictionnaire, en place de nom
 * propre, renvoyés comme incertains.
 */
function revoirNomsPropres(nom: string, mots: Array<{ debut: number; fin: number; mot: string; r: string; src: string }>, intitule: boolean, incertains: string[], dce = ''): void {
  const k = (i: number) => normaliser(mots[i]?.mot || '');
  const sep = (i: number) => (i > 0 ? nom.slice(mots[i - 1].fin, mots[i].debut) : '');
  const PREP = /^(?:de|du|des|d|la|le|les|l|et|a|au|aux|sur|sous|en|pour|lez|les)$/;
  const ARTICLE = /^(?:le|la|les|l)$/;
  const revisable = (i: number) => ['dico', 'propre', 'sigle'].includes(mots[i].src) && !(mots[i].src === 'sigle' && !motDuDictionnaire(mots[i].mot) && !PRENOMS.has(k(i)));
  const cap = (i: number) => { mots[i].r = mots[i].r.charAt(0).toUpperCase() + mots[i].r.slice(1).toLowerCase(); };
  const estMaj = (i: number) => /^[A-ZÀ-Ý]/.test(mots[i].r) && mots[i].r !== mots[i].r.toUpperCase();
  const tete = (i: number) => ARTICLES_MASCULINS.test(mots[i].mot) || ARTICLES_FEMININS.test(mots[i].mot) || INSTITUTION_VOYELLE.test(mots[i].mot);
  const propre = new Set<number>();
  // Commune ou lieu connu d'un seul mot (« REIMS », « PARIS », « SEINE ») : nom propre, avant les règles qui en dépendent.
  for (let i = 1; i < mots.length; i++) {
    const c = mots[i].r.charAt(0).toUpperCase() + mots[i].r.slice(1).toLowerCase();
    if (revisable(i) && !PREP.test(k(i)) && estNomDeLieu(c)) { cap(i); propre.add(i); }
  }
  for (let i = 1; i < mots.length; i++) {
    // Prénom (hors article : « les roses ») : le prénom et les mots qui le suivent sans préposition ; « d'Arc », « de Gaulle ».
    if (PRENOMS.has(k(i)) && revisable(i) && !ARTICLE.test(k(i - 1))) {
      let j = i;
      while (j < mots.length && !PREP.test(k(j)) && /^\s+$/.test(j === i ? ' ' : sep(j))) {
        if (revisable(j) || mots[j].src === 'brut') cap(j);
        propre.add(j); j++;
      }
      // Particule de nom de personne (« Jeanne d'Arc », « Charles de Gaulle ») : le mot qui suit prend sa majuscule.
      if (j + 1 < mots.length && /^(?:de|d)$/.test(k(j)) && !PREP.test(k(j + 1)) && j + 2 >= mots.length) {
        if (revisable(j + 1)) cap(j + 1);
        propre.add(j + 1);
      }
      i = j - 1;
      continue;
    }
    // Nom propre introduit par un article après un nom commun (« MAISON DE RETRAITE LES ROSES », « CENTRE AQUATIQUE LA PISCINE ») :
    // l'article et les mots qui le suivent, jusqu'à la première préposition. Jamais dans un intitulé (« gardiennage la nuit »).
    // (jamais après une préposition ou une conjonction, ni devant un nom commun d'institution : « ENTRE LA VILLE DE ROUEN ET LE
    // CCAS » reste « la Ville », « le CCAS »)
    if (!intitule && ARTICLE.test(k(i)) && /^\s+$/.test(sep(i)) && i + 1 < mots.length && !PREP.test(k(i - 1)) && !/^(?:entre|avec|par|chez|ou|dont|contre|vers|selon|sans|constitue|constitu[ée]e?|forme|form[ée]e?|regroupant|associant)$/.test(k(i - 1))
      && /^\s+$/.test(sep(i + 1) || ' ') && !tete(i + 1) && mots[i + 1].src !== 'sigle' && !/^[A-ZÀ-Ý0-9]{2,}$/.test(mots[i + 1].r)) {
      cap(i);
      let j = i + 1;
      while (j < mots.length && !PREP.test(k(j))) {
        if (revisable(j)) cap(j);
        propre.add(j); j++;
      }
      i = j - 1;
      continue;
    }
    // « Grand » devant un nom propre (« GRAND REIMS », « GRAND PARIS ») : « Grand ».
    // (aussi quand le DCE écrit « Le Grand Reims » en casse mêlée, même s'il emploie ailleurs « grand » en minuscules)
    if (/^grande?s?$/.test(k(i)) && i + 1 < mots.length && /^[A-ZÀ-Ý]/.test(mots[i + 1].r)
      && (revisable(i) || new RegExp(`(?<![\\p{L}])Grande?s?[\\s-]+${echapper(mots[i + 1].r)}(?![\\p{L}])`, 'u').test(dce))) { cap(i); propre.add(i); continue; }
    // Gentilé après un nom commun (« AGGLOMERATION LILLOISE », « BASSIN RENNAIS ») : en minuscules.
    if (mots[i].src === 'propre' && /(?:ois|oise|oises|ais|aise|aises|ien|ienne|iens|iennes)$/i.test(mots[i].mot) && /^[a-zà-ÿ]/.test(mots[i - 1].r) && !PREP.test(k(i - 1)) && /^\s+$/.test(sep(i))) {
      mots[i].r = mots[i].r.toLowerCase(); continue;
    }
    // Suite d'un nom propre, sans préposition (« LE HAVRE SEINE METROPOLE », « ROUEN VALLEE DE SEINE », « GRAND PARIS SUD EST
    // AVENIR ») : chaque mot prend sa majuscule. Jamais après la tête de l'institution ni après un sigle.
    if (!intitule && revisable(i) && /^[a-zà-ÿ]/.test(mots[i].r) && !PREP.test(k(i)) && /^\s+$/.test(sep(i)) && i >= 2 && estMaj(i - 1) && !tete(i - 1) && !PREP.test(k(i - 1))
      && (propre.has(i - 1) || ['propre', 'dce', 'compose', 'brut'].includes(mots[i - 1].src) || estNomDeLieu(mots[i - 1].r))) {
      cap(i); propre.add(i); incertains.push(mots[i].r); continue;
    }
    if (estMaj(i) && (mots[i].src === 'propre' || mots[i].src === 'dce')) propre.add(i);
    // Mot du dictionnaire mis en minuscules après « de / du / des / d' » : peut être un nom de lieu ou de personne (« MAIRIE DU
    // TRAIT ») ; incertain, sauf nom commun d'institution (« de l'habitat », « d'action sociale »).
    if (mots[i].src === 'dico' && /^[a-zà-ÿ]/.test(mots[i].r) && /^(?:de|du|des|d|la|l)$/.test(k(i - 1)) && !NOMS_COMMUNS_INSTITUTION.has(k(i))) incertains.push(mots[i].r);
  }
}

/** Gentilés de la zone de GSS (adjectifs, en minuscules après un nom commun : « l'agglomération rouennaise »). */
const GENTILES: Record<string, string> = {
  rouennais: 'rouennais', rouennaise: 'rouennaise', rouennaises: 'rouennaises', havrais: 'havrais', havraise: 'havraise', havraises: 'havraises',
  caennais: 'caennais', caennaise: 'caennaise', ebroicien: 'ébroïcien', ebroicienne: 'ébroïcienne', ebroiciens: 'ébroïciens', ebroiciennes: 'ébroïciennes',
  dieppois: 'dieppois', dieppoise: 'dieppoise', fecampois: 'fécampois', fecampoise: 'fécampoise', elbeuvien: 'elbeuvien', elbeuvienne: 'elbeuvienne',
  normand: 'normand', normande: 'normande', normands: 'normands', normandes: 'normandes', parisien: 'parisien', parisienne: 'parisienne',
  cauchois: 'cauchois', cauchoise: 'cauchoise', brayon: 'brayon', brayonne: 'brayonne', augeron: 'augeron', augeronne: 'augeronne',
};

/**
 * Lieux connus remis dans leur graphie usuelle dans un nom ou un intitulé déjà mis en casse (T4-COH-9 : « … de la porte
 * Oceane » → « … de la Porte Océane », « côte d'albâtre » → « Côte d'Albâtre », « ST Étienne du Rouvray » →
 * « Saint-Étienne-du-Rouvray ») ; mots reconnus renvoyés pour ne pas être signalés comme incertains.
 */
export function lieuxEnGraphieUsuelle(t: string): { texte: string; reconnus: Set<string> } {
  const reconnus = new Set<string>();
  let texte = String(t || '');
  const cle = (v: string) => cleCommune(v);
  const lieux = lieuxConnus().filter((l) => l.split(/[\s'’-]+/).length >= 1).sort((a, b) => b.length - a.length);
  for (const lieu of lieux) {
    const mots = cle(lieu).split(' ').filter(Boolean);
    if (!mots.length) continue;
    // Mots du lieu, séparés par des espaces, tirets ou apostrophes, « St »/« Ste » pour « Saint »/« Sainte ».
    const rx = new RegExp(`(?<![\\p{L}])${mots.map((w) => (w === 'saint' ? '(?:saint|st)' : w === 'sainte' ? '(?:sainte|ste)' : w.split('').map((ch) => ({ a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' } as Record<string, string>)[ch] || ch).join(''))).join("[\\s'’-]+")}(?![\\p{L}])`, 'giu');
    texte = texte.replace(rx, (m0) => { cle(m0).split(' ').forEach((w) => reconnus.add(w)); return lieu; });
    // Commune à article après une contraction (« du havre » → « du Havre », « des andelys » → « des Andelys », T5-COH-2).
    const art = /^(Le|Les)\s+(.+)$/.exec(lieu);
    if (art && mots.length > 1) {
      const reste = mots.slice(1);
      const rxc = new RegExp(`(?<=(?<![\\p{L}])(?:${art[1] === 'Le' ? 'du|au' : 'des|aux'})\\s+)${reste.map((w) => w.split('').map((ch) => ({ a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' } as Record<string, string>)[ch] || ch).join('')).join("[\\s'’-]+")}(?![\\p{L}])`, 'giu');
      texte = texte.replace(rxc, (m0) => { cle(m0).split(' ').forEach((w) => reconnus.add(w)); return art[2]; });
    }
  }
  return { texte, reconnus };
}

/**
 * Nom de l'acheteur écrit seulement en capitales, sans graphie en casse mêlée dans le DCE (T4-COH-8 : « ROUEN NORMANDIE
 * AMENAGEMENT », « LE HAVRE SEINE METROPOLE », « SEINE-MARITIME ATTRACTIVITE », « LOGEO SEINE ») : chaque mot plein avec sa
 * majuscule (« Le Havre » garde son article), accents rétablis par le dictionnaire (« Aménagement », « Métropole »), lieux
 * connus dans leur graphie usuelle, sigles gardés. Les mots ni du dictionnaire ni lieux connus (« Logeo ») sont renvoyés
 * comme incertains (graphie à confirmer par GSS). '' si le nom n'est pas en capitales.
 */
export function casseNomEnCapitales(nom: string, dceBrut: string): { forme: string; incertains: string[] } {
  const dce = sansAdressesWeb(dceBrut);
  const lettres = String(nom || '').replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!lettres || lettres.replace(/[^A-ZÀ-Ý]/g, '').length / lettres.length <= 0.7) return { forme: '', incertains: [] };
  // Nom d'un seul mot en capitales (« ACOSS ») : un sigle, gardé tel quel.
  if ((String(nom).match(/[A-Za-zÀ-ÿ]+/g) || []).filter((w) => !MOTS_OUTILS.has(normaliser(w))).length < 2) return { forme: '', incertains: [] };
  const incertains: string[] = [];
  let premier = true;
  const brute = String(nom).replace(/[A-Za-zÀ-ÿ]+/g, (mot) => {
    const k = normaliser(mot);
    let r: string;
    if (MOTS_OUTILS.has(k) && !premier) r = mot.toLowerCase();
    else if (/^(?:ST|STE)$/.test(mot)) r = mot === 'ST' ? 'Saint' : 'Sainte';
    else if ((mot.length <= 3 && !graphieMinusculeGss(mot) && !motDuDictionnaire(mot)) || (mot.length <= 5 && sigleProbable(mot, dce))) r = mot;
    else {
      const d = motDuDictionnaire(mot) || graphieMinusculeGss(mot) || nomEnIte(mot);
      if (d) r = d.charAt(0).toUpperCase() + d.slice(1);
      else { r = mot.charAt(0) + mot.slice(1).toLowerCase(); if (mot.length >= 4) incertains.push(r); }
    }
    if (premier) r = r.charAt(0).toUpperCase() + r.slice(1);
    premier = false;
    return r;
  });
  const l = lieuxEnGraphieUsuelle(brute);
  return { forme: l.texte, incertains: incertains.filter((w) => !l.reconnus.has(cleCommune(w))) };
}

/**
 * Forme juridique écrite après un tiret à la fin du nom de l'acheteur (imm : « … (Nouvel IMM) – Association régie par la
 * loi du 1er juillet 1901 », « … – SA au capital de … », « … – Établissement public à caractère administratif ») : ce
 * n'est pas le nom ; elle est retirée (sinon le nom de 15 mots, forme juridique comprise, revenait 24 fois).
 */
const FORME_JURIDIQUE_FINALE = /\s+[–—-]\s+(?:association|soci[ée]t[ée]|s\.?\s?a\.?(?:\s?s\.?)?(?:\s?u\.?)?|s\.?\s?a\.?\s?r\.?\s?l\.?|[ée]tablissement public|e\.?\s?p\.?\s?[aic]\.?(?:\s?c\.?)?|groupement d.int[ée]r[êe]t public|g\.?\s?i\.?\s?p\.?|fondation|soci[ée]t[ée] (?:publique locale|d.[ée]conomie mixte))(?![A-Za-zÀ-ÿ])[^–—()]*$/i;
export function sansFormeJuridiqueFinale(nom: string): string {
  const n = String(nom || '').replace(/\s+/g, ' ').trim();
  const r = n.replace(FORME_JURIDIQUE_FINALE, '').trim();
  return r && r !== n && r.split(/\s+/).length >= 2 ? r : n;
}

/**
 * Tête nominale d'un nom très long sans sigle (« Syndicat mixte de gestion des déchets … » → « Syndicat mixte »,
 * « Établissement public de coopération culturelle … » → « Établissement public ») : le nom et ses adjectifs jusqu'à la
 * première préposition. '' si le nom n'a pas cette forme. Un nom en capitales est ramené à « Syndicat mixte ».
 */
export function teteNominale(nom: string): string {
  // Adjectifs coordonnés et compléments de la forme (« Syndicat intercommunal à vocation multiple de la région d'Yvetot » →
  // « Syndicat intercommunal à vocation multiple », T8-COH-4) : « et » ou « à » suivis d'un mot, jusqu'au premier « de ».
  const m = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]+(?:\s+(?:(?:et|à)\s+)?(?!(?:de|du|des|et|à|en|pour|sur)(?![A-Za-zÀ-ÿ]))[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]+){0,4})\s+(?:de|du|des|d['’])(?![A-Za-zÀ-ÿ])/i.exec(String(nom || '').trim());
  if (!m || m[1].split(/\s+/).length >= String(nom).trim().split(/\s+/).length) return '';
  const t = m[1];
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/** Forme juridique en tête du nom de l'acheteur, suivie de son nom d'usage (« Établissement public industriel et commercial … »). */
const PREFIXE_JURIDIQUE = /^(?:[ée]tablissement\s+public(?:\s+(?:industriel\s+et\s+commercial|administratif|local|de\s+coop[ée]ration\s+(?:culturelle|intercommunale|environnementale)(?:\s+et\s+(?:environnementale|culturelle))?|[àa]\s+caract[èe]re\s+(?:industriel\s+et\s+commercial|administratif|scientifique,?\s+culturel\s+et\s+professionnel|scientifique\s+et\s+technologique)))?|syndicat\s+(?:mixte|intercommunal(?:\s+[àa]\s+vocation\s+(?:unique|multiple))?)|groupement\s+d['’]int[ée]r[êe]t\s+public|soci[ée]t[ée]\s+(?:publique\s+locale|d['’][ée]conomie\s+mixte)|association(?:\s+loi\s+1901)?|r[ée]gie(?:\s+autonome)?|office\s+public)\s+/i;

/** Graphie usuelle des mots d'une forme juridique (PREFIXE_JURIDIQUE), pour un nom écrit en capitales. */
const MOTS_FORME_JURIDIQUE: Record<string, string> = {
  etablissement: 'établissement', public: 'public', publique: 'publique', industriel: 'industriel', commercial: 'commercial',
  administratif: 'administratif', local: 'local', locale: 'locale', de: 'de', et: 'et', a: 'à', cooperation: 'coopération',
  culturelle: 'culturelle', culturel: 'culturel', intercommunale: 'intercommunale', intercommunal: 'intercommunal',
  environnementale: 'environnementale', caractere: 'caractère', scientifique: 'scientifique', professionnel: 'professionnel',
  technologique: 'technologique', syndicat: 'syndicat', mixte: 'mixte', vocation: 'vocation', unique: 'unique', multiple: 'multiple',
  groupement: 'groupement', d: 'd', interet: 'intérêt', societe: 'société', economie: 'économie', association: 'association',
  loi: 'loi', regie: 'régie', autonome: 'autonome', office: 'office',
};

/**
 * Nom en capitales qui commence par une forme juridique (« ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE OPÉRA DE ROUEN
 * NORMANDIE », que le DCE nomme « l'Opéra de Rouen Normandie », T9-COH-2) : la forme juridique dans sa graphie usuelle
 * (« Établissement public de coopération culturelle »), le nom d'usage dans la graphie du DCE (« Opéra de Rouen
 * Normandie »), sinon tel que le DCE l'écrit. '' si le nom n'a pas cette forme.
 */
function casseFormeJuridique(nom: string, dce: string): string {
  const lettres = nom.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!lettres || lettres.replace(/[^A-ZÀ-Ý]/g, '').length / lettres.length <= 0.7) return '';
  const fj = PREFIXE_JURIDIQUE.exec(nom);
  if (!fj) return '';
  const forme = fj[0].trim().replace(/[A-Za-zÀ-ÿ]+/g, (w) => MOTS_FORME_JURIDIQUE[normaliser(w)] ?? '\u0000');
  if (forme.includes('\u0000')) return '';
  const reste = nom.slice(fj[0].length).trim();
  const usage = casseDuDce(reste, dce) || reste;
  return `${forme.charAt(0).toUpperCase()}${forme.slice(1)} ${usage}`;
}

/** Service d'un acheteur (direction, pôle, bureau, service des achats…), jamais l'acheteur lui-même. */
const SERVICE_ACHETEUR = /^(?:sous[- ]direction|direction|p[ôo]le|bureau|mission|service\s+(?:des\s+|de\s+la\s+|du\s+|d['’]\s*)?(?:achats?|march[ée]s|commande|juridique|finances?|affaires)|d[ée]partement\s+(?:des\s+|de\s+la\s+|du\s+)(?:achats?|march[ée]s|commande))(?![a-zà-ÿ])/i;

/**
 * Formes de l'acheteur pour le publipostage (consigne 2 : on remplace le nom, sans l'alourdir).
 * - forme longue : chaque entité coordonnée prend son article (« … (ENPC) et l'Institut national … (IGN) ») ;
 * - forme courte : sigles des entités (« l'ENPC et l'IGN »), sinon nom principal sans la précision qui suit
 *   (« …, pour l'École nationale … ») ; absente quand le nom est déjà court.
 * La forme longue sert à la première mention du bloc 1 (amorce), la forme courte partout ailleurs.
 */
/** Découpe un texte sur un séparateur, jamais à l'intérieur d'une parenthèse (« (SAR de Rouen – BOP Normand) »). */
function couperHorsParentheses(t: string, rx: RegExp): string[] {
  let profondeur = 0;
  const masque = [...t].map((c) => {
    if (c === '(') { profondeur++; return c; }
    if (c === ')') { profondeur = Math.max(0, profondeur - 1); return c; }
    return profondeur > 0 ? '\u0001' : c;
  }).join('');
  const r: string[] = [];
  let debut = 0;
  for (const m of masque.matchAll(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`))) {
    r.push(t.slice(debut, m.index!));
    debut = m.index! + m[0].length;
  }
  r.push(t.slice(debut));
  return r;
}

/** Parenthèses équilibrées (« BOP Normand) » : non). */
function parenthesesEquilibrees(t: string): boolean {
  let p = 0;
  for (const c of t) {
    if (c === '(') p++;
    else if (c === ')' && --p < 0) return false;
  }
  return p === 0;
}

/** Nom commun d'institution en tête d'entité (« Ville », « CCAS », « Centre »…) : l'entité prend son article. */
function teteInstitution(e: string): boolean {
  const premier = e.trim().split(/[\s(]/)[0];
  // Pluriel compris (« Les Hôpitaux de … », « Les Musées de … ») : le nom commun garde son article.
  const singulier = premier.replace(/aux$/i, 'al').replace(/[sx]$/i, '');
  return [premier, singulier].some((w) => ARTICLES_MASCULINS.test(w) || ARTICLES_FEMININS.test(w) || INSTITUTION_VOYELLE.test(w));
}

export function formesClient(nom: string, dce = ''): { long: string; court?: { article: string; nom: string; genre?: 'f' | 'm' | '' }; pluriel?: boolean; articleLong?: string } {
  const f: { long: string; court?: { article: string; nom: string; genre?: 'f' | 'm' | '' }; pluriel?: boolean; articleLong?: string } = formesClientBrut(nom, dce);
  // Groupement de commandes : la forme longue commence par le premier membre, avec son propre article.
  const grp = /^groupement\s+de\s+commandes?\s/i.test(sansFormeJuridiqueFinale(nom)) && f.long && !/^groupement/i.test(f.long);
  if (grp) f.articleLong = articleEtNom(f.long.split(/\s+et\s+|,\s+/)[0], dce).article;
  // Jamais une forme courte aux parenthèses déséquilibrées (T1-COH-1 : « à BOP Normand) », 10 fois dans un vrai mémoire).
  if (f.court && !parenthesesEquilibrees(f.court.nom)) return { long: f.long, ...(f.pluriel ? { pluriel: f.pluriel } : {}), ...(f.articleLong !== undefined ? { articleLong: f.articleLong } : {}) };
  return f;
}

function formesClientBrut(nom: string, dce = ''): { long: string; court?: { article: string; nom: string; genre?: 'f' | 'm' | '' }; pluriel?: boolean } {
  // Rôle de coordonnateur entre parenthèses (« Ville de Rouen (coordonnateur du groupement de commandes Ville de Rouen /
  // CCAS de Rouen) ») : retiré, comme « , en qualité de coordonnateur » (T1-COH-1).
  let n = sansFormeJuridiqueFinale(nom).replace(/\s*\((?:en qualit[ée] de\s+)?coordonna(?:teur|trice)\b[^()]*\)/i, '').trim();
  // Groupement de commandes (« Groupement de commandes Ville de Rouen – CCAS de Rouen », « … constitué entre la Ville de
  // Rouen et le CCAS de Rouen ») : le mémoire s'adresse aux membres, le coordonnateur (première entité) en tête.
  // Toutes les tournures (T3-COH-2) : « constitué de / entre / par », « composé de », « formé de », « regroupant »… ; chaque
  // membre perd sa préposition et son article (« du CCAS de Rouen » → « CCAS de Rouen », qui reprend « le »).
  const grp = /^groupement\s+de\s+commandes?\s+(?:(?:constitu|compos|form)[ée]e?s?\s+(?:entre|de|par|des)\s+|(?:regroupant|r[ée]unissant|associant|entre)\s+)?(.+)$/i.exec(n);
  if (grp) {
    const membres = couperHorsParentheses(grp[1], /\s+[–—-]\s+|\s+\/\s+|\s+et\s+|,\s+/).map((x) => x.trim()).filter(Boolean);
    if (membres.length >= 2) n = membres.map((m) => m.replace(/^(?:du|des|de(?=\s)|d['’])\s*/i, '').replace(/^(?:la|le|les)\s+|^l['’]\s*/, '')).join(' et ');
  }
  const iPrecision = n.search(/,\s*(?:pour|agissant|repr[ée]sent[ée]e?s?|au nom|en qualit[ée] de)\b/i);
  const principal = iPrecision > 0 ? n.slice(0, iPrecision) : n;
  const suite = iPrecision > 0 ? n.slice(iPrecision) : '';
  // Entités coordonnées : séparées après la parenthèse d'un sigle (« (ENPC) et Institut … »), ou par « et » entre deux
  // entités qui commencent par un nom d'institution (« Ville de Rouen et CCAS de Rouen ») ; jamais dans un nom
  // (« Ponts et Chaussées »).
  const entites = couperHorsParentheses(principal, /(?<=\))\s*(?:,|\s+et)\s+(?=[A-ZÀ-Ý])/)
    .flatMap((e) => {
      const parts = couperHorsParentheses(e, /\s+et\s+(?=[A-ZÀ-Ý])/).map((x) => x.trim());
      return parts.length > 1 && parts.every(teteInstitution) ? parts : [e];
    })
    .map((x) => x.trim()).filter(Boolean);
  const articles = entites.map((e) => articleEtNom(e, dce).article);
  const avecArticle = (art: string, e: string) => (!art ? e : art.endsWith("'") ? `${art}${e}` : `${art} ${e}`);
  const long = entites.length > 1
    ? `${[entites[0], ...entites.slice(1).map((e, i) => avecArticle(articles[i + 1], e))].reduce((acc, e, i, l) => (i === 0 ? e : `${acc}${i === l.length - 1 ? ' et ' : ', '}${e}`), '')}${suite}`
    : n;
  const pluriel = entites.length > 1 || undefined;
  const mots = n.split(/\s+/).length;
  // Forme juridique entre parenthèses (« … Théodore Simon (Groupement d'Intérêt Public) ») : jamais une forme courte ;
  // le sigle que le DCE emploie (« l'IFITS ») la remplace. Nom de 5 ou 6 mots suivi de son sigle dans le DCE
  // (« établissement public du château de fontainebleau (EPCF) ») : le sigle sert après la première mention.
  // Nom d'usage entre parenthèses, en fin de nom ou, s'il est la seule parenthèse, au milieu du nom (T4C-3).
  const parenthese = entites.length === 1 && !suite
    ? ((/\(([^()]{2,40})\)\s*$/.exec(principal) || [])[1] || ((principal.match(/\(/g) || []).length === 1 ? (/\(([^()]{2,40})\)/.exec(principal) || [])[1] : undefined))?.trim()
    : undefined;
  const juridique = !!parenthese && FORME_JURIDIQUE.test(normaliser(parenthese).replace(/[’]/g, "'"));
  // Sigle suivi de son nom développé entre parenthèses (génération réelle caen 702 : « ACOSS (Agence centrale des organismes de
  // sécurité sociale) », écrit en entier une cinquantaine de fois) : le sigle sert après la première mention.
  {
    const sp = /^([A-Z][A-Z0-9&.\-]{1,11})\s*\(([^()]{8,})\)\s*$/.exec(principal.trim());
    if (sp && entites.length === 1 && !suite) {
      const art = articleEtNom(sp[1], dce).article || articleSigle(sp[1], '');
      if (art) return { long, court: { article: art, nom: sp[1], genre: '' } };
    }
  }
  // Sigle entre parenthèses en fin de nom, employé seul par le DCE avec un article (T2-GEN-8 : « Établissement Français du
  // Sang (EFS) » … « l'EFS » ; « Centre Hospitalier Universitaire de Rouen (CHU) » … « le CHU ») : forme courte, quelle que
  // soit la longueur du nom (jamais « (EFS) » imprimé à chaque mention).
  if (entites.length === 1 && !suite && parenthese && !juridique && /^[A-Z][A-Z0-9&]{1,11}$/.test(parenthese)) {
    const nDce = (normaliser(dce).match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |les |du |des |au |aux |de l'|a l')${echapper(normaliser(parenthese))}(?![a-z0-9])`, 'g')) || []).length;
    const art = articleEtNom(parenthese, dce).article || articleSigle(parenthese, '');
    if (nDce >= 2 && art) return { long, court: { article: art, nom: parenthese, genre: '' } };
  }
  if (entites.length === 1 && !suite && (juridique || (mots >= 5 && mots <= 6 && !parenthese))) {
    const sigle = sigleDuDce(juridique ? principal.replace(/\s*\([^()]*\)\s*$/, '') : principal, dce);
    const art = sigle ? articleEtNom(sigle, dce).article || articleSigle(sigle, '') : '';
    if (sigle && art) return { long, court: { article: art, nom: sigle, genre: '' } };
  }
  // Nom court suivi d'un service (T1-GEN-9 : « Région Normandie – Direction des achats ») : la forme courte est la
  // tutelle avec son article, quelle que soit la longueur du nom.
  if (entites.length === 1 && !suite) {
    const morceaux = couperHorsParentheses(principal, /\s[–—-]\s/).map((x) => x.trim());
    if (mots <= 6 && morceaux.length === 2 && SERVICE_ACHETEUR.test(morceaux[1])) {
      const a = articleEtNom(morceaux[0], dce);
      if (a.article || !teteInstitution(morceaux[0])) return { long, court: { article: a.article, nom: a.nom || morceaux[0] } };
    }
  }
  if (mots <= 6) return { long, pluriel };
  // Sigle d'usage entre parenthèses au milieu du nom, que le DCE emploie (ca_normandie 241 : « Ministère de la Justice –
  // Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen »,
  // 8 fois en entier dans le cadre) : forme courte « le SAR de Rouen » ; le programme budgétaire (« BOP Normand ») n'est
  // pas un second acheteur.
  {
    // Sigle suivi d'un complément dans la même parenthèse (génération réelle ca_normandie 801 : « (SAR de Rouen – BOP
    // Normand) ») : le sigle d'usage reste « SAR de Rouen ».
    const usageSigle = (/\(([A-Z]{2,6}(?:\s+(?:de|du|des|d['’])\s*[A-ZÀ-Ý][\wÀ-ÿ'’-]*)?)(?:\)|\s*(?:[–—,]|\s-)\s*[^()]*\))/.exec(principal) || [])[1];
    // Groupement dont chaque entité a son sigle (ign : « École … (ENPC) et Institut … (IGN), pour … ») : la première
    // parenthèse n'est pas le sigle d'usage de l'acheteur ; la règle des sigles des entités, plus bas, donne
    // « l'ENPC et l'IGN » au pluriel.
    const siglesEntites = entites.map((e) => (/\(([A-Z][A-Z0-9&.\-]{1,11})\s*[,)]/.exec(e) || [])[1] || '');
    if (usageSigle && !(entites.length > 1 && siglesEntites.every(Boolean))) {
      const nDce = (normaliser(dce).match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |du |de l'|au |a l'|les |des )${echapper(normaliser(usageSigle))}(?![a-z0-9])`, 'g')) || []).length;
      const art = articleEtNom(usageSigle, dce).article || articleSigle(usageSigle.split(/\s+/)[0], '');
      if (nDce >= 2 && art) return { long, court: { article: art, nom: usageSigle, genre: '' } };
    }
  }
  // Nom composé « Tutelle – Entité / Programme (précision) » (ca_normandie 221 : « Ministère de la Justice – Service
  // administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen) », 11 fois dans le cadre) : forme
  // courte = l'entité, par son sigle quand le DCE l'emploie (« le SAR de Rouen »), sinon son nom.
  if (entites.length === 1 && !suite && couperHorsParentheses(principal, /\s[–—-]\s/).length > 1) {
    const morceaux = couperHorsParentheses(principal, /\s[–—-]\s/);
    let entite = couperHorsParentheses(morceaux[morceaux.length - 1], /\s+\/\s+/)[0].split(/\s*\(/)[0].trim();
    // Service de l'acheteur après le tiret (« Ville du Havre - Direction de la commande publique », « CHU de Rouen –
    // Direction des achats », en capitales aussi) : ce n'est pas l'acheteur ; la forme courte est la tutelle (« la Ville
    // du Havre », « le CHU de Rouen »). Un service qui est lui-même l'acheteur (« Service administratif régional de
    // Rouen ») reste la forme courte.
    if (SERVICE_ACHETEUR.test(entite)) {
      // T2-COH-1 : la tutelle restante suit la même chaîne qu'un nom sans service (sigle du DCE, nom propre après la forme
      // juridique « l'Opéra de Rouen Normandie », tête nominale), jamais la forme juridique d'un nom propre perdu.
      const tutelle = morceaux.slice(0, -1).join(' - ').trim();
      const sous = formesClientBrut(tutelle, dce);
      if (sous.court) return { long, court: sous.court, ...(sous.pluriel ? { pluriel: sous.pluriel } : {}) };
      entite = morceaux[0].trim();
    }
    const m = /^(.+?)\s+((?:de|du|des|d['’])\s*[A-ZÀ-Ý][\wÀ-ÿ'’-]*(?:\s+(?:et|de|du|des)\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]*)*)$/.exec(entite);
    const tete = m ? m[1] : entite;
    const lieu = m ? m[2] : '';
    const initiales = normaliser(tete).replace(/[^a-z0-9' -]+/g, ' ').split(/[\s'-]+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w)).map((w) => w[0]).join('').toUpperCase();
    if (initiales.length >= 2 && entite.split(/\s+/).length >= 2) {
      const avecLieu = lieu ? `${initiales} ${lieu}` : '';
      const nLieu = avecLieu ? (dce.match(new RegExp(`(?<![A-Za-z0-9])${echapper(avecLieu)}(?![A-Za-z0-9])`, 'g')) || []).length : 0;
      const nSigle = (normaliser(dce).match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |du |de l'|au |a l'|les |des )${echapper(initiales.toLowerCase())}(?![a-z0-9])`, 'g')) || []).length;
      const art = articleEtNom(initiales, dce).article || articleSigle(initiales, '');
      if (art && nLieu >= 2) return { long, court: { article: art, nom: avecLieu, genre: '' } };
      if (art && nSigle >= 3) return { long, court: { article: art, nom: initiales, genre: '' } };
    }
    // Complément de lieu après le tiret (T4G-1 : « Caisse primaire d'assurance maladie de Rouen-Elbeuf-Dieppe – Seine-Maritime »,
    // « … – Normandie ») : ce n'est pas l'entité de l'acheteur ; la forme courte est le sigle que le DCE emploie (« la CPAM »),
    // sinon il n'y en a pas (forme longue).
    if (estNomDeLieu(entite) && !teteInstitution(entite)) {
      const tutelle = morceaux.slice(0, -1).join(' - ').trim();
      // Sigle du nom entier, sinon de sa tête sans son complément de lieu (« Caisse primaire d'assurance maladie » → CPAM).
      const sigle = sigleDuDce(tutelle, dce) || sigleDuDce(tutelle.replace(/\s+(?:de|du|des|d['’])\s*[A-ZÀ-Ý].*$/, ''), dce);
      const art = sigle ? articleEtNom(sigle, dce).article || articleSigle(sigle, '') : '';
      return sigle && art ? { long, court: { article: art, nom: sigle, genre: '' } } : { long, pluriel };
    }
    // Tutelle (ou entité) de plus de 8 mots (T4-COH-4 : « Établissement public de coopération culturelle et
    // environnementale du Grand Paris Sud - Direction des moyens généraux… », 29 fois en entier) : sa tête nominale.
    const cible = entite.split(/\s+/).length <= 8 ? entite : teteNominale(entite);
    if (cible && entite !== principal) {
      const a = articleEtNom(cible, dce);
      if (a.article || cible === entite) return { long, court: { article: a.article, nom: a.nom || cible, ...(cible !== entite ? { genre: genreTete(cible) } : {}) } };
    }
  }
  // Sigles des entités (« (ENPC) », « (ENSG, dénommée … ) »).
  const sigles = entites.map((e) => (/\(([A-Z][A-Z0-9&.\-]{1,11})\s*[,)]/.exec(e) || [])[1] || '');
  if (sigles.every(Boolean)) {
    const arts = sigles.map((s, i) => articleSigle(s, articles[i]));
    if (arts.every(Boolean)) {
      const reste = sigles.map((s, i) => (i === 0 ? s : avecArticle(arts[i], s)));
      return { long, pluriel, court: { article: arts[0], nom: reste.length > 1 ? `${reste.slice(0, -1).join(', ')} et ${reste[reste.length - 1]}` : reste[0] } };
    }
  }
  if (suite && entites.length === 1 && principal.split(/\s+/).length <= 8) {
    // Article de la forme courte (vitry : « la Ville de Vitry-sur-Seine », jamais « accompagnons Ville de Vitry-sur-Seine »).
    const a = articleEtNom(principal, dce);
    return { long, court: { article: a.article, nom: a.nom || principal } };
  }
  // Nom d'usage entre parenthèses en fin de nom (« Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM) ») :
  // forme courte, sinon le nom de 8 mots revenait à chaque mention (génération réelle imm 15 : 21 fois en 12 pages). Le
  // sigle qu'il contient est retenu quand le DCE l'emploie seul (« l'IMM », 37 fois dans le DCE de l'IMM), sinon le nom
  // d'usage avec l'article de son premier mot (« le Nouvel IMM ») ; le genre de la forme longue (« Association ») ne
  // s'applique plus aux pronoms.
  const usage = juridique ? undefined : parenthese;
  if (usage && /^[A-ZÀ-Ý]/.test(usage) && usage.split(/\s+/).length <= 4 && normaliser(usage) !== normaliser(principal)) {
    const sigle = (/(?:^|\s)([A-Z][A-Z0-9&]{1,11})(?=\s|$)/.exec(usage) || [])[1];
    const d = normaliser(dce);
    if (sigle && sigle !== usage && d) {
      const n = (d.match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |du |de l'|au |a l'|les |des )${echapper(normaliser(sigle))}(?![a-z0-9])`, 'g')) || []).length;
      const art = articleEtNom(sigle, dce).article;
      if (n >= 3 && art) return { long, court: { article: art, nom: sigle, genre: '' } };
    }
    const premier = usage.split(/\s+/)[0];
    const article = /^(?:nouvel|nouveau|grand|petit|vieux|vieil)$/i.test(premier) ? 'le' : /^(?:nouvelle|grande|petite|vieille)$/i.test(premier) ? 'la' : articleEtNom(usage, dce).article;
    if (article) return { long, court: { article, nom: usage, genre: article === 'la' ? 'f' : article === 'le' ? 'm' : '' } };
  }
  // Nom de plus de 8 mots sans sigle ni forme courte (T4-COH-4 : « Syndicat mixte de gestion des déchets ménagers et
  // assimilés de la région elbeuvienne et du plateau du Neubourg ») : tête nominale avec son article après la première
  // mention (« le Syndicat mixte »), jamais le nom entier à chaque mention.
  // Nom propre écrit après la forme juridique (T8-COH-4 : « Établissement public de coopération culturelle Opéra de Rouen
  // Normandie », que le DCE nomme « l'Opéra de Rouen Normandie » ; « Établissement public industriel et commercial Rouen
  // Normandie Tourisme & Congrès ») : c'est le nom d'usage, forme courte ; jamais la forme juridique seule
  // (« l'Établissement public »).
  // Sigle que le DCE écrit entre parenthèses après le nom et emploie ensuite avec un article au moins 2 fois (T9-COH-2 :
  // « … de l'Académie de Rouen (GIP FCIP) … Le GIP FCIP confie », « … et Seine-Maritime (CCI Rouen Métropole) … La CCI
  // Rouen Métropole ») : forme courte, avant le nom d'usage et la tête nominale.
  if (entites.length === 1 && mots > 6) {
    const sigle = sigleParentheseDuDce(principal, dce);
    const art = sigle ? articleEtNom(sigle, dce).article || articleSigle(sigle, '') : '';
    if (sigle && art) return { long, court: { article: art, nom: sigle, genre: '' } };
  }
  if (entites.length === 1 && mots > 6) {
    const fj = PREFIXE_JURIDIQUE.exec(principal);
    const reste = fj ? principal.slice(fj[0].length).trim() : '';
    if (reste && /^[A-ZÀ-Ý]/.test(reste) && !/^(?:De|Du|Des|D['’])\b/.test(reste) && normaliser(reste) !== normaliser(principal)) {
      const a = articleEtNom(reste, dce);
      // Sans article, seul un nom propre s'emploie seul (« Rouen Normandie Tourisme & Congrès ») ; un nom commun
      // (« Formation Continue et Insertion Professionnelle… », T9-COH-2) donnerait « Pour Formation Continue… » : refusé.
      const nomCommun = !a.article && !!graphieMinusculeGss((reste.match(/^[A-Za-zÀ-ÿ]+/) || [''])[0]);
      if (!nomCommun) return { long, court: { article: a.article, nom: a.nom || reste, genre: a.article === 'la' ? 'f' : a.article === 'le' ? 'm' : '' } };
    }
  }
  if (entites.length === 1 && mots > 8) {
    const tete = teteNominale(principal);
    const a = tete ? articleEtNom(tete, dce) : null;
    // Jamais un seul nom commun (« la Chambre », « le Groupement », T9-COH-2) : le nom entier reste.
    if (tete && a?.article && tete.split(/\s+/).length >= 2) return { long, court: { article: a.article, nom: a.nom || tete, genre: genreTete(tete) } };
  }
  return { long, pluriel };
}

/**
 * Sigle d'usage écrit par le DCE entre parenthèses juste après le nom de l'acheteur (« … (GIP FCIP) », « … (CCI Rouen
 * Métropole) ») et employé ensuite avec un article au moins 2 fois (« le GIP FCIP », « la CCI Rouen Métropole »), dans sa
 * graphie du DCE ; jamais une forme juridique seule (« (GIP) »). '' sinon (jamais inventé).
 */
function sigleParentheseDuDce(nom: string, dce: string): string {
  const mots = String(nom || '').match(/[A-Za-zÀ-ÿ0-9]+/g) || [];
  if (mots.length < 2 || !dce) return '';
  // Texte du DCE sans accents ni casse, caractère par caractère (positions conservées), comme graphieEntiereDuDce.
  let plat = '';
  const pos: number[] = [];
  for (let i = 0; i < dce.length; i++) {
    const c = dce[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const x of c) { plat += x; pos.push(i); }
  }
  const rx = new RegExp(`(?<![a-z0-9])${mots.map((w) => normaliser(w).replace(/[^a-z0-9]/g, '')).join("[\\s'’&-]+")}\\s*\\(\\s*([^()\\n]{2,40}?)\\s*\\)`, 'g');
  for (const m of plat.matchAll(rx)) {
    const debut = m.index! + m[0].lastIndexOf(m[1]);
    const brut = dce.slice(pos[debut], pos[debut + m[1].length - 1] + 1).replace(/\s+/g, ' ').trim();
    // Sigle en capitales, suivi au plus de 3 mots du nom (« CCI Rouen Métropole », « SAR de Rouen »).
    if (!/^[A-Z][A-Z0-9&]{1,7}(?: [A-Z][A-Z0-9&]{1,7})?(?: (?:(?:de|du|des|d['’]) ?)?[A-ZÀ-Ý][\wÀ-ÿ'’-]*){0,3}$/.test(brut)) continue;
    if (FORME_JURIDIQUE.test(normaliser(brut).replace(/[’]/g, "'"))) continue;
    const n = (normaliser(dce).match(new RegExp(`(?:^|[^a-z0-9])(?:l'|le |la |les |du |des |au |aux |de l'|a l')${echapper(normaliser(brut))}(?![a-z0-9])`, 'g')) || []).length;
    if (n >= 2) return brut;
  }
  return '';
}

/** Genre de la tête nominale (« Syndicat mixte » : m ; « Communauté … » : f ; '' si inconnu). */
function genreTete(tete: string): 'f' | 'm' | '' {
  const p = tete.split(/\s+/)[0];
  return ARTICLES_FEMININS.test(p) ? 'f' : ARTICLES_MASCULINS.test(p) || /^(?:[ée]tablissement|office|institut|organisme|h[ôo]pital)$/i.test(p) ? 'm' : '';
}

const MOIS = 'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre';

/** Date de début d'exécution écrite dans le DCE (« date prévisionnelle de démarrage … fixée au 1er janvier 2027 »). */
export function dateDebutMarche(dce: string): string {
  const d = String(dce || '').replace(/\s+/g, ' ');
  // Date en lettres (« 1er janvier 2027 ») ou en chiffres (« 01/01/2027 », réécrite « 1er janvier 2027 »), T1-GEN-15.
  const DATE = `((?:1er|\\d{1,2})\\s+(?:${MOIS})\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})`;
  // Tournures (T3G-11) : « date de commencement », « Le présent marché prendra effet le… », « L'accord-cadre débutera le… »,
  // « Le contrat démarrera le… », et « à compter du <date> » dans une phrase de durée du marché.
  const LIBELLE = `(?:date (?:pr[ée]visionnelle |effective )?(?:de d[ée]marrage|de d[ée]but|de commencement)(?: (?:d.ex[ée]cution|des prestations|du march[ée]|de l.accord-cadre))?|d[ée]marrage (?:effectif )?(?:des prestations|du march[ée])|d[ée]but (?:d.ex[ée]cution|des prestations|du march[ée])|commencement (?:des prestations|d.ex[ée]cution)|prise d.effet)`;
  // Sujet au singulier comme au pluriel (« La prestation démarre le… », T4G-7).
  const SUJET = `(?:(?:le pr[ée]sent |la pr[ée]sente |l.|le |la |les )?(?:march[ée]|accord-cadre|contrat|prestations?|ex[ée]cution(?: du march[ée]| des prestations)?))`;
  const VERBE = `${SUJET}\\s+(?:(?:d[ée]but\\w*|commenc\\w*|d[ée]marr\\w*|pren\\w* effet|entr\\w* en vigueur|(?:est|sont|sera|seront) ex[ée]cut[ée]e?s?)(?:\\s+[àa] (?:compter|partir))?)`;
  const DUREE = `(?:dur[ée]e (?:du march[ée]|de l.accord-cadre|du contrat)|(?:march[ée]|accord-cadre|contrat) est conclu)[^.;]{0,120}?`;
  // Période d'exécution (« Période d'exécution : du 1er janvier 2027 au 31 décembre 2027 ») : la première date.
  const PERIODE = `(?:p[ée]riode|dur[ée]e) d.ex[ée]cution\\s*(?:[|:]\\s*)?(?:du\\s+|à compter du\\s+)`;
  // Libellé de tableau ou de colonnes suivi de sa date (« Date prévisionnelle de début des prestations | 1er janvier 2027 »,
  // « … des prestations      01/01/2027 », la date seule sur la ligne suivante) : sans aucun mot entre les deux.
  const rx = new RegExp(`(?:${LIBELLE}(?:\\s*(?:[|:]\\s*)?(?=${DATE.replace(/^\(/, '(?:')})|[^.;]{0,160}?(?:fix[ée]e?|estim[ée]e?|pr[ée]vue?)?\\s*(?:au|le|à compter du|:)\\s*(?:le\\s+)?)|${VERBE}\\s+(?:au|le|à compter du|à partir du|du)\\s+|${PERIODE}|${DUREE}[àa] compter du\\s+)${DATE}`, 'i');
  const m = rx.exec(d);
  if (!m) return '';
  const v = m[1].replace(/\s+/g, ' ');
  const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const n = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!n) {
    // Date en lettres réécrite sous une forme unique (T4G-4 : « 1er Janvier 2027 », « 1ER JANVIER 2027 » → « 1er janvier 2027 »).
    const l = /^(1er|\d{1,2})\s+(\S+)\s+(\d{4})$/i.exec(v);
    if (!l) return v;
    const k = MOIS_FR.findIndex((x) => normaliser(x) === normaliser(l[2]));
    if (k < 0) return v;
    const j = /^1er$/i.test(l[1]) ? 1 : Number(l[1]);
    return `${j === 1 ? '1er' : j} ${MOIS_FR[k]} ${l[3]}`;
  }
  const mois = MOIS_FR[Number(n[2]) - 1];
  if (!mois || Number(n[1]) < 1 || Number(n[1]) > 31) return '';
  return `${Number(n[1]) === 1 ? '1er' : Number(n[1])} ${mois} ${n[3]}`;
}

const NOMBRES_LETTRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15,
  vingt: 20, trente: 30, quarante: 40, 'quarante-cinq': 45, cinquante: 50, soixante: 60,
};

// Durée d'un délai : « dans / sous / en / en moins de / moins de / délai de / au plus tard dans » N unité (T2-GEN-2 : « intervient
// sur site en 30 minutes maximum », « moins de 30 minutes après l'appel »). Jamais une amplitude (« 24 heures sur 24 »).
const RX_DELAI = /(?:dans|sous|en(?:\s+moins\s+de)?|moins\s+de|d[ée]lai(?:\s+maxim(?:al|um))?\s+de|au plus tard (?:dans|en))\s+(?:les\s+|un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+)?(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|dix|douze|quinze|vingt|trente|quarante-cinq|quarante|soixante)\s*(?:\(\s*(\d{1,3}|[a-zà-ÿ]+(?:-[a-zà-ÿ]+)?)\s*\)\s*)?(minutes?|mn|min|heures?|h)(?![\wÀ-ÿ])(?!\s*(?:sur|\/)\s*\d)/gi;

/**
 * Action que mesure un délai (T2-GEN-1). Un délai d'arrivée, de remplacement, de mise en place ou d'exécution dépend d'un
 * verbe ou d'un nom de PRÉSENCE ; un délai qui dépend d'un verbe de DOCUMENT ou de COMMUNICATION (transmettre un rapport,
 * informer l'acheteur, traiter ou acquitter une alarme au PC, prendre en compte) n'est jamais un délai de présence, quel
 * que soit le sujet nommé dans la phrase.
 */
const ACTION_PRESENCE = /interv(?:ien|en)\p{L}*|arriv\p{L}*|(?<![\p{L}])sur (?:site|place|les lieux)(?![\p{L}])|(?<![\p{L}])pr[ée]sen(?:t|te|ts|tes|ce)(?![\p{L}])|(?<![\p{L}])(?:se\s+)?rend(?:re|ra|ront|e|ent)?\s+sur|d[ée]plac\p{L}*|d[ée]p[êe]ch\p{L}*|rempla[cç]\p{L}*|pourv\p{L}*|(?<![\p{L}])relev[ée]e?s?(?![\p{L}])|(?<![\p{L}])rel[èe]ve(?![\p{L}])|mobilis\p{L}*|mise?s?\s+en\s+place|mett\p{L}*\s+en\s+place|met\s+en\s+place|lev[ée]es?\s+de\s+doute|ex[ée]cut\p{L}*|mise?s?\s+[àa]\s+disposition|mett\p{L}*\s+[àa]\s+disposition|renfor\p{L}*|compens\p{L}*|palli\p{L}*|suppl[ée][ée]\p{L}*|prise\s+de\s+(?:poste|service)/giu;
const ACTION_DOCUMENT = /transm\p{L}*|adress[ée]\p{L}*|(?<![\p{L}])adresse(?:r|nt)?(?![\p{L}])|remet\p{L}*|remis\p{L}*|envo[iy]\p{L}*|communiqu\p{L}*|inform\p{L}*|signal\p{L}*|notifi\p{L}*|rapports?(?![\p{L}])|comptes?[- ]rendus?|trait(?:e|ent|er|era|eront|é|ée|és|ées|ement)(?![\p{L}])|acquitt\p{L}*|pri(?:se|s|ses)\s+en\s+compte|prendre\s+en\s+compte|enregistr\p{L}*|r[ée]pond\p{L}*|r[ée]ponse|bilans?(?![\p{L}])|rappel\p{L}*|contre[- ]appel|pr[ée]ven(?:ir|u|ue|us|ance)\p{L}*|avert\p{L}*|appliqu\p{L}*\s+(?:les\s+|des\s+)?consignes|factur\p{L}*/giu;
/** Document dont le nom porte une action de présence (« rapport d'intervention », « compte rendu d'intervention ») : un document. */
const DOCUMENT_DE_PRESENCE = /(?:rapports?|comptes?[- ]rendus?|fiches?|bons?|bilans?|relev[ée]s?|registres?|main courante)\s+(?:d['’]\s*|de\s+(?:l['’]\s*)?|des\s+)(?:interventions?|arriv[ée]es?|remplacements?|rondes?|lev[ée]es?\s+de\s+doute)/giu;
/** Remplacement d'un objet (« remplacent les badges perdus »), jamais celui d'un agent. */
const REMPLACEMENT_D_OBJET = /rempla[cç]\p{L}*\s+(?:(?:les?|la|l['’]|des|du|de|un|une|leurs?|ses?|son|sa)\s*)?(?:[\p{L}-]+\s+)?(?:v[ée]hicules?|t[ée]l[ée]phones?|mat[ée]riels?|cl[ée]s?|cylindres?|badges?|[ée]quipements?|batteries?|appareils?|terminaux|terminal|radios?|talkies?|uniformes?|tenues?|piles?|ampoules?)(?![\p{L}])/giu;

/**
 * Le délai trouvé à la position `debut` d'une proposition (déjà normalisée) mesure-t-il une action de présence ? L'action la
 * plus proche AVANT le délai décide (« le rapport est transmis dans les 24 heures » : document ; « l'agent intervient sur site
 * en 30 minutes » : présence) ; sans action avant, la première action APRÈS (« dispose de 2 heures pour assurer son
 * remplacement ») ; aucune action : pas un délai de présence.
 */
export function delaiDePresence(prop: string, debut: number, fin: number, propositionsPrecedentes = ''): boolean {
  const masque = (rx: RegExp, t: string, garde = '') => t.replace(rx, (m) => (garde && m.length >= garde.length ? garde + ' '.repeat(m.length - garde.length) : ' '.repeat(m.length)));
  const actionsDe = (texte: string) => {
    const t = masque(REMPLACEMENT_D_OBJET, masque(DOCUMENT_DE_PRESENCE, texte, 'rapport'));
    const a: Array<{ pos: number; fin: number; presence: boolean }> = [];
    for (const m of t.matchAll(ACTION_PRESENCE)) a.push({ pos: m.index || 0, fin: (m.index || 0) + m[0].length, presence: true });
    for (const m of t.matchAll(ACTION_DOCUMENT)) a.push({ pos: m.index || 0, fin: (m.index || 0) + m[0].length, presence: false });
    return a;
  };
  const actions = actionsDe(prop);
  const avant = actions.filter((a) => a.fin <= debut).sort((a, b) => b.pos - a.pos)[0];
  if (avant) return avant.presence;
  const apres = actions.filter((a) => a.pos >= fin).sort((a, b) => a.pos - b.pos)[0];
  if (apres) return apres.presence;
  // Proposition sans action (« …, permettant d'assurer le remplacement des absents, dans un délai maximal de deux heures ») :
  // l'action la plus proche des propositions qui la précèdent dans la même phrase.
  const prec = actionsDe(propositionsPrecedentes).sort((a, b) => b.pos - a.pos)[0];
  return !!prec?.presence;
}

/** Sujets des délais que le CCTP peut imposer. */
const SUJETS_DELAI: Record<string, { sujet: RegExp; exclure?: RegExp; objet?: RegExp; personnel?: RegExp }> = {
  // « absence prévue / prévisible » (préavis) exclue ; « absence imprévue », « effectif prévu » gardés.
  // Le remplacement d'un OBJET (rouen_univ : « En cas de panne ils devront être remplacés en moins de 24H par un véhicule
  // équivalent ») n'est pas le remplacement d'un agent : la phrase est écartée quand elle nomme un objet sans nommer le
  // personnel (T4C-4 : l'agent d'astreinte était annoncé « sur site en 24 heures maximum »).
  // Remplacement d'un agent : « rempla… », ou « relevé / suppléé / pourvu » d'un agent absent ou défaillant, ou poste
  // vacant (T1-GEN-2). Exclus, dans la proposition qui porte le délai : absence prévue (préavis), modification du planning,
  // et remplacement d'un agent récusé par l'acheteur pour sa tenue ou son comportement (T1-GEN-12 : « Tout agent faisant
  // preuve d'une tenue non conforme… devra être remplacé dans les deux (2) heures » n'est pas l'astreinte d'une absence).
  remplacement: {
    sujet: /rempla[cç]|^(?=.*(?:absen|d[ée]faillan)).*(?<![\wÀ-ÿ])(?:relev[ée]e?s?|rel[èe]ve|suppl[ée][ée]e?s?|pourvue?s?|compens[ée]e?s?|pallie[rz]?)(?![\wÀ-ÿ])|postes? (?:vacants?|non (?:tenus?|pourvus?|occup[ée]s?))/i,
    exclure: /absences? (?:pr[ée]vues?|pr[ée]visibles?|programm[ée]es?)|(?<![\wÀ-ÿ])pr[ée]visibles?(?![\wÀ-ÿ])|[àa] l.avance|modifications? (?:du|de|des) plannings?|plannings? pr[ée]visionnels?|changements? (?:du |de )?planning|faisant preuve|ne donnant pas satisfaction|dont le comportement|(?<![\wÀ-ÿ])(?:attitude|comportement)s?(?![\wÀ-ÿ])|tenue (?:non conforme|incorrecte|n[ée]glig)|(?<![\wÀ-ÿ])fautes?(?![\wÀ-ÿ])|r[ée]cus[ée]|insuffisance professionnelle|[àa] la (?:demande|requ[êe]te) (?:du|de la|de l['’]|des)|(?:demander|exiger|solliciter)[^.;]{0,60}(?:remplacement|changement|retrait|[ée]loignement)|[ée]loignement|changement d['’](?:un|l['’])\s*agent/i,
    objet: /v[ée]hicules?|t[ée]l[ée]phones?|mat[ée]riels?|(?<![\wÀ-ÿ])cl[ée]s?(?![\wÀ-ÿ])|cylindres?|badges?|[ée]quipements?|batteries?|(?<![\wÀ-ÿ])pannes?(?![\wÀ-ÿ])|appareils?|terminal|terminaux|radios?|talkies?|uniformes?|tenues?/i,
    personnel: /agents?|personnels?|effectifs?|postes?|absen|d[ée]faillan|salari[ée]s?|vacations?|rondiers?|gardiens?|SSIAP|chefs?|rempla[cç]ants?/i,
  },
  alarme: { sujet: /alarme|t[ée]l[ée]\s?-?surveillance|lev[ée]e de doute|d[ée]clenchement/i, exclure: /(?<![\wÀ-ÿ])(?:PTI|DATI)(?![\wÀ-ÿ])|travailleur isol/i },
  pti: { sujet: /(?<![\wÀ-ÿ])(?:PTI|DATI)(?![\wÀ-ÿ])|travailleur isol/i },
  // « mise à disposition urgente attendue dans un délai de 2 heures » (citedia2, pénalités du CCAP) : délai d'une commande.
  commande: { sujet: /bons? de commande|commandes? (?:compl[ée]mentaires?|suppl[ée]mentaires?)|prestations? (?:ponctuelles?|exceptionnelles?|suppl[ée]mentaires?)|mises? [àa] disposition (?:urgentes? )?(?:attendue|d.agents?|de personnel)/i, exclure: /pr[ée]venance/i },
  ssi: { sujet: /(?<![\wÀ-ÿ])SSI(?![\wÀ-ÿ])|s[ée]curit[ée] incendie/i },
};

/**
 * Délais imposés par le DCE pour un sujet, avec la phrase de chacun (« le personnel de remplacement dans les UNE (1) heure »
 * → « 1 heure »). Délais écrits sans chiffre lus aussi (« d'une heure », « dans l'heure », « d'une demi-heure »,
 * « n'excédant pas 1 heure », T10-COH-1). Pour une alarme, le délai de traitement au PC (application des consignes,
 * information du client, contre-appel) n'est pas un délai d'arrivée sur site (citedia, T10C-2).
 */
export function delaisDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): Array<{ valeur: string; minutes: number; phrase: string }> {
  const out: Array<{ valeur: string; minutes: number; phrase: string }> = [];
  for (const { lu, cite } of phrasesDuDcePourDelais(dce)) for (const d of delaisDePhrase(lu, sujet)) out.push({ ...d, phrase: cite });
  return out;
}

/**
 * Phrases du DCE lues pour les délais (T4G-3), chacune avec le texte cité à GSS : chaque ligne de tableau (« Intervention sur
 * déclenchement d'alarme | 20 minutes », « … — Délai maximal: 20 minutes ») et chaque puce d'une liste est une phrase à part,
 * lue avec son contexte (intitulé de l'article, phrase d'introduction terminée par « : », ligne d'en-tête du tableau :
 * « DÉLAIS D'INTERVENTION … délais maximaux suivants : ») mais citée seule ; « Délai maximum : 20 minutes. » est lue avec la
 * phrase qui la précède (son sujet). Les autres phrases restent celles de phrasesEntieresDuDce.
 */
function phrasesDuDcePourDelais(dce: string): Array<{ lu: string; cite: string }> {
  const out: Array<{ lu: string; cite: string }> = [];
  let titre = '', intro = '', entete = '';
  let tampon: string[] = [];
  const net = (x: string) => x.replace(/\s+/g, ' ').trim();
  const vider = () => {
    const phrases = phrasesEntieresDuDce(tampon.join('\n'));
    tampon = [];
    phrases.forEach((ph, i) => {
      // « Délai maximum : 20 minutes. » : le sujet est dans la phrase précédente.
      if (i > 0 && /^d[ée]lais?(?:\s+(?:maxim(?:al|um)|d['’]intervention|d['’]arriv[ée]e))?\s*:\s*\S/i.test(ph)) out.push({ lu: `${phrases[i - 1]} ${ph}`, cite: `${phrases[i - 1]} ${ph}` });
      else out.push({ lu: ph, cite: ph });
    });
  };
  const contexte = () => net(`${titre} ${intro} ${entete}`);
  // Durée seule après le libellé (« intervention sur alarme : 20 minutes ») sous une introduction qui parle de délais : un délai.
  const avecDelai = (ctx: string, x: string) => (/d[ée]lai/i.test(ctx) ? x.replace(/:\s*(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/u, ': dans ') : x);
  // Puce (ou ligne étiquetée « — … : ») en cours, avec ses lignes de suite (T5G-2 : texte de PDF coupé à 100 colonnes,
  // « ○ Le titulaire s'engage à intervenir … dans un ⏎ délai maximum de 20 minutes … ») : lue entière, avec son introduction.
  let puce: { lu: string; cite: string; ctx: string } | null = null;
  const fermerPuce = () => {
    if (!puce) return;
    out.push({ lu: `${puce.lu} ${avecDelai(puce.ctx, puce.cite)}`.trim(), cite: net(puce.cite) });
    puce = null;
  };
  const RX_PUCE = /^(?:[-•▪●○◦−*]|\d+[.)])\s+/;
  const RX_TITRE = /^(?:ARTICLE|Article|CHAPITRE|Chapitre)\b|^\d{1,2}(?:[.\-–]\s?\d{1,2})*[.\-–]?\s+[A-ZÉÈ]/;
  for (const brute of String(dce || '').replace(/\r/g, '').split('\n')) {
    const l = brute.trim();
    // Ligne de suite de la puce en cours : ni puce, ni titre, ni tableau, ni ligne étiquetée ; la puce ne finit pas sa phrase,
    // ou la ligne commence en minuscule.
    if (puce && l && !RX_PUCE.test(l) && !(RX_TITRE.test(l) && l.length <= 120) && !/\|/.test(l) && !/\s[—–]\s[^:|]{2,60}:\s*\S/.test(l)
      && (!/[.;!?:]$/.test((puce as { cite: string }).cite.trim()) || /^[a-zà-ÿ]/.test(l))) {
      (puce as { cite: string }).cite = `${(puce as { cite: string }).cite} ${l}`;
      continue;
    }
    fermerPuce();
    if (!l) { vider(); tampon.push(''); entete = ''; continue; }
    if (/^(?:ARTICLE|Article|CHAPITRE|Chapitre)\b|^\d{1,2}(?:[.\-–]\s?\d{1,2})*[.\-–]?\s+[A-ZÉÈ]/.test(l) && l.length <= 120) { vider(); titre = l; intro = ''; entete = ''; tampon.push(l); continue; }
    if (/^=+\s*TABLEAUX/i.test(l)) { vider(); entete = ''; continue; }
    // Ligne de tableau : la première ligne d'un tableau est son en-tête.
    if (/\|/.test(l)) {
      vider();
      if (!entete) { entete = l; if (!/\d/.test(l)) continue; }
      out.push({ lu: `${contexte()} ${l}`, cite: net(l) });
      continue;
    }
    // Ligne étiquetée par l'en-tête de colonne (« Déclenchement d'un PTI — Délai maximal: 10 minutes »).
    if (/\s[—–]\s[^:|]{2,60}:\s*\S/.test(l)) { vider(); puce = { lu: net(`${titre} ${intro}`), cite: l, ctx: l }; continue; }
    // Puce d'une liste introduite par « … : » : lue avec l'introduction (et ses lignes de suite).
    if (RX_PUCE.test(l) && intro) { vider(); puce = { lu: net(`${titre} ${intro}`), cite: l.replace(RX_PUCE, ''), ctx: `${titre} ${intro}` }; continue; }
    entete = '';
    if (/:\s*$/.test(l)) intro = l; else if (!/^(?:[-•▪●○◦−*]|\d+[.)])\s+/.test(l)) intro = intro && /:\s*$/.test(tampon[tampon.length - 1] || '') ? intro : '';
    tampon.push(brute);
  }
  fermerPuce();
  vider();
  return out.filter((x) => x.cite.length >= 12 && !LIGNE_SOMMAIRE.test(x.cite));
}

/** Phrases entières du DCE (coupées sur « . ! ? » et les puces, jamais sur « ; ») : le sujet d'un délai peut précéder le « ; ». */
function phrasesEntieresDuDce(dce: string): string[] {
  return String(dce || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
    .split(/(?<=[.!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/)
    .map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦−]\s*/, '').trim())
    .filter((x) => x.length >= 12 && x.length <= 900 && !LIGNE_SOMMAIRE.test(x));
}

/**
 * Propositions d'une phrase (« … dans un délai de 24 heures pour les absences prévisibles et dans un délai d'une heure pour
 * les absences imprévues » → deux propositions) : coupe sur « ; » et sur « et » / « , » suivis d'un nouveau délai.
 */
function propositionsDe(ph: string): string[] {
  return ph.split(/\s*;\s*|\s+et\s+(?=(?:dans|sous|en moins|au plus tard|pour (?:les|une?|toute?))\s)|,\s+(?=(?:et\s+)?(?:dans|sous)\s+(?:un\s+d[ée]lai|les?\s|\d))/i).filter((x) => x.trim());
}

/** La proposition (ou, à défaut d'un autre sujet nommé, la phrase entière) porte-t-elle le sujet du délai ? */
function propositionDuSujet(prop: string, ph: string, sujet: keyof typeof SUJETS_DELAI): boolean {
  const def = SUJETS_DELAI[sujet];
  if (def.exclure?.test(prop)) return false;
  if (def.sujet.test(prop)) return !(def.objet?.test(prop) && !def.personnel?.test(prop));
  // Proposition sans sujet propre (« l'intervenant arrive sur site dans un délai de 20 minutes ») : sujet de la phrase,
  // seulement si aucun autre sujet de délai n'y est nommé.
  const autre = (Object.keys(SUJETS_DELAI) as Array<keyof typeof SUJETS_DELAI>).some((s) => s !== sujet && SUJETS_DELAI[s].sujet.test(prop) && !SUJETS_DELAI[s].exclure?.test(prop));
  if (autre || !def.sujet.test(ph)) return false;
  return !(def.objet?.test(ph) && !def.personnel?.test(ph));
}

/** Délais d'un sujet lus dans une phrase du DCE, proposition par proposition (même règle pour le modèle et le secours). */
export function delaisDePhrase(ph: string, sujet: keyof typeof SUJETS_DELAI): Array<{ valeur: string; minutes: number }> {
  const out: Array<{ valeur: string; minutes: number }> = [];
  if (sujet === 'ssi' && !/d[ée]faillan|hors service|d[ée]rangement/i.test(ph)) return out;
  const props = propositionsDe(ph);
  for (const [iProp, prop] of props.entries()) {
    if (!propositionDuSujet(prop, ph, sujet)) continue;
    const lu = normaliserExpressionsDelai(prop);
    const precedentes = normaliserExpressionsDelai(props.slice(0, iProp).join(' ; '));
    for (const m of lu.matchAll(RX_DELAI)) {
      // Délai d'une autre action que la présence (transmettre un rapport, informer l'acheteur, traiter ou acquitter l'alarme
      // au PC, appliquer les consignes) : jamais un délai d'arrivée, de remplacement ou de mise en place (T2-GEN-1, T10C-2).
      if (!delaiDePresence(lu, m.index || 0, (m.index || 0) + m[0].length, precedentes)) continue;
      // « UNE (1) heure » : le chiffre entre parenthèses ; « 30 (trente) minutes » (ifits, T9CS-1) : le chiffre écrit avant.
      const n = m[2] && /^\d+$/.test(m[2]) ? Number(m[2]) : (/^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES_LETTRES[m[1].toLowerCase()]);
      if (!n) continue;
      out.push({ valeur: normaliserDelai(`${n} ${m[3]}`), minutes: minutesDe(n, m[3]) });
    }
  }
  return out;
}

/**
 * Délai imposé par le DCE pour un sujet (« le personnel de remplacement dans les UNE (1) heure » → « 1 heure »).
 * Plusieurs durées différentes pour le même sujet : '' (delai() cite alors les phrases du CCTP à GSS, T10C-2).
 */
export function delaiDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): string {
  const unique = (l: Array<{ minutes: number; valeur: string }>) => {
    const minutes = new Map<number, string>();
    for (const d of l) if (!minutes.has(d.minutes)) minutes.set(d.minutes, d.valeur);
    return minutes.size === 1 ? [...minutes.values()][0] : '';
  };
  const tous = delaisDuDce(dce, sujet);
  const v = unique(tous);
  if (v || sujet !== 'remplacement') return v;
  // Remplacement : plusieurs délais (défaillance générale sous 24 heures, absence imprévue sous 2 heures) → celui de
  // l'absence imprévue, seul délai de l'agent d'astreinte (T1-GEN-2).
  return unique(tous.filter((d) => /impr[ée]vu|inopin|non pr[ée]vu|derni[èe]re minute|impr[ée]visible|inattendu/i.test(d.phrase)));
}

/** Phrase du DCE d'où delaiDuDce tire le délai imposé d'un sujet ('' si aucune) : citée à GSS comme exigence du CCTP (D8). */
export function phraseDelaiDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): string {
  const v = delaiDuDce(dce, sujet);
  const l = delaisDuDce(dce, sujet);
  return (v ? l.find((d) => d.valeur === v && (sujet !== 'remplacement' || l.every((x) => x.valeur === v) || /impr[ée]vu|inopin|non pr[ée]vu|derni[èe]re minute|impr[ée]visible|inattendu/i.test(d.phrase))) : undefined)?.phrase || l[0]?.phrase || '';
}

/** Phrases du DCE qui imposent un délai pour un sujet (sans doublon), citées à GSS quand le CCTP en impose plusieurs. */
export function phrasesDelaisDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): string[] {
  return [...new Set(delaisDuDce(dce, sujet).map((d) => d.phrase))];
}

/** Sujet de délai d'une phrase (« Le rondier arrive sur site en 45 minutes après l'appel de la télésurveillance » → alarme). */
export function sujetDelaiDePhrase(ph: string): keyof typeof SUJETS_DELAI | null {
  for (const s of ['pti', 'alarme', 'ssi', 'commande', 'remplacement'] as Array<keyof typeof SUJETS_DELAI>) {
    const def = SUJETS_DELAI[s];
    if (def.sujet.test(ph) && !def.exclure?.test(ph)) return s;
  }
  if (/astreinte|absen/i.test(ph)) return 'remplacement';
  return null;
}

/** Phrase entière du DCE qui contient une citation (une citation peut n'en être qu'un fragment) ; sinon la citation. */
export function phraseDuDceContenant(dce: string, citation: string): string {
  const cit = normaliser(citation).replace(/[^a-z0-9']+/g, ' ').trim();
  if (!cit) return citation;
  return phrasesDuDce(dce).find((ph) => normaliser(ph).replace(/[^a-z0-9']+/g, ' ').includes(cit)) || citation;
}

/**
 * Fréquence écrite « N (fois | réunion(s)) par <unité> » (T5G-13 : « 1 fois par mois », « une par mois », « deux fois par an »),
 * ramenée au libellé usuel (« chaque mois », « chaque semestre ») ou écrite telle quelle (« trois fois par an »).
 */
const RX_N_PAR = /(?<![\wÀ-ÿ])(\d{1,2}|une?|deux|trois|quatre|cinq|six|douze)\s+(?:fois\s+|r[ée]unions?\s+(?:de\s+suivi\s+)?)?par\s+(semaine|mois|trimestre|semestre|an(?:n[ée]e)?)(?![\wÀ-ÿ])/i;
function libelleNPar(m: RegExpMatchArray): string {
  const n = nombreFr(m[1]);
  const u = m[2].toLowerCase().startsWith('an') ? 'an' : m[2].toLowerCase();
  const lettres = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'][n] || String(n);
  if (n === 1) return { semaine: 'chaque semaine', mois: 'chaque mois', trimestre: 'chaque trimestre', semestre: 'chaque semestre', an: 'chaque année' }[u] || '';
  if (u === 'an') return ({ 2: 'chaque semestre', 4: 'chaque trimestre', 6: 'tous les deux mois', 12: 'chaque mois' } as Record<number, string>)[n] || `${lettres} fois par an`;
  return `${lettres} fois par ${u}`;
}
const FREQUENCES: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [RX_N_PAR, libelleNPar],
  [/bimestriel(?:le)?s?|tous les (?:deux|2) mois|une fois tous les (?:deux|2) mois/i, 'tous les deux mois'],
  [/semestriel(?:le)?s?|tous les (?:six|6) mois|chaque semestre|tous les semestres|une fois par semestre/i, 'chaque semestre'],
  [/trimestriel(?:le)?s?|tous les (?:trois|3) mois|chaque trimestre|tous les trimestres|une fois par trimestre/i, 'chaque trimestre'],
  [/(?<!bi|tri|se)mensuel(?:le)?s?|tous les mois|chaque mois|une fois par mois/i, 'chaque mois'],
  [/bimensuel(?:le)?s?|deux fois par mois/i, 'deux fois par mois'],
  [/toutes les (?:deux|2) semaines|tous les quinze jours|tous les 15 jours/i, 'toutes les deux semaines'],
  [/toutes les (?:quatre|4) semaines/i, 'toutes les quatre semaines'],
  [/hebdomadaires?|chaque semaine|toutes les semaines|une fois par semaine/i, 'chaque semaine'],
  [/(?<![\wÀ-ÿ])annuel(?:le)?s?|chaque ann[ée]e|une fois par an(?![\wÀ-ÿ])/i, 'chaque année'],
];

/**
 * La fréquence qualifie-t-elle la réunion (T1-GEN-11) ? Adjectif accolé (« réunion mensuelle »), réunion sujet de la
 * proposition (« des réunions de suivi sont organisées tous les 3 mois », « Réunion de suivi : trimestrielle »), ou
 * « périodicité des réunions » ; jamais la fréquence d'un autre document (« Le titulaire remet chaque mois un rapport
 * d'activité qui sert de support à la réunion de suivi »).
 */
function frequenceDeLaReunion(prop: string, debut: number, fin: number): boolean {
  // « Les fréquences des réunions sont les suivantes : … », « Une réunion de suivi sera mise en place…, sa périodicité sera
  // bimestrielle » : toute fréquence de la proposition est celle des réunions.
  if (/(?:fr[ée]quences?|p[ée]riodicit[ée]s?)\s+(?:des|de la|de ces|de cette)\s+r[ée]unions?|r[ée]unions?[^.]{0,100}(?:sa|leur)\s+(?:fr[ée]quence|p[ée]riodicit[ée])/i.test(prop)) return true;
  for (const r of prop.matchAll(/r[ée]unions?/gi)) {
    const entre = r.index! < debut ? prop.slice(r.index! + r[0].length, debut) : prop.slice(fin, r.index!);
    if (entre.length > 70) continue;
    // Complément du nom de la réunion (« réunion de bilan annuelle », « réunion de suivi : une par mois ») : la fréquence est
    // la sienne (T5G-13).
    if (r.index! < debut && /^\s*(?:(?:de|d['’])\s*[\wÀ-ÿ'’-]+(?:\s+[\wÀ-ÿ'’-]+)?)?\s*:?\s*$/i.test(entre)) return true;
    const AUTRE_DOC = /(?<![\wÀ-ÿ])(?:qui|que|dont|lequel|laquelle|remet\w*|transmet\w*|transmis\w*|adress\w*|envoi\w*|envoy\w*|fourni\w*|communiqu\w*|produi\w*|[ée]tabli\w*|r[ée]dig\w*|sert|servent|support|valid\w*|pr[ée]sent[ée]\w*|rapports?|tableaux?|plannings?|comptes? rendus?|bilans?)(?![\wÀ-ÿ])/i;
    if (AUTRE_DOC.test(entre)) continue;
    // Fréquence avant la réunion qui qualifie un autre document (« Le titulaire transmet un bilan annuel lors de la réunion »).
    if (r.index! > fin && AUTRE_DOC.test(prop.slice(Math.max(0, debut - 40), debut))) continue;
    return true;
  }
  return false;
}

/** Fréquence des réunions de suivi imposée par le DCE (une seule fréquence citée, sinon ''). */
export function frequenceReunionsDce(dce: string): string {
  const trouvees = new Map<string, boolean>();
  for (const ph of phrasesDuDce(dce)) {
    if (!/r[ée]unions?/i.test(ph)) continue;
    for (const prop of ph.split(/\s*;\s*/)) {
      if (!/r[ée]unions?/i.test(prop)) continue;
      for (const [rx, lib] of FREQUENCES) {
        for (const m of prop.matchAll(new RegExp(rx.source, 'gi'))) {
          if (!frequenceDeLaReunion(prop, m.index!, m.index! + m[0].length)) continue;
          const libelle = typeof lib === 'string' ? lib : lib(m);
          if (!libelle) continue;
          trouvees.set(libelle, (trouvees.get(libelle) || false) || /au (?:minimum|moins)/i.test(prop));
        }
      }
    }
  }
  if (trouvees.size !== 1) return '';
  const [[libelle, minimum]] = [...trouvees.entries()];
  return minimum ? `au minimum ${libelle}` : libelle;
}

/** Phrase du DCE qui fixe la fréquence des réunions de suivi ('' si aucune) : l'exigence citée à GSS (D8, T2-CONS-4). */
export function phraseFrequenceReunionsDce(dce: string): string {
  const trouvees: string[] = [];
  for (const ph of phrasesDuDce(dce)) {
    if (!/r[ée]unions?/i.test(ph)) continue;
    let ok = false;
    for (const prop of ph.split(/\s*;\s*/)) {
      for (const [rx] of FREQUENCES) for (const m of prop.matchAll(new RegExp(rx.source, 'gi'))) if (frequenceDeLaReunion(prop, m.index!, m.index! + m[0].length)) ok = true;
    }
    if (ok) trouvees.push(ph);
  }
  // Phrase du corps de l'article (avec son verbe) avant un intitulé d'article sans verbe (« a. Réunions de suivi mensuelles »,
  // imm, T4N-4) : c'est elle qui fixe la fréquence.
  const phrase = (x: string) => /[.!?]$/.test(x) || /\b(?:est|sont|sera|seront|doit|doivent|devra|devront|participe\w*|organis\w*|tien(?:t|nent|dra|dront)|a lieu|ont lieu|aura lieu|auront lieu|se r[ée]uni\w*|r[ée]unit|pr[ée]voi\w*)\b/i.test(x);
  return trouvees.find(phrase) || trouvees[0] || '';
}

/** Fondement juridique de la reprise CITÉ PAR LE DCE (jamais d'article L. 1224-1 si le DCE ne le cite pas). */
export function fondementRepriseDce(dce: string): string {
  // Typographie des PDF (T2-GEN-10) : tirets insécables, demi-cadratins et signes moins ramenés au trait d'union ; dates
  // en chiffres (« 05/03/2002 ») écrites en lettres ; « annexe 7 » = « annexe VII ».
  const MOIS_LETTRES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = String(dce || '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ')
    .replace(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, (m, j: string, mo: string, a: string) => (Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(j) === 1 ? '1er' : Number(j)} ${MOIS_LETTRES[Number(mo) - 1]} ${a}` : m))
    .replace(/\b0(\d) (janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\b/gi, '$1 $2');
  const parts: string[] = [];
  if (/L\.?\s?1224\s?-\s?1/.test(d)) parts.push("l'article L. 1224-1 du Code du travail");
  if (/accord (?:national )?(?:du|en date du) 5 mars 2002/i.test(d)) parts.push(`l'accord du 5 mars 2002 relatif à la reprise du personnel${/avenant du 28 janvier 2011/i.test(d) ? ', modifié par l\'avenant du 28 janvier 2011' : ''}`);
  else if (/annexe (?:VII|7)(?![\dIVX])/i.test(d) && /convention collective/i.test(d)) parts.push("l'annexe VII de la convention collective nationale des entreprises de prévention et de sécurité");
  return parts.join(' et à ');
}

/** Le DCE lisible parle-t-il de sécurité incendie (SSIAP, agent ou prestation de sécurité incendie) ? */
const PREUVE_INCENDIE = /(?<![\wÀ-ÿ])(?:SSIAP|S\.S\.I\.A\.P)|service de s[ée]curit[ée] incendie et d.assistance|agents? de s[ée]curit[ée] incendie|prestations? (?:de )?s[ée]curit[ée] incendie/i;

/**
 * Qualifications exigées par le DCE (et citées par l'analyse), dans l'ordre du catalogue GSS. Un SSIAP cité par la
 * seule analyse ne compte que si le DCE lisible parle lui-même de sécurité incendie (T4N-3, caen : aucun SSIAP dans le
 * DCE, « SSIAP 1 » imprimé d'après l'analyse).
 */
export function qualificationsDuDce(dce: string, analyse?: any): string[] {
  // Qualification niée (« Les agents ne sont pas tenus d'être titulaires du SSIAP ») : jamais exigée (T2-GEN-3).
  const texteDce = sansMentionsNiees(String(dce || ''));
  const an = texteAnalyse(analyse);
  const incendie = texteDce.replace(/\s+/g, ' ').length < 2000 || PREUVE_INCENDIE.test(texteDce.replace(/\s+/g, ' '));
  // Écritures ramenées à une forme unique (T1-GEN-10) : « S.S.I.A.P. » → « SSIAP » ; « SSIAP (de) niveau 2 » → « SSIAP 2 » ;
  // « SSIAP2 » → « SSIAP 2 ».
  const t = normaliserSsiap(`${texteDce} ${incendie ? an : an.replace(/S\.?S\.?I\.?A\.?P\.?(?:\s*(?:[123]|I{1,3})(?![\wÀ-ÿ]))?/gi, '')}`.replace(/\s+/g, ' '));
  const out: string[] = [];
  if (/SSIAP\s*(?:3|III)(?![\wÀ-ÿ])/i.test(t)) out.push('SSIAP 3');
  if (/SSIAP\s*(?:2|II)(?![\wÀ-ÿ])/i.test(t)) out.push('SSIAP 2');
  if (/SSIAP\s*(?:1|I)(?![\wÀ-ÿ])|SSIAP(?!\s*(?:[23]|II))/i.test(t)) out.push('SSIAP 1');
  // CQP APS et ses équivalents : C.Q.P.A.D.S., CQP ADS, certificat des agents de sécurité, TFP APS (titre qui l'a remplacé),
  // T1-GEN-10, T1F-13.
  if (/C\.?\s?Q\.?\s?P\.?\s?-?\s?A\.?\s?[PD]\.?\s?S(?![\wÀ-ÿ])|CQPAPS|certificat de qualification professionnelle (?:d.|des\s+)agents?\s+de\s+(?:pr[ée]vention|s[ée]curit[ée])|(?<![\wÀ-ÿ])TFP\s*-?\s*APS(?![\wÀ-ÿ])|titre [àa] finalit[ée] professionnelle d.agent de pr[ée]vention|(?<![\wÀ-ÿ])(?:CQP|TFP|titre\s+[àa]\s+finalit[ée]\s+professionnelle|certificat\s+de\s+qualification\s+professionnelle)\s*[«"“]?\s*(?:d['’]\s*|de\s+l['’]\s*)?agents?\s+de\s+pr[ée]vention\s+et\s+de\s+s[ée]curit[ée]/i.test(t)) out.push('CQP APS');
  if (/(?<![\wÀ-ÿ])SST(?![\wÀ-ÿ])|sauveteur secouriste du travail/i.test(t)) out.push('SST');
  if (/PSC\s*1/i.test(t)) out.push('PSC1');
  // Habilitation électrique : le niveau écrit par le DCE (T4G-5 : « BS-BE manœuvre », « HO/BE Manœuvre », « H0B0V/BE », « B1V »,
  // « BR »), jamais ramené à H0B0 ; H0B0 (ou H0V) quand c'est le niveau demandé ou qu'aucun niveau n'est écrit.
  const niveaux = niveauxHabilitation(t);
  if (niveaux.length) for (const n of niveaux) out.push(`habilitation électrique ${n}`);
  else if (/H0\s*-?\s*B0|H0V|habilitation [ée]lectrique/i.test(t)) out.push('habilitation électrique H0B0');
  return out;
}

/** Habilitation électrique que GSS détient (faits_gss.md : H0B0). */
export const HABILITATION_GSS = /^habilitation électrique H0B0$/;

/**
 * Niveaux d'habilitation électrique écrits par le DCE (dans les 60 signes qui suivent « habilitation électrique », ou codes
 * seuls) : « H0B0 », « BS-BE manœuvre », « H0/BE manœuvre », « H0B0V/BE », « B1V », « BR »… ; H0B0 et H0V ramenés à « H0B0 ».
 */
export function niveauxHabilitation(t: string): string[] {
  const out: string[] = [];
  const CODE = /(?<![A-Za-z0-9])((?:H[0O]\s*-?\s*B[0O]\s*V?|H[0O]\s*V|H[0O]|B[SRC]|B[12]\s*V?|H[12]\s*V?|BE)(?:\s*[\/-]\s*(?:B[SECR]|H[0O]\s*V?|B[12]\s*V?)(?![A-Za-z0-9]))*(?:\s+man[oœ]e?uvres?)?)(?![A-Za-z0-9])/gi;
  const zones: string[] = [];
  for (const m of t.matchAll(/habilitations?\s+[ée]lectriques?([^.;\n]{0,60})/gi)) zones.push(m[1]);
  // Codes seuls hors de la mention (« titulaire du H0B0 ») : H0B0 et H0V seulement (« BE », « BR » seuls sont ambigus).
  for (const m of t.matchAll(/(?<![A-Za-z0-9])H[0O]\s*-?\s*B[0O](?:\s?V)?(?![A-Za-z0-9])|(?<![A-Za-z0-9])H[0O]\s?V(?![A-Za-z0-9])/g)) zones.push(m[0]);
  for (const z of zones) {
    for (const m of z.matchAll(CODE)) {
      let n = m[1].replace(/\s+/g, ' ').trim().toUpperCase().replace(/\s*([\/-])\s*/g, '$1').replace(/MAN[OŒ]E?UVRES?/, 'manœuvre').replace(/H O/g, 'H0');
      n = n.replace(/^HO(?=[\/ BV-]|$)/, 'H0').replace(/\/HO(?=[\/ BV-]|$)/g, '/H0');
      // Éléments d'un code écrits avec des espaces (T5G-3 : « H0 B0 » = H0B0, « H0 B0 V » et « H0B0 V » = H0B0V, « B1 V » = B1V).
      n = n.replace(/(^|\/)H0[ -]?B[0O](?: ?(V))?(?=[\/ ]|$)/g, (_m, d: string, v?: string) => `${d}H0B0${v || ''}`)
        .replace(/(^|\/)(B[12]|H[012]) V(?=[\/ ]|$)/g, '$1$2V');
      if (/^H0$/.test(n)) continue;
      if (/^(?:H0B0|H0V)$/.test(n)) n = 'H0B0';
      if (!out.includes(n)) out.push(n);
    }
  }
  // Code repris seul d'un niveau déjà lu en entier (« H0B0V » de « H0B0V/BE ») : une seule fois.
  return out.filter((n) => !out.some((x) => x !== n && x.startsWith(`${n}/`)));
}

/** Clé d'une commune : « St Martin d'Hères », « Saint-Martin-d’Hères » et « SAINT MARTIN D'HERES » sont la même commune (T7N-6). */
export function cleCommune(v: string): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`\u2011-]/g, ' ')
    .replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Communes des sites (codes postaux du début du DCE, lus sur la ligne du code : T8REG-1, T8-COH-3), sans variante
 * d'écriture en double ni commune qui n'est que le début d'une autre (« Mont » et « Mont-Saint-Aignan »). Sans code
 * postal : les communes nommées dans le DCE (lieuDuMarche), jamais un nom de site (« Parc des Expositions de Rouen »).
 */
function villesDuMarche(dce: string, analyse: any): string[] {
  // Mémoire d'un seul lot (T2-GEN-5) : les communes de ce lot, si elles sont lisibles.
  const lot = perimetreDuLot(analyse, dce);
  if (lot) {
    const v = villesDuMarcheBrut(lot.dce, lot.analyse);
    if (v.length) return v;
  }
  return villesDuMarcheBrut(dce, analyse);
}
function villesDuMarcheBrut(dce: string, analyse: any): string[] {
  const out: string[] = [];
  const prefixe = (a: string, b: string) => `${cleCommune(b)} `.startsWith(`${cleCommune(a)} `);
  const debutDce = String(dce || '').slice(0, 30000);
  // Adresse administrative (siège, tribunal administratif, voies de recours, facturation, comptable) ou d'identification de
  // l'acheteur : pas la commune d'un site (T9REG-2, T1-GEN-8 : « Tribunal Administratif de Versailles … 78010 Versailles »,
  // « 91025 Évry-Courcouronnes Cedex » des adresses de facturation). Même règle que les sites du lieu du marché ; une adresse
  // Cedex n'est retenue que s'il n'y a aucune autre adresse (ign : « 77455 Marne la Vallée cedex 2 », adresse du site).
  const communes = communesParCodePostal(debutDce, String(dce || ''));
  for (const postale of [true, false]) {
    for (const { commune, debut, fin } of communes) {
      if (commune.length < 3 || out.some((x) => prefixe(commune, x))) continue;
      if (adresseAdministrative(debutDce, debut, fin, { postale })) continue;
      const k = out.findIndex((x) => prefixe(x, commune));
      if (k >= 0) out[k] = commune; else out.push(commune);
      if (out.length >= 3) break;
    }
    if (out.length) return out;
  }
  const lieu = lieuDuMarche(analyse || {}, String(dce || ''));
  return [...lieu.normands, ...lieu.horsNormandie].filter((v) => !/^(?:Seine-Maritime|Calvados)$/.test(v)).slice(0, 3);
}

/** Organigramme de référence (annuaire « Personnes » + registre) en liste Markdown, rôles regroupés par personne. */
function organigrammeMarkdown(referents: string, registre: EntreeRegistre[]): { texte: string; aConfirmer: string[] } {
  const roles = rolesOrganigramme(referents || '');
  const groupes: Array<{ libelles: string[]; noms: string[] }> = [];
  for (const r of roles) {
    const libelle = r.libelle.split(/\s+/).map((w, i) => (i === 0 || /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
    const g = groupes.find((x) => x.noms.join('|') === r.noms.join('|'));
    if (g) g.libelles.push(libelle);
    else groupes.push({ libelles: [libelle], noms: [...r.noms] });
  }
  const lignes = groupes.map((g) => {
    let libelle = listeFr(g.libelles.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))));
    if (g.noms.length > 1 && g.libelles.length === 1) libelle = libelle.replace(/^(Responsable|Directeur|Directrice|Chef)(?!s)/, '$1s');
    return `- ${libelle} : ${listeFr(g.noms)}`;
  });
  const aConfirmer: string[] = [];
  for (const e of registre.filter((x) => /^responsable_|^dirigeant/.test(x.cle) && aConfirmerRegistre(x))) {
    const noms = e.valeur_retenue.split(';').map((x) => nomPropre(x.trim())).filter(Boolean);
    if (noms.some((n) => lignes.some((l) => l.includes(n)))) {
      aConfirmer.push(`Confirmer ${e.libelle.charAt(0).toLowerCase()}${e.libelle.slice(1)} — valeur utilisée dans le mémoire : ${noms.join(', ')} (${e.source_retenue}, ${e.date_retenue})`);
    }
  }
  return { texte: lignes.join('\n'), aConfirmer };
}

/** Fonction d'une personne dans l'annuaire « Personnes » (« Directeur d'agence / Responsable de marché »). */
function fonctionDansAnnuaire(referents: string, nom: string): string {
  const cible = normaliser(nom).split(' ')[0];
  for (const ligne of String(referents || '').split(/\r?\n/)) {
    const m = /^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/.exec(ligne);
    if (m && cible && normaliser(m[1]).split(' ')[0] === cible) {
      return listeFr(m[2].split('/').map((x) => x.trim()).filter(Boolean).map((x) => x.charAt(0).toLowerCase() + x.slice(1)));
    }
  }
  return '';
}

/** Lignes « catégorie | qualification » du tableau de l'équipe dédiée quand aucun dimensionnement n'est calculé. */
function lignesEquipeParQualification(c: CalculVariables): Array<[string, string]> {
  const lignes: Array<[string, string]> = [];
  // Marché de rondes ponctuelles sans poste (cstb, T2-CONS-6) : les agents sont les rondiers intervenants ; aucune ligne
  // « Agent de sécurité » en plus (deux effectifs demandés à GSS pour les mêmes agents).
  const rondesSeules = !!c.ctx.dimensionnement?.rondesSansDuree?.length && !c.ctx.dimensionnement.profils.length;
  if (c.qualifs.includes('SSIAP 3')) lignes.push(['Chef de service de sécurité incendie', 'SSIAP 3']);
  if (c.qualifs.includes('SSIAP 2')) lignes.push(["Chef d'équipe de sécurité incendie", 'SSIAP 2']);
  if (c.qualifs.includes('SSIAP 1')) lignes.push(['Agent de sécurité incendie', 'SSIAP 1']);
  const ads = /(?<![\wÀ-ÿ])ADS(?![\wÀ-ÿ])|agents? de (?:s[ée]curit[ée](?! incendie)|surveillance|s[ûu]ret[ée])/i.test(String(c.ctx.dce || ''));
  if (!rondesSeules && (!c.ind.SSIAP || ads || c.qualifs.includes('CQP APS'))) lignes.push(['Agent de sécurité', 'CQP APS']);
  if (c.ind.CYNOPHILE) lignes.push(['Agent cynophile', 'CQP APS – qualification cynophile']);
  if (c.ind.TELESURVEILLANCE || rondesSeules) lignes.push(['Rondier intervenant', 'CQP APS']);
  return lignes;
}

/**
 * Diplômes de l'équipe dédiée : qualifications des profils du tableau de l'équipe (dimensionnement, sinon lignes par
 * qualification), puis les autres qualifications exigées par le DCE pour ces agents (SST, PSC1, habilitation) quand
 * aucun dimensionnement ne fixe les profils. Ordre du catalogue GSS.
 */
function diplomesEquipe(c: CalculVariables): string[] {
  const profils = c.ctx.dimensionnement?.profils || [];
  if (profils.length) {
    const q = qualificationsDuDce(profils.map((p) => `${p.profil} : ${p.qualification}`).join(' ; '));
    // Agents cynophiles de l'équipe dédiée (ifits 701) : leur qualification cynophile s'ajoute au CQP APS.
    if (profils.some((p) => /cynophil|ma[iî]tres?[- ]chiens?|conducteurs? (?:de )?chiens?/i.test(`${p.profil} ${p.qualification}`))) {
      if (!q.includes('CQP APS')) q.push('CQP APS');
      q.push('qualification cynophile');
    }
    return q.length ? q : c.qualifs;
  }
  const tableau = lignesEquipeParQualification(c).map(([, q]) => q).join(' ; ');
  const q = qualificationsDuDce(tableau);
  // Habilitation électrique d'un autre niveau que celui de GSS (H0B0) : jamais écrite dans les diplômes de l'équipe sans
  // l'accord de GSS (T4G-5) ; la question est posée (DIPLOMES_EQUIPE).
  const autres = c.qualifs.filter((x) => !/^SSIAP|^CQP APS$/.test(x) && (!/^habilitation électrique/.test(x) || HABILITATION_GSS.test(x)));
  return [...q, ...autres.filter((x) => !q.includes(x))];
}

interface CalculVariables {
  mt: MemoireType;
  ctx: ContexteMarche;
  ind: Record<string, boolean>;
  plan?: PlanMemoireType;
  registre: EntreeRegistre[];
  horsNormandie: boolean;
  qualifs: string[];
}

function depuisRegistre(c: CalculVariables, cle: string, transformer: (v: string) => string = (v) => v): ValeurVariable {
  const e = c.registre.find((x) => x.cle === cle);
  const v = e ? transformer(e.valeur_retenue) : '';
  if (!e || !v) return { valeur: null };
  return {
    valeur: v,
    source: `registre ${cle} (${e.source_retenue}, ${e.date_retenue})`,
    aConfirmer: aConfirmerRegistre(e) ? `Confirmer ${e.libelle.charAt(0).toLowerCase()}${e.libelle.slice(1)} — valeur utilisée dans le mémoire : ${v} (${e.source_retenue}, ${e.date_retenue})` : undefined,
  };
}

/** Délai : DCE (imposé) d'abord ; sinon valeur GSS (registre ou valeur_gss), seulement en Normandie. */
function delai(c: CalculVariables, nom: string, sujet: keyof typeof SUJETS_DELAI | null): ValeurVariable {
  const def = c.mt.variables[nom];
  const duDce = sujet && c.ctx.delaisDuDce !== false ? delaiDuDce(c.ctx.dce || '', sujet) : '';
  if (duDce) return { valeur: duDce, source: 'délai imposé par le DCE' };
  const objetDe = () => `${(def?.description || nom).charAt(0).toLowerCase()}${(def?.description || nom).slice(1).replace(/[.\s]+$/, '')}`;
  // Plusieurs délais imposés par le CCTP pour ce point (citedia : 15 minutes pour une alarme incendie ou un bouton
  // anti-agression, 30 minutes pour une alarme technique ou intrusion, T10C-2) : le délai de GSS reste s'il les respecte
  // tous (Normandie) ; sinon la phrase est imprimée sans délai et la question cite les phrases du CCTP (jamais « le DCE n'en
  // impose aucun », jamais un délai normand hors Normandie).
  const imposes = sujet && c.ctx.delaisDuDce !== false ? delaisDuDce(c.ctx.dce || '', sujet) : [];
  if (new Set(imposes.map((d) => d.minutes)).size > 1) {
    const plusCourt = Math.min(...imposes.map((d) => d.minutes));
    if (!(c.horsNormandie && def?.normandie_seulement)) {
      const g = def?.registre ? depuisRegistre(c, def.registre, normaliserDelai) : def?.valeur_gss ? { valeur: def.valeur_gss, source: def.origine, aConfirmer: questionParGeneration(def) } as ValeurVariable : { valeur: null };
      // Délai de GSS conforme : jamais plus long que le délai le plus court du CCTP, ou, pour une fourchette (« 1 h à 24 h »
      // selon l'urgence), bornes au plus égales à celles du CCTP (2 heures en urgence, 24 heures sinon).
      const durees = variableRenseignee(g) ? dureesIntervention(`en ${g.valeur}`) : [];
      const plusLong = Math.max(...imposes.map((d) => d.minutes));
      if (durees.length && (Math.max(...durees) <= plusCourt || (durees.length > 1 && Math.min(...durees) <= plusCourt && Math.max(...durees) <= plusLong))) return g;
    }
    const citations = phrasesDelaisDuDce(c.ctx.dce || '', sujet!).map((p) => `« ${p.length > 260 ? `${p.slice(0, 260).replace(/\s+\S*$/, '')}…` : p} »`).join(' ; ');
    return { valeur: null, question: `Le CCTP impose plusieurs délais pour ce point (${objetDe()}) : ${citations}. La phrase de GSS est imprimée sans délai : quel délai GSS y écrit-elle ?` };
  }
  if (c.horsNormandie && def?.normandie_seulement) {
    const objet = objetDe();
    // Sites mixtes (T4-COH-3) : la question nomme les sites hors Normandie et rappelle le délai normand de GSS.
    // (sites lus par code postal ou communes nommées comme sites : « Un second site est situé à Lyon », T5-COH-3)
    const lieu = lieuDuMarche(c.ctx.analyse || {}, c.ctx.dce || '');
    const sites = sitesDuMarche(c.ctx.analyse || {}, c.ctx.dce || '');
    if (!sites.mixte && lieu.statut === 'mixte' && lieu.horsNormandie.length) { sites.mixte = true; sites.horsNormandie = lieu.horsNormandie; }
    if (sites.mixte) {
      const normand = def.registre ? depuisRegistre(c, def.registre, normaliserDelai).valeur : def.valeur_gss || '';
      return { valeur: null, question: `Marché en partie hors Normandie (${sites.horsNormandie.length > 1 ? 'sites' : 'site'} de ${listeFr(sites.horsNormandie)}) : ${normand ? `GSS annonce ${normand} en Normandie pour ce délai (${objet}) ; ` : ''}quel délai GSS annonce-t-elle pour ${sites.horsNormandie.length > 1 ? 'les sites' : 'le site'} de ${listeFr(sites.horsNormandie)}${normand ? '' : ` (${objet})`} ?` };
    }
    // Lieu du site introuvable dans le DCE (T7-COH-2) : aucun délai normand promis ; la question le dit et rappelle le délai
    // de GSS en Normandie, pour que GSS réponde le bon délai.
    if (c.ctx.horsNormandie === undefined && c.ctx.choix?.indicateurs?.HORS_NORMANDIE === undefined
      && lieuDuMarche(c.ctx.analyse || {}, c.ctx.dce || '').statut === 'inconnu') {
      const normand = def.registre ? depuisRegistre(c, def.registre, normaliserDelai).valeur : def.valeur_gss || '';
      return { valeur: null, question: `Le DCE ne donne pas la commune du site : quel délai GSS annonce-t-elle (${objet}) ?${normand ? ` Si le site est en Normandie, GSS annonce ${normand}.` : ''}` };
    }
    // Marché entièrement hors Normandie (T3-CONS-12) : la phrase au délai normand est retirée (signalée à GSS) ; la question
    // des délais hors Normandie ne dépend pas du marché : posée une seule fois (questions_gss_une_fois), jamais à chaque
    // génération. Un délai imposé par le DCE est repris plus haut.
    void objet;
    return { valeur: null };
  }
  if (def?.registre) {
    const v = depuisRegistre(c, def.registre, normaliserDelai);
    if (variableRenseignee(v)) return v;
  }
  if (def?.valeur_gss) return { valeur: def.valeur_gss, source: def.origine, aConfirmer: questionParGeneration(def) };
  return { valeur: null };
}

type Calculateur = (c: CalculVariables) => ValeurVariable;

/**
 * Engagement de GSS quand le cahier des charges l'exige (ex. contrôles inopinés : au moins 3 par mois et par site,
 * réponse de GSS du 1er octobre 2026) ; une valeur imposée par le CCTP reste prioritaire (variablesDuMarche).
 */
function valeurSiExige(c: CalculVariables, nom: string): ValeurVariable | null {
  const def = c.mt.variables[nom];
  if (!def?.valeur_si_exige || !def.indicateur_exige || !c.ind[def.indicateur_exige]) return null;
  return { valeur: def.valeur_si_exige, source: `engagement GSS quand le cahier des charges l'exige (${def.indicateur_exige})` };
}

const CALCULS: Record<string, Calculateur> = {
  CLIENT: (c) => {
    const couverture = textePropre(c.ctx.cover?.client);
    const analyse = textePropre(c.ctx.analyse?.clientName);
    let brut = couverture || analyse;
    if (!brut) return { valeur: null };
    // Raison sociale en capitales (« S.P.L. CITEDIA METROPOLE ») : le nom d'usage de l'analyse (« Citédia
    // Métropole ») quand il désigne le même acheteur ; une société (S.P.L., SAS…) est reprise au féminin.
    const societe = FORME_SOCIETE.test(brut);
    const lettres = brut.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (couverture && analyse && lettres && lettres.replace(/[^A-ZÀ-Ý]/g, '').length / lettres.length > 0.7 && /[a-zà-ÿ]/.test(analyse)) {
      const sansForme = normaliser(couverture.replace(FORME_SOCIETE, '')).replace(/[^a-z0-9]+/g, ' ').trim();
      if (sansForme && normaliser(analyse).replace(/[^a-z0-9]+/g, ' ').trim().includes(sansForme)) brut = analyse;
    }
    // La forme de société n'est retirée que devant un nom propre (« S.P.L. CITEDIA METROPOLE » → « Citédia Métropole ») ;
    // suivie d'un complément (T3-COH-1 : « Société anonyme d'HLM de la région d'Elbeuf », « Société d'économie mixte de la
    // Ville du Havre »), elle fait partie du nom, gardé entier avec l'article de la société (« la Société anonyme… »). Nom
    // d'usage écrit après un tiret (« SOCIETE D'ECONOMIE MIXTE DE LA VILLE DU HAVRE - SEM HAVRE DEVELOPPEMENT ») : ce nom.
    let formeGardee = false;
    if (FORME_SOCIETE.test(brut)) {
      const usageTiret = /\s+[–—-]\s+((?:s\.?\s?[ep]\.?\s?[ml]\.?|s\.?\s?a\.?(?:\s?s\.?)?|soci[ée]t[ée])\s+[A-ZÀ-Ý0-9][^–—]*)$/i.exec(brut);
      const reste = brut.replace(FORME_SOCIETE, '').trim();
      if (usageTiret && /^(?:de|du|des|d['’])(?![A-Za-zÀ-ÿ])/i.test(reste)) { brut = usageTiret[1].trim(); formeGardee = true; }
      else if (reste && /^[A-ZÀ-Ý0-9]/.test(reste) && !/^(?:de|du|des|d['’]|la|le|les|l['’])(?![A-Za-zÀ-ÿ])/i.test(reste)) brut = reste;
      else formeGardee = true;
    }
    brut = sansFormeJuridiqueFinale(brut);
    // Nom resté en capitales (page de garde et analyse en capitales) : graphie du DCE, mot par mot ; à défaut, forme
    // juridique écrite dans sa graphie usuelle et nom d'usage dans la graphie du DCE (T9-COH-2).
    // Mots mis en casse sans appui du DCE ni d'une liste de lieux (« MAIRIE DU TRAIT », T5-COH-2) : graphie soumise à GSS.
    let graphieIncertaine = '';
    {
      const avant = brut;
      const det = casseDuDceDetail(brut, c.ctx.dce || '');
      brut = det.forme || casseFormeJuridique(brut, c.ctx.dce || '') || brut;
      if (det.forme && det.incertains.length) graphieIncertaine = `Le DCE n'écrit le nom de l'acheteur qu'en capitales (« ${avant} ») : le mémoire l'écrit « ${det.forme} ». Est-ce la graphie exacte (majuscules, accents) de ${det.incertains.map((w) => `« ${w} »`).join(', ')} ? Sinon, quelle est-elle ?`;
    }
    // Nom resté en capitales, sans autre graphie dans le DCE (T4-COH-8 : « ROUEN NORMANDIE AMENAGEMENT ») : mots pleins avec leur
    // majuscule, accents du dictionnaire, lieux connus ; un mot incertain (« Logeo ») est soumis à GSS.
    {
      const cap = casseNomEnCapitales(brut, c.ctx.dce || '');
      if (cap.forme && cap.forme !== brut) {
        if (cap.incertains.length) graphieIncertaine = `Le DCE n'écrit le nom de l'acheteur qu'en capitales (« ${brut} ») : le mémoire l'écrit « ${cap.forme} ». Est-ce la graphie exacte (accents, majuscules) de ${cap.incertains.map((w) => `« ${w} »`).join(', ')} ? Sinon, quelle est-elle ?`;
        brut = cap.forme;
      }
    }
    let { article, nom } = articleEtNom(brut, c.ctx.dce || '');
    const formes = formesClient(nom, c.ctx.dce || '');
    // Groupement de commandes réécrit en ses membres (« Ville de Rouen et le CCAS de Rouen ») : article du premier membre.
    if (formes.articleLong !== undefined) article = formes.articleLong;
    // Forme de société gardée dans le nom (« SEM Havre Développement », « Société anonyme d'HLM … ») : article féminin.
    if (formeGardee && !article && !formes.pluriel) article = 'la';
    // Société désignée ainsi dans le DCE (« S.P.L. CITEDIA METROPOLE », « société publique locale … ») : féminin.
    const societeDce = !formeGardee && (societe || new RegExp(`(?:^|[^a-z])(?:s ?p ?l ?a?|s ?e ?m|societe publique locale|societe d.economie mixte) ${echapper(normaliser(nom).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim())}(?![a-z])`).test(normaliser(c.ctx.dce || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')));
    return {
      // Société (nom propre) : sans article (« Citédia Métropole », jamais « le Citédia Métropole »).
      valeur: formes.long, article: societeDce && !formes.pluriel ? '' : article, source: brut === couverture ? 'page de garde' : 'analyse du DCE (clientName)',
      ...(formes.court ? { court: formes.court.nom, articleCourt: formes.court.article, ...(formes.court.genre !== undefined ? { genreCourt: formes.court.genre } : {}) } : {}),
      ...(formes.pluriel ? { genre: 'p' as const } : societeDce ? { genre: 'f' as const } : {}),
      ...(elisionDevantNom(formes.long, c.ctx.dce || '') ? { hMuet: true } : {}),
      ...(formes.court && elisionDevantNom(formes.court.nom, c.ctx.dce || '') ? { hMuetCourt: true } : {}),
      ...(graphieIncertaine ? { aConfirmer: graphieIncertaine } : {}),
    };
  },
  OBJET_MARCHE: (c) => {
    const titre = valeurPropre(c.ctx.cover?.title);
    const v = titre && !/^m[ée]moire technique$/i.test(titre) ? titre : valeurPropre(c.ctx.analyse?.projectTitle);
    // Un intitulé contient au moins un mot (jamais un nombre seul, T7-COH-1). Intitulé en capitales (T2-CONS-14 : « PRESTATIONS
    // DE RONDES DE SURVEILLANCE DU SITE DU CSTB GRENOBLE ») : graphie du DCE mot par mot, sigles gardés (« Prestations de
    // rondes de surveillance du site du CSTB Grenoble »), comme le nom de l'acheteur.
    const intitule = textePropre(v) ? v.replace(/\.$/, '') : '';
    return { valeur: intitule ? casseDuDce(intitule, c.ctx.dce || '', true) || intitule : null, source: 'analyse du DCE (projectTitle)' };
  },
  REF_MARCHE: (c) => ({ valeur: valeurPropre(c.ctx.cover?.ref) || valeurPropre(c.ctx.analyse?.marketRef) || null }),
  LOTS: (c) => {
    // Numéros de lot seulement (T7-COH-1) : « Lot 2 » → « 2 » ; « Unique », « Marché unique », « Non alloti », « N/A » ne
    // sont pas des lots. Marché non alloti, ou intitulé qui nomme déjà le lot (« … — Lot 5, site de Caen ») : rien.
    // Plusieurs lots sans pièce propre au lot du mémoire (T10-COH-3) : rien n'est imprimé, la question est posée à GSS.
    const ld = lotsDuMemoire(c.ctx.analyse, c.ctx.dce || '');
    if (ld.question) return { valeur: null };
    const lots = ld.lots;
    if (!lots.length) return { valeur: null };
    const objet = normaliser(`${valeurPropre(c.ctx.cover?.title)} ${valeurPropre(c.ctx.analyse?.projectTitle)}`);
    if (lots.every((n) => new RegExp(`\\blots?\\s*(?:n\\s*[°o.]?\\s*)?${n.toLowerCase()}\\b`).test(objet))) return { valeur: null };
    return { valeur: `${lots.length > 1 ? 'lots' : 'lot'} ${listeFr(lots)}` };
  },
  DUREE_MARCHE: (c) => {
    // Une durée seulement (« 3 ans », « 12 mois à compter de la notification », « Un an renouvelable ») : jamais une date
    // ou une période (« d'une durée d'À compter de la notification… », « d'une durée de 1er janvier… »), ni un nombre seul
    // (« d'une durée de 36 »), T7-COH-1.
    const v = valeurPropre(c.ctx.analyse?.duration);
    const coeur = v.replace(/^(?:p[ée]riode\s+initiale|(?:est\s+)?(?:d['’]une\s+)?dur[ée]e(?:\s+(?:initiale|ferme|globale|totale|ma[xi]imale|de base))?)\s*(?:est\s+)?(?:de\s+|d['’]\s*|:\s*)?/i, '');
    const DUREE = /^(?:\d+(?:[,.]\d+)?|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|dix-huit|vingt-quatre|trente-six|quarante-huit)\s*(?:\(\s*\d+\s*\)\s*)?(?:ans?|ann[ée]es?|mois|semaines?|jours?)\b/i;
    return { valeur: v && DUREE.test(coeur) ? v : null };
  },
  DATE_DEBUT_MARCHE: (c) => ({ valeur: dateDebutMarche(c.ctx.dce || '') || null, source: 'DCE' }),
  SITE: (c) => ({ valeur: (Array.isArray(c.ctx.analyse?.sites) ? c.ctx.analyse.sites : []).map((s: any) => textePropre(s?.name)).filter(Boolean) }),
  VILLE: (c) => ({ valeur: villesDuMarche(c.ctx.dce || '', c.ctx.analyse) }),
  SECTEUR_CLIENT: (c) => ({ valeur: valeurPropre(c.ctx.analyse?.clientSector) || null }),
  SECTEUR_REFERENCE: (c) => ({ valeur: c.plan?.secteurReference?.libelle || null }),
  QUALIFICATIONS_REQUISES: (c) => ({ valeur: c.qualifs, source: 'DCE' }),
  PROFILS_DEMANDES: (c) => {
    const p: string[] = [];
    if (c.ind.SSIAP) p.push('nos agents de sécurité incendie (SSIAP)');
    if (c.ind.SURVEILLANCE) p.push('nos agents de sûreté');
    if (c.ind.CYNOPHILE) p.push('nos agents cynophiles');
    if (c.ind.TELESURVEILLANCE) p.push('nos agents rondiers intervenants');
    return { valeur: p };
  },
  // Diplômes de l'équipe dédiée = qualifications des profils du tableau de l'équipe (T4N-3 : citedia2, lot 2 en SSIAP 1 et
  // CQP APS, imprimait « SSIAP 2 » exigé pour le seul chef d'équipe du lot 1 ; caen imprimait « SSIAP 1 » sans CQP APS).
  DIPLOMES_EQUIPE: (c) => {
    const q = diplomesEquipe(c).filter((x) => !/^habilitation électrique/.test(x) || HABILITATION_GSS.test(x));
    // Habilitation électrique exigée à un autre niveau que H0B0 (T4G-5) : une seule question à GSS, propre au marché.
    const autres = c.qualifs.filter((x) => /^habilitation électrique/.test(x) && !HABILITATION_GSS.test(x));
    const question = autres.length ? `Le cahier des charges exige l'${autres.length > 1 ? `${autres.slice(0, -1).join(', ')} et l'${autres[autres.length - 1]}` : autres[0]} : vos agents la détiennent-ils ? Si oui, elle sera ajoutée aux diplômes de l'équipe dédiée.` : '';
    return q.length ? { valeur: q, source: c.ctx.dimensionnement?.profils.length ? "qualifications des profils de l'équipe dédiée (dimensionnement)" : "qualifications des lignes du tableau de l'équipe dédiée", ...(question ? { aConfirmer: question } : {}) } : { valeur: null, ...(question ? { question } : {}) };
  },
  TENUE_RETENUE: (c) => {
    const uniformes = valeurPropre(c.ctx.analyse?.operationalSummary?.uniforms);
    const ads = /(?<![\wÀ-ÿ])ADS(?![\wÀ-ÿ])|agents? de (?:s[ée]curit[ée](?! incendie)|surveillance|s[ûu]ret[ée])/i.test(String(c.ctx.dce || ''));
    if (/costume|tenue de ville|tailleur/i.test(uniformes)) return { valeur: 'la tenue costume', source: 'analyse du DCE (uniforms)' };
    if (c.ind.SSIAP) return { valeur: ads ? "la tenue des agents SSIAP et, pour les agents de sécurité, la tenue d'intervention" : 'la tenue des agents SSIAP', source: 'règle du mémoire type' };
    if (c.ind.RONDES || c.ind.TELESURVEILLANCE || c.ind.SURVEILLANCE) return { valeur: "la tenue d'intervention", source: 'règle du mémoire type' };
    if (c.ind.ACCUEIL_PUBLIC) return { valeur: 'la tenue costume', source: 'règle du mémoire type' };
    return { valeur: null };
  },
  LIGNES_EQUIPE_DEDIEE: (c) => {
    // Postes et horaires du DCE : une ligne par profil exigé, effectif calculé (proposition à valider par GSS).
    const dim = c.ctx.dimensionnement;
    if (dim?.profils.length) return { valeur: lignesEquipe(dim), source: 'dimensionnement calculé à partir des postes et des horaires du DCE', aConfirmer: questionDimensionnement(dim) };
    const ac = '[À COMPLÉTER]';
    const lignes = lignesEquipeParQualification(c).map(([categorie, qualif]) => `| ${categorie} | ${qualif} | ${ac} | |`);
    // Rondes ponctuelles du DCE sans durée (cstb, T9N-1) : la question exacte sur la durée d'une ronde et les intervenants,
    // posée une fois à GSS en plus de l'effectif de chaque ligne.
    const rondes = questionRondes(dim);
    return { valeur: lignes.join('\n'), question: "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) ?", source: 'qualifications exigées par le DCE', ...(rondes ? { aConfirmer: rondes } : {}) };
  },
  EFFECTIF_AGENTS: (c) => (c.ctx.dimensionnement?.titulaires
    ? { valeur: String(c.ctx.dimensionnement.titulaires), source: 'dimensionnement calculé à partir des postes et des horaires du DCE', aConfirmer: questionDimensionnement(c.ctx.dimensionnement) }
    : { valeur: null }),
  NB_AGENTS_RENFORT: (c) => (c.ctx.dimensionnement?.suppleants
    ? { valeur: String(c.ctx.dimensionnement.suppleants), source: `équipe suppléante : ${Math.round(PART_SUPPLEANTS * 100)} % des titulaires, deux agents au moins`, aConfirmer: questionDimensionnement(c.ctx.dimensionnement) }
    : { valeur: null }),
  EFFECTIF_ADS_CQP: (c) => {
    const e = c.registre.find((x) => x.cle === 'effectif_agents_securite');
    const total = Number(nombreDe(c.registre.find((x) => x.cle === 'effectif_total')?.valeur_retenue || '')) || 0;
    const v = Number(nombreDe(e?.valeur_retenue || '')) || 0;
    // Valeur « à confirmer » ou incohérente (supérieure à l'effectif total) : jamais imprimée.
    if (!e || !v || aConfirmerRegistre(e) || (total && v > total)) return { valeur: null };
    return { valeur: String(v), source: 'registre effectif_agents_securite' };
  },
  // Statut de PME : réponse de GSS au registre (« oui » / « non ») ; à défaut, rien n'est imprimé (380 salariés
  // dépassent le seuil de 250) et la question est posée à GSS (section {{#si STATUT_PME}} du texte).
  STATUT_PME: (c) => {
    const e = c.registre.find((x) => x.cle === 'statut_pme');
    if (e) return /^\s*(?:oui|pme)\b/i.test(e.valeur_retenue) ? { valeur: 'PME', source: `registre statut_pme (${e.source_retenue}, ${e.date_retenue})` } : { valeur: null };
    return { valeur: null, question: questionParGeneration(c.mt.variables.STATUT_PME) };
  },
  EFFECTIF_TOTAL: (c) => depuisRegistre(c, 'effectif_total', nombreDe),
  EFFECTIF_76: (c) => depuisRegistre(c, 'effectif_departement_76', nombreDe),
  EFFECTIF_27: (c) => depuisRegistre(c, 'effectif_departement_27', nombreDe),
  EFFECTIF_SSIAP1: (c) => depuisRegistre(c, 'effectif_ssiap1', nombreDe),
  EFFECTIF_SSIAP2: (c) => depuisRegistre(c, 'effectif_ssiap2', nombreDe),
  EFFECTIF_SSIAP3: (c) => depuisRegistre(c, 'effectif_ssiap3', nombreDe),
  EFFECTIF_CONTROLEURS: (c) => depuisRegistre(c, 'effectif_controleurs', nombreDe),
  EFFECTIF_CYNOPHILES: (c) => depuisRegistre(c, 'effectif_cynophiles', nombreDe),
  VIVIER_EVENEMENTIEL: (c) => depuisRegistre(c, 'vivier_evenementiel', nombreDe),
  AGENTS_MOBILISABLES_48H: (c) => (c.horsNormandie ? { valeur: null } : depuisRegistre(c, 'agents_mobilisables_48h', nombreDe)),
  VEHICULES_ASTREINTE: (c) => depuisRegistre(c, 'vehicules_astreinte', nombreDe),
  LOGICIEL_MAIN_COURANTE: (c) => {
    const e = c.registre.find((x) => x.cle === 'logiciel_main_courante');
    return { valeur: 'Trackforce', source: 'registre logiciel_main_courante (Trackforce)', aConfirmer: e && aConfirmerRegistre(e) ? c.mt.variables.LOGICIEL_MAIN_COURANTE?.a_confirmer : undefined };
  },
  ORGANIGRAMME: (c) => {
    const o = organigrammeMarkdown(c.ctx.referents || '', c.registre);
    return { valeur: o.texte || null, source: 'annuaire « Personnes » et registre', aConfirmer: o.aConfirmer.length ? o.aConfirmer.join('\n') : undefined };
  },
  INTERLOCUTEUR_UNIQUE: (c) => depuisRegistre(c, 'dirigeant', nomPropre),
  FONCTION_INTERLOCUTEUR: (c) => {
    const nom = valeurPropre(c.ctx.choix?.variables?.INTERLOCUTEUR_UNIQUE as string) || nomPropre(c.registre.find((x) => x.cle === 'dirigeant')?.valeur_retenue || '');
    const f = nom ? fonctionDansAnnuaire(c.ctx.referents || '', nom) : '';
    if (f) return { valeur: f, source: 'annuaire « Personnes »' };
    if (!c.ctx.choix?.variables?.INTERLOCUTEUR_UNIQUE && nom) return { valeur: "directeur d'agence et responsable de marché", source: 'faits_gss.md (dirigeant)' };
    return { valeur: null };
  },
  TEL_INTERLOCUTEUR: (c) => {
    // Interlocuteur choisi par GSS autre que le dirigeant : le numéro du registre (celui du dirigeant) ne vaut pas pour lui.
    const choisi = valeurPropre(c.ctx.choix?.variables?.INTERLOCUTEUR_UNIQUE as string);
    const dirigeant = nomPropre(c.registre.find((x) => x.cle === 'dirigeant')?.valeur_retenue || '');
    if (choisi && normaliser(choisi) !== normaliser(dirigeant)) return { valeur: null, question: `Quel est le numéro de téléphone unique de l'interlocuteur choisi (${choisi}) ?` };
    return depuisRegistre(c, 'telephone_contact');
  },
  TAUX_REPRISE: () => ({ valeur: null }),
  FONDEMENT_REPRISE_DCE: (c) => ({ valeur: fondementRepriseDce(c.ctx.dce || '') || null, source: 'DCE' }),
  // Partenaire de télésurveillance : la réponse de GSS, une fois reportée au registre (partenaire_telesurveillance), vaut
  // pour tous les marchés ; d'ici là, [À COMPLÉTER] et la question du document (questions_gss_une_fois : règle à trancher).
  PARTENAIRE_TELESURVEILLANCE: (c) => depuisRegistre(c, 'partenaire_telesurveillance'),
  ENGAGEMENTS_TELESURVEILLANCE: () => ({ valeur: null }),
  SITES_RONDES: () => ({ valeur: null }),
  FICHE_POSTE_EXEMPLE: () => ({ valeur: null }),
  DELAI_ASTREINTE: (c) => delai(c, 'DELAI_ASTREINTE', 'remplacement'),
  DELAI_ASTREINTE_NORMANDIE: (c) => delai(c, 'DELAI_ASTREINTE_NORMANDIE', null),
  DELAI_PTI: (c) => delai(c, 'DELAI_PTI', 'pti'),
  DELAI_INTERVENTION_ALARME: (c) => delai(c, 'DELAI_INTERVENTION_ALARME', 'alarme'),
  DELAI_ENVOI_PLANNINGS: (c) => depuisRegistre(c, 'envoi_plannings', (v) => valeurPropre(v).replace(/\s+/g, '')),
  // Envoi des plannings au client (calendrier de GSS : J-3) : le cahier des charges prime quand il impose un envoi plus tôt
  // (T3-CONS-4, ign : « au moins sept (7) jours avant le début du mois concerné ») ; avant J-7, le jalon devient J-n (phrase
  // adaptée, signalée à GSS) ; à J-7 ou plus tôt, le calendrier de GSS (J-10 envoi aux agents, J-7 validation) ne tient plus :
  // le jalon est demandé à GSS (« [À COMPLÉTER] », jalon retiré du schéma), jamais l'ancien jalon à côté de l'engagement contraire.
  JALON_ENVOI_CLIENT: (c) => {
    const gss = c.mt.variables.JALON_ENVOI_CLIENT?.valeur_gss || 'J-3';
    const k = Number((/J-(\d+)/.exec(gss) || [])[1] || 3);
    const dce = c.ctx.delaisDuDce !== false ? envoiPlanningsClientDce(c.ctx.dce || '') : null;
    if (!dce || dce.jours <= k) return { valeur: gss, source: 'pratique GSS (calendrier de planification)' };
    // Strictement entre la validation par les agents (J-7) et J-3 : le calendrier reste dans l'ordre, chaque jalon à sa date.
    if (dce.jours < 7) return { valeur: `J-${dce.jours}`, source: `imposé par le DCE : « ${dce.phrase.slice(0, 200)} »` };
    const exigence = (dce.phrase.split(/(?<=\.)\s+(?=\S)/).pop() || dce.phrase).trim();
    return { valeur: null, question: `Le cahier des charges impose d'envoyer les plannings au client au moins ${dce.jours} jours avant le début du mois (« ${exigence.length > 220 ? `${exigence.slice(0, 220).replace(/\s+\S*$/, '')}…` : exigence} ») ; votre calendrier prévoit J-10 l'envoi aux agents, J-7 leur validation et J-3 l'envoi au client. Quel jalon faut-il indiquer pour l'envoi des plannings au client ?` };
  },
  DELAI_COMMANDE_SUPPLEMENTAIRE: (c) => delai(c, 'DELAI_COMMANDE_SUPPLEMENTAIRE', 'commande'),
  DELAI_DEFAILLANCE_SSI: (c) => delai(c, 'DELAI_DEFAILLANCE_SSI', 'ssi'),
  FREQ_CONTROLE_1: (c) => ({ valeur: c.mt.variables.FREQ_CONTROLE_1?.valeur_gss || null, source: 'pratique GSS' }),
  FREQ_CONTROLE_2: (c) => {
    // Fréquence chiffrée plus élevée lue dans le DCE sans modèle (T3G-7) : le CCTP prime, phrase signalée (D8).
    const d = c.ctx.delaisDuDce !== false ? frequenceInopinesDce(c.ctx.dce || '') : null;
    if (d) return { valeur: d.valeur, source: `imposé par le DCE : « ${d.phrase.slice(0, 200)} »` };
    return valeurSiExige(c, 'FREQ_CONTROLE_2') || ({ valeur: c.mt.variables.FREQ_CONTROLE_2?.valeur_gss || null, source: 'pratique GSS (faits_gss.md)' });
  },
  FREQ_CONTROLE_3: (c) => ({ valeur: c.mt.variables.FREQ_CONTROLE_3?.valeur_gss || null, source: 'pratique GSS' }),
  CONTROLES_INOPINES_MENSUELS: (c) => {
    const d = c.ctx.delaisDuDce !== false ? frequenceInopinesDce(c.ctx.dce || '') : null;
    if (d) return { valeur: d.mensuels, source: `déduit de la fréquence imposée par le DCE (« ${d.valeur} »)` };
    return valeurSiExige(c, 'CONTROLES_INOPINES_MENSUELS') || ({ valeur: c.mt.variables.CONTROLES_INOPINES_MENSUELS?.valeur_gss || null, source: 'pratique GSS' });
  },
  FREQ_REUNIONS: (c) => ({ valeur: frequenceReunionsDce(c.ctx.dce || '') || null, source: 'DCE' }),
  RESPONSABLE_APR: (c) => ({ valeur: c.mt.variables.RESPONSABLE_APR?.valeur_gss || null, source: 'AO RNE p.49-50', aConfirmer: questionParGeneration(c.mt.variables.RESPONSABLE_APR) }),
};

/**
 * Variables du marché : choix de GSS > valeurs imposées par le CCTP (vérifiées) > calcul (DCE, analyse, registre,
 * annuaire). Une variable sans valeur reste vide : le publipostage applique sa règle « si_absente ».
 */
export function variablesDuMarche(mt: MemoireType, ctx: ContexteMarche, indicateurs: Record<string, boolean>, plan?: PlanMemoireType): Variables {
  const registre = ctx.registre || lireRegistre();
  const horsNormandie = indicateurs.HORS_NORMANDIE ?? ctx.horsNormandie ?? marcheHorsNormandie(ctx.analyse || {}, ctx.dce || '');
  const c: CalculVariables = { mt, ctx, ind: indicateurs, plan, registre, horsNormandie, qualifs: qualificationsDuDce(ctx.dce || '', ctx.analyse) };
  const out: Variables = {};
  for (const nom of Object.keys(mt.variables)) {
    const choix = ctx.choix?.variables?.[nom];
    if (choix !== undefined && (Array.isArray(choix) ? choix.length : String(choix).trim())) {
      if (nom === 'CLIENT' && typeof choix === 'string') {
        const { article, nom: nomClient } = articleEtNom(choix, ctx.dce || '');
        out[nom] = { valeur: nomClient, article, source: 'choix de GSS' };
      } else out[nom] = { valeur: choix, source: 'choix de GSS' };
      continue;
    }
    const imp = ctx.imposees?.[nom];
    // Contrôle global du responsable qualité : le mémoire type de GSS le décrit trimestriel à plusieurs endroits (« Sur un
    // trimestre type… dans le trimestre, le contrôle global », « lors des réunions trimestrielles… bilan du trimestre
    // écoulé ») ; une autre fréquence imposée ne changerait qu'une phrase et ferait se contredire le mémoire (becquerel 591,
    // T5N-4) : la pratique de GSS reste, l'exigence est posée à GSS.
    if (nom === 'FREQ_CONTROLE_3' && imp && valeurPropre(imp.valeur) && !/trimestr/i.test(String(imp.valeur))) {
      const gss = CALCULS[nom]?.(c) || { valeur: null };
      out[nom] = { ...gss, aConfirmer: `Le cahier des charges impose pour le contrôle global « ${imp.valeur} » (« ${imp.citation.slice(0, 200)} ») ; le mémoire type de GSS décrit un contrôle global trimestriel du responsable qualité (réunions trimestrielles, bilan du trimestre). Pouvez-vous vous engager sur la fréquence du cahier des charges dans tout le mémoire, ou faut-il garder la pratique de GSS ?` };
      continue;
    }
    // Contrôles inopinés exigés sans chiffre (« plusieurs fois par mois », « régulièrement ») ou à 3 par mois au plus (T3-CONS-3,
    // T3N-2, imm : « La fréquence des contrôles sera de plusieurs fois par mois ») : l'engagement de GSS quand le cahier des
    // charges l'exige (au moins trois fois par mois, réponse de GSS du 1er octobre 2026) remplit l'exigence ; il reste, sans
    // question ni phrase adaptée. Seule une fréquence chiffrée plus élevée, ou précisée (de nuit, le week-end), la remplace.
    if ((nom === 'FREQ_CONTROLE_2' || nom === 'CONTROLES_INOPINES_MENSUELS') && imp && valeurPropre(imp.valeur) && frequenceRempliePourGss(String(imp.valeur))) {
      const def = mt.variables[nom];
      out[nom] = def?.valeur_si_exige ? { valeur: def.valeur_si_exige, source: `engagement GSS quand le cahier des charges l'exige (exigence du DCE : « ${imp.citation.slice(0, 200)} »)` } : (CALCULS[nom]?.(c) || { valeur: null });
      continue;
    }
    // Délai imposé pour un sujet où le CCTP fixe plusieurs délais (citedia : 15 minutes pour l'intervenant TLS et le bouton
    // anti-agression, 30 minutes pour une alarme technique ou intrusion, T4-CONS-4) : une seule valeur ne peut pas les dire
    // tous ; la règle des délais multiples s'applique (T10C-2 : délai de GSS s'il les respecte tous, sinon phrase sans délai
    // et question citant les phrases du CCTP).
    const sujetImp = SUJET_VARIABLE_DELAI[nom];
    const delaisMultiples = !!imp && !!sujetImp && ctx.delaisDuDce !== false
      && new Set(delaisDuDce(ctx.dce || '', sujetImp as keyof typeof SUJETS_DELAI).map((d) => d.minutes)).size > 1;
    if (imp && valeurPropre(imp.valeur) && !delaisMultiples) {
      out[nom] = { valeur: imp.valeur, source: `imposé par le DCE : « ${imp.citation.slice(0, 200)} »` };
      continue;
    }
    const calc = CALCULS[nom];
    out[nom] = calc ? calc(c) : { valeur: null };
    const def = mt.variables[nom];
    if (!variableRenseignee(out[nom]) && def?.question && !out[nom].question) out[nom].question = def.question;
  }
  // Fréquence des contrôles inopinés imposée par le CCTP (becquerel 591, T5N-4 : « au moins une fois par mois de nuit et au
  // moins une fois par mois le week-end de jour ») : le calendrier type en découle, jamais la pratique de GSS « un à trois ».
  if (!ctx.choix?.variables?.CONTROLES_INOPINES_MENSUELS && !ctx.imposees?.CONTROLES_INOPINES_MENSUELS && ctx.imposees?.FREQ_CONTROLE_2 && mt.variables.CONTROLES_INOPINES_MENSUELS && frequenceRempliePourGss(String(ctx.imposees.FREQ_CONTROLE_2.valeur || ''))) {
    if (mt.variables.CONTROLES_INOPINES_MENSUELS.valeur_si_exige) out.CONTROLES_INOPINES_MENSUELS = { valeur: mt.variables.CONTROLES_INOPINES_MENSUELS.valeur_si_exige, source: `engagement GSS quand le cahier des charges l'exige (« ${ctx.imposees.FREQ_CONTROLE_2.valeur} »)` };
  } else if (!ctx.choix?.variables?.CONTROLES_INOPINES_MENSUELS && !ctx.imposees?.CONTROLES_INOPINES_MENSUELS && ctx.imposees?.FREQ_CONTROLE_2 && mt.variables.CONTROLES_INOPINES_MENSUELS) {
    const imposee = String(ctx.imposees.FREQ_CONTROLE_2.valeur || '');
    const derive = controlesInopinesDe(imposee);
    out.CONTROLES_INOPINES_MENSUELS = derive
      ? { valeur: derive, source: `déduit de la fréquence imposée par le DCE (« ${imposee} »)` }
      : { valeur: null, question: `Le cahier des charges impose des contrôles inopinés « ${imposee} » : combien de contrôles inopinés par mois et par site faut-il indiquer dans le calendrier type du suivi qualité ?` };
  }
  return out;
}

/**
 * Délai d'envoi du planning mensuel au client imposé par le DCE, en jours avant le début du mois (ign : « Le planning mensuel …
 * est transmis … au moins sept (7) jours avant le début du mois concerné » → 7 ; becquerel : « au moins 10 jours avant le début
 * du mois considéré » → 10 ; « au plus tard le 20 du mois précédent » → 10 ; « 10 jours ouvrés » → 14). null sinon.
 */
export function envoiPlanningsClientDce(dce: string): { jours: number; phrase: string } | null {
  const t = String(dce || '').replace(/\s+/g, ' ');
  const phrases = t.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý])/);
  const LETTRES: Record<string, number> = { trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20 };
  // Phrase citée, avec la dernière phrase précédente quand elle seule ne nomme pas le planning (« Cette transmission se fait… »),
  // sans le titre numéroté collé (« 6.5 TRANSMISSION DU PLANNING MENSUEL »).
  const citer = (i: number): string => {
    if (/plannings?/i.test(phrases[i])) return phrases[i].trim();
    const prec = (String(phrases[i - 1] || '').split(/(?<=\.)\s+(?=\S)/).pop() || '').replace(/^\d+(?:\.\d+)*\s+[A-ZÀ-Ý'’ ]+?\s+(?=[A-ZÀ-Ý][a-zà-ÿ])/, '');
    return `${prec} ${phrases[i]}`.trim();
  };
  for (let i = 0; i < phrases.length; i++) {
    const ph = phrases[i];
    // La phrase du délai ou la précédente nomment le planning et son envoi au client.
    const avec = `${phrases[i - 1] || ''} ${ph}`;
    if (!/plannings?/i.test(avec) || !/transm[ie]|envo[yi]|communiqu|remi[st]|remet|adress|fourni/i.test(avec) || /modification|changement/i.test(ph.split(/\d|jours/)[0] || '')) continue;
    const m = /(?:au moins|au minimum|minimum|au plus tard)?\s*(\d{1,2}|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt)(?:\s*\(\s*[\da-zé]{1,8}\s*\))?\s+jours?\s*(ouvr[ée]s|ouvrables|calendaires)?\s+avant\s+(?:le\s+d[ée]but\s+d[ue]\s+|la\s+fin\s+d[ue]\s+)?(?:mois|p[ée]riode)/i.exec(ph);
    if (m) {
      let n = /^\d+$/.test(m[1]) ? Number(m[1]) : LETTRES[m[1].toLowerCase()];
      if (m[2] && /ouvr/i.test(m[2])) n = Math.ceil(n * 7 / 5);
      if (/la\s+fin\s+d/i.test(m[0])) n = Math.max(0, n);
      // Phrase citée avec la précédente quand elle seule ne nomme pas le planning (« Cette transmission se fait … »).
      if (n) return { jours: n, phrase: citer(i) };
    }
    // « une semaine avant », « deux semaines avant le début du mois » (T5G-7) : en jours.
    const sem = /(?:au moins|au minimum|minimum|au plus tard)?\s*(une?|deux|trois|quatre|\d{1,2})\s+semaines?\s+avant\s+(?:le\s+d[ée]but\s+d[ue]\s+|la\s+fin\s+d[ue]\s+)?(?:mois|p[ée]riode|prestation|mise en (?:œuvre|oeuvre|place))/i.exec(ph);
    if (sem) { const k = /^\d+$/.test(sem[1]) ? Number(sem[1]) : ({ un: 1, une: 1, deux: 2, trois: 3, quatre: 4 } as Record<string, number>)[sem[1].toLowerCase()]; if (k) return { jours: 7 * k, phrase: citer(i) }; }
    // « à J-7 », « J – 10 » dans la phrase du planning (T5G-7).
    const j = /(?<![\p{L}\d])J\s*[-–—−]\s*(\d{1,2})(?!\d)/u.exec(ph);
    if (j && Number(j[1]) > 0) return { jours: Number(j[1]), phrase: citer(i) };
    const d = /au plus tard le (\d{1,2})(?:er)? du mois (?:pr[ée]c[ée]dent|en cours)/i.exec(ph);
    if (d) return { jours: Math.max(1, 30 - Number(d[1])), phrase: citer(i) };
  }
  return null;
}

const NOMBRES_FOIS: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

/**
 * Nombre de contrôles (ou de passages) par mois d'une fréquence écrite (« au moins trois fois par mois » → 3, « une fois par
 * semaine » → 4,3, « deux contrôles inopinés par mois » → 2) ; null si elle n'est pas chiffrée (« plusieurs fois par mois »,
 * « régulièrement ») ou ne se ramène pas au mois.
 */
export function frequenceMensuelle(frequence: string): number | null {
  const f = normaliser(frequence);
  const PAR: Record<string, number> = { jour: 30, nuit: 30, semaine: 4.33, mois: 1, trimestre: 1 / 3, semestre: 1 / 6, an: 1 / 12, annee: 1 / 12 };
  let max: number | null = null;
  for (const m of f.matchAll(/(une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?:fois|controles?|visites?|passages?)(?:\s+inopines?)?\s+(?:par|chaque|tous les|toutes les)\s+(jour|nuit|semaine|mois|trimestre|semestre|an|annee)s?/g)) {
    const n = (NOMBRES_FOIS[m[1]] ?? (({ sept: 7, huit: 8, neuf: 9, dix: 10 } as Record<string, number>)[m[1]] ?? Number(m[1]))) * PAR[m[2]];
    if (Number.isFinite(n)) max = Math.max(max ?? 0, n);
  }
  if (max === null && /(?:^|\s)(?:mensuel(?:le)?s?|tous les mois|chaque mois)(?:\s|$)/.test(f)) max = 1;
  if (max === null && /(?:^|\s)(?:hebdomadaires?|toutes les semaines|chaque semaine)(?:\s|$)/.test(f)) max = 4.33;
  return max;
}
const LETTRES_FOIS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
/**
 * Fréquence des contrôles inopinés imposée par le DCE, lue sans modèle (T3G-7 : en mode dégradé, « au moins quatre contrôles
 * inopinés par mois » laissait « au moins trois fois par mois » imprimé) : seulement une fréquence chiffrée supérieure à 3 par
 * mois (sinon l'engagement de GSS la remplit). Valeur écrite comme celles de GSS (« au moins quatre fois par mois », « une fois
 * par semaine ») et nombre mensuel de contrôles inopinés du calendrier type. null sinon.
 */
export function frequenceInopinesDce(dce: string): { valeur: string; mensuels: string; phrase: string } | null {
  const LETTRES = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
  // Ligne de tableau, une phrase à part (T4G-3 : « Contrôle inopiné des agents sur site | 4 par mois ») ; « N par mois » dans une
  // ligne qui nomme les contrôles inopinés compte N contrôles par mois.
  // Ligne « libellé : valeur » qui nomme les contrôles inopinés (T5G-8 : « Contrôles inopinés : 4 par mois minimum »,
  // « … : 4/mois ») : même réécriture.
  const lignes = String(dce || '').replace(/\r/g, '').split('\n').map((l) => (/\|/.test(l) || /\s[—–]\s[^:|]{2,60}:\s*\S/.test(l) || (/inopin/i.test(l) && /^[^:.]{3,80}:\s*\S/.test(l)) ? `\n${/inopin/i.test(l) ? l.replace(/(?<![\p{L}\d])(\d+)\s*\/\s*(mois|semaine)(?![\p{L}])/giu, '$1 contrôles par $2').replace(/(?<![\p{L}\d])(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:fois\s+)?par\s+(mois|semaine)(?![\p{L}])/giu, '$1 contrôles par $2') : l}.\n` : l)).join('\n');
  for (const ph of lignes.replace(/\s+/g, ' ').split(/(?<=[.;])\s+/)) {
    if (!/inopin/i.test(ph) || /p[ée]nalit|€/i.test(ph)) continue;
    const n = frequenceMensuelle(ph);
    if (n === null || n <= 3) continue;
    const f = normaliser(ph);
    const m = /(au moins|au minimum|minimum)?\s*(une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?:fois|controles?|visites?|passages?)(?:\s+inopines?)?\s+(?:par|chaque|tous les|toutes les)\s+(jour|nuit|semaine|mois)/.exec(f);
    const nb = m ? (NOMBRES_FOIS[m[2]] ?? (Number(m[2]) || ({ sept: 7, huit: 8, neuf: 9, dix: 10 } as Record<string, number>)[m[2]] || 1)) : 1;
    const per = m ? m[3] : /hebdomadaire|semaine/.test(f) ? 'semaine' : 'mois';
    // Minimum écrit avant ou après le nombre (« au moins quatre … », « 4 par mois minimum »).
    const auMoins = !!m?.[1] || (!!m && /(?<![\p{L}])(?:minimum|au moins|au minimum)(?![\p{L}])/u.test(f.slice(m.index! + m[0].length, m.index! + m[0].length + 20)));
    const valeur = nb === 1 && !auMoins ? `chaque ${per}` : `${auMoins ? 'au moins ' : ''}${LETTRES[nb] || nb} fois par ${per}`;
    // Mois de quatre semaines au moins : « une fois par semaine » donne au moins quatre contrôles par mois.
    const parMois = per === 'semaine' ? Math.floor(n) : Math.ceil(n);
    const mensuels = `au moins ${LETTRES[parMois] || parMois} contrôle${parMois > 1 ? 's' : ''} inopiné${parMois > 1 ? 's' : ''}`;
    return { valeur, mensuels, phrase: ph.trim() };
  }
  return null;
}

/**
 * Fréquence de contrôles imposée que l'engagement de GSS (au moins trois par mois et par site) remplit déjà : non chiffrée
 * (« plusieurs fois par mois », « régulièrement », « fréquemment ») ou chiffrée à 3 par mois au plus, sans précision de
 * moment (« de nuit », « le week-end », « de jour ») que le texte de GSS ne dirait pas.
 */
export function frequenceRempliePourGss(frequence: string): boolean {
  const f = normaliser(frequence);
  if (!f.trim() || /nuit|week|samedi|dimanche|ferie|de jour|jour et|matin|soir/.test(f)) return false;
  const n = frequenceMensuelle(f);
  if (n !== null) return n <= 3;
  return /plusieurs|regulier|regulierement|frequent|frequemment|periodique|inopine|ponctuel/.test(f);
}

/** Nombre mensuel de contrôles inopinés d'après une fréquence imposée (« au moins une fois par mois de nuit et au moins une
 *  fois par mois le week-end » → « au moins deux contrôles inopinés ») ; '' si la fréquence ne se ramène pas au mois. */
export function controlesInopinesDe(frequence: string): string {
  const f = normaliser(frequence);
  const parties = [...f.matchAll(/(?:(au moins|au minimum|minimum)\s+)?(une|un|deux|trois|quatre|cinq|six|\d+)\s+(?:fois|controles?|visites?|passages?)\s+(?:inopines?\s+)?par mois/g)];
  if (!parties.length && /^(?:au moins |au minimum )?(?:tous les mois|chaque mois|mensuel(?:le)?s?)$/.test(f.trim())) return `${/au (?:moins|minimum)/.test(f) ? 'au moins ' : ''}un contrôle inopiné`;
  if (!parties.length || /semaine|jour|trimestre|an\b|annee/.test(f.replace(/par mois[^,;]*/g, ''))) return '';
  const n = parties.reduce((a, m) => a + (NOMBRES_FOIS[m[2]] ?? Number(m[2])), 0);
  if (!n || n > 10) return '';
  const auMoins = parties.some((m) => !!m[1]);
  return `${auMoins ? 'au moins ' : ''}${LETTRES_FOIS[n]} contrôle${n > 1 ? 's' : ''} inopiné${n > 1 ? 's' : ''}`;
}

// ─── Publipostage ────────────────────────────────────────────────────────────────────────────────

export const A_COMPLETER = '[À COMPLÉTER]';
const RETIRER = '\u0007RETIRER\u0007';

export interface ResultatPubliposte {
  texte: string;
  /**
   * Variables sans valeur : questions à GSS. `repere` : un « [À COMPLÉTER] » est imprimé à l'endroit du manque ;
   * sinon (phrase ou passage retiré, repli), la question va dans la liste des consultations, sans repère.
   */
  manquantes: Array<{ variable: string; question: string; repere: boolean }>;
  /** Valeurs reprises mais à confirmer par GSS. */
  aConfirmer: Array<{ variable: string; valeur: string; question: string }>;
  variablesUtilisees: string[];
}

export interface OptionsPubliposte {
  definitions?: Record<string, VariableMemoireType>;
  indicateurs?: Record<string, boolean>;
  /** Trace (tests) : les valeurs sont remplacées par ‹NOM›, les sections par ‹si:EXPR›…‹/si›. */
  trace?: boolean;
  /**
   * Ajoute, sous le paragraphe (ou le tableau) qui contient chaque « [À COMPLÉTER] », la ligne
   * « [CONSULTATION REQUISE : question] » attendue par le traitement des consultations de la réponse libre (repères
   * ⟦AC:n⟧) : la réponse de GSS sera insérée à cet endroit.
   */
  marquerConsultations?: boolean;
  /** Acheteur sous sa forme longue (première mention du bloc 1) ; sinon forme courte quand elle existe. */
  clientLong?: boolean;
}

const SENTINELLE = (i: number) => `\u0001${i}\u0001`;

/** Remplace les sections {{#si EXPR}}…{{/si}} (de l'intérieur vers l'extérieur). */
function resoudreSections(texte: string, indicateurs: Record<string, boolean>, variables: Variables, trace: boolean): string {
  const RX = /\{\{#si\s+([^}]+?)\s*\}\}((?:(?!\{\{#si\s)[\s\S])*?)\{\{\/si\}\}/;
  let t = texte;
  for (let garde = 0; garde < 500; garde++) {
    const m = RX.exec(t);
    if (!m) break;
    const vrai = evaluerCondition(m[1], indicateurs, variables);
    const contenu = vrai ? m[2] : '';
    t = t.slice(0, m.index) + (trace ? `‹si:${m[1].trim()}›${contenu}‹/si›` : contenu) + t.slice(m.index + m[0].length);
  }
  return t.replace(/\{\{#si\s+[^}]*\}\}|\{\{\/si\}\}/g, '');
}

/** Insertion du nom du client avec son article, prépositions accordées (de le → du, à le → au, de + voyelle → d'). */
function insererClient(sortie: string, v: ValeurVariable): { sortie: string; insere: string } {
  const nom = Array.isArray(v.valeur) ? listeFr(v.valeur.map(String)) : String(v.valeur || '');
  let art = v.article || '';
  const m = /(^|[\s(«"'’*])(de|à|De|À)\s+$/.exec(sortie);
  if (m) {
    const prep = m[2];
    const maj = prep !== prep.toLowerCase();
    const avant = sortie.slice(0, sortie.length - m[0].length + m[1].length);
    // Acheteurs coordonnés (« la Ville de Rouen et le CCAS de Rouen ») : la préposition se répète devant chaque entité
    // (« à la Ville de Rouen et au CCAS de Rouen », T1-COH-1).
    const p = prep.toLowerCase();
    const nomAccorde = v.genre === 'p'
      ? nom.replace(/(,\s+|\s+et\s+)(les|le|la|l['’])(\s*)(?=[A-ZÀ-Ý])/g, (_x, sep: string, a: string, esp: string) => {
        const al = a.toLowerCase().replace('’', "'");
        if (al === 'le') return `${sep}${p === 'de' ? 'du' : 'au'} `;
        if (al === 'les') return `${sep}${p === 'de' ? 'des' : 'aux'} `;
        return `${sep}${p} ${al}${al === "l'" ? '' : esp || ' '}`;
      })
      : nom;
    if (art === 'le' || art === 'les') {
      const contr = p === 'de' ? (art === 'le' ? 'du' : 'des') : (art === 'le' ? 'au' : 'aux');
      return { sortie: `${avant}${maj ? majuscule(contr) : contr} `, insere: nomAccorde };
    }
    if (!art && p === 'de' && (/^[aeiouyâàäéèêëîïôöûüœ]/i.test(nom) || (/^h/i.test(nom) && v.hMuet))) {
      return { sortie: `${avant}${maj ? "D'" : "d'"}`, insere: nomAccorde };
    }
    if (nomAccorde !== nom) {
      const ins = art ? (art.endsWith("'") ? `${art}${nomAccorde}` : `${art} ${nomAccorde}`) : nomAccorde;
      return { sortie, insere: ins };
    }
  }
  let insere = art ? (art.endsWith("'") ? `${art}${nom}` : `${art} ${nom}`) : nom;
  // Début de phrase, de ligne ou d'élément de liste (éventuellement en gras) : majuscule.
  if (/(?:^|[.!?]\s+|\n\s*(?:(?:[-*•]|\d+[.)])\s+)?)(?:\*\*)?$/.test(sortie)) insere = majuscule(insere);
  return { sortie, insere };
}

/** Valeur affichée d'une variable renseignée. */
function valeurAffichee(nom: string, v: ValeurVariable, def?: VariableMemoireType): string {
  const x = v.valeur;
  if (typeof x === 'boolean') return '';
  if (Array.isArray(x)) return sansCovidEnumere(listeFr(x.map(String)));
  const t = String(x ?? '').trim();
  return sansCovidEnumere(def?.type === 'markdown' ? t : t.replace(/\s+/g, ' '));
}

/**
 * Règle GSS (faits_gss.md) : jamais de Covid, même quand le CCTP en cite un exemple (« Plan Blanc, agent positif
 * Covid, alerte attentat »). Le terme est retiré des énumérations reprises ; le reste de l'énumération est gardé.
 */
export function sansCovidEnumere(t: string): string {
  const COVID = String.raw`(?:(?:de |d['’]|du |un |une |le |la |les )?(?:(?:agents?|cas|personnels?|crises?|[ée]pid[ée]mies?|plans?)\s+(?:(?:positifs?|sanitaires?)\s+)?(?:au\s+|de\s+|du\s+)?)?(?:la\s+)?covid(?:-19)?)`;
  return String(t || '')
    .replace(new RegExp(String.raw`\s*,\s*${COVID}(?=\s*(?:,|\bou\b|\bet\b|\)))`, 'gi'), '')
    .replace(new RegExp(String.raw`\s+(?:ou|et)\s+${COVID}(?![\wÀ-ÿ-])`, 'gi'), '')
    .replace(new RegExp(String.raw`(\(\s*(?:ex\.?|par exemple|notamment)?\s*:?\s*)${COVID}\s*,\s*`, 'gi'), '$1');
}

const MOTS_COMMUNS_INITIALE = /^(?:une?|plusieurs|chaque|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente|tous|toutes?|tout|dans|moins|entre|par|selon|d[èe]s|apr[èe]s|avant|environ|minimum|maximum|p[ée]riode|dur[ée]e|hebdomadaires?|mensuel(?:le)?s?|quotidien(?:ne)?s?|annuel(?:le)?s?|trimestriel(?:le)?s?|semestriel(?:le)?s?|bimestriel(?:le)?s?|jusqu['’]?\w*)$/i;

/**
 * Accords d'une valeur insérée dans le texte : minuscule initiale en milieu de phrase (« ont lieu Une fois par mois »),
 * « maximum » non répété (« en {{DELAI}} maximum » avec « 4 heures maximum »), durée sans « Période initiale », élision
 * de « de » devant une voyelle (« d'une durée de un an » → « d'un an »).
 */
function accorderValeur(nom: string, valeur: string, avant: string, apres: string): { avant: string; valeur: string } {
  let v = valeur;
  if (nom === 'DUREE_MARCHE') {
    v = v.replace(/^p[ée]riode\s+initiale\s+(?:de\s+|d['’]\s*)?/i, '');
    // « d'une durée de {{DUREE_MARCHE}} » avec « durée initiale de 2 ans » : jamais « durée de durée ».
    if (/dur[ée]e\s+(?:de\s+|d['’]\s*)?$/i.test(avant)) v = v.replace(/^(?:est\s+)?(?:d['’]une\s+)?dur[ée]e\s+(?:initiale|ferme|globale|totale|ma[xi]imale|de base)?\s*(?:est\s+)?(?:de\s+|d['’]\s*|:\s*)/i, '');
    else v = v.replace(/^(?:est\s+)?(?:d['’]une\s+)?dur[ée]e\s+(?:de\s+|d['’]\s*)/i, '');
  }
  if (/^\s*maxim(?:um|al|ale|aux)\b/i.test(apres) || /\bmaxim(?:um|al|ale)\s+(?:de\s+|d['’])?$/i.test(avant)) v = v.replace(/\s*\(?\s*(?:au\s+)?maxim(?:um|al|ale)?\s*\)?\s*$|\s+max\.?$/i, '').trim() || v;
  const debut = /(?:^|[.!?:]\s+|\n\s*(?:(?:[-*•]|\d+[.)])\s+)?)(?:\*\*)?$/.test(avant);
  const premier = (/^[\wÀ-ÿ'’]+/.exec(v) || [''])[0];
  if (!debut && /^[A-ZÀ-Ý][a-zà-ÿ'’]/.test(premier) && MOTS_COMMUNS_INITIALE.test(premier)) v = v.charAt(0).toLowerCase() + v.slice(1);
  let av = avant;
  if (/(?:^|[\s(])([Dd])e $/.test(av) && /^(?:une?|[aeiouyâàäéèêëîïôöûüœ])/i.test(v) && !/^[A-ZÀ-Ý0-9]{2,}\b/.test(v)) av = av.replace(/([Dd])e $/, "$1'");
  return { avant: av, valeur: v };
}

/** Accord d'un pronom qui reprend l'acheteur (« {{CLIENT}} peut, s'il le souhaite » pour l'Association → « si elle »). */
const FEMININS_ELIDES = /^(?:association|universit[ée]|agence|[ée]cole|entreprise|administration|autorit[ée]|institution|acad[ée]mie|assembl[ée]e|union|organisation|unit[ée]|[ée]tablissement-?publique|op[ée]ration|h[ôo]tellerie|intercommunalit[ée]|aire|[ée]glise|imprimerie|usine|inspection)$/i;
/** Tête de nom féminine au pluriel (« les Archives départementales », « les Écoles », « Les Halles »), T5-COH-4. */
const TETES_FEMININES_PLURIEL = /^(?:archives|[ée]coles|halles|[ée]curies|r[ée]sidences|maisons|galeries|cliniques|mutuelles|universit[ée]s|villes|communes|soci[ée]t[ée]s|biblioth[èe]ques|m[ée]diath[èe]ques|caisses|chambres|directions|r[ée]gies|fondations|associations|[ée]glises|usines|cit[ée]s|salles|ar[èe]nes|serres|terrasses|piscines|forges|fermes|abbayes|demeures|batteries)$/i;
function femininPluriel(nom: string): boolean {
  const mots = String(nom || '').replace(/^(?:les|la|le|l['’])\s*/i, '').split(/[\s(]+/).filter(Boolean);
  if (TETES_FEMININES_PLURIEL.test(mots[0] || '')) return true;
  // Adjectif accordé au féminin pluriel juste après la tête (« Archives départementales », « Écuries royales »).
  return /^[a-zà-ÿ]{3,}(?:ales|elles|[ée]es|ives|i[èe]res|euses|trices|aises|oises|iennes|ennes)$/.test(mots[1] || '');
}
function genreClient(v?: ValeurVariable): 'f' | 'm' | 'p' | 'fp' | '' {
  if (!v || !variableRenseignee(v)) return '';
  const nomV = String(Array.isArray(v.valeur) ? v.valeur[0] : v.valeur || '');
  if (v.genre) return v.genre === 'p' && femininPluriel(nomV) ? 'fp' : v.genre;
  if (v.article === 'les') return femininPluriel(nomV) ? 'fp' : 'p';
  if (v.article === 'la') return 'f';
  if (v.article === 'le') return 'm';
  // Nom propre qui garde son article de tête (T5G-9 : « La Poste », « La Halle aux Toiles », « Les Docks Vauban ») : genre et
  // nombre de cet article (« Le Havre », « Le Volcan » restent au masculin singulier).
  if (!v.article && /^La\s/.test(nomV)) return 'f';
  if (!v.article && /^Les\s/.test(nomV)) return femininPluriel(nomV) ? 'fp' : 'p';
  const premier = nomV.split(/[\s(]/)[0];
  if (FEMININS_ELIDES.test(premier) || ARTICLES_FEMININS.test(premier)) return 'f';
  return '';
}
/** Verbes du mémoire type dont l'acheteur est le sujet, au pluriel (acheteurs coordonnés : « l'ENPC et l'IGN »). */
const VERBES_PLURIEL: Record<string, string> = { peut: 'peuvent', dispose: 'disposent', appelle: 'appellent', lance: 'lancent', ait: 'aient', est: 'sont', a: 'ont', souhaite: 'souhaitent', confie: 'confient', reçoit: 'reçoivent' };
function accorderPronomsClient(t: string, v?: ValeurVariable): string {
  const g = genreClient(v);
  if (g !== 'f' && g !== 'p' && g !== 'fp') return t;
  // Sujet pluriel : verbe accordé, sauf quand l'acheteur est complément (« le site de {{CLIENT}} reçoit »).
  if (g === 'p' || g === 'fp') {
    t = t.replace(/(^|[^\wÀ-ÿ'’])((?:[\wÀ-ÿ'’]+\s+)?)(\{\{\s*CLIENT\s*\}\}\s+(?:y\s+)?)([a-zç]+)(?![\wÀ-ÿ])/g, (m, a: string, mot: string, c: string, verbe: string) => (
      VERBES_PLURIEL[verbe] && !/^(?:de|d['’]|du|des|à|au|aux|pour|par|avec|sur|chez|entre|vers)\s+$/i.test(mot) ? `${a}${mot}${c}${VERBES_PLURIEL[verbe]}` : m));
    // Pluriel féminin (« les Archives départementales … peuvent, si elles le souhaitent », T5-COH-4).
    t = t.replace(/(\{\{\s*CLIENT\s*\}\}[^.!?\n{]{0,80}?)\bs['’]il le souhaite\b/g, g === 'fp' ? '$1si elles le souhaitent' : "$1s'ils le souhaitent");
  }
  return t.replace(/(\{\{\s*CLIENT\s*\}\}[^.!?\n{]{0,80}?)\bs['’]il(?![\wÀ-ÿ])/g, (_m, a: string) => `${a}${g === 'f' ? 'si elle' : g === 'fp' ? 'si elles' : "s'ils"}`);
}

/** Retire les phrases (ou lignes de liste / de tableau) qui contiennent le repère de retrait. */
function retirerPhrasesMarquees(texte: string): string {
  return texte.split('\n').map((ligne) => {
    if (!ligne.includes(RETIRER)) return ligne;
    if (/^\s*(?:[-*•]|\d+[.)]|\|)/.test(ligne)) return null;
    return ligne.split(/(?<=[.!?])\s+/).filter((ph) => !ph.includes(RETIRER)).join(' ');
  }).filter((l): l is string => l !== null).join('\n');
}

/** Nettoyage typographique après publipostage (espaces, puces vides, tableaux, lignes vides). */
export function nettoyerPubliposte(texte: string): string {
  return contracterArticlesNomsPropres(texte)
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*$/gm, '')
    .replace(/^(\|.*\|)[ \t]*\n(?:[ \t]*\n)+(?=\|)/gm, '$1\n')
    .replace(/([^\s|])[ \t]{2,}(?=\S)/g, '$1 ')
    .replace(/ +([,.)])/g, '$1')
    .replace(/\( *\)/g, '')
    .replace(/,\s*([;.])/g, '$1')
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Verbes du mémoire type accordés au singulier après un effectif de 1 (« 1 agent titulaire, qui assure »). */
const VERBES_SINGULIER: Record<string, string> = { sont: 'est', ont: 'a', interviennent: 'intervient', viennent: 'vient', tiennent: 'tient', peuvent: 'peut', doivent: 'doit' };
/**
 * Effectif publiposté égal à 1 (havre2 : « une équipe de {{EFFECTIF_AGENTS}} agents titulaires, qui assurent… » avec
 * 1 titulaire) : nom, adjectif et verbe de la relative accordés au singulier, sans autre changement du texte de GSS.
 */
export function accorderEffectifUn(texte: string): string {
  return String(texte || '').replace(/(?<![\d,.\u00a0\u202f]|\d[ \u00a0\u202f])\b1 (agent|titulaire|suppl[ée]ant|salari[ée])s\b((?: (?!qui\b)[a-zà-ÿ'’-]+?s\b)?)((?:, qui [a-zà-ÿ]+\b)?)/g, (_m, nom: string, adj: string, rel: string) => {
    const adjectif = adj.replace(/s$/, '');
    const relative = rel.replace(/([a-zà-ÿ]+)$/, (v: string) => VERBES_SINGULIER[v] || (/ent$/.test(v) ? v.replace(/nt$/, '') : v));
    return `1 ${nom}${adjectif}${relative}`;
  });
}

/**
 * Publipostage déterministe d'un texte de référence : sections conditionnelles, puis variables. Une variable
 * inconnue ou sans valeur suit sa règle « si_absente » ; aucun {{…}} ne reste dans le résultat.
 */
export function publiposter(texte: string, variables: Variables, options: OptionsPubliposte = {}): ResultatPubliposte {
  const defs = options.definitions || {};
  const indicateurs = options.indicateurs || {};
  const trace = !!options.trace;
  const marquer = !!options.marquerConsultations && !trace;
  const manquantes: ResultatPubliposte['manquantes'] = [];
  /** Enregistre une question ; renvoie la sentinelle à placer après le repère (si les consultations sont marquées). */
  const manque = (variable: string, question: string, repere: boolean): string => {
    let i = manquantes.findIndex((x) => x.variable === variable);
    if (i < 0) { manquantes.push({ variable, question, repere }); i = manquantes.length - 1; } else if (repere) manquantes[i].repere = true;
    return marquer && repere ? SENTINELLE(i) : '';
  };
  const aConfirmer: ResultatPubliposte['aConfirmer'] = [];
  const utilisees = new Set<string>();
  // Pronoms accordés sur la forme réellement imprimée (forme courte d'un nom d'usage : son propre genre).
  const client = variables.CLIENT;
  const clientImprime = client && !options.clientLong && client.court && client.genreCourt !== undefined
    ? { ...client, valeur: client.court, article: client.articleCourt ?? '', genre: client.genreCourt || undefined } : client;
  const t = trace ? resoudreSections(String(texte || ''), indicateurs, variables, trace) : accorderPronomsClient(resoudreSections(String(texte || ''), indicateurs, variables, trace), clientImprime);
  let sortie = '';
  let dernier = 0;
  for (const m of t.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) {
    sortie += t.slice(dernier, m.index);
    dernier = (m.index || 0) + m[0].length;
    const nom = m[1];
    const def = defs[nom];
    const v = variables[nom];
    utilisees.add(nom);
    if (trace) {
      // Squelette (tests) : le nom seul, sans valeur ni accord de préposition, que la valeur soit connue ou non.
      sortie += `‹${nom}›`;
      continue;
    }
    if (v && variableRenseignee(v) && typeof v.valeur !== 'boolean') {
      if (def?.type === 'client' || nom === 'CLIENT') {
        const r = insererClient(sortie, !options.clientLong && v.court ? { ...v, valeur: v.court, article: v.articleCourt ?? '', hMuet: v.hMuetCourt } : v);
        sortie = r.sortie + r.insere;
      } else {
        const a = accorderValeur(nom, valeurAffichee(nom, v, def), sortie, t.slice(dernier, dernier + 40));
        sortie = a.avant + a.valeur;
      }
      if (v.aConfirmer && !aConfirmer.some((x) => x.variable === nom)) aConfirmer.push({ variable: nom, valeur: valeurAffichee(nom, v, def), question: v.aConfirmer });
      // Valeur qui contient elle-même des repères (lignes du tableau de l'équipe dédiée) : une question pour la valeur.
      if (v.question && String(v.valeur).includes(A_COMPLETER)) sortie += manque(nom, v.question, true);
      continue;
    }
    const regle: SiAbsente = def?.si_absente || 'a_completer';
    const question = v?.question || def?.question || `Quelle valeur faut-il indiquer pour : ${(def?.description || nom).replace(/[.\s]+$/, '')} ?`;
    if (regle === 'repli' && def?.repli) {
      const repli: ValeurVariable = { valeur: def.repli, article: '' };
      if (def.type === 'client' || nom === 'CLIENT') {
        const r = insererClient(sortie, repli);
        sortie = r.sortie + r.insere;
      } else sortie += def.repli;
      if (def.question) manque(nom, def.question, false);
    } else if (regle === 'retirer_phrase') {
      sortie += RETIRER;
    } else if (regle === 'vide') {
      // rien
    } else {
      sortie += A_COMPLETER + manque(nom, question, true);
    }
  }
  sortie += t.slice(dernier);
  // Passage retiré faute de valeur (ex. délai hors Normandie) : la question prévue pour la variable est posée à GSS.
  if (!trace) {
    for (const m of String(texte || '').matchAll(/\{\{#si\s+([^}]+?)\s*\}\}/g)) {
      for (const nom of nomsExpression(m[1])) {
        const v = variables[nom];
        if (!(nom in indicateurs) && v && !variableRenseignee(v) && v.question && !manquantes.some((x) => x.variable === nom)) manque(nom, v.question, false);
      }
    }
  }
  let resultat = accorderEffectifUn(nettoyerPubliposte(retirerPhrasesMarquees(sortie)));
  // Garde-fou : aucune variable ni section ne doit rester.
  if (/\{\{|\}\}/.test(resultat)) {
    resultat = resultat.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_x, nom: string) => A_COMPLETER + manque(nom, `Valeur à fournir : ${nom}.`, true))
      .replace(/\{\{[^}]*\}\}|\{\{|\}\}/g, '');
  }
  if (marquer) {
    // Chaque paragraphe (ou tableau) reçoit, à sa suite, les questions de ses repères.
    resultat = resultat.split(/\n{2,}/).map((bloc) => {
      const ids = [...new Set([...bloc.matchAll(/\u0001(\d+)\u0001/g)].map((m) => Number(m[1])))];
      const propre = bloc.replace(/\u0001\d+\u0001/g, '');
      return ids.length ? `${propre}\n${ids.map((i) => `[CONSULTATION REQUISE : ${manquantes[i].question}]`).join('\n')}` : propre;
    }).join('\n\n');
  }
  return { texte: resultat, manquantes, aConfirmer, variablesUtilisees: [...utilisees] };
}

// ─── Sous-parties ────────────────────────────────────────────────────────────────────────────────

export interface MorceauSousPartie {
  titre: string | null;
  texte: string;
  mots: number;
}

const compterMots = (t: string) => (String(t || '').match(/[\wÀ-ÿ'’-]+/g) || []).length;

/** Découpe un texte en sous-parties (titre en gras seul sur sa ligne, ou titre Markdown). L'introduction a titre null. */
export function decouperSousParties(texte: string): MorceauSousPartie[] {
  const lignes = String(texte || '').split('\n');
  const morceaux: MorceauSousPartie[] = [];
  let courant: { titre: string | null; lignes: string[] } = { titre: null, lignes: [] };
  for (const l of lignes) {
    const m = /^\s*(?:\*\*(.+?)\*\*|#{2,4}\s+(.+?))\s*$/.exec(l);
    if (m) {
      if (courant.titre !== null || courant.lignes.some((x) => x.trim())) morceaux.push({ titre: courant.titre, texte: courant.lignes.join('\n').trim(), mots: 0 });
      courant = { titre: (m[1] || m[2]).trim(), lignes: [l] };
    } else courant.lignes.push(l);
  }
  morceaux.push({ titre: courant.titre, texte: courant.lignes.join('\n').trim(), mots: 0 });
  return morceaux.filter((x) => x.texte).map((x) => ({ ...x, mots: compterMots(x.texte) }));
}

/**
 * Sous-parties liées à un indicateur vrai en premier (dans l'ordre de `ordreIndicateurs` s'il est donné, sinon dans
 * l'ordre du texte), l'introduction restant en tête ; les autres gardent leur ordre.
 */
export function reordonnerSousParties(texte: string, sousParties: SousPartie[], indicateurs: Record<string, boolean>, ordreIndicateurs: string[] = []): string {
  const morceaux = decouperSousParties(texte);
  const indicateurDe = (m: MorceauSousPartie) => (m.titre === null ? undefined : sousParties.find((s) => normaliser(s.titre) === normaliser(m.titre!))?.indicateur);
  const prioritaire = (m: MorceauSousPartie) => { const i = indicateurDe(m); return !!(i && indicateurs[i]); };
  const rang = (m: MorceauSousPartie) => { const k = ordreIndicateurs.indexOf(indicateurDe(m) || ''); return k < 0 ? ordreIndicateurs.length : k; };
  const intro = morceaux.filter((m) => m.titre === null);
  const reste = morceaux.filter((m) => m.titre !== null);
  const enTete = reste.filter(prioritaire).map((m, i) => ({ m, i })).sort((a, b) => rang(a.m) - rang(b.m) || a.i - b.i).map((x) => x.m);
  return [...intro, ...enTete, ...reste.filter((m) => !prioritaire(m))].map((m) => m.texte).join('\n\n');
}

// ─── Publication des rubriques et des schémas ────────────────────────────────────────────────────

export interface SchemaPublie {
  source: SchemaRubrique['source'];
  ref?: string;
  gabarit?: string;
  titre?: string;
  params?: any;
  origine?: string;
  /** Schéma « bibliothèque » à corriger avant usage, ou spécification incomplète. */
  remarque?: string;
  alternative?: SchemaRubrique & { a_corriger?: string };
  etapes?: any[];
}

export interface RubriquePubliee {
  id: string;
  bloc: string;
  cle: string;
  titre: string;
  mode: ModeRubrique;
  priorite: number;
  /** Texte publiposté (null pour la rubrique « besoin », rédigée depuis le CCTP). */
  texte: string | null;
  manquantes: ResultatPubliposte['manquantes'];
  aConfirmer: ResultatPubliposte['aConfirmer'];
  schema: SchemaPublie | null;
  /** Rubrique « besoin » : première phrase du contexte, publipostée (amorce de la rédaction). */
  trame?: string;
  ancienne_rubrique: string | null;
}

/**
 * Publipostage d'une spécification de schéma : variables remplacées ; un élément de liste portant « si » faux, ou
 * dont une variable est inconnue, est retiré ; une autre chaîne avec une variable inconnue rend le schéma
 * inutilisable (renvoie null : l'appelant passe au secours).
 */
export function publierSchema(spec: SchemaRubrique, variables: Variables, indicateurs: Record<string, boolean>, definitions: Record<string, VariableMemoireType> = {}): SchemaPublie | null {
  if (spec.source !== 'spec') return { ...spec };
  const RETRAIT = Symbol('retrait');
  const chaine = (s: string): string | typeof RETRAIT => {
    let manque = false;
    const t = s.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_x, nom: string) => {
      const v = variables[nom];
      if (!v || !variableRenseignee(v)) { manque = true; return ''; }
      return valeurAffichee(nom, v, definitions[nom]);
    });
    return manque ? RETRAIT : t;
  };
  // Un retrait remonte jusqu'à l'élément de liste le plus proche, qui disparaît ; hors de toute liste, le schéma
  // entier est inutilisable.
  const visiter = (o: any): any => {
    if (typeof o === 'string') return chaine(o);
    if (Array.isArray(o)) return o.map(visiter).filter((x) => x !== RETRAIT);
    if (o && typeof o === 'object') {
      if (typeof o.si === 'string' && !evaluerCondition(o.si, indicateurs, variables)) return RETRAIT;
      const r: any = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === 'si') continue;
        const x = visiter(v);
        if (x === RETRAIT) return RETRAIT;
        r[k] = x;
      }
      return r;
    }
    return o;
  };
  const params = visiter(spec.params);
  const titre = spec.titre ? chaine(spec.titre) : undefined;
  if (params === RETRAIT || !params) return null;
  return { source: 'spec', gabarit: spec.gabarit, titre: titre === RETRAIT ? undefined : titre, params, origine: spec.origine };
}

/**
 * Valeurs affichées des variables écrites dans les schémas « spec » du mémoire type (« {{EFFECTIF_AGENTS}} » → « 9 ») :
 * gardées dans l'état du dossier pour redessiner un schéma quand GSS change ces valeurs après la génération (T10N-2 :
 * effectifs de l'équipe dédiée changés par la saisie ou l'assistant, schéma resté à l'ancien nombre).
 */
export function variablesDesSchemas(mt: MemoireType, variables: Variables): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of mt.rubriques) {
    if (r.schema?.source !== 'spec') continue;
    for (const m of JSON.stringify(r.schema).matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) {
      const v = variables[m[1]];
      if (v && variableRenseignee(v)) out[m[1]] = valeurAffichee(m[1], v, mt.variables[m[1]]);
    }
  }
  return out;
}

/** Variables écrites dans le schéma « spec » d'une rubrique (vide si la rubrique n'a pas de schéma « spec »). */
export function variablesDuSchema(mt: MemoireType, id: string): string[] {
  const r = mt.rubriques.find((x) => x.id === id);
  if (r?.schema?.source !== 'spec') return [];
  return [...new Set([...JSON.stringify(r.schema).matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}|"si"\s*:\s*"!?([A-Z0-9_]+)"/g)].map((m) => m[1] || m[2]))];
}

/** Schéma « spec » d'une rubrique publié de nouveau avec les valeurs gardées dans l'état (T10N-2). */
export function republierSchemaSpec(mt: MemoireType, id: string, valeurs: Record<string, string>, indicateurs: Record<string, boolean>): SchemaPublie | null {
  const r = mt.rubriques.find((x) => x.id === id);
  if (!r?.schema || r.schema.source !== 'spec') return null;
  const variables: Variables = Object.fromEntries(Object.entries(valeurs).map(([k, v]) => [k, { valeur: v, source: 'état du dossier' }]));
  return publierSchema(r.schema, variables, indicateurs, {});
}

/** Publie une rubrique : publipostage du texte, ordre des sous-parties, schéma. */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Échéances écrites en dur dans le texte de GSS et dépassées à la date de génération (T6-COH-6) : la validité de
 * l'attestation d'assurance (« (attestation valable du 21 septembre 2026 au 16 mars 2027) ») n'est plus imprimée après
 * sa fin, et l'échéance de la certification (« ISO 9001 en cours, prévue fin 2026 ») après l'année annoncée ; chaque fois,
 * une question exacte est posée à GSS. Avant l'échéance, le texte est inchangé.
 */
export function echeancesDepassees(texte: string, date: Date = new Date()): { texte: string; questions: string[] } {
  const questions: string[] = [];
  let t = String(texte || '');
  t = t.replace(/\s*\(attestation valable du \d{1,2}(?:er)? [a-zéû]+ \d{4} au (\d{1,2})(?:er)? ([a-zéû]+) (\d{4})\)/giu, (m, j: string, mois: string, an: string) => {
    const k = MOIS_FR.indexOf(mois.toLowerCase());
    if (k < 0) return m;
    const fin = new Date(Number(an), k, Number(j), 23, 59, 59);
    if (date <= fin) return m;
    const contrat = (/contrat ([A-Z]{2,}[\s-]?[A-Z0-9]+)/.exec(t) || [])[1];
    const assureur = (/responsabilit[ée] civile\s*:\s*([A-Z][\p{L}-]+)/u.exec(t) || [])[1];
    questions.push(`L'attestation d'assurance responsabilité civile${assureur ? ` ${assureur}` : ''}${contrat ? ` (contrat ${contrat})` : ''} a expiré le ${j} ${mois} ${an} : pouvez-vous joindre la nouvelle attestation (dates de validité et montants) ?`);
    return '';
  });
  t = t.replace(/(certification ISO 9001[^.;\n]{0,40}?en cours)\s*(?:,|;)\s*(?:la certification est )?prévue (?:pour )?fin (\d{4})/gi, (m, debut: string, an: string) => {
    if (date.getFullYear() <= Number(an)) return m;
    const q = `La certification ISO 9001 était prévue fin ${an} : est-elle obtenue (date de certification) ou toujours en cours (nouvelle échéance) ?`;
    if (!questions.includes(q)) questions.push(q);
    return debut;
  });
  return { texte: t, questions };
}

export function publierRubrique(mt: MemoireType, rubrique: RubriqueMemoireType, variables: Variables, indicateurs: Record<string, boolean>, cle = '', options: { marquerConsultations?: boolean; date?: Date } = {}): RubriquePubliee {
  const base = {
    id: rubrique.id, bloc: rubrique.bloc, cle, titre: rubrique.titre, mode: rubrique.mode, priorite: rubrique.priorite,
    ancienne_rubrique: rubrique.ancienne_rubrique,
  };
  if (rubrique.mode === 'besoin' || !rubrique.texte) {
    const trameBrute = rubrique.specification?.sous_parties?.[0]?.trame_publipostage;
    const trame = trameBrute ? publiposter(trameBrute, variables, { definitions: mt.variables, indicateurs, clientLong: true }) : null;
    return {
      ...base, texte: null, manquantes: [], aConfirmer: [],
      schema: rubrique.schema ? { ...rubrique.schema } : null,
      ...(trame ? { trame: trame.texte } : {}),
    };
  }
  const r = publiposter(rubrique.texte, variables, { definitions: mt.variables, indicateurs, marquerConsultations: options.marquerConsultations });
  let texte = r.texte;
  if (rubrique.ordre_sous_parties === 'indicateurs') texte = reordonnerSousParties(texte, rubrique.sous_parties, indicateurs, rubrique.ordre_indicateurs);
  const echeances = echeancesDepassees(texte, options.date);
  texte = echeances.texte;
  let schema: SchemaPublie | null = null;
  if (rubrique.schema) {
    schema = rubrique.schema.source === 'spec'
      ? publierSchema(rubrique.schema, variables, indicateurs, mt.variables)
      : { ...rubrique.schema };
    if (!schema && rubrique.schema.alternative) schema = { ...rubrique.schema.alternative };
  }
  // Points « à confirmer » de la rubrique (choix de reprise, valeurs anciennes ou divergentes entre sources) : posés
  // à GSS avec ceux des variables (consultations, premier message de l'assistant).
  const titreRubrique = rubrique.titre.replace(/\{\{[^}]*\}\}/g, '').replace(/\s*:\s*$/, '').trim();
  const aConfirmer = [...r.aConfirmer, ...echeances.questions.map((question) => ({ variable: `echeance:${rubrique.id}`, valeur: '', question }))];
  for (const q of rubrique.a_confirmer || []) {
    if (q && q.trim()) aConfirmer.push({ variable: `rubrique:${rubrique.id}`, valeur: '', question: `« ${titreRubrique} » : ${/\?/.test(q) ? q.trim() : `confirmez-vous ce point : « ${q.trim().replace(/[.\s]+$/, '')} » ?`}` });
  }
  return { ...base, texte, manquantes: r.manquantes, aConfirmer, schema };
}

export interface MemoirePrepare {
  mt: MemoireType;
  etatsIndicateurs: Record<string, EtatIndicateur>;
  indicateurs: Record<string, boolean>;
  plan: PlanMemoireType;
  variables: Variables;
}

/** Indicateurs, plan et variables d'un marché, en une fois. */
/**
 * Contexte réduit au lot du mémoire (T3G-5) : DCE privé des passages des autres lots et analyse réduite à ce lot, quand le DCE a
 * plusieurs lots et que le mémoire n'en vise qu'un (perimetreDuLot) ; toutes les lectures sans modèle (sites, horaires,
 * obligations, délais, fréquences, indicateurs) se font alors sur ce lot. Le contexte tel quel sinon.
 */
export function contexteDuLot(ctx: ContexteMarche): ContexteMarche {
  const r = perimetreDuLot(ctx.analyse, ctx.dce || '');
  return r ? { ...ctx, dce: r.dce, analyse: r.analyse } : ctx;
}

export function preparerMemoireType(ctxComplet: ContexteMarche, options: OptionsPlan & { memoireType?: MemoireType } = {}): MemoirePrepare {
  const ctx = contexteDuLot(ctxComplet);
  const mt = options.memoireType || chargerMemoireType();
  const etatsIndicateurs = evaluerIndicateurs(mt, ctx);
  const indicateurs = valeursIndicateurs(etatsIndicateurs);
  const plan = planMemoireType(mt, indicateurs, { ...options, secteurClient: options.secteurClient ?? valeurPropre(ctx.analyse?.clientSector) });
  const variables = variablesDuMarche(mt, ctx, indicateurs, plan);
  return { mt, etatsIndicateurs, indicateurs, plan, variables };
}

/** Publie toutes les rubriques retenues, dans l'ordre du plan. */
export function publierMemoire(prep: MemoirePrepare, options: { marquerConsultations?: boolean; date?: Date } = {}): RubriquePubliee[] {
  return prep.plan.rubriques.map((rp) => {
    const r = prep.mt.rubriques.find((x) => x.id === rp.id)!;
    return publierRubrique(prep.mt, r, prep.variables, prep.indicateurs, rp.cle, options);
  });
}

/** Données du DCE pour la rédaction de la rubrique « besoin » (compréhension), calculées sans modèle. */
export interface DonneesBesoin {
  /** Acheteur avec son article (« le Centre Henri Becquerel »), ou « votre établissement ». */
  client: string;
  objet: string;
  lots: string;
  duree: string;
  sites: string[];
  villes: string[];
  /** Commune de chaque site, lue dans le DCE (code postal écrit après le nom du site) : « Hôpital Nord » → « Marseille ». */
  communesDesSites?: Record<string, string>;
  secteur: string;
  /** Horaires imposés par le CCTP (phrases citées). */
  horaires: string[];
  /** Obligations chiffrées du CCTP (phrases citées). */
  obligations: string[];
  qualifications: string[];
  enjeux: string[];
  /** Prestations prévues au marché, d'après les indicateurs. */
  prestations: string[];
  horsNormandie: boolean;
  /** Première phrase du contexte, publipostée. */
  amorce: string;
}

/**
 * Commune de chaque site (T10-COH-5) : la commune écrite avec son code postal juste après le nom du site dans le DCE
 * (« l'Hôpital Nord, 15 chemin des Bourrely, 13015 Marseille »), au plus 160 caractères plus loin, avant le nom d'un autre site.
 * Un site dont la commune n'est pas rattachée est absent du résultat.
 */
export function communesDesSites(dce: string, sites: string[], villes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const plat = normaliser(String(dce || '')).replace(/\s+/g, ' ');
  const cle = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nomsSites = sites.map((x) => ({ x, c: cle(x) })).filter((x) => x.c.length >= 4);
  for (const site of nomsSites) {
    for (const m of plat.matchAll(new RegExp(site.c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[^a-z0-9]+'), 'g'))) {
      let suite = plat.slice(m.index! + m[0].length, m.index! + m[0].length + 160);
      // Jamais au-delà du nom d'un autre site.
      for (const autre of nomsSites) if (autre !== site) { const k = suite.indexOf(autre.c.split(' ').slice(0, 2).join(' ')); if (k >= 0) suite = suite.slice(0, k); }
      const ville = villes.find((v) => new RegExp(`\\b\\d{5}\\s*[-–]?\\s*${cle(v).replace(/ /g, '[^a-z0-9]+')}(?![a-z])`).test(suite));
      if (ville) { out[site.x] = ville; break; }
    }
  }
  return out;
}

export function donneesBesoin(prep: MemoirePrepare, ctxComplet: ContexteMarche): DonneesBesoin {
  const ctx = contexteDuLot(ctxComplet);
  const v = prep.variables;
  const texte = (n: string) => (variableRenseignee(v[n]) ? valeurAffichee(n, v[n], prep.mt.variables[n]) : '');
  const liste = (n: string) => (Array.isArray(v[n]?.valeur) ? (v[n].valeur as string[]).filter(Boolean) : texte(n) ? [texte(n)] : []);
  const ind = prep.indicateurs;
  const prestations = [
    ind.RONDES && 'rondes', ind.VACATIONS_NUIT && 'vacations de nuit', ind.AGENT_ISOLE && 'travail isolé (PTI)',
    ind.TELESURVEILLANCE && 'télésurveillance et interventions sur alarme', ind.FILTRAGE && 'filtrage et contrôle des accès',
    ind.PRESTATIONS_PONCTUELLES && 'prestations ponctuelles sur bon de commande', ind.EVENEMENTIEL && 'événementiel',
    ind.REPRISE_PERSONNEL && 'reprise du personnel en place',
  ].filter((x): x is string => !!x);
  const b1 = prep.mt.rubriques.find((r) => r.mode === 'besoin');
  const trame = b1?.specification?.sous_parties?.[0]?.trame_publipostage;
  // Rédaction : l'acheteur sous sa forme courte (« l'ENPC et l'IGN ») ; la forme longue est dans l'amorce.
  const art = v.CLIENT?.court ? v.CLIENT.articleCourt || '' : v.CLIENT?.article || '';
  const nomClient = variableRenseignee(v.CLIENT) ? v.CLIENT.court || texte('CLIENT') : '';
  const client = nomClient ? (art ? (art.endsWith("'") ? `${art}${nomClient}` : `${art} ${nomClient}`) : nomClient) : (prep.mt.variables.CLIENT?.repli || '');
  return {
    client,
    objet: texte('OBJET_MARCHE'), lots: texte('LOTS'), duree: texte('DUREE_MARCHE'), sites: liste('SITE'), villes: liste('VILLE'),
    communesDesSites: communesDesSites(ctx.dce || '', liste('SITE'), liste('VILLE')),
    secteur: texte('SECTEUR_CLIENT'),
    // Période de l'année gardée devant ses horaires (« Du 1er avril au 30 septembre : … », T8CS-1) ; 20 au plus, une
    // période dont la liste dépasse ce maximum n'est pas citée à moitié.
    horaires: horairesImposes(ctx.dce || '', 20, undefined, { periodes: true }),
    obligations: obligationsChiffrees(ctx.dce || '').slice(0, 25).map((o) => o.phrase),
    qualifications: liste('QUALIFICATIONS_REQUISES'),
    enjeux: (Array.isArray(ctx.analyse?.keyRisks) ? ctx.analyse.keyRisks : []).map((x: unknown) => textePropre(x)).filter(Boolean).slice(0, 5),
    prestations,
    horsNormandie: !!ind.HORS_NORMANDIE,
    amorce: trame ? publiposter(trame, v, { definitions: prep.mt.variables, indicateurs: ind, clientLong: true }).texte : '',
  };
}

/** Questions à GSS issues du publipostage (valeurs manquantes, puis valeurs à confirmer), sans doublon. */
export function questionsDuPubliposte(rubriques: RubriquePubliee[]): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const r of rubriques) {
    for (const q of [...r.manquantes.map((x) => x.question), ...r.aConfirmer.map((x) => x.question)]) {
      for (const morceau of q.split('\n')) {
        const k = normaliser(morceau);
        if (morceau && !vues.has(k)) { vues.add(k); out.push(morceau); }
      }
    }
  }
  return out;
}


// ─── Exigences, recherche de rubriques, correspondance v1 ────────────────────────────────────────

/** Copie de PIECES_OFFRE (memoire_generator.ts) : exigence sur la composition de l'offre, pas sur la prestation. */
const PIECES_OFFRE = /acte d.engagement|bordereau de prix|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?|interdictions? de soumissionner|\bL\.?\s?(?:21[34]\d|52\d\d)-\d|\b(?:DC[124]|DUME)\b|(?:attestations?|d[ée]clarations?) sur l.honneur|obligations? (?:sociales et fiscales|fiscales et sociales)|obligations? relatives? [àa] l.emploi des travailleurs handicap/i;

/** Score lexical d'une rubrique pour un texte (mots-clés et titre). */
/** Mots d'une expression ramenés au singulier (« rondes techniques » → « ronde technique »), pour une recherche par début de mot. */
function singulierMots(k: string): string {
  return k.split(' ').map((w) => (w.length >= 5 ? w.replace(/(?<=[a-z]{3}[^aeiou\s]?[a-z])[sx]$/, '') : w)).join(' ');
}

function scoreRubrique(r: RubriqueMemoireType, texte: string): number {
  const net = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const t = ` ${net(texte)} `;
  let s = 0;
  for (const mot of r.mots_cles) {
    const k = net(mot);
    if (k && t.includes(` ${k}`)) s += k.includes(' ') ? 2 : 1;
  }
  const titre = net(r.titre).split(' ').filter((w) => w.length >= 6);
  for (const w of titre) if (t.includes(` ${w}`)) s += 0.5;
  return s;
}

/** Rubriques du mémoire type les plus proches d'une question ou d'une exigence (recherche lexicale). */
export function rechercherRubriques(mt: MemoireType, texte: string, n = 2, parmi?: string[]): Array<{ id: string; score: number }> {
  return mt.rubriques.filter((r) => r.mode !== 'besoin' && (!parmi || parmi.includes(r.id)))
    .map((r) => ({ id: r.id, score: scoreRubrique(r, texte) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** Sujets d'une exigence que les rubriques de présentation de GSS (bloc « presentation » : catalogue, identité, valeurs,
 *  écologie, références) peuvent porter ; une exigence d'exécution (rondes, ouverture, remplacement…) n'y est jamais
 *  ajoutée (génération réelle cstb 221 : 7 engagements sur les rondes dans « Notre catalogue de prestations »). */
/**
 * Rubriques de présentation pure du bloc 2 (T1-CONS-7 : « aucune personne non autorisée dans les locaux, trajet vers le
 * réfectoire et les vestiaires, vestiaires jamais utilisés comme salle de pause » rangé sous « Nos valeurs ») : seules les
 * exigences de leur sujet propre y sont rattachées.
 */
const SUJET_PRESENTATION_PURE: Array<[RegExp, RegExp]> = [
  [/^b2_valeurs$/, /valeurs|[ée]thique|d[ée]ontolog|charte/i],
  [/^b2_identite$/, /cnaps|agr[ée]ment|autorisation (?:d.exercer|pr[ée]fectorale|administrative)|carte professionnelle|assurance|responsabilit[ée] civile|kbis|attestation|chiffre d.affaires|certifi|\biso\b|statuts?|capital/i],
  [/^b2_(?:references_intro|ref_[a-z_]+)$/, /r[ée]f[ée]rences?\b|exp[ée]rience|march[ée]s? similaires/i],
  [/^b2_organigramme$/, /organigramme/i],
  [/^b2_implantation$/, /implantation|agences?\b|si[èe]ge|proximit/i],
];
export function rubriqueAdmetSujet(id: string, texte: string): boolean {
  const regle = SUJET_PRESENTATION_PURE.find(([rx]) => rx.test(id));
  return !regle || regle[1].test(String(texte || ''));
}

const SUJET_PRESENTATION = /autorisation (?:d.exercer|pr[ée]fectorale|administrative)|agr[ée]ment|cnaps|carte professionnelle|certifi|\biso\b|\brse\b|responsabilit[ée] soci|environnement|[ée]cologi|d[ée]veloppement durable|carbone|d[ée]chets|recycl|r[ée]f[ée]rences?\b|exp[ée]rience|chiffre d.affaires|assurance|responsabilit[ée] civile|implantation|agences?\b|si[èe]ge social|organigramme|valeurs|[ée]thique|d[ée]ontolog|insertion|handicap|[ée]galit[ée]|kbis|attestation/i;

/**
 * Durées d'intervention écrites dans un texte, en minutes : « immédiat » et « sans délai » = 0, « dans l'heure » = 60,
 * « 45 minutes », « 1 h », « UNE (1) heure », « deux heures ». Les valeurs qui ne sont pas un délai d'intervention ne
 * comptent pas (caen 475, T6-COH-1) : préavis (« au moins 24 heures avant », « 10 minutes avant le début », « à
 * l'avance »), fréquences (« toutes les 24 heures »), « 24 h/24 », durées d'une vacation ou d'une ronde (« ronde de
 * 30 minutes », « au-delà d'une heure »).
 */
export function dureesIntervention(texte: string): number[] {
  const t = String(texte || '').replace(/[’`]/g, "'");
  const out: number[] = [];
  if (/imm[ée]diat|sans d[ée]lai/i.test(t)) out.push(0);
  if (/dans l'heure|en moins d'une heure|sous une heure/i.test(t)) out.push(60);
  const rx = /(?<![\p{L}\d,.])(\d{1,3}|une?|deux|trois|quatre|cinq|six|huit|dix|douze|quinze|vingt|trente|quarante-cinq|quarante|soixante)\s*(?:\(\s*(\d{1,3})\s*\)\s*)?(minutes?|mn|min|heures?|h)(?![\p{L}\d/])/giu;
  for (const m of t.matchAll(rx)) {
    const avant = t.slice(Math.max(0, m.index! - 30), m.index!);
    const apres = t.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    if (/(?:toutes|tous) les\s*$|chaque\s*$|(?:ronde|vacation|poste|pr[ée]sence|dur[ée]e)s?(?: [a-zà-ÿ'-]+){0,2} (?:de |d'une |d'un )?$|au-del[àa] d'(?:une?\s*)?$|par (?:jour|nuit)\s*$/i.test(avant)) continue;
    if (/^\s*(?:au moins\s+)?(?:avant|[àa] l'avance|plus t[ôo]t)|^\s*\/\s*24|^\s*(?:par|sur) (?:jour|semaine|mois|an)|^\s*(?:de (?:pr[ée]avis|pr[ée]venance))/i.test(apres)) continue;
    if (/au moins\s*$/i.test(avant) && /^\s*[^.;]{0,40}\bavant\b/i.test(apres)) continue;
    const n = m[2] ? Number(m[2]) : (/^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES_LETTRES[m[1].toLowerCase()]);
    if (!n) continue;
    out.push(/^h/i.test(m[3]) ? n * 60 : n);
  }
  return out;
}

/**
 * Ajout de l'adaptation qui promet, sur un sujet de délai (remplacement d'un agent, intervention sur alarme, PTI, commande,
 * SSI), un délai PLUS COURT que celui de GSS écrit dans le mémoire (becquerel 591, T5N-5 : « remplacement immédiat d'un
 * agent absent » ajouté alors que l'agent d'astreinte « est sur site en 60 minutes maximum ») : renvoie la phrase de GSS
 * contredite, '' sinon. Un délai égal ou plus long que celui de GSS (« dans l'heure » face à « 60 minutes », caen 475,
 * T6-COH-1) n'est pas contraire ; les préavis et les fréquences ne sont pas des délais (dureesIntervention).
 */
export function ajoutContraireAuxDelaisGss(ajout: string, texteGss: string): string {
  const a = String(ajout || '');
  const valeursA = dureesIntervention(a);
  if (!valeursA.length) return '';
  const minA = Math.min(...valeursA);
  const phrasesGss = String(texteGss || '').replace(/\*\*/g, '').split(/(?<=[.!?;])\s+|\n+/);
  for (const [nom, def] of Object.entries(SUJETS_DELAI)) {
    const dansSujet = (t: string) => def.sujet.test(t) && !def.exclure?.test(t) && !(def.objet?.test(t) && !def.personnel?.test(t));
    if (!dansSujet(a)) continue;
    // Remplacement d'un agent : la phrase de GSS parle de l'agent d'astreinte mobilisé (« qui est sur site en 60 minutes »).
    const sujetGss = (t: string) => dansSujet(t) || (nom === 'remplacement' && /agent d['’]astreinte/i.test(t));
    for (const ph of phrasesGss) {
      if (!sujetGss(ph) || ph.includes(a.trim())) continue;
      const valeursG = dureesIntervention(ph);
      if (!valeursG.length) continue;
      if (minA < Math.min(...valeursG)) return ph.trim();
    }
  }
  return '';
}

/** Thèmes nets d'une exigence du CCTP et rubriques de GSS qui les traitent, par ordre de préférence (T5CP-7). */
const THEMES_EXIGENCE: Array<{ sujet: RegExp; rubriques: string[] }> = [
  { sujet: /(?<![\p{L}])assurances?(?![\p{L}])|responsabilit[ée] civile|garantissant (?:la )?responsabilit/iu, rubriques: ['b2_identite'] },
  { sujet: /(?<![\p{L}])(?:alcool|tabac|fumer|radios?|baladeurs?)(?![\p{L}])|t[ée]l[ée]phones? (?:portables? )?personnels?|tenue correcte|comportement des (?:agents|intervenants)|courtoisie|politesse/iu, rubriques: ['b4_lmc', 'b5_controle_technique', 'b5_controle_trois_niveaux'] },
  { sujet: /(?<![\p{L}])cong[ée]s(?![\p{L}])|en nombre suffisant|remplacements? des (?:agents|intervenants|personnels)/iu, rubriques: ['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b3_adequation'] },
  { sujet: /rondes? d['’]ouverture|rondes? de fermeture/i, rubriques: ['b4_rondes', 'b4_planification'] },
  // Plan de prévention (hygiène et sécurité) à remettre après la notification : un livrable du démarrage du marché, jamais
  // la planification des agents (caen 475, T6C-9).
  { sujet: /plan de pr[ée]vention|(?<![\p{L}])PPSPS(?![\p{L}])|hygi[èe]ne et (?:de )?s[ée]curit[ée]|organismes? d.hygi[èe]ne/iu, rubriques: ['b5_nouveau_marche'] },
  // Réunions et rencontres de suivi du contrat, point intermédiaire, comité de pilotage : « Les réunions de suivi » (T2-CONS-13 :
  // le point intermédiaire à mi-année du CSTB écrit aussi sous « Le contrôleur de rondes » et « L'équipe de contrôle »).
  { sujet: /r[ée]unions? de suivi|rencontres? (?:annuelles?|trimestrielles?|mensuelles?|semestrielles?|de suivi|p[ée]riodiques?)|point interm[ée]diaire|comit[ée]s? de (?:pilotage|suivi)/iu, rubriques: ['b5_reunions_indicateurs'] },
  // Confidentialité des informations du site (becquerel 1401, T4N-6 : « L'ensemble du personnel maintient confidentielles les
  // données médicales… » ajouté sous « La reprise du personnel en place ») : les consignes du site, le livre des missions et
  // consignes.
  { sujet: /confidenti|secret professionnel|(?:ne|jamais)\s+(?:divulgu|communiqu)\w*/iu, rubriques: ['b4_lmc'] },
  // Délai d'intervention sur une alarme (citedia 1461, T4-CONS-13 : « Alarme technique : intervenir en 30 minutes maximum, sauf
  // bouton anti-agression en 15 minutes… (HO/BE) » sous « Habilitation électrique, SST et PSC1 ») : la procédure d'intervention
  // sur alarme, jamais une rubrique de formation rattachée sur un mot secondaire.
  // (aussi « présent(e) sur (le) site / sur place dans un délai de 30 minutes … d'une alarme », « se présenter », « délai de
  // présence » : caen 1501, T5-CONS-7, imprimé sous « Le remplacement d'un agent absent »)
  { sujet: /\b(?:alarmes?|t[ée]l[ée]surveillance|lev[ée]e de doute|bouton anti-agression)\b[^.]{0,160}\b(?:intervenir|intervention|se rendre|arriv[ée]e|pr[ée]sente?s?\s+sur\s+(?:le\s+|chaque\s+)?(?:site|place|les lieux)|sur place|se pr[ée]senter|d[ée]lai de pr[ée]sence)\b[^.]{0,60}\b\d+\s*(?:minutes?|min|mn|heures?|h)\b|\b(?:intervenir|intervention|pr[ée]sente?s?\s+sur\s+(?:le\s+|chaque\s+)?(?:site|place|les lieux)|sur place|se pr[ée]senter|d[ée]lai de pr[ée]sence)\b[^.]{0,80}\b\d+\s*(?:minutes?|min|mn)\b[^.]{0,120}\b(?:alarmes?|t[ée]l[ée]surveillance|lev[ée]e de doute)\b/iu, rubriques: ['b4_proc_alarme'] },
  // Mobilisation d'un agent supplémentaire et ses horaires (citedia 1461 : « un second agent SSIAP 1/CQP APS… sollicitable du
  // lundi au samedi de 22h à 6h » sous « La main courante électronique », rattaché sur « traçabilité ») : l'adéquation des
  // moyens humains, sinon la planification.
  { sujet: /\b(?:second|deuxi[èe]me)s? agents?\b|\bagents? suppl[ée]mentaires?\b|\b(?:mobilis|sollicit)[\wéè]*\b[^.]{0,60}\bagents?\b[^.]{0,120}\b(?:\d{1,2}\s?h|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|24\s?h)/iu, rubriques: ['b3_adequation', 'b4_planification'] },
];

/**
 * Rubrique où va une phrase ajoutée par l'adaptation d'une rubrique au CCTP (T4N-6) : la rubrique elle-même si la phrase
 * relève de son sujet ; sinon la rubrique du plan du thème net de la phrase (THEMES_EXIGENCE), ou celle qui la traite
 * nettement (mots-clés) ; '' si aucune ne convient (la phrase est retirée, l'exigence reste au contrôle de couverture).
 */
export function rubriqueDeLAjout(mt: MemoireType, ids: string[], id: string, phrase: string): string {
  const r = mt.rubriques.find((x) => x.id === id);
  const theme = rubriqueDuTheme(phrase, ids);
  if (theme && theme !== id) return theme;
  if (!r || dansLeSujet(phrase, sujetDeRubrique(r))) return id;
  const best = rechercherRubriques(mt, phrase, 1, ids.filter((x) => x !== id && dansLeSujet(phrase, sujetDeRubrique(mt.rubriques.find((y) => y.id === x)!))))[0];
  return best && best.score >= 1 ? best.id : '';
}

/** Rubrique du plan qui traite le thème net d'une exigence (THEMES_EXIGENCE), parmi `ids` ; '' sinon. */
export function rubriqueDuTheme(texte: string, ids: string[]): string {
  for (const t of THEMES_EXIGENCE) if (t.sujet.test(texte)) { const id = t.rubriques.find((x) => ids.includes(x)); if (id) return id; }
  return '';
}

/**
 * Rattache les exigences de la matrice aux rubriques du plan : rubrique du plan citée ; ancienne rubrique (b_*) →
 * rubrique correspondante la plus proche ; sinon recherche lexicale (score ≥ 2). Le reste forme les questions
 * nouvelles (propositions de réponse à faire valider par GSS) ; les pièces de l'offre sont ignorées. Une rubrique ne
 * reçoit jamais une exigence hors de son sujet (sujet_ajouts : « absence imprévue » refusée dans la rubrique de l'absence
 * prévue ; bloc de présentation : seulement ses sujets) ; l'exigence va alors à la rubrique admise la plus proche.
 */
/**
 * Clause de prix, de facturation ou de révision du DCE (« les heures de nuit seront valorisées », « majoration de 10 % »),
 * clause de volume ou de montant de l'acheteur (citedia 1461 et 1462, T4-CONS-5 : « par bons de commande au BPU, selon les
 * quantités réellement exécutées ; l'accord-cadre sera sans minimum et plafonné à 200 000 € HT par an », « un volume
 * prévisionnel de 360 heures par an… sans minimum ni maximum ») : jamais un engagement de GSS. Le BPU seul n'en fait pas une
 * clause (« renforts commandés sur la base du BPU avec un délai de prévenance de 48 heures » est un engagement de service).
 */
export const CLAUSE_PRIX = /\bvaloris(?:e|é|ée|ées|és|er|ation)\b|\bmajor(?:é|ée|ées|és|ation)s?\b|\bprix\b|\btarif|\bfactur|r[ée]vision (?:des |du )?prix|\bbordereau\b|(?:€|euros?)\s*(?:HT|TTC|hors taxes?|toutes taxes)\b|\bplafonn[ée]|\b(?:maximum|minimum|montant) (?:annuel|global|total)|\bmontants? (?:maximum|minimum|estimatif|annuel)|\bsans (?:montant )?minimum\b|\bni (?:sur )?un minimum\b|\b(?:volumes?|quantit[ée]s?) (?:pr[ée]visionnel|estimatif|indicatif)|\bquantit[ée]s? r[ée]ellement (?:ex[ée]cut|command|r[ée]alis)|\bmontant de l.accord-cadre/i;

/** Énoncé général du périmètre du marché (T5N-6). */
const PERIMETRE_GENERAL = /\bint[ée]gralit[ée] des prestations\b|\bl['’]ensemble des prestations (?:de|du|objet)\b|\bprestations? (?:objet|faisant l['’]objet) du (?:pr[ée]sent )?(?:march[ée]|accord[- ]cadre|contrat)\b|\b(?:march[ée]|accord[- ]cadre|contrat|CC[TA]?P)\s+a pour objet\b/i;

export function exigencesParRubrique(mt: MemoireType, plan: PlanMemoireType, matrice: ExigenceMatrice[]): { parRubrique: Record<string, ExigenceMatrice[]>; nouvelles: ExigenceMatrice[] } {
  const ids = plan.rubriques.map((r) => r.id);
  const parRubrique: Record<string, ExigenceMatrice[]> = {};
  const nouvelles: ExigenceMatrice[] = [];
  const ajouter = (id: string, e: ExigenceMatrice) => { (parRubrique[id] ||= []).push(e); };
  const admise = (id: string, e: ExigenceMatrice): boolean => {
    const r = mt.rubriques.find((x) => x.id === id);
    if (!r) return true;
    if (!dansLeSujet(e.exigence, sujetDeRubrique(r))) return false;
    return r.bloc !== 'presentation' || (SUJET_PRESENTATION.test(e.exigence) && rubriqueAdmetSujet(id, e.exigence));
  };
  /** Rubrique admise la plus proche d'une exigence refusée par sa rubrique d'origine ; '' s'il n'y en a pas. */
  const autre = (e: ExigenceMatrice, refusee: string): string => {
    const admises = ids.filter((id) => id !== refusee && admise(id, e));
    return rechercherRubriques(mt, `${e.sujet || ''} ${e.exigence}`, 1, admises)[0]?.id || '';
  };
  const placer = (id: string, e: ExigenceMatrice) => {
    if (admise(id, e)) { ajouter(id, e); return; }
    const a = autre(e, id);
    if (a) ajouter(a, e); else nouvelles.push(e);
  };
  for (const e of matrice || []) {
    // Clause de prix ou de facturation (T3N-10, parc_expo 1331 : « les heures de nuit seront valorisées… » rattachée au contrôle
    // des vacations de nuit) : pas une exigence de prestation, jamais un engagement technique.
    if (!e?.exigence || PIECES_OFFRE.test(e.exigence) || CLAUSE_PRIX.test(e.exigence)) continue;
    // Énoncé général du périmètre (« assurer l'intégralité des prestations de sécurité incendie et de sûreté… », « Le présent
    // marché a pour objet… », s2e 1501, T5N-6) : l'objet du marché, déjà présenté au bloc 1, jamais un engagement d'une rubrique
    // de formation ou d'outils de contrôle.
    if (PERIMETRE_GENERAL.test(e.exigence)) continue;
    // Thème net de l'exigence (cstb 551, T5CP-7 : assurance sous « La gestion d'un incendie », alcool et tabac sous « Nos
    // valeurs », congés et effectif sous « Un interlocuteur unique », rondes d'ouverture sous « L'ordre d'alerte ») : la
    // rubrique de GSS qui traite ce thème, si elle est au plan et l'admet.
    const theme = THEMES_EXIGENCE.find((t) => t.sujet.test(e.exigence));
    const cible = theme?.rubriques.find((id) => ids.includes(id) && admise(id, e));
    if (cible) { ajouter(cible, e); continue; }
    if (e.rubrique && ids.includes(e.rubrique)) {
      // Rubrique de la matrice sans aucun lien lexical avec l'exigence alors qu'une rubrique du plan en a un net (caen 471 :
      // la fin du marché sous « l'agent SSIAP 1 », la mobilisation sur sinistre sous « Le dispositif événementiel », les
      // prestations ponctuelles sous « Le contrôle de nuit », la discrétion sous « égalité des chances ») : la rubrique
      // du thème de l'exigence (T4C-9).
      const r0 = mt.rubriques.find((x) => x.id === e.rubrique);
      const texte = `${e.sujet || ''} ${e.exigence}`;
      if (r0 && scoreRubrique(r0, texte) === 0) {
        const meilleur = rechercherRubriques(mt, texte, 1, ids.filter((id) => id !== e.rubrique && admise(id, e)))[0];
        if (meilleur && meilleur.score >= 1) { ajouter(meilleur.id, e); continue; }
      }
      placer(e.rubrique, e);
      continue;
    }
    // Rubrique du mémoire type écartée du plan par sa condition, sans lien lexical avec l'exigence (caen 475, T6C-1 : la
    // mobilisation sur sinistre rattachée à « Le dispositif événementiel », marché sans événementiel) : même règle que
    // ci-dessus, la rubrique du plan du thème de l'exigence.
    const rHors = e.rubrique ? mt.rubriques.find((x) => x.id === e.rubrique) : undefined;
    if (rHors && scoreRubrique(rHors, `${e.sujet || ''} ${e.exigence}`) === 0) {
      const meilleur = rechercherRubriques(mt, `${e.sujet || ''} ${e.exigence}`, 1, ids.filter((id) => admise(id, e)))[0];
      if (meilleur && meilleur.score >= 1) { ajouter(meilleur.id, e); continue; }
    }
    const candidates = e.rubrique && mt.correspondance_v1[e.rubrique] ? mt.correspondance_v1[e.rubrique].filter((x) => ids.includes(x)) : [];
    if (candidates.length) {
      const meilleur = rechercherRubriques(mt, e.exigence, 1, candidates)[0];
      placer(meilleur?.id || candidates[0], e);
      continue;
    }
    const proche = rechercherRubriques(mt, `${e.sujet || ''} ${e.exigence}`, 1, ids)[0];
    if (proche && proche.score >= 2 && e.rubrique !== 'nouvelle') placer(proche.id, e);
    else nouvelles.push(e);
  }
  return { parRubrique, nouvelles };
}

/**
 * Obligations chiffrées et horaires imposés du CCTP (phrases citées mot pour mot, base_memoires.ts) qui concernent
 * une rubrique (mots-clés de la rubrique) : à transmettre à l'adaptation de la rubrique.
 */
export function obligationsPourRubrique(rubrique: RubriqueMemoireType, dce: string, max = 8): string[] {
  const cles = rubrique.mots_cles.map((m) => normaliser(m)).filter((m) => m.length >= 4);
  // Sujet étroit (sujet_ajouts) : une obligation qui ne fait que partager un mot-clé (« prise de poste » quotidienne,
  // IGN) n'est pas transmise à la rubrique.
  const sujet = sujetDeRubrique(rubrique);
  // Mot-clé au début d'un mot (comme scoreRubrique) : « dati » (DATI) ne se trouve plus dans « dégradation ».
  const pertinente = (ph: string) => { const t = ` ${normaliser(ph).replace(/[^a-z0-9]+/g, ' ')}`; return cles.some((k) => t.includes(` ${singulierMots(k.replace(/[^a-z0-9]+/g, ' ').trim())}`)) && dansLeSujet(ph, sujet); };
  const vues = new Set<string>();
  const out: string[] = [];
  for (const ph of [...obligationsChiffrees(dce).map((o) => o.phrase), ...horairesImposes(dce)]) {
    const k = normaliser(ph);
    if (vues.has(k) || !pertinente(ph)) continue;
    vues.add(k);
    out.push(ph);
    if (out.length >= max) break;
  }
  return out;
}

/** Thèmes de la matrice (I, II…) d'après les blocs du plan : « I=Notre compréhension… ; II=Présentation de GSS… ». */
export function themesPourMatrice(plan: PlanMemoireType): string {
  return plan.blocs.map((b) => `${b.cle}=${b.titre}`).join(' ; ');
}

/** Vrai si un état de complétion porte un plan v2 (libre.plan), sinon l'état suit le plan v1. */
export function estPlanV2(plan: unknown): plan is PlanMemoireType {
  return !!plan && typeof plan === 'object' && (plan as any).version === 2 && Array.isArray((plan as any).rubriques);
}

// ─── Adaptation ciblée au CCTP (rubriques « adapte ») ────────────────────────────────────────────

export interface ModificationsProposees {
  remplacements?: Array<{ extrait: string; par: string; motif?: string }>;
  retraits?: Array<{ extrait: string; motif?: string }>;
  ajouts?: Array<{ apres?: string; texte: string; motif?: string }>;
}

export interface ModificationTraitee {
  type: 'remplacement' | 'retrait' | 'ajout';
  extrait: string;
  par?: string;
  motif?: string;
  raison?: string;
  /** Phrase du DCE qui fonde la modification (citée à GSS avec la phrase adaptée, D8). */
  exigence?: string;
}

export interface OptionsModifications {
  /** Texte du DCE : tout chiffre nouveau doit y figurer. */
  dce?: string;
  /** Texte de référence (publiposté) : les noms propres qu'il contient sont admis. */
  reference?: string;
  /** Chiffres admis en plus de ceux du DCE (ex. registre en Normandie). */
  nombresAutorises?: string[];
  /** Noms propres admis en plus de ceux du DCE et de la référence (organigramme…). */
  nomsAutorises?: string[];
  maxModifications?: number;
  maxAjouts?: number;
  motsParAjout?: number;
  /** Titres des rubriques du mémoire type gardées dans le mémoire : un ajout ne pose pas de « [À COMPLÉTER] » sur
   *  un sujet qu'elles traitent déjà. */
  titresTraites?: string[];
  /** Sujet étroit de la rubrique adaptée (sujet_ajouts) : un ajout hors de ce sujet est refusé. */
  sujetAjouts?: { exige?: RegExp; exclut?: RegExp } | null;
  /** Sujets des délais de GSS publipostés dans la rubrique ({{DELAI_PTI}} → « pti » ; null : délai propre à GSS, sans
   *  sujet du DCE) : un délai de la rubrique n'est remplacé que par le délai que le DCE impose pour l'un de ces sujets. */
  sujetsDelais?: Array<string | null>;
  /**
   * Phrase du DCE qui fonde un remplacement ou un retrait d'une phrase de GSS ('' : aucune). D8 et T2-CONS-3 : toute phrase de
   * GSS modifiée par l'adaptation est signalée à GSS avec l'exigence du CCTP qui la justifie ; une modification qu'aucune
   * phrase du DCE ne fonde n'est pas appliquée.
   */
  fondement?: (m: ModificationTraitee, phrase: string) => string;
  /** Phrases de GSS jamais modifiées ni retirées (pratique générale de GSS suivie de la phrase propre au client). */
  phrasesProtegees?: string[];
}

/**
 * Phrase de pratique générale de GSS suivie, dans le mémoire type, d'une phrase propre au client publiée quand le DCE impose
 * la valeur (« …les réunions de suivi sont mensuelles ou trimestrielles selon la nature et les besoins du site.{{#si
 * FREQ_REUNIONS}} Pour {{CLIENT}}, les réunions de suivi ont lieu {{FREQ_REUNIONS}}.{{/si}} ») : quand la phrase propre au
 * client est publiée, elle répond déjà au CCTP ; la phrase générale reste celle de GSS (cstb 551, T5CP-8 : phrase générale
 * réécrite en « annuelles… », redite de la phrase suivante, et schéma « Mensuelles ou trimestrielles » contredit).
 */
export function phrasesGeneralesProtegees(gabarit: string, publie: string): string[] {
  const out: string[] = [];
  for (const m of String(gabarit || '').matchAll(/([^.\n{}]+\.)\{\{#si\s+[A-Z_]+\}\}\s*Pour \{\{CLIENT\}\}/g)) {
    const phrase = m[1].trim();
    const k = String(publie || '').indexOf(phrase);
    if (k >= 0 && /^\s*Pour\s/.test(String(publie).slice(k + phrase.length))) out.push(phrase);
  }
  return out;
}

/** Sujet du DCE de chaque délai publiposté (delaiDuDce) ; null : délai propre à GSS que le DCE ne remplace jamais. */
export const SUJET_VARIABLE_DELAI: Record<string, string | null> = {
  DELAI_ASTREINTE: 'remplacement', DELAI_PTI: 'pti', DELAI_INTERVENTION_ALARME: 'alarme',
  DELAI_COMMANDE_SUPPLEMENTAIRE: 'commande', DELAI_DEFAILLANCE_SSI: 'ssi', DELAI_ASTREINTE_NORMANDIE: null,
};

/** Sujets des délais publipostés d'un texte du mémoire type (« {{DELAI_PTI}} » → ['pti']). */
export function sujetsDelaisDuGabarit(gabarit: string): Array<string | null> {
  const out: Array<string | null> = [];
  for (const m of String(gabarit || '').matchAll(/\{\{(DELAI_[A-Z_]+)\}\}/g)) {
    if (m[1] in SUJET_VARIABLE_DELAI && !out.includes(SUJET_VARIABLE_DELAI[m[1]])) out.push(SUJET_VARIABLE_DELAI[m[1]]);
  }
  return out;
}

/** Délais d'un texte, normalisés (« 45 min » → « 45 minutes »). */
function delaisDe(t: string): string[] {
  return [...String(t || '').matchAll(/(?<![\d,.])(\d{1,3})\s*(minutes?|mn|min|heures?|h)(?![\wÀ-ÿ])/gi)].map((m) => normaliserDelai(`${m[1]} ${m[2]}`));
}

const MOTS_VIDES_TITRE = new Set(['notre', 'nos', 'votre', 'vos', 'dans', 'pour', 'avec', 'des', 'les', 'une', 'aux', 'sur', 'par', 'leur', 'leurs', 'cas', 'place', 'tout', 'tous', 'toute']);
const motsSignificatifs = (t: string) => [...new Set(normaliser(t).replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter((m) => m.length >= 4 && !MOTS_VIDES_TITRE.has(m)))];

/**
 * Phrases d'un ajout qui posent un « [À COMPLÉTER] » sur un sujet déjà traité par une rubrique gardée (libellé qui
 * reprend au moins deux mots significatifs et la moitié de ceux du titre) : retirées de l'ajout, la rubrique y répond.
 */
export function sansACompleterTraite(ajout: string, titres: string[] = []): string {
  if (!titres.length || !/\[À COMPLÉTER\]/.test(ajout)) return ajout;
  const motsTitres = titres.map(motsSignificatifs).filter((m) => m.length >= 2);
  return ajout.split(/(?<=[.!?])\s+/).filter((ph) => {
    if (!/\[À COMPLÉTER\]/.test(ph)) return true;
    const libelle = new Set(motsSignificatifs(ph.split('[À COMPLÉTER]')[0]));
    return !motsTitres.some((mt) => {
      const communs = mt.filter((m) => libelle.has(m)).length;
      return communs >= 2 && communs >= mt.length / 2;
    });
  }).join(' ').trim();
}

/** Repère un extrait mot pour mot (espaces et apostrophes tolérés). Renvoie toutes les positions. */
function positionsExtrait(texte: string, extrait: string): Array<{ debut: number; fin: number }> {
  const e = String(extrait || '').trim();
  if (e.length < 3) return [];
  const motif = e.split(/\s+/).map((w) => echapper(w).replace(/['’]/g, "['’]")).join('\\s+');
  const rx = new RegExp(motif, 'g');
  return [...texte.matchAll(rx)].map((m) => ({ debut: m.index || 0, fin: (m.index || 0) + m[0].length }));
}

/** Nombres d'un texte (chiffres, et nombres en lettres courants). */
function nombresDe(t: string): string[] {
  const out = (String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.').replace(/^0+(?=\d)/, ''));
  // Nombres en lettres, formes composées comprises (« vingt-cinq », « quatre-vingt-dix », T1-GEN-3).
  for (const m of normaliser(t).matchAll(new RegExp(`(?<![a-z-])(${RX_NOMBRE_LETTRES})(?![a-z-])`, 'g'))) {
    const n = nombreFr(m[1]);
    if (Number.isFinite(n)) out.push(String(n));
  }
  return out;
}

const INTERDITS_ADAPTATION: Array<[RegExp, string]> = [
  [/covid|pass(?:es)? sanitaires?|gestes? barri|hydroalcool/i, 'Covid'],
  [/(?:v[ée]rifi|contr[ôo]l)\w*\s+(?:de\s+|des\s+|d['’]\s*|son\s+|leur\s+|les\s+)?(?:l['’]\s*)?(?:pi[èe]ces?\s+d['’])?identit/i, "contrôle d'identité"],
  [/certifi[ée]e?s?\s+ISO|ISO\s?9001\s+(?:obtenue|acquise)/i, 'ISO présentée comme acquise'],
  [/p[ôo]le emploi/i, 'Pôle emploi'],
  [/vigicom/i, 'Vigicom'],
  [/OTMANI|MEROUANI|MENDES|HANZAZ|FE Lilian/, 'nom obsolète'],
  [/sous-trait/i, 'sous-traitance'],
  [/\[CONSULTATION REQUISE|⟦|\{\{|\}\}/, 'marqueur interne'],
  [MONTANT_PENALITE, 'montant de pénalité'],
];

/** Exigence écrite à la voix de l'acheteur (« son remplaçant devra être présent », « quels que soit », « le titulaire »). */
// Bornes en lettres accentuées comprises (\b ne voit pas « é » : « il est demandé », « est réputé » échappaient au motif).
const VOIX_ACHETEUR = /(?<![\wÀ-ÿ])(?:devra|devront|doit|doivent|est tenu|sont tenus|il est demand[ée]|quels? que soi(?:t|ent)|vu que|est r[ée]put[ée]|sont r[ée]put[ée]s|ne (?:peut|pourra) (?:invoquer|se pr[ée]valoir))(?![\wÀ-ÿ])|\b(?:le|au|du) titulaire\b/i;

/** Phrase qui commence par un pronom de reprise (« Il », « Elle », « Celui-ci », « Ce dernier »…). */
const PRONOM_INITIAL = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*)?(?:Ils?|Elles?|Celui-ci|Celle-ci|Ceux-ci|Celles-ci|Ce dernier|Cette derni[èe]re|Ces derni(?:ers|[èe]res))(?![\wÀ-ÿ'’-])/;

/** Motif de refus d'un texte proposé par le modèle (ou null s'il est acceptable). */
function refusTexteNouveau(nouveau: string, ancien: string, o: OptionsModifications): string | null {
  // Covid : le mot jamais, une mesure (pass sanitaire, gestes barrières, gel) seulement si le DCE l'exige sous ce terme.
  for (const [rx, motif] of INTERDITS_ADAPTATION) if (rx.test(nouveau) && !rx.test(ancien) && !(motif === 'Covid' && !motifCovidInterdit(o.dce || '').test(nouveau))) return motif;
  if (/L\.?\s?1224/.test(nouveau) && !/L\.?\s?1224/.test(o.dce || '')) return 'article L. 1224-1 absent du DCE';
  if (retirerCommentairesInternes(nouveau).retires.length) return 'commentaire interne';
  // Jalon du calendrier de GSS (« J-10 », « J-3 ») : jamais remplacé par un délai du DCE (ifsem 335).
  if (jalonsDe(ancien).some((j) => !jalonsDe(nouveau).includes(j)) && !jalonsDe(nouveau).length) return 'jalon du calendrier de GSS';
  // Phrase du CCTP recopiée (« son remplaçant devra être présent … », « À Coriolis, l'accueil des premiers
  // utilisateurs … ») : ce n'est pas une adaptation du texte de GSS, et l'exigence est traitée par sa rubrique.
  const motsAncien = new Set(normaliser(ancien).split(/[^a-z0-9]+/));
  const dejaDansAncien = (ph: string) => { const m = normaliser(ph).split(/[^a-z0-9]+/).filter((w) => w.length >= 3); return !!m.length && m.filter((w) => motsAncien.has(w)).length / m.length >= 0.8; };
  if (o.dce && nouveau.split(/(?<=[.!?;])\s+/).some((ph) => VOIX_ACHETEUR.test(ph) && recopieDuDce(ph, o.dce!) && !dejaDansAncien(ph))) return 'recopie du CCTP à la voix de l\'acheteur';
  const admis = new Set([...nombresDe(ancien), ...nombresDe(o.dce || ''), ...(o.nombresAutorises || []).flatMap(nombresDe)]);
  const inconnus = nombresDe(nouveau).filter((n) => !admis.has(n));
  if (inconnus.length) return `chiffre absent du DCE (${[...new Set(inconnus)].join(', ')})`;
  const sources = normaliser(`${o.dce || ''} ${o.reference || ''} ${ancien} ${(o.nomsAutorises || []).join(' ')}`);
  // Noms propres : mots à majuscule hors début de phrase (ou après M., Mme…), et sigles.
  const noms: string[] = [];
  for (const m of nouveau.matchAll(/[A-ZÀ-Ý][\wÀ-ÿ'’-]{2,}/g)) {
    const avant = nouveau.slice(0, m.index).replace(/\s+$/, '');
    const titreCivilite = /(?:^|[\s(])(?:M|Mme|Mlle|Mr|Dr)\.?$/.test(avant);
    const debutPhrase = !titreCivilite && (avant === '' || /[.!?«(\n*•-]$/.test(avant));
    if (!debutPhrase || /^[A-ZÀ-Ý0-9]{3,}$/.test(m[0])) noms.push(m[0]);
  }
  const inventes = noms.filter((n) => !sources.includes(normaliser(n)));
  if (inventes.length) return `nom absent du DCE (${[...new Set(inventes)].join(', ')})`;
  return null;
}

/**
 * Étapes d'une procédure (lignes de liste numérotée « n. » ou puces « - » de six mots au moins) du texte `avant`
 * qui ne se retrouvent plus dans `apres` (aucune ligne de liste ressemblante à 60 % au moins) : GSS ne fonctionne
 * qu'en process, une étape retirée rend la procédure illisible (« 3. Selon le constat » sans les étapes 1 et 2).
 * Un chiffre ou un nom changé dans une étape la conserve ; une courte puce d'énumération (moins de six mots) peut
 * être retirée.
 */
export function etapesRetirees(avant: string, apres: string): string[] {
  const LIGNE_LISTE = /^\s*(?:\d+[.)]|[-•*])\s+(.+)$/;
  const mots = (l: string) => normaliser(l.replace(/\*\*|__|⟦AC:\d+⟧/g, ' ')).replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/).filter(Boolean);
  const lignes = (t: string) => String(t || '').split('\n').map((l) => LIGNE_LISTE.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ ligne: m[0].trim(), mots: mots(m[1]) }));
  const apresL = lignes(apres);
  return lignes(avant).filter((e) => e.mots.length >= 6 && !apresL.some((x) => similarite(e.mots, x.mots) >= 0.6)).map((e) => e.ligne);
}

/**
 * Modification qui commence au début d'une phrase de GSS et laisse la phrase commencer par une minuscule (parc_expo 202,
 * b5_equipe_controle : retrait de « Étant lui-même en poste sur le site, » → « …de GSS. il alerte l'équipe encadrante… ») :
 * le début de la phrase ne se retire pas seul, la phrase de GSS reste entière.
 */
export function debutDePhraseRetire(avant: string, debut: number, fin: number, apres: string): boolean {
  // Phrase entière retirée : la suite est le texte d'origine de la phrase suivante, inchangé.
  if (apres.slice(debut) === avant.slice(fin) && /[.!?…]["»”)]?$/.test(avant.slice(debut, fin).trimEnd())) return false;
  const amont = avant.slice(0, debut).replace(/[ \t]+$/, '');
  const debutPhrase = amont === '' || /(?:[.!?…]|\n|^\s*(?:[-*•]|\d+[.)])|\*\*)$/.test(amont) || /\n\s*(?:[-*•]|\d+[.)])$/.test(amont);
  if (!debutPhrase) return false;
  const suite = apres.slice(amont.length).replace(/^[\s*_]+/, '');
  return /^[a-zà-ÿ]/.test(suite);
}

/**
 * Applique les modifications proposées : un remplacement ou un retrait n'est appliqué que si l'extrait figure mot
 * pour mot (une seule fois) dans le texte ; au plus `maxModifications` modifications et `maxAjouts` ajouts de
 * `motsParAjout` mots ; tout texte nouveau est contrôlé (chiffres du DCE, noms connus, interdits GSS).
 */
/** Motif du refus d'un remplacement qui nie la mission décrite par GSS (T5CP-1) : la rubrique décrit une mission exclue. */
export const RAISON_MISSION_NIEE = 'négation de la mission décrite par GSS (le cahier des charges exclut cette mission)';
/** Négation (« aucune ronde… », « n'est pas surveillé », « ne … pas », « jamais ») : une adaptation ne nie jamais la phrase de GSS. */
const NEGATION_MISSION = /(?<![\p{L}])aucun(?:e|s|es)?\s+(?:ronde|contr[ôo]le|surveillance|filtrage|accueil|mission|agent|prestation|gardiennage|pr[ée]sence)|n['’]\s*(?:est|sont)\s+pas\s+(?:surveill|gard[ée]|assur|pr[ée]vu|effectu|r[ée]alis)|(?<![\p{L}])(?:non|pas de)\s+surveill|n['’]\s*(?:assure|effectue|r[ée]alise)(?:nt)?\s+(?:pas|aucun)/iu;

/** Vrai si l'extrait (position dans le texte) chevauche une phrase protégée. */
/** Raison du refus d'une modification qu'aucune phrase du DCE ne fonde (D8, T2-CONS-3). */
export const RAISON_SANS_FONDEMENT = 'aucune phrase du DCE ne fonde la modification';

/** Phrase (entre « . », « ! », « ? » ou fin de ligne) qui contient un extrait du texte. */
function phraseAutour(t: string, debut: number, fin: number): string {
  const avant = t.slice(0, debut);
  const i = Math.max(avant.lastIndexOf('. '), avant.lastIndexOf('\n'), avant.lastIndexOf('! '), avant.lastIndexOf('? '));
  const apres = t.slice(fin);
  const j = apres.search(/[.!?](?:\s|$)|\n/);
  return t.slice(i + 1, j < 0 ? t.length : fin + j + 1).trim();
}

/**
 * Phrases de GSS qui donnent la fréquence d'un contrôle, d'une réunion qualité ou d'un bilan (T2-CONS-3 : « VATTIER Marie,
 * responsable qualité : lors des réunions trimestrielles, elle se rend sur site… bilan du trimestre écoulé ») : leur fréquence
 * ne change que par les fréquences imposées du CCTP (FREQ_CONTROLE_n, FREQ_REUNIONS, publipostage contrôlé), jamais par
 * l'adaptation du modèle (« annuelles » tiré des rencontres annuelles du contrat, phrase devenue incohérente).
 */
export function phrasesDeFrequenceDeControle(texte: string): string[] {
  const FREQ = /(?<![\p{L}])(?:hebdomadaires?|mensuel(?:le)?s?|bimestriel(?:le)?s?|trimestriel(?:le)?s?|semestriel(?:le)?s?|annuel(?:le)?s?|trimestre|semestre|par (?:semaine|mois|trimestre|semestre|an)|chaque (?:semaine|mois|trimestre|semestre|année)|tous les (?:mois|ans|trimestres))(?![\p{L}])/iu;
  const SUJET = /contr[ôo]l|qualit[ée]|bilan|r[ée]unions?|rapports?/i;
  const out: string[] = [];
  for (const ligne of String(texte || '').split('\n')) {
    for (const ph of ligne.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«*])/)) if (FREQ.test(ph) && SUJET.test(ph) && ph.trim().length >= 20) out.push(ph.trim());
  }
  return out;
}

function touchePhraseProtegee(t: string, pos: { debut: number; fin: number }, phrases?: string[]): boolean {
  // Ligne de tableau (« | Agent de sécurité | CQP APS | 7 | … | ») : tableau calculé ou chiffré de GSS, jamais réécrit par
  // l'adaptation (T1F-3 : « Adaptation b3_adequation : 2 modification(s) » avait réécrit le tableau de l'équipe dédiée).
  const debutLigne = t.lastIndexOf('\n', Math.max(0, pos.debut - 1)) + 1;
  const finLigne = t.indexOf('\n', pos.fin) < 0 ? t.length : t.indexOf('\n', pos.fin);
  if (t.slice(debutLigne, finLigne).split('\n').some((l) => /^\s*\|/.test(l))) return true;
  for (const p of phrases || []) {
    let k = t.indexOf(p);
    while (k >= 0) {
      if (pos.debut < k + p.length && pos.fin > k) return true;
      k = t.indexOf(p, k + 1);
    }
  }
  return false;
}

/**
 * Texte ajouté écrit comme une phrase entière (T3-CONS-10, T3N-3 : le modèle propose « ; le plan de prévention sera
 * transmis… » ou « ; l'organisation garantit… » pour continuer une phrase de GSS, imprimé en paragraphe qui commençait par
 * « ; ») : ponctuation et mot de liaison de tête retirés (« ; », « , », « : », « – », « et », « ainsi que »), majuscule
 * initiale et point final. Une puce de liste reste une puce.
 */
export function phraseAutonome(texte: string): string {
  const t = String(texte || '').trim();
  if (!t || /^\s*(?:\d+[.)]|[-•*])\s+/.test(t)) return t;
  let x = t.replace(/^(?:[;,:–—-]\s*)+/, '').replace(/^(?:et|ainsi que|puis|mais|ou|de plus)(?:\s*,)?\s+/i, '').trim();
  if (!x) return '';
  if (/^[a-zà-ÿ]/.test(x)) x = x.charAt(0).toUpperCase() + x.slice(1);
  if (!/[.!?»)\]]$/.test(x)) x = `${x.replace(/[;,:]\s*$/, '')}.`;
  return x;
}

export function appliquerModifications(texte: string, mods: ModificationsProposees, options: OptionsModifications = {}): { texte: string; appliquees: ModificationTraitee[]; refusees: ModificationTraitee[] } {
  const o = { maxModifications: 12, maxAjouts: 3, motsParAjout: 60, ...options };
  const appliquees: ModificationTraitee[] = [];
  const refusees: ModificationTraitee[] = [];
  let t = texte;
  const plafond = () => appliquees.length >= o.maxModifications;
  for (const r of mods.remplacements || []) {
    const m: ModificationTraitee = { type: 'remplacement', extrait: String(r?.extrait || ''), par: String(r?.par ?? ''), motif: r?.motif };
    if (plafond()) { refusees.push({ ...m, raison: 'plafond de modifications atteint' }); continue; }
    const pos = positionsExtrait(t, m.extrait);
    if (pos.length !== 1) { refusees.push({ ...m, raison: pos.length ? 'extrait ambigu (plusieurs occurrences)' : 'extrait introuvable mot pour mot' }); continue; }
    if (!m.par!.trim()) { refusees.push({ ...m, raison: 'remplacement vide (utiliser un retrait)' }); continue; }
    // Un repère « [À COMPLÉTER] » (donnée que seul GSS peut donner, avec sa question) ne se remplace jamais par une
    // valeur de l'adaptation (génération réelle ifits 171 : « Taux de reprise du personnel en place : 0 % »).
    const nRepere = (x: string) => (x.match(/\[À COMPLÉTER\]/g) || []).length;
    if (nRepere(m.extrait) > nRepere(m.par!)) { refusees.push({ ...m, raison: 'un repère à compléter ne se remplace pas' }); continue; }
    if (touchePhraseProtegee(t, pos[0], o.phrasesProtegees)) { refusees.push({ ...m, raison: 'pratique générale de GSS suivie de la phrase propre au client (déjà conforme au CCTP)' }); continue; }
    m.par = sansCovidEnumere(m.par!);
    // Remplacement qui nie la phrase de GSS (cstb 551 : « Gestion des entrées : pendant l'ouverture du site, celui-ci n'est pas
    // surveillé ; … », « Contrôle intérieur : aucune ronde de contrôle… ») : jamais imprimé ; la rubrique décrit une mission
    // que le cahier des charges exclut (adapterRubrique la signale, le générateur la retire).
    if (NEGATION_MISSION.test(m.par!) && !NEGATION_MISSION.test(m.extrait)) { refusees.push({ ...m, raison: RAISON_MISSION_NIEE }); continue; }
    const refus = refusTexteNouveau(m.par!, m.extrait, o);
    if (refus) { refusees.push({ ...m, raison: refus }); continue; }
    // Délai de GSS publiposté (caen 441, b4_pti : « en 45 minutes au maximum » → « en 30 minutes au maximum », le 30 du
    // CCTP portant sur l'intervention sur alarme) : remplacé seulement par le délai que le DCE impose pour le MÊME sujet.
    if (o.sujetsDelais?.length) {
      const retires = delaisDe(m.extrait).filter((d) => !delaisDe(m.par!).includes(d));
      const nouveaux = delaisDe(m.par!).filter((d) => !delaisDe(m.extrait).includes(d));
      if (retires.length && nouveaux.length) {
        const imposes = o.sujetsDelais.filter((x): x is string => !!x).map((x) => delaiDuDce(o.dce || '', x as keyof typeof SUJETS_DELAI)).filter(Boolean);
        if (!nouveaux.every((d) => imposes.includes(d))) { refusees.push({ ...m, raison: 'délai de GSS remplacé par un délai que le DCE n\'impose pas pour ce sujet' }); continue; }
      }
    }
    // Échéance postérieure au démarrage (« dans le mois suivant la prise d'effet ») placée dans une phase d'avant le
    // jour J (« De J-30 à J-15 ») : contresens du rétroplanning.
    const ligne = t.slice(t.lastIndexOf('\n', pos[0].debut - 1) + 1, t.indexOf('\n', pos[0].fin) < 0 ? t.length : t.indexOf('\n', pos[0].fin));
    const APRES_J = /suivant (?:la |le )?(?:prise d.effet|d[ée]marrage|notification|d[ée]but)|apr[èe]s (?:la |le )?(?:prise d.effet|d[ée]marrage)/i;
    if (/\bJ\s?[-–]\s?\d+/.test(ligne) && APRES_J.test(m.par!) && !APRES_J.test(m.extrait)) { refusees.push({ ...m, raison: 'échéance postérieure au démarrage placée avant le jour J' }); continue; }
    const essai = t.slice(0, pos[0].debut) + m.par + t.slice(pos[0].fin);
    if (jalonsChronologiques(t) && !jalonsChronologiques(essai)) { refusees.push({ ...m, raison: 'suite de jalons non chronologique' }); continue; }
    if (etapesRetirees(t, essai).length) { refusees.push({ ...m, raison: 'une étape de procédure ne se retire pas' }); continue; }
    if (debutDePhraseRetire(t, pos[0].debut, pos[0].fin, essai)) { refusees.push({ ...m, raison: 'début de phrase de GSS remplacé par un texte sans majuscule' }); continue; }
    if (o.fondement) {
      const e = o.fondement(m, phraseAutour(t, pos[0].debut, pos[0].fin));
      if (!e) { refusees.push({ ...m, raison: RAISON_SANS_FONDEMENT }); continue; }
      m.exigence = e;
    }
    t = essai;
    appliquees.push(m);
  }
  for (const r of mods.retraits || []) {
    const m: ModificationTraitee = { type: 'retrait', extrait: String(r?.extrait || ''), motif: r?.motif };
    if (plafond()) { refusees.push({ ...m, raison: 'plafond de modifications atteint' }); continue; }
    const pos = positionsExtrait(t, m.extrait);
    if (pos.length !== 1) { refusees.push({ ...m, raison: pos.length ? 'extrait ambigu (plusieurs occurrences)' : 'extrait introuvable mot pour mot' }); continue; }
    if (/\[À COMPLÉTER\]/.test(m.extrait)) { refusees.push({ ...m, raison: 'un repère à compléter ne se retire pas' }); continue; }
    if (touchePhraseProtegee(t, pos[0], o.phrasesProtegees)) { refusees.push({ ...m, raison: 'pratique générale de GSS suivie de la phrase propre au client (déjà conforme au CCTP)' }); continue; }
    const essai = t.slice(0, pos[0].debut) + t.slice(pos[0].fin);
    if (etapesRetirees(t, essai).length) { refusees.push({ ...m, raison: 'une étape de procédure ne se retire pas' }); continue; }
    if (debutDePhraseRetire(t, pos[0].debut, pos[0].fin, essai)) { refusees.push({ ...m, raison: 'début de phrase de GSS retiré seul (phrase gardée entière)' }); continue; }
    if (o.fondement) {
      const e = o.fondement(m, phraseAutour(t, pos[0].debut, pos[0].fin));
      if (!e) { refusees.push({ ...m, raison: RAISON_SANS_FONDEMENT }); continue; }
      m.exigence = e;
    }
    t = essai;
    appliquees.push(m);
  }
  let nAjouts = 0;
  for (const a of mods.ajouts || []) {
    const m: ModificationTraitee = { type: 'ajout', extrait: String(a?.apres || ''), par: phraseAutonome(sansCovidEnumere(String(a?.texte || '').trim())), motif: a?.motif };
    if (plafond()) { refusees.push({ ...m, raison: 'plafond de modifications atteint' }); continue; }
    if (o.titresTraites?.length && m.par) {
      const garde = sansACompleterTraite(m.par, o.titresTraites);
      if (!garde || garde === '-') { refusees.push({ ...m, raison: 'sujet déjà traité par une rubrique gardée du mémoire type (pas de « [À COMPLÉTER] »)' }); continue; }
      m.par = garde;
    }
    if (nAjouts >= o.maxAjouts) { refusees.push({ ...m, raison: `plus de ${o.maxAjouts} ajouts` }); continue; }
    if (!m.par || compterMots(m.par) > o.motsParAjout) { refusees.push({ ...m, raison: `ajout vide ou de plus de ${o.motsParAjout} mots` }); continue; }
    // Rattachement : une exigence hors du sujet étroit de la rubrique (accueil quotidien à 7h00, état des lieux de fin de
    // marché dans l'intégration d'un nouveau marché) relève d'une autre rubrique ou des questions à GSS.
    if (!dansLeSujet(m.par, o.sujetAjouts)) { refusees.push({ ...m, raison: 'exigence hors du sujet de la rubrique (traitée par sa rubrique ou par les questions à GSS)' }); continue; }
    // Ajout qui commence par un pronom (« Il synthétise les faits marquants… », génération réelle imm 13) : son
    // antécédent est resté dans le CCTP, la phrase insérée dans le texte de GSS renvoie à un autre nom ou à rien.
    if (PRONOM_INITIAL.test(m.par)) { refusees.push({ ...m, raison: 'ajout commençant par un pronom sans antécédent' }); continue; }
    const refus = refusTexteNouveau(m.par, '', o);
    if (refus) { refusees.push({ ...m, raison: refus }); continue; }
    if (m.extrait) {
      const pos = positionsExtrait(t, m.extrait);
      if (pos.length !== 1) { refusees.push({ ...m, raison: pos.length ? 'point d\'insertion ambigu' : 'point d\'insertion introuvable mot pour mot' }); continue; }
      if (touchePhraseProtegee(t, pos[0], [])) { refusees.push({ ...m, raison: 'point d\'insertion dans un tableau (jamais modifié par l\'adaptation)' }); continue; }
      const debutLigne = t.lastIndexOf('\n', pos[0].debut - 1) + 1;
      const finLigne = t.indexOf('\n', pos[0].fin) < 0 ? t.length : t.indexOf('\n', pos[0].fin);
      const LISTE = /^\s*(?:\d+[.)]|[-•*])\s+/;
      if (LISTE.test(t.slice(debutLigne, finLigne))) {
        // Point d'insertion dans une liste : l'ajout a sa propre ligne (nouvelle puce juste après celle-ci), ou son
        // propre paragraphe après la fin de la liste — jamais collé à la puce précédente.
        if (LISTE.test(m.par)) {
          t = `${t.slice(0, finLigne)}\n${m.par}${t.slice(finLigne)}`;
        } else {
          let finListe = finLigne;
          while (finListe < t.length) {
            const suivante = t.indexOf('\n', finListe + 1) < 0 ? t.length : t.indexOf('\n', finListe + 1);
            if (!LISTE.test(t.slice(finListe + 1, suivante))) break;
            finListe = suivante;
          }
          t = `${t.slice(0, finListe).trimEnd()}\n\n${m.par}${finListe < t.length ? `\n\n${t.slice(finListe).replace(/^\n+/, '')}` : ''}`;
        }
      } else {
        // Sous-titre en gras seul sur sa ligne (« **Le contrôle global** ») : l'ajout n'est jamais collé au sous-titre
        // (ifits 171) ; il forme son propre paragraphe après le paragraphe qui suit le sous-titre.
        if (/^\s*(?:#{2,4}\s+.+|\*\*[^*]+\*\*\s*:?)\s*$/.test(t.slice(debutLigne, finLigne))) {
          const finPara = t.indexOf('\n\n', finLigne + 1);
          const coupePara = finPara < 0 ? t.length : finPara;
          t = `${t.slice(0, coupePara).trimEnd()}\n\n${m.par}${coupePara < t.length ? `\n\n${t.slice(coupePara).replace(/^\n+/, '')}` : ''}`;
          nAjouts++;
          appliquees.push(m);
          continue;
        }
        // Insertion à la fin de la phrase (ou de la ligne) qui contient l'extrait.
        const suite = t.slice(pos[0].fin);
        const fin = /[.!?](?=\s|$)|\n/.exec(suite);
        const coupe = pos[0].fin + (fin ? fin.index + (fin[0] === '\n' ? 0 : 1) : suite.length);
        if (/:\s*$/.test(t.slice(debutLigne, coupe)) && (!fin || fin[0] === '\n')) {
          // Ligne qui annonce une liste (« … votre interlocuteur unique est : ») : l'ajout n'est jamais collé après les
          // deux-points (génération réelle imm 15 : « est : Les agents sont identifiables… ») ; il a son propre
          // paragraphe après la liste annoncée.
          let finListe = finLigne;
          while (finListe < t.length) {
            const suivante = t.indexOf('\n', finListe + 1) < 0 ? t.length : t.indexOf('\n', finListe + 1);
            if (!LISTE.test(t.slice(finListe + 1, suivante))) break;
            finListe = suivante;
          }
          t = `${t.slice(0, finListe).trimEnd()}\n\n${m.par}${finListe < t.length ? `\n\n${t.slice(finListe).replace(/^\n+/, '')}` : ''}`;
        } else {
          t = `${t.slice(0, coupe)} ${m.par}${t.slice(coupe)}`;
        }
      }
    } else {
      t = `${t.trimEnd()}\n\n${m.par}`;
    }
    nAjouts++;
    appliquees.push(m);
  }
  return { texte: nettoyerPubliposte(t), appliquees, refusees };
}

/**
 * Fidélité minimale aux textes de GSS (décision D7 du 2 octobre 2026 : au moins 90 % du texte de GSS repris, jamais
 * 60 ou 70 %) : rubriques adaptées au CCTP, réponses développées du cadre imposé, condensation du format court.
 */
export const SEUIL_FIDELITE = 0.9;

/** Mots normalisés d'une phrase (même découpage que la mesure de fidélité). */
export function motsDePhrase(p: string): string[] {
  return normaliser(String(p || '').replace(/\*\*|__|#+\s|⟦AC:\d+⟧/g, ' ')).replace(/^[-*•|\d.)\s]+/, '').replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** Phrases (et lignes de liste ou de tableau) d'un texte, normalisées, avec leurs mots. */
function phrasesNormalisees(t: string): string[][] {
  return String(t || '').replace(/\*\*|__|#+\s|⟦AC:\d+⟧/g, ' ').split(/\n+|(?<=[.!?;:])\s+/)
    .map((p) => normaliser(p).replace(/^[-*•|\d.)\s]+/, '').replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/).filter(Boolean))
    .filter((mots) => mots.length >= 3);
}

/** Similarité de deux suites de mots (1 − distance d'édition / longueur maximale). */
export function similarite(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = cour;
  }
  return 1 - prec[b.length] / Math.max(a.length, b.length);
}

const NOMBRES_MOTS: Record<string, string> = {
  un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10', onze: '11',
  douze: '12', quinze: '15', vingt: '20', trente: '30', quarante: '40', cinquante: '50', soixante: '60', cent: '100',
};
const NB = '(\\d+(?:[.,]\\d+)?|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent)';
const nombre = (x: string) => NOMBRES_MOTS[x] || x.replace(',', '.');

/**
 * Faits d'une phrase (texte normalisé ou brut) qui ne doivent pas changer quand on reprend un texte de GSS : nombres
 * (en chiffres ou en lettres, « un/une » seulement dans un intervalle), intervalles (« une à trois »), bornes (« au
 * moins », « au plus », « maximum », « minimum », « moins de », « plus de », « jusqu'à ») et mots que faits_gss.md
 * interdit (sous-traitance, intérim, Covid).
 */
export function faitsDePhrase(t: string): string[] {
  const n = normaliser(t).replace(/[^a-z0-9',.\s-]+/g, ' ').replace(/\s+/g, ' ');
  const out: string[] = [];
  for (const m of n.matchAll(new RegExp(`(?:^|[^a-z0-9])${NB} (?:a|ou|et) ${NB}(?![a-z0-9])`, 'g'))) out.push(`R:${nombre(m[1])}-${nombre(m[2])}`);
  for (const m of n.matchAll(/(?<![a-z0-9.,])(\d+(?:[.,]\d+)?)(?![0-9])/g)) out.push(`N:${nombre(m[1])}`);
  for (const m of n.matchAll(/(?:^|[^a-z0-9])(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent)(?![a-z0-9-])/g)) out.push(`N:${nombre(m[1])}`);
  for (const m of n.matchAll(/(?:^|[^a-z0-9])(au moins|au plus|au maximum|au minimum|maximum|minimum|maximale?s?|minimale?s?|moins de|plus de|jusqu'a)(?![a-z0-9])/g)) out.push(`L:${m[1].replace(/^au /, '').replace(/ales?$|als?$/, 'um').replace(/^maxim(?:um)?$/, 'maximum').replace(/^minim(?:um)?$/, 'minimum')}`);
  for (const m of n.matchAll(/(sous[ -]?trait|interim|covid)/g)) out.push(`F:${m[1].replace(/[ -]/g, '')}`);
  // Fréquence « une fois par mois » (« un » n'est pas lu comme un nombre) : retirée par le modèle (« Contrôle 1 — le contrôle
  // de fond de la prestation, réalisé par le responsable de site », citedia2 1462), ce n'est plus la phrase de GSS.
  for (const m of n.matchAll(/(?:^|[^a-z0-9])une fois par (jour|nuit|semaine|mois|trimestre|semestre|an)(?![a-z0-9])/g)) out.push(`Q:1/${m[1]}`);
  return out;
}

/** Nombres (en chiffres) d'un texte : ceux que le DCE impose peuvent remplacer ceux de GSS. */
export function nombresAutorisesDe(t: string): Set<string> {
  return new Set(faitsDePhrase(String(t || '')).filter((f) => f.startsWith('N:')));
}

/** Famille d'unité écrite juste après un nombre (texte normalisé) : « 24 agents » → agents, « 24h/24 » → amplitude. */
function uniteApresNombre(t: string): string {
  const a = t.replace(/^\s+/, '');
  if (/^(?:h|heures?)\s*(?:\/|sur)\s*24\b|^\/\s*\d/.test(a)) return 'amplitude';
  const UNITES: Array<[RegExp, string]> = [
    [/^(?:minutes?|mn|min)(?![a-z])/, 'min'], [/^(?:heures?|h)(?![a-z])/, 'h'], [/^jours?(?![a-z])/, 'jour'], [/^semaines?(?![a-z])/, 'semaine'],
    [/^mois(?![a-z])/, 'mois'], [/^(?:ans?|annees?)(?![a-z])/, 'an'], [/^(?:%|pour ?cent)/, '%'], [/^(?:euros?|€)/, '€'], [/^(?:km|kilometres?)(?![a-z])/, 'km'],
    [/^(?:agents?|personnes?|salaries?|titulaires?|intervenants?|rondiers?|collaborateurs?|maitres?-chiens?|ssiap|ads|encadrants?)(?![a-z])/, 'agents'],
    [/^(?:fois|rondes?|passages?|visites?|controles?|tournees?)(?![a-z])/, 'occurrences'], [/^(?:sites?|batiments?|parcs?|postes?)(?![a-z])/, 'lieux'],
    [/^(?:vehicules?|voitures?)(?![a-z])/, 'vehicules'],
  ];
  return UNITES.find(([rx]) => rx.test(a))?.[1] || '';
}

/**
 * Nombres du DCE qui peuvent remplacer un nombre de GSS dans une phrase reprise (T10N-4) : seulement un nombre que le DCE
 * écrit avec la même unité que la phrase (« 30 minutes » pour « 30 minutes », jamais « 24 agents » tiré de « 24h/24 » ou
 * de la ligne 24 du BPU) ; sans unité, un nombre que le DCE écrit près d'un mot plein de la phrase de GSS. Phrase protégée
 * (effectif calculé par le programme : « équipe de N agents titulaires », équipe suppléante) : aucun.
 */
export function nombresDceCompatibles(ref: string, cand: string, dce: string, protege = false): Set<string> {
  const out = new Set<string>();
  if (!dce || protege) return out;
  const norm = (x: string) => normaliser(String(x || '')).replace(/\s+/g, ' ');
  const nCand = norm(cand), nDce = norm(dce);
  const refNums = new Set(faitsDePhrase(ref).filter((f) => f.startsWith('N:')));
  const pleins = new Set(norm(ref).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length >= 5));
  const MOTS = Object.entries(NOMBRES_MOTS);
  for (const m of nCand.matchAll(new RegExp(`(?<![a-z0-9.,])${NB}(?![a-z0-9])`, 'g'))) {
    const v = nombre(m[1]);
    const cle = `N:${v}`;
    if (refNums.has(cle) || out.has(cle)) continue;
    const unite = uniteApresNombre(nCand.slice(m.index! + m[0].length, m.index! + m[0].length + 20));
    const formes = [v.replace('.', '[.,]'), ...MOTS.filter(([, x]) => x === v).map(([w]) => w)].join('|');
    for (const d of nDce.matchAll(new RegExp(`(?<![a-z0-9.,])(?:${formes})(?![a-z0-9]|[.,]\\d)`, 'g'))) {
      const fin = d.index! + d[0].length;
      const u = uniteApresNombre(nDce.slice(fin, fin + 20));
      if (unite ? u === unite : (!u && nDce.slice(Math.max(0, d.index! - 60), fin + 60).replace(/[^a-z0-9 ]+/g, ' ').split(' ').some((w) => pleins.has(w)))) { out.add(cle); break; }
    }
  }
  return out;
}

/**
 * Vrai si les faits d'une phrase reprise sont ceux de la phrase de GSS. Seule exception : un nombre que le DCE impose
 * (présent dans autorises) peut remplacer celui de GSS (« le chiffre du DCE remplace celui de GSS : jamais les deux »).
 * Un intervalle, une borne ou un mot interdit changé n'est jamais accepté.
 */
export function faitsCompatibles(ref: string[], cand: string[], autorises: Set<string> = new Set()): boolean {
  const compte = (l: string[]) => l.reduce((m, f) => m.set(f, (m.get(f) || 0) + 1), new Map<string, number>());
  const a = compte(ref);
  const b = compte(cand);
  const ajoutes = [...b.keys()].filter((f) => (b.get(f) || 0) > (a.get(f) || 0));
  const retires = [...a.keys()].filter((f) => (a.get(f) || 0) > (b.get(f) || 0));
  if (!ajoutes.length && !retires.length) return true;
  if (ajoutes.some((f) => !f.startsWith('N:') || !autorises.has(f))) return false;
  return retires.every((f) => f.startsWith('N:')) && ajoutes.length > 0;
}

/**
 * Fidélité d'un texte au texte de référence : part (pondérée par le nombre de mots) des phrases de référence
 * conservées, une phrase étant conservée si une phrase du texte lui ressemble à 80 % au moins (un chiffre ou un nom
 * changé la conserve ; une phrase retirée ou réécrite ne l'est plus). Les ajouts ne changent pas la fidélité.
 */
export function fidelite(reference: string, texte: string, seuilPhrase = 0.8, autorises = ''): number {
  const ref = phrasesNormalisees(reference);
  if (!ref.length) return 1;
  const cand = phrasesNormalisees(texte);
  const faitsCand = cand.map((c) => faitsDePhrase(c.join(' ')));
  const nombresAutorises = nombresAutorisesDe(autorises);
  let conserve = 0;
  let total = 0;
  for (const p of ref) {
    total += p.length;
    const jeu = new Set(p);
    const faitsRef = faitsDePhrase(p.join(' '));
    let meilleur = 0;
    for (let k = 0; k < cand.length; k++) {
      const c = cand[k];
      let communs = 0;
      for (const w of c) if (jeu.has(w)) communs++;
      if (communs / Math.max(p.length, c.length) < seuilPhrase * 0.6) continue;
      // Chiffre, quantificateur (« une à trois », « au moins », « maximum ») ou mot interdit changé : ce n'est plus la
      // phrase de GSS (décision D7, consigne 5), même si presque tous ses mots sont là.
      if (!faitsCompatibles(faitsRef, faitsCand[k], nombresAutorises)) continue;
      meilleur = Math.max(meilleur, similarite(p, c));
      if (meilleur >= 0.999) break;
    }
    if (meilleur >= seuilPhrase) conserve += p.length;
  }
  return total ? conserve / total : 1;
}

/** Fonction d'appel au modèle fournie par le générateur (renvoie le texte JSON de la réponse). */
export type AppelModele = (messages: Array<{ role: 'system' | 'user'; content: string }>, libelle: string) => Promise<string>;

export interface ContexteAdaptation {
  client?: string;
  /** Exigences de la matrice rattachées à la rubrique. */
  exigences?: ExigenceMatrice[];
  /** Obligations chiffrées et horaires imposés du CCTP qui concernent la rubrique (phrases citées). */
  obligations?: string[];
  perimetre?: string;
  /** Analyse du DCE résumée (client, objet, sites, lots, durée…). */
  analyseCompacte?: string;
  /** Registre GSS (blocRegistre) et organigramme de référence. */
  registre?: string;
  /** Demande particulière de GSS pour cette rubrique. */
  demande?: string;
  dce?: string;
  horsNormandie?: boolean;
}

export interface OptionsAdaptation extends Omit<OptionsModifications, 'dce' | 'reference'> {
  /** Fidélité minimale au texte de référence (SEUIL_FIDELITE, 0,9, par défaut). */
  seuilFidelite?: number;
  /** « progressif » (défaut) : les modifications qui feraient passer sous le seuil sont refusées une à une ;
   *  « reference » : sous le seuil, la rubrique revient entièrement au texte de référence. */
  repli?: 'progressif' | 'reference';
}

export interface ResultatAdaptation {
  id: string;
  texte: string;
  fidelite: number;
  /** Vrai si la rubrique est revenue au texte de référence (modèle indisponible, réponse illisible, fidélité). */
  repli: boolean;
  raison?: string;
  appliquees: ModificationTraitee[];
  refusees: ModificationTraitee[];
  /** Le modèle a nié la mission décrite par la rubrique (« aucune ronde… », « n'est pas surveillé ») : la rubrique décrit une
   *  mission que le cahier des charges exclut ; extrait de GSS et texte proposé (T5CP-1). */
  missionExclue?: { extrait: string; par: string; motif?: string };
}

const CONSIGNE_ADAPTATION = `Tu adaptes UNE rubrique du mémoire technique de GSS (Global Security Services, sécurité privée, Rouen) au cahier des charges d'un appel d'offres.
Le texte de la rubrique est le texte de référence de GSS, déjà personnalisé (nom du client, chiffres du registre). Il doit rester celui de GSS : « si c'est toujours le même process, on remet la même réponse ».
Tu ne réécris RIEN. Tu proposes seulement des modifications ciblées, chacune sur un extrait recopié MOT POUR MOT du texte :
1. remplacements : un nom (site, bâtiment, service, fonction) écrit autrement dans le DCE ; un chiffre, un délai, une fréquence ou un horaire que le DCE impose et qui diffère du texte (le chiffre du DCE remplace celui de GSS : jamais les deux) ;
2. retraits : un passage hors du périmètre du marché ou contraire au DCE (poste, matériel, prestation que le CCTP ne prévoit pas ou interdit) ; les retraits restent exceptionnels : au moins 90 % du texte de GSS doit être conservé ;
3. ajouts (3 au plus, 60 mots chacun au plus) : une phrase pour une exigence du DCE propre à cette rubrique que le texte ne couvre pas, écrite avec les mots du DCE.
INTERDITS : inventer un chiffre, un nom, un moyen ou un engagement absent du DCE et du texte ; promettre un délai d'intervention hors Normandie que le DCE n'impose pas ; citer l'article L. 1224-1 si le DCE ne le cite pas ; parler de Covid ; écrire qu'un agent contrôle l'identité (il invite à justifier sa présence) ; présenter l'ISO 9001 comme obtenue (elle est en cours, prévue fin 2026) ; évoquer la sous-traitance ; écrire un commentaire interne (« non précisé », « à confirmer », « selon la documentation »…) ; citer un montant de pénalité. Une donnée propre au marché inconnue de GSS s'écrit « [À COMPLÉTER] ».
Si aucune modification n'est nécessaire, renvoie des listes vides.
Réponds UNIQUEMENT par un objet JSON : {"remplacements":[{"extrait":"…","par":"…","motif":"…"}],"retraits":[{"extrait":"…","motif":"…"}],"ajouts":[{"apres":"extrait exact après lequel insérer","texte":"…","motif":"…"}]}`;

/** Messages de la demande d'adaptation (préfixe commun en premier, pour le cache des prompts). */
export function consigneAdaptation(rubrique: RubriqueMemoireType, texte: string, ctx: ContexteAdaptation): Array<{ role: 'system' | 'user'; content: string }> {
  const commun = [
    ctx.analyseCompacte ? `ANALYSE DU MARCHÉ :\n${ctx.analyseCompacte}` : '',
    ctx.perimetre ? `PÉRIMÈTRE RÉEL DU MARCHÉ (d'après le CCTP) :\n${ctx.perimetre}` : '',
    ctx.registre ? `INFORMATIONS GSS :\n${ctx.registre}` : '',
    ctx.horsNormandie ? `MARCHÉ HORS DE NORMANDIE : ${ZONE_GSS} (aucune ville d'agence à inventer) ; aucun délai d'intervention, d'astreinte ou de remplacement chiffré, sauf s'il est imposé par le DCE.` : '',
  ].filter(Boolean).join('\n\n');
  const exigences = (ctx.exigences || []).map((e) => `- ${e.exigence}${e.criticite ? ` [${e.criticite}]` : ''}`).join('\n');
  const obligations = (ctx.obligations || []).map((o) => `- « ${o} »`).join('\n');
  const propre = [
    `RUBRIQUE : ${rubrique.titre}`,
    ctx.client ? `CLIENT : ${ctx.client}` : '',
    exigences ? `EXIGENCES DU DCE RATTACHÉES À CETTE RUBRIQUE :\n${exigences}` : 'EXIGENCES DU DCE RATTACHÉES À CETTE RUBRIQUE : aucune.',
    obligations ? `OBLIGATIONS CHIFFRÉES ET HORAIRES DU CCTP (cités mot pour mot) :\n${obligations}` : '',
    ctx.demande ? `DEMANDE PARTICULIÈRE DE GSS POUR CETTE RUBRIQUE : ${ctx.demande}` : '',
    `TEXTE DE LA RUBRIQUE (référence GSS) :\n<<<\n${texte}\n>>>`,
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: CONSIGNE_ADAPTATION },
    { role: 'user', content: `${commun ? `${commun}\n\n` : ''}${propre}` },
  ];
}

/** Lecture tolérante d'une réponse JSON (bloc de code, texte autour). */
export function lireJson(reponse: string): any {
  const t = String(reponse || '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(t); } catch { /* suite */ }
  const debut = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (debut >= 0 && fin > debut) {
    try { return JSON.parse(t.slice(debut, fin + 1)); } catch { /* illisible */ }
  }
  return null;
}

/**
 * Adapte une rubrique « adapte » au CCTP : un appel au modèle (fonction reçue en paramètre) propose des
 * modifications ciblées, appliquées seulement sur des extraits exacts et contrôlées ; la fidélité au texte de
 * référence doit rester au-dessus du seuil (SEUIL_FIDELITE, 0,9 : décision D7), sinon les modifications sont refusées (repli progressif) ou la
 * rubrique revient à la référence. Une rubrique « fixe » ou « besoin » est rendue telle quelle, sans appel.
 */
export async function adapterRubrique(rubrique: RubriqueMemoireType, textePubliposte: string, ctx: ContexteAdaptation, appelModele: AppelModele, options: OptionsAdaptation = {}): Promise<ResultatAdaptation> {
  const seuil = options.seuilFidelite ?? SEUIL_FIDELITE;
  const reference = textePubliposte;
  const sortie = (texte: string, repli: boolean, raison?: string, appliquees: ModificationTraitee[] = [], refusees: ModificationTraitee[] = []): ResultatAdaptation =>
    ({ id: rubrique.id, texte, fidelite: fidelite(reference, texte, 0.8, ctx.dce || ''), repli, raison, appliquees, refusees });
  if (rubrique.mode !== 'adapte') return sortie(reference, false, `rubrique « ${rubrique.mode} » : pas d'adaptation`);
  let mods: ModificationsProposees | null = null;
  try {
    mods = lireJson(await appelModele(consigneAdaptation(rubrique, reference, ctx), `Adaptation ${rubrique.id}`));
  } catch (e: any) {
    return sortie(reference, true, `appel au modèle impossible : ${e?.message || e}`);
  }
  if (!mods || typeof mods !== 'object') return sortie(reference, true, 'réponse du modèle illisible');
  // Effectifs calculés (équipe dédiée, équipe suppléante) : jamais réécrits par l'adaptation (T1F-3) ; seul l'assistant les
  // change, à la demande de GSS.
  const effectifs = /\{\{\s*(?:LIGNES_EQUIPE_DEDIEE|EFFECTIF_AGENTS|NB_AGENTS_RENFORT)\s*\}\}/.test(rubrique.texte || '')
    ? reference.split(/(?<=[.!?])\s+|\n+/).filter((ph) => /agents? titulaires?|[ée]quipe suppl[ée]ante de/i.test(ph) && /\d/.test(ph)) : [];
  const opts: OptionsModifications = { ...options, dce: ctx.dce, reference, sujetAjouts: options.sujetAjouts ?? sujetDeRubrique(rubrique), sujetsDelais: options.sujetsDelais ?? sujetsDelaisDuGabarit(rubrique.texte || ''), phrasesProtegees: [...(options.phrasesProtegees || []), ...phrasesGeneralesProtegees(rubrique.texte || '', reference), ...effectifs, ...phrasesDeFrequenceDeControle(reference)] };
  const tout = appliquerModifications(reference, mods, opts);
  const niee = tout.refusees.find((m) => m.raison === RAISON_MISSION_NIEE);
  if (niee) return { ...sortie(reference, true, 'mission niée par le cahier des charges', [], tout.refusees), missionExclue: { extrait: niee.extrait, par: niee.par || '', motif: niee.motif } };
  const fid = (t: string) => fidelite(reference, t, 0.8, ctx.dce || '');
  if (fid(tout.texte) >= seuil) return sortie(tout.texte, false, undefined, tout.appliquees, tout.refusees);
  if (options.repli === 'reference') {
    return sortie(reference, true, `fidélité ${fid(tout.texte).toFixed(2)} < ${seuil}`, [], [...tout.appliquees, ...tout.refusees].map((m) => ({ ...m, raison: m.raison || 'fidélité insuffisante' })));
  }
  // Repli progressif : les modifications acceptées une à une tant que la fidélité reste au-dessus du seuil.
  let texte = reference;
  const appliquees: ModificationTraitee[] = [];
  const refusees: ModificationTraitee[] = [...tout.refusees];
  for (const m of tout.appliquees) {
    const une: ModificationsProposees = m.type === 'remplacement' ? { remplacements: [{ extrait: m.extrait, par: m.par || '', motif: m.motif }] }
      : m.type === 'retrait' ? { retraits: [{ extrait: m.extrait, motif: m.motif }] }
        : { ajouts: [{ apres: m.extrait, texte: m.par || '', motif: m.motif }] };
    const essai = appliquerModifications(texte, une, { ...opts, maxModifications: 1 });
    if (essai.appliquees.length && fid(essai.texte) >= seuil) {
      texte = essai.texte;
      appliquees.push(m);
    } else refusees.push({ ...m, raison: essai.refusees[0]?.raison || 'fidélité au texte de référence insuffisante' });
  }
  return sortie(texte, appliquees.length === 0, appliquees.length ? undefined : 'aucune modification compatible avec la fidélité', appliquees, refusees);
}

// ─── Valeurs imposées par le CCTP (un appel, vérifié) ────────────────────────────────────────────

/**
 * Délais et fréquences imposés par le CCTP qui remplacent les valeurs de GSS dans tout le mémoire (cohérence
 * entre rubriques : jamais deux chiffres). Le modèle propose une valeur et la phrase exacte du DCE ; une proposition
 * n'est retenue que si la citation figure dans le DCE et contient chacun des chiffres de la valeur.
 */
export async function extraireValeursImposees(mt: MemoireType, dce: string, variables: Variables, appelModele: AppelModele): Promise<{ imposees: Record<string, { valeur: string; citation: string }>; refusees: Array<{ variable: string; raison: string }> }> {
  const cibles = VARIABLES_IMPOSABLES.filter((n) => mt.variables[n]);
  const lignes = cibles.map((n) => {
    const def = mt.variables[n];
    const v = variables[n];
    return `- ${n} : ${def.description} (valeur actuelle de GSS : ${variableRenseignee(v) ? valeurAffichee(n, v!, def) : 'aucune'})`;
  }).join('\n');
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: `Tu lis le DCE d'un marché de sécurité privée (CCTP en priorité). Pour chaque variable listée, indique la valeur que le DCE IMPOSE explicitement (délai, fréquence, échéance), écrite comme la valeur de GSS (ex. « 30 minutes », « 1 heure », « une fois par mois », « J-7 », « tous les deux mois »), avec la phrase exacte du DCE qui l'impose. N'invente rien : si le DCE n'impose rien pour une variable, ne la cite pas.
Réponds UNIQUEMENT par un objet JSON : {"valeurs":[{"variable":"NOM","valeur":"…","citation":"phrase exacte du DCE"}]}`,
    },
    { role: 'user', content: `VARIABLES :\n${lignes}\n\nDCE :\n${String(dce || '').slice(0, 110_000)}` },
  ];
  const imposees: Record<string, { valeur: string; citation: string }> = {};
  const refusees: Array<{ variable: string; raison: string }> = [];
  let rep: any = null;
  try { rep = lireJson(await appelModele(messages, 'Valeurs imposées par le CCTP')); } catch (e: any) {
    return { imposees, refusees: [{ variable: '*', raison: `appel au modèle impossible : ${e?.message || e}` }] };
  }
  const dceNorm = normaliser(dce).replace(/[^a-z0-9']+/g, ' ');
  for (const x of Array.isArray(rep?.valeurs) ? rep.valeurs : []) {
    const nom = String(x?.variable || '');
    const valeur = valeurPropre(x?.valeur);
    const citation = String(x?.citation || '').trim();
    if (!cibles.includes(nom)) { refusees.push({ variable: nom, raison: 'variable non imposable' }); continue; }
    if (!valeur || !citation) { refusees.push({ variable: nom, raison: 'valeur ou citation absente' }); continue; }
    if (!dceNorm.includes(normaliser(citation).replace(/[^a-z0-9']+/g, ' ').trim())) { refusees.push({ variable: nom, raison: 'citation introuvable dans le DCE' }); continue; }
    // Délai d'un sujet (DELAI_PTI) cité d'une phrase d'un autre sujet (intervention sur alarme) : refusé.
    const sujetV = SUJET_VARIABLE_DELAI[nom];
    if (sujetV !== undefined) {
      const def = sujetV ? SUJETS_DELAI[sujetV] : null;
      // Phrase du DCE qui contient la citation (une citation peut n'être qu'un fragment : « présent sur site dans un délai
      // maximal de 30 minutes »).
      const cit = normaliser(citation).replace(/[^a-z0-9']+/g, ' ').trim();
      const phrase = phrasesEntieresDuDce(dce).find((ph) => normaliser(ph).replace(/[^a-z0-9']+/g, ' ').includes(cit)) || citation;
      // Même classement, proposition par proposition, que la lecture de secours (T1-GEN-2) : la durée du modèle doit être
      // un délai du sujet lu dans la phrase ; une phrase dont aucun délai n'est lisible garde le contrôle par sujet.
      const lus = sujetV ? delaisDePhrase(phrase, sujetV as keyof typeof SUJETS_DELAI) : [];
      const minutesValeur = dureesEnMinutes(valeur)[0];
      const tousDelais = (Object.keys(SUJETS_DELAI) as Array<keyof typeof SUJETS_DELAI>).flatMap((s2) => delaisDePhrase(phrase, s2));
      const accepte = !def ? false
        : lus.length ? (minutesValeur === undefined || lus.some((d) => d.minutes === minutesValeur))
          : !tousDelais.length && propositionsDe(phrase).some((p2) => propositionDuSujet(p2, phrase, sujetV as keyof typeof SUJETS_DELAI));
      if (!accepte) {
        refusees.push({ variable: nom, raison: 'citation d\'un autre sujet que celui du délai' }); continue;
      }
    }
    // Durée : comparée en minutes à celles de la citation (« vingt-cinq minutes » = « 25 minutes », « 1 h 30 » = « 90
    // minutes », T1-GEN-3) ; autre valeur : chiffres comparés.
    const dureeValeur = dureesEnMinutes(valeur);
    if (dureeValeur.length) {
      const dureesCitation = new Set(dureesEnMinutes(citation));
      const absentes = dureeValeur.filter((d) => !dureesCitation.has(d));
      if (absentes.length) { refusees.push({ variable: nom, raison: `durée absente de la citation (${absentes.join(', ')} minutes)` }); continue; }
    } else {
      const nombresCitation = new Set(nombresDe(citation));
      const etrangers = nombresDe(valeur).filter((n) => !nombresCitation.has(n));
      if (etrangers.length) { refusees.push({ variable: nom, raison: `chiffre absent de la citation (${etrangers.join(', ')})` }); continue; }
    }
    // Délai : la durée seule, la phrase de GSS porte déjà « en … au maximum » ; refusé si un qualificatif reste (T4-CONS-4).
    if (sujetV !== undefined && !delaiImposeNet(valeur)) { refusees.push({ variable: nom, raison: `délai avec un qualificatif (« ${valeur} »)` }); continue; }
    imposees[nom] = { valeur: sujetV !== undefined ? delaiImposeNet(valeur) : valeur, citation };
  }
  return { imposees, refusees };
}
