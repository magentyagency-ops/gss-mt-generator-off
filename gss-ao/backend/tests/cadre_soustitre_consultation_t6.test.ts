// Tour 6 (T6N-2, T6C-5) : un sous-titre du cadre suivi seulement d'un repère de consultation reçoit un emplacement.
import { describe, it, expect } from 'vitest';
import { completerSousTitresVides, sousTitreParent } from '../src/generation/memoire_type_cadre';
import { extraireConfirmations } from '../src/generation/base_memoires';

const REPONSE = `Encadrement et moyens de l’entreprise
Responsables d'exploitation : LEMELE Fabrice, PORCHAIRE Laurent et DA SILVA Luis.

CV détaillés, agréments, certificats et cartes professionnelles
[CONSULTATION REQUISE : Joindre les CV détaillés des agents affectés au marché, ainsi que les justificatifs des agréments, certificats et cartes professionnelles requis.]`;

describe('Sous-titre suivi d\'un repère de consultation (etampes1 594)', () => {
  it('l\'intitulé reçoit « [À COMPLÉTER] » avant le repère ; la question reste extraite', () => {
    const r = completerSousTitresVides(REPONSE, []);
    const x = extraireConfirmations(r.texte);
    expect(x.texte.trim().endsWith('CV détaillés, agréments, certificats et cartes professionnelles\n[À COMPLÉTER]')).toBe(true);
    expect(x.confirmations).toHaveLength(1);
    expect(x.confirmations[0]).toMatch(/CV détaillés/);
  });
  it('un sous-titre suivi d\'un repère puis de son texte n\'est pas touché', () => {
    const t = 'Stabilité des équipes\n[CONSULTATION REQUISE : taux de rotation ?]\nNous privilégions la stabilité sur les sites fixes, avec un léger roulement.';
    expect(completerSousTitresVides(t, []).texte).toBe(t);
  });
});

describe('Sous-titre parent d\'une composante détaillée entre parenthèses (etampes1 594)', () => {
  const Q = "Composition des équipes mises à disposition comprenant : Le nombre d’équipes ; La composition des équipes (interlocuteur unique à la ville, encadrants, CV détaillés, agréments, certificats et cartes professionnelles, etc).";
  it('« Composition des équipes » suivi de « Interlocuteur unique à la ville » n\'est pas vide', () => {
    expect(sousTitreParent('Composition des équipes', 'Interlocuteur unique à la ville', Q)).toBe(true);
    expect(sousTitreParent('Nombre d’équipes', 'Interlocuteur unique à la ville', Q)).toBe(false);
    const t = 'Composition des équipes\nInterlocuteur unique à la ville\nNotre organisation interne garantit à nos clients un système d\'interlocuteur unique.';
    expect(completerSousTitresVides(t, [], [], Q).texte).toBe(t);
    expect(completerSousTitresVides(t, []).texte).toMatch(/Composition des équipes\n\[À COMPLÉTER\]/);
  });
});
