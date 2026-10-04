// Campagne « zéro défaut », tour 3 : format court (T3-CONS-7, T3-CONS-8).
import { describe, it, expect } from 'vitest';
import { exigenceDeGrillePenalites } from '../src/generation/base_memoires';
import { DCE, aCorpus } from './fixtures/corpus';

const GRILLE = `Article 14 – Pénalités
Les pénalités sont appliquées au Titulaire sur simple constat.
 Pénalité                                                   Modalité de contrôle                                  Montant
 Absence d’un agent ou retard supérieur à 60 min            Planning                                     300 € HT / manquement
 Tenue des locaux et vestiaires des agents                  Propreté / dégradation                                Sur devis
Article 15 – Assurances
Le titulaire maintient une assurance RC.`;

describe('ligne d’une grille de pénalités jamais prise pour une exigence (T3-CONS-8)', () => {
  it('« Tenue des locaux et vestiaires des agents » (Sur devis) : grille ; une obligation suivie de « sous peine de pénalités » reste', () => {
    expect(exigenceDeGrillePenalites('Tenue des locaux et vestiaires des agents', GRILLE)).toBe(true);
    expect(exigenceDeGrillePenalites('Le titulaire maintient une assurance RC', GRILLE)).toBe(false);
    expect(exigenceDeGrillePenalites('Son remplaçant devra être présent dans les deux heures, sous peine de pénalités prévues au CCAP', GRILLE)).toBe(false);
  });
  it.skipIf(!aCorpus('imm'))('imm : la ligne de la grille du CCAP, pas l’exigence du CCTP sur le local', () => {
    expect(exigenceDeGrillePenalites('Tenue des locaux et vestiaires des agents', DCE('imm'))).toBe(true);
    expect(exigenceDeGrillePenalites('Le local, le mobilier et le matériel mis à disposition par l’IMM doivent être nettoyés et entretenus par le personnel du titulaire à chaque fin de poste', DCE('imm'))).toBe(false);
  });
});
