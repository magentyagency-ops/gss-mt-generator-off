// Suivi de progression de la génération du mémoire, par dossier. Stocké en mémoire (process unique en
// dev) : le générateur met à jour la progression à chaque phase, l'endpoint /memoire/progress la lit, et
// le front l'interroge (polling) pour afficher la barre de progression. La phase la plus longue est la
// réécriture des passages surlignés (1 appel gpt-4o par page) : sa progression est pilotée page par page.

export interface GenProgress {
  phase: string;        // identifiant de phase (analyse | strategie | overlay | reecriture | finalisation | done | error)
  label: string;        // libellé lisible affiché à l'utilisateur
  pct: number;          // 0–100, progression globale estimée
  done: number;         // sous-étapes terminées (ex. pages réécrites)
  total: number;        // sous-étapes totales (ex. pages à réécrire)
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const store = new Map<string, GenProgress>();

export function initProgress(id: string): void {
  store.set(id, { phase: 'analyse', label: 'Analyse du DCE…', pct: 1, done: 0, total: 0, startedAt: Date.now() });
}

/** Met à jour la progression d'un dossier (fusion partielle). Sans effet si la génération n'a pas démarré. */
export function setProgress(id: string, patch: Partial<GenProgress>): void {
  const cur = store.get(id);
  if (!cur) return;
  store.set(id, { ...cur, ...patch });
}

export function finishProgress(id: string, ok: boolean, error?: string): void {
  const cur = store.get(id);
  const base = cur ?? { phase: 'done', label: '', pct: 0, done: 0, total: 0, startedAt: Date.now() };
  store.set(id, ok
    ? { ...base, phase: 'done', label: 'Génération terminée', pct: 100, finishedAt: Date.now() }
    : { ...base, phase: 'error', label: 'Échec de la génération', error: error || 'Erreur inconnue', finishedAt: Date.now() });
}

export function getProgress(id: string): GenProgress | null {
  return store.get(id) ?? null;
}
