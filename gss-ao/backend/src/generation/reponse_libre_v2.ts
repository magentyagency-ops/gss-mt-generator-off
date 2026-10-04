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
  chargerMemoireType, normaliser, rechercherRubriques, similarite, motsDePhrase, faitsDePhrase, listeFr, cleCommune, delaiImposeNet,
  type DonneesBesoin, type ExigenceMatrice, type MemoireType, type PlanMemoireType, type SchemaRubrique,
} from './memoire_type';
import { ZONE_GSS, vocabulaireDuCctp, periodeEnTete, normaliserExpressionsDelai, minutesDe, RX_NOMBRE_LETTRES as RX_NOMBRE_LETTRES_V2, MONTANT_PENALITE } from './base_memoires';
import { insecablesNombres } from './dimensionnement';
import { PAS_INFINITIF, questionExacte } from './questions_gss';

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
    // Valeur recopiée avec la majuscule de sa phrase du CCTP (citedia 701 : « les réunions de suivi ont lieu Au minimum une
    // fois par trimestre ») : elle est insérée au milieu d'une phrase de GSS, en minuscule.
    const brute = String(v?.valeur || '');
    const casse = /^(?:Au|Aux|Une?|Deux|Trois|Quatre|Cinq|Six|Sept|Huit|Neuf|Dix|Douze|Quinze|Trente|Dans|Sous|En|Chaque|Tous|Toutes|Tout|Toute|Le|La|Les|Des|Par|Selon|Entre|Avant|Après|Dès|Mensuel\w*|Trimestriel\w*|Hebdomadaire\w*|Annuel\w*|Semestriel\w*|Quotidien\w*|Journali\w*)(?=[\s'’-])/.test(brute)
      ? brute.charAt(0).toLowerCase() + brute.slice(1) : brute;
    // Délai : la durée seule (« 30 minutes maximum (alarme intrusion) » → « 30 minutes », T4-CONS-4), la phrase de GSS porte
    // déjà « en … au maximum » ; écarté si un qualificatif reste.
    const valeur = /^DELAI_/.test(nom) ? delaiImposeNet(casse) : casse;
    if (!forme || (valeur && forme.test(valeur))) valides[nom] = valeur === brute ? v : { ...v, valeur };
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
    // Consigne à l'infinitif (T5-CONS-4 : « Définir avec GSS le circuit interne… », « Déterminer avec GSS… », « Établir avec
    // GSS… », « Préciser avec GSS le nom du chef de site ») : verbe et « avec / par / pour / auprès de GSS » retirés.
    .replace(/^\s*(?:obtenir|demander|fournir|pr[ée]ciser|indiquer|confirmer|communiquer|transmettre|donner|valider|lister|d[ée]crire|d[ée]finir|d[ée]terminer|fixer|arr[êe]ter|choisir|organiser|formaliser|[ée]tablir|identifier|nommer|d[ée]signer|compl[ée]ter|renseigner|d[ée]tailler|r[ée]cup[ée]rer|recueillir)\s+(?:(?:de|à|avec|par|pour|aupr[èe]s de)\s+(?:GSS|l.acheteur)\s*:?\s*)?/i, '')
    .replace(/\s+(?:avec|par|pour|aupr[èe]s de)\s+GSS\b/gi, '')
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
  // Groupe nominal de la donnée (T6-CONS-7) : article retiré au milieu d'une coordination (« Processus interne et les
  // échéances » → « Processus interne et échéances ») et participe sans objet propre devant « pour / afin de » (« appliqués
  // pour instruire » → « pour instruire »).
  l = l.replace(/(\s(?:et|ou)\s+)(?:les|le|la|l['’]|des)\s*(?=\p{L})/giu, '$1')
    .replace(/\s+(?:appliqu|utilis|retenu|pr[ée]vu|mobilis|employ|suivi|adopt|engag)[\p{L}]*(?=\s+(?:pour|afin)\b)/giu, '')
    .replace(/\s+mis(?:es?)?\s+en\s+(?:œ|oe)uvre(?=\s+(?:pour|afin)\b)/giu, '');
  // Coupe seulement au-delà de 110 signes : sur une fin de mot, jamais sur un mot-outil (« … en cours de »), avec « … ».
  if (l.length > 110) {
    l = l.slice(0, 110).replace(/\s+\S*$/, '');
    for (let k = 0; k < 4; k++) l = l.replace(/\s+(?:de|du|des|d['’]|en|à|au|aux|pour|par|et|ou|le|la|les|l['’]|un|une|sur|dans|avec|sans|selon|vers|chez|entre|cours|afin|lors)$/i, '');
    l = `${l.replace(/[\s,;:]+$/, '')}…`;
  }
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : '';
}

/** Phrase (ou ligne de tableau) qui contient le passage [pos, pos + longueur[ de `texte`, passage compris. */
export function phraseAutour(texte: string, pos: number, longueur: number): string {
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

/** Mots porteurs d'une question ou d'une phrase (singulier, sans mots outils), pour les rapprocher. */
const motsQuestion = (t: string) => new Set(normaliser(String(t || '').replace(/\[À COMPLÉTER\]/g, ' ')).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 4 && !['combien', 'quel', 'quelle', 'quels', 'quelles', 'compte', 'comptent', 'dans', 'pour', 'avec', 'marche', 'votre', 'notre', 'nous', 'vous', 'cette', 'sont', 'elle', 'elles', 'pouvez', 'preciser', 'fournir', 'indiquer', 'validez', 'valider', 'confirmer', 'faut', 'doit', 'peut', 'annonce', 'apporte', 'reponse', 'question', 'point', 'ville', 'acheteur'].includes(w))
  .map((w) => (w.length > 4 ? w.replace(/[sx]$/, '') : w)));
/** Part des mots porteurs de `a` présents dans `b`. */
const recouvrement = (a: Set<string>, b: Set<string>) => (a.size ? [...a].filter((w) => b.has(w)).length / a.size : 0);
/** Part des mots porteurs du texte `a` présents dans le texte `b`. */
export const recouvrementTextes = (a: string, b: string) => recouvrement(motsQuestion(a), motsQuestion(b));
/** Ressemblance de deux questions (la plus courte dans la plus longue). */
export const similariteQuestions = (a: string, b: string) => { const x = motsQuestion(a), y = motsQuestion(b); return x.size <= y.size ? recouvrement(x, y) : recouvrement(y, x); };

/**
 * Questions attribuées aux phrases de leurs emplacements (même ordre que `phrases` ; undefined : aucune) : chaque question va
 * à la phrase qui partage le plus de ses mots porteurs (un tiers au moins), une phrase ne reçoit qu'une question (T2-CONS-6).
 */
function rapprocherQuestions(questions: string[], phrases: string[]): Array<string | undefined> {
  const out: Array<string | undefined> = phrases.map(() => undefined);
  const scores: Array<{ q: number; p: number; s: number }> = [];
  questions.forEach((q, i) => phrases.forEach((ph, j) => scores.push({ q: i, p: j, s: recouvrement(motsQuestion(q), motsQuestion(ph)) })));
  scores.sort((a, b) => b.s - a.s || a.q - b.q || a.p - b.p);
  const prisesQ = new Set<number>();
  for (const x of scores) {
    if (x.s < 0.34 || prisesQ.has(x.q) || out[x.p]) continue;
    out[x.p] = questions[x.q];
    prisesQ.add(x.q);
  }
  return out;
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
    // l'emplacement (questionsVariantes, dans l'ordre des emplacements du bloc). Ligne de consultation suivie d'un texte
    // ajouté sur la même ligne (adaptation, T2-CONS-6 : « [CONSULTATION REQUISE : …] Les effectifs sont détaillés… ») :
    // la consultation reste sur sa ligne, le texte devient le paragraphe suivant.
    const normalises = texte.replace(/^([ \t]*\[CONSULTATION REQUISE\s*:[^\]\n]+\][.;,]?)[ \t]+(?=\S)/gim, '$1\n\n').split(/\n{2,}/).map((b) => normaliserVariantesACompleter(b));
    const questionsVariantes = normalises.map((x) => x.questions);
    const blocs = normalises.map((x) => x.texte.replace(/[ \t]+$/gm, ''));
    const questionsParBloc: Array<Array<string | undefined>> = blocs.map(() => []);
    const lignesConservees: string[][] = blocs.map((b) => b.split('\n'));
    /** Phrase de chaque emplacement (bloc, rang), pour rapprocher une question de son emplacement. */
    const phrasesEmplacements: string[][] = blocs.map(() => []);
    /** Consultations non attribuées (bloc, ligne) : rapprochées ensuite des emplacements restés sans question. */
    const libres: Array<{ bloc: number; ligne: number; question: string }> = [];
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
        } else {
          lignes.forEach((l, j) => { const q = LIGNE_CONSULTATION.exec(l)?.[1]?.trim(); if (q) libres.push({ bloc: k, ligne: j, question: q }); });
        }
        attente = [];
        return;
      }
      // Phrase de chaque emplacement du bloc (ligne de tableau entière).
      const texteBloc = contenu.join('\n');
      for (const m of texteBloc.matchAll(RX_PLACEHOLDER)) phrasesEmplacements[k].push(phraseAutour(texteBloc, m.index!, m[0].length));
      const qs: Array<string | undefined> = [];
      const propres = questionsVariantes[k] || [];
      // Lignes de consultation réservées aux emplacements sans précision propre.
      const sansPropre = Array.from({ length: nbEmplacements }, (_, i) => i).filter((i) => !propres[i]);
      const tableau = phrasesEmplacements[k].every((x) => /^\s*\|/.test(x));
      if (questions.length && questions.length !== sansPropre.length && !(questions.length === 1 && tableau)) {
        // Moins (ou plus) de questions que d'emplacements (T2-CONS-6, cstb 1201 : la question des titulaires donnée aussi à
        // l'équipe suppléante) : chaque question va à l'emplacement dont la phrase lui ressemble le plus ; une question sans
        // emplacement proche attend les emplacements restés sans question.
        const attribuees = rapprocherQuestions(questions, sansPropre.map((i) => phrasesEmplacements[k][i]));
        for (let i = 0; i < nbEmplacements; i++) qs.push(propres[i] || attribuees[sansPropre.indexOf(i)]);
        questions.forEach((q) => { if (!attribuees.includes(q)) libres.push({ bloc: k, ligne: -1, question: q }); });
      } else {
        for (let i = 0; i < nbEmplacements; i++) {
          const j = sansPropre.indexOf(i);
          if (propres[i]) qs.push(propres[i]);
          else if (!questions.length) qs.push(undefined);
          else if (questions.length === 1) qs.push(questions[0]);
          else qs.push(questions[Math.min(j, questions.length - 1)]);
        }
      }
      questionsParBloc[k] = qs;
      lignesConservees[k] = contenu;
      attente = questions.length ? [] : qs.map((q, i) => ({ q, bloc: k, index: i })).filter((a) => !a.q).map(({ bloc, index }) => ({ bloc, index }));
    });
    // Consultations restées libres (séparées de leur paragraphe par un texte ajouté) : rapprochées des emplacements de la
    // rubrique restés sans question ; une consultation qui redit une question déjà posée à un emplacement est retirée ; les
    // autres restent au fil du texte (repère en ligne), comme avant.
    {
      const vides: Array<{ bloc: number; index: number }> = [];
      questionsParBloc.forEach((qs, k) => qs.forEach((q, i) => { if (!q) vides.push({ bloc: k, index: i }); }));
      const attribuees = rapprocherQuestions(libres.map((x) => x.question), vides.map((v) => phrasesEmplacements[v.bloc][v.index] || ''));
      const posees = questionsParBloc.flat().filter((q): q is string => !!q);
      vides.forEach((v, i) => { if (attribuees[i]) questionsParBloc[v.bloc][v.index] = attribuees[i]; });
      for (const l of libres) {
        const utilisee = attribuees.includes(l.question) || posees.some((q) => similariteQuestions(q, l.question) >= 0.6);
        if (!utilisee || l.ligne < 0) continue;
        lignesConservees[l.bloc] = lignesConservees[l.bloc].map((x, j) => (j === l.ligne ? '' : x));
      }
    }
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
    // Intitulé tiré de l'exigence : entier jusqu'à 160 signes, sinon coupé sur une fin de mot avec « … » (imm 1463, T4-CONS-12 :
    // « … sauf impossibilité liée à l » dans l'assistant et les consultations).
    const tete = e.exigence.split(/[.;:]/)[0].replace(/\s+/g, ' ').trim();
    const sujet = String(e.sujet || '').trim() || (tete.length <= 160 ? tete : `${tete.slice(0, 161).replace(/\s+\S*$/, '').replace(/[\s,;:–-]+$/, '')}…`);
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

/**
 * Puces « Vos attentes » et « Points de vigilance » du bloc 1 qui décrivent une formalité de l'offre (T6-CONS-12 : « **Visite
 * obligatoire** : sans visite du site, l'offre est déclarée non recevable … → notre réponse : « L'intégration d'un nouveau
 * marché » ») : retirées du texte (aucune rubrique du mémoire n'y répond), leur exigence est renvoyée pour la question à GSS
 * (questionFormalite).
 */
export function formalitesDuBloc1(texte: string): { texte: string; formalites: string[] } {
  const formalites: string[] = [];
  let partie = '';
  const lignes = String(texte || '').split('\n').filter((l) => {
    if (/^##\s/.test(l)) { partie = l; return true; }
    if (!/^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie) || !/^\s*[-*•]\s/.test(l)) return true;
    const besoin = l.replace(/^\s*[-*•]\s+/, '').split('→')[0].replace(/\*\*/g, '').trim();
    if (!FORMALITES_OFFRE.test(besoin)) return true;
    formalites.push(besoin.replace(/^[^:]{2,60}:\s*/, '').replace(/[\s.;:]+$/, ''));
    return false;
  });
  return { texte: lignes.join('\n'), formalites };
}

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
/**
 * Titre de page de schéma sans ponctuation finale (D11, planche Marine v3 : « Notre réponse à votre besoin, en un process » ;
 * citedia 1461, T4-CONS-11 : « Des alarmes traitées, des prestations suivies. » repris tel quel du modèle).
 */
export const titreSansPointFinal = (t: unknown): string => String(t ?? '').replace(/(?<!\.\.)\s*[.;:,]+\s*$/, '').trim();

export const court = (t: unknown, max: number): string => {
  // Guillemets retirés seulement quand ils encadrent tout le texte (imm 473 : le guillemet ouvrant d'un titre cité en tête
  // était retiré seul, « Le livre … (LMC) » structure… » sans guillemet ouvrant, et le moteur refusait le schéma).
  let s = String(t ?? '').replace(/\s+/g, ' ').trim();
  const entoure = /^[«"“]\s*([^«»"“”]*?)\s*[»"”]$/.exec(s);
  if (entoure) s = entoure[1].trim();
  if (s.length <= max) return s;
  let coupe = s.slice(0, max + 1).replace(/\s+\S*$/, '');
  // Coupe au milieu d'une citation ou d'une parenthèse (caen 475 : « …l'intervention via « Notre socle de procédures » sans
  // guillemet fermant, schéma refusé) : arrêtée avant la citation, sans la préposition qui l'introduisait.
  const ouverte = (o: string, f: string) => coupe.split(o).length > coupe.split(f).length;
  for (const [o, f] of [['«', '»'], ['(', ')'], ['“', '”']]) {
    if (!ouverte(o, f)) continue;
    coupe = coupe.slice(0, coupe.lastIndexOf(o)).replace(/\s+(?:via|avec|par|de|du|des|d['’]|à|au|aux|et|ou|en|dans|sur|pour|selon|le|la|les|l['’])\s*$/i, '').trimEnd();
  }
  return coupe.replace(/[,;:\s]+$/, '');
};

/**
 * Spécification du schéma de process (« on pense à ça, puis à ça, pour arriver à ça ») à partir des étapes rédigées
 * par le modèle : gabarit « flux » (2 à 5 étapes) ou « chevrons » (3 ou 4 phases) ; la dernière étape est verte
 * (issue). Le moteur contrôle ensuite que chaque mot et chaque chiffre figurent dans le texte de la rubrique.
 */
