// Corpus de vérification (_corpus_verif, non versionné) : les tests qui en lisent les DCE sont ignorés quand il est
// absent (copie propre du dépôt), comme ceux de memoire_type.test.ts (T7-COH-4).
import fs from 'fs';
import path from 'path';

export const CORPUS_DCE = path.join(__dirname, '../../../_corpus_verif/_dce_textes');
/** Vrai si tous les DCE nommés sont présents dans le corpus. */
export const aCorpus = (...noms: string[]): boolean => noms.every((n) => fs.existsSync(path.join(CORPUS_DCE, `${n}.txt`)));
/** Texte du DCE du corpus ('' s'il est absent : le test qui l'utilise est alors ignoré par aCorpus). */
export const DCE = (n: string): string => {
  const f = path.join(CORPUS_DCE, `${n}.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '';
};
