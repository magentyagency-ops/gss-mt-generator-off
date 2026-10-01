// ════════════════════════════════════════════════════════════════════════════════════════
// RÉPONSE LIBRE v2 — MÉMOIRE TYPE EN 5 BLOCS (refonte 2026-10, consignes 2 à 8 du dirigeant de GSS)
// ════════════════════════════════════════════════════════════════════════════════════════
// Fonctions SANS appel réseau de la réponse libre construite sur le mémoire type (memoire_type.ts) :
//  · ordre de rendu (blocs du plan, rubriques retenues, rubriques ajoutées) et titres des pages de schéma ;
//  · repères des données à compléter : chaque « [À COMPLÉTER] » publiposté reçoit SON repère, juste après lui ;
//  · questions nouvelles du DCE (sans rubrique du mémoire type) : rattachement lexical, regroupement par sujet ;
//  · schéma de process du bloc « Notre compréhension de votre besoin » et consignes des deux rédactions du modèle
//    (compréhension, propositions de réponse) ;
//  · premier message de l'assistant, qui signale les propositions de réponse à valider.
// Le générateur (memoire_generator.ts) appelle le modèle ; l'assistant (assistant_memoire.ts) et la complétion
// (completion.ts) lisent le plan v2 enregistré dans l'état. Retour arrière : GSS_MEMOIRE_TYPE=non (plan v1).

import fs from 'fs';
import path from 'path';
import {
  chargerMemoireType, normaliser, rechercherRubriques,
  type DonneesBesoin, type ExigenceMatrice, type MemoireType, type PlanMemoireType,
} from './memoire_type';

export const PLACEHOLDER_V2 = '[À COMPLÉTER]';

/** Clé d'un schéma de rubrique dans l'état (réponse libre v2 : 1 schéma par rubrique, sur sa propre page). */
export const CLE_SCHEMA = (id: string): string => `${id}#schema`;

/** Rubrique ajoutée au plan : par l'assistant de modification, ou proposition de réponse de l'IA à une question
 *  nouvelle du DCE (à valider par GSS). */
export interface AjoutLibre {
  id: string;
  chapter: string;
  title: string;
  apres?: string;
  /** Proposition de réponse de l'IA à une question du DCE que le mémoire type ne traite pas : à valider par GSS. */
  proposition?: boolean;
  /** Sujet de la question nouvelle (proposition). */
  sujet?: string;
  /** Date de validation de la proposition par GSS (assistant). */
  valideLe?: string;
}

/**
 * Réponse libre construite sur le mémoire type (v2) : oui par défaut. GSS_MEMOIRE_TYPE=non (ou 0, v1, false,
 * off) revient à la rédaction rubrique par rubrique du plan v1, à l'identique.
 */
export function memoireTypeActif(): boolean {
  const v = String(process.env.GSS_MEMOIRE_TYPE || '').trim().toLowerCase();
  return !['non', '0', 'v1', 'false', 'off', 'aucun'].includes(v);
}

/** Exécute `f` sur chaque élément, `n` à la fois au plus (appels au modèle d'une même étape). */
export async function enParallele<T>(items: T[], n: number, f: (x: T, i: number) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, n), items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      await f(items[k], k);
    }
  }));
}

// ─── Valeurs imposées par le CCTP ────────────────────────────────────────────────────────────────

/**
 * Forme attendue d'une valeur imposée par le CCTP, selon la phrase du mémoire type qui la reçoit (« sur site en
 * {{DELAI_ASTREINTE}} maximum », « réalisé {{FREQ_CONTROLE_1}} par le responsable de site », « et
 * {{CONTROLES_INOPINES_MENSUELS}} de nos contrôleurs ») : un délai chiffré, une fréquence, un nombre de contrôles.
 */
const FORME_VALEUR_IMPOSEE: Array<[RegExp, RegExp]> = [
  [/^DELAI_/, /\d+\s*(?:minutes?|mn|min|h|heures?|jours?)(?![\wÀ-ÿ])/i],
  [/^FREQ_/, /fois|chaque|tous les|toutes les|par (?:jour|semaine|mois|trimestre|semestre|an)\b|quotidien|hebdomadaire|mensuel|bimestriel|trimestriel|semestriel|annuel/i],
  [/^CONTROLES_/, /contr[ôo]les?/i],
];

/**
 * Valeurs imposées par le CCTP (extraireValeursImposees) gardées si leur forme convient à la phrase qui les reçoit. Une
 * autre forme (« remplacement immédiat » pour un délai) donnerait une phrase fausse (« sur site en remplacement
 * immédiat maximum ») : elle est écartée ; la valeur habituelle de GSS reste, et l'exigence du CCTP est traitée par les
 * contrôles de couverture et de cohérence.
 */
export function valeursImposeesValides<T extends { valeur: string }>(imposees: Record<string, T>): { valides: Record<string, T>; ecartees: Array<{ variable: string; valeur: string }> } {
  const valides: Record<string, T> = {};
  const ecartees: Array<{ variable: string; valeur: string }> = [];
  for (const [nom, v] of Object.entries(imposees || {})) {
    const forme = FORME_VALEUR_IMPOSEE.find(([rx]) => rx.test(nom))?.[1];
    if (!forme || forme.test(String(v?.valeur || ''))) valides[nom] = v;
    else ecartees.push({ variable: nom, valeur: String(v?.valeur || '') });
  }
  return { valides, ecartees };
}

// ─── Lignes en gras consécutives ─────────────────────────────────────────────────────────────────

