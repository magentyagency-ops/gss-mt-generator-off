/**
 * CADRE IMPOSÉ ET FORMAT COURT SUR LE MÉMOIRE TYPE (refonte 2026-10, consigne 5 du dirigeant de GSS) :
 * « quand le client impose un ordre, on reprend exactement le mémoire de base et on ne l'adapte que sur la
 * construction (l'ordre) ; on ne change rien d'autre : on restructure et on adapte juste le texte au client ».
 *
 *  - Format court imposé par le RC : chaque rubrique du mémoire type est rattachée à une partie du plan du RC ; chaque
 *    partie assemble, dans l'ordre du mémoire type, les textes publipostés de ses rubriques ; la limite de pages est
 *    tenue d'abord en RETIRANT les sous-parties puis les rubriques les moins prioritaires (sélection), et seulement
 *    ensuite par condensation.
 *  - Cadre de réponse .docx : pour une réponse développée, le texte des rubriques du mémoire type qui traitent la
 *    question est fourni comme texte de référence, à reprendre tel quel (noms, sites, chiffres adaptés) ; la fidélité de
 *    la réponse est contrôlée.
 *
 * Fonctions pures (aucun appel réseau) : les appels au modèle restent dans memoire_generator.ts.
 */
import {
  normaliser, fidelite, decouperSousParties, rechercherRubriques, lireJson, SEUIL_FIDELITE, motsDePhrase, similarite,
  faitsDePhrase, faitsCompatibles, nombresAutorisesDe,
  type MemoireType, type RubriqueMemoireType, type PlanMemoireType, type SousPartie,
} from './memoire_type';

export interface PartieRC { id: string; title: string; attendu?: string }

