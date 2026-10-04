// Campagne « zéro défaut », tour 3 : dimensionnement (T3G-1, T3G-9, T3G-10).
import { describe, it, expect } from 'vitest';
import { joursDePeriode, posteOptionnel, citationDeRondes } from '../src/generation/dimensionnement';

describe('périodes saisonnières (T3G-1)', () => {
  it('dates en chiffres, « entre … et … », « juillet/août », mois jamais lu dans un mot', () => {
    expect(joursDePeriode('du 01/06 au 30/09')).toBe(122);
    expect(joursDePeriode('Du 1/06/2026 au 30/09/2026')).toBe(122);
    expect(joursDePeriode('Du 01.06 au 30.09')).toBe(122);
    expect(joursDePeriode('entre le 1er mai et le 30 septembre')).toBe(153);
    expect(joursDePeriode('en juillet/août')).toBe(62);
    expect(joursDePeriode('Pendant 10 semaines, de mi-juin à fin août')).toBe(78);
    expect(joursDePeriode("Les mois d'octobre, mars et avril")).toBe(92);
  });
});

describe('poste optionnel : le poste lui-même, jamais un complément de mission (T3G-9)', () => {
  it('complément « à la demande des enseignants », « contrôle ponctuel », « opérations ponctuelles » : poste permanent', () => {
    expect(posteOptionnel("Un agent de sécurité assure du lundi au vendredi de 8h00 à 18h00 le contrôle d'accès, l'ouverture des salles à la demande des enseignants et la surveillance du hall.", 'Agent de sécurité')).toBe(false);
    expect(posteOptionnel('Un agent de sécurité est présent du lundi au vendredi de 8h00 à 18h00 pour le filtrage des entrées et le contrôle ponctuel des sacs.', 'Agent de sécurité')).toBe(false);
    expect(posteOptionnel('Un agent de sécurité est présent du lundi au vendredi de 8h00 à 18h00, y compris lors des opérations ponctuelles de livraison.', 'Agent de sécurité')).toBe(false);
  });
  it('« En option, un agent supplémentaire… », « sur bon de commande » : optionnel', () => {
    expect(posteOptionnel('En option, un agent de sécurité supplémentaire peut être commandé du lundi au vendredi de 8h00 à 18h00.', 'Agent de sécurité')).toBe(true);
    expect(posteOptionnel('Un agent cynophile sur bon de commande, de 20h00 à 6h00.', 'Agent cynophile')).toBe(true);
  });
});

describe('poste de nuit qui effectue des rondes : un poste, pas des rondes ponctuelles (T3G-10)', () => {
  it('agent présent ou qui assure la surveillance sur la plage', () => {
    expect(citationDeRondes('Un agent de sécurité assure la surveillance du site tous les jours de 19h00 à 7h00 et effectue 3 rondes par nuit.')).toBe(false);
    expect(citationDeRondes('Le gardien est sur site toutes les nuits de 19h00 à 7h00 ; il effectue deux rondes complètes du bâtiment.')).toBe(false);
    expect(citationDeRondes('3 rondes, entre 21h30 et 06h30.')).toBe(true);
  });
});

import { normaliserExpressionsDelai } from '../src/generation/base_memoires';
describe('quarts d’heure lus comme des délais (T3G-3)', () => {
  it('« dans les trois quarts d’heure » = 45 minutes, « dans le quart d’heure » = 15 minutes, « ≤ 2 heures » = dans 2 heures', () => {
    expect(normaliserExpressionsDelai("Tout agent absent est remplacé dans les trois quarts d'heure.")).toBe('Tout agent absent est remplacé dans 45 minutes.');
    expect(normaliserExpressionsDelai("le rondier est sur place dans le quart d'heure.")).toBe('le rondier est sur place dans 15 minutes.');
    expect(normaliserExpressionsDelai("dans un délai d'un quart d'heure")).toBe('dans un délai de 15 minutes');
    expect(normaliserExpressionsDelai('en un 1/4 d’heure')).toBe('en 15 minutes');
    expect(normaliserExpressionsDelai('intervention ≤ 2 heures')).toBe('intervention dans 2 heures');
  });
});

import { horairesImposes } from '../src/generation/base_memoires';
describe('horaires imposés reconnus par leur forme (T3G-6)', () => {
  const dce = (ph: string) => `\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières\nArticle 3 - Description de la prestation\n${ph}\n`;
  for (const ph of ['Un agent de sécurité est présent du lundi au vendredi de 8h00 à 18h00.', 'La surveillance du site est assurée du lundi au vendredi de 19h00 à 07h00.', 'Le gardien est sur site de 21h00 à 05h00 toutes les nuits.', 'Les prestations sont réalisées du lundi au vendredi de 18 heures à 8 heures.']) {
    it(ph, () => { expect(horairesImposes(dce(ph)).join(' ')).toContain(ph); });
  }
  it('heures de l’accès des usagers et de la remise des offres : jamais des horaires imposés', () => {
    expect(horairesImposes(dce('Etudiants : du lundi au vendredi, de 8h00 à 21h00.'))).toEqual([]);
    expect(horairesImposes(dce('La date et heure limite de remise des offres est fixée au lundi 12 octobre de 12h00 à 14h00 pour la sécurité.'))).toEqual([]);
  });
});