const MARQUE_GRAS = '\uE010';

/**
 * Deux lignes en gras qui se suivent dans le texte de GSS (« **Les sites de santé** » puis « **Site : …** ») : le filtre
 * des commentaires internes (base_memoires.ts, inchangé) retire toute suite « ** ** » et les fusionnait en une seule
 * ligne. Une marque invisible posée entre elles avant ce filtre, puis retirée (retablirGras), garde le texte intact.
 */
export function protegerGras(texte: string): string {
  return texte.replace(/\*\*([ \t]*\n[ \t]*)\*\*/g, `**$1${MARQUE_GRAS}**`);
}

export function retablirGras(texte: string): string {
  return texte.split(MARQUE_GRAS).join('');
}

// ─── Ordre de rendu ──────────────────────────────────────────────────────────────────────────────

export interface RubriqueRendue { id: string; chapter: string; title: string; ajout?: AjoutLibre }

/**
 * Rubriques du plan v2 dans l'ordre de rendu, bloc par bloc : rubriques retenues du mémoire type, puis rubriques
 * ajoutées insérées après leur rubrique « apres » (sinon en fin de bloc). Un ajout dont le chapitre n'existe plus va
 * en fin du dernier bloc.
 */
export function rubriquesV2(plan: PlanMemoireType, ajouts: AjoutLibre[] = []): Array<{ cle: string; titre: string; id: string; rubriques: RubriqueRendue[] }> {
  const cles = new Set(plan.blocs.map((b) => b.cle));
  const derniere = plan.blocs[plan.blocs.length - 1]?.cle;
  return plan.blocs.map((b) => {
    const liste: RubriqueRendue[] = plan.rubriques.filter((r) => r.bloc === b.id).map((r) => ({ id: r.id, chapter: b.cle, title: r.titre }));
    for (const a of ajouts.filter((x) => x.chapter === b.cle || (!cles.has(x.chapter) && b.cle === derniere))) {
      const i = a.apres ? liste.findIndex((x) => x.id === a.apres) : -1;
      const r: RubriqueRendue = { id: a.id, chapter: b.cle, title: a.title, ajout: a };
      if (i >= 0) {
        // Plusieurs ajouts après la même rubrique : dans leur ordre d'ajout.
        let j = i + 1;
        while (j < liste.length && liste[j].ajout && liste[j].ajout!.apres === a.apres) j++;
        liste.splice(j, 0, r);
      } else liste.push(r);
    }
    return { cle: b.cle, titre: b.titre, id: b.id, rubriques: liste };
  });
}

/** Rubriques (id, chapitre, titre) du plan v2, ajouts compris, dans l'ordre du document. */
export function sectionsV2(plan: PlanMemoireType, ajouts: AjoutLibre[] = []): Array<{ id: string; chapter: string; title: string }> {
  return rubriquesV2(plan, ajouts).flatMap((b) => b.rubriques.map((r) => ({ id: r.id, chapter: r.chapter, title: r.title })));
}

/** Chapitres du plan v2 (clé → titre), dans l'ordre des blocs. */
export function chapitresV2(plan: PlanMemoireType): Record<string, string> {
  return Object.fromEntries(plan.blocs.map((b) => [b.cle, b.titre]));
}

/**
 * Bloc qui reçoit les pages statiques « Ils nous font confiance » (gss_memoire_master.md) : aucun quand le plan contient
 * les rubriques de références du mémoire type (même contenu : il y aurait doublon) ; sinon le bloc « presentation ».
 * Piloté par le JSON du mémoire type : retirer ses rubriques de références fait revenir les pages statiques.
 */
export function blocPagesReferences(plan: PlanMemoireType): string | null {
  if (plan.rubriques.some((r) => r.ancienne_rubrique === 'b_references')) return null;
  return plan.blocs.find((b) => b.id === 'presentation')?.cle ?? null;
}

/** Vrai si le schéma de la rubrique est fixé par le mémoire type (bibliothèque, spécification, organigramme) : il
 *  ne dépend pas d'une réécriture du texte par l'assistant. */
export function schemaFixe(plan: PlanMemoireType | undefined, id: string): boolean {
  const s = plan?.rubriques.find((r) => r.id === id)?.schema?.source;
  return s === 'bibliotheque' || s === 'spec' || s === 'organigramme';
}

let indexBibliotheque: Map<string, { titre: string }> | null = null;
function titreBibliotheque(ref: string): string | undefined {
  if (!indexBibliotheque) {
    indexBibliotheque = new Map();
    try {
      const fichier = path.resolve(__dirname, '../../python/schemas_gss/bibliotheque/index.json');
      for (const x of JSON.parse(fs.readFileSync(fichier, 'utf-8'))) indexBibliotheque.set(String(x.id), { titre: String(x.titre || '') });
    } catch { /* index illisible : titre de la rubrique */ }
  }
  return indexBibliotheque.get(ref)?.titre || undefined;
}

/**
 * Titre-message de la page de schéma d'une rubrique du mémoire type : titre de sa spécification, ou titre du schéma
 * de la bibliothèque (« Nos trois valeurs », « Grille du contrôle de fond »…). undefined : titre de la rubrique.
 */
export function titreSchemaMemoireType(id: string, mt?: MemoireType): string | undefined {
  let m: MemoireType | undefined = mt;
  if (!m) { try { m = chargerMemoireType(); } catch { return undefined; } }
  const r = m.rubriques.find((x) => x.id === id);
  if (!r?.schema) return undefined;
  if (r.schema.titre) return r.schema.titre;
  if (r.schema.source === 'bibliotheque' && r.schema.ref) return titreBibliotheque(r.schema.ref);
  if (r.schema.source === 'organigramme') return 'Notre organigramme';
  return undefined;
}

