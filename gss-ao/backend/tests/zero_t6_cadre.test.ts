/**
 * Tour 6, correcteur : cadre imposé (contact de GSS, phrases ajoutées par l'IA, recalage des sous-titres, questions redites,
 * annonces orphelines, phrase d'origine rétablie).
 */
import { describe, it, expect } from 'vitest';
import { controlerFaitsNouveauxCadre, ajoutsAuTexteDeGss, recalerSurReference } from '../src/generation/memoire_type_cadre';
import { phrasesImprimees, messageAjoutsCadre, cleDonnee, sansQuestionsRedites } from '../src/generation/memoire_generator';
import { extraireConfirmations } from '../src/generation/base_memoires';
import { deciderAdaptation } from '../src/generation/adaptations_cctp';

describe('contact de GSS : seul le segment de contact est concerné (T6-CONS-1)', () => {
  const src = { toutes: 'marchani adil lemele fabrice porchaire laurent da silva luis', gss: '', telephoneUnique: '06 58 06 32 25', interlocuteurUnique: 'MARCHANI', interlocuteurNom: 'MARCHANI Adil', telephoneFixe: '09 62 21 24 75' };
  const ctx = 'Section: "VALEURS TECHNIQUES"\nQuestion: "La composition des équipes (interlocuteur unique à la ville, encadrants, CV détaillés, agréments, certificats et cartes professionnelles, etc)"';
  it('les responsables d\'exploitation gardent leurs noms', () => {
    const v = "• Interlocuteur unique : MARCHANI Adil, directeur d'agence et responsable de marché.\n\nLes responsables d'exploitation LEMELE Fabrice, PORCHAIRE Laurent et DA SILVA Luis assurent le relais opérationnel.";
    const t = controlerFaitsNouveauxCadre(v, ctx, src as any).texte;
    expect(t).toContain('LEMELE Fabrice, PORCHAIRE Laurent et DA SILVA Luis');
    expect(t).not.toMatch(/MARCHANI Adil, MARCHANI Adil/);
  });
  it('une autre personne présentée comme interlocutrice unique devient l\'interlocuteur unique', () => {
    const t = controlerFaitsNouveauxCadre('VATTIER Marie, interlocutrice unique — tél. : 06 25 73 94 58.', ctx, src as any).texte;
    expect(t).toContain('MARCHANI Adil, interlocuteur unique');
  });
});

describe('phrases ajoutées par l\'IA au texte de GSS (T6N-4, T6-CONS-2, T6-COH-1, T6-COH-5, T6N-5)', () => {
  it('jamais un intitulé, un emplacement, une ligne de formulaire ni un marqueur', () => {
    const t = ['Recours à la sous-traitance et à l\'intérim', 'Formations suivies par les agents — SST', 'Prise de service – heure : [à renseigner]', 'Date de fin de validité de l\'autorisation d\'exercer : [À COMPLÉTER].', '[CONSULTATION REQUISE : liste nominative des agents à fournir avec leurs dates]', 'Les remplacements sont coordonnés avec la Ville pour préserver la couverture prévue de la fête communale.'].join('\n');
    expect(ajoutsAuTexteDeGss(t, 'Texte de GSS sans rapport.', '', []).signalees).toEqual(['Les remplacements sont coordonnés avec la Ville pour préserver la couverture prévue de la fête communale.']);
  });
  it('phrase reprise des autres textes de GSS (registre, rubrique non publiée) : jamais signalée', () => {
    const t = "GSS n'a pas recours à l'intérim ; les remplacements sont assurés par ses propres équipes.";
    expect(ajoutsAuTexteDeGss(t, 'Autre texte.', '', ["GSS n'a pas recours à l'intérim ; les remplacements sont assurés par ses propres équipes."]).signalees).toEqual([]);
  });
  it('signalement rapproché du texte imprimé : phrase corrigée retenue telle qu\'imprimée, phrase absente jamais signalée', () => {
    const final = "Le dispositif compte 11 agents en service. Les remplacements sont coordonnés avec la Mairie d'Etampes pour préserver la couverture.";
    expect(phrasesImprimees(["Le dispositif compte 12 agents en service.", "Les remplacements sont coordonnés avec la Ville d'Étampes pour préserver la couverture.", 'GSS recherche un autre binôme cynophile dans son réseau de partenaires.'], final))
      .toEqual(['Le dispositif compte 11 agents en service.', "Les remplacements sont coordonnés avec la Mairie d'Etampes pour préserver la couverture."]);
  });
  it('annoncées dans le premier message, avec les choix possibles', () => {
    const m = messageAjoutsCadre([{ libelle: 'Mise en situation appliquée', phrases: ['Les remplacements sont coordonnés avec la Ville.'] }]);
    expect(m).toMatch(/^J'ai ajouté au texte de GSS une phrase rédigée par l'IA/);
    expect(m).toContain('« Les remplacements sont coordonnés avec la Ville. »');
    expect(m).toMatch(/valider telle quelle, la modifier .* ou la supprimer/);
  });
});

