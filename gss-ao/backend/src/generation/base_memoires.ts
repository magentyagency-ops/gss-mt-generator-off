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
    const aConfirmer = e.statut === 'a_confirmer' || ancien;
    const raison = e.statut === 'a_confirmer'
      ? ` — A ÉVOLUÉ (avant : ${e.valeurs_anterieures_differentes.slice(0, 2).join(' ; ')})`
      : (ancien ? ` — dernière source de plus de ${FRAICHEUR_MOIS} mois` : '');
    return `- ${e.libelle} : ${e.valeur_retenue} [source : ${e.source_retenue}, ${e.date_retenue}]${aConfirmer ? ` [À CONFIRMER${raison}]` : ''}`;
  });
  const avertissement = horsNormandie
    ? "\nCE MARCHÉ EST HORS DE LA ZONE D'INTERVENTION HABITUELLE DE GSS (Normandie) : n'annonce AUCUN délai chiffré d'astreinte, d'intervention, de remplacement ou de mise en place repris d'anciens marchés (ex. 60 minutes, 1 h à 24 h) ; décris l'organisation et demande le délai à GSS."
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
    const morceaux = e.valeur_retenue.split(';').map((x) => normTxt(x).replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 4);
    if (morceaux.some((m) => t.includes(m))) {
      // Main courante : le mémoire n'emploie que Trackforce (Vigicom figure dans un ancien mémoire).
      const valeur = e.cle === 'logiciel_main_courante' ? 'Trackforce (Vigicom cité dans un ancien mémoire)' : e.valeur_retenue;
      out.push(`Confirmer ${e.libelle.charAt(0).toLowerCase()}${e.libelle.slice(1)} — valeur utilisée dans le mémoire : ${valeur} (${e.source_retenue}, ${e.date_retenue})`);
    }
  }
  return out;
}

/**
 * Vrai si le marché se situe hors de Normandie (zone d'intervention habituelle de GSS), d'après les codes
 * postaux de l'analyse du DCE et du début du DCE. Faux si aucun code postal n'est trouvé (doute → pas de filtre).
 */
