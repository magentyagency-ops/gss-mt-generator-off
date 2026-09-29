import fs from 'fs';
import path from 'path';

/**
 * BASE DE MÉMOIRES GSS : les réponses d'appels d'offres déjà rédigées par GSS (Université de Rouen,
 * CAF, CAF du Val-de-Marne, Région Normandie, MIN de Rouen, sites métropolitains…), découpées en
 * passages datés et sourcés, avec leur index sémantique (python/base_memoires, construit hors ligne
 * par src/rag/base_memoires_build.ts — aucune écriture en base de données).
 *
 * Deux usages :
 *  1. RÉUTILISATION : pour une rubrique ou une question, retrouver ce que GSS a déjà répondu (contenu,
 *     structure, exemples, tableaux) afin de l'adapter au nouveau client au lieu de tout réinventer.
 *  2. INFORMATIONS VARIABLES : le registre (effectifs, responsables, coordonnées, véhicules, outils,
 *     délais, certifications…) donne la valeur la plus récente de chaque information, sa date et sa
 *     source. Une information qui a changé entre deux mémoires, ou dont la dernière source date de plus
 *     de 12 mois, est réutilisée mais signalée « à confirmer » : GSS reçoit la question dans les
 *     consultations requises ; sa réponse (datée) prime ensuite sur les mémoires.
 */

const DIR = path.resolve(__dirname, '../../python/base_memoires');
/** Au-delà de ce délai, une information variable est réutilisée mais soumise à confirmation. */
const FRAICHEUR_MOIS = 12;
const CATEGORIES_VARIABLES = new Set(['effectifs', 'organisation', 'coordonnees', 'moyens', 'certifications', 'delais', 'partenaires']);

export interface PassageMemoire {
  id: string;
  document: string;
  client: string;
  date: string;          // AAAA-MM
  type: string;          // memoire | cadre
  page: number;
  rubrique: string;
  texte: string;
  aussi_dans: string[];
}

interface InfoRegistre {
  cle: string;
  libelle: string;
  categorie: string;
  valeur_retenue: string;
  date_retenue: string;
  source_retenue: string;
  statut: 'confirmee' | 'a_confirmer';
  valeurs_anterieures_differentes: string[];
}

let cache: { passages: PassageMemoire[]; vecteurs: Float32Array[]; registre: InfoRegistre[] } | null = null;

function charger() {
  if (cache) return cache;
  try {
    const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base_memoires.json'), 'utf-8'));
    const passages: PassageMemoire[] = base.passages || [];
    const buf = fs.readFileSync(path.join(DIR, 'base_memoires.emb'));
    const dim = passages.length ? buf.length / 4 / passages.length : 0;
    const vecteurs: Float32Array[] = passages.map((_, i) => {
      const v = new Float32Array(dim);
      for (let j = 0; j < dim; j++) v[j] = buf.readFloatLE((i * dim + j) * 4);
      return v;
    });
    let registre: InfoRegistre[] = [];
    try { registre = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8')).informations || []; } catch { /* registre absent */ }
    cache = { passages, vecteurs, registre };
    console.log(`[BaseMemoires] ${passages.length} passage(s) de mémoires GSS chargés, ${registre.length} information(s) au registre.`);
  } catch (e: any) {
    console.warn(`[BaseMemoires] Base indisponible (${e?.message || e}) — génération sans réutilisation des mémoires.`);
    cache = { passages: [], vecteurs: [], registre: [] };
  }
  return cache;
}

export function baseDisponible(): boolean {
  return charger().passages.length > 0;
}

const normTxt = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Passages de mémoires les plus proches d'une requête (similarité sémantique + bonus sur les mots
 * exacts de la requête), en variant les documents pour croiser plusieurs réponses GSS.
 */
