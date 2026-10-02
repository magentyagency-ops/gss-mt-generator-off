import { describe, it, expect } from 'vitest';
import { recalerSurReference, completerSousTitresVides, attendusDuChamp, attendusSansReponse } from '../src/generation/memoire_type_cadre';

const REF = [
  "L'équipe dédiée à Citédia Métropole :",
  "Après avoir analysé les besoins de la mission, nous avons construit une organisation de terrain et constitué l'équipe suivante :",
  'Catégorie de personnel : Qualification : Nombre : Observations',
  'Agent de sécurité : CQP APS : 3 : 84 h par semaine, soit 2,46 ETP',
  "Nous mettons en place une équipe de 3 agents titulaires, qui assurent les missions de façon régulière.",
].join('\n');

/** Tour 4 (T4N-5) : citedia2 442, sous-critère 1. */
describe('recalage du cadre : amorce et tableau indivisibles (T4N-5)', () => {
  it('les sous-titres du cadre écrits entre l\'amorce et son tableau passent devant l\'amorce', () => {
    const reponse = [
      "L'équipe dédiée à Citédia Métropole :",
      "Après avoir analysé les besoins de la mission, nous avons construit une organisation de terrain et constitué l'équipe suivante :",
      'Organisation et dimensionnement des équipes',
      'Le dimensionnement repose sur les plages horaires commandées par Citédia Métropole pour chacun des onze parcs de stationnement.',
      'Catégorie de personnel : Qualification : Nombre : Observations',
      'Agent de sécurité : CQP APS : 3 : 84 h par semaine, soit 2,46 ETP',
      "Nous mettons en place une équipe de 3 agents titulaires, qui assurent les missions de façon régulière.",
    ].join('\n');
    const r = recalerSurReference(REF, reponse);
    const l = r.texte.split('\n').filter((x) => x.trim());
    const i = l.findIndex((x) => /équipe suivante :$/.test(x));
    expect(l[i + 1]).toBe('Catégorie de personnel : Qualification : Nombre : Observations');
    expect(l.indexOf('Organisation et dimensionnement des équipes')).toBeLessThan(i);
  });

  it('fragment de pseudo-tableau du modèle sous le tableau de GSS (citedia2 474 : « Nombre : 3 titulaires… ») : retiré', () => {
    const reponse = REF.replace('2,46 ETP', '2,46 ETP\nNombre : 3 titulaires, représentant 2,46 ETP sur la base de 84 h par semaine. Les agents détiennent la carte professionnelle CNAPS en cours de validité.');
    const r = recalerSurReference(REF, reponse);
    expect(r.texte).not.toMatch(/^Nombre :/m);
    expect(r.texte).toContain('Les agents détiennent la carte professionnelle CNAPS en cours de validité.');
  });

  it('rien n\'est collé à une ligne du tableau', () => {
    const reponse = REF.replace('Nombre : Observations', 'Nombre : Observations Nombre : 3.');
    const r = recalerSurReference(REF, reponse);
    expect(r.texte).toContain('Catégorie de personnel : Qualification : Nombre : Observations\n');
    expect(r.texte).not.toMatch(/Observations Nombre/);
  });

  it('sous-titre du cadre complété par la phrase de GSS déjà présente plus loin : phrase déplacée, sous-titre de GSS vide retiré', () => {
    const phrase = "Nous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement : les agents acquièrent ainsi une très bonne connaissance du site.";
    const texte = ['Stabilité des équipes et connaissance des sites', 'Tenues et équipements', 'Nos tenues sont fournies par GSS et adaptées à la mission de chaque site.', '', 'La stabilité des équipes :', phrase, '', 'Les ressources de GSS :', 'Au total, GSS compte 380 salariés.'].join('\n');
    const sources = [{ texte: `**La stabilité des équipes**\n${phrase}\n\n**Les ressources de GSS**\nAu total, GSS compte 380 salariés.` }];
    const r = completerSousTitresVides(texte, sources);
    expect(r.texte.split(phrase).length - 1).toBe(1);
    expect(r.texte).not.toMatch(/La stabilité des équipes :/);
    expect(r.texte.split('\n')[1]).toBe(phrase);
    expect(r.texte).toContain('Les ressources de GSS :');
  });

  it('sous-titre du cadre suivi d\'un sous-titre de GSS qui a son texte (citedia2 474) : ni « [À COMPLÉTER] », ni phrase recopiée', () => {
    const phrase = "Nous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement : les agents acquièrent ainsi une très bonne connaissance du site.";
    const texte = ['Continuité et stabilité des équipes', 'La stabilité des équipes :', phrase, 'Les ressources de GSS :', 'Au total, GSS compte 380 salariés.'].join('\n');
    const sources = [{ texte: `**La stabilité des équipes**\n${phrase}\n\n**Les ressources de GSS**\nAu total, GSS compte 380 salariés.` }];
    const r = completerSousTitresVides(texte, sources);
    expect(r.texte).toBe(texte);
  });
});