export function marcheHorsNormandie(analyse: any, dce: string): boolean {
  const texte = `${JSON.stringify(analyse || {})} ${String(dce || '').slice(0, 40000)}`;
  const codes = [...texte.matchAll(/\b(\d{2})\d{3}\s+[A-ZÉÈa-zéè]/g)].map((m) => m[1]).filter((d) => Number(d) >= 1 && Number(d) <= 95);
  if (!codes.length) return false;
  const normands = codes.filter((d) => ['14', '27', '50', '61', '76'].includes(d)).length;
  return normands < codes.length / 2;
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
- Implantation : GSS est implanté à Rouen (Normandie). Les délais d'intervention, d'astreinte, de mobilisation, de remplacement ou de mise en place d'une commande (ex. « 1 h à 24 h ») figurant dans le registre ou les mémoires ont été pris pour des marchés normands : pour un site situé dans une autre région, ne les présente pas comme un engagement ; décris l'organisation prévue (renforts, prépositionnement, relais local) sans chiffre inventé et demande le délai à GSS (consultation / [À COMPLÉTER]).
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
const COMMENTAIRE_INTERNE = /((?<![a-zà-ÿ])à ce stade\b|\bne sont pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]est pas (?:encore )?(?:établi|précisé|communiqué|documenté)|\bn['’]ont pas été (?:communiqué|transmis|fourni)|\bn['’]a pas été (?:communiqué|transmis|fourni)|documentation (?:gss )?(?:fournie|transmise|disponible)|documents? (?:gss )?transmis|éléments? (?:gss )?(?:disponibles|transmis|fournis|communiqués)|\breste(?:nt)? à (?:confirmer|établir|préciser|obtenir)|\bdoi(?:t|vent) être confirmé|\bdevr(?:a|ont) être (?:confirmé|précisé|transposé|validé)|\baprès la visite\b|\blors de la visite obligatoire\b|\bne comporte (?:toutefois )?pas\b|\bne présente ni\b|\bsous réserve de (?:confirmation|validation)\b|\bsous réserve de (?:la|leur|sa) (?:classification|confirmation|validation|disponibilité|faisabilité)(?![a-zà-ÿ])|\bla prestation ne comprend pas\b|(?<![a-zà-ÿ])évite d.inclure\b|\bnon (?:communiqué|précisé|renseigné) dans les|zone d['’]intervention habituelle|\bn['’]annonce (?:donc )?aucun délai|présenter comme acquis|organisation déclarée|\bdocumentés? comme\b|références enregistrées|\bnon précisée?s?(?![a-zà-ÿ])|\bDCE transmis\b|éléments du DCE|implantation habituelle|\bces éléments ne (?:décrivent|précisent|mentionnent|détaillent|couvrent)\b|\breste(?:nt)? à (?:définir|déterminer|arrêter|organiser)|hors de (?:la|sa) zone|\bn(?:e sera|e sont|e seront|.est) (?:donc )?pas présentée?s? comme|\bne sont pas présentées? comme|présence locale déjà constituée|\bn.est toutefois pas établie?\b|\bil ne vaut pas engagement\b|\bconstitue l.engagement opérationnel connu\b|\bdoit être intégrée? au parcours\b|\best signalée? ci-dessous\b|\bsont toutefois traitées comme\b|\bGSS (?:documente|décrit|affirme)\b|\bsans assimiler\b|\bla distance entre Rouen\b|\bincohérence relevée dans le DCE\b|n.a pas (?:encore )?(?:d.agence|d.implantation)|\bdoi(?:t|vent) (?:toutefois |encore |donc )?être arrêtée?s?(?![a-zà-ÿ])|\bdoi(?:t|vent) (?:toutefois|encore) être (?:formalisée?s?|précisée?s?|définie?s?|validée?s?|intégrée?s?)(?![a-zà-ÿ])|n.étant pas (?:précisée?s?|indiquée?s?|connue?s?|communiquée?s?)(?![a-zà-ÿ])|\bn.est (?:pas )?expressément (?:demandée?|exigée?|prévue?)(?![a-zà-ÿ])|(?<![a-zà-ÿ])à formaliser\b)/i;

/** Montant de pénalité du CCAP/CCTP : GSS s'engage sur l'obligation, jamais sur le montant de la sanction. */
const MONTANT_PENALITE = /p[ée]nalit[ée]s?[^.;]{0,120}?\d[\d\s  ]*(?:,\d+)?\s*(?:€|euros?)|\d[\d\s  ]*(?:,\d+)?\s*(?:€|euros?)[^.;]{0,80}?p[ée]nalit/i;

/**
 * Retire du texte destiné à l'acheteur les phrases de diagnostic interne (« à ce stade, … n'est pas
 * établi », « la documentation fournie ne comporte pas… ») et les renvoie pour la liste des points à
 * confirmer. Une phrase qui porte un marqueur ([À COMPLÉTER], [CONSULTATION REQUISE], repère) est gardée.
 */
