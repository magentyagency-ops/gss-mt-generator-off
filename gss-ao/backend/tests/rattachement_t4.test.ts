import { describe, it, expect } from 'vitest';
import { chargerMemoireType, exigencesParRubrique, planMemoireType } from '../src/generation/memoire_type';
import { messageEngagements } from '../src/generation/reponse_libre_v2';

/** Tour 4 (T4C-9) : une exigence n'est jamais rattachée à une rubrique sans lien avec son thème. */
describe('rattachement des exigences du CCTP (T4C-9)', () => {
  const mt = chargerMemoireType();
  const plan = planMemoireType(mt, Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE'])));
  it('caen 471 : fin du marché, sinistre, prestations ponctuelles, discrétion', () => {
    const m: any[] = [
      { exigence: 'À la fin du marché, GSS initiera le personnel du nouveau prestataire aux spécificités du site.', rubrique: 'b3_formation_ssiap_b' },
      { exigence: "En cas de sinistre ou d'incident grave, mobiliser les équipes nécessaires dans un délai de 2 heures.", rubrique: 'b5_evenementiel' },
      { exigence: 'Prestations ponctuelles de gardiennage à la demande, dont une ronde de surveillance de 30 minutes.', rubrique: 'b5_controle_nuit' },
      { exigence: 'Le titulaire et ses agents sont tenus à une obligation de discrétion.', rubrique: 'b3_valeurs_sociales' },
      { exigence: 'Les agents SSIAP 1 assurent la surveillance du SSI.', rubrique: 'b3_formation_ssiap_b' },
    ];
    const r = exigencesParRubrique(mt, plan, m).parRubrique;
    const ou = (debut: string) => Object.entries(r).find(([, l]) => l.some((e) => e.exigence.startsWith(debut)))?.[0];
    expect(ou('À la fin du marché')).toBe('b5_mise_en_place');
    expect(ou("En cas de sinistre")).toBe('b4_proc_ordre_alerte');
    expect(ou('Prestations ponctuelles')).toBe('b5_commande_supplementaire');
    expect(ou('Le titulaire et ses agents')).toBe('b4_lmc');
    // Rattachement de la matrice qui a un lien avec la rubrique : gardé.
    expect(ou('Les agents SSIAP 1')).toBe('b3_formation_ssiap_b');
  });
});

/** Tour 4 (T4C-10) : premier message de l'assistant, engagements rédigés par l'IA. */
describe('engagements rédigés par l\'IA signalés à GSS (T4C-10)', () => {
  it('une ligne par rubrique, total annoncé', () => {
    const t = messageEngagements([{ titre: "L'ordre d'alerte", n: 3 }, { titre: 'La gestion des moyens d\'accès', n: 1 }]);
    expect(t).toMatch(/^J'ai ajouté 4 engagements rédigés d'après le cahier des charges/);
    expect(t).toContain("- « L'ordre d'alerte » : 3 engagements");
    expect(t).toContain('- « La gestion des moyens d\'accès » : 1 engagement');
  });
});

/** Génération réelle caen 475 (vérification de T4C-9) : rubriques au sujet étroit (sujet_ajouts) et mots-clés de routage. */
describe('rattachement des exigences du CCTP, génération réelle caen 475 (T4C-9)', () => {
  const mt = chargerMemoireType();
  const plan = planMemoireType(mt, Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE' && k !== 'SSIAP'])));
  it('effraction, interdits de conduite, réunion d\'exploitation : rubrique de leur thème ; carte professionnelle et équipements gardés', () => {
    const m: any[] = [
      { exigence: 'En cas d’effraction, l’agent de sécurité reste sur place pour garantir la sécurité du bâtiment.', rubrique: 'b3_formation_ads' },
      { exigence: 'Il est interdit au personnel l’introduction ou la consommation d’alcool ou de stupéfiants, le travail en état d’ivresse, le désordre et l’accès sans badge ou pièce d’identité.', rubrique: 'b3_valeurs_sociales' },
      { exigence: 'Participer avec son personnel d’encadrement à une réunion d’exploitation qualité organisée au minimum trimestriellement : planification du mois à venir, bilan du mois écoulé, vérifications d’équipements.', rubrique: 'b4_equipements' },
      { exigence: 'Les agents détiennent une carte professionnelle comportant le nom, le prénom, la qualité, la photo et la raison sociale.', rubrique: 'b3_formation_ads' },
      { exigence: 'Fourniture de lampes torches et de gilets pare-lame aux agents.', rubrique: 'b4_equipements' },
    ];
    const r = exigencesParRubrique(mt, plan, m).parRubrique;
    const ou = (debut: string) => Object.entries(r).find(([, l]) => l.some((e) => e.exigence.startsWith(debut)))?.[0];
    expect(ou('En cas d’effraction')).toBe('b4_proc_intrusion');
    expect(ou('Il est interdit au personnel')).toBe('b4_lmc');
    expect(ou('Participer avec son personnel')).toBe('b5_reunions_indicateurs');
    expect(ou('Les agents détiennent une carte')).toBe('b3_formation_ads');
    expect(ou('Fourniture de lampes')).toBe('b4_equipements');
  });
});
