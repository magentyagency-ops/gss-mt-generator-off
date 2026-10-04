import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/** Dictionnaire français (python/schemas_gss/dictionnaire_fr.txt.gz) : forme accentuée de chaque mot sans accents. */
let dictionnaireFr: Map<string, string> | null = null;

const sansAccents = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Choix entre les formes d'un même mot sans accent (T3-COH-4) : la forme accentuée quand le mot sans accent n'existe pas
 * (« château ») ; quand il existe, la forme sans accent si les accents de l'autre ne sont que dans sa terminaison (verbe
 * conjugué ou participe : « habitât », « pressé », « centré », « coté »), sinon la forme accentuée (« côte ») ; entre deux
 * formes accentuées, l'accent circonflexe des noms (« pêche », « forêt ») plutôt que le grave des verbes (« pèche »).
 */
// Mots usuels dont la forme sans accent est de loin la plus fréquente (T5-COH-2 : « JEUNES » → « jeunes », jamais « jeûnes »).
const SANS_ACCENT = new Set(['jeune', 'jeunes', 'mur', 'murs', 'sur', 'du', 'des', 'ou', 'la', 'a']);
function meilleureForme(formes: string[], k: string): string {
  if (SANS_ACCENT.has(k) && formes.includes(k)) return k;
  const accentuees = formes.filter((w) => w !== k);
  const circ = (x: string) => /[âêîôû]/.test(x);
  const premierAccent = (x: string) => x.search(/[àâäéèêëîïôöùûüç]/);
  const accentuee = accentuees.find(circ) || accentuees[0];
  if (!accentuee) return k;
  if (!formes.includes(k)) return accentuee;
  return premierAccent(accentuee) < accentuee.length - 2 ? accentuee : k;
}

const COMPLEMENTS = ['médiathèque', 'médiathèques', 'artothèque', 'artothèques', 'ehpad'];
let formesParCle: Map<string, string[]> | null = null;
/** Noms communs d'institution dont la forme accentuée est le nom (« CITE SCOLAIRE » → « cité », « MARCHE COUVERT » →
 *  « marché ») ; dans un nom d'institution, jamais le verbe conjugué sans accent (T7G-5). */
const NOMS_INSTITUTION_ACCENTUES: Record<string, string> = { cite: 'cité', cites: 'cités', marche: 'marché', marches: 'marchés' };
/** Forme d'un mot dans un nom d'institution : le nom accentué d'un mot ambigu (« cité »), sinon la forme du dictionnaire. */
export function motDuDictionnaireInstitution(mot: string): string {
  return NOMS_INSTITUTION_ACCENTUES[sansAccents(mot)] || motDuDictionnaire(mot);
}
/** Le dictionnaire n'a qu'une graphie pour ce mot (sans accent, casse ignorée) : sa graphie n'est pas à confirmer. */
export function graphieSansAmbiguite(mot: string): boolean {
  motDuDictionnaire(mot);
  const k = sansAccents(mot);
  if (NOMS_INSTITUTION_ACCENTUES[k]) return true;
  const f = formesParCle?.get(k);
  return !!f && new Set(f).size === 1;
}

/** Forme du dictionnaire (en minuscules, accentuée) d'un mot quelconque ; '' s'il n'est pas un mot du dictionnaire. */
export function motDuDictionnaire(mot: string): string {
  if (!dictionnaireFr) {
    const toutes = new Map<string, string[]>();
    try {
      const fichier = path.resolve(__dirname, '../../python/schemas_gss/dictionnaire_fr.txt.gz');
      for (const l of zlib.gunzipSync(fs.readFileSync(fichier)).toString('utf-8').split('\n')) {
        const w = l.trim();
        if (!w || /[A-Z]/.test(w)) continue;
        const k = sansAccents(w);
        (toutes.get(k) || toutes.set(k, []).get(k)!).push(w);
      }
    } catch { /* dictionnaire absent : noms propres seulement */ }
    // Noms d'équipements publics absents du dictionnaire (T7G-5 : « MEDIATHEQUE » → « médiathèque »).
    for (const w of COMPLEMENTS) { const k = sansAccents(w); if (!toutes.has(k)) toutes.set(k, [w]); }
    dictionnaireFr = new Map([...toutes].map(([k, f]) => [k, meilleureForme(f, k)]));
    formesParCle = toutes;
  }
  return dictionnaireFr.get(sansAccents(mot)) || '';
}
