// Tour 2, génération réelle de contrôle vitry 241 : un « [À COMPLÉTER] » placé entre un sous-titre et son texte n'est
// pas une donnée manquante (critère 3, « Organisation des déplacements / [À COMPLÉTER] / Nous encourageons nos salariés… »).
import { describe, it, expect } from 'vitest';
import { nettoyerReponseCadre } from '../src/generation/memoire_type_cadre';

describe('repère entre un sous-titre et son texte (vitry 241)', () => {
  it('sous-titre suivi de son texte : repère retiré', () => {
    const t = "Texte d'introduction.\n\nOrganisation des déplacements\n[À COMPLÉTER]\nNous encourageons nos salariés à se rendre sur leur site en transports en commun ou à vélo.\n\nGestion des déchets\n[À COMPLÉTER]\nLe matériel de nos agents a une durée de vie limitée.";
    expect(nettoyerReponseCadre(t)).toBe("Texte d'introduction.\n\nOrganisation des déplacements\nNous encourageons nos salariés à se rendre sur leur site en transports en commun ou à vélo.\n\nGestion des déchets\nLe matériel de nos agents a une durée de vie limitée.");
  });
  it('sous-titre sans texte : repère gardé (ca_normandie 221, 2.2)', () => {
    expect(nettoyerReponseCadre('**Pérennité**\nTexte.\n\n**Besoin urgent de renfort hors astreinte**\n[À COMPLÉTER]')).toBe('**Pérennité**\nTexte.\n\n**Besoin urgent de renfort hors astreinte**\n[À COMPLÉTER]');
    expect(nettoyerReponseCadre('**A**\nTexte.\n\n**Besoin urgent de renfort hors astreinte**\n[À COMPLÉTER]\n\n**Suite**\nTexte.')).toContain('hors astreinte**\n[À COMPLÉTER]');
  });
});