export function rechercherMemoires(requeteEmb: number[], k: number, requeteTexte = '', maxParDocument = 3): Array<PassageMemoire & { score: number }> {
  const { passages, vecteurs } = charger();
  if (!passages.length || !requeteEmb?.length) return [];
  let nq = 0;
  for (const x of requeteEmb) nq += x * x;
  nq = Math.sqrt(nq) || 1;
  const termes = [...new Set(normTxt(requeteTexte).split(/[^a-z0-9]+/).filter((m) => m.length >= 5))];
  const scores = passages.map((p, i) => {
    const v = vecteurs[i];
    let dot = 0, nv = 0;
    for (let j = 0; j < v.length; j++) { dot += v[j] * requeteEmb[j]; nv += v[j] * v[j]; }
    const cos = dot / (nq * (Math.sqrt(nv) || 1));
    const t = normTxt(p.rubrique + ' ' + p.texte);
    const lex = termes.length ? termes.filter((m) => t.includes(m)).length / termes.length : 0;
    // Un contenu repris dans plusieurs mémoires est un contenu éprouvé : léger bonus.
    return { ...p, score: cos + 0.12 * lex + 0.01 * Math.min(p.aussi_dans.length, 3) };
  });
  scores.sort((a, b) => b.score - a.score);
  const parDoc = new Map<string, number>();
  const out: Array<PassageMemoire & { score: number }> = [];
  for (const s of scores) {
    const n = parDoc.get(s.document) || 0;
    if (n >= maxParDocument) continue;
    parDoc.set(s.document, n + 1);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

export function libellePassage(p: PassageMemoire): string {
  const reprise = p.aussi_dans.length ? ` — repris aussi dans : ${p.aussi_dans.join(', ')}` : '';
  return `Mémoire GSS « ${p.client} » (${p.date}), p. ${p.page}${p.rubrique ? ` — ${p.rubrique}` : ''}${reprise}`;
}

/** Bloc prêt à insérer dans un prompt : les réponses GSS déjà rédigées sur le sujet. */
export function blocMemoires(passages: PassageMemoire[], seuil = 0.3): string {
  const utiles = passages.filter((p: any) => (p.score ?? 1) >= seuil);
  if (!utiles.length) return '';
  return '\n\nRÉPONSES DÉJÀ RÉDIGÉES PAR GSS DANS SES MÉMOIRES (source prioritaire : à réutiliser et adapter) :\n' +
    utiles.map((p, i) => `[${i + 1}] ${libellePassage(p)}\n${p.texte}`).join('\n\n');
}

function moisDepuis(date: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(date || '');
  if (!m) return 999;
  const now = new Date();
  return (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2]));
}

/** Registre des informations variables, avec l'instruction de fraîcheur pour chacune. */
export function blocRegistre(): string {
  const { registre } = charger();
  if (!registre.length) return '';
  // Contrôle de cohérence : un effectif (agents, qualifiés…) supérieur à l'effectif total de l'entreprise
  // est incohérent → exclu du registre transmis (en attente d'arbitrage de GSS), jamais cité.
  const total = Number((registre.find((x) => x.cle === 'effectif_total')?.valeur_retenue || '').replace(/[^\d]/g, '')) || 0;
  const incoherent = (e: InfoRegistre) => total > 0 && e.cle !== 'effectif_total' && /^effectif_|^nombre_agents/.test(e.cle)
    && Number(e.valeur_retenue.replace(/[^\d]/g, '')) > total;
  const lignes = registre.filter((e) => !incoherent(e)).map((e) => {
    const ancien = CATEGORIES_VARIABLES.has(e.categorie) && moisDepuis(e.date_retenue) > FRAICHEUR_MOIS;
    const aConfirmer = e.statut === 'a_confirmer' || ancien;
    const raison = e.statut === 'a_confirmer'
      ? ` — A ÉVOLUÉ (avant : ${e.valeurs_anterieures_differentes.slice(0, 2).join(' ; ')})`
      : (ancien ? ` — dernière source de plus de ${FRAICHEUR_MOIS} mois` : '');
    return `- ${e.libelle} : ${e.valeur_retenue} [source : ${e.source_retenue}, ${e.date_retenue}]${aConfirmer ? ` [À CONFIRMER${raison}]` : ''}`;
  });
  return '\n\nREGISTRE DES INFORMATIONS GSS (valeur la plus récente connue de chaque information qui peut évoluer) :\n' + lignes.join('\n');
}

/**
 * Personnes du registre pour un rôle tenu par PLUSIEURS personnes (valeur « A ; B »), repéré par son
 * libellé (ex. « Responsable(s) d'exploitation »). Sert à citer tout le pôle, pas une seule personne.
 */
