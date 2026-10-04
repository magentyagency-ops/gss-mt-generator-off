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
/**
 * Zone d'intervention de GSS (réponse de GSS du 1er octobre 2026) : siège à Rouen, équipes et astreinte présentes sur
 * toute la moitié nord de la France. Sert aux marchés hors Normandie (Île-de-France, Essonne…) : présence des équipes et
 * de l'astreinte, sans ville d'agence ni délai chiffré qui n'ont pas été donnés.
 */
export const ZONE_GSS = "les équipes et l'astreinte de GSS sont présentes sur toute la moitié nord de la France, de Nantes à Lille et jusqu'à Reims";

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
  /** Information interne de GSS (ex. prix horaire) : jamais transmise aux rédactions ni écrite dans un mémoire. */
  interne?: boolean;
  /** Valeur à confirmer dont la question est posée une seule fois à GSS (questions_gss_une_fois) : jamais reposée. */
  question_une_fois?: boolean;
}

let cache: { passages: PassageMemoire[]; vecteurs: Float32Array[]; registre: InfoRegistre[] } | null = null;

/** Correction d'un passage d'un ancien mémoire d'après une réponse de GSS (corrections_passages.json). */
export interface CorrectionPassage { document: string; page: number; ancien: string; nouveau: string; source?: string }

/**
 * Corrections de GSS réappliquées aux passages (même règle que construire_base.py : ligne égale à « ancien » d'une page
 * du document remplacée par « nouveau ») : une base reconstruite sans elles ne réintroduit jamais un fait corrigé
 * (Peugeot 3008, 76 rue d'Elbeuf, 02.35.89.09.92, J-15…). Modifie les passages en place ; renvoie le nombre de lignes
 * corrigées.
 */
export function appliquerCorrectionsPassages(passages: Array<Pick<PassageMemoire, 'document' | 'page' | 'texte'>>, corrections: CorrectionPassage[]): number {
  let n = 0;
  for (const p of passages) {
    const cs = corrections.filter((c) => c.document === p.document && Number(c.page) === Number(p.page));
    if (!cs.length) continue;
    p.texte = String(p.texte).split('\n').map((l) => { const c = cs.find((x) => x.ancien === l); if (c) n++; return c ? c.nouveau : l; }).join('\n');
  }
  return n;
}

/** Corrections versionnées de la base des mémoires (fichier absent : aucune). */
export function correctionsPassages(): CorrectionPassage[] {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'corrections_passages.json'), 'utf-8')).corrections || []; } catch { return []; }
}

