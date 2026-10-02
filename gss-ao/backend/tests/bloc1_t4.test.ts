import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1, etapesDesPuces, libellesBloc1, titreExigence, reponsePourSchema,
  completerResultatBesoin, court,
} from '../src/generation/reponse_libre_v2';
import { reduireComprehensionCadre } from '../src/generation/memoire_type_cadre';

const F = (n: string) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf-8');
const lignes = (s: any) => s.params.etapes.map((e: any) => `${e.titre} :: ${e.texte || ''}`);

/** Tour 4 : schéma de process du bloc 1 sur les textes réels caen 471, caen 441 (réponse libre) et imm 473 (format court). */
describe('schéma de secours du bloc 1 sur les textes réels (T4C-1, T4C-2, T4N-7, R4-3)', () => {
  for (const [nom, f] of [['caen 471', 'bloc1_caen_471.md'], ['caen 441', 'bloc1_caen_441.md'], ['imm 473', 'bloc1_imm_473.md']]) {
    it(`${nom} : un schéma, sans « ** », sans sujet coupé, sans guillemet orphelin, terminé par « Votre résultat »`, () => {
      for (const texte of [F(f), libellesBloc1(F(f))]) {
        const s = specSecoursPuces(texte) || specSecoursBesoin(texte);
        expect(s).not.toBeNull();
        expect(anomaliesSchemaBloc1(s)).toEqual([]);
        const l = lignes(s).join(' | ');
        expect(l).not.toMatch(/\*\*|^Coordonnée|est préparée ::|Le contrôleur de rondes organisent/);
        for (const e of s!.params.etapes) expect((String(e.texte).match(/«/g) || []).length).toBe((String(e.texte).match(/»/g) || []).length);
        expect(s!.params.etapes.length).toBeGreaterThanOrEqual(3);
        expect(s!.params.etapes[s!.params.etapes.length - 1]).toMatchObject({ titre: 'Votre résultat', role: 'vert' });
      }
    });
  }
  it('caen 471 : titres tirés de l\'exigence, texte = réponse entière de GSS', () => {
    const l = lignes(specSecoursPuces(F('bloc1_caen_471.md'))).join(' | ');
    expect(l).toContain('L’arrivée sur site :: L’intervention sur alarme et la télésurveillance distingue le traitement de l’alarme');
    expect(l).toContain('La planification et le contrôleur de rondes organisent et suivent ces passages');
  });
  it('becquerel (R4-3) : jamais « Nos trois niveaux de contrôle » / « Notre contrôleur de rondes »', () => {
    const t = '## Les points de vigilance identifiés et nos réponses\n- **Point de vigilance** : environ 50 puis 120 pointeaux à contrôler → notre réponse : nos trois niveaux de contrôle et notre contrôleur de rondes, développés au bloc 5.\n- **Point de vigilance** : le PC est tenu 24 h/24 → notre réponse : notre interlocuteur unique et nos réunions de suivi, développés au bloc 5.';
    const e = etapesDesPuces(t);
    expect(e.map((x) => `${x.titre} :: ${x.texte}`)).not.toContain('Nos trois niveaux de contrôle :: Notre contrôleur de rondes');
    expect(e[0]).toMatchObject({ titre: 'Environ 50 puis 120 pointeaux', texte: 'Nos trois niveaux de contrôle et notre contrôleur de rondes' });
  });
  it('imm 473 : le poste n\'est jamais coupé au milieu d\'un groupe (« … ou agent »)', () => {
    const s = specSecoursBesoin(F('bloc1_imm_473.md'))!;
    expect(s.params.etapes[0].titre).toBe('Chef d’équipe ou agent N1 au PCS');
  });
});