// ─── Repères des données à compléter ─────────────────────────────────────────────────────────────

const LIGNE_CONSULTATION = /^\s*\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]\s*[.;,]?\s*$/;
const RX_PLACEHOLDER = /\[À COMPLÉTER\](?!⟦AC:)/g;

export interface RepereEnPlace {
  n: number;
  id: string;
  /** Question à GSS (lignes « [CONSULTATION REQUISE : …] » du publipostage) ; absente : à formuler. */
  question?: string;
  /** Phrase (ou ligne de tableau) qui contient l'emplacement ; les autres emplacements y sont notés « […] ». */
  contexte: string;
  /** Texte autour de l'emplacement (formulation de la question). */
  environnement: string;
}

/** Libellé d'une ligne de tableau Markdown (« | Agent de sécurité | CQP APS | [À COMPLÉTER] | | » → « Agent de sécurité · CQP APS »). */
function libelleLigneTableau(ligne: string): string {
  return ligne.split('|').map((c) => c.trim()).filter((c) => c && !c.includes(PLACEHOLDER_V2) && !/^-+$/.test(c)).slice(0, 2).join(' · ');
}

/** Phrase (ou ligne de tableau) qui contient le passage [pos, pos + longueur[ de `texte`, passage compris. */
function phraseAutour(texte: string, pos: number, longueur: number): string {
  const debutLigne = texte.lastIndexOf('\n', pos - 1) + 1;
  const finLigne = texte.indexOf('\n', pos + longueur);
  const ligne = texte.slice(debutLigne, finLigne < 0 ? texte.length : finLigne);
  const p = pos - debutLigne;
  if (/^\s*\|/.test(ligne)) return ligne.trim();
  const avant = ligne.slice(0, p);
  const apres = ligne.slice(p + longueur);
  const mAvant = avant.match(/(?:^|[.!?]\s)([^.!?]*)$/);
  const finM = /[.!?](?=\s|$)/.exec(apres);
  return `${mAvant ? mAvant[1] : avant}${ligne.slice(p, p + longueur)}${finM ? apres.slice(0, finM.index + 1) : apres}`.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
}

const RX_CONSULTATION = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;

/**
 * Pose les repères ⟦AC:n⟧ des données à compléter dans les rubriques (après toutes les passes de rédaction et de
 * contrôle), en deux formes :
 *  - EN PLACE, pour chaque « [À COMPLÉTER] » (publipostage, adaptation, rédactions du modèle) : « [À COMPLÉTER]⟦AC:n⟧ ».
 *    Le « [À COMPLÉTER] » reste visible dans le brouillon ; la réponse de GSS le remplacera à cet endroit précis
 *    (integrerDansRubrique). La question est prise dans les lignes « [CONSULTATION REQUISE : …] » qui suivent le
 *    paragraphe (posées par le publipostage dans l'ordre des emplacements) ; une seule ligne pour plusieurs
 *    emplacements (lignes d'un tableau) vaut pour chacun, précisée par le libellé de la ligne ; sans ligne, la
 *    question est à formuler par le générateur ;
 *  - EN LIGNE, comme la réponse libre v1, pour un marqueur « [CONSULTATION REQUISE : …] » sans « [À COMPLÉTER] » dans
 *    son paragraphe : le marqueur devient le repère.
 * Les rubriques sont modifiées sur place ; `depart` : dernier numéro de repère déjà utilisé.
 */
