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

import { completerParThematiques, phrasesThematiques, completerSousTitresVides } from '../src/generation/memoire_type_cadre';
describe('renfort urgent hors astreinte (ca_normandie 241, T2C-2)', () => {
  const textes = { b3_adequation: "Nous mettons en place une équipe de 83 agents titulaires.\n\nPour les renforts ponctuels, nous disposons d'un vivier de 500 agents validés par nos équipes, dont 100 mobilisables en 48 heures." };
  const th = phrasesThematiques(textes);
  it('ligne « libellé : [À COMPLÉTER] » sur le renfort urgent : phrase du vivier de GSS', () => {
    const r = completerParThematiques('Renfort urgent hors astreinte\nMoyens mis en œuvre pour remédier à un besoin urgent de renfort hors astreinte : [À COMPLÉTER].', th);
    expect(r.texte).toBe("Renfort urgent hors astreinte\nPour les renforts ponctuels, nous disposons d'un vivier de 500 agents validés par nos équipes, dont 100 mobilisables en 48 heures.");
  });
  it('sous-titre vide sur le renfort urgent : phrase du vivier ; autre sujet : inchangé', () => {
    expect(completerSousTitresVides('**Besoin urgent de renfort hors astreinte**\n[À COMPLÉTER]', [], th).texte).toContain('vivier de 500 agents');
    expect(completerParThematiques('Taux de reprise du personnel en place : [À COMPLÉTER].', th).completes).toEqual([]);
  });
  it('valeur non publipostée : aucune phrase', () => {
    expect(phrasesThematiques({ b3: "Pour les renforts ponctuels, nous disposons d'un vivier de {{VIVIER_EVENEMENTIEL}} agents." })).toEqual([]);
  });
});
