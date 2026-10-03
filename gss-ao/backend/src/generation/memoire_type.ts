import fs from 'fs';
import path from 'path';
import { lignesEquipe, questionDimensionnement, PART_SUPPLEANTS, type Dimensionnement } from './dimensionnement';
import { horairesImposes, jalonsDe, jalonsChronologiques, marcheHorsNormandie, sitesDuMarche, obligationsChiffrees, retirerCommentairesInternes, rolesOrganigramme, ZONE_GSS, recopieDuDce, motifCovidInterdit, graphieMinusculeGss } from './base_memoires';

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
  'FREQ_CONTROLE_3', 'CONTROLES_INOPINES_MENSUELS', 'FREQ_REUNIONS', 'RESPONSABLE_APR',
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
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 400) return '';
  if (MENTION_NON_RENSEIGNEE.test(t) || /^(acheteur inconnu|objet non sp[ée]cifi[ée]|non sp[ée]cifi[ée]|undefined|null)$/i.test(t)) return '';
  return t;
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
function phrasesDuDce(dce: string): string[] {
  return String(dce || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
    .split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/)
    .map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦−]\s*/, '').trim())
    .filter((x) => x.length >= 12 && x.length <= 600);
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

export function normaliserDelai(v: string): string {
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
const NEGATION = /(?<![\wÀ-ÿ])(?:(?:aucune?|ni|exclue?s?)(?![\wÀ-ÿ])|pas\s+d(?:e(?![\wÀ-ÿ])|['’])|hors\s+(?:du\s+)?p[ée]rim[èe]tre|non\s+(?:exig|requis|demand|pr[ée]vu|concern|applicable|inclu)|n['’](?:est|exige|implique)\s+pas(?![\wÀ-ÿ])|ne\s+(?:sont|requi[eè]r[\wÀ-ÿ]*|n[ée]cessit[\wÀ-ÿ]*|compren[\wÀ-ÿ]*|comprend)\s+pas(?![\wÀ-ÿ])|sans\s+objet)/i;
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

/** Évalue chaque indicateur du mémoire type (vrai/faux, avec les raisons). */
export function evaluerIndicateurs(mt: MemoireType, ctx: ContexteMarche): Record<string, EtatIndicateur> {
  const dce = String(ctx.dce || '').replace(/[’`]/g, "'").replace(/\s+/g, ' ');
  const analyse = texteAnalyse(ctx.analyse);
  const secteur = valeurPropre(ctx.analyse?.clientSector);
  const matrice = (ctx.matrice || []).filter((e) => e && e.exigence);
  const out: Record<string, EtatIndicateur> = {};
  // Indicateurs qui déclenchent un engagement de GSS (valeur_si_exige : « au moins trois fois par mois ») : une
  // exigence de la matrice, reformulée par le modèle, ne compte que si le DCE contient lui-même le motif.
  const engageants = new Set(Object.values(mt.variables).filter((v) => v.valeur_si_exige && v.indicateur_exige).map((v) => v.indicateur_exige!));
  const dceNorm = normaliser(dce);
  for (const [nom, def] of Object.entries(mt.indicateurs)) {
    const raisons: string[] = [];
    let valeur = false;
    if (def.choix_gss) {
      valeur = ctx.choix?.indicateurs?.[nom] ?? def.defaut ?? false;
      if (valeur) raisons.push('choix de GSS');
    } else if (def.calcul === 'hors_normandie') {
      valeur = ctx.horsNormandie ?? marcheHorsNormandie(ctx.analyse || {}, ctx.dce || '');
      raisons.push(valeur ? 'codes postaux hors Normandie' : 'site en Normandie (ou aucun code postal)');
    } else {
      if (def.dce) {
        const rx = new RegExp(def.dce, 'i');
        const m = rx.exec(dce);
        if (m) raisons.push(`DCE : « ${extrait(dce, m.index, m[0].length)} »`);
        const e = matrice.find((x) => rx.test(x.exigence));
        const sourceDce = !engageants.has(nom) || (def.motif_dce ? dceNorm.includes(normaliser(def.motif_dce)) : !!m);
        if (e && sourceDce) raisons.push(`exigence : « ${e.exigence.slice(0, 120)} »`);
        else if (e) console.log(`[MemoireType] Indicateur ${nom} : exigence de la matrice écartée, motif absent du DCE (« ${e.exigence.slice(0, 120)} »).`);
      }
      if (def.analyse) {
        const m = new RegExp(def.analyse, 'i').exec(analyse);
        if (m) raisons.push(`analyse : « ${extrait(analyse, m.index, m[0].length)} »`);
      }
      if (def.secteur && secteur && new RegExp(def.secteur, 'i').test(secteur)) raisons.push(`secteur du client : ${secteur}`);
      if (def.matrice?.length && (!engageants.has(nom) || (def.motif_dce ? dceNorm.includes(normaliser(def.motif_dce)) : raisons.some((r) => r.startsWith('DCE'))))) {
        const rxDce = def.dce ? new RegExp(def.dce, 'i') : null;
        const rattachees = matrice.filter((x) => x.rubrique && def.matrice!.includes(x.rubrique));
        const e = rattachees.find((x) => !rxDce || rxDce.test(x.exigence.replace(/[’`]/g, "'")));
        if (e) raisons.push(`exigence rattachée à ${e.rubrique} : « ${e.exigence.slice(0, 120)} »`);
        else if (rattachees.length && !raisons.length) console.log(`[MemoireType] Indicateur ${nom} : exigence rattachée à ${rattachees[0].rubrique} écartée, motif de l'indicateur absent de son texte (« ${rattachees[0].exigence.slice(0, 120)} »).`);
      }
      // Preuve exigée dans le DCE lisible : l'analyse, le secteur ou la matrice seuls ne suffisent pas (T4N-3).
      if (def.preuve_dce && dce.length >= 2000 && raisons.length && !raisons.some((r) => r.startsWith('DCE'))) {
        console.log(`[MemoireType] Indicateur ${nom} : écarté, aucune mention dans le DCE (${raisons.join(' ; ').slice(0, 200)}).`);
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
}

