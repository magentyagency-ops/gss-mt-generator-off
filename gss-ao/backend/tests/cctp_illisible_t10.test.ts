// T10-COH-4 : CCTP présent mais illisible (PDF scanné, transcription impossible) : nommé à GSS, jamais « aucun cahier des
// charges n'a été trouvé dans le dossier ».
import { describe, it, expect } from 'vitest';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';

const RC = '\n\n--- RC - Reglement de la consultation ---\nLe candidat remet un mémoire technique.';

describe('pièce scannée illisible (T10-COH-4)', () => {
  it('CCTP illisible : alerte qui nomme le fichier, plus d’alerte « aucun cahier des charges »', () => {
    const a = alerteCctpAbsent(RC, ['CCTP - Cahier des clauses techniques particulieres.pdf']);
    expect(a).toEqual(["Le cahier des charges « CCTP - Cahier des clauses techniques particulieres.pdf » est un PDF scanné qui n'a pas pu être lu (transcription impossible) : relancez la génération, ou ajoutez au dossier une version texte (PDF texte ou Word) ; en attendant, le mémoire n'est pas adapté au CCTP."]);
  });
  it('autre pièce illisible : nommée aussi ; sans pièce illisible, alerte inchangée', () => {
    const a = alerteCctpAbsent(RC, ['Annexe 2 - plans.pdf']);
    expect(a.some((x) => /^Aucun cahier des charges/.test(x))).toBe(true);
    expect(a.some((x) => /« Annexe 2 - plans\.pdf » est un PDF scanné/.test(x))).toBe(true);
    expect(alerteCctpAbsent(RC)).toEqual(alerteCctpAbsent(RC, []));
  });
});