describe('recalage : sous-titre du cadre devant son bloc de GSS (T6-CONS-3)', () => {
  const ref = "Intro de GSS sur le climat et la nature qui est un enjeu majeur pour nous tous.\n\nLes transports :\n• Nous encourageons nos salariés à venir en transports en commun ou à vélo.\n• Nous organisons des départs en covoiturage pour réduire le nombre de véhicules.\n\nLes économies d'énergie :\nNous veillons au respect de bonnes pratiques dans nos locaux :\n• éteindre les lumières le soir avant de quitter les bureaux ;\n• fermer les robinets pendant le lavage des mains.";
  const rep = "Flotte automobile\n• Nous encourageons nos salariés à venir en transports en commun ou à vélo.\n• Nous organisons des départs en covoiturage pour réduire le nombre de véhicules.\n\nÉcogestes\n• Nous veillons au respect de bonnes pratiques dans nos locaux : éteindre les lumières le soir avant de quitter les bureaux ; fermer les robinets pendant le lavage des mains.";
  it('« Écogestes » devant les économies d\'énergie, jamais vide en fin de réponse ; liste fondue retrouvée en entier', () => {
    const t = recalerSurReference(ref, rep, { limite: true, attendus: [] }).texte;
    expect(t).not.toMatch(/Écogestes\s*$/);
    expect(t.indexOf('Écogestes')).toBeLessThan(t.indexOf("Les économies d'énergie"));
    expect(t.indexOf('Flotte automobile')).toBeLessThan(t.indexOf('Les transports'));
    expect(t).toContain('• éteindre les lumières le soir avant de quitter les bureaux ;');
  });
});

describe('questions redites et annonces orphelines (T6-CONS-4)', () => {
  it('annonce terminée par « : » retirée avec son marqueur, sauf si une liste la suit', () => {
    expect(extraireConfirmations('Paragraphe un.\nLe délai de mobilisation applicable à Étampes : [CONSULTATION REQUISE : Quel délai ?]\nSuite.').texte).toBe('Paragraphe un.\nSuite.');
    expect(extraireConfirmations('Les consignes suivantes : [CONSULTATION REQUISE : lesquelles ?]\n• a\n• b').texte).toBe('Les consignes suivantes :\n• a\n• b');
  });
  it('même donnée qu\'un emplacement ou qu\'une proposition à valider : une seule question', () => {
    expect(cleDonnee("Quels sont le délai d'intervention et le délai de mobilisation de l'équipe en cas de besoin ?")).toEqual(['delai_mise_en_place']);
    const qs = [
      { question: 'Proposition à valider : couverture horaire du cas pratique entre 21 h 00 et 22 h 30 (2 heures non couvertes) ; faut-il renforcer le dispositif sur ces heures ?' },
      { question: 'Quelle organisation est prévue pour assurer la couverture des postes entre 21 h 00 et 22 h 30 lors de la fête ?' },
    ];
    const r = sansQuestionsRedites(qs, { prioritaires: [] });
    expect(r.map((x) => x.question)).toEqual([qs[0].question]);
    const r2 = sansQuestionsRedites([{ question: "Quels sont le délai d'intervention et le délai de mobilisation de l'équipe en cas de besoin ?" }], { prioritaires: ["Délais : quel délai GSS annonce-t-elle pour une intervention courante (mise en place d'une demande) ?"] });
    expect(r2).toEqual([]);
  });
});

describe('phrase d\'origine rétablie à la ponctuation de sa liste (T6N-8)', () => {
  it('jamais « ; » au milieu d\'une liste dont les puces finissent par un point', () => {
    const t = "• nos agents font leur prise de service 15 minutes avant le début de la prestation.\n• si le responsable n'a pas reçu la prise de service, il mobilise automatiquement l'agent d'astreinte ;\n• l'agent d'astreinte fait sa prise de service et la consigne sur la main courante.";
    const a: any = { n: 2, rubrique: 'r', titre: 't', origine: "si le responsable n'a pas reçu la prise de service, il mobilise automatiquement l'agent d'astreinte, qui est sur site en 60 minutes maximum ;", adaptee: "si le responsable n'a pas reçu la prise de service, il mobilise automatiquement l'agent d'astreinte ;", exigence: 'e', statut: 'a_valider' };
    expect(deciderAdaptation(t, a, 'retablir').texte.split('\n')[1]).toBe("• si le responsable n'a pas reçu la prise de service, il mobilise automatiquement l'agent d'astreinte, qui est sur site en 60 minutes maximum.");
  });
});
