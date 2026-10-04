/**
 * Tour 4, correcteur (T4G-6) : contrôles inopinés faits par l'acheteur (sujet « la Ville », « le représentant de la
 * collectivité ») jamais lus comme une obligation du titulaire ; les vocabulaires du titulaire restent reconnus.
 */
import { describe, it, expect } from 'vitest';
import { preparerMemoireType } from '../src/generation/memoire_type';

const lire = (ph: string) => {
  const dce = `\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nArticle 1 - Objet\nSurveillance du site, 12 rue Jeanne d'Arc, 76000 Rouen. Un agent de sécurité est présent du lundi au vendredi de 7h00 à 21h00.\nArticle 9 - Contrôles\n${ph}\n`;
  const prep: any = preparerMemoireType({ analyse: { clientName: 'Ville de Rouen' }, dce, referents: '' } as any);
  return { exige: !!prep.indicateurs.CONTROLES_INOPINES_EXIGES, freq: prep.variables.FREQ_CONTROLE_2?.valeur };
};

describe('auteur des contrôles inopinés (T4G-6)', () => {
  it('titulaire nommé de toutes les façons : exigence reconnue', () => {
    for (const ph of ['Le titulaire réalise au moins deux contrôles inopinés par mois sur le site.', 'Le prestataire réalise au moins deux contrôles inopinés par mois sur le site.', 'Le cocontractant effectue au moins deux contrôles inopinés par mois sur le site.', "L'entreprise retenue s'engage à réaliser au moins deux contrôles inopinés par mois.", 'La société de gardiennage organise au moins deux contrôles inopinés par mois.', 'Le candidat retenu devra effectuer au moins deux contrôles inopinés mensuels de ses agents.']) expect(lire(ph).exige, ph).toBe(true);
  });
  it('acheteur en sujet : aucune exigence du titulaire, la fréquence de GSS reste', () => {
    for (const ph of ['La Ville effectuera des contrôles inopinés de la présence des agents au moins deux fois par mois.', 'Le CHU pourra effectuer des contrôles inopinés de la présence des agents au moins deux fois par mois.', 'Des contrôles inopinés de la présence des agents seront réalisés par les services techniques de la commune au moins deux fois par mois.', 'Le représentant de la collectivité effectue au moins deux contrôles inopinés par mois.']) {
      const r = lire(ph);
      expect(r.exige, ph).toBe(false);
      expect(r.freq, ph).toBe('une à trois fois par mois');
    }
  });
});
