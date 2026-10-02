import { describe, it, expect } from 'vitest';
import { fidelite, faitsDePhrase } from '../src/generation/memoire_type';
import { recalerSurReference } from '../src/generation/memoire_type_cadre';

/** Tour 1 (T1C-01) : un chiffre, un quantificateur, un nom ou un mot interdit changé n'est plus « la phrase de GSS ». */
const ALARME = "En cas d'alarme, notre rondier intervient sur site en 45 minutes maximum après l'appel de la télésurveillance, effectue la levée de doute et rédige son rapport dans la main courante électronique.";
const CONTROLE = 'Contrôle 2 : le contrôle technique de la prestation, réalisé par nos contrôleurs de façon inopinée, une à trois fois par mois selon les besoins du site.';

describe('fidélité et faits de GSS', () => {
  it('faits d’une phrase', () => {
    expect(faitsDePhrase(CONTROLE)).toContain('R:1-3');
    expect(faitsDePhrase('agent sous-traitant')).toContain('F:soustrait');
  });
  it('fidelite refuse un fait changé', () => {
    expect(fidelite(CONTROLE, CONTROLE)).toBe(1);
    expect(fidelite(CONTROLE, CONTROLE.replace('une à trois', 'trois'))).toBe(0);
    expect(fidelite(ALARME, ALARME.replace('45 minutes', '20 minutes'))).toBe(0);
    expect(fidelite(ALARME, ALARME.replace('notre rondier', 'notre agent sous-traitant'))).toBe(0);
  });
  it('un nombre imposé par le DCE peut remplacer celui de GSS', () => {
    expect(fidelite(ALARME, ALARME.replace('45 minutes', '20 minutes'), 0.8, 'Le titulaire intervient en moins de 20 minutes.')).toBe(1);
  });
  it('recalerSurReference rétablit la phrase de GSS', () => {
    for (const rep of [ALARME.replace('45 minutes', '20 minutes'), ALARME.replace('45 minutes maximum', 'moins de 45 minutes'), ALARME.replace("notre rondier", 'notre agent sous-traitant'), ALARME.replace('notre rondier', 'notre rondier Securitas')]) {
      const r = recalerSurReference(ALARME, rep);
      expect(r.texte).toBe(ALARME);
      expect(r.fidelite).toBe(1);
    }
    const r = recalerSurReference(CONTROLE, CONTROLE.replace('une à trois', 'trois'));
    expect(r.texte).toBe(CONTROLE);
  });
});
