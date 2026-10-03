import { describe, it, expect } from 'vitest';
import { specSecoursBesoin, etapesDuPerimetre, etapesDesPuces, texteEtapeAvecVerbe, rubriqueDePresentation, anomaliesSchemaBloc1, titreRubriqueEtape } from '../src/generation/reponse_libre_v2';

/** Tour 7 (T7CS-5, T7N-5) : schéma de secours du bloc 1 (cstb 551 : périmètre en puces, rubriques citées en renvoi). */
const B1 = `## Votre contexte et votre site

Le CSTB lance le marché « PRESTATIONS DE RONDES DE SURVEILLANCE DU SITE DU CSTB GRENOBLE ».

## Le périmètre de la prestation demandée

- Postes fixes : non ; aucune présence permanente ni dispositif poste par poste n’est prévu. Les prestations récurrentes sont des rondes à pied sur le site CSTB Grenoble.
- Du lundi au vendredi : ronde d’ouverture pour ouverture effective à 07 h 20 ; ronde de fermeture de 19 h 30 à 20 h 30 ; trois rondes de nuit entre 21 h 30 et 06 h 30. Jours de fermeture : deux rondes de jour entre 07 h 00 et 21 h 00 et trois rondes de nuit entre 21 h 30 et 06 h 30.
- Levée de doute : oui, sur appel de la télésurveillance après alarme incendie ou intrusion, ou incident ; de 19 h 30 à 07 h 20 les jours d’ouverture. Elle comprend vérifications et compte rendu ; délai d’intervention : [À COMPLÉTER]⟦AC:1⟧.
- Périmètre : site CSTB Grenoble, bâtiments du site ; le champ agricole est exclu de la surveillance.
- La télésurveillance des alarmes est assurée par une entreprise hors marché ; le marché ne prévoit ni télésurveillance, ni poste fixe.

## Vos attentes et nos engagements

- **Réaliser une ronde** de fermeture les jours d’ouverture, de 19h30 à 20h30 → notre réponse : « Notre catalogue de prestations », développée au bloc 2.
- Pour une ronde supplémentaire commandée par écrit par la Direction, intervenir selon les jours et horaires indiqués ; par défaut, entre 19h30 et 07h20 → notre réponse : « La gestion d'une commande supplémentaire », développée au bloc 5.

## Les points de vigilance identifiés et nos réponses

- **Réaliser 3 rondes de nuit** entre 21h30 et 06h30 → notre réponse : « Notre catalogue de prestations », développée au bloc 2.

Notre organisation garantit la continuité de service et la traçabilité de chaque intervention.`;

describe('schéma de secours du bloc 1 (T7CS-5, T7N-5)', () => {
  it('périmètre en puces : périodes et prestations du DCE, jamais ce qui est hors périmètre ni un repère interne', () => {
    expect(etapesDuPerimetre(B1.split(/^(?=##\s)/m).find((p) => /^## Le périmètre/.test(p))!)).toEqual([
      { titre: 'Du lundi au vendredi', texte: 'Ronde d’ouverture, ronde de fermeture et trois rondes de nuit' },
      { titre: 'Jours de fermeture', texte: 'Deux rondes de jour et trois rondes de nuit' },
      { titre: 'Levée de doute', texte: 'Sur appel de la télésurveillance après alarme incendie ou intrusion, ou incident' },
    ]);
  });
  it('schéma : au moins 3 étapes tirées du DCE, aucun titre tronqué, aucune anomalie', () => {
    const spec = specSecoursBesoin(B1)!;
    expect(spec).not.toBeNull();
    const etapes = spec.params.etapes;
    expect(etapes.map((e: any) => e.titre)).toEqual(['Du lundi au vendredi', 'Jours de fermeture', 'Levée de doute', 'Votre résultat']);
    expect(anomaliesSchemaBloc1(spec)).toEqual([]);
    expect(JSON.stringify(etapes)).not.toMatch(/catalogue|La gestion d'une commande"/);
  });
  it('renvoi à une rubrique : jamais une rubrique de présentation, jamais un titre coupé, jamais un texte sans verbe', () => {
    expect(rubriqueDePresentation('Notre catalogue de prestations')).toBe(true);
    expect(rubriqueDePresentation("La gestion d'une commande supplémentaire")).toBe(false);
    const etapes = etapesDesPuces(B1);
    expect(etapes.some((e) => /catalogue/i.test(e.titre))).toBe(false);
    expect(etapes.some((e) => e.titre === "La gestion d'une commande")).toBe(false);
    expect(texteEtapeAvecVerbe('Pour une ronde supplémentaire commandée par écrit par la Direction, intervenir selon les jours et horaires indiqués ; par défaut, entre 19h30 et 07h20')).toBe('Intervenir selon les jours et horaires indiqués');
    expect(texteEtapeAvecVerbe('Pour une ronde supplémentaire commandée par écrit par la Direction')).toBe('');
    expect(texteEtapeAvecVerbe('Réaliser une ronde de fermeture les jours d’ouverture')).toBe('Réaliser une ronde de fermeture les jours d’ouverture');
  });
  it('titre de rubrique : entier, ou raccourci sans couper son groupe nominal', () => {
    expect(titreRubriqueEtape("La gestion d'une commande supplémentaire")).toBe('');
    expect(titreRubriqueEtape("L'intégration d'un nouveau marché")).toBe("L'intégration d'un nouveau marché");
    expect(titreRubriqueEtape("L'adéquation de nos moyens humains avec votre besoin")).toBe("L'adéquation de nos moyens humains");
    expect(titreRubriqueEtape('Formations et certifications : l\'agent SSIAP 1 (le feu, la sécurité incendie, les moyens de secours)')).toBe("L'agent SSIAP 1");
  });
});
