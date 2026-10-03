// T10-COH-5 : texte de secours du bloc 1, chaque commune écrite après son site, jamais après la liste entière.
import { describe, it, expect } from 'vitest';
import { phraseSites } from '../src/generation/reponse_libre_v2';
import { communesDesSites } from '../src/generation/memoire_type';

const CCTP = "Le présent CCTP définit les prestations de surveillance et de gardiennage de l'Hôpital Nord, 15 chemin des Bourrely, 13015 Marseille (lot 1), et de sécurité incendie du Centre hospitalier de Gap, 1 place Auguste Muret, 05000 Gap (lot 2).";

describe('sites et communes (T10-COH-5)', () => {
  it('commune rattachée à son site par son code postal', () => {
    expect(communesDesSites(CCTP, ['Hôpital Nord', 'Centre hospitalier de Gap'], ['Marseille', 'Gap'])).toEqual({ 'Hôpital Nord': 'Marseille', 'Centre hospitalier de Gap': 'Gap' });
  });
  it('« l’Hôpital Nord (Marseille) et le Centre hospitalier de Gap », jamais « … de Gap (Marseille) »', () => {
    const c = communesDesSites(CCTP, ['Hôpital Nord', 'Centre hospitalier de Gap'], ['Marseille', 'Gap']);
    const p = phraseSites(['Hôpital Nord', 'Centre hospitalier de Gap'], ['Marseille', 'Gap'], c);
    expect(p).toMatch(/Hôpital Nord \(Marseille\) et le Centre hospitalier de Gap\.$/);
    expect(p).not.toMatch(/Gap \(Marseille\)/);
  });
  it('commune non rattachée et plusieurs sites : aucune parenthèse', () => {
    expect(phraseSites(['Hôpital Nord', 'Centre hospitalier de Gap'], ['Marseille', 'Gap'], {})).not.toMatch(/\(/);
  });
  it('un seul site : la commune reste écrite après lui, comme avant', () => {
    expect(phraseSites(['Hôpital Nord'], ['Marseille'])).toMatch(/Hôpital Nord \(Marseille\)\.$/);
  });
});
