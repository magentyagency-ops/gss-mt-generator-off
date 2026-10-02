import { describe, it, expect } from 'vitest';
import {
  specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1, specProcessBesoin, sansBribesApresRenvoi, resultatBesoin, RESULTAT_MEMOIRE_TYPE,
} from '../src/generation/reponse_libre_v2';
import fs from 'fs';
import path from 'path';

/** Bloc 1 d'imm 341 (format court) : attentes citées en gras, « : → notre réponse : … ». */
const IMM = `## Votre contexte et votre site
L'Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM) lance le marché « Marché privé de prestations de sûreté et de sécurité incendie des locaux de l’IMM » (lot 1).

## Le périmètre de la prestation demandée
| Site | Poste | Jours et horaires | Qualification | Missions principales |
|---|---|---|---|---|
| Institut Médico-Chirurgical Montsouris (IMM) | Chef d’équipe ou agent N1 au PCS | Tous les jours, 24h/24h | SSIAP, SST, CQP ou TFP APS | Pilotage du PCS |
| Institut Médico-Chirurgical Montsouris (IMM) | Agent N2 au PCS | Tous les jours, 24h/24h | SSIAP, SST, CQP ou TFP APS | Surveillance, alarmes, rondes |

## Vos attentes et nos engagements
- **« Aucun poste ne doit être laissé vacant »** : → notre réponse : organisation des relèves, pauses et absences par les processus de planification et de remplacement prévu ou imprévu.
- **« Remplacement sous 4h maximum »** par un personnel de réserve préalablement autorisé par l’IMM : → notre réponse : processus de remplacement d’un agent absent et suivi de l’intégration du nouvel agent.
- **Au minimum 2 vacations de formation** pour chaque nouvel agent et 3 pour les chefs d’équipe : → notre réponse : parcours d’intégration et formations SSIAP, SST et APS.
- **« Transmission du rapport mensuel d'activité avant le 10 du mois suivant »** et transmission des rapports sensibles sous 2 heures : → notre réponse : traçabilité numérique, remontée des indicateurs et suivi qualité.`;

/** Bloc 1 d'ifsem 335 (réponse libre) : bribes collées après les renvois pour que les mots du schéma figurent dans le texte. */
const IFSEM = `## Vos attentes et nos engagements
- **« délai maximal de deux heures »** : notre procédure de remplacement d’un agent absent non prévu est développée au bloc 5. Absence inopinée : remplacement dans un délai maximal de deux heures.
- **« système de contrôle de rondes numériques sécurisées »** : contrôleur de rondes et main courante électronique, développés au bloc 4. Les rondes sont pointées et consignées dans la main courante électronique.
- **« au minimum 3 visites inopinées et irrégulières par mois »** : procédure de contrôle inopiné et réunions de suivi, développées au bloc 5. Le CNRS bénéficie d’un service continu, tracé et contrôlé.

## Les points de vigilance identifiés et nos réponses
- **Point de vigilance** : les rondes générales et techniques sont aléatoires → notre réponse : programmation et contrôleur de rondes, puis consignation à la main courante (bloc 4) ; pilotage des contrôles (bloc 5). Traçabilité des rondes.
- **Point de vigilance** : à Villejuif et Thiais, les agents doivent être sensibilisés aux risques chimiques → notre réponse : intégration des agents, formations et suivi des compétences (bloc 3) ; consignes et livre des missions (bloc 4). SSIAP 1 et ADS.
- **Point de vigilance** : le CNRS demande de signaler toute présence hors des créneaux déclarés → notre réponse : gestion des moyens d’accès, main courante et procédures opérationnelles (bloc 4). Remplacement sous deux heures et Continuité contrôlée.
- **« garantir la continuité »** : préparer la bascule → processus d’intégration d’un nouveau marché, bloc 5. La compatibilité du PC TLS avec les systèmes recensés : [À COMPLÉTER].`;

