/**
 * Détection du type d'une pièce du DCE d'après son nom de fichier.
 *
 * ⚠ COPIE de `backend/src/ingestion/dceClassifier.ts` (paquets npm séparés, pas de build
 * partagé entre le front Next et le backend Express). Toute règle ajoutée d'un côté doit
 * l'être de l'autre, sinon les slots « REQUIS » de l'écran de dépôt et l'extraction
 * serveur ne classent plus les mêmes fichiers.
 *
 * Pourquoi des regex normalisées plutôt qu'un `includes()` :
 *   - `includes('rc')`        → « maRChé », « souRCing », « PaRC »…
 *   - `includes('cahier')`    → le CCAP (« Cahier des clauses ADMINISTRATIVES »)
 *   - `includes('technique')` → le « Mémoire Technique » (notre propre réponse !)
 *   - `includes('cctp')`      → les « Annexe N CCTP - … » (annexes, pas le CCTP)
 *   - et rien ne matche quand les mots sont COLLÉS (« Cahierdesclauses… »).
 */

export type DcePieceType =
  | 'rc'
  | 'cctp'
  | 'ccap'
  | 'acte_engagement'
  | 'bpu_dpgf'
  | 'memoire'
  | 'compte_rendu'
  | 'annexe'
  | 'autre';

export interface DceMatch {
  type: DcePieceType;
  /** Confiance 0-100 : départage plusieurs candidats pour un même slot. */
  score: number;
  /** Motif ayant décidé du classement (debug). */
  matched: string;
}

/** Libellés affichés dans l'UI (liste `TYPES` de l'écran de dépôt + slots « Prérequis »). */
export const TYPE_LABELS: Record<DcePieceType, string> = {
  rc: 'RC',
  cctp: 'CCTP',
  ccap: 'CCAP',
  bpu_dpgf: 'BPU / DPGF',
  memoire: 'Mémoire (cadre)',
  acte_engagement: "Acte d'Engagement",
  compte_rendu: 'Compte Rendu',
  annexe: 'Annexe',
  autre: 'Inconnu',
};

/** Minuscules, sans accents, séparateurs (_-.,()[]…) réduits à des espaces simples. */
export function normalizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || name;
  const noExt = base.replace(/\.[a-z0-9]{1,5}$/i, '');
  return noExt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type Rule = { type: DcePieceType; re: RegExp; score: number; label: string };