/** Texte d'une carte : tel quel s'il tient (86 caractères), sinon une phrase ou une proposition entière, sinon ''. */
const texteCarte = (t: unknown): string => {
  const brut = court(t, 1000);
  if (brut.length <= 86) return brut;
  const entier = texteEtapeEntier(brut, 86);
  if (entier) return entier;
  // Proposition entière qui précède une citation ou une parenthèse (« Nous coordonnons l'alerte et l'intervention via
  // « Notre socle… » » → « Nous coordonnons l'alerte et l'intervention ») : gardée sans la préposition qui l'introduisait.
  const k = brut.search(/\s(?:via|avec|par|selon|dans|sur|pour|grâce à)?\s*[«(“]/);
  if (k >= 25 && k <= 86) {
    const avant = brut.slice(0, k).replace(/[\s,;:]+$/, '');
    const dernier = (avant.split(/\s+/).pop() || '').toLowerCase().replace(/^(?:l|d)['’]/, '').replace(/['’]$/, '');
    if (avant.length >= 25 && !MOTS_OUTILS.has(dernier)) return avant;
  }
  return '';
};

export function specProcessBesoin(etapes: Array<{ titre?: string; texte?: string; role?: string }>, gabarit: 'flux' | 'chevrons' = 'flux'): { gabarit: string; params: any } | null {
  const max = gabarit === 'chevrons' ? 4 : 5;
  const propres = (Array.isArray(etapes) ? etapes : [])
    // Limites du moteur (rendu_schemas.py) : titre 36 (flux) ou 26 (chevrons) caractères ; coupe sur un mot plein.
    // Texte d'étape jamais coupé au milieu d'une phrase (cstb 551 : « … tout en respectant les séquences » pour « … les séquences
    // contractuelles. ») : une phrase ou une proposition entière de 86 caractères au plus, sinon aucun texte (l'étape vide est
    // alors refusée par anomaliesSchemaBloc1 et le schéma passe à la correction ou au secours). Espace insécable entre un
    // nombre et son unité (« 6 h », jamais « 6 / h » coupé par le moteur).
    // Coquille du DCE sur le sigle de l'autorité de GSS (« agrément préfectoral CNPAS ») : CNAPS, comme dans le texte (T2-CONS-11).
    .map((e) => ({ titre: String(e?.titre ?? '').replace(/(?<![A-Za-z])CNPAS(?![A-Za-z])/g, 'CNAPS'), texte: String(e?.texte ?? '').replace(/(?<![A-Za-z])CNPAS(?![A-Za-z])/g, 'CNAPS'), role: e?.role }))
    .map((e) => ({ titre: typoSchema(insecablesNombres(titreEtape(e?.titre, gabarit === 'chevrons' ? 26 : 34))), texte: typoSchema(insecablesNombres(texteCarte(typoSchema(String(e?.texte ?? ''))))), role: String(e?.role || '').toLowerCase().split(/[^a-zé]+/)[0] }))
    .filter((e) => e.titre)
    .slice(0, max);
  if (propres.length < (gabarit === 'chevrons' ? 3 : 2)) return null;
  // Texte qui redit le titre avant « : » (« La continuité des deux postes : remplacement immédiat d'un agent absent », T5N-8) :
  // seule la suite, qui apporte l'information, reste sur la carte.
  for (const e of propres) {
    const m = /^\s*(?:(?:le|la|les|un|une|des|du)\s+|l['’]\s*)?(.+?)\s*:\s+(.+)$/i.exec(e.texte || '');
    const n = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:le|la|les|l|un|une|des|du)\s+/, '');
    if (m && n(m[1]) === n(e.titre) && m[2].split(/\s+/).length >= 3) e.texte = m[2].charAt(0).toUpperCase() + m[2].slice(1);
  }
  const etapesSpec = propres.map((e, i) => {
    const role = i === propres.length - 1 ? 'vert' : (ROLES.includes(e.role) && e.role !== 'vert' ? e.role : (i < 2 ? 'rouge' : i === propres.length - 2 ? 'bleu' : 'orange'));
    return { titre: e.titre.charAt(0).toUpperCase() + e.titre.slice(1), ...(e.texte ? { texte: e.texte.charAt(0).toUpperCase() + e.texte.slice(1) } : {}), role };
  });
  // Cinq étapes (besoin, enjeu, dispositif, pilotage, résultat) : process du bloc 1, dessiné en miroir « vous → nous →
  // résultat » par le style « marine » v3 (rendu_schemas.py) ; en flux par les autres styles.
  return { gabarit, params: { etapes: etapesSpec, ...(gabarit === 'flux' && etapesSpec.length === 5 ? { forme: 'process_besoin' } : {}) } };
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

export function defautsEtapesBesoin(etapes: Array<{ titre?: string; texte?: string }> | undefined, contexte: { texte?: string; sites?: string[]; dce?: string } = {}): string[] {
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
    // Texte trop long pour la carte sans pouvoir garder une phrase ou une proposition entière (cstb 551 : « … tout en
    // respectant les séquences » imprimé, coupé à 86 caractères) : refusé, jamais tronqué.
    if (texte.length > 86 && !texteEtapeEntier(texte, 86)) defauts.push(`${n} : texte de ${texte.length} caractères, trop long pour la carte du schéma (86 au plus) ; écris une phrase entière plus courte.`);
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
  // Process en miroir (5 étapes : besoin, enjeux, dispositif, pilotage, résultat, planche p. 28) : les cartes 03 et 04 disent
  // les moyens et le pilotage de GSS, jamais une exigence du CCTP recopiée (T2-CONS-11, cstb 1201 : « La qualification
  // exigée est l'agrément préfectoral… », « Les horaires des rondes doivent varier régulièrement »).
  if (Array.isArray(etapes) && etapes.length === 5) {
    const EXIGENCE = /(?<![\p{L}])(?:doi(?:t|vent)|devr(?:a|ont)|exig[ée]e?s?|requise?s?|impos[ée]e?s?|obligatoires?|le CCTP|le cahier des charges|le march[ée] pr[ée]voit|pr[ée]vue?s? par)(?![\p{L}])/iu;
    const GSS = /(?<![\p{L}])(?:nous|notre|nos|GSS)(?![\p{L}])/iu;
    [2, 3].forEach((k) => {
      const e = etapes[k];
      const t = `${e?.titre || ''} ${e?.texte || ''}`;
      // Texte d'une carte « nous » contenu mot pour mot dans le DCE (T3-CONS-2, ign 1351 : « Les chercheurs accèdent à
      // Carnot-Cassini 24h/24 et 7j/7 ») : c'est l'exigence, pas la réponse de GSS.
      const tx = norm(String(e?.texte || ''));
      const recopie = !!contexte.dce && tx.split(' ').length >= 6 && norm(contexte.dce).includes(tx);
      if ((EXIGENCE.test(t) && !GSS.test(t)) || recopie) defauts.push(`étape ${k + 1} : « ${String(e?.titre || '').trim()} : ${String(e?.texte || '').trim()} » recopie une exigence du CCTP ; l'étape ${k + 1} dit ${k === 2 ? 'le dispositif de GSS (équipe, moyens)' : 'le pilotage de GSS (contrôle, suivi)'} qui y répond.`);
    });
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
 * Engagement en double dans une même liste « Nos engagements sur les exigences du cahier des charges » (T9N-4, cstb 551 :
 * « GSS interdira à ses personnels … de photographier les bâtiments, équipements scientifiques ou installations… » puis
 * « GSS respectera et fera respecter l'interdiction de photographier les bâtiments, les équipements scientifiques et les
 * installations du CSTB ») : une puce dont tous les mots porteurs (radicaux de 6 lettres, hors verbes d'engagement) et
 * tous les chiffres sont dans une puce plus longue de la même liste est retirée ; la plus complète reste. Un seul mot
 * qui diffère (« de nuit » / « en journée », « à Thiais » / « à Villejuif ») suffit à garder les deux. Le texte de GSS,
 * hors de la liste, n'est jamais touché.
 */
export function sansEngagementsEnDouble(texte: string): { texte: string; retirees: string[] } {
  const TITRE = '## Nos engagements sur les exigences du cahier des charges';
  const i = texte.indexOf(TITRE);
  if (i < 0) return { texte, retirees: [] };
  const NEUTRES = /^(?:respec|fera|ferons|faire|veille|engage|mettra|mettre|oeuvre|garant|sera|seront|pourra|devra|toutes?|tous|leurs?|avec|dans|pour|sans|sous|ainsi|chaque|selon|cette|ces|ses|aupres)/;
  const radicaux = (t: string) => new Set(normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !NEUTRES.test(w)).map((w) => w.slice(0, 6)));
  const chiffres = (t: string) => new Set(t.match(/\d+(?:[.,]\d+)?/g) || []);
  const lignes = texte.slice(i + TITRE.length).split('\n');
  const puces = lignes.map((l, k) => ({ l, k, r: radicaux(l), c: chiffres(l) })).filter((x) => /^\s*[-*•]\s/.test(x.l));
  const otees = new Set<number>();
  for (const b of puces) {
    if (b.r.size < 3) continue;
    const plusComplete = puces.find((a) => a.k !== b.k && !otees.has(a.k) && (a.r.size > b.r.size || (a.r.size === b.r.size && a.k < b.k))
      && [...b.r].every((w) => a.r.has(w)) && [...b.c].every((x) => a.c.has(x)));
    if (plusComplete) otees.add(b.k);
  }
  if (!otees.size) return { texte, retirees: [] };
  const retirees = puces.filter((x) => otees.has(x.k)).map((x) => x.l.replace(/^\s*[-*•]\s*/, '').trim());
  return { texte: `${texte.slice(0, i + TITRE.length)}${lignes.filter((_, k) => !otees.has(k)).join('\n')}`, retirees };
}

/**
 * Même exigence du CCTP ajoutée par l'IA dans plusieurs rubriques (T2-CONS-13, cstb 1201 : « Un point intermédiaire à mi-année
 * est organisé la première année » sous « Les réunions de suivi », « L'équipe de contrôle » et « Le contrôleur de rondes ») :
 * phrases ajoutées par l'adaptation et puces « Nos engagements… », comparées entre rubriques (radicaux porteurs et chiffres) ;
 * la phrase reste dans la rubrique de son sujet (`choisir`), elle est retirée des autres. Le texte de GSS n'est jamais touché.
 */
export function sansAjoutsRepetesEntreRubriques(
  sections: Record<string, string>,
  ajouts: Array<{ id: string; phrase: string }>,
  choisir: (phrase: string, ids: string[]) => string,
): Array<{ id: string; phrase: string }> {
  const TITRE = '## Nos engagements sur les exigences du cahier des charges';
  const NEUTRES = /^(?:respec|fera|ferons|faire|veille|engage|mettra|mettre|oeuvre|garant|sera|seront|pourra|devra|toutes?|tous|leurs?|avec|dans|pour|sans|sous|ainsi|chaque|selon|cette|ces|ses|aupres|organi|realis|effect|assure)/;
  const radicaux = (t: string) => new Set(normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !NEUTRES.test(w)).map((w) => w.slice(0, 6)));
  const chiffres = (t: string) => [...new Set(t.match(/\d+(?:[.,]\d+)?/g) || [])].sort().join(',');
  // Candidats : phrases ajoutées par l'adaptation, puis puces des listes d'engagements.
  const cands: Array<{ id: string; phrase: string; puce: boolean }> = ajouts.filter((a) => (sections[a.id] || '').includes(a.phrase)).map((a) => ({ ...a, puce: false }));
  for (const [id, t] of Object.entries(sections)) {
    const i = t.indexOf(TITRE);
    if (i < 0) continue;
    for (const l of t.slice(i + TITRE.length).split('\n')) if (/^\s*[-*•]\s/.test(l)) cands.push({ id, phrase: l, puce: true });
  }
  const retires: Array<{ id: string; phrase: string }> = [];
  const vus = new Set<number>();
  for (let a = 0; a < cands.length; a++) {
    if (vus.has(a)) continue;
    const ra = radicaux(cands[a].phrase);
    if (ra.size < 3) continue;
    const groupe = [a];
    for (let b = a + 1; b < cands.length; b++) {
      if (vus.has(b) || cands[b].id === cands[a].id || groupe.some((g) => cands[g].id === cands[b].id)) continue;
      const rb = radicaux(cands[b].phrase);
      if (rb.size < 3 || chiffres(cands[a].phrase) !== chiffres(cands[b].phrase)) continue;
      const communs = [...rb].filter((w) => ra.has(w)).length;
      if (communs / Math.min(ra.size, rb.size) >= 0.6 && communs >= 3) groupe.push(b);
    }
    if (groupe.length < 2) continue;
    groupe.forEach((g) => vus.add(g));
    const ids = groupe.map((g) => cands[g].id);
    const garde = choisir(groupe.map((g) => cands[g].phrase).join(' '), ids) || ids[0];
    for (const g of groupe) {
      const c = cands[g];
      if (c.id === garde) continue;
      const t = sections[c.id];
      if (c.puce) {
        const lignes = t.split('\n');
        const k = lignes.lastIndexOf(c.phrase);
        if (k < 0) continue;
        lignes.splice(k, 1);
        let nt = lignes.join('\n');
        // Liste devenue vide : le sous-titre part avec elle.
        const i = nt.indexOf(TITRE);
        if (i >= 0 && !/^\s*[-*•]\s/m.test(nt.slice(i + TITRE.length))) nt = `${nt.slice(0, i).trimEnd()}${nt.slice(i + TITRE.length).trim() ? `\n\n${nt.slice(i + TITRE.length).trim()}` : ''}`;
        sections[c.id] = nt.replace(/\n{3,}/g, '\n\n').trim();
      } else {
        sections[c.id] = t.replace(c.phrase, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
      }
      retires.push({ id: c.id, phrase: c.phrase.replace(/^\s*[-*•]\s*/, '').trim() });
    }
  }
  return retires;
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
export function reduireBesoinAPages(texte: string, pages: (t: string) => number, maxPages = 2, minimum = { attentes: 4, vigilance: 3 }): { texte: string; retirees: string[]; depasse: boolean } {
  if (pages(texte) <= maxPages) return { texte, retirees: [], depasse: false };
  const r = reduireBesoinParLignes(texte, pages, maxPages, minimum);
  if (pages(r.texte) <= maxPages) return { ...r, depasse: false };
  // Lignes retirables épuisées (T3N-1, parc_expo 1331 : 3 pages de texte, dont une pour le seul tableau des points de
  // vigilance) : cellules du tableau du périmètre et citations des attentes resserrées, puis attentes et points de
  // vigilance sous le minimum (2 de chaque au moins) ; si le bloc dépasse encore 2 pages, GSS est prévenu (depasse).
  let t = resserrerBesoin(r.texte);
  if (pages(t) <= maxPages) return { texte: t, retirees: r.retirees, depasse: false };
  const r2 = reduireBesoinParLignes(t, pages, maxPages, { attentes: 2, vigilance: 2, perimetre: 5 });
  t = r2.texte;
  return { texte: t, retirees: [...r.retirees, ...r2.retirees], depasse: pages(t) > maxPages };
}

/** Coupe une cellule ou une citation trop longue à sa première phrase, sinon à la dernière virgule avant la limite (sans
 *  ponctuation finale). */
function couperA(texte: string, max: number): string {
  const t = texte.trim();
  if (t.length <= max) return t;
  const phrase = /^(.{20,}?[.;])\s/.exec(t)?.[1];
  if (phrase && phrase.length <= max) return phrase.replace(/\s*[.;]$/, '').trim();
  const avant = t.slice(0, max);
  const k = Math.max(avant.lastIndexOf(', '), avant.lastIndexOf(' ; '), avant.lastIndexOf(' et '));
  return k > max * 0.5 ? avant.slice(0, k).trim() : avant.replace(/\s+\S*$/, '').trim();
}

/**
 * Citation d'une attente du CCTP abrégée sans perdre l'exigence (T4-COH-2, ign : « En cas d'absence imprévue… quels que soit
 * son niveau de qualification […] » sans « son remplaçant devra être présent sur site dans les deux (2) heures », « … sous
 * 15 […] » sans « jours ») : la proposition qui porte l'obligation (verbe d'obligation, délai, nombre et son unité) est gardée
 * entière, le début et le reste sont élidés par « […] » ; un nombre n'est jamais séparé de son unité. null si l'exigence ne
 * tient pas dans la longueur : la citation reste entière (la ligne est retirée, ou GSS est prévenu du dépassement).
 */
export function abregerCitationAttente(c: string, max = 110): string | null {
  const t = String(c || '').replace(/\s+/g, ' ').trim().replace(/[.;]\s*$/, '');
  if (t.length <= max) return t;
  const DUREE = /(?:\(\s*)?\d+(?:[,.]\d+)?\s*\)?\s*(?:minutes?|min|mn|heures?|h|jours?(?:\s+(?:ouvr[ée]s|ouvrables|calendaires))?|semaines?|mois|ans?|%|€)(?![\p{L}\d])/iu;
  const OBLIGATION = /\b(?:doit|doivent|devra|devront|est tenue?|sont tenus|s['’]engage|assure|assurent|met en place|mettra|dispose|disposent|interv\w*|rempla\w*|transm\w*|pr[ée]sente?s?|mobilis\w*|sous \d|dans (?:les?|un d[ée]lai)|au plus tard|au moins|au minimum|maximum)\b/i;
  // Propositions (virgules, « ; », « : ») avec leur position dans la citation.
  const props: Array<{ debut: number; texte: string }> = [];
  let pos = 0;
  for (const p of t.split(/(?<=[,;:])\s+|\s+(?=et\s)/)) { props.push({ debut: t.indexOf(p, pos), texte: p.replace(/^et\s+(?=(?:au|à|dans|sous|en|avant|apr[èe]s|le|la|les|l['’]|un|une)\b)/i, '') }); pos = t.indexOf(p, pos) + p.length; }
  const score = (p: string) => (DUREE.test(p) ? 2 : 0) + (OBLIGATION.test(p) ? 1 : 0);
  let meilleure = -1, best = 0;
  props.forEach((p, i) => { const s = score(p.texte); if (s > best) { best = s; meilleure = i; } });
  if (meilleure < 0) return null;
  // Proposition porteuse, prolongée par les suivantes tant qu'elle tient (le complément du délai : « … dans les deux (2)
  // heures suivant l'heure normale… »), sans jamais finir sur une virgule pendante.
  let j = meilleure, extrait = props[meilleure].texte;
  while (j + 1 < props.length && `${extrait} ${props[j + 1].texte}`.length <= max - 6) { j++; extrait = `${extrait} ${props[j].texte}`; }
  extrait = extrait.replace(/[\s,;:]+$/, '');
  if (extrait.length > max - 6) {
    // Proposition trop longue : coupée sur une fin de mot après le nombre et son unité, jamais avant.
    const d = DUREE.exec(extrait);
    if (!d) return null;
    const finUnite = d.index + d[0].length;
    if (finUnite > max - 6) return null;
    // Fin de la proposition qui dit ce qu'il faut faire (« … pour faire intervenir les agents sur le site ») : gardée après
    // « […] » ; sinon la proposition s'arrête après la valeur et son unité.
    const but = /\s(?:pour|afin d['’e])\s[^,;]*$/i.exec(extrait.slice(finUnite));
    const tete = extrait.slice(0, finUnite);
    if (but && `${tete} […]${but[0]}`.length <= max - 6) return `${meilleure > 0 ? '[…] ' : ''}${tete} […]${but[0]}`;
    extrait = tete;
  }
  const avant = meilleure > 0 ? '[…] ' : '';
  const apres = j + 1 < props.length || extrait.length < props.slice(meilleure, j + 1).map((p) => p.texte).join(' ').replace(/[\s,;:]+$/, '').length ? ' […]' : '';
  const r = `${avant}${extrait}${apres}`;
  return avant ? r : r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * Bloc 1 resserré sans rien retirer de son contenu porteur : cellules de plus de 70 signes du tableau du périmètre ramenées
 * à leur première phrase (ou coupées à la dernière virgule), citations du DCE de plus de 110 signes des attentes et des
 * points de vigilance abrégées par « […] ».
 */
export function resserrerBesoin(texte: string): string {
  let section = '';
  const tout = String(texte || '');
  // Heures citées ailleurs que dans le rappel « Horaires imposés par le cahier des charges » (texte de secours) : un horaire
  // déjà écrit dans le périmètre n'est pas cité une seconde fois.
  const heures = (t: string) => (normaliser(t).match(/\b\d{1,2}\s*h\s*\d{0,2}/g) || []).map((x) => x.replace(/\s+/g, '').replace(/h(\d)$/, 'h0$1').replace(/h$/, 'h00').replace(/^0(\d)/, '$1'));
  const lignesHoraires = tout.split('\n').filter((l) => /^\s*[-*•]\s+«/.test(l));
  const ailleurs = new Set(heures(tout.split('\n').filter((l) => !lignesHoraires.includes(l)).join('\n')));
  return tout.split('\n').map((l) => {
    const h = /^##\s+(.+)$/.exec(l);
    if (h) { section = h[1]; return l; }
    if (/^Le périmètre/i.test(section) && lignesHoraires.includes(l) && heures(l).length && heures(l).every((x) => ailleurs.has(x))) return null;
    // Puce du périmètre (texte de secours, cstb 1201) de plus de 160 signes : sa première phrase, ou coupée à une virgule.
    if (/^Le périmètre/i.test(section) && /^\s*[-*•]\s/.test(l) && l.length > 180) {
      const [puce, corps] = [(/^\s*[-*•]\s+/.exec(l) || [''])[0], l.replace(/^\s*[-*•]\s+/, '')];
      // Propositions gardées dans l'ordre tant que la puce reste sous 170 signes (« Hors périmètre : A ; B ; C »).
      const morceaux = corps.replace(/\.\s*$/, '').split(/(\s*;\s*|(?<=[.])\s+)/);
      let garde = morceaux[0];
      for (let k = 1; k + 1 < morceaux.length; k += 2) {
        const sep = /;/.test(morceaux[k]) ? ' ; ' : ' ';
        if (`${garde}${sep}${morceaux[k + 1]}`.length > 170) break;
        garde = `${garde}${sep}${morceaux[k + 1]}`;
      }
      if (garde.length > 170) garde = couperA(garde, 170);
      return `${puce}${garde.replace(/[\s,;:.]+$/, '')}.`;
    }
    if (/^Le périmètre/i.test(section) && /^\s*\|/.test(l) && !/^\s*\|?\s*:?-{3,}/.test(l)) {
      const cellules = l.split('|');
      return cellules.map((c, i) => (i === 0 || i === cellules.length - 1 || c.trim().length <= 70 ? c : ` ${couperA(c, 70)} `)).join('|');
    }
    if (/^(?:Vos attentes|Les points de vigilance)/i.test(section) && /^\s*[-*•]\s/.test(l)) {
      // Citation abrégée sans perdre l'exigence ni l'unité de sa valeur (T4-COH-2) ; gardée entière sinon.
      return l.replace(/«\s*([^«»]{111,}?)\s*»/g, (m, c: string) => { const a = abregerCitationAttente(c, 110); return a ? `« ${a} »` : m; });
    }
    return l;
  }).filter((l): l is string => l !== null).join('\n').replace(/\n*Horaires imposés par le cahier des charges :\s*(?=\n\n|\n##|$)/g, '')
    .replace(/([^\n])\n(##\s)/g, '$1\n\n$2').replace(/\n{3,}/g, '\n\n');
}

function reduireBesoinParLignes(texte: string, pages: (t: string) => number, maxPages: number, minimum: { attentes: number; vigilance: number; perimetre?: number }): { texte: string; retirees: string[] } {
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
  // Second passage (T3N-1) : puces du périmètre au-delà des 5 premières (texte de secours en puces, cstb 1201), avant les
  // attentes et les points de vigilance.
  if (minimum.perimetre !== undefined) {
    const sec = Object.keys(parSection).find((x) => /^Le périmètre/i.test(x));
    const puces = sec ? parSection[sec].filter((k) => PUCE.test(lignes[k])) : [];
    candidats[1].push(...puces.slice(minimum.perimetre).reverse());
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

/** Clause contractuelle ou de procédure du DCE (confidentialité, litiges, forclusion, résiliation…) : pas un besoin de prestation. */
export const CLAUSE_CONTRACTUELLE = /confidentialit|divulgation|diff[ée]rend|litiges?\b|forclusion|contentieux|tribunal|recours (?:gracieux|contentieux)|r[ée]siliation|reconduction|avenant|facturation|factures?\b|paiement|r[èe]glement des (?:litiges|comptes)|cautionnement|garantie financi|sous peine de/i;

/**
 * Phrase du CCTP citée dans le texte de secours du bloc 1 (horaire ou obligation chiffrée), nettoyée de ce que la
 * lecture du PDF y a collé (T8CS-1, T8-COH-1) : repère « [section] », puce, caractère à usage privé du DCE (puce
 * Wingdings U+F0D8), pied de page « Page 9 sur 11 », numéro de partie suivi de son titre en capitales (« 3.6 DELAIS
 * D'INTERVENTION », « 11 DOCUMENTS EXIGIBLES », « ARTICLE 3 - MODALITES… »), titre de paragraphe collé à la phrase
 * (« Plannings Les plannings… » → « Les plannings… » ; « Poste PC sécurité Le poste… » → « Poste PC sécurité : Le
 * poste… »). Renvoie '' quand la phrase ne peut pas être citée seule : titre en minuscules dont la fin est introuvable
 * (« 5-1- Délais de livraison Suite à… »), deux phrases collées au milieu (« … de 8h00 à 1h00 Les horaires… »).
 */
function citationNettoyee(brut: string): string {
  let t = String(brut || '').replace(/[-]/g, ' ').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bpage\s+\d+\s*(?:\/|sur)\s*\d+\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[-–−•▪●○◦➢>*]\s*/, '').trim();
  // Numéro de partie (« 3.6 », « 4.4.2 », « 5-1- », « 11 », « ARTICLE 3 - ») suivi ou non d'un titre en capitales.
  let numero = false;
  const num = /^(?:article\s+\d+(?:[.-]\d+)*\s*[-–:.]?|\d+(?:[.-]\d+)+[.-]?(?=\s)|\d+[.)-](?=\s)|\d+(?=\s+[A-ZÀ-Ý]{3,}[A-ZÀ-Ý'’-]*\s))\s*[-–:]?\s*/i.exec(t);
  if (num) { t = t.slice(num[0].length); numero = true; }
  const titreCaps = /^(?:(?:[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’/&()-]*|[DL]['’][A-ZÀ-Ý]+[A-ZÀ-Ý'’-]*)\s+){1,14}(?=[A-ZÀ-Ý][a-zà-ÿ])/.exec(t);
  let titreRetire = false;
  if (titreCaps && /[A-ZÀ-Ý]{3,}/.test(titreCaps[0]) && /[A-ZÀ-Ý]{3,}/.test(titreCaps[0].replace(/\b(?:SSIAP|ADS|APS|PC|PCS|CNAPS|CQP|SST)\b/g, ''))) { t = t.slice(titreCaps[0].length); titreRetire = true; }
  // Ligne de tableau à deux cellules (« Horaires d'ouverture au public | Lundi au vendredi de 8h30 à 12h00. ») : « libellé :
  // valeur » ; plus de deux cellules : un tableau aplati, refusé plus loin. Puces « o » et numéros de liste après un
  // deux-points (« : 1- Pour les jardins suspendus : o Du 1 er avril… », havre), ordinal coupé (« 1 er » → « 1er »).
  if ((t.match(/\|/g) || []).length === 1) t = t.replace(/\s*\|\s*/, ' : ');
  t = t.replace(/(:\s*)(?:\d+\s*[-–)]\s*)?o\s+(?=[A-ZÀ-Ý0-9])/g, '$1').replace(/(:\s*)\d+\s*[-–)]\s+(?=[A-ZÀ-Ý])/g, '$1').replace(/\b(\d) er\b/g, '$1er');
  // Titre de paragraphe collé (« Poste PC sécurité Le poste devra… ») : mot de début de phrase en majuscule après une
  // minuscule, un chiffre ou une parenthèse.
  const DEBUT = /(?<=[A-Za-zÀ-ÿ0-9)])\s+(?=(?:Le|La|Les|Un|Une|Des|Ce|Cet|Cette|Ces|Il|Ils|Elle|Elles|En|Dans|Au|Aux|Pour|Chaque|Tout|Toute|Tous|Toutes|Si|Lorsque|Afin|Suite|Sur|Sous|Par|Avant|Après|Dès|Durant|Pendant)\s+[a-zà-ÿ]|L['’][a-zà-ÿ])/g;
  const coupes = [...t.matchAll(DEBUT)].map((m) => m.index!);
  if (coupes.length) {
    const avant = t.slice(0, coupes[0]).trim();
    const apres = t.slice(coupes[0]).trim();
    const titre = avant.split(' ').length <= 7 && !/[.;:,!?]/.test(avant) && !VERBE_CITATION.test(avant) && /^[A-ZÀ-Ý]/.test(avant);
    if (!titre || coupes.length > 1) return '';
    const mots = normaliser(avant).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const reste = normaliser(apres);
    t = mots.every((w) => reste.includes(w.slice(0, 5))) ? apres : `${avant} : ${apres}`;
  } else if (numero && !titreRetire && !/^(?:Le|La|Les|L['’]|Un|Une|En|Dans|Au|Aux|Pour|Chaque|Tout|Toute|Tous|Toutes|Si|Lorsque|A|À)\b/.test(t)) {
    return '';   // titre en minuscules dont la fin est introuvable (« 5-1- Délais de livraison Suite à… », vitry)
  }
  return t.trim();
}

/** Verbe conjugué (forme fréquente dans un CCTP) : sans lui, une « phrase » est un fragment (« Une fois par mois de nuit »). */
const VERBE_CITATION = new RegExp(String.raw`(?<![\p{L}])(?:est|sont|sera|seront|serait|seraient|soit|soient|a|ont|aura|auront|doit|doivent|devra|devront|devrait|peut|peuvent|pourra|pourront|fait|font|va|vont|faut|incombe|incombent|appartient|convient|reste|restent|court|courent|s['’]engage|s['’]engagent|s['’]effectue|s['’]effectuent|se\s+fait|se\s+font|se\s+d[ée]roule|se\s+d[ée]roulent|dispose|disposent|(?:effectu|assur|r[ée]alis|inform|organis|appliqu|proc[èe]d|r[ée]dig|mobilis|d[ée]p[êe]ch|remplac|communiqu|ex[ée]cut|accueill|surveill|d[ée]clench|v[ée]rifi|s[ée]curis|g[èe]r|utilis|constat|d[ée]livr|contact|appell?|accompagn|transf[èe]r|command)(?:e|ent)|(?:transmet|transmettent|remet|remettent|met|mettent|permet|permettent|fournit|fournissent|[ée]tablit|[ée]tablissent|garantit|garantissent|intervient|interviennent|pr[ée]voit|pr[ée]voient|comprend|comprennent|prend|prennent|tient|tiennent|maintient|maintiennent|re[çc]oit|re[çc]oivent|r[ée]pond|r[ée]pondent|rend|rendent|ouvre|ouvrent|ferme|ferment|pr[ée]vient|pr[ée]viennent|avertit|avertissent))(?![\p{L}])|(?<![\p{L}])[\p{Ll}]{2,}(?:era|eront|erait|eraient|ira|iront|irait|dra|dront|drait|vra|vront|tra|tront|rra|rront)(?![\p{L}])`, 'iu');

/** Début de phrase qui renvoie à la phrase précédente du CCTP : incompréhensible seule (« Dans ce cas… », « Ce CR… »). */
const DEBUT_ANAPHORIQUE = /^(?:il|ils|elle|elles|ce|cet|cette|ces|ceci|cela|celui|celle|ceux|celles|s['’]ils?|dans\s+ces?\s+cas|en\s+ce\s+cas|dans\s+cette|enfin|[àa]\s+ce\s+titre|[àa]\s+cet\s+effet|[àa]\s+cette\s+fin|pour\s+ce\s+faire|de\s+m[êe]me|ledit|ladite|lesdit(?:e)?s|le\s+cas\s+[ée]ch[ée]ant|par\s+ailleurs|en\s+outre|de\s+plus|aussi|alors|toutefois|cependant|n[ée]anmoins|en\s+revanche|lequel|laquelle|lesquel(?:le)?s|celle-ci|celui-ci|ceux-ci|au-del[àa]|en-de[çc][àa])(?![\p{L}])/iu;

/** Contrôles communs d'une citation du CCTP (horaire ou obligation) : '' si elle ne peut pas être imprimée seule. */
function citationImprimable(brut: string, fin: RegExp): string {
  const t = citationNettoyee(brut);
  if (!t) return '';
  if (!/^[A-ZÀ-Ý]/.test(t) || !fin.test(t) || t.split(' ').length < 5) return '';
  if (DEBUT_ANAPHORIQUE.test(t)) return '';
  if (/\(\s*Cf\.?\s*$|\(Note\s*\d|\bNote\s*\d+\s*:|\bX\]|\[|\]|\||<br\s*\/?>/i.test(t)) return '';
  // En-têtes d'un tableau aplati (« SITE Adresse Surface Utile Brute Horaires d'ouverture CAEN 20 rue… », caen 475, T7-COH-3).
  if ((t.match(/\b(?:SITE|Site|Adresse|Surface|Superficie|Horaires|Effectifs?|B[âa]timent|D[ée]signation|Nombre|Qualification)\b/g) || []).length >= 3) return '';
  // Trois mots en capitales de suite : tableau aplati (« SEMAINE (LUNDI AU VENDREDI) WEEK-END ET/OU JOURS FÉRIÉS… », ifits).
  if (/(?:(?<![\p{L}])[\p{Lu}][\p{Lu}'’/-]{2,}(?![\p{L}])[\s,()&/-]*){3,}/u.test(t)) return '';
  // Numéro de partie au milieu, pied de page, renvoi à une annexe au milieu de la phrase, puce « o » restante.
  if (/(?:^|\s)\d+(?:\.\d+)+\s+[A-ZÀ-Ý]{3,}|\bCCTP\s*-|\bconsultation\s+\d{4,}|\bCf\.?\s+Annexe\b(?!.{0,3}$)|(?:^|[:;]\s*)o\s+[A-ZÀ-Ýa-zà-ÿ0-9]/i.test(t)) return '';
  // Liste annoncée et coupée (« … les pièces suivantes : − CV de l'agent ; »), renvoi à un passage non cité.
  if (/:\s*[-–−•]\s|:\s*$|\bci-(?:dessus|dessous|apr[èe]s)\b|\bsusvis[ée]|\bpr[ée]cit[ée]|suivant(?:e)?s\s*:\s*(?:[-–−•]|$)/i.test(t)) return '';
  if ((t.match(/:/g) || []).length >= 4) return '';
  // Libellé de tableau collé au milieu de la phrase (« … à l'intérieur et l'extérieur des locaux Horaires : du lundi… », ign).
  if (/[a-zà-ÿ)]\s+(?:Horaires?|Fr[ée]quence|Dur[ée]e|Missions?|Effectifs?|Qualifications?|Lieu|Adresse|Jours|Plannings?|Remarques?|Observations?|Nota|NB|Consignes?|Postes?)\s*:/.test(t)) return '';
  // Cellules de tableau mises bout à bout (« Du Mardi Bureau du Parc Lices ouvert : Les 4 401 Rue du Louis d'Or Les Lices au
  // Samedi de 7h00 à 2h00 Lundis… », citedia) : une majuscule sur près de la moitié des mots.
  // (période de l'année en tête et mot qui suit un deux-points non comptés : « Mars, Avril et octobre : Grand Parterre… »).
  const sansPeriode = periodeEnTete(t) ? t.replace(/^[^:]*:\s*/, '') : t;
  const mots = sansPeriode.replace(/:\s*\p{Lu}/gu, ': x').split(/\s+/).slice(1).filter((w) => /\p{L}/u.test(w));
  if (mots.length >= 8 && mots.filter((w) => /^[«("]?\p{Lu}/u.test(w)).length / mots.length >= 0.4) return '';
  // Pronom sujet sans antécédent dans la phrase (« En cas de panne ils devront être remplacés… », rouen_univ).
  const pronom = /(?<![\p{L}'’])(?:il|ils|elle|elles)\s+(?!y\s+a\b|est\s+(?:interdit|demand|rappel|pr[ée]cis|entendu|convenu|imp[ée]ratif|n[ée]cessaire|obligatoire|indispensable))/iu.exec(t);
  if (pronom && !/(?<![\p{L}])(?:le|la|les|l['’]|un|une|des|du|au|aux|chaque|son|sa|ses|leur|leurs|ce|cet|cette|ces)\s*\p{L}/iu.test(t.slice(0, pronom.index))) return '';
  return t.replace(/\s*;\s*$/, '.');
}

/** Doublons (CCTP commun et CCTP d'un campus, ifsem, T7CS-4) : même phrase à la ponctuation près, presque mot pour mot, ou contenue dans une autre. */
function sansDoublons(phrases: string[], seuil: number): string[] {
  const coeur = (x: string) => normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim();
  const mots = (x: string) => new Set(coeur(x).split(' ').filter((w) => w.length > 2));
  const chiffres = (x: string) => [...new Set(coeur(x).match(/\d+/g) || [])].sort().join(' ');
  const proches = (a: string, b: string) => {
    const ca = coeur(a), cb = coeur(b);
    if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
    const ma = mots(a), mb = mots(b);
    const communs = [...ma].filter((w) => mb.has(w)).length;
    // Mots presque tous communs mais heures ou chiffres différents (« de 9h20 à 17h40 » / « de 9h20 à 18h10 ») : deux horaires.
    if (chiffres(a) !== chiffres(b)) return false;
    if (communs / Math.max(1, ma.size, mb.size) >= 0.9) return true;
    // Même obligation réécrite (citedia : « sous un délai de 3 minutes maximum » / « dans un délai maximal de 3 minutes ») :
    // mêmes chiffres et la plupart des mots de la plus courte.
    return seuil < 0.9 && chiffres(a) === chiffres(b) && communs / Math.max(1, Math.min(ma.size, mb.size)) >= seuil;
  };
  const out: string[] = [];
  for (const h of phrases) {
    const k = out.findIndex((x) => proches(x, h));
    if (k < 0) out.push(h);
    else if (coeur(h) !== coeur(out[k]) && coeur(h).includes(coeur(out[k]))) out[k] = h;   // la phrase qui contient l'autre
  }
  return out;
}

/** Heure de la journée (« 9h20 », « à 7h », « de 20h à 7h », « 24h / 24h ») : un délai (« dans les 3 minutes », « minimum 4h ») n'est pas un horaire. */
const HEURE_DU_JOUR = /\b\d{1,2}\s*h\s*\d{2}\b|(?<![\p{L}])(?:à|a|de|dès|des|entre|et|jusqu['’]à|avant|après|vers|partir de)\s+\d{1,2}\s*h\b|\b\d{1,2}\s*h\s*(?:\/|à|-|–)\s*\d{1,2}\s*h\b/iu;

/**
 * Horaires du DCE lisibles pour le texte de secours du bloc 1 (T6N-5, cstb 551, T8CS-1, T8-COH-1) : sans le repère
 * « [section] » de horairesImposes (prévu pour le contrôle des contradictions), et seulement des phrases entières
 * (majuscule initiale, ponctuation finale), jamais un fragment de tableau, une phrase coupée ou collée à un titre, une
 * phrase qui renvoie à la précédente, ni une ligne sans heure de la journée (délai, durée minimale). Deux horaires qui
 * ne diffèrent que par leurs heures (période de l'année absente : « de 9h20 à 18h10 » puis « de 9h20 à 17h40 ») ne sont
 * pas imprimés : ils sembleraient se contredire.
 */
/** Sujet de service du titulaire dans un horaire (agent, poste, SSIAP, chef d'équipe, présence, surveillance, rondes…). */
const SERVICE_HORAIRE = /(?<![\p{L}])(?:agents?|ssiap\s*\d?|chefs?\s+d['’]\s*[ée]quipe|gardiens?|veilleurs?|rondiers?|ma[îi]tres?[- ]chiens?|postes?|vacations?|pr[ée]sence|surveillance|gardiennage|rondes?|t[ée]l[ée]surveillance|titulaire|prestataire)(?![\p{L}])/iu;
/** Horaires d'ouverture au public d'un lieu (« Bureau … ouvert », « Parc ouvert », « Accueil ouvert »). */
const OUVERTURE_PUBLIC = /(?<![\p{L}])(?:bureaux?|parcs?|parkings?|accueils?|guichets?|boutiques?|magasins?|caisses?|halls?)(?![\p{L}])[^.;]{0,60}?(?<![\p{L}])(?:ouverte?s?|ferm[ée]e?s?)(?![\p{L}])/iu;

export function horairesLisibles(horaires: string[]): string[] {
  // Le repère « [section] » est retiré sans être écrit devant l'horaire : le titre de partie qui précède une phrase n'est pas
  // toujours son site (ign l. 194 : phrase générale rangée sous « Bâtiment Coriolis : »). Seule exception : un horaire qui
  // n'est qu'un libellé « Horaires : … », imprimé avec son bâtiment ou son site (« Bâtiment Coriolis : Horaires : du lundi au
  // vendredi de 7h00 à 19h00. »), sinon pas du tout (horaires de quoi ?).
  const lisibles = horaires.map((brut) => {
    const section = (/^\s*\[([^\]]*)\]/.exec(String(brut || '')) || [])[1]?.trim() || '';
    let h = citationImprimable(brut, /[.!?;]$/);
    // Puce de liste sans ponctuation finale (T5N-11, citedia : « La mise en place d'un 1er SSIAP1 … dédié de 21h à 9h … ») : une
    // proposition complète avec un sujet de service et une plage horaire, citée avec un point final.
    if (!h) {
      const sans = String(brut || '').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
      if (!/[.!?;:]$/.test(sans) && SERVICE_HORAIRE.test(sans) && /\d{1,2}\s*h\s*\d{0,2}\s*(?:à|-|–)\s*\d{1,2}\s*h/i.test(sans)) h = citationImprimable(`${sans}.`, /[.!?;]$/);
    }
    // Horaires d'ouverture au public d'un bureau, d'un parc, d'un accueil ou d'un guichet, sans service du titulaire (« Bureau du
    // Parc Lices ouvert : Les Lundis de 09h00 à 00h00 ») : jamais des horaires imposés à GSS (T5N-11).
    if (h && OUVERTURE_PUBLIC.test(h) && !SERVICE_HORAIRE.test(h)) h = '';
    if (h && /^Horaires?\s*:/i.test(h)) h = /^(?:b[âa]timent|campus|site|parc|parking|antenne|tribunal|palais|poste)\b/i.test(section) && !/\d/.test(section) ? `${section} : ${h}` : '';
    return h;
  }).filter((h) => {
    if (!h) return false;
    if (HEURE_DU_JOUR.test(h)) return true;
    // « 24h/24 » : présence continue, sauf dans une phrase de délai (« basé 24h/24 … dans les 3 minutes », citedia).
    return /\b24\s*h\s*\/\s*24/i.test(h) && /couvert|ouvert|assur|pr[ée]sence|permanence|gardiennage|surveillance|tenu/i.test(h)
      && !/\bdans\s+(?:les|un\s+d[ée]lai)|\bsous\s+(?:un\s+d[ée]lai|\d)|\bd[ée]lai\b/i.test(h);
  });
  const uniques = sansDoublons(lisibles, 0.9);
  // Deux horaires qui ne diffèrent que par leurs heures se contredisent en apparence (deux sites, deux périodes de l'année
  // dont la période n'a pas été lue) : aucun des deux n'est imprimé. Seule la même période écrite en tête des deux (« Du
  // 1er avril au 30 septembre : Prévoir deux agents … de 9h20 à 17h40. » puis « … de 9h20 à 18h10. ») les distingue :
  // ce sont alors deux postes de la même période, cités tels que le CCTP les écrit.
  const sansHeures = (x: string) => normaliser(x).replace(/\d{1,2}\s*h\s*\d{0,2}/g, 'H').replace(/[^a-z0-9]+/g, ' ').trim();
  return uniques.filter((h) => !uniques.some((x) => x !== h && sansHeures(x) === sansHeures(h) && !(periodeEnTete(h) && periodeEnTete(h) === periodeEnTete(x))));
}

/**
 * Obligations chiffrées du CCTP imprimées dans le texte de secours du bloc 1 (T8CS-1, T8-COH-1) : mêmes contrôles que
 * les horaires, plus une phrase entière avec un verbe conjugué (« Une fois par mois de nuit », « Prendre connaissance
 * … ; » refusés), sans renvoi à ce qui précède (« A partir de ces consignes », « aura alors »), dont GSS est bien
 * l'acteur (jamais une obligation de l'acheteur ou des deux parties : « Si le Pouvoir Adjudicateur souhaite… », « …
 * le retourner au Titulaire »), sans doublon. Citées mot pour mot : le texte de secours les écrit entre guillemets.
 */
export function obligationsLisibles(obligations: string[]): string[] {
  const ACHETEUR = /^(?:(?:si|lorsque|quand|d[èe]s\s+que|dans\s+le\s+cas\s+o[ùu]|en\s+cas\s+de\s+d[ée]saccord\s+avec)\s+)?(?:le\s+pouvoir\s+adjudicateur|l['’]acheteur|l['’]administration|la\s+personne\s+(?:publique|responsable|charg[ée]e)|le\s+ma[îi]tre\s+d['’]ouvrage|la\s+ville|la\s+collectivit[ée]|le\s+repr[ée]sentant\s+du\s+pouvoir)(?![\p{L}])|(?<![\p{L}])(?:les\s+deux\s+parties|d['’]un\s+commun\s+accord)(?![\p{L}])/iu;
  const lisibles = obligations.map((o) => citationImprimable(o, /[.!?;]$/)).filter((o) => {
    if (!o) return false;
    if (!VERBE_CITATION.test(o.replace(/\([^()]*\)/g, ' '))) return false;
    if (ACHETEUR.test(o)) return false;
    // Clause réputée acquise (« La commande est réputée acceptée par le Titulaire… », imm) : une règle du contrat, pas un engagement.
    if (/(?<![\p{L}])r[ée]put[ée]e?s?(?![\p{L}])/iu.test(o)) return false;
    // GSS seulement destinataire (« … devra l'annoter et le retourner au Titulaire ») : l'obligation est celle de l'acheteur.
    if (/(?<![\p{L}])(?:au|aux)\s+titulaires?(?![\p{L}])/iu.test(o) && !/(?<![\p{L}])(?:le|les)\s+titulaires?(?![\p{L}])/iu.test(o)) return false;
    if (/(?<![\p{L}])alors(?![\p{L}])/iu.test(o)) return false;
    // Démonstratif dont le nom n'a pas été écrit plus tôt dans la phrase (« cette attestation », « ces demandes ») : renvoi
    // à une phrase du CCTP qui n'est pas citée.
    const n = normaliser(o);
    for (const m of n.matchAll(/(?<![a-z])(?:ce|cet|cette|ces)\s+(?!dernier|derniere|meme)([a-z]{3,})/g)) {
      if (!n.slice(0, m.index).includes(m[1].slice(0, Math.min(5, m[1].length)))) return false;
    }
    return true;
  });
  return sansDoublons(lisibles, 0.7);
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
      // Clause qui fixe une pénalité, quelle que soit la forme du montant (« 1/1000 par jour de retard », pourcentage, lettres,
      // « sans plafond »), ou clause administrative du CCAP (justificatifs d'assurance, mise en demeure) : jamais une attente
      // ni un point de vigilance (parc_expo, T5-CONS-3).
      && !(/p[ée]nalit/i.test(e.exigence) && (/\d|par jour|jour de retard|plafon|exon[ée]r/i.test(e.exigence) || MONTANT_PENALITE.test(e.exigence)))
      && !/(?:souscription|attestations?|justifi\w*)[^.]{0,120}\bassurances?\b|\bassurances?\b[^.]{0,80}(?:attestation|justifi|souscri|responsabilit[ée] civile)|mise en demeure|ordre de service|retenue de garantie|avance forfaitaire|r[ée]vision des prix/i.test(e.exigence)
      // Phrase qui dépend de la précédente (« Dans ce cas, … », « Ce CR devra… ») : incompréhensible seule.
      && !/^(?:dans ce cas|en ce cas|de m[êe]me|ce|cet|cette|ces|il|elle|ils|elles|celui|celle|ceux|ledit|ladite)\b/i.test(e.exigence)
      // Clause contractuelle ou de procédure (confidentialité, litige, forclusion…) : ni une attente ni un point de vigilance
      // de la prestation (cstb 551, T6N-5).
      && !CLAUSE_CONTRACTUELLE.test(e.exigence)
      // Formalité de l'offre (visite obligatoire, cadre de réponse à joindre, T6-CONS-12) : une question à GSS, jamais une attente
      // ni un point de vigilance de la prestation.
      && !FORMALITES_OFFRE.test(`${(e as any).sujet || ''} ${e.exigence}`)
      // Exigence rattachée au bloc de la compréhension lui-même : jamais un renvoi du bloc 1 vers lui-même (T6N-5).
      && !(e.rubrique && plan?.rubriques.find((x) => x.id === e.rubrique)?.mode === 'besoin'))
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
  // Guillemet fermant d'une citation gardée (caen 475 : « …avec « La planification », développée au bloc 4 » donnait
  // « …avec « La planification », citation ouverte, étape coupée en « Nous organisons la disponibilité »).
  t = t.replace(/[\s,;:(«"]+$/, '').trim();
  while (/»$/.test(t) && t.split('»').length > t.split('«').length) t = t.replace(/[\s»]+$/, '').replace(/[\s,;:(«"]+$/, '').trim();
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
  // Segments séparés par « ; » (périodes d'horaires, T1F-9) : le plus long début fait de segments ENTIERS qui tient ; jamais
  // une période coupée au milieu (« 8h30–18h45 en octobre » pour « … en octobre, mars et avril »).
  const segments = t.split(/\s*;\s*/);
  if (segments.length > 1) {
    let acc = '';
    for (const sg of segments) {
      const essai = acc ? `${acc} ; ${sg}` : sg;
      if (essai.length > max) break;
      acc = essai;
    }
    if (acc.length >= 25) return acc;
  }
  const phrase = t.split(/(?<=[.!?])\s+/)[0].replace(/[.;!?\s]+$/, '');
  if (phrase.length <= max && phrase.length >= 25 && !phrase.includes(';')) return phrase;
  const k = t.lastIndexOf(', ', max);
  if (k >= 30) {
    const f = t.slice(0, k).trim();
    const dernier = (f.split(' ').pop() || '').toLowerCase().replace(/['’]$/, '');
    // Jamais à l'intérieur d'une énumération « X, Y et Z » (« en octobre, mars et avril »).
    const reste = t.slice(k + 2).split(/\s*[;.]\s*/)[0];
    const enumeration = /^[^,]{1,40}?\s(?:et|ou)\s/i.test(reste) && !/\s(?:et|ou)\s/i.test(f.split(/[;,]/).pop() || '') && !/[A-ZÀ-Ý]/.test(reste.charAt(0));
    // Incise ouverte après un verbe sans son complément (becquerel 1401, T4N-1 : « Le CCTP exige, pour le personnel affecté aux
    // prestations incendie » sans « SSIAP 1 et SSIAP 2… ») : jamais un texte de carte.
    const inciseOuverte = /\b(?:exige|exigent|impose|imposent|demande|demandent|pr[ée]voit|pr[ée]voient|requiert|attend|fixe|fixent|confie|confient|pr[ée]cise|indique|pr[ée]cisent|indiquent)\s*,\s*[^,]*$/i.test(f);
    if (!MOTS_OUTILS.has(dernier) && !enumeration && !f.includes(';') && !inciseOuverte) return f;
  }
  return '';
}

/**
 * Typographie du texte d'un schéma (T1-CONS-8) : délai du CCTP écrit en lettres et en chiffres remis en chiffres (« dans les
 * UNE (1) heure » → « dans l'heure », « DEUX (2) heures » → « 2 heures ») ; espace insécable avant « ; », « : », « ? » et
 * « ! » (le moteur ne commence jamais une ligne par un point-virgule).
 */
export function typoSchema(t: string): string {
  return String(t || '')
    .replace(new RegExp(`(?<![\\p{L}])(?:${RX_NOMBRE_LETTRES_V2})\\s*\\(\\s*(\\d{1,3})\\s*\\)\\s*(?=(?:heures?|minutes?|jours?|semaines?|mois|ans?)(?![\\p{L}]))`, 'giu'), '$1 ')
    .replace(/\bles\s+1\s+heure\b/gi, "l'heure")
    .replace(/(\S)[ \t]+([;:?!])/g, '$1\u00a0$2');
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
  // Défauts de fond (« étape 5 : … ») et anomalies de forme (« étape 5 « Titre » : … », caen 475).
  const derniere = (d: string) => /la dernière étape doit dire le résultat/.test(d) || d.startsWith(`étape ${etapes.length} :`) || d.startsWith(`étape ${etapes.length} «`);
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
    // Titre qui a l'acheteur pour sujet (becquerel 1401, T4N-1 : « Le CCTP confie les rondes ») : une phrase, jamais un titre.
    else if (/^(?:le|la|les|l['’])\s?(?:cctp|ccap|dce|cahier des charges|r[èe]glement|acheteur|client|march[ée])\s+[a-zà-ÿ]{3,}(?:e|ent|t)\b/i.test(ti0)) out.push(`${n0} : le titre est une phrase, pas un titre nominal`);
    // Texte coupé dans une incise ouverte après un verbe (« Le CCTP exige, pour le personnel affecté aux prestations incendie »).
    if (/\b(?:exige|exigent|impose|imposent|demande|demandent|pr[ée]voit|pr[ée]voient|requiert|attend|fixe|fixent|confie|confient|pr[ée]cise|indique)\s*,\s*[^,]*$/i.test(tx0)) out.push(`${n0} : texte coupé dans une incise (« ${tx0.slice(-40)} »)`);
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
    // Texte qui commence par le titre, article compris (becquerel 591, T5N-8 : « Continuité des deux postes » / « La continuité
    // des deux postes : … »), dernière étape comprise.
    const sansArticle = (x: string) => norm(x).replace(/^(?:le|la|les|l|un|une|des|du)\s+/, '');
    if (ti.length >= 4 && (norm(t).startsWith(ti) || sansArticle(t).startsWith(sansArticle(String(e?.titre || ''))))) out.push(`${n} : le texte redit le titre`);
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
const COUPE_TITRE = /^(?:à|au|aux|dans|sur|pour|avec|par|en|sous|après|avant|entre|hors|selon|suivant|lors|dès|depuis|vers|chez|et|ou|de|du|des|d['’]\S*|pendant|durant|afin|sans|y|chaque|tous|toutes|tout|toute|quotidiennement|[a-zà-ÿ]{3,}ant)$/i;

/**
 * Titre d'une exigence au sujet négatif (« Aucun poste ne doit être laissé vacant ») : le groupe nominal seul (« Aucun
 * poste ») dirait le contraire de l'exigence (génération réelle imm 701, carte « Aucun poste » du schéma du bloc 1) ; le
 * titre garde la négation (« Aucun poste laissé vacant »), sinon '' (pas de titre).
 */
export function titreNegatif(x: string, max = 34): string {
  const e = String(x || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:!]+$/g, '').trim();
  const m = /^(Aucune?|Nulle?)\s+(.+?)\s+(?:ne|n['’])\s*(?:(?:doit|doivent|devra|devront|peut|peuvent|pourra|pourront|sera|seront|est|sont|reste|restent)\s+)?(?:pas\s+|jamais\s+)?(?:(?:être|rester|demeurer)\s+)?(\S.*)$/i.exec(e);
  if (!m) return '';
  const t = `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim();
  return t.length <= max && !/[,;:«»"]/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Titre court (34 caractères au plus) d'une exigence du DCE, pour une étape du schéma du bloc 1 ou le libellé d'un point
 * de vigilance : le groupe nominal qui précède le premier verbe, arrêté avant une préposition, une coordination ou un
 * participe (« les rondes d'ouverture à 05H30 et de fermeture… encadrent… » → « Les rondes d'ouverture » ; « remplacement
 * sur site dans les UNE (1) heure… » → « Remplacement sur site »), jamais au milieu d'un groupe (« chef d'équipe ou
 * agent »). '' si aucun titre propre n'est possible.
 */
/** Complément de tête d'une exigence (temps, condition, demande) suivi de l'action : « Pendant toute absence du responsable, le
 *  remplacer… », « Lors de la ronde de fermeture, vérifier… », « Sur demande écrite de la Direction…, réaliser… ». */
const COMPLEMENT_TETE = /^(pendant|durant|lors\s+d(?:e\s+la|e\s+l['’]|es|u|e)|en\s+cas\s+d(?:e\s+la|e\s+l['’]|es|u|e|['’])|sur\s+(?:simple\s+)?demande|[àa]\s+la\s+demande|avant|apr[èe]s|d[èe]s|au\s+cours\s+d(?:e\s+la|e\s+l['’]|es|u|e)|en\s+dehors\s+d(?:e\s+la|e\s+l['’]|es|u|e)|chaque\s+fois\s+que|lorsqu['’]?|quand|si)\s*([^,]{3,90}),\s*(.+)$/i;
/** Acteur générique en sujet (« Le titulaire transmet… », « Chaque agent doit être… », « Les agents en charge de … devront… ») :
 *  le titre se tire de ce que l'acteur doit faire ou avoir, jamais de l'acteur. */
const ACTEUR_SUJET = /^(?:(?:le|la|les|l['’]|chaque|tout|tous|toute|toutes|ces|ce|cet|un|une|des)\s*)?(?:titulaire|prestataire|candidat|soumissionnaire|attributaire|agents?|personnels?|intervenants?|rondiers?|collaborateurs?|soci[ée]t[ée]|entreprise|[ée]quipes?|salari[ée]s?|gardiens?|op[ée]rateurs?|responsables?)\b/i;
/** Verbes faibles suivis d'un objet générique (« se conformer aux dispositions de … quant à la reprise du personnel ») : le
 *  titre est le sujet de ces dispositions. */
const OBJET_GENERIQUE = /^(?:se\s+conformer|respecter|appliquer|veiller|garantir|assurer|observer|suivre|tenir\s+compte)\b[^.]*?\b(?:dispositions?|r[èe]gles?|obligations?|exigences?|prescriptions?|consignes?|stipulations?)\b[^.]*?\b(?:quant\s+[àa]|relatives?\s+[àa]|concernant|en\s+mati[èe]re\s+de|portant\s+sur|li[ée]e?s?\s+[àa])\s+(.+)$/i;
// Déterminant entier, suivi d'une espace ou élidé (T5-CONS-2 : jamais « le » retiré de « leur » : « Ur prise de fonctions »).
const DETERMINANTS_TETE = /^(?:(?:toute?s?|tous|chaque|une?|des|les?|la|du|de\s+la|ses?|sa|leurs?|son|ces?|cette|cet)\s+|(?:l|de\s+l)['’]\s*)+/i;

/** Groupe nominal en titre : déterminants de tête retirés, majuscule, coupé à la limite sur un mot plein. */
function titreNominal(gn: string, max: number): string {
  const t = String(gn || '').replace(DETERMINANTS_TETE, '').replace(/^[«"“\s]+|[»"”\s.;:,]+$/g, '').trim();
  if (!t) return '';
  if (t.length <= max) return t.charAt(0).toUpperCase() + t.slice(1);
  return titreExigenceBrut(t, max);
}

/** Durée d'une exigence (« deux (2) heures », « 15 jours », « 30 minutes ») : texte de la durée en chiffres, '' sinon. */
function dureeDe(x: string): string {
  const NB: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, huit: 8, dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40, soixante: 60 };
  const m = /(?<![\p{L}\d])(?:(\d{1,3})|(une?|deux|trois|quatre|cinq|six|huit|dix|quinze|vingt|trente|quarante|soixante))\s*(?:\(\s*(\d{1,3})\s*\)\s*)?(minutes?|heures?|jours?(?:\s+ouvr[ée]s|\s+ouvrables|\s+calendaires)?|semaines?|mois)(?![\p{L}])/iu.exec(String(x || ''));
  if (!m) return '';
  const n = Number(m[1] || m[3] || NB[(m[2] || '').toLowerCase()] || 0);
  if (!n) return '';
  const u = m[4].toLowerCase();
  return `${n} ${n > 1 ? u.replace(/^(minute|heure|jour|semaine)(?!s)/, '$1s') : u.replace(/^(minute|heure|jour|semaine)s/, '$1')}`;
}

/**
 * Titre d'une exigence du bloc 1 (libellé EXIGENCE, carte de schéma), sur les tournures du CCTP que le groupe nominal de tête
 * ne résume pas (T4-COH-3, ign) :
 *  - citation abrégée (« […] son remplaçant… ») : sans les « […] » ;
 *  - incise après un complément de tête (« En cas d'absence imprévue…, quels que soit son niveau de qualification et son poste,
 *    constatée le jour même…, son remplaçant devra… ») : la proposition principale, jamais l'incise ;
 *  - « <sujet> devra être <attribut> … dans les deux (2) heures » → « Remplaçant présent sous 2 heures » ;
 *  - « disposer d'un délai de N … pour faire X » → « Faire X en N … » ;
 *  - « mettre en place un plan d'action sous 15 jours » → « Plan d'action sous 15 jours » ;
 *  - « Les agents ne doivent en aucun cas quitter leur poste… » → « Ne jamais quitter leur poste… ».
 * Jamais un titre qui commence par une préposition, un verbe conjugué ou « Quel(s) que » ; la valeur chiffrée garde son unité.
 */
export function titreExigence(x: string, max = 34): string {
  const INCISE = /^(?:(?:quel(?:le)?s?\s+que\s+(?:soit|soient)|constat[ée]e?s?|y\s+compris|notamment|le\s+cas\s+[ée]ch[ée]ant|quelle\s+qu['’]en\s+soit)[^,]*,\s*)+/i;
  let e = String(x || '').replace(/\*\*/g, '').replace(/\s*\[…\]\s*/g, ' ').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:]+$/g, '').trim();
  // Complément de tête qui ne porte pas l'exigence (T5-CONS-2 : « Pour les SSIAP, maintenir à jour le recyclage… », « Selon le
  // CCAP, justifier… », « Conformément à l'article 5, … ») : la proposition principale.
  { const r = /^(?:pour|concernant|s['’]agissant\s+d(?:e\s+la|e\s+l['’]|es|u|e)|selon|conform[ée]ment\s+(?:[àa]\s+la|[àa]\s+l['’]|aux?|[àa])|au\s+titre\s+d(?:e\s+la|e\s+l['’]|es|u|e)|en\s+application\s+d(?:e\s+la|e\s+l['’]|es|u|e)|comme\s+pr[ée]vu\s+(?:au|par|dans))\s+[^,]{2,90},\s*(.+)$/i.exec(e); if (r && r[1].length >= 12) e = r[1]; }
  // Citation qui commence par une locution de délai ou de quantité (T6N-1 : « au plus tard 4 jours ouvrés avant leur prise
  // d'effet », « a minima 5 jours ouvrés », « au moins 10 jours avant le début du mois », « dans un délai maximum de 30
  // minutes ») : la locution est gardée entière, jamais amputée de son premier mot (« Plus tard… », « Minima… », « Moins
  // 10 jours… », au sens inversé) ; trop longue, elle perd ses derniers compléments entiers (jamais « avant leur prise »).
  const locution = titreLocution(e, max);
  if (locution) return locution;
  const ct = COMPLEMENT_TETE.exec(e);
  if (ct && INCISE.test(ct[3])) e = `${ct[1]} ${ct[2]}, ${ct[3].replace(INCISE, '')}`;
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const ok = (t: string) => !!t && t.length <= max && !MAUVAIS_TITRE.test(t);
  const duree = dureeDe(e);
  // Proposition principale (après un complément de tête) : c'est elle qui porte l'exigence.
  const principale = ct ? e.replace(COMPLEMENT_TETE, '$3') : e;
  // « <sujet> devra être présent(e) … dans les deux (2) heures » → « Remplaçant présent sous 2 heures ».
  const attribut = /^(?:(?:le|la|les|l['’]|son|sa|ses|leur|leurs|tout|toute|chaque|un|une)\s*)?([a-zà-ÿ'’-]{3,}(?:\s+[a-zà-ÿ'’-]{3,})?)\s+(?:doit|doivent|devra|devront)\s+[êe]tre\s+([a-zà-ÿ]+(?:é|ée|és|ées|ent|ente|ents|entes|t|te|ts|tes|s|e)?)\b/i.exec(principale);
  if (attribut && duree) {
    const t = cap(`${attribut[1]} ${attribut[2]} sous ${duree}`);
    if (ok(t)) return t;
  }
  // « disposer d'un délai de N … pour faire X » → « Faire X en N … ».
  const delai = /\bdispose(?:nt|ra|ront)?\s+d['’]un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+[^.]*?\b(?:pour|afin\s+de)\s+([^,.;]+)/i.exec(principale);
  if (delai && duree) {
    const action = delai[1].replace(/\s+(?:sur|dans|au|aux|à)\s+(?:le|la|les|l['’])?\s*(?:site|sites|lieux?)\b.*$/i, '').trim();
    for (const a of [action, titreExigenceBrut(action, max - duree.length - 4)]) { const t = a ? cap(`${a} en ${duree}`) : ''; if (ok(t)) return t; }
  }
  // « mettre en place / en œuvre <objet> sous N … » → « <Objet> sous N … ».
  const place = /\bmet(?:tent|tra|tront)?\s+en\s+(?:place|œuvre|oeuvre)\s+(?:(?:un|une|des|le|la|les|l['’])\s*)?([^,.;]+?)\s+(?:sous|dans|en)\s+/i.exec(principale);
  if (place && duree) { const t = cap(`${place[1]} sous ${duree}`); if (ok(t)) return t; }
  // Négation du sujet générique (« Les agents ne doivent en aucun cas quitter leur poste sans être relevés »).
  const neg = /^(?:(?:le|la|les|l['’]|chaque|tout|tous|toute|toutes)\s*)?(?:titulaire|prestataire|agents?|personnels?|intervenants?|salari[ée]s?)\s+(?:ne|n['’])\s*(?:doit|doivent|devra|devront|peut|peuvent|pourra|pourront)\s+(?:en\s+aucun\s+cas|jamais|pas|sous\s+aucun\s+pr[ée]texte)\s+(.+)$/i.exec(e);
  if (neg) {
    for (const s of [neg[1], neg[1].replace(/\s+(?:sans|hors|sauf)\b.*$/i, '')]) { const t = cap(`ne jamais ${s}`); if (ok(t)) return t; }
  }
  const t = titreExigenceBase(e, max);
  if (!MAUVAIS_TITRE.test(t)) return t;
  // Titre qui commence par une préposition, un verbe conjugué ou une incise : le titre de la proposition principale, sinon
  // le complément de tête, sinon aucun titre (une carte sans titre n'est pas prise ; le libellé du tableau garde son secours).
  for (const alt of [principale !== e ? titreExigenceBase(principale, max) : '', ct ? titreNominal(ct[2], max) : '', max >= 40 ? titreSecours(principale, max) : '']) if (alt && !MAUVAIS_TITRE.test(alt)) return alt;
  // Libellé d'un tableau (40 signes et plus) : jamais une case vide (T5-CONS-2) ; les premiers mots porteurs, sans la
  // préposition ni le verbe conjugué de tête.
  if (max >= 40) {
    const nu = principale.replace(/^(?:(?:d['’]|de|du|des|à|au|aux|par|pour|sur|sous|avec|sans|dans)\s+|(?:est|sont|doit|doivent|devra|devront|peut|peuvent|a|ont|sera|seront)\s+)+/i, '');
    const s2 = titreSecours(nu, max);
    if (s2 && !MAUVAIS_TITRE.test(s2)) return s2;
  }
  return '';
}

const RX_LOCUTION = /^(en\s+moins\s+de|au\s+plus\s+tard|au\s+plus\s+t[ôo]t|au\s+moins|au\s+minimum|au\s+maximum|[aà]\s+minima|dans\s+un\s+d[ée]lai(?:\s+(?:moyen|maximum|maximal|minimum|minimal))?\s+(?:de|d['’])|dans\s+les?|sous|d[èe]s)\s*(?=\(?\d|(?:une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente|quarante|soixante)(?![\p{L}]))/iu;
function titreLocution(e: string, max: number): string {
  const m = RX_LOCUTION.exec(e);
  if (!m) return '';
  let t = e.replace(/^[aà]\s+minima/i, 'a minima').replace(/\s*\(\s*(?:\d+|[a-zà-ÿ-]+)\s*\)/gi, '').replace(/[\s.;:,]+$/, '');
  // « avant le début de la prestation » → « avant la prestation » (le complément garde son objet).
  if (t.length > max) t = t.replace(/(\s(?:avant|apr[èe]s|d[èe]s)\s+)(?:le\s+)?(?:d[ée]but|d[ée]marrage|commencement)\s+(?:(de\s+la|de\s+l['’]|du|des)\s*)/i, (_x, a: string, de: string) => `${a}${({ 'de la': 'la ', "de l'": "l'", 'de l’': 'l’', du: 'le ', des: 'les ' } as Record<string, string>)[de.toLowerCase().replace(/\s+/g, ' ')] || ''}`);
  const debut = m[0].length;
  const PREP = /\s(?:avant|apr[èe]s|de|du|des|d['’]|pour|sur|dans|[àa]|au|aux|par|entre|en|lors|suivant|[àa]\s+compter)\s/gi;
  while (t.length > max) {
    const coupes = [...t.matchAll(PREP)].map((x) => x.index!).filter((i) => i > debut + 3);
    if (!coupes.length) return '';
    t = t.slice(0, coupes[coupes.length - 1]).replace(/[\s,;:]+$/, '');
  }
  // Jamais un nombre séparé de son unité ni un mot-outil en fin de libellé.
  if (/(?:\d|une?|deux|trois|quatre|cinq|six|dix|quinze|vingt|trente)$/i.test(t) || MOTS_OUTILS.has(t.split(' ').pop()!.toLowerCase())) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Libellé EXIGENCE d'une puce du bloc 1 (T6-CONS-12, planche Marine v3 feuille 28 : « Continuité de service », « Qualifications
 * à jour ») : un groupe nominal court, jamais la phrase « besoin » du modèle (« L'intervention doit pouvoir être déclenchée
 * après une alarme… », « Ce bilan doit couvrir… »). Dans l'ordre : la phrase « besoin » si elle est déjà un groupe nominal
 * court ; la citation qui n'est qu'un délai (« en moins de 30 (trente) minutes ») jointe au sujet du besoin (« Intervention
 * en moins de 30 minutes ») ; le groupe nominal de la citation, sans article ni démonstratif, sans sujet « le titulaire
 * fournira » ni participe qui attend son complément (« Système d'astreinte », « Bilan concernant l'éco-mobilité ») ; sinon le
 * sujet du besoin.
 */
export function libelleExigenceBloc1(besoin: string, citation: string, max = MAX_LIBELLE_EXIGENCE): string {
  const VERBE = /(?<![\p{L}])(?:est|sont|sera|seront|doit|doivent|devra|devront|peut|peuvent|pourra|a|ont|fait|font|fournira|fournit|assure|assurent|organise|organisent|permet|permettent|couvre|couvrent|pr[ée]voit|pr[ée]voient)(?![\p{L}])/iu;
  const DET = /^(?:(?:l['’]ensemble|la\s+totalit[ée]|l['’]int[ée]gralit[ée])\s+(?:du|de\s+la|de\s+l['’]|des)\s*|(?:le|la|les|l['’]|un|une|des|du|ce|cet|cette|ces|son|sa|ses|leur|leurs|notre|nos|votre|vos)\s*(?<=['’]|\s))/i;
  const nominal = (t: string) => {
    let x = String(t || '').replace(/\s*\(\s*(?:\d+|[a-zà-ÿ-]+)\s*\)/gi, '').replace(/\s+/g, ' ').trim();
    for (let k = 0; k < 2; k++) x = x.replace(DET, '');
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
  };
  const b = String(besoin || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/[\s.;:]+$/, '').trim();
  const c = String(citation || '').replace(/\*\*/g, '').replace(/\s*\[…\]\s*/g, ' ').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:]+$/g, '').trim();
  // Besoin sans verbe d'état ou d'obligation ni démonstratif en tête (« Prévoir une astreinte pour le remplacement d'un absent »,
  // « Continuité de service ») : gardé tel quel, comme validé.
  if (b && !VERBE.test(b) && !/^(?:ce|cet|cette|ces|il|elle|ils|elles|nous|notre|nos)\b/i.test(b)) return b;
  const sujet = (() => {
    const m = /^(.{3,45}?)\s+(?:ne\s+|n['’])?(?:est|sont|sera|seront|doit|doivent|devra|devront|peut|peuvent|pourra|varie|varient|comprend|comprennent|couvre|couvrent)\b/i.exec(b);
    const x = m ? nominal(m[1]) : '';
    return x && !VERBE.test(x) && x.split(' ').length <= 5 ? x : '';
  })();
  // Citation réduite à un délai (« en moins de 30 (trente) minutes », « dans un délai de 2 heures ») : le sujet du besoin + le délai.
  const delai = /^(?:en\s+moins\s+de|dans\s+un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de|sous|dans\s+les?|en|au\s+plus\s+tard\s+(?:dans|en)?)\s*(.+)$/i.exec(c);
  const duree = dureeDe(c.replace(/\s*\(\s*[a-zà-ÿ-]+\s*\)/gi, ''));
  if (delai && duree && c.split(' ').length <= 8 && sujet) {
    const t = `${sujet} ${/moins/i.test(c) ? 'en moins de' : 'en'} ${duree}`;
    if (t.length <= max) return t;
  }
  // Groupe nominal de la citation, sans le sujet acteur ni son verbe (« le titulaire fournira chaque année un bilan … »).
  const sansActeur = c.replace(ACTEUR_SUJET, '').replace(/^\s*(?:ne\s+)?(?:\S+(?:ra|ront|e|ent|it|ssent))\s+(?:(?:chaque|tous\s+les|toutes\s+les)\s+\S+\s+)?/i, (m) => (ACTEUR_SUJET.test(c) ? '' : m));
  const base = nominal(ACTEUR_SUJET.test(c) ? sansActeur : c);
  let tc = titreExigence(base, max);
  tc = nominal(tc.replace(/\s+(?:permettant|pour|afin|visant|destin[ée]e?s?|charg[ée]e?s?)(?:\s.*)?$/i, ''));
  if (tc && !VERBE.test(tc) && !/\s(?:de|du|des|d['’]|à|au|aux|en|par|pour|sur|dans|et|ou)$/i.test(tc) && tc.split(' ').length >= 2) return tc;
  if (sujet) return sujet;
  return nominal(titreExigence(b || c, max));
}

/** Titre refusé : commence par une préposition, un verbe conjugué ou « Quel(s) que » (« D'un délai de 2 heures », « Doivent
 *  en aucun cas quitter leur poste », « Quels que soit son niveau de qualification », « Connaissances s'avèrent insuffisantes »). */
const MAUVAIS_TITRE = /^(?:d['’]|de\s|du\s|des\s|à\s|au\s|aux\s|par\s|pour\s|sur\s|sous\s|avec\s|sans\s|dans\s|quel(?:le)?s?\s+que\b)|^(?:est|sont|doit|doivent|devra|devront|peut|peuvent|a|ont|sera|seront)\b|^\S+\s+s['’]av[èe]r(?:ent|e|era|eront)\s/i;

function titreExigenceBase(x: string, max = 34): string {
  // « dans un délai maximal de 30 minutes » → « en 30 minutes » : la valeur reste dans le titre (« Présent sur site en 30
  // minutes », jamais « … dans un délai maximal de 30 » coupé avant son unité).
  const e = String(x || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:]+$/g, '').trim()
    .replace(/(?<=\S\s)dans\s+un\s+d[ée]lai\s+(?:moyen\s+)?(?:maxim(?:al|um)\s+)?(?:de\s+|d['’]\s*)(?=(?:\(?\d|une?\b|deux|trois|quatre|cinq|six|dix|quinze|vingt|trente|quarante|soixante))/i, 'en ');
  if (!e) return '';
  // 1. Complément de tête (T3N-5, T3-COH-7 : « Pendant toute absence », « Lors de la ronde de fermeture ») : l'action qui suit
  //    (« Réaliser une ronde supplémentaire ») ; si elle reprend le complément par un pronom (« le remplacer », « assurer son
  //    remplacement »), le complément sans sa préposition (« Absence du responsable », « Ronde de fermeture »).
  const ct = COMPLEMENT_TETE.exec(e);
  if (ct) {
    const action = ct[3].trim();
    // (jamais un sujet : « les agents doivent effectuer… » n'est pas une reprise du complément, T5-CONS-2)
    const reprise = !ACTEUR_SUJET.test(action) && (/^(?:le|la|les|l['’]|lui|leur|en|y)\s*\S/i.test(action) && !/^(?:le|la|les|l['’])\s*[a-zà-ÿ]+(?:ion|age|ment|ure|ance|ence|té|ée)s?\b/i.test(action) || /^\S+\s+(?:son|sa|ses|leur|leurs)\s/i.test(action));
    const t = reprise ? titreNominal(ct[2], max) : titreExigence(action, max);
    if (t) return t;
    return titreNominal(ct[2], max);
  }
  // 2. Objet générique (« se conformer aux dispositions de l'Accord du 5 mars 2002 … quant à la reprise du personnel »).
  const og = OBJET_GENERIQUE.exec(e);
  if (og) { const t = titreNominal(og[1].split(/[,;:]/)[0], max); if (t) return t; }
  if (/^(?:aucune?|nulle?)\s/i.test(e)) return titreNegatif(e, max) || titreNegatifCourt(e, max);
  // Verbe suivi d'une énumération (« garantir : sa réactivité ; la continuité du service ; … ») : le premier objet.
  const en = /^([a-zà-ÿ]+(?:er|ir|re))\s*:\s*(.+)$/i.exec(e);
  if (en) { const t = titreNominal(en[2].split(/\s*[;,]\s*/)[0], max); if (t) return t; }
  // 3. Acteur générique en sujet, suivi de son verbe : ce qu'il doit faire ou avoir (« Le titulaire transmet le planning
  //    mensuel… » → « Planning mensuel » ; « Chaque agent doit être titulaire de la carte professionnelle… » → « Carte
  //    professionnelle » ; « les agents en charge de la vigilance devront être titulaires du diplôme SSIAP 1 » → « Diplôme SSIAP 1 »).
  if (ACTEUR_SUJET.test(e)) {
    const mots = e.split(' ');
    const k = mots.findIndex((m, i) => i > 0 && (VERBE_TITRE.test(m) || /^(?:ne|n['’]\S*|transmet(?:tent)?|remet(?:tent)?|fournit|fournissent|tient|tiennent|effectue(?:nt)?|r[ée]alise(?:nt)?|v[ée]rifie(?:nt)?|veille(?:nt)?|informe(?:nt)?|signale(?:nt)?|pr[ée]vient|pr[ée]viennent|met(?:tent)?|organise(?:nt)?)$/i.test(m)));
    if (k > 0) {
      let suite = mots.slice(k + 1).join(' ').replace(/^(?:pas\s+|jamais\s+)?(?:(?:[êe]tre|avoir|rester|faire)\s+)?/i, '')
        .replace(/^(?:titulaires?|d[ée]tenteurs?|porteurs?|en\s+possession|munie?s?|[ée]quip[ée]e?s?|dot[ée]e?s?|tenue?s?|charg[ée]e?s?|capables?|en\s+mesure)\s+(?:de\s+la|de\s+l['’]|des|du|de|d['’])\s*/i, '');
      // Ce qu'il doit faire : l'infinitif et son objet (« doit transmettre le planning » → « Transmettre le planning »).
      if (/^(?:[àa]\s+)?[a-zà-ÿ]+(?:er|ir|re)\b/i.test(suite) && /^(?:doit|doivent|devra|devront|peut|peuvent|pourra|pourront)$/i.test(mots[k])) {
        const t = titreExigenceBrut(suite.replace(/^[àa]\s+/, ''), max);
        if (t) return t;
      }
      const objet = suite.split(/\s+(?:au\s+plus\s+tard|avant|apr[èe]s|d[èe]s|chaque|tous|toutes|dans\s+un|sous|entre|selon|afin|pour|par)\b|[,;:(]/i)[0].replace(/\s+(?:d[ée]livr[ée]e?s?|pr[ée]vue?s?|exig[ée]e?s?|vis[ée]e?s?|mentionn[ée]e?s?)$/i, '');
      const t = titreNominal(objet, max);
      if (t && t.split(/\s+/).filter((w) => w.replace(/^(?:l|d)['’]/i, '').length >= 3).length >= 1) return t;
    }
  }
  // Libellé d'un tableau (40 signes et plus) : jamais une case vide ; carte de schéma : pas de titre plutôt qu'un titre vague.
  return titreExigenceBrut(e, max) || (max >= 40 ? titreSecours(e, max) : '');
}

/** Longueur maximale du libellé EXIGENCE du tableau du bloc 1 (colonne étroite, 2 à 3 lignes). */
export const MAX_LIBELLE_EXIGENCE = 46;

/** Négation trop longue (« Aucun collaborateur CSTB ne doit rester sur le site après 19 h 30, sauf accord écrit ») : « Aucun »
 *  + le nom + l'horaire ou le lieu (« Aucun collaborateur après 19 h 30 »). '' sinon. */
function titreNegatifCourt(e: string, max: number): string {
  const m = /^(Aucune?|Nulle?)\s+(\S+)[^,]*?\s(?:ne|n['’])\s*\S*\s*(?:pas\s+)?(?:\S+\s+)?(.*?)(?:,|$)/i.exec(e);
  if (!m) return '';
  const heure = /(?:apr[èe]s|avant|entre|au-del[àa] de|pass[ée])\s+\d{1,2}\s*h(?:\s*\d{2})?(?:\s+et\s+\d{1,2}\s*h(?:\s*\d{2})?)?/i.exec(m[3]);
  for (const t of [heure ? `${m[1]} ${m[2]} ${heure[0]}` : '', `${m[1]} ${m[2]} ${m[3]}`.trim()]) if (t && t.length <= max) return t.charAt(0).toUpperCase() + t.slice(1);
  return '';
}

/** Dernier recours (jamais une case EXIGENCE vide) : les premiers mots porteurs de l'exigence, coupés sur un mot plein. */
function titreSecours(e: string, max: number): string {
  const sans = e.replace(ACTEUR_SUJET, '').replace(/^\s*(?:doit|doivent|devra|devront)\s+/i, '').trim() || e;
  const mots = sans.split(' ');
  let t = '';
  for (const w of mots) { if (`${t} ${w}`.trim().length > max) break; t = `${t} ${w}`.trim(); }
  while (t.includes(' ') && MOTS_OUTILS.has(t.split(' ').pop()!.toLowerCase().replace(/['’]$/, ''))) t = t.slice(0, t.lastIndexOf(' '));
  t = t.replace(/[,;:(]+$/, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function titreExigenceBrut(x: string, max = 34): string {
  let e = String(x || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”\s.;:]+$/g, '').trim();
  if (!e) return '';
  // Complément de fréquence (« … chaque jour d'ouverture du site ») : jamais dans le titre (« Réaliser une ronde d'ouverture »).
  { const j = e.split(' ').findIndex((w, i) => i >= 2 && /^(?:chaque|tous|toutes|quotidiennement)$/i.test(w)); if (j >= 2) e = e.split(' ').slice(0, j).join(' '); }
  if (/^(?:aucune?|nulle?)\s/i.test(e)) return titreNegatif(e, max);
  if (/^(?:il|elle|ils|elles|on|nous|vous|cela|ceci|celui-ci|celle-ci)\s/i.test(e)) return '';
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
    // Préposition ou conjonction en fin de libellé (T5N-12 : « Assurer l'égalité des usagers devant ») : jamais.
    if (/^(?:devant|derri[èe]re|contre|malgr[ée]|parmi|sauf|envers|outre|via|jusqu|quant|ni|mais|car|donc|comme|o[ùu]|apr[èe]s|avant|depuis|pendant|durant|hors|suivant|afin|d[èe]s|conform[ée]ment|notamment|relativement|pr[ée]alablement|ult[ée]rieurement|respectivement|[ée]ventuellement|[ée]galement|compte|conjointement|ensuite)$/i.test(dernier)) continue;
    // Nombre séparé de son unité (« … de 30 » pour « 30 minutes ») : jamais.
    if (/^\(?\d+(?:[,.]\d+)?\)?$|^(?:une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente|quarante|soixante)$/i.test(dernier) && /^(?:minutes?|heures?|h|jours?|semaines?|mois|ans?|m²|m2|km|agents?|personnes?|fois|rondes?)$/i.test(mots[i] || '')) continue;
    // Locution coupée (génération réelle caen 703 : « Assurer la continuité en cas » pour « … en cas de défaillance »).
    if (/(?:^|\s)(?:en\s+cas|lors|afin|faute|en\s+raison|en\s+vue|au\s+cours|au\s+moyen|en\s+matière|en\s+termes|à\s+compter|en\s+fonction|au\s+titre|à\s+partir|en\s+dehors|au\s+sein|à\s+l['’]issue|mise|mise\s+en|prise|prise\s+en|avant|après|dès|selon|pendant|en\s+pr[ée]sence|en\s+doublure|en\s+lien|en\s+liaison|en\s+relation)$/i.test(pre)) continue;
    // Coupe permise devant une préposition, une coordination ou un participe, ou quand le reste n'est qu'une suite
    // d'adjectifs (« interventions successives | habituelles ») ; jamais devant un complément (« … ou agent | N1 au PCS »).
    const reste = mots.slice(i);
    if (reste.length && !COUPE_TITRE.test(reste[0]) && reste.some((w) => COUPE_TITRE.test(w) || !/^[a-zà-ÿ-]+$/.test(w))) continue;
    if (mots.slice(0, i).filter(plein).length < 2) continue;
    // Verbe et nom coupé de son complément (T5N-12 : « Assurer l'intégralité » pour « … l'intégralité des prestations de
    // sécurité … ») : le groupe nominal objet (« Intégralité des prestations sécurité incendie »).
    if (mots.slice(0, i).filter(plein).length === 2 && /^[a-zà-ÿ]+(?:er|ir|re)$/i.test(mots[0]) && /^(?:de|des|du|d['’]\S*)$/i.test(mots[i] || '')) {
      const objet = titreNominal(mots.slice(1).join(' '), max);
      if (objet && objet.split(/\s+/).length >= 3) return objet;
      continue;
    }
    if ((pre.match(/«/g) || []).length !== (pre.match(/»/g) || []).length || (pre.match(/\(/g) || []).length !== (pre.match(/\)/g) || []).length) continue;
    // Nom générique coupé de son complément (« Ne pas appliquer les opérations » pour « … les opérations d'ouverture ») : le
    // premier complément est gardé, quitte à dépasser la limite de 12 signes (T3N-5).
    if (/^(?:op[ée]rations?|dispositions?|mesures?|r[èe]gles?|modalit[ée]s?|prestations?|missions?|actions?|conditions?|obligations?|proc[ée]dures?|consignes?)$/i.test(dernier) && /^(?:d['’]\S+|de|des|du)$/i.test(mots[i] || '')) {
      const avecComplement = mots.slice(0, /^d['’]/i.test(mots[i]) ? i + 1 : i + 2).join(' ').replace(/[,;:]+$/, '');
      if (avecComplement.length <= max) return avecComplement.charAt(0).toUpperCase() + avecComplement.slice(1);
      continue;
    }
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
/** Renvoi final à une rubrique qui redit un nom déjà dans la phrase (« …la planification des moyens avec la planification »,
 *  caen 475) : retiré. */
export function sansRenvoiRedondant(y: string): string {
  const t = String(y || '').trim();
  const m = /^(.*\S)\s+(?:avec|via|par|gr[âa]ce [àa])\s+(?:le|la|les|l['’]|notre|nos)\s*([^,;.]{3,80})[.]?$/i.exec(t);
  if (!m) return t;
  const plein = normaliser(m[2]).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).find((w) => w.length >= 4 && !MOTS_OUTILS.has(w));
  return plein && normaliser(m[1]).includes(plein) && m[1].split(/\s+/).length >= 4 ? m[1] : t;
}

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
  // Renvoi final à une rubrique (« …la disponibilité et la planification des moyens avec « La planification » », caen 475) :
  // retiré avant toute coupe, la phrase reste entière (jamais « Nous organisons la disponibilité »).
  const sansRenvoi = t.replace(/\s+(?:avec|via|par|gr[âa]ce [àa]|dans|selon)\s+«[^»]{3,120}»(?:\s*,?\s*(?:d[ée]velopp|d[ée]taill|d[ée]crit|trait|pr[ée]sent)[a-zéè]*\s+(?:au|aux|dans les?)\s+blocs?\s+\d+(?:\s*(?:,|et)\s*\d+)*)?$/i, '').trim();
  if (sansRenvoi !== t) {
    const e = texteEtapeEntier(sansRenvoi, max);
    if (e) return e;
  }
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
      const nom = titreExigence(exigence, MAX_LIBELLE_EXIGENCE);
      const debut = normaliser(exigence.slice(0, nom.length));
      // Libellé en tête de la phrase quand il en est le début ; sinon (« Absence du responsable » pour « Pendant toute
      // absence du responsable, le remplacer… », T3N-5) libellé en gras puis la phrase entière.
      corps = nom && debut === normaliser(nom)
        ? `**${nom}**${exigence.slice(nom.length)}${suite}`
        : nom ? `**${nom}** : ${exigence.charAt(0).toUpperCase()}${exigence.slice(1)}${suite}`
          : `${exigence.charAt(0).toUpperCase()}${exigence.slice(1)}${suite}`;
    }
    // Gras de tête gardé ; ensuite, un titre en gras devient un titre entre guillemets.
    const tete = (/^\*\*[^*]+\*\*/.exec(corps) || [''])[0];
    const reste = corps.slice(tete.length)
      .replace(/\*\*\s*«\s*([^»*]+?)\s*»\s*\*\*/g, '« $1 »')
      .replace(/\*\*([^*]+)\*\*/g, (m, x: string) => (/^[A-ZÀ-Ý]/.test(x.trim()) ? `« ${x.trim()} »` : x))
      // Titre de rubrique entre parenthèses à la place de la réponse (génération réelle caen 701 : « → notre réponse :
      // (« Le remplacement d'un agent absent : absence non prévue »), bloc 5 », « s'inscrit dans (« Les réunions… ») ») :
      // sans parenthèses, et le renvoi « , bloc n » écrit « (bloc n) ».
      .replace(/(notre réponse\s*:\s*|\b(?:dans|par|selon|sur|via|avec|et)\s+)\(\s*(«[^»()]+(?:\([^)]*\)[^»()]*)*»)\s*\)/g, '$1$2')
      .replace(/(»)\s*,\s*bloc\s+(\d)\b/g, '$1 (bloc $2)');
    return `${puce}${tete}${reste}`;
  }).join('\n');
}

/**
 * Paragraphe isolé en fin de partie du bloc 1 fait des seuls textes d'étapes d'un schéma de process refusé ou non retenu
 * (cstb 551, T5CP-9 : « Le CCTP prévoit 3 rondes de nuit… Les agents réalisent les rondes à pied… La main courante
 * enregistre… Le CSTB dispose de… », écrit par le modèle pour ses étapes, puis inutile) : retiré. Un paragraphe qui porte
 * les textes du schéma dessiné (source du contrôle du moteur) est gardé.
 */
export function retirerParagrapheEtapes(texte: string, candidates: Array<{ texte?: string }>, retenues: Array<{ texte?: string }> = []): { texte: string; retire: string } {
  const n = (x: string) => normaliser(String(x || '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const etapes = candidates.map((e) => n(e?.texte || '')).filter((x) => x.length >= 15);
  const gardees = new Set(retenues.map((e) => n(e?.texte || '')).filter(Boolean));
  if (!etapes.length) return { texte, retire: '' };
  const paras = String(texte || '').split(/\n{2,}/);
  let retire = '';
  const garder = paras.filter((p, i) => {
    const t = p.trim();
    if (retire || !t || /^(?:#|\||[-*•]\s|\d+[.)]\s)/.test(t)) return true;
    const suivant = (paras[i + 1] || '').trim();
    if (suivant && !/^#/.test(suivant)) return true;
    const phrases = t.split(/(?<=[.!?])\s+/).map(n).filter(Boolean);
    if (phrases.length < 2 || phrases.some((ph) => gardees.has(ph))) return true;
    const dEtapes = phrases.filter((ph) => etapes.includes(ph));
    // Toutes les phrases sont des textes d'étapes ; ou, sur 4 phrases et plus, les trois quarts au moins, les autres ne
    // portant aucune donnée absente du reste du bloc (chiffre, nom propre) : caen 475, T6C-7 (« Les rondes d'ouverture et de
    // fermeture assurent les passages prévus à Caen. » suivie de trois textes d'étapes, redites de la page).
    if (dEtapes.length < phrases.length) {
      if (phrases.length < 4 || dEtapes.length / phrases.length < 0.75) return true;
      const reste = n(paras.filter((_, k) => k !== i).join(' '));
      const brutes = t.split(/(?<=[.!?])\s+/).filter((ph) => !etapes.includes(n(ph)));
      const donnees = brutes.flatMap((ph) => [...(ph.match(/\d+(?:[,.]\d+)?/g) || []), ...(ph.match(/(?<=\s)[A-ZÀ-Ý][\p{L}'’-]{2,}/gu) || [])]);
      if (donnees.some((d) => !reste.includes(n(d)))) return true;
    }
    retire = t;
    return false;
  });
  return { texte: retire ? garder.join('\n\n') : texte, retire };
}

/**
 * Puces « Vos attentes » du bloc 1 qui présentent comme engagement une exigence du CCTP que GSS n'a pas reprise (jalon,
 * délai ou fréquence de GSS gardés, question posée à GSS ; becquerel 591, T5N-5 : « au moins 10 jours avant le début du
 * mois considéré : transmettre les plannings… » alors que « La planification » donne J-3 ; « remplacement immédiat d'un
 * agent absent » alors que l'astreinte est sur site en 60 minutes) : retirées jusqu'à la réponse de GSS. `marques` : les
 * valeurs propres retirées (pour savoir si le schéma de process les reprenait).
 */
export function retirerEngagementsRefuses(texte: string, refusees: string[]): { texte: string; retirees: string[]; marques: string[] } {
  const n = (x: string) => normaliser(String(x || '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const VALEUR = /\d+\s*(?:jours?|heures?|h|minutes?|min|mois)|imm[ée]diat\w*|sans d[ée]lai/gi;
  const mots = (x: string) => new Set(n(x).split(' ').filter((w) => w.length >= 5).map((w) => w.replace(/s$/, '')));
  const retirees: string[] = [];
  const marques: string[] = [];
  let partie = '';
  const lignes = String(texte || '').split('\n').filter((l) => {
    if (/^##\s/.test(l)) { partie = l; return true; }
    if (!/^##\s+Vos attentes/i.test(partie) || !/^\s*[-*•]\s/.test(l)) return true;
    const valeursL = (l.match(VALEUR) || []).map(n);
    const motsL = mots(l);
    const visee = refusees.find((e) => {
      const valeursE = (String(e).match(VALEUR) || []).map(n);
      const motsE = [...mots(e)];
      const communs = motsE.filter((w) => motsL.has(w)).length;
      return valeursE.length > 0 && valeursE.every((v) => valeursL.includes(v)) && communs >= Math.min(2, motsE.length);
    });
    if (!visee) return true;
    retirees.push(l.trim());
    marques.push(...(String(visee).match(VALEUR) || []));
    return false;
  });
  return { texte: lignes.join('\n'), retirees, marques };
}

let titresRubriques: Set<string> | null = null;
/** Texte qui n'est que le titre d'une rubrique du mémoire type (ou sa partie après « : », sans parenthèse finale). */
export function titreDeRubriqueSeul(y: string): boolean {
  const n = (x: string) => normaliser(x).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!titresRubriques) {
    titresRubriques = new Set<string>();
    try {
      for (const r of chargerMemoireType().rubriques) {
        titresRubriques.add(n(r.titre));
        const apres = r.titre.split(/\s:\s/).slice(1).join(' : ');
        if (apres) titresRubriques.add(n(apres));
      }
    } catch { /* mémoire type indisponible : aucun titre reconnu */ }
  }
  const t = n(String(y || '').replace(/\*\*/g, ''));
  return !!t && titresRubriques.has(t);
}

/** Rubrique du mémoire type de présentation de GSS (bloc 2) : jamais le titre d'une étape du process du besoin (T7CS-5). */
export function rubriqueDePresentation(titre: string): boolean {
  const n = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  try { return chargerMemoireType().rubriques.some((r) => r.bloc === 'presentation' && n(r.titre) === n(titre)); } catch { return false; }
}
/**
 * Titre de rubrique en titre d'étape (34 caractères au plus), jamais coupé au milieu de son groupe nominal (« La gestion d'une
 * commande » pour « … supplémentaire », T7CS-5) : entier ; sans sa parenthèse finale ; sa partie après « : » (« Formations et
 * certifications : l'agent SSIAP 1 » → « L'agent SSIAP 1 ») ; ou arrêté avant un complément ou une coordination (« L'adéquation
 * de nos moyens humains avec votre besoin » → « L'adéquation de nos moyens humains »). '' sinon : l'étape n'est pas prise.
 */
/**
 * Phrase du texte de GSS d'une rubrique du mémoire type nommée par son titre (« La gestion d'une commande supplémentaire »,
 * « Notre socle de procédures : l'intervention sur alarme… »), pour la carte « nous » d'un schéma de secours (T3-CONS-2) :
 * la première phrase entière sans variable ni repère interne. '' si la rubrique est inconnue.
 */
export function phraseDeRubriqueGss(mt: MemoireType | null | undefined, titre: string): string {
  if (!mt) return '';
  const cle = (x: string) => normaliser(x).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const c = cle(titre);
  const r = mt.rubriques.find((x) => cle(x.titre) === c) || mt.rubriques.find((x) => c.length >= 12 && (cle(x.titre).startsWith(c) || c.startsWith(cle(x.titre))));
  if (!r?.texte) return '';
  const lignes = String(r.texte).split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim()).filter((l) => l && !/^#|^\||^\{\{/.test(l));
  const phrases = lignes.flatMap((l) => l.replace(/\{\{[^}]*\}\}[^{]*?\{\{\/si\}\}/g, '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/))
    // Partie avant les deux-points d'une longue phrase (« … selon un rétroplanning … : il nous faut … ») ; jamais un libellé de
    // tête (« Sélection du profil : après avoir… »).
    .map((p) => p.trim()).filter((p) => !/^[^.:]{2,45}\s:\s/.test(p)).map((p) => p.split(/\s:\s/)[0].replace(/[.!?]$/, '').trim())
    .filter((p) => p.length >= 30 && p.length <= 220 && !/\{\{|\}\}|\[À COMPLÉTER\]|⟦|«|:\s*$|\bpour cela\b|^(?:ainsi|cela|ceci|de ce fait)\b/i.test(p) && /\b(?:nous|est|sont|permet|garanti|dispose|assure|organis|met|veill|proc[èe]d|repose|s['’]appuie)/i.test(p));
  // Jamais une phrase qui redit le titre de la rubrique (« L'intégration d'un nouvel agent sur un site est une étape… »).
  const sansArt = (x: string) => cle(x).replace(/^(?:le|la|les|l|un|une|des|du)\s+/, '');
  const utiles = phrases.filter((x) => !sansArt(x).startsWith(sansArt(r.titre).split(' ').slice(0, 4).join(' ')));
  return utiles.find((x) => /^(?:Nous|Notre|Nos|GSS|Chaque)\b/.test(x)) || utiles.find((x) => /\b(?:nous|notre|nos|GSS)\b/i.test(x)) || utiles[0] || '';
}

export function titreRubriqueEtape(rubrique: string): string {
  const pleins = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w)).length;
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const t = String(rubrique || '').replace(/\s+/g, ' ').trim();
  const essais = [t, t.replace(/\s*\([^)]*\)\s*$/, '')];
  const apres = t.replace(/\s*\([^)]*\)\s*$/, '').split(/\s:\s/);
  if (apres.length > 1) essais.push(cap(apres.slice(1).join(' : ')));
  for (const m of t.matchAll(/\s(?:avec|et|pour|dans|selon|via|au service|en cas)\s/g)) essais.push(t.slice(0, m.index).replace(/[,;:\s]+$/, ''));
  return essais.find((x) => x && x.length <= 34 && pleins(x) >= 2 && !/[«»(]/.test(x)) || '';
}

/** Mots en -er, -ir, -re qui ne sont pas des infinitifs. */
const NOMS_EN_R = /^(?:suppl[ée]mentaires?|horaires?|mati[èe]res?|mani[èe]res?|fronti[èe]res?|carri[èe]res?|premi[èe]re?s?|derni[èe]re?s?|enti[èe]re?s?|n[ée]cessaires?|ordinaires?|titres?|centres?|ordres?|nombres?|membres?|lettres?|cadres?|autres?|notre|votre|entre|contre|quartier|dossier|chantier|courrier|papier|premier|dernier|entier|cahier|calendrier|fichier|registre|p[ée]rim[èe]tre|param[èe]tre|ministre|syst[èe]me|hiver|pouvoir|devoir|savoir|soir|couloir|trottoir|comptoir|tiroir|r[ée]servoir|loisir|plaisir|avenir|d[ée]sir|sinistre|mesure|nature|ouverture|fermeture|structure|proc[ée]dure|voiture|lecture|facture|culture|clôture|cl[ôo]ture|signature|tenue|mobilier|[ée]clairage)$/i;
/** Texte d'étape qui commence par une préposition sans verbe (« Pour une ronde supplémentaire commandée par écrit par la
 *  Direction ») : la proposition principale qui suit (« Intervenir selon les jours et horaires indiqués »), sinon ''. */
export function texteEtapeAvecVerbe(x: string): string {
  const t = String(x || '').replace(/\s+/g, ' ').trim();
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const infinitif = (v: string) => { const w = (/^[a-zà-ÿ]+/i.exec(v) || [''])[0]; return w.length >= 4 && /(?:er|ir|oir|re)$/i.test(w) && !NOMS_EN_R.test(w); };
  const premier = texteEtapeCoordination(cap(t));
  const fragment = (v: string) => /^(?:pour|par|dans|selon|lors|en cas|en|apr[èe]s|avant|d[èe]s|sur|sous|avec|sans|pendant|durant|jusqu['’]|hors|entre|au|aux|à|de|du|des|d['’])\b/i.test(v) && !VERBE_CONJUGUE.test(v) && !v.split(/\s+/).some((w, i) => i > 0 && infinitif(w) && /^(?:de|d['’]|à|pour)$/i.test(v.split(/\s+/)[i - 1] || ''));
  if (premier && !fragment(premier)) return premier;
  for (const m of t.matchAll(/[,;]\s+/g)) {
    const suite = t.slice((m.index || 0) + m[0].length).split(/\s*;\s*/)[0];
    if (!infinitif(suite)) continue;
    // Infinitif régi par une négation qui le précède (« les agents ne doivent pas divulguer les informations, photographier
    // les bâtiments… », cstb 1201) : jamais la suite seule, qui dirait l'inverse (« Photographier les bâtiments »).
    if (/(?:^|\s)(?:ne|n['’]|ni|sans|jamais|aucune?|interdi\S*|proscri\S*|d[ée]fendu\S*)(?=\s|$)/i.test(t.slice(0, m.index || 0))) break;
    const e = texteEtapeCoordination(cap(suite));
    if (e) return e;
  }
  return '';
}

export function etapesDesPuces(texte: string, phraseDe?: (titreRubrique: string) => string, dejaVous = 0): Array<{ titre: string; texte?: string; role?: string; besoin?: boolean }> {
  const puces = (titre: RegExp) => {
    // Toutes les parties de ce titre (texte rédigé puis puces ajoutées pour le minimum, format court hors ligne imm).
    const partie = String(texte || '').split(/^(?=##\s)/m).filter((p) => titre.test(p)).join('\n');
    return partie.split('\n').map((l) => {
      // Libellé nommé en gras suivi de l'exigence, sans deux-points (« **L'arrivée sur site** est exigée … → « … » … »,
      // forme écrite par libellesBloc1) : le libellé et sa suite sont l'exigence.
      const nv = /^\s*[-*•]\s+\*\*([^*«»]+)\*\*(?!\s*[:(])([^→\n]*?)\s*→\s*(?:notre réponse\s*:\s*)?(.+)$/i.exec(l);
      if (nv && !/^(?:points? de vigilance|ce que vous attendez|vos attentes|notre réponse)$/i.test(nv[1].trim())) return { brut: nv[0], x: `${nv[1].trim()}${nv[2]}`, y: nv[3], citation: false };
      const m = /^\s*[-*•]\s+\*\*([^*]+)\*\*(?:\s*\([^)]*\))?\s*:\s*(.+?)\s*→\s*notre réponse\s*:\s*(.+)$/.exec(l);
      if (m) {
        // Exigence citée en gras, réponse de GSS avant la flèche, renvois seuls après (« **« une ouverture effective à
        // 07h20 »** : nous organisons la ronde d'ouverture… → notre réponse : « La planification », développée au bloc 4 »,
        // cstb 1201, T2N-6) : la citation est l'exigence, la phrase de GSS la réponse.
        const q = /^«\s*([^»]{3,160}?)\s*»$/.exec(m[1].trim());
        const renvois = m[3].replace(/«[^»]{3,160}»/g, '').replace(/[\s,.;]+|\b(?:et|ainsi que|d[ée]velopp[ée]e?s?|d[ée]taill[ée]e?s?|aux?|dans|les?|blocs?|\d+)\b/gi, '');
        if (q && /^\s*nous\s/i.test(m[2]) && !renvois) return { brut: m[0], x: q[1], y: m[2], citation: true };
        return { brut: m[0], x: m[2], y: m[3], citation: false };
      }
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
      // Suite qui redit le besoin (« le CCTP exige que ce délai soit indiqué… », « vous demandez… », cstb 1201) : ce n'est
      // pas une réponse de GSS, jamais le texte d'une étape.
      if (sf && /^\s*(?:(?:le|la|les|l['’]|ce|cette|votre)\s*(?:cctp|ccap|cahier|dce|r[èe]glement|march[ée]|acheteur|client|pouvoir adjudicateur|ma[îi]tre d['’]ouvrage)\b|vous\b|il est (?:demand|exig|attendu|pr[ée]vu))/i.test(sf[3])) return null;
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
      .map((m) => ({ x: m.x.replace(/\*\*/g, '').trim(), y: sansRenvoiRedondant(reponsePourSchema(sansRenvoiBloc(sansIncisesRenvoi(m.y).split(/\s*;\s*/)[0]).replace(/\s+(?:est|sont|sera|seront)$/i, '').trim())), citation: m.citation,
        // Réponse avant la mise en forme du schéma, titres de rubrique encore entre guillemets : le renvoi final (« … selon
        // « La procédure de contrôle inopiné » ») s'y retire pour garder la phrase entière (ifsem 1001, T2N-6).
        yCite: sansRenvoiBloc(sansIncisesRenvoi(m.y).split(/\s*;\s*/)[0]).trim(),
        // Titres de rubrique cités dans la réponse (« Le remplacement d'un agent absent : absence non prévue ») : jamais le texte
        // d'une étape (caen 475, T6C-6 : « Nous traitons l'absence non prévue avec le remplacement d'un agent absent »).
        rubriques: [...m.y.matchAll(/«\s*([^»]+?)\s*»/g)].map((r) => r[1]) }))
      // Réponse réduite au titre d'une rubrique (« → notre réponse : « L'agent SSIAP 1 » », imm, T5CP-12, T5N-9) : jamais le
      // texte d'une étape (le titre n'explique rien) ; l'étape porte alors le process de GSS en titre et le besoin du DCE en texte.
      .filter((c) => c.y)
      .map((c) => ({ ...c, renvoi: titreDeRubriqueSeul(c.y) }));
  };
  const vigilance = puces(/^##\s+Les points de vigilance/i);
  const attentes = puces(/^##\s+Vos attentes/i);
  // Titre nominal : le groupe nominal qui précède le premier verbe (« La continuité doit toujours s'opérer… » → « La
  // continuité » ; « Les rondes techniques cessent… » → « Les rondes techniques »), coupé sur un mot plein.
  const VERBE = /^(?:est|sont|doit|doivent|peut|peuvent|a|ont|exigen?t?|exige|cessen?t?|cesse|restent|reste|varien?t?|varie|imposen?t?|impose|prévoi(?:t|ent)|porten?t?|porte|assuren?t?|assure|se|s['’]\S*|fai(?:t|s)|font|demanden?t?|demande|nécessiten?t?|nécessite|impliquen?t?|implique|sera|seront|intervien(?:t|nent)|requiert|requièrent|associen?t?|associe|comprend|comprennent|comporten?t?|comporte|accueillen?t?|accueille|comptent|compte|dispose|disposent|couvren?t?|couvre|regroupen?t?|regroupe|concernen?t?|concerne|inclut|incluent|ouvren?t?|ouvre|fermen?t?|ferme|fonctionnen?t?|fonctionne|reçoi(?:t|vent)|abriten?t?|abrite|représenten?t?|représente|dépend(?:ent)?|accèdent|accède|circulen?t?|circule|travaillen?t?|travaille|nécessitera|fixe|fixent|prévoit|attend|attendent|souhaite|souhaitent|veut|veulent|mentionnen?t?|combinen?t?|indiquen?t?|constituen?t?|peuven?t|pourr(?:a|ont)|risquen?t?)$/i;
  /** Titre nominal (groupe nominal avant le premier verbe), '' s'il n'y en a pas de propre : jamais une phrase tronquée
   *  (« Le site associe un bâtiment ») ni un mot seul (« Le service »). */
  const nominal = (x: string): string => {
    if (/^\s*(?:aucune?|nulle?)\s/i.test(x.replace(/\*\*/g, ''))) return titreNegatif(x);
    // Sujet pronom (imm 701 : « il prend en compte la continuité des soins » → titre « Il prend ») : pas de titre nominal.
    if (/^\s*(?:il|elle|ils|elles|on|nous|vous|cela|ceci|celui-ci|celle-ci)\s/i.test(x.replace(/\*\*/g, ''))) return '';
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
  const etapes: Array<{ titre: string; texte?: string; role?: string; besoin?: boolean }> = [];
  // « On pense à ça, puis à ça, pour arriver à ça » (consigne 6, T5CP-12) : le besoin (attentes) avant les points de vigilance,
  // le pilotage (réunions, indicateurs, reporting) en dernier avant le résultat.
  const PILOTAGE = /r[ée]unions?|pilotage|indicateurs?|reporting|comit[ée]|bilan|tableau de bord/i;
  // Formalité de l'offre (visite obligatoire) : jamais une étape du process (T6-CONS-14).
  const base = [...attentes, ...vigilance].filter((c) => !FORMALITES_OFFRE.test(c.x));
  const ordre = [...base.filter((c) => !PILOTAGE.test(`${c.x} ${c.y}`)), ...base.filter((c) => PILOTAGE.test(`${c.x} ${c.y}`))];
  // Exigence citée du DCE, courte et nominale (« Main courante tenue en temps réel », « Délai maximum de 20 minutes ») :
  // elle sert de titre telle quelle.
  const citationTitre = (c: { x: string; citation: boolean }): string => {
    if (!c.citation) return '';
    // Sans le point final de la citation (imm 701 : carte « Remplacement sous 4h maximum. »).
    const x = c.x.replace(/\s+/g, ' ').trim().replace(/\s*[.;!]+$/, '');
    const pleins = pleinsDe(x);
    if (/^(?:aucune?|nulle?)\s/i.test(x)) return titreNegatif(x, 40);
    return x.length <= 40 && pleins.length >= 2 && !/[,;:«»"]/.test(x) && !x.split(/\s+/).some((w, i) => i > 0 && VERBE.test(w)) ? x : '';
  };
  // Titre tiré d'une exigence chiffrée : la valeur du DCE reste dans le titre (« Mobiliser les équipes en 2 heures »), ou
  // l'exigence ne donne pas de titre ; jamais un titre coupé qui perd la valeur (caen 475, T6C-6 : « Dépêcher sur le site le
  // personnel », sans « de remplacement dans les UNE (1) heure »). Les mots de la valeur sont ceux de l'exigence (texte).
  const avecValeur = (x: string, titre: string): string => {
    if (!titre) return '';
    const v = /(?:\(\s*)?(\d{1,3})\s*\)?\s*(minutes?|heures?|jours?(?: ouvrés| ouvrables| calendaires)?|semaines?|mois)(?![\p{L}])/iu.exec(x);
    if (!v || new RegExp(`(?<![\\d])${v[1]}(?![\\d])`).test(titre)) return titre;
    const valeur = `${v[1]} ${v[2].toLowerCase()}`;
    const court = titreExigence(x, 34 - valeur.length - 4);
    return court ? `${court} en ${valeur}` : '';
  };
  // Titre coupé qui perd le complément de son nom (T6-CONS-14 : « L'ensemble du système » pour « L'ensemble du système de
  // surveillance à distance ») : « L'ensemble du / La totalité des » retiré d'abord (« Système de surveillance à distance »).
  const SANS_ENSEMBLE = /^(?:l['’]ensemble|la\s+totalit[ée]|l['’]int[ée]gralit[ée])\s+(?:du|de\s+la|de\s+l['’]|des)\s*/i;
  const titreDe = (c: { x: string; citation: boolean }) => {
    const x = c.x.replace(SANS_ENSEMBLE, (m) => (m ? '' : m)).replace(/^./, (ch) => ch.toUpperCase());
    const cc = { ...c, x };
    return citationTitre(cc) || avecValeur(x, nominal(x)) || avecValeur(x, titreExigence(x));
  };
  for (const c of [...ordre.filter((x) => titreDe(x)), ...ordre.filter((x) => !titreDe(x))]) {
    if (etapes.length >= 3) break;
    let titre = titreDe(c);
    let y = c.y;
    let corps = titre ? texteEtapeCoordination(y.charAt(0).toUpperCase() + y.slice(1)) : '';
    // Réponse trop longue pour la carte à cause du renvoi final à une rubrique (« Les vérifications inopinées et leur suivi
    // sont organisés selon « La procédure de contrôle inopiné » ») : la phrase sans le renvoi, entière (ifsem 1001, T2N-6).
    if (titre && !corps && !c.renvoi && c.rubriques.length && /»\s*[.]?$/.test(c.yCite)) {
      const yc = c.yCite.replace(/^\s*nous\s/i, 'Nous ');
      corps = texteEtapeCoordination(yc.charAt(0).toUpperCase() + yc.slice(1));
      if (/«|»/.test(corps)) corps = '';
    }
    if (c.renvoi) {
      // Réponse réduite au titre d'une rubrique : l'étape est un BESOIN du DCE (carte « vous »), titrée par l'exigence et non par
      // la rubrique de GSS (T3-CONS-2, T3-COH-7 : « Un interlocuteur unique » sur l'obligation du CCTP, cartes 03 et 04
      // « nous » qui recopiaient la colonne du CCTP) ; jamais une carte « nous » (besoin).
      const x = c.x.replace(/\s+/g, ' ').trim();
      // Texte avec son verbe : jamais un complément seul (« Pour une ronde supplémentaire commandée par écrit… »).
      corps = texteEtapeAvecVerbe(x);
      titre = titre || titreExigence(x);
      const sansArt = (v: string) => normaliser(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:le|la|les|l|un|une|des|du)\s+/, '');
      // Cartes « nous » (3e et 4e) : le process de GSS nommé (titre de la rubrique) et une phrase de son texte, jamais le
      // besoin du DCE (T3-CONS-2) ; sans phrase de GSS, l'étape n'est pas prise.
      const rubriqueCitee = String((c as any).rubriques?.[0] || c.y).replace(/[.;:!?\s]+$/, '').replace(/^«\s*|\s*»$/g, '').trim();
      // Carte « vous » titrée par le process de GSS qui répond, le besoin entier en texte (T5CP-12) : pour un besoin sans verbe ou
      // dont le titre tiré de l'exigence redirait le texte.
      const carteVousProcess = (): boolean => {
        const tr = rubriqueDePresentation(rubriqueCitee) ? '' : titreRubriqueEtape(rubriqueCitee);
        const besoinTexte = texteEtapeEntier(x.charAt(0).toUpperCase() + x.slice(1));
        const sa = (v: string) => normaliser(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:le|la|les|l|un|une|des|du)\s+/, '');
        if (!tr || !besoinTexte || COMPLEMENT_TETE.test(`${besoinTexte}, x`) || sa(besoinTexte).startsWith(sa(tr)) || etapes.some((d) => procheDe(d.titre, tr))) return false;
        etapes.push({ titre: tr, texte: besoinTexte, role: 'rouge', besoin: true });
        return true;
      };
      const carteNous = (): boolean => {
        const rubrique = rubriqueCitee;
        const tr = rubriqueDePresentation(rubrique) ? '' : titreRubriqueEtape(rubrique);
        const brute = tr && phraseDe ? phraseDe(rubrique) : '';
        let ph = brute ? texteEtapeEntier(brute) || texteEtapeEntier(brute.split(/,\s+(?:tout en|afin|pour|et|qui)\b/)[0]) : '';
        // Complément seul en tête (« Dans le cadre de l'intégration d'un nouveau marché ») : jamais le texte d'une carte.
        if (/^(?:dans|pour|afin|en|lors|avant|apr[èe]s|d[èe]s|selon|sur)\b/i.test(ph) && !/\b(?:nous|est|sont|assure|garanti|dispose|organis|met|veill|permet)/i.test(ph)) ph = '';
        if (!tr || !ph || etapes.some((d) => procheDe(d.titre, tr) || normaliser(String(d.texte || '')) === normaliser(ph))) return false;
        etapes.push({ titre: tr, texte: ph, role: 'bleu' });
        return true;
      };
      if (etapes.length + dejaVous >= 2) { carteNous(); continue; }
      // Besoin sans verbe (« poste permanent de sécurité incendie et de sûreté 24 h/24, 7 j/7 ») : carte « vous » titrée par le
      // process de GSS qui y répond, le besoin en texte (T5CP-12).
      if (!corps && !COMPLEMENT_TETE.test(`${x}, x`)) { if (!carteVousProcess()) carteNous(); continue; }
      // Complément de temps ou de condition seul (« Sur demande écrite de la Direction précisant les jours ») : jamais le texte
      // d'une carte (T2N-6) ; la carte « nous » du process nommé est prise à la place.
      if (!titre || !corps || COMPLEMENT_TETE.test(`${corps}, x`)) { carteNous(); continue; }
      // Besoin qui commence par son titre : la suite seulement (3 mots au moins), sinon l'étape n'apporte rien.
      if (sansArt(corps).startsWith(sansArt(titre))) {
        const reste = corps.replace(/^\s*(?:le|la|les|l['’]|un|une|des|du)?\s*/i, '').slice(titre.replace(/^\s*(?:le|la|les|l['’]|un|une|des|du)?\s*/i, '').length).replace(/^[\s,;:]+/, '').trim();
        corps = reste.split(/\s+/).length < 3 ? '' : texteEtapeAvecVerbe(reste.charAt(0).toUpperCase() + reste.slice(1)) || '';
        if (!corps || /^(?:de|du|des|d['’]|à|au|aux|en|et)\b/i.test(corps)) { if (!carteVousProcess()) carteNous(); continue; }
      }
    }
    // Sans titre tiré de l'exigence, ou réponse trop longue pour la carte : tête de la réponse comme titre, sa suite
    // comme texte (ca_normandie 241 : « Intégration du marché » / « Mise en place de la prestation… »).
    if (!corps && !c.renvoi) {
      const tr = teteReponse(c.y);
      if (!tr.titre || tr.reste.split(/\s+/).length < 3) continue;
      titre = tr.titre;
      y = tr.reste;
      corps = texteEtapeCoordination(y.charAt(0).toUpperCase() + y.slice(1));
    }
    if (!corps) continue;
    // Texte fait d'un titre de rubrique citée, plus un verbe au plus (« Nous traitons l'absence non prévue avec le remplacement
    // d'un agent absent ») : l'étape n'explique rien (T6C-6). Une réponse qui dit ce que fait la procédure (« la procédure … organise
    // la continuité et le remplacement par un agent de réserve ») reste.
    if (!c.renvoi && (c as any).rubriques?.length) {
      const deRubriques = new Set(((c as any).rubriques as string[]).flatMap((r) => pleinsDe(r)));
      if (pleinsDe(corps).filter((w) => !deRubriques.has(w) && w !== 'nous').length <= 1) continue;
    }
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
    etapes.push({ titre: titre.charAt(0).toUpperCase() + titre.slice(1), texte: corps, role: etapes.length + dejaVous < 2 ? 'rouge' : 'bleu', ...(c.renvoi ? { besoin: true } : {}) });
  }
  return etapes;
}

/**
 * Schéma « spec » du mémoire type aligné sur le texte final de sa rubrique (T3-CONS-11, ign 1351 : texte adapté au CCTP
 * « pendant au minimum 2 vacations consécutives de jour et 2 vacations de nuit », carte du schéma restée « 1 à 3 jours avec le
 * chef de site ») : une durée ou une fréquence d'une carte, écrite dans le texte de GSS et absente du texte final, est remplacée
 * par la valeur qui l'a remplacée dans la phrase adaptée (même amorce) ; à défaut, elle est retirée de la carte. Renvoie les
 * paramètres (copie) et les valeurs changées.
 */
export function alignerSchemaSurTexte(params: any, textePublie: string, texteFinal: string): { params: any; changees: Array<{ avant: string; apres: string }> } {
  const QUANTITE = /(?<![\p{L}\d])(?:\d+\s*(?:à|-|–)\s*)?\d+\s*(?:jours?|heures?|h|minutes?|mn|semaines?|mois|vacations?|nuits?)(?![\p{L}])|(?<![\p{L}])J\s?[+-]\s?\d+(?!\d)/giu;
  const plat = (x: string) => normaliser(String(x || '').replace(/\*\*/g, '')).replace(/\s+/g, ' ');
  const pub = plat(textePublie), fin = plat(texteFinal);
  const changees: Array<{ avant: string; apres: string }> = [];
  if (!pub || !fin) return { params, changees };
  const phrases = (t: string) => String(t || '').replace(/\*\*/g, '').split(/\n+|(?<=[.!?])\s+(?=[A-ZÀ-Ý])/).map((x) => x.trim()).filter(Boolean);
  const nouvelleValeur = (q: string): string => {
    const s0 = phrases(textePublie).find((p) => plat(p).includes(plat(q)));
    if (!s0) return '';
    const i0 = plat(s0).indexOf(plat(q));
    const motsAvant = plat(s0).slice(0, i0).replace(/[^a-z0-9' ]+/g, ' ').trim().split(/\s+/);
    const mots0 = new Set(plat(s0).replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4));
    // Phrase adaptée : celle du texte final qui partage le plus de mots avec la phrase de GSS (la moitié au moins).
    const proches = phrases(texteFinal).filter((p) => { const m = plat(p).replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4); return m.length && m.filter((w) => mots0.has(w)).length / Math.min(m.length, mots0.size) >= 0.5; });
    for (const n of [3, 2, 1]) for (const s1 of proches) {
      const amorce = motsAvant.slice(-n).join(' ');
      if (amorce.length < 4) continue;
      const p1 = plat(s1).replace(/[^a-z0-9' ]+/g, (x) => ' '.repeat(x.length));
      const k = p1.indexOf(` ${amorce} `) >= 0 ? p1.indexOf(` ${amorce} `) + 1 : p1.startsWith(`${amorce} `) ? 0 : -1;
      if (k < 0) continue;
      // Même position dans le texte d'origine : la suite de l'amorce, jusqu'à la première virgule ou deux-points.
      const debut = k + amorce.length + 1;
      // Positions dans la phrase d'origine (mêmes longueurs : normaliser ne change que les accents et la casse).
      const brut = s1.slice(debut).split(/\s*[,;:]\s+|\s+selon\s+/)[0].replace(/[.\s]+$/, '').trim();
      if (brut && plat(brut) !== plat(q) && QUANTITE.test(brut) && brut.length <= 80) { QUANTITE.lastIndex = 0; return brut; }
      QUANTITE.lastIndex = 0;
    }
    return '';
  };
  const visiter = (o: any): any => {
    if (typeof o === 'string') {
      let t = o;
      for (const m of [...o.matchAll(QUANTITE)]) {
        const q = m[0];
        if (!pub.includes(plat(q)) || fin.includes(plat(q))) continue;
        const nv = nouvelleValeur(q);
        const remplace = nv ? t.replace(q, nv) : t.replace(new RegExp(`\\s*(?:pendant|durant|sous|en|de)?\\s*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), ' ').replace(/\s+/g, ' ').trim();
        t = nv && remplace.length > 86 ? nv : remplace;
        t = t.charAt(0).toUpperCase() + t.slice(1);
        changees.push({ avant: q, apres: nv || '(retiré)' });
      }
      return t;
    }
    if (Array.isArray(o)) return o.map(visiter);
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'icone' || k === 'role' || k === 'date' ? v : visiter(v)]));
    return o;
  };
  return { params: visiter(params), changees };
}

/**
 * Schéma de process du bloc 1 sans ses cartes fautives (T4-COH-7, ign 1351 : la carte « Rondes » dont le texte redit le titre
 * faisait refuser tout le schéma ; T4N-1, becquerel 1401 : carte « Le CCTP confie les rondes », texte coupé « Le CCTP exige,
 * pour le personnel… ») : chaque carte signalée par le contrôle du schéma (anomaliesSchemaBloc1) est retirée, puis le schéma
 * est recontrôlé ; null s'il reste moins de deux cartes avant « Votre résultat », ou si le résultat lui-même est fautif.
 */
export function specSansEtapesFautives(etapes: Array<{ titre: string; texte?: string; role?: string }>, gabarit: 'flux' | 'chevrons' = 'flux'): { gabarit: string; params: any } | null {
  let l = [...etapes];
  for (let essai = 0; essai < 8; essai++) {
    if (l.length < 3) return null;
    const spec = specProcessBesoin(l, gabarit);
    if (!spec) return null;
    const an = anomaliesSchemaBloc1(spec);
    if (!an.length) return spec;
    const n = spec.params.etapes.length;
    // Cartes de la spécification et de la liste dans le même ordre (aucune carte sans titre retirée en route).
    if (n !== Math.min(l.length, gabarit === 'chevrons' ? 4 : 5)) return null;
    const fautives = new Set<number>();
    for (const a of an) {
      const deux = /^étapes (\d+) et (\d+)/.exec(a);
      const une = /^étape (\d+)/.exec(a);
      if (deux) fautives.add(Number(deux[2]) - 1);
      else if (une) fautives.add(Number(une[1]) - 1);
      else return null;
    }
    if (fautives.has(n - 1)) return null;
    l = l.filter((_, i) => !fautives.has(i));
  }
  return null;
}

/** Étapes tirées des attentes et des points de vigilance du texte du bloc 1 (secours des schémas), sans le résultat. */
export function specSecoursPuces(texte: string, phraseDe?: (titreRubrique: string) => string): { gabarit: string; params: any } | null {
  const etapes = etapesDesPuces(texte, phraseDe);
  // « On pense à ça, puis à ça, pour arriver à ça » : deux étapes au moins avant le résultat.
  if (etapes.length < 2) return null;
  // Résultat : une phrase entière du texte qui dit le résultat (jamais une étape verte vide) ; sinon secours suivant.
  const resultat = resultatBesoin(texte, etapes.map((e) => String(e.texte || '')), RESULTAT_MEMOIRE_TYPE);
  if (!resultat) return null;
  etapes.push({ titre: 'Votre résultat', texte: resultat, role: 'vert' });
  return specSansEtapesFautives(etapes as Array<{ titre: string; texte?: string; role?: string }>, 'flux');
}

/**
 * Dernier schéma de secours du bloc « compréhension » (consignes 3 et 6 : un schéma parlant, jamais « Votre contexte →
 * Le périmètre → Vos attentes → Votre résultat », imm 341 et citedia 341) : construit sur le CONTENU du texte. Les postes
 * du tableau « Le périmètre de la prestation demandée » (poste et horaires du DCE), puis les attentes et les points de
 * vigilance (exigence → réponse de GSS), enfin la phrase de résultat du texte (resultatBesoin, jamais une attente citée).
 * Chaque étape porte une phrase de sa partie. null si moins de deux étapes de contenu ou aucun résultat : le défaut est
 * alors signalé à GSS.
 */
/**
 * Étapes tirées du périmètre écrit en puces (T7CS-5, T7N-5), dans l'ordre du texte :
 * - « Période : prestation horaire ; prestation horaire » (« Du lundi au vendredi : ronde d'ouverture pour ouverture effective
 *   à 07 h 20 ; ronde de fermeture de 19 h 30 à 20 h 30 ; trois rondes de nuit entre 21 h 30 et 06 h 30 ») : la période en
 *   titre, les prestations en texte (« Ronde d'ouverture, ronde de fermeture et trois rondes de nuit ») ;
 * - « Libellé : oui, en quoi elle consiste » (« Levée de doute : oui, sur appel de la télésurveillance… ») : le libellé en
 *   titre, la suite en texte.
 * Jamais ce qui est hors périmètre (« Postes fixes : non », « … ne prévoit ni … »), ni un repère interne, ni un titre coupé.
 */
export function etapesDuPerimetre(partie: string): Array<{ titre: string; texte: string }> {
  const PERIODE = /^(?:du|les?|jours?|week|samedis?|dimanches?|nuits?|semaine|lundis?|mardis?|mercredis?|jeudis?|vendredis?|en semaine|tous les|chaque)\b/i;
  const GENERIQUE = /^(?:p[ée]rim[èe]tre|sites?|lots?|postes? fixes?|hors p[ée]rim[èe]tre|exclusions?|remarques?|nota|observations?)$/i;
  const HORS = /\bnon\b\s*[;,.]|\bne pr[ée]voit (?:ni|pas|aucun)|\bhors (?:march[ée]|p[ée]rim[èe]tre)|\bexclue?s?\b|\baucune?\b/i;
  const QUANTITE = '(?:une?|deux|trois|quatre|cinq|six|\\d+|la|le|les|l[\'’])';
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const out: Array<{ titre: string; texte: string }> = [];
  for (const l of String(partie || '').split('\n')) {
    if (!/^\s*[-*•]\s+/.test(l)) continue;
    const puce = l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim();
    for (const phrase of puce.split(/(?<=\.)\s+(?=[A-ZÀ-Ý])/)) {
      const m = /^([^:;.]{3,60}?)\s*:\s*(.+)$/.exec(phrase.trim());
      if (!m) continue;
      const libelle = m[1].trim();
      // Segments qui portent un repère interne (« délai d'intervention : [À COMPLÉTER] ») : jamais dans le schéma.
      const valeur = m[2].split(/\s*;\s*/).filter((x) => !INTERNE.test(x)).join(' ; ').trim().replace(/[.\s]+$/, '');
      if (!valeur || GENERIQUE.test(libelle) || libelle.length > 34 || /^non\b/i.test(valeur) || HORS.test(libelle)) continue;
      if (PERIODE.test(libelle)) {
        const tetes: string[] = [];
        for (const item of valeur.split(/\s*;\s*/).flatMap((x) => x.split(new RegExp(`\\s+et\\s+(?=${QUANTITE}\\s)`, 'i')))) {
          if (HORS.test(item)) continue;
          const k = /^(.{3,40}?)\s+(?:pour|de \d+|d['’]\d+|entre|à \d+|dès|avant|apr[èe]s|chaque|tous|toutes|les (?:jours|nuits))\b/i.exec(item.trim());
          const tete = (k ? k[1] : item).trim();
          if (tete && tete.length <= 40 && !/\d{1,2}\s*h/i.test(tete) && !tetes.some((t) => normaliser(t) === normaliser(tete))) tetes.push(tete);
        }
        const texte = tetes.length ? cap(listeFr(tetes)) : '';
        if (texte && texte.length <= 86 && texte.split(/\s+/).length >= 2) out.push({ titre: cap(libelle), texte });
      } else if (/^oui\b/i.test(valeur)) {
        let suite = valeur.replace(/^oui\s*[,;:]?\s*/i, '').split(/\s*;\s*/)[0];
        // Suite qui redit le libellé (ign 1351, T4-COH-7 : « Rondes : oui, rondes intérieures/extérieures, techniques et de
        // sûreté… ») : la suite seulement, qui apporte l'information.
        const nl = normaliser(libelle).replace(/[^a-z0-9 ]+/g, ' ').trim();
        if (nl && normaliser(suite).replace(/[^a-z0-9 ]+/g, ' ').trim().startsWith(`${nl} `)) {
          const reste = suite.replace(/^\s*\S+(?:\s+\S+)*?/, (x) => x).slice(libelle.length).replace(/^[\s,;:]+/, '');
          if (reste.split(/\s+/).length >= 3 && !/^(?:de|du|des|d['’]|à|au|aux|et)\b/i.test(reste)) suite = reste;
        }
        const texte = suite ? texteEtapeEntier(cap(suite)) || texteEtapeCoordination(cap(suite)) : '';
        if (texte && texte.split(/\s+/).length >= 3) out.push({ titre: cap(libelle), texte });
      }
    }
  }
  return out.slice(0, 4);
}

export function specSecoursBesoin(texte: string, phraseDe?: (titreRubrique: string) => string): { gabarit: string; params: any } | null {
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
    // Renfort en option (imm 701 : « Option 1 : 1 SSIAP 1 ») : pas une étape du process de la prestation demandée.
    if (/^option\b/i.test(brutPoste)) continue;
    if (etapes.some((e) => proches(e.titre, poste) || normaliser(e.texte) === normaliser(horaires))) continue;
    etapes.push({ titre: poste.charAt(0).toUpperCase() + poste.slice(1), texte: horaires.charAt(0).toUpperCase() + horaires.slice(1), role: 'rouge' });
  }
  // 1 bis. Périmètre écrit en puces (cstb 551, T7CS-5) : prestations et horaires du DCE, avant les attentes.
  if (!lignes.length) for (const e of etapesDuPerimetre(partie(/^##\s+Le périmètre/i))) {
    if (etapes.length >= 4) break;
    if (etapes.some((d) => proches(d.titre, e.titre) || normaliser(d.texte) === normaliser(e.texte))) continue;
    etapes.push({ ...e, role: etapes.length < 2 ? 'rouge' : 'bleu' });
  }
  // 2. Attentes et points de vigilance : exigence → réponse de GSS.
  for (const e of etapesDesPuces(t, phraseDe, Math.min(2, etapes.length))) {
    if (etapes.length >= 4) break;
    if (!e.texte || etapes.some((d) => proches(d.titre, e.titre) || normaliser(d.texte) === normaliser(String(e.texte)))) continue;
    // Carte « nous » (3e et 4e) : la réponse de GSS, jamais un besoin du DCE (T3-CONS-2).
    if (e.besoin && etapes.length >= 2) continue;
    etapes.push({ titre: e.titre, texte: String(e.texte), role: e.role === 'bleu' || etapes.length >= 2 ? 'bleu' : 'rouge' });
  }
  if (etapes.length < 2) return null;
  const resultat = resultatBesoin(t, etapes.map((e) => e.texte), RESULTAT_MEMOIRE_TYPE);
  if (!resultat) return null;
  return specSansEtapesFautives([...etapes.slice(0, 4), { titre: 'Votre résultat', texte: resultat, role: 'vert' }], 'flux');
}

/**
 * Dernier secours du schéma de process du bloc 1 (T10C-4, citedia hors ligne : périmètre d'une seule phrase, attentes en
 * citations « … » sans « → notre réponse ») : une étape par obligation chiffrée citée dans « Vos attentes et nos
 * engagements », dans l'ordre du texte. Titre = l'action et son délai (« Intervention sur site en 15 minutes »), texte = la
 * fin de la phrase du DCE à partir du délai, coupée à la fin d'une proposition (« Dans un délai de 15 minutes maximum à
 * compter de la réception de l'alarme »). Puis l'étape « Votre résultat » (resultatBesoin, sinon le résultat du mémoire
 * type). À défaut, la liste « Le marché comprend : … » en chevrons. null seulement si le texte n'a ni deux obligations
 * chiffrées ni deux prestations listées.
 */
export function specSecoursObligations(texte: string): { gabarit: string; params: any } | null {
  const t = String(texte || '');
  const partie = (titre: RegExp) => t.split(/^(?=##\s)/m).find((p) => titre.test(p)) || '';
  const etapes: Array<{ titre: string; texte: string; role?: string }> = [];
  const ACTIONS: Array<[RegExp, string]> = [
    [/(?:appliquer|applique|application)[^.]{0,40}consignes|traitement|contre[- ]appel|prise en compte/i, "Traitement de l'alarme"],
    [/lev[ée]e de doute/i, 'Levée de doute'],
    [/interven|se rend|arriv|d[ée]p[êe]ch/i, 'Intervention sur site'],
    [/rempla/i, 'Remplacement'],
    [/inform|pr[ée]ven|avert|alert(?:er|e le)|signal/i, 'Information du client'],
    [/rapport|compte[- ]rendu|transmi/i, 'Compte rendu'],
  ];
  const vues = new Set<string>();
  for (const l of partie(/^##\s+Vos attentes/i).split('\n')) {
    if (etapes.length >= 4) break;
    const q = /^\s*[-*•]\s+(?:\*\*[^*]*\*\*\s*:?\s*)?«\s*([^»]{10,600}?)\s*»/.exec(l);
    if (!q || INTERNE.test(l)) continue;
    const phrase = q[1].replace(/\s+/g, ' ').trim();
    const lu = normaliserExpressionsDelai(phrase);
    const d = /(?:(?:dans|sous)\s+(?:un\s+)?d[ée]lai\s+(?:maxim(?:al|um)\s+)?de|dans les|dans|sous|en moins de|au plus tard dans)\s+(\d{1,3})\s*(minutes?|mn|min|heures?|h)(?![a-zà-ÿ])(?:\s+maxim(?:um|al))?/i.exec(lu);
    if (!d) continue;
    // Action : celle nommée au plus près avant le délai (« doit être informé … des interventions dans les 3 minutes » :
    // l'information, pas l'intervention), jamais la suite « à compter de… ».
    const avant = lu.slice(Math.max(0, d.index - 200), d.index);
    let action = '', pos = -1;
    for (const [rx, libelle] of ACTIONS) {
      for (const m of avant.matchAll(new RegExp(rx.source, 'gi'))) {
        // Nom d'objet après une action (« informé des interventions ») : l'action est le verbe qui le précède.
        const k = /^interven/i.test(m[0]) && /inform|pr[ée]ven|avert/i.test(avant.slice(Math.max(0, m.index! - 40), m.index)) ? -1 : m.index!;
        if (k > pos) { pos = k; action = libelle; }
      }
    }
    // Lieu seul (« … sur le site en alerte ») : une intervention, faute d'autre action nommée.
    if (!action && /sur (?:le )?site|sur place/i.test(avant)) action = 'Intervention sur site';
    const n = Number(d[1]);
    const valeur = /^m/i.test(d[2]) ? `${n} minute${n > 1 ? 's' : ''}` : `${n} heure${n > 1 ? 's' : ''}`;
    // « 15 minutes » ; « 15 min » si le titre dépasse la carte (34 caractères).
    const titre = !action ? '' : `${action} en ${valeur}`.length <= 34 ? `${action} en ${valeur}` : `${action} en ${n} ${/^m/i.test(d[2]) ? 'min' : 'h'}`;
    if (!titre || titre.length > 34 || vues.has(`${action}|${minutesDe(n, d[2])}`)) continue;
    vues.add(`${action}|${minutesDe(n, d[2])}`);
    // Texte de la carte, mots du DCE, 86 caractères au plus, coupé à la fin d'une proposition ou avant un complément, jamais sur
    // un mot outil : d'abord la proposition qui porte l'action (« Les interventions seront effectuées sur le site en alerte par
    // l'intervenant TLS »), avec son verbe ; sinon le point de départ du délai (« À compter de la réception de l'alarme au PC ») ;
    // sinon le délai lui-même (« Dans les 3 minutes qui suivent l'alerte »). Jamais deux cartes qui disent la même chose.
    const couper = (x: string, verbe: boolean): string => {
      const v = x.replace(/\s+/g, ' ').replace(/[.;,:\s]+$/, '').trim();
      if (!v) return '';
      const cap = (y: string) => y.charAt(0).toUpperCase() + y.slice(1);
      const okVerbe = (y: string) => !verbe || VERBE_CONJUGUE.test(y);
      if (v.length <= 86 && okVerbe(v) && texteEtapeEntier(cap(v))) return cap(v);
      const mots = v.split(' ');
      for (let k = mots.length - 1; k >= 4; k--) {
        const pre = mots.slice(0, k).join(' ');
        const dernier = mots[k - 1].toLowerCase().replace(/^(?:l|d)['’]/, '').replace(/['’,;:]$/, '');
        // Jamais fini sur un participe privé de son complément (« les consignes définies »).
        if (pre.length > 86 || MOTS_OUTILS.has(dernier) || /['’]$/.test(mots[k - 1]) || !okVerbe(pre) || /^[a-zà-ÿ]{4,}(?:ée|ées|és|ies|is)$/.test(dernier)) continue;
        if (!/^(?:de|du|des|d['’]\S*|au|aux|par|pour|à|sur|dans|en|qui|afin|lorsque|sauf|[a-zà-ÿ]{3,}(?:ée?s?|ie?s?))$/i.test(mots[k])) continue;
        if ((pre.match(/\(/g) || []).length !== (pre.match(/\)/g) || []).length) continue;
        return cap(pre);
      }
      return '';
    };
    const clause = avant.split(/[,;:]\s+/).pop() || '';
    const depart = (/(?:à compter de|à partir de|après|suivant)\s.+$/i.exec(lu.slice(d.index + d[0].length)) || [''])[0];
    const pleins = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !MOTS_OUTILS.has(w));
    const repete = (x: string) => etapes.some((e) => { const a = pleins(e.texte), b = pleins(x); return !!a.length && !!b.length && a.filter((w) => b.includes(w)).length / Math.min(a.length, b.length) >= 0.6; });
    const corps = [couper(clause, true), couper(depart, false), couper(lu.slice(d.index), false)].find((x) => x && x.split(/\s+/).length >= 4 && !repete(x)) || '';
    if (!corps) continue;
    etapes.push({ titre, texte: corps, role: etapes.length < 2 ? 'rouge' : 'bleu' });
  }
  // Même écriture des durées dans tous les titres (« 3 min » partout dès qu'un titre l'abrège).
  if (etapes.some((e) => /\d min$/.test(e.titre))) for (const e of etapes) e.titre = e.titre.replace(/(\d+) minutes?$/, '$1 min');
  if (etapes.length >= 2) {
    const resultat = resultatBesoin(t, etapes.map((e) => e.texte), RESULTAT_MEMOIRE_TYPE) || RESULTAT_MEMOIRE_TYPE;
    const spec = specProcessBesoin([...etapes, { titre: 'Votre résultat', texte: resultat, role: 'vert' }], 'flux');
    if (spec && !anomaliesSchemaBloc1(spec).length) return spec;
  }
  // À défaut : les prestations listées par le périmètre (« Le marché comprend : rondes, vacations de nuit, … »), en chevrons.
  const liste = /Le marché comprend\s*:\s*([^\n]+)/i.exec(partie(/^##\s+Le périmètre/i));
  if (liste) {
    const items = liste[1].replace(/[.\s]+$/, '').split(/\s*,\s*|\s+et\s+(?=[a-zà-ÿ])/).map((x) => x.trim()).filter((x) => x && x.length <= 26 && !INTERNE.test(x));
    const vus: string[] = [];
    for (const x of items) if (!vus.some((v) => normaliser(v).split(' ')[0] === normaliser(x).split(' ')[0])) vus.push(x);
    if (vus.length >= 2) {
      const res = resultatBesoin(t, [], RESULTAT_MEMOIRE_TYPE) || RESULTAT_MEMOIRE_TYPE;
      const spec = specProcessBesoin([...vus.slice(0, 3).map((x) => ({ titre: x.charAt(0).toUpperCase() + x.slice(1) })), { titre: 'Votre résultat', texte: res, role: 'vert' }], 'chevrons');
      if (spec && !anomaliesSchemaBloc1(spec).length) return spec;
    }
  }
  return null;
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

/**
 * Rubrique du plan qui traite le mieux une exigence citée au bloc 1 (T4-CONS-9, citedia 1461 : « … dans un délai de 15 minutes
 * maximum » → « La planification », « La télésurveillance… 24h/24 » → « L'intégration d'un nouveau marché ») : mots-clés et
 * titre de la rubrique écrits dans l'exigence (mots entiers), pondérés par leur rareté parmi les rubriques ; les
 * qualifications des agents (SSIAP, CQP APS, SST…) sont des attributs, jamais l'objet de l'exigence. Calcul sans modèle.
 */
export function scoresRenvoiBloc1(exigence: string, plan: PlanMemoireType, mt: MemoireType): Map<string, { score: number; position: number; cles: string[] }> {
  // Mots ramenés au singulier (« modifications de plannings » = « modification de planning »).
  const net = (x: string) => normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map((w) => (w.length > 3 ? w.replace(/(?<!s)[sx]$/, '') : w)).join(' ');
  // (le nom du métier, « agent de sécurité », est un attribut de l'agent, jamais l'objet de l'exigence : T5-CONS-5)
  const QUALIF = /\b(?:ssiap\s*\d?|cqp(?:\s*ap)?|ap|sst|psc\s*1|h0b0v?|hobo|carte professionnelle(?:\s+cnap)?|cnap|cap agent de securite|qualification|agents? (?:de (?:securite|surete)|de prevention et de securite))\b/g;
  const objet = ` ${net(exigence).replace(/\bagents? (?:de (?:securite|surete)|de prevention et de securite)\b/g, 'agent').replace(QUALIF, ' ').replace(/\s+/g, ' ')} `;
  const ids = new Set(plan.rubriques.filter((r) => r.mode !== 'besoin' && !/^b2_ref|^b2_references/.test(r.id)).map((r) => r.id));
  const rubs = mt.rubriques.filter((r) => ids.has(r.id));
  // Mots du vocabulaire de tout marché (« titulaire », « agent », « site »…) : jamais un mot-clé distinctif.
  const GENERIQUES = /^(?:titulaire|prestataire|candidat|agent|personnel|site|marche|prestation|client|acheteur|securite|surete|service|equipe|mission|moyen|besoin|votre|notre)$/;
  const cles = new Map(rubs.map((r) => [r.id, [...new Set([...r.mots_cles.map(net), ...net(r.titre).split(' ').filter((w) => w.length >= 6)])].filter((k) => k && !new RegExp(`^(?:${QUALIF.source})$`).test(k) && !GENERIQUES.test(k))]));
  const df = new Map<string, number>();
  for (const l of cles.values()) for (const k of l) df.set(k, (df.get(k) || 0) + 1);
  const out = new Map<string, { score: number; position: number; cles: string[] }>();
  for (const [id, l] of cles) {
    let score = 0, position = Infinity;
    const trouvees: string[] = [];
    for (const k of l) {
      const m = new RegExp(`\\s${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s)`).exec(objet);
      if (!m) continue;
      score += Math.log((rubs.length + 1) / (df.get(k) || 1)) * (k.includes(' ') ? 1.5 : 1);
      position = Math.min(position, m.index);
      trouvees.push(k);
    }
    if (score > 0) out.set(id, { score, position, cles: trouvees });
  }
  return out;
}

/**
 * Renvois du bloc 1 (« → notre réponse : « Titre », développée au bloc n ») à une rubrique qui ne traite pas l'exigence : une
 * rubrique citée dont aucun mot-clé ni mot du titre n'est dans l'exigence est remplacée par la rubrique du plan qui la traite
 * nettement (deux mots-clés au moins, ou un mot-clé de plusieurs mots, et un score au moins une fois et demie celui de la
 * suivante), avec son bloc. Sans rubrique qui traite nettement l'exigence, le renvoi du modèle reste (jamais un renvoi
 * déplacé sur un seul mot commun).
 */
export function renvoisBloc1Pertinents(texte: string, plan: PlanMemoireType, mt: MemoireType = chargerMemoireType()): { texte: string; corriges: number } {
  let corriges = 0;
  let partie = '';
  const titreNet = (x: string) => normaliser(x).replace(/\{\{[^}]*\}\}/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const lignes = String(texte || '').split('\n').map((l) => {
    if (/^##\s/.test(l)) { partie = l; return l; }
    if (!/^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie)) return l;
    const m = /^(.*?)\s*→\s*(notre r[ée]ponse\s*:\s*)«\s*([^»]+?)\s*»(\s*,\s*d[ée]velopp[ée]e?s?\s+au\s+bloc\s+)(\d)(.*)$/.exec(l);
    if (!m) return l;
    const cite = plan.rubriques.find((r) => titreNet(r.titre) === titreNet(m[3]));
    if (!cite) return l;
    const scores = scoresRenvoiBloc1(m[1].replace(/\*\*/g, ''), plan, mt);
    if (!scores.size) return l;
    const classes = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || a[1].position - b[1].position);
    const [meilleurId, meilleur] = classes[0];
    if (scores.has(cite.id) || meilleurId === cite.id) return l;
    const net = meilleur.cles.length >= 2 || meilleur.cles.some((k) => k.includes(' '));
    if (!net || (classes[1] && meilleur.score < 1.5 * classes[1][1].score)) return l;
    const r = plan.rubriques.find((x) => x.id === meilleurId)!;
    const b = plan.blocs.find((x) => x.id === r.bloc || x.rubriques.includes(r.id));
    if (!b) return l;
    corriges++;
    return `${m[1]} → ${m[2]}« ${r.titre.replace(/\{\{[^}]*\}\}/g, '').replace(/\s*:\s*$/, '').trim()} »${m[4]}${b.numero}${m[6]}`;
  });
  return { texte: lignes.join('\n'), corriges };
}

/**
 * Attentes et points de vigilance sans réponse (texte de secours : « - « citation du CCTP » », colonne « NOTRE RÉPONSE » vide,
 * T4-COH-2) : la rubrique du plan qui traite nettement l'exigence est citée (« → notre réponse : « Titre », développée au bloc
 * n »), par le même calcul que le contrôle des renvois ; sans rubrique nette, la puce reste telle quelle.
 */
export function renvoisManquantsBloc1(texte: string, plan: PlanMemoireType, mt: MemoireType = chargerMemoireType()): { texte: string; ajoutes: number } {
  let ajoutes = 0;
  let partie = '';
  const lignes = String(texte || '').split('\n').map((l) => {
    if (/^##\s/.test(l)) { partie = l; return l; }
    if (!/^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie) || !/^\s*[-*•]\s/.test(l) || /→/.test(l) || INTERNE.test(l)) return l;
    // Renvoi déjà écrit sans flèche (« selon « La planification », développée au bloc 4 », « (bloc 4) ») ou rubrique du plan déjà
    // citée : jamais un second renvoi (T5-CONS-1).
    if (/(?:d[ée]velopp|d[ée]taill|d[ée]crit|trait|pr[ée]sent)[ée]*e?s?\s+(?:au|aux|dans les?)\s+blocs?\s+\d|\(\s*blocs?\s+\d/i.test(l)) return l;
    const titreNet = (x: string) => normaliser(x).replace(/\{\{[^}]*\}\}/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if ([...l.matchAll(/«\s*([^»]{3,160}?)\s*»/g)].some((m) => plan.rubriques.some((r) => titreNet(r.titre) === titreNet(m[1])))) return l;
    const scores = [...scoresRenvoiBloc1(l.replace(/\*\*/g, ''), plan, mt).entries()].sort((a, b) => b[1].score - a[1].score || a[1].position - b[1].position);
    if (!scores.length) return l;
    const [id, s] = scores[0];
    // La rubrique doit traiter l'exigence dans son texte ou son titre (T5-CONS-5 : « réversibilité », mot-clé de rattachement
    // des engagements, n'est pas traitée par « La mise en place d'une prestation ») : sinon la colonne reste sans renvoi.
    const rubMt = mt.rubriques.find((x) => x.id === id);
    const netT = (x: string) => ` ${normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map((w) => (w.length > 3 ? w.replace(/(?<!s)[sx]$/, '') : w)).join(' ')} `;
    const traite = rubMt ? netT(`${rubMt.titre} ${String(rubMt.texte || '').replace(/\{\{[^}]*\}\}/g, ' ')}`) : '';
    if (!s.cles.some((k) => traite.includes(` ${k} `))) return l;
    // Colonne vide à remplir : un mot-clé suffit si la rubrique devance nettement les autres.
    if (scores[1] && s.score < 1.5 * scores[1][1].score) return l;
    const r = plan.rubriques.find((x) => x.id === id)!;
    const b = plan.blocs.find((x) => x.id === r.bloc || x.rubriques.includes(r.id));
    if (!b) return l;
    ajoutes++;
    return `${l.replace(/[\s.;]+$/, '')} → notre réponse : « ${r.titre.replace(/\{\{[^}]*\}\}/g, '').replace(/\s*:\s*$/, '').trim()} », développée au bloc ${b.numero}.`;
  });
  return { texte: lignes.join('\n'), ajoutes };
}

/** Commentaire sur les pièces du DCE reçues (« Le CCP transmis ne détaille pas… », « … à partir de cette pièce »), T5N-3. */
const COMMENTAIRE_PIECES = /\b(?:CC[TA]?P|CCATP|BPU|DPGF|DQE|RC|DCE|cahier des charges|dossier de consultation)\s+(?:transmis|fourni|re[çc]u|communiqu[ée])e?s?\b|\bcette pi[èe]ce\b|\bpi[èe]ces? (?:transmises?|fournies?|re[çc]ues?|analys[ée]es?)\b|\bne (?:peu(?:t|vent)|pourr(?:a|ont)) (?:donc )?pas [êe]tre (?:[ée]tablie?s?|d[ée]termin[ée]e?s?|fix[ée]e?s?|pr[ée]cis[ée]e?s?|d[ée]finie?s?|chiffr[ée]e?s?) (?:[àa] partir|sur la base|d['’]apr[èe]s)/i;
export function sansCommentairesPiecesBloc1(texte: string): { texte: string; retirees: string[] } {
  const retirees: string[] = [];
  const lignes = String(texte || '').split('\n');
  const out: string[] = [];
  let partie = '';
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (/^##\s/.test(l)) partie = l;
    const dansListe = /^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie);
    if (!dansListe) { out.push(l); continue; }
    // Flèche de réponse sur sa propre ligne (après une consultation ou une ligne vide) : rattachée à la dernière puce.
    if (/^\s*→\s*notre r[ée]ponse/i.test(l)) {
      const k = [...out.keys()].reverse().find((j) => /^\s*[-*•]\s/.test(out[j]));
      if (k !== undefined && !/→/.test(out[k])) out[k] = `${out[k].replace(/\s*\[À COMPLÉTER\]\s*$/, '').replace(/[\s.;]+$/, '')} ${l.trim()}`;
      else retirees.push(l.trim());
      continue;
    }
    if (!/^\s*[-*•]\s/.test(l)) { out.push(l); continue; }
    const corps = l.replace(/\*\*[^*]+\*\*\s*:?\s*/, '');
    if (COMMENTAIRE_PIECES.test(corps)) {
      retirees.push(l.trim());
      // Consultation de la puce (sur sa ligne ou la suivante) gardée seule ; ce qui suit son crochet (« . → notre réponse… ») retiré.
      const cons = [...l.matchAll(/\[CONSULTATION REQUISE\s*:[^\]]+\]/gi)].map((m) => m[0]);
      for (const c of cons) out.push(c);
      while (i + 1 < lignes.length && (/^\s*\[CONSULTATION REQUISE\s*:/i.test(lignes[i + 1]) || /^\s*→/.test(lignes[i + 1]) || (!lignes[i + 1].trim() && /^\s*→/.test(lignes[i + 2] || '')))) {
        i++;
        const c = /\[CONSULTATION REQUISE\s*:[^\]]+\]/i.exec(lignes[i]);
        if (c) out.push(c[0]); else if (lignes[i].trim()) retirees.push(lignes[i].trim());
      }
      continue;
    }
    // « [À COMPLÉTER] » laissé seul après une phrase complète (sans donnée à remplir) : retiré, la consultation reste.
    out.push(l.replace(/([.!?»])\s*\[À COMPLÉTER\]\s*(?=\s*$|\s*→)/, '$1'));
  }
  return { texte: out.join('\n'), retirees };
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
  // 0 ter. Attentes et points de vigilance (T5N-3, s2e 1501) : puce qui commente les pièces reçues (« Le CCP transmis ne détaille
  //    pas le dispositif… ; … ne peuvent donc pas être établis à partir de cette pièce. [À COMPLÉTER] ») retirée, sa consultation
  //    gardée seule (question à GSS, jamais imprimée) ; « [À COMPLÉTER] » laissé seul après une phrase complète retiré ; flèche
  //    « → notre réponse » écrite sur une ligne à part rattachée à sa puce.
  {
    const r = sansCommentairesPiecesBloc1(t);
    t = r.texte;
    retirees.push(...r.retirees);
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
  // 3. Numéros de bloc des renvois ; rubrique citée qui ne traite pas l'exigence remplacée par celle qui la traite (T4-CONS-9).
  let renvois = 0;
  if (plan) {
    const rp = renvoisBloc1Pertinents(t, plan);
    t = rp.texte;
    renvois += rp.corriges;
    const rm = renvoisManquantsBloc1(t, plan);
    t = rm.texte;
    renvois += rm.ajoutes;
  }
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
  // 3 ter. Puce d'une attente ou d'un point de vigilance qui finit par une donnée laissée en blanc (génération réelle caen 702 :
  //    « … → notre réponse : « … », développé au bloc 4. La capacité locale à tenir ce délai : [À COMPLÉTER]. ») : le bloc 1
  //    présente ce que GSS a compris et ce qu'il répond, jamais un doute ; la phrase est retirée, la question reste posée à GSS
  //    (sa ligne [CONSULTATION REQUISE] est gardée).
  {
    let partie = '';
    t = t.split('\n').map((l) => {
      if (/^##\s/.test(l)) { partie = l; return l; }
      if (!/^##\s+(?:Vos attentes|Les points de vigilance)/i.test(partie) || !/^\s*[-*•]\s/.test(l)) return l;
      return l.replace(/\s+[A-ZÀ-Ý][^.:;!?\n]{2,140}\s:\s*\[À COMPLÉTER\](?:⟦AC:\d+⟧)?\s*\.?(?=\s*$)/, (m) => { retirees.push(m.trim()); return ''; });
    }).join('\n');
  }
  // 3 bis. Rythme recopié deux fois du DCE (imm 701 : « 7j/7 7j/7 24h/24 », coquille du CCTP) : écrit une fois.
  t = t.replace(/(\d+\s?[a-zA-Z]{1,2}\s?\/\s?\d+)(?:\s+\1)+(?![\w/])/g, '$1');
  // 4. Ligne vide du tableau du périmètre (génération réelle caen 701 : « CAEN | Aucun poste fixe permanent prévu au CCTP |
  //    Sans objet | Sans objet | Sans objet ») : retirée ; sans autre ligne, le tableau entier (les prestations du périmètre
  //    sont décrites par les phrases qui le suivent).
  {
    const r = sansLigneVideDuPerimetre(t);
    t = r.texte;
    retirees.push(...r.retirees);
  }
  return { texte: t.trim(), retirees, renvois };
}

/** Cellule du tableau du périmètre qui commente l'absence d'une donnée (génération réelle caen 703 : « Qualification de poste non
 *  imposée au CCTP ») : un commentaire interne, jamais imprimé. */
const CELLULE_COMMENTAIRE = /\bnon\s+(?:impos[ée]e?s?|pr[ée]cis[ée]e?s?|indiqu[ée]e?s?|sp[ée]cifi[ée]e?s?|d[ée]fini(?:e|s|es)?|mentionn[ée]e?s?|exig[ée]e?s?|renseign[ée]e?s?)\b|\bsans\s+objet\b/i;

/** Cellule du tableau du périmètre qui ne dit rien (« Sans objet », « Aucun poste fixe… », « Non précisé », « — »). */
const CELLULE_VIDE = /^(?:sans objet|n\/?a|néant|aucun(?:e)?\b.*|non (?:précisé|prévu|applicable|concerné)e?s?|[—–-]*)$/i;

/**
 * Tableau « Le périmètre de la prestation demandée » du bloc 1 : une ligne dont la moitié au moins des cellules (hors site)
 * ne dit rien est retirée ; s'il ne reste aucune ligne, le tableau entier est retiré, ses phrases restent.
 */
export function sansLigneVideDuPerimetre(texte: string): { texte: string; retirees: string[] } {
  const lignes = String(texte || '').split('\n');
  const i = lignes.findIndex((l) => /^##\s+Le périmètre de la prestation demandée/.test(l.trim()));
  if (i < 0) return { texte, retirees: [] };
  let debut = i + 1;
  while (debut < lignes.length && !lignes[debut].trim()) debut++;
  if (debut >= lignes.length || !/^\s*\|/.test(lignes[debut])) return { texte, retirees: [] };
  let fin = debut;
  while (fin < lignes.length && /^\s*\|/.test(lignes[fin])) fin++;
  const cellules = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\*\*/g, '').trim());
  const separateur = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const retirees: string[] = [];
  const donnees: string[] = [];
  for (let k = debut + 1; k < fin; k++) {
    const l = lignes[k];
    if (separateur(l)) continue;
    const c = cellules(l).slice(1);
    const vides = c.filter((x) => CELLULE_VIDE.test(x)).length;
    if (c.length && vides * 2 >= c.length) retirees.push(l.trim()); else donnees.push(l);
  }
  // Colonne dont toutes les cellules gardées commentent l'absence de la donnée (« Qualification de poste non imposée au CCTP ») :
  // colonne retirée du tableau.
  const gardees = lignes.slice(debut, fin).filter((l) => !retirees.includes(l.trim()));
  const entete = gardees[0] ? cellules(gardees[0]) : [];
  const lignesDonnees = gardees.slice(1).filter((l) => !separateur(l));
  const colonnesCommentaire = entete.map((_, k) => k).filter((k) => k > 0 && lignesDonnees.length > 0 && lignesDonnees.every((l) => {
    const c = cellules(l)[k] || '';
    return CELLULE_COMMENTAIRE.test(c) || CELLULE_VIDE.test(c);
  }));
  if (!retirees.length && !colonnesCommentaire.length) return { texte, retirees };
  for (const k of colonnesCommentaire) retirees.push(`colonne « ${entete[k]} »`);
  const sansColonnes = (l: string) => {
    if (!colonnesCommentaire.length) return l;
    const c = l.trim().replace(/^\||\|$/g, '').split('|');
    return `|${c.filter((_, k) => !colonnesCommentaire.includes(k)).join('|')}|`;
  };
  const tableau = donnees.length ? gardees.map(sansColonnes) : [];
  const out = [...lignes.slice(0, debut), ...tableau, ...lignes.slice(fin)];
  return { texte: out.join('\n').replace(/\n{3,}/g, '\n\n'), retirees };
}

/** Rubriques du plan par bloc, pour que la compréhension renvoie aux process GSS qui la démontrent. */
/**
 * Cadre imposé (T1-COH-4) : renvoi « notre réponse : « Titre » » à une rubrique qui n'est ni une question ni un intitulé du
 * cadre (« → notre réponse : « La planification » distingue les vacations… ») : le titre est retiré et la phrase gardée
 * (« notre organisation distingue les vacations… », « nos procédures organisent la continuité »). `intitules` : texte des
 * questions et sections du cadre.
 */
export function renvoisHorsCadreRetires(texte: string, intitules: string): string {
  const cadre = ` ${normaliser(intitules).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const present = (titre: string) => {
    const t = normaliser(titre).replace(/[^a-z0-9]+/g, ' ').trim();
    return t.length >= 3 && cadre.includes(` ${t} `);
  };
  return String(texte || '').replace(/(notre\s+r[ée]ponse\s*:\s*)((?:«\s*[^«»]{2,120}?\s*»(?:\s*(?:,|et)\s*)?)+)/gi, (m, debut: string, titres: string) => {
    const liste = [...titres.matchAll(/«\s*([^«»]{2,120}?)\s*»/g)].map((x) => x[1]);
    if (liste.every(present)) return m;
    const gardes = liste.filter(present);
    const fin = /\s$/.test(titres) ? ' ' : '';
    if (gardes.length) return `${debut}${gardes.map((t) => `« ${t} »`).join(gardes.length > 1 ? ' et ' : '')}${fin}`;
    return `${debut}${liste.length > 1 ? 'nos procédures' : 'notre organisation'}${fin}`;
  });
}

export function sommaireProcess(plan: PlanMemoireType): string {
  return plan.blocs.filter((b) => !b.rubriques.every((id) => /^b1_/.test(id)))
    .map((b) => `Bloc ${b.numero} — ${b.titre} : ${plan.rubriques.filter((r) => r.bloc === b.id && r.ancienne_rubrique !== 'b_references').map((r) => r.titre).join(' ; ')}`)
    .join('\n');
}

export const CONSIGNE_COMPREHENSION = `Tu rédiges, pour GSS (Global Security Services, sécurité privée, Rouen), le bloc « Notre compréhension de votre besoin » de son mémoire technique : la première partie que lit l'acheteur, qui demande « qu'avez-vous compris de mon besoin ? ». GSS ne fonctionne qu'en process : 1 à 2 pages d'explication, puis 1 schéma de process lisible en 5 secondes (« on pense à ça, puis à ça, puis à ça, pour arriver à ça »).
Sois force de proposition : montre que GSS a lu le cahier des charges en détail (faits, chiffres et mots exacts du DCE) et ce qu'il propose concrètement à CE client, process par process, en renvoyant aux blocs du mémoire qui le démontrent.

TEXTE (Markdown, __MOTS__ mots, jamais plus), en quatre sous-parties « ## », dans cet ordre :
## Votre contexte et votre site — 3 à 6 lignes : l'acheteur, l'objet du marché, le ou les sites, la durée (seulement si elle figure dans les DONNÉES DU MARCHÉ ; sinon n'en parle pas, jamais [À COMPLÉTER] pour une donnée de l'acheteur) ; faits du DCE uniquement, sans qualificatif promotionnel ; ne redis pas la première phrase.
## Le périmètre de la prestation demandée — un tableau Markdown « Site | Poste | Jours et horaires | Qualification | Missions principales », une ligne par poste prévu au CCTP (aucun poste, horaire ni effectif ajouté ; sans poste fixe au CCTP, une ligne par prestation prévue, par exemple les rondes avec leurs jours et heures, jamais une ligne « Aucun poste » ou « Sans objet »), puis une phrase par prestation complémentaire prévue (rondes, interventions sur alarme, bons de commande, reprise du personnel…).
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

/**
 * Libellé d'un emplacement « [À COMPLÉTER] » d'une proposition écrit comme une consigne (T3N-9, parc_expo 1331 : « Définir
 * avec GSS le circuit interne de validation et d'envoi des alertes écrites : [À COMPLÉTER]. ») : le nom de la donnée, à la
 * voix de GSS (« Circuit interne de validation et d'envoi des alertes écrites : [À COMPLÉTER]. »), jamais un infinitif ni
 * « avec GSS » / « par GSS » imprimés dans le mémoire remis.
 */
export function libellesEmplacementsNominaux(texte: string): string {
  const VERBES = '(?:d[ée]finir|pr[ée]ciser|indiquer|lister|d[ée]crire|fixer|arr[êe]ter|confirmer|valider|choisir|organiser|d[ée]terminer|formaliser|[ée]tablir|identifier|nommer|d[ée]signer|compl[ée]ter|renseigner|fournir|communiquer|transmettre|d[ée]tailler)';
  return String(texte || '').split('\n').map((l) => {
    if (!l.includes('[À COMPLÉTER]')) return l;
    const m = new RegExp(`^(\\s*(?:[-*•]\\s+|\\d+[.)]\\s+)?)(\\*\\*)?${VERBES}\\s+(?:(?:avec|par|pour|à)\\s+GSS\\s+)?(?:(?:le|la|les|l['’]|un|une|des|du|de la|de l['’]|les modalités de|la liste des?)\\s*)?([^:]+?)(\\*\\*)?\\s*:\\s*\\[À COMPLÉTER\\]`, 'i').exec(l);
    let r = l;
    if (m) {
      const nom = m[3].replace(/\s+(?:avec|par|pour)\s+GSS\b/gi, '').trim();
      r = `${m[1]}${m[2] || ''}${nom.charAt(0).toUpperCase()}${nom.slice(1)}${m[4] || ''} : [À COMPLÉTER]${l.slice(m.index + m[0].length)}`;
    }
    return r.replace(/\s+(?:avec|par)\s+GSS(?=\s*:\s*\[À COMPLÉTER\])/gi, '');
  }).join('\n');
}

/** Négation de la sous-traitance ou de l'intérim dans la phrase (T5N-4). */
const NEGATION_INTERDIT = /(?:\bne\b|\bn['’])[^.;]{0,80}?\b(?:pas|aucun(?:e)?|jamais|nullement|plus)\b|\baucun(?:e)?\b[^.;]{0,60}?(?:sous[- ]?trait|int[ée]rim)|\bsans (?:recours|recourir|faire appel)\b|\b(?:exclut|exclue?s?|proscri\w*|interdi\w*)\b[^.;]{0,40}?(?:sous[- ]?trait|int[ée]rim)/i;

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
    const gardees = corps.split(/(?<=[.!?])\s+/).map((ph) => ph
      // Procédures ou consignes de l'acheteur laissées en blanc (T1-CONS-3 : « … sont appliquées suivant les procédures de
      // l'EPCF : [À COMPLÉTER]. ») : la phrase est vraie sans l'emplacement, qui n'appelle aucune donnée de GSS.
      .replace(/((?:suivant|selon|conform[ée]ment\s+aux?)\s+(?:les\s+)?(?:proc[ée]dures|consignes|r[èe]gles|modalit[ée]s|instructions)\s+(?:d[eu]\s+|de\s+la\s+|de\s+l['’]\s*|des\s+)[^:.;]{2,80}?)\s*:\s*\[À COMPLÉTER\](?:⟦AC:\d+⟧)?\s*(?=[.;]?\s*$)/i, '$1')).filter((ph) => {
      // (une phrase qui NIE la sous-traitance ou l'intérim, conforme à faits_gss.md, reste : « GSS n'envisage pas de recourir à
      // la sous-traitance », « Aucune partie … n'est confiée à un sous-traitant », « aucun contrat de sous-traitance n'est
      // établi », s2e 1501, T5N-4)
      if (INTERDIT.test(ph) && !NEGATION_INTERDIT.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion ||= /\[À COMPLÉTER\]/.test(ph); return false; }
      if (/\b(?:si|lorsque|quand|dont|notamment)\s*:?\s*\[À COMPLÉTER\]\s*[.;]?\s*$/i.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion = true; return false; }
      // Engagement réduit à un oui ou non laissé en blanc (ifsem 335 : « Engagement de GSS sur la couverture permanente de ce
      // poste et ces horaires : [À COMPLÉTER]. ») : la proposition est déjà « à valider », la phrase et sa question partent.
      if (/^\s*(?:\*\*)?\s*(?:engagement|confirmation|validation)\b[^:]{0,200}:\s*\[À COMPLÉTER\]\s*\.?\s*(?:\*\*)?\s*$/i.test(ph)) { retirees.push(ph.trim()); retireAvecQuestion = true; return false; }
      // Consigne à l'infinitif laissée en blanc (ifits 701 : « Définir avec GSS les consignes et modalités opérationnelles
      // spécifiques de la vacation de gardiennage du 30 : [À COMPLÉTER]. ») : une instruction, pas une réponse ; retirée, la
      // question reste posée à GSS.
      const instruction = /^\s*(?:\*\*)?\s*([A-ZÀ-Ý][a-zà-ÿ]+)\s[^:]{0,240}:\s*\[À COMPLÉTER\]/.exec(ph);
      if (instruction && /(?:er|ir|re)$/.test(normaliser(instruction[1])) && !PAS_INFINITIF.has(normaliser(instruction[1]))) {
        retirees.push(ph.trim());
        retireAvecQuestion = true;
        // Question à GSS à la deuxième personne (« Pouvez-vous définir … ? »), jamais « avec GSS » ni « Quelle réponse GSS
        // apporte-t-elle … » (T5-CONS-8).
        questions.push(questionExacte(ph.replace(/\[À COMPLÉTER\]|⟦AC:\d+⟧|[*_]/g, '').replace(/\s*:\s*\.?\s*$/, '').trim()));
        return false;
      }
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
  // Consigne restée en libellé d'un emplacement (dans une liste, T3N-9) : nom de la donnée à la voix de GSS.
  return { texte: libellesEmplacementsNominaux(out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/(^|\n)(#{2,4} [^\n]+)\n+(?=#{2,4} |$)/g, '$1').trim()), retirees, questions };
}

/**
 * Consultation d'une proposition qui demande à GSS une donnée écrite dans le DCE (cstb 551, T7CS-6 : « [CONSULTATION REQUISE :
 * Obtenir la liste exhaustive des pièces et attestations réglementaires de vigilance prévue au CCP] » sous « La liste détaillée
 * des pièces à transmettre est la suivante : [À COMPLÉTER] ») : la référence du DCE remplace l'emplacement (« les pièces et
 * attestations sur l'honneur prévues à l'article D8222-5 … du code du travail ») et la consultation disparaît ; introuvable
 * dans le DCE, la question est posée à l'acheteur, jamais à GSS (faits_gss.md : pas de [À COMPLÉTER] pour une donnée du DCE).
 */
export function consultationsDuDce(texte: string, dce: string): { texte: string; remplacees: string[] } {
  const remplacees: string[] = [];
  const VIDES = new Set(['obtenir', 'recuperer', 'consulter', 'demander', 'liste', 'exhaustive', 'complete', 'detaillee', 'prevue', 'prevues', 'prevu', 'prevus', 'mentionnee', 'mentionnees', 'citee', 'citees', 'ccp', 'cctp', 'ccap', 'dce', 'marche', 'cahier', 'charges', 'reglement', 'consultation', 'aupres', 'acheteur']);
  const pleins = (x: string) => [...new Set(normaliser(x).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !VIDES.has(w) && !MOTS_OUTILS.has(w)))];
  const phrasesDce = String(dce || '').replace(/\r/g, '').replace(/-\n/g, '-').replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-ZÀ-Ý])/);
  const lignes = String(texte || '').split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const m = /^\s*\[CONSULTATION REQUISE\s*:\s*((?:obtenir|r[ée]cup[ée]rer|consulter|demander|se procurer)\b[^\]]*?(?:pr[ée]vue?s?|mentionn[ée]e?s?|cit[ée]e?s?|fix[ée]e?s?|d[ée]finie?s?)\s+(?:au|à l['’]|à la|aux|dans le|dans la|par le|par la)\s*(?:CCP|CCTP|CCAP|RC|DCE|march[ée]|cahier des charges|r[èe]glement de (?:la )?consultation)[^\]]*?)\.?\s*\]\s*$/i.exec(lignes[i]);
    if (!m) continue;
    const cles = pleins(m[1]);
    if (cles.length < 2) continue;
    // Phrase du DCE qui contient au moins 3 mots sur 4 de la donnée demandée.
    const phrase = phrasesDce.find((p) => { const n = normaliser(p); return cles.filter((w) => n.includes(w)).length / cles.length >= 0.75; });
    // Emplacement de la ligne précédente : « … est la suivante : [À COMPLÉTER]. ».
    const k = i - 1;
    if (phrase && k >= 0 && /\[À COMPLÉTER\]/.test(lignes[k]) && (lignes[k].match(/\[À COMPLÉTER\]/g) || []).length === 1) {
      // Objet de la phrase du DCE : depuis l'article du premier mot de la donnée, jusqu'à la fin de la phrase ou avant
      // « conformément », « sous peine », « afin de ».
      const nP = normaliser(phrase);
      // Début de l'objet : l'occurrence d'un mot de la donnée suivie du plus grand nombre des autres (« les pièces et
      // attestations … », jamais « des pièces à fournir au stade de l'attribution » qui précède).
      let pos = -1, meilleur = 0;
      for (const w of cles) for (let x = nP.indexOf(w); x >= 0; x = nP.indexOf(w, x + 1)) {
        const score = cles.filter((v) => nP.slice(x, x + 80).includes(v)).length;
        if (score > meilleur || (score === meilleur && x < pos)) { meilleur = score; pos = x; }
      }
      const debut = phrase.slice(0, pos).search(/(?:\b(?:les|la|le|des|du)\s+|\bl['’])$/i);
      const objet = phrase.slice(debut >= 0 ? debut : pos).replace(/\s*,?\s*(?:conform[ée]ment|sous peine|afin de|dans les conditions)\b.*$/i, '').replace(/[.;\s]+$/, '').trim();
      if (objet.split(/\s+/).length >= 4 && objet.length <= 300) {
        lignes[k] = lignes[k].replace(/\[À COMPLÉTER\]/, objet);
        remplacees.push(lignes[i].trim());
        lignes.splice(i, 1);
        i--;
        continue;
      }
    }
    // Introuvable : question à l'acheteur.
    lignes[i] = `[CONSULTATION REQUISE : À demander à l'acheteur : ${m[1].replace(/^(?:obtenir|r[ée]cup[ée]rer|consulter|demander|se procurer)\s+/i, '').trim()}]`;
  }
  return { texte: lignes.join('\n'), remplacees };
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
const ARTICLE_NOM_COMMUN: Record<string, string> = { site: 'le', sites: 'les', batiment: 'le', batiments: 'les', campus: 'le', siege: 'le', locaux: 'les', parking: 'le', parkings: 'les', immeuble: "l'", residence: 'la', etablissement: "l'", etablissements: 'les', ensemble: "l'", parc: 'le', parcs: 'les', equipement: "l'", equipements: 'les', bureaux: 'les', entrepot: "l'", entrepots: 'les' };
const ARTICLE_NOM_PROPRE: Record<string, string> = { centre: 'le', hotel: "l'", universite: "l'", mairie: 'la', hopital: "l'", musee: 'le', institut: "l'", theatre: 'le', stade: 'le', palais: 'le', maison: 'la', cite: 'la', domaine: 'le', chateau: 'le', gare: 'la', port: 'le', mediatheque: 'la', bibliotheque: 'la', ecole: "l'", college: 'le', lycee: 'le', piscine: 'la', salle: 'la', agence: "l'", direction: 'la', prefecture: 'la', tribunal: 'le', archives: 'les', campus: 'le', complexe: 'le', espace: "l'", pole: 'le', base: 'la', caserne: 'la', jardin: 'le', jardins: 'les' };
// Commune à article (T4G-9) : « du Havre », « des Andelys », « du Tréport » ; « de La Rochelle » (article féminin gardé).
const deCommune = (v: string) => {
  const a = /^(Le|Les)\s+(.+)$/.exec(v);
  if (a) return `${a[1] === 'Le' ? 'du' : 'des'} ${a[2]}`;
  return /^[aeiouyàâéèêëîïôöûüh]/i.test(v) ? `d’${v}` : `de ${v}`;
};
/**
 * Site du marché écrit dans une phrase (« La prestation porte sur le site du CSTB Grenoble — 24 rue… », T7CS-4, T7N-6) :
 * article et minuscule pour un nom commun (« Site du CSTB » → « le site du CSTB »), article pour un nom propre (« le
 * Centre Henri Becquerel »), commune seule écrite comme une commune (« CAEN — 20 rue… » → « le site de Caen — 20 rue… »).
 */
export function siteDansPhrase(nom: string, villes: string[] = []): string {
  const n = String(nom || '').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  // Commune à article nommée comme site (« LE HAVRE — 20 rue de Paris », « Les Andelys », T4G-9) : « le site du Havre — … »,
  // reconnue avant la règle de l'article.
  {
    const [t0, ...r0] = n.split(/\s+[—–-]\s+/);
    const v0 = /^(?:le|la|les)\s+\S/i.test(t0) ? villes.find((v) => cleCommune(v) === cleCommune(t0)) : undefined;
    if (v0) return `le site ${deCommune(v0)}${r0.length ? ` — ${r0.join(' — ')}` : ''}`;
  }
  // Article entier en minuscules, nom gardé tel quel (« LES LICES » → « les LICES », jamais « lES LICES », T9-COH-4).
  if (/^(?:le|la|les)\s+\S|^l['’]\s*\S/i.test(n)) return n.replace(/^(?:les|le|la)(?=\s)|^l(?=['’])/i, (a) => a.toLowerCase());
  const [tete, ...reste] = n.split(/\s+[—–-]\s+/);
  const suite = reste.length ? ` — ${reste.join(' — ')}` : '';
  const premier = (/^[\p{L}]+/u.exec(n) || [''])[0];
  const k = premier.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Nom qui commence par un nom de lieu (« Site VESTA », « Parc des Expositions de Rouen », « Lycée de Beauvais ») : jamais
  // lu comme une commune (« le site de Site VESTA », T8-COH-3).
  const ville = ARTICLE_NOM_COMMUN[k] || ARTICLE_NOM_PROPRE[k] ? undefined : villes.find((v) => cleCommune(v) === cleCommune(tete));
  if (ville) return `le site ${deCommune(ville)}${suite}`;
  const lier = (a: string, x: string) => (a.endsWith("'") ? `${a.replace("'", '’')}${x}` : `${a} ${x}`);
  if (ARTICLE_NOM_COMMUN[k] && premier !== premier.toUpperCase()) return lier(ARTICLE_NOM_COMMUN[k], `${premier.toLowerCase()}${n.slice(premier.length)}`);
  if (ARTICLE_NOM_COMMUN[k]) return lier(ARTICLE_NOM_COMMUN[k], `${premier.toLowerCase()}${n.slice(premier.length)}`);
  if (ARTICLE_NOM_PROPRE[k]) return lier(ARTICLE_NOM_PROPRE[k], n);
  return `le site ${n}`;
}

/** Phrase des sites du texte de secours : sans parenthèse de communes déjà écrites dans le site (T7CS-4, T7N-6). */
export function phraseSites(sites: string[], villes: string[], communes: Record<string, string> = {}): string {
  const liste = sites.map((x) => siteDansPhrase(x, villes)).filter(Boolean);
  if (!liste.length) return '';
  const ecrit = cleCommune(liste.join(' '));
  const vues = new Set<string>();
  const manquantes = villes.filter((v) => {
    const c = cleCommune(v);
    // Commune à article écrite contractée (« du Havre », « des Andelys ») : déjà écrite.
    const sansArticle = c.replace(/^(?:le|la|les)\s+/, '');
    if (!c || vues.has(c) || ` ${ecrit} `.includes(` ${c} `) || (sansArticle !== c && new RegExp(`(?:^| )(?:du|des|de la|le|la|les) ${sansArticle}(?: |$)`).test(ecrit))) return false;
    vues.add(c);
    return true;
  });
  // Plusieurs sites (T10-COH-5) : chaque commune manquante est écrite après SON site (« l'Hôpital Nord (Marseille) et le
  // Centre hospitalier de Gap »), jamais après la liste entière ; une commune qui ne se rattache à aucun site n'est pas écrite.
  // Plusieurs sites nommés chacun par sa commune (« Rouen », « Le Havre ») : « les sites de Rouen et du Havre » (T4G-9).
  if (sites.length > 1 && liste.length === sites.length && liste.every((x) => /^le site (?:de |d’|du |des )/.test(x) && !/ — /.test(x))) {
    return `La prestation porte sur les sites ${listeFr(liste.map((x) => x.replace(/^le site /, '')))}.`;
  }
  if (sites.length > 1) {
    const avec = sites.map((x) => {
      const t = siteDansPhrase(x, villes);
      const v = communes[x];
      return t && v && manquantes.includes(v) ? `${t} (${v})` : t;
    }).filter(Boolean);
    return `La prestation porte sur ${listeFr(avec)}.`;
  }
  return `La prestation porte sur ${listeFr(liste)}${manquantes.length ? ` (${manquantes.join(', ')})` : ''}.`;
}

/**
 * Périmètre (rédigé par le modèle pour cadrer la rédaction) imprimé dans le texte de secours : une donnée laissée à GSS
 * (« le délai d'intervention doit être précisé par GSS ») devient un emplacement « [À COMPLÉTER] » avec sa question
 * exacte, jamais un commentaire interne imprimé (T7CS-4).
 */
export function perimetreSecours(perimetre: string): string {
  const FEMININ = /^(?:dur[ée]e|fr[ée]quence|p[ée]riodicit[ée]|modalit[ée]|organisation|proc[ée]dure|m[ée]thode|composition|qualification|date|heure|r[ée]ponse|capacit[ée]|liste)s?\b/i;
  return String(perimetre || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const libelle = (/^[-*•]?\s*([^:;.]{3,60}?)\s*:/.exec(l) || [])[1]?.trim() || '';
    const ligne = l.replace(/([,;]\s*|\.\s+|\s)(?:(?:le|la|les|l['’])\s*)?([^,;.:]{3,80}?)\s+(?:doit|doivent|devra|devront|reste|restent)\s+(?:être\s+)?(?:à\s+)?(?:précisée?s?|préciser|indiquée?s?|indiquer|fixée?s?|fixer|définie?s?|définir|proposée?s?|proposer)\s+par\s+(?:GSS|le titulaire|le candidat|le prestataire|l['’]entreprise)(?=\s*[.;]|\s*$)/i,
      (_m: string, sep: string, objet: string) => {
        const o = objet.trim().replace(/^(?:le|la|les|l['’])\s*/i, '');
        const pluriel = /^\S+s\b/.test(o) && !/^(?:d[ée]lais|temps|prix|poids)\b/i.test(o);
        const quel = FEMININ.test(o) ? (pluriel ? 'quelles' : 'quelle') : (pluriel ? 'quels' : 'quel');
        const question = libelle && !normaliser(o).includes(normaliser(libelle)) ? `${libelle} : ${quel} ${o} GSS annonce-t-elle ?` : `${quel.charAt(0).toUpperCase()}${quel.slice(1)} ${o} GSS annonce-t-elle ?`;
        return `${sep}${o} : [À COMPLÉTER : ${question}]`;
      });
    return /^[-*•]/.test(ligne) ? ligne : `- ${ligne}`;
  }).join('\n');
}

/**
 * Horaires du texte de secours regroupés par période (T1F-8 : 16 horaires de Fontainebleau cités un par ligne, page du bloc 1
 * débordante) : « - **Mars, avril et octobre** : « Jardin Anglais : une fermeture à 17h30 » ; « Jardin de Diane : … » ». Chaque
 * citation reste mot pour mot ; un horaire sans période garde sa ligne.
 */
export function horairesParPeriode(horaires: string[], cite: (x: string) => string): string[] {
  const groupes = new Map<string, string[]>();
  const ordre: Array<string | { seul: string }> = [];
  for (const h of horaires) {
    const t = h.replace(/\s+/g, ' ').trim();
    const periode = periodeEnTete(t);
    const reste = periode ? t.replace(/^[^:]+:\s*/, '').trim() : '';
    if (!periode || !reste) { ordre.push({ seul: t }); continue; }
    const cle = normaliser(periode);
    if (!groupes.has(cle)) { groupes.set(cle, []); ordre.push(cle); }
    groupes.get(cle)!.push(reste);
  }
  const libelle = (cle: string) => { const p = periodeEnTete(`${horaires.find((h) => normaliser(periodeEnTete(h.replace(/\s+/g, ' ').trim())) === cle) || ''}`); return p; };
  return ordre.map((x) => {
    if (typeof x !== 'string') return cite(x.seul);
    const l = groupes.get(x)!;
    if (l.length === 1) return cite(`${libelle(x)} : ${l[0]}`);
    const p = libelle(x);
    return `- **${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase().replace(/\b(avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre|janvier|f[ée]vrier|mars)\b/gi, (m) => m.toLowerCase())}** : ${l.map((r) => cite(r).replace(/^-\s*/, '')).join(' ; ')}`;
  });
}

export function texteSecoursBesoin(d: DonneesBesoin, perimetre = ''): string {
  const parties: string[] = ['## Votre contexte et votre site', d.amorce || (d.client ? `${d.client.charAt(0).toUpperCase() + d.client.slice(1)} lance le marché ${d.objet ? `« ${d.objet} »` : 'de sécurité privée'}.` : `Vous nous consultez pour ${d.objet || 'une prestation de sécurité privée'}.`)];
  const sites = phraseSites(d.sites, d.villes, d.communesDesSites || {});
  if (sites) parties.push(sites);
  // Horaires et obligations du CCTP cités mot pour mot, entre guillemets : jamais passés à la voix de GSS (« au
  // titulaire » devenu « à GSS » au nettoyage final, caen 475, T8CS-1).
  // (guillemets intérieurs écrits “ ” : la citation entière reste une seule citation pour le passage à la voix de GSS).
  const cite = (x: string) => `- « ${x.replace(/\s+/g, ' ').trim().replace(/«\s*/g, '“').replace(/\s*»/g, '”')} »`;
  const perimetreEcrit = perimetre ? perimetreSecours(perimetre) : d.prestations.length ? `Le marché comprend : ${d.prestations.join(', ')}.` : '';
  const horaires = horairesLisibles(d.horaires);
  // Sous-titre imprimé seulement s'il a un contenu (jamais suivi directement d'un autre titre, T8-COH-1).
  if (perimetreEcrit || horaires.length) parties.push('## Le périmètre de la prestation demandée');
  if (perimetreEcrit) parties.push(perimetreEcrit);
  if (horaires.length) parties.push(`Horaires imposés par le cahier des charges :\n${horairesParPeriode(horaires, cite).join('\n')}`);
  // Une obligation qui annonce une liste (« Au minimum 72 heures avant la prise de service d'un agent, le titulaire
  // doit : ») n'est jamais imprimée seule, sans sa liste (ifsem, T7CS-4).
  const obligations = obligationsLisibles(d.obligations).filter((o) => !CLAUSE_CONTRACTUELLE.test(o));
  if (obligations.length) {
    parties.push('## Vos attentes et nos engagements');
    parties.push(`Nous nous engageons sur chacune des obligations chiffrées du cahier des charges :\n${obligations.slice(0, 8).map(cite).join('\n')}`);
  }
  return parties.join('\n\n');
}

// ─── Premier message de l'assistant ──────────────────────────────────────────────────────────────

/**
 * Premier message de l'assistant (conversation de l'état) : les propositions de réponse de l'IA aux questions
 * nouvelles du DCE, avec leur page, et la façon de les valider, de les modifier ou de les supprimer.
 */
// ─── Phrases du texte de GSS adaptées au CCTP (D8) ──────────────────────────────────────────────

/**
 * Phrase de GSS adaptée à une exigence du CCTP par une passe de cohérence (chiffres, horaires) : signalée à GSS (D8). Le
 * signalement (consultations, premier message de l'assistant) est fait par adaptations_cctp.ts (SuiviAdaptations,
 * consultationsAdaptations, messageAdaptations).
 */
export interface AdaptationCctp { id: string; avant: string; apres: string; exigence: string }

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

/** Premier message de l'assistant : phrases ajoutées au texte de GSS par l'adaptation au CCTP (rédigées par l'IA, T5N-5). */
export function messageAjoutsAdaptation(ajouts: Array<{ titre: string; phrase: string }>): string {
  if (!ajouts.length) return '';
  const n = ajouts.length;
  return [
    `J'ai ajouté au texte de GSS ${n === 1 ? 'une phrase rédigée' : `${n} phrases rédigées`} d'après le cahier des charges, pour une exigence que le mémoire type ne couvrait pas. À relire avant la remise :`,
    ...ajouts.map((a) => `- « ${a.titre} » : « ${a.phrase.replace(/\s+/g, ' ').trim()} »`),
    '',
    'Pour chacune, vous pouvez la valider telle quelle, la modifier (« Dans la rubrique …, remplace … par … ») ou la supprimer (« Dans la rubrique …, supprime la phrase … »).',
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

/**
 * Jalon d'envoi des plannings au client dans « La planification » du mémoire (« J-3 : envoi des plannings à l'ACOSS »), tel
 * que le mémoire l'imprime (jalon de GSS, ou celui que le DCE impose). null s'il n'y en a pas.
 */
export function jalonEnvoiClient(planification: string): string | null {
  const m = /^\s*(?:[-*•]\s*)?(J\s*-\s*\d+)\s*:\s*envoi des plannings\s+(?:au|à|aux)\s/im.exec(String(planification || '').replace(/\*\*/g, ''));
  return m ? m[1].replace(/\s+/g, '') : null;
}

/**
 * Texte rédigé par l'IA (proposition D5, engagement) qui donne au client un autre jalon d'envoi des plannings que « La
 * planification » (génération réelle caen 701 : « le planning mensuel nominatif … est transmis à l'ACOSS à J-10 » alors que
 * le calendrier de GSS imprime « J-3 : envoi des plannings à l'ACOSS ») : le jalon de « La planification » est repris.
 * Seulement une phrase qui parle de planning, d'un envoi et du client (son nom ou « au client »).
 */
export function harmoniserJalonPlanning(texte: string, jalon: string, client: string): { texte: string; corriges: string[] } {
  const corriges: string[] = [];
  const nomClient = normaliser(String(client || '')).replace(/^(?:l|la|le|les)\s*['’]?\s*/, '').trim();
  const sortie = String(texte || '').split('\n').map((l) => l.split(/(?<=[.!?])\s+/).map((ph) => {
    const n = normaliser(ph);
    if (!/planning/.test(n) || !/transmis|envoy|communiqu|remis|adress/.test(n)) return ph;
    if (!(nomClient && n.includes(nomClient)) && !/\bau client\b/.test(n)) return ph;
    // Un seul jalon dans la phrase (jamais « J-10 aux agents, J-3 au client » ramené à un seul jalon).
    if ((ph.match(/\bJ\s*-\s*\d+\b/g) || []).length !== 1) return ph;
    const nouvelle = ph.replace(/\bJ\s*-\s*(\d+)\b/g, (m) => (m.replace(/\s+/g, '') === jalon ? m : jalon));
    if (nouvelle !== ph) corriges.push(ph.trim());
    return nouvelle;
  }).join(' ')).join('\n');
  return { texte: sortie, corriges };
}

/**
 * Engagement de couverture qui redit une phrase déjà écrite dans le texte de la même rubrique (génération réelle citedia 701,
 * « Le contrôleur de rondes » : « Au minimum trois rondes distinctes sont réalisées… » dans le texte, puis l'engagement « GSS
 * assurera au minimum trois rondes distinctes… » ; « Toutes les rondes planifiées, sauf dans les parcs en enclos, sont tracées
 * par des pointeaux NFC/RFID… » puis « GSS tracera toutes les rondes planifiées… ») : la puce est retirée quand 80 % de ses mots
 * porteurs (radicaux de 6 lettres, hors verbes d'engagement) et tous ses chiffres sont dans une phrase du texte, ou dans
 * deux phrases qui se suivent. Le texte de GSS n'est jamais touché ; le sous-titre est retiré s'il ne reste aucune puce.
 */
export function sansEngagementsDejaDits(texte: string): { texte: string; retirees: string[] } {
  const TITRE = '## Nos engagements sur les exigences du cahier des charges';
  const i = texte.indexOf(TITRE);
  if (i < 0) return { texte, retirees: [] };
  const NEUTRES = /^(?:respec|fera|ferons|faire|veille|engage|mettra|mettre|oeuvre|garant|sera|seront|pourra|devra|toutes?|tous|leurs?|avec|dans|pour|sans|sous|ainsi|chaque|selon|cette|ces|ses|aupres|assure|assura|tracer|traces|realis)/;
  const radicaux = (t: string) => new Set(normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !NEUTRES.test(w)).map((w) => w.slice(0, 6)));
  const chiffres = (t: string) => new Set(t.match(/\d+(?:[.,]\d+)?/g) || []);
  const avant = texte.slice(0, i);
  const phrases = avant.replace(/\*\*/g, '').split(/(?<=[.!?;])\s+|\n+/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 5);
  const fenetres = phrases.map((p, k) => `${p} ${phrases[k + 1] || ''}`);
  const lignes = texte.slice(i + TITRE.length).split('\n');
  const retirees: string[] = [];
  const gardees = lignes.filter((l) => {
    if (!/^\s*[-*•]\s/.test(l)) return true;
    const r = radicaux(l), c = chiffres(l);
    if (r.size < 4) return true;
    const dit = fenetres.some((f) => {
      const rf = radicaux(f), cf = chiffres(f);
      return [...c].every((x) => cf.has(x)) && [...r].filter((w) => rf.has(w)).length >= 0.8 * r.size;
    });
    if (dit) retirees.push(l.replace(/^\s*[-*•]\s*/, '').trim());
    return !dit;
  });
  if (!retirees.length) return { texte, retirees };
  const reste = gardees.join('\n').trim();
  return { texte: /^\s*[-*•]\s/m.test(reste) ? `${avant.trimEnd()}\n\n${TITRE}\n\n${reste}` : `${avant.trimEnd()}${reste ? `\n\n${reste}` : ''}`, retirees };
}

/** Mots en -er, -ir, -re qui ne sont pas des infinitifs (noms, adjectifs, possessifs). */
/**
 * Phrase ajoutée au texte de GSS par l'adaptation, recopiée du CCTP à l'infinitif (générations réelles du 3 octobre 2026 :
 * caen 701 « Effectuer la ronde d'ouverture du lundi au vendredi à 05 h 30… », citedia 701 « Avant démarrage, raccorder et
 * paramétrer les communications nécessaires au PC TLS… ») : une phrase sans sujet au milieu du texte de GSS. Elle devient un
 * engagement de GSS (« GSS s'engage à effectuer… », « Avant démarrage, GSS s'engage à raccorder… »), mots du CCTP gardés.
 */
export function phraseAjouteeConjuguee(phrase: string): string {
  const t = String(phrase || '');
  const m = /^(\s*(?:[-*•]\s+)?)((?:(?:Avant|Après|Dès|Lors|Pendant|En cas|Au|À|Pour|Sur|Dans|Chaque|Tous|Toutes)\b[^,.;:]{0,70},\s*)?)([A-ZÀ-Ýa-zà-ÿ][a-zà-ÿ]+)(\s+.*)$/su.exec(t);
  if (!m) return t;
  const mot = normaliser(m[3]);
  if (!/(?:er|ir|re|oir)$/.test(mot) || PAS_INFINITIF.has(mot) || mot.length < 4) return t;
  // Infinitif confirmé par ce qui le suit : un déterminant, une préposition, un adverbe ou un second infinitif coordonné.
  if (!/^\s+(?:la|le|les|l['’]|un|une|des|du|de|d['’]|à|au|aux|chaque|tout|toute|tous|toutes|son|sa|ses|leur|leurs|sans|immédiatement|systématiquement|en|sur|et\s+[a-zà-ÿ]+(?:er|ir|re))(?=[\s,.;'’]|$)/i.test(m[4])) return t;
  const verbe = m[2] ? m[3].charAt(0).toLowerCase() + m[3].slice(1) : m[3].charAt(0).toLowerCase() + m[3].slice(1);
  const tete = m[2] ? `${m[2]}GSS s'engage à ` : "GSS s'engage à ";
  return `${m[1]}${tete}${verbe}${m[4]}`;
}