const ETAPES_IFSEM = [
  { titre: 'Lot 2, trois sites', texte: 'Le présent périmètre porte sur le lot 2.', role: 'rouge' },
  { titre: 'Remplacement sous deux heures', texte: 'Absence inopinée : remplacement dans un délai maximal de deux heures.', role: 'rouge' },
  { titre: 'Rondes pointées', texte: 'Les rondes sont pointées.', role: 'orange' },
  { titre: 'Traçabilité des rondes', texte: 'Les rondes sont pointées et consignées dans la main courante électronique.', role: 'bleu' },
  { titre: 'Continuité contrôlée', texte: 'Le CNRS bénéficie d’un service continu, tracé et contrôlé.', role: 'vert' },
];

describe('bloc 1 : schéma de process et texte (tour 3)', () => {
  it('T3C-3 : secours sur le contenu, jamais les intitulés « Votre contexte → Le périmètre → Vos attentes »', () => {
    for (const s of [specSecoursPuces(IMM), specSecoursBesoin(IMM)]) {
      expect(s).not.toBeNull();
      const etapes = s!.params.etapes;
      for (const e of etapes) {
        expect(e.titre).not.toMatch(/^(?:Votre contexte|Le périmètre|Vos attentes|Les points de vigilance)/);
        expect(String(e.texte || '').trim()).not.toBe('');
      }
      // Le résultat n'est jamais une attente citée.
      expect(etapes[etapes.length - 1].texte).not.toMatch(/laissé vacant/);
      expect(anomaliesSchemaBloc1(s)).toEqual([]);
    }
    expect(specSecoursBesoin(IMM)!.params.etapes[0]).toMatchObject({ titre: 'Chef d’équipe ou agent N1 au PCS', texte: 'Tous les jours, 24h/24h' });
    expect(resultatBesoin(IMM)).not.toMatch(/laissé vacant/);
  });

  it('T3C-3 : résultat du mémoire type quand le texte n’en écrit aucun ; ses mots viennent du schéma de GSS', () => {
    const mt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generation/memoire_type/memoire_type.json'), 'utf-8'));
    const contenu = String(mt.rubriques.find((r: any) => r.mode === 'besoin').schema.etapes.slice(-1)[0].contenu);
    for (const m of ['continuité de service', 'traçabilité de chaque intervention']) {
      expect(contenu).toContain(m);
      expect(RESULTAT_MEMOIRE_TYPE.toLowerCase()).toContain(m);
    }
    expect(resultatBesoin('## Vos attentes et nos engagements\n- **« continuité de service »** : x → processus de remplacement d’un agent absent.', [], RESULTAT_MEMOIRE_TYPE)).toBe(RESULTAT_MEMOIRE_TYPE);
  });

  it('T3N-3 : bribes collées après les renvois retirées, phrases avec repère gardées', () => {
    const r = sansBribesApresRenvoi(IFSEM, ETAPES_IFSEM);
    for (const b of ['Traçabilité des rondes.', 'SSIAP 1 et ADS.', 'Remplacement sous deux heures et Continuité contrôlée.', 'Le CNRS bénéficie', 'Les rondes sont pointées et consignées', 'Absence inopinée :']) expect(r.texte).not.toContain(b);
    expect(r.texte).toContain('La compatibilité du PC TLS avec les systèmes recensés : [À COMPLÉTER].');
    expect(r.texte).toContain('pilotage des contrôles (bloc 5).');
    expect(r.retirees).toHaveLength(6);
  });

  it('T3N-4 : étape qui redit son titre, étapes qui se répètent et étape 1 réduite au lot refusées', () => {
    const an = anomaliesSchemaBloc1(specProcessBesoin(ETAPES_IFSEM, 'flux'));
    expect(an.some((x) => /« Rondes pointées » : le texte redit le titre/.test(x))).toBe(true);
    expect(an.some((x) => /étapes 3 et 4 : textes qui se répètent/.test(x))).toBe(true);
    expect(an.some((x) => /étape 1 .*lot ou le périmètre/.test(x))).toBe(true);
  });
});
