import { describe, it, expect } from 'vitest';
import { passagesLimitePages, phraseLimitePages } from '../src/generation/format_court';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 9 (T9CS-2) : « Date limite de réception » et pagination d'une pièce ne sont pas une limite de pages. */
const PAGINATION = "Le présent CCTP comporte 9 pages numérotées de 1 à 9\nDate limite de réception des offres : 12/05/2026 à 12h00.";

describe('limite de pages du RC (T9CS-2)', () => {
  it('pagination d’une pièce suivie de « Date limite de réception » : aucun passage, aucune alerte, aucun appel', async () => {
    expect(passagesLimitePages(PAGINATION)).toEqual([]);
    expect(passagesLimitePages('Le présent RC comporte 7 pages. Heure limite de remise des plis : 12h.')).toEqual([]);
    const gen: any = new MemoireGenerator();
    const appels: string[] = [];
    gen.callOpenAI = async (_m: any, _t: any, label: string) => { appels.push(label); return null; };
    expect(await gen.detecterFormatImpose(PAGINATION)).toBeNull();
    expect(appels).toEqual([]);
    expect(gen.alertesFormat).toEqual([]);
  });
  it('une vraie limite reste lue (« Maximum 7 pages recto », « 10 pages maximum »)', () => {
    expect(passagesLimitePages('Description argumentée Maximum 7 pages recto. Éléments de réponse attendus : organisation.').length).toBe(1);
    expect(passagesLimitePages('2- Moyens humains 10 pages maximum Annexes autorisées').length).toBe(1);
  });
  it('alerte de repli : la phrase qui contient le nombre de pages, jamais l’en-tête d’une autre pièce', async () => {
    const rc = `--- CCTP_2026 --- INSTITUT DE FORMATION, 19 avenue de Maison Blanche. ${'Texte du cahier des charges. '.repeat(20)}Article 5. Le dossier ne doit pas dépasser 12 pages maximum au total, annexes comprises.`;
    expect(phraseLimitePages(passagesLimitePages(rc)[0])).toBe('Le dossier ne doit pas dépasser 12 pages maximum au total, annexes comprises.');
    const gen: any = new MemoireGenerator();
    gen.callOpenAI = async () => null;
    await gen.detecterFormatImpose(rc);
    expect(gen.alertesFormat[0]).toMatch(/^Le RC mentionne une limite de pages \(« Le dossier ne doit pas dépasser 12 pages maximum/);
    expect(gen.alertesFormat[0]).not.toMatch(/CCTP_2026/);
  });
  it.skipIf(!aCorpus('ifits', 'imm'))('ifits : aucun passage ; imm : toujours sa limite de 12 pages', () => {
    expect(passagesLimitePages(DCE('ifits'))).toEqual([]);
    expect(passagesLimitePages(DCE('imm')).length).toBe(1);
  });
});