export function personnesDuRole(role: string): string[] {
  const n = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, ' ').replace(/\bs\b/g, ' ').replace(/\s+/g, ' ').trim();
  const cible = n(role);
  const e = charger().registre.find((x) => x.valeur_retenue.includes(';') && n(x.libelle).replace(/\bresponsables?\b/g, 'responsable') === cible.replace(/\bresponsables?\b/g, 'responsable'));
  return e ? e.valeur_retenue.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Organigramme GSS de RÉFÉRENCE, unique pour tout le document : fichier « Personnes » + registre
 * (valeurs datées des mémoires). Règle : un rôle tenu par plusieurs personnes (pôle) → toutes ; sinon la
 * valeur la plus récente du registre prime sur le fichier « Personnes » (non daté). Sans cette source
 * unique, les rubriques citaient des responsables différents pour un même rôle.
 */
export function organigrammeGss(referents: string): string {
  const cle = (role: string) => role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(s\)|\(e\)/g, '').replace(/\b(responsables?|directeur|directrice|chef|de|du|des|d|l|la|le|agence)\b/g, ' ')
    .replace(/[^a-z]+/g, ' ').trim().split(' ').filter((w) => w.length >= 2).map((w) => w.replace(/s$/, '').replace(/ale$/, 'al').replace(/iere$/, 'ier')).join(' ');
  const roles = new Map<string, { libelle: string; noms: string[] }>();
  for (const ligne of referents.split(/\r?\n/)) {
    const m = ligne.match(/^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/);
    if (!m || m[1].startsWith('---')) continue;
    for (const r of m[2].split('/').map((x) => x.trim()).filter(Boolean)) {
      const k = cle(r) || r;
      const e = roles.get(k) || { libelle: r, noms: [] };
      if (!e.noms.includes(m[1].trim())) e.noms.push(m[1].trim());
      roles.set(k, e);
    }
  }
  for (const e of charger().registre.filter((x) => /^responsable_|^dirigeant/.test(x.cle) && x.valeur_retenue)) {
    const noms = e.valeur_retenue.split(';').map((x) => x.trim()).filter(Boolean);
    const k = cle(e.libelle) || e.libelle;
    const exist = roles.get(k);
    const memePersonne = (a: string, b: string) => {
      const mots = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 3);
      const mb = mots(b);
      return mots(a).some((w) => mb.includes(w));
    };
    if (noms.length > 1 && exist) {
      for (const n of noms) if (!exist.noms.some((x) => memePersonne(x, n))) exist.noms.push(n);
    } else {
      roles.set(k, { libelle: exist?.libelle || e.libelle.replace(/\(s\)/g, 's').replace(/\(e\)/g, ''), noms: exist && exist.noms.some((x) => noms.some((n) => memePersonne(x, n))) ? exist.noms : noms });
    }
  }
  if (!roles.size) return '';
  return '\n\nORGANIGRAMME GSS DE RÉFÉRENCE (unique pour tout le document ; aucun autre nom ni rôle) :\n'
    + [...roles.values()].map((e) => `- ${e.libelle} : ${e.noms.join(', ')}`).join('\n');
}

/** Valeur la plus récente d'une information du registre (clé du catalogue), ou '' si inconnue. */
export function valeurRegistre(cle: string): string {
  return charger().registre.find((e) => e.cle === cle)?.valeur_retenue || '';
}