/** Tour 4 (T4N-4) : citedia2 442, sous-critère 5 limité à 4 pages. */
describe('recalage du cadre avec limite : éléments attendus, pronom orphelin, point-virgule (T4N-4)', () => {
  const LIBELLE = "SOUS-CRITERE 5 ; Outils de suivi et traçabilité des prestations – sur 15 points ; Description argumentée ; Maximum 4 pages recto ; Éléments de réponse attendus : ; Présentation de la main courante électronique ; Démarche qualité appliquée au Marché ; Indicateurs et tableaux de bord proposés pour le suivi du Marché";
  const REF5 = "En 2024, nous avons remplacé la main courante papier par une main courante électronique, Trackforce, déployée sur tous nos sites.\nLes événements sont catégorisés et génèrent des statistiques que nous analysons régulièrement pour établir un bilan qualité trimestriel.";
  it('éléments attendus lus dans le libellé du champ', () => {
    expect(attendusDuChamp(LIBELLE)).toEqual(['Présentation de la main courante électronique', 'Démarche qualité appliquée au Marché', 'Indicateurs et tableaux de bord proposés pour le suivi du Marché']);
  });
  it('la seule réponse à un élément attendu n\'est jamais retirée pour tenir la limite', () => {
    const G = [
      'En 2024, nous avons remplacé la main courante papier par une main courante électronique, Trackforce, déployée sur tous nos sites.',
      'Les événements sont catégorisés et génèrent des statistiques que nous analysons régulièrement pour établir un bilan trimestriel.',
      "Chaque saisie est horodatée de façon infalsifiable et l'historique des modifications est conservé pendant toute la durée du marché.",
      "Les données sont sauvegardées, exportables en PDF et en Excel, et notre client y dispose d'un accès permanent et sécurisé.",
      'Elles sont conservées pendant dix ans et, en fin de marché, restituées ou détruites selon le choix de notre client.',
    ];
    const reponse = ['Présentation de la main courante électronique', G[0], G[1], 'Démarche qualité appliquée au Marché', 'La démarche qualité du marché repose sur un plan de contrôle mensuel des prestations, partagé avec Citédia Métropole et revu chaque trimestre lors de la réunion de suivi.', 'Indicateurs et tableaux de bord proposés pour le suivi du Marché', "Les indicateurs suivis sont le taux de couverture des vacations, le délai de remplacement, le nombre de rondes réalisées et le nombre d'anomalies traitées."].join('\n');
    const attendus = attendusDuChamp(LIBELLE);
    // Sans les éléments attendus (comportement d'avant) : les deux réponses du modèle sont retirées pour tenir la limite.
    const sans = recalerSurReference(G.join('\n'), reponse, { limite: true, maxMots: 95, seuil: 0.9 });
    expect(attendusSansReponse(sans.texte, attendus)).toEqual(['Démarche qualité appliquée au Marché', 'Indicateurs et tableaux de bord proposés pour le suivi du Marché']);
    const r = recalerSurReference(G.join('\n'), reponse, { limite: true, maxMots: 95, seuil: 0.9, attendus });
    expect(attendusSansReponse(r.texte, attendus)).toEqual([]);
    expect(r.texte).toContain('Présentation de la main courante électronique');
    expect(r.fidelite).toBeLessThan(0.9);
  });
  it('phrase ajoutée qui ouvre un paragraphe par un pronom sans antécédent : retirée', () => {
    const reponse = ["Modalités d'accès de Citédia Métropole aux éléments de traçabilité", 'Elle peut également, si elle le souhaite, être destinataire des rapports transmis en temps réel.', '', REF5].join('\n');
    const r = recalerSurReference(REF5, reponse);
    expect(r.texte).not.toMatch(/^Elle peut également/m);
  });
  it('démonstratif sans antécédent en tête de bloc (« Cette transmission… ») : article défini', () => {
    const reponse = ["Modalités d'alerte en cas d'anomalie ou d'événement significatif", 'Cette transmission permet de porter rapidement les anomalies et événements significatifs à la connaissance de l\'encadrement.', '', REF5].join('\n');
    const r = recalerSurReference(REF5, reponse);
    expect(r.texte).toContain('La transmission permet de porter rapidement les anomalies');
    expect(r.texte).not.toMatch(/^Cette transmission/m);
  });
  it('« ; » suivi d\'une phrase de GSS : minuscule au déterminant', () => {
    const ref = 'Le rapport trimestriel d\'activité présente les principaux événements du trimestre et les points de vigilance.';
    const reponse = 'Les événements sont catégorisés et consignés dans la main courante électronique ; le rapport trimestriel présente les événements du trimestre et les vigilances.';
    const r = recalerSurReference(ref, reponse);
    expect(r.texte).not.toMatch(/; Le rapport/);
  });
});
