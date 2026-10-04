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
    dictionnaireFr = new Map([...toutes].map(([k, f]) => [k, meilleureForme(f, k)]));
  }
  return dictionnaireFr.get(sansAccents(mot)) || '';
}
