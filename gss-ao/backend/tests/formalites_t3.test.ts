import { describe, it, expect } from 'vitest';
import { FORMALITES_OFFRE, questionFormalite, controlerProposition } from '../src/generation/reponse_libre_v2';

/** Tour 3 (T3C-5, citedia 341) : formalités de l'offre hors mémoire technique ; aucun fait accompli inventé. */
describe('formalités de l’offre et faits accomplis', () => {
  it('visite obligatoire et cadre de réponse : formalités, jamais une rubrique', () => {
    for (const t of ['Visite obligatoire des lieux', 'Cette visite obligatoire aura lieu le 7 Octobre 2026 à 09H00.', 'L\'attestation de visite obligatoire des sites', 'Cadre de réponse du lot 2', 'Le candidat renseignera un cadre de réponse par lot auquel il soumissionne']) expect(FORMALITES_OFFRE.test(t)).toBe(true);
    for (const t of ['Rondes de sécurité dans les parcs', 'Gestion des clés et badges', 'Visites inopinées des contrôleurs sur site', 'Le contrôleur effectue des visites des sites chaque mois']) expect(FORMALITES_OFFRE.test(t)).toBe(false);
    expect(questionFormalite({ exigence: 'Cette visite obligatoire aura lieu le 7 Octobre 2026 à 09H00.' })).toMatch(/^Formalité de l'offre, hors mémoire technique .*\?$/);
  });
  it('proposition : « a été effectuée le 7 octobre », « est jointe à l’offre » retirés et demandés à GSS', () => {
    const p = controlerProposition('La visite obligatoire des lieux a été effectuée le 7 octobre 2026 à 09h00. L’attestation remise à l’issue de la visite est jointe à l’offre. Cette visite permet de prendre en compte les conditions d’exécution.');
    expect(p.texte).toBe('Cette visite permet de prendre en compte les conditions d’exécution.');
    expect(p.questions).toHaveLength(2);
    expect(controlerProposition('GSS a obtenu son autorisation d\'exercer le 12/02/2015.').retirees).toHaveLength(0);
  });
});
