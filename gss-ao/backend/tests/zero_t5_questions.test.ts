/**
 * Tour 5, correcteur : questions à GSS en clair (T5-CONS-8, T5N-9 consignes à l'infinitif ; T5N-10, T5-COH-1 questions tirées
 * d'un engagement refusé ; T5-CONS-9 faits du DCE et groupe nominal coordonné ; T5N-14 liste nominative demandée une fois).
 */
import { describe, it, expect } from 'vitest';
import { questionExacte, questionDEngagement, elementsSansDoublon, questionsUniques, faitDuDce } from '../src/generation/memoire_generator';
import { controlerProposition } from '../src/generation/reponse_libre_v2';

describe('consigne à l\'infinitif (T5-CONS-8, T5N-9)', () => {
  const cas: Array<[string, string]> = [
    ["Transmettre, pour les agents affectés au marché, les noms, prénoms et dates de formation SST ainsi que les dates d'obtention du CQP APS", "Pouvez-vous transmettre, pour les agents affectés au marché, les noms, prénoms et dates de formation SST ainsi que les dates d'obtention du CQP APS ?"],
    ['Préciser, pour chaque site, le nombre de rondes de nuit', 'Pouvez-vous préciser, pour chaque site, le nombre de rondes de nuit ?'],
    ['Fournir : la liste des agents', 'Pouvez-vous fournir la liste des agents ?'],
    ['Souscrire et maintenir une responsabilité civile professionnelle', 'Pouvez-vous souscrire et maintenir une responsabilité civile professionnelle ?'],
    ['Considérer infructueux le contre-appel au bout de trois tentatives', 'Pouvez-vous considérer infructueux le contre-appel au bout de trois tentatives ?'],
    ["Pour l’agent cynophile, garder les extérieurs du site de 22h à 6h", "Pour l’agent cynophile, pouvez-vous garder les extérieurs du site de 22h à 6h ?"],
    ['Lot 1, préparation : raccorder le PC sécurité au réseau', 'Lot 1, préparation : pouvez-vous raccorder le PC sécurité au réseau ?'],
    ['Nombre total d’agents disposant du CQP APS+SSIAP dédiés en ETP', 'Combien d’agents disposant du CQP APS+SSIAP dédiés en ETP au total ?'],
    ['Obtenir les coordonnées du pouvoir adjudicateur', 'Pouvez-vous fournir les coordonnées du pouvoir adjudicateur ?'],
    ['obtenir de GSS le CCTP, le BPU et les annexes opérationnelles nécessaires au dimensionnement des équipes', "Le DCE transmis ne comporte pas le CCTP, le BPU et les annexes opérationnelles nécessaires au dimensionnement des équipes : pouvez-vous les ajouter au dossier s'ils existent, puis relancer la génération ?"],
  ];
  for (const [q, attendu] of cas) it(q, () => expect(questionExacte(q)).toBe(attendu));
  it('jamais « Exigence du DCE » pour une consigne du modèle', () => {
    expect(questionExacte('Exigence du DCE sans réponse dans le mémoire : obtenir de GSS le CCTP')).not.toMatch(/^Exigence du DCE/);
  });
  it('un nom en -re ou -er n\'est pas un infinitif', () => {
    for (const q of ['Heure de début des prestations', 'Dossier de candidature complet', "Procédure d'alerte en cas d'incident", 'Pouvoir adjudicateur : Ville de Rouen']) expect(questionExacte(q)).not.toMatch(/^Pouvez-vous/);
  });
  it('consigne retirée d\'une proposition : question à la deuxième personne', () => {
    const r = controlerProposition("## Conseil\n\nDéfinir avec GSS le circuit interne de validation et d'envoi des alertes écrites : [À COMPLÉTER].");
    expect(r.questions[0]).toBe("Pouvez-vous définir le circuit interne de validation et d'envoi des alertes écrites ?");
  });
});