export function poserReperes(sections: Record<string, string>, ordre: string[], depart = 0): { enPlace: RepereEnPlace[]; enLigne: Array<{ n: number; id: string; question: string }>; dernier: number } {
  let n = depart;
  const enPlace: RepereEnPlace[] = [];
  const enLigne: Array<{ n: number; id: string; question: string }> = [];
  const CIBLE = '\u0001';
  for (const id of ordre) {
    const texte = sections[id];
    if (!texte || (!texte.includes(PLACEHOLDER_V2) && !/\[CONSULTATION REQUISE/i.test(texte))) continue;
    const blocs = texte.split(/\n{2,}/);
    const questionsParBloc: Array<Array<string | undefined>> = blocs.map(() => []);
    const lignesConservees: string[][] = blocs.map((b) => b.split('\n'));
    // Emplacements d'un bloc restés sans question : une ligne de consultation isolée juste après eux leur revient.
    let attente: Array<{ bloc: number; index: number }> = [];
    blocs.forEach((bloc, k) => {
      const lignes = bloc.split('\n');
      const questions = lignes.map((l) => LIGNE_CONSULTATION.exec(l)?.[1]?.trim()).filter((q): q is string => !!q);
      const contenu = lignes.filter((l) => !LIGNE_CONSULTATION.test(l));
      const nbEmplacements = (contenu.join('\n').match(RX_PLACEHOLDER) || []).length;
      if (!nbEmplacements) {
        if (questions.length && attente.length && contenu.every((l) => !l.trim())) {
          attente.forEach((a, i) => { questionsParBloc[a.bloc][a.index] = questions[Math.min(i, questions.length - 1)]; });
          lignesConservees[k] = [];
        }
        attente = [];
        return;
      }
      const qs: Array<string | undefined> = [];
      for (let i = 0; i < nbEmplacements; i++) {
        if (!questions.length) qs.push(undefined);
        else if (questions.length === 1) qs.push(questions[0]);
        else qs.push(questions[Math.min(i, questions.length - 1)]);
      }
      questionsParBloc[k] = qs;
      lignesConservees[k] = contenu;
      attente = questions.length ? [] : qs.map((_, i) => ({ bloc: k, index: i }));
    });
    // Chaque emplacement reçoit une marque provisoire (bloc, rang), puis son repère, dans l'ordre du texte.
    const blocsMarques = lignesConservees.map((lignes, k) => {
      let i = 0;
      return lignes.join('\n').replace(RX_PLACEHOLDER, () => `${PLACEHOLDER_V2}\u0000${k}:${i++}\u0000`);
    }).filter((b) => b.trim());
    let assemble = blocsMarques.join('\n\n');
    const brut = assemble.replace(/\u0000\d+:\d+\u0000/g, '');
    let decalage = 0;
    assemble = assemble.replace(/\[À COMPLÉTER\]\u0000(\d+):(\d+)\u0000/g, (marque: string, kb: string, ki: string, offset: number) => {
      // Position de l'emplacement dans le texte sans marques.
      const pos = offset - decalage;
      decalage += marque.length - PLACEHOLDER_V2.length;
      n++;
      const cible = `${brut.slice(0, pos)}${CIBLE}${brut.slice(pos + PLACEHOLDER_V2.length)}`;
      const lisible = (x: string) => x.replace(RX_CONSULTATION, '').split(PLACEHOLDER_V2).join('[…]').split(CIBLE).join(PLACEHOLDER_V2);
      const contexte = lisible(phraseAutour(cible, pos, 1));
      const environnement = lisible(cible.slice(Math.max(0, pos - 700), pos + 301)).replace(/\s+/g, ' ').trim();
      let question = questionsParBloc[Number(kb)]?.[Number(ki)];
      const ligne = brut.slice(brut.lastIndexOf('\n', pos - 1) + 1, (brut.indexOf('\n', pos) + 1 || brut.length + 1) - 1);
      if (question && /^\s*\|/.test(ligne) && (questionsParBloc[Number(kb)] || []).filter((q) => q === question).length > 1) {
        // Même question pour plusieurs lignes d'un tableau : chaque ligne est précisée.
        const libelle = libelleLigneTableau(ligne);
        if (libelle) question = `${question.replace(/[.\s]+$/, '')} — ligne « ${libelle} »`;
      }
      enPlace.push({ n, id, question, contexte, environnement });
      return `${PLACEHOLDER_V2}⟦AC:${n}⟧`;
    });
    // Marqueurs restants (sur leur ligne ou au fil du texte) : repère à leur place, comme en réponse libre v1.
    assemble = assemble.replace(RX_CONSULTATION, (_m: string, q: string) => {
      n++;
      enLigne.push({ n, id, question: String(q).trim() });
      return `⟦AC:${n}⟧`;
    });
    sections[id] = assemble.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return { enPlace, enLigne, dernier: n };
}

// ─── Questions nouvelles du DCE ──────────────────────────────────────────────────────────────────

const PIECES_OU_PENALITES = /acte d.engagement|bordereau de prix|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?|p[ée]nalit|plafonnement|r[ée]vision des prix|facturation|paiement|garantie financi|assurance responsabilit/i;

/**
 * Exigences que la matrice déclare « nouvelles » : une recherche lexicale sur les mots-clés du mémoire type les
 * rattache d'abord à une rubrique retenue quand le sujet y est clairement traité (score ≥ 3), pour ne proposer une
 * réponse nouvelle que sur un vrai sujet nouveau. Les exigences administratives (pièces de l'offre, pénalités, prix)
 * ne donnent jamais de proposition.
 */
export function trierNouvelles(mt: MemoireType, plan: PlanMemoireType, nouvelles: ExigenceMatrice[]): { rattachees: Record<string, ExigenceMatrice[]>; nouvelles: ExigenceMatrice[] } {
  const ids = plan.rubriques.map((r) => r.id).filter((id) => !/^b1_/.test(id));
  const rattachees: Record<string, ExigenceMatrice[]> = {};
  const restent: ExigenceMatrice[] = [];
  for (const e of nouvelles) {
    if (!e?.exigence || PIECES_OU_PENALITES.test(e.exigence)) continue;
    const proche = rechercherRubriques(mt, `${e.sujet || ''} ${e.exigence}`, 1, ids)[0];
    if (proche && proche.score >= 3) (rattachees[proche.id] ||= []).push(e);
    else restent.push(e);
  }
  return { rattachees, nouvelles: restent };
}

const MOTS_VIDES = new Set(['dans', 'pour', 'avec', 'sans', 'sous', 'chez', 'entre', 'leur', 'leurs', 'cette', 'votre', 'notre', 'des', 'les', 'une', 'aux', 'par', 'sur', 'est', 'sont', 'doit', 'doivent', 'titulaire', 'prestataire', 'candidat', 'site', 'sites']);
const motsSujet = (t: string) => new Set(normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !MOTS_VIDES.has(w)));

export interface GroupeNouveau { sujet: string; theme: string; exigences: ExigenceMatrice[] }

const RANG_CRITICITE = (c?: string) => (/bloqu/i.test(c || '') ? 0 : /facult/i.test(c || '') ? 2 : 1);

/**
 * Regroupe les exigences nouvelles par sujet (même sujet, ou deux mots du sujet au moins en commun) : une
 * proposition de réponse par groupe, `max` au plus (les exigences bloquantes d'abord, puis les groupes les plus
 * fournis). Les groupes au-delà du maximum sont renvoyés à part (consultations).
 */
export function grouperNouvelles(nouvelles: ExigenceMatrice[], max = 6): { groupes: GroupeNouveau[]; ecartees: ExigenceMatrice[] } {
  const groupes: Array<GroupeNouveau & { mots: Set<string> }> = [];
  for (const e of nouvelles) {
    const sujet = String(e.sujet || '').trim() || e.exigence.split(/[.;:]/)[0].slice(0, 80);
    const mots = motsSujet(sujet);
    const g = groupes.find((x) => {
      if (normaliser(x.sujet) === normaliser(sujet)) return true;
      // Au moins deux mots du sujet en commun (un seul mot, souvent générique — « entretien », « gestion » — ne suffit pas).
      const communs = [...mots].filter((w) => x.mots.has(w)).length;
      return communs >= 2 && communs / Math.min(mots.size || 1, x.mots.size || 1) >= 0.5;
    });
    if (g) { g.exigences.push(e); mots.forEach((w) => g.mots.add(w)); } else groupes.push({ sujet, theme: String(e.theme || ''), exigences: [e], mots });
  }
  groupes.sort((a, b) => Math.min(...a.exigences.map((x) => RANG_CRITICITE(x.criticite))) - Math.min(...b.exigences.map((x) => RANG_CRITICITE(x.criticite)))
    || b.exigences.length - a.exigences.length);
  return {
    groupes: groupes.slice(0, max).map(({ mots: _m, ...g }) => g),
    ecartees: groupes.slice(max).flatMap((g) => g.exigences),
  };
}

/** Identifiant d'une proposition (« q_controle_des_cles »), unique dans le plan. */
export function idProposition(sujet: string, existants: Set<string>): string {
  const base = `q_${normaliser(sujet).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'question'}`;
  let id = base;
  for (let i = 2; existants.has(id); i++) id = `${base}_${i}`;
  existants.add(id);
  return id;
}

/** Bloc (clé de chapitre) d'une proposition : le thème donné par la matrice s'il désigne un bloc du plan, sinon le
 *  bloc de la rubrique du mémoire type la plus proche du sujet, sinon le dernier bloc (organisation). */
export function blocProposition(mt: MemoireType, plan: PlanMemoireType, groupe: GroupeNouveau): string {
  const theme = String(groupe.theme || '').toUpperCase().replace(/[^IVX]/g, '');
  if (theme && plan.blocs.some((b) => b.cle === theme) && theme !== plan.blocs[0]?.cle) return theme;
  const ids = plan.rubriques.map((r) => r.id).filter((id) => !/^b1_/.test(id));
  const proche = rechercherRubriques(mt, `${groupe.sujet} ${groupe.exigences.map((e) => e.exigence).join(' ')}`, 1, ids)[0];
  const cle = proche ? plan.rubriques.find((r) => r.id === proche.id)?.cle : undefined;
  return cle || plan.blocs[plan.blocs.length - 1].cle;
}

// ─── Schéma de process du bloc « compréhension » ─────────────────────────────────────────────────

const ROLES = ['bleu', 'orange', 'rouge', 'vert', 'sable', 'creme', 'or'];

/** Texte court (titre de carte, titre de schéma) : coupé sur un mot, sans ponctuation finale pendante. */
export const court = (t: unknown, max: number): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s]+$/g, '').trim();
  if (s.length <= max) return s;
  const coupe = s.slice(0, max + 1).replace(/\s+\S*$/, '');
  return coupe.replace(/[,;:\s]+$/, '');
};

