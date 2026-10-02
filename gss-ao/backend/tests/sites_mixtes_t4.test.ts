import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { marcheHorsNormandie, sitesDuMarche, questionDelaiInapplicable } from '../src/generation/base_memoires';
import { preparerMemoireType, publierMemoire, questionsDuPubliposte } from '../src/generation/memoire_type';

const DCE = (n: string) => fs.readFileSync(path.join(__dirname, '../../_corpus_verif/_dce_textes', `${n}.txt`), 'utf-8');

/** Tour 4 (T4-COH-3) : un marché à sites mixtes ne reçoit jamais les délais normands de GSS pour tous ses sites. */
describe('sites mixtes Normandie / hors Normandie (T4-COH-3)', () => {
  const mixte = 'Marché de surveillance de deux sites : site A à Rouen (76000) et site B à Paris (75013). Rondes, SSIAP 1, astreinte, PTI.';
  it('les sites sont comptés par code postal distinct ; une adresse administrative (Cedex, DREETS) n\'est pas un site', () => {
    expect(sitesDuMarche({}, mixte)).toEqual({ normands: ['Rouen'], horsNormandie: ['Paris'], mixte: true });
    expect(marcheHorsNormandie({}, mixte)).toBe(true);
    expect(sitesDuMarche({}, DCE('rouen_univ')).mixte).toBe(false);
    expect(marcheHorsNormandie({}, DCE('rouen_univ'))).toBe(false);
    for (const n of ['becquerel', 'caen', 'havre2', 'parc_expo', 's2e']) expect(marcheHorsNormandie({}, DCE(n))).toBe(false);
    for (const n of ['imm', 'ifsem', 'vitry', 'cstb']) expect(marcheHorsNormandie({}, DCE(n))).toBe(true);
  });
  it('aucun délai normand promis ; une question exacte par délai pour le site hors Normandie', () => {
    const prep: any = preparerMemoireType({ dce: mixte, analyse: { clientName: 'Ville test' } } as any);
    const t = publierMemoire(prep).map((r: any) => r.texte || '').join('\n');
    expect(t).not.toMatch(/45 minutes au maximum|60 minutes maximum/);
    const q = questionsDuPubliposte(publierMemoire(prep));
    const pti = q.find((x: string) => /PTI/.test(x));
    expect(pti).toBe("Marché en partie hors Normandie (site de Paris) : GSS annonce 45 minutes en Normandie pour ce délai (délai d'arrivée sur place après une alarme PTI sans réponse) ; quel délai GSS annonce-t-elle pour le site de Paris ?");
    expect(questionDelaiInapplicable(pti!, mixte, true)).toBe(false);
  });
});