/** Règles évaluées DANS L'ORDRE (annexe > mémoire > sigles > libellés > indices faibles). */
const RULES: Rule[] = [
  // Annexes d'abord, sinon « Annexe 1 CCTP - Effectifs » passerait pour le CCTP.
  { type: 'annexe', re: /\bannexes?\b/, score: 100, label: 'annexe' },

  // Mémoire / cadre de réponse : notre livrable, avant le CCTP (« Mémoire Technique »).
  { type: 'memoire', re: /\bmemoires?\b/, score: 95, label: 'memoire' },
  { type: 'memoire', re: /\bcadre\s*de\s*reponse\b|\btrame\s*(?:de\s*)?reponse\b/, score: 90, label: 'cadre de reponse' },

  // Compte rendu de visite.
  { type: 'compte_rendu', re: /\bcomptes?\s*rendus?\b|\bcompte\s*rendu\s*de\s*visite\b/, score: 95, label: 'compte rendu' },
  { type: 'compte_rendu', re: /\bvisites?\s*(?:de\s*)?(?:site|obligatoire|prealable)?\b/, score: 70, label: 'visite' },
  { type: 'compte_rendu', re: /\bcr\b/, score: 65, label: 'cr (sigle)' },

  // BPU / DPGF / DQE.
  { type: 'bpu_dpgf', re: /\bbpus?\b|\bdpgf\b|\bdqe\b/, score: 95, label: 'bpu/dpgf/dqe' },
  { type: 'bpu_dpgf', re: /\bbordereaux?\s*(?:des?\s*)?prix\b|\bdetail\s*quantitatif\b|\bdecomposition\s*(?:du\s*)?prix\b/, score: 90, label: 'bordereau de prix' },

  // Acte d'engagement / candidature. « Acted_engagement.pdf » → « acted engagement ».
  { type: 'acte_engagement', re: /\bactes?\s*d?\s*engagement\b|\bacted\s*engagement\b/, score: 95, label: 'acte engagement' },
  { type: 'acte_engagement', re: /\bdc\s*[124]\b|\bdumes?\b|\batri\b/, score: 85, label: 'dc1/dc2/dume' },
  { type: 'acte_engagement', re: /\bae\b/, score: 60, label: 'ae (sigle)' },

  // CCAP AVANT CCTP : les deux partagent « cahier des clauses … particulières ».
  { type: 'ccap', re: /\bccap\b|\bccag\b/, score: 95, label: 'ccap (sigle)' },
  { type: 'ccap', re: /cahier\s*des?\s*clauses?\s*administratives?/, score: 95, label: 'cahier des clauses administratives' },

  // CCTP.
  { type: 'cctp', re: /\bcctp\b|\bccp\b|\bcctps\b/, score: 95, label: 'cctp (sigle)' },
  { type: 'cctp', re: /cahier\s*des?\s*clauses?\s*techniques?/, score: 95, label: 'cahier des clauses techniques' },
  { type: 'cctp', re: /\bc\s*c\s*t\s*p\b/, score: 70, label: 'c c t p (espace)' },
  { type: 'cctp', re: /\bcahier\b.*\btechniques?\b|\bclauses?\s*techniques?\b/, score: 60, label: 'cahier … technique' },

  // RC (règlement de consultation).
  { type: 'rc', re: /\breglements?\s*(?:de\s*(?:la\s*)?)?consultation\b/, score: 95, label: 'reglement de consultation' },
  { type: 'rc', re: /\brcs?\b/, score: 90, label: 'rc (sigle)' },
  { type: 'rc', re: /\breglements?\b/, score: 70, label: 'reglement' },
  { type: 'rc', re: /\bconsultation\b/, score: 50, label: 'consultation' },
];

function match(n: string): DceMatch | null {
  const collapsed = n.replace(/\s+/g, '');
  for (const rule of RULES) {
    if (rule.re.test(n)) return { type: rule.type, score: rule.score, matched: rule.label };
    // La forme collée n'a plus de frontières de mots internes : on ne la teste que pour les
    // libellés multi-mots (`\s*`), sinon « parc » matcherait `\brc\b`.
    if (rule.re.source.includes('\\s*') && rule.re.test(collapsed)) {
      return { type: rule.type, score: rule.score - 5, matched: `${rule.label} (colle)` };
    }
  }
  return null;
}

/** Classe une pièce d'après son nom ou son chemin relatif dans le dossier uploadé. */
export function classifyDceFile(nameOrPath: string): DceMatch {
  const direct = match(normalizeFileName(nameOrPath));
  if (direct) return direct;

  // Nom de fichier muet : le DCE peut être rangé par dossiers (« DCE/RC/doc final.pdf »).
  // On retente sur le chemin, avec une confiance moindre (l'indice est indirect).
  const segments = nameOrPath.replace(/\\/g, '/').split('/').slice(0, -1);
  for (const seg of segments.reverse()) {
    const fromFolder = match(normalizeFileName(seg));
    if (fromFolder) {
      return { ...fromFolder, score: Math.max(10, fromFolder.score - 30), matched: `${fromFolder.matched} (dossier)` };
    }
  }
  return { type: 'autre', score: 0, matched: '' };
}

/** Libellé UI du type détecté (« CCTP », « BPU / DPGF », « Inconnu »…). */
export function detectDceLabel(nameOrPath: string): string {
  return TYPE_LABELS[classifyDceFile(nameOrPath).type];
}