/**
 * Spécification du schéma de process (« on pense à ça, puis à ça, pour arriver à ça ») à partir des étapes rédigées
 * par le modèle : gabarit « flux » (2 à 5 étapes) ou « chevrons » (3 ou 4 phases) ; la dernière étape est verte
 * (issue). Le moteur contrôle ensuite que chaque mot et chaque chiffre figurent dans le texte de la rubrique.
 */
export function specProcessBesoin(etapes: Array<{ titre?: string; texte?: string; role?: string }>, gabarit: 'flux' | 'chevrons' = 'flux'): { gabarit: string; params: any } | null {
  const max = gabarit === 'chevrons' ? 4 : 5;
  const propres = (Array.isArray(etapes) ? etapes : [])
    .map((e) => ({ titre: court(e?.titre, 34), texte: court(e?.texte, 86), role: String(e?.role || '').toLowerCase().split(/[^a-zé]+/)[0] }))
    .filter((e) => e.titre)
    .slice(0, max);
  if (propres.length < (gabarit === 'chevrons' ? 3 : 2)) return null;
  const etapesSpec = propres.map((e, i) => {
    const role = i === propres.length - 1 ? 'vert' : (ROLES.includes(e.role) && e.role !== 'vert' ? e.role : (i < 2 ? 'rouge' : i === propres.length - 2 ? 'bleu' : 'orange'));
    return { titre: e.titre.charAt(0).toUpperCase() + e.titre.slice(1), ...(e.texte ? { texte: e.texte.charAt(0).toUpperCase() + e.texte.slice(1) } : {}), role };
  });
  return { gabarit, params: { etapes: etapesSpec } };
}

/** Schéma de secours du bloc « compréhension » : les sous-titres de son texte en phases successives (mots du texte). */
export function specSecoursBesoin(texte: string): { gabarit: string; params: any } | null {
  const titres = [...String(texte || '').matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/\*\*/g, '').trim()).filter(Boolean);
  if (titres.length < 3) return null;
  return specProcessBesoin(titres.slice(0, 4).map((t) => ({ titre: t })), 'chevrons');
}