export function retirerCommentairesInternes(texte: string): { texte: string; retires: string[] } {
  const retires: string[] = [];
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
    .replace(/,?\s*(?:et\s+)?sans (?:création de |créer (?:de|un) |ajouter (?:de|un) |ajout de )?(?:aucun )?poste fixe(?: permanent)?(?: d.accueil)?(?:,? (?:de|du) standard)?(?:,? ou de contrôle d.accès)?(?: permanents?)?/g, '')
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
    .replace(/\bcontr[ôo]l(ent|e) les accès et les identités\b/gi, 'contrôl$1 les accès et les autorisations de présence');
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
  const PRESENCE = /interven|mobilis|remplac|astreinte|rondier|arriv|sur place|se rend|d[ée]plac|renfort|lev[ée]e de doute/i;
  const dceNorm = (dce || '').replace(/\s+/g, ' ').toLowerCase();
  // Le DCE écrit parfois le délai en toutes lettres (« moins de cinq minutes »).
  const LETTRES: Record<string, string> = { '1': 'une?', '2': 'deux', '3': 'trois', '4': 'quatre', '5': 'cinq', '6': 'six', '8': 'huit', '10': 'dix', '12': 'douze', '15': 'quinze', '20': 'vingt', '24': 'vingt-quatre', '30': 'trente', '45': 'quarante-cinq', '48': 'quarante-huit', '60': 'soixante', '72': 'soixante-douze' };
  const dansDce = (n: string, u: string) => {
    const unite = /^m/i.test(u) ? '(?:minutes?|min\\b|mn\\b)' : '(?:heures?|h\\b)';
    const chiffre = `${n.replace('.', '[.,]').replace(',', '[.,]')}`;
    const formes = LETTRES[n] ? `(?:${chiffre}|${LETTRES[n]})(?:\\s*\\(${chiffre}\\))?` : chiffre;
    return new RegExp(`(?<![\\d,.])${formes}\\s*${unite}`, 'i').test(dceNorm);
  };
  const lignes = texte.split('\n').map((ligne) => ligne.split(/(?<=[.!?;])\s+/).map((ph) => {
    if (!PRESENCE.test(ph) || /⟦AC:|\[CONSULTATION REQUISE/.test(ph)) return ph;
    const hors: string[] = [];
    for (const m of ph.matchAll(DUREE)) {
      const apres = ph.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 12);
      if (/^\s*avant\b/i.test(apres)) continue;               // « prise de service 15 minutes avant »
      if (!dansDce(m[1], m[2])) hors.push(m[0]);
    }
    if (!hors.length) return ph;
    retires.push(ph.replace(/[*#]/g, '').trim());
    // Puce : on garde le tiret vide ? non — la puce disparaît avec sa phrase.
    return '';
  }).filter((ph, k, t) => ph !== '' || false).join(' '));
  return { texte: lignes.filter((l, k, t) => !(l.trim() === '' && /^\s*[-*•]\s*$/.test(l))).join('\n').replace(/^\s*[-*•]\s*$/gm, '').replace(/\n{3,}/g, '\n\n'), retires };
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
export function interditsDce(texte: string, dce: string): string {
  texte = nomsComposesDce(qualificationsInconditionnelles(texte, dce), dce);
  const d = (dce || '').replace(/\s+/g, ' ');
  const contraires: RegExp[] = [];
  if (/rondes?[^.]{0,60}(?:effectuées|réalisées|faites|assurées)\s+(?:exclusivement\s+)?à pied/i.test(d)) {
    contraires.push(/vélo|trottinette|gyropode|rondes?[^.]{0,80}(?:en voiture|en véhicule|motoris)/i);
  }
  if (/(?:ne pas|interdiction de|interdit de|il est interdit de|aucune?)\s+(?:prendre|réaliser|capter|faire)?\s*(?:de |des )?(?:photos?|photographies?|clichés)\b/i.test(d)) {
    contraires.push(/\bphotos?\b|photographi(?!e d.identité)|\bvidéos?\b/i);
  }
  if (!contraires.length) return texte;
  // Une phrase qui RAPPELLE l'interdit (« sans photographie », « interdiction de… ») est conforme ; le vélo
  // pour les trajets domicile-travail (démarche RSE) n'est pas un moyen de ronde.
  const conforme = (ph: string) => /\bsans\b|\baucune?\b|\babsence de\b|\bpas de\b|interdi|\bne\b[^.]{0,40}\bpas\b|\bjamais\b|\bn[’']/i.test(ph)
    || /transports? en commun|covoiturage|domicile|trajets?\b|mobilité douce|déplacements? (?:des salariés|domicile)/i.test(ph);
  const contraire = (ph: string) => contraires.some((rx) => rx.test(ph)) && !conforme(ph) && !/⟦AC:|\[CONSULTATION REQUISE/.test(ph);
  // Élément d'une énumération (« des lampes, des vélos ou trottinettes électriques et des contrôleurs ») :
  // seul cet élément est retiré ; la phrase ou la puce part si elle reste contraire.
  const allege = (ph: string) => ph.replace(/(?:,\s*(?:et |ou )?|\s+(?:et|ou)\s+)(?:des |de |du |les )?(?:vélos?|trottinettes?)(?:\s+(?:ou|et)\s+(?:des |de )?(?:vélos?|trottinettes?))?(?:\s+électriques?)?(?=[\s,.;]|$)/gi, '').replace(/\s+,/g, ',').replace(/,\s*et\s+/g, ' et ');
  const traiter = (ph: string) => { if (!contraire(ph)) return ph; const a2 = allege(ph); return contraire(a2) ? null : a2; };
  return texte.split('\n').map((ligne) => {
    if (/^\s*(?:[-*•]\s|\|)/.test(ligne)) return traiter(ligne);
    return ligne.split(/(?<=[.!?])\s+/).map(traiter).filter((ph): ph is string => ph !== null).join(' ');
  }).filter((l): l is string => l !== null).join('\n');
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
  const HORS_PRESTATION = /p[ée]nalit|€|euros?\b|factur|paiement|mandatement|int[ée]r[êe]ts|avance|acompte|r[ée]vis(?:ion|er)|\bprix\b|actualisation|garantie|r[ée]siliation|reconduction|notifi|litige|tribunal|\boffres?\b|candidat|date limite|remise des plis|questions?\b|d[ée]lai de validit|sous-trait|assurance|ordre de service|admission|r[ée]ception des prestations|v[ée]rifications? (?:quantitative|qualitative)|retenue|variation|dur[ée]e (?:du march|de l.accord)|\bans?\b[^.]{0,20}(?:reconductible|ferme)|prolongation|préavis|pr[ée]avis|cong[ée]s pay|convention collective|code du travail|article [LR]\s?\d/i;
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
      const rxDelai = /(?:au (?:moins|minimum|plus tard)|dans un d[ée]lai(?: maxim(?:um|al))?(?: de)?|sous|en moins de|dans les|d[ée]lai de|pr[ée]avis de)\s+(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|trente|quarante-huit)\s*(?:\(\d+\)\s*)?(jours?\s+ouvr[ée]s?|jours?\s+ouvrables?|jours?|heures?|h\b|minutes?|min\b|mn\b|semaines?|mois\b)/gi;
      while ((m = rxDelai.exec(ph))) {
        const u = unite(m[2]);
        const n = LETTRES[m[1].toLowerCase()] || m[1];
        const lettres = Object.keys(LETTRES).filter((k) => LETTRES[k] === n).join('|');
        if (u) motifs.push(`\\b(?:${n}${lettres ? `|${lettres}` : ''})\\s*${u}`);
      }
      const rxFreq = /\b(\d{1,2}|une|deux|trois|quatre)\s*(?:fois|passages?|rondes?|contr[ôo]les?|visites?|r[ée]unions?)\s+(?:au minimum\s+|minimum\s+)?par\s+(jour|nuit|semaine|mois|trimestre|semestre|an|vacation|poste)\b/gi;
      while ((m = rxFreq.exec(ph))) {
        const n = ({ une: '1', deux: '2', trois: '3', quatre: '4' } as Record<string, string>)[m[1].toLowerCase()] || m[1];
        const lettres = ({ '1': 'une?', '2': 'deux', '3': 'trois', '4': 'quatre' } as Record<string, string>)[n];
        motifs.push(`\\b(?:${n}${lettres ? `|${lettres}` : ''})\\s*(?:fois|passages?|rondes?|contr[ôo]les?|visites?|r[ée]unions?)[^.\\n]{0,30}${m[2]}`);
      }
      const rxPer = /\b(?:tous les|toutes les)\s+(\d{1,3})\s*(heures?|h\b|minutes?|min\b|jours?|semaines?|mois\b)/gi;
      while ((m = rxPer.exec(ph))) { const u = unite(m[2]); if (u) motifs.push(`\\b${m[1]}\\s*${u}`); }
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
function piecesTechniques(dce: string): string[] {
  const blocs = (dce || '').split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const pieces: string[] = [];
  for (let i = 1; i < blocs.length; i += 3) {
    const brut = blocs[i] || blocs[i + 1] || '';
    const nom = `${brut} ${brut.replace(/[_.\s-]+/g, '')}`;  // « C_C_T_P_ COMMUN » → « CCTPCOMMUN »
    const corps = blocs[i + 2] || '';
    if (/\bRC\b|r[èe]glement (?:de (?:la )?)?consultation|acte d.engagement|\bAE\b|DPGF|BPU|DQE|bordereau|\bDC\s?\d|attestation|cadre de r[ée]ponse|m[ée]moire|candidature|lettre|avis/i.test(nom)) continue;
    if (/cctp|ccap|ccp\b|cahier des (?:clauses|charges)|clauses techniques|programme|annexe|besoin|consignes?|proc[ée]dure|analys/i.test(nom)) pieces.push(corps);
  }
  if (!pieces.length && !/--- .+? ---|===== PIÈCE/.test(dce || '')) pieces.push(dce || '');
  return pieces;
}

/**
 * Horaires imposés par le cahier des charges (ouverture, fermeture, mise sous alarme, vacations, rondes, relèves) :
 * phrases citées telles quelles, pour le contrôle des contradictions (« fermeture de Coriolis à 19 h » alors que le
 * CCTP fixe la fermeture aux usagers à 21 h et la mise sous alarme à 22 h).
 */
export function horairesImposes(dce: string, max = 30, objet = /ouvert|ferm|alarme|vacation|ronde|relève|pr[ée]sence|poste|horaire|pause|accueil/i): string[] {
  const out: string[] = [];
  const vues = new Set<string>();
  // Titre de partie propre à un site (« Campus de Thiais », « Bâtiment Coriolis : ») : il précède chaque horaire cité,
  // sinon les horaires de deux campus aux phrases identiques étaient confondus (ou fusionnés en un seul).
  const TITRE = /(?:campus|site|b[âa]timent|parc|parking|lot\b|antenne|tribunal|palais|juridiction|poste de)/i;
  for (const piece of piecesTechniques(dce)) {
    let section = '';
    let tampon: string[] = [];
    const vider = () => {
      const texte = tampon.join('\n');
      tampon = [];
      const phrases = texte.replace(/[ \t]+/g, ' ').split(/(?<=[.;!?])\s+|\n\s*(?:[-•▪●○◦−]|\d+[.)])\s+|\n{2,}/).map((x) => x.replace(/\s+/g, ' ').replace(/^[-•▪●○◦−]\s*/, '').trim()).filter((x) => x.length >= 30 && x.length <= 350);
      for (const ph of phrases) {
        if (out.length >= max) return;
        if (!/\b\d{1,2}\s*h\s*\d{0,2}\b/i.test(ph) || !objet.test(ph)) continue;
        if (/p[ée]nalit|€|euros?\b|taux horaire|\b(?:J|N)\s+(?:J|N)\b/i.test(ph)) continue;
        const cle = `${section}|${ph}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ');
        if (vues.has(cle)) continue;
        vues.add(cle);
        out.push(section && !ph.toLowerCase().includes(section.toLowerCase()) ? `[${section}] ${ph}` : ph);
      }
    };
    for (const ligne of piece.split('\n')) {
      const l = ligne.replace(/\s+/g, ' ').trim();
      if (l && l.length <= 60 && /^[A-ZÀ-Ý0-9]/.test(l) && !/[.;,]/.test(l.replace(/^\d+(?:\.\d+)*\s*/, '')) && TITRE.test(l) && !/\b\d{1,2}\s*h\s*\d{0,2}\b/i.test(l)
        && !/\b(?:doi(?:t|vent)|veill\w*|dispose\w*|concerne\w*|est|sont|sera|seront|assur\w+|effectu\w+)\b/i.test(l)) {
        vider();
        section = l.replace(/\s*:\s*$/, '');
      }
      tampon.push(ligne);
    }
    vider();
    if (out.length >= max) break;
  }
  return out;
}

/** Obligations chiffrées du cahier des charges dont le chiffre n'apparaît nulle part dans le mémoire. */
export function obligationsChiffreesAbsentes(dce: string, memoire: string): string[] {
  const texte = (memoire || '').replace(/\*\*|__|⟦AC:\d+⟧/g, '').replace(/[\u00a0\u202f]/g, ' ');
  return obligationsChiffrees(dce).filter((o) => !o.cle.test(texte)).map((o) => o.phrase);
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
  return t;
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