/** Règles de réutilisation communes aux deux modes de rédaction (cadre imposé et réponse libre). */
export const REGLES_REUTILISATION = `RÈGLES DE RÉUTILISATION DES MÉMOIRES GSS (demande explicite de GSS, prioritaires) :
- GSS a déjà répondu à la plupart des sujets dans ses mémoires précédents : si un extrait « RÉPONSES DÉJÀ RÉDIGÉES PAR GSS » traite le sujet, REPRENDS son contenu, sa structure, ses exemples concrets et ses méthodes, en l'ADAPTANT au nouveau client (nom du client, contexte, sites, exigences du DCE). Ne réinvente pas une réponse générique quand GSS a déjà la sienne.
- Garde la formulation et le vocabulaire de GSS (noms de leurs outils, de leurs procédures, de leurs équipes) : c'est leur méthode, pas un texte générique.
- Ne recopie JAMAIS le nom d'un ancien client comme destinataire de la réponse : un passage écrit « pour l'Université de Rouen » devient « pour <nouveau client> ». Un ancien client peut en revanche être cité comme RÉFÉRENCE ou EXEMPLE concret (« sur le site Carrefour de Venette, 13 agents… »).
- Ne mentionne JAMAIS qu'un contenu vient d'un « mémoire », d'une « réponse précédente », d'un « extrait » ou d'un « document » : présente-le comme la méthode, l'organisation ou l'expérience de GSS, et un ancien marché comme une RÉFÉRENCE (« sur le marché de l'Université de Rouen Normandie », « chez notre client CESI »).
- Intègre au moins un EXEMPLE CONCRET tiré des mémoires GSS (référence client, dispositif réel, procédure appliquée) dès que les extraits en contiennent un en lien avec le sujet.
- Si un extrait contient un TABLEAU pertinent (effectifs, qualifications, fréquences de contrôle…), reprends-le sous forme de tableau.
- Informations qui évoluent (effectifs, responsables, coordonnées, véhicules, logiciels, délais, certifications) : utilise la valeur du REGISTRE DES INFORMATIONS GSS (la plus récente), jamais une valeur plus ancienne d'un extrait. Ordre de priorité : réponse de l'équipe GSS (RECHERCHES ET SOLLICITATIONS) > registre > extraits de mémoires. Si l'information utilisée est marquée [À CONFIRMER], utilise la valeur la plus récente ET ajoute sur sa propre ligne : [CONSULTATION REQUISE : Confirmer <information> — dernière valeur connue : <valeur> (<source>)].
- Un même rôle peut être tenu par PLUSIEURS personnes (pôle renforcé, ex. l'exploitation) : si les RÉFÉRENTS GSS et le REGISTRE citent des personnes différentes pour un même rôle, cite-les TOUTES ensemble (« responsables d'exploitation : X, Y et Z »), sans en choisir une ni présenter l'une comme remplaçant l'autre.
- Chiffres GSS : reprends-les À L'IDENTIQUE (fréquences, délais, effectifs, durées) — ne les arrondis pas, ne les élargis pas (« deux à trois fois par mois » ne devient jamais « une à trois fois »).
- Effectifs GSS : n'utilise QUE les valeurs du REGISTRE (jamais les chiffres d'autres documents plus anciens) et cite toujours les mêmes dans tout le document ; un nombre d'agents ne dépasse jamais l'effectif total ; une valeur incohérente marquée [À CONFIRMER] n'est pas citée.
- Personnes et rôles : utilise UNIQUEMENT l'ORGANIGRAMME GSS DE RÉFÉRENCE, identique dans tout le document (mêmes personnes pour un même rôle, même rôle pour une même personne).
- Implantation : GSS est implanté à Rouen (Normandie). Les délais d'intervention, d'astreinte ou de mobilisation du registre ont été pris pour des marchés normands : pour un site situé dans une autre région, ne les présente pas comme un engagement ; décris l'organisation prévue (renforts, prépositionnement, relais local) sans chiffre inventé et demande le délai à GSS (consultation / [À COMPLÉTER]).
- Contenu daté ou étranger au marché : ne reprends jamais les mesures Covid (gestes barrières, pass sanitaire, gel hydroalcoolique) ni un contenu propre à un autre secteur (magasin, caisses, transport de fonds, événementiel) s'il ne concerne pas ce marché. « Pôle emploi » s'appelle désormais « France Travail ».
- Le document est destiné à l'ACHETEUR : n'y écris JAMAIS de commentaire interne ou de diagnostic sur les manques (« à ce stade », « n'est pas établi », « la documentation fournie ne comporte pas », « reste à confirmer », « devra être confirmé », « selon les éléments disponibles »…). Une information manquante se signale uniquement par le marqueur prévu (consultation / [À COMPLÉTER]). Si une visite du site est obligatoire, elle est réputée faite : jamais de futur « après la visite ».
- Reprise du personnel : le fondement est l'accord de reprise de la convention collective de la prévention-sécurité (IDCC 1351), sauf autre indication du DCE ; ne cite jamais l'article L1224-1 du Code du travail pour une simple perte de marché, et n'aborde pas la reprise quand la prestation est ponctuelle (bons de commande).
- Prérogatives des agents : un agent de sécurité privée ne contrôle pas l'identité ; il invite la personne à justifier de sa présence et fait appel aux forces de l'ordre.
- Références : ne cite comme référence qu'un marché réellement exécuté par GSS, avec uniquement les caractéristiques présentes dans les sources (un mémoire de candidature n'est pas une référence) ; privilégie un marché comparable (même type d'acheteur ou de site).
- Durée de la prestation : adapte les éléments récurrents (contrôles mensuels ou trimestriels, bilans à J+7/J+15, reprise du personnel) à la durée réelle du marché ; pour une prestation ponctuelle de quelques jours, décris les contrôles pendant la mission elle-même.
- Les chiffres propres à un ancien marché (agents dédiés à un site, délais par site d'un autre client) ne sont PAS des informations de GSS en général : ne les reprends pas pour le nouveau client.`;