// ─── Consignes des deux rédactions du modèle ─────────────────────────────────────────────────────

/** Analyse du DCE résumée (adaptation ciblée, propositions) : client, objet, lots, durée, sites, dispositif. */
export function analyseCompacte(analyse: any): string {
  if (!analyse || typeof analyse !== 'object') return '';
  const o = analyse.operationalSummary || {};
  const val = (x: unknown) => (x === null || x === undefined ? '' : String(x).replace(/\s+/g, ' ').trim());
  const lignes = [
    ['Acheteur', val(analyse.clientName)], ['Objet', val(analyse.projectTitle)], ['Référence', val(analyse.marketRef)],
    ['Durée', val(analyse.duration)], ['Secteur', val(analyse.clientSector)],
    ['Lots', (Array.isArray(analyse.lots) ? analyse.lots : []).map((l: any) => `${val(l?.num)} ${val(l?.perimetre)}`.trim()).filter(Boolean).join(' ; ')],
    ['Sites', (Array.isArray(analyse.sites) ? analyse.sites : []).map((s: any) => `${val(s?.name)}${s?.requirements ? ` (${val(s.requirements)})` : ''}`).filter(Boolean).join(' ; ')],
    ['Profils', val(o.agentProfiles)], ['Tenues', val(o.uniforms)], ['Équipements', val(o.equipment)], ['Contrôles', val(o.qualityControls)],
    ['Télésurveillance', val(analyse.telesurveillance)],
  ].filter(([, v]) => v && !/^non (?:communiqu|pr[ée]cis|renseign|sp[ée]cifi)/i.test(v));
  return lignes.map(([k, v]) => `- ${k} : ${v.slice(0, 600)}`).join('\n');
}

/** Rubriques du plan par bloc, pour que la compréhension renvoie aux process GSS qui la démontrent. */
export function sommaireProcess(plan: PlanMemoireType): string {
  return plan.blocs.filter((b) => !b.rubriques.every((id) => /^b1_/.test(id)))
    .map((b) => `Bloc ${b.numero} — ${b.titre} : ${plan.rubriques.filter((r) => r.bloc === b.id && r.ancienne_rubrique !== 'b_references').map((r) => r.titre).join(' ; ')}`)
    .join('\n');
}

export const CONSIGNE_COMPREHENSION = `Tu rédiges, pour GSS (Global Security Services, sécurité privée, Rouen), le bloc « Notre compréhension de votre besoin » de son mémoire technique : la première partie que lit l'acheteur, qui demande « qu'avez-vous compris de mon besoin ? ». GSS ne fonctionne qu'en process : 1 à 2 pages d'explication, puis 1 schéma de process lisible en 5 secondes (« on pense à ça, puis à ça, puis à ça, pour arriver à ça »).
Sois force de proposition : montre que GSS a lu le cahier des charges en détail (faits, chiffres et mots exacts du DCE) et ce qu'il propose concrètement à CE client, process par process, en renvoyant aux blocs du mémoire qui le démontrent.

TEXTE (Markdown, __MOTS__ mots, jamais plus), en quatre sous-parties « ## », dans cet ordre :
## Votre contexte et votre site — 3 à 6 lignes : l'acheteur, l'objet du marché, le ou les sites, la durée ; faits du DCE uniquement, sans qualificatif promotionnel.
## Le périmètre de la prestation demandée — un tableau Markdown « Site | Poste | Jours et horaires | Qualification | Missions principales », une ligne par poste prévu au CCTP (aucun poste, horaire ni effectif ajouté), puis une phrase par prestation complémentaire prévue (rondes, interventions sur alarme, bons de commande, reprise du personnel…).
## Vos attentes et nos engagements — 3 à 6 puces de la forme « **Ce que vous attendez** (mots de l'acheteur) : … → notre réponse : … (process GSS), développée au bloc n ».
## Les points de vigilance identifiés et nos réponses — 2 à 4 puces de la forme « **Point de vigilance** : … (fait du DCE) → notre réponse : … (process GSS existant) ».

SCHÉMA DE PROCESS (champ "etapes") : 5 étapes lues de gauche à droite : 1. « Votre besoin » (role rouge) ; 2. « Vos enjeux » (rouge) ; 3. « Notre dispositif » (orange) ; 4. « Notre pilotage » (bleu) ; 5. « Votre résultat » (vert, toujours la dernière). Pour chaque étape : "titre" (1 à 3 mots) et "texte" (une phrase de 12 mots au plus, qui commence par une majuscule). RECOPIE dans le "texte" de chaque étape des mots EXACTS de ton TEXTE (même orthographe, mêmes accords) : chaque mot et chaque chiffre du schéma doit figurer dans ton texte, sinon le schéma est refusé. "titre_schema" : le message du schéma, en une phrase courte (60 caractères au plus).

RÈGLES (impératives) :
- Contexte, périmètre et attentes : uniquement des faits du DCE ; noms des sites, bâtiments, services et fonctions écrits exactement comme dans le DCE ; chaque chiffre du DCE recopié tel quel (une exigence chiffrée du CCTP prime toujours sur une valeur habituelle de GSS).
- Réponses : uniquement des process GSS existants (rubriques du mémoire listées) ; chaque réponse renvoie au bloc qui la développe.
- Aucune invention : ni chiffre, ni nom, ni moyen, ni effectif ; l'effectif de l'équipe dédiée n'est pas chiffré ici s'il ne figure pas dans le DCE.
- Pas d'article L. 1224-1 du Code du travail si le DCE ne le cite pas ; aucun montant de pénalité ; jamais de Covid ; un agent de sécurité ne contrôle pas l'identité (il invite à justifier de sa présence).
- Aucun commentaire interne (« non précisé », « selon la documentation », « GSS indique », « à confirmer »…). Une donnée indispensable inconnue de GSS : écris [À COMPLÉTER] à sa place et ajoute sur sa propre ligne [CONSULTATION REQUISE : <donnée précise à obtenir de GSS>].
- Ne répète pas le titre « Notre compréhension de votre besoin » (il est ajouté automatiquement).
Réponds UNIQUEMENT par un objet JSON : {"texte": "…", "titre_schema": "…", "etapes": [{"titre": "…", "texte": "…", "role": "rouge|orange|bleu|vert"}]}`;

