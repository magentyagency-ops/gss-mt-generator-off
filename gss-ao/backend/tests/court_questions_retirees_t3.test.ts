// T3C-9 : format court, une question dont le passage n'est plus dans le texte remis (sélection au rendu) n'est pas posée.
import { describe, it, expect } from 'vitest';
import { demandesDesPassagesRepris } from '../src/generation/memoire_generator';

const REPERE = (n: number) => `⟦AC:${n}⟧`;
const qPti = "Marché hors Normandie : quel délai GSS annonce-t-elle (délai d'arrivée sur place après une alarme PTI sans réponse) ?";
const demandes = [
  { texte: qPti },
  { texte: 'Quel taux de reprise du personnel en place proposez-vous ?' },
  { texte: 'Question du repère 3', repere: 3 },
  { texte: 'Question du repère 4', repere: 4 },
  { texte: 'Confirmer le délai X — valeur utilisée dans le mémoire : 2 heures (source, 2026-04)' },
  { texte: 'Question sans rubrique (couverture du CCTP)' },
];
const rubriques = new Map([[qPti, 'b4_pti'], ['Quel taux de reprise du personnel en place proposez-vous ?', 'b3_reprise_personnel']]);
const titres: Record<string, string> = { b4_pti: 'Les moyens techniques : la protection du travailleur isolé (PTI)', b3_reprise_personnel: 'La reprise du personnel en place' };

describe('questions des passages non repris retirées (T3C-9)', () => {
  it('rubrique PTI écartée, repère 4 disparu, confirmation perdue : retirés ; le reste gardé', () => {
    const sections = { c3: `## La reprise du personnel en place\n\nTaux : [À COMPLÉTER]${REPERE(3)}.`, c4: '## Autre rubrique\n\nTexte.' };
    const r = demandesDesPassagesRepris(demandes, sections, rubriques, (id) => titres[id], REPERE, new Set([demandes[4].texte]));
    expect(r.map((d) => d.texte)).toEqual(['Quel taux de reprise du personnel en place proposez-vous ?', 'Question du repère 3', 'Question sans rubrique (couverture du CCTP)']);
  });
  it('rubrique PTI reprise : sa question reste posée', () => {
    const sections = { c4: `## ${titres.b4_pti}\n\nTexte PTI.` };
    expect(demandesDesPassagesRepris(demandes, sections, rubriques, (id) => titres[id], REPERE).map((d) => d.texte)).toContain(qPti);
  });
});
