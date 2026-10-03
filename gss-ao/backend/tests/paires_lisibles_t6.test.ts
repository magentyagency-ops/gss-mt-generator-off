// Tour 6 (T6N-4, cstb 551) : une phrase adaptée longue montre toujours à GSS ce qui a changé.
import { describe, it, expect } from 'vitest';
import { pairesLisibles, consultationsAdaptations, type PhraseAdaptee } from '../src/generation/adaptations_cctp';

const DEBUT = `${"un marquage officiel sur la poitrine, en haut à gauche : le numéro d'identification individuel, en caractères d'au moins 10 mm, et le logo du Conseil national des activités privées de sécurité (CNAPS) ; ".repeat(3)}En dessous figure un insigne reproduisant `;
const O = `${DEBUT}la dénomination ou le sigle de l'entreprise.`;
const A = `${DEBUT}le nom de la société titulaire.`;

describe('Phrase adaptée longue (plus de 420 caractères)', () => {
  it('les deux extraits diffèrent et montrent la modification', () => {
    const [o, a] = pairesLisibles(O, A);
    expect(o).not.toBe(a);
    expect(o).toMatch(/dénomination ou le sigle de l'entreprise/);
    expect(a).toMatch(/nom de la société titulaire/);
    expect(o.startsWith('… ')).toBe(true);
    expect(o.length).toBeLessThanOrEqual(425);
  });
  it('phrases courtes : inchangées ; consultation lisible', () => {
    expect(pairesLisibles('Phrase de GSS.', 'Phrase adaptée.')).toEqual(['Phrase de GSS.', 'Phrase adaptée.']);
    const p: PhraseAdaptee = { n: 5, rubrique: 'b4_tenues_reglementaires', titre: 'Tenues', origine: O, adaptee: A, exigence: 'Le titulaire.', etape: 'x', statut: 'a_valider' };
    expect(consultationsAdaptations([p])[0]).toMatch(/dénomination ou le sigle[^»]*» ; phrase adaptée : «[^»]*nom de la société titulaire/);
  });
});