const compterMots = (t: string) => (String(t || '').match(/[\wÀ-ÿ'’-]+/g) || []).length;
/** Mots significatifs (5 lettres et plus, sans accents ni pluriel) d'un texte. */
const motsSignificatifs = (t: string) => new Set(normaliser(t).split(/[^a-z]+/).filter((w) => w.length >= 5).map((w) => w.replace(/s$/, '')));
/** Similarité sémantique minimale (text-embedding-3-small) entre une question du cadre et une rubrique reprise. */
export const SEUIL_SEMANTIQUE = 0.45;
const VIDES = new Set(['dans', 'votre', 'notre', 'cette', 'selon', 'ainsi', 'chaque', 'entre', 'prestation', 'service', 'securite', 'marche', 'titulaire', 'candidat', 'moyen', 'mise', 'place']);

// ─── Format court : répartition des rubriques entre les parties du RC ────────────────────────────

/** Une partie du RC qui demande la compréhension du besoin (bloc « Notre compréhension de votre besoin »). */
export const PARTIE_COMPREHENSION = /compr[ée]hension|enjeux|besoins?\b|attentes|contexte|analyse du (?:cahier|cctp|site)|sujétions/i;

/** Score lexical d'une rubrique pour une partie du RC : mots-clés de la rubrique, puis mots du titre. */
function scorePartie(r: RubriqueMemoireType, p: PartieRC): number {
  const cible = `${p.title}. ${p.attendu || ''}`;
  const lexical = rechercherRubriques({ rubriques: [r] } as MemoireType, cible, 1)[0]?.score || 0;
  const titre = motsSignificatifs(r.titre);
  const partie = motsSignificatifs(cible);
  let communs = 0;
  for (const w of titre) if (!VIDES.has(w) && partie.has(w)) communs++;
  return lexical + communs;
}

/**
 * Repli déterministe (modèle indisponible) : chaque rubrique du plan va à la partie du RC qui lui ressemble le plus ;
 * sans aucun mot commun, à la partie qui reçoit déjà le plus de rubriques du même bloc.
 */
export function repartitionLexicale(mt: MemoireType, plan: PlanMemoireType, parties: PartieRC[]): Record<string, string[]> {
  const parPartie: Record<string, string[]> = Object.fromEntries(parties.map((p) => [p.id, [] as string[]]));
  const sansScore: string[] = [];
  const blocDe = new Map(plan.rubriques.map((r) => [r.id, r.bloc]));
  for (const rp of plan.rubriques) {
    const r = mt.rubriques.find((x) => x.id === rp.id);
    if (!r) continue;
    if (r.mode === 'besoin') {
      const p = parties.find((x) => PARTIE_COMPREHENSION.test(`${x.title} ${x.attendu || ''}`));
      if (p) parPartie[p.id].push(r.id);
      continue;
    }
    const scores = parties.map((p) => ({ p, s: scorePartie(r, p) })).sort((a, b) => b.s - a.s);
    if (scores[0] && scores[0].s > 0) parPartie[scores[0].p.id].push(r.id);
    else sansScore.push(r.id);
  }
  for (const id of sansScore) {
    const bloc = blocDe.get(id);
    const meilleure = parties.map((p) => ({ p, n: parPartie[p.id].filter((x) => blocDe.get(x) === bloc).length })).sort((a, b) => b.n - a.n)[0];
    if (meilleure && meilleure.n > 0) parPartie[meilleure.p.id].push(id);
  }
  return parPartie;
}

/** Messages de la demande de répartition (titres et attendus seulement : appel court). */
export function consigneRepartition(mt: MemoireType, plan: PlanMemoireType, parties: PartieRC[]): Array<{ role: 'system' | 'user'; content: string }> {
  const blocs = new Map(mt.blocs.map((b) => [b.id, b.titre]));
  return [
    {
      role: 'system',
      content: `Le règlement de consultation d'un marché de sécurité privée impose le plan du mémoire technique. GSS reprend EXACTEMENT son mémoire type : seule la construction change (quelle rubrique va dans quelle partie imposée).
1. Rattache chaque rubrique du mémoire type à la partie imposée qui traite son sujet (une rubrique va dans une seule partie). Laisse de côté une rubrique qui ne répond à aucune partie (elle ne sera pas reprise).
2. Pour chaque partie, liste les éléments attendus par le RC (cités dans « attendu ») qu'AUCUNE rubrique rattachée ne traite (ex. décomposition du prix, dimensionnement propre au site) : ils seront rédigés à part et proposés à GSS.
Réponds UNIQUEMENT par un objet JSON : {"parties":[{"id":"c1","rubriques":["id de rubrique", "…"],"non_couverts":["élément attendu non traité", "…"]}]}`,
    },
    {
      role: 'user',
      content: `PLAN IMPOSÉ PAR LE RC :\n${parties.map((p) => `- ${p.id} : ${p.title}${p.attendu ? ` — attendu : ${p.attendu}` : ''}`).join('\n')}\n\nRUBRIQUES DU MÉMOIRE TYPE (id — bloc — titre) :\n${plan.rubriques.map((r) => `- ${r.id} — ${blocs.get(r.bloc) || r.bloc} — ${r.titre}`).join('\n')}`,
    },
  ];
}

export interface RepartitionCourt {
  /** Rubriques par partie du RC, dans l'ordre des éléments cités par le RC (ordre du mémoire type à égalité). */
  parPartie: Record<string, string[]>;
  /** Rubriques placées par le repli lexical (non retenues par le modèle) : retirées en premier si la place manque. */
  secondaires: string[];
  /** Éléments attendus par le RC qu'aucune rubrique ne traite, par partie. */
  nonCouverts: Record<string, string[]>;
  source: 'modele' | 'lexical';
}

/**
 * Lecture de la réponse de répartition : ids inconnus ignorés, une rubrique dans une seule partie (la première citée),
 * rubriques ordonnées selon les éléments cités par le RC. Rubrique non citée : placée par le repli lexical et marquée secondaire. Réponse
 * illisible : tout le repli lexical.
 */
export function lireRepartition(reponse: string, mt: MemoireType, plan: PlanMemoireType, parties: PartieRC[]): RepartitionCourt {
  const ordre = plan.rubriques.map((r) => r.id);
  const lexical = repartitionLexicale(mt, plan, parties);
  const d = lireJson(reponse || '');
  const liste: any[] = Array.isArray(d?.parties) ? d.parties : [];
  const ordonner = (pp: Record<string, string[]>) => {
    for (const p of parties) pp[p.id] = ordonnerSelonRC(mt, p, pp[p.id] || [], ordre);
    return pp;
  };
  if (!liste.length) return { parPartie: ordonner(lexical), secondaires: [], nonCouverts: {}, source: 'lexical' };
  const parPartie: Record<string, string[]> = Object.fromEntries(parties.map((p) => [p.id, [] as string[]]));
  const nonCouverts: Record<string, string[]> = {};
  const pris = new Set<string>();
  for (const x of liste) {
    const id = String(x?.id || '');
    if (!parPartie[id]) continue;
    for (const r of Array.isArray(x?.rubriques) ? x.rubriques : []) {
      const rid = String(r || '').trim();
      if (!ordre.includes(rid) || pris.has(rid)) continue;
      pris.add(rid);
      parPartie[id].push(rid);
    }
    const nc = (Array.isArray(x?.non_couverts) ? x.non_couverts : []).map((e: any) => String(e || '').trim()).filter((e: string) => e.length >= 4);
    if (nc.length) nonCouverts[id] = nc.slice(0, 4);
  }
  // La compréhension du besoin va à la partie qui la demande, même si le modèle l'a oubliée.
  const besoin = mt.rubriques.find((r) => r.mode === 'besoin' && ordre.includes(r.id));
  const partieBesoin = parties.find((p) => PARTIE_COMPREHENSION.test(`${p.title} ${p.attendu || ''}`));
  if (besoin && partieBesoin && !pris.has(besoin.id)) { parPartie[partieBesoin.id].push(besoin.id); pris.add(besoin.id); }
  // Rubrique non citée par le modèle (secondaire) : placée près de ses voisines telles que le MODÈLE les a placées
  // (même bloc, titre proche : « Des tenues conformes à l'arrêté… » rejoint « Les tenues »), sinon dans la partie que
  // désignent ses mots, sinon près de la rubrique du même bloc la plus proche dans le mémoire type ; le repli lexical
  // seulement à défaut (il regroupait par bloc d'après SA propre répartition et éloignait une rubrique de sa voisine).
  const partieModele = new Map<string, string>();
  for (const [pid, ids] of Object.entries(parPartie)) for (const rid of ids) partieModele.set(rid, pid);
  const blocDe = new Map(plan.rubriques.map((r) => [r.id, r.bloc]));
  const titreDe = (id: string) => mt.rubriques.find((r) => r.id === id)?.titre || '';
  const secondaires: string[] = [];
  for (const [pidLexical, ids] of Object.entries(lexical)) {
    for (const rid of ids) {
      const r = mt.rubriques.find((x) => x.id === rid);
      if (pris.has(rid) || !r || r.mode === 'besoin') continue;
      const distance = (x: string) => Math.abs(ordre.indexOf(x) - ordre.indexOf(rid));
      const voisines = [...partieModele.keys()].filter((x) => blocDe.get(x) === blocDe.get(rid));
      const motsTitre = [...motsSignificatifs(r.titre)].filter((w) => !VIDES.has(w));
      const proches = voisines.map((x) => { const m = motsSignificatifs(titreDe(x)); return { x, n: motsTitre.filter((w) => m.has(w)).length }; })
        .filter((v) => v.n > 0).sort((a, b) => b.n - a.n || distance(a.x) - distance(b.x));
      const parMots = parties.some((p) => scorePartie(r, p) > 0);
      const voisine = [...voisines].sort((a, b) => distance(a) - distance(b))[0];
      const pid = proches.length ? partieModele.get(proches[0].x)! : parMots ? pidLexical : voisine ? partieModele.get(voisine)! : pidLexical;
      pris.add(rid);
      parPartie[pid].push(rid);
      secondaires.push(rid);
    }
  }
  return { parPartie: ordonner(parPartie), secondaires, nonCouverts, source: 'modele' };
}

/** Éléments cités par une partie du RC : son titre et ses attendus, découpés (« équipe », « organigramme », « démarche RSE »…). */
export function elementsRC(p: PartieRC): string[] {
  return `${p.title} ; ${String(p.attendu || '').replace(/Critère de jugement traité ici\s*:\s*/gi, ' ; ')}`
    .split(/[;,/()«»]|\s+et\s+|\.\s/).map((x) => x.replace(/\(\d+\s*%\)/g, '').trim()).filter((x) => x.length >= 3);
}

/**
 * Ordre des rubriques dans une partie du RC : celui des éléments que cite le RC (consigne 5 : seule la construction
 * change). Chaque rubrique prend le rang du premier élément dont elle est le plus proche ; une rubrique sans aucun mot
 * commun suit sa voisine dans le mémoire type ; l'ordre du mémoire type départage les égalités. Aucun texte ne change.
 */
export function ordonnerSelonRC(mt: MemoireType, p: PartieRC, ids: string[], ordre: string[]): string[] {
  const elements = elementsRC(p);
  const rang = new Map<string, number>();
  for (const id of ids) {
    const r = mt.rubriques.find((x) => x.id === id);
    if (!r) continue;
    if (r.mode === 'besoin') { const k = elements.findIndex((e) => PARTIE_COMPREHENSION.test(e)); rang.set(id, k < 0 ? -1 : k); continue; }
    let meilleur = 0;
    elements.forEach((e, k) => {
      const s = rechercherRubriques(mt, e, 1, [id])[0]?.score || 0;
      if (s > meilleur) { meilleur = s; rang.set(id, k); }
    });
  }
  const selonMT = [...ids].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  const blocDe = (id: string) => mt.rubriques.find((x) => x.id === id)?.bloc;
  const rangFinal = new Map(selonMT.map((id, i) => {
    if (rang.has(id)) return [id, rang.get(id)!];
    // Voisine : d'abord une rubrique du même bloc (précédente, puis suivante), sinon n'importe laquelle.
    const avant = selonMT.slice(0, i).reverse();
    const apres = selonMT.slice(i + 1);
    const voisine = avant.find((x) => rang.has(x) && blocDe(x) === blocDe(id)) || apres.find((x) => rang.has(x) && blocDe(x) === blocDe(id))
      || avant.find((x) => rang.has(x)) || apres.find((x) => rang.has(x));
    return [id, voisine ? rang.get(voisine)! : elements.length];
  }));
  return selonMT.map((id, i) => ({ id, i })).sort((a, b) => rangFinal.get(a.id)! - rangFinal.get(b.id)! || a.i - b.i).map((x) => x.id);
}

// ─── Format court : sélection par priorité (avant toute condensation) ────────────────────────────

/** Sous-partie de la rubrique qui porte ce titre (titres publipostés : comparaison sur la partie fixe du titre). */
export function sousPartieDe(sousParties: SousPartie[], titre: string): SousPartie | undefined {
  const t = normaliser(titre).replace(/\*+/g, '').trim();
  return sousParties.find((s) => {
    const fixe = normaliser(s.titre.split('{{')[0]).trim();
    return fixe.length >= 4 && (t === normaliser(s.titre) || t.startsWith(fixe));
  });
}

export interface RubriqueSelection {
  id: string;
  titre: string;
  /** 1 = essentielle (jamais retirée), 2, 3 ; 4 = placée faute de mieux (retirée en premier). */
  priorite: number;
  sousParties: SousPartie[];
  texte: string;
  /** Jamais retirée en entier (compréhension du besoin, engagements, proposition de l'IA…) ; ses sous-parties de
   *  priorité 2 ou 3 peuvent l'être. */
  garder?: boolean;
}

export interface ResultatSelection {
  textes: Record<string, string>;
  /** Rubriques gardées, dans l'ordre. */
  gardees: string[];
  /** Ce qui a été retiré, dans l'ordre des retraits (« rubrique » ou « rubrique › sous-partie »). */
  retraits: string[];
  mots: number;
}

/** Nombre de mots d'une partie assemblée (titres de rubrique compris). */
export function motsPartie(rubriques: Array<{ titre: string; texte: string }>): number {
  return rubriques.reduce((s, r) => s + compterMots(r.texte) + (r.texte.trim() ? compterMots(r.titre) : 0), 0);
}

/**
 * Tient un budget de mots en RETIRANT des passages entiers du mémoire type, jamais en réécrivant : d'abord les
 * sous-parties de priorité 3, puis les rubriques de priorité 3, puis les sous-parties de priorité 2, puis les
 * rubriques de priorité 2 (en partant de la fin de la partie). L'introduction d'une rubrique, ses sous-parties de
 * priorité 1, les rubriques de priorité 1 et les rubriques « garder » ne sont jamais retirées.
 */
export function selectionnerParPriorite(rubriques: RubriqueSelection[], budgetMots: number): ResultatSelection {
  const textes: Record<string, string> = Object.fromEntries(rubriques.map((r) => [r.id, r.texte]));
  const gardees = new Set(rubriques.filter((r) => r.texte.trim()).map((r) => r.id));
  const retraits: string[] = [];
  const total = () => motsPartie(rubriques.filter((r) => gardees.has(r.id)).map((r) => ({ titre: r.titre, texte: textes[r.id] })));
  const prioSousPartie = (r: RubriqueSelection, titre: string | null) => (titre === null ? 1 : (sousPartieDe(r.sousParties, titre)?.priorite ?? 2));
  // Priorité 4 : rubrique placée faute de mieux (le modèle ne l'a rattachée à aucune partie) : retirée en premier.
  const etapes: Array<{ type: 'sp' | 'rub'; p: number }> = [{ type: 'rub', p: 4 }, { type: 'sp', p: 3 }, { type: 'rub', p: 3 }, { type: 'sp', p: 2 }, { type: 'rub', p: 2 }];
  for (const e of etapes) {
    for (let i = rubriques.length - 1; i >= 0 && total() > budgetMots; i--) {
      const r = rubriques[i];
      if (!gardees.has(r.id)) continue;
      if (e.type === 'rub') {
        if (!r.garder && r.priorite >= e.p) { gardees.delete(r.id); retraits.push(r.titre); }
        continue;
      }
      let morceaux = decouperSousParties(textes[r.id]);
      // Une rubrique sans sous-partie titrée n'a rien à retirer à ce niveau.
      if (morceaux.filter((m) => m.titre !== null).length < 1) continue;
      for (let k = morceaux.length - 1; k >= 0 && total() > budgetMots; k--) {
        const m = morceaux[k];
        if (m.titre === null || prioSousPartie(r, m.titre) < e.p) continue;
        // Jamais la dernière sous-partie restante d'une rubrique gardée (la rubrique se viderait).
        if (morceaux.filter((x) => x.titre !== null).length <= 1 && !morceaux.some((x) => x.titre === null)) break;
        morceaux = morceaux.filter((_, j) => j !== k);
        textes[r.id] = morceaux.map((x) => x.texte).join('\n\n');
        retraits.push(`${r.titre} › ${m.titre}`);
      }
    }
  }
  const ordre = rubriques.map((r) => r.id).filter((id) => gardees.has(id));
  return { textes, gardees: ordre, retraits, mots: total() };
}

/**
 * Budget de mots par partie : proportionnel aux pondérations du RC ; le volume qu'une partie n'utilise pas (son
 * contenu tient sous son budget) est rendu aux parties qui en manquent, au prorata de leurs pondérations.
 */
export function repartirBudget(besoins: Record<string, number>, poids: Record<string, number>, total: number): Record<string, number> {
  const ids = Object.keys(besoins);
  const somme = ids.reduce((s, id) => s + (poids[id] || 1), 0) || 1;
  const budget: Record<string, number> = Object.fromEntries(ids.map((id) => [id, (total * (poids[id] || 1)) / somme]));
  for (let tour = 0; tour < 4; tour++) {
    const surplus = ids.reduce((s, id) => s + Math.max(0, budget[id] - besoins[id]), 0);
    const enManque = ids.filter((id) => besoins[id] > budget[id] + 1);
    if (surplus < 1 || !enManque.length) break;
    for (const id of ids) if (budget[id] > besoins[id]) budget[id] = besoins[id];
    const s2 = enManque.reduce((s, id) => s + (poids[id] || 1), 0) || 1;
    for (const id of enManque) budget[id] += (surplus * (poids[id] || 1)) / s2;
  }
  return Object.fromEntries(ids.map((id) => [id, Math.max(150, Math.round(budget[id]))]));
}

/**
 * Sélection dans une partie DÉJÀ assemblée (après adaptation et contrôles) : la partie est redécoupée sur ses
 * sous-titres « ## » ; un bloc dont le titre est celui d'une rubrique du mémoire type suit sa priorité, tout autre bloc
 * (introduction, engagements sur les exigences, proposition de l'IA, remarques) est gardé.
 */
export function selectionnerDansPartie(texte: string, infos: Array<{ titre: string; priorite: number; sousParties: SousPartie[]; garder?: boolean }>, budgetMots: number): { texte: string; retraits: string[] } {
  const blocs: Array<{ titre: string | null; corps: string }> = [];
  for (const morceau of String(texte || '').split(/\n(?=## )/)) {
    const m = /^## (.+)\n?([\s\S]*)$/.exec(morceau);
    if (m) blocs.push({ titre: m[1].trim(), corps: m[2].trim() });
    else if (morceau.trim()) blocs.push({ titre: null, corps: morceau.trim() });
  }
  const rubriques: RubriqueSelection[] = blocs.map((b, i) => {
    const info = b.titre ? infos.find((x) => normaliser(x.titre) === normaliser(b.titre!)) : undefined;
    return { id: `bloc${i}`, titre: b.titre || '', priorite: info?.priorite ?? 1, sousParties: info?.sousParties || [], texte: b.corps, garder: !info || info.garder };
  });
  const r = selectionnerParPriorite(rubriques, budgetMots);
  const sortie = rubriques.filter((x) => r.gardees.includes(x.id))
    .map((x) => (x.titre ? `## ${x.titre}\n\n${r.textes[x.id].trim()}` : r.textes[x.id].trim())).join('\n\n');
  return { texte: sortie, retraits: r.retraits };
}

/** Partie assemblée : chaque rubrique sous son sous-titre « ## », dans l'ordre donné. */
export function assemblerPartie(rubriques: Array<{ titre: string; texte: string }>): string {
  return rubriques.filter((r) => r.texte.trim()).map((r) => `## ${r.titre}\n\n${r.texte.trim()}`).join('\n\n');
}

// ─── Cadre .docx : texte de référence d'une question ─────────────────────────────────────────────

/** Markdown du mémoire type → texte brut du cadre (pas de #, ni de **, puces « • », tableaux en lignes). */
export function texteBrut(markdown: string): string {
  return String(markdown || '').split('\n').map((l) => {
    if (/^\s*\|?\s*:?-{3,}/.test(l) && /^[\s|:-]+$/.test(l)) return null;
    if (/^\s*\|.*\|\s*$/.test(l)) return l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(' : ');
    // Sous-titre (titre Markdown ou ligne entièrement en gras) : « Titre : » (texte brut du cadre, lisible seul).
    const titre = /^\s*(?:#{1,6}\s+(.+?)|\*\*([^*]+)\*\*)\s*$/.exec(l);
    if (titre) { const x = (titre[1] || titre[2]).trim(); return /[.:;!?]$/.test(x) ? x : `${x} :`; }
    return l.replace(/^\s*[-*]\s+/, '• ').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
  }).filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Intitulé principal d'une question du cadre : son premier segment qui dit de quoi elle parle, sans la numérotation
 * seule (« SOUS-CRITERE 1 »), la limite de pages, la consigne de forme ni la liste des éléments attendus qui suivent
 * (« Description argumentée ; Maximum 7 pages ; Éléments de réponse attendus : … »).
 */
export function intitulePrincipal(question: string): string {
  const forme = /^(?:\)|description (?:argument[ée]e|des attentes)|[ée]l[ée]ments? de r[ée]ponse|maximum|\d+\s*pages?|nombre de pages?|annexe|limite)/i;
  for (const brut of String(question || '').split(/\s*;\s*/)) {
    const s = brut.trim();
    const sens = s.replace(/^(?:sous[- ]?)?crit[eè]re\s*n?°?\s*\d*\s*[:–-]?\s*/i, '').replace(/[–-]?\s*\(?sur \d+ points\)?/gi, '').trim();
    if ((sens.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length < 2 || forme.test(sens)) continue;
    return s;
  }
  return String(question || '').trim();
}

/**
 * Questions auxquelles le mémoire type ne répond jamais, reconnues à leur INTITULÉ PRINCIPAL (ou à celui du critère
 * parent) : cas pratique et mise en situation propres au site décrit. Un mot de la liste des éléments attendus
 * (« dimensionnement des équipes », « annexe autorisée (rétroplanning) », « enjeux environnementaux ») ne suffit pas :
 * la question relève alors du mémoire type. Rédaction guidée comme avant, signalée en proposition.
 */
export const QUESTION_HORS_MEMOIRE_TYPE = /cas pratiques?|mises? en situation/i;

/** Question hors mémoire type (cas pratique, mise en situation), d'après son intitulé principal et celui de son critère. */
export function questionHorsMemoireType(question: string, critere = ''): boolean {
  return QUESTION_HORS_MEMOIRE_TYPE.test(intitulePrincipal(question)) || (!!critere.trim() && QUESTION_HORS_MEMOIRE_TYPE.test(intitulePrincipal(critere)));
}

/**
 * Question de compréhension du besoin (« qu'avez-vous compris de mon besoin ? », consigne 3) : texte du bloc
 * « Notre compréhension de votre besoin » et son schéma de process.
 */
export const QUESTION_COMPREHENSION = /compr[ée]hension\s+(?:du|des|de\s+(?:la|l['’]|votre|vos|ses|son|sa)|de)\s*(?:\S+\s+)?(?:besoins?|sujétions|sujetions|mission|attentes|enjeux|contexte|site|contrat|march[ée]|prestations?|cahier)/i;

/** Question de compréhension du besoin, d'après son intitulé principal. */
export function questionComprehension(question: string): boolean {
  return QUESTION_COMPREHENSION.test(intitulePrincipal(question));
}

/**
 * Champ qui demande une VALEUR (« Effectif total … (transmis pour information) : », « si oui est-ce un courriel… »,
 * « Nombre de … ») et non une réponse développée : ni texte du mémoire type, ni signalement en proposition.
 */
export function champValeur(libelle: string): boolean {
  const p = intitulePrincipal(libelle);
  const mots = (String(libelle || '').match(/[A-Za-zÀ-ÿ0-9'’-]+/g) || []).length;
  return /\(?(?:transmis )?pour information\)?|^\s*(?:[àa] titre d.information)/i.test(p)
    || (/^\s*(?:si oui|si non|effectifs?\b|nombre (?:de|d['’]))/i.test(p) && mots < 20);
}

/** Texte qui représente une rubrique pour la recherche sémantique : titre, mots-clés, début du texte de GSS. */
export function signatureRubrique(r: RubriqueMemoireType): string {
  return `${r.titre}. ${r.mots_cles.join(', ')}. ${texteBrut(String(r.texte || '').replace(/\{\{[^}]*\}\}/g, ' ')).slice(0, 1200)}`;
}

/** Similarité cosinus de deux vecteurs (0 si l'un est vide). */
export function cosinus(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? p / Math.sqrt(na * nb) : 0;
}

export interface CandidatReference {
  /** Repère donné au modèle (« R1 », « R2 »…). */
  cle: string;
  id: string;
  titre: string;
  /** Texte brut publiposté de la rubrique. */
  texte: string;
  score: number;
  /** Score lexical (mots-clés) de la rubrique pour la question : départage les scores sémantiques égaux. */
  lexical?: number;
}

/**
 * Rubriques du mémoire type candidates pour une question développée du cadre (au plus 3, 1 200 mots au plus) : les
 * plus proches sémantiquement (embeddings ; au-dessus de `seuil`, à moins de `ecart` de la meilleure), complétées par
 * la meilleure rubrique lexicale (mots-clés) si elle atteint 2,5. Le modèle dit ensuite lesquelles traitent vraiment
 * la question. Aucune candidate pour une question propre au marché (cas pratique, compréhension du site…).
 */
export function candidatsReference(mt: MemoireType, textes: Record<string, string>, question: string, options: { scores?: Record<string, number>; seuil?: number; ecart?: number; maxMots?: number; hors?: boolean } = {}): CandidatReference[] {
  if (!question.trim() || (options.hors ?? questionHorsMemoireType(question))) return [];
  const parmi = Object.keys(textes).filter((id) => (textes[id] || '').trim() && mt.rubriques.find((r) => r.id === id)?.mode !== 'besoin');
  const seuil = options.seuil ?? SEUIL_SEMANTIQUE;
  const ecart = options.ecart ?? 0.04;
  const scores = options.scores || {};
  const choix: Array<{ id: string; score: number }> = [];
  const sem = parmi.map((id) => ({ id, score: scores[id] ?? 0 })).sort((a, b) => b.score - a.score);
  if (sem[0] && sem[0].score >= seuil) choix.push(...sem.slice(0, 3).filter((x) => x.score >= Math.max(seuil, sem[0].score - ecart)));
  const lex = rechercherRubriques(mt, question, 1, parmi)[0];
  if (lex && lex.score >= 2.5 && !choix.some((x) => x.id === lex.id)) choix.push({ id: lex.id, score: scores[lex.id] ?? 0 });
  const lexicaux = new Map(rechercherRubriques(mt, question, 50, parmi).map((x) => [x.id, x.score]));
  const maxMots = options.maxMots ?? 1200;
  const out: CandidatReference[] = [];
  let mots = 0;
  for (const c of choix) {
    const texte = texteBrut(textes[c.id]);
    const n = compterMots(texte);
    if (out.length && mots + n > maxMots) continue;
    mots += n;
    out.push({ cle: `R${out.length + 1}`, id: c.id, titre: mt.rubriques.find((r) => r.id === c.id)?.titre || c.id, texte, score: c.score, lexical: lexicaux.get(c.id) ?? 0 });
  }
  return out;
}

/**
 * Une rubrique du mémoire type n'est reprise intégralement que dans UNE réponse du cadre (« si c'est le même process,
 * on remet la même réponse », pas deux fois la même dans le même document). Les champs étant rédigés en parallèle,
 * l'attribution est faite avant les appels : chaque rubrique va au champ qui la vise le plus (score sémantique, puis
 * lexical, puis ordre du cadre) ; les autres champs la perdent et y renvoient (« voir notre réponse à … »).
 */
export function attribuerRubriques(champs: Array<{ id: number; libelle: string; candidats: CandidatReference[] }>): {
  candidats: Map<number, CandidatReference[]>;
  renvois: Map<number, Array<{ titre: string; libelle: string }>>;
} {
  const ordre = new Map(champs.map((c, i) => [c.id, i]));
  const paires = champs.flatMap((c) => c.candidats.map((x) => ({ champ: c.id, x })))
    .sort((a, b) => b.x.score - a.x.score || (b.x.lexical ?? 0) - (a.x.lexical ?? 0) || ordre.get(a.champ)! - ordre.get(b.champ)!);
  const titulaire = new Map<string, number>();
  for (const p of paires) if (!titulaire.has(p.x.id)) titulaire.set(p.x.id, p.champ);
  const candidats = new Map<number, CandidatReference[]>();
  const renvois = new Map<number, Array<{ titre: string; libelle: string }>>();
  for (const c of champs) {
    const gardes = c.candidats.filter((x) => titulaire.get(x.id) === c.id).map((x, i) => ({ ...x, cle: `R${i + 1}` }));
    candidats.set(c.id, gardes);
    const ailleurs = c.candidats.filter((x) => titulaire.get(x.id) !== c.id)
      .map((x) => ({ titre: x.titre, libelle: champs.find((d) => d.id === titulaire.get(x.id))?.libelle || '' }));
    if (ailleurs.length) renvois.set(c.id, ailleurs);
  }
  return { candidats, renvois };
}

/**
 * Intitulé d'une question du cadre cité dans un renvoi (« voir notre réponse à la question « … » ») : entier jusqu'à 200
 * caractères, sinon coupé entre deux mots, jamais au milieu d'un mot (génération réelle rouen_univ 15 : « (gilets par coups,
 * lame, bal…). » recopié tel quel dans le cadre remis).
 */
export function libelleQuestion(libelle: string): string {
  const l = String(libelle || '').replace(/\s+/g, ' ').trim();
  if (l.length <= 200) return l;
  const coupe = l.slice(0, 160).replace(/\s+\S*$/, '').replace(/[\s,;:(–-]+$/, '');
  return `${coupe}…`;
}

/** Consigne d'un champ dont un texte du mémoire type est déjà repris dans une autre réponse du cadre. */
export function blocRenvois(renvois: Array<{ titre: string; libelle: string }>): string {
  if (!renvois.length) return '';
  return `
--- TEXTES DE GSS DÉJÀ REPRIS DANS UNE AUTRE RÉPONSE ---
${renvois.map((r) => `- « ${r.titre} » est déjà repris dans la réponse à la question « ${libelleQuestion(r.libelle)} ».`).join('\n')}
Ne recopie pas ces textes ici. Si cette question porte sur le même sujet, renvoie à cette réponse en une phrase (« voir notre réponse à la question « … » ») et ne développe que ce que cette question demande en plus.
`;
}

/**
 * Bloc injecté avant les extraits : textes de référence de GSS candidats ; s'ils traitent la question, le modèle les
 * reprend tels quels et n'adapte que noms, sites et chiffres ; il indique dans « reference » ceux qu'il a repris.
 */
export function blocReference(candidats: CandidatReference[], o: { limite?: boolean; strict?: boolean; grille?: boolean } = {}): string {
  if (!candidats.length) return '';
  return `
--- TEXTES DE RÉFÉRENCE GSS (mémoire type de GSS) ---
${candidats.map((c) => `[${c.cle}] ${c.titre}\n${c.texte}`).join('\n\n')}
--- FIN DES TEXTES DE RÉFÉRENCE ---
CONSIGNE PRIORITAIRE (elle prime sur toutes les consignes de rédaction ci-dessus) : GSS répond avec son mémoire type, « si c'est toujours le même process, on remet la même réponse ».
- Commence par décider quels textes de référence traitent VRAIMENT le sujet de la question (même sujet, pas un thème voisin). N'utilise jamais un texte qui parle d'autre chose.
- Texte retenu : reprends-le TEL QUEL, phrase par phrase, dans le même ordre, en texte brut (puces « • »). Adapte SEULEMENT les noms (acheteur, sites, services) et les chiffres, délais, fréquences et horaires que le DCE impose (le chiffre du DCE remplace celui du texte, jamais les deux) ; retire ce qui est hors du périmètre du marché ou contraire au DCE ; ajoute SEULEMENT ce que la question exige et que le texte ne couvre pas (avec les mots du DCE), à la suite du passage concerné. Ne reformule pas, ne résume pas, n'ajoute ni introduction ni conclusion.
- Une partie de la question qu'aucun texte retenu ne traite est rédigée comme d'habitude, à partir des extraits.${o.grille ? `
- Critère d'une grille de notation : place le texte retenu, tel quel, sous l'intitulé de la composante qu'il traite (ses phrases d'origine, pas un résumé) ; pour cette composante, la longueur indiquée par le barème et la consigne de rédaction de la grille ne s'appliquent pas. Les autres composantes suivent la consigne de la grille.` : ''}${o.limite ? `
- Une limite de longueur s'applique : garde les phrases du texte retenu les plus utiles à la question, recopiées mot pour mot dans le même ordre, plutôt que de le résumer.` : ''}${o.strict ? `
- Ton essai précédent a reformulé le texte de référence retenu : cette fois, recopie ses phrases MOT POUR MOT (seuls les noms et les chiffres imposés par le DCE peuvent changer).` : ''}
- Dans le JSON, ajoute "reference": la liste des repères des textes repris (ex. ["R1"]), ou [] si aucun ne traite la question.
`;
}

/**
 * Rubriques du mémoire type reprises dans une même réponse du cadre : la principale (meilleur score pour la question) et,
 * au plus, une seconde de score voisin. Plus de rubriques mêlées en un seul texte (havre1 21, réponse 3.4 : identité,
 * adéquation des moyens et formation ADS collées, tableau des effectifs nationaux pour une question sur les formations).
 */
export function referencesPrincipales(retenus: CandidatReference[]): CandidatReference[] {
  if (retenus.length <= 1) return retenus;
  const tries = retenus.slice().sort((a, b) => b.score - a.score || (b.lexical ?? 0) - (a.lexical ?? 0));
  return tries.filter((c, i) => i === 0 || (i === 1 && c.score >= tries[0].score - 0.05));
}

/**
 * Nettoyage d'une réponse du cadre après recalage : puce de libellé sans valeur (« • Autorisation entreprise : »), ligne
 * répétée, et « [À COMPLÉTER] » qui redemande juste après la même donnée (« Date de délivrance et date de fin de
 * validité : [À COMPLÉTER]. » puis « Date de fin de validité : [À COMPLÉTER]. »).
 */
export function nettoyerReponseCadre(texte: string): string {
  const lignes = String(texte || '').split('\n');
  const out: string[] = [];
  const vues = new Set<string>();
  const mots = (l: string) => new Set(normaliser(l.split(':')[0]).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const autres = lignes.filter((l) => l.trim() && !/^\[À COMPLÉTER\][.;]?$/.test(l.trim())).length;
  for (const l of lignes) {
    const t = l.trim();
    // « [À COMPLÉTER] » seul sur sa ligne au milieu d'une réponse rédigée (havre1 181, 3.4) : sans objet, retiré.
    if (/^\[À COMPLÉTER\][.;]?$/.test(t) && autres > 0) continue;
    if (/^(?:[•\-*]|\d+[.)])\s+[^:]{2,80}:\s*$/.test(t)) {
      // Puce de libellé sans contenu : rien ne la suit, ou la ligne suivante n'est pas une puce (fin de liste).
      const i = lignes.indexOf(l);
      const suivante = lignes[i + 1] ?? '';
      if (!suivante.trim() || !/^\s*(?:[•\-*]|\d+[.)])\s/.test(suivante)) continue;
    }
    const n = normaliser(t).replace(/\s+/g, ' ');
    if (n && n.length > 12 && vues.has(n)) continue;
    if (/\[À COMPLÉTER\]/.test(t) && out.length) {
      const prec = out[out.length - 1].trim();
      if (/\[À COMPLÉTER\]/.test(prec)) {
        const a = mots(prec);
        const b = mots(t);
        if (b.size && [...b].every((w) => a.has(w))) continue;
      }
    }
    if (n) vues.add(n);
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Repères « R1 »… cités par le modèle, limités aux candidats fournis. */
export function referencesRetenues(candidats: CandidatReference[], valeur: unknown): CandidatReference[] {
  const l = (Array.isArray(valeur) ? valeur : typeof valeur === 'string' ? valeur.split(/[\s,;]+/) : []).map((x) => String(x || '').trim().toUpperCase());
  return candidats.filter((c) => l.includes(c.cle));
}

/**
 * Seuil de fidélité d'une réponse développée du cadre au texte de référence repris (décision D7 : 0,9 au moins ; la
 * consigne 5 veut le texte du mémoire de base repris exactement). La réponse du modèle est recalée sur la référence
 * (recalerSurReference) : une réponse sous ce seuil après recalage reste signalée « à relire ».
 */
export const SEUIL_FIDELITE_CADRE = SEUIL_FIDELITE;

/**
 * Fidélité d'une réponse au texte de référence repris : part des phrases de ce texte conservées dans la réponse
 * (les ajouts propres à la question ne la font pas baisser) ; avec une limite de longueur (reprise intégrale
 * impossible), la meilleure des deux mesures : phrases du texte conservées, ou phrases de la réponse venues du texte.
 */
export function fideliteReponse(reference: string, reponse: string, limite = false, autorises = ''): number {
  const couverture = fidelite(reference, reponse, 0.8, autorises);
  return limite ? Math.max(couverture, fidelite(reponse, reference, 0.8, autorises)) : couverture;
}

/**
 * Noms propres (mot à majuscule hors début de phrase ou de puce) de la phrase reprise absents de la phrase de GSS et du
 * DCE : « notre rondier » devenu « notre agent Securitas » n'est plus la phrase de GSS.
 */
function nomsPropresAjoutes(ref: string, cand: string, dce: string): string[] {
  const n = (x: string) => normaliser(x);
  const refN = n(ref);
  const dceN = n(dce);
  const out: string[] = [];
  const corps = String(cand || '').replace(/^\s*(?:[•\-*]|\d+[.)])\s+/, '');
  for (const m of corps.matchAll(/(?<=[\s(«"'’])([A-ZÀ-Ý][\wÀ-ÿ-]{2,})/g)) {
    const w = n(m[1]);
    if (!new RegExp(`(?:^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(`${refN} ${dceN}`)) out.push(m[1]);
  }
  return out;
}

/**
 * Correction proposée par la passe de cohérence d'une grille (harmoniserGrille, après le recalage sur le mémoire type)
 * admise ? Refusée (motif renvoyé) quand elle :
 *  - introduit un nom propre absent de l'extrait remplacé et des sources autorisées (DCE, registre, organigramme de GSS) :
 *    vitry 202, « la Ville de Vitry-sur-Seine » devenue « la Ville de Port-Jérôme-sur-Seine », nom d'une référence de GSS
 *    citée dans une autre réponse ;
 *  - retire un mot distinctif du nom de l'acheteur (CLIENT) ;
 *  - modifie une phrase reprise du mémoire type (`reference`), sauf pour remplir un « [À COMPLÉTER] » : la consigne 5 veut
 *    le texte de GSS repris exactement.
 * Renvoie '' si la correction est admise.
 */
export function motifRefusHarmonisation(c: { extrait: string; remplacement: string; valeur: string; reference?: string; sources: string; client?: string }): string {
  const extrait = String(c.extrait || ''), remplacement = String(c.remplacement ?? '');
  const ajoutes = nomsPropresAjoutes(`${extrait}\n${c.sources || ''}`, ` ${remplacement}`, '');
  if (ajoutes.length) return `nom propre introduit (${ajoutes.join(', ')})`;
  const n = (x: string) => normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim();
  const motsClient = n(c.client || '').split(' ').filter((w) => w.length >= 4 && !/^(ville|commune|centre|service|services|region|departement|universite|qualite|groupement|groupements|commandes|coordonnateur|ministere|etablissement|public|publique|national|nationale|direction|regional|regionale)$/.test(w));
  const ext = ` ${n(extrait)} `, rem = ` ${n(remplacement)} `;
  const perdus = motsClient.filter((w) => ext.includes(` ${w} `) && !rem.includes(` ${w} `));
  if (perdus.length) return `nom de l'acheteur retiré (${perdus.join(', ')})`;
  if (c.reference && !/À COMPLÉTER/.test(extrait)) {
    const valeur = String(c.valeur || '');
    const k = valeur.indexOf(extrait);
    if (k >= 0) {
      const debut = Math.max(valeur.lastIndexOf('\n', k), ...['. ', '! ', '? '].map((s) => valeur.lastIndexOf(s, k))) + 1;
      const finCandidats = ['\n', '. ', '! ', '? '].map((s) => valeur.indexOf(s, k + extrait.length)).filter((x) => x >= 0);
      const fin = finCandidats.length ? Math.min(...finCandidats) : valeur.length;
      const phrase = n(valeur.slice(debut, fin));
      if (phrase.split(' ').length >= 4 && ` ${n(c.reference)} `.includes(` ${phrase} `)) return 'phrase du mémoire type de GSS modifiée';
    }
  }
  return '';
}

/**
 * Nombre de mots permis à une réponse du cadre d'après son contexte : part fixée par la répartition d'une limite de pages
 * (« environ 140 mots pour celle-ci ») ou limite de pages de la rubrique (« 2 pages maximum », environ 420 mots par page).
 * Aucune limite (undefined) pour un critère de grille sans limite de pages : le texte retenu y est repris en entier.
 */
export function motsMaxChamp(contexte: string): number | undefined {
  const c = String(contexte || '');
  const part = /environ\s+(\d+)\s+mots/i.exec(c);
  if (part) return Number(part[1]);
  const p = /(\d+|une?)\s+pages?\s+maximum|maximum\s*:?\s*(\d+)\s+pages?/i.exec(c);
  if (!p) return undefined;
  const n = p[2] ? Number(p[2]) : /^\d+$/.test(p[1]) ? Number(p[1]) : 1;
  return n * 420;
}

export interface ResultatRecalage {
  texte: string;
  /** Fidélité de la réponse du modèle, puis de la réponse recalée (mesure de fideliteReponse). */
  fideliteAvant: number;
  fidelite: number;
  /** Phrases reformulées remplacées par la phrase de GSS ; phrases de GSS omises remises à leur place ; ajouts retirés (limite). */
  reformulees: number;
  reinserees: number;
  ajoutsRetires: number;
  /** Bribes d'une phrase de GSS (phrase tronquée ou résumée) retirées : la phrase de GSS entière est dans la réponse. */
  bribesRetirees: number;
}

/**
 * Recalage d'une réponse développée du cadre sur le texte de GSS qu'elle reprend (consigne 5 : « l'IA reprend exactement
 * le mémoire de base » ; décision D7 : 90 % au moins), sans nouvel appel au modèle :
 *  1. une phrase de la réponse proche d'une phrase de GSS (même phrase, nom ou chiffre changé) est gardée telle quelle ;
 *     une phrase reformulée (ressemblance de 50 à 80 %) redevient la phrase de GSS, sauf si elle porte un chiffre absent
 *     de la phrase de GSS (chiffre imposé par le DCE : gardé) ;
 *  2. chaque phrase de GSS omise est remise à sa place (après la phrase de GSS qui la précède dans la réponse ; une ligne
 *     entière omise sur sa propre ligne) ;
 *  3. les phrases propres à la question (ajouts) sont gardées à leur place.
 * Avec une limite de longueur (`limite`, `maxMots`) : les phrases de GSS ne sont remises que dans la limite de mots ; si la
 * fidélité reste sous le seuil, les ajouts sont retirés en partant de la fin (la réponse redevient le texte de GSS).
 * Une phrase de GSS contraire au DCE (`exclure`, ex. flotte électrique quand le CCTP impose une motorisation thermique)
 * n'est jamais remise. Un sous-titre de GSS omis (« Le recyclage de nos tenues : ») n'est remis que devant son contenu.
 * Une phrase courte (moins de 6 mots, souvent un intitulé) n'est rapprochée d'une phrase de GSS qu'à 80 % au moins.
 */
export function recalerSurReference(reference: string, reponse: string, o: { limite?: boolean; maxMots?: number; seuil?: number; exclure?: (phrase: string) => boolean; dce?: string } = {}): ResultatRecalage {
  const seuil = o.seuil ?? SEUIL_FIDELITE_CADRE;
  type Item = { brut: string; mots: string[]; ref?: number; ajout?: boolean };
  type Ligne = { items: Item[] };
  const PUCE = /^\s*(?:[•\-*]|\d+[.)])\s+/;
  // Découpage en phrases sans couper après « : » : « - Dénomination : Global Security Services » reste une seule phrase
  // (havre1 : libellés séparés de leur valeur puis remis à côté d'une autre phrase, « • Dénomination : Autorisation
  // d'exercer… », « • Autorisation entreprise : » vide). Une ligne qui finit par « : » reste un sous-titre.
  const decouper = (t: string) => String(t || '').replace(/\r/g, '').split('\n')
    .map((l) => l.trim() ? l.split(/(?<=[.!?;])\s+/).filter((x) => x.trim()) : []);
  // Phrases de GSS (référence), ligne par ligne.
  const lignesRef = decouper(reference);
  const ref: Array<{ brut: string; mots: string[]; ligne: number }> = [];
  lignesRef.forEach((l, i) => l.forEach((brut) => ref.push({ brut, mots: motsDePhrase(brut), ligne: i })));
  // Phrases contraires au DCE (et l'amorce « … : » qui les introduit sur la même ligne) : jamais remises.
  const exclus = ref.map((p) => !!o.exclure?.(p.brut));
  for (let k = ref.length - 2; k >= 0; k--) if (!exclus[k] && exclus[k + 1] && ref[k + 1].ligne === ref[k].ligne && /:\s*$/.test(ref[k].brut)) exclus[k] = true;
  // Texte de GSS applicable au marché (mesure de la fidélité) : sans ces phrases.
  const applicable = exclus.some(Boolean)
    ? lignesRef.map((_, i) => ref.filter((p, k) => p.ligne === i && !exclus[k]).map((p) => p.brut).join(' ')).join('\n') : reference;
  const mesure = (t: string) => fideliteReponse(applicable, t, !!o.limite, o.dce || '');
  const autorises = nombresAutorisesDe(o.dce || '');
  const fideliteAvant = mesure(reponse);
  // Réponse du modèle.
  const sortie: Ligne[] = decouper(reponse).map((l) => ({ items: l.map((brut) => ({ brut, mots: motsDePhrase(brut) })) }));
  const items = sortie.flatMap((l) => l.items);
  // 1. Appariement phrase à phrase (meilleures ressemblances d'abord, une phrase de GSS pour une phrase de la réponse).
  const paires: Array<{ i: Item; r: number; s: number }> = [];
  for (const it of items) {
    if (it.mots.length < 3) continue;
    const jeu = new Set(it.mots);
    ref.forEach((p, k) => {
      if (p.mots.length < 3) return;
      let communs = 0;
      for (const w of p.mots) if (jeu.has(w)) communs++;
      if (communs / Math.max(p.mots.length, it.mots.length) < 0.3) return;
      const s = similarite(p.mots, it.mots);
      if (s >= 0.8 || (s >= 0.5 && Math.min(p.mots.length, it.mots.length) >= 6)) paires.push({ i: it, r: k, s });
    });
  }
  paires.sort((a, b) => b.s - a.s);
  const position = new Map<number, { ligne: Ligne; item: Item }>();
  const ligneDe = (it: Item) => sortie.find((l) => l.items.includes(it))!;
  const chiffres = (t: string): string[] => t.match(/\d+(?:[.,]\d+)?/g) || [];
  let reformulees = 0;
  for (const p of paires) {
    if (p.i.ref !== undefined || position.has(p.r)) continue;
    p.i.ref = p.r;
    position.set(p.r, { ligne: ligneDe(p.i), item: p.i });
    const r = ref[p.r];
    // Consigne 5 et D7 : une phrase de GSS dont un chiffre, un quantificateur (« une à trois » → « trois »), une borne
    // (« 45 minutes maximum » → « 20 minutes ») ou un nom propre a changé, ou qui reçoit un mot interdit (« notre agent
    // sous-traitant »), est rétablie telle que GSS l'a écrite (havre1 21 : « trois fois par mois » au lieu de « une à
    // trois fois par mois »). Seul un nombre imposé par le DCE peut remplacer celui de GSS.
    const faitsChanges = !faitsCompatibles(faitsDePhrase(r.brut), faitsDePhrase(p.i.brut), autorises)
      || nomsPropresAjoutes(r.brut, p.i.brut, o.dce || '').length > 0;
    if (p.s >= 0.8 && !faitsChanges) continue;
    const nouveaux = chiffres(p.i.brut).filter((c) => !chiffres(r.brut).includes(c));
    if (nouveaux.length && !faitsChanges) continue;
    const puce = (PUCE.exec(p.i.brut) || [''])[0];
    p.i.brut = `${puce}${r.brut.replace(PUCE, '')}`;
    p.i.mots = r.mots;
    reformulees++;
  }
  for (const it of items) if (it.ref === undefined && it.mots.length >= 3) it.ajout = true;
  // Phrases propres à la question (ajouts) écrites par le modèle à la suite d'une puce de GSS (« • d'un téléphone portable :
  // … si nécessaire. Pour le lot 1, GSS met à disposition les deux véhicules… », génération réelle rouen_univ 15 : quatre
  // phrases, une centaine de mots, sur d'autres sujets) : elles ne prolongent pas la puce de GSS ; elles forment leur propre
  // paragraphe après la liste. Une seule phrase courte qui complète la puce (« Avec l'accord de notre interlocuteur, nous y
  // ajoutons un gilet pare-lame. ») y reste.
  const detacherAjouts = () => {
    for (let li = 0; li < sortie.length; li++) {
      const l = sortie[li];
      if (!l.items.length || l.items[0].ajout || !PUCE.test(l.items[0].brut)) continue;
      const k = l.items.findIndex((x, j) => j > 0 && x.ajout && l.items.slice(j).every((y) => y.ajout || y.ref === undefined));
      if (k < 0) continue;
      const suite = l.items.slice(k);
      if (suite.filter((x) => x.ajout).length < 2 && suite.reduce((a, x) => a + x.mots.length, 0) < 35) continue;
      const detaches = l.items.splice(k);
      let fin = li;
      while (fin + 1 < sortie.length && sortie[fin + 1].items.length && PUCE.test(sortie[fin + 1].items[0].brut)) fin++;
      sortie.splice(fin + 1, 0, { items: [] }, { items: detaches });
    }
  };
  detacherAjouts();
  const rendre = () => sortie.map((l) => l.items.map((x) => x.brut.trim()).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const compter = (t: string) => (t.match(/[\wÀ-ÿ'’-]+/g) || []).length;
  let texte = rendre();
  if (o.limite && mesure(texte) >= seuil) {
    return { texte, fideliteAvant, fidelite: mesure(texte), reformulees, reinserees: 0, ajoutsRetires: 0, bribesRetirees: 0 };
  }
  // 2. Phrases de GSS omises remises à leur place (dans la limite de mots s'il y en a une).
  const budget = o.maxMots !== undefined ? Math.max(o.maxMots, compter(texte)) : Infinity;
  let mots = compter(texte);
  let reinserees = 0;
  const inserer = (k: number, ligneEntiere: boolean): boolean => {
    const ks = ref.map((_, j) => j).filter((j) => ref[j].ligne === ref[k].ligne && !exclus[j]);
    const n = ligneEntiere ? ks.reduce((a, j) => a + compter(ref[j].brut), 0) : compter(ref[k].brut);
    if (mots + n > budget) return false;
    if (ligneEntiere) {
      const ligne: Ligne = { items: ks.map((j) => ({ brut: ref[j].brut, mots: ref[j].mots, ref: j })) };
      // Après la ligne de la phrase de GSS précédente déjà présente ; sinon avant la ligne de la suivante ; sinon en tête.
      let prec = -1;
      for (let j = ks[0] - 1; j >= 0; j--) if (position.has(j)) { prec = j; break; }
      if (prec >= 0) sortie.splice(sortie.indexOf(position.get(prec)!.ligne) + 1, 0, ligne);
      else {
        let suiv = -1;
        for (let j = ks[ks.length - 1] + 1; j < ref.length; j++) if (position.has(j)) { suiv = j; break; }
        sortie.splice(suiv >= 0 ? sortie.indexOf(position.get(suiv)!.ligne) : 0, 0, ligne);
      }
      ligne.items.forEach((it) => position.set(it.ref!, { ligne, item: it }));
    } else {
      // Phrase omise au milieu d'une ligne reprise : à côté de sa voisine de la même ligne.
      const voisines = ref.map((_, j) => j).filter((j) => ref[j].ligne === ref[k].ligne && position.has(j));
      const avant = voisines.filter((j) => j < k).pop();
      const apres = voisines.find((j) => j > k);
      const it: Item = { brut: ref[k].brut.replace(PUCE, ''), mots: ref[k].mots, ref: k };
      if (avant !== undefined) {
        const pos = position.get(avant)!;
        pos.ligne.items.splice(pos.ligne.items.indexOf(pos.item) + 1, 0, it);
        position.set(k, { ligne: pos.ligne, item: it });
      } else if (apres !== undefined) {
        const pos = position.get(apres)!;
        const puce = (PUCE.exec(pos.item.brut) || [''])[0];
        if (puce && pos.ligne.items.indexOf(pos.item) === 0) { pos.item.brut = pos.item.brut.replace(PUCE, ''); it.brut = `${puce}${it.brut}`; }
        pos.ligne.items.splice(pos.ligne.items.indexOf(pos.item), 0, it);
        position.set(k, { ligne: pos.ligne, item: it });
      } else return false;
    }
    mots += n;
    reinserees++;
    return true;
  };
  // Sous-titre de GSS (ligne d'une seule phrase courte terminée par « : ») : remis en second, devant son contenu.
  const sousTitre = (k: number) => lignesRef[ref[k].ligne].length === 1 && /:\s*$/.test(ref[k].brut) && ref[k].mots.length <= 8;
  const exclue = (k: number) => exclus[k];
  for (let k = 0; k < ref.length; k++) {
    if (position.has(k) || ref[k].mots.length < 3 || sousTitre(k) || exclue(k)) continue;
    // Ligne de GSS entièrement absente de la réponse : remise sur sa propre ligne (puces comprises), sans ses phrases exclues.
    const ligneEntiere = ref.every((p, j) => p.ligne !== ref[k].ligne || exclue(j) || !position.has(j));
    inserer(k, ligneEntiere);
  }
  for (let k = 0; k < ref.length; k++) {
    if (position.has(k) || !sousTitre(k) || exclue(k)) continue;
    // Devant la ligne de la phrase de GSS qui le suit, si elle est dans la réponse ; sinon le sous-titre n'est pas remis.
    const suiv = k + 1 < ref.length ? position.get(k + 1) : undefined;
    if (!suiv) continue;
    const n = compter(ref[k].brut);
    if (mots + n > budget) continue;
    const ligne: Ligne = { items: [{ brut: ref[k].brut, mots: ref[k].mots, ref: k }] };
    sortie.splice(sortie.indexOf(suiv.ligne), 0, ligne);
    position.set(k, { ligne, item: ligne.items[0] });
    mots += n;
    reinserees++;
  }
  // Bribe d'une phrase de GSS (70 % de ses mots au moins dans une seule phrase de GSS, plus courte qu'elle : phrase
  // tronquée ou « En résumé, … ») alors que la phrase de GSS entière est dans la réponse : retirée (pas de redite).
  let bribesRetirees = 0;
  for (const l of sortie) {
    for (let j = l.items.length - 1; j >= 0; j--) {
      const it = l.items[j];
      if (!it.ajout) continue;
      const jeu = new Set(it.mots);
      const bribe = ref.some((p, k) => position.has(k) && p.mots.length >= it.mots.length
        && [...jeu].filter((w) => p.mots.includes(w)).length / jeu.size >= 0.7);
      if (bribe) { l.items.splice(j, 1); bribesRetirees++; }
    }
  }
  detacherAjouts();
  texte = rendre();
  // 3. Limite de longueur atteinte et fidélité encore insuffisante : ajouts retirés, du dernier au premier.
  let ajoutsRetires = 0;
  if (mesure(texte) < seuil) {
    for (let li = sortie.length - 1; li >= 0 && mesure(texte) < seuil; li--) {
      const l = sortie[li];
      for (let j = l.items.length - 1; j >= 0 && mesure(texte) < seuil; j--) {
        if (!l.items[j].ajout) continue;
        l.items.splice(j, 1);
        ajoutsRetires++;
        texte = rendre();
      }
    }
  }
  return { texte, fideliteAvant, fidelite: mesure(texte), reformulees, reinserees, ajoutsRetires, bribesRetirees };
}

/**
 * Champ du cadre qui demande si une prestation est sous-traitée et à quelle entreprise (« La prestation d'intervention
 * (lever de doute) est-elle sous-traitée ? Si oui à quelle(s) entreprise(s) : Département 76 : … Département 27 : … »),
 * laissé à « [À COMPLÉTER] » : GSS a répondu (registre recours_sous_traitance : « Non » ; faits de référence : GSS ne
 * sous-traite pas), la réponse est donc connue et aucune question n'est posée (génération réelle rouen_univ 15 : deux
 * « [À COMPLÉTER] » et la question « Combien d'agents GSS sont mobilisables dans le département 76 ? » posée deux fois).
 * null si le champ ne porte pas sur la sous-traitance ou si GSS n'a pas répondu « Non ».
 */
export function reponseSousTraitance(contexte: string, recoursSousTraitance: string): string | null {
  if (!/^\s*non\b/i.test(String(recoursSousTraitance || ''))) return null;
  const c = normaliser(String(contexte || ''));
  if (!/sous[- ]?trait/.test(c)) return null;
  return /lev(?:er|ee)s? de doute|intervention/.test(c)
    ? "Non : la levée de doute est assurée par les équipes de GSS, sans sous-traitance."
    : "Non : GSS n'a pas recours à la sous-traitance.";
}

/**
 * Rubriques d'une partie qui répondent directement à un élément cité par le RC (titre et attendus découpés en
 * éléments : « équipe », « organigramme », « démarche RSE »…) : pour chaque élément, la rubrique la plus proche (mots-clés
 * et titre), si ce rapprochement est net (titre, sigle ou plusieurs mots-clés ; pas d'égalité ; jamais une rubrique
 * secondaire). Elles ne sont jamais retirées en entier par la sélection (seulement leurs sous-parties secondaires).
 */
export function rubriquesEssentielles(mt: MemoireType, p: PartieRC, ids: string[], secondaires: string[] = []): Set<string> {
  const net = (x: string) => ` ${normaliser(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const sujet = (titre: string) => normaliser(titre.split(/\s[:—–-]\s/)[0]);
  // Rubrique placée faute de mieux (non rattachée par le modèle) : jamais essentielle.
  const candidats = ids.filter((id) => !secondaires.includes(id));
  const out = new Set<string>();
  for (const e of elementsRC(p)) {
    const res = rechercherRubriques(mt, e, candidats.length || 1, candidats);
    if (!res.length || res[0].score < 1) continue;
    const r = mt.rubriques.find((x) => x.id === res[0].id)!;
    // Égalité entre plusieurs rubriques : aucune n'est essentielle, sauf les volets d'un même sujet (même titre avant
    // « : ») : la première l'est (« démarche RSE » → l'engagement écologique ; « renfort » → ni l'événementiel ni la commande).
    const exaequo = res.filter((x) => x.score === res[0].score);
    if (exaequo.length > 1 && !exaequo.every((x) => sujet(mt.rubriques.find((y) => y.id === x.id)?.titre || '') === sujet(r.titre))) continue;
    // Le score doit reposer sur le titre de la rubrique, sur plusieurs mots-clés ou sur un sigle (RSE, SSIAP, PTI…),
    // pas sur un seul mot courant (« renfort »).
    const motsE = motsSignificatifs(e);
    const surTitre = [...motsSignificatifs(r.titre)].some((w) => !VIDES.has(w) && motsE.has(w));
    const sigle = r.mots_cles.some((k) => /^[A-Z0-9]{2,}(?: [A-Z0-9]{2,})*$/.test(k.trim()) && net(e).includes(net(k)));
    if (surTitre || sigle || res[0].score >= 1.5) out.add(r.id);
  }
  return out;
}

/** Partie du RC la plus proche d'un texte (mots communs avec le titre et les attendus) ; la dernière à défaut. */
export function partiePourTexte(parties: PartieRC[], texte: string): PartieRC {
  const m = motsSignificatifs(texte);
  let meilleure = parties[parties.length - 1];
  let max = 0;
  for (const p of parties) {
    let n = 0;
    for (const w of motsSignificatifs(`${p.title} ${p.attendu || ''}`)) if (!VIDES.has(w) && m.has(w)) n++;
    if (n > max) { max = n; meilleure = p; }
  }
  return meilleure;
}

/** Pondération d'une partie du RC (somme des « (N %) » de ses attendus ; 10 à défaut), comme le budget du format court. */
export function poidsPartie(p: PartieRC): number {
  const re = /\((\d+)\s*%\)/g;
  let s = 0;
  let k: RegExpExecArray | null;
  while ((k = re.exec(p.attendu || ''))) s += Number(k[1]);
  return s || 10;
}

/** Pièces administratives de l'offre (assurance, attestations, autorisation d'exercer…) : ni engagement, ni proposition. */
export const PIECES_ADMINISTRATIVES = /assurance|attestation|justificatifs?\b|travail dissimul|kbis|urssaf|autorisation (?:cnaps|d.exercer)|extrait (?:k|du casier)|certificat de r[ée]gularit/i;

/** Garde au plus `max` puces dans la section « Nos engagements sur les exigences du cahier des charges » ajoutée en fin de partie. */
export function plafonnerEngagements(texte: string, max: number): string {
  const m = /\n## Nos engagements sur les exigences du cahier des charges\n\n([\s\S]*)$/.exec(texte);
  if (!m) return texte;
  const puces = m[1].split('\n').filter((l) => /^- /.test(l));
  if (puces.length <= max) return texte;
  return `${texte.slice(0, m.index)}\n## Nos engagements sur les exigences du cahier des charges\n\n${puces.slice(0, max).join('\n')}`;
}

// ─── Cadre imposé : contrôle déterministe des faits nouveaux ─────────────────────────────────────

export interface SourcesFaitsCadre {
  /** Toutes les sources admises (DCE, documentation et mémoires de GSS, registre, textes du mémoire type), normalisées. */
  toutes: string;
  /** Sources de GSS seulement (sans le DCE) : une certification ou un engagement de GSS ne se prouve pas par une exigence du DCE. */
  gss: string;
  /** Numéro unique de GSS (registre telephone_contact) et nom de famille de l'interlocuteur unique qui le porte. */
  telephoneUnique?: string;
  interlocuteurUnique?: string;
  /** Nom complet de l'interlocuteur unique (« MARCHANI Adil »), pour un champ de contact attribué à une autre personne. */
  interlocuteurNom?: string;
  /** Question à poser quand la réponse nomme un partenaire de télésurveillance (ERYMA ou Delta) non confirmé par GSS. */
  questionPartenaire?: string;
}

const echapperRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SIGLES_ADMIS = new Set(['gss', 'cnaps', 'apsad', 'ssiap', 'cqp', 'aps', 'sst', 'pti', 'dati', 'erp', 'iso', 'rse', 'cctp', 'ccap', 'dce', 'pdf', 'ads', 'etp', 'idcc', 'urssaf', 'siret', 'tel', 'mme']);
const CERTIF_TYPE = /\bAPSAD\b[^.;\n]{0,25}?\bP\s?\d\b|\bstations?\s+(?:de\s+t[ée]l[ée]surveillance\s+)?certifi[ée]es?\b/gi;
const AUDIT_FREQ = /\baudits?\b[^.;\n]{0,80}?\b(?:annuel|semestriel|trimestriel|mensuel|bimestriel)(?:le)?s?\b/i;

/**
 * Faits nouveaux d'une réponse au cadre imposé, absents de toutes les sources (DCE, textes du mémoire type, mémoires
 * et registre de GSS) : nom propre ou ville (mot à majuscule hors début de phrase, sigle, ou tout mot d'une réponse
 * courte), certification de type « APSAD P5 » / « stations certifiées » ou engagement de fréquence d'audit
 * (« audit … annuel ») que seules les sources de GSS peuvent prouver. Une réponse courte (200 caractères au plus)
 * devient « [À COMPLÉTER] » ; dans une réponse plus longue, la phrase en cause est retirée. Le numéro unique de GSS
 * ne va qu'avec son interlocuteur unique : associé à un autre nom, il devient « [À COMPLÉTER] ». Chaque retrait
 * donne une question à GSS.
 */
/** Proposition de GSS quand le chien d'un binôme cynophile ne peut pas exercer (à valider par GSS). */
export const RELAIS_CYNOPHILE = 'Si le chien ne peut pas exercer, GSS fait appel à un autre binôme cynophile de ses équipes pour assurer le relais.';

export function controlerFaitsNouveauxCadre(valeur: string, contexte: string, s: SourcesFaitsCadre): { texte: string; questions: string[] } {
  const questions: string[] = [];
  let v = String(valeur || '');
  if (!v.trim() || /^\s*\[À COMPLÉTER\]\.?\s*$/.test(v)) return { texte: v, questions };
  const ctxN = normaliser(contexte || '');
  const libelle = ((contexte || '').match(/Question:\s*"([^"]*)"/) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 120) || '';
  // Apostrophe, trait d'union ou espace indifférents entre les parties d'un mot (« Crit’Air » = « CRIT AIR » du DCE).
  const dansSources = (mot: string, src: string) => new RegExp(`(?<![a-z0-9])${normaliser(mot).split(/['‘´\s-]+/).filter(Boolean).map(echapperRx).join("[\\s'-]?")}(?![a-z0-9])`).test(src);

  // 1. Numéro unique associé à une autre personne que l'interlocuteur unique.
  if (s.telephoneUnique && s.interlocuteurUnique) {
    const chiffres = s.telephoneUnique.replace(/\D/g, '');
    const rxTel = new RegExp(chiffres.split('').join('[\\s.\\-]?'), 'g');
    v = v.split('\n').map((ligne) => ligne.split(/(?<=;)/).map((seg) => {
      if (!rxTel.test(seg)) return seg;
      rxTel.lastIndex = 0;
      const personnes = [...seg.matchAll(/\b([A-ZÀ-ÖØ-Þ]{2,}(?:[ -][A-ZÀ-ÖØ-Þ]{2,})*)\s+([A-ZÀ-ÖØ-Þ][a-zà-ÿ][\wà-ÿ'’-]*)/g)]
        .map((m) => `${m[1]} ${m[2]}`).filter((n) => !SIGLES_ADMIS.has(normaliser(n.split(' ')[0])));
      if (!personnes.length || personnes.some((n) => normaliser(n).includes(normaliser(s.interlocuteurUnique!)))) return seg;
      // Champ de contact (« personne à contacter », « interlocuteur ») ou personne présentée comme « interlocutrice unique »
      // (génération réelle rouen_univ 16 : « VATTIER Marie, interlocutrice unique — tél. : 06 58 06 32 25 ») : le contact de
      // GSS est l'interlocuteur unique (faits de référence) ; son nom remplace l'autre, le numéro unique reste.
      if (s.interlocuteurNom && (/personne (?:a|à) contacter|interlocuteur/.test(ctxN) || /interlocut(?:eur|rice) unique/i.test(seg))) {
        return seg.replace(personnes[0], s.interlocuteurNom).replace(/\binterlocutrice unique\b/gi, 'interlocuteur unique');
      }
      questions.push(`Numéro de téléphone de ${personnes[0]} (le ${s.telephoneUnique} est le numéro unique de l'interlocuteur unique, ${s.interlocuteurUnique})${libelle ? ` — champ « ${libelle} »` : ''}.`);
      return seg.replace(rxTel, '[À COMPLÉTER]');
    }).join('')).join('\n');
  }

  // Partenaire de télésurveillance cité (ERYMA ou Delta, choix de GSS par marché) : gardé, mais à confirmer.
  if (s.questionPartenaire && /\b(?:ERYMA|Delta)\b/.test(v)) questions.push(s.questionPartenaire);

  // 2. Faits nouveaux par phrase (ou par ligne).
  const court = v.length <= 200;
  const motifs = (ph: string): string[] => {
    const out: string[] = [];
    for (const m of ph.matchAll(/[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'’-]{2,}/g)) {
      const mot = m[0].replace(/['’-]+$/, '');
      if (/\d/.test(mot) || SIGLES_ADMIS.has(normaliser(mot))) continue;
      const avant = ph.slice(0, m.index).replace(/\s+$/, '');
      const sigle = /^[A-ZÀ-ÖØ-Þ]{3,}$/.test(mot);
      const debut = avant === '' || /[.!?:;«(\n•—–*-]$/.test(avant);
      if (!sigle && debut && !court) continue;
      if (dansSources(mot, s.toutes) || dansSources(mot, ctxN)) continue;
      out.push(mot);
    }
    for (const m of ph.matchAll(CERTIF_TYPE)) if (!s.gss.replace(/\s+/g, '').includes(normaliser(m[0]).replace(/\s+/g, ''))) out.push(m[0].trim());
    const a = AUDIT_FREQ.exec(ph);
    if (a && !AUDIT_FREQ.test(s.gss)) out.push(a[0]);
    return out;
  };
  if (court) {
    const m = motifs(v);
    if (m.length) {
      questions.push(`À confirmer par GSS${libelle ? ` (champ « ${libelle} »)` : ''} : « ${v.replace(/\s+/g, ' ').trim()} » — ${[...new Set(m)].join(', ')} absent(s) du DCE, du mémoire type, des mémoires et du registre de GSS.`);
      return { texte: '[À COMPLÉTER]', questions };
    }
    return { texte: v, questions };
  }
  // Mise en situation « chien ne pouvant exercer » : une phrase retirée sur la relève du chien est remplacée par une
  // proposition à valider (relais par un autre binôme cynophile de GSS), pour ne pas laisser la question sans réponse.
  const situationChien = /chien[^.]{0,40}(?:ne pouvant|ne peut|indisponib|inapte)|indisponibilit[ée] (?:du|d.un) chien/i.test(contexte || '');
  let relaisPropose = false;
  const texte = v.split('\n').map((ligne) => ligne.split(/(?<=[.;!?])\s+/).map((ph) => {
    const m = motifs(ph);
    if (!m.length) return ph;
    if (situationChien && !relaisPropose && /\bchiens?\b|cynophil|ma[îi]tres?-chiens?/i.test(ph)) {
      relaisPropose = true;
      questions.push(`Proposition à valider${libelle ? ` (champ « ${libelle} »)` : ''} : « ${RELAIS_CYNOPHILE} » remplace « ${ph.replace(/\s+/g, ' ').trim()} » (${[...new Set(m)].join(', ')} absent(s) des sources de GSS).`);
      return RELAIS_CYNOPHILE;
    }
    questions.push(`À confirmer par GSS${libelle ? ` (champ « ${libelle} »)` : ''}, retiré de la réponse : « ${ph.replace(/\s+/g, ' ').trim()} » — ${[...new Set(m)].join(', ')} absent(s) du DCE, du mémoire type, des mémoires et du registre de GSS.`);
    return null;
  }).filter((ph): ph is string => ph !== null).join(' ')).join('\n').replace(/\s*;\s*$/gm, '.').replace(/\n{3,}/g, '\n\n').trim();
  // La réponse ne dit rien du chien alors que la mise en situation le demande : proposition ajoutée, à valider.
  if (situationChien && !relaisPropose && !/\bchiens?\b|cynophil/i.test(texte)) {
    questions.push(`Proposition à valider${libelle ? ` (champ « ${libelle} »)` : ''} : « ${RELAIS_CYNOPHILE} » (indisponibilité du chien, demandée par la mise en situation).`);
    return { texte: `${texte}\n${RELAIS_CYNOPHILE}`.trim(), questions };
  }
  return { texte: texte || '[À COMPLÉTER]', questions };
}
