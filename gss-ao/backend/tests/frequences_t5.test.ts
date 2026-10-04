// Tour 5 : fréquences cohérentes dans tout le mémoire (T5CP-8 cstb 551, T5N-4 et T5N-6 becquerel 591).
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, preparerMemoireType, publierMemoire, controlesInopinesDe, phrasesGeneralesProtegees, appliquerModifications } from '../src/generation/memoire_type';
import { frequencesAbsentes, familleFrequence, frequencesRetirees, questionAlignementRefuse } from '../src/generation/memoire_generator';

const mt = chargerMemoireType();

describe('contrôles inopinés (T5N-4)', () => {
  it('nombre mensuel déduit de la fréquence imposée par le CCTP, jamais « un à trois »', () => {
    expect(controlesInopinesDe('au moins une fois par mois de nuit et au moins une fois par mois le week-end de jour')).toBe('au moins deux contrôles inopinés');
    expect(controlesInopinesDe('au moins trois fois par mois')).toBe('au moins trois contrôles inopinés');
    expect(controlesInopinesDe('tous les mois')).toBe('un contrôle inopiné');
    expect(controlesInopinesDe('une fois par semaine')).toBe('');
    const ctx: any = { analyse: {}, dce: 'Le titulaire réalise des contrôles inopinés au moins une fois par mois de nuit et au moins une fois par mois le week-end de jour.', cover: {}, referents: '',
      imposees: { FREQ_CONTROLE_2: { valeur: 'au moins une fois par mois de nuit et au moins une fois par mois le week-end de jour', citation: 'x' } } };
    const prep = preparerMemoireType(ctx, { memoireType: mt });
    expect(prep.variables.CONTROLES_INOPINES_MENSUELS.valeur).toBe('au moins deux contrôles inopinés');
    const t = publierMemoire(prep).find((p) => p.id === 'b5_controle_trois_niveaux')!.texte!;
    expect(t).toContain('au moins deux contrôles inopinés de nos contrôleurs');
    expect(t).not.toMatch(/un à trois/);
    const autre = preparerMemoireType({ ...ctx, imposees: { FREQ_CONTROLE_2: { valeur: 'une fois par semaine', citation: 'x' } } }, { memoireType: mt });
    expect(autre.variables.CONTROLES_INOPINES_MENSUELS.valeur).toBeNull();
    expect(autre.variables.CONTROLES_INOPINES_MENSUELS.question).toMatch(/combien de contrôles inopinés par mois/);
  });
});

describe('alignement d’une fréquence sur le CCTP (T5N-4, T5N-6)', () => {
  it('fréquence changée de famille repérée ; question selon la nature de la valeur', () => {
    expect(frequencesRetirees('réunions qualité, une fois par trimestre', 'réunions qualité, une fois par mois')).toEqual(['trimestriel']);
    expect(frequencesRetirees('une à trois fois par mois', 'au moins trois fois par mois')).toEqual([]);
    expect(familleFrequence('lors des réunions trimestrielles')).toEqual(['trimestriel']);
    expect(questionAlignementRefuse('Remplacement immédiat d’un agent absent', 'l’agent d’astreinte est sur site en 60 minutes maximum')).toMatch(/Pouvez-vous vous engager sur l'exigence du DCE, ou quelle valeur faut-il écrire \?$/);
    expect(questionAlignementRefuse('Responsabilité civile de 10 000 000 €', 'responsabilité civile professionnelle 300 000 €')).toMatch(/garantie ou d'une valeur conforme/);
    expect(questionAlignementRefuse('une réunion qualité par mois', 'une fois par trimestre', ['Le suivi qualité'])).toContain('dans toutes ces rubriques');
  });
});

describe('réunions de suivi (T5CP-8)', () => {
  it('fréquence imposée par le CCTP : elle remplace la fréquence habituelle de GSS, jamais les deux (T2-CONS-4)', () => {
    const r = mt.rubriques.find((x) => x.id === 'b5_reunions_indicateurs')!;
    // La phrase générale suivie d'une phrase propre au client n'existe plus dans le mémoire type : rien à protéger.
    expect(phrasesGeneralesProtegees(r.texte!, 'x')).toEqual([]);
    const avec = publierMemoire(preparerMemoireType({ analyse: { clientName: 'CSTB' }, dce: 'Réunion de suivi : trimestrielle. 38400 Saint-Martin-d\'Hères.', referents: '' } as any, { memoireType: mt })).find((x: any) => x.id === 'b5_reunions_indicateurs')?.texte || '';
    expect(avec).toMatch(/les réunions de suivi ont lieu chaque trimestre pour (?:le )?CSTB\./);
    expect(avec).not.toMatch(/mensuelles ou trimestrielles/);
    const sans = publierMemoire(preparerMemoireType({ analyse: { clientName: 'CSTB' }, dce: 'Le titulaire assure des rondes. 76000 Rouen.', referents: '' } as any, { memoireType: mt })).find((x: any) => x.id === 'b5_reunions_indicateurs')?.texte || '';
    expect(sans).toContain('les réunions de suivi sont mensuelles ou trimestrielles selon la nature et les besoins du site.');
  });
  it('schéma de la bibliothèque écarté si sa fréquence n’est plus dans le texte', () => {
    const svg = fs.readFileSync(path.join(__dirname, '../python/schemas_gss/bibliotheque/IV-QUA-04.svg'), 'utf-8');
    expect(frequencesAbsentes(svg, 'les réunions de suivi sont mensuelles ou trimestrielles selon la nature et les besoins du site')).toEqual([]);
    expect(frequencesAbsentes(svg, 'les réunions de suivi sont annuelles')).toEqual(['mensuel', 'trimestriel']);
    expect(frequencesAbsentes(svg, 'une réunion chaque mois et une fois par trimestre')).toEqual([]);
  });
});

describe('contrôle global (T5N-4)', () => {
  it('fréquence imposée non trimestrielle : pratique de GSS gardée, question à GSS', () => {
    const ctx: any = { analyse: {}, dce: 'x', cover: {}, referents: '', imposees: { FREQ_CONTROLE_3: { valeur: 'une fois par mois', citation: 'au minimum une réunion par mois' } } };
    const prep = preparerMemoireType(ctx, { memoireType: mt });
    expect(prep.variables.FREQ_CONTROLE_3.valeur).toBe('une fois par trimestre');
    expect(prep.variables.FREQ_CONTROLE_3.aConfirmer).toMatch(/Pouvez-vous vous engager/);
    const tri = preparerMemoireType({ ...ctx, imposees: { FREQ_CONTROLE_3: { valeur: 'chaque trimestre', citation: 'y' } } }, { memoireType: mt });
    expect(tri.variables.FREQ_CONTROLE_3.valeur).toBe('chaque trimestre');
  });
});
