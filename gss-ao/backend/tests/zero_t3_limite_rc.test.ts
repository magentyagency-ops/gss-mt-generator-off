// Campagne « zéro défaut », tour 3 : fausse alerte de limite de pages en mode dégradé (T3-REG-1, T3N-7).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { passagesContenuOffre } from '../src/generation/format_court';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { DCE, aCorpus } from './fixtures/corpus';

const PIEDS = `CCP — Marché n°26R045 page 9/17
Le mémoire technique du candidat décrit l'organisation des rondes. Sur demande écrite de la Direction, ronde de 19h30 à 07h20.
Marché n°26R045 page 10/17
La date et heure limite de remise des offres figure au RC. Le mémoire technique est noté sur 60 points.`;

describe('limite de pages du RC sans réponse du modèle (T3-REG-1)', () => {
  it('pieds de page « page n/m » et « date et heure limite » : aucun passage, aucune alerte', async () => {
    expect(passagesContenuOffre(PIEDS)).toEqual([]);
    const gen: any = new MemoireGenerator();
    let appels = 0;
    gen.callOpenAI = async () => { appels++; return ''; };
    expect(await gen.detecterFormatImpose(PIEDS)).toBeNull();
    expect(appels).toBe(0);
    expect(gen.alertesFormat).toEqual([]);
  });
  it('passage de contenu de l’offre sans phrase de limite : aucune citation d’un extrait brut', async () => {
    const gen: any = new MemoireGenerator();
    gen.callOpenAI = async () => '';
    await gen.detecterFormatImpose("Le mémoire technique ne devra pas reprendre les pièces administratives. Il présente l'organisation.");
    expect(gen.alertesFormat.join(' ')).not.toMatch(/Le RC mentionne une limite de pages \(« /);
  });
  for (const code of ['cstb', 'ifits', 'etampes1']) {
    it.skipIf(!aCorpus(code))(`DCE réel ${code} (aucune limite) : aucune alerte`, async () => {
      const gen: any = new MemoireGenerator();
      gen.callOpenAI = async () => '';
      expect(await gen.detecterFormatImpose(DCE(code))).toBeNull();
      expect(gen.alertesFormat).toEqual([]);
    });
  }
  it.skipIf(!aCorpus('imm'))('imm : limite de 12 pages toujours lue sans modèle', async () => {
    const gen: any = new MemoireGenerator();
    gen.callOpenAI = async () => '';
    expect((await gen.detecterFormatImpose(DCE('imm')))?.pagesMax).toBe(12);
  });
});
