/**
 * Classification des pièces d'un DCE d'après leur NOM DE FICHIER (regex).
 *
 * Les DCE réels arrivent sous forme de dossier (« 1-Acte d'Engagement.docx »,
 * « 2-RC 2026-08.doc », « 4-CCTP 2026-08.docx », « Annexe 1 CCTP - Effectifs… »,
 * « Cahierdesclausesadministrativesparticulieres.pdf »…). Un simple `includes()`
 * y produit trop de faux positifs — et trop de faux négatifs :
 *   - `includes('rc')`        → « maRChé », « souRCing », « PaRC »…
 *   - `includes('cahier')`    → le CCAP (« Cahier des clauses ADMINISTRATIVES »)
 *   - `includes('technique')` → le « Mémoire Technique » (notre propre réponse !)
 *   - `includes('cctp')`      → les « Annexe N CCTP - … » (annexes, pas le CCTP)
 *   - et rien ne matche quand les mots sont COLLÉS (« Cahierdesclauses… »).
 *
 * On travaille donc sur deux formes normalisées du nom (accents retirés, séparateurs
 * réduits à des espaces + une variante « collée » sans espaces), avec des regex ancrées
 * sur des frontières de mots, un ORDRE de spécificité (annexe > mémoire > sigles >
 * libellés > indices faibles) et un SCORE de confiance qui permet à l'appelant de
 * départager plusieurs candidats (le vrai CCTP l'emporte sur un fichier au nom vague).
 *
 * ⚠ Ce fichier est dupliqué côté front dans `frontend/lib/dce-detect.ts` (paquets
 * séparés, pas de build partagé). Toute règle ajoutée ici doit l'être là-bas aussi.
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
  /** Confiance 0-100 : sert à choisir le meilleur candidat quand plusieurs fichiers matchent. */
  score: number;
  /** Motif ayant décidé du classement (debug / logs). */
  matched: string;
}

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

/**
 * Règles évaluées DANS L'ORDRE, première touchée = classement retenu.
 * Chaque regex est testée sur la forme espacée ET sur la forme « collée » (sans espaces),
 * ce qui couvre « Cahier des clauses… » comme « Cahierdesclauses… » avec un seul motif :
 * on écrit donc les libellés multi-mots avec `\s*` entre les mots.
 */
const RULES: Rule[] = [
  // --- Annexes : prioritaires, sinon « Annexe 1 CCTP - Effectifs » passerait pour le CCTP.
  { type: 'annexe', re: /\bannexes?\b/, score: 100, label: 'annexe' },

  // --- Mémoire / cadre de réponse : c'est NOTRE livrable, jamais une pièce à parser.
  //     Avant le CCTP, sinon « Mémoire Technique » matcherait « … technique ».
  { type: 'memoire', re: /\bmemoires?\b/, score: 95, label: 'memoire' },
  { type: 'memoire', re: /\bcadre\s*de\s*reponse\b|\btrame\s*(?:de\s*)?reponse\b/, score: 90, label: 'cadre de reponse' },

  // --- Compte rendu de visite (pièce interne Sacha, très structurante pour le mémoire).
  { type: 'compte_rendu', re: /\bcomptes?\s*rendus?\b|\bcompte\s*rendu\s*de\s*visite\b/, score: 95, label: 'compte rendu' },
  { type: 'compte_rendu', re: /\bvisites?\s*(?:de\s*)?(?:site|obligatoire|prealable)?\b/, score: 70, label: 'visite' },
  { type: 'compte_rendu', re: /\bcr\b/, score: 65, label: 'cr (sigle)' },

  // --- BPU / DPGF / DQE (chiffrage).
  { type: 'bpu_dpgf', re: /\bbpus?\b|\bdpgf\b|\bdqe\b/, score: 95, label: 'bpu/dpgf/dqe' },
  { type: 'bpu_dpgf', re: /\bbordereaux?\s*(?:des?\s*)?prix\b|\bdetail\s*quantitatif\b|\bdecomposition\s*(?:du\s*)?prix\b/, score: 90, label: 'bordereau de prix' },

  // --- Acte d'engagement / pièces de candidature.
  //     « Acted_engagement.pdf » → « acted engagement » : d'où le `d?` collé au mot.
  { type: 'acte_engagement', re: /\bactes?\s*d?\s*engagement\b|\bacted\s*engagement\b/, score: 95, label: 'acte engagement' },
  { type: 'acte_engagement', re: /\bdc\s*[124]\b|\bdumes?\b|\batri\b/, score: 85, label: 'dc1/dc2/dume' },
  { type: 'acte_engagement', re: /\bae\b/, score: 60, label: 'ae (sigle)' },

  // --- CCAP : AVANT le CCTP, car les deux partagent « cahier des clauses … particulières ».
  { type: 'ccap', re: /\bccap\b|\bccag\b/, score: 95, label: 'ccap (sigle)' },
  { type: 'ccap', re: /cahier\s*des?\s*clauses?\s*administratives?/, score: 95, label: 'cahier des clauses administratives' },

  // --- CCTP.
  { type: 'cctp', re: /\bcctp\b|\bccp\b|\bcctps\b/, score: 95, label: 'cctp (sigle)' },
  { type: 'cctp', re: /cahier\s*des?\s*clauses?\s*techniques?/, score: 95, label: 'cahier des clauses techniques' },
  { type: 'cctp', re: /\bc\s*c\s*t\s*p\b/, score: 70, label: 'c c t p (espace)' },
  { type: 'cctp', re: /\bcahier\b.*\btechniques?\b|\bclauses?\s*techniques?\b/, score: 60, label: 'cahier … technique' },

  // --- RC (règlement de consultation).
  { type: 'rc', re: /\breglements?\s*(?:de\s*(?:la\s*)?)?consultation\b/, score: 95, label: 'reglement de consultation' },
  { type: 'rc', re: /\brcs?\b/, score: 90, label: 'rc (sigle)' },
  { type: 'rc', re: /\breglements?\b/, score: 70, label: 'reglement' },
  { type: 'rc', re: /\bconsultation\b/, score: 50, label: 'consultation' },
];

