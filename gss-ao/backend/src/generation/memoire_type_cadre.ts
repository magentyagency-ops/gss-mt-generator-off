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
 * Libellé court d'une question du cadre pour les consultations et le premier message de l'assistant (vitry 202 : « SOUS
 * CRITERE 1 : Mises en situation (sur 20 points) ; DESCRIPTION DES ATTENTES DE L'ACHETEUR ; Sous critère 1 : … Vous devez
 * assurer la sécur », « 2023 - Dénomination sociale… ; 2025 : ….. € ; 2024 : ….. € ; 2023 : ») : intitulé du critère seul
 * (« Sous-critère 1 : Mises en situation »), sans barème, sans pointillés ni fragments de tableau (années, montants vides),
 * coupé à un mot entier.
 */
export function libelleQuestionCadre(question: string, max = 160): string {
  const segments = String(question || '').replace(/\s+/g, ' ').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
  const fin = segments.findIndex((x, i) => i > 0 && /^description (?:des attentes|argument[ée]e)/i.test(x));
  let garde = fin > 0 ? segments.slice(0, fin) : segments;
  if (/^(?:sous[- ]?)?crit[eè]re\b/i.test(garde[0] || '')) garde = garde.slice(0, 1);
  const nets = garde.map((x) => x
    .replace(/[–-]?\s*\(?\s*sur \d+ points?\s*\)?/gi, '')
    .replace(/\s*[–-]?\s*\(?\s*pond[ée]ration\s*:?\s*\d+(?:[.,]\d+)?\s*%\s*\)?/gi, '')
    .replace(/(?:[.…_]\s*){3,}/g, ' ')
    .replace(/^(?:\d{4}\s*[-–—]\s*|[-–—•*]\s*)+/, '')
    .replace(/\s{2,}/g, ' ').trim())
    // Segment sans mot (« 2025 : € », « 2023 : », « ) ») : fragment de tableau.
    .filter((x) => (x.replace(/\b\d{4}\b|€/g, '').match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length > 0);
  let t = nets.join(' ; ').replace(/\s*:\s*$/, '');
  // « SOUS CRITERE 2 : VALEUR TECHNIQUE » → « Sous-critère 2 : Valeur technique ».
  t = t.replace(/^(sous[- ]?)?crit[eè]re\b/i, (x, sous) => (sous ? 'Sous-critère' : 'Critère'))
    .replace(/^((?:Sous-critère|Critère)\s*n?°?\s*\d+(?:\.\d+)*\s*:\s*)([^a-zà-ÿ]+)$/, (x, debut, reste) => `${debut}${reste.charAt(0)}${reste.slice(1).toLowerCase()}`);
  if (t.length > max) t = `${t.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s;:,]+$/, '')}…`;
  return t || String(question || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

/** Phrase de consigne de FORME du cadre (« Le renvoi vers un rapport général … est à proscrire », « Les réponses doivent être
 *  rédigées en français », « Pour rappel, seront prises en compte uniquement … ») : elle ne dit pas le sujet de la question. */
const CONSIGNE_FORME = /^(?:le |tout )?renvoi vers\b|\best à proscrire\b|^les réponses doivent être rédigée?s?\b|^pour rappel\b|^seront prises en compte uniquement\b/i;

/**
 * Question d'un champ du cadre pour la recherche des rubriques du mémoire type (contexte du champ : « Section: "…" |
 * Question: "…" | Contexte: "… / …" | Critère: "…" »). Quand la « question » n'est qu'une consigne de forme (havre2, champ
 * « Mesures et initiatives sociétales » : « Le renvoi vers un rapport général … est à proscrire. Les réponses doivent être
 * rédigées en Français. »), le sujet est pris dans le titre du champ et ses paragraphes voisins, sans les consignes de
 * forme (« Cela peut concerner les personnes éloignées de l'emploi …, la lutte contre les discriminations … »). Sinon,
 * la question telle quelle.
 */
export function questionUtileChamp(contexte: string): string {
  const champ = (nom: string) => (new RegExp(`${nom}:\\s*"([^"]*)"`).exec(String(contexte || '')) || [])[1] || '';
  const q = champ('Question');
  const critere = champ('Critère');
  const proche = champ('Contexte(?: proche)?');
  const vide = q.replace(/[\s.:;,…\-—–/|()]+/g, '').length === 0;
  const base = (vide ? proche.split('/').map((x) => x.trim()).filter(Boolean).pop() || '' : q);
  const utiles = (t: string) => t.split(/(?<=[.!?])\s+/).filter((ph) => ph.trim() && !CONSIGNE_FORME.test(ph.trim())).join(' ').trim();
  if (base && !utiles(base)) {
    const voisins = [utiles(proche.replace(/\s+\/\s+/g, ' / ').split(/\s\/\s(?=[A-ZÀ-Ý«])/).join(' '))].filter(Boolean);
    const sujet = [champ('Section'), ...voisins].filter(Boolean).join(' ').trim();
    if (sujet) return `${sujet} ${critere}`.trim();
  }
  return `${base} ${critere}`.trim();
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
export function candidatsReference(mt: MemoireType, textes: Record<string, string>, question: string, options: { scores?: Record<string, number>; seuil?: number; ecart?: number; maxMots?: number; hors?: boolean; secondeLexicale?: boolean } = {}): CandidatReference[] {
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
  // Question reconstruite depuis le titre et la liste « Cela peut concerner A, B, C » (consigne de forme seule, havre2 :
  // mesures sociétales) : une seconde rubrique lexicale très proche est gardée (non-discrimination 6, recrutement avec
  // France Travail et la Mission locale 5).
  if (options.secondeLexicale) {
    const lex2 = rechercherRubriques(mt, question, 2, parmi)[1];
    if (lex && lex2 && lex2.score >= 4 && lex2.score >= 0.8 * lex.score && !choix.some((x) => x.id === lex2.id)) choix.push({ id: lex2.id, score: scores[lex2.id] ?? 0 });
  }
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
  renvois: Map<number, Array<{ titre: string; libelle: string; texte?: string }>>;
} {
  const ordre = new Map(champs.map((c, i) => [c.id, i]));
  const paires = champs.flatMap((c) => c.candidats.map((x) => ({ champ: c.id, x })))
    .sort((a, b) => b.x.score - a.x.score || (b.x.lexical ?? 0) - (a.x.lexical ?? 0) || ordre.get(a.champ)! - ordre.get(b.champ)!);
  const titulaire = new Map<string, number>();
  for (const p of paires) if (!titulaire.has(p.x.id)) titulaire.set(p.x.id, p.champ);
  const candidats = new Map<number, CandidatReference[]>();
  const renvois = new Map<number, Array<{ titre: string; libelle: string; texte?: string }>>();
  for (const c of champs) {
    const gardes = c.candidats.filter((x) => titulaire.get(x.id) === c.id).map((x, i) => ({ ...x, cle: `R${i + 1}` }));
    candidats.set(c.id, gardes);
    const ailleurs = c.candidats.filter((x) => titulaire.get(x.id) !== c.id)
      .map((x) => ({ titre: x.titre, libelle: champs.find((d) => d.id === titulaire.get(x.id))?.libelle || '', texte: x.texte }));
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
/** Ligne de sous-titre d'une réponse du cadre (« **Pérennité des effectifs** », « ## … », ligne courte sans ponctuation finale). */
export function estSousTitreCadre(ligne: string): boolean {
  const t = String(ligne || '').trim();
  if (!t || /^(?:[•\-*]|\d+[.)])\s/.test(t) || /\[À COMPLÉTER\]|\[CONSULTATION/.test(t)) return false;
  if (/^#{1,4}\s+\S/.test(t) || /^\*\*[^*]+\*\*:?$/.test(t)) return true;
  // Ligne « libellé : valeur » (« Taux de reprise : 100 % », pseudo-tableau « A : B : C ») : jamais un sous-titre.
  if (/:\s*\S/.test(t)) return false;
  return t.length <= 90 && /^[A-ZÀ-Ý]/.test(t) && !/[.;!?»)]$/.test(t) && t.split(/\s+/).length <= 12;
}

export function nettoyerReponseCadre(texte: string): string {
  const lignes = String(texte || '').split('\n');
  const out: string[] = [];
  const vues = new Set<string>();
  const mots = (l: string) => new Set(normaliser(l.split(':')[0]).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const autres = lignes.filter((l) => l.trim() && !/^\[À COMPLÉTER\][.;]?$/.test(l.trim())).length;
  for (const [i, l] of lignes.entries()) {
    const t = l.trim();
    // « [À COMPLÉTER] » seul sur sa ligne au milieu d'une réponse rédigée (havre1 181, 3.4) : sans objet, retiré ; sauf
    // sous un sous-titre resté sans texte (ca_normandie 221, 2.2 : « Besoin urgent de renfort hors astreinte » restait
    // imprimé sans texte) : le repère reste, la donnée est demandée à GSS. Un sous-titre dont le texte suit le repère
    // (vitry 241, critère 3 : « Organisation des déplacements / [À COMPLÉTER] / Nous encourageons nos salariés… ») n'est
    // pas vide : le repère est retiré.
    const precedente = [...out].reverse().find((x) => x.trim()) || '';
    const suivante = lignes.slice(i + 1).find((x) => x.trim()) || '';
    const sousTitreVide = estSousTitreCadre(precedente) && (!suivante.trim() || estSousTitreCadre(suivante) || /^\[À COMPLÉTER\]/.test(suivante.trim()));
    if (/^\[À COMPLÉTER\][.;]?$/.test(t) && autres > 0 && !sousTitreVide) continue;
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

/** Phrase du mémoire type de GSS (publipostée) qui répond à un sujet précis du cadre, reconnu à son libellé. */
export interface PhraseThematique { sujet: RegExp; phrase: string }

/**
 * Phrases thématiques du mémoire type publiposté : le vivier de GSS pour un besoin urgent ou ponctuel de renfort (« Pour les
 * renforts ponctuels, nous disposons d'un vivier de 500 agents validés par nos équipes, dont 100 mobilisables en 48
 * heures », sans les 48 heures hors Normandie). Aucune phrase si la valeur n'est pas publipostée.
 */
export function phrasesThematiques(textes: Record<string, string>): PhraseThematique[] {
  const phrases = Object.values(textes || {}).flatMap((t) => texteBrut(String(t || '')).split('\n')).flatMap((l) => l.split(/(?<=[.!?])\s+/)).map((p) => p.trim());
  const vivier = phrases.find((p) => /^Pour les renforts ponctuels, nous disposons d'un vivier de \d/.test(p) && !/\[À COMPLÉTER\]|\{\{/.test(p));
  return vivier ? [{ sujet: /\brenforts?\b[^.]*\b(?:urgents?|ponctuels?|hors astreinte|impr[ée]vus?)|\b(?:urgents?|ponctuels?)\b[^.]*\brenforts?\b/i, phrase: vivier }] : [];
}

/**
 * Repères sur un sujet que GSS traite dans le mémoire type (vivier pour les renforts urgents) remplacés par la phrase de
 * GSS : ligne « libellé : [À COMPLÉTER] » (ca_normandie 241, 2.2 : « Moyens mis en œuvre pour remédier à un besoin urgent
 * de renfort hors astreinte : [À COMPLÉTER]. ») ou sous-titre resté sans texte (« Besoin urgent de renfort hors astreinte »).
 */
export function completerParThematiques(texte: string, thematiques: PhraseThematique[]): { texte: string; completes: string[] } {
  const lignes = String(texte || '').split('\n');
  const completes: string[] = [];
  if (!thematiques.length) return { texte: lignes.join('\n'), completes };
  const thematique = (t: string) => thematiques.find((x) => x.sujet.test(t) && x.phrase.trim() && !/\[À COMPLÉTER\]|\{\{/.test(x.phrase))?.phrase || '';
  const LIGNE_REPERE = /^\s*([^:\n]{3,200}?)\s*:\s*\[À COMPLÉTER\][.;]?\s*$/;
  for (let i = 0; i < lignes.length; i++) {
    const m = LIGNE_REPERE.exec(lignes[i]);
    const phrase = m ? thematique(m[1]) : '';
    if (phrase) { completes.push(m![1].trim()); lignes[i] = phrase; }
  }
  for (let i = 0; i < lignes.length; i++) {
    if (!estSousTitreCadre(lignes[i])) continue;
    let j = i + 1;
    while (j < lignes.length && !lignes[j].trim()) j++;
    const repere = j < lignes.length && /^\s*\[À COMPLÉTER\][.;]?\s*$/.test(lignes[j]);
    if (!(j >= lignes.length || repere || estSousTitreCadre(lignes[j]))) continue;
    const phrase = thematique(lignes[i]);
    if (!phrase) continue;
    completes.push(lignes[i].trim());
    if (repere) lignes[j] = phrase; else lignes.splice(i + 1, 0, phrase);
  }
  return { texte: lignes.join('\n'), completes };
}

/**
 * Sous-titre d'une réponse du cadre resté sans texte (suivi d'un « [À COMPLÉTER] » seul, d'un autre sous-titre ou de la fin) :
 * rempli avec la phrase du mémoire type de GSS qui traite ce sujet dans les textes fournis (rubriques reprises ou déjà
 * reprises dans une autre réponse), au moins deux mots porteurs du sous-titre en commun (ca_normandie 221, 2.2 : « Besoin
 * urgent de renfort hors astreinte » ← « Pour les renforts ponctuels, nous disposons d'un vivier de 500 agents… »). Sans
 * phrase de GSS, le sous-titre reçoit « [À COMPLÉTER] » (donnée demandée à GSS) : jamais un sous-titre seul.
 */
export function completerSousTitresVides(texte: string, sources: Array<{ texte?: string }>, thematiques: PhraseThematique[] = []): { texte: string; completes: string[] } {
  const VIDES_ST = new Set(['besoin', 'moyen', 'moyens', 'mise', 'oeuvre', 'description', 'gestion', 'organisation', 'politique', 'personnel', 'service', 'prestation', 'mesure', 'mesures']);
  const racines = (t: string) => new Set(normaliser(t).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !VIDES_ST.has(w)).map((w) => w.replace(/s$/, '').slice(0, 7)));
  const phrases = sources.flatMap((s) => String(s.texte || '').split('\n')).filter((l) => l.trim() && !estSousTitreCadre(l) && !/\[À COMPLÉTER\]|\{\{/.test(l))
    .flatMap((l) => l.replace(/^\s*(?:[•\-*]|\d+[.)])\s+/, '').split(/(?<=[.!?])\s+/)).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 6);
  const theme = completerParThematiques(texte, thematiques);
  const lignes = theme.texte.split('\n');
  const completes: string[] = [...theme.completes];
  for (let i = 0; i < lignes.length; i++) {
    if (!estSousTitreCadre(lignes[i])) continue;
    let j = i + 1;
    while (j < lignes.length && !lignes[j].trim()) j++;
    const repere = j < lignes.length && /^\s*\[À COMPLÉTER\][.;]?\s*$/.test(lignes[j]);
    // Ligne suivante qui amorce une liste (« Nous veillons au respect de bonnes pratiques dans nos locaux : » puis ses
    // puces), ou qui suit ce sous-titre dans le texte de GSS (havre2 341 : « Les économies d'énergie : » complété par une
    // phrase insérée avant l'amorce de sa liste) : le sous-titre a son texte.
    const amorce = j < lignes.length && /:\s*$/.test(lignes[j]) && j + 1 < lignes.length && /^\s*(?:[•\-*]|\d+[.)])\s/.test(lignes[j + 1]);
    const n = (x: string) => normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim();
    const suiteDeGss = j < lignes.length && sources.some((src) => {
      const ls = String(src.texte || '').split('\n').map(n).filter(Boolean);
      return ls.some((l, k) => l === n(lignes[i]) && ls[k + 1] === n(lignes[j]));
    });
    // Sous-titre du cadre suivi d'un sous-titre de GSS qui a son texte (citedia2 474 : « Continuité et stabilité des équipes »
    // puis « La stabilité des équipes : » et sa phrase) : le bloc de GSS lui répond, il n'est pas vide (T4N-5).
    let k2 = j + 1;
    while (k2 < lignes.length && !lignes[k2].trim()) k2++;
    const blocDeGss = j < lignes.length && estSousTitreCadre(lignes[j]) && k2 < lignes.length && !estSousTitreCadre(lignes[k2]) && !/^\s*\[À COMPLÉTER\][.;]?\s*$/.test(lignes[k2])
      && sources.some((src) => String(src.texte || '').split('\n').some((l) => n(l) === n(lignes[j])));
    const vide = j >= lignes.length || repere || (estSousTitreCadre(lignes[j]) && !amorce && !suiteDeGss && !blocDeGss);
    if (!vide) continue;
    const cible = racines(lignes[i].replace(/[#*]/g, ''));
    let meilleure = '', score = 0, exaequo = 0;
    for (const p of phrases) {
      const r = racines(p);
      const n = [...cible].filter((w) => r.has(w)).length;
      if (n > score) { score = n; meilleure = p; exaequo = 0; } else if (n === score && n > 0 && p !== meilleure) exaequo++;
    }
    // Deux mots porteurs en commun, ou un seul s'il ne désigne qu'une phrase des textes de GSS.
    const valeur = score >= 2 || (score === 1 && !exaequo) ? meilleure : '[À COMPLÉTER]';
    if (valeur !== '[À COMPLÉTER]') completes.push(lignes[i].trim());
    // Phrase de GSS déjà présente plus loin dans la réponse (citedia2 442, T4N-5 : « Nous privilégions la stabilité… »
    // sous « La stabilité des équipes : ») : déplacée sous ce sous-titre, jamais recopiée (le doublon retiré ensuite
    // laissait le sous-titre de GSS sans texte) ; le sous-titre de GSS resté sans texte est retiré.
    let deplacee = false;
    if (valeur !== '[À COMPLÉTER]') {
      const k = lignes.findIndex((l, x) => x > i && l.includes(valeur));
      if (k > i) {
        const reste = lignes[k].replace(valeur, '').replace(/\s{2,}/g, ' ').trim();
        if (!reste || /^(?:[•\-*]|\d+[.)])$/.test(reste)) lignes.splice(k, 1); else lignes[k] = lignes[k].replace(valeur, '').replace(/\s{2,}/g, ' ').trimEnd();
        deplacee = true;
      }
    }
    if (repere) lignes[j] = valeur;
    else lignes.splice(i + 1, 0, valeur);
    if (deplacee) {
      for (let x = i + 2; x < lignes.length; x++) {
        if (!estSousTitreCadre(lignes[x])) continue;
        let y = x + 1;
        while (y < lignes.length && !lignes[y].trim()) y++;
        const sansTexte = y >= lignes.length || estSousTitreCadre(lignes[y]);
        const deGss = sources.some((src) => String(src.texte || '').split('\n').some((l) => n(l) === n(lignes[x])));
        if (sansTexte && deGss) { lignes.splice(x, y - x); x--; }
      }
    }
  }
  return { texte: lignes.join('\n').replace(/\n{3,}/g, '\n\n'), completes };
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
  const base = limite ? Math.max(couverture, fidelite(reponse, reference, 0.8, autorises)) : couverture;
  return base * ordreEtSousTitres(reference, reponse);
}

/**
 * Forme du texte de GSS dans une réponse (havre2 335 et 341, champ 37 : fidélité affichée 1,00 pour un texte remis
 * dans le désordre, une puce en double et quatre sous-titres perdus) : produit de trois parts, chacune de 0 à 1 :
 *  - ordre : phrases de GSS reprises dans l'ordre de la référence (plus longue suite dans l'ordre / phrases reprises) ;
 *  - doublons : phrases de GSS écrites une seule fois (une phrase de GSS reprise deux fois compte en plus) ;
 *  - sous-titres : sous-titres de GSS (« Les transports : ») présents devant un contenu repris.
 * 1 quand la réponse garde l'ordre, les sous-titres et aucune redite.
 */
/** Sous-titre d'un texte de GSS en texte brut (« Les transports : », « **Le numérique** ») : court, sans phrase avant les deux-points. */
export function sousTitreDeReference(ligne: string): boolean {
  const l = String(ligne || '').trim();
  if (/^\*\*[^*]+\*\*\s*:?$/.test(l)) return true;
  return /:\s*$/.test(l) && motsDePhrase(l).length <= 8 && estSousTitreCadre(l.replace(/\s*:\s*$/, ''));
}

/**
 * Phrase qui redit une phrase de GSS (même critère que la mesure de forme : 48 % de mots communs et 80 % de ressemblance) :
 * un ajout de ce genre est une redite, retirée comme une bribe (citedia2 474, T4N-5 : « Nombre : 3 titulaires, représentant
 * 2,39 ETP… » qui redit la ligne du tableau de l'équipe dédiée).
 */
export function rediteDePhrase(phraseGss: string, phrase: string): boolean {
  const net = (t: string) => normaliser(String(t || '').replace(/\*\*/g, '')).replace(/^[\s•*\-\d.)]+/, '').replace(/[^a-z0-9']+/g, ' ').trim().split(' ').filter(Boolean);
  const p = net(phraseGss), c = net(phrase);
  if (p.length < 3 || c.length < 3) return false;
  const jeu = new Set(p);
  let communs = 0;
  for (const w of c) if (jeu.has(w)) communs++;
  return communs / Math.max(p.length, c.length) >= 0.48 && similarite(p, c) >= 0.8;
}

export function ordreEtSousTitres(reference: string, reponse: string): number {
  const net = (t: string) => normaliser(String(t || '').replace(/\*\*/g, '')).replace(/^[\s•*\-\d.)]+/, '').replace(/[^a-z0-9']+/g, ' ').trim();
  const phrases = (t: string) => String(t || '').split('\n').flatMap((l, ligne) => l.split(/(?<=[.!?;])\s+/).map((brut) => ({ brut, ligne, mots: net(brut).split(' ').filter(Boolean) })))
    .filter((x) => x.mots.length >= 3);
  const ref = phrases(reference);
  const cand = phrases(reponse);
  if (!ref.length || !cand.length) return 1;
  // Phrase de la réponse la plus proche de chaque phrase de GSS (ressemblance de 80 % au moins), et redites.
  const positions: number[] = [];
  const contenuRepris = new Set<number>();
  let reprises = 0;
  let doublons = 0;
  // Chaque phrase de GSS est appariée à la phrase la plus proche encore libre : deux phrases de GSS presque identiques
  // (en-têtes des tableaux de l'équipe dédiée et des ressources de GSS, citedia2 474) ont chacune la leur ; seule une phrase
  // proche que nulle phrase de GSS ne prend est une redite.
  const prochesDe: Array<Array<{ j: number; s: number }>> = ref.map((p) => {
    const jeu = new Set(p.mots);
    const proches: Array<{ j: number; s: number }> = [];
    cand.forEach((c, j) => {
      let communs = 0;
      for (const w of c.mots) if (jeu.has(w)) communs++;
      if (communs / Math.max(p.mots.length, c.mots.length) < 0.48) return;
      const s = similarite(p.mots, c.mots);
      if (s >= 0.8) proches.push({ j, s });
    });
    return proches;
  });
  const pris = new Set<number>();
  ref.forEach((p, k) => {
    const proches = prochesDe[k];
    if (!proches.length) return;
    const libre = [...proches].sort((a, b) => b.s - a.s || a.j - b.j).find((x) => !pris.has(x.j)) || proches[0];
    pris.add(libre.j);
    reprises++;
    contenuRepris.add(p.ligne);
    positions.push(libre.j);
  });
  const redites = new Set<number>();
  prochesDe.forEach((proches) => proches.forEach((x) => { if (!pris.has(x.j)) redites.add(x.j); }));
  doublons = redites.size;
  if (!reprises) return 1;
  // Plus longue suite croissante des positions (ordre de GSS conservé).
  const fins: number[] = [];
  for (const x of positions) {
    let a = 0, b = fins.length;
    while (a < b) { const m = (a + b) >> 1; if (fins[m] < x) a = m + 1; else b = m; }
    fins[a] = x;
  }
  const ordre = fins.length / positions.length;
  const sansDoublon = reprises / (reprises + doublons);
  // Sous-titres de GSS dont le contenu (lignes suivantes, jusqu'à une ligne vide ou au sous-titre suivant) est repris.
  const lignesRef = String(reference || '').split('\n');
  const lignesRep = new Set(String(reponse || '').split('\n').map((l) => net(l)).filter(Boolean));
  let attendus = 0, presents = 0;
  lignesRef.forEach((l, i) => {
    if (!sousTitreDeReference(l)) return;
    let repris = false;
    for (let j = i + 1; j < lignesRef.length && lignesRef[j].trim() && !sousTitreDeReference(lignesRef[j]); j++) if (contenuRepris.has(j)) { repris = true; break; }
    if (!repris) return;
    attendus++;
    if (lignesRep.has(net(l))) presents++;
  });
  const sousTitres = attendus ? presents / attendus : 1;
  return ordre * sansDoublon * sousTitres;
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

/** Racines porteuses (5 lettres et plus, hors mots vides) d'un libellé, pour rapprocher un sous-titre d'un élément attendu. */
const VIDES_ATTENDU = new Set(['dans', 'cadre', 'marche', 'prestation', 'prestations', 'service', 'mise', 'oeuvre', 'mises', 'propose', 'proposes', 'proposee', 'proposees', 'affecte', 'affectes', 'permettant', 'ensemble']);
const racinesAttendu = (t: string) => new Set(normaliser(t).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !VIDES_ATTENDU.has(w)).map((w) => w.replace(/s$/, '').slice(0, 7)));

/** Sous-titre ou ligne qui porte sur un élément attendu du cadre : deux racines communes, ou la moitié des siennes. */
export function correspondAttendu(ligne: string, attendu: string): boolean {
  const a = racinesAttendu(attendu), l = racinesAttendu(ligne);
  if (!a.size || !l.size) return false;
  const n = [...a].filter((w) => l.has(w)).length;
  return n >= 2 || n / Math.min(a.size, l.size) >= 0.5;
}

/**
 * Éléments attendus d'un champ du cadre (« Éléments de réponse attendus : ; Présentation de la main courante électronique ;
 * … »), lus dans le libellé ou le contexte du champ. Liste vide s'il n'y en a pas.
 */
export function attendusDuChamp(texte: string): string[] {
  const m = /[ÉE]l[ée]ments?\s+(?:de\s+r[ée]ponse\s+)?attendus?\s*:?/i.exec(String(texte || ''));
  if (!m) return [];
  const suite = String(texte).slice(m.index + m[0].length).split(/"\s*(?:\||$)|\n\s*\n\s*\n/)[0];
  return [...new Set(suite.split(/\s*;\s*|\n+/).map((x) => x.replace(/^[\s•\-*]+/, '').trim())
    .filter((x) => x.split(/\s+/).length >= 3 && x.length <= 200 && /^[A-ZÀ-Ý]/.test(x) && !/\b(?:maximum|pages?\s+recto|sur \d+ points|description argument)/i.test(x)))];
}

/**
 * Éléments attendus du cadre sans réponse dans le texte remis : ni sous-titre ni ligne qui y correspond (T4N-4). Ils sont
 * signalés à GSS (« Réponse à relire »).
 */
export function attendusSansReponse(texte: string, attendus: string[]): string[] {
  const lignes = String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return attendus.filter((a) => !lignes.some((l) => correspondAttendu(l, a)));
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
export function recalerSurReference(reference: string, reponse: string, o: { limite?: boolean; maxMots?: number; seuil?: number; exclure?: (phrase: string) => boolean; dce?: string; attendus?: string[] } = {}): ResultatRecalage {
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
  // Phrase du modèle collée après l'amorce d'une liste de GSS (havre2 341 : « …les recycle selon trois filières : Ces
  // dispositions associent… ») : l'amorce et la phrase ajoutée sont deux phrases (six mots au moins de part et d'autre).
  const separerAmorce = (brut: string): string[] => {
    const m = /^(.*\S)\s:\s+([A-ZÀ-Ý].*[.!?])$/.exec(brut);
    if (!m || motsDePhrase(m[1]).length < 6 || motsDePhrase(m[2]).length < 6) return [brut];
    return [`${m[1]} :`, m[2]];
  };
  const sortie: Ligne[] = decouper(reponse).map((l) => ({ items: l.flatMap(separerAmorce).map((brut) => ({ brut, mots: motsDePhrase(brut) })) }));
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
  // Tableau de GSS (lignes « Catégorie : Qualification : Nombre : Observations » issues d'un tableau Markdown, deux au
  // moins de suite) : toutes ses lignes ou aucune, quelle que soit la limite de mots (ca_normandie 221 : tableau de
  // l'équipe dédiée réduit à ses 2 lignes SSIAP, 41 agents, sous la phrase « une équipe de 83 agents titulaires »).
  let lignesTableauRemises = 0;
  {
    const LIGNE_TABLEAU = /^(?![•\-*]\s)[^:\n]{2,}(?:\s:\s[^:\n]+){2,}$/;
    const estTableau = (i: number) => LIGNE_TABLEAU.test((lignesRef[i] || []).join(' ').trim());
    for (let i = 0; i < lignesRef.length; i++) {
      if (!estTableau(i) || (i > 0 && estTableau(i - 1))) continue;
      let j = i;
      while (j + 1 < lignesRef.length && estTableau(j + 1)) j++;
      if (j === i) continue;
      const indices = (l: number) => ref.map((_, k) => k).filter((k) => ref[k].ligne === l);
      const presentes = Array.from({ length: j - i + 1 }, (_, n) => i + n).filter((l) => indices(l).some((k) => position.has(k)));
      if (!presentes.length) continue;
      for (let l = i; l <= j; l++) {
        const ks = indices(l);
        if (ks.some((k) => position.has(k))) continue;
        const ligne: Ligne = { items: ks.map((k) => ({ brut: ref[k].brut, mots: ref[k].mots, ref: k })) };
        // Après la ligne précédente du tableau déjà placée ; sinon avant la suivante.
        let apres: Ligne | undefined;
        for (let m = l - 1; m >= i && !apres; m--) { const k = indices(m).find((x) => position.has(x)); if (k !== undefined) apres = position.get(k)!.ligne; }
        if (apres) sortie.splice(sortie.indexOf(apres) + 1, 0, ligne);
        else {
          let avant: Ligne | undefined;
          for (let m = l + 1; m <= j && !avant; m++) { const k = indices(m).find((x) => position.has(x)); if (k !== undefined) avant = position.get(k)!.ligne; }
          sortie.splice(avant ? sortie.indexOf(avant) : sortie.length, 0, ligne);
        }
        ligne.items.forEach((it) => position.set(it.ref!, { ligne, item: it }));
        lignesTableauRemises++;
      }
    }
  }
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
  // Phrase de GSS rétablie après un « ; » (« …dans la main courante électronique ; Le rapport trimestriel… », citedia2 442,
  // T4N-4) : le déterminant qui suit le point-virgule reprend sa minuscule.
  const APRES_PV = /^(?:Le|La|Les|L['’]|Un|Une|Des|Ce|Cet|Cette|Ces|Nous|Notre|Nos|Chaque|Il|Elle|Ils|Elles|Leur|Leurs|Son|Sa|Ses)(?=[\s'’])/;
  const rendre = () => sortie.map((l) => l.items.map((x) => x.brut.trim()).reduce((acc, x) => {
    if (!acc) return x;
    return `${acc} ${/;\s*$/.test(acc) && APRES_PV.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x}`;
  }, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const compter = (t: string) => (t.match(/[\wÀ-ÿ'’-]+/g) || []).length;
  // Sous-titre de GSS (ligne d'une seule phrase courte terminée par « : ») : remis en second, devant son contenu.
  const sousTitre = (k: number) => lignesRef[ref[k].ligne].length === 1 && /:\s*$/.test(ref[k].brut) && ref[k].mots.length <= 8;
  // Ligne de sous-titre de la référence (« Les transports : »), même de moins de trois mots (« Le numérique : »).
  const ligneSousTitre = (i: number) => (lignesRef[i] || []).length === 1 && sousTitreDeReference(lignesRef[i][0]);
  const estPuce = (i: number) => PUCE.test((lignesRef[i] || [])[0] || '');
  // Ligne d'un tableau de GSS (« Catégorie : Qualification : Nombre : Observations ») et amorce qui l'introduit
  // (« …constitué l'équipe suivante : ») : un bloc indivisible (T4N-5, citedia2 442 : amorce séparée de son tableau par
  // les sous-titres du cadre, « Observations Nombre : 3. » collé à la ligne d'en-tête).
  const LIGNE_TABLEAU_REF = /^(?![•\-*]\s)[^:\n]{2,}(?:\s:\s[^:\n]+){2,}$/;
  const estTableauRef = (i: number) => LIGNE_TABLEAU_REF.test((lignesRef[i] || []).join(' ').trim());
  const amorceTableau = (i: number) => !ligneSousTitre(i) && /:\s*$/.test((lignesRef[i] || [])[(lignesRef[i] || []).length - 1] || '') && estTableauRef(i + 1);
  // Sous-titre de GSS écrit tel quel par le modèle (souvent moins de trois mots, jamais apparié) : c'est celui de GSS.
  for (const it of items) {
    if (it.ref !== undefined) continue;
    const n = normaliser(it.brut.replace(PUCE, '')).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!n) continue;
    const k = ref.findIndex((p, j) => !position.has(j) && ligneSousTitre(p.ligne) && normaliser(p.brut).replace(/[^a-z0-9]+/g, ' ').trim() === n);
    if (k >= 0) { it.ref = k; it.ajout = false; position.set(k, { ligne: ligneDe(it), item: it }); }
  }
  /**
   * Réponse recomposée dans l'ordre du texte de GSS (consigne 5, D7 ; havre2 335 et 341, champ 37 : lignes de GSS dans le
   * désordre, puces du numérique fondues dans le paragraphe du recyclage, phrase de l'IA entre « trois filières : » et
   * sa liste, sous-titres perdus) : chaque ligne de GSS reprise revient à sa place, avec la puce de GSS ; chaque sous-titre
   * de GSS est remis devant son contenu repris ; les ajouts propres à la question suivent la ligne de GSS qu'ils suivaient
   * dans la réponse (dans le paragraphe s'ils le prolongeaient), jamais entre une ligne terminée par « : » et sa liste
   * (après la liste, ou après le bloc du sous-titre). `ajoutsALaFin` : tous les ajouts après le texte de GSS.
   */
  const recomposer = (ajoutsALaFin: boolean) => {
    // Ajouts regroupés par ligne de GSS d'ancrage (dernière phrase de GSS qui les précède dans la réponse).
    type Morceau = { ancre: number; lignes: Item[][]; dansLaLigne: boolean; suivant?: number };
    const morceaux: Morceau[] = [];
    let ancre = -1;
    let ligneAncre: Ligne | null = null;
    let sansSuivant: Morceau[] = [];
    for (const l of sortie) {
      let courant: Item[] | null = null;
      for (const it of l.items) {
        if (it.ref !== undefined) {
          // Phrase de GSS qui suit l'ajout dans la réponse (amorce de tableau : l'ajout reste devant elle).
          for (const m of sansSuivant) m.suivant = it.ref;
          sansSuivant = [];
          ancre = it.ref; ligneAncre = l; courant = null; continue;
        }
        const dernier = morceaux[morceaux.length - 1];
        if (!courant) {
          courant = [];
          if (dernier && dernier.ancre === ancre && ligneAncre !== l) dernier.lignes.push(courant);
          else { morceaux.push({ ancre, lignes: [courant], dansLaLigne: ligneAncre === l }); sansSuivant.push(morceaux[morceaux.length - 1]); }
        }
        courant.push(it);
      }
      if (!l.items.length) { const dernier = morceaux[morceaux.length - 1]; if (dernier && dernier.ancre === ancre) dernier.lignes.push([]); }
    }
    // Fin du groupe d'une ligne de GSS : une amorce « … : » ou une puce va jusqu'au bout de sa liste ; un sous-titre jusqu'au bout de son bloc.
    const finGroupe = (i: number): number => {
      let j = i;
      if (ligneSousTitre(i)) {
        while (j + 1 < lignesRef.length && lignesRef[j + 1].length && !ligneSousTitre(j + 1)) j++;
        return j;
      }
      const dernierePhrase = (lignesRef[i] || [])[(lignesRef[i] || []).length - 1] || '';
      if (estTableauRef(i) || amorceTableau(i)) { while (j + 1 < lignesRef.length && estTableauRef(j + 1)) j++; return j; }
      if (/:\s*$/.test(dernierePhrase) || estPuce(i)) while (j + 1 < lignesRef.length && estPuce(j + 1)) j++;
      return j;
    };
    const presents = (i: number) => ref.map((_, k) => k).filter((k) => ref[k].ligne === i && position.has(k));
    const nouvelle: Ligne[] = [];
    const aPlacer = new Map<number, Morceau[]>();
    // Ajouts écrits avant une amorce de tableau (sous-titres et textes du cadre) : placés devant l'amorce, qui reste collée
    // à son tableau.
    const avantLigne = new Map<number, Morceau[]>();
    const enTete: Morceau[] = [];
    const aLaFin: Morceau[] = [];
    for (const m of morceaux) {
      if (m.ancre < 0) { enTete.push(m); continue; }
      const i = ref[m.ancre].ligne;
      // Ajout qui prolonge la ligne de GSS dans la réponse : gardé dans la ligne s'il ne suit pas une amorce « … : » ; sur
      // une puce, seulement une phrase courte qui la complète (« Avec l'accord de notre interlocuteur, nous y ajoutons un
      // gilet pare-lame. ») ; sinon après la liste ou le bloc.
      const premiere = m.lignes[0] || [];
      const court = premiere.length < 2 && premiere.reduce((a, x) => a + x.mots.length, 0) < 35;
      const dansLaLigne = m.dansLaLigne && !ligneSousTitre(i) && !estTableauRef(i) && !/:\s*$/.test(ref[m.ancre].brut) && (!estPuce(i) || court);
      if (ajoutsALaFin && !(dansLaLigne && m.lignes.length === 1)) { aLaFin.push(m); continue; }
      // Ajout écrit juste avant une amorce de tableau (ou juste après elle) : devant l'amorce, jamais entre elle et son tableau.
      const amorce = amorceTableau(i) ? i : m.suivant !== undefined && amorceTableau(ref[m.suivant].ligne) && ref[m.suivant].ligne > i && finGroupe(i) >= ref[m.suivant].ligne ? ref[m.suivant].ligne : -1;
      if (amorce >= 0 && !dansLaLigne) { if (!avantLigne.has(amorce)) avantLigne.set(amorce, []); avantLigne.get(amorce)!.push({ ...m, dansLaLigne: false }); continue; }
      const cible = dansLaLigne ? i : finGroupe(i);
      if (!aPlacer.has(cible)) aPlacer.set(cible, []);
      aPlacer.get(cible)!.push({ ...m, dansLaLigne });
    }
    const poser = (m: Morceau, ligne?: Ligne) => {
      m.lignes.forEach((items, n) => {
        if (n === 0 && m.dansLaLigne && ligne) ligne.items.push(...items);
        else nouvelle.push({ items });
      });
    };
    for (const m of enTete) poser(m);
    let vide = false;
    for (let i = 0; i < lignesRef.length; i++) {
      let ligne: Ligne | undefined;
      if (!lignesRef[i].length) {
        if (nouvelle.length && !vide) { nouvelle.push({ items: [] }); vide = true; }
      } else if (ligneSousTitre(i)) {
        // Sous-titre : imprimé si une ligne de son bloc est reprise.
        let repris = false;
        for (let j = i + 1; j < lignesRef.length && lignesRef[j].length && !ligneSousTitre(j); j++) if (presents(j).length) { repris = true; break; }
        const k = ref.findIndex((p) => p.ligne === i);
        if (repris && !exclus[k]) {
          const it = position.get(k)?.item || { brut: ref[k].brut, mots: ref[k].mots, ref: k };
          it.brut = ref[k].brut;
          ligne = { items: [it] };
          position.set(k, { ligne, item: it });
          nouvelle.push(ligne);
          vide = false;
        }
      } else {
        const ks = presents(i);
        if (ks.length) {
          for (const m of avantLigne.get(i) || []) { poser(m); vide = false; }
          const premier = ref.findIndex((p) => p.ligne === i);
          const puce = (PUCE.exec(ref[premier].brut) || [''])[0];
          const its = ks.map((k) => position.get(k)!.item);
          its.forEach((it, n) => { it.brut = `${n === 0 ? puce : ''}${it.brut.replace(PUCE, '')}`; });
          ligne = { items: its };
          ks.forEach((k, n) => position.set(k, { ligne: ligne!, item: its[n] }));
          nouvelle.push(ligne);
          vide = false;
        }
      }
      for (const m of aPlacer.get(i) || []) {
        // Ajout placé après une liste de GSS : son propre paragraphe (jamais lu comme une puce de la liste).
        if (!m.dansLaLigne && estPuce(i) && nouvelle.length && nouvelle[nouvelle.length - 1].items.length) nouvelle.push({ items: [] });
        poser(m, ligne);
        vide = false;
      }
    }
    if (aLaFin.length) {
      if (nouvelle.length && !vide) nouvelle.push({ items: [] });
      for (const m of aLaFin) poser(m);
    }
    sortie.splice(0, sortie.length, ...nouvelle.filter((l, n, t) => l.items.length || (n > 0 && t[n - 1].items.length)));
  };
  // Réponse du modèle qui ne reprend presque rien du texte de GSS (fidélité sous 0,5, havre2 : 0,14 et 0,17) : le texte de
  // GSS est remis tel quel, et ce que le modèle a écrit pour la question le suit.
  const ajoutsALaFin = fideliteAvant < 0.5;
  // Phrase ajoutée qui ouvre un paragraphe par un pronom (« Elle peut également, si elle le souhaite, être destinataire
  // des rapports… », citedia2 442, T4N-4) : son antécédent a été retiré ou n'est pas là ; elle est retirée.
  // « Il » impersonnel (« Il peut arriver que… », « Il est », « Il faut ») : jamais un pronom sans antécédent.
  const PRONOM = /^(?:Elle|Il(?!\s+(?:peut arriver|arrive|est|faut|s['’]agit|existe|convient|y a|importe|appara[iî]t)\b)|Ils|Elles|Celle-ci|Celui-ci|Ceux-ci|Celles-ci|Cela|Ce dernier|Cette derni[èe]re)\s/;
  const retirerOrphelines = (): number => {
    let n = 0;
    for (let li = 0; li < sortie.length; li++) {
      const l = sortie[li];
      const premier = l.items[0];
      const demonstratif = /^(Cette|Cet|Ces|Ce)\s+(?!qui\b|que\b|qu['’]|dont\b|sont\b|est\b|sera\b|serait\b)([a-zà-ÿ])/.exec(premier?.brut || '');
      if (!premier?.ajout || (!PRONOM.test(premier.brut) && !demonstratif)) continue;
      const prec = [...sortie.slice(0, li)].reverse().find((x) => x.items.length);
      const precTexte = prec ? prec.items.map((x) => x.brut).join(' ').trim() : '';
      const debutDeBloc = !prec || !sortie[li - 1]?.items.length || (prec.items.length === 1 && (estSousTitreCadre(precTexte) || /:\s*$/.test(precTexte)));
      if (!debutDeBloc) continue;
      // Démonstratif sans antécédent (« Cette transmission permet… » sous « Modalités d'alerte », citedia2 474) : article défini.
      if (demonstratif) {
        const article = { Cette: 'La', Ce: 'Le', Ces: 'Les', Cet: "L'" }[demonstratif[1] as 'Cette' | 'Ce' | 'Ces' | 'Cet'];
        premier.brut = premier.brut.replace(/^(Cette|Cet|Ces|Ce)\s+/, article === "L'" ? "L'" : `${article} `);
        n++;
        continue;
      }
      l.items.shift();
      n++;
      li--;
    }
    return n;
  };
  // Fragment de pseudo-tableau écrit par le modèle sous un tableau de GSS (citedia2 474, T4N-5 : « Nombre : 3 titulaires,
  // représentant 2,39 ETP… » sous le tableau de l'équipe dédiée, ou collé à son en-tête) : phrase ajoutée qui commence par
  // un intitulé de colonne du tableau ; elle redit le tableau, elle est retirée.
  const retirerPseudoTableau = (): number => {
    let n = 0;
    const colonnes = new Set<string>();
    for (let i = 0; i < lignesRef.length; i++) {
      if (!estTableauRef(i) || (i > 0 && estTableauRef(i - 1))) continue;
      lignesRef[i].join(' ').split(/\s:\s/).map((c) => normaliser(c).replace(/[^a-z0-9 ]+/g, ' ').trim()).filter((c) => c.length >= 3).forEach((c) => colonnes.add(c));
    }
    if (colonnes.size) {
      for (let li = 1; li < sortie.length; li++) {
        const prec = sortie[li - 1];
        const tableauAvant = prec.items.length > 0 && prec.items.every((x) => x.ref !== undefined) && estTableauRef(ref[prec.items[0].ref!].ligne);
        if (!tableauAvant) continue;
        const l = sortie[li];
        while (l.items.length && l.items[0].ajout) {
          const m = /^\s*([^:]{3,40}?)\s*:\s*\S/.exec(l.items[0].brut);
          if (!m || !colonnes.has(normaliser(m[1]).replace(/[^a-z0-9 ]+/g, ' ').trim())) break;
          l.items.shift();
          n++;
        }
      }
    }
    return n;
  };
  recomposer(ajoutsALaFin);
  const pseudoTableau = retirerPseudoTableau();
  retirerOrphelines();
  let texte = rendre();
  if (o.limite && mesure(texte) >= seuil) {
    return { texte, fideliteAvant, fidelite: mesure(texte), reformulees, reinserees: lignesTableauRemises, ajoutsRetires: 0, bribesRetirees: pseudoTableau };
  }
  // 2. Phrases de GSS omises remises à leur place (dans la limite de mots s'il y en a une).
  const budget = o.maxMots !== undefined ? Math.max(o.maxMots, compter(texte)) : Infinity;
  let mots = compter(texte);
  let reinserees = lignesTableauRemises;
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
  let bribesRetirees = pseudoTableau;
  for (const l of sortie) {
    for (let j = l.items.length - 1; j >= 0; j--) {
      const it = l.items[j];
      if (!it.ajout) continue;
      const jeu = new Set(it.mots);
      const bribe = ref.some((p, k) => position.has(k) && ((p.mots.length >= it.mots.length
        && [...jeu].filter((w) => p.mots.includes(w)).length / jeu.size >= 0.7) || rediteDePhrase(p.brut, it.brut)));
      if (bribe) { l.items.splice(j, 1); bribesRetirees++; }
    }
  }
  bribesRetirees += retirerPseudoTableau();
  detacherAjouts();
  recomposer(ajoutsALaFin);
  retirerOrphelines();
  texte = rendre();
  // 3. Limite de longueur atteinte et fidélité encore insuffisante : ajouts retirés, du dernier au premier. Jamais la
  // seule réponse à un élément attendu du cadre (T4N-4, citedia2 442 : 17 ajouts retirés, « Modalités d'alerte », « Démarche
  // qualité », « Traitement des anomalies » et « Indicateurs » restés sans réponse) : son sous-titre et le début de son
  // texte (60 mots) sont gardés ; la réponse reste alors « à relire » si la fidélité n'atteint pas le seuil.
  const proteges = new Set<Item>();
  if (o.attendus?.length) {
    const titreSeul = (l: Ligne) => l.items.length === 1 && estSousTitreCadre(l.items[0].brut);
    for (let li = 0; li < sortie.length; li++) {
      const l = sortie[li];
      if (!titreSeul(l) || !l.items[0].ajout || !o.attendus.some((a) => correspondAttendu(l.items[0].brut, a))) continue;
      const bloc: Item[] = [];
      for (let m = li + 1; m < sortie.length && !titreSeul(sortie[m]); m++) bloc.push(...sortie[m].items);
      // Sous-titre du cadre devant le texte de GSS qui répond à l'élément : gardé (quelques mots).
      if (bloc.some((it) => it.ref !== undefined)) { proteges.add(l.items[0]); continue; }
      const ajouts = bloc.filter((it) => it.ajout);
      if (!ajouts.length) continue;
      proteges.add(l.items[0]);
      let n = 0;
      for (const it of ajouts) { if (n >= 60) break; proteges.add(it); n += it.mots.length; }
    }
  }
  let ajoutsRetires = 0;
  if (mesure(texte) < seuil) {
    for (let li = sortie.length - 1; li >= 0 && mesure(texte) < seuil; li--) {
      const l = sortie[li];
      for (let j = l.items.length - 1; j >= 0 && mesure(texte) < seuil; j--) {
        if (!l.items[j].ajout || proteges.has(l.items[j])) continue;
        l.items.splice(j, 1);
        ajoutsRetires++;
        texte = rendre();
      }
    }
  }
  if (retirerOrphelines()) texte = rendre();
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

/**
 * Canal écrit du point d'entrée unique (T4C-8, rouen_univ 472 : « … le recours complémentaire à un courriel, une
 * application dédiée ou un extranet est [À COMPLÉTER] » alors que le mémoire type de GSS donne « Mail unique :
 * contact@gss-securite.fr ») : la phrase laissée à compléter sur le courriel est remplacée par la ligne de GSS.
 * `mail` vient du texte de GSS (rubrique b3_interlocuteur_unique) ; '' : rien n'est fait.
 */
export function completerMailUnique(texte: string, mail: string): { texte: string; complete: boolean } {
  const m = String(mail || '').trim();
  if (!m || !/@/.test(m)) return { texte, complete: false };
  let complete = false;
  const sortie = String(texte || '').split('\n').map((ligne) => ligne.split(/(?<=[.!?])\s+/).map((ph) => {
    if (!/\[À COMPLÉTER\]/.test(ph) || !/courriel|e-?mail|\bmail\b|adresse (?:électronique|mail)|extranet/i.test(ph)) return ph;
    complete = true;
    return `Mail unique : ${m}.`;
  }).join(' ')).join('\n');
  return { texte: sortie, complete };
}

/** Colonne de tableau qui attend une donnée (nom, prénom, date, numéro, nombre…), jamais un paragraphe (T4-COH-2). */
export const COLONNE_VALEUR = /^(?:noms?|pr[ée]noms?|noms? et pr[ée]noms?|pr[ée]noms? et noms?|dates?(?:\s.*)?|n°.*|num[ée]ros?(?:\s.*)?|nombres?(?:\s.*)?|quantit[ée]s?|effectifs?|t[ée]l[ée]phones?|e-?mails?|courriels?|adresses?(?:\s.*)?|validit[ée].*|fonctions?|qualit[ée]s?|matricules?|carte professionnelle.*)$/i;

/** Colonne d'une case de tableau du cadre (contexte « Colonne: "Formations suivies par les agents / NOM" » → « NOM »). */
export function colonneCase(contexte: string): string {
  return (((/Colonne:\s*"([^"]*)"/.exec(String(contexte || '')) || [])[1] || '').split('/').pop() || '').replace(/\s+/g, ' ').trim();
}

/**
 * Réponse développée placée sous un tableau du cadre (havre2 361, 3.4 « Les formations suivies par les agents ») : un
 * « [À COMPLÉTER] » seul en tête de réponse (sans libellé, d'où la question vague « Quelle information faut-il écrire… »)
 * et les pseudo-lignes de tableau qui recopient ses colonnes (« NOM : [À COMPLÉTER] ; Prénom : [À COMPLÉTER] ; Date :
 * [À COMPLÉTER]. ») sont retirés : le tableau porte déjà ces cases, chacune avec sa question.
 */
export function sansPseudoTableau(texte: string): { texte: string; retires: number } {
  let retires = 0;
  const VIDE = /^\s*[^:;\n]{1,60}?\s*:\s*\[À COMPLÉTER\]\s*[.;]?\s*$/;
  let lignes = String(texte || '').split('\n').filter((l) => {
    const segs = l.split(/\s*;\s*/).filter((x) => x.trim());
    const vides = segs.filter((x) => VIDE.test(x)).length;
    const courts = segs.every((x) => /^\s*[^:]{1,60}:\s*.{0,120}$/.test(x));
    if (segs.length >= 2 && vides >= 2 && courts) { retires++; return false; }
    return true;
  });
  // « [À COMPLÉTER] » seul en tête d'une réponse qui a du contenu ensuite (collé ou non à la phrase suivante).
  const premier = lignes.findIndex((l) => l.trim());
  if (premier >= 0) {
    const l = lignes[premier];
    const m = /^\s*\[À COMPLÉTER\]\s*[.;:]?\s*(?=\S|$)/.exec(l);
    const reste = [l.slice(m ? m[0].length : 0), ...lignes.slice(premier + 1)].join('\n').trim();
    if (m && reste.length >= 40) { lignes[premier] = l.slice(m[0].length); retires++; if (!lignes[premier].trim()) lignes.splice(premier, 1); }
  }
  lignes = lignes.filter((l, i, a) => !(i > 0 && !l.trim() && !a[i - 1].trim()));
  return { texte: lignes.join('\n').trim(), retires };
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
  // Libellé de la question, sinon celui de la section (une question réduite à « : » n'est pas un libellé : T4C-7).
  const net = (x: string) => String(x || '').replace(/\[CHAMP_\d+\]/gi, '').replace(/(?:[_.…]\s*){3,}/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:;,.–—-]+|[\s:;,.–—-]+$/g, '').trim();
  const libQ = net(((contexte || '').match(/Question:\s*"([^"]*)"/) || [])[1] || '');
  const libS = net(((contexte || '').match(/Section:\s*"([^"]*)"/) || [])[1] || '');
  // Coupé à un mot entier (etampes2 552 : « … l'absence de 2 agents et d'1 chi » dans la question posée).
  const libBrut = /\p{L}{3}/u.test(libQ) ? libQ : /\p{L}{3}/u.test(libS) ? libS : '';
  const libelle = libBrut.length <= 120 ? libBrut : `${libBrut.slice(0, 121).replace(/\s+\S*$/, '').replace(/[\s,;:(–—-]+$/, '')}…`;
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
  const partenaire = !!s.questionPartenaire && /\b(?:ERYMA|Delta)\b/.test(v);
  if (partenaire) questions.push(s.questionPartenaire!);
  // Question exacte sur un passage écarté (T4C-7 : jamais « À confirmer par GSS (champ « : ») : … » emballé dans « Quelle
  // réponse GSS apporte-t-elle… ») ; le passage qui cite le partenaire rejoint la question du partenaire.
  let partenaireFusionne = false;
  const question = (cite: string, faits: string[], retire: boolean): string => {
    const f = [...new Set(faits)];
    const base = `${libelle ? `Réponse « ${libelle} »` : 'Réponse du cadre'} : ${retire ? `la phrase « ${cite} » a été retirée` : `la valeur « ${cite} » n'a pas été écrite`} (${f.join(', ')} : absent${f.length > 1 ? 's' : ''} du DCE, du mémoire type, des mémoires et du registre de GSS).`;
    const parPartenaire = partenaire && !partenaireFusionne && /\b(?:ERYMA|Delta)\b/.test(cite);
    const certif = f.some((x) => /APSAD|certifi/i.test(x));
    if (parPartenaire) {
      const k = questions.indexOf(s.questionPartenaire!);
      if (k >= 0) questions.splice(k, 1);
      partenaireFusionne = true;
      return `${base} ${s.questionPartenaire}${certif ? ' Quelle certification de sa station de télésurveillance faut-il indiquer ?' : ''}`;
    }
    return `${base} Faut-il ${retire ? 'l\'écrire' : 'l\'indiquer'}, et avec quelle information exacte ?`;
  };

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
      questions.push(question(v.replace(/\s+/g, ' ').trim(), m, false));
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
    questions.push(question(ph.replace(/\s+/g, ' ').trim(), m, true));
    return null;
  }).filter((ph): ph is string => ph !== null).join(' ')).join('\n').replace(/\s*;\s*$/gm, '.').replace(/\n{3,}/g, '\n\n').trim();
  // La réponse ne dit rien du chien alors que la mise en situation le demande : proposition ajoutée, à valider.
  if (situationChien && !relaisPropose && !/\bchiens?\b|cynophil/i.test(texte)) {
    questions.push(`Proposition à valider${libelle ? ` (champ « ${libelle} »)` : ''} : « ${RELAIS_CYNOPHILE} » (indisponibilité du chien, demandée par la mise en situation).`);
    return { texte: `${texte}\n${RELAIS_CYNOPHILE}`.trim(), questions };
  }
  return { texte: texte || '[À COMPLÉTER]', questions };
}

// ─── Cadre .docx : parties limitées en pages (« 1 page maximum ») ────────────────────────────────

/** Géométrie de la page du cadre (estimation sans rendu, en points). */
export interface GeometrieCadre {
  /** Caractères par ligne de texte (police du style Normal, largeur de texte de la page). */
  carParLigne: number;
  /** Hauteur d'une ligne de texte. */
  lignePt: number;
  /** Hauteur et largeur utiles de la page (marges retirées). */
  hauteurPt: number;
  largeurPt: number;
}

/**
 * Géométrie de la page du cadre d'après le document et ses styles : format et marges de la première section, taille de
 * police et interligne du style Normal (sinon valeurs par défaut du document). Largeur moyenne d'un caractère : 0,40 em ;
 * hauteur de ligne : 1,4 fois la police en interligne simple (police Marianne du cadre ca_normandie, rendu Word du
 * 2 octobre 2026 : 111 à 113 caractères par ligne et 50 lignes par page à 10 points).
 */
export function geometrieCadre(documentXml: string, stylesXml = ''): GeometrieCadre {
  const doc = String(documentXml || '');
  const attr = (el: string, nom: string, defaut: number) => { const m = new RegExp(`w:${nom}="(\\d+)"`).exec(el); return m ? Number(m[1]) : defaut; };
  const pgSz = (/<w:pgSz\b[^>]*\/?>/.exec(doc) || [''])[0];
  const pgMar = (/<w:pgMar\b[^>]*\/?>/.exec(doc) || [''])[0];
  const largeurPt = (attr(pgSz, 'w', 11906) - attr(pgMar, 'left', 1417) - attr(pgMar, 'right', 1417)) / 20;
  const hauteurPt = (attr(pgSz, 'h', 16838) - attr(pgMar, 'top', 1417) - attr(pgMar, 'bottom', 1417)) / 20;
  const styles = String(stylesXml || '');
  const normal = (/<w:style\b[^>]*w:styleId="Normal"[^>]*>([\s\S]*?)<\/w:style>/.exec(styles) || ['', ''])[1];
  const defauts = (/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/.exec(styles) || ['', ''])[1];
  const sz = Number((/<w:sz w:val="(\d+)"/.exec(normal) || /<w:sz w:val="(\d+)"/.exec(defauts) || ['', '22'])[1]);
  const espacement = (/<w:spacing\b[^>]*\/?>/.exec(normal) || /<w:spacing\b[^>]*\/?>/.exec(defauts) || [''])[0];
  const auto = !/w:lineRule="(?:exact|atLeast)"/.test(espacement);
  const ligne = attr(espacement, 'line', 240);
  const police = sz / 2;
  const lignePt = auto ? police * 1.4 * (ligne / 240) : Math.max(police * 1.2, ligne / 20);
  return { carParLigne: Math.max(30, Math.floor(largeurPt / (police * 0.4))), lignePt, hauteurPt, largeurPt };
}

/** Lignes occupées par une ligne de texte (retour à la ligne au mot, comme Word). */
function lignesDeLigne(ligne: string, n: number): number {
  const mots = String(ligne || '').trim().split(/\s+/).filter(Boolean);
  let lignes = 1, cur = 0;
  for (const m of mots) {
    if (!cur) cur = m.length;
    else if (cur + 1 + m.length <= n) cur += 1 + m.length;
    else { lignes++; cur = m.length; }
  }
  return lignes;
}

/** Lignes occupées par un texte du cadre (une ligne vide compte une ligne ; une ligne longue, ses retours à la ligne). */
export function lignesTexte(texte: string, g: GeometrieCadre): number {
  return String(texte || '').split('\n').reduce((s, l) => s + lignesDeLigne(l, g.carParLigne), 0);
}

/** Paragraphe du corps du cadre : texte (retours à la ligne <w:br/> en « \n »), images, espacements et champs qu'il porte. */
export interface ParagrapheCadre { texte: string; imagePt: number; espacePt: number; champs: number[]; finsChamps: number[] }

const entites = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Paragraphes du corps du document, dans l'ordre. Un champ est repéré par son repère « [CHAMP_n] » (avant l'écriture des
 * réponses) ou par le signet de sa réponse « GSS_CH_n » (après) ; `finsChamps` : fin du signet de la réponse.
 */
export function paragraphesCadre(documentXml: string): ParagrapheCadre[] {
  const doc = String(documentXml || '');
  const corps = doc.slice(Math.max(0, doc.indexOf('<w:body')));
  const signets = new Map<string, number>();
  for (const m of corps.matchAll(/<w:bookmarkStart\b[^>]*>/g)) {
    const id = (/w:id="([^"]+)"/.exec(m[0]) || [])[1];
    const champ = (/w:name="GSS_CH_(\d+)"/.exec(m[0]) || [])[1];
    if (id && champ) signets.set(id, Number(champ));
  }
  const out: ParagrapheCadre[] = [];
  for (const m of corps.matchAll(/<w:p(?=[\s>])[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const p = m[1];
    let texte = '';
    for (const t of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\b[^>]*\/>|<w:cr\/>|<w:tab\/>/g)) {
      if (t[1] !== undefined) texte += entites(t[1]);
      else if (/^<w:tab/.test(t[0])) texte += '    ';
      else if (!/w:type="page"/.test(t[0])) texte += '\n';
    }
    const imagePt = [...p.matchAll(/<wp:extent\b[^>]*\bcy="(\d+)"/g)].reduce((s, x) => s + Number(x[1]) / 12700, 0);
    const sp = (/<w:spacing\b[^>]*\/?>/.exec((/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p) || [''])[0]) || [''])[0];
    const espacePt = (Number((/w:before="(\d+)"/.exec(sp) || [])[1] || 0) + Number((/w:after="(\d+)"/.exec(sp) || [])[1] || 0)) / 20;
    const champs = [...texte.matchAll(/\[CHAMP_(\d+)\]/g)].map((x) => Number(x[1]));
    for (const b of p.matchAll(/<w:bookmarkStart\b[^>]*>/g)) { const c = (/w:name="GSS_CH_(\d+)"/.exec(b[0]) || [])[1]; if (c) champs.push(Number(c)); }
    const finsChamps = [...p.matchAll(/<w:bookmarkEnd\b[^>]*w:id="([^"]+)"/g)].map((x) => signets.get(x[1])).filter((x): x is number => x !== undefined);
    out.push({ texte, imagePt, espacePt, champs, finsChamps });
  }
  return out;
}

/** Partie du cadre limitée en pages, repérée dans le document : titre, mention de la limite, paragraphes et champs. */
export interface PartieDocument { titre: string; section: string; pages: number; debut: number; fin: number; ids: number[] }

/**
 * Parties du cadre limitées en pages, repérées dans le document : une mention seule sur sa ligne « N page(s) maximum »
 * (ou « N pages maximum pour le 5.2 », qui vaut pour la sous-partie 5.2 seule) ouvre une partie, du titre qui la précède
 * jusqu'au titre de la partie limitée suivante (dernière partie : jusqu'à sa dernière réponse), sans les paragraphes vides
 * de fin. Une limite « par site » n'est pas mesurable sur le document : ignorée.
 */
export function partiesDuDocument(paras: ParagrapheCadre[]): PartieDocument[] {
  const norme = (t: string) => t.replace(/\s+/g, ' ').trim();
  const marques = paras.map((p, k) => ({ k, m: /^((\d+|une?)\s+pages?\s+maximum)(?:\s+pour\s+(?:le|la|les)\s+(\d+(?:\.\d+)*))?$/i.exec(norme(p.texte)) }))
    .filter((x): x is { k: number; m: RegExpExecArray } => !!x.m);
  const titreAvant = (k: number) => { for (let j = k - 1; j >= Math.max(0, k - 4); j--) if (paras[j].texte.trim()) return j; return k; };
  // Fin d'une partie : titre de la partie suivante, limitée ou non (« Nombre de page libre », ca_normandie 221 : la partie 7
  // « Mise en œuvre de la responsabilité environnementale » suit la partie 6 « 3 pages maximum »), ou titre numéroté de
  // rang supérieur (« 7 – … » après « 6 – … »).
  const autresMarques = paras.map((p, k) => (/^(?:nombre de pages? libres?|pages? libres?|sans limite de pages?|pas de limite de pages?)$/i.test(norme(p.texte)) ? titreAvant(k) : -1)).filter((k) => k >= 0);
  const rang = (t: string) => { const r = /^(\d+)\s*[-–—.]\s*\S/.exec(norme(t)); return r && norme(t).length <= 160 ? Number(r[1]) : null; };
  const out: PartieDocument[] = [];
  marques.forEach(({ k, m }, i) => {
    const suivante = marques[i + 1];
    let borne = suivante ? titreAvant(suivante.k) - 1 : paras.length - 1;
    const rangTitre = rang(paras[titreAvant(k)].texte);
    const finTitre = paras.findIndex((p, j) => j > k && j <= borne && (autresMarques.includes(j) || (rangTitre !== null && (rang(p.texte) ?? 0) > rangTitre)));
    if (finTitre > 0) borne = finTitre - 1;
    let debut = titreAvant(k);
    if (m[3]) {
      const sous = paras.findIndex((p, j) => j > k && j <= borne && norme(p.texte).startsWith(m[3]));
      if (sous < 0) return;
      debut = sous;
    }
    const aChamp = (p: ParagrapheCadre) => p.champs.length > 0 || p.finsChamps.length > 0;
    let fin = borne;
    if (!suivante && finTitre < 0) { fin = -1; for (let j = borne; j > k; j--) if (aChamp(paras[j])) { fin = j; break; } if (fin < 0) return; }
    while (fin > debut && !paras[fin].texte.trim() && !paras[fin].imagePt) fin--;
    const ids = [...new Set(paras.slice(debut, fin + 1).flatMap((p) => p.champs))];
    if (!ids.length) return;
    out.push({ titre: norme(paras[debut].texte), section: norme(paras[k].texte), pages: /^\d+$/.test(m[2]) ? Number(m[2]) : 1, debut, fin, ids });
  });
  return out;
}

/** Hauteur (points) des paragraphes `debut`…`fin`, réponses remplacées par `valeurs`, images réservées `images` (par champ). */
export function hauteurPartie(paras: ParagrapheCadre[], debut: number, fin: number, g: GeometrieCadre, valeurs: Map<number, string> = new Map(), images: Map<number, number> = new Map()): number {
  let h = 0;
  for (let k = debut; k <= fin; k++) {
    const p = paras[k];
    const texte = p.texte.replace(/\[CHAMP_(\d+)\]/g, (x, n) => (valeurs.has(Number(n)) ? valeurs.get(Number(n))! : ''));
    const image = p.imagePt + p.champs.reduce((s, id) => s + (images.get(id) || 0), 0);
    h += (image && !texte.trim() ? image : lignesTexte(texte, g) * g.lignePt + image) + p.espacePt;
  }
  return h;
}

/** Ligne d'un tableau de GSS écrit en lignes « A : B : C » (équipe dédiée, périmètre) : jamais retirée seule. Trois
 *  cellules au moins, courtes (une phrase qui contient deux « : » n'en est pas une). */
export function ligneTableau(l: string): boolean {
  const cellules = String(l || '').replace(/^\s*[•\-*]\s*/, '').split(/\s:\s/);
  // Dernière cellule (observations) de toute longueur : liste des sites (ca_normandie 241 : « Agent de sécurité : ADS : 20 :
  // 613,77 h par semaine (Cour d'appel de Caen, Tribunal judiciaire de Caen, …), soit 19,86 ETP »).
  return cellules.length >= 3 && cellules.slice(0, -1).every((c) => c.trim().length > 0 && c.length <= 60 && !/[.!?;]\s/.test(c));
}

/** Ligne qu'un ajustement de longueur ne retire jamais : ligne de tableau, effectif de l'équipe (« équipe de 83 agents titulaires »). */
function ligneEssentielle(l: string): boolean {
  return ligneTableau(l) || /\b(?:\d+\s+agents?\s+titulaires|[ée]quipe (?:d[ée]di[ée]e |suppl[ée]ante )?de \d+ agents?)\b/i.test(l);
}

/** Mots porteurs (5 lettres au moins) d'un texte. */
/** Suites de cinq mots consécutifs d'un texte (mots normalisés). */
function suitesDeMots(t: string): Set<string> {
  const m = normaliser(String(t || '')).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 5 <= m.length; i++) out.add(m.slice(i, i + 5).join(' '));
  return out;
}

/** Ligne qui porte le texte d'une étape du schéma (cinq mots consécutifs en commun) : jamais retirée. */
function ligneDuSchema(l: string, etapes: string[]): boolean {
  if (!etapes.length) return false;
  const schema = new Set(etapes.flatMap((e) => [...suitesDeMots(e)]));
  return [...suitesDeMots(l)].some((x) => schema.has(x));
}

/** Texte d'un schéma SVG, éléments <text> réunis dans l'ordre (une étape écrite sur plusieurs lignes reste d'un tenant). */
export function textesSchemaSvg(svg: string): string[] {
  const t = [...String(svg || '').matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' ');
  return t ? [t] : [];
}

/**
 * Réduction de la réponse « compréhension du besoin » d'une partie limitée en pages (ca_normandie 221 : partie 1
 * « 1 page maximum » débordant sur la page suivante) : lignes retirées entières, jamais réécrites, jusqu'à ce que
 * `assez(texte)` soit vrai, dans l'ordre : engagements ajoutés par la couverture du CCTP (puces qui ne sont ni une attente
 * ni un point de vigilance), points de vigilance puis attentes au-delà de trois, paragraphes libres entre le premier
 * (l'acheteur et son marché) et le dernier (conclusion reprise par le schéma), points de vigilance puis attentes au-delà
 * de deux. Renvoie le texte et les lignes retirées (signalées à GSS).
 */
export function reduireComprehensionCadre(texte: string, assez: (t: string) => boolean, protegee: (l: string) => boolean = () => false): { texte: string; retirees: string[] } {
  const lignes = String(texte || '').split('\n');
  const puce = (l: string) => /^\s*[•\-*]\s/.test(l);
  // Point de vigilance : libellé « Point de vigilance » ou puce de la partie « Les points de vigilance… » (libellé remplacé
  // par le nom du point, libellesBloc1).
  const partieVigilance = new Set<string>();
  { let dans = false; for (const l of lignes) { if (!puce(l) && l.trim()) dans = /points? de vigilance/i.test(l); else if (dans && puce(l)) partieVigilance.add(l); } }
  const vigilance = (l: string) => puce(l) && (/point de vigilance/i.test(l.slice(0, 40)) || partieVigilance.has(l));
  // Attente : « Ce que vous attendez : … → notre réponse : … » ou citation du DCE « « … » — réponse : … » (ca_normandie 241 :
  // ces attentes étaient prises pour des engagements ajoutés et retirées toutes en premier).
  const attente = (l: string) => puce(l) && !vigilance(l) && (/ce que vous attendez|vos attentes|attente/i.test(l.slice(0, 40)) || /^\s*[•\-*]\s*«/.test(l) || /→\s*notre r[ée]ponse|[—–-]\s*r[ée]ponse\s*:/i.test(l));
  const indices = (f: (l: string) => boolean) => lignes.map((l, k) => k).filter((k) => f(lignes[k]));
  const libres = indices((l) => !!l.trim() && !puce(l) && !/:\s*$/.test(l.trim()) && !ligneTableau(l));
  const ordre: number[] = [];
  const ajouter = (ks: number[]) => { for (const k of ks) if (!ordre.includes(k)) ordre.push(k); };
  ajouter(indices((l) => puce(l) && !vigilance(l) && !attente(l)).reverse());
  ajouter(indices(vigilance).slice(3).reverse());
  ajouter(indices(attente).slice(3).reverse());
  ajouter(libres.slice(1, -1).reverse());
  ajouter(indices(vigilance).slice(2).reverse());
  ajouter(indices(attente).slice(2).reverse());
  const otees = new Set<number>();
  const composer = () => {
    const gardees = lignes.filter((_, k) => !otees.has(k));
    // Sous-titre « … : » resté sans contenu : retiré avec son contenu.
    return gardees.filter((l, k) => !(/:\s*$/.test(l.trim()) && !puce(l) && !(gardees[k + 1] || '').trim()))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const retirees: string[] = [];
  for (const k of ordre) {
    if (assez(composer())) break;
    if (protegee(lignes[k])) continue;
    otees.add(k);
    retirees.push(lignes[k].replace(/^\s*[•\-*]\s*/, '').trim());
  }
  return { texte: composer(), retirees };
}

/** Résultat de l'ajustement d'une partie limitée en pages. */
export interface AjustementPartie {
  section: string;
  titre: string;
  pages: number;
  ids: number[];
  budgetPt: number;
  avantPt: number;
  apresPt: number;
  /** Passages retirés (champ, texte), dans l'ordre des retraits. */
  retires: Array<{ id: number; texte: string; origine: 'comprehension' | 'couverture' | 'memoire_type' }>;
  /** Hauteur maximale de l'image réservée au schéma de la compréhension (points), si la partie le porte. */
  imageComprehensionPt?: number;
  /** Place restante pour d'autres schémas dans la partie (points). */
  restePt: number;
  depasse: boolean;
}

/**
 * Ajustement des parties du cadre limitées en pages (consigne du cadre « Veillez à respecter le nombre de pages indiqué ») :
 * hauteur de chaque partie estimée sur le document (titres, questions et réponses du cadre, retours à la ligne, images),
 * le schéma de la compréhension du besoin compté à sa hauteur. Partie trop longue : passages retirés entiers, jamais
 * réécrits, dans l'ordre (1) compréhension du besoin (reduireComprehensionCadre), (2) puces d'engagement ajoutées par la
 * couverture du CCTP (dernière réponse d'abord), (3) schéma de la compréhension réduit jusqu'à 70 % de sa hauteur,
 * (4) dernières lignes du texte de GSS des autres réponses (la plus longue d'abord ; jamais la première ligne d'une
 * réponse, ni une ligne de tableau). Les autres schémas de la partie ne sont insérés que dans la place restante.
 */
export function ajusterPartiesLimitees(o: {
  documentXml: string;
  stylesXml?: string;
  valeurs: Map<number, string>;
  /** Champ qui reçoit le schéma de la compréhension, et sa hauteur naturelle (points). */
  comprehension?: { id: number; hauteurPt: number } | null;
  /** Puces ajoutées par la couverture du CCTP, par champ (texte de la ligne, puce comprise). */
  ajoutsCouverture?: Map<number, string[]>;
  /** Marge de sécurité (points) retirée du budget. */
  margePt?: number;
  /** Textes des étapes du schéma de la compréhension : les lignes qui les portent ne sont jamais retirées. */
  etapesSchema?: string[];
}): { valeurs: Map<number, string>; parties: AjustementPartie[] } {
  const g = geometrieCadre(o.documentXml, o.stylesXml || '');
  const paras = paragraphesCadre(o.documentXml);
  const valeurs = new Map(o.valeurs);
  const parties: AjustementPartie[] = [];
  for (const partie of partiesDuDocument(paras)) {
    const b = partie;
    const budgetPt = partie.pages * g.hauteurPt - (o.margePt ?? g.lignePt);
    const comp = o.comprehension && partie.ids.includes(o.comprehension.id) ? o.comprehension : null;
    let imagePt = comp ? comp.hauteurPt : 0;
    const images = () => (comp ? new Map([[comp.id, imagePt + g.lignePt]]) : new Map<number, number>());
    const hauteur = (v: Map<number, string> = valeurs) => hauteurPartie(paras, b.debut, b.fin, g, v, images());
    const avantPt = hauteur();
    const retires: AjustementPartie['retires'] = [];
    const tient = () => hauteur() <= budgetPt;
    // (1) Compréhension du besoin.
    if (!tient() && comp && valeurs.has(comp.id)) {
      const r = reduireComprehensionCadre(valeurs.get(comp.id)!, (t) => hauteur(new Map(valeurs).set(comp.id, t)) <= budgetPt, (l) => ligneEssentielle(l) || ligneDuSchema(l, o.etapesSchema || []));
      valeurs.set(comp.id, r.texte);
      r.retirees.forEach((t) => retires.push({ id: comp.id, texte: t, origine: 'comprehension' }));
    }
    // (2) Engagements ajoutés par la couverture du CCTP.
    for (const id of [...partie.ids].reverse()) {
      for (const ajout of [...(o.ajoutsCouverture?.get(id) || [])].reverse()) {
        if (tient()) break;
        const v = valeurs.get(id) || '';
        const lignes = v.split('\n');
        const k = lignes.map((l) => l.trim()).lastIndexOf(ajout.trim());
        if (k < 0) continue;
        lignes.splice(k, 1);
        valeurs.set(id, lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim());
        retires.push({ id, texte: ajout.replace(/^\s*[•\-*]\s*/, '').trim(), origine: 'couverture' });
      }
    }
    // (3) Schéma de la compréhension réduit (70 % de sa hauteur au plus).
    if (!tient() && comp) {
      const exces = hauteur() - budgetPt;
      imagePt = Math.max(comp.hauteurPt * 0.7, comp.hauteurPt - exces);
    }
    // (4) Texte de GSS des autres réponses : dernières lignes, la réponse la plus longue d'abord.
    const autres = partie.ids.filter((id) => id !== comp?.id && valeurs.has(id));
    for (let garde = 0; !tient() && garde < 400; garde++) {
      const candidats = autres.map((id) => {
        const lignes = (valeurs.get(id) || '').split('\n');
        const premiere = lignes.findIndex((l) => l.trim());
        let k = lignes.length - 1;
        while (k > premiere && (!lignes[k].trim() || ligneEssentielle(lignes[k]))) k--;
        return { id, lignes, k: k > premiere ? k : -1, taille: lignesTexte(lignes.join('\n'), g) };
      }).filter((c) => c.k >= 0).sort((a, b2) => b2.taille - a.taille);
      if (!candidats.length) break;
      const c = candidats[0];
      const texte = c.lignes[c.k];
      c.lignes.splice(c.k, 1);
      // Sous-titre « … : » resté sans contenu à la fin : retiré aussi.
      while (c.lignes.length > 1 && (!c.lignes[c.lignes.length - 1].trim() || /:\s*$/.test(c.lignes[c.lignes.length - 1].trim()))) c.lignes.pop();
      valeurs.set(c.id, c.lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim());
      retires.push({ id: c.id, texte: texte.replace(/^\s*[•\-*]\s*/, '').trim(), origine: 'memoire_type' });
    }
    const apresPt = hauteur();
    parties.push({
      section: partie.section, titre: b.titre, pages: partie.pages, ids: partie.ids, budgetPt, avantPt, apresPt, retires,
      ...(comp ? { imageComprehensionPt: imagePt } : {}), restePt: Math.max(0, budgetPt - apresPt), depasse: apresPt > budgetPt,
    });
  }
  return { valeurs, parties };
}

/** Hauteur (points) d'un schéma SVG inséré à la largeur du texte du cadre (15,5 cm au plus, 11 cm de haut au plus). */
export function hauteurSchemaPt(svg: string, largeurPt: number): number {
  const s = String(svg || '');
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(s);
  const w = vb ? Number(vb[1]) : Number((/\bwidth="([\d.]+)/.exec(s) || [])[1] || 0);
  const h = vb ? Number(vb[2]) : Number((/\bheight="([\d.]+)/.exec(s) || [])[1] || 0);
  if (!w || !h) return 0;
  const largeur = Math.min(largeurPt, 5580000 / 12700);
  return Math.min(3960000 / 12700, largeur * h / w);
}
