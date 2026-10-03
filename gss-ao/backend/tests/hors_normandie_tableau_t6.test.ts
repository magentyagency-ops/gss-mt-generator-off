// Tour 6 (T6N-1) : hors Normandie, le filtre des délais normands ne touche jamais un volume horaire, en phrase comme en tableau.
// Tour 7 (REG7-1) : une ligne de tableau qui promet un délai normand est retirée en entier, comme en 697d1ab.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { delaisHorsNormandie } from '../src/generation/base_memoires';

import { DCE as dceCorpus, aCorpus } from './fixtures/corpus';
const DCE = dceCorpus('cstb');
const T = `L'équipe suivante :

| Catégorie de personnel | Qualification | Nombre | Observations |
|---|---|---|---|
| Intervenant rondier | Agrément préfectoral CNAPS | 4 | 96 h par semaine (Site du CSTB Grenoble), soit 3,11 ETP |
| Agent de sécurité | CQP APS | 3 | 84 h par semaine (Poste d'accueil), soit 2,72 ETP |
| Agent d'intervention | CQP APS | 2 | 40 h par semaine (Poste d'accueil), soit 1,3 ETP |

Nous mettons en place une équipe de 4 agents titulaires. L'agent d'astreinte intervient en 45 minutes au maximum.`;

describe.skipIf(!aCorpus('cstb'))('delaisHorsNormandie et le tableau de l\'équipe dédiée (cstb 551)', () => {
  it('le tableau reste entier ; seul le délai normand est retiré', () => {
    const r = delaisHorsNormandie(T, DCE, true);
    expect(r.texte).toContain('| Intervenant rondier |');
    expect(r.texte).toContain('| Agent d\'intervention |');
    expect(r.texte.split('\n').filter((l) => l.startsWith('|'))).toHaveLength(5);
    expect(r.retires).toEqual(["L'agent d'astreinte intervient en 45 minutes au maximum."]);
    expect(r.texte).not.toMatch(/45 minutes/);
  });
  it('un volume horaire dans une phrase n\'est pas un délai', () => {
    expect(delaisHorsNormandie("Le rondier d'intervention assure 40 h par semaine sur le site.", DCE, true).retires).toEqual([]);
  });
});

describe('delaisHorsNormandie : ligne de tableau qui promet un délai normand (REG7-1)', () => {
  const dce = 'Le titulaire assure le gardiennage du site de Rennes. Les agents effectuent des rondes de nuit.';
  it('les lignes de délai sont retirées en entier, le tableau vidé disparaît, la question part vers GSS', () => {
    const t = "Nos délais :\n\n| Prestation | Délai d'intervention |\n|---|---|\n| Intervention sur alarme | 30 minutes |\n| Remplacement d'un agent absent | 60 minutes |\n\nSuite du texte.";
    const r = delaisHorsNormandie(t, dce, true);
    expect(r.retires).toEqual(['Intervention sur alarme — 30 minutes', "Remplacement d'un agent absent — 60 minutes"]);
    expect(r.texte).not.toMatch(/30 minutes|60 minutes|\| Prestation/);
    expect(r.texte).toContain('Suite du texte.');
  });
  it('une ligne retirée parmi d\'autres : le tableau reste entier, sans ligne vide', () => {
    const t = "| Prestation | Engagement |\n|---|---|\n| Rondes de nuit | 3 rondes par nuit |\n| Intervention sur alarme. Levée de doute | 30 minutes |\n| Rapport | mensuel |";
    const r = delaisHorsNormandie(t, dce, true);
    expect(r.texte).toBe("| Prestation | Engagement |\n|---|---|\n| Rondes de nuit | 3 rondes par nuit |\n| Rapport | mensuel |");
    expect(r.retires).toHaveLength(1);
  });
  it('volume horaire et plage horaire d\'une ligne de tableau : la ligne reste', () => {
    const t = "| Profil | Volume |\n|---|---|\n| Intervenant rondier | 96 h par semaine |\n| Nuit, 21 h–6 h | Agent d'intervention | 1 | 1 |";
    const r = delaisHorsNormandie(t, dce, true);
    expect(r.texte).toBe(t);
    expect(r.retires).toEqual([]);
  });
  it('délai imposé par le DCE dans une ligne de tableau : la ligne reste', () => {
    const t = "| Prestation | Délai |\n|---|---|\n| Intervention sur alarme | 30 minutes |";
    expect(delaisHorsNormandie(t, dce + " Le titulaire intervient sur alarme dans un délai de 30 minutes.", true).texte).toBe(t);
  });
  it('en Normandie, rien ne change', () => {
    const t = "| Prestation | Délai |\n|---|---|\n| Intervention sur alarme | 30 minutes |";
    expect(delaisHorsNormandie(t, dce, false).texte).toBe(t);
  });
});
