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
  normaliser, fidelite, decouperSousParties, rechercherRubriques, lireJson,
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
  /** Rubriques par partie du RC, dans l'ordre du mémoire type. */
  parPartie: Record<string, string[]>;
  /** Rubriques placées par le repli lexical (non retenues par le modèle) : retirées en premier si la place manque. */
  secondaires: string[];
  /** Éléments attendus par le RC qu'aucune rubrique ne traite, par partie. */
  nonCouverts: Record<string, string[]>;
  source: 'modele' | 'lexical';
}

/**
 * Lecture de la réponse de répartition : ids inconnus ignorés, une rubrique dans une seule partie (la première citée),
 * ordre du mémoire type rétabli. Rubrique non citée : placée par le repli lexical et marquée secondaire. Réponse
 * illisible : tout le repli lexical.
 */
export function lireRepartition(reponse: string, mt: MemoireType, plan: PlanMemoireType, parties: PartieRC[]): RepartitionCourt {
  const ordre = plan.rubriques.map((r) => r.id);
  const lexical = repartitionLexicale(mt, plan, parties);
  const d = lireJson(reponse || '');
  const liste: any[] = Array.isArray(d?.parties) ? d.parties : [];
  if (!liste.length) return { parPartie: lexical, secondaires: [], nonCouverts: {}, source: 'lexical' };
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
  const secondaires: string[] = [];
  for (const [pid, ids] of Object.entries(lexical)) {
    for (const rid of ids) {
      if (pris.has(rid) || mt.rubriques.find((r) => r.id === rid)?.mode === 'besoin') continue;
      pris.add(rid);
      parPartie[pid].push(rid);
      secondaires.push(rid);
    }
  }
  for (const pid of Object.keys(parPartie)) parPartie[pid].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  return { parPartie, secondaires, nonCouverts, source: 'modele' };
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
 * Questions auxquelles le mémoire type ne répond jamais (propres au site ou au dossier : cas pratique, dimensionnement,
 * compréhension du site…) : rédaction guidée comme avant, signalée en proposition.
 */
export const QUESTION_HORS_MEMOIRE_TYPE = /cas pratique|mise en situation|dimensionn|nombre d.agents (?:et|estim)|r[ée]troplanning|rapport d.ex[ée]cution|d[ée]composition (?:du|de son) prix|bordereau|compr[ée]hension|sujétions|enjeux/i;

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
}

/**
 * Rubriques du mémoire type candidates pour une question développée du cadre (au plus 3, 1 200 mots au plus) : les
 * plus proches sémantiquement (embeddings ; au-dessus de `seuil`, à moins de `ecart` de la meilleure), complétées par
 * la meilleure rubrique lexicale (mots-clés) si elle atteint 2,5. Le modèle dit ensuite lesquelles traitent vraiment
 * la question. Aucune candidate pour une question propre au marché (cas pratique, compréhension du site…).
 */
export function candidatsReference(mt: MemoireType, textes: Record<string, string>, question: string, options: { scores?: Record<string, number>; seuil?: number; ecart?: number; maxMots?: number } = {}): CandidatReference[] {
  if (!question.trim() || QUESTION_HORS_MEMOIRE_TYPE.test(question)) return [];
  const parmi = Object.keys(textes).filter((id) => (textes[id] || '').trim() && mt.rubriques.find((r) => r.id === id)?.mode !== 'besoin');
  const seuil = options.seuil ?? SEUIL_SEMANTIQUE;
  const ecart = options.ecart ?? 0.04;
  const scores = options.scores || {};
  const choix: Array<{ id: string; score: number }> = [];
  const sem = parmi.map((id) => ({ id, score: scores[id] ?? 0 })).sort((a, b) => b.score - a.score);
  if (sem[0] && sem[0].score >= seuil) choix.push(...sem.slice(0, 3).filter((x) => x.score >= Math.max(seuil, sem[0].score - ecart)));
  const lex = rechercherRubriques(mt, question, 1, parmi)[0];
  if (lex && lex.score >= 2.5 && !choix.some((x) => x.id === lex.id)) choix.push({ id: lex.id, score: scores[lex.id] ?? 0 });
  const maxMots = options.maxMots ?? 1200;
  const out: CandidatReference[] = [];
  let mots = 0;
  for (const c of choix) {
    const texte = texteBrut(textes[c.id]);
    const n = compterMots(texte);
    if (out.length && mots + n > maxMots) continue;
    mots += n;
    out.push({ cle: `R${out.length + 1}`, id: c.id, titre: mt.rubriques.find((r) => r.id === c.id)?.titre || c.id, texte, score: c.score });
  }
  return out;
}

