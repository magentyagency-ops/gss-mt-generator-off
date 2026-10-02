import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { specSecoursPuces, specProcessBesoin, anomaliesSchemaBloc1, completerResultatBesoin, court, sansRenvoiBloc } from '../src/generation/reponse_libre_v2';

/** Génération réelle caen 475 (tour 4, vérification de T4C-1, T4N-7, T4N-8). */
const TEXTE = fs.readFileSync(path.join(__dirname, 'fixtures/bloc1_caen475.md'), 'utf-8');

describe('bloc 1, génération réelle caen 475 : schéma de process entier', () => {
  it('le renvoi « , développée au bloc 4 » ne retire pas le guillemet fermant de la rubrique citée', () => {
    expect(sansRenvoiBloc('nous organisons la disponibilité et la planification des moyens avec « La planification », développée au bloc 4.'))
      .toBe('nous organisons la disponibilité et la planification des moyens avec « La planification »');
  });
  it('schéma de secours : trois étapes entières puis le résultat, sans anomalie', () => {
    const spec = specSecoursPuces(TEXTE)!;
    expect(spec).toBeTruthy();
    const etapes = spec.params.etapes.map((e: any) => `${e.titre} :: ${e.texte}`);
    expect(etapes).toContain('Mobiliser les équipes nécessaires :: Nous organisons la disponibilité et la planification des moyens');
    expect(etapes[etapes.length - 1]).toMatch(/^Votre résultat :: /);
    expect(anomaliesSchemaBloc1(spec)).toEqual([]);
  });
  it('texte de carte coupé avant une citation ouverte, jamais au milieu', () => {
    const t = court('Nous coordonnons l’alerte et l’intervention via « Notre socle de procédures : l\'intervention sur alarme et la télésurveillance ».', 86);
    expect(t).toBe('Nous coordonnons l’alerte et l’intervention');
  });
  it('seule la dernière étape du modèle redit son titre : remplacée par « Votre résultat »', () => {
    const etapes = [
      { titre: 'Rondes d’ouverture', texte: 'Le site a des horaires d’ouverture de 07h00 à 19h00.', role: 'rouge' },
      { titre: 'Accès sensibles', texte: 'Les agents accèdent aux zones privées et sensibles avec des clés et badges.', role: 'rouge' },
      { titre: 'Intervention sur alarme', texte: 'Nous coordonnons l’alerte et l’intervention via « Notre socle de procédures : l\'intervention sur alarme et la télésurveillance ».', role: 'orange' },
      { titre: 'Continuité des prestations', texte: 'L’ACOSS dispose d’une continuité des prestations.', role: 'vert' },
    ];
    const spec = specProcessBesoin(etapes, 'flux')!;
    const an = anomaliesSchemaBloc1(spec);
    expect(an).toEqual(['étape 4 « Continuité des prestations » : le texte redit le titre']);
    const c = completerResultatBesoin(spec.params.etapes, TEXTE, an)!;
    expect(c[c.length - 1].titre).toBe('Votre résultat');
    expect(anomaliesSchemaBloc1(specProcessBesoin(c, 'flux'))).toEqual([]);
  });
});