/** Messages de la rédaction du bloc « compréhension » (consigne fixe en premier : préfixe mis en cache). */
export function consigneComprehension(d: DonneesBesoin, o: {
  perimetre?: string; exigences?: ExigenceMatrice[]; remarques?: string; sommaire?: string; analyse?: string; dce?: string;
  demande?: string; motsMin?: number; motsMax?: number;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const mots = `${o.motsMin ?? 400} à ${o.motsMax ?? 700}`;
  const liste = (l: string[]) => (l.length ? l.map((x) => `  - « ${x} »`).join('\n') : '  (aucun)');
  const exigences = (o.exigences || [])
    .slice().sort((a, b) => RANG_CRITICITE(a.criticite) - RANG_CRITICITE(b.criticite) || (/\d/.test(b.exigence) ? 1 : 0) - (/\d/.test(a.exigence) ? 1 : 0))
    .slice(0, 40).map((e) => `- ${e.exigence}${e.criticite && !/normal/i.test(e.criticite) ? ` [${e.criticite}]` : ''}`).join('\n');
  const donnees = [
    `- Acheteur : ${d.client || 'votre établissement'}`,
    d.objet ? `- Objet du marché : ${d.objet}${d.lots ? ` (${d.lots})` : ''}` : '',
    d.duree ? `- Durée : ${d.duree}` : '',
    d.sites.length ? `- Sites : ${d.sites.join(' ; ')}` : '',
    d.villes.length ? `- Communes : ${d.villes.join(', ')}` : '',
    d.secteur ? `- Secteur de l'acheteur : ${d.secteur}` : '',
    d.qualifications.length ? `- Qualifications exigées : ${d.qualifications.join(', ')}` : '',
    d.prestations.length ? `- Prestations prévues au marché : ${d.prestations.join(', ')}` : '',
    `- Horaires imposés par le CCTP (cités mot pour mot) :\n${liste(d.horaires)}`,
    `- Obligations chiffrées du CCTP (citées mot pour mot) :\n${liste(d.obligations)}`,
    d.enjeux.length ? `- Enjeux relevés par l'analyse du DCE : ${d.enjeux.join(' ; ')}` : '',
    d.horsNormandie ? "- MARCHÉ HORS DE NORMANDIE (GSS est implanté à Rouen) : aucun délai d'intervention, d'astreinte ou de remplacement chiffré, sauf s'il est imposé par le DCE." : '',
    d.amorce ? `- Première phrase (déjà rédigée, à reprendre telle quelle en tête du texte) : ${d.amorce}` : '',
  ].filter(Boolean).join('\n');
  const user = [
    `DONNÉES DU MARCHÉ (calculées depuis le DCE) :\n${donnees}`,
    o.perimetre ? `PÉRIMÈTRE RÉEL DU MARCHÉ (d'après le CCTP) :\n${o.perimetre}` : '',
    exigences ? `EXIGENCES CLÉS DU DCE (bloquantes et chiffrées en premier) :\n${exigences}` : '',
    o.remarques ? `REMARQUES SUR LE CAHIER DES CHARGES (elles sont ajoutées après ton texte : ne les répète pas) :\n${o.remarques}` : '',
    o.demande ? `DEMANDE PARTICULIÈRE DE GSS POUR CETTE PARTIE (prioritaire) : ${o.demande}` : '',
    o.sommaire ? `LES BLOCS DU MÉMOIRE ET LEURS RUBRIQUES (process GSS auxquels renvoyer) :\n${o.sommaire}` : '',
    o.analyse ? `ANALYSE DU DCE :\n${o.analyse}` : '',
    o.dce ? `DCE (CCTP en priorité) :\n${o.dce}` : '',
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: CONSIGNE_COMPREHENSION.replace('__MOTS__', mots) },
    { role: 'user', content: user },
  ];
}

