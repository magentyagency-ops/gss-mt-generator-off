// Tour 6 (T6N-1) : hors Normandie, le filtre des délais normands ne touche jamais une ligne de tableau ni un volume horaire.
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