function charger() {
  if (cache) return cache;
  try {
    const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base_memoires.json'), 'utf-8'));
    const passages: PassageMemoire[] = base.passages || [];
    const corriges = appliquerCorrectionsPassages(passages, correctionsPassages());
    if (corriges) console.warn(`[BaseMemoires] ${corriges} ligne(s) de passage corrigée(s) au chargement d'après corrections_passages.json (base reconstruite sans les corrections de GSS).`);
    const buf = fs.readFileSync(path.join(DIR, 'base_memoires.emb'));
    const dim = passages.length ? buf.length / 4 / passages.length : 0;
    const vecteurs: Float32Array[] = passages.map((_, i) => {
      const v = new Float32Array(dim);
      for (let j = 0; j < dim; j++) v[j] = buf.readFloatLE((i * dim + j) * 4);
      return v;
    });
    let registre: InfoRegistre[] = [];
    try { registre = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8')).informations || []; } catch { /* registre absent */ }
    // Informations internes (prix horaire, réservé à la décomposition justificative du prix) : jamais chargées pour
    // la rédaction (registre transmis, garde-fous, confirmations) ; lues seulement par valeurInterne().
    registre = registre.filter((e) => !e.interne);
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

/** Entrées du registre encore « à confirmer » mais tranchées pour le mémoire : jamais reposées à GSS. */
// interlocuteur_unique : MARCHANI Adil, tranché par GSS (faits_gss.md), jamais « à confirmer ».
const POINTS_TRANCHES = new Set(['logiciel_main_courante', 'effectif_agents_securite', 'interlocuteur_unique']);
/** Entrée jamais reposée à chaque génération : point tranché, ou question posée une seule fois à GSS (question_une_fois :
 *  noms de l'organigramme ALAMAT, ATTOU, DA SILVA, en attendant l'organigramme à jour). */
const jamaisReposee = (e: InfoRegistre): boolean => POINTS_TRANCHES.has(e.cle) || !!e.question_une_fois;

/** Registre des informations variables, avec l'instruction de fraîcheur pour chacune. */

/** Valeur et source de DELAI_ASTREINTE_NORMANDIE (mémoire type), ou null si le fichier est illisible. */
function delaiAstreinteNormandie(): { valeur: string; source: string } | null {
  for (const c of [path.resolve(__dirname, 'memoire_type', 'memoire_type.json'), path.resolve(__dirname, '../../src/generation/memoire_type/memoire_type.json')]) {
    try {
      const v = JSON.parse(fs.readFileSync(c, 'utf-8'))?.variables?.DELAI_ASTREINTE_NORMANDIE;
      if (v?.valeur_gss) return { valeur: String(v.valeur_gss), source: String(v.origine || '').split(' : ')[0] || 'mémoire type' };
    } catch { /* fichier suivant */ }
  }
  return null;
}

export function blocRegistre(horsNormandie = false): string {
  const { registre } = charger();
  if (!registre.length) return '';
  // Contrôle de cohérence : un effectif (agents, qualifiés…) supérieur à l'effectif total de l'entreprise
  // est incohérent → exclu du registre transmis (en attente d'arbitrage de GSS), jamais cité.
  const total = Number((registre.find((x) => x.cle === 'effectif_total')?.valeur_retenue || '').replace(/[^\d]/g, '')) || 0;
  const incoherent = (e: InfoRegistre) => total > 0 && e.cle !== 'effectif_total' && /^effectif_|^nombre_agents/.test(e.cle)
    && Number(e.valeur_retenue.replace(/[^\d]/g, '')) > total;
  // Site hors de la zone d'intervention habituelle (Normandie) : les délais du registre, pris sur des
  // marchés normands, ne sont pas transmis (sinon ils étaient promis tels quels, ex. 60 min depuis Rouen).
  const lignes = registre.filter((e) => !incoherent(e) && !(horsNormandie && e.categorie === 'delais')).map((e) => {
    const ancien = CATEGORIES_VARIABLES.has(e.categorie) && moisDepuis(e.date_retenue) > FRAICHEUR_MOIS;
    const aConfirmer = (e.statut === 'a_confirmer' || ancien) && !jamaisReposee(e);
    const raison = e.statut === 'a_confirmer'
      ? ` — A ÉVOLUÉ (avant : ${e.valeurs_anterieures_differentes.slice(0, 2).join(' ; ')})`
      : (ancien ? ` — dernière source de plus de ${FRAICHEUR_MOIS} mois` : '');
    // Main courante tranchée : Trackforce seul (Vigicom figure dans un ancien mémoire).
    const valeur = e.cle === 'logiciel_main_courante' ? 'Trackforce' : e.valeur_retenue;
    // Délai d'astreinte du registre : son objet exact (remplacement d'un agent absent sur son site, variable
    // DELAI_ASTREINTE_NORMANDIE du mémoire type), jamais présenté comme le délai d'intervention de l'astreinte.
    const libelle = e.cle === 'delai_astreinte' ? "Délai d'arrivée de l'agent d'astreinte en remplacement d'un agent absent sur son site" : e.libelle;
    return `- ${libelle} : ${valeur} [source : ${e.source_retenue}, ${e.date_retenue}]${aConfirmer ? ` [À CONFIRMER${raison}]` : ''}`;
  });
  // Délai d'intervention de l'astreinte sur un site normand (mémoire type, variable DELAI_ASTREINTE_NORMANDIE).
  if (!horsNormandie) {
    const d = delaiAstreinteNormandie();
    if (d) lignes.push(`- Délai d'intervention des agents d'astreinte sur n'importe quel site normand : ${d.valeur} [source : ${d.source}]`);
  }
  const avertissement = horsNormandie
    ? `\nCE MARCHÉ EST HORS DE NORMANDIE (siège et implantation historique de GSS) : ${ZONE_GSS} ; présente cette présence, sans inventer de ville d'agence. N'annonce AUCUN délai chiffré d'astreinte, d'intervention, de remplacement ou de mise en place repris d'anciens marchés normands (ex. 60 minutes, 1 h à 24 h) ; décris l'organisation et demande le délai à GSS.`
    : '';
  return '\n\nREGISTRE DES INFORMATIONS GSS (valeur la plus récente connue de chaque information qui peut évoluer) :\n' + lignes.join('\n') + avertissement;
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
/** Rôles de l'organigramme GSS de référence (annuaire « Personnes » + registre des mémoires). */
export function rolesOrganigramme(referents: string): Array<{ libelle: string; noms: string[] }> {
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
      const memes = !!exist && exist.noms.some((x) => noms.some((n) => memePersonne(x, n)));
      // Personne remplacée par le registre : le libellé est celui du registre (sans accord au féminin hérité
      // de l'ancienne titulaire : « Responsable Commerciale » pour DA SILVA Luis).
      roles.set(k, { libelle: memes && exist ? exist.libelle : e.libelle.replace(/\(s\)/g, 's').replace(/\(e\)/g, ''), noms: memes && exist ? exist.noms : noms });
    }
  }
  // Noms au format « NOM Prénom » (« ATTOU NESRINE » → « ATTOU Nesrine »).
  const nomPropre = (n: string) => (/^[A-ZÀ-Ý' -]+\s+[A-ZÀ-Ý' -]+$/.test(n.trim()) && n.trim().split(/\s+/).length === 2
    ? n.trim().replace(/\s+(\S+)$/, (_m, p) => ` ${p.charAt(0)}${p.slice(1).toLowerCase()}`) : n);
  for (const r of roles.values()) r.noms = r.noms.map(nomPropre);
  return [...roles.values()];
}

export function organigrammeGss(referents: string): string {
  const roles = rolesOrganigramme(referents);
  if (!roles.length) return '';
  return '\n\nORGANIGRAMME GSS DE RÉFÉRENCE (unique pour tout le document ; aucun autre nom ni rôle) :\n'
    + roles.map((e) => `- ${e.libelle} : ${e.noms.join(', ')}`).join('\n');
}

/**
 * Références clients RÉELLES de GSS (fiches validées de la bibliothèque : client, lieu, effectif,
 * amplitude, missions). Seule source autorisée pour citer une référence ; mentions Covid retirées.
 */
export function referencesGss(): string {
  try {
    const ix = JSON.parse(fs.readFileSync(path.resolve(DIR, '../schemas_gss/bibliotheque/index.json'), 'utf-8'));
    const refs = (ix as any[]).filter((x) => x.section === 'b_references' && /^Référence /.test(x.titre))
      .map((x) => `- ${x.titre.replace(/^Référence\s+/, '')} : ${String(x.texte).replace(/Vérification des pass sanitaires[^A-Z]*/g, '').replace(/\s+/g, ' ').trim()}`);
    return refs.length ? `\n\nRÉFÉRENCES CLIENTS DE GSS (marchés réellement exécutés — seules références autorisées ; cite la plus comparable au marché avec ses caractéristiques exactes) :\n${refs.join('\n')}` : '';
  } catch {
    return '';
  }
}

/** Motifs de reconnaissance de chaque référence client (nom complet, et premier mot distinctif). */
export function motifsReferences(): Array<{ nom: string; motifs: RegExp[] }> {
  try {
    const ix = JSON.parse(fs.readFileSync(path.resolve(DIR, '../schemas_gss/bibliotheque/index.json'), 'utf-8'));
    const GENERIQUES = /^(h[ôo]tel|centre|r[ée]gion|ville|mairie|agence|si[èe]ge|campus|march[ée])$/i;
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (ix as any[]).filter((x) => x.section === 'b_references' && /^Référence /.test(x.titre)).map((x) => {
      const nom = String(x.titre).replace(/^Référence\s+/, '').split(' — ').pop()!.trim();
      const motifs = [new RegExp(`(?<![\\wÀ-ÿ])${esc(nom)}(?![\\wÀ-ÿ])`)];
      const premier = nom.split(/\s+/)[0];
      const distinctif = /^centre hospitalier/i.test(nom) ? `hospitalier du ${nom.split(/\s+/).pop()}` : (!GENERIQUES.test(premier) && (premier.length >= 4 || /^[A-Z]{3,}$/.test(premier)) ? premier : '');
      if (distinctif && distinctif !== nom) motifs.push(new RegExp(`(?<![\\wÀ-ÿ])${esc(distinctif)}(?![\\wÀ-ÿ])`, /^hospitalier/.test(distinctif) ? 'i' : ''));
      return { nom, motifs };
    });
  } catch {
    return [];
  }
}

/**
 * Anciens acheteurs de GSS (clients des mémoires indexés) cités dans un texte, hors client courant et hors références
 * clients validées (citables comme références). Garde-fou des propositions de réponse aux questions nouvelles, rédigées
 * à partir des anciens mémoires : un ancien acheteur repris comme destinataire est relancé, puis signalé à GSS.
 */
export function acheteursCites(texte: string, client = ''): string[] {
  const norm = (t: string) => normTxt(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const cible = norm(client);
  const refs = motifsReferences();
  const noms = new Map<string, string[]>();
  for (const p of charger().passages) {
    const nom = String(p.client || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!nom || /^(gardiennage|surveillance|prestations?|s[ée]curit[ée])\b/i.test(nom) || noms.has(nom)) continue;
    const mots = nom.split(' ');
    // Nom complet, ses trois premiers mots (« Université de Rouen ») et son sigle (« CAF »).
    noms.set(nom, [...new Set([nom, ...(mots.length > 3 ? [mots.slice(0, 3).join(' ')] : []), ...(/^[A-Z]{3,}$/.test(mots[0]) ? [mots[0]] : [])])]);
  }
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cites: string[] = [];
  for (const [nom, variantes] of noms) {
    const n = norm(nom);
    if (cible && variantes.some((v) => { const x = norm(v); return cible.includes(x) || x.includes(cible); })) continue;
    if (refs.some((r) => r.motifs.some((m) => m.test(nom)) || norm(r.nom) === n)) continue;
    if (variantes.some((v) => new RegExp(`(?<![\\wÀ-ÿ])${esc(v)}(?![\\wÀ-ÿ])`).test(texte))) cites.push(nom);
  }
  // « CAF » (mémoire de 2025) n'est pas signalé en plus de « CAF du Val-de-Marne ».
  return cites.filter((c) => !cites.some((d) => d !== c && d.startsWith(`${c} `)));
}

/**
 * Phrases qui citent un ancien acheteur de GSS qui n'est ni le client ni une référence validée (T1-CONS-3, T1F-14 : « Sur le
 * marché de la CAF du Val-de-Marne, les équipes GSS vérifient déjà… » dans le mémoire de l'EPCF) : retirées, puce et lignes
 * gardées pour le reste.
 */
export function sansAnciensAcheteurs(texte: string, client = ''): string {
  return String(texte || '').split('\n').map((l) => {
    const puce = (/^\s*(?:[-*•]|\d+[.)])\s+/.exec(l) || [''])[0];
    const phrases = l.slice(puce.length).split(/(?<=[.!?])\s+/);
    const gardees = phrases.filter((ph) => !acheteursCites(ph, client).length);
    return gardees.length === phrases.length ? l : gardees.length ? `${puce}${gardees.join(' ')}` : null;
  }).filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Graphies en minuscules des mots des textes de GSS (passages des mémoires), par mot sans accent ni casse : sert à écrire en
 * minuscules, avec ses accents, un mot que le DCE n'écrit qu'en capitales (« CENTRE » → « centre »).
 */
let vocabulaireGss: Map<string, string> | null = null;
export function graphieMinusculeGss(mot: string): string {
  if (!vocabulaireGss) {
    const compte = new Map<string, Map<string, number>>();
    for (const p of charger().passages) {
      for (const m of String(p.texte || '').matchAll(/[a-zà-ÿ]{3,}/g)) {
        const k = normTxt(m[0]);
        const f = compte.get(k) || compte.set(k, new Map()).get(k)!;
        f.set(m[0], (f.get(m[0]) || 0) + 1);
      }
    }
    vocabulaireGss = new Map([...compte].map(([k, f]) => [k, [...f].sort((a, b) => b[1] - a[1])[0][0]]));
  }
  return vocabulaireGss.get(normTxt(String(mot || ''))) || '';
}

/** Montants en euros du registre de GSS (garanties d'assurance, prix) : seuls montants qu'un texte peut attribuer à GSS. */
export function montantsRegistre(): string[] {
  return charger().registre.flatMap((e) => String(e.valeur_retenue || '').match(/\d[\d\s\u00a0\u202f.,]*\s*(?:€|euros?\b)/gi) || []);
}

/**
 * Question sur une donnée de GSS (références, chiffre d'affaires, effectif moyen, part de l'encadrement) : jamais « À
 * demander à l'acheteur » (vitry 351 : « À demander à l'acheteur : quelle était la dénomination sociale de l'établissement
 * client concerné en 2023 ? », retirée des questions envoyées à l'équipe de GSS). Le préfixe est retiré.
 */
export function questionDonneeGss(question: string): string {
  const q = String(question || '');
  const m = /^\s*À demander à l['’]acheteur\s*:\s*/i.exec(q);
  if (!m) return q;
  const reste = q.slice(m[0].length);
  // Fiches techniques des moyens du soumissionnaire (havre2 361, 4.2 et 4.4 : « insérer ici les fiches techniques ») : ce
  // sont celles des équipements de GSS, jamais celles de l'acheteur (T4-COH-5). Une installation de l'acheteur reste à lui.
  if (/fiches? techniques?|notices? techniques?|documentations? techniques?/i.test(reste) && !/de l['’]acheteur|du client|(?:ses|vos) (?:installations|[ée]quipements existants)|existant|install[ée]s? sur (?:le )?site|GTB|SSI|vid[ée]oprotection du site/i.test(reste)) {
    return 'Pouvez-vous fournir les fiches techniques de vos équipements à insérer dans le cadre de réponse (moyens de communication, système de contrôle de rondes, main courante électronique Trackforce) ?';
  }
  // Calendrier de GSS (« J-10, J-7 et J-3 », ifsem 361) : ses échéances sont celles de GSS, jamais celles de l'acheteur.
  // Contenu d'une réponse du cadre (« quelles informations faut-il inscrire dans la réponse à la rubrique « Clauses
  // environnementales… » », etampes1 594) : c'est la réponse de GSS, jamais une question pour l'acheteur.
  if (!/faut-il (?:inscrire|[ée]crire|indiquer|mettre) dans la r[ée]ponse|clauses? environnementales|[ée]cogestes|d[ée]marche (?:RSE|environnementale)|chiffre d['’]affaires|d[ée]nomination sociale|montant annuel(?: HT)?|part de l['’]encadrement|effectifs? moyens?|nombre de cadres|r[ée]f[ée]rences? (?:professionnelles|clients?|de GSS|de l['’]ann[ée]e)|[ée]tablissement client|calendrier (?:de )?GSS|\bJ\s?[-−–]\s?\d+\b/i.test(reste)) return q;
  return reste.charAt(0).toUpperCase() + reste.slice(1);
}

/**
 * Question à GSS sans les données CNAPS déjà connues du registre (havre2 341 : « Pour l'autorisation d'exercer du
 * dirigeant, quels sont le numéro, la date d'obtention et la date de fin de validité ? » alors que le numéro AGD est
 * imprimé dans le même tableau). Le numéro de l'autorisation de l'entreprise (AUT) ou de l'agrément du dirigeant (AGD),
 * et la date d'obtention de l'autorisation de l'entreprise, ne sont jamais redemandés ; une question qui ne demandait
 * que cela est retirée (null). Les cartes et agréments des agents ne sont pas concernés.
 */
export function sansDonneesCnapsConnues(question: string): string | null {
  const q = String(question || '');
  if (/\bagents?\b|carte(?:s)? professionnelle/i.test(q) || !/autorisation|agr[ée]ment|cnaps/i.test(q)) return q;
  const dirigeant = /dirigeant|g[ée]rant|\bAGD\b/i.test(q);
  const entreprise = /entreprise|soci[ée]t[ée]|\bGSS\b|GLOBAL SECURITY|\bAUT\b|autorisation d.exercer(?! du dirigeant)/i.test(q) && !/autorisation d.exercer du dirigeant/i.test(q);
  if (!dirigeant && !entreprise) return q;
  // Question fusionnée sur l'entreprise ET le dirigeant qui redemande la date d'obtention de l'autorisation de l'entreprise
  // (connue : 12/02/2015) — havre2 361 : « Quelles sont les dates d'obtention et de fin de validité des autorisations CNAPS
  // de l'entreprise et du dirigeant ? » : seules les données inconnues sont demandées.
  if (dirigeant && /entreprise|soci[ée]t[ée]|\bGSS\b|GLOBAL SECURITY/i.test(q) && /obtention|d[ée]livrance/i.test(q) && /fin de validit/i.test(q) && valeurRegistre('date_autorisation_cnaps')) {
    return "Quelle est la date de fin de validité de l'autorisation d'exercer CNAPS de l'entreprise, et quelles sont les dates d'obtention et de fin de validité de l'agrément CNAPS du dirigeant ?";
  }
  const numeroConnu = (!dirigeant || !!valeurRegistre('agrement_dirigeant')) && (!entreprise || !!valeurRegistre('autorisation_cnaps'));
  const obtentionConnue = entreprise && !dirigeant && !!valeurRegistre('date_autorisation_cnaps');
  const NUM = "(?:le |son |leur )?num[ée]ro(?: d['’](?:autorisation(?: d['’]exercer)?|agr[ée]ment))?";
  const OBT = "(?:la |sa )?date d['’](?:obtention|d[ée]livrance)";
  let t = q;
  const retirer = (motif: string) => {
    t = t.replace(new RegExp(`\\b${motif}\\s*,\\s*`, 'i'), '').replace(new RegExp(`\\b${motif}\\s+et\\s+`, 'i'), '').replace(new RegExp(`(?:\\s*,\\s*|\\s+et\\s+)${motif}(?=\\s*[?,.])`, 'i'), '');
  };
  if (numeroConnu) retirer(NUM);
  if (obtentionConnue) retirer(OBT);
  const reste = t.replace(/[^a-zà-ÿ ]/gi, ' ');
  if ((numeroConnu && new RegExp(`^\\s*(?:quel est|indiquez|pouvez-vous (?:indiquer|communiquer|confirmer))\\s+${NUM}\\s*(?:[^,]*)\\?\\s*$`, 'i').test(t) && !/date|validit/i.test(reste))) return null;
  t = t.replace(/\bquels sont (la|les) (dates?)\b/i, 'quelles sont $1 $2').replace(/\s{2,}/g, ' ');
  // Une seule donnée restante : « quelle est la date … ? ».
  const m = /\bquelles sont (la date\b[^?]*)\?/i.exec(t);
  if (m && !/\s(?:et|,)\s|,/.test(m[1])) t = t.replace(/\bquelles sont la date\b/i, 'quelle est la date');
  return t;
}

/**
 * Suite des jalons d'un calendrier (une ligne par jalon, « - J-10 : … », « - J-7 : … ») dans l'ordre chronologique :
 * J-10, J-7, J-7, J-3, J+1… Vrai s'il n'y a pas de calendrier.
 */
export function jalonsChronologiques(texte: string): boolean {
  const v = String(texte || '').split('\n').map((l) => /^\s*(?:[-*•]\s*)?(?:\*\*)?J\s*([-−–+])\s*(\d{1,3})(?!\d)/.exec(l)).filter(Boolean)
    .map((m) => (m![1] === '+' ? 1 : -1) * Number(m![2]));
  return v.every((x, i) => i === 0 || x >= v[i - 1]);
}

/** Jalons « J-n » / « J+n » d'un texte, normalisés (« J - 10 » → « J-10 »). */
export function jalonsDe(t: string): string[] {
  return [...String(t || '').matchAll(/(?<![A-Za-z0-9])J\s*([-−–+])\s*(\d{1,3})(?!\d)/g)].map((m) => `J${m[1] === '+' ? '+' : '-'}${m[2]}`);
}

/**
 * Remplacement proposé par une passe d'alignement sur le CCTP (corrigerContradictions) qui toucherait un fait de GSS :
 * montant en euros (garanties d'assurance), numéro de contrat ou d'autorisation, valeur du registre. Le seuil exigé par le
 * DCE n'est pas la garantie réelle de GSS (parc_expo 202 : RC professionnelle Hiscox 300 000 € réécrite « au minimum
 * 10 000 000 € par sinistre ») : le remplacement est refusé et l'écart devient une question à GSS. Renvoie '' si admis.
 */
export function motifRefusAlignement(extrait: string, remplacement: string): string {
  const montants = (t: string) => (String(t || '').match(/\d[\d\s\u00a0\u202f.,]*\s*(?:€|euros?\b|k€|M€)/gi) || []).map((x) => x.replace(/[\s\u00a0\u202f.]/g, '').replace(/euros?/i, '€')).sort().join('|');
  if (montants(extrait) && montants(extrait) !== montants(remplacement)) return 'montant de GSS';
  const numeros = (t: string) => String(t || '').match(/\b[A-Z]{2,}[A-Z0-9-]*\d{4,}[A-Z0-9-]*\b/g) || [];
  if (numeros(extrait).some((x) => !String(remplacement).includes(x))) return 'numéro de contrat ou d\'autorisation de GSS';
  // Jalon du calendrier de GSS (« J-10 : envoi des plannings », « J-3 : envoi des plannings au CNRS », confirmés par GSS) :
  // jamais remplacé par le délai du CCTP, sinon la suite des jalons n'est plus chronologique (ifsem 335 : planning envoyé au
  // CNRS avant d'être validé par les agents). L'écart est demandé à GSS.
  // Un jalon peut devenir un autre jalon (J-3 → J-7 quand le DCE exige 7 jours pour l'envoi au client) ; la suite reste
  // contrôlée par jalonsChronologiques là où le texte entier est connu.
  if (jalonsDe(extrait).some((j) => !jalonsDe(remplacement).includes(j)) && !jalonsDe(remplacement).length) return 'jalon du calendrier de GSS';
  const n = (t: string) => normTxt(String(t || '')).replace(/\s+/g, ' ');
  const ext = n(extrait), rem = n(remplacement);
  for (const e of charger().registre) {
    for (const v of String(e.valeur_retenue || '').split(';').map((x) => n(x).trim()).filter((x) => x.length >= 6 && x.length <= 80 && /\d/.test(x))) {
      if (ext.includes(v) && !rem.includes(v)) return `valeur du registre de GSS (${e.libelle || e.cle})`;
    }
  }
  return '';
}

/**
 * Noms d'un autre marché cités dans un texte (question à GSS, valeur d'un champ) : anciens acheteurs de GSS
 * (acheteursCites) et références clients de GSS que le DCE ne cite pas. Une question « Confirmer le délai de mobilisation
 * applicable aux sites de Port-Jérôme-sur-Seine » posée pour la Ville de Vitry-sur-Seine (vitry 202) porte sur un autre
 * marché : elle n'est pas posée.
 */
export function nomsHorsMarche(texte: string, dce = '', client = ''): string[] {
  const t = String(texte || '');
  const dceN = normTxt(dce);
  const refs = motifsReferences()
    .filter((r) => r.motifs.some((m) => m.test(t)) && !normTxt(client).includes(normTxt(r.nom)))
    .filter((r) => !dceN.includes(normTxt(r.nom)) && !r.motifs.slice(1).some((m) => m.test(dce)))
    .map((r) => r.nom);
  return [...new Set([...acheteursCites(t, client).filter((n) => !dceN.includes(normTxt(n))), ...refs])];
}

/**
 * Une référence client est citée dans DEUX rubriques au plus (retour GSS : CESI, Schneider… repris
 * partout). On garde la rubrique « références » puis la première rubrique qui la cite ; ailleurs, les
 * phrases, puces et lignes de tableau qui la citent sont retirées (jamais au point de vider une rubrique,
 * jamais une phrase portant un repère à compléter). Renvoie le nombre de passages retirés.
 */
export function limiterReferences(sections: Record<string, string>, ordre: string[], rubriqueReferences = 'b_references', maxRubriques = 2): number {
  let n = 0;
  for (const { motifs } of motifsReferences()) {
    const cite = (t: string) => motifs.some((m) => m.test(t));
    const SUITE_PARAGRAPHE = /^(?:Cette (?:expérience|référence|mission|prestation|organisation)|Ces missions|Elle (?:est|constitue)|Il (?:s.agit|constitue))\b/;
    const ids = ordre.filter((id) => cite(sections[id] || ''));
    const garder = [...(ids.includes(rubriqueReferences) ? [rubriqueReferences] : []), ...ids.filter((id) => id !== rubriqueReferences)].slice(0, maxRubriques);
    for (const id of ids.filter((x) => !garder.includes(x))) {
      const avant = sections[id];
      let finRetiree = false;  // le paragraphe précédent se terminait par la référence retirée
      let t = avant.split('\n').map((ligne) => {
        if (!ligne.trim()) return ligne;
        // Paragraphe qui commence par prolonger la référence retirée juste avant (« Cette expérience… ») :
        // sa première phrase part aussi.
        if (finRetiree && SUITE_PARAGRAPHE.test(ligne.trim()) && !/⟦AC:|\[CONSULTATION REQUISE/.test(ligne)) {
          const phs = ligne.trim().split(/(?<=[.!?])\s+/);
          phs.shift();
          ligne = phs.join(' ');
        }
        finRetiree = false;
        if (!cite(ligne) || /⟦AC:|\[CONSULTATION REQUISE/.test(ligne)) return ligne;
        finRetiree = true;
        if (/^\s*(#|\||[-*•]\s|\d+[.)]\s)/.test(ligne)) return null; // titre, puce, ligne de tableau : retirés entiers
        // Les phrases qui suivent une référence retirée et la prolongent (« Les missions comprenaient… »,
        // « Cette expérience… », « Elle constitue… ») partent avec elle : sinon elles restent orphelines.
        const SUITE = /^(?:Ces?|Cet|Cette|Ils|Elles|Il|Elle|Celle|Celui|Ceux|Celles|Les missions|La mission|Le dispositif|La même|Là|Sur ce site|Sur ce marché|Dans ce cadre)\b/;
        const phs = ligne.split(/(?<=[.!?])\s+/);
        let retirer = false;
        return phs.filter((ph) => {
          if (cite(ph)) { retirer = true; return false; }
          if (retirer && SUITE.test(ph)) return false;
          retirer = false;
          return true;
        }).join(' ');
      }).filter((l): l is string => l !== null).join('\n');
      t = t.replace(/^#{2,4}\s+.+\n+(?=#{2,4}\s|$(?![\s\S]))/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      if (t !== avant && t.split(/\s+/).length >= 120) { sections[id] = t; n++; }
    }
  }
  return n;
}

/**
 * Valeurs du registre « à confirmer » effectivement reprises dans un texte : chacune donne une question de
 * confirmation pour GSS (la valeur utilisée reste dans le document, mais GSS est prévenu).
 */
export function confirmationsRegistreUtilisees(texte: string, horsNormandie = false): string[] {
  const t = normTxt(texte).replace(/\s+/g, ' ');
  const out: string[] = [];
  for (const e of charger().registre) {
    // Hors Normandie, les délais du registre ne sont jamais repris : un même chiffre dans le texte vient du DCE.
    if (horsNormandie && e.categorie === 'delais') continue;
    const ancien = CATEGORIES_VARIABLES.has(e.categorie) && moisDepuis(e.date_retenue) > FRAICHEUR_MOIS;
    if (e.statut !== 'a_confirmer' && !ancien) continue;
    // Points déjà tranchés : main courante Trackforce (seul outil employé par le mémoire), effectif de 423 agents
    // de sécurité (faux, jamais imprimé).
    if (jamaisReposee(e)) continue;
    const morceaux = e.valeur_retenue.split(';').map((x) => normTxt(x).replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 4);
    if (morceaux.some((m) => t.includes(m))) {
      // Main courante : le mémoire n'emploie que Trackforce (Vigicom figure dans un ancien mémoire).
      // Nom et prénom en capitales (« ATTOU NESRINE ») : prénom en minuscules (« ATTOU Nesrine »).
      const valeur = e.cle === 'logiciel_main_courante' ? 'Trackforce (Vigicom cité dans un ancien mémoire)'
        : e.valeur_retenue.replace(/^([A-ZÀ-Ý][A-ZÀ-Ý'-]+) ([A-ZÀ-Ý])([A-ZÀ-Ý-]+)$/, (_m, n: string, p: string, r: string) => `${n} ${p}${r.toLowerCase()}`);
      out.push(`Confirmer ${e.libelle.charAt(0).toLowerCase()}${e.libelle.slice(1)} — valeur utilisée dans le mémoire : ${valeur} (${e.source_retenue}, ${e.date_retenue})`);
    }
  }
  return out;
}

/**
 * Question à GSS sur un délai chiffré qui ne se pose pas (cstb 221, Grenoble : « GSS confirme-t-elle un délai maximal de
 * 60 minutes pour l'arrivée de l'agent d'astreinte en cas d'absence imprévue ? ») : délai chiffré absent du DCE, posé pour
 * un marché hors Normandie (les délais normands de GSS n'y sont jamais repris), ou simple confirmation d'un délai déjà
 * tranché au registre de GSS. Une question sur un délai que le DCE demande (« délai moyen maximum pour intervenir ») reste.
 */
export function questionDelaiInapplicable(question: string, dce: string, horsNormandie: boolean): boolean {
  const q = String(question || '');
  if (!/d[ée]lai|arriv|intervien|interven|remplac|astreinte/i.test(q)) return false;
  // Proposition calculée sans modèle (dimensionnement : « Intervenant rondier : 4 titulaires pour 96 h par semaine, base de
  // 1 607 heures par an », T9N-2) : jamais une question de délai.
  if (/^Proposition à valider\b|^Le cahier des charges prévoit des rondes ponctuelles/i.test(q)) return false;
  // Question des sites mixtes (le délai normand de GSS rappelé, le délai hors Normandie demandé) : toujours posée.
  if (/^Marché en partie hors Normandie\b/i.test(q)) return false;
  // Délai demandé par un critère du cadre et laissé à compléter (T5N-2) : la question attend la réponse de GSS, toujours posée.
  if (/quel délai GSS annonce-t-elle pour/i.test(q)) return false;
  // Un volume horaire (« 96 h par semaine », « 1 607 heures par an ») n'est pas un délai.
  const valeurs = [...q.matchAll(/(?<![\d,.])(\d+)\s*(minutes?|min\b|mn\b|heures?|h\b)(?!\s*(?:par\s+(?:semaine|an|mois|jour|ETP)|\/\s*(?:sem|an|mois|j)))/gi)].map((m) => ({ n: m[1], min: /^m/i.test(m[2]) }));
  if (!valeurs.length) return false;
  const d = normTxt(dce).replace(/\s+/g, ' ');
  const dansDce = (v: { n: string; min: boolean }) => new RegExp(`(?<![\\d,.])${v.n}\\s*(?:${v.min ? 'minutes?|min|mn' : 'heures?|h'})\\b`).test(d);
  const absents = valeurs.filter((v) => !dansDce(v));
  if (!absents.length) return false;
  if (horsNormandie) return true;
  if (!/confirm|valid/i.test(q)) return false;
  const registre = charger().registre.filter((e) => e.categorie === 'delais').map((e) => normTxt(e.valeur_retenue || ''));
  return absents.every((v) => registre.some((r) => new RegExp(`(?<![\\d,.])${v.n}\\s*(?:${v.min ? 'minutes?|min|mn' : 'heures?|h'})\\b`).test(r)));
}

/** Départements cités en toutes lettres entre parenthèses (Normandie et départements les plus fréquents des DCE). */
const DEPARTEMENTS: Record<string, string> = { 'calvados': '14', 'eure': '27', 'manche': '50', 'orne': '61', 'seine maritime': '76', 'nord': '59', 'pas de calais': '62', 'somme': '80', 'oise': '60', 'aisne': '02', 'paris': '75', 'seine et marne': '77', 'yvelines': '78', 'essonne': '91', 'hauts de seine': '92', 'seine saint denis': '93', 'val de marne': '94', 'val d oise': '95', 'eure et loir': '28', 'sarthe': '72', 'mayenne': '53', 'ille et vilaine': '35', 'loiret': '45', 'marne': '51', 'bas rhin': '67', 'haut rhin': '68', 'rhone': '69', 'gironde': '33', 'loire atlantique': '44', 'isere': '38', 'bouches du rhone': '13', 'haute garonne': '31', 'herault': '34', 'alpes maritimes': '06', 'var': '83', 'moselle': '57', 'meurthe et moselle': '54', 'finistere': '29', 'morbihan': '56', 'cotes d armor': '22', 'maine et loire': '49', 'indre et loire': '37', 'loir et cher': '41', 'cher': '18', 'vienne': '86', 'charente maritime': '17' };

/** Lieu du marché (T7-COH-2) : sites du DCE, puis communes nommées, puis toutes les adresses ; « inconnu » sans indice. */
export type LieuMarche = { statut: 'normandie' | 'hors' | 'mixte' | 'inconnu'; normands: string[]; horsNormandie: string[]; source: string };

/** Communes de Normandie les plus citées (sites des marchés de GSS) et grandes villes hors Normandie, pour un DCE sans code postal. */
const COMMUNES_NORMANDES = ['Rouen', 'Le Havre', 'Caen', 'Cherbourg', 'Cherbourg-en-Cotentin', 'Évreux', 'Dieppe', 'Saint-Étienne-du-Rouvray',
  'Sotteville-lès-Rouen', 'Grand-Quevilly', 'Petit-Quevilly', 'Alençon', 'Vernon', 'Lisieux', 'Saint-Lô', 'Fécamp', 'Elbeuf', 'Mont-Saint-Aignan',
  'Louviers', 'Hérouville-Saint-Clair', 'Montivilliers', 'Bayeux', 'Granville', 'Argentan', 'Flers', 'Val-de-Reuil', 'Bois-Guillaume', 'Déville-lès-Rouen',
  'Maromme', 'Canteleu', 'Darnétal', 'Barentin', 'Yvetot', 'Bolbec', 'Lillebonne', 'Harfleur', "Gonfreville-l'Orcher", 'Honfleur', 'Deauville',
  'Trouville-sur-Mer', 'Coutances', 'Avranches', 'Bernay', 'Pont-Audemer', 'Gisors', 'Les Andelys', 'Vire', 'Falaise', 'Mondeville', 'Ouistreham',
  'Le Tréport', 'Grand-Couronne', 'Oissel', 'Isneauville', 'Petit-Couronne', 'Bihorel', 'Seine-Maritime', 'Calvados'];
const VILLES_HORS_NORMANDIE = ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes',
  'Reims', 'Toulon', 'Saint-Étienne', 'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Villeurbanne', 'Clermont-Ferrand', 'Le Mans', 'Aix-en-Provence', 'Brest',
  'Limoges', 'Amiens', 'Perpignan', 'Metz', 'Besançon', 'Orléans', 'Mulhouse', 'Boulogne-Billancourt', 'Montreuil', 'Saint-Denis', 'Argenteuil', 'Nancy',
  'Roubaix', 'Tourcoing', 'Nanterre', 'Vitry-sur-Seine', 'Créteil', 'Avignon', 'Poitiers', 'Versailles', 'Courbevoie', 'Colombes', 'Asnières-sur-Seine',
  'Aulnay-sous-Bois', 'Rueil-Malmaison', 'La Rochelle', 'Calais', 'Champigny-sur-Marne', 'Antibes', 'Béziers', 'Cannes', 'Saint-Maur-des-Fossés',
  'Dunkerque', 'Bourges', 'Ivry-sur-Seine', 'Quimper', 'Troyes', 'Chartres', 'Beauvais', 'Évry', 'Étampes', 'Fontainebleau', 'Melun', 'Meaux', 'Cergy',
  'Pontoise', 'Laval', 'Lorient', 'Vannes', 'Saint-Malo', 'Saint-Nazaire', 'Niort', 'Angoulême', 'Chambéry', 'Annecy', 'Belfort', 'Colmar', 'Arras',
  'Douai', 'Valenciennes', 'Compiègne', 'Soissons', 'Châlons-en-Champagne', 'Charleville-Mézières', 'Bayonne', 'Tarbes', 'Ajaccio', 'Bastia', 'Villejuif',
  'Thiais', 'Saint-Mandé', 'Neuilly-sur-Marne', 'Neuilly-sur-Seine', "Saint-Martin-d'Hères", 'Montrouge', 'Vincennes', 'Issy-les-Moulineaux', 'Puteaux',
  'Massy', 'Palaiseau', 'Saclay'];
const ADMIN_LIEU = /cedex|\bB\.?P\.?\s*\d|bo[îi]te postale|si[èe]ge|DREETS|DIRECCTE|DDETS|DRFIP|DGFIP|finances publiques|tribunal|cour administrative|cour d.appel|pr[ée]fecture|CNAPS|inspection du travail|URSSAF|tr[ée]sor|paierie|comptable|greffe|minist[èe]re/i;
/**
 * Expression d'une commune : accents et tirets libres, jamais le début d'un nom composé (« Saint-Étienne-du-Rouvray »).
 * `elision` : la commune peut suivre « d' » ou « l' » (« médiathèque d'Évreux », T9-COH-3), pour le lieu du marché seulement.
 */
function rxCommune(nom: string, elision = false): RegExp {
  const corps = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[aeiouc]/gi, (c) => ({ a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' } as Record<string, string>)[c.toLowerCase()] || c)
    .replace(/[- ]/g, "[-\u2011 ]+").replace(/'/g, "['’]");
  // Élision (« d'Évreux ») jamais lue dans le reste d'un nom composé (« Gonfreville-l'Orcher »).
  const avant = elision ? "(?<![\\wÀ-ÿ-])(?<!(?<!(?:^|[^\\wÀ-ÿ'’-])[dDlL])['’])" : "(?<![\\wÀ-ÿ'’-])";
  return new RegExp(`${avant}${corps}(?![\\wÀ-ÿ]|[-\u2011'’][A-Za-zÀ-ÿ]|[-\u2011 ]+(?:du|de|des|sur|sous|lès|les|lez|en)[- ][A-ZÀ-Ýa-zà-ÿ])`, 'gi');
}
/**
 * Formes contractées d'une commune à article (T2-COH-4) : « du Havre », « au Havre » pour « Le Havre » ; « des Andelys »,
 * « aux Andelys » pour « Les Andelys » ; « du Grand-Quevilly ». La commune est lue sans son article, après la contraction.
 */
function rxContractees(nom: string): RegExp[] {
  const m = /^(Le|Les)\s+(.+)$/.exec(nom);
  if (!m) return [];
  const corps = rxCommune(m[2]).source.replace(/^\(\?<!\[[^\]]*\]\)/, '');
  return [new RegExp(`(?<=(?<![\\wÀ-ÿ])(?:${m[1] === 'Le' ? 'du|au|Du|Au|DU|AU' : 'des|aux|Des|Aux|DES|AUX'})\\s+)${corps}`, 'g')];
}
const RX_NORMANDES = COMMUNES_NORMANDES.flatMap((n) => [{ nom: n, rx: rxCommune(n, true) }, ...rxContractees(n).map((rx) => ({ nom: n, rx }))]);
const RX_HORS = VILLES_HORS_NORMANDIE.flatMap((n) => [{ nom: n, rx: rxCommune(n, true) }, ...rxContractees(n).map((rx) => ({ nom: n, rx }))]);
/** Communes nommées hors adresse postale et hors adresse administrative (tribunal, préfecture…), avec leur nombre de citations. */
function communesNommees(texte: string): { normands: Map<string, number>; hors: Map<string, number> } {
  const compter = (liste: Array<{ nom: string; rx: RegExp }>) => {
    const out = new Map<string, number>();
    for (const { nom, rx } of liste) {
      for (const m of texte.matchAll(rx)) {
        if (!/^[A-ZÀ-Ý]/.test(m[0])) continue;                         // nom propre : « Lyon », « LYON », jamais « lyon »
        const debut = m.index || 0;
        const avant = texte.slice(Math.max(0, debut - 80), debut);
        if (/\d{5}\s*[–—,-]?\s*$/.test(avant)) continue;              // adresse postale : déjà lue par code postal
        // Nom de voie (« 12 rue de Paris », « route de Lyon ») : pas une commune.
        if (/\b(?:rue|avenue|av\.|boulevard|bd|route|chemin|place|quai|all[ée]e|cours|impasse|porte|gare|pont|square|esplanade)\s+(?:de\s+(?:la\s+)?|d['’]|du\s+|des\s+)?$/i.test(avant)) continue;
        // Adresse ou institution administrative (préfecture, siège, tribunal…) : pas le lieu du marché, sauf dans la phrase de
        // l'objet ou du lieu d'exécution, sans rôle administratif (T2-GEN-4 : « gardiennage de l'hôtel de la préfecture de
        // l'Eure … Évreux »).
        if (ADMIN_LIEU.test(avant.slice(-60)) || ADMIN_LIEU.test(texte.slice(debut + m[0].length, debut + m[0].length + 14))) {
          const phrase = (texte.slice(Math.max(0, debut - 240), debut).split(/[.!?\n]\s*/).pop() || '') + texte.slice(debut, debut + m[0].length + 60).split(/[.!?\n]/)[0];
          if (!PHRASE_SITE.test(phrase) || ROLE_ADMIN.test(phrase) || IDENTIFICATION_ACHETEUR.test(phrase) || /tribunal|cour d.appel|greffe|inspection du travail|CNAPS/i.test(phrase)) continue;
        }
        // Heure légale ou fuseau horaire (T9REG-2, T9-COH-3 : « heure de Paris », « (GMT+01:00) Paris, Bruxelles, Copenhague,
        // Madrid » des plateformes de dématérialisation) : pas le lieu du marché.
        if (/\b(?:heures?|fuseau(?:\s+horaire)?)(?:\s+(?:l[ée]gale|locale|officielle|de\s+r[ée]f[ée]rence))?\s+(?:de\s+)?$/i.test(avant)
          || /\(\s*(?:GMT|UTC)\s*(?:[+\u2212-]\s*\d{1,2}(?::\d{2})?)?\s*\)\s*$|\bEurope\s*\/\s*$/i.test(avant)) continue;
        out.set(nom, (out.get(nom) || 0) + 1);
      }
    }
    return out;
  };
  return { normands: compter(RX_NORMANDES), hors: compter(RX_HORS) };
}

// ─── Lots du mémoire (accord-cadre en plusieurs lots) ─────────────────────────────────────────────────────────

/** Valeur texte d'un champ de l'analyse (jamais un objet, ni une mention « non renseigné »). */
function textePropre(v: unknown): string {
  if (v === null || v === undefined || typeof v === 'object') return '';
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 400 || /^\s*(?:non[\s-]+(?:communiqu|pr[ée]cis|d[ée]termin|renseign|disponible|identifi|mentionn|indiqu|connu|sp[ée]cifi|fourni|trouv)|inconnu|ind[ée]termin|undefined|null|[-—–?]+\s*$)/i.test(t)) return '';
  return t;
}

/**
 * Marché déclaré non alloti (T2-COH-5) : seulement par une AFFIRMATION (« le marché n'est pas alloti », « marché non alloti »,
 * « Lot unique : … », « consultation à lot unique », « justification du non-allotissement »), jamais par une mention dans un
 * autre sens (« une offre pour un lot unique, pour plusieurs lots ou pour l'ensemble des lots », « chaque lot fera l'objet
 * d'un marché unique », « non allotie en 2022 »).
 */
const RX_NON_ALLOTI = /(?<!en cas de )\bnon[- ]allotie?s?\b(?!\s+(?:en|jusqu|depuis|lors|avant)\b)|(?:n['’]est|ne sera)\s+pas\s+(?:d[ée]compos[ée]e?|divis[ée]e?|r[ée]partie?|scind[ée]e?)\s+en\s+lots|(?:fait|font)\s+l['’]objet\s+d['’]un\s+lot\s+unique|lot\s*(?:n\s*[°o.]?\s*)?1\s*[-–—:]\s*lot\s+unique|structure\s*:?\s+lot\s+unique|(?:march[ée]|accord[- ]cadre|consultation|proc[ée]dure)\s+(?:n['’]est|ne sera|ne fait l['’]objet d['’]aucun)\s+(?:pas\s+)?allot|(?<!en cas de )(?<!en cas d['’])\bnon[- ]allotissement\b|ne fait pas l.objet d.un allotissement|(?:il n['’]y a )?pas d.allotissement|sans allotissement|(?:^|[\s(])lot unique\s*:|(?:comporte|comprend|compos[ée]e?\s+d['’]|constitu[ée]e?\s+d['’]|en|[àa])\s+(?:un\s+)?lot unique(?![^.;]{0,30}(?:plusieurs lots|ensemble des lots))/i;

/**
 * Lots du mémoire (règle partagée par la question à GSS et par le lieu du marché) : pièces du DCE dont le nom porte un seul
 * numéro de lot (cadre de réponse « Lot 1 »), sinon tous les lots de l'analyse avec la question « pour quel lot ce mémoire
 * est-il remis ? ».
 */
export function lotsDuMemoireDce(analyse: any, dce: string, propre: (v: unknown) => string = textePropre): { lots: string[]; question?: string } {
  const plat = String(dce || '').replace(/\s+/g, ' ');
  const lots: Array<{ num: string; perimetre: string }> = [];
  for (const l of Array.isArray(analyse?.lots) ? analyse.lots : []) {
    // « lot » et « n° / no / n. » facultatifs l'un sans l'autre (T1-COH-2 : « N°1 » lu « lot N ») ; une lettre suivie de
    // « ° » n'est jamais un lot.
    const m = /^(?:lots?\s*)?(?:n\s*[°ºo.]\s*(?=\d))?(\d{1,3}|[A-Z])(?![\wÀ-ÿ°º/])/i.exec(propre(typeof l === 'object' ? l?.num : l));
    if (m && !lots.some((x) => x.num === m[1].toUpperCase())) lots.push({ num: m[1].toUpperCase(), perimetre: propre(typeof l === 'object' ? l?.perimetre : '') });
  }
  // Marché déclaré non alloti : aucun lot, même si l'analyse en a relevé plusieurs (seulement sur une affirmation).
  if (RX_NON_ALLOTI.test(plat)) return { lots: [] };
  if (lots.length <= 1) return { lots: lots.map((x) => x.num) };
  // Pièces du DCE : numéros de lot écrits dans leur nom.
  const noms = [...String(dce || '').matchAll(/\n\n--- (.+?) ---\n|===== PIÈCE : (.+?) =====/g)].map((m) => m[1] || m[2] || '');
  const numeros = (nom: string): string[] => {
    // Numéro de lot, jamais une référence de contrat (« lots 54.6.09 et 54.6.10 »).
    const m = /\blots?\s*(?:n\s*[°o.]?\s*)?(\d{1,3})(?!\d|[.,]\d)((?:\s*(?:,|et|&|-|à)\s*(?:(?:lot\s*)?n\s*[°o.]?\s*)?\d{1,3}(?!\d|[.,]\d))*)/i.exec(nom.replace(/_/g, ' '));
    return m ? [...`${m[1]}${m[2] || ''}`.matchAll(/\d{1,3}/g)].map((x) => x[0]) : [];
  };
  const memoireCommun = noms.find((n) => /cadre|m[ée]moire/i.test(n) && numeros(n).length > 1);
  if (memoireCommun) return { lots: numeros(memoireCommun) };
  const seuls = [...new Set(noms.map(numeros).filter((x) => x.length === 1).map((x) => x[0]))];
  if (seuls.length === 1) return { lots: seuls };
  const parLot = /offre distincte pour chaque lot|offres? s[ée]par[ée]es? pour chacun des lots|m[ée]moire technique distinct[^.]{0,40}chaque lot|cadre de r[ée]ponse par lot|un m[ée]moire (?:technique )?par lot/i.test(plat);
  const liste = lots.map((x) => `${x.num}${x.perimetre ? ` : ${x.perimetre.length > 90 ? `${x.perimetre.slice(0, 90).replace(/\s+\S*$/, '')}…` : x.perimetre}` : ''}`).join(' ; ');
  return { lots: lots.map((x) => x.num), question: `Le DCE comporte ${lots.length} lots (${liste})${parLot ? ' et le RC demande une offre distincte par lot' : ''} : pour quel lot ce mémoire est-il remis ?` };
}

/**
 * Périmètre du seul lot du mémoire (T2-GEN-5) : quand l'analyse relève plusieurs lots et que le mémoire n'en vise qu'un, le
 * DCE privé des passages propres aux autres lots (de « Lot n : » au lot suivant, à l'article ou à la pièce suivante) et
 * l'analyse privée des autres lots et de leurs sites. null : marché non alloti, lot du mémoire inconnu, ou rien à retirer.
 */
export function perimetreDuLot(analyse: any, dce: string): { analyse: any; dce: string; lot: string } | null {
  if (!Array.isArray(analyse?.lots) || analyse.lots.length < 2) return null;
  const r = lotsDuMemoireDce(analyse, dce);
  if (r.lots.length !== 1 || r.question) return null;
  const lot = r.lots[0];
  const TETE = /(?:^|(?<=[.;]\s{1,3}))(?:[-•▪*]\s*)?lot\s*(?:n\s*[°ºo.]?\s*)?(\d{1,3}|[A-Z])(?![\wÀ-ÿ°º/])\s*(?:[:–—-]|\()/gi;
  const RUPTURE = /^\s*(?:--- .+ ---|===== PIÈCE|(?:ARTICLE|Article|CHAPITRE|Chapitre|TITRE|Titre|PARTIE|Partie)\b|\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZÉÈ])/;
  let courant: string | null = null;
  let retire = false;
  const lignes: string[] = [];
  for (const ligne of String(dce || '').split('\n')) {
    if (RUPTURE.test(ligne)) courant = null;
    const coupes = [...ligne.matchAll(TETE)].map((m) => ({ pos: m.index || 0, num: m[1].toUpperCase() }));
    if (!coupes.length) {
      if (courant && courant !== lot) { retire = true; continue; }
      lignes.push(ligne);
      continue;
    }
    let garde = coupes[0].pos > 0 && (!courant || courant === lot) ? ligne.slice(0, coupes[0].pos) : '';
    coupes.forEach((c, i) => {
      courant = c.num;
      const morceau = ligne.slice(c.pos, i + 1 < coupes.length ? coupes[i + 1].pos : ligne.length);
      if (courant === lot) garde += morceau; else retire = true;
    });
    lignes.push(garde);
  }
  if (!retire) return null;
  const texte = lignes.join('\n');
  // Sites de l'analyse : ceux que le périmètre du lot cite (code postal ou nom), et les lots réduits au lot du mémoire.
  const cite = (site: any) => {
    const t = `${textePropre(site?.name)} ${textePropre(site?.address)}`;
    const codes = t.match(/\b\d{5}\b/g);
    if (codes) return codes.some((c) => texte.includes(c));
    const nom = textePropre(site?.name);
    return !nom || texte.toLowerCase().includes(nom.toLowerCase());
  };
  const a = { ...analyse, lots: analyse.lots.filter((l: any) => String(textePropre(typeof l === 'object' ? l?.num : l)).replace(/\D/g, '') === lot.replace(/\D/g, '') || String(textePropre(typeof l === 'object' ? l?.num : l)).toUpperCase().endsWith(lot)) };
  if (Array.isArray(analyse.sites)) a.sites = analyse.sites.filter(cite);
  return { analyse: a, dce: texte, lot };
}

const cacheLieux = new Map<string, LieuMarche>();
/**
 * Lieu du marché, dans l'ordre (T7-COH-2) : 1) les sites du DCE par code postal (adresses administratives et adresse
 * d'identification de l'acheteur exclues) ; 2) sans site par code postal, les communes et départements nommés (« Métropole
 * de Lyon … Lyon 3e », « site de Caen ») ; 3) toutes les adresses du DCE (mairie « BP 109 / 91152 ETAMPES CEDEX ») ; 4) sinon
 * « inconnu » : aucun délai normand n'est promis et la question est posée à GSS (questionLieuInconnu).
 */
export function lieuDuMarche(analyse: any, dce: string): LieuMarche {
  const cle = `${JSON.stringify(analyse || {})}\u0000${dce || ''}`;
  const connu = cacheLieux.get(cle);
  if (connu) return connu;
  const r = calculerLieu(analyse, dce);
  if (cacheLieux.size > 8) cacheLieux.clear();
  cacheLieux.set(cle, r);
  return r;
}
function calculerLieu(analyse: any, dce: string): LieuMarche {
  // Mémoire d'un seul lot d'un accord-cadre (T2-GEN-5) : le lieu de ce lot, s'il est lisible ; sinon celui de tout le marché.
  const lot = perimetreDuLot(analyse, dce);
  if (lot) {
    const l = calculerLieuBrut(lot.analyse, lot.dce);
    if (l.statut !== 'inconnu') return { ...l, source: `${l.source}, lot ${lot.lot}` };
  }
  return calculerLieuBrut(analyse, dce);
}
function calculerLieuBrut(analyse: any, dce: string): LieuMarche {
  const sites = sitesDuMarche(analyse, dce);
  if (sites.normands.length || sites.horsNormandie.length) {
    return { statut: sites.mixte ? 'mixte' : sites.horsNormandie.length ? 'hors' : 'normandie', normands: sites.normands, horsNormandie: sites.horsNormandie, source: 'sites du DCE (codes postaux)' };
  }
  const texte = `${JSON.stringify(analyse || {})}\n${String(dce || '')}`.replace(/\\n/g, '\n');
  // Département nommé entre parenthèses après la commune (« Neuilly-sur-Marne (Seine-Saint-Denis) », « Strasbourg (Bas-Rhin) »).
  const deps: string[] = [];
  for (const m of texte.matchAll(/\(\s*([A-ZÉÈa-zéè][A-Za-zÀ-ÿ' -]{2,30}?)\s*\)/g)) {
    const d = DEPARTEMENTS[m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s'-]+/g, ' ').trim()];
    if (d) deps.push(d);
  }
  const noms = communesNommees(texte);
  const nN = [...noms.normands.values()].reduce((a, b) => a + b, 0) + deps.filter((d) => NORMANDIE.includes(d)).length;
  const nH = [...noms.hors.values()].reduce((a, b) => a + b, 0) + deps.filter((d) => !NORMANDIE.includes(d)).length;
  if (nN || nH) {
    const normands = [...noms.normands.keys()];
    const hors = [...noms.hors.keys()];
    // Les deux régions citées : la région largement majoritaire l'emporte ; sinon le marché est traité comme mixte
    // (aucun délai normand promis pour tout le marché).
    const statut = nN && nH ? (nN >= 3 * nH ? 'normandie' : nH >= 3 * nN ? 'hors' : 'mixte') : nN ? 'normandie' : 'hors';
    return { statut, normands, horsNormandie: hors, source: 'communes nommées dans le DCE' };
  }
  // Toutes les adresses du début du DCE, administratives comprises (etampes1 : seule l'adresse postale de la mairie), comme
  // avant T7-COH-2.
  const debut = `${JSON.stringify(analyse || {})} ${String(dce || '').slice(0, 40000)}`;
  const UNITE = /^(?:m[²³23]?|km|ha|h|heures?|€|eur|euros?|ht|ttc|personnes?|visiteurs?|spectateurs?|places?|agents?|salari[ée]s?|habitants?|usagers?|[ée]l[èe]ves?|[ée]tudiants?|passages?|entr[ée]es?|lits?|logements?|v[ée]hicules?)$/i;
  // L'adresse d'identification de l'acheteur ou une adresse administrative ne tranche jamais seule (T1-GEN-4 : acheteur à
  // Rouen, site écrit autrement à Gennevilliers) : seulement si sa commune est aussi celle nommée dans l'objet du marché
  // (etampes1 : « … de la Ville d'Étampes », adresse « 91152 ETAMPES CEDEX »).
  const objet = cleCommune2(`${analyse?.projectTitle || ''} ${analyse?.objet || ''} ${(/objet[^\n]{0,200}/i.exec(String(dce || '')) || [''])[0]}`);
  // Commune entière (« 76084 LE HAVRE CEDEX » → « LE HAVRE »), comparée à l'objet avec et sans son article (T2-COH-4 : « Ville
  // du Havre »).
  const retenu = (m: RegExpMatchArray, commune: string) => {
    if (!adresseAdministrative(debut, m.index || 0, (m.index || 0) + m[0].length)) return true;
    const k = cleCommune2(commune);
    return k.length >= 3 && [k, k.replace(/^(?:le|la|les) /, '')].some((v) => v.length >= 3 && ` ${objet} `.includes(` ${v} `));
  };
  const codes = [
    ...[...debut.matchAll(/\b(\d{2})\d{3}\s*(?:[–—,-]\s*)?([A-ZÉÈÀÂÎÔÛ][\wÀ-ÿ²³'’-]*(?:[ \t]+(?!CEDEX\b|Cedex\b|cedex\b)(?:[A-ZÉÈÀÂÎÔÛ][\wÀ-ÿ'’-]*|sur|sous|en|de|du|des|l[èe]s|la|le))*)/g)].filter((m) => !UNITE.test(m[2].split(/\s/)[0]) && retenu(m, m[2].replace(/\s+(?:sur|sous|en|de|du|des|l[èe]s|la|le)$/i, ''))).map((m) => m[1]),
    ...[...debut.matchAll(/\(\s*(\d{2})\d{3}\s*\)/g)].filter((m) => retenu(m, '')).map((m) => m[1]),
  ].filter((d) => Number(d) >= 1 && Number(d) <= 95);
  if (codes.length) {
    const normands = codes.filter((d) => NORMANDIE.includes(d)).length;
    return { statut: normands < codes.length / 2 ? 'hors' : 'normandie', normands: [], horsNormandie: [], source: 'adresses du DCE (codes postaux)' };
  }
  return { statut: 'inconnu', normands: [], horsNormandie: [], source: 'aucun lieu trouvé dans le DCE' };
}

/**
 * Vrai si le marché se situe hors de Normandie (zone d'intervention habituelle de GSS), ou s'il est à sites mixtes, ou si
 * le DCE ne permet pas de situer le site (T7-COH-2 : sans code postal, les délais normands étaient promis à Lyon ou Lille ;
 * le doute ne promet plus aucun délai normand, et la question est posée à GSS par questionLieuInconnu).
 */
export function marcheHorsNormandie(analyse: any, dce: string): boolean {
  return lieuDuMarche(analyse, dce).statut !== 'normandie';
}

/** Question à GSS quand le DCE ne permet pas de situer le site du marché (une seule, posée dans les consultations). */
export function questionLieuInconnu(analyse: any, dce: string): string[] {
  if (!String(dce || '').trim() || lieuDuMarche(analyse, dce).statut !== 'inconnu') return [];
  return ["Le DCE ne donne pas la commune du site : le marché est-il en Normandie ? En attendant votre réponse, le mémoire ne promet aucun délai d'intervention normand de GSS."];
}

const NORMANDIE = ['14', '27', '50', '61', '76'];

/** Mot qui suit ou précède un code postal sans être une commune (pays, mention postale, libellé de tableau, T8CS-2, T8REG-1). */
const PAS_COMMUNE = /^(?:france|cedex|cs|tsa|b\.?p\.?|t[ée]l\.?|t[ée]l[ée]phone|fax|courriel|e-?mail|mail|classification|adresse|site|lot|code|siret|siren|n°|num[ée]ro|horaires?|surface|superficie|effectifs?|nombre)$/i;
const UNITE_CP = /^(?:m[²³23]?|km|ha|h|heures?|€|eur|euros?|ht|ttc|personnes?|visiteurs?|spectateurs?|places?|agents?|salari[ée]s?|habitants?|usagers?|[ée]l[èe]ves?|[ée]tudiants?|passages?|entr[ée]es?|lits?|logements?|v[ée]hicules?)$/i;

/** Clé d'une commune (accents, tirets, apostrophes, « St ») : même règle que cleCommune de memoire_type.ts. */
function cleCommune2(v: string): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`\u2011-]/g, ' ')
    .replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Commune écrite en capitales mise en casse de nom propre (« LE HAVRE » → « Le Havre », « SAINT-ETIENNE-DU-ROUVRAY » → « Saint-Etienne-du-Rouvray »). */
function casseCommune(c: string): string {
  return c.toLowerCase().split(/([ '’-])/).map((w, i, t) => {
    if (!w || /^[ '’-]$/.test(w)) return w;
    if (i > 0 && (/^(?:de|du|des|sur|sous|lès|les|lez|en|et|aux|au|la|le)$/.test(w) || (/^[dl]$/.test(w) && /['’]/.test(t[i + 1] || '')))) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

/**
 * Commune lue à côté d'un code postal, propre (T8CS-2, T8REG-1, T8-COH-3) : espaces autour des traits d'union retirés
 * (« Mont -Saint-Aignan »), mention postale retirée (« Cedex », « Tél. »), jamais un pays ni un libellé (« France »,
 * « Classification »), écrite comme le DCE l'écrit en minuscules ailleurs (« Le Grand-Quevilly »), sinon en casse de nom
 * propre. '' si ce n'est pas une commune.
 */
export function communeLisible(brut: string, dce = ''): string {
  let c = String(brut || '').replace(/[ \t]*[-\u2011][ \t]*/g, '-').replace(/\s+/g, ' ').trim()
    .replace(/\s+(?:cedex|t[ée]l|tel|fax|courriel|mail|et|pour|france)\b.*$/i, '').replace(/\s+(?:le|la|les)\s+(?=[a-zà-ÿ\d]).*$/, '').replace(/[\s,;:.-]+$/, '').trim();
  const premier = c.split(/[ -]/)[0] || '';
  if (c.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 3 || PAS_COMMUNE.test(premier) || UNITE_CP.test(premier) || /\d/.test(c)) return '';
  if (c === c.toUpperCase()) {
    // Graphie du DCE en casse mixte (« Le Grand-Quevilly »), sinon casse de nom propre.
    // (chaque mot plein avec sa majuscule : jamais « Le grand-quevilly » écrit ainsi par erreur dans le DCE).
    const mixte = [...String(dce || '').matchAll(rxCommune(c))].map((m) => m[0])
      .find((x) => x !== x.toUpperCase() && x.split(/[ '’-]/).filter(Boolean).every((w, i) => /^[A-ZÀ-Ý]/.test(w) || (i > 0 && /^(?:de|du|des|sur|sous|lès|les|lez|en|et|aux|au|la|le|d|l)$/.test(w))));
    // Graphie officielle d'une commune connue (« LE GRAND QUEVILLY » → « Le Grand-Quevilly »).
    const connue = [...COMMUNES_NORMANDES, ...VILLES_HORS_NORMANDIE].find((k) => [cleCommune2(k), `le ${cleCommune2(k)}`].includes(cleCommune2(c)));
    c = mixte || (connue ? `${cleCommune2(c).startsWith('le ') && !cleCommune2(connue).startsWith('le ') ? 'Le ' : ''}${connue}` : casseCommune(c));
  }
  return c;
}

/**
 * Communes lues par code postal sur une même ligne : « 76000 Rouen », « 93330 – Neuilly-sur-Marne », et « Fontainebleau
 * 77300 France » (commune écrite avant le code, pays après). Jamais le mot de la ligne suivante (« à DIEPPE 76200 ⏎
 * Classification établissement », ca_normandie), jamais un identifiant d'adresse web (« jsessionid=13653C8FC4… »).
 */
export function communesParCodePostal(texte: string, dce = texte): Array<{ code: string; commune: string; debut: number; fin: number }> {
  const out: Array<{ code: string; commune: string; debut: number; fin: number }> = [];
  const SUITE = String.raw`[A-Za-zÀ-ÿ'’]*(?:[ \t]*[-\u2011][ \t]*[A-Za-zÀ-ÿ'’]+)*`;
  const MOT = String.raw`[A-Za-zÀ-ÿ'’]${SUITE}`;
  // Jamais le numéro d'un tri postal (« CS 31402 », « BP 21 », « TSA 70011 », « SP 51000 », T9REG-1) : ce n'est pas un code postal.
  // Code postal collé (« 14460 ») ou espacé (« 14 460 », T1-GEN-4), jamais un groupe de milliers (« 1 214 460 »).
  const rx = new RegExp(String.raw`(?<![=/?&#.\d])(?<!(?<![A-Za-zÀ-ÿ])(?:CS|C\.S\.|BP|B\.P\.?|TSA|SP|cs|bp|tsa)[ \t]*(?:n°[ \t]*)?)\b(\d{5}|(?<!\d[ \u00a0\u202f])\d{2}[ \u00a0\u202f]\d{3})\b(?![\d]|[ \u00a0\u202f]\d{3}|[,.]\d)[ \t]*(?:[–—,-][ \t]*)?([A-ZÉÈÀÂÎÔÛ]${SUITE}(?:[ \t]+(?!cedex|CEDEX|Cedex)${MOT}){0,4})?`, 'g');
  for (const m0 of String(texte || '').matchAll(rx)) {
    const espace = /\D/.test(m0[1]);
    const m = [m0[0], m0[1].replace(/\D/g, ''), m0[2]] as unknown as RegExpMatchArray;
    m.index = m0.index;
    const debut = m.index || 0;
    let commune = m[2] && !UNITE_CP.test(m[2].split(/\s/)[0]) ? communeLisible(m[2], dce) : '';
    // Tableau (une cellule par ligne : « 92230 | ⏎ Gennevilliers | ») : la ligne du code ne porte que lui, la commune est
    // la cellule suivante.
    const finLigne = String(texte).slice(debut + m0[0].length).split('\n')[0];
    const debutLigne = String(texte).slice(Math.max(0, debut - 80), debut).split('\n').pop() || '';
    if (!commune && !m[2] && /^[\s|]*$/.test(finLigne) && /^[\s|]*$/.test(debutLigne)) {
      const suivante = (String(texte).slice(debut + m0[0].length + finLigne.length + 1).split('\n').find((l) => l.replace(/[\s|]/g, '')) || '').replace(/^[\s|]+|[\s|]+$/g, '');
      if (/^[A-ZÀ-Ý]/.test(suivante) && suivante.split(/\s+/).length <= 5) commune = communeLisible(suivante, dce);
    }

    if (!commune && !(m[2] && UNITE_CP.test(m[2].split(/\s/)[0]))) {
      // Commune écrite avant le code, sur la même ligne (« Adresse : Fontainebleau 77300 France », « à DIEPPE 76200 »).
      const ligne = String(texte).slice(Math.max(0, debut - 80), debut).split('\n').pop() || '';
      const av = new RegExp(String.raw`([A-ZÀ-Ý]${SUITE}(?:[ \t]+${MOT}){0,3})[ \t,]*$`).exec(ligne);
      if (av) {
        // Seuls les derniers mots écrits comme un nom de commune (majuscule ou particule : « à DIEPPE » → DIEPPE, « Sa
        // superficie sera d'environ 15000 » → rien), après le nom du site ou de la voie (« Château de Fontainebleau » → Fontainebleau).
        const PARTICULE = /^(?:de|du|des|la|le|les|sur|sous|lès|lez|en|[dl]['’]\S*)$/;
        const LIEU = /^(?:ch[âa]teau|parc|site|h[ôo]tel|mairie|centre|campus|b[âa]timent|lyc[ée]e|coll[èe]ge|[ée]cole|universit[ée]|domaine|mus[ée]e|palais|tribunal|cour|maison|r[ée]sidence|immeuble|rue|avenue|boulevard|place|chemin|route|all[ée]e|quai|impasse|adresse)$/i;
        let mots = av[1].split(/[ \t]+/);
        let k = mots.length;
        while (k > 0 && (/^[A-ZÀ-Ý]/.test(mots[k - 1]) || PARTICULE.test(mots[k - 1])) && !LIEU.test(mots[k - 1])) k--;
        mots = mots.slice(k);
        while (mots.length && PARTICULE.test(mots[0])) mots.shift();
        // Nom de voie écrit juste avant le code (T9REG-2, T9-COH-3 : « 42 boulevard Jourdan, 75014 ⏎ Paris » → jamais
        // « Jourdan ») : les mots retenus suivent un type de voie (« boulevard », « rue de la », « place du »), ou finissent
        // par une mention postale (« … CS », « … BP ») : ce n'est pas une commune.
        const tous = av[1].split(/[ \t]+/);
        const avantMots = `${ligne.slice(0, av.index)}${tous.slice(0, tous.length - mots.length).join(' ')} `;
        const VOIE = /(?:^|[^A-Za-zÀ-ÿ])(?:rue|ruelle|avenue|av\.?|boulevard|bd|bld|place|pl\.|chemin|ch\.|route|rte|all[ée]e|quai|impasse|imp\.|cours|square|esplanade|parvis|passage|sentier|voie|cit[ée]|r[ée]sidence|lotissement|zone|za|zi|zac|rond-point|carrefour|mail|promenade|faubourg|hameau|lieu-dit)\s+(?:(?:de|du|des|la|le|les|d['’]|l['’])\s*)*$/i;
        if (mots.length && (VOIE.test(avantMots) || /^(?:CS|BP|B\.P\.?|TSA|SP)$/i.test(mots[mots.length - 1]))) mots = [];
        commune = mots.length ? communeLisible(mots.join(' '), dce) : '';
      }
    }
    // Code espacé : seulement une commune connue, ou écrite après le code dans une adresse (voie, « adresse »), jamais
    // « 15 000 Visiteurs » ni « Total 40 000,00 € ».
    if (espace && commune && !(m[2] && ([...COMMUNES_NORMANDES, ...VILLES_HORS_NORMANDIE].some((k) => cleCommune2(k) === cleCommune2(commune))
      || /(?:rue|avenue|boulevard|bd|route|chemin|place|quai|all[ée]e|impasse|cours|adresse|zone|za|zi|zac|parc)\b/i.test(debutLigne)))) commune = '';
    if (commune) out.push({ code: m[1], commune, debut, fin: debut + m[0].length });
  }
  return out;
}

/**
 * Sites du marché par code postal DISTINCT (et non par occurrence), en Normandie et hors Normandie. Une adresse postale
 * administrative n'est pas un site : « Cedex », boîte postale, siège, administrations (rouen_univ : « DREETS des pays de
 * la Loire … 44042 Nantes Cedex 1 »). `mixte` : au moins un site normand et au moins un site hors Normandie.
 */
export function sitesDuMarche(analyse: any, dce: string): { normands: string[]; horsNormandie: string[]; mixte: boolean } {
  const r = sitesParCodePostal(analyse, dce);
  return { normands: r.normands, horsNormandie: r.horsNormandie, mixte: r.mixte };
}

/**
 * Adresse administrative, jamais un site du marché (T1-GEN-8 : une seule règle pour villesDuMarche, sitesParCodePostal et
 * calculerLieu) : tribunal, greffe, voies de recours, Cedex, CS / BP / TSA, facturation, comptable, trésorerie, siège,
 * administrations ; et l'adresse d'identification de l'acheteur (« Pouvoir adjudicateur : … 93100 Montreuil »).
 */
const ADMIN_ADRESSE = /tribunal administratif|voies? de recours|factur|cedex|(?<![A-Za-zÀ-ÿ])(?:BP|B\.P\.?)\s*(?:n°\s*)?\d|bo[îi]te postale|si[èe]ge|DREETS|DIRECCTE|DDETS|DRFIP|DGFIP|finances publiques|tribunal|cour administrative|cour d.appel|voies? de recours|introduction des recours|greffe|pr[ée]fecture|CNAPS|inspection du travail|URSSAF|tr[ée]sor|paierie|comptable|factur|minist[èe]re/i;
const IDENTIFICATION_ACHETEUR = /(?:pouvoir adjudicateur|acheteur|ma[îi]tre d.ouvrage|entit[ée] adjudicatrice|personne publique)\s*:|(?:nom et adresse|identification|coordonn[ée]es|adresse)\s+(?:officiel(?:le)?s?\s+)?(?:du|de l.|de la)\s*(?:pouvoir adjudicateur|acheteur|organisme|entit[ée]|personne publique)/i;
// Un numéro CS ou TSA accompagne souvent l'adresse même du site (« Hôtel de Ville … CS 31402 76037 Rouen », T9REG-1) : seuls
// Cedex et la boîte postale marquent une adresse postale.
const ADMIN_POSTALE = /cedex|(?<![A-Za-zÀ-ÿ])(?:BP|B\.P\.?)\s*(?:n°\s*)?\d|bo[îi]te postale/i;
/** Rôle administratif d'une adresse (recours, facturation, paiement, siège déclaré) : jamais un site (T2-GEN-4). */
const ROLE_ADMIN = /tribunal administratif|cour administrative|voies? de recours|introduction des recours|instance charg[ée]e des proc[ée]dures de recours|greffe du tribunal administratif|factur|comptable|(?<![A-Za-z])SGC(?![A-Za-z])|paiements?|mandatement|ordonnateur|tr[ée]sor(?:erie)?|paierie|dont le si[èe]ge|ayant (?:son|leur) si[èe]ge|si[èe]ge(?:\s+social|\s+administratif)?\s*:|domicili[ée]/i;
/** Nom d'une institution qui a d'ordinaire une adresse administrative (communes imprimées des sites, hors phrase de site). */
const INSTITUTION_ADMIN = /si[èe]ge|finances publiques|DGFIP|DRFIP/i;
/**
 * Phrase qui décrit l'objet ou le lieu d'exécution du marché (T2-GEN-4) : l'adresse qu'elle cite est celle d'un site, même
 * quand le site est un siège ou une administration.
 */
const PHRASE_SITE = /a pour objet|porte sur|objet du march[ée]|(?<![\p{L}])objet\s*:|lieux? d['’]ex[ée]cution|lieux? de (?:la )?prestation|lieux? d['’]intervention|gardiennage|surveillance|s[ée]curit[ée] (?:des|du|de la|de l['’])|s[ûu]ret[ée] (?:des|du|de la|de l['’])|accueil (?:des|du|de la|de l['’])|(?<![\p{L}])sites? (?:concern[ée]s?|du march[ée]|gard[ée]s?|surveill[ée]s?|[àa] surveiller|suivants?)|prestations? (?:sont|seront|est|sera) (?:ex[ée]cut|r[ée]alis|effectu|assur)/iu;
/**
 * `strict` (sites du lieu du marché, avec les administrations : tribunal, ministère, DREETS…) ; sinon (communes des sites
 * imprimées) seulement le siège, les recours, la facturation, le comptable et l'identification de l'acheteur, et, avec
 * `postale`, les adresses Cedex / CS / BP (ca_normandie : les tribunaux judiciaires sont les sites du marché).
 */
export function adresseAdministrative(texte: string, debut: number, fin: number, opts: { strict?: boolean; postale?: boolean } = { strict: true }): boolean {
  // Bloc d'adresse : les deux lignes qui précèdent, jamais au-delà de la phrase précédente (« Acheteur : Ministère, 75007
  // Paris. Lieu d'exécution : site de Rouen (76000) » : Rouen est un site).
  const avant = String(texte || '').slice(Math.max(0, debut - 200), debut).split('\n').slice(-3).join(' ').slice(-140).split(/(?<![A-Z]\.?[A-Z]?)[.;!?]\s+(?=[A-ZÀ-Ý])/).pop() || '';
  const apres = String(texte || '').slice(fin, fin + 14);
  // Rôle administratif de l'adresse (recours, facturation, paiement, siège déclaré, identification de l'acheteur) : jamais un
  // site, quelle que soit la phrase.
  if (ROLE_ADMIN.test(apres) || ROLE_ADMIN.test(avant) || IDENTIFICATION_ACHETEUR.test(avant)) return true;
  // T2-GEN-4 : une adresse est administrative par son RÔLE dans la phrase, jamais par le seul nom de l'institution : le siège,
  // la préfecture, l'URSSAF ou le site d'un ministère GARDÉS (phrase de l'objet ou du lieu d'exécution : « gardiennage du siège
  // de la CAF … 50000 Saint-Lô », « Les prestations sont exécutées à l'Hôtel de Ville, … 76084 LE HAVRE CEDEX ») sont le site.
  if (PHRASE_SITE.test(avant)) return false;
  const rx = opts.strict ? ADMIN_ADRESSE : INSTITUTION_ADMIN;
  if (rx.test(apres) || rx.test(avant)) return true;
  if ((opts.strict || opts.postale) && (ADMIN_POSTALE.test(apres) || ADMIN_POSTALE.test(avant))) return true;
  return false;
}

/** Commune suivie de son département en chiffres entre parenthèses (« Colombelles (14) », « Aubagne (13) »), T1-GEN-4. */
export function communesParDepartement(texte: string): Array<{ dep: string; commune: string; debut: number; fin: number }> {
  const out: Array<{ dep: string; commune: string; debut: number; fin: number }> = [];
  const PAS_COMMUNE_DEP = /^(?:article|annexe|lot|chapitre|page|pi[èe]ce|tableau|figure|note|point|partie|section|titre|tome|niveau|cat[ée]gorie|type|classe|zone|b[âa]timent|bloc|salle|porte|poste|[ée]tage|code|phase|tranche|option|variante|cf|voir|art)$/i;
  const rx = /(?:(?<![A-Za-zÀ-ÿ])(à|a|de|d['’]|du|sur|lès|commune de|ville de|site de)\s*)?([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ'’]+(?:[ -](?:(?:sur|sous|en|de|du|des|la|le|les|l[èe]s|lez|aux?|et|d['’])|[A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ'’]+)){0,4})\s*\(\s*(0[1-9]|[1-8]\d|9[0-5])\s*\)(?!\s*(?:jours?|heures?|h\b|mois|ans?|ann[ée]es?|semaines?|minutes?|mn|min|%|€|euros?|fois|agents?|personnes?|postes?|exemplaires?|pages?))/g;
  for (const m of String(texte || '').matchAll(rx)) {
    const commune = m[2].trim();
    const premier = commune.split(/[ -]/)[0];
    // Jamais un nombre en lettres (« dans les QUINZE (15) jours »).
    if (PAS_COMMUNE_DEP.test(premier) || new RegExp(`^${RX_NOMBRE_LETTRES}$`, 'i').test(commune)) continue;
    const connue = [...COMMUNES_NORMANDES, ...VILLES_HORS_NORMANDIE].some((k) => cleCommune2(k) === cleCommune2(commune));
    if (!m[1] && !connue) continue;
    out.push({ dep: m[3], commune, debut: m.index || 0, fin: (m.index || 0) + m[0].length });
  }
  return out;
}

/** Sites du marché (sitesDuMarche) avec le code postal de chaque site hors Normandie. */
function sitesParCodePostal(analyse: any, dce: string): { normands: string[]; horsNormandie: string[]; mixte: boolean; codesHors: Array<{ code: string; commune: string }> } {
  // Mémoire d'un seul lot (T2-GEN-5) : les sites de ce lot (sites et alerte hors zone d'un autre lot jamais repris).
  const lot = perimetreDuLot(analyse, dce);
  if (lot) {
    const r = sitesParCodePostalBrut(lot.analyse, lot.dce);
    if (r.normands.length || r.horsNormandie.length) return r;
  }
  return sitesParCodePostalBrut(analyse, dce);
}
function sitesParCodePostalBrut(analyse: any, dce: string): { normands: string[]; horsNormandie: string[]; mixte: boolean; codesHors: Array<{ code: string; commune: string }> } {
  const texte = `${JSON.stringify(analyse || {})} ${String(dce || '').slice(0, 40000)}`.replace(/\\n/g, '\n');
  const normands = new Map<string, string>();
  const hors = new Map<string, string>();
  const ajouter = (code: string, commune: string, debut: number, fin: number) => {
    const dep = code.slice(0, 2);
    if (Number(dep) < 1 || Number(dep) > 95) return;
    // Contexte administratif (« Cedex », bloc d'adresse du tribunal, du comptable…) et adresse d'identification de l'acheteur
    // (« Pouvoir adjudicateur : … 93100 Montreuil », T7-COH-2) : pas un site (règle partagée, T1-GEN-8).
    if (adresseAdministrative(texte, debut, fin)) return;
    const c = commune.replace(/\s+(?:t[ée]l|tel|fax|courriel|mail|et|pour|le|la|les)\b.*$/i, '').replace(/\s+-/g, '-').trim();
    (NORMANDIE.includes(dep) ? normands : hors).set(code, c);
  };
  // « 76000 Rouen », « 93330 – Neuilly-sur-Marne »
  // Jamais un identifiant d'adresse web (« jsessionid=13653C8FC4… », ca_normandie) : la commune ne contient aucun chiffre.
  // Commune lue sur la ligne du code postal (« Fontainebleau 77300 France » : Fontainebleau, jamais « France », T8CS-2).
  for (const c of communesParCodePostal(texte, String(dce || ''))) ajouter(c.code, c.commune, c.debut, c.fin);
  // « Rouen (76000) », « Paris (75013) »
  for (const m of texte.matchAll(/([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ'’-]+(?:[ -][A-Za-zÀ-ÿ'’-]+){0,3})\s*\(\s*(\d{5})\s*\)/g)) {
    ajouter(m[2], m[1].split(/\s+(?:à|a|de|du|des)\s+/).pop() || m[1], m.index || 0, (m.index || 0) + m[0].length);
  }
  // « Colombelles (14) », « l'entrepôt de Gennevilliers (92) » : département en chiffres (T1-GEN-4).
  for (const c of communesParDepartement(texte)) {
    const code = `${c.dep}000`;
    if ([...normands.values(), ...hors.values()].some((x) => cleCommune2(x) === cleCommune2(c.commune))) continue;
    ajouter(code, c.commune, c.debut, c.fin);
  }
  const fmt = (x: Map<string, string>) => [...new Set([...x.values()].map((c) => communeLisible(c, String(dce || '')) || c))];
  return { normands: fmt(normands), horsNormandie: fmt(hors), mixte: normands.size > 0 && hors.size > 0, codesHors: [...hors.entries()].map(([code, commune]) => ({ code, commune: communeLisible(commune, String(dce || '')) || commune })) };
}

/**
 * Départements certainement hors de la zone où GSS a ses équipes et son astreinte (réponse de GSS du 1er octobre 2026 : « toute
 * la moitié nord, de Nantes à Lille et jusqu'à Reims ») : Auvergne-Rhône-Alpes, Occitanie, Provence-Alpes-Côte d'Azur, Corse
 * et le sud de la Nouvelle-Aquitaine. Les départements de la frontière (Centre-Val de Loire, Bourgogne-Franche-Comté, Grand
 * Est hors Marne, Poitou, Vendée) ne sont pas classés tant que GSS n'a pas donné sa liste : aucune alerte pour eux.
 */
const DEPARTEMENTS_HORS_ZONE_GSS = new Set([
  '01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74',
  '09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82',
  '04', '05', '06', '13', '83', '84', '20',
  '16', '17', '19', '23', '24', '33', '40', '47', '64', '87',
]);

/**
 * Marché dont des sites sont certainement hors de la zone de GSS (T10-COH-6) : question exacte en tête des consultations et
 * du premier message ; les procédures d'astreinte de GSS (PTI, alarme, remplacement) reprises telles quelles sont signalées
 * à confirmer, rien n'est inventé à leur place.
 */
export function alerteHorsZone(analyse: any, dce: string): string[] {
  const sites = sitesParCodePostal(analyse, dce).codesHors.filter((x) => DEPARTEMENTS_HORS_ZONE_GSS.has(x.code.slice(0, 2)));
  if (!sites.length) return [];
  const communes = [...new Set(sites.map((x) => x.commune))];
  return [`${communes.length > 1 ? 'Les sites du marché' : 'Le site du marché'} (${communes.length > 1 ? `${communes.slice(0, -1).join(", ")} et ${communes[communes.length - 1]}` : communes[0]}) ${communes.length > 1 ? 'sont' : 'est'} hors de la zone où GSS a ses équipes et son astreinte (moitié nord, de Nantes à Lille et jusqu'à Reims) : GSS répond-elle à ce marché, et avec quelle organisation d'astreinte et de remplacement sur place ? Le mémoire reprend telles quelles vos procédures d'astreinte (protection du travailleur isolé, intervention sur alarme, remplacement d'un agent absent) : à confirmer ou à modifier via l'assistant avant la remise.`];
}

/**
 * Information INTERNE du registre (ex. « prix_horaire » : 22 à 30 € HT de l'heure, variable selon les marchés) : jamais
 * écrite dans un texte du mémoire. '' si inconnue. Seul accès prévu à ces informations ; aucun appelant dans le
 * générateur pour l'instant (la décomposition justificative du prix n'existe pas encore : usage futur, à décider par
 * GSS). Elle est gardée pour le test qui vérifie que le prix reste lisible ici et absent de tout texte transmis.
 */
export function valeurInterne(cle: string): string {
  try {
    const infos: InfoRegistre[] = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8')).informations || [];
    return infos.find((e) => e.interne && e.cle === cle)?.valeur_retenue || '';
  } catch {
    return '';
  }
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
- Intérim : GSS n'a pas recours à l'intérim ; absences et renforts sont couverts par ses propres équipes (titulaires, équipe suppléante formée au site, astreinte, vivier GSS). N'écris jamais que GSS recourt à l'intérim ; si le DCE pose la question, réponds que GSS n'y a pas recours.
- Contrôles inopinés : la pratique courante de GSS est de 1 à 3 contrôles par mois et par site ; quand le cahier des charges exige des contrôles inopinés, GSS s'engage sur au moins 3 contrôles inopinés par mois et par site (davantage si le CCTP impose plus).
- Chiffres GSS : reprends-les À L'IDENTIQUE (fréquences, délais, effectifs, durées) — ne les arrondis pas, ne les élargis pas (« deux à trois fois par mois » ne devient jamais « une à trois fois »).
- Effectifs GSS : n'utilise QUE les valeurs du REGISTRE (jamais les chiffres d'autres documents plus anciens) et cite toujours les mêmes dans tout le document ; un nombre d'agents ne dépasse jamais l'effectif total ; une valeur incohérente marquée [À CONFIRMER] n'est pas citée.
- Personnes et rôles : utilise UNIQUEMENT l'ORGANIGRAMME GSS DE RÉFÉRENCE, identique dans tout le document (mêmes personnes pour un même rôle, même rôle pour une même personne).
- Implantation : GSS a son siège à Rouen (Normandie) ; ${ZONE_GSS} (à présenter pour un site hors Normandie, sans inventer de ville d'agence). Les délais d'intervention, d'astreinte, de mobilisation, de remplacement ou de mise en place d'une commande (ex. « 1 h à 24 h ») figurant dans le registre ou les mémoires ont été pris pour des marchés normands : pour un site situé dans une autre région, ne les présente pas comme un engagement ; décris l'organisation prévue (renforts, prépositionnement, relais local) sans chiffre inventé et demande le délai à GSS (consultation / [À COMPLÉTER]).
- Contenu daté ou étranger au marché : ne reprends jamais les mesures Covid (gestes barrières, pass sanitaire, gel hydroalcoolique) ni un contenu propre à un autre secteur (magasin, caisses, transport de fonds, événementiel) s'il ne concerne pas ce marché. « Pôle emploi » s'appelle désormais « France Travail ».
- Le document est destiné à l'ACHETEUR : n'y écris JAMAIS de commentaire interne ou de diagnostic sur les manques (« à ce stade », « n'est pas établi », « la documentation fournie ne comporte pas », « reste à confirmer », « devra être confirmé », « selon les éléments disponibles »…). Une information manquante se signale uniquement par le marqueur prévu (consultation / [À COMPLÉTER]). Si une visite du site est obligatoire, elle est réputée faite : jamais de futur « après la visite ».
- Reprise du personnel : le fondement est l'accord de reprise de la convention collective de la prévention-sécurité (IDCC 1351), sauf autre indication du DCE ; ne cite jamais l'article L1224-1 du Code du travail pour une simple perte de marché, et n'aborde pas la reprise quand la prestation est ponctuelle (bons de commande).
- Prérogatives des agents : un agent de sécurité privée ne contrôle pas l'identité ; il invite la personne à justifier de sa présence et fait appel aux forces de l'ordre.
- Références : ne cite comme référence qu'un marché réellement exécuté par GSS, avec uniquement les caractéristiques présentes dans les sources (un mémoire de candidature n'est pas une référence) ; privilégie un marché comparable (même type d'acheteur ou de site).
- Durée de la prestation : adapte les éléments récurrents (contrôles mensuels ou trimestriels, bilans à J+7/J+15, reprise du personnel) à la durée réelle du marché ; pour une prestation ponctuelle de quelques jours, décris les contrôles pendant la mission elle-même.
- Les chiffres propres à un ancien marché (agents dédiés à un site, délais par site d'un autre client) ne sont PAS des informations de GSS en général : ne les reprends pas pour le nouveau client.
- N'attribue au CCTP / au DCE (« le CCTP demande, impose, prévoit… ») QUE ce qui y figure réellement ; une méthode ou un moyen de GSS se présente comme tel.
- Calculs : arrondis au plus proche (26 280 h ÷ 1 607 h = 16,35 ETP) ; un même chiffre est identique partout dans le mémoire.
- Photos ou vidéos (main courante, rapports) : toujours « dans le respect des consignes du client », jamais présentées comme libres (sites sensibles : santé, justice, recherche) ; si le DCE les interdit, n'en parle pas.
- Quand le DCE demande au candidat de PRÉCISER ou d'INDIQUER une donnée (délai, effectif, nombre de véhicules, organisation, pauses, bilan social, protocole…), donne-la ou propose-la de façon argumentée ; si GSS ne peut pas la fixer, écris [CONSULTATION REQUISE : …] — jamais « GSS précisera / indiquera / déterminera / mettra en œuvre un dispositif précisant… ».
- Un interdit ou une modalité imposée par le DCE (rondes à pied, pas de photos, agent en formation jamais compté dans l'effectif, alerte des secours par le PC, maintien de l'agent en poste jusqu'à la relève…) prime sur toute pratique GSS contraire : ne décris jamais la pratique contraire.
- Ne rouvre pas chaque rubrique par la description du site (adresse, surface, bâtiments, jauge) : cite au plus une caractéristique, quand elle justifie concrètement un choix.
- Reprise du personnel : jamais sélective — pas de tri avec le client des agents « apportant satisfaction », pas de repositionnement annoncé sur d'autres sites ; elle concerne les salariés remplissant les conditions de l'accord conventionnel (annexe VII de l'IDCC 1351) ou du DCE.
- Qualifications exigées par le DCE (SSIAP, secourisme SST/PSE1, habilitation électrique, CQP APS, ARI…) : présente-les comme détenues par tous les agents concernés (tous les agents, ou la catégorie que le DCE désigne), jamais au conditionnel (« le cas échéant », « lorsqu'elle est requise », « selon les missions »).
- Main courante électronique et pointage des rondes : Trackforce (un seul outil dans tout le mémoire). Protection du travailleur isolé (PTI) : application Beepiz. Astreinte : 5 véhicules d'astreinte (et non « 5 agents »).`;

/**
 * Texte de la base (passages + valeurs du registre) pour les GARDE-FOUS anti-invention : une valeur
 * (nom, chiffre, certification) présente dans un mémoire GSS est une donnée sourcée, pas une invention.
 */
export function texteSourcesMemoires(): string {
  const { passages, registre } = charger();
  return passages.map((p) => p.texte).join('\n') + '\n' + registre.map((e) => `${e.libelle} : ${e.valeur_retenue}`).join('\n');
}

/** Phrases de diagnostic interne sur les manques (jamais destinées à l'acheteur). */
// (etampes2 553, T5CP-5 : « … : GSS sollicite la clarification de la Ville », « … dans l'attente de la clarification du
// périmètre » écrits dans le mémoire remis : la demande de précision est une question, jamais une phrase du mémoire)
// T2-CONS-8 : un délai renvoyé à une décision ultérieure (« Le délai maximal … est à arrêter avec la Ville », « sera confirmé
// lors de la prise en charge ») est un commentaire : le délai est donné, proposé ou laissé à compléter par GSS.
const COMMENTAIRE_INTERNE = /((?<![a-zà-ÿ])à ce stade\b|\bd[ée]lais?\b[^.;]{0,120}?\b(?:est|sont|sera|seront|reste|restent) (?:à (?:arrêter|définir|déterminer|fixer|préciser|convenir|confirmer)|(?:arrêtée?s?|définie?s?|fixée?s?|confirmée?s?|précisée?s?|convenue?s?) (?:ultérieurement|lors de|au moment de|à la prise en charge|au démarrage))(?![a-zà-ÿ])|\bdans l['’]attente (?:de la |d['’]une |des )?(?:clarification|confirmation|précision)s?\b|\b(?:GSS|nous) (?:sollicit|demand)\w* (?:la |une |des )?(?:clarification|précision|confirmation)s?\b|\b(?:le|la|les|seul|seule|seuls|seules)\s+(?:canal|canaux|moyen|moyens|outil|outils|élément|éléments|information|informations|pratique|pratiques|procédure|procédures|dispositif|dispositifs)\s+documenté(?:e|s|es)?(?![a-zà-ÿ])|\bdocumenté(?:e|s|es)? (?:par|dans) (?:GSS|la documentation|les sources|le registre|les mémoires)|\bne sont pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]est pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]ont pas été (?:communiqué|transmis|fourni)|\bn['’]a pas été (?:communiqué|transmis|fourni)|documentation (?:gss )?(?:fournie|transmise|disponible)|documents? (?:gss )?transmis|éléments? (?:gss )?(?:disponibles|transmis|fournis|communiqués)|\breste(?:nt)? à (?:confirmer|établir|préciser|obtenir)|\bdoi(?:t|vent) être confirmé|\bdevr(?:a|ont) être (?:confirmé|précisé|transposé|validé)|\baprès la visite\b|\blors de la visite obligatoire\b|\bne comporte (?:toutefois )?pas\b|\bne présente ni\b|\bsous réserve de (?:confirmation|validation)\b|\bsous réserve de (?:la|leur|sa) (?:classification|confirmation|validation|disponibilité|faisabilité)(?![a-zà-ÿ])|\bla prestation ne comprend pas\b|(?<![a-zà-ÿ])évite d.inclure\b|\bnon (?:communiqué|précisé|renseigné) dans les|zone d['’]intervention habituelle|\bn['’]annonce (?:donc )?aucun délai|présenter comme acquis|organisation déclarée|\bdocumentés? comme\b|références enregistrées|\bnon précisée?s?(?![a-zà-ÿ])|\bDCE transmis\b|éléments du DCE|implantation habituelle|\bces éléments ne (?:décrivent|précisent|mentionnent|détaillent|couvrent)\b|\breste(?:nt)? à (?:définir|déterminer|arrêter|organiser)|hors de (?:la|sa) zone|\bn(?:e sera|e sont|e seront|.est) (?:donc )?pas présentée?s? comme|\bne sont pas présentées? comme|présence locale déjà constituée|\bn.est toutefois pas établie?\b|\bil ne vaut pas engagement\b|\bconstitue l.engagement opérationnel connu\b|\bdoit être intégrée? au parcours\b|\best signalée? ci-dessous\b|\bsont toutefois traitées comme\b|\bGSS (?:documente|décrit|affirme)\b|\bsans assimiler\b|\bla distance entre Rouen\b|\bincohérence relevée dans le DCE\b|n.a pas (?:encore )?(?:d.agence|d.implantation)|\bdoi(?:t|vent) (?:toutefois |encore |donc )?être arrêtée?s?(?![a-zà-ÿ])|\bdoi(?:t|vent) (?:toutefois|encore) être (?:formalisée?s?|précisée?s?|définie?s?|validée?s?|intégrée?s?)(?![a-zà-ÿ])|n.étant pas (?:précisée?s?|indiquée?s?|connue?s?|communiquée?s?)(?![a-zà-ÿ])|\bn.est (?:pas )?expressément (?:demandée?|exigée?|prévue?)(?![a-zà-ÿ])|(?<![a-zà-ÿ])à formaliser\b|\bn['’](?:est|sont) (?:pas |encore |pas encore )?documentée?s?(?![a-zà-ÿ])|\bn['’](?:est|a été) (?:pas )?(?:indiquée?|mentionnée?)(?![a-zà-ÿ])|\bne sont (?:pas )?(?:indiquée?s|mentionnée?s)(?![a-zà-ÿ])|\baucun(?:e|s|es)?\s[^.;:\n]{0,80}?(?:indiquée?s?|précisée?s?|mentionnée?s?) (?:dans|par) (?:le|la|les) (?:CCTP|DCE|RC|CCAP|cahier)|\bnon (?:indiquée?s?|précisée?s?|mentionnée?s?) (?:dans|par) (?:le|la|les) (?:CCTP|DCE|RC|CCAP|cahier)|\b(?:indiquée?s?|précisée?s?|mentionnée?s?) (?:dans|par) (?:le|la|les) (?:CCTP|DCE|RC|CCAP|cahier des charges) fournis?\b|\b(?:CCTP|DCE|RC|CCAP) fournis?\b|\bne désigne(?:nt)? (?:pas|aucun)|\bdoi(?:t|vent) être distinguée?s?(?![a-zà-ÿ])|\bblocs? cités?(?![a-zà-ÿ])|\bne préjuge(?:nt)? (?:pas|en rien)\b|\bne prétend(?:ent)? pas (?:rapporter|décrire|refléter|relater)\b|\b(?:absente?s?|manquante?s?) (?:des|dans les) pièces (?:analysées|transmises|fournies)|\bpièces analysées\b|\bn['’](?:est|sont) pas stipulée?s?(?![a-zà-ÿ])|(?<![a-zà-ÿ])à valider (?:par GSS|(?:avec|par) l['’]acheteur|pour le territoire)\b|\bavant le dépôt (?:définitif )?de l['’]offre\b|\bdélais? normands?\b|\bn['’](?:est|sont) (?:pas )?transposée?s?(?![a-zà-ÿ])|\b(?:extraits?|documents?|pièces?|sources?|éléments?|données?|informations?) (?:fournie?s?|transmise?s?|disponibles?|consultée?s?|analysée?s?) ne (?:précisent|précise|mentionnent|mentionne|indiquent|indique|détaillent|détaille|décrivent|décrit|permettent|permet) pas\b)/i;

/** Présent de l'indicatif d'un verbe laissé à l'infinitif après « GSS » (« GSS former » → « GSS forme »). */
const IRREGULIERS_GSS: Record<string, string> = {
  tenir: 'tient', maintenir: 'maintient', venir: 'vient', intervenir: 'intervient', ouvrir: 'ouvre', offrir: 'offre', couvrir: 'couvre',
  partir: 'part', servir: 'sert', sortir: 'sort', mettre: 'met', permettre: 'permet', transmettre: 'transmet', remettre: 'remet',
  soumettre: 'soumet', prendre: 'prend', reprendre: 'reprend', comprendre: 'comprend', faire: 'fait', produire: 'produit',
  conduire: 'conduit', répondre: 'répond', rendre: 'rend', dire: 'dit', écrire: 'écrit', inscrire: 'inscrit', décrire: 'décrit',
  appeler: 'appelle', rappeler: 'rappelle', envoyer: 'envoie', renvoyer: 'renvoie', employer: 'emploie', déployer: 'déploie', recevoir: 'reçoit',
  avoir: 'a', être: 'est', pouvoir: 'peut', devoir: 'doit', savoir: 'sait', voir: 'voit', prévoir: 'prévoit', pourvoir: 'pourvoit',
};
const PAS_VERBES_GSS = /^(?:premi|derni|enti|particuli|r[ée]guli|h|fi|ch|l|m|s|av|d[ée]s|plaisi|loisi|souven|aven|d[ée]si|pouv|savo|devo|po|mo|to|vo|ve|cent|f|nav|press|offi|cuisini|ouvri|pompi|chanti|dossi|courri|fichi|quarti|clavi|pallet|papi|calendri|m[ée]ti|bouclie)$/;
function conjuguerApresGss(m: string, rad: string, fin: string): string {
  const inf = `${rad}${fin}`;
  if (IRREGULIERS_GSS[inf]) return `GSS ${IRREGULIERS_GSS[inf]}`;
  if (PAS_VERBES_GSS.test(rad) || fin === 're') return m;
  if (fin === 'ir') return `GSS ${rad}it`;
  // 1er groupe : « gérer » → « gère », « compléter » → « complète ».
  return `GSS ${rad.replace(/é([^aeiouyéèêàâîôû]+)$/, 'è$1')}e`;
}

/** Montant de pénalité du CCAP/CCTP : GSS s'engage sur l'obligation, jamais sur le montant de la sanction. */
// Montant en chiffres ou en lettres, en euros ou en pourcentage (T3-CONS-5, havre2 1352 : « une pénalité de 100 % de la
// prestation commandée », taux de la grille de pénalités du DCE).
const LETTRES_MONTANT = '(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent|mille)(?:[\\s-]+(?:et|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|trente|quarante|cinquante|soixante|cents?|mille))*';
const MONTANT_SEUL = `(?:\\d[\\d\\s\u00a0\u202f]*(?:[,.]\\d+)?\\s*(?:€|euros?\\b|%|pour\\s?cents?\\b)|\\b${LETTRES_MONTANT}\\s+(?:euros?|pour\\s?cents?)\\b)`;
export const MONTANT_PENALITE = new RegExp(`p[ée]nalit[ée]s?[^.;]{0,120}?${MONTANT_SEUL}|${MONTANT_SEUL}[^.;]{0,80}?p[ée]nalit`, 'i');

/**
 * Retire du texte destiné à l'acheteur les phrases de diagnostic interne (« à ce stade, … n'est pas
 * établi », « la documentation fournie ne comporte pas… ») et les renvoie pour la liste des points à
 * confirmer. Une phrase qui porte un marqueur ([À COMPLÉTER], [CONSULTATION REQUISE], repère) est gardée.
 */
/** Proposition qui commente le DCE au lieu de décrire la prestation (« ; la télésurveillance externalisée n'est pas stipulée
 *  au CCTP », génération réelle ign 15) : retirée, le reste de la phrase est gardé. */
const CLAUSE_SUR_LE_DCE = /\s*;\s*[^;.\n]*\bn['’](?:est|sont) pas (?:stipulée?s?|prévue?s?|mentionnée?s?|demandée?s?|exigée?s?|précisée?s?) (?:au|dans le|par le|à la|dans la|par la) (?:CCTP|DCE|CCAP|RC|cahier des charges|consultation)\b[^;.\n]*(?=[.;\n]|$)/g;

export function retirerCommentairesInternes(texte: string): { texte: string; retires: string[] } {
  const retires: string[] = [];
  // Constat sur le DCE, sans question pour GSS : retiré sans être remonté en consultation.
  texte = String(texte || '').replace(CLAUSE_SUR_LE_DCE, '');
  const lignes = texte.split('\n').map((ligne) => {
    // Montant de pénalité : seule la proposition qui le cite est retirée (phrase, ou partie après « ; »/« , ») ;
    // une puce ou une ligne qui ne contenait que cela disparaît.
    if (MONTANT_PENALITE.test(ligne) && !/\[À COMPLÉTER\]|\[CONSULTATION REQUISE|⟦AC:/.test(ligne) && !/^\s*\|/.test(ligne)) {
      const debut = (ligne.match(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?/) || [''])[0];
      const reste = ligne.slice(debut.length).split(/(?<=[.;!?])\s+/)
        .map((ph) => (MONTANT_PENALITE.test(ph) ? ph.replace(/\s*[;,]\s*[^;,]*p[ée]nalit[^;]*$/i, '.').replace(/^.*$/, (x) => (MONTANT_PENALITE.test(x) ? '' : x)) : ph))
        .filter((ph) => ph.trim()).join(' ').replace(/\s*;\s*$/, '.').trim();
      ligne = reste ? `${debut}${reste}` : '';
    }
    if (/^\s*(#|\||[-*•]\s)/.test(ligne) && !COMMENTAIRE_INTERNE.test(ligne)) return ligne;
    const phrases = ligne.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/);
    let precedenteRetiree = false;
    const gardees = phrases.map((ph) => {
      // Phrase qui prolonge un commentaire interne retiré (« Cette disposition… ») : retirée avec lui.
      if (precedenteRetiree && /^(?:Ces?|Cet|Cette|Ils|Elles|Il|Elle|Celle|Celui|Ceux|Celles)\b/.test(ph) && !/⟦AC:|\[À COMPLÉTER\]|\[CONSULTATION REQUISE/.test(ph)) {
        retires.push(ph.replace(/[*#]/g, '').trim());
        return null;
      }
      precedenteRetiree = false;
      if (!COMMENTAIRE_INTERNE.test(ph) || /\[À COMPLÉTER\]|\[CONSULTATION REQUISE/.test(ph)) return ph;
      precedenteRetiree = true;
      // Commentaire interne suivi d'un repère d'information à compléter : le commentaire part, le repère
      // (emplacement de la future réponse de GSS) reste.
      const reperes = ph.match(/⟦AC:\d+⟧/g);
      retires.push(ph.replace(/⟦AC:\d+⟧/g, '').replace(/[*#]/g, '').trim());
      return reperes ? reperes.join(' ') : null;
    }).filter((ph): ph is string => ph !== null);
    return gardees.join(' ');
  });
  // Prérogatives : un agent de sécurité privée ne vérifie pas l'identité (formulation héritée de textes sources).
  const texteFinal = lignes.join('\n').replace(/\n{3,}/g, '\n\n')
    // « GSS indique pouvoir / que … » : formulation de rapporteur → engagement direct.
    .replace(/\b[Ll]a documentation (?:opérationnelle |GSS |interne )*(?:de GSS )?prévoit\b/g, 'La procédure GSS prévoit').replace(/\bGSS indique pouvoir\b/g, 'GSS peut').replace(/\bGSS indique que (ses|son|sa|leurs|leur|les|le|la)\b/g, (_m, d) => ({ ses: 'Les', son: 'Le', sa: 'La', leurs: 'Les', leur: 'Le' } as Record<string, string>)[d] || `${d.charAt(0).toUpperCase()}${d.slice(1)}`).replace(/\bGSS indique\s+/g, 'GSS ')
    // Incise méta dans une phrase utile (« Beepiz, référencée comme application PTI de GSS, protège… ») : l'incise part, la phrase reste.
    .replace(/,\s*(?:référencée?s?|documentée?s?|mentionnée?s?|présentée?s?) (?:comme|dans) [^,.;]+,\s*/g, ' ')
    // Incise sur l'implantation de GSS (« Pour cette intervention hors de la zone habituelle de GSS, … ») : retirée.
    .replace(/(^|[.!?]\s+|\n)(?:Pour|Dans|S.agissant d.)\s+(?:ce|cette|un|une)\s+[^,.\n]{0,40}?hors de (?:la|sa) zone[^,.\n]*,\s*(\S)/g, (_m, a, c) => `${a}${c.toUpperCase()}`)
    .replace(/,?\s*(?:situ[ée]e?s?\s+)?hors de (?:la|sa) zone (?:d.intervention )?habituelle(?: de GSS)?,?/g, '')
    // Écho de la consigne de périmètre (« sans poste fixe permanent d'accueil… », « aucun poste fixe n'est créé ») :
    // le mémoire décrit ce que GSS fait, pas ce qu'elle ne fait pas.
    .replace(/(^|[.!?]\s+|\n)(?:Cette (?:organisation|préparation|méthode)|Ce dispositif|Aucun (?:remplacement|équipement|poste)[^.\n]{0,60})[^.\n]*(?:ne crée|ne donne lieu|n.est (?:ajouté|créé)|n.est créée?)[^.\n]*poste fixe[^.\n]*\.\s*/g, '$1')
    .replace(/(^|[.!?]\s+|\n)Aucun poste fixe[^.\n]*\.\s*/g, '$1')
    // T2-CONS-1 : la négation emporte toute son énumération (« rondiers, sans poste fixe, accueil ni standard » →
    // « rondiers » ; « des rondes, sans poste fixe ni accueil » → « des rondes » ; « sans poste permanent ni mission d'accueil »),
    // jamais un morceau d'énumération orphelin ni un complément laissé seul (« la continuité, sans poste permanent
    // supplémentaire » reste entière).
    .replace(/,?\s*(?:et\s+)?sans (?:création de |créer (?:de|un) |ajouter (?:de|un) |ajout de )?(?:aucun )?poste (?:fixe(?: permanent)?|permanent)(?: d.accueil)?(?:,? (?:de|du) standard)?(?:,? ou de contrôle d.accès)?(?: permanents?)?(?:(?:\s*,\s*(?!et\b|mais\b|qui\b|dont\b)[^,.;:\n]{1,40}?)*\s*,?\s+ni\s+[^,.;:\n]{1,60})?(?=\s*(?:[,.;:)\n]|$))/g, '')
    .replace(/,?\s*\*\*\s*\*\*/g, '')
    // Source interne citée (« Le registre GSS recense 27 agents… ») : le chiffre reste, la source part.
    .replace(/\b[Ll]e registre (?:GSS|des informations GSS|des mémoires GSS) (?:recense|indique|mentionne|fait état de|compte)\b/g, 'GSS compte')
    .replace(/\b[Ll]e registre (?:GSS|des informations GSS|des mémoires GSS) (identifie|prévoit|retient|désigne|cite|liste|précise)\b/g, 'GSS $1')
    // Coquilles héritées des documents GSS.
    // Contenu daté : « plan Covid » (renforts d'un établissement de santé) → plan de crise sanitaire.
    .replace(/\bplans? Covid(?:-19)?\b/gi, (m) => (/s /i.test(m) ? 'plans de crise sanitaire' : 'plan de crise sanitaire'))
    .replace(/\bIFESSSU\b/g, 'IFESSU').replace(/\bHOBO\b/g, 'H0B0').replace(/\bentre (\*{0,2})(\d+) à (\d+)\b/g, 'de $1$2 à $3')
    // Un seul outil de main courante dans le mémoire (Trackforce, outil exact en attente de confirmation par GSS),
    // et l'astreinte GSS compte 5 véhicules, pas « 5 agents ».
    .replace(/\b(?:VIGICOM|Vigicom|vigicom)(?:\s+6TADEL)?\b/g, 'Trackforce')
    .replace(/\bTrackforce(?:\s*(?:et|\/|;|,|ou)\s*Trackforce)+\b/gi, 'Trackforce').replace(/\bTRACKFORCE\b/g, 'Trackforce')
    .replace(/\b(5|cinq) agents d.astreinte\b/gi, '5 véhicules d’astreinte')
    // Consigne interne recopiée en incise (« …, sans annoncer de délai de mobilisation non prévu ») : l'incise part.
    .replace(/,?\s*sans (?:annoncer|promettre|chiffrer|indiquer|s.engager sur) (?:de |d['’]|un |aucun )?d[ée]lais?\b[^.;\n]*/g, '')
    // Pièces à fournir notées comme une consigne (« … sont à transmettre avec l'offre ») : engagement de GSS.
    .replace(/\b(sont|est) à (?:transmettre|fournir|joindre|remettre) (?:avec|à|dans) l['’]offre\b/g, (_m, v: string) => (v === 'est' ? 'est joint à l’offre' : 'sont joints à l’offre'))
    // « GSS former chaque agent » : infinitif laissé après GSS → présent.
    .replace(/\bGSS ([a-zàâçéèêëîïôûü]{2,}?)(er|ir|re)\b(?=[\s,])/g, (m, rad: string, fin: string) => conjuguerApresGss(m, rad, fin))
    // Parenthèse de délai qui n'a plus de fourchette (« (selon la distance, en 2 heures) ») : délai simple.
    .replace(/\(selon la distance, (?:en|sous) ((?:\d+|une?|deux) (?:minutes?|heures?))\)/g, '(dans un délai de $1)')
    // « GSS confirme que les rondes… » : formulation de réponse à une question interne → affirmation directe.
    .replace(/\bGSS (?:confirme|précise|atteste) que (\S)/g, (_m, c) => c.toUpperCase())
    // Renvoi à la numérotation interne des exigences.
    .replace(/(^|\n)(\s*[-*•]?\s*)(?:Pour|Concernant) l['’]exigence n?°?\s*\d+\s*,\s*(\S)/g, (_m, a, b, c) => `${a}${b}${c.toUpperCase()}`)
    // Emplacement de schéma laissé en texte (« [Insérer ici le schéma …] ») : le schéma est inséré par le rendu.
    .replace(/^.*\[\s*(?:Ins[ée]rer|Ajouter|Placer) ici[^\]]*\].*$/gim, '').replace(/^\s*(?:\*\*)?Sch[ée]ma\s*[—:-][^\n]*$/gim, '')
    // …sauf dans une phrase qui l'INTERDIT (« l'interdiction de contrôler l'identité », « ne contrôle pas son
    // identité ») : la remplacer y produisait une phrase absurde.
    .replace(/\b(vérifie|vérifient|contrôle|contrôlent|vérifier|contrôler)\s+(son|leur|l['’])\s*identité/gi, (m, v, _d, pos, tout) => {
      const avant = String(tout).slice(Math.max(0, pos - 60), pos);
      if (/interdi|\bne\b|\bn['’]|\bsans\b|\bjamais\b|\baucun|pas de\s*$|pas\s*$/i.test(avant) || /^\S+\s+pas\b/i.test(String(tout).slice(pos, pos + 30))) return m;
      return /nt$/.test(v) ? 'l’invitent à justifier de sa présence' : /er$/.test(v) ? 'l’inviter à justifier de sa présence' : 'l’invite à justifier de sa présence';
    })
    // Variantes affirmatives (« l'agent procède lui-même au contrôle de l'identité des personnes entrant sur le site »,
    // « la vérification de l'identité de l'individu ») : l'agent vérifie l'AUTORISATION d'accès ou de présence.
    .replace(/\b(procèdent|procède|procéder|effectuent|effectue|effectuer|réalisent|réalise|réaliser)\s+(?:(?:lui|eux|elle|elles)-mêmes?\s+)?(?:au|le|un|à un|à des|des)\s+contr[ôo]les?\s+(?:de\s+l['’]|d['’])identit[ée]s?/gi, (m, v, pos, tout) => {
      if (negationAvant(String(tout), pos) || /^\S+\s+pas\b/i.test(String(tout).slice(pos, pos + 30))) return m;
      return `${/nt$/i.test(v) ? 'vérifient' : /er$/i.test(v) ? 'vérifier' : 'vérifie'} l’autorisation d’accès`;
    })
    .replace(/\bvérification\s+de\s+l['’]identité(?![a-zà-ÿ])/gi, (m, pos, tout) => (negationAvant(String(tout), pos) ? m : 'vérification de l’autorisation de présence'))
    .replace(/\bcontr[ôo]l(ent|e) les accès et les identités\b/gi, 'contrôl$1 les accès et les autorisations de présence')
    // Identité en second complément du verbe (génération réelle caen 701 : « GSS contrôlera les accès au site et à son enceinte
    // ainsi que l'identité des personnes entrant sur le site ») : l'autorisation de présence des personnes.
    .replace(/\b((?:contr[ôo]l|v[ée]rifi)[a-zé]*\b[^.;\n]{0,80}?\s(?:ainsi que|et))\s+l['’]\s*identit[ée]\s+(des|de la|du|de l['’])/gi, (m, debut: string, art: string, pos: number, tout: string) =>
      (negationAvant(String(tout), pos) ? m : `${debut} l’autorisation de présence ${art}`))
    // Forme nominale (caen 471, puce d'engagement : « GSS assurera la surveillance des sites, […] le contrôle des
    // identités, les premiers secours ») : « la vérification des autorisations de présence », article accordé.
    .replace(/\b(?:(le|du|au|un|les|des|aux)\s+)?(contr[ôo]les?|v[ée]rifications?)\s+(?:des\s+identit[ée]s|d['’]\s*identit[ée]s?|de\s+l['’]\s*identit[ée](?![a-zà-ÿ])(?!\s+(?:de|du|des)\s))/gi, (m, art: string | undefined, _n, pos: number, tout: string) => {
      if (negationAvant(String(tout), pos) || /interdi/i.test(String(tout).slice(Math.max(0, pos - 40), pos))) return m;
      const a = (art || '').toLowerCase();
      const pref = a === 'du' || a === 'des' ? 'de la ' : a === 'au' || a === 'aux' ? 'à la ' : a === 'un' ? 'une ' : a ? 'la ' : '';
      const r = `${pref}vérification des autorisations de présence`;
      return /^[A-ZÀ-Ý]/.test(m) ? r.charAt(0).toUpperCase() + r.slice(1) : r;
    });
  return { texte: sansRepriseSelective(texteFinal), retires };
}

/**
 * Reprise sélective (« maintient sur le site les agents satisfaisants et repositionne les autres sur d'autres sites ») :
 * la reprise conventionnelle n'est jamais un tri ; la phrase est retirée (sa forme négative, elle, reste).
 */
function sansRepriseSelective(texte: string): string {
  const SELECTIVE = /(?:maint(?:ient|iennent|enir|ien)|conserv\w*|gard\w*)[^.!?\n]{0,60}(?:agents?|salariés?)[^.!?\n]{0,20}(?:satisfaisants|donnant satisfaction|apportant satisfaction)|repositionn\w*[^.!?\n]{0,60}(?:sur d.autres sites|autres sites|selon (?:les besoins|leur adéquation))/i;
  const garde = (ph: string) => !SELECTIVE.test(ph) || /\bsans\b|\baucun|\bni\b|\bne\b[^.!?\n]{0,50}\bpas\b|\bnon\b|\bjamais\b/i.test(ph) || /\[À COMPLÉTER\]|\[CONSULTATION REQUISE/.test(ph);
  return texte.split('\n').map((ligne) => {
    if (!SELECTIVE.test(ligne)) return ligne;
    return ligne.split(/(?<=[.!?])\s+/).filter(garde).join(' ');
  }).join('\n');
}

/** Négation dans les 60 caractères qui précèdent (« ne procède pas », « sans », « jamais »…). */
function negationAvant(tout: string, pos: number): boolean {
  return /interdi|\bne\b|\bn['’]|\bsans\b|\bjamais\b|\baucun|pas de\s*$|pas\s*$/i.test(tout.slice(Math.max(0, pos - 60), pos));
}

/**
 * Fondement juridique de la reprise du personnel : en sécurité privée, c'est la convention collective
 * (IDCC 1351, annexe VII), pas l'article L. 1224-1 du Code du travail — sauf si le DCE lui-même le cite.
 * Les phrases qui l'invoquent sans que le DCE le fasse sont retirées (la reprise reste décrite ailleurs).
 */
export function fondementReprise(texte: string, dce: string): string {
  if (/L\.?\s?1224/.test(dce || '') || !/L\.?\s?1224/.test(texte)) return texte;
  // Découpe en phrases sur une majuscule suivante : « l'article L. 1224-1 » ne coupe pas la phrase au « L. ».
  return texte.split('\n').map((ligne) => ligne.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(⟦*#])/).filter((ph) => !/L\.?\s?1224/.test(ph)).join(' '))
    .join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Délais écrits sans chiffre ou avec une tournure de maximum (T10-COH-1) remis à la forme « délai de N unité » que lisent
 * les lecteurs de délais : « dans un délai maximal d'une heure » → « dans un délai maximal de 1 heure », « dans l'heure » →
 * « dans 1 heure », « d'une demi-heure » → « de 30 minutes », « n'excédant pas / inférieur à / ne dépassant pas 1 heure » →
 * « de 1 heure », « au plus tard une heure après » → « au plus tard dans une heure après ». Le texte cité n'est pas changé :
 * seule la copie lue l'est.
 */
const MOTS_NOMBRES: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, cent: 100, cents: 100,
};
/** Nombre écrit en lettres, formes composées comprises (« vingt-cinq », « quatre-vingt-dix », « trente et un »). */
export const RX_NOMBRE_LETTRES = String.raw`(?:z[ée]ro|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cents?)(?:(?:-et-|\s+et\s+|-)(?:une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|cents?))*`;
/** Valeur d'un nombre en lettres (« quatre-vingt-dix » → 90) ; NaN si illisible. Un nombre en chiffres est lu tel quel. */
export function nombreFr(t: string): number {
  const x = String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^\d+(?:[.,]\d+)?$/.test(x)) return Number(x.replace(',', '.'));
  const mots = x.split(/-et-|\s+et\s+|[-\s]+/).filter(Boolean);
  if (!mots.length) return NaN;
  let total = 0, courant = 0;
  for (const m of mots) {
    const v = MOTS_NOMBRES[m];
    if (v === undefined) return NaN;
    if (v === 20 && courant === 4) courant = 80;
    else if (v === 100) courant = (courant || 1) * 100;
    else courant += v;
  }
  total += courant;
  return total;
}

const UNITE_DUREE = String.raw`(?:minutes?|mn|min|heures?|h)(?![\p{L}])`;

/** Durées d'un texte en minutes, après remise des délais à la forme chiffrée (« vingt-cinq minutes », « 1 h 30 », « 30' »). */
export function dureesEnMinutes(t: string): number[] {
  // Valeur seule (« 1 h 30 ») : lue comme un délai.
  const lu = normaliserExpressionsDelai(/^\s*\d/.test(String(t || '')) ? `dans ${t}` : t);
  return [...lu.matchAll(new RegExp(String.raw`(?<![\p{L}\d,.])(\d{1,4}(?:[.,]\d+)?)\s*(?:\(\s*[^()]{1,20}\)\s*)?(minutes?|mn|min|heures?|h)(?![\p{L}\d])`, 'giu'))]
    .map((m) => minutesDe(m[1], m[2])).filter((n) => Number.isFinite(n));
}

export function normaliserExpressionsDelai(t: string): string {
  return String(t || '')
    // Nombre en lettres devant une unité de durée (T1-GEN-3 : « vingt-cinq minutes », « quatre-vingt-dix minutes »,
    // « UNE (1) heure ») : en chiffres.
    .replace(new RegExp(String.raw`(?<![\p{L}-])(${RX_NOMBRE_LETTRES})(?=\s*(?:\(\s*[\d\p{L} -]{1,25}\)\s*)?${UNITE_DUREE})`, 'giu'), (m) => {
      const n = nombreFr(m);
      return Number.isFinite(n) ? String(n) : m;
    })
    // « d'1 heure » (ou « d'une heure » devenu « d'1 heure ») : « de 1 heure ».
    .replace(/(?<![\p{L}])d['’]\s*(?=\d{1,4}\s*(?:\(\s*[^()]{1,25}\)\s*)?(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/giu, 'de ')
    // « ½ heure », « 1/2 h », « demi heure » (T2-COH-7) : une demi-heure.
    .replace(/(?<![\d\p{L}])(?:½|1\s*\/\s*2)\s*(?:h|heures?)(?![\p{L}\d])/giu, 'une demi-heure')
    .replace(/(?<![\p{L}])demi\s+heure/giu, 'demi-heure')
    // « dans la demi-heure », « sous la demi-heure » (T2-COH-7) : 30 minutes, comme « d'une demi-heure ».
    .replace(/(?<![\p{L}])(dans|sous|en)\s+la\s+demi-heure(?![\p{L}])/giu, '$1 30 minutes')
    .replace(/(\bd['’]\s*|\bde\s+)?(?<![a-zà-ÿ])une?\s+demi-heure/gi, (_m, de) => `${de ? 'de ' : ''}30 minutes`)
    // Quarts d'heure (T3G-3 : « remplacé dans les trois quarts d'heure », « sur place dans le quart d'heure ») : 45 et 15 minutes.
    .replace(/(?<![\p{L}])(dans|sous|en)\s+les\s+trois[\s-]+quarts?\s+d['’]\s*heure(?![\p{L}])/giu, '$1 45 minutes')
    .replace(/(\bd['’]\s*|\bde\s+)?(?<![\p{L}])trois[\s-]+quarts?\s+d['’]\s*heure(?![\p{L}])/giu, (_m, de) => `${de ? 'de ' : ''}45 minutes`)
    .replace(/(?<![\p{L}])(dans|sous|en)\s+le\s+quart\s+d['’]\s*heure(?![\p{L}])/giu, '$1 15 minutes')
    .replace(/(\bd['’]\s*|\bde\s+)?(?<![\p{L}\d])(?:une?\s+(?:quart|1\s*\/\s*4|¼)|1\s*\/\s*4|¼)\s+d['’]\s*heure(?![\p{L}])/giu, (_m, de) => `${de ? 'de ' : ''}15 minutes`)
    // « ≤ 2 heures », « < 30 min » : un délai maximal (« dans »).
    .replace(/(?:≤|<|&lt;)\s*(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/gu, 'dans ')
    // Heures suivies de minutes en lettres (« une heure trente », « deux heures quinze », T2-GEN-2) : en minutes, comme
    // « 1h30 » (« une heure » est déjà « 1 heure »). Jamais une plage horaire.
    .replace(/(?<=(?:dans|sous|en|de|d['’]|moins de|plus de|maximum|maximal|tard|délai|delai)\s+(?:un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?(?:de\s+)?)?)(\d{1,2})\s*(?:h|heures?)\s+(?:et\s+)?(quarante-cinq|quarante|trente|quinze|vingt|dix|cinq)(?:\s+minutes?)?(?![\p{L}-])(?!\s*(?:à|-|–)\s*\d)/giu,
      (_m, h: string, mm: string) => `${Number(h) * 60 + (nombreFr(mm) || 0)} minutes`)
    // Heures et minutes (« 1h30 », « 1 h 30 », « 1 heure 30 », « 1 heure et demie », « 1,5 heure ») : en minutes. Jamais
    // une plage horaire (« de 8h30 à 19h30 ») ni une heure sans contexte de délai.
    .replace(/(?<=(?:dans|sous|en|de|d['’]|moins de|plus de|maximum|maximal|tard|délai|delai)\s+(?:un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?(?:de\s+)?)?)(\d{1,2})\s*(?:h|heures?)\s*(?:(\d{2})(?:\s*(?:min(?:utes?)?|mn))?|et\s+demie)(?![\d\p{L}])(?!\s*(?:à|-|–)\s*\d)/giu,
      (_m, h: string, mm?: string) => `${Number(h) * 60 + (mm ? Number(mm) : 30)} minutes`)
    .replace(/(?<![\d.,])(\d{1,2})[.,](\d{1,2})\s*(?:h|heures?)(?![\p{L}\d])/giu, (_m, a: string, b: string) => `${Math.round(Number(`${a}.${b}`) * 60)} minutes`)
    // « 30' » : 30 minutes.
    .replace(/(?<![\d.,])(\d{1,3})\s*['’′](?![\p{L}\d])/gu, '$1 minutes')
    // Tournures d'attribut (« Le délai d'intervention sur alarme est fixé à 25 minutes », « … ne doit pas dépasser
    // 25 minutes », « Délai de remplacement d'un agent absent : 45 minutes », « au maximum 45 minutes après ») : « dans N ».
    .replace(/(d[ée]lais?(?:\s+maxim(?:al|um))?\b[^.;]{0,90}?)\s+(?:est|sera|doit [êe]tre)\s+(?:(?:fix[ée]e?|limit[ée]e?|port[ée]e?|ramen[ée]e?)\s+[àa]|de)\s+(?=\d)/giu, '$1 dans ')
    .replace(/(?<![\p{L}])(?:ne\s+(?:doit|peut|pourra|devra|saurait)\s+(?:pas\s+|en aucun cas\s+|jamais\s+)?(?:d[ée]passer|exc[ée]der|[êe]tre\s+sup[ée]rieure?s?\s+[àa]))\s+(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/giu, 'dans ')
    // Délai nommé par son action (« un délai d'intervention de 30 minutes », « délai d'arrivée sur site inférieur à 30 min »,
    // « délai de remplacement d'un agent absent de 2 heures », T2-GEN-2) : « délai d'intervention dans 30 minutes ».
    .replace(/(d[ée]lais?(?:\s+maxim(?:al|um))?\s+(?:d['’]\s*|de\s+)[^.;:|\d]{2,70}?)\s+(?:de|inf[ée]rieure?\s+(?:ou\s+[ée]gale?\s+)?[àa]|n['’]exc[ée]dant pas|ne d[ée]passant pas|maxim(?:um|al)(?:\s+de)?)\s+(?=\d{1,4}\s*(?:\(\s*[^()]{1,25}\)\s*)?(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/giu, '$1 dans ')
    // « dispose de 2 heures pour assurer son remplacement » (T2-GEN-2) : « dispose dans 2 heures pour… ».
    .replace(/(?<![\p{L}])(dispos\p{L}*)\s+(?:d['’]un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+|de\s+)(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}])\s+pour\s)/giu, '$1 dans ')
    // Cellule de tableau qui ne porte que la durée (« Levée de doute sur alarme | 30 minutes », T2-GEN-2) : « | dans 30 minutes ».
    .replace(/\|\s*(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}\/])\s*(?:\||$))/gimu, '| dans ')
    .replace(/(d[ée]lais?(?:\s+maxim(?:al|um))?\b[^.;:]{0,90}?)\s*:\s*(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/giu, '$1 dans ')
    .replace(/(?<![\p{L}])au\s+maximum\s+(?=\d{1,4}\s*(?:minutes?|mn|min|heures?|h)(?![\p{L}]))/giu, 'dans ')
    .replace(/\bdans l['’]heure(?![a-zà-ÿ])/gi, 'dans 1 heure')
    .replace(/\bd['’]\s*une?\s+(?=(?:heures?|h)(?![a-zà-ÿ]))/gi, 'de 1 ')
    .replace(/(d[ée]lai(?:\s+maxim(?:al|um))?)\s+(?:n['’]exc[ée]dant pas|ne d[ée]passant pas|ne pouvant (?:pas )?exc[ée]der|inf[ée]rieure?\s+(?:ou\s+[ée]gale?\s+)?[àa]|maximum de)\s+/gi, '$1 de ')
    .replace(/\bau plus tard\s+(?=(?:\d|une?\s|deux|trois|quatre|cinq|six|dix|douze|quinze|vingt|trente)\S*\s*(?:\(\s*\d+\s*\)\s*)?(?:minutes?|mn|min|heures?|h)(?![a-zà-ÿ]))/gi, 'au plus tard dans ');
}

/** Durée en minutes (« 1 heure » → 60, « 45 minutes » → 45) ; NaN si illisible. */
export function minutesDe(n: string | number, unite: string): number {
  const v = typeof n === 'number' ? n : Number(String(n).replace(',', '.'));
  return /^m/i.test(unite.trim()) ? v : v * 60;
}

/**
 * Marché HORS de Normandie (GSS est implantée à Rouen) : une phrase qui promet une présence physique
 * (intervention, remplacement, astreinte, renfort, arrivée sur place) dans un délai chiffré ABSENT du DCE
 * reprend un délai normand intenable. Elle est retirée et renvoyée comme point à confirmer par GSS. Les
 * délais imposés par le DCE (GSS s'y engage) et les procédures internes (« prise de service 15 minutes
 * avant ») sont conservés.
 */
export function delaisHorsNormandie(texte: string, dce: string, horsNormandie: boolean): { texte: string; retires: string[] } {
  const retires: string[] = [];
  if (!horsNormandie) return { texte, retires };
  const DUREE = /(\d+(?:[,.]\d+)?)\s*(minutes?|min\b|heures?\b|h\b)(?!\s*\d)/gi;
  // « remplaçant » (ç), prise de service et absence comprises : « l'agent remplaçant prend son service sous 60 minutes » ;
  // mise à disposition d'agents et délais contractuels (« sous 2 heures pour une demande urgente »).
  const PRESENCE = /interven|mobilis|rempla[cç]|astreinte|rondier|arriv|sur place|se rend|d[ée]plac|renfort|lev[ée]e de doute|(?:prise?|prenne|prend) (?:de |son )?service|absence|mise à disposition|mis à disposition|d[ée]lais? contractuels?|demandes? urgentes?|en urgence/i;
  const dceNorm = normaliserExpressionsDelai((dce || '').replace(/\s+/g, ' ')).toLowerCase();
  // Le DCE écrit parfois le délai en toutes lettres (« moins de cinq minutes »).
  const LETTRES: Record<string, string> = { '1': 'une?', '2': 'deux', '3': 'trois', '4': 'quatre', '5': 'cinq', '6': 'six', '8': 'huit', '10': 'dix', '12': 'douze', '15': 'quinze', '20': 'vingt', '24': 'vingt-quatre', '30': 'trente', '45': 'quarante-cinq', '48': 'quarante-huit', '60': 'soixante', '72': 'soixante-douze' };
  /** 'oui' : délai imposé par le DCE ; 'seuil' : seulement un seuil de pénalité (objet du délai) ; 'non' : absent. */
  // Phrase de GSS sur la remise d'un document (« Les documents demandés… sont remis… dans les 72 h suivant la première
  // demande ») : son délai est celui que l'acheteur fixe pour ses documents, valable partout (T7N-4).
  const PHRASE_DOCUMENT = (ph: string) => /\b(?:remis|remise|remettre|transmis|transmise|transmission|transmettre|fourni|fournis)\b/i.test(ph)
    && /\b(?:documents?|reportings?|rapports?|plannings?|bons? d.intervention|comptes?[- ]rendus?|habilitations?)\b/i.test(ph);
  const dansDce = (n: string, u: string, ph: string): { statut: 'oui' | 'seuil' | 'non'; objet?: string } => {
    // Même durée dans l'autre unité (« 60 minutes » de GSS, « une heure » du CCTP, T10-COH-1).
    const min = minutesDe(n, u);
    const autre = /^m/i.test(u) ? (min % 60 === 0 ? String(min / 60) : '') : (Number.isFinite(min) && Number.isInteger(min) ? String(min) : '');
    const forme = (x: string) => {
      const chiffre = `${x.replace('.', '[.,]').replace(',', '[.,]')}`;
      // Chiffre et lettres dans les deux ordres : « trente (30) minutes » comme « 30 (trente) minutes » (IFITS).
      const une = LETTRES[x] ? `(?:${chiffre}|${LETTRES[x]})` : chiffre;
      return `${une}(?:\\s*\\(${une}\\))?`;
    };
    const uniteDe = (minutes: boolean) => (minutes ? '(?:minutes?|min\\b|mn\\b)' : '(?:heures?|h\\b)');
    const formesUnite = `(?:${forme(n)}\\s*${uniteDe(/^m/i.test(u))}${autre ? `|${forme(autre)}\\s*${uniteDe(!/^m/i.test(u))}` : ''})`;
    // Un seuil de pénalité (« retard supérieur à 60 min … 300 € HT / manquement », « 200 € par agent demandé pour une
    // mise à disposition urgente attendue dans un délai de 2 heures ») n'est pas un délai d'intervention imposé : il
    // n'autorise pas GSS à promettre ce délai hors Normandie.
    let seuil = '';
    // « 24h/24 » est une amplitude, pas un délai.
    for (const m of dceNorm.matchAll(new RegExp(`(?<![\\d,.])${formesUnite}(?!\\s*/)`, 'gi'))) {
      const autour = dceNorm.slice(Math.max(0, (m.index || 0) - 70), (m.index || 0) + m[0].length + 50);
      // Durée qui n'est pas un délai (« 24 heures de stationnement au tarif horaire ») : ignorée.
      if (/stationnement|tarif|recharge|cons[ée]cuti/i.test(autour.slice(60, 140))) continue;
      // Délai de remise d'un document fixé par l'acheteur (cstb : « non remise de document… remise tardive lors d'une
      // sollicitation ponctuelle (+ 72h à partir de la 1ère demande) ») : exigence valable partout pour une phrase de GSS
      // sur la remise des documents ; jamais un délai de présence pour une autre phrase (T7N-4).
      const debutPhrase = dceNorm.slice(Math.max(0, (m.index || 0) - 200), m.index || 0).split(/[.;!?](?=\s)/).pop() || '';
      if (/\bremis(?:e)?\b|\bdocuments?\b|reportings?|\brapports?\b|\bplannings?\b|sollicitation|transmission/.test(debutPhrase)
        && !/interven|rempla|astreinte|arriv|sur (?:site|place)|lev[ée]e de doute|mobilis|prise de service/.test(debutPhrase)) {
        if (PHRASE_DOCUMENT(ph)) return { statut: 'oui' };
        continue;
      }
      if (!/€|euros?\b|manquement|p[ée]nalit|retard (?:sup|inf)|retard d.un agent/i.test(autour)) return { statut: 'oui' };
      if (seuil) continue;
      // Objet du seuil pris dans son contexte immédiat : « Absence d'un agent ou retard supérieur à 60 min » est une
      // pénalité d'absence ou de retard, pas un délai d'intervention.
      const avant = dceNorm.slice(Math.max(0, (m.index || 0) - 60), m.index || 0);
      const objetDelai = /mise à disposition|intervention|remplacement|prise de service|arrivée/.exec(avant);
      if (!objetDelai && /absence|retard/.test(avant)) {
        seuil = /absence/.test(avant) && /retard/.test(avant) ? 'absence ou retard' : /absence/.test(avant) ? 'absence' : 'retard';
      } else {
        seuil = (objetDelai || /mise à disposition|intervention|remplacement|prise de service|arrivée/.exec(autour) || ['dépassement'])[0];
      }
    }
    return seuil ? { statut: 'seuil', objet: seuil } : { statut: 'non' };
  };
  // Seuils de pénalité cités : le texte dit que c'est l'acheteur qui fixe ces délais (une seule phrase, à la place
  // de la première phrase retirée), sans engagement de GSS ; la question est posée à GSS (retires).
  const seuils: Array<{ duree: string; objet: string }> = [];
  const MARQUE_SEUIL = '\u0001SEUIL\u0001';
  // Sigles à points (« C.C.T.P. : ») : jamais une fin de phrase.
  const proteger = (t: string) => t.replace(/\b((?:[A-Z]\.){2,})/g, (m) => m.replace(/\./g, '\u0002'));
  const retablir = (t: string) => t.replace(/\u0002/g, '.');
  const lignesSource = proteger(texte).split('\n');
  // Ligne de tableau : jugée en entier, sans découpe en phrases (un point dans une cellule ne la coupe pas), et retirée en
  // entier quand elle promet un délai normand (« | Intervention sur alarme | 30 minutes | », REG7-1, comme en 697d1ab) ;
  // un volume horaire (« | Intervenant rondier | … | 96 h par semaine | », T6N-1) ou une plage horaire (« Nuit, 21 h–6 h »)
  // n'est jamais un délai : la ligne reste.
  const estLigneTableau = (l: string) => /^\s*\|/.test(l);
  const lignes = lignesSource.map((ligne) => (estLigneTableau(ligne) ? [ligne] : ligne.split(/(?<=[.!?;])\s+/)).map((ph) => {
    const tableau = estLigneTableau(ph);
    if (!PRESENCE.test(ph) || /⟦AC:|\[CONSULTATION REQUISE/.test(ph)) return ph;
    const hors: string[] = [];
    const seuilsPhrase: Array<{ duree: string; objet: string }> = [];
    for (const m of ph.matchAll(DUREE)) {
      const apres = ph.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 12);
      if (/^\s*avant\b/i.test(apres)) continue;               // « prise de service 15 minutes avant »
      if (/^\s*(?:\/|sur)\s*24\b/i.test(apres)) continue;      // « 24 h/24 », « 24 h sur 24 » : une amplitude, pas un délai
      // Plage horaire d'une ligne de tableau (« Dimanche férié, 6 h–21 h ») : une heure de la journée, pas un délai.
      if (tableau && /^h/i.test(m[2]) && (/^\s*(?:[–-]|à)\s*\d/.test(apres) || /\d\s*h(?:\s*\d{2})?\s*(?:[–-]|à)\s*$/i.test(ph.slice(Math.max(0, (m.index || 0) - 12), m.index || 0)))) continue;
      // Volume horaire (« 96 h par semaine », « 40 h/mois », « 1 607 h par an ») : pas un délai (T6N-1).
      if (/^\s*(?:par|\/)\s*(?:semaine|mois|an|ann[ée]e|jour|nuit)\b|^\s*(?:hebdomadaires?|mensuel(?:le)?s?|annuel(?:le)?s?)\b/i.test(apres)) continue;
      const r = dansDce(m[1], m[2], ph);
      if (r.statut === 'oui') continue;
      hors.push(m[0]);
      // Seuil dont l'objet n'est pas reconnu (« dépassement ») : la phrase est retirée et la question posée, sans phrase type
      // (jamais « GSS organise ses remplacements » pour un délai qui ne porte pas sur une absence, T7N-4).
      if (r.statut === 'seuil' && r.objet !== 'dépassement') seuilsPhrase.push({ duree: m[0].replace(/\s+/g, ' '), objet: r.objet || 'intervention' });
    }
    if (!hors.length) return ph;
    if (tableau) {
      // Ligne entière retirée ; la question part vers GSS avec le contenu des cellules (« Intervention sur alarme — 30 minutes »).
      retires.push(retablir(ph).split('|').map((c) => c.replace(/[*#]/g, '').trim()).filter(Boolean).join(' — '));
      return '';
    }
    retires.push(retablir(ph).replace(/[*#]/g, '').trim());
    if (seuilsPhrase.length === hors.length) {
      const premier = !seuils.length;
      for (const x of seuilsPhrase) if (!seuils.some((y) => y.duree === x.duree)) seuils.push(x);
      // Puce gardée (« - Le marché pénalise… ») : la phrase reste dans sa liste.
      const puce = (/^\s*[-*•]\s+/.exec(ph) || [''])[0];
      if (premier) return puce + (/;\s*$/.test(ph) ? `${MARQUE_SEUIL};` : MARQUE_SEUIL);
    }
    // La puce disparaît avec sa phrase.
    return '';
  })).map((phrases, i) => {
    // Puce dont la première phrase (le libellé) est retirée : la puce entière disparaît, « → notre réponse » compris
    // (jamais de ligne orpheline « → … » ni de suite de puce sans tiret). Une phrase « → … » qui suivait une phrase
    // retirée disparaît aussi.
    if (/^\s*[-*•]\s+/.test(lignesSource[i]) && phrases[0] === '') return '';
    const out: string[] = [];
    for (let k = 0; k < phrases.length; k++) {
      if (phrases[k] === '') continue;
      if (/^\s*→/.test(phrases[k]) && (k === 0 || phrases[k - 1] === '')) continue;
      out.push(phrases[k]);
    }
    return out.join(' ');
  });
  // Lignes de tableau retirées : supprimées sans laisser de ligne vide dans le tableau ; un tableau dont toutes les lignes de
  // données sont retirées disparaît avec son en-tête.
  const gardees: Array<{ l: string; src: number }> = [];
  for (let i = 0; i < lignes.length; i++) {
    if (estLigneTableau(lignesSource[i]) && lignes[i] === '') continue;
    gardees.push({ l: lignes[i], src: i });
  }
  for (let i = 0; i < gardees.length; i++) {
    if (!estLigneTableau(gardees[i].l) || (i > 0 && estLigneTableau(gardees[i - 1].l))) continue;
    let j = i;
    while (j < gardees.length && estLigneTableau(gardees[j].l)) j++;
    // En-tête et séparateur seuls, alors qu'une ligne de données les suivait dans le texte d'origine : tableau retiré.
    const sep = gardees[i + 1];
    if (j - i === 2 && /^\s*\|[\s:|-]+\|\s*$/.test(sep.l) && /-{2,}/.test(sep.l) && estLigneTableau(lignesSource[sep.src + 1] || '')) {
      gardees.splice(i, 2); i--;
    }
  }
  const lignesGardees = gardees.map((x) => x.l);
  let sortie = retablir(lignesGardees.filter((l) => !(l.trim() === '' && /^\s*[-*•]\s*$/.test(l))).join('\n').replace(/^\s*[-*•]\s*$/gm, '').replace(/\n{3,}/g, '\n\n'));
  if (seuils.length) {
    // Préposition élidée devant une voyelle (« délais d'intervention », « d'arrivée »).
    const de = (x: string) => (/^[aeiouyéèêàâîïôûh]/i.test(x) ? `d’${x}` : `de ${x}`);
    const PENALITE = /^(?:absence ou retard|absence|retard|dépassement)$/;
    const delais = seuils.filter((x) => !PENALITE.test(x.objet));
    const penalites = seuils.filter((x) => PENALITE.test(x.objet));
    const parties: string[] = [];
    if (delais.length) {
      const objets = [...new Set(delais.map((x) => x.objet))];
      parties.push(`fixe des délais ${objets.map(de).join(' et ')} de ${delais.map((x) => x.duree).join(' et de ')}`);
    }
    if (penalites.length) {
      // Un seuil de pénalité n'est pas présenté comme un délai fixé par le marché.
      const o = penalites[0].objet;
      const quoi = o === 'absence ou retard' ? 'toute absence ou tout retard d’agent' : o === 'absence' ? 'toute absence d’agent' : o === 'retard' ? 'tout retard d’agent' : 'tout dépassement';
      parties.push(`pénalise ${quoi} de plus de ${[...new Set(penalites.map((x) => x.duree))].join(' ou de ')}`);
    }
    const suite = delais.length && penalites.length ? 'sa mobilisation et ses remplacements' : delais.length ? 'sa mobilisation' : 'ses remplacements';
    const phrase = `Le marché ${parties.join(' et ')} ; GSS organise ${suite} en conséquence`;
    // Suite de la phrase d'origine qui dit déjà comment GSS s'organise (« … ; GSS organise la mobilisation en fonction du délai
    // applicable… », citedia2 474, T5-COH-4) : la phrase type s'arrête au délai, sans redire « GSS organise … en conséquence ».
    sortie = sortie.replace(new RegExp(`${MARQUE_SEUIL};(?=\\s*(?:GSS|nous|elle)\\s+(?:organis|mobilis|adapt|planifi))`), `Le marché ${parties.join(' et ')} ;`);
    sortie = sortie.replace(`${MARQUE_SEUIL};`, `${phrase} ;`).replace(MARQUE_SEUIL, `${phrase}.`).split(MARQUE_SEUIL).join('');
  }
  // « ces délais » sans antécédent (phrase retirée, aucun délai cité avant) : « les délais du marché ».
  {
    sortie = sortie.replace(/\b([Cc])es délais\b|\b([Cc])e délai\b/g, (m, c1: string, c2: string, pos: number) => (
      /d[ée]lais?\b/i.test(sortie.slice(0, pos)) ? m : `${(c1 || c2) === 'C' ? 'L' : 'l'}${c1 ? 'es délais' : 'e délai'} du marché`));
  }
  return { texte: sortie, retires };
}

/**
 * Rappels répétés de la description du site (« domaine de 130 hectares et 40 000 m² de bâtiments »,
 * « plus de 200 personnes ») : un chiffre de site présent dans plus de 3 rubriques est gardé dans les 2
 * premières ; ailleurs, les phrases qui ne font que le rappeler (« Ce fonctionnement est particulièrement
 * adapté à un domaine de… », « compte tenu de l'étendue… ») sont retirées. Renvoie le nombre de phrases retirées.
 */
export function limiterRappelsSite(sections: Record<string, string>, ordre: string[]): number {
  const FIGURE = /\d[\d\s\u00a0\u202f]*(?:,\d+)?\s*(?:hectares|ha\b|m²|m2\b|personnes|bâtiments|niveaux|places)/gi;
  const norm = (f: string) => f.replace(/[\s\u00a0\u202f*]+/g, ' ').trim().toLowerCase();
  const REMPLISSAGE = /(?:est|sont|reste|restent|apparaît) (?:donc |ainsi )?(?:particulièrement |directement |d.autant plus |très )?(?:adapté|adaptée|adaptés|adaptées|pertinente?s?|sensibles?|essentielle?s?|nécessaires?|indispensables?|importante?s?)|tient compte de|tiennent compte de|compte tenu de|au regard de l.(?:ampleur|étendue)|l.(?:ampleur|étendue) du (?:domaine|site)|(?:sur|dans) (?:un|ce) (?:domaine|site|périmètre) (?:de|d.environ|étendu)/i;
  const rubriquesPar = new Map<string, string[]>();
  for (const id of ordre) {
    for (const m of (sections[id] || '').matchAll(FIGURE)) {
      const k = norm(m[0]);
      if (!/^\d{2,}/.test(k.replace(/\s/g, ''))) continue;  // « 2 bâtiments » : pas une description de site
      const l = rubriquesPar.get(k) || [];
      if (!l.includes(id)) l.push(id);
      rubriquesPar.set(k, l);
    }
  }
  let n = 0;
  for (const [fig, ids] of rubriquesPar) {
    if (ids.length <= 3) continue;
    for (const id of ids.slice(2)) {
      sections[id] = sections[id].split('\n').map((ligne) => {
        if (/^\s*(?:#|\|)/.test(ligne)) return ligne;
        return ligne.split(/(?<=[.!?])\s+/).filter((ph) => {
          const garde = !(norm(ph).includes(fig) && REMPLISSAGE.test(ph)) || /⟦AC:|\[CONSULTATION REQUISE/.test(ph);
          if (!garde) n++;
          return garde;
        }).join(' ');
      }).join('\n');
    }
  }
  return n;
}

/**
 * Interdits explicites du DCE qui priment sur les pratiques GSS reprises des anciens mémoires : rondes
 * « effectuées à pied » (aucun vélo, trottinette ni ronde motorisée), photographies interdites (aucune
 * mention de photos ou vidéos dans les comptes rendus). Les phrases et puces contraires sont retirées.
 */
/** Index des phrases du DCE (mots de 3 lettres ou plus), mis en cache par texte de DCE. */
const cacheIndexDce = new Map<string, { phrases: Array<Set<string>>; parMot: Map<string, number[]> }>();
const motsPhrase = (t: string) => new Set(normTxt(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3));
function indexDce(dce: string) {
  const deja = cacheIndexDce.get(dce);
  if (deja) return deja;
  const phrases = String(dce || '').replace(/\s+/g, ' ').split(/(?<=[.!?;:])\s+/).map(motsPhrase).filter((m) => m.size >= 6);
  const parMot = new Map<string, number[]>();
  phrases.forEach((m, i) => { for (const w of m) (parMot.get(w) ?? parMot.set(w, []).get(w)!).push(i); });
  // Quelques textes à la fois (DCE du dossier, texte d'origine d'une modification) : le plus ancien sort.
  if (cacheIndexDce.size >= 4) cacheIndexDce.delete(cacheIndexDce.keys().next().value!);
  const index = { phrases, parMot };
  cacheIndexDce.set(dce, index);
  return index;
}

/**
 * Vrai si la phrase recopie une phrase du DCE : 80 % au moins de ses mots (8 mots ou plus) se retrouvent dans une
 * même phrase du DCE, qui n'en fait pas plus de deux fois et demie la longueur.
 */
export function recopieDuDce(phrase: string, dce: string, seuil = 0.8): boolean {
  const a = motsPhrase(phrase.replace(/[*#]/g, ''));
  if (a.size < 8 || !dce) return false;
  const { phrases, parMot } = indexDce(dce);
  const compte = new Map<number, number>();
  for (const w of a) for (const i of parMot.get(w) || []) compte.set(i, (compte.get(i) || 0) + 1);
  for (const [i, n] of compte) if (n / a.size >= seuil && n / phrases[i].size >= 0.4) return true;
  return false;
}

/**
 * Exigences recopiées du CCTP à la voix de l'acheteur (« Le Titulaire doit… », « son remplaçant devra être présent… »,
 * « Vu que les agents… », « Elle ne devra pas… ») : la phrase recopiée part (elle n'est pas un engagement de GSS) ;
 * le reste passe à la voix de GSS (« le titulaire » → « GSS »). Phrases porteuses d'un repère ou d'un marqueur gardées.
 */
export function sansRecopieCctp(texte: string, dce: string): { texte: string; retires: string[] } {
  const retires: string[] = [];
  if (!dce) return { texte, retires };
  // Bornes en lettres accentuées comprises (\b ne voit pas « é » : « il est demandé », « est réputé » échappaient au motif).
  const VOIX_ACHETEUR = /(?<![\wÀ-ÿ])(?:devra|devront|doit|doivent|est tenu|sont tenus|il est demand[ée]|quels? que soi(?:t|ent)|vu que|à la charge du titulaire|est r[ée]put[ée]|sont r[ée]put[ée]s|ne (?:peut|pourra) (?:invoquer|se pr[ée]valoir))(?![\wÀ-ÿ])|\b(?:le|au|du) titulaire\b/i;
  const garder = (ph: string) => /⟦AC:|\[À COMPLÉTER\]|\[CONSULTATION REQUISE|^\s*#/.test(ph) || !VOIX_ACHETEUR.test(ph) || !recopieDuDce(ph, dce);
  const sortie = texte.split('\n').map((ligne) => {
    if (/^\s*(?:#|\|)/.test(ligne)) return ligne;
    const puce = (/^\s*(?:[-*•]|\d+[.)])\s+/.exec(ligne) || [''])[0];
    const phrases = ligne.slice(puce.length).split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/);
    const gardees = phrases.filter((ph) => { if (garder(ph)) return true; retires.push(ph.replace(/[*#]/g, '').trim()); return false; });
    if (!gardees.length) return null;
    return `${puce}${gardees.join(' ')}`;
  }).filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  return { texte: sortie, retires };
}

/**
 * Réponse d'un champ du cadre : une ligne qui finit par une étiquette « … : » sans rien après (« Outil de pointage des
 * rondes et points de contrôle : ») perd cette étiquette ; une phrase ou une puce déjà écrite plus haut dans le même
 * champ (même texte, ou 90 % des mots) n'est pas répétée.
 */
export function nettoyerChampCadre(texte: string): string {
  const lignes = String(texte || '').split('\n');
  const LISTE = /^\s*(?:[-*•]|\d+[.)])\s+/;
  const out: string[] = [];
  const vues: Array<Set<string>> = [];
  const nombresVus: string[] = [];
  const cles = new Set<string>();
  // Mots porteurs : mots de 3 lettres et plus, et TOUS les nombres (« 2 », « 3 », « 28 ») : sans eux, « Agents SSIAP 2 :
  // SSIAP 1 – SSIAP 2 : 28 » et « Agents SSIAP 3 : SSIAP 1 – 2 – 3 : 2 » se réduisaient à {agents, ssiap} et la ligne
  // SSIAP 3 du tableau des ressources de GSS disparaissait de tous les cadres (T4N-1).
  const mots = (t: string) => new Set(normTxt(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 || /^\d+$/.test(w)));
  const nombres = (t: string) => (normTxt(t).match(/\d+/g) || []).join(' ');
  const deja = (ph: string) => {
    const k = normTxt(ph).replace(/[^a-z0-9]+/g, ' ').trim();
    if (k.split(' ').length < 6 || /\[À COMPLÉTER\]|⟦|\[CONSULTATION/.test(ph)) return false;
    // Ligne de tableau (« a : b : c », issue du texte brut d'un tableau) : jamais un doublon de prose.
    if ((ph.match(/\s:\s/g) || []).length >= 2) return false;
    if (cles.has(k)) return true;
    const m = mots(ph);
    const nb = nombres(ph);
    if (vues.some((v, i) => { if (nombresVus[i] !== nb) return false; let n = 0; for (const w of m) if (v.has(w)) n++; return n / Math.max(m.size, v.size) >= 0.9; })) return true;
    nombresVus.push(nb);
    cles.add(k); vues.push(m);
    return false;
  };
  for (let i = 0; i < lignes.length; i++) {
    let l = lignes[i];
    let j = i + 1;
    while (j < lignes.length && !lignes[j].trim()) j++;
    const suiteListe = j < lignes.length && LISTE.test(lignes[j]);
    // Sous-titre seul sur sa ligne et suivi, sans ligne vide, de son texte (havre2 341, champ 37 : « Un réel engagement : »,
    // « Le recyclage de nos tenues : » du texte de GSS retirés) : ce n'est pas une étiquette vide, il est gardé.
    const sousTitreSuivi = /^[A-ZÀ-Ý][^.!?:]{1,80}\s?:\s*$/.test(l.trim()) && l.trim().split(/\s+/).length <= 9
      && i + 1 < lignes.length && !!lignes[i + 1].trim() && (!/:\s*$/.test(lignes[i + 1]) || lignes[i + 1].trim().split(/\s+/).length > 9);
    // Étiquette finale sans contenu (et sans liste qui suit) : retirée de la ligne.
    if (/:\s*$/.test(l) && !suiteListe && !sousTitreSuivi) {
      const debut = l.search(/(?:^|[.!?]\s+)[^.!?]*:\s*$/);
      const reste = debut <= 0 ? '' : l.slice(0, debut + 1).trim();
      if (debut <= 0 && l.trim().split(/\s+/).length > 12) { /* phrase longue terminée par « : » : gardée */ } else l = reste;
      if (!l.trim()) continue;
    }
    if (LISTE.test(l)) {
      if (deja(l.replace(LISTE, ''))) continue;
      out.push(l);
      continue;
    }
    const puce = '';
    const phrases = l.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/).filter((ph) => !deja(ph));
    if (!phrases.length && l.trim()) continue;
    out.push(`${puce}${phrases.join(' ')}`);
  }
  return contracterArticlesNomsPropres(out.join('\n').replace(/\n{3,}/g, '\n\n'));
}

/**
 * Vocabulaire du CCTP pour la fonction de l'agent qui encadre le poste : le mémoire type dit « chef de site » ou
 * « responsable de site » ; quand le CCTP ne parle que de « chef de poste » (IGN), le mémoire emploie son terme. Dans
 * le texte, le « (responsable de site) » qui suit le nom de l'acheteur (« en concertation avec l'IGN (responsable de
 * site) »), entre parenthèses, n'est pas touché ; dans un titre ou un schéma (`parentheses`), la forme entre
 * parenthèses est celle de GSS (« Contrôle 1 : le contrôle de fond (responsable de site) ») et suit le CCTP.
 */
export function vocabulaireDuCctp(texte: string, dce: string, opts: { parentheses?: boolean } = {}): string {
  const d = normTxt(dce || '');
  const nb = (rx: RegExp) => (d.match(rx) || []).length;
  if (nb(/chefs? de poste/g) < 3 || nb(/(?:chefs?|responsables?) de site/g)) return texte;
  const rx = opts.parentheses ? /\b([Cc]hef|[Rr]esponsable)(s?) de site\b/g : /(?<!\(\s?)\b([Cc]hef|[Rr]esponsable)(s?) de site\b(?!\s*\))/g;
  return texte.replace(rx, (_m, f: string, s: string) => `${/^[CR]/.test(f) ? 'C' : 'c'}hef${s} de poste`);
}

/**
 * Vocabulaire du CCTP pour les textes des schémas de la bibliothèque (même règle que vocabulaireDuCctp) : paires
 * [terme de GSS, terme du CCTP] transmises au moteur de schémas ; vide quand le CCTP n'impose pas son terme.
 */
export function vocabulaireSchemas(dce: string): Array<[string, string]> {
  return vocabulaireDuCctp('chef de site', dce) === 'chef de poste'
    ? [['chef de site', 'chef de poste'], ['responsable de site', 'chef de poste']]
    : [];
}

// Interdit des photos du DCE (« Aucune photographie ou vidéo des installations… ne peut être réalisée… », « il est
// interdit de prendre des photos »), et exception que le DCE lui donne lui-même (citedia, T10C-1 : « Cette interdiction ne
// s'applique pas aux photographies strictement nécessaires… rapports d'intervention », « les photographies justificatives »
// exigées dans le compte rendu).
/**
 * Interdit des photos ou des vidéos (T1-GEN-6) : l'objet (photo, photographie, cliché, prise de vue, filmer, vidéo, appareil
 * photo) et l'interdiction (interdit, interdiction, proscrit, prohibé, défendu, « ne … pas / jamais » autorisé ou permis,
 * « aucune photo ») dans la même proposition, dans un sens ou dans l'autre, à 70 caractères au plus. La vidéosurveillance du
 * site n'est pas une prise de vue.
 */
const OBJET_PHOTO = /(?<![\p{L}])(?:photos?|photographi\w*|clich[ée]s?|prises? de vues?|film(?:er|age|ée?s?)?|vid[ée]os?(?![-\s]?(?:surveillance|protection))|appareils? photo\w*)(?![\p{L}])/iu;
const INTERDICTION = /(?<![\p{L}])(?:interdi(?:t|te|ts|tes|ction)|proscri(?:t|te|ts|tes)|prohib[ée]e?s?|d[ée]fendue?s?|en aucun cas|(?:n['’]est|ne sont|ne seront|ne sera|n['’]y est)\s+(?:pas|jamais|aucunement)\s+(?:autoris|permis|tol[ée]r)|(?:ne|n['’])\s*(?:(?:doi\w*|peu\w*|pourr\w*|devr\w*)\s+)?(?:en aucun cas\s+|jamais\s+|pas\s+|aucunement\s+)(?:prendre|r[ée]aliser|faire|filmer|photographier|utiliser|capter|enregistrer)|aucune?\s+(?:photo|prise|clich|vid[ée]o|image|film))/iu;
function positionInterditPhoto(p: string): number {
  // Prise de vue à titre personnel seulement (« La prise de photos, à titre personnel, est strictement interdite ») : les
  // photos des rapports restent permises ; restriction éventuelle visant le public (« les prises de vues peuvent faire
  // l'objet de restrictions ou d'interdictions… signalées à l'entrée des espaces ») : pas un interdit pour les agents.
  for (const prop of String(p || '').split(/\s*;\s*|\s*:\s+(?=[A-ZÀ-Ý])|\s+[-•▪–]\s+(?=[A-ZÀ-Ýa-zà-ÿ])/)) {
    if (/[àa] titre (?:personnel|priv[ée])|[àa] des fins (?:personnelles|priv[ée]es)|usage (?:personnel|priv[ée])|peu(?:ven)?t faire l.objet d(?:e |es |.)(?:restrictions?|interdictions?)|(?:des |aux )(?:visiteurs|spectateurs|usagers)|du public/i.test(prop)) continue;
    for (const o of prop.matchAll(new RegExp(OBJET_PHOTO.source, 'giu'))) {
      const autour = prop.slice(Math.max(0, o.index! - 70), o.index! + o[0].length + 70);
      if (INTERDICTION.test(autour)) return p.indexOf(prop) + o.index!;
    }
  }
  return -1;
}
const RX_INTERDIT_PHOTOS = { test: (p: string) => positionInterditPhoto(p) >= 0, exec: (p: string) => { const i = positionInterditPhoto(p); return i >= 0 ? { index: i } : null; } };

/** Rondes imposées à pied (T1-GEN-6 : « se font exclusivement à pied », « Toutes les rondes sont pédestres »). */
export const RX_RONDES_A_PIED = /rondes?[^.]{0,60}(?:se font|se feront|sont|seront|effectu[ée]es|r[ée]alis[ée]es|faites|assur[ée]es)\s+(?:(?:exclusivement|uniquement|obligatoirement|imp[ée]rativement|toujours)\s+)?(?:[àa] pied|p[ée]destres?)|rondes? p[ée]destres?/i;
const RX_EXCEPTION_PHOTOS = /(?:ne s.applique pas|n.est pas applicable|ne concerne pas|à l.exception d|sauf\b|excepté)[^.]{0,80}(?:photos?|photographies?|clichés)(?![a-zà-ÿ])/i;
const RX_PHOTOS_EXIGEES = /(?:photos?|photographies?|clichés)\s+(?:justificatives?|de constat)|(?:rapports?|comptes? rendus?)[^.;]{0,120}(?:illustrés?|accompagnés?|comportant|assortis?)[^.;]{0,80}(?:photos?|photographies?)(?![a-zà-ÿ])/i;
const RX_VIDEO = /(?<![a-zà-ÿ])vidéos?(?![a-zà-ÿ])/i;

/** Phrases du DCE (texte remis à plat), coupées aux fins de phrase. */
function phrasesDuDce(dce: string): string[] {
  return String(dce || '').replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý«•\-–])/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Interdit des photos ou des vidéos imposé par le DCE, avec l'exception que le DCE lui donne (photographies nécessaires
 * aux rapports, photographies justificatives exigées ailleurs dans le DCE). `photos` : les photos restent interdites ;
 * `videos` : les vidéos restent interdites ; `citation` : la phrase entière du DCE, exception comprise (D8). null quand le
 * DCE n'interdit rien de ce que fait GSS.
 */
export function interditPhotosDce(dce: string): { photos: boolean; videos: boolean; citation: string } | null {
  const phrases = phrasesDuDce(dce);
  const k = phrases.findIndex((p) => RX_INTERDIT_PHOTOS.test(p));
  if (k < 0) return null;
  const interdit = phrases[k];
  const apres = interdit.slice((RX_INTERDIT_PHOTOS.exec(interdit)?.index || 0) + 1);
  // Exception dans la phrase de l'interdit ou dans les deux suivantes, sinon photos exigées ailleurs dans le DCE.
  const j = RX_EXCEPTION_PHOTOS.test(apres) ? k : [k + 1, k + 2].find((x) => phrases[x] && RX_EXCEPTION_PHOTOS.test(phrases[x])) ?? -1;
  const exigee = j < 0 ? phrases.find((p) => RX_PHOTOS_EXIGEES.test(p) && !RX_INTERDIT_PHOTOS.test(p) && !/interdi|\bne\b[^.]{0,40}\bpas\b/i.test(p)) || '' : '';
  const exception = j >= 0 ? phrases[j] : exigee;
  const photos = !exception;
  // L'interdit vise aussi les vidéos quand sa phrase les nomme ; une exception qui ne parle que de photographies les laisse interdites.
  const videos = photos || (RX_VIDEO.test(interdit) && !RX_VIDEO.test(exception.replace(/vidéo[- ]?(?:surveillance|protection)/gi, '')));
  if (!photos && !videos) return null;
  const citation = j > k ? phrases.slice(k, j + 1).join(' ') : exigee ? `${interdit} […] ${exigee}` : interdit;
  return { photos, videos, citation };
}

export function interditsDce(texte: string, dce: string): string {
  texte = vocabulaireDuCctp(sansContenuCovid(nomsComposesDce(qualificationsInconditionnelles(texte, dce), dce), dce), dce);
  const d = (dce || '').replace(/\s+/g, ' ');
  const contraires: RegExp[] = [];
  if (RX_RONDES_A_PIED.test(d)) {
    contraires.push(/vélo|trottinette|gyropode|rondes?[^.]{0,80}(?:en voiture|en véhicule|motoris)/i);
  }
  const photos = interditPhotosDce(dce);
  if (photos) contraires.push(photos.photos ? /\bphotos?\b|photographi(?!e d.identité)|\bvidéos?\b/i : RX_VIDEO);
  if (!contraires.length) return texte;
  // Une phrase qui RAPPELLE l'interdit (« sans photographie », « interdiction de… ») est conforme ; le vélo
  // pour les trajets domicile-travail (démarche RSE) n'est pas un moyen de ronde. L'utilisation du système de
  // vidéosurveillance du site (formation, levée de doute vidéo) n'est pas une prise de vue par l'agent (T10C-1).
  const conforme = (ph: string) => /\bsans\b|\baucune?\b|\babsence de\b|\bpas de\b|interdi|\bne\b[^.]{0,40}\bpas\b|\bjamais\b|\bn[’']/i.test(ph)
    || /transports? en commun|covoiturage|domicile|trajets?\b|mobilité douce|déplacements? (?:des salariés|domicile)/i.test(ph)
    || (/vidéo[- ]?(?:surveillance|protection)|caméras?|levée de doute vidéo|système (?:de vidéo|du site)/i.test(ph) && !/\bphotos?\b|photographi|\bfilm/i.test(ph));
  const contraire = (ph: string) => contraires.some((rx) => rx.test(ph)) && !conforme(ph) && !/⟦AC:|\[CONSULTATION REQUISE/.test(ph);
  // Élément d'une énumération (« des lampes, des vélos ou trottinettes électriques et des contrôleurs », « de photos ou de
  // vidéos ») : seul cet élément est retiré ; la phrase ou la puce part si elle reste contraire.
  const allege = (ph: string) => {
    let a = ph;
    // Ponctuation reprise seulement là où un élément a été retiré (jamais la virgule « remontés, et le client » ailleurs).
    const sansVelo = a.replace(/(?:,\s*(?:et |ou )?|\s+(?:et|ou)\s+)(?:des |de |du |les )?(?:vélos?|trottinettes?)(?:\s+(?:ou|et)\s+(?:des |de )?(?:vélos?|trottinettes?))?(?:\s+électriques?)?(?=[\s,.;]|$)/gi, '\u0003');
    if (sansVelo !== a) a = sansVelo.replace(/\s*\u0003\s*,\s*et\s+/g, ' et ').replace(/\s*\u0003/g, '').replace(/\s+,/g, ',');
    if (photos && !photos.photos) a = a.replace(/\s+(?:ou|et)\s+(?:de |des |en )?vidéos?(?![a-zà-ÿ])/gi, '').replace(/(?<![a-zà-ÿ])vidéos?\s+(?:ou|et)\s+(?=(?:de |des )?photo)/gi, '');
    return a;
  };
  const traiter = (ph: string) => { if (!contraire(ph)) return ph; const a2 = allege(ph); return contraire(a2) ? null : a2; };
  const lignes = texte.split('\n');
  const sortie: string[] = [];
  lignes.forEach((ligne, i) => {
    if (/^\s*(?:[-*•]\s|\|)/.test(ligne)) {
      const r = traiter(ligne);
      if (r !== null) { sortie.push(r); return; }
      // Dernière puce d'une liste retirée : la puce restante qui la précédait termine la liste (« ; » → « . »).
      const suivante = lignes.slice(i + 1).find((l) => l.trim());
      const finDeListe = !suivante || !/^\s*[-*•]\s/.test(suivante) || lignes[i + 1]?.trim() === '';
      const k = sortie.length - 1;
      if (finDeListe && /[.!?]\s*$/.test(ligne) && k >= 0 && /^\s*[-*•]\s/.test(sortie[k])) sortie[k] = sortie[k].replace(/\s*[;,]\s*$/, '.');
      return;
    }
    sortie.push(ligne.split(/(?<=[.!?])\s+/).map(traiter).filter((ph): ph is string => ph !== null).join(' '));
  });
  return sortie.join('\n');
}

/**
 * Obligations CHIFFRÉES du cahier des charges (échéance « avant le 5 du mois », délai « sous 48 heures », fréquence
 * « 2 fois par nuit », périodicité « toutes les 4 heures ») repérées mot à mot dans les pièces techniques (CCTP,
 * CCAP, annexes), avec pour chacune le motif qui permet de vérifier que le mémoire reprend ce chiffre. Filet de
 * sécurité de la matrice de conformité, dont l'extraction par le modèle varie d'une génération à l'autre (la
 * clause « compte rendu des visites avant le 5 du mois suivant » tombait une fois sur deux).
 */
export function obligationsChiffrees(dce: string): Array<{ phrase: string; cle: RegExp }> {
  const UNITES: Array<[RegExp, string]> = [
    [/^jours?\s+ouvr[ée]s?/i, 'jours?\\s+ouvr[ée]s?'], [/^jours?\s+ouvrables?/i, 'jours?\\s+ouvrables?'], [/^jours?/i, 'jours?'],
    [/^(?:heures?|h)\b/i, '(?:heures?|h)\\b'], [/^(?:minutes?|min|mn)\b/i, '(?:minutes?|min|mn)\\b'],
    [/^semaines?/i, 'semaines?'], [/^mois\b/i, 'mois\\b'],
  ];
  const unite = (u: string) => UNITES.find(([rx]) => rx.test(u.trim()))?.[1] || '';
  const pieces = piecesTechniques(dce);
  const HORS_PRESTATION = /p[ée]nalit|€|euros?\b|factur|paiement|mandatement|int[ée]r[êe]ts|avance|acompte|r[ée]vis(?:ion|er)|\bprix\b|actualisation|garantie (?:[àa] premi[èe]re demande|financi[èe]re|bancaire|de parfait)|r[ée]siliation|reconduction|notifi|litige|tribunal|\boffres?\b|candidat|date limite|remise des plis|questions?\b|d[ée]lai de validit|sous-trait|assurance|ordre de service|admission|r[ée]ception des prestations|v[ée]rifications? (?:quantitative|qualitative)|retenue|variation|dur[ée]e (?:du march|de l.accord)|\bans?\b[^.]{0,20}(?:reconductible|ferme)|prolongation|préavis|pr[ée]avis|cong[ée]s pay|convention collective|code du travail|article [LR]\s?\d/i;
  const ACHETEUR = /\b(?:le pouvoir adjudicateur|l.acheteur|l.administration|la personne publique|le ma[îi]tre d.ouvrage|le client|l.[ée]tablissement)\s+(?:dispose|peut|pourra|notifie|informe|transmet|adresse|communique|se r[ée]serve)/i;
  const out: Array<{ phrase: string; cle: RegExp }> = [];
  const vues = new Set<string>();
  for (const piece of pieces) {
    const phrases = piece.replace(/[ \t]+/g, ' ').split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦]|\d+[.)])\s+|\n{2,}/).map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦]\s*/, '').trim()).filter((x) => x.length >= 25 && x.length <= 400);
    for (const ph of phrases) {
      if (HORS_PRESTATION.test(ph) || ACHETEUR.test(ph)) continue;
      const motifs: string[] = [];
      let m: RegExpExecArray | null;
      const rxEch = /avant le (\d{1,2})(?:er)?\s+(?:du mois|de chaque mois)/gi;
      while ((m = rxEch.exec(ph))) motifs.push(`(?:avant (?:le )?|le )${m[1]}(?:er)?\\b[^.\\n]{0,25}mois|\\b${m[1]}(?:er)? (?:du|de chaque) mois`);
      const LETTRES: Record<string, string> = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', dix: '10', quinze: '15', trente: '30', 'quarante-huit': '48' };
      const rxDelai = /(?:au (?:moins|minimum|plus tard)(?: dans)?|dans un d[ée]lai(?: maxim(?:um|al))?(?: de)?|sous|en moins de|dans les|dans|d[ée]lai de|pr[ée]avis de)\s+(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|trente|quarante-huit)\s*(?:\(\d+\)\s*)?(jours?\s+ouvr[ée]s?|jours?\s+ouvrables?|jours?|heures?|h\b|minutes?|min\b|mn\b|semaines?|mois\b)/gi;
      // Délai écrit sans chiffre (« d'une heure », « dans l'heure », « d'une demi-heure », T10-COH-1) : lu sur une copie remise
      // à la forme chiffrée ; la phrase citée reste celle du DCE.
      const phDelai = normaliserExpressionsDelai(ph);
      while ((m = rxDelai.exec(phDelai))) {
        const u = unite(m[2]);
        const n = LETTRES[m[1].toLowerCase()] || m[1];
        const lettres = Object.keys(LETTRES).filter((k) => LETTRES[k] === n).join('|');
        if (!u) continue;
        // La même durée dans l'autre unité est aussi une reprise (« 60 minutes » pour « une heure », « demi-heure »).
        const min = /minutes/.test(u) ? Number(n) : /heures/.test(u) ? Number(n) * 60 : NaN;
        const equivalents = Number.isFinite(min) ? [
          ...(/heures/.test(u) ? [`\\b${min}\\s*(?:minutes?|min|mn)\\b`] : min % 60 === 0 ? [`\\b(?:${min / 60}${min === 60 ? '|une?' : ''})\\s*(?:heures?|h)\\b`] : []),
          ...(min === 30 ? ['demi-heure'] : []), ...(min === 60 ? ["dans l['’]heure"] : []),
        ] : [];
        motifs.push([`\\b(?:${n}${lettres ? `|${lettres}` : ''})\\s*${u}`, ...equivalents].join('|'));
      }
      // Fréquences (T3G-7) : nombre en chiffres ou en lettres, « deux (2) », complément du nom (« 3 rondes de surveillance par
      // nuit », « 4 contrôles inopinés par mois »), « / » pour « par » (« 2 rondes/nuit »), « au cours de la nuit », « une ronde
      // par heure », et « Rondes de surveillance : 3 par nuit ».
      const NB_FREQ = '(\\d{1,2}|une?|deux|trois|quatre|cinq|six|sept|huit|dix|douze)(?:\\s*\\(\\s*\\d{1,2}\\s*\\))?';
      const OBJET_FREQ = '(?:fois|passages?|rondes?|contr[ôo]les?|visites?|r[ée]unions?)';
      const PERIODE_FREQ = '(heure|jour|nuit|semaine|mois|trimestre|semestre|an|vacation|poste)';
      const rxFreq = new RegExp(`\\b${NB_FREQ}\\s*${OBJET_FREQ}(?:\\s+(?:de|d['’])\\s*[a-zà-ÿ]+|\\s+(?!par\\b|au\\b|chaque\\b)[a-zà-ÿ]+(?:e?s)?){0,2}\\s*(?:au minimum\\s+|minimum\\s+)?(?:par|\\/|au cours d(?:e la|u|e l['’])|chaque)\\s*${PERIODE_FREQ}\\b|\\b${OBJET_FREQ}[^:.;]{0,40}:\\s*${NB_FREQ}\\s*(?:par|\\/)\\s*${PERIODE_FREQ}\\b`, 'gi');
      const CHIFFRE: Record<string, string> = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', dix: '10', douze: '12' };
      while ((m = rxFreq.exec(ph))) {
        const nb = (m[1] || m[3] || '').toLowerCase();
        const per = m[2] || m[4] || '';
        const n = CHIFFRE[nb] || nb;
        const lettres = Object.keys(CHIFFRE).filter((k) => CHIFFRE[k] === n).join('|');
        motifs.push(`\\b(?:${n}${lettres ? `|${lettres}` : ''})\\s*(?:\\(\\s*\\d+\\s*\\)\\s*)?(?:fois|passages?|rondes?|contr[ôo]les?|visites?|r[ée]unions?)[^.\\n]{0,40}${per}`);
      }
      const rxPer = /\b(?:tous les|toutes les)\s+(\d{1,3})\s*(heures?|h\b|minutes?|min\b|jours?|semaines?|mois\b)/gi;
      // Sur la copie aux nombres chiffrés (« toutes les deux heures » → « toutes les 2 heures »).
      while ((m = rxPer.exec(phDelai))) { const u = unite(m[2]); if (u) motifs.push(`\\b${m[1]}\\s*${u}`); }
      // Échéance avant le mois (« dix (10) jours avant le début du mois », « au plus tard le 20 du mois précédent »).
      const rxAvant = /(?<![\d,])(?:[a-zà-ÿ-]+\s*\(\s*(\d{1,3})\s*\)|(\d{1,3})(?:\s*\(\s*\d+\s*\))?)\s*(jours?(?:\s+ouvr[ée]s?|\s+ouvrables?|\s+calendaires?)?)\s+avant\s+(?:le|la|chaque|toute?)\b/gi;
      while ((m = rxAvant.exec(phDelai))) { const u = unite(m[3]); if (u) motifs.push(`\\b${m[1] || m[2]}\\s*${u}`); }
      const rxLe = /au plus tard le (\d{1,2})(?:er)?\s+du mois (?:pr[ée]c[ée]dent|suivant|en cours)/gi;
      while ((m = rxLe.exec(ph))) motifs.push(`\\b${m[1]}(?:er)?\\s+du mois`);
      if (!motifs.length) continue;
      const cle = ph.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿœ]+/g, ' ');
      if (vues.has(cle)) continue;
      vues.add(cle);
      out.push({ phrase: ph, cle: new RegExp(motifs.join('|'), 'i') });
    }
  }
  return out;
}

/** Pièces techniques du DCE (CCTP, CCAP, annexes) : le RC, l'acte d'engagement et les bordereaux de prix ne décrivent pas la prestation. */
/**
 * Pièce du cahier des charges (CCTP et ses autres noms : « C_C_T_P_ COMMUN », « CCP VF SECU EVEN »,
 * « Cahierdesclausesparticulieres », « Cahier des charges », « Prescriptions techniques », « Spécifications techniques »,
 * « CdC »), jamais le CCAP : une seule règle pour l'ordre de lecture du DCE, texteCctp, piecesTechniques et l'alerte du
 * CCTP absent (T1-COH-3, T1-GEN-13). Le nom est comparé avec et sans séparateurs.
 */
/**
 * Écriture unique des qualifications SSIAP (T1-GEN-10, T2-GEN-7) : « S.S.I.A.P. » → « SSIAP » ; « SSIAP (de) niveau 2 » →
 * « SSIAP 2 » ; « SSIAP II » → « SSIAP 2 » ; « SSIAP2 » → « SSIAP 2 ». Partagée par la lecture des qualifications du DCE et par
 * le dimensionnement (intitulés de poste).
 */
export function normaliserSsiap(t: string): string {
  return String(t || '')
    .replace(/(?<![\wÀ-ÿ])S\.\s?S\.\s?I\.\s?A\.\s?P\.?/gi, 'SSIAP')
    .replace(/SSIAP\s*(?:\(\s*)?(?:de\s+)?niveau\s*(?:n°\s*)?([123]|I{1,3})(?![\wÀ-ÿ])\s*\)?/gi, (_m, n: string) => `SSIAP ${({ I: '1', II: '2', III: '3' } as Record<string, string>)[n.toUpperCase()] || n}`)
    .replace(/SSIAP\s*(I{1,3})(?![\wÀ-ÿ])/g, (_m, n: string) => `SSIAP ${({ I: '1', II: '2', III: '3' } as Record<string, string>)[n]}`)
    .replace(/SSIAP(?=[123](?!\d))/gi, 'SSIAP ');
}

/**
 * Cahier des clauses administratives ET techniques particulières (CCATP, courant dans les MAPA, T2-COH-6) : un cahier des
 * charges, jamais un CCAP.
 */
export const RX_CCATP = /c\.?\s?c\.?\s?a\.?\s?t\.?\s?p(?![a-z])|clauses\s*administratives\s*et\s*techniques|clausesadministrativesettechniques/i;
export function estCahierDesCharges(nomPiece: string): boolean {
  const n = String(nomPiece || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/_/g, ' ');
  const colle = n.replace(/[^a-z0-9]+/g, '');
  if (RX_CCATP.test(n) || RX_CCATP.test(colle)) return true;
  if (/ccap|clauses ?administratives|clausesadministratives/.test(`${n} ${colle}`)) return false;
  // Dossier technique amiante (DTA), diagnostics, plan de prévention : pas le cahier des charges.
  if (/amiante|diagnostic|plan de prevention|(?<![a-z])dta(?![a-z])/.test(n)) return false;
  // « Descriptif technique », « Descriptif des prestations » (MAPA, T2-COH-6) : la description technique de la prestation.
  // Autres noms courants du cahier des charges (T3G-2) : « Description des prestations », « Dossier technique », « Expression des
  // besoins », « Cahier technique », « Annexe technique », « Termes de référence », « Spécifications ».
  return /cctp|(?<![a-z])ccp(?![a-z])|(?<![a-z])cdc(?![a-z])|cahier des (?:clauses|charges)|clauses techniques|prescriptions techniques|specifications techniques|programme fonctionnel|descriptif (?:technique|des prestations)|description (?:technique |detaillee )?des (?:prestations|besoins)|dossier technique|expression des besoins|cahier technique|annexe technique|termes de reference|(?<![a-z])specifications(?![a-z])/.test(n)
    || /cctp|cahierdes(?:clauses|charges)|clausestechniques|prescriptionstechniques|specificationstechniques|descriptif(?:technique|desprestations)|descriptiondesprestations|dossiertechnique|expressiondesbesoins|cahiertechnique|annexetechnique|termesdereference/.test(colle);
}

/**
 * Cahier des charges reconnu par son contenu quand son nom ne le dit pas (T3G-2 : « Pièce 3.pdf » qui commence par
 * « DESCRIPTION DES PRESTATIONS ») : pièce ni administrative ni bordereau, dont les 3 000 premiers caractères portent un titre de
 * cahier des charges ou de description des prestations, ou un article d'objet suivi d'obligations du titulaire.
 */
export function estCahierDesChargesParContenu(nomPiece: string, corps: string): boolean {
  if (estCahierDesCharges(nomPiece)) return true;
  if (estPieceAdministrative(nomPiece) || /annexe|plan|photo|(?<![a-z])bpu(?![a-z])|dpgf|dqe|(?<![a-z])ccap(?![a-z])/i.test(String(nomPiece || '').replace(/_/g, ' '))) return false;
  const debut = String(corps || '').slice(0, 3000);
  if (/cahier\s+des\s+(?:clauses\s+techniques|clauses\s+particuli[eè]res|charges)|descri(?:ption|ptif)\s+(?:technique\s+|d[ée]taill[ée]e\s+)?des\s+(?:prestations|besoins)|expression\s+des\s+besoins|dossier\s+technique|termes\s+de\s+r[ée]f[ée]rence|sp[ée]cifications\s+techniques/i.test(debut)) return true;
  return /article\s*1\b[^\n]{0,60}objet/i.test(debut) && /\ble\s+(?:titulaire|prestataire)\b/i.test(String(corps || '').slice(0, 8000)) && !/r[èe]glement\s+de\s+(?:la\s+)?consultation|acte\s+d.engagement|clauses\s+administratives/i.test(debut);
}

/** Pièce sans exigence technique (RC, AE, bordereaux, formulaires, cadre de réponse, CCAP…). */
export function estPieceAdministrative(nomPiece: string): boolean {
  // Soulignés lus comme des espaces (T3-COH-6 : « RC_gardiennage_2026.pdf », « 01_RC.pdf » : « RC » est un mot).
  const brut = String(nomPiece || '').replace(/_/g, ' ');
  const nom = `${brut} ${brut.replace(/[_.\s-]+/g, '')}`;
  if (RX_CCATP.test(nom)) return false;
  return /\bRC\b|r[èe]glement (?:de (?:la )?)?consultation|acte d.engagement|\bAE\b|DPGF|BPU|DQE|bordereau|\bDC\s?\d|attestation|cadre de r[ée]ponse|m[ée]moire|candidature|lettre|avis|ccap|clauses administratives/i.test(nom);
}

function piecesTechniques(dce: string): string[] {
  const blocs = (dce || '').split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const pieces: string[] = [];
  for (let i = 1; i < blocs.length; i += 3) {
    const brut = blocs[i] || blocs[i + 1] || '';
    const nom = `${brut} ${brut.replace(/[_.\s-]+/g, '')}`;  // « C_C_T_P_ COMMUN » → « CCTPCOMMUN »
    const corps = blocs[i + 2] || '';
    // CCAP gardé (obligations chiffrées) ; toute autre pièce non administrative est lue, même nommée autrement
    // (« DCE_Gardiennage_2026.pdf », « Prescriptions techniques », T1-GEN-13).
    if (/ccap/i.test(nom)) { pieces.push(corps); continue; }
    if (estPieceAdministrative(brut)) continue;
    pieces.push(corps);
  }
  if (!pieces.length && !/--- .+? ---|===== PIÈCE/.test(dce || '')) pieces.push(dce || '');
  return pieces;
}

/**
 * Texte du CCTP et de ses annexes (sans CCAP, RC, AE, bordereaux ni cadre de réponse), tronqué à `max` caractères :
 * les exigences de la prestation, sans les seuils de pénalité du CCAP.
 */
export function texteCctp(dce: string, max = 120_000): string {
  const blocs = (dce || '').split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const pieces: string[] = [];
  const cahiers: string[] = [];
  const autres: string[] = [];
  for (let i = 1; i < blocs.length; i += 3) {
    const brut = blocs[i] || blocs[i + 1] || '';
    const nom = `${brut} ${brut.replace(/[_.\s-]+/g, '')}`;
    if (estPieceAdministrative(brut) || /d[ée]claration/i.test(nom)) continue;
    // Le cahier des charges d'abord (tous ses noms, T1-COH-3), ses annexes ensuite, puis les pièces non classées (la
    // troncature porte sur elles).
    if (estCahierDesCharges(brut)) cahiers.push(`=== ${brut} ===\n${blocs[i + 2] || ''}`);
    else if (/programme|annexe|besoin|consignes?|proc[ée]dure/i.test(nom)) pieces.push(`=== ${brut} ===\n${blocs[i + 2] || ''}`);
    else autres.push(`=== ${brut} ===\n${blocs[i + 2] || ''}`);
  }
  pieces.unshift(...cahiers);
  pieces.push(...autres);
  const t = pieces.length ? pieces.join('\n\n') : (dce || '');
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * DCE réordonné, cahier des charges en tête (tous ses noms), puis les autres pièces dans leur ordre, tronqué à `max` : ce
 * que lit la compréhension du besoin (T1-COH-3 : pour citedia2, le CCTP commençait au caractère 74 645 et n'était jamais lu).
 */
export function dceCctpDAbord(dce: string, max = 60_000): string {
  const t = String(dce || '');
  const blocs = t.split(/(?=\n\n--- .+? ---\n|\n?===== PIÈCE : .+? =====\n)/);
  if (blocs.length <= 1) return t.slice(0, max);
  const nomDe = (b: string) => (/--- (.+?) ---|===== PIÈCE : (.+?) =====/.exec(b) || [])[1] || (/===== PIÈCE : (.+?) =====/.exec(b) || [])[1] || '';
  // Le CCTP lui-même, puis ses annexes (« Annexe 1 CCTP - Besoin par sites »).
  const corpsDe = (b: string) => b.replace(/^\n*(?:--- .+? ---|===== PIÈCE : .+? =====)\n/, '');
  const cahier = (b: string) => estCahierDesChargesParContenu(nomDe(b), corpsDe(b));
  const cahiers = [...blocs.filter((b) => cahier(b) && !/annexe/i.test(nomDe(b))), ...blocs.filter((b) => cahier(b) && /annexe/i.test(nomDe(b)))];
  const reste = blocs.filter((b) => !cahiers.includes(b));
  return [...cahiers, ...reste].join('').slice(0, max);
}

const MOIS_RX = String.raw`(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)`;
const PERIODE_RX = new RegExp(String.raw`^(?:[-•▪●○◦➢>]\s*)?((?:(?:du|de|à partir du|a partir du)\s+)?\d{1,2}\s*(?:er)?\s+${MOIS_RX}(?:\s+\d{4})?\s+(?:au|à|a|jusqu['’]au)\s+\d{1,2}\s*(?:er)?\s+${MOIS_RX}(?:\s+\d{4})?(?:\s+inclus)?|${MOIS_RX}(?:\s*(?:,|\bet\b)\s*${MOIS_RX})*|(?:en\s+|pendant\s+(?:la\s+|les\s+)?)?(?:p[ée]riode|saison)\s+(?:estivale|hivernale|scolaire|haute|basse)|(?:haute|basse|hors)\s+saison|(?:hors\s+|pendant\s+les\s+)?vacances\s+scolaires|en\s+[ée]t[ée]|en\s+hiver)\s*:`, 'i');

/**
 * Période de l'année écrite en tête d'une ligne (« Du 1er avril au 30 septembre : », « Janvier, février, novembre et
 * décembre : », « Hors saison : ») : la période, avec sa majuscule, sinon ''.
 */
export function periodeEnTete(ligne: string): string {
  const m = PERIODE_RX.exec(String(ligne || '').replace(/\s+/g, ' ').trim());
  if (!m) return '';
  const p = m[1].replace(/\s+/g, ' ').trim();
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * Horaires imposés par le cahier des charges (ouverture, fermeture, mise sous alarme, vacations, rondes, relèves) :
 * phrases citées telles quelles, pour le contrôle des contradictions (« fermeture de Coriolis à 19 h » alors que le
 * CCTP fixe la fermeture aux usagers à 21 h et la mise sous alarme à 22 h).
 */
/**
 * Heure lisible dans un texte (T1-GEN-14) : « 8h », « 8h00 », « 8 h 30 », « 08:00 », « 8 heures », « 8 heures 30 »,
 * « 19.30 » (après « de », « à », « entre », « et », « dès »), « huit heures », « midi », « minuit ». Même lecture que
 * dimensionnement.heureDe.
 */
// « N heures » n'est une heure que dans une plage (« de 8 heures à 18 heures », « entre 19.30 et 7.30 ») ou après « à »,
// « dès », « jusqu'à », « vers », « avant », « après » ; jamais une durée (« par période de douze heures », « d'une durée de
// 4 heures », « sous 2 heures »).
const LETTRES_HEURE = String.raw`(?:une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt|vingt-et-une|vingt-deux|vingt-trois|vingt-quatre)`;
const HEURE_MOT = String.raw`(?:(?:[01]?\d|2[0-4])\s*heures?(?:\s*[0-5]\d)?(?![\d\p{L}])|(?:[01]?\d|2[0-3])\.[0-5]\d(?![\d])|${LETTRES_HEURE}\s+heures?(?![\p{L}]))`;
const POINT = String.raw`(?<=(?:^|[^\p{L}])(?:à|dès|jusqu['’]à|vers|avant|après|depuis)\s)`;
const PLAGE = String.raw`(?<=(?:^|[^\p{L}])(?:de|entre)\s)(?=${HEURE_MOT}\s*(?:à|et|-|–)\s*(?:\d|${LETTRES_HEURE}|midi|minuit))`;
export const RX_HEURE = new RegExp(String.raw`(?<![\d.,:])(?:[01]?\d|2[0-4])\s*h(?:\s*[0-5]\d)?(?![\d\p{L}])|(?<![\d.,:])(?:[01]?\d|2[0-4]):[0-5]\d(?![\d])|${POINT}${HEURE_MOT}(?!\s*(?:de\s|d['’]|par\s|sur\s|cons[ée]cutives|maxim|minim|au plus|au moins))|${PLAGE}${HEURE_MOT}|(?<![\p{L}-])(?<!apr[èe]s[- ])(?:midi|minuit)(?![\p{L}-])`, 'iu');
export function contientHeure(t: string): boolean {
  return RX_HEURE.test(String(t || ''));
}

const OBJET_HORAIRE_DEFAUT = /ouvert|ferm|alarme|vacation|ronde|relève|pr[ée]sence|poste|horaire|pause|accueil/i;
/**
 * Horaire imposé reconnu par sa forme (T3G-6 : « Un agent de sécurité est présent du lundi au vendredi de 8h00 à 18h00 », « La
 * surveillance du site est assurée … de 19h00 à 07h00 », « Le gardien est sur site de 21h00 à 05h00 toutes les nuits ») : une
 * plage horaire (deux heures reliées), ou une heure avec des jours ; jamais les heures de la remise des offres, d'une visite ou
 * de l'ouverture des plis (RC).
 */
const PLAGE_HORAIRE = /\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*(?:[àa]|-|–|jusqu['’]?\s*[àa])\s*\d{1,2}\s*(?:h|:|heures)/i;
const JOURS_HORAIRE = /(?:du\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+au|tous\s+les\s+jours|toutes\s+les\s+nuits|chaque\s+(?:jour|nuit)|en\s+semaine|week-?ends?|jours\s+f[ée]ri[ée]s|en\s+continu)/i;
/** Sujet d'un horaire de service (agent présent, surveillance assurée, prestation réalisée…), jamais l'accès des usagers. */
const SUJET_SERVICE = /(?<![\p{L}])(?:agents?|gardiens?|veilleurs?|ssiap|aps|rondiers?|chefs?\s+d['’]\s*[ée]quipe|ma[îi]tres?[- ]chiens?|pr[ée]sente?s?|assur\p{L}*|effectu\p{L}*|r[ée]alis\p{L}*|en\s+service|sur\s+(?:le\s+)?site|surveillance|gardiennage|s[ée]curit[ée]|s[ûu]ret[ée]|prestations?|continu)(?![\p{L}])/iu;
const HORAIRE_RC = /remise\s+des\s+(?:offres|plis)|date\s+(?:et\s+heure\s+)?limite|r[ée]ception\s+des\s+(?:offres|plis)|ouverture\s+des\s+plis|visite\s+(?:obligatoire|du\s+site|des\s+lieux|sur\s+site)|questions?\s+(?:des\s+candidats|écrites)/i;

export function horairesImposes(dce: string, max = 30, objet = OBJET_HORAIRE_DEFAUT, o: { periodes?: boolean } = {}): string[] {
  const out: string[] = [];
  const vues = new Set<string>();
  // Option « periodes » (texte de secours du bloc 1, T8CS-1) : la période de l'année écrite seule sur sa ligne avant une
  // liste d'horaires (« Du 1er avril au 30 septembre : », « Janvier, février, novembre et décembre : ») est écrite devant
  // chacun d'eux ; sans elle, « de 9h20 à 18h10 » puis « de 9h20 à 17h40 » semblaient se contredire (fontainebleau).
  let periode = '';
  // Titre de partie propre à un site (« Campus de Thiais », « Bâtiment Coriolis : ») : il précède chaque horaire cité,
  // sinon les horaires de deux campus aux phrases identiques étaient confondus (ou fusionnés en un seul).
  const TITRE = /(?:campus|site|b[âa]timent|parc|parking|lot\b|antenne|tribunal|palais|juridiction|poste de)/i;
  let plein = false;
  for (const piece of piecesTechniques(dce)) {
    let section = '';
    let tampon: string[] = [];
    const vider = () => {
      const texte = tampon.join('\n');
      tampon = [];
      const phrases = texte.replace(/[ \t]+/g, ' ').split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/).map((x) => x.replace(/\s+/g, ' ').trim().replace(/^[-•▪●○◦−]\s*/, '').trim()).filter((x) => x.length >= 30 && x.length <= 350);
      for (const ph of phrases) {
        if (plein) return;
        if (out.length >= max) {
          // Option « periodes » : la liste d'une période coupée par le maximum est retirée entière (jamais « Mai, juin… :
          // Jardin Anglais » sans les autres jardins de la même période).
          if (o.periodes && periode) while (out.length && out[out.length - 1].replace(/^\[[^\]]*\]\s*/, '').startsWith(`${periode} : `)) out.pop();
          plein = true;
          return;
        }
        if (!contientHeure(ph)) continue;
        if (!objet.test(ph) && !(objet === OBJET_HORAIRE_DEFAUT && (PLAGE_HORAIRE.test(ph) || JOURS_HORAIRE.test(ph)) && SUJET_SERVICE.test(ph))) continue;
        if (/p[ée]nalit|€|euros?\b|taux horaire|\b(?:J|N)\s+(?:J|N)\b/i.test(ph) || HORAIRE_RC.test(ph)) continue;
        const phrase = periode && !ph.toLowerCase().includes(periode.toLowerCase()) ? `${periode} : ${ph}` : ph;
        const cle = `${section}|${phrase}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ');
        if (vues.has(cle)) continue;
        vues.add(cle);
        out.push(section && !phrase.toLowerCase().includes(section.toLowerCase()) ? `[${section}] ${phrase}` : phrase);
      }
    };
    periode = '';
    let retraitItems = -1;
    let premierPuce = false;
    let finListe = false;
    // Ordinal en exposant écrit sur sa propre ligne par la lecture du PDF (« Du 1 ⏎ er ⏎ avril au 30 septembre : »).
    const lignes = (o.periodes ? piece.replace(/(\d)[ \t]*\n[ \t]*(er|re|e|ème)[ \t]*\n[ \t]*/g, '$1$2 ') : piece).split('\n');
    for (const ligne of lignes) {
      const l = ligne.replace(/\s+/g, ' ').trim();
      if (o.periodes) {
        // La période vaut pour les lignes qui la suivent, jusqu'à une ligne vide, une autre période ou une ligne moins
        // en retrait que ses éléments (« Le parc … est quant à lui ouvert 24h/24h », fontainebleau).
        const retrait = (/^\s*/.exec(ligne) || [''])[0].replace(/\t/g, '    ').length;
        const enTete = l.length <= 90 && /:\s*$/.test(l) ? periodeEnTete(l) : '';
        // La ligne n'est faite que de la période (« Du 1er avril au 30 septembre : »).
        const p = enTete && l.replace(/^[-•▪●○◦➢>]\s*/, '').replace(/\s*:\s*$/, '').length <= enTete.length + 1 ? enTete : '';
        if (p) {
          vider();
          periode = p;
          retraitItems = -1;
          finListe = false;
          continue;
        }
        if (periode) {
          const puce = /^[-•▪●○◦]/.test(l);
          if (!l) { vider(); periode = ''; }
          else if (retraitItems < 0) { retraitItems = retrait; premierPuce = puce; }
          // Fin de la liste : ligne moins en retrait que ses éléments, ligne sans puce après des éléments à puce, ou ligne
          // qui suit le dernier élément (« … 19h30. » après des éléments terminés par « ; »).
          else if ((retrait < retraitItems || (premierPuce && !puce) || finListe) && !puce) { vider(); periode = ''; }
          finListe = !!periode && /\.\s*$/.test(l);
        }
      }
      if (l && l.length <= 60 && /^[A-ZÀ-Ý0-9]/.test(l) && !/[.;,]/.test(l.replace(/^\d+(?:\.\d+)*\s*/, '')) && TITRE.test(l) && !/\b\d{1,2}\s*h\s*\d{0,2}\b/i.test(l)
        && !/\b(?:doi(?:t|vent)|veill\w*|dispose\w*|concerne\w*|est|sont|sera|seront|assur\w+|effectu\w+)\b/i.test(l)) {
        vider();
        section = l.replace(/\s*:\s*$/, '');
        periode = '';
      }
      tampon.push(ligne);
    }
    vider();
    if (plein || out.length >= max) break;
  }
  return out;
}

/** Obligations chiffrées du cahier des charges dont le chiffre n'apparaît nulle part dans le mémoire. */
export function obligationsChiffreesAbsentes(dce: string, memoire: string): string[] {
  const texte = (memoire || '').replace(/\*\*|__|⟦AC:\d+⟧/g, '').replace(/[\u00a0\u202f]/g, ' ');
  return obligationsChiffrees(dce).filter((o) => !o.cle.test(texte)).map((o) => o.phrase);
}

/** Mesures liées à la Covid : une mesure n'est citée que si le DCE l'exige lui-même, sous le même terme. */
const MESURES_COVID = [/pass(?:es)? sanitaires?/i, /gestes? barri[èe]res?/i, /gel hydro-?alcoolique|hydroalcool/i];
/** Le mot « Covid » lui-même : jamais écrit (règle de GSS), même quand le DCE l'emploie. */
const MOT_COVID = /\bcovid(?:-19)?\b/i;

/**
 * Motif Covid interdit dans un texte pour ce DCE : le mot « Covid » (toujours), ou une mesure (pass sanitaire, gestes
 * barrières, gel hydroalcoolique) que le DCE ne cite pas. Avant, toute mention de l'un de ces termes dans le DCE
 * (Becquerel : « la période covid du précédent marché ») autorisait toutes les autres et le mot Covid.
 */
export function motifCovidInterdit(dce: string): RegExp {
  const d = String(dce || '');
  const interdits = [MOT_COVID, ...MESURES_COVID.filter((rx) => !rx.test(d))];
  return new RegExp(interdits.map((rx) => rx.source).join('|'), 'i');
}

/**
 * Mesures Covid reprises d'anciens mémoires (« contrôle des pass sanitaires », gestes barrières, gel hydroalcoolique) :
 * retirées (élément d'énumération, sinon la phrase), sauf la mesure que le DCE exige lui-même (Vitry : lecteur de QR
 * codes pour les pass sanitaires en cas de crise sanitaire). Le mot « Covid » n'est jamais écrit : « plan Covid »,
 * « période Covid », « crise de la Covid-19 » deviennent « plan de crise sanitaire », « crise sanitaire ».
 */
export function sansContenuCovid(texte: string, dce: string): string {
  if (!MOT_COVID.test(texte) && !MESURES_COVID.some((rx) => rx.test(texte))) return texte;
  let t = texte
    .replace(/\bplans? (?:de |d['’])?(?:la )?covid(?:-19)?\b/gi, (m) => (/^plans/i.test(m) ? 'plans de crise sanitaire' : 'plan de crise sanitaire'))
    .replace(/\b(?:p[ée]riode|crise|[ée]pid[ée]mie|pand[ée]mie) (?:de (?:la )?|du )?covid(?:-19)?\b/gi, 'crise sanitaire');
  const COVID = motifCovidInterdit(dce);
  if (!COVID.test(t)) return t;
  if (!MESURES_COVID[0].test(String(dce || ''))) t = t.replace(/,?\s*(?:ou |et )?(?:de |du |le |la |des )?(?:contr[ôo]les?|v[ée]rifications?) (?:des |du )?pass(?:es)? sanitaires?/gi, '');
  return t.split('\n').map((ligne) => {
    if (!COVID.test(ligne)) return ligne;
    if (/^\s*(?:[-*•]|\d+[.)])\s/.test(ligne)) return null;
    return ligne.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(⟦*])/).filter((ph) => !COVID.test(ph) || /⟦AC:|\[À COMPLÉTER\]/.test(ph)).join(' ');
  }).filter((l): l is string => l !== null).join('\n');
}

/** Distance d'édition (nombre de lettres à changer, ajouter ou retirer). */
function distance(a: string, b: string): number {
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = cour;
  }
  return prec[b.length];
}

/**
 * Nom composé d'un lieu du DCE mal orthographié dans le mémoire (« Carnot-Cassissi », « Carnot-Cassassi » pour le
 * bâtiment « Carnot-Cassini ») : remplacé par l'orthographe du DCE. Seuls les noms à trait d'union cités au moins deux
 * fois dans le DCE, de même première partie, sont concernés (jamais un pluriel : « Éco-gestes »).
 */
export function nomsComposesDce(texte: string, dce: string): string {
  const RX = /\b[A-ZÀ-Ý][A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)+\b/g;
  const freq = new Map<string, number>();
  for (const m of (dce || '').match(RX) || []) freq.set(m, (freq.get(m) || 0) + 1);
  const connus = [...freq.keys()].filter((k) => (freq.get(k) || 0) >= 2);
  if (!connus.length) return texte;
  const corrections = new Map<string, string>();
  for (const x of new Set(texte.match(RX) || [])) {
    if (freq.has(x) || x.length < 8) continue;
    const bon = connus.find((y) => {
      const [px, ...rx] = x.split('-'); const [py, ...ry] = y.split('-');
      const sx = rx.join('-').toLowerCase(); const sy = ry.join('-').toLowerCase();
      return px === py && sy.length >= 5 && Math.abs(sx.length - sy.length) <= 2 && sx.replace(/s$/, '').replace(/e$/, '') !== sy.replace(/s$/, '').replace(/e$/, '')
        && distance(sx, sy) <= 3 && sx.slice(0, 3) === sy.slice(0, 3);
    });
    if (bon) corrections.set(x, bon);
  }
  let t = texte;
  for (const [faux, bon] of corrections) t = t.split(faux).join(bon);
  return t;
}

/** Qualifications que le cahier des charges exige de TOUS les agents (liste « les agents doivent être détenteurs des titres
 *  suivants : – … », « chaque prestation doit être assurée par un agent titulaire des qualifications suivantes : • … »). */
const QUALIFS: Array<{ dce: RegExp; texte: string }> = [
  { dce: /SSIAP\s*1\b|S\.S\.I\.A\.P\.?(?!\s*[23])/i, texte: 'SSIAP\\s*1\\b' },
  { dce: /\bSST\b|S\.S\.T\b|secourisme|PSE\s*1/i, texte: '(?:SST|PSE\\s*1|secourisme|sauveteur secouriste)' },
  { dce: /H0\s*B0|H0V|habilitation électrique/i, texte: '(?:H0\\s*-?\\s*B0\\w*|H0V\\s*B0|habilitation électrique)' },
  { dce: /CQP\s*-?\s*APS|CQPAPS/i, texte: 'CQP\\s*-?\\s*APS' },
];
export function qualificationsExigees(dce: string): string[] {
  const d = (dce || '').replace(/[ \t]+/g, ' ');
  const DECLENCHEUR = /(?:agents?|personnel|chaque prestation|chaque agent)[^.:]{0,140}?(?:doivent|devront|doit|devra)\s+(?:obligatoirement\s+)?(?:être\s+)?(?:détenteurs?|titulaires?|posséder|disposer)[^.:]{0,100}?(?:titres?|qualifications?|habilitations?|diplômes?)[^.:]{0,40}?(?:suivant(?:e?s)?|ci-après)\s*:|doit être assurée? par un agent titulaire[^.:]{0,60}?qualifications? suivantes?\s*:|devra posséder\s*:|dispose d.agents titulaires de\s*:/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = DECLENCHEUR.exec(d))) {
    const liste = d.slice(m.index + m[0].length, m.index + m[0].length + 500).replace(/^\s+/, '');
    // Liste à puces ou à tirets seulement (un tableau de qualifications PAR POSTE ne vaut pas pour tous les agents).
    if (!/^[-•▪●]/.test(liste)) continue;
    const bloc = liste.split(/\n\s*\n|\.\s+(?=[A-Z])/)[0];
    for (const q of QUALIFS) if (q.dce.test(bloc)) out.add(q.texte);
  }
  return [...out];
}

/**
 * Qualification exigée de tous les agents présentée au conditionnel (« la qualification SSIAP 1, lorsqu'elle est
 * requise », « et, selon les missions commandées, qualification SSIAP 1 ») : la condition est retirée.
 */
export function qualificationsInconditionnelles(texte: string, dce: string): string {
  const qualifs = qualificationsExigees(dce);
  if (!qualifs.length) return texte;
  const COND = "(?:lorsqu['’](?:elle|il)s? (?:est|sont) (?:requise?s?|exigée?s?|nécessaires?)|lorsque (?:nécessaire|requis|cela est requis)|le cas échéant|si (?:nécessaire|requis|exigé|le poste l.exige)|selon (?:les |le )?(?:postes?|missions?(?: commandées)?|besoins?)|en fonction (?:des|du) (?:postes?|missions?))";
  let t = texte;
  for (const q of qualifs) {
    // Condition APRÈS la qualification : « SSIAP 1, lorsqu'elle est requise ; » → « SSIAP 1 ; ».
    t = t.replace(new RegExp(`(${q}(?:\\*\\*)?(?:\\s+(?:et|avec) (?:attestations? de )?recyclages?(?: à jour)?)?)\\s*,?\\s*${COND}(?:,(?=\\s+(?:et|ou)\\b))?(?=\\s*[,;.)\\n]|\\s+(?:et|ou)\\b|$)`, 'gi'), '$1');
    // Condition AVANT, en incise après « et » : « et, selon les missions commandées, qualification SSIAP 1 » → « et qualification SSIAP 1 ».
    t = t.replace(new RegExp(`\\b(et|ou)\\s*,\\s*${COND}\\s*,\\s*(?=(?:(?:la|une|de|d['’]|des)\\s+)?(?:(?:qualification|habilitation|formation|diplôme|certificat)s?\\s+)?(?:\\*\\*)?${q})`, 'gi'), '$1 ');
  }
  // « des qualifications requises selon les missions : … SSIAP 1 » → « des qualifications requises : … ».
  t = t.replace(/(qualifications? (?:requises?|exigées?))\s+(?:selon|en fonction (?:des|du))\s+(?:les |le )?(?:postes?|missions?(?: commandées)?)(?=\s*:)/gi, '$1');
  return t.replace(/(\S) {2,}(?=\S)/g, '$1 ');
}

/**
 * Tableaux Markdown rendus en texte brut dans le PDF : lignes de tableau séparées par une ligne vide
 * (le tableau est coupé) ou tableau sans ligne de séparation sous l'en-tête. Les lignes sont regroupées et
 * la séparation ajoutée.
 */
export function reparerTableaux(texte: string): string {
  const estLigne = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const estSep = (l: string) => /^\s*\|?\s*:?-{3,}/.test(l);
  const lignes = texte.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    // Ligne vide entre deux lignes de tableau : supprimée (le tableau reste d'un seul tenant).
    if (!l.trim() && out.length && estLigne(out[out.length - 1]) && estLigne(lignes[i + 1] || '')) continue;
    if (estLigne(l) && (!out.length || !estLigne(out[out.length - 1]))) {
      // Début de tableau sans séparation sous l'en-tête : on l'ajoute.
      out.push(l);
      if (!estSep(lignes[i + 1] || '') && estLigne(lignes[i + 1] || '') ) {
        const n = l.trim().replace(/^\||\|$/g, '').split('|').length;
        out.push(`|${Array(n).fill('---').join('|')}|`);
      }
      continue;
    }
    out.push(l);
  }
  return out.join('\n');
}

/**
 * Exigence tirée d'une grille de pénalités du DCE (T3-CONS-8, imm 1353 : ligne « Tenue des locaux et vestiaires des agents |
 * Propreté / dégradation | Sur devis » de l'article « Pénalités » du CCAP, devenue une « question nouvelle » et un engagement
 * « toute réparation … sera facturée sur devis ») : jamais une exigence de prestation. Vrai si l'exigence parle de pénalité ou
 * de montant, ou si sa ligne du DCE se trouve sous l'en-tête d'une grille de pénalités (même article) ou finit par un montant.
 */
export function exigenceDeGrillePenalites(exigence: string, dce: string): boolean {
  const e = String(exigence || '');
  // Montant de pénalité ou phrase dont la pénalité est le sujet ; une obligation suivie de « sous peine de pénalités » reste.
  if (MONTANT_PENALITE.test(e) || /^\s*(?:les?\s+|des\s+)?p[ée]nalit/i.test(e)) return true;
  const n = (t: string) => normTxt(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const mots = [...new Set(n(e).split(' ').filter((w) => w.length >= 4))].slice(0, 8);
  if (mots.length < 2) return false;
  const lignes = String(dce || '').split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const l = ` ${n(lignes[i])} `;
    if (mots.filter((w) => l.includes(` ${w} `)).length / mots.length < 0.8) continue;
    if (/(?:€|euros?|sur devis|\d\s*%)\s*(?:HT)?\s*(?:\/\s*(?:manquement|jour|heure|agent|infraction))?\s*$/i.test(lignes[i].trim())) return true;
    for (let j = i; j >= Math.max(0, i - 60); j--) {
      const t = lignes[j];
      if (/^\s*(?:article\s+\d+[^\n]{0,8})?\s*p[ée]nalit[ée]s?\b/i.test(t) || (/p[ée]nalit/i.test(t) && /montant|modalit[ée] de contr[ôo]le/i.test(t))) return true;
      if (j < i && /^\s*article\s+\d+/i.test(t)) break;
    }
  }
  return false;
}

/**
 * Préposition devant un nom propre qui commence par un article (T3N-8 : « à Le Grand-Quevilly » ; T3-COH-3 : « à Le Havre
 * Seine Métropole ») : contractée comme le veut la langue (« au Grand-Quevilly », « aux Docks Vauban », « du Havre »,
 * « des Andelys »). « La » et « L' » ne se contractent pas (« à La Poste »).
 */
export function contracterArticlesNomsPropres(texte: string): string {
  return String(texte || '').replace(/(?<![\p{L}\p{N}'’])(à|À|de|De) (Le|Les) (?=[A-ZÀ-Ý])/gu, (_m, prep: string, art: string) => {
    const pluriel = art === 'Les';
    const r = /^[àÀ]$/.test(prep) ? (pluriel ? 'aux' : 'au') : (pluriel ? 'des' : 'du');
    return `${/^[ÀD]/.test(prep) ? r.charAt(0).toUpperCase() + r.slice(1) : r} `;
  });
}

/**
 * Nettoyage de structure après les passes de suppression (répétitions, références, délais) : une phrase
 * d'introduction « … : » qui n'est plus suivie de rien, un tableau réduit à son en-tête, un sous-titre
 * vide, des caractères invisibles.
 */
export function nettoyerStructure(texte: string): string {
  let t = reparerTableaux(texte.replace(/[\u200B-\u200D\uFEFF]/g, ''));
  const lignes = t.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    // Tableau Markdown : en-tête + séparateur sans aucune ligne de données → retiré.
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lignes[i + 1] || '') && !/^\s*\|.*\|\s*$/.test(lignes[i + 2] || '')) { i++; continue; }
    // Introduction « … : » suivie d'aucune liste ni d'aucun tableau.
    if (/:\s*$/.test(l) && !/^\s*#/.test(l)) {
      let j = i + 1;
      while (j < lignes.length && !lignes[j].trim()) j++;
      if (j >= lignes.length || /^\s*#/.test(lignes[j]) || !/^\s*(?:[-*•]\s|\d+[.)]\s|\|)/.test(lignes[j])) continue;
    }
    out.push(l);
  }
  t = out.join('\n').replace(/^#{2,4}\s+.+\n+(?=#{2,4}\s|$(?![\s\S]))/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return contracterArticlesNomsPropres(t);
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
