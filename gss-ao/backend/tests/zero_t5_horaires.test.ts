/** Tour 5, correcteur : horaires du bloc 1 en mode dégradé (T5N-11) et typographie des données du DCE (T5-CONS-10). */
import { describe, it, expect } from 'vitest';
import { horairesLisibles } from '../src/generation/reponse_libre_v2';
import { typographieDce, nettoyerStructure } from '../src/generation/base_memoires';

describe('horaires imprimés au bloc 1 (T5N-11)', () => {
  it('puce de service sans ponctuation finale gardée, horaires d\'ouverture d\'un bureau écartés', () => {
    const h = horairesLisibles([
      '[DISPOSITIONS SPECIFIQUES AU LOT N°1] La mise en place d’un 1er SSIAP1 avec qualification CQP APS dédié de 21h à 9h, toute l’année du lundi au samedi, et 24h/24 les dimanches et jours fériés',
      'Bureau du Parc Lices ouvert : Les Lundis de 09h00 à 00h00 ;',
    ]);
    expect(h).toEqual(['La mise en place d’un 1er SSIAP1 avec qualification CQP APS dédié de 21h à 9h, toute l’année du lundi au samedi, et 24h/24 les dimanches et jours fériés.']);
  });
});

describe('typographie des données du DCE (T5-CONS-10)', () => {
  it('« 05H30 », « 21 H 30 », « Ronde d\'Ouverture » ramenés à la forme du mémoire', () => {
    expect(typographieDce("La ronde d'Ouverture est effectuée à 05H30 et la ronde de Fermeture à 21 H 30.")).toBe("La ronde d'ouverture est effectuée à 05h30 et la ronde de fermeture à 21h30.");
    expect(typographieDce("| Ronde d'Ouverture | Du lundi au vendredi, 05H30 |")).toBe("| Ronde d'ouverture | Du lundi au vendredi, 05h30 |");
    expect(typographieDce('La ronde de Rouen à 7 h 30.')).toBe('La ronde de Rouen à 7 h 30.');
    expect(nettoyerStructure("Texte.\n\nLa ronde de Fermeture a lieu à 21 H 30.")).toContain('ronde de fermeture a lieu à 21h30');
  });
});