describe('question tirée d\'un engagement refusé (T5N-10, T5-COH-1)', () => {
  const cas: Array<[string, string]> = [
    ['GSS établira un compte-rendu détaillé de la réunion de mise en place et le transmettra à Citédia Métropole dans les 8 jours ouvrés suivant sa tenue.', 'Que prévoyez-vous pour établir un compte-rendu détaillé de la réunion de mise en place et le transmettre à Citédia Métropole dans les 8 jours ouvrés suivant sa tenue ?'],
    ['GSS transmettra dès la notification la liste nominative des agents, la tiendra à jour et notifiera sans délai tout changement aux correspondants. GSS assurera les formations initiales, continues et de recyclage, et vérifiera les diplômes.', 'Que prévoyez-vous pour transmettre dès la notification la liste nominative des agents, la tenir à jour et notifier sans délai tout changement aux correspondants ?'],
    ["GSS transmettra annuellement au pouvoir adjudicateur un bilan de l'insertion. GSS conservera les justificatifs et les transmettra sur demande.", "Que prévoyez-vous pour transmettre annuellement au pouvoir adjudicateur un bilan de l'insertion ?"],
    ['GSS rédigera un rapport détaillé des interventions et le remettra au client chaque mois.', 'Que prévoyez-vous pour rédiger un rapport détaillé des interventions et le remettre au client chaque mois ?'],
    ["GSS présentera un planning détaillé à la Ville et l'actualisera chaque semaine.", "Que prévoyez-vous pour présenter un planning détaillé à la Ville et l'actualiser chaque semaine ?"],
    ['GSS remettra un rapport précis des interventions chaque mois au responsable du site.', 'Que prévoyez-vous pour remettre un rapport précis des interventions chaque mois au responsable du site ?'],
  ];
  for (const [e, q] of cas) it(e.slice(0, 60), () => {
    const r = questionDEngagement(e);
    expect(r).toBe(q);
    expect(r).not.toMatch(/\bGSS\b|\b\w+(?:era|ira|tra|dra)\b/);
  });
});

describe('questions sans objet ou mal formées (T5-CONS-9)', () => {
  it('description du site tirée du DCE : jamais une question', () => {
    expect(faitDuDce("Site de Caen : 20 rue Alfred Kastler, 14000 Caen ; surface utile brute de 2 820 m² ; horaires d'ouverture de 07h00 à 19h00")).toBe(true);
    expect(faitDuDce('Site de Caen : le titulaire doit assurer une ronde à 21h30')).toBe(false);
  });
  it('« … et confirmation de … ? » : deux questions correctes', () => {
    expect(questionExacte("Combien d'agents à habiliter pour les prestations habituelles et les remplacements, et confirmation de l'engagement à maintenir les mêmes agents pour les interventions successives ?"))
      .toBe("Combien d'agents à habiliter pour les prestations habituelles et les remplacements ? Confirmez-vous l'engagement à maintenir les mêmes agents pour les interventions successives ?");
  });
});

describe('liste nominative des agents demandée une seule fois (T5N-14)', () => {
  it('cases du tableau gardées, question redite retirée, cases jamais groupées', () => {
    const el: any[] = [];
    for (const l of ['SST', 'C.Q.P.A.D.S.']) for (const c of ['NOM', 'Prénom', 'Date']) el.push({ cle: `GSS_AC${el.length}`, question: `Tableau du cadre, ligne « ${l} », colonne « ${c} » : quelle valeur faut-il écrire ?`, statut: 'ouvert', reperes: [el.length + 1] });
    el.push({ cle: 'Q10', question: "Transmettre, pour les agents affectés au marché, les noms, prénoms et dates de formation SST ainsi que les dates d'obtention du CQP APS", statut: 'ouvert' });
    const q = questionsUniques(elementsSansDoublon(el));
    expect(q).toHaveLength(6);
    expect(q.some((x) => /Transmettre|transmettre/.test(x))).toBe(false);
  });
});

describe('libellé « nombre de … et confirmation de … » (T5-CONS-9, caen 1501)', () => {
  it('deux questions correctes', () => {
    expect(questionExacte("nombre d’agents à habiliter pour les prestations habituelles et les remplacements, et confirmation de l’engagement à maintenir les mêmes agents pour les interventions successives"))
      .toBe("Combien d’agents à habiliter pour les prestations habituelles et les remplacements ? Confirmez-vous l'engagement à maintenir les mêmes agents pour les interventions successives ?");
  });
});

describe('engagement refusé : proposition au futur après « ; » retirée de la question (T5-COH-1, rejeu citedia)', () => {
  it('« … ; tout équipement défaillant sera remplacé »', () => {
    expect(questionDEngagement('GSS fournira et maintiendra en état les équipements nécessaires, notamment un PTI avec communication et une lampe torche ; tout équipement défaillant sera remplacé.'))
      .toBe('Que prévoyez-vous pour fournir et maintenir en état les équipements nécessaires, notamment un PTI avec communication et une lampe torche ?');
  });
});
