// T10C-3 : rédaction automatique indisponible dans le cadre, toutes les rubriques attribuées à la réponse reprises dans
// l'ordre de la question (jamais la première seule) ; « absences » et « remplacer un agent » reconnus comme composante.
import { describe, it, expect } from 'vitest';
import { referencesDeSecours, rubriquesThematiques, type CandidatReference } from '../src/generation/memoire_type_cadre';

const c = (id: string, score: number, theme = false): CandidatReference => ({ cle: id, id, titre: id, texte: `Texte ${id}.`, score, theme });

describe('texte de secours d’une réponse développée du cadre (T10C-3)', () => {
  const question = "Organisation et dimensionnement des équipes affectées au Marché. Modalités d'anticipation et de remplacement des congés et absences programmées. Organisation mise en œuvre pour remplacer un agent en urgence.";
  it('« absences » et « remplacer un agent » : composante du remplacement', () => {
    expect(rubriquesThematiques(question, ['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b3_adequation'])).toEqual(['b5_remplacement_prevu', 'b5_remplacement_imprevu']);
  });
  it('toutes les rubriques attribuées, la principale d’abord, la famille entière ensuite', () => {
    const r = referencesDeSecours([c('b5_remplacement_imprevu', 0.95, true), c('b3_adequation', 0.62), c('b5_remplacement_prevu', 0.94, true)], question);
    expect(r.map((x) => x.id)).toEqual(['b3_adequation', 'b5_remplacement_prevu', 'b5_remplacement_imprevu']);
  });
  it('trois rubriques sémantiques gardées toutes, par score', () => {
    const r = referencesDeSecours([c('b4_main_courante', 0.7), c('b5_outils_suivi', 0.68), c('b5_controle_global', 0.67)], 'Dispositifs de traçabilité et démarche qualité');
    expect(r.map((x) => x.id)).toEqual(['b4_main_courante', 'b5_outils_suivi', 'b5_controle_global']);
  });
});