export type Variables = Record<string, ValeurVariable>;

/** Vrai si la variable a une valeur exploitable. */
export function variableRenseignee(v?: ValeurVariable): boolean {
  if (!v) return false;
  const x = v.valeur;
  if (typeof x === 'boolean') return x;
  if (Array.isArray(x)) return x.some((y) => String(y).trim());
  return !!x && !!String(x).trim() && String(x).trim() !== '[À COMPLÉTER]';
}

const ARTICLES_MASCULINS = /^(?:centre|conseil|d[ée]partement|minist[èe]re|mus[ée]e|syndicat|groupement|chu|chr|chb|service|p[ôo]le|parc|port|palais|tribunal|th[ée][âa]tre|lyc[ée]e|coll[èe]ge|rectorat|cr[ée]dit|comit[ée]|campus|grand|bailleur|crous|sdis|march[ée]|conservatoire|stade|ccas|centre-?ville)$/i;
const ARTICLES_FEMININS = /^(?:r[ée]gion|ville|mairie|commune|communaut[ée]|m[ée]tropole|caisse|caf|cpam|chambre|direction|pr[ée]fecture|fondation|banque|cour|mutualit[ée]|maison|cit[ée]|soci[ée]t[ée]|r[ée]gie|r[ée]sidence|clinique|f[ée]d[ée]ration|poste|biblioth[èe]que|m[ée]diath[èe]que|sncf|ratp|direction)$/i;

/**
 * Article du nom de l'acheteur, lu d'abord dans le DCE (« sites de l'ACOSS », « du Centre Henri Becquerel »), puis
 * déduit du premier mot (« Région » → la ; « Centre » → le ; voyelle → l'). Sans indice : pas d'article.
 */
