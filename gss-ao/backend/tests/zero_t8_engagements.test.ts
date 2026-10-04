// Tour 8 (correcteur) : engagements, ajouts de l'adaptation et propositions (T8-CONS-6, T8-CONS-7, T8-CONS-8, T8-CONS-18, T8N-7).
import { describe, it, expect } from 'vitest';
import { motifRefusEngagement } from '../src/generation/memoire_generator';
import { sansClauseSanction, descriptionDeLieu, ajoutHorsDeListe, phraseAjouteeConjuguee, perimetreSecours, controlerProposition } from '../src/generation/reponse_libre_v2';

describe('engagements refusés (T8-CONS-6, T8-CONS-7, T8-CONS-8)', () => {
  it('rôles inversés, clauses de prix, classement du lieu, faculté de l’acheteur, scénario non validé', () => {
    expect(motifRefusEngagement('GSS réalisera un contrôle contradictoire trimestriel sur site, désignera le site contrôlé la veille avant 17h et remettra immédiatement une copie au Titulaire.')).toMatch(/^rôles inversés/);
    expect(motifRefusEngagement('GSS chiffrera les prestations ponctuelles selon les périodes du BPU ; ces taux serviront au chiffrage des renforts.')).toMatch(/^clause de prix/);
    expect(motifRefusEngagement('GSS prévoira en option des renforts, avec BPU jour/nuit/week-end.')).toMatch(/^clause de prix/);
    expect(motifRefusEngagement('GSS prendra en compte le classement de l’établissement de soins en 2e catégorie.')).toMatch(/^description d'un lieu/);
    expect(motifRefusEngagement('Le CHB peut augmenter la fréquence des réunions.')).toMatch(/^faculté de l'acheteur/);
    expect(motifRefusEngagement('Si le client ne souhaite pas maintenir les agents en place, GSS les reprend et les affecte sur un autre site.')).toMatch(/^scénario non validé/);
    expect(motifRefusEngagement('GSS assure la permanence du poste 24h/24.')).toBe('');
  });
});

describe('clauses coercitives de l’acheteur retirées, l’engagement de GSS gardé (T8N-7, T8-CONS-18)', () => {
  it('« aux frais de GSS / du prestataire »', () => {
    expect(sansClauseSanction("En cas d'arrêt de travail, GSS assure les prestations définies par le CHB ; à défaut, le CHB peut remplacer temporairement le personnel aux frais de GSS.")).toBe("En cas d'arrêt de travail, GSS assure les prestations définies par le CHB.");
    expect(sansClauseSanction('En cas de défaut de propreté, le CHB peut faire intervenir une société de nettoyage aux frais de GSS.')).toBe('');
    expect(sansClauseSanction("GSS veille au maintien de leur propreté afin d'éviter que le Centre Henri Becquerel ait à faire intervenir une société de nettoyage aux frais du prestataire en cas de défaut constaté.")).toBe('GSS veille au maintien de leur propreté.');
    expect(sansClauseSanction('GSS remplace tout agent absent dans un délai de 1 heure.')).toBe('GSS remplace tout agent absent dans un délai de 1 heure.');
  });
  it('proposition D5 : la phrase de sanction retirée', () => {
    const r = controlerProposition("GSS veille à la propreté des postes. En cas de défaut de propreté, le CHB peut faire intervenir une société de nettoyage aux frais de GSS.");
    expect(r.texte).toBe('GSS veille à la propreté des postes.');
  });
});

describe('ajouts de l’adaptation (T8-CONS-6, T8-CONS-8)', () => {
  it('description d’un lieu', () => {
    expect(descriptionDeLieu('Au Centre Henri Becquerel, le site existant de 22 520 m² comprend deux bâtiments.')).toBe(true);
    expect(descriptionDeLieu("Le PC sécurité et l'accueil sont au RDC du bâtiment principal.")).toBe(true);
    expect(descriptionDeLieu('Effectuer sans délai la levée de doute, mettre en sécurité les bâtiments, rendre compte au PCS.')).toBe(false);
    expect(descriptionDeLieu('GSS affecte deux agents au PC sécurité.')).toBe(false);
  });
  it('jamais entre une amorce et sa liste', () => {
    expect(ajoutHorsDeListe('Nos missions types sont les suivantes. Phrase X.\n- a ;\n- b.\n\nSuite.', 'Phrase X.')).toBe('Nos missions types sont les suivantes.\n- a ;\n- b.\n\nPhrase X.\n\nSuite.');
  });
  it('à la voix de GSS, même après deux compléments de tête', () => {
    expect(phraseAjouteeConjuguee('Préparer la transition et la reprise du personnel avant le début d’exécution.')).toBe("GSS s'engage à préparer la transition et la reprise du personnel avant le début d’exécution.");
    expect(phraseAjouteeConjuguee('À l’échéance, en cas de résiliation, garantir la continuité du service.')).toBe("À l’échéance, en cas de résiliation, GSS s'engage à garantir la continuité du service.");
  });
  it('périmètre de secours sans consigne de cadrage', () => {
    expect(perimetreSecours('- Site unique : IMM.\n- Hors périmètre : ne pas présenter les options BPU comme des effectifs de base.\n- Contrôle des accès : oui. Aucune télésurveillance par GSS n’est décrite.')).toBe('- Site unique : IMM.\n- Contrôle des accès : oui.');
  });
});

import { nettoyerBloc1 } from '../src/generation/reponse_libre_v2';
describe('bloc 1 : attente qui reprend une clause coercitive retirée (C3, C6, T8N-7)', () => {
  it('« à ses frais et risques auprès d’un tiers » jamais repris', () => {
    const t = "## Vos attentes et nos engagements\n- **« l'exécution de la prestation se fera à ses frais et risques auprès d'un tiers »** si GSS ne peut intervenir : nous préparons le remplacement → notre réponse : « La planification ».\n- **Remplacement sous 1 heure** : nous remplaçons l'agent absent → notre réponse : « Le remplacement d'un agent absent ».\n";
    const r = nettoyerBloc1(t, undefined, '1 an', []);
    expect(r.texte).not.toMatch(/frais et risques/);
    expect(r.texte).toMatch(/Remplacement sous 1 heure/);
  });
});