/**
 * Bloc injecté avant les extraits : textes de référence de GSS candidats ; s'ils traitent la question, le modèle les
 * reprend tels quels et n'adapte que noms, sites et chiffres ; il indique dans « reference » ceux qu'il a repris.
 */
export function blocReference(candidats: CandidatReference[], o: { limite?: boolean; strict?: boolean } = {}): string {
  if (!candidats.length) return '';
  return `
--- TEXTES DE RÉFÉRENCE GSS (mémoire type de GSS) ---
${candidats.map((c) => `[${c.cle}] ${c.titre}\n${c.texte}`).join('\n\n')}
--- FIN DES TEXTES DE RÉFÉRENCE ---
CONSIGNE PRIORITAIRE (elle prime sur la consigne de rédaction du paragraphe) : GSS répond avec son mémoire type, « si c'est toujours le même process, on remet la même réponse ».
- Commence par décider quels textes de référence traitent VRAIMENT le sujet de la question (même sujet, pas un thème voisin). N'utilise jamais un texte qui parle d'autre chose.
- Texte retenu : reprends-le TEL QUEL, phrase par phrase, dans le même ordre, en texte brut (puces « • »). Adapte SEULEMENT les noms (acheteur, sites, services) et les chiffres, délais, fréquences et horaires que le DCE impose (le chiffre du DCE remplace celui du texte, jamais les deux) ; retire ce qui est hors du périmètre du marché ou contraire au DCE ; ajoute SEULEMENT ce que la question exige et que le texte ne couvre pas (avec les mots du DCE), à la suite du passage concerné. Ne reformule pas, ne résume pas, n'ajoute ni introduction ni conclusion.
- Une partie de la question qu'aucun texte retenu ne traite est rédigée comme d'habitude, à partir des extraits.${o.limite ? `
- Une limite de longueur s'applique : garde les phrases du texte retenu les plus utiles à la question, recopiées mot pour mot dans le même ordre, plutôt que de le résumer.` : ''}${o.strict ? `
- Ton essai précédent a reformulé le texte de référence retenu : cette fois, recopie ses phrases MOT POUR MOT (seuls les noms et les chiffres imposés par le DCE peuvent changer).` : ''}
- Dans le JSON, ajoute "reference": la liste des repères des textes repris (ex. ["R1"]), ou [] si aucun ne traite la question.
`;
}

/** Repères « R1 »… cités par le modèle, limités aux candidats fournis. */
export function referencesRetenues(candidats: CandidatReference[], valeur: unknown): CandidatReference[] {
  const l = (Array.isArray(valeur) ? valeur : typeof valeur === 'string' ? valeur.split(/[\s,;]+/) : []).map((x) => String(x || '').trim().toUpperCase());
  return candidats.filter((c) => l.includes(c.cle));
}

/** Seuil de fidélité d'une réponse développée du cadre au texte de référence repris. */
export const SEUIL_FIDELITE_CADRE = 0.6;

/**
 * Fidélité d'une réponse au texte de référence repris : part des phrases de ce texte conservées dans la réponse
 * (les ajouts propres à la question ne la font pas baisser) ; avec une limite de longueur (reprise intégrale
 * impossible), la meilleure des deux mesures : phrases du texte conservées, ou phrases de la réponse venues du texte.
 */
export function fideliteReponse(reference: string, reponse: string, limite = false): number {
  const couverture = fidelite(reference, reponse);
  return limite ? Math.max(couverture, fidelite(reponse, reference)) : couverture;
}

/**
 * Rubriques d'une partie qui répondent directement à un élément cité par le RC (titre et attendus découpés en
 * éléments : « équipe », « organigramme », « démarche RSE »…) : pour chaque élément, la rubrique la plus proche (mots-clés
 * et titre). Elles ne sont jamais retirées en entier par la sélection (seulement leurs sous-parties secondaires).
 */
export function rubriquesEssentielles(mt: MemoireType, p: PartieRC, ids: string[]): Set<string> {
  const elements = `${p.title} ; ${String(p.attendu || '').replace(/Critère de jugement traité ici\s*:\s*/gi, ' ; ')}`
    .split(/[;,/()«»]|\s+et\s+|\.\s/).map((x) => x.replace(/\(\d+\s*%\)/g, '').trim()).filter((x) => x.length >= 3);
  const out = new Set<string>();
  for (const e of elements) {
    const r = rechercherRubriques(mt, e, 1, ids)[0];
    if (r && r.score >= 1) out.add(r.id);
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
