/**
 * Tour 6, correcteur : dimensionnement (poste en option, rondes ponctuelles) et report des effectifs saisis par profil.
 */
import { describe, it, expect } from 'vitest';
import { posteOptionnel, citationDeRondes, questionRondes, dureeRondeDce, calculerDimensionnement, exempleModification } from '../src/generation/dimensionnement';
import { appliquerEffectifsParProfil, lireEffectifsParProfil } from '../src/generation/completion';

describe('poste « En option » même « dédié » avec ses horaires (REG6-2)', () => {
  it.each([
    'En option : un agent de sécurité dédié au parking de 20h à 6h.',
    "Option 1 : mise en place d'un agent SSIAP 1 dédié au PC sécurité de 19h à 7h, à activer sur bon de commande.",
    "Prestation optionnelle : un agent dédié à l'accueil du samedi de 8h à 12h.",
  ])('%s', (c) => expect(posteOptionnel(c, 'agent')).toBe(true));
  it('citedia : poste dédié avec un complément « à la demande » reste permanent', () => {
    expect(posteOptionnel("La mise en place d'un 1er SSIAP1 dédié de 21h à 9h du lundi au dimanche et mobilisable pour toutes interventions incluses et pour des interventions à la demande le reste du temps.", 'SSIAP 1')).toBe(false);
  });
  it('équipe dédiée : le poste en option est écarté et signalé', () => {
    const rep = { postes: [
      { profil: 'Agent de sécurité', qualification: 'CQP APS', lieu: 'Site', agents_simultanes: 1, heures_hebdo: null, heures_an: null, plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '07:00', fin: '19:00' }], citation: 'Un agent de sécurité est présent tous les jours de 7h à 19h.' },
      { profil: 'Agent de sécurité', qualification: 'CQP APS', lieu: 'Site', agents_simultanes: 1, heures_hebdo: null, heures_an: null, plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '19:00', fin: '07:00' }], citation: 'En option : un agent de sécurité dédié au parking de 19h à 7h.' },
    ], cas_pratique: null, mises_en_situation: [] };
    const d = calculerDimensionnement(rep, 'Un agent de sécurité est présent tous les jours de 7h à 19h.\nEn option : un agent de sécurité dédié au parking de 19h à 7h.')!;
    expect(d.profils[0].heuresSemaine).toBe(84);
    expect((d.alertes || []).join(' ')).toMatch(/écarté[\s\S]*optionnel/);
  });
});

describe('rondes ponctuelles (T6-CONS-9)', () => {
  it('« Gardiennage de 8h00 à 14h00 … puis 1 ronde de nuit » : une présence, pas des rondes seules', () => {
    expect(citationDeRondes('"JPO" : Journées Portes Ouvertes : Gardiennage de 8h00 à 14h00 le matin puis 1 ronde de nuit')).toBe(false);
    expect(citationDeRondes('Ronde de nuit (RN) 3 rondes, entre 21h30 et 06h30')).toBe(true);
  });
  it('durée de ronde écrite par le DCE : jamais redemandée ; citation coupée sur une fin de mot ; « rondiers » seulement s\'il y en a', () => {
    const dce = "| Ronde d'une heure le jour | 1 |\n| Ronde d'une heure la nuit | 1 |\nLe titulaire effectue 1 heure de ronde entre 6h00 et 21h00.";
    expect(dureeRondeDce(dce)?.valeur).toBe('1 heure');
    const q = questionRondes({ profils: [], titulaires: 0, suppleants: 0, casPratique: [], rondesSansDuree: ['3 rondes, entre 21h30 et 06h30 sur le site principal et les annexes du bâtiment B situé derrière le parking'], dureeRonde: dureeRondeDce(dce)! } as any);
    expect(q).not.toMatch(/Combien de temps dure/);
    expect(q).toMatch(/situé… »/);
    expect(q).not.toMatch(/rondiers/);
    expect(questionRondes({ profils: [], titulaires: 0, suppleants: 0, casPratique: [], rondesSansDuree: ['1 ronde'], rondiersDce: true } as any)).toMatch(/intervenants rondiers/);
  });
});

describe('effectifs saisis par profil, comme l\'exemple de l\'assistant (T6N-3)', () => {
  const sections = { b3_equipe: "| Catégorie de personnel | Qualification | Nombre | Observations |\n|---|---|---|---|\n| Chef d'équipe de sécurité incendie | SSIAP 2 et carte professionnelle | 6 | |\n| Agent de sécurité incendie | SSIAP 1, CQP APS | 4 | |\n\nL'équipe dédiée de 10 agents titulaires." };
  it('« Mets 7 chefs d\'équipe dans l\'équipe dédiée » est reporté sans modèle', () => {
    const r = appliquerEffectifsParProfil(sections, lireEffectifsParProfil("Mets 7 chefs d'équipe dans l'équipe dédiée"), '10')!;
    expect(r).not.toBeNull();
    expect(r.total).toBe(11);
    expect(r.sections.b3_equipe).toContain("| Chef d'équipe de sécurité incendie | SSIAP 2 et carte professionnelle | 7 |");
  });
  it('l\'exemple produit par exempleModification est appliqué sans modèle', () => {
    const d: any = { profils: [{ profil: "Chef d'équipe SSIAP 2", qualification: 'SSIAP 2', titulaires: 6, lieux: [], heuresSemaine: 0, heuresAn: 0, etp: 0, observation: '' }], titulaires: 6, suppleants: 2, casPratique: [] };
    expect(appliquerEffectifsParProfil(sections, lireEffectifsParProfil(exempleModification(d)), '10')).not.toBeNull();
  });
});