describe('anomalies et outils du schéma du bloc 1 (T4C-1)', () => {
  it('« ** », titre-phrase, texte sans sujet, sujet coupé : refusés', () => {
    const a = anomaliesSchemaBloc1({ gabarit: 'flux', params: { etapes: [
      { titre: '**La planification**', texte: '**Le contrôleur de rondes** organisent et suivent ces passages' },
      { titre: 'La mobilisation est préparée', texte: 'Coordonnée par la planification et la mise en place' },
      { titre: 'Votre résultat', texte: 'Continuité de service et traçabilité de chaque intervention' },
    ] } }).join(' | ');
    expect(a).toMatch(/marque de mise en forme/);
    expect(a).toMatch(/titre est une phrase/);
    expect(a).toMatch(/texte sans sujet/);
    expect(anomaliesSchemaBloc1({ gabarit: 'flux', params: { etapes: [{ titre: 'Rondes', texte: 'Le contrôleur de rondes organisent et suivent ces passages' }, { titre: 'Votre résultat', texte: 'Continuité de service garantie' }] } }).join(' | ')).toMatch(/accord du verbe/);
  });
  it('titreExigence : groupe nominal arrêté avant une préposition, jamais au milieu d\'un groupe', () => {
    expect(titreExigence('les rondes d’ouverture à 05H30 et de fermeture à 21 H 30 encadrent des interventions')).toBe('Les rondes d’ouverture à 05H30');
    expect(titreExigence('remplacement sur site dans les UNE (1) heure suivant la constatation, avec planning modifié')).toBe('Remplacement sur site');
    expect(titreExigence('interventions successives habituelles devront être effectuées par les mêmes agents')).toBe('Interventions successives');
    expect(titreExigence('1er poste : chef d’équipe ou agent N1 au PCS')).not.toMatch(/ou agent$/);
  });
  it('reponsePourSchema : sans « ** », titres sans guillemets ni sous-titre, article en minuscule au milieu', () => {
    expect(reponsePourSchema('**La planification** et **Le contrôleur de rondes** organisent et suivent ces passages')).toBe('La planification et le contrôleur de rondes organisent et suivent ces passages');
    expect(reponsePourSchema('« Le livre des missions et consignes (LMC) » structure les consignes du site')).toBe('Le livre des missions et consignes (LMC) structure les consignes du site');
    expect(reponsePourSchema('**Notre socle de procédures : l’intervention sur alarme et la télésurveillance** distingue le traitement')).toBe('L’intervention sur alarme et la télésurveillance distingue le traitement');
    expect(court('« Le livre » structure les consignes', 86)).toBe('« Le livre » structure les consignes');
  });
  it('T4N-7 : défauts portant tous sur la dernière étape du modèle → remplacée par « Votre résultat »', () => {
    const etapes = [
      { titre: 'Remplacement dans l’heure', texte: 'Le remplacement d’un agent absent organise la réponse', role: 'rouge' },
      { titre: 'Rondes d’ouverture', texte: 'La planification organise les passages', role: 'rouge' },
      { titre: 'Accès et confidentialité', texte: 'La gestion des moyens d’accès encadre la remise', role: 'orange' },
      { titre: 'Main courante électronique', texte: 'La main courante électronique trace les rondes', role: 'bleu' },
      { titre: 'Suivi qualité', texte: 'Suivi qualité des prestations', role: 'vert' },
    ];
    const c = completerResultatBesoin(etapes, F('bloc1_caen_441.md'), ["étape 5 : la phrase reprend le titre de l'étape ; elle doit apporter une information nouvelle.", "étape 5 : la dernière étape doit dire le résultat obtenu pour l'acheteur (site sécurisé, continuité de service, prestation conforme et contrôlée…), pas un moyen."])!;
    expect(c).not.toBeNull();
    expect(c.length).toBe(5);
    expect(c[4]).toMatchObject({ titre: 'Votre résultat', role: 'vert' });
    expect(c.map((e) => e.titre)).not.toContain('Suivi qualité');
  });
});

describe('texte du bloc 1 lu par l\'acheteur (T4N-8)', () => {
  it('libellé « Point de vigilance » remplacé par le nom du point ; titres de rubrique entre guillemets', () => {
    const t = libellesBloc1(F('bloc1_caen_471.md'));
    expect(t).not.toMatch(/Point de vigilance/);
    expect(t).toContain('- **L’arrivée sur site** est exigée dans un délai maximal de 30 minutes');
    expect(t).toContain('coordonnée par « La planification » et « La mise en place d\'une prestation »');
    // gras de tête (citation du DCE) gardé ; plus aucun titre en gras au milieu d'une phrase
    for (const l of t.split('\n').filter((x) => /^- /.test(x))) expect((l.match(/\*\*/g) || []).length).toBeLessThanOrEqual(2);
  });
  it('cadre : un point de vigilance renommé reste un point de vigilance pour la réduction des parties limitées', () => {
    const t = 'Le SAR lance le marché.\n\nLes points de vigilance identifiés et nos réponses :\n• L’arrivée sur site est exigée en 30 minutes → « La planification » organise.\n• Les rondes → « Le contrôleur de rondes » suit.\n• Les clés → « La gestion des moyens d\'accès » encadre.\n• Les badges → « La gestion des moyens d\'accès » encadre.';
    const r = reduireComprehensionCadre(t, (x) => x.split('\n').length <= 6);
    expect(r.retirees).toEqual(['Les badges → « La gestion des moyens d\'accès » encadre.']);
  });
});