export const CONSIGNE_PROPOSITION = `Tu rédiges, pour GSS (Global Security Services, sécurité privée, Rouen), une PROPOSITION de réponse à une question du cahier des charges que le mémoire type de GSS ne traite pas encore. Elle figure dans le mémoire et GSS la relira, la validera ou la modifiera avant la remise : elle doit déjà être prête à remettre.
- 250 à 450 mots, en Markdown, 2 à 4 sous-parties « ## » (ne répète pas le titre de la rubrique) ; style du mémoire de GSS : concret, factuel, process par process (« on fait ceci, puis cela, pour arriver à cela »), paragraphes courts et listes à puces.
- Réponds précisément à CHAQUE exigence listée, avec ses chiffres exacts (délai, fréquence, document, moyen) ; une exigence du DCE prime toujours sur une pratique habituelle de GSS.
- Appuie-toi UNIQUEMENT sur les sources GSS fournies (réponses déjà rédigées par GSS, documentation, registre, organigramme) et sur le DCE : aucun moyen, chiffre, nom, délai ou engagement absent de ces sources.
- Une donnée indispensable inconnue : écris [À COMPLÉTER] à sa place et ajoute sur sa propre ligne [CONSULTATION REQUISE : <donnée précise à obtenir de GSS>].
- Aucun commentaire interne (« non précisé », « à confirmer », « selon la documentation », « GSS indique »…), jamais « proposition » ni « à valider » dans le texte : c'est la réponse de GSS à l'acheteur.
- Pas d'article L. 1224-1 si le DCE ne le cite pas ; aucun montant de pénalité ; jamais de Covid ; un agent de sécurité ne contrôle pas l'identité.
"titre" : le titre de la rubrique, 8 mots au plus, dans le vocabulaire du DCE.
Réponds UNIQUEMENT par un objet JSON : {"titre": "…", "texte": "…"}`;

/** Messages de la rédaction d'une proposition de réponse à une question nouvelle (consigne fixe en premier). */
export function consigneProposition(groupe: GroupeNouveau, o: { client?: string; bloc?: string; sources?: string; regles?: string; perimetre?: string; horsNormandie?: boolean; analyse?: string }): Array<{ role: 'system' | 'user'; content: string }> {
  const user = [
    o.client ? `CLIENT : ${o.client}` : '',
    `SUJET DE LA QUESTION : ${groupe.sujet}`,
    o.bloc ? `BLOC DU MÉMOIRE QUI ACCUEILLE LA RÉPONSE : ${o.bloc}` : '',
    `EXIGENCES DU DCE À TRAITER :\n${groupe.exigences.map((e) => `- ${e.exigence}${e.reponseGss ? `\n  (élément GSS connu : ${e.reponseGss})` : ''}`).join('\n')}`,
    o.horsNormandie ? "MARCHÉ HORS DE NORMANDIE : aucun délai d'intervention, d'astreinte ou de remplacement chiffré, sauf s'il est imposé par le DCE." : '',
    o.perimetre ? `PÉRIMÈTRE RÉEL DU MARCHÉ :\n${o.perimetre}` : '',
    o.analyse ? `ANALYSE DU MARCHÉ :\n${o.analyse}` : '',
    o.sources ? `SOURCES GSS :\n${o.sources}` : '',
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: `${CONSIGNE_PROPOSITION}${o.regles ? `\n\n${o.regles}` : ''}` },
    { role: 'user', content: user },
  ];
}

/**
 * Texte de secours du bloc « compréhension » (modèle indisponible) : faits du DCE calculés sans modèle (amorce,
 * périmètre, horaires et obligations chiffrées cités mot pour mot). Signalé à GSS comme texte à relire.
 */
export function texteSecoursBesoin(d: DonneesBesoin, perimetre = ''): string {
  const parties: string[] = ['## Votre contexte et votre site', d.amorce || `${d.client ? d.client.charAt(0).toUpperCase() + d.client.slice(1) : 'Vous'} nous consultez pour ${d.objet || 'une prestation de sécurité privée'}.`];
  if (d.sites.length) parties.push(`La prestation porte sur ${d.sites.join(', ')}${d.villes.length ? ` (${d.villes.join(', ')})` : ''}.`);
  parties.push('## Le périmètre de la prestation demandée');
  if (perimetre) parties.push(perimetre.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^[-*•]/.test(l) ? l : `- ${l}`)).join('\n'));
  else if (d.prestations.length) parties.push(`Le marché comprend : ${d.prestations.join(', ')}.`);
  if (d.horaires.length) parties.push(`Horaires imposés par le cahier des charges :\n${d.horaires.map((h) => `- ${h}`).join('\n')}`);
  if (d.obligations.length) {
    parties.push('## Vos attentes et nos engagements');
    parties.push(`Nous nous engageons sur chacune des obligations chiffrées du cahier des charges :\n${d.obligations.slice(0, 8).map((o) => `- ${o.trim()}`).join('\n')}`);
  }
  return parties.join('\n\n');
}

// ─── Premier message de l'assistant ──────────────────────────────────────────────────────────────

/**
 * Premier message de l'assistant (conversation de l'état) : les propositions de réponse de l'IA aux questions
 * nouvelles du DCE, avec leur page, et la façon de les valider, de les modifier ou de les supprimer.
 */
export function messagePropositions(propositions: Array<{ titre: string; page?: number }>): string {
  if (!propositions.length) return '';
  const n = propositions.length;
  const lignes = propositions.map((p) => `- « ${p.titre} »${p.page ? ` (page ${p.page})` : ''}`);
  return [
    `Le cahier des charges pose ${n === 1 ? 'une question' : `${n} questions`} que le mémoire type de GSS ne traitait pas encore. J'ai rédigé ${n === 1 ? 'une proposition de réponse' : 'une proposition de réponse pour chacune'}, déjà ${n === 1 ? 'placée' : 'placées'} dans le mémoire, à relire avant la remise :`,
    ...lignes,
    '',
    'Pour chaque proposition, vous pouvez :',
    '- la valider telle quelle : « Je valide la proposition sur … » ;',
    '- la modifier : « Dans la proposition sur …, précise que … » ;',
    '- la supprimer : « Supprime la proposition sur … ».',
  ].join('\n');
}