export function articleEtNom(brut: string, dce = ''): { article: string; nom: string } {
  let nom = brut.replace(/\s+/g, ' ').trim();
  const m0 = /^(le|la|les)\s+(.+)$/i.exec(nom) || /^(l['’])\s*(.+)$/i.exec(nom);
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
    const meilleur = Object.entries(compte).sort((a, b) => b[1] - a[1])[0];
    if (meilleur) return { article: meilleur[0], nom };
  }
  const premier = nom.split(/[\s(]/)[0];
  // Voyelle (« l'ACOSS », « l'Université ») ou h muet courant (« l'Hôtel », « l'Hôpital »).
  if (/^[aeiouâàäéèêëîïôöûüœ]/i.test(premier) || /^h(?:[ôo]tel|[ôo]pital|abitat)/i.test(premier)) return { article: "l'", nom };
  if (ARTICLES_MASCULINS.test(premier)) return { article: 'le', nom };
  if (ARTICLES_FEMININS.test(premier)) return { article: 'la', nom };
  return { article: '', nom };
}

/** Forme juridique d'une société (« S.P.L. », « SAS », « SEM »…) : l'acheteur est une société, donc féminin. */
const FORME_SOCIETE = /^(?:s\.?\s?p\.?\s?l\.?\s?a?\.?|s\.?\s?e\.?\s?m\.?\s?l?\.?|s\.?\s?a\.?\s?s?\.?\s?u?\.?|s\.?\s?a\.?\s?r\.?\s?l\.?|soci[ée]t[ée]\s+(?:publique|anonyme|d['’][ée]conomie)[^,]*?)(?=\s)/i;

/** Article d'un sigle : « l' » devant une voyelle, sinon celui de l'entité (« le CHU ») ; '' si inconnu. */
function articleSigle(sigle: string, articleEntite: string): string {
  if (/^[AEIOUYÉÈ]/.test(sigle)) return "l'";
  return articleEntite === 'le' || articleEntite === 'la' || articleEntite === 'les' ? articleEntite : '';
}

/** Forme juridique (jamais une forme courte du nom de l'acheteur : « le Groupement d'Intérêt Public » n'est pas l'IFITS). */
const FORME_JURIDIQUE = /^(?:groupement d.int[ée]r[êe]t public|g\.?i\.?p\.?|[ée]tablissement public(?: [àa] caract[èe]re [^)]*| administratif| industriel et commercial| local)?|e\.?p\.?[ai]\.?c?\.?|association(?: loi 1901)?|syndicat mixte|soci[ée]t[ée] (?:publique locale|d.[ée]conomie mixte|anonyme|par actions simplifi[ée]e)|s\.?e\.?m\.?|s\.?p\.?l\.?|s\.?a\.?s\.?u?|s\.?a\.?r\.?l\.?)$/i;

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
export function casseDuDce(nom: string, dce: string): string {
  // Nom avec une parenthèse (imm : « ASSOCIATION NOUVEL INSTITUT MÉDICO-CHIRURGICAL MONTSOURIS (Nouvel IMM) ») : la partie
  // hors parenthèse prend la graphie du DCE, la parenthèse (nom d'usage, sigle) reste telle quelle.
  const par = /^([^()]+?)(\s*\([^()]*\).*)$/.exec(nom);
  if (par) {
    const tete = casseDuDce(par[1], dce);
    return tete ? `${tete}${par[2]}` : '';
  }
  const lettres = nom.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!lettres || lettres.replace(/[^A-ZÀ-Ý]/g, '').length / lettres.length <= 0.7 || !dce) return '';
  // 1. Le nom entier écrit en casse mêlée dans le DCE (comparaison sans casse ni accents, mots consécutifs) : graphie reprise
  //    telle quelle (parc_expo 202 : « Rouen Normandie Evènements », jamais « Rouen Normandie événements », nom commun).
  const entier = graphieEntiereDuDce(nom, dce);
  if (entier) return entier !== nom ? entier : '';
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
  const sortie = nom.replace(/[A-Za-zÀ-ÿ]+/g, (mot) => {
    const k = cle(mot);
    let r: string;
    const f = formes.get(k);
    const minuscules = [...(f?.entries() || [])].filter(([w]) => w === w.toLowerCase()).sort((a, b) => b[1] - a[1]);
    const capitalises = [...(f?.entries() || [])].filter(([w]) => w.length > 1 && w[0] !== w[0].toLowerCase() && w.slice(1) === w.slice(1).toLowerCase()).sort((a, b) => b[1] - a[1]);
    const nbMin = minuscules.reduce((t, x) => t + x[1], 0);
    const nbCap = capitalises.reduce((t, x) => t + x[1], 0);
    if (MOTS_OUTILS.has(k) && !premier) r = mot.toLowerCase();
    else if (nbCap && nbCap > 2 * nbMin) r = capitalises[0][0];
    else if (nbMin) r = minuscules[0][0];
    else if (nbCap) r = capitalises[0][0];
    // Sigle écrit en capitales dans le DCE : mot court ou sans voyelle (« IGN », « SDIS ») ; un mot plein (« CENTRE », cstb
    // 221 : « Le CENTRE scientifique… ») prend la graphie en minuscules des textes de GSS, sinon le nom reste en capitales.
    else if (f?.has(mot) && (mot.length <= 5 || !/[AEIOUYÀ-Ý]/.test(mot))) r = mot;
    else if (graphieMinusculeGss(mot)) r = graphieMinusculeGss(mot);
    else { ok = false; r = mot; }
    if (premier) r = r.charAt(0).toUpperCase() + r.slice(1);
    // Nom précédé de son article (« LE CENTRE SCIENTIFIQUE… ») : le premier mot du nom garde sa majuscule (« Le Centre… »).
    premier = premier && /^(?:le|la|les|l)$/.test(k);
    return r;
  });
  return ok && sortie !== nom ? sortie : '';
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
  const m = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]+(?:\s+(?!(?:de|du|des|et|en|pour|sur)\b)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]+){0,2})\s+(?:de|du|des|d['’])(?![A-Za-zÀ-ÿ])/i.exec(String(nom || '').trim());
  if (!m || m[1].split(/\s+/).length >= String(nom).trim().split(/\s+/).length) return '';
  const t = m[1];
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
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
export function formesClient(nom: string, dce = ''): { long: string; court?: { article: string; nom: string; genre?: 'f' | 'm' | '' }; pluriel?: boolean } {
  const n = sansFormeJuridiqueFinale(nom);
  const iPrecision = n.search(/,\s*(?:pour|agissant|repr[ée]sent[ée]e?s?|au nom|en qualit[ée] de)\b/i);
  const principal = iPrecision > 0 ? n.slice(0, iPrecision) : n;
  const suite = iPrecision > 0 ? n.slice(iPrecision) : '';
  // Entités coordonnées : séparées après la parenthèse d'un sigle (« (ENPC) et Institut … »), jamais dans un nom
  // (« Ponts et Chaussées »).
  const entites = principal.split(/(?<=\))\s*(?:,|\s+et)\s+(?=[A-ZÀ-Ý])/).map((x) => x.trim()).filter(Boolean);
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
  if (entites.length === 1 && !suite && (juridique || (mots >= 5 && mots <= 6 && !parenthese))) {
    const sigle = sigleDuDce(juridique ? principal.replace(/\s*\([^()]*\)\s*$/, '') : principal, dce);
    const art = sigle ? articleEtNom(sigle, dce).article || articleSigle(sigle, '') : '';
    if (sigle && art) return { long, court: { article: art, nom: sigle, genre: '' } };
  }
  if (mots <= 6) return { long, pluriel };
  // Sigle d'usage entre parenthèses au milieu du nom, que le DCE emploie (ca_normandie 241 : « Ministère de la Justice –
  // Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen »,
  // 8 fois en entier dans le cadre) : forme courte « le SAR de Rouen » ; le programme budgétaire (« BOP Normand ») n'est
  // pas un second acheteur.
  {
    const usageSigle = (/\(([A-Z]{2,6}(?:\s+(?:de|du|des|d['’])\s*[A-ZÀ-Ý][\wÀ-ÿ'’-]*)?)\)/.exec(principal) || [])[1];
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
  if (entites.length === 1 && !suite && /\s[–—-]\s/.test(principal)) {
    let entite = principal.split(/\s[–—-]\s/).pop()!.split(/\s+\/\s+|\s*\(/)[0].trim();
    // Service de l'acheteur après le tiret (« Ville du Havre - Direction de la commande publique », « CHU de Rouen –
    // Direction des achats », en capitales aussi) : ce n'est pas l'acheteur ; la forme courte est la tutelle (« la Ville
    // du Havre », « le CHU de Rouen »). Un service qui est lui-même l'acheteur (« Service administratif régional de
    // Rouen ») reste la forme courte.
    if (SERVICE_ACHETEUR.test(entite)) entite = principal.split(/\s[–—-]\s/)[0].trim();
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
  if (entites.length === 1 && mots > 8) {
    const tete = teteNominale(principal);
    const a = tete ? articleEtNom(tete, dce) : null;
    if (tete && a?.article) return { long, court: { article: a.article, nom: a.nom || tete, genre: genreTete(tete) } };
  }
  return { long, pluriel };
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
  const rx = new RegExp(`(?:date (?:pr[ée]visionnelle |effective )?de d[ée]marrage|d[ée]marrage (?:effectif )?des prestations|d[ée]but (?:d.ex[ée]cution|des prestations)|prise d.effet)[^.;]{0,160}?(?:fix[ée]e?|estim[ée]e?|pr[ée]vue?)?\\s*(?:au|le|à compter du)\\s+((?:1er|\\d{1,2})\\s+(?:${MOIS})\\s+\\d{4})`, 'i');
  const m = rx.exec(d);
  return m ? m[1].replace(/\s+/g, ' ') : '';
}

const NOMBRES_LETTRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15,
  vingt: 20, trente: 30, quarante: 40, 'quarante-cinq': 45, cinquante: 50, soixante: 60,
};

const RX_DELAI = /(?:dans|sous|en moins de|d[ée]lai(?:\s+maxim(?:al|um))?\s+de|au plus tard (?:dans|en))\s+(?:les\s+|un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+)?(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|dix|douze|quinze|vingt|trente|quarante-cinq|quarante|soixante)\s*(?:\(\s*(\d{1,3})\s*\)\s*)?(minutes?|mn|min|heures?|h)(?![\wÀ-ÿ])/gi;

/** Sujets des délais que le CCTP peut imposer. */
const SUJETS_DELAI: Record<string, { sujet: RegExp; exclure?: RegExp; objet?: RegExp; personnel?: RegExp }> = {
  // « absence prévue / prévisible » (préavis) exclue ; « absence imprévue », « effectif prévu » gardés.
  // Le remplacement d'un OBJET (rouen_univ : « En cas de panne ils devront être remplacés en moins de 24H par un véhicule
  // équivalent ») n'est pas le remplacement d'un agent : la phrase est écartée quand elle nomme un objet sans nommer le
  // personnel (T4C-4 : l'agent d'astreinte était annoncé « sur site en 24 heures maximum »).
  remplacement: {
    sujet: /rempla[cç]/i, exclure: /absences? (?:pr[ée]vues?|pr[ée]visibles?)|(?<![\wÀ-ÿ])pr[ée]visibles?(?![\wÀ-ÿ])|[àa] l.avance|planning/i,
    objet: /v[ée]hicules?|t[ée]l[ée]phones?|mat[ée]riels?|(?<![\wÀ-ÿ])cl[ée]s?(?![\wÀ-ÿ])|cylindres?|badges?|[ée]quipements?|batteries?|(?<![\wÀ-ÿ])pannes?(?![\wÀ-ÿ])|appareils?|terminal|terminaux|radios?|talkies?|uniformes?|tenues?/i,
    personnel: /agents?|personnels?|effectifs?|postes?|absen|d[ée]faillan|salari[ée]s?|vacations?|rondiers?|gardiens?|SSIAP|chefs?|rempla[cç]ants?/i,
  },
  alarme: { sujet: /alarme|t[ée]l[ée]\s?-?surveillance|lev[ée]e de doute|d[ée]clenchement/i, exclure: /(?<![\wÀ-ÿ])(?:PTI|DATI)(?![\wÀ-ÿ])|travailleur isol/i },
  pti: { sujet: /(?<![\wÀ-ÿ])(?:PTI|DATI)(?![\wÀ-ÿ])|travailleur isol/i },
  commande: { sujet: /bons? de commande|commandes? (?:compl[ée]mentaires?|suppl[ée]mentaires?)|prestations? (?:ponctuelles?|exceptionnelles?|suppl[ée]mentaires?)/i, exclure: /pr[ée]venance/i },
  ssi: { sujet: /(?<![\wÀ-ÿ])SSI(?![\wÀ-ÿ])|s[ée]curit[ée] incendie/i },
};

/**
 * Délai imposé par le DCE pour un sujet (« le personnel de remplacement dans les UNE (1) heure » → « 1 heure »).
 * Plusieurs valeurs différentes pour le même sujet : ambigu → '' (l'adaptation et les contrôles s'en chargent).
 */
export function delaiDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): string {
  const def = SUJETS_DELAI[sujet];
  const valeurs = new Set<string>();
  for (const ph of phrasesDuDce(dce)) {
    if (!def.sujet.test(ph) || def.exclure?.test(ph)) continue;
    if (def.objet?.test(ph) && !def.personnel?.test(ph)) continue;
    if (sujet === 'ssi' && !/d[ée]faillan|hors service|d[ée]rangement/i.test(ph)) continue;
    for (const m of ph.matchAll(RX_DELAI)) {
      const n = m[2] ? Number(m[2]) : (/^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES_LETTRES[m[1].toLowerCase()]);
      if (!n) continue;
      valeurs.add(normaliserDelai(`${n} ${m[3]}`));
    }
  }
  return valeurs.size === 1 ? [...valeurs][0] : '';
}

/** Phrase du DCE d'où delaiDuDce tire le délai imposé d'un sujet ('' si aucune) : citée à GSS comme exigence du CCTP (D8). */
export function phraseDelaiDuDce(dce: string, sujet: keyof typeof SUJETS_DELAI): string {
  const def = SUJETS_DELAI[sujet];
  for (const ph of phrasesDuDce(dce)) {
    if (!def.sujet.test(ph) || def.exclure?.test(ph)) continue;
    if (def.objet?.test(ph) && !def.personnel?.test(ph)) continue;
    if (sujet === 'ssi' && !/d[ée]faillan|hors service|d[ée]rangement/i.test(ph)) continue;
    if ([...ph.matchAll(RX_DELAI)].length) return ph;
  }
  return '';
}

/** Phrase entière du DCE qui contient une citation (une citation peut n'en être qu'un fragment) ; sinon la citation. */
export function phraseDuDceContenant(dce: string, citation: string): string {
  const cit = normaliser(citation).replace(/[^a-z0-9']+/g, ' ').trim();
  if (!cit) return citation;
  return phrasesDuDce(dce).find((ph) => normaliser(ph).replace(/[^a-z0-9']+/g, ' ').includes(cit)) || citation;
}

const FREQUENCES: Array<[RegExp, string]> = [
  [/bimestriel(?:le)?s?|tous les deux mois/i, 'tous les deux mois'],
  [/semestriel(?:le)?s?|tous les six mois|chaque semestre/i, 'chaque semestre'],
  [/trimestriel(?:le)?s?|tous les trois mois|chaque trimestre|une fois par trimestre/i, 'chaque trimestre'],
  [/(?<!bi|tri|se)mensuel(?:le)?s?|tous les mois|chaque mois|une fois par mois/i, 'chaque mois'],
  [/hebdomadaires?|chaque semaine|toutes les semaines|une fois par semaine/i, 'chaque semaine'],
  [/(?<![\wÀ-ÿ])annuel(?:le)?s?|chaque ann[ée]e|une fois par an(?![\wÀ-ÿ])/i, 'chaque année'],
];

/** Fréquence des réunions de suivi imposée par le DCE (une seule fréquence citée, sinon ''). */
export function frequenceReunionsDce(dce: string): string {
  const trouvees = new Map<string, boolean>();
  for (const ph of phrasesDuDce(dce)) {
    if (!/r[ée]unions?/i.test(ph)) continue;
    for (const [rx, libelle] of FREQUENCES) {
      if (rx.test(ph)) trouvees.set(libelle, (trouvees.get(libelle) || false) || /au (?:minimum|moins)/i.test(ph));
    }
  }
  if (trouvees.size !== 1) return '';
  const [[libelle, minimum]] = [...trouvees.entries()];
  return minimum ? `au minimum ${libelle}` : libelle;
}

/** Fondement juridique de la reprise CITÉ PAR LE DCE (jamais d'article L. 1224-1 si le DCE ne le cite pas). */
export function fondementRepriseDce(dce: string): string {
  const d = String(dce || '').replace(/\s+/g, ' ');
  const parts: string[] = [];
  if (/L\.?\s?1224-1/.test(d)) parts.push("l'article L. 1224-1 du Code du travail");
  if (/accord du 5 mars 2002/i.test(d)) parts.push(`l'accord du 5 mars 2002 relatif à la reprise du personnel${/avenant du 28 janvier 2011/i.test(d) ? ', modifié par l\'avenant du 28 janvier 2011' : ''}`);
  else if (/annexe VII/i.test(d) && /convention collective/i.test(d)) parts.push("l'annexe VII de la convention collective nationale des entreprises de prévention et de sécurité");
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
  const texteDce = String(dce || '');
  const an = texteAnalyse(analyse);
  const incendie = texteDce.replace(/\s+/g, ' ').length < 2000 || PREUVE_INCENDIE.test(texteDce.replace(/\s+/g, ' '));
  const t = `${texteDce} ${incendie ? an : an.replace(/S\.?S\.?I\.?A\.?P\.?(?:\s*(?:[123]|I{1,3})(?![\wÀ-ÿ]))?/gi, '')}`.replace(/\s+/g, ' ');
  const out: string[] = [];
  if (/SSIAP\s*(?:3|III)(?![\wÀ-ÿ])/i.test(t)) out.push('SSIAP 3');
  if (/SSIAP\s*(?:2|II)(?![\wÀ-ÿ])/i.test(t)) out.push('SSIAP 2');
  if (/SSIAP\s*(?:1|I)(?![\wÀ-ÿ])|SSIAP(?!\s*(?:[23]|II))/i.test(t)) out.push('SSIAP 1');
  if (/CQP\s*-?\s*APS|CQPAPS|certificat de qualification professionnelle d.agent de pr[ée]vention/i.test(t)) out.push('CQP APS');
  if (/(?<![\wÀ-ÿ])SST(?![\wÀ-ÿ])|sauveteur secouriste du travail/i.test(t)) out.push('SST');
  if (/PSC\s*1/i.test(t)) out.push('PSC1');
  if (/H0\s*-?\s*B0|H0V|habilitation [ée]lectrique/i.test(t)) out.push('habilitation électrique H0B0');
  return out;
}

/** Communes des sites (codes postaux du début du DCE, sinon noms des sites). */
function villesDuMarche(dce: string, analyse: any): string[] {
  const out: string[] = [];
  for (const m of String(dce || '').slice(0, 30000).matchAll(/(?<!\d)(\d{5})\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ -][A-Za-zÀ-ÿ'’]+){0,4})/g)) {
    const ville = m[2].replace(/\s+(?:cedex|CEDEX|Cedex).*$/, '').replace(/\s+(?:t[ée]l|tel|fax|courriel|mail)\b.*$/i, '').trim();
    const propre = ville === ville.toUpperCase() ? ville.charAt(0) + ville.slice(1).toLowerCase() : ville;
    if (propre.length >= 3 && !out.includes(propre)) out.push(propre);
    if (out.length >= 3) break;
  }
  if (out.length) return out;
  return (Array.isArray(analyse?.sites) ? analyse.sites : []).map((s: any) => valeurPropre(s?.name)).filter(Boolean).slice(0, 3);
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
  if (c.qualifs.includes('SSIAP 3')) lignes.push(['Chef de service de sécurité incendie', 'SSIAP 3']);
  if (c.qualifs.includes('SSIAP 2')) lignes.push(["Chef d'équipe de sécurité incendie", 'SSIAP 2']);
  if (c.qualifs.includes('SSIAP 1')) lignes.push(['Agent de sécurité incendie', 'SSIAP 1']);
  const ads = /(?<![\wÀ-ÿ])ADS(?![\wÀ-ÿ])|agents? de (?:s[ée]curit[ée](?! incendie)|surveillance|s[ûu]ret[ée])/i.test(String(c.ctx.dce || ''));
  if (!c.ind.SSIAP || ads || c.qualifs.includes('CQP APS')) lignes.push(['Agent de sécurité', 'CQP APS']);
  if (c.ind.CYNOPHILE) lignes.push(['Agent cynophile', 'CQP APS – qualification cynophile']);
  if (c.ind.TELESURVEILLANCE) lignes.push(['Rondier intervenant', 'CQP APS']);
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
    return q.length ? q : c.qualifs;
  }
  const tableau = lignesEquipeParQualification(c).map(([, q]) => q).join(' ; ');
  const q = qualificationsDuDce(tableau);
  const autres = c.qualifs.filter((x) => !/^SSIAP|^CQP APS$/.test(x));
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
  if (c.horsNormandie && def?.normandie_seulement) {
    const objet = `${def.description.charAt(0).toLowerCase()}${def.description.slice(1).replace(/[.\s]+$/, '')}`;
    // Sites mixtes (T4-COH-3) : la question nomme les sites hors Normandie et rappelle le délai normand de GSS.
    const sites = sitesDuMarche(c.ctx.analyse || {}, c.ctx.dce || '');
    if (sites.mixte) {
      const normand = def.registre ? depuisRegistre(c, def.registre, normaliserDelai).valeur : def.valeur_gss || '';
      return { valeur: null, question: `Marché en partie hors Normandie (${sites.horsNormandie.length > 1 ? 'sites' : 'site'} de ${listeFr(sites.horsNormandie)}) : ${normand ? `GSS annonce ${normand} en Normandie pour ce délai (${objet}) ; ` : ''}quel délai GSS annonce-t-elle pour ${sites.horsNormandie.length > 1 ? 'les sites' : 'le site'} de ${listeFr(sites.horsNormandie)}${normand ? '' : ` (${objet})`} ?` };
    }
    return { valeur: null, question: `Marché hors Normandie : quel délai GSS annonce-t-elle (${objet}) ?` };
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
    const couverture = valeurPropre(c.ctx.cover?.client);
    const analyse = valeurPropre(c.ctx.analyse?.clientName);
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
    if (FORME_SOCIETE.test(brut) && brut.replace(FORME_SOCIETE, '').trim()) brut = brut.replace(FORME_SOCIETE, '').trim();
    brut = sansFormeJuridiqueFinale(brut);
    // Nom resté en capitales (page de garde et analyse en capitales) : graphie du DCE, mot par mot.
    brut = casseDuDce(brut, c.ctx.dce || '') || brut;
    const { article, nom } = articleEtNom(brut, c.ctx.dce || '');
    const formes = formesClient(nom, c.ctx.dce || '');
    // Société désignée ainsi dans le DCE (« S.P.L. CITEDIA METROPOLE », « société publique locale … ») : féminin.
    const societeDce = societe || new RegExp(`(?:^|[^a-z])(?:s ?p ?l ?a?|s ?e ?m|societe publique locale|societe d.economie mixte) ${echapper(normaliser(nom).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim())}(?![a-z])`).test(normaliser(c.ctx.dce || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' '));
    return {
      // Société (nom propre) : sans article (« Citédia Métropole », jamais « le Citédia Métropole »).
      valeur: formes.long, article: societeDce && !formes.pluriel ? '' : article, source: brut === couverture ? 'page de garde' : 'analyse du DCE (clientName)',
      ...(formes.court ? { court: formes.court.nom, articleCourt: formes.court.article, ...(formes.court.genre !== undefined ? { genreCourt: formes.court.genre } : {}) } : {}),
      ...(formes.pluriel ? { genre: 'p' as const } : societeDce ? { genre: 'f' as const } : {}),
    };
  },
  OBJET_MARCHE: (c) => {
    const titre = valeurPropre(c.ctx.cover?.title);
    const v = titre && !/^m[ée]moire technique$/i.test(titre) ? titre : valeurPropre(c.ctx.analyse?.projectTitle);
    return { valeur: v ? v.replace(/\.$/, '') : null, source: 'analyse du DCE (projectTitle)' };
  },
  REF_MARCHE: (c) => ({ valeur: valeurPropre(c.ctx.cover?.ref) || valeurPropre(c.ctx.analyse?.marketRef) || null }),
  LOTS: (c) => {
    const lots = (Array.isArray(c.ctx.analyse?.lots) ? c.ctx.analyse.lots : []).map((l: any) => valeurPropre(l?.num)).filter(Boolean);
    if (!lots.length) return { valeur: null };
    return { valeur: `${lots.length > 1 ? 'lots' : 'lot'} ${listeFr(lots)}` };
  },
  DUREE_MARCHE: (c) => ({ valeur: valeurPropre(c.ctx.analyse?.duration) || null }),
  DATE_DEBUT_MARCHE: (c) => ({ valeur: dateDebutMarche(c.ctx.dce || '') || null, source: 'DCE' }),
  SITE: (c) => ({ valeur: (Array.isArray(c.ctx.analyse?.sites) ? c.ctx.analyse.sites : []).map((s: any) => valeurPropre(s?.name)).filter(Boolean) }),
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
    const q = diplomesEquipe(c);
    return q.length ? { valeur: q, source: c.ctx.dimensionnement?.profils.length ? "qualifications des profils de l'équipe dédiée (dimensionnement)" : "qualifications des lignes du tableau de l'équipe dédiée" } : { valeur: null };
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
    return { valeur: lignes.join('\n'), question: "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) ?", source: 'qualifications exigées par le DCE' };
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
  DELAI_COMMANDE_SUPPLEMENTAIRE: (c) => delai(c, 'DELAI_COMMANDE_SUPPLEMENTAIRE', 'commande'),
  DELAI_DEFAILLANCE_SSI: (c) => delai(c, 'DELAI_DEFAILLANCE_SSI', 'ssi'),
  FREQ_CONTROLE_1: (c) => ({ valeur: c.mt.variables.FREQ_CONTROLE_1?.valeur_gss || null, source: 'pratique GSS' }),
  FREQ_CONTROLE_2: (c) => valeurSiExige(c, 'FREQ_CONTROLE_2') || ({ valeur: c.mt.variables.FREQ_CONTROLE_2?.valeur_gss || null, source: 'pratique GSS (faits_gss.md)' }),
  FREQ_CONTROLE_3: (c) => ({ valeur: c.mt.variables.FREQ_CONTROLE_3?.valeur_gss || null, source: 'pratique GSS' }),
  CONTROLES_INOPINES_MENSUELS: (c) => valeurSiExige(c, 'CONTROLES_INOPINES_MENSUELS') || ({ valeur: c.mt.variables.CONTROLES_INOPINES_MENSUELS?.valeur_gss || null, source: 'pratique GSS' }),
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
    if (imp && valeurPropre(imp.valeur)) {
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
  if (!ctx.choix?.variables?.CONTROLES_INOPINES_MENSUELS && !ctx.imposees?.CONTROLES_INOPINES_MENSUELS && ctx.imposees?.FREQ_CONTROLE_2 && mt.variables.CONTROLES_INOPINES_MENSUELS) {
    const imposee = String(ctx.imposees.FREQ_CONTROLE_2.valeur || '');
    const derive = controlesInopinesDe(imposee);
    out.CONTROLES_INOPINES_MENSUELS = derive
      ? { valeur: derive, source: `déduit de la fréquence imposée par le DCE (« ${imposee} »)` }
      : { valeur: null, question: `Le cahier des charges impose des contrôles inopinés « ${imposee} » : combien de contrôles inopinés par mois et par site faut-il indiquer dans le calendrier type du suivi qualité ?` };
  }
  return out;
}

const NOMBRES_FOIS: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
const LETTRES_FOIS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
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
    if (art === 'le' || art === 'les') {
      const contr = prep.toLowerCase() === 'de' ? (art === 'le' ? 'du' : 'des') : (art === 'le' ? 'au' : 'aux');
      return { sortie: `${avant}${maj ? majuscule(contr) : contr} `, insere: nom };
    }
    if (!art && prep.toLowerCase() === 'de' && /^[aeiouyâàäéèêëîïôöûüœ]/i.test(nom)) {
      return { sortie: `${avant}${maj ? "D'" : "d'"}`, insere: nom };
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
function genreClient(v?: ValeurVariable): 'f' | 'm' | 'p' | '' {
  if (!v || !variableRenseignee(v)) return '';
  if (v.genre) return v.genre;
  if (v.article === 'les') return 'p';
  if (v.article === 'la') return 'f';
  if (v.article === 'le') return 'm';
  const premier = String(Array.isArray(v.valeur) ? v.valeur[0] : v.valeur || '').split(/[\s(]/)[0];
  if (FEMININS_ELIDES.test(premier) || ARTICLES_FEMININS.test(premier)) return 'f';
  return '';
}
/** Verbes du mémoire type dont l'acheteur est le sujet, au pluriel (acheteurs coordonnés : « l'ENPC et l'IGN »). */
const VERBES_PLURIEL: Record<string, string> = { peut: 'peuvent', dispose: 'disposent', appelle: 'appellent', lance: 'lancent', ait: 'aient', est: 'sont', a: 'ont', souhaite: 'souhaitent', confie: 'confient', reçoit: 'reçoivent' };
function accorderPronomsClient(t: string, v?: ValeurVariable): string {
  const g = genreClient(v);
  if (g !== 'f' && g !== 'p') return t;
  // Sujet pluriel : verbe accordé, sauf quand l'acheteur est complément (« le site de {{CLIENT}} reçoit »).
  if (g === 'p') {
    t = t.replace(/(^|[^\wÀ-ÿ'’])((?:[\wÀ-ÿ'’]+\s+)?)(\{\{\s*CLIENT\s*\}\}\s+(?:y\s+)?)([a-zç]+)(?![\wÀ-ÿ])/g, (m, a: string, mot: string, c: string, verbe: string) => (
      VERBES_PLURIEL[verbe] && !/^(?:de|d['’]|du|des|à|au|aux|pour|par|avec|sur|chez|entre|vers)\s+$/i.test(mot) ? `${a}${mot}${c}${VERBES_PLURIEL[verbe]}` : m));
    t = t.replace(/(\{\{\s*CLIENT\s*\}\}[^.!?\n{]{0,80}?)\bs['’]il le souhaite\b/g, "$1s'ils le souhaitent");
  }
  return t.replace(/(\{\{\s*CLIENT\s*\}\}[^.!?\n{]{0,80}?)\bs['’]il(?![\wÀ-ÿ])/g, (_m, a: string) => `${a}${g === 'f' ? 'si elle' : "s'ils"}`);
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
  return texte
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
        const r = insererClient(sortie, !options.clientLong && v.court ? { ...v, valeur: v.court, article: v.articleCourt ?? '' } : v);
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
export function preparerMemoireType(ctx: ContexteMarche, options: OptionsPlan & { memoireType?: MemoireType } = {}): MemoirePrepare {
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

export function donneesBesoin(prep: MemoirePrepare, ctx: ContexteMarche): DonneesBesoin {
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
    secteur: texte('SECTEUR_CLIENT'),
    horaires: horairesImposes(ctx.dce || '', 15),
    obligations: obligationsChiffrees(ctx.dce || '').slice(0, 25).map((o) => o.phrase),
    qualifications: liste('QUALIFICATIONS_REQUISES'),
    enjeux: (Array.isArray(ctx.analyse?.keyRisks) ? ctx.analyse.keyRisks : []).map((x: unknown) => valeurPropre(x)).filter(Boolean).slice(0, 5),
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
const PIECES_OFFRE = /acte d.engagement|bordereau de prix|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?/i;

/** Score lexical d'une rubrique pour un texte (mots-clés et titre). */
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
const SUJET_PRESENTATION = /autoris|agr[ée]ment|cnaps|carte professionnelle|certifi|\biso\b|\brse\b|responsabilit[ée] soci|environnement|[ée]cologi|d[ée]veloppement durable|carbone|d[ée]chets|recycl|r[ée]f[ée]rences?\b|exp[ée]rience|chiffre d.affaires|assurance|responsabilit[ée] civile|implantation|agences?\b|si[èe]ge social|organigramme|valeurs|[ée]thique|d[ée]ontolog|insertion|handicap|[ée]galit[ée]|kbis|attestation/i;

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
];

/**
 * Rattache les exigences de la matrice aux rubriques du plan : rubrique du plan citée ; ancienne rubrique (b_*) →
 * rubrique correspondante la plus proche ; sinon recherche lexicale (score ≥ 2). Le reste forme les questions
 * nouvelles (propositions de réponse à faire valider par GSS) ; les pièces de l'offre sont ignorées. Une rubrique ne
 * reçoit jamais une exigence hors de son sujet (sujet_ajouts : « absence imprévue » refusée dans la rubrique de l'absence
 * prévue ; bloc de présentation : seulement ses sujets) ; l'exigence va alors à la rubrique admise la plus proche.
 */
export function exigencesParRubrique(mt: MemoireType, plan: PlanMemoireType, matrice: ExigenceMatrice[]): { parRubrique: Record<string, ExigenceMatrice[]>; nouvelles: ExigenceMatrice[] } {
  const ids = plan.rubriques.map((r) => r.id);
  const parRubrique: Record<string, ExigenceMatrice[]> = {};
  const nouvelles: ExigenceMatrice[] = [];
  const ajouter = (id: string, e: ExigenceMatrice) => { (parRubrique[id] ||= []).push(e); };
  const admise = (id: string, e: ExigenceMatrice): boolean => {
    const r = mt.rubriques.find((x) => x.id === id);
    if (!r) return true;
    if (!dansLeSujet(e.exigence, sujetDeRubrique(r))) return false;
    return r.bloc !== 'presentation' || SUJET_PRESENTATION.test(e.exigence);
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
    if (!e?.exigence || PIECES_OFFRE.test(e.exigence)) continue;
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
  const pertinente = (ph: string) => { const t = ` ${normaliser(ph).replace(/[^a-z0-9]+/g, ' ')}`; return cles.some((k) => t.includes(` ${k.replace(/[^a-z0-9]+/g, ' ').trim()}`)) && dansLeSujet(ph, sujet); };
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
  for (const m of normaliser(t).matchAll(/(?<![a-z])(une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente|quarante-cinq|quarante|cinquante|soixante)(?![a-z])/g)) {
    out.push(String(NOMBRES_LETTRES[m[1]]));
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
  [/p[ée]nalit[ée]s?[^.;\n]{0,120}?\d[\d\s]*(?:,\d+)?\s*(?:€|euros?)/i, 'montant de pénalité'],
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
function touchePhraseProtegee(t: string, pos: { debut: number; fin: number }, phrases?: string[]): boolean {
  for (const p of phrases || []) {
    let k = t.indexOf(p);
    while (k >= 0) {
      if (pos.debut < k + p.length && pos.fin > k) return true;
      k = t.indexOf(p, k + 1);
    }
  }
  return false;
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
    t = essai;
    appliquees.push(m);
  }
  let nAjouts = 0;
  for (const a of mods.ajouts || []) {
    const m: ModificationTraitee = { type: 'ajout', extrait: String(a?.apres || ''), par: sansCovidEnumere(String(a?.texte || '').trim()), motif: a?.motif };
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
  return out;
}

/** Nombres (en chiffres) d'un texte : ceux que le DCE impose peuvent remplacer ceux de GSS. */
export function nombresAutorisesDe(t: string): Set<string> {
  return new Set(faitsDePhrase(String(t || '')).filter((f) => f.startsWith('N:')));
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
  const opts: OptionsModifications = { ...options, dce: ctx.dce, reference, sujetAjouts: options.sujetAjouts ?? sujetDeRubrique(rubrique), sujetsDelais: options.sujetsDelais ?? sujetsDelaisDuGabarit(rubrique.texte || ''), phrasesProtegees: [...(options.phrasesProtegees || []), ...phrasesGeneralesProtegees(rubrique.texte || '', reference)] };
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
      const phrase = phrasesDuDce(dce).find((ph) => normaliser(ph).replace(/[^a-z0-9']+/g, ' ').includes(cit)) || citation;
      if (!def || !def.sujet.test(phrase) || def.exclure?.test(phrase) || (def.objet?.test(phrase) && !def.personnel?.test(phrase))) {
        refusees.push({ variable: nom, raison: 'citation d\'un autre sujet que celui du délai' }); continue;
      }
    }
    const nombresCitation = new Set(nombresDe(citation));
    const etrangers = nombresDe(valeur).filter((n) => !nombresCitation.has(n));
    if (etrangers.length) { refusees.push({ variable: nom, raison: `chiffre absent de la citation (${etrangers.join(', ')})` }); continue; }
    // Délai : la durée seule, la phrase de GSS porte déjà « en … au maximum ».
    imposees[nom] = { valeur: sujetV !== undefined ? delaiNu(valeur) || valeur : valeur, citation };
  }
  return { imposees, refusees };
}
