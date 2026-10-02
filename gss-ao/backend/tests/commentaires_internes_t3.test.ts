// T3-COH-3 : commentaires internes du modèle imprimés dans le cadre remis (vitry 241, etampes2 233, etampes1 12).
import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';
import { texteDimensionnement } from '../src/generation/dimensionnement';

describe('commentaires internes retirés et remontés à GSS (T3-COH-3)', () => {
  const cas: Array<[string, string]> = [
    ['Cette continuité limite le risque de zones laissées sans surveillance au moment sensible de la dispersion du public. ', 'Dimensionnement proposé par GSS pour les deux mises en situation : à valider par GSS avant le dépôt définitif de l’offre.'],
    ['Nos équipes interviennent sur toute la moitié nord de la France. ', 'Les délais chiffrés de mise en place d’une commande et d’intervention en urgence sont à valider pour le territoire d’Étampes ; aucun délai normand n’est transposé à ce marché.'],
    ['Le chef de site coordonne les agents. ', 'Le délai de mobilisation applicable à ce site est à valider avec l’acheteur.'],
  ];
  for (const [garde, interne] of cas) {
    it(interne.slice(0, 60), () => {
      const r = retirerCommentairesInternes(garde + interne);
      expect(r.texte.trim()).toBe(garde.trim());
      expect(r.retires).toEqual([interne]);
    });
  }
  it('une phrase de prestation sans commentaire reste intacte', () => {
    const t = 'Les plannings sont validés par les agents à J-7. Le chef de poste valide la main courante chaque jour.';
    expect(retirerCommentairesInternes(t)).toEqual({ texte: t, retires: [] });
  });
});

describe('consigne du dimensionnement : la validation reste interne (T3-COH-3)', () => {
  it('la consigne interdit d’écrire « à valider » dans la réponse', () => {
    const t = texteDimensionnement({ profils: [], titulaires: 0, suppleants: 0, casPratique: [], misesEnSituation: [{ libelle: 'Forum', capacite: 10000, fonctions: [{ fonction: 'Agent de sécurité', nombre: 20 }], pif: 4, detecteurs: 4 }] } as any);
    expect(t).not.toMatch(/proposition de GSS à valider/);
    expect(t).toMatch(/N'écris jamais dans la réponse que ce dispositif est « proposé », « à valider »/);
  });
});