/**
 * Texte de la base (passages + valeurs du registre) pour les GARDE-FOUS anti-invention : une valeur
 * (nom, chiffre, certification) présente dans un mémoire GSS est une donnée sourcée, pas une invention.
 */
export function texteSourcesMemoires(): string {
  const { passages, registre } = charger();
  return passages.map((p) => p.texte).join('\n') + '\n' + registre.map((e) => `${e.libelle} : ${e.valeur_retenue}`).join('\n');
}

/** Phrases de diagnostic interne sur les manques (jamais destinées à l'acheteur). */
const COMMENTAIRE_INTERNE = /(\bà ce stade\b|\bne sont pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]est pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]ont pas été (?:communiqué|transmis|fourni)|\bn['’]a pas été (?:communiqué|transmis|fourni)|documentation (?:gss )?(?:fournie|transmise|disponible)|documents? (?:gss )?transmis|éléments? (?:gss )?(?:disponibles|transmis|fournis|communiqués)|\breste(?:nt)? à (?:confirmer|établir|préciser|obtenir)|\bdoi(?:t|vent) être confirmé|\bdevr(?:a|ont) être (?:confirmé|précisé|transposé|validé)|\baprès la visite\b|\blors de la visite obligatoire\b|\bne comporte (?:toutefois )?pas\b|\bne présente ni\b|\bsous réserve de (?:confirmation|validation)\b|\bnon (?:communiqué|précisé|renseigné) dans les)/i;

/**
 * Retire du texte destiné à l'acheteur les phrases de diagnostic interne (« à ce stade, … n'est pas
 * établi », « la documentation fournie ne comporte pas… ») et les renvoie pour la liste des points à
 * confirmer. Une phrase qui porte un marqueur ([À COMPLÉTER], [CONSULTATION REQUISE], repère) est gardée.
 */
export function retirerCommentairesInternes(texte: string): { texte: string; retires: string[] } {
  const retires: string[] = [];
  const lignes = texte.split('\n').map((ligne) => {
    if (/^\s*(#|\||[-*•]\s)/.test(ligne) && !COMMENTAIRE_INTERNE.test(ligne)) return ligne;
    const phrases = ligne.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/);
    const gardees = phrases.filter((ph) => {
      if (!COMMENTAIRE_INTERNE.test(ph) || /\[À COMPLÉTER\]|\[CONSULTATION REQUISE|⟦AC:/.test(ph)) return true;
      retires.push(ph.replace(/[*#]/g, '').trim());
      return false;
    });
    return gardees.join(' ');
  });
  return { texte: lignes.join('\n').replace(/\n{3,}/g, '\n\n'), retires };
}

/** Extrait les demandes de confirmation [CONSULTATION REQUISE : …] d'un texte et les retire. */
export function extraireConfirmations(texte: string): { texte: string; confirmations: string[] } {
  const re = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;
  const confirmations: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte)) !== null) confirmations.push(m[1].trim());
  // Retrait du marqueur ET de la ponctuation qui le suivait : aucun « . » orphelin ne reste dans le texte.
  const nettoye = texte
    .replace(/\[CONSULTATION REQUISE\s*:\s*[^\]]+\][ \t]*[.;,]?/gi, '')
    .replace(/^[ \t]*[.;,][ \t]*$/gm, '')
    .replace(/([.!?])[ \t]+[.;,](?=\s|$)/g, '$1')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { texte: nettoye, confirmations };
}