/** Applique les règles sur une forme normalisée ; null si aucune ne touche. */
function match(n: string): DceMatch | null {
  const collapsed = n.replace(/\s+/g, '');
  for (const rule of RULES) {
    // La forme collée n'a plus de frontières de mots internes : on ne la teste que si le
    // motif décrit un libellé multi-mots (`\s*`), sinon « parc » matcherait `\brc\b`.
    if (rule.re.test(n)) return { type: rule.type, score: rule.score, matched: rule.label };
    if (rule.re.source.includes('\\s*') && rule.re.test(collapsed)) {
      return { type: rule.type, score: rule.score - 5, matched: `${rule.label} (colle)` };
    }
  }
  return null;
}

/**
 * Classe UNE pièce du DCE d'après son nom (ou son chemin relatif dans le dossier uploadé).
 * Retourne toujours un résultat ; `type: 'autre'` + score 0 = non identifié.
 */
export function classifyDceFile(nameOrPath: string): DceMatch {
  const direct = match(normalizeFileName(nameOrPath));
  if (direct) return direct;

  // Rien dans le nom du fichier : le DCE peut être rangé par dossiers (« DCE/RC/doc final.pdf »).
  // On retente sur le chemin, avec une confiance moindre (l'indice est indirect).
  const segments = nameOrPath.replace(/\\/g, '/').split('/').slice(0, -1);
  for (const seg of segments.reverse()) {
    const fromFolder = match(normalizeFileName(seg));
    if (fromFolder) return { ...fromFolder, score: Math.max(10, fromFolder.score - 30), matched: `${fromFolder.matched} (dossier)` };
  }
  return { type: 'autre', score: 0, matched: '' };
}

/** Vrai si le fichier est une pièce que l'on sait extraire (RC ou CCTP). */
export function isParsableDcePiece(nameOrPath: string): boolean {
  const m = classifyDceFile(nameOrPath);
  return (m.type === 'rc' || m.type === 'cctp') && m.score > 0;
}

/**
 * Parmi une liste de fichiers, retient le MEILLEUR candidat par type de pièce.
 * Indispensable quand le DCE contient plusieurs CCTP (racine + sous-dossier « AWS-MPI-… ») :
 * on ne veut pas parser le premier venu mais celui dont le nom est le plus explicite.
 */
export function pickBestPieces<T>(
  items: T[],
  nameOf: (item: T) => string,
): Partial<Record<DcePieceType, { item: T; match: DceMatch }>> {
  const best: Partial<Record<DcePieceType, { item: T; match: DceMatch }>> = {};
  for (const item of items) {
    const m = classifyDceFile(nameOf(item));
    if (m.type === 'autre' || m.score <= 0) continue;
    const current = best[m.type];
    if (!current || m.score > current.match.score) best[m.type] = { item, match: m };
  }
  return best;
}
