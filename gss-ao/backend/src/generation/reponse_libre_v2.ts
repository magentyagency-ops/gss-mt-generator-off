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
  chargerMemoireType, normaliser, rechercherRubriques, similarite, motsDePhrase, faitsDePhrase,
  type DonneesBesoin, type ExigenceMatrice, type MemoireType, type PlanMemoireType, type SchemaRubrique,
} from './memoire_type';
import { ZONE_GSS, vocabulaireDuCctp } from './base_memoires';

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

const ROMAINS_RC = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Plan imposé par le RC sans limite de pages (IFITS : « Le mémoire technique sera présenté en respectant l'ordre et la
 * numérotation des pièces » 2-1 Moyens humains, 2-2 Moyens organisationnels, 2-3 Moyens techniques et matériels) :
 * consigne 5, GSS reprend EXACTEMENT son mémoire type et n'en change que la construction. Les blocs deviennent les
 * parties du RC, dans son ordre et avec sa numérotation ; chaque rubrique du mémoire type va dans la partie qui la reçoit
 * (répartition du format court), sans limite de pages, avec sa page de schéma. La compréhension du besoin reste en tête
 * si aucune partie du RC ne la demande ; une rubrique qu'aucune partie ne reçoit reste dans un bloc à son nom d'origine,
 * après la compréhension (rien du mémoire type n'est perdu).
 */
export function planSelonRC(plan: PlanMemoireType, parties: Array<{ id: string; title: string }>, parPartie: Record<string, string[]>): PlanMemoireType {
  const pris = new Set(Object.values(parPartie).flat());
  const blocs: PlanMemoireType['blocs'] = [];
  const b1 = plan.rubriques.find((r) => r.mode === 'besoin');
  if (b1 && !pris.has(b1.id)) {
    const orig = plan.blocs.find((b) => b.rubriques.includes(b1.id));
    blocs.push({ id: orig?.id || 'besoin', cle: '', numero: 0, titre: orig?.titre || 'Notre compréhension de votre besoin', rubriques: [b1.id] });
    pris.add(b1.id);
  }
  // Rubriques sans partie : leur bloc d'origine, dans l'ordre du mémoire type.
  for (const b of plan.blocs) {
    const reste = b.rubriques.filter((id) => !pris.has(id));
    if (reste.length) blocs.push({ id: b.id, cle: '', numero: 0, titre: b.titre, rubriques: reste });
    reste.forEach((id) => pris.add(id));
  }
  for (const p of parties) {
    const ids = (parPartie[p.id] || []).filter((id) => plan.rubriques.some((r) => r.id === id));
    if (ids.length) blocs.push({ id: `rc_${p.id}`, cle: '', numero: 0, titre: p.title, rubriques: ids });
  }
  blocs.forEach((b, i) => { b.cle = ROMAINS_RC[i] || String(i + 1); b.numero = i + 1; });
  const rubriques: PlanMemoireType['rubriques'] = blocs.flatMap((b) => b.rubriques.map((id) => ({ ...plan.rubriques.find((r) => r.id === id)!, bloc: b.id, cle: b.cle })));
  return { ...plan, blocs, rubriques };
}

/** Passages du RC qui imposent l'ordre du mémoire technique, sans limite de pages (repérage sans modèle). */
export function passagesPlanImpose(dce: string): string[] {
  const d = String(dce || '');
  const rx = /respect(?:ant|er)?\s+l.ordre|dans\s+l.ordre\s+(?:de\s+(?:la\s+)?num[ée]rotation|des\s+(?:pi[èe]ces|parties|crit[èe]res)|suivant|ci-dessous)|selon\s+le\s+plan\s+(?:suivant|ci-dessous)|structur[ée]\s+(?:comme\s+suit|selon\s+le\s+plan)|ordre\s+et\s+(?:la\s+)?num[ée]rotation/gi;
  const out: string[] = [];
  for (const m of d.matchAll(rx)) {
    const autour = d.slice(Math.max(0, (m.index || 0) - 400), (m.index || 0) + 400);
    if (!/m[ée]moire\s+technique|offre\s+technique|note\s+m[ée]thodologique/i.test(autour)) continue;
    const texte = d.slice(Math.max(0, (m.index || 0) - 3500), (m.index || 0) + 1500);
    if (!out.some((o) => o.includes(texte.slice(3000, 3600)))) out.push(texte);
    if (out.length >= 3) break;
  }
  return out;
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

/** Vrai si le schéma de la rubrique est fixé par le mémoire type (bibliothèque, spécification, organigramme) ou à la
 *  génération (process du besoin, construit sur les enjeux du DCE et non sur la rédaction) : il ne dépend pas d'une
 *  réécriture du texte par l'assistant, et son titre de page (titresSchemas) reste celui du schéma dessiné. */
export function schemaFixe(plan: PlanMemoireType | undefined, id: string): boolean {
  const s = plan?.rubriques.find((r) => r.id === id)?.schema?.source;
  return s === 'bibliotheque' || s === 'spec' || s === 'organigramme' || s === 'process_besoin';
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

/**
 * Vocabulaire du CCTP (« chef de poste » au lieu de « chef de site » / « responsable de site », vocabulaireDuCctp)
 * appliqué aux titres du mémoire type : titres de rubrique et de sous-partie, titres de page de schéma, textes des
 * schémas dessinés par le moteur (spec, process). Un schéma de la bibliothèque garde son dessin d'origine (consigne 6) :
 * le titre de sa page suit le CCTP ici, et le terme de ses textes est remplacé au dessin par le moteur (vocabulaireSchemas,
 * même rôle, mot de l'acheteur). Le fond n'est pas touché. Renvoie le mémoire type lui-même quand rien ne change.
 */
export function vocabulaireMemoireType(mt: MemoireType, dce: string): MemoireType {
  const v = (x: string) => vocabulaireDuCctp(x, dce, { parentheses: true });
  if (v('chef de site') === 'chef de site') return mt;
  const profond = (x: any): any => (typeof x === 'string' ? v(x) : Array.isArray(x) ? x.map(profond)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, profond(y)])) : x);
  const schema = (id: string, s: SchemaRubrique | null): SchemaRubrique | null => {
    if (!s) return s;
    const t = titreSchemaMemoireType(id, mt);
    const titre = t && v(t) !== t ? v(t) : s.titre;
    if (s.source === 'bibliotheque') return titre === s.titre ? s : { ...s, titre };
    return { ...s, titre, params: profond(s.params), etapes: profond(s.etapes), alternative: s.alternative ? { ...s.alternative, titre: s.alternative.titre && v(s.alternative.titre), params: profond(s.alternative.params) } : s.alternative };
  };
  return {
    ...mt,
    rubriques: mt.rubriques.map((r) => ({
      ...r,
      titre: v(r.titre),
      sous_parties: (r.sous_parties || []).map((sp) => ({ ...sp, titre: v(sp.titre) })),
      schema: schema(r.id, r.schema),
    })),
  };
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

/**
 * Libellé d'un emplacement « [À COMPLÉTER] » resté seul sur sa ligne (paragraphe sans objet, illisible pour
 * l'acheteur comme pour GSS) : tiré de la question à GSS (« Obtenir de GSS les modalités formalisées d'engagement
 * individuel de confidentialité, … » → « Modalités formalisées d'engagement individuel de confidentialité »), sinon
 * du dernier intertitre qui précède l'emplacement. Chaîne vide : aucun libellé sûr.
 */
export function libelleEmplacementSeul(question: string | undefined, texteAvant: string): string {
  let l = String(question || '')
    .replace(/^\s*à demander à l.acheteur\s*:\s*/i, '')
    .replace(/^\s*(?:obtenir|demander|fournir|pr[ée]ciser|indiquer|confirmer|communiquer|transmettre|donner|valider|lister|d[ée]crire)\s+(?:(?:de|à|aupr[èe]s de)\s+(?:GSS|l.acheteur)\s*:?\s*)?/i, '')
    // Question à GSS (« Quel taux de reprise… proposez-vous… ? », « Combien d'agents titulaires compte l'équipe… ? ») :
    // libellé nominal de la donnée (« Taux de reprise du personnel en place », « Nombre d'agents titulaires »).
    .replace(/^\s*pouvez-vous\s+\S+\s+/i, '')
    .replace(/^\s*combien\s+(d['’]|de\s+)(.+?)(?:\s+(?:compte|comptent|composent|compose|seront|sont|faut-il|pr[ée]voyez-vous)\b.*)?$/i, (_m, de: string, x: string) => `Nombre ${de.trim() === 'de' ? 'de ' : de}${x}`)
    .replace(/^\s*quel(?:le)?s?\s+(?:est|sont)\s+(.+)$/i, '$1')
    .replace(/^\s*qui est\s+(.+)$/i, '$1')
    .replace(/^\s*quel(?:le)?s?\s+(.+?)\s+\S+-(?:vous|elle|il|t-elle|t-il)\b.*$/i, '$1')
    .split(/\s*(?:[,;:?(]|\s—\s|\sainsi que\s|\set les supports\s)/)[0]
    .replace(/^(?:les|le|la|l['’]|des|du|un|une)\s*/i, '')
    .replace(/[.\s]+$/, '')
    .trim();
  if (!l || l.split(/\s+/).length < 2) {
    const titres = [...String(texteAvant || '').matchAll(/^#{2,4}\s+(.+?)\s*$/gm)];
    l = titres.length ? titres[titres.length - 1][1].replace(/[*_]/g, '').trim() : '';
  }
  if (l.length > 110) l = l.slice(0, 110).replace(/\s+\S*$/, '');
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : '';
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

/** Variante écrite par le modèle : « [À COMPLÉTER : confirmation de …] » (deux-points, tiret). */
const RX_VARIANTE = /\[\s*[ÀA]\s+COMPL[ÉE]TER\s*[:–—-]\s*([^\]]*?)\s*\]/gi;
/** Variante qui ne demande que de confirmer l'engagement que la phrase vient d'écrire (proposition déjà « à valider »). */
const CONFIRMATION_SEULE = /^(?:la\s+|une\s+)?(?:confirmation|confirmer|validation|valider)\s+(?:de\s+|d['’])?(?:l['’]engagement|cet engagement|ces engagements|ce point|la mise en œuvre)\b/i;

/**
 * Variantes « [À COMPLÉTER : X] » ramenées à la forme reconnue par les repères : la précision X devient la question à
 * GSS de l'emplacement (sinon la variante échappait aux repères et restait dans le texte remis). Une variante qui ne
 * demande que de confirmer l'engagement déjà écrit est retirée : la proposition est déjà signalée « à valider ».
 * Renvoie le texte normalisé et, dans l'ordre du texte, la question propre à chaque « [À COMPLÉTER] » (undefined : aucune).
 */
export function normaliserVariantesACompleter(texte: string): { texte: string; questions: Array<string | undefined> } {
  const questions: Array<string | undefined> = [];
  const sortie = String(texte || '').replace(/([ \t]*)\[\s*[ÀA]\s+COMPL[ÉE]TER\s*(?:[:–—-]\s*([^\]]*?)\s*)?\](?!⟦AC:)/gi, (_m: string, espace: string, x: string | undefined) => {
    const precision = String(x || '').trim();
    if (precision && CONFIRMATION_SEULE.test(precision)) return '';
    questions.push(precision ? precision.charAt(0).toUpperCase() + precision.slice(1) : undefined);
    return `${espace}${PLACEHOLDER_V2}`;
  });
  return { texte: sortie, questions };
}

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
    RX_VARIANTE.lastIndex = 0;
    const variantes = !!texte && RX_VARIANTE.test(texte);
    RX_VARIANTE.lastIndex = 0;
    if (!texte || (!variantes && !texte.includes(PLACEHOLDER_V2) && !/\[CONSULTATION REQUISE/i.test(texte))) continue;
    // Variantes « [À COMPLÉTER : X] » : ramenées à « [À COMPLÉTER] » bloc par bloc, X devient la question de
    // l'emplacement (questionsVariantes, dans l'ordre des emplacements du bloc).
    const normalises = texte.split(/\n{2,}/).map((b) => normaliserVariantesACompleter(b));
    const questionsVariantes = normalises.map((x) => x.questions);
    const blocs = normalises.map((x) => x.texte.replace(/[ \t]+$/gm, ''));
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
      const propres = questionsVariantes[k] || [];
      // Lignes de consultation réservées aux emplacements sans précision propre.
      const sansPropre = Array.from({ length: nbEmplacements }, (_, i) => i).filter((i) => !propres[i]);
      for (let i = 0; i < nbEmplacements; i++) {
        const j = sansPropre.indexOf(i);
        if (propres[i]) qs.push(propres[i]);
        else if (!questions.length) qs.push(undefined);
        else if (questions.length === 1) qs.push(questions[0]);
        else qs.push(questions[Math.min(j, questions.length - 1)]);
      }
      questionsParBloc[k] = qs;
      lignesConservees[k] = contenu;
      attente = questions.length ? [] : qs.map((q, i) => ({ q, bloc: k, index: i })).filter((a) => !a.q).map(({ bloc, index }) => ({ bloc, index }));
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
        if (libelle) question = /\?\s*$/.test(question) ? `${question.replace(/\s*\?\s*$/, '')} — ligne « ${libelle} » ?` : `${question.replace(/[.\s]+$/, '')} — ligne « ${libelle} »`;
      }
      enPlace.push({ n, id, question, contexte, environnement });
      // « [À COMPLÉTER] » seul sur sa ligne : précédé du libellé de la donnée attendue (question, sinon intertitre).
      if (/^\s*\[À COMPLÉTER\]\s*[.;]?\s*$/.test(ligne)) {
        const libelle = libelleEmplacementSeul(question, brut.slice(0, pos));
        if (libelle) return `${libelle} : ${PLACEHOLDER_V2}⟦AC:${n}⟧${/\]\s*[.;]\s*$/.test(ligne) ? '' : '.'}`;
      }
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

const PIECES_OU_PENALITES = /acte d.engagement|bordereau de prix|m[ée]moire technique (?:de|d.une?|limit)|pages? maximum|pi[èe]ces? (?:de l.offre|à (?:remettre|fournir|joindre))|dossier de (?:candidature|l.offre)|paraph[ée]s?|p[ée]nalit|plafonnement|r[ée]vision des prix|facturation|paiement|garantie financi|assurance responsabilit|\bassurances?\b(?!\s+(?:qualit|de (?:la )?qualit|s[ée]curit))|attestations? d.assurance|garanties? (?:financi|souscrite)|contrat d.assurance|\bsinistres?\b/i;

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

/** Mot ramené au singulier (« attestations » → « attestation », « travaux » → « travau » : racine commune suffisante). */
const singulier = (w: string) => (w.length > 4 ? w.replace(/[sx]$/, '') : w);

export interface GroupeNouveau { sujet: string; theme: string; exigences: ExigenceMatrice[] }

/**
 * Proposition de réponse de l'IA : une phrase qui AFFIRME un point posé en question à GSS (« les agents SSIAP 1
 * effectuent les rondes » alors que GSS est interrogé : « Un agent SSIAP 1 est-il chargé d'effectuer les rondes ? »)
 * est retirée : la réponse de GSS la remplacera (même règle que les variables « à compléter »). Rapprochement par
 * racines de mots : au moins 3 racines communes couvrant 60 % de la question. Titres, tableaux et repères gardés.
 */
export function retirerAffirmationsQuestionnees(texte: string, questions: string[]): { texte: string; retires: string[] } {
  const racines = (t: string) => new Set([...motsSujet(t)].map((w) => w.replace(/s$/, '').slice(0, 6)));
  const qs = questions.filter((q) => /\?\s*$/.test(String(q || '').trim())).map(racines).filter((r) => r.size >= 3);
  const retires: string[] = [];
  if (!qs.length) return { texte, retires };
  const lignes = String(texte || '').split('\n').map((ligne) => {
    if (/^\s*(?:#|\|)/.test(ligne) || /^\s*\*\*[^*]+\*\*\s*$/.test(ligne)) return ligne;
    const debut = (ligne.match(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/) || [''])[0];
    const phrases = ligne.slice(debut.length).split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(*])/);
    const gardees = phrases.filter((ph) => {
      if (/\[À COMPLÉTER\]|\[CONSULTATION REQUISE|⟦AC:/.test(ph)) return true;
      const r = racines(ph);
      const affirme = qs.some((q) => { const n = [...q].filter((w) => r.has(w)).length; return n >= 3 && n / q.size >= 0.6; });
      if (affirme) retires.push(ph.replace(/[*#]/g, '').trim());
      return !affirme;
    });
    if (!gardees.length) return debut.trim() ? null : '';
    return `${debut}${gardees.join(' ')}`;
  }).filter((l): l is string => l !== null);
  return { texte: lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim(), retires };
}

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
    // Mots ramenés au singulier (« Attestations d'assurance » et « Attestation d'assurance » : un seul sujet, parc_expo 202).
    const mots = new Set([...motsSujet(sujet)].map(singulier));
    const g = groupes.find((x) => {
      if (normaliser(x.sujet) === normaliser(sujet) || [...mots].join(' ') === [...x.mots].join(' ')) return true;
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

/**
 * Formalité de constitution de l'offre, hors mémoire technique (citedia 341 : « Cette visite obligatoire aura lieu le 7
 * Octobre 2026 », « cadre de réponse obligatoire du lot 2 » devenus des rubriques, avec « La visite obligatoire des lieux a
 * été effectuée le 7 octobre 2026 » et « L'attestation… est jointe à l'offre », faits inventés) : visite obligatoire et
 * attestation de visite, cadre de réponse à joindre, pièce dont l'absence rend l'offre irrégulière. Jamais une rubrique
 * proposée : une question à GSS dans les consultations (questionFormalite).
 */
export const FORMALITES_OFFRE = /visites? (?:obligatoires?|pr[ée]alables?)|visites? (?:des (?:lieux|sites)|de (?:site|reconnaissance))[^.]{0,60}(?:obligatoire|pr[ée]alable|avant (?:la remise|le d[ée]p[ôo]t)|candidats?|soumissionnaires?)|(?:attestation|certificat|bon)s? de visite|cadres? de r[ée]ponse (?:obligatoires?|par lot|du lot|joint|à (?:joindre|compl[ée]ter|remplir|renseigner|fournir|remettre))|(?:joindre|compl[ée]ter|remplir|renseigner|fournir|remettre)[^.]{0,30}cadres? de r[ée]ponse|offre[^.]{0,60}(?:irr[ée]guli[èe]re|irrecevable)|sous peine (?:de rejet|d.irr[ée]gularit[ée]|d.irrecevabilit[ée])/i;

/** Question exacte posée à GSS pour une formalité de l'offre (hors mémoire technique). */
export function questionFormalite(e: { sujet?: string; exigence: string }): string {
  const x = String(e.exigence || '').replace(/\s+/g, ' ').trim().replace(/[.;:\s]+$/, '');
  return `Formalité de l'offre, hors mémoire technique (aucune rubrique n'est rédigée) : « ${x.length > 300 ? `${x.slice(0, 300).replace(/\s+\S*$/, '')}…` : x} ». GSS l'a-t-elle prévue, et joindra-t-elle à son offre la pièce demandée ?`;
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
  // Guillemets retirés seulement quand ils encadrent tout le texte (imm 473 : le guillemet ouvrant d'un titre cité en tête
  // était retiré seul, « Le livre … (LMC) » structure… » sans guillemet ouvrant, et le moteur refusait le schéma).
  let s = String(t ?? '').replace(/\s+/g, ' ').trim();
  const entoure = /^[«"“]\s*([^«»"“”]*?)\s*[»"”]$/.exec(s);
  if (entoure) s = entoure[1].trim();
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
    // Limites du moteur (rendu_schemas.py) : titre 36 (flux) ou 26 (chevrons) caractères ; coupe sur un mot plein.
    .map((e) => ({ titre: titreEtape(e?.titre, gabarit === 'chevrons' ? 26 : 34), texte: court(e?.texte, 86), role: String(e?.role || '').toLowerCase().split(/[^a-zé]+/)[0] }))
    .filter((e) => e.titre)
    .slice(0, max);
  if (propres.length < (gabarit === 'chevrons' ? 3 : 2)) return null;
  const etapesSpec = propres.map((e, i) => {
    const role = i === propres.length - 1 ? 'vert' : (ROLES.includes(e.role) && e.role !== 'vert' ? e.role : (i < 2 ? 'rouge' : i === propres.length - 2 ? 'bleu' : 'orange'));
    return { titre: e.titre.charAt(0).toUpperCase() + e.titre.slice(1), ...(e.texte ? { texte: e.texte.charAt(0).toUpperCase() + e.texte.slice(1) } : {}), role };
  });
  return { gabarit, params: { etapes: etapesSpec } };
}

/**
 * Défauts de fond des étapes du schéma de process (consignes 3 et 6 : un schéma qui n'apporte rien est refusé) : titre
 * réduit au nom de l'étape, phrase générale (« … nous consulte pour le marché »), phrase qui reprend le titre de l'étape,
 * poste présenté comme acteur (« Le PC réalise les rondes »). Liste vide : étapes acceptables.
 */
/** Carte qui ne fait que reprendre les intitulés de poste (« les SSIAP 2, SSIAP 1 et ADS tiennent les postes prescrits »). */
const INTITULE_POSTE = /\b(?:tienn?ent|occupent|occupe|assurent|assure|tient)\s+(?:les|le|leurs?)\s+postes?\s*(?:prescrits?|pr[ée]vus?|demand[ée]s?|exig[ée]s?|d[ée]finis?|du (?:CCTP|march[ée]))?\s*\.?$/i;
/** Étape de résultat (« Site sécurisé sans interruption », « Continuité de service garantie »…). */
const RESULTAT = /s[ée]curis|s[ûu]ret[ée] (?:assur|garanti)|continuit|garanti|conform|ma[îi]tris|fiab|s[ée]r[ée]nit|r[ée]sultat|z[ée]ro|sans (?:interruption|rupture|incident|carence)|prot[ée]g|tranquill|qualit[ée]|respect|confian|trac[ée]|r[ée]activ|disponib|s[ée]curit[ée] (?:des|du)|assur[ée]e?s?\b/i;

export function defautsEtapesBesoin(etapes: Array<{ titre?: string; texte?: string }> | undefined, contexte: { texte?: string; sites?: string[] } = {}): string[] {
  const GENERIQUE = /^(?:(?:votre|vos|notre|nos|le|la|les)\s+)?(?:besoins?|enjeux?|dispositifs?|pilotages?|r[ée]sultats?|attentes?|r[ée]ponses?|process(?:us)?)$/i;
  const FORMULE = /nous consulte|consult\w* (?:GSS )?pour (?:le|ce|un) march[ée]|^(?:vos|nos) enjeux (?:comprennent|sont|portent)|^notre dispositif s.appuie|^notre pilotage (?:s.appuie|repose)|^votre besoin porte sur|blocs? cit[ée]s?/i;
  const POSTE_ACTEUR = /^(?:le|la|l['’])\s*(?:PC|PCS|poste(?: central| de s[ée]curit[ée])?|accueil|loge)\s+(?!(?:de|du|des|d['’])\s)(?:r[ée]alis|effectu|assur|g[èe]r|surveill|contr[ôo]l|accueill|alert|fai[ts])/i;
  const norm = (t: string) => normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const defauts: string[] = [];
  (Array.isArray(etapes) ? etapes : []).forEach((e, i) => {
    const titre = String(e?.titre || '').trim();
    const texte = String(e?.texte || '').trim();
    const n = `étape ${i + 1}`;
    if (GENERIQUE.test(titre)) defauts.push(`${n} : titre « ${titre} » réduit au nom de l'étape ; donne un titre nominal qui nomme le contenu propre à ce marché (enjeu, exigence ou moyen du DCE).`);
    if (FORMULE.test(texte)) defauts.push(`${n} : phrase générale « ${texte} » ; écris un fait concret du DCE ou un moyen de GSS.`);
    const t = norm(titre);
    if (t.length >= 4 && norm(texte).startsWith(t)) defauts.push(`${n} : la phrase reprend le titre de l'étape ; elle doit apporter une information nouvelle.`);
    if (POSTE_ACTEUR.test(texte)) defauts.push(`${n} : « ${texte} » présente un poste comme acteur ; le sujet est l'agent qui l'occupe, avec sa qualification, et son action respecte le CCTP.`);
    if (INTITULE_POSTE.test(`${titre} ${texte}`)) defauts.push(`${n} : « ${titre} : ${texte} » ne fait que reprendre les intitulés de poste ; dis ce que l'agent fait de propre à ce marché.`);
  });
  // Le besoin ne se réduit pas au nom du site (fontainebleau 21 : « Domaine de Fontainebleau → Remplacement sous 2 heures »).
  const premiere = Array.isArray(etapes) && etapes.length ? etapes[0] : null;
  const titre1 = norm(String(premiere?.titre || ''));
  const LIEU = /^(?:(?:le|la|les|l)\s+)?(?:site|sites|domaine|chateau|campus|batiment|batiments|siege|musee|parc|hopital|centre|universite|mairie|ville|residence|immeuble|ensemble)\b/;
  if (titre1 && ((contexte.sites || []).some((x) => { const n = norm(x); return n && (n === titre1 || n.startsWith(titre1) || titre1.startsWith(n)); })
    || (LIEU.test(titre1) && !/\b(?:besoin|surveillance|securite|continuite|protection|accueil|controle|rondes?|filtrage|gardiennage|prevention|evenement)/.test(titre1)))) {
    defauts.push(`étape 1 : « ${premiere!.titre} » nomme le site, pas le besoin ; l'étape 1 dit ce dont l'acheteur a besoin (fait du DCE).`);
  }
  // Étapes recopiées de la seule phrase de conclusion du texte : le schéma redit la conclusion, il ne montre pas un
  // process (besoin → contraintes → réponse de GSS → résultat).
  if (contexte.texte && Array.isArray(etapes) && etapes.length >= 3) {
    const libres = String(contexte.texte).split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^(?:#|\||[-*•]\s)/.test(p));
    const conclusion = norm(libres[libres.length - 1] || '');
    const dans = etapes.filter((e) => { const m = norm(String(e?.texte || '')).split(' ').filter((w) => w.length > 3); return m.length >= 3 && m.filter((w) => conclusion.includes(w)).length / m.length >= 0.8; }).length;
    if (conclusion && dans >= 3) defauts.push(`${dans} étapes recopient la phrase de conclusion du texte ; enchaîne le besoin, les contraintes du DCE, la réponse de GSS puis le résultat, avec des mots des parties « Vos attentes » et « Points de vigilance ».`);
  }
  // « Pour arriver à ça » : la dernière étape dit le résultat obtenu pour l'acheteur.
  const derniere = Array.isArray(etapes) && etapes.length ? etapes[etapes.length - 1] : null;
  if (derniere && !RESULTAT.test(`${derniere.titre || ''} ${derniere.texte || ''}`)) {
    defauts.push(`étape ${etapes!.length} : la dernière étape doit dire le résultat obtenu pour l'acheteur (site sécurisé, continuité de service, prestation conforme et contrôlée…), pas un moyen.`);
  }
  return defauts;
}

/**
 * Minimum déterministe du bloc « compréhension » (consigne 3) : au moins 4 attentes chiffrées et 3 points de vigilance.
 * Quand la rédaction en donne moins, les puces manquantes sont tirées des exigences du DCE (matrice, sinon obligations
 * chiffrées du CCTP) : d'abord celles que le DCE sanctionne (pénalité, manquement), puis les bloquantes et les
 * chiffrées ; une exigence déjà citée dans le bloc (mêmes chiffres, ou 60 % de ses mots) n'est pas reprise. Chaque
 * puce renvoie à la rubrique du mémoire qui la développe quand la matrice l'y rattache.
 */
/**
 * Engagements de couverture (« ## Nos engagements sur les exigences du cahier des charges ») qui ne font que redire une
 * ligne du tableau « Le périmètre de la prestation demandée » du bloc 1 (même site, même poste, mêmes horaires et même
 * qualification, aucun autre chiffre) : retirés de la rubrique, le bloc 1 les présente déjà (génération réelle ign 15 :
 * 9 postes du CCTP redits en puces dans « L'adéquation de nos moyens humains », 5 pages de texte au lieu de 1 à 2,
 * consignes 3 et 6). Une puce qui apporte un autre chiffre (relève, ouverture à 6 h, fermeture à 21 h) est gardée ;
 * le sous-titre est retiré s'il ne reste aucune puce.
 */
export function sansRediteDuPerimetre(texte: string, besoin: string): { texte: string; retirees: string[] } {
  const TITRE = /\n*## Nos engagements sur les exigences du cahier des charges\n+/;
  const m = TITRE.exec(texte);
  if (!m) return { texte, retirees: [] };
  const i = besoin.search(/^##\s+Le périmètre de la prestation demandée/m);
  if (i < 0) return { texte, retirees: [] };
  const lignesTableau = besoin.slice(i).split('\n').slice(1).filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l));
  if (lignesTableau.length < 2) return { texte, retirees: [] };
  // Chiffres porteurs : heures (« 7h00 », « 7 h » → 7), niveaux, échelons, coefficients ; les « 00 » des minutes ne comptent pas.
  const chiffres = (t: string) => new Set((normaliser(t).replace(/(\d{1,2})\s*h\s*00\b/g, '$1 h').match(/\d+/g) || []).filter((x) => !/^0+$/.test(x)).map((x) => String(Number(x))));
  const mots = (t: string) => normaliser(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const lignes = lignesTableau.slice(1).map((l) => {
    const cellules = l.split('|').map((c) => c.trim()).filter((c, k, a) => k > 0 && k < a.length - 1);
    return {
      chiffres: chiffres(l),
      site: mots(cellules[0] || '').filter((w) => w.length >= 5 && !/^(?:batiment|campus|site|poste|accueil)$/.test(w)),
      poste: mots(cellules[1] || '').filter((w) => /^(?:ssiap|ads|aps|cqp|agent|chef|rondier|cynophile|maitre|sst|pse1?)$/.test(w)).slice(0, 1),
    };
  }).filter((l) => l.site.length && l.poste.length && l.chiffres.size >= 2);
  if (!lignes.length) return { texte, retirees: [] };
  const avant = texte.slice(0, m.index);
  const apres = texte.slice(m.index + m[0].length);
  const retirees: string[] = [];
  const gardees = apres.split('\n').filter((l) => {
    if (!/^\s*[-*•]\s/.test(l)) return true;
    const c = chiffres(l);
    if (c.size < 3) return true;
    const n = mots(l);
    const redite = lignes.some((r) => [...c].every((x) => r.chiffres.has(x)) && r.site.some((w) => n.includes(w)) && r.poste.every((w) => n.includes(w)));
    if (redite) retirees.push(l.replace(/^\s*[-*•]\s*/, '').trim());
    return !redite;
  });
  if (!retirees.length) return { texte, retirees };
  const reste = gardees.join('\n').trim();
  return { texte: /^\s*[-*•]\s/m.test(reste) ? `${avant.trimEnd()}\n\n## Nos engagements sur les exigences du cahier des charges\n\n${reste}` : `${avant.trimEnd()}${reste ? `\n\n${reste}` : ''}`, retirees };
}

/**
 * Rubrique « 1 à 2 pages d'explication, puis 1 page de schéma » (consignes 3 et 6) : quand les puces ajoutées par le
 * contrôle de couverture (« ## Nos engagements sur les exigences du cahier des charges ») font dépasser 2 pages de texte,
 * les puces sont retirées jusqu'à tenir dans 2 pages, en commençant par les plus longues sans chiffre (listes de missions
 * recopiées du CCTP), puis les plus longues ; le texte de GSS n'est jamais touché (génération réelle ign 15 :
 * « L'adéquation de nos moyens humains » sur 5 pages de texte). `pages` mesure le texte comme le rendu.
 */
export function plafonnerEngagementsPages(texte: string, pages: (t: string) => number, maxPages = 2): { texte: string; retirees: string[] } {
  const TITRE = '## Nos engagements sur les exigences du cahier des charges';
  const i = texte.indexOf(TITRE);
  if (i < 0 || pages(texte) <= maxPages) return { texte, retirees: [] };
  const avant = texte.slice(0, i).trimEnd();
  const lignes = texte.slice(i + TITRE.length).split('\n');
  const puces = lignes.map((l, k) => ({ l, k })).filter((x) => /^\s*[-*•]\s/.test(x.l));
  const ordre = puces.slice().sort((a, b) => (/\d/.test(a.l) ? 1 : 0) - (/\d/.test(b.l) ? 1 : 0) || b.l.length - a.l.length);
  const retirees: string[] = [];
  const otees = new Set<number>();
  const composer = () => {
    const reste = lignes.filter((_, k) => !otees.has(k)).join('\n').trim();
    return /^\s*[-*•]\s/m.test(reste) ? `${avant}\n\n${TITRE}\n\n${reste}` : `${avant}${reste ? `\n\n${reste}` : ''}`;
  };
  let t = texte;
  for (const p of ordre) {
    if (pages(t) <= maxPages) break;
    otees.add(p.k);
    retirees.push(p.l.replace(/^\s*[-*•]\s*/, '').trim());
    t = composer();
  }
  return { texte: t, retirees };
}

/**
 * Bloc « Notre compréhension de votre besoin » tenu en 1 à 2 pages d'explication (consigne 3 : « 1 schéma et 1 à 2 pages
 * d'explication ») quand la rédaction dépasse sa limite de mots (génération réelle ign 14 : 908 mots pour 700 demandés,
 * 3 pages de texte). Retraits sans modèle, une ligne à la fois, jusqu'à tenir dans `maxPages` : d'abord les paragraphes
 * libres qui suivent les puces (récapitulatif du schéma), puis les phrases libres du périmètre après le tableau (de la plus
 * longue à la plus courte), puis les puces au-delà du minimum (4 attentes, 3 points de vigilance, en partant de la fin),
 * enfin les lignes du contexte au-delà des deux premières. Le tableau, les sous-titres et l'amorce restent.
 */
export function reduireBesoinAPages(texte: string, pages: (t: string) => number, maxPages = 2, minimum = { attentes: 4, vigilance: 3 }): { texte: string; retirees: string[] } {
  if (pages(texte) <= maxPages) return { texte, retirees: [] };
  const lignes = texte.split('\n');
  const section = (k: number) => {
    for (let j = k; j >= 0; j--) { const m = /^##\s+(.+)$/.exec(lignes[j]); if (m) return m[1]; }
    return '';
  };
  const PUCE = /^\s*[-*•]\s/;
  const libre = (l: string) => l.trim() && !/^\s*(?:#|\|)/.test(l) && !PUCE.test(l);
  const candidats: number[][] = [[], [], [], [], []];
  const parSection: Record<string, number[]> = {};
  lignes.forEach((l, k) => {
    const sec = section(k);
    (parSection[sec] ||= []).push(k);
    if (/^Vos attentes|^Les points de vigilance/i.test(sec) && libre(l)) candidats[0].push(k);
    else if (/^Le périmètre/i.test(sec) && libre(l) && lignes.slice(0, k).some((x, j) => /^\s*\|/.test(x) && section(j) === sec)) candidats[1].push(k);
  });
  candidats[1].sort((a, b) => lignes[b].length - lignes[a].length);
  for (const [cle, min, rang] of [[/^Vos attentes/i, minimum.attentes, 2], [/^Les points de vigilance/i, minimum.vigilance, 3]] as Array<[RegExp, number, number]>) {
    const sec = Object.keys(parSection).find((x) => cle.test(x));
    const puces = sec ? parSection[sec].filter((k) => PUCE.test(lignes[k])) : [];
    candidats[rang].push(...puces.slice(min).reverse());
  }
  const contexte = Object.keys(parSection).find((x) => /^Votre contexte/i.test(x));
  if (contexte) candidats[4].push(...parSection[contexte].filter((k) => libre(lignes[k])).slice(2).reverse());
  const otees = new Set<number>();
  const composer = () => lignes.filter((_, k) => !otees.has(k)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let t = texte;
  const retirees: string[] = [];
  for (const k of candidats.flat()) {
    if (pages(t) <= maxPages) break;
    otees.add(k);
    retirees.push(lignes[k].trim());
    t = composer();
  }
  return { texte: t, retirees };
}

/**
 * Exigence du DCE marquée « en écart » par l'analyse, mais traitée dans le texte final (puce d'engagement de la
 * couverture, proposition) : ce n'est plus une question pour GSS (génération réelle imm 15 : « Quels bâtiments, locaux
 * et installations annexes composent le périmètre du marché… » posé à GSS alors que le mémoire écrit « GSS prendra en
 * compte le périmètre du marché : bâtiment principal composé des bâtiments D, T, C et H… »). Traitée = tous ses chiffres
 * et au moins 60 % de ses mots porteurs (4 lettres et plus) figurent dans un même paragraphe du texte.
 */
export function exigenceTraitee(exigence: string, texte: string): boolean {
  const e = normaliser(String(exigence || ''));
  const mots = [...new Set(e.split(/[^a-z0-9]+/).filter((w) => w.length >= 4))];
  if (mots.length < 3) return false;
  const chiffres = e.match(/\d+(?:[,.]\d+)?/g) || [];
  return String(texte || '').split(/\n{2,}|\n(?=\s*[-*•]\s)/).some((p) => {
    const n = normaliser(p);
    if (!chiffres.every((c) => new RegExp(`(?<![\\d,.])${c.replace('.', '[.,]')}(?![\\d])`).test(n))) return false;
    const presents = new Set(n.split(/[^a-z0-9]+/));
    return mots.filter((w) => presents.has(w)).length / mots.length >= 0.6;
  });
}

export function completerBesoinMinimum(
  texte: string,
  sources: Array<{ exigence: string; rubrique?: string; criticite?: string }>,
  plan?: PlanMemoireType,
  dce = '',
  minimum = { attentes: 4, vigilance: 3 },
): { texte: string; ajoutees: number } {
  const parties = String(texte || '').split(/(?=^## )/m);
  const iAtt = parties.findIndex((p) => /^##\s+Vos attentes/i.test(p));
  const iVig = parties.findIndex((p) => /^##\s+Les points de vigilance/i.test(p));
  const puces = (p: string) => (p.match(/^\s*[-*•]\s+\S/gm) || []).length;
  const manqueAtt = iAtt < 0 ? minimum.attentes : Math.max(0, minimum.attentes - puces(parties[iAtt]));
  const manqueVig = iVig < 0 ? minimum.vigilance : Math.max(0, minimum.vigilance - puces(parties[iVig]));
  if (!manqueAtt && !manqueVig) return { texte, ajoutees: 0 };
  const motsDe = (t: string) => new Set(normaliser(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  const chiffres = (t: string) => (t.match(/\d+(?:[,.]\d+)?/g) || []);
  const dejaCite = (e: string, dans: string) => {
    const c = chiffres(e);
    const n = normaliser(dans);
    if (c.length && c.every((x) => new RegExp(`(?<![\\d,.])${x.replace('.', '[.,]')}(?![\\d])`).test(dans))) {
      const m = [...motsDe(e)];
      if (m.filter((w) => n.includes(w)).length / Math.max(1, m.length) >= 0.4) return true;
    }
    const m = [...motsDe(e)];
    return m.length > 0 && m.filter((w) => n.includes(w)).length / m.length >= 0.6;
  };
  // Phrases du DCE qui sanctionnent un manquement : une exigence dont un chiffre y figure est « sanctionnée ».
  // (« Tout manquement à cette obligation sera sanctionné… » vise la phrase qui la précède.)
  const phrasesDce = String(dce || '').replace(/\s+/g, ' ').split(/(?<=[.;])\s+/);
  const sanctions = phrasesDce.filter((ph, i) => /p[ée]nalit|sanctionn|manquement/i.test(ph) || /^(?:tout|ce|cet|cette)\s+(?:manquement|retard|non-respect)/i.test(phrasesDce[i + 1] || '')).join(' ');
  const sanctionnee = (e: string) => /p[ée]nalit|sanctionn|manquement/i.test(e) || chiffres(e).some((x) => x.length >= 1 && new RegExp(`(?<![\\d,.])${x}\\s*(?:\\(\\d+\\)\\s*)?(?:h\\b|heures?|min|jours?|mois|semaines?)`, 'i').test(sanctions));
  const rang = (e: { exigence: string; criticite?: string }) => (sanctionnee(e.exigence) ? 0 : 2) + (/bloqu/i.test(e.criticite || '') ? 0 : 1) + (chiffres(e.exigence).length ? 0 : 2);
  const candidats = sources
    .map((e) => ({ ...e, exigence: String(e.exigence || '').replace(/\s+/g, ' ').trim() }))
    .filter((e) => e.exigence.split(' ').length >= 5 && e.exigence.length <= 330 && !/p[ée]nalit[ée]s?[^.]{0,80}\d[\d\s]*(?:€|euros?)|€/i.test(e.exigence)
      // Phrase qui dépend de la précédente (« Dans ce cas, … », « Ce CR devra… ») : incompréhensible seule.
      && !/^(?:dans ce cas|en ce cas|de m[êe]me|ce|cet|cette|ces|il|elle|ils|elles|celui|celle|ceux|ledit|ladite)\b/i.test(e.exigence))
    .sort((a, b) => rang(a) - rang(b));
  const renvoi = (id?: string) => {
    const r = id && plan ? plan.rubriques.find((x) => x.id === id) : undefined;
    const b = r && plan ? plan.blocs.find((x) => x.id === r.bloc) : undefined;
    return r && b ? ` → notre réponse : « ${r.titre.replace(/\{\{[^}]*\}\}/g, '').replace(/\s*:\s*$/, '').trim()} », développée au bloc ${b.numero}` : '';
  };
  const choisies: string[] = [];
  const prendre = (n: number) => {
    const out: Array<{ exigence: string; rubrique?: string }> = [];
    for (const e of candidats) {
      if (out.length >= n) break;
      // Redite jugée sur les attentes et les points de vigilance seulement (le périmètre, long, recouvre presque tout).
      const engagements = parties.filter((p) => /^##\s+(?:Vos attentes|Les points de vigilance)/i.test(p)).join('\n');
      if (choisies.includes(e.exigence) || dejaCite(e.exigence, `${engagements}\n${out.map((x) => x.exigence).join('\n')}`)) continue;
      choisies.push(e.exigence);
      out.push(e);
    }
    return out;
  };
  // Exigence citée après « : » (comme les puces rédigées) : initiale en minuscule, sauf sigle ou nom propre en tête
  // (« : le taux moyen mensuel… », génération réelle ign 15 : « : Le taux moyen… » ; « : SSIAP 2 au PC… » gardé).
  const maj = (t: string) => {
    const x = t.replace(/[.;]\s*$/, '');
    const premier = x.split(/[\s,;:]/)[0] || '';
    const propre = /^[A-ZÀ-Ý0-9]{2,}/.test(premier) || /^[A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý]|[A-ZÀ-Ý])/.test(premier)
      || /^(?:Paris|Rouen|Caen|Normandie|France|Île|GSS)$/.test(premier);
    return propre ? x : x.charAt(0).toLowerCase() + x.slice(1);
  };
  let ajoutees = 0;
  const att = prendre(manqueAtt).map((e) => `- **Ce que vous attendez** : ${maj(e.exigence)}${renvoi(e.rubrique)}.`);
  const vig = prendre(manqueVig).map((e) => `- **Point de vigilance** : ${maj(e.exigence)}${renvoi(e.rubrique)}.`);
  const ajouter = (i: number, titre: string, l: string[]) => {
    if (!l.length) return;
    ajoutees += l.length;
    if (i >= 0) parties[i] = `${parties[i].trimEnd()}\n${l.join('\n')}\n\n`;
    // Sous-titre ajouté toujours sur sa propre ligne (format court hors ligne : « …main courante.## Vos attentes… »).
    else parties.push(`\n\n${titre}\n\n${l.join('\n')}\n\n`);
  };
  ajouter(iAtt, '## Vos attentes et nos engagements', att);
  ajouter(iVig < 0 ? -1 : parties.findIndex((p) => /^##\s+Les points de vigilance/i.test(p)), '## Les points de vigilance identifiés et nos réponses', vig);
  return { texte: parties.join('').replace(/\n{3,}/g, '\n\n').trim(), ajoutees };
}

/** Mots trop généraux pour lier une citation du CCTP à la puce qui la suit. */
const MOTS_VIDES_CITATION = new Set(['avant', 'apres', 'dans', 'pour', 'avec', 'sans', 'sous', 'entre', 'leur', 'leurs', 'cette', 'tout', 'toute', 'tous', 'toutes', 'chaque', 'etre', 'sont', 'doit', 'doivent', 'devra', 'devront', 'plus', 'moins', 'ainsi', 'notre', 'votre', 'titulaire', 'prestataire', 'marche', 'prestation', 'prestations']);

/**
 * Contrôle déterministe des puces du bloc 1 « **Ce que vous attendez** (« citation du CCTP ») : contenu → notre réponse :
 * … » (génération réelle ign 14 : citation sur la confidentialité, contenu sur le PTI) : la citation doit partager au
 * moins un mot porteur de sens (4 lettres au moins, hors mots trop généraux, comparé sur ses 5 premières lettres) avec
 * le contenu qui la suit (avant « → ») ; sinon elle est retirée et la puce gardée. L'initiale d'un nom commun après
 * « : » (après l'étiquette, la citation ou « notre réponse ») passe en minuscule (« : Transmission au SAIMG » → « : transmission au SAIMG ») ; un nom
 * propre (jamais écrit en minuscule dans le texte, ou écrit avec sa majuscule en milieu de phrase) la garde.
 */
export function citationsCoherentes(texte: string): { texte: string; retirees: number } {
  let retirees = 0;
  const racines = (t: string) => new Set(normaliser(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !MOTS_VIDES_CITATION.has(w)).map((w) => w.slice(0, 5)));
  const tout = String(texte || '');
  const nomCommun = (mot: string) => {
    if (!/^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(mot)) return false;
    // (le mot ne contient que des lettres, des tirets et des apostrophes : aucun caractère spécial d'expression régulière)
    if (new RegExp(`[a-zà-ÿ,] ${mot}(?![\\p{L}])`, 'u').test(tout)) return false;   // majuscule en milieu de phrase : nom propre
    const bas = mot.charAt(0).toLowerCase() + mot.slice(1);
    return new RegExp(`(?<![\\p{L}])${bas}(?![\\p{L}])`, 'u').test(tout);
  };
  const minuscule = (ligne: string) => ligne.replace(/(\)\s*:\s*|^\s*[-*•]\s+\*\*[^*]+\*\*\s*:\s*|→\s*notre réponse\s*:\s*)([A-ZÀ-Ý][a-zà-ÿ'’-]+)/g, (m, sep: string, mot: string) => (nomCommun(mot) ? `${sep}${mot.charAt(0).toLowerCase()}${mot.slice(1)}` : m));
  const sortie = tout.split('\n').map((ligne) => {
    const m = /^(\s*[-*•]\s+\*\*[^*]+\*\*)\s*\(\s*«\s*([^»]+?)\s*»\s*\)(\s*:\s*)(.*)$/.exec(ligne);
    if (!m) return /^\s*[-*•]\s+\*\*/.test(ligne) ? minuscule(ligne) : ligne;
    const contenu = m[4].split('→')[0];
    // Attente écrite seulement dans la citation (« **Ce que vous attendez** (« … ») : → notre réponse : … ») : la citation
    // devient le contenu de la puce, jamais retirée (génération réelle ign 16 : deux puces « Ce que vous attendez : → … »).
    if (!contenu.trim()) return minuscule(`${m[1]}${m[3]}${m[2].replace(/[.;\s]+$/, '')} ${m[4].trim()}`);
    const c = racines(m[2]);
    const lie = [...racines(contenu)].some((w) => c.has(w));
    if (lie) return minuscule(ligne);
    retirees++;
    return minuscule(`${m[1]}${m[3]}${m[4]}`);
  }).join('\n');
  return { texte: sortie, retirees };
}

/** Mots qui ne terminent pas un titre coupé (« Le périmètre de la » → « Le périmètre »). */
const MOTS_OUTILS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'ou', 'à', 'au', 'aux', 'en', 'pour', 'par', 'avec', 'sur', 'sous', 'dans', 'un', 'une', 'nos', 'vos', 'notre', 'votre', 'son', 'sa', 'ses', 'leur', 'leurs', 'ce', 'cette', 'ces', 'qui', 'que', 'entre', 'selon', 'sans', 'chez', 'vers', 'lors', 'dont']);

/** Titre d'étape coupé à la limite du gabarit sur un mot plein (sans mot outil pendant en fin de titre). */
function titreEtape(t: unknown, max: number): string {
  const entier = court(t, 1000);
  let mots = court(t, max).split(' ');
  if (mots.join(' ') !== entier) while (mots.length > 1 && MOTS_OUTILS.has(mots[mots.length - 1].toLowerCase().replace(/['’]$/, ''))) mots = mots.slice(0, -1);
  return mots.join(' ');
}

/**
 * Schéma de secours du bloc « compréhension » construit sur son CONTENU (consigne 3 : « on pense à ça, puis à ça, pour
 * arriver à ça ») quand les étapes du modèle sont refusées deux fois : les points de vigilance puis les attentes du texte
 * (« X → notre réponse : Y ») deviennent les étapes (titre = X coupé sur un mot plein, texte = Y sans le renvoi au bloc),
 * puis une étape verte « Votre résultat ». Génération réelle ign 16 : le secours par sous-titres donnait un schéma
 * « Votre contexte → Le périmètre → Vos attentes → Les points de vigilance », qui n'apporte rien. null : moins de 3 puces.
 */
const INTERNE = /\[À COMPLÉTER\]|⟦|\[CONSULTATION|\[\s*[A-ZÀ-Ý]/;

/** Renvoi interne « … au bloc 4, « Rubrique » » retiré d'un texte d'étape, sous toutes ses formes (« processus détaillés
 *  au bloc 4 », « selon le processus décrit au bloc 4 », « suit les processus du bloc 5, « … » ») ; '' si le texte ne
 *  garde pas au moins 3 mots (cstb 221 : « Le remplacement des absences prévues et imprévues suit les processus du bloc 5 »). */
export function sansRenvoiBloc(y: string): string {
  let t = String(y || '').replace(/\s+/g, ' ').trim();
  const k = t.search(/(?:\b(?:du|au|aux|des|dans les?|en|le|les)\s+)?\bblocs?\s+\d/i);
  if (k < 0) return t;
  t = t.slice(0, k);
  const QUEUE = /(?:\s*[,;:(]\s*|\s+(?:suit|suivent|suivant|selon|conform[ée]ment|d['’]apr[èe]s|[àa]|au|aux|le|la|les|l['’]|du|des|de|dans|en|processus|proc[ée]dures?|process|d[ée]crite?s?|d[ée]taill[ée]e?s?|d[ée]velopp[ée]e?s?|trait[ée]e?s?|pr[ée]sent[ée]e?s?|expos[ée]e?s?|expliqu[ée]e?s?|voir|cf\.?|et|est|sont|sera|seront|qui))+\s*$/i;
  for (let i = 0; i < 6 && QUEUE.test(` ${t}`); i++) t = ` ${t}`.replace(QUEUE, '').trim();
  t = t.replace(/[\s,;:(«»"]+$/, '').trim();
  return t.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length >= 3 ? t : '';
}

/** Texte d'étape de 86 caractères au plus, coupé seulement à la fin d'une phrase ou d'une proposition (« ; », « , »),
 *  jamais en plein groupe (cstb 221 : « … permettent de transmettre ») ; '' si aucune coupe propre n'est possible. */
export function texteEtapeEntier(y: string, max = 86): string {
  const r = texteEtapeCoupe(y, max);
  // Guillemets ou parenthèses non refermés : phrase coupée, refusée (le moteur la refuse aussi).
  return (r.match(/«/g) || []).length === (r.match(/»/g) || []).length && (r.match(/\(/g) || []).length === (r.match(/\)/g) || []).length ? r : '';
}
function texteEtapeCoupe(y: string, max: number): string {
  const t = String(y || '').replace(/\s+/g, ' ').replace(/[.;,:\s]+$/, '').trim();
  if (t.length <= max) return t;
  const phrase = t.split(/(?<=[.;!?])\s+/)[0].replace(/[.;!?\s]+$/, '');
  if (phrase.length <= max && phrase.length >= 25) return phrase;
  const k = t.lastIndexOf(', ', max);
  if (k >= 30) {
    const f = t.slice(0, k).trim();
    const dernier = (f.split(' ').pop() || '').toLowerCase().replace(/['’]$/, '');
    if (!MOTS_OUTILS.has(dernier)) return f;
  }
  return '';
}

/**
 * Résultat du schéma de process du mémoire type de GSS (memoire_type.json, rubrique de compréhension, étape 5 « Votre
 * résultat » : « continuité de service, conformité au CCTP, traçabilité de chaque intervention »), en mots que le moteur de
 * schémas connaît : étape verte quand le texte du bloc 1 n'écrit aucune phrase de résultat.
 */
export const RESULTAT_MEMOIRE_TYPE = 'Continuité de service et traçabilité de chaque intervention';

/** Phrase du texte qui dit le résultat obtenu pour l'acheteur (étape verte « Votre résultat » du schéma du bloc 1) :
 *  une phrase entière de 86 caractères au plus, prise dans la conclusion (lignes libres, de la dernière à la première),
 *  sinon la réponse d'une attente (« → notre réponse : … ») ou l'engagement d'une attente écrite « « citation » : … » ;
 *  les phrases qui disent un résultat (sécurisé, continuité, conforme, tracé…) d'abord. '' s'il n'y en a aucune. */
export function resultatBesoin(texte: string, dejaEcrits: string[] = [], defaut = ''): string {
  const t = String(texte || '');
  const libres = t.split('\n').map((l) => l.trim()).filter((l) => l && !/^(?:#|\||[-*•]\s)/.test(l) && !INTERNE.test(l));
  const phrasesConclusion = libres.slice(1).reverse().flatMap((l) => l.replace(/\*\*/g, '').split(/(?<=[.!?])\s+/).reverse());
  const partieAttentes = t.split(/^(?=##\s)/m).find((p) => /^##\s+Vos attentes/i.test(p)) || '';
  // Réponse de GSS à une attente (après « → », « → notre réponse : » ou « — réponse : ») ; sans flèche, le texte après le
  // libellé n'est un engagement que si l'attente est la citation entre parenthèses (« **…** (« citation ») : engagement ») :
  // jamais l'attente citée elle-même (imm 341 : « Aucun poste ne doit être laissé vacant » donné comme résultat).
  const attentesCitees: string[] = [];
  const engagements = partieAttentes.split('\n').filter((l) => /^\s*[-*•]\s/.test(l) && !INTERNE.test(l)).map((l) => {
    for (const q of l.split('→')[0].matchAll(/«\s*([^»]{3,200}?)\s*»/g)) attentesCitees.push(normaliser(q[1]).replace(/[^a-z0-9]+/g, ' ').trim());
    const m = /→\s*(?:notre réponse\s*:\s*)?(.+)$/.exec(l) || /»[^—–\n]{0,80}?\s[—–]\s*(?:notre\s+)?réponse\s*:\s*(.+)$/i.exec(l)
      || /^\s*[-*•]\s+\*\*\s*«[^»]{3,160}»\s*\*\*[^:→\n]{0,160}?\s*:\s*([^→]+)$/.exec(l);
    if (m) return m[1];
    const c = /^\s*[-*•]\s+(?:\*\*[^*]+\*\*\s*)?\(\s*«[^»]*»\s*\)\s*:\s*(.+)$/.exec(l);
    return c ? c[1] : '';
  }).map((x) => sansRenvoiBloc(x.split(/\s*;\s*/)[0]));
  const vus = new Set(dejaEcrits.map((x) => normaliser(String(x || ''))));
  const citee = (x: string) => { const n = normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim(); return attentesCitees.some((a) => a.length >= 10 && (n.includes(a) || a.includes(n))); };
  const propres = (l: string[]) => l
    .map((x) => String(x || '').replace(/\*\*/g, '').replace(/[.;!?\s]+$/, '').trim())
    .filter((x) => x.length >= 15 && x.length <= 86 && x.split(/\s+/).length >= 4 && !/\bblocs?\s+\d/i.test(x) && !vus.has(normaliser(x)) && texteEtapeEntier(x) === x && !/[«»]/.test(x) && !citee(x))
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const dit = (x: string) => RESULTAT.test(x) || /tra[çc]abilit|\baucun\b|ne reste|non pourvu/i.test(x);
  // Jamais la redite d'une étape déjà écrite (80 % de ses mots pleins).
  const pleins = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
  const ecrits = dejaEcrits.map((x) => pleins(String(x || ''))).filter((l) => l.length);
  const neuf = (x: string) => { const p = pleins(x); return !ecrits.some((l) => { const n = l.filter((w) => p.includes(w)).length; return n / Math.min(l.length, p.length || 1) >= 0.8; }); };
  const c = propres(phrasesConclusion).filter(neuf), e = propres(engagements).filter(neuf);
  // Une phrase qui DIT un résultat (conclusion, puis engagements) ; à défaut le résultat du mémoire type (`defaut`),
  // jamais un moyen ni un fait du DCE présenté comme résultat (citedia 341 : « La télésurveillance couvre les onze parcs »).
  return c.find(dit) || e.find(dit) || defaut;
}

/**
 * Étapes du modèle dont le SEUL défaut est une dernière étape qui dit un moyen et non le résultat (génération réelle
 * cstb 221 : 5 étapes justes, la 5e « moyen ») : gardées (4 au plus) et complétées d'une étape verte « Votre résultat »
 * portant une phrase entière du texte (resultatBesoin). null si d'autres défauts existent ou si le texte ne dit aucun
 * résultat : la correction des étapes puis les schémas de secours prennent le relais.
 */
export function completerResultatBesoin(etapes: Array<{ titre?: string; texte?: string; role?: string }> | undefined, texte: string, defauts: string[]): Array<{ titre: string; texte: string; role: string }> | null {
  if (!Array.isArray(etapes) || etapes.length < 3 || !defauts.length) return null;
  // Défauts qui portent tous sur la dernière étape (caen 441 : « étape 5 : la phrase reprend le titre de l'étape » et
  // « étape 5 : la dernière étape doit dire le résultat ») : l'étape est remplacée par « Votre résultat » tiré du texte,
  // au lieu de refuser tout le schéma.
  const derniere = (d: string) => /la dernière étape doit dire le résultat/.test(d) || d.startsWith(`étape ${etapes.length} :`);
  if (!defauts.every(derniere)) return null;
  const autreQueResultat = defauts.some((d) => !/la dernière étape doit dire le résultat/.test(d));
  const gardees = etapes.slice(0, autreQueResultat ? Math.min(4, etapes.length - 1) : 4).map((e) => ({ titre: String(e?.titre || '').trim(), texte: String(e?.texte || '').trim(), role: String(e?.role || '').toLowerCase() === 'vert' ? 'bleu' : String(e?.role || '') }));
  if (gardees.some((e) => !e.titre || !e.texte)) return null;
  const resultat = resultatBesoin(texte, gardees.map((e) => e.texte), RESULTAT_MEMOIRE_TYPE);
  return resultat ? [...gardees, { titre: 'Votre résultat', texte: resultat, role: 'vert' }] : null;
}

/**
 * Anomalies d'un schéma de process du bloc 1 (consignes 3 et 6 : un schéma parlant en 5 secondes, « on pense à ça, puis à
 * ça, pour arriver à ça ») : étape sans texte, texte tronqué (fini sur un mot outil, ou sur un infinitif privé de son
 * complément : « … permettent de transmettre »), texte qui redit le titre, titres quasi identiques entre deux étapes, renvoi interne
 * « bloc n », repère interne. Liste vide : schéma acceptable.
 */
export function anomaliesSchemaBloc1(spec: { gabarit?: string; params?: any } | null | undefined): string[] {
  const etapes: Array<{ titre?: string; texte?: string }> = Array.isArray(spec?.params?.etapes) ? spec!.params.etapes : [];
  const out: string[] = [];
  const norm = (x: string) => normaliser(String(x || '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pleins = (x: string) => norm(x).split(' ').filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
  etapes.forEach((e, i) => {
    const n0 = `étape ${i + 1} « ${String(e?.titre || '').trim()} »`;
    const ti0 = String(e?.titre || '').trim(), tx0 = String(e?.texte || '').trim();
    // Marques Markdown imprimées telles quelles (caen 471 : « **La planification** ») ; guillemets ou parenthèses non
    // refermés ; titre qui est une phrase (« La mobilisation est préparée ») ; texte sans sujet (« Coordonnée par… ») ;
    // texte dont le verbe au pluriel s'accordait avec un sujet coupé par le titre (« Le contrôleur de rondes organisent… »).
    if (/\*\*|__|(?:^|\s)#{1,4}\s|`/.test(`${ti0} ${tx0}`)) out.push(`${n0} : marque de mise en forme imprimée (« ** », « __ », « # »)`);
    for (const x of [ti0, tx0]) if ((x.match(/«/g) || []).length !== (x.match(/»/g) || []).length || (x.match(/\(/g) || []).length !== (x.match(/\)/g) || []).length) out.push(`${n0} : guillemet ou parenthèse non refermé (« ${x} »)`);
    if (/\b(?:est|sont|sera|seront|a été|ont été)\s+[a-zà-ÿ]+(?:é|ée|és|ées|i|ie|is|ies|u|ue|us|ues)(?![a-zà-ÿ])/i.test(ti0)) out.push(`${n0} : le titre est une phrase, pas un titre nominal`);
    if (/^[A-ZÀ-Ý][a-zà-ÿ]+(?:ée?s?|ie?s?|ue?s?|ite?s?)\s+(?:par|avec|selon)\b/.test(tx0) && !/^(?:Une?|Les?|La|Chaque|Toute?s?)\b/.test(tx0)) out.push(`${n0} : texte sans sujet (« ${tx0.slice(0, 30)}… »)`);
    {
      const PLURIELS = /^(?:organisent|encadrent|structurent|soutiennent|permettent|assurent|suivent|garantissent|pilotent|couvrent|cadrent|traitent|r[ée]pondent|accompagnent|s[ée]curisent|compl[èe]tent|d[ée]finissent|fixent|distinguent|tracent|g[èe]rent)$/;
      const m = /^(?:Le|La|L['’]|Un|Une|Chaque|Notre|Votre)\s?([^,;:.]{0,70}?)\s([a-zà-ÿ]{3,}ent)\b/.exec(tx0);
      if (m && !/\s(?:et|ou)\s/.test(` ${m[1]} `) && PLURIELS.test(m[2])) out.push(`${n0} : accord du verbe (« ${m[2]} » après un sujet au singulier : sujet coupé)`);
    }
  });
  etapes.forEach((e, i) => {
    const n = `étape ${i + 1} « ${String(e?.titre || '').trim()} »`;
    const t = String(e?.texte || '').trim();
    // (phases du gabarit « chevrons » : titre seul, sauf la phase verte du résultat)
    if (!t) { if (spec?.gabarit !== 'chevrons' || i === etapes.length - 1) out.push(`${n} : étape vide (aucun texte)`); return; }
    const dernier = (t.replace(/[.;,:\s]+$/, '').split(/\s+/).pop() || '').toLowerCase().replace(/^(?:l|d)['’]/, '').replace(/['’]$/, '');
    if (MOTS_OUTILS.has(dernier)) out.push(`${n} : texte tronqué (« …${t.slice(-30)} »)`);
    // Verbe coupé de son complément (« … permettent de transmettre ») : infinitif final après « de », « à », « pour ».
    else if (/(?:^|\s)(?:de|d['’]|à|pour)\s*[a-zàâçéèêëîïôûù]{3,}(?<!i)(?:er|ir|tre|dre|oir)$/i.test(t.replace(/[.;,:\s]+$/, ''))) out.push(`${n} : texte coupé en plein groupe (« …${t.slice(-30)} »)`);
    const ti = norm(String(e?.titre || ''));
    if (ti.length >= 4 && i < etapes.length - 1 && norm(t).startsWith(ti)) out.push(`${n} : le texte redit le titre`);
    if (/\bblocs?\s+\d/i.test(t) || INTERNE.test(`${e?.titre || ''} ${t}`)) out.push(`${n} : renvoi ou repère interne dans le schéma`);
  });
  for (let i = 1; i < etapes.length; i++) {
    const a = pleins(String(etapes[i - 1]?.titre || '')), b = pleins(String(etapes[i]?.titre || ''));
    if (a.length && b.length && (a[0] === b[0] || a.filter((w) => b.includes(w)).length / Math.min(a.length, b.length) >= 0.67)) out.push(`étapes ${i} et ${i + 1} : titres quasi identiques (« ${etapes[i - 1].titre} », « ${etapes[i].titre} »)`);
    // Deux étapes qui disent la même chose (ifsem 335 : « Les rondes sont pointées. » puis « Les rondes sont pointées et
    // consignées… ») : le texte de l'une contenu dans l'autre, ou 80 % de mots pleins en commun.
    const ta = pleins(String(etapes[i - 1]?.texte || '')), tb = pleins(String(etapes[i]?.texte || ''));
    if (ta.length >= 2 && tb.length >= 2) {
      const na = norm(String(etapes[i - 1]?.texte || '')), nb = norm(String(etapes[i]?.texte || ''));
      const communs = ta.filter((w) => tb.includes(w)).length / Math.min(ta.length, tb.length);
      if (na.includes(nb) || nb.includes(na) || communs >= 0.8) out.push(`étapes ${i} et ${i + 1} : textes qui se répètent (« ${etapes[i - 1].texte} », « ${etapes[i].texte} »)`);
    }
  }
  etapes.forEach((e, i) => {
    // Texte qui redit son titre en ajoutant au plus deux mots pleins (ifsem 335 : « Rondes pointées — Les rondes sont pointées. »).
    const ti = pleins(String(e?.titre || '')), tx = pleins(String(e?.texte || ''));
    if (ti.length && tx.length && !/^votre r[ée]sultat$/i.test(String(e?.titre || '').trim()) && ti.every((w) => tx.includes(w)) && tx.filter((w) => !ti.includes(w)).length <= 2) {
      const n = `étape ${i + 1} « ${String(e?.titre || '').trim()} »`;
      if (!out.includes(`${n} : le texte redit le titre`)) out.push(`${n} : le texte redit le titre`);
    }
  });
  // Étape 1 qui ne donne que le lot ou le périmètre (ifsem 335 : « Lot 2, trois sites — Le présent périmètre porte sur le
  // lot 2. ») : le besoin n'est pas dit.
  if (etapes.length) {
    const PERIMETRE_SEUL = new Set(['present', 'perimetre', 'porte', 'portent', 'lot', 'lots', 'marche', 'concerne', 'objet', 'prestation', 'prestations', 'trois', 'deux', 'sites', 'site', 'est', 'sont']);
    const reste = pleins(`${etapes[0]?.titre || ''} ${etapes[0]?.texte || ''}`).filter((w) => !PERIMETRE_SEUL.has(w) && !/^\d+$/.test(w));
    if (/\blots?\s+\d|p[ée]rim[èe]tre/i.test(`${etapes[0]?.titre || ''} ${etapes[0]?.texte || ''}`) && reste.length < 2) out.push(`étape 1 « ${String(etapes[0]?.titre || '').trim()} » : ne cite que le lot ou le périmètre, pas le besoin`);
  }
  return out;
}

/** Verbes conjugués qui terminent le groupe nominal d'une exigence (titre d'étape, libellé d'un point de vigilance). */
const VERBE_TITRE = /^(?:est|sont|doit|doivent|devra|devront|peut|peuvent|a|ont|exigen?t?|exige|cessen?t?|cesse|restent|reste|varien?t?|varie|imposen?t?|impose|prévoi(?:t|ent)|porten?t?|porte|assuren?t?|assure|se|s['’]\S*|fai(?:t|s)|font|demanden?t?|demande|nécessiten?t?|nécessite|impliquen?t?|implique|sera|seront|intervien(?:t|nent)|requiert|requièrent|associen?t?|associe|comprend|comprennent|comporten?t?|comporte|accueillen?t?|accueille|comptent|compte|dispose|disposent|couvren?t?|couvre|regroupen?t?|regroupe|concernen?t?|concerne|inclut|incluent|ouvren?t?|ouvre|fermen?t?|ferme|fonctionnen?t?|fonctionne|reçoi(?:t|vent)|abriten?t?|abrite|représenten?t?|représente|dépend(?:ent)?|accèdent|accède|circulen?t?|circule|travaillen?t?|travaille|nécessitera|fixe|fixent|attend|attendent|souhaite|souhaitent|veut|veulent|mentionnen?t?|combinen?t?|indiquen?t?|constituen?t?|pourr(?:a|ont)|risquen?t?|possèdent|possède|encadren?t?|encadre|donnen?t?|donne|ont lieu|a lieu|permet|permettent|engendren?t?|entraînen?t?|obligen?t?)$/i;
/** Mots après lesquels un titre peut s'arrêter sans couper un groupe : prépositions, coordinations, participe présent. */
const COUPE_TITRE = /^(?:à|au|aux|dans|sur|pour|avec|par|en|sous|après|avant|entre|hors|selon|suivant|lors|dès|depuis|vers|chez|et|ou|de|du|des|d['’]\S*|pendant|durant|afin|sans|y|[a-zà-ÿ]{3,}ant)$/i;

/**
 * Titre court (34 caractères au plus) d'une exigence du DCE, pour une étape du schéma du bloc 1 ou le libellé d'un point
 * de vigilance : le groupe nominal qui précède le premier verbe, arrêté avant une préposition, une coordination ou un
 * participe (« les rondes d'ouverture à 05H30 et de fermeture… encadrent… » → « Les rondes d'ouverture » ; « remplacement
 * sur site dans les UNE (1) heure… » → « Remplacement sur site »), jamais au milieu d'un groupe (« chef d'équipe ou
 * agent »). '' si aucun titre propre n'est possible.
 */
export function titreExigence(x: string, max = 34): string {
  const e = String(x || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:]+$/g, '').trim();
  if (!e) return '';
  const mots0 = e.split(' ');
  const k = mots0.findIndex((m, i) => i > 0 && (VERBE_TITRE.test(m) || /^(?:ne|n['’]\S*)$/i.test(m)));
  const gn = (k > 0 ? mots0.slice(0, k) : mots0).join(' ').split(/\s*[,;:]\s+|\s+[—–]\s+/)[0].trim();
  const mots = gn.split(' ');
  const plein = (w: string) => { const v = w.toLowerCase().replace(/^(?:l|d)['’]/, ''); return v.length >= 3 && !MOTS_OUTILS.has(v); };
  for (let i = mots.length; i >= 2; i--) {
    const pre = mots.slice(0, i).join(' ');
    if (pre.length > max) continue;
    const dernier = mots[i - 1];
    if (MOTS_OUTILS.has(dernier.toLowerCase().replace(/['’]$/, '')) || /['’]$/.test(dernier) || !/[\p{L}\d)]$/u.test(dernier)) continue;
    // Coupe permise devant une préposition, une coordination ou un participe, ou quand le reste n'est qu'une suite
    // d'adjectifs (« interventions successives | habituelles ») ; jamais devant un complément (« … ou agent | N1 au PCS »).
    const reste = mots.slice(i);
    if (reste.length && !COUPE_TITRE.test(reste[0]) && reste.some((w) => COUPE_TITRE.test(w) || !/^[a-zà-ÿ-]+$/.test(w))) continue;
    if (mots.slice(0, i).filter(plein).length < 2) continue;
    if ((pre.match(/«/g) || []).length !== (pre.match(/»/g) || []).length || (pre.match(/\(/g) || []).length !== (pre.match(/\)/g) || []).length) continue;
    return pre.charAt(0).toUpperCase() + pre.slice(1);
  }
  return '';
}

/** Titre de rubrique cité dans une réponse : « A : B » → A (ou B quand A n'est que le socle commun : « Notre socle de
 *  procédures : l'intervention sur alarme… » → « L'intervention sur alarme… »). */
function rubriqueCitee(x: string): string {
  const t = String(x || '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?)\s+:\s+(.+)$/.exec(t);
  if (!m) return t;
  // Préfixe de catégorie (« Formations et certifications », « Les moyens techniques », « Contrôle 2 »…) : la suite nomme
  // le process, sans sa parenthèse (« l'agent SSIAP 1 (le feu, …) » → « L'agent SSIAP 1 »).
  if (/^(?:notre socle(?: de proc[ée]dures)?|nos proc[ée]dures|le socle commun|formations et certifications|les moyens techniques|nos valeurs manag[ée]riales|notre engagement [ée]cologique|contr[ôo]le \d)$/i.test(m[1].trim())) {
    const b = m[2].replace(/\s*\([^()]*\)\s*$/, '').trim();
    return b.charAt(0).toUpperCase() + b.slice(1);
  }
  return m[1].trim();
}

/**
 * Réponse de GSS d'une puce du bloc 1, prête pour une carte du schéma : sans « ** », titres de rubrique sans leurs
 * guillemets ni leur sous-titre, article d'un titre en minuscule au milieu de la phrase (« par la planification et le
 * contrôleur de rondes »). Le moteur de schémas compare les mots, pas la casse.
 */
export function reponsePourSchema(y: string): string {
  let t = String(y || '').replace(/\*\*\s*«\s*([^»*]+?)\s*»\s*\*\*/g, '« $1 »').replace(/\*\*([^*]+)\*\*/g, (_m, x: string) => (/^[A-ZÀ-Ý]/.test(x.trim()) ? rubriqueCitee(x) : x)).replace(/\*\*/g, '');
  // Titre entre guillemets employé comme groupe nominal (en tête, après « par », « et », « sur »…) : sans guillemets ;
  // après un nom (« la procédure « Le remplacement… » ») : guillemets gardés, sans le sous-titre.
  t = t.replace(/«\s*([A-ZÀ-Ý][^»]{2,160}?)\s*»/g, (m, x: string, pos: number, tout: string) => {
    const avant = tout.slice(0, pos);
    return /(?:^|[,;:]\s*|\b(?:par|et|ou|sur|avec|via|à|de|selon)\s+)$/i.test(avant) ? rubriqueCitee(x) : `« ${rubriqueCitee(x)} »`;
  });
  t = t.replace(/([\p{Ll}\d)»,]\s+)(Le|La|Les|Un|Une|Notre|Nos|Votre|Vos)(?=\s)/gu, (_m, a: string, b: string) => `${a}${b.toLowerCase()}`)
    .replace(/([\p{Ll}\d)»,]\s+)L(['’])/gu, '$1l$2');
  return t.replace(/\s+/g, ' ').trim();
}

/** Renvoi en incise (« **La gestion des moyens d'accès**, développée au bloc 4, encadre… ») retiré, la phrase reste. */
export function sansIncisesRenvoi(y: string): string {
  return String(y || '').replace(/,\s*(?:d[ée]velopp|d[ée]taill|d[ée]crit|trait|pr[ée]sent|expos)[a-zéè]*\s+(?:au|aux|dans les?)\s+blocs?\s+\d+(?:\s*(?:,|et)\s*(?:au\s+bloc\s+)?\d+)*\s*,\s*/gi, ' ');
}

/** Texte d'étape coupé avant la coordination de deux groupes nominaux quand la phrase entière dépasse la carte (« La
 *  mobilisation est préparée et coordonnée par la planification | et la mise en place d'une prestation ») : la partie
 *  gardée est une phrase (verbe conjugué) entière. '' sinon. */
export function texteEtapeCoordination(y: string, max = 86): string {
  const t = String(y || '').replace(/\s+/g, ' ').replace(/[.;,:\s]+$/, '').trim();
  const entier = texteEtapeEntier(t, max);
  if (entier) return entier;
  let meilleur = '';
  for (const m of t.matchAll(/\s+(?:et|ainsi que)\s+(?=(?:le|la|les|l['’]|un|une|des|du|son|sa|ses|leur|leurs|notre|nos)\b)/gi)) {
    const pre = t.slice(0, m.index).trim();
    if (pre.length > max || pre.length < 25) continue;
    const dernier = (pre.split(' ').pop() || '').toLowerCase().replace(/['’]$/, '');
    const verbe = VERBE_CONJUGUE.test(pre) || /(?:^|\s)(?:distingue|distinguent|structure|structurent|encadre|encadrent|soutient|soutiennent|pilote|pilotent|cadre|cadrent|traite|traitent|répond|répondent|accompagne|accompagnent|gère|gèrent|identifie|identifient|repose|reposent|s['’]appuie|s['’]appuient|coordonne|coordonnent)(?=\s|$)/i.test(pre);
    if (MOTS_OUTILS.has(dernier) || !verbe || !texteEtapeEntier(pre, max)) continue;
    if (pre.length > meilleur.length) meilleur = pre;
  }
  return meilleur;
}

/**
 * Puces « Vos attentes » et « Points de vigilance » du bloc 1 telles que l'acheteur les lit (T4N-8, T4C-1) :
 * - libellé générique « **Point de vigilance** : » ou « **Ce que vous attendez** : » répété à chaque puce : remplacé par le
 *   nom du point, en gras (« **L'arrivée sur site** est exigée dans un délai maximal de 30 minutes… »), sinon retiré ;
 * - titres de rubrique cités en gras au milieu de la phrase (« coordonnée par **La planification** et **La mise en place
 *   d'une prestation** ») : entre guillemets (« coordonnée par « La planification » et « La mise en place d'une
 *   prestation » »). Le gras de tête de la puce (citation du DCE, nom du point) reste.
 */
export function libellesBloc1(texte: string): string {
  let partie = '';
  return String(texte || '').split('\n').map((l) => {
    if (/^##\s/.test(l)) { partie = l; return l; }
    if (!/^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie) || !/^\s*[-*•]\s/.test(l)) return l;
    const puce = (/^\s*[-*•]\s+/.exec(l) || [''])[0];
    let corps = l.slice(puce.length);
    const gen = /^\*\*\s*(?:Points? de vigilance|Ce que vous attendez|Vos attentes|Attente)\s*\*\*\s*(?:\([^)]*\))?\s*:\s*(.+)$/i.exec(corps);
    if (gen) {
      const iFleche = gen[1].search(/\s*→/);
      const exigence = (iFleche >= 0 ? gen[1].slice(0, iFleche) : gen[1]).trim();
      const suite = iFleche >= 0 ? gen[1].slice(iFleche) : '';
      const nom = titreExigence(exigence);
      const debut = normaliser(exigence.slice(0, nom.length));
      corps = nom && debut === normaliser(nom)
        ? `**${nom}**${exigence.slice(nom.length)}${suite}`
        : `${exigence.charAt(0).toUpperCase()}${exigence.slice(1)}${suite}`;
    }
    // Gras de tête gardé ; ensuite, un titre en gras devient un titre entre guillemets.
    const tete = (/^\*\*[^*]+\*\*/.exec(corps) || [''])[0];
    const reste = corps.slice(tete.length)
      .replace(/\*\*\s*«\s*([^»*]+?)\s*»\s*\*\*/g, '« $1 »')
      .replace(/\*\*([^*]+)\*\*/g, (m, x: string) => (/^[A-ZÀ-Ý]/.test(x.trim()) ? `« ${x.trim()} »` : x));
    return `${puce}${tete}${reste}`;
  }).join('\n');
}

export function etapesDesPuces(texte: string): Array<{ titre: string; texte?: string; role?: string }> {
  const puces = (titre: RegExp) => {
    // Toutes les parties de ce titre (texte rédigé puis puces ajoutées pour le minimum, format court hors ligne imm).
    const partie = String(texte || '').split(/^(?=##\s)/m).filter((p) => titre.test(p)).join('\n');
    return partie.split('\n').map((l) => {
      // Libellé nommé en gras suivi de l'exigence, sans deux-points (« **L'arrivée sur site** est exigée … → « … » … »,
      // forme écrite par libellesBloc1) : le libellé et sa suite sont l'exigence.
      const nv = /^\s*[-*•]\s+\*\*([^*«»]+)\*\*(?!\s*[:(])([^→\n]*?)\s*→\s*(?:notre réponse\s*:\s*)?(.+)$/i.exec(l);
      if (nv && !/^(?:points? de vigilance|ce que vous attendez|vos attentes|notre réponse)$/i.test(nv[1].trim())) return { brut: nv[0], x: `${nv[1].trim()}${nv[2]}`, y: nv[3], citation: false };
      const m = /^\s*[-*•]\s+\*\*[^*]+\*\*(?:\s*\([^)]*\))?\s*:\s*(.+?)\s*→\s*notre réponse\s*:\s*(.+)$/.exec(l);
      if (m) return { brut: m[0], x: m[1], y: m[2], citation: false };
      // Attente en gras citée du DCE (« **« Aucun poste ne doit être laissé vacant »** : → notre réponse : … », imm 341), ou
      // réponse après la seule flèche (« **« continuité de service »** : organiser … → processus de remplacement… »,
      // citedia 341) : la citation (sinon le texte avant la flèche, sinon le libellé en gras) est l'exigence.
      const g = /^\s*[-*•]\s+\*\*([^*]+)\*\*([^:→\n]{0,160}?)\s*:\s*(.*?)\s*→\s*(?:notre réponse\s*:\s*)?(.+)$/i.exec(l);
      if (g) {
        const gras = g[1].trim();
        const q = /^«\s*([^»]{3,160}?)\s*»$/.exec(gras);
        if (q) return { brut: g[0], x: q[1], y: g[4], citation: true };
        const x = g[3].trim() || (/^(?:points? de vigilance|ce que vous attendez|vos attentes|notre réponse)$/i.test(gras) ? '' : gras);
        return x ? { brut: g[0], x, y: g[4], citation: false } : null;
      }
      // Attente citée en gras sans flèche (ifsem 335 : « **« délai maximal de deux heures »** : notre procédure de
      // remplacement… ») : ce qui suit les deux-points est la réponse de GSS.
      const sf = /^\s*[-*•]\s+\*\*\s*«\s*([^»]{3,160}?)\s*»\s*\*\*([^:→\n]{0,160}?)\s*:\s*([^→]+)$/.exec(l);
      if (sf) return { brut: sf[0], x: sf[1], y: sf[3], citation: true };
      // Attente écrite en citation du DCE (cadre imposé, ca_normandie 241 : « « main courante tenue en temps réel » —
      // réponse : main courante électronique… ») : la citation est l'exigence, la suite la réponse de GSS.
      const c = /^\s*[-*•]\s+(?:\*\*[^*]+\*\*\s*:\s*)?«\s*([^»]{3,160}?)\s*»[^—–\n]{0,80}?\s[—–]\s*(?:notre\s+)?réponse\s*:\s*(.+)$/i.exec(l);
      if (c) return { brut: c[0], x: c[1], y: c[2], citation: true };
      // Exigence sans gras ni libellé (« - L'arrivée sur site est exigée … → … »).
      const sg = /^\s*[-*•]\s+([^*→\n]{8,}?)\s*→\s*(?:notre réponse\s*:\s*)?(.+)$/i.exec(l);
      return sg ? { brut: sg[0], x: sg[1], y: sg[2], citation: false } : null;
    })
      // Jamais de repère interne dans un schéma (« [À COMPLÉTER] », ⟦AC:n⟧, « [CONSULTATION REQUISE : …] »).
      .filter((m): m is { brut: string; x: string; y: string; citation: boolean } => !!m && m.x.trim().length > 3 && !INTERNE.test(m.brut))
      // Réponse sans renvoi interne (« processus détaillés au bloc 4, « … » », « suit les processus du bloc 5 ») : '' si
      // le renvoi était toute la réponse.
      // Réponse sans « ** » ni guillemets autour des titres de rubrique (caen 471 : « **La planification** » imprimé tel
      // quel ; imm 473 : guillemet ouvrant perdu, « Le livre … (LMC) » structure… »).
      .map((m) => ({ x: m.x.replace(/\*\*/g, '').trim(), y: reponsePourSchema(sansRenvoiBloc(sansIncisesRenvoi(m.y).split(/\s*;\s*/)[0]).replace(/\s+(?:est|sont|sera|seront)$/i, '').trim()), citation: m.citation }))
      .filter((c) => c.y);
  };
  const vigilance = puces(/^##\s+Les points de vigilance/i);
  const attentes = puces(/^##\s+Vos attentes/i);
  // Titre nominal : le groupe nominal qui précède le premier verbe (« La continuité doit toujours s'opérer… » → « La
  // continuité » ; « Les rondes techniques cessent… » → « Les rondes techniques »), coupé sur un mot plein.
  const VERBE = /^(?:est|sont|doit|doivent|peut|peuvent|a|ont|exigen?t?|exige|cessen?t?|cesse|restent|reste|varien?t?|varie|imposen?t?|impose|prévoi(?:t|ent)|porten?t?|porte|assuren?t?|assure|se|s['’]\S*|fai(?:t|s)|font|demanden?t?|demande|nécessiten?t?|nécessite|impliquen?t?|implique|sera|seront|intervien(?:t|nent)|requiert|requièrent|associen?t?|associe|comprend|comprennent|comporten?t?|comporte|accueillen?t?|accueille|comptent|compte|dispose|disposent|couvren?t?|couvre|regroupen?t?|regroupe|concernen?t?|concerne|inclut|incluent|ouvren?t?|ouvre|fermen?t?|ferme|fonctionnen?t?|fonctionne|reçoi(?:t|vent)|abriten?t?|abrite|représenten?t?|représente|dépend(?:ent)?|accèdent|accède|circulen?t?|circule|travaillen?t?|travaille|nécessitera|fixe|fixent|prévoit|attend|attendent|souhaite|souhaitent|veut|veulent|mentionnen?t?|combinen?t?|indiquen?t?|constituen?t?|peuven?t|pourr(?:a|ont)|risquen?t?)$/i;
  /** Titre nominal (groupe nominal avant le premier verbe), '' s'il n'y en a pas de propre : jamais une phrase tronquée
   *  (« Le site associe un bâtiment ») ni un mot seul (« Le service »). */
  const nominal = (x: string): string => {
    const mots = x.replace(/\*\*/g, '').split(/\s+/);
    const k = mots.findIndex((m, i) => i > 0 && (VERBE.test(m) || /^(?:ne|n['’]\S*)$/i.test(m)));
    if (k <= 0) return '';
    // Groupe nominal sans mot outil pendant (« prestations ponctuelles à la demande » : « demande » pris pour un verbe).
    let fin = k;
    while (fin > 1 && MOTS_OUTILS.has(mots[fin - 1].toLowerCase().replace(/^(?:l|d)['’]$/, (x) => x.charAt(0)).replace(/['’,;:]$/, ''))) fin--;
    const gn = mots.slice(0, fin).join(' ').replace(/[,;:]+$/, '');
    const pleins = mots.slice(0, fin).map((m) => m.toLowerCase().replace(/^(?:l|d)['’]/, '').replace(/['’,;:]$/, '')).filter((m) => m && !MOTS_OUTILS.has(m));
    if (gn.length > 34 || pleins.length < 2 || /[,;«»"]/.test(gn)) return '';
    return gn;
  };
  /** Sinon, tête de la réponse de GSS (groupe nominal : « planification des relèves »), jusqu'à la première virgule ou
   *  coordination ; le texte de l'étape est alors la suite de la réponse (jamais la même phrase sous le titre). */
  const teteReponse = (y: string): { titre: string; reste: string } => {
    const m = /^(.+?)(,\s*|\s+et\s+)(.*)$/.exec(y);
    const t = (m ? m[1] : y).trim();
    if (!m || t.length > 34 || t.split(/\s+/).length < 2) return { titre: '', reste: '' };
    const sep = m[2].trim();
    // Suite : un groupe autonome (« … et la mise en place des prestations », « … et adaptation du dispositif »), jamais
    // un complément orphelin (« …, du PTI et des obligations », « … et d'intégration des nouveaux agents ») ni un sujet
    // dont le verbe s'accordait avec les deux (« le livre des consignes et l'intégration des intervenants permettent… »).
    if (/^(?:de|du|des|d['’]|à|au|aux|en|selon|par|pour|avec|dans)\b/i.test(m[3]) || m[3].split(/\s+/).some((w, i) => i > 0 && VERBE.test(w)) || /\bpermett?e?n?t\b/i.test(m[3])) return { titre: '', reste: '' };
    // Titre qui contient un verbe (« la mobilisation est préparée ») ; suite sans sujet (« coordonnée par… ») ; suite dont
    // le verbe au pluriel s'accordait avec les deux groupes (« la planification et le contrôleur de rondes organisent… ») :
    // jamais un couple titre / texte (caen 471).
    if (t.split(/\s+/).some((w, i) => i > 0 && (VERBE.test(w) || VERBE_TITRE.test(w))) || /^[a-zà-ÿ]+(?:ée?s?|ie?s?|ue?s?)\s+(?:par|avec|selon)\b/i.test(m[3])
      || (/^et$/i.test(sep) && /^\S+(?:\s+\S+){0,6}?\s+[a-zà-ÿ]{3,}ent\b/i.test(m[3]) && /\b(?:organisent|encadrent|structurent|soutiennent|assurent|suivent|garantissent|pilotent|couvrent|cadrent|traitent|r[ée]pondent|accompagnent|distinguent|g[èe]rent)\b/i.test(m[3]))) return { titre: '', reste: '' };
    return { titre: t, reste: m[3].trim() };
  };
  const pleinsDe = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
  const procheDe = (a: string, b: string) => {
    const x = pleinsDe(a), y = pleinsDe(b);
    return !!x.length && !!y.length && (x[0] === y[0] || x.filter((w) => y.includes(w)).length / Math.min(x.length, y.length) >= 0.67);
  };
  // Trois étapes distinctes : titre nominal, texte entier (fin de phrase ou de proposition) qui ne redit pas le titre,
  // titres jamais quasi identiques (le moteur refuse un élément en double ; le lecteur ne voit pas deux fois la même idée).
  const etapes: Array<{ titre: string; texte?: string; role?: string }> = [];
  const ordre = [...vigilance.slice(0, 2), ...attentes, ...vigilance.slice(2)];
  // Exigence citée du DCE, courte et nominale (« Main courante tenue en temps réel », « Délai maximum de 20 minutes ») :
  // elle sert de titre telle quelle.
  const citationTitre = (c: { x: string; citation: boolean }): string => {
    if (!c.citation) return '';
    const x = c.x.replace(/\s+/g, ' ').trim();
    const pleins = pleinsDe(x);
    return x.length <= 40 && pleins.length >= 2 && !/[,;:«»"]/.test(x) && !x.split(/\s+/).some((w, i) => i > 0 && VERBE.test(w)) ? x : '';
  };
  const titreDe = (c: { x: string; citation: boolean }) => citationTitre(c) || nominal(c.x) || titreExigence(c.x);
  for (const c of [...ordre.filter((x) => titreDe(x)), ...ordre.filter((x) => !titreDe(x))]) {
    if (etapes.length >= 3) break;
    let titre = titreDe(c);
    let y = c.y;
    let corps = titre ? texteEtapeCoordination(y.charAt(0).toUpperCase() + y.slice(1)) : '';
    // Sans titre tiré de l'exigence, ou réponse trop longue pour la carte : tête de la réponse comme titre, sa suite
    // comme texte (ca_normandie 241 : « Intégration du marché » / « Mise en place de la prestation… »).
    if (!corps) {
      const tr = teteReponse(c.y);
      if (!tr.titre || tr.reste.split(/\s+/).length < 3) continue;
      titre = tr.titre;
      y = tr.reste;
      corps = texteEtapeCoordination(y.charAt(0).toUpperCase() + y.slice(1));
    }
    if (!corps) continue;
    // Texte qui commence par le titre : la suite seulement, si elle dit encore quelque chose (3 mots au moins).
    const nt = normaliser(titre).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const nc = normaliser(corps).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (nc.startsWith(nt)) {
      const reste = corps.slice(titre.length).replace(/^[\s,;:]+(?:et\s+)?/, '').trim();
      // Suite qui n'est qu'un complément du titre (« … du PTI et des obligations ») : l'étape n'apporte rien de lisible.
      if (reste.split(/\s+/).length < 3 || /^(?:de|du|des|d['’]|à|au|aux|en|selon|par|pour|avec|dans)\b/i.test(reste)) continue;
      corps = reste.charAt(0).toUpperCase() + reste.slice(1);
    }
    if (etapes.some((d) => procheDe(d.titre, titre) || normaliser(String(d.texte || '')) === normaliser(corps))) continue;
    // Texte qui redit le titre (« Reprise du personnel en place » / « La reprise du personnel en place ») : l'étape
    // n'apporte rien, elle serait refusée par le contrôle du schéma.
    { const ti = pleinsDe(titre), tx = pleinsDe(corps); if (ti.length && ti.every((w) => tx.includes(w)) && tx.filter((w) => !ti.includes(w)).length <= 2) continue; }
    etapes.push({ titre: titre.charAt(0).toUpperCase() + titre.slice(1), texte: corps, role: etapes.length < 2 ? 'rouge' : 'bleu' });
  }
  return etapes;
}

/** Étapes tirées des attentes et des points de vigilance du texte du bloc 1 (secours des schémas), sans le résultat. */
export function specSecoursPuces(texte: string): { gabarit: string; params: any } | null {
  const etapes = etapesDesPuces(texte);
  // « On pense à ça, puis à ça, pour arriver à ça » : deux étapes au moins avant le résultat.
  if (etapes.length < 2) return null;
  // Résultat : une phrase entière du texte qui dit le résultat (jamais une étape verte vide) ; sinon secours suivant.
  const resultat = resultatBesoin(texte, etapes.map((e) => String(e.texte || '')), RESULTAT_MEMOIRE_TYPE);
  if (!resultat) return null;
  etapes.push({ titre: 'Votre résultat', texte: resultat, role: 'vert' });
  const spec = specProcessBesoin(etapes, 'flux');
  return spec && !anomaliesSchemaBloc1(spec).length ? spec : null;
}

/**
 * Dernier schéma de secours du bloc « compréhension » (consignes 3 et 6 : un schéma parlant, jamais « Votre contexte →
 * Le périmètre → Vos attentes → Votre résultat », imm 341 et citedia 341) : construit sur le CONTENU du texte. Les postes
 * du tableau « Le périmètre de la prestation demandée » (poste et horaires du DCE), puis les attentes et les points de
 * vigilance (exigence → réponse de GSS), enfin la phrase de résultat du texte (resultatBesoin, jamais une attente citée).
 * Chaque étape porte une phrase de sa partie. null si moins de deux étapes de contenu ou aucun résultat : le défaut est
 * alors signalé à GSS.
 */
export function specSecoursBesoin(texte: string): { gabarit: string; params: any } | null {
  const t = String(texte || '');
  const partie = (titre: RegExp) => t.split(/^(?=##\s)/m).find((p) => titre.test(p)) || '';
  const pleinsDe = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
  const proches = (a: string, b: string) => { const x = pleinsDe(a), y = pleinsDe(b); return !!x.length && !!y.length && (x[0] === y[0] || x.filter((w) => y.includes(w)).length / Math.min(x.length, y.length) >= 0.67); };
  const etapes: Array<{ titre: string; texte: string; role?: string }> = [];
  // 1. Postes du périmètre : « <poste> » et « <jours et horaires> » du tableau (données du DCE).
  const lignes = partie(/^##\s+Le périmètre/i).split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).slice(1);
  for (const l of lignes) {
    if (etapes.length >= 2) break;
    const c = l.split('|').map((x) => x.trim()).filter((_, k, a) => k > 0 && k < a.length - 1);
    // Poste : intitulé entier, ou sa partie après « : » (« 1er poste : chef d'équipe ou agent N1 au PCS »), ou un titre
    // arrêté avant un complément ; jamais coupé au milieu d'un groupe (imm 473 : « 1er poste : chef d'équipe ou agent »).
    const brutPoste = String(c[1] || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    const apresDeuxPoints = (/^[^:]{1,30}\s:\s(.+)$/.exec(brutPoste) || [])[1] || '';
    const poste = brutPoste.length <= 34 ? brutPoste : apresDeuxPoints && apresDeuxPoints.length <= 34 ? apresDeuxPoints : titreExigence(apresDeuxPoints || brutPoste);
    const horaires = texteEtapeEntier(String(c[2] || '').replace(/\*\*/g, ''));
    if (!poste || pleinsDe(poste).length < 1 || !horaires || horaires.split(/\s+/).length < 3 || INTERNE.test(l)) continue;
    if (etapes.some((e) => proches(e.titre, poste) || normaliser(e.texte) === normaliser(horaires))) continue;
    etapes.push({ titre: poste.charAt(0).toUpperCase() + poste.slice(1), texte: horaires.charAt(0).toUpperCase() + horaires.slice(1), role: 'rouge' });
  }
  // 2. Attentes et points de vigilance : exigence → réponse de GSS.
  for (const e of etapesDesPuces(t)) {
    if (etapes.length >= 4) break;
    if (!e.texte || etapes.some((d) => proches(d.titre, e.titre) || normaliser(d.texte) === normaliser(String(e.texte)))) continue;
    etapes.push({ titre: e.titre, texte: String(e.texte), role: etapes.length < 2 ? 'rouge' : 'bleu' });
  }
  if (etapes.length < 2) return null;
  const resultat = resultatBesoin(t, etapes.map((e) => e.texte), RESULTAT_MEMOIRE_TYPE);
  if (!resultat) return null;
  const spec = specProcessBesoin([...etapes.slice(0, 4), { titre: 'Votre résultat', texte: resultat, role: 'vert' }], 'flux');
  return spec && !anomaliesSchemaBloc1(spec).length ? spec : null;
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

/**
 * Bloc 1 rédigé par le modèle, nettoyé sans modèle (fontainebleau 21) :
 * - une phrase qui redit une phrase précédente du bloc (le chapeau redit dans « Votre contexte et votre site » : mêmes
 *   chiffres et la moitié de ses mots au moins, ou 80 % de ressemblance) est retirée ;
 * - durée du marché absente des données du DCE : la phrase « La durée du marché est [À COMPLÉTER] » et sa question sont
 *   retirées (donnée de l'acheteur, jamais une question à GSS) ;
 * - un renvoi « au bloc n, « Rubrique » » prend le numéro du bloc qui contient réellement la rubrique citée (« La
 *   planification » est au bloc 4, pas au bloc 5) ; des rubriques de blocs différents sont renvoyées chacune à son bloc.
 */
/** Verbes conjugués courants (une bribe sans aucun verbe conjugué n'est pas une phrase). */
const VERBE_CONJUGUE = /(?:^|[^\p{L}])(?:est|sont|était|étaient|sera|seront|serait|a|ont|avait|aura|auront|peut|peuvent|pourra|pourront|doit|doivent|devra|devront|fait|font|reste|restent|bénéficie|bénéficient|assure|assurent|garantit|garantissent|permet|permettent|reçoit|reçoivent|dispose|disposent|intervient|interviennent|prend|prennent|met|mettent|suit|suivent|veille|veillons|veillent|organise|organisons|organisent|contrôle|contrôlons|contrôlent|transmet|transmettent|transmettons|assurons|mettons|disposons|garantissons|proposons|propose|proposent|prévoit|prévoient|prévoyons|comprend|comprennent|couvre|couvrent|exige|exigent|demande|demandent|impose|imposent|sommes|avons|sera|vont|va)(?![\p{L}])/iu;

/**
 * Bribes collées après le renvoi « (bloc n). » ou « développée(s) au bloc n. » d'une puce du bloc 1 (ifsem 335 : « …
 * pilotage des contrôles (bloc 5). Traçabilité des rondes. », « … (bloc 4). SSIAP 1 et ADS. », « … développées au bloc 5.
 * Le CNRS bénéficie d'un service continu, tracé et contrôlé. ») : phrases sans verbe conjugué, ou qui recopient un titre
 * ou un texte d'étape du schéma (`etapes`), retirées. Une phrase avec un repère « [À COMPLÉTER] » reste.
 */
export function sansBribesApresRenvoi(texte: string, etapes: Array<{ titre?: string; texte?: string }> = []): { texte: string; retirees: string[] } {
  const retirees: string[] = [];
  const pleins = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
  const morceaux = (Array.isArray(etapes) ? etapes : []).flatMap((e) => [String(e?.titre || ''), String(e?.texte || '')]).map(pleins).filter((l) => l.length);
  const copie = (ph: string) => { const p = pleins(ph); return p.length > 0 && morceaux.some((m) => m.filter((w) => p.includes(w)).length / Math.max(p.length, 1) >= 0.8 && p.filter((w) => m.includes(w)).length >= Math.min(p.length, 2)); };
  const RENVOI = /(?:\(\s*blocs?\s+\d+(?:\s*(?:,|et)\s*\d+)*\s*\)|(?:d[ée]velopp|d[ée]taill|d[ée]crit|trait|pr[ée]sent)[ée]*e?s?\s+(?:au|aux|dans les?)\s+blocs?\s+\d+(?:\s*(?:,|et)\s*\d+)*)\s*\./giu;
  const sortie = String(texte || '').split('\n').map((ligne) => {
    if (!/^\s*[-*•]\s/.test(ligne)) return ligne;
    let fin = -1;
    for (const m of ligne.matchAll(RENVOI)) fin = (m.index || 0) + m[0].length;
    if (fin < 0 || fin >= ligne.trimEnd().length) return ligne;
    const suite = ligne.slice(fin).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    const gardees: string[] = [];
    for (const ph of suite) {
      const bribe = !INTERNE.test(ph) && !/\bblocs?\s+\d/i.test(ph) && (!VERBE_CONJUGUE.test(ph) || copie(ph));
      if (bribe) retirees.push(ph); else gardees.push(ph);
    }
    return `${ligne.slice(0, fin).trimEnd()}${gardees.length ? ` ${gardees.join(' ')}` : ''}`;
  }).join('\n');
  return { texte: sortie, retirees };
}

export function nettoyerBloc1(texte: string, plan: PlanMemoireType | undefined, duree: string, etapes: Array<{ titre?: string; texte?: string }> = []): { texte: string; retirees: string[]; renvois: number } {
  const retirees: string[] = [];
  let t = String(texte || '');
  // 0. Mention « (process GSS) » recopiée de la consigne (ifsem 361 : « … mise en place de la prestation (process GSS),
  //    développée au bloc 5 ») : retirée ; le moteur de schémas refusait aussi le mot « process » dans le schéma de secours.
  t = t.replace(/\s*\((?:un |le )?process(?:us)? GSS(?: existant)?\)/gi, '');
  // 0 bis. Bribes collées après le renvoi d'une puce pour que les mots du schéma figurent dans le texte (ifsem 335).
  {
    const b = sansBribesApresRenvoi(t, etapes);
    t = b.texte;
    retirees.push(...b.retirees);
  }
  // 1. Durée inconnue du DCE.
  if (!String(duree || '').trim()) {
    t = t.split('\n').filter((l) => !(/\[CONSULTATION REQUISE\s*:[^\]]*dur[ée]e/i.test(l) && !l.replace(/\[CONSULTATION REQUISE\s*:[^\]]*\]/gi, '').trim())).join('\n');
    t = t.split('\n').map((l) => l.split(/(?<=[.!?])\s+/).filter((ph) => {
      const ko = /dur[ée]e[^.]{0,60}\[À COMPLÉTER\]/i.test(ph);
      if (ko) retirees.push(ph.trim());
      return !ko;
    }).join(' ')).join('\n');
  }
  // 2. Redites (hors tableaux, sous-titres et puces).
  const vues: Array<{ mots: string[]; faits: string[] }> = [];
  t = t.split('\n').map((l) => {
    if (/^\s*(?:\||#|[-*•]\s|\d+[.)]\s)/.test(l) || !l.trim()) return l;
    return l.split(/(?<=[.!?])\s+/).filter((ph) => {
      const mots = motsDePhrase(ph);
      const faits = faitsDePhrase(ph).filter((f) => f.startsWith('N:'));
      if (mots.length < 5) return true;
      const redite = vues.some((v) => {
        if (similarite(v.mots, mots) >= 0.8) return true;
        if (!faits.length || !faits.every((f) => v.faits.includes(f))) return false;
        const jeu = new Set(v.mots);
        return mots.filter((w) => jeu.has(w)).length / mots.length >= 0.5;
      });
      if (redite) { retirees.push(ph.trim()); return false; }
      vues.push({ mots, faits });
      return true;
    }).join(' ');
  }).join('\n').replace(/\n{3,}/g, '\n\n');
  // 3. Numéros de bloc des renvois.
  let renvois = 0;
  if (plan) {
    const blocDe = new Map<string, number>();
    for (const r of plan.rubriques) {
      const b = plan.blocs.find((x) => x.id === r.bloc || x.rubriques.includes(r.id));
      if (b) blocDe.set(normaliser(r.titre).replace(/[^a-z0-9]+/g, ' ').trim(), b.numero);
    }
    const numero = (titre: string): number | undefined => {
      const k = normaliser(titre).replace(/[^a-z0-9]+/g, ' ').trim();
      if (blocDe.has(k)) return blocDe.get(k);
      // Titre cité en partie (« Le remplacement d'un agent absent » pour « … : absence non prévue ») : préfixe unique.
      const cands = [...blocDe.entries()].filter(([x]) => x.startsWith(k) || k.startsWith(x));
      return cands.length && new Set(cands.map((c) => c[1])).size === 1 ? cands[0][1] : undefined;
    };
    t = t.replace(/\b(au|du|dans le) bloc (\d)\s*(,|:)?\s*((?:«[^»]{2,120}»(?:\s*(?:,|et)\s*(?=«))?)+)/g, (m, prep: string, n: string, sep: string | undefined, cites: string) => {
      const titres = [...cites.matchAll(/«\s*([^»]+?)\s*»/g)].map((x) => x[1]);
      const nums = titres.map(numero);
      if (!titres.length || nums.some((x) => x === undefined)) return m;
      const distincts = [...new Set(nums as number[])];
      if (distincts.length === 1 && distincts[0] === Number(n)) return m;
      renvois++;
      const liste = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).map((x) => `« ${x} »`).join(', ')} et « ${l[l.length - 1]} »` : `« ${l[0]} »`);
      return distincts.sort((a, b) => a - b).map((b, i) => `${i === 0 ? prep : 'au'} bloc ${b}${sep || ','} ${liste(titres.filter((_, k) => nums[k] === b))}`).join(', et ');
    });
  }
  return { texte: t.trim(), retirees, renvois };
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
## Votre contexte et votre site — 3 à 6 lignes : l'acheteur, l'objet du marché, le ou les sites, la durée (seulement si elle figure dans les DONNÉES DU MARCHÉ ; sinon n'en parle pas, jamais [À COMPLÉTER] pour une donnée de l'acheteur) ; faits du DCE uniquement, sans qualificatif promotionnel ; ne redis pas la première phrase.
## Le périmètre de la prestation demandée — un tableau Markdown « Site | Poste | Jours et horaires | Qualification | Missions principales », une ligne par poste prévu au CCTP (aucun poste, horaire ni effectif ajouté), puis une phrase par prestation complémentaire prévue (rondes, interventions sur alarme, bons de commande, reprise du personnel…).
## Vos attentes et nos engagements — 3 à 6 puces de la forme « **« ce que vous attendez, avec les mots exacts de l'acheteur »** : … → notre réponse : … (le process GSS qui y répond, nommé par le titre de sa rubrique entre guillemets « … », sans écrire « process GSS »), développée au bloc n ».
## Les points de vigilance identifiés et nos réponses — 2 à 4 puces de la forme « **<le point de vigilance, nommé en 2 à 5 mots>** : … (fait du DCE) → notre réponse : … (un process GSS existant, nommé par le titre de sa rubrique entre guillemets « … », sans écrire « process GSS ») » ; jamais le libellé « Point de vigilance » lui-même.
Un titre de rubrique cité au milieu d'une phrase s'écrit entre guillemets (« coordonnée par « La planification » »), jamais en gras.

SCHÉMA DE PROCESS (champ "etapes") : 5 étapes lues de gauche à droite, dans cet ordre : 1. le besoin (role rouge) ; 2. l'enjeu principal (rouge) ; 3. le dispositif de GSS (orange) ; 4. le pilotage (bleu) ; 5. le résultat pour l'acheteur (vert, toujours la dernière). Chaque étape porte un CONTENU propre à CE marché, tiré des enjeux et des exigences clés du DCE (délai de mobilisation, qualification au poste, confidentialité, continuité, tuilage, nouveau bâtiment…) : "titre" = un titre NOMINAL court (1 à 4 mots) qui nomme ce contenu (ex. « Mobilisation sous 2 heures », « SSIAP 2 au PC 24 h/24 », « Confidentialité des patients »), jamais le seul nom de l'étape (« Votre besoin », « Vos enjeux », « Notre dispositif », « Notre pilotage », « Votre résultat ») ; "texte" = une phrase concrète de 12 mots au plus, qui commence par une majuscule, sans reprendre le titre de l'étape ni une formule générale (« … nous consulte pour le marché », « Vos enjeux comprennent… », « Notre dispositif s'appuie sur… »). Un poste (PC, accueil, loge) n'agit pas : le sujet est l'agent qui l'occupe, avec sa qualification (« L'agent SSIAP 2 du PC… »), et ce qu'il fait respecte le CCTP (un agent qui doit rester au PC ne fait pas de ronde). Les étapes reprennent des mots EXACTS de ton TEXTE (même orthographe, mêmes accords) : chaque mot et chaque chiffre du schéma doit déjà figurer dans ton texte, sinon le schéma est refusé ; c'est le schéma qui reprend le texte, jamais l'inverse : n'ajoute jamais au texte des mots ou des bribes de phrase (« Traçabilité des rondes. », « SSIAP 1 et ADS. ») pour y faire figurer ceux du schéma. "titre_schema" : le message du schéma, en une phrase courte (60 caractères au plus).

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
    d.horsNormandie ? `- MARCHÉ HORS DE NORMANDIE (siège de GSS à Rouen ; ${ZONE_GSS}, sans ville d'agence à inventer) : aucun délai d'intervention, d'astreinte ou de remplacement chiffré, sauf s'il est imposé par le DCE.` : '',
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
- GSS ne sous-traite pas et n'a pas recours à l'intérim : n'en parle jamais, même au conditionnel. Un montant, un numéro de contrat ou un nom d'assureur de GSS vient uniquement du registre ; un seuil exigé par le DCE n'est jamais présenté comme la garantie de GSS. Ne pose pas de question sur une donnée que le registre donne déjà.
"titre" : le titre de la rubrique, 8 mots au plus, dans le vocabulaire du DCE.
Réponds UNIQUEMENT par un objet JSON : {"titre": "…", "texte": "…"}`;

/**
 * Contrôle sans modèle d'une proposition de réponse (questions nouvelles, D5) avant de la placer dans le mémoire :
 *  - phrase ou question qui cite la sous-traitance ou l'intérim, même au conditionnel (faits_gss.md : GSS ne sous-traite
 *    pas, n'a pas recours à l'intérim ; parc_expo 202 : « Si une sous-traitance devait être mise en place… ») : retirée ;
 *  - amorce sans objet terminée par un repère (« … couvrant la date de commencement des prestations si : [À COMPLÉTER]. ») :
 *    retirée avec sa question ;
 *  - montant de garantie (assurance, sinistre) qui n'est pas un montant de GSS (`montantsGss`, registre) : la phrase est
 *    retirée et l'écart devient une question à GSS (parc_expo 202 : « au minimum 10 000 000 € » présentés comme les
 *    garanties de GSS, alors que sa RC professionnelle Hiscox est de 300 000 €).
 */
/** Fait accompli ou pièce jointe affirmés dans une proposition de l'IA (« a été effectuée », « est jointe à l'offre »). */
const FAIT_ACCOMPLI = /\bvisites?\b[^.]{0,80}\b(?:a|ont) (?:d[ée]j[àa] )?été (?:effectu|r[ée]alis|men|organis|faite?s?)|\b(?:a|ont|avons) (?:d[ée]j[àa] )?(?:effectu[ée]|r[ée]alis[ée]|men[ée]|fait|particip[ée](?: [àa])?)\b[^.]{0,40}\bvisites?\b|\bvisit[ée] (?:le|les) (?:site|lieux|locaux|parcs?)\b|\b(?:est|sont) (?:jointe?s?|annex[ée]e?s?) (?:à|au|en|dans) (?:l['’]offre|annexe|notre (?:offre|dossier)|le dossier|la pr[ée]sente)|\bci-jointe?s?\b/i;

export function controlerProposition(texte: string, montantsGss: string[] = []): { texte: string; retirees: string[]; questions: string[] } {
  const retirees: string[] = [];
  const questions: string[] = [];
  const montant = (x: string) => x.replace(/[\s\u00a0\u202f.]/g, '').replace(/euros?/i, '€');
  const gss = new Set(montantsGss.map(montant));
  const INTERDIT = /sous[- ]?trait|int[ée]rim/i;
  const lignes = String(texte || '').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const consultation = /^\s*\[CONSULTATION REQUISE\s*:/i.exec(l);
    if (consultation) {
      if (INTERDIT.test(l)) { retirees.push(l.trim()); continue; }
      out.push(l);
      continue;
    }
    if (/^\s*(?:#|\|)/.test(l) || !l.trim()) { out.push(l); continue; }
    const puce = (/^\s*(?:[-*•]|\d+[.)])\s+/.exec(l) || [''])[0];
    const corps = l.slice(puce.length);
    let retireAvecQuestion = false;
    const gardees = corps.split(/(?<=[.!?])\s+/).filter((ph) => {
      if (INTERDIT.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion ||= /\[À COMPLÉTER\]/.test(ph); return false; }
      if (/\b(?:si|lorsque|quand|dont|notamment)\s*:?\s*\[À COMPLÉTER\]\s*[.;]?\s*$/i.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion = true; return false; }
      // Engagement réduit à un oui ou non laissé en blanc (ifsem 335 : « Engagement de GSS sur la couverture permanente de ce
      // poste et ces horaires : [À COMPLÉTER]. ») : la proposition est déjà « à valider », la phrase et sa question partent.
      if (/^\s*(?:\*\*)?\s*(?:engagement|confirmation|validation)\b[^:]{0,200}:\s*\[À COMPLÉTER\]\s*\.?\s*(?:\*\*)?\s*$/i.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion = true; return false; }
      // Fait accompli ou pièce jointe affirmés par GSS sans source (citedia 341 : « La visite obligatoire des lieux a été
      // effectuée le 7 octobre 2026 », « L'attestation… est jointe à l'offre ») : retiré, demandé à GSS.
      if (FAIT_ACCOMPLI.test(ph)) {
        retirees.push(ph.trim());
        questions.push(`Une proposition de réponse affirmait un fait que vos documents ne contiennent pas (« ${ph.replace(/[*_]/g, '').trim().slice(0, 240)} ») : est-il exact, et à quelle date ?`);
        return false;
      }
      const montants = ph.match(/\d[\d\s\u00a0\u202f.,]*\s*(?:€|euros?\b)/gi) || [];
      if (montants.length && /assur|garanti|sinistre|couvert|couverture/i.test(ph) && montants.some((m) => !gss.has(montant(m)))) {
        retirees.push(ph.trim());
        questions.push(`Une proposition de réponse annonçait des garanties d'assurance qui ne sont pas celles de votre registre (« ${ph.replace(/[*_]/g, '').trim().slice(0, 240)} ») : quels montants de garantie votre assurance couvre-t-elle pour ce marché ?`);
        return false;
      }
      return true;
    });
    // Question qui suit une phrase retirée (repère [À COMPLÉTER] retiré avec elle) : retirée aussi.
    if (retireAvecQuestion && /^\s*\[CONSULTATION REQUISE\s*:/i.test(lignes[i + 1] || '')) { retirees.push(lignes[i + 1].trim()); i++; }
    if (gardees.length) out.push(`${puce}${gardees.join(' ')}`);
  }
  return { texte: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/(^|\n)(#{2,4} [^\n]+)\n+(?=#{2,4} |$)/g, '$1').trim(), retirees, questions };
}

/** Messages de la rédaction d'une proposition de réponse à une question nouvelle (consigne fixe en premier). */
export function consigneProposition(groupe: GroupeNouveau, o: { client?: string; bloc?: string; sources?: string; regles?: string; perimetre?: string; horsNormandie?: boolean; analyse?: string }): Array<{ role: 'system' | 'user'; content: string }> {
  const user = [
    o.client ? `CLIENT : ${o.client}` : '',
    `SUJET DE LA QUESTION : ${groupe.sujet}`,
    o.bloc ? `BLOC DU MÉMOIRE QUI ACCUEILLE LA RÉPONSE : ${o.bloc}` : '',
    `EXIGENCES DU DCE À TRAITER :\n${groupe.exigences.map((e) => `- ${e.exigence}${e.reponseGss ? `\n  (élément GSS connu : ${e.reponseGss})` : ''}`).join('\n')}`,
    o.horsNormandie ? `MARCHÉ HORS DE NORMANDIE : ${ZONE_GSS} (aucune ville d'agence à inventer) ; aucun délai d'intervention, d'astreinte ou de remplacement chiffré, sauf s'il est imposé par le DCE.` : '',
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
  const parties: string[] = ['## Votre contexte et votre site', d.amorce || (d.client ? `${d.client.charAt(0).toUpperCase() + d.client.slice(1)} lance le marché ${d.objet ? `« ${d.objet} »` : 'de sécurité privée'}.` : `Vous nous consultez pour ${d.objet || 'une prestation de sécurité privée'}.`)];
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
/** Premier message de l'assistant (réponse libre) : engagements rédigés par l'IA d'après le CCTP, par rubrique (D5, T4C-10). */
export function messageEngagements(rubriques: Array<{ titre: string; n: number }>): string {
  if (!rubriques.length) return '';
  const total = rubriques.reduce((t, r) => t + r.n, 0);
  return [
    `J'ai ajouté ${total === 1 ? 'un engagement rédigé' : `${total} engagements rédigés`} d'après le cahier des charges, sous « Nos engagements sur les exigences du cahier des charges », pour les exigences que le mémoire type ne traitait pas encore. À relire avant la remise :`,
    ...rubriques.map((r) => `- « ${r.titre} » : ${r.n} engagement${r.n > 1 ? 's' : ''}`),
    '',
    'Pour chacun, vous pouvez le valider tel quel, le modifier (« Dans la rubrique …, remplace l\'engagement sur … par … ») ou le supprimer (« Dans la rubrique …, supprime l\'engagement sur … »).',
  ].join('\n');
}

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
