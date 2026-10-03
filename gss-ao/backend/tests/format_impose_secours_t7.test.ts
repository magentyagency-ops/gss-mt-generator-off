import { describe, it, expect } from 'vitest';
import { limitePagesMemoire, passagesLimitePages } from '../src/generation/format_court';
import { MemoireGenerator, alerteRedactionIndisponible } from '../src/generation/memoire_generator';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7CS-1) : limite de pages du RC jamais ignorée en silence quand le modèle ne répond pas. */
const RC = `Article 5 – Contenu de l'offre
Le dossier de l'offre comprendra :
– l'acte d'engagement ;
– un mémoire technique (douze (12) pages maximum) structuré comme suit : organisation et moyens humains, continuité de service, formation et qualité.
– les CV des intervenants (2 pages maximum par CV).`;

describe('format imposé par le RC sans réponse du modèle (T7CS-1)', () => {
  it('limite lue sans modèle dans la phrase du mémoire technique ; jamais celle des CV', () => {
    expect(limitePagesMemoire(passagesLimitePages(RC))).toMatchObject({ pages: 12 });
    expect(limitePagesMemoire(passagesLimitePages('Les CV des intervenants ne dépasseront pas 2 pages maximum chacun.'))).toBeNull();
  });
  it('réponse vide deux fois : second essai, puis format court en 12 pages avec une alerte', async () => {
    const gen: any = new MemoireGenerator();
    const appels: string[] = [];
    gen.callOpenAI = async (_m: any, _t: any, label: string) => { appels.push(label); return '{}'; };
    const f = await gen.detecterFormatImpose(RC);
    expect(appels).toEqual(['Format imposé par le RC', 'Format imposé par le RC (essai 2)']);
    expect(f.pagesMax).toBe(12);
    expect(f.plan.length).toBeGreaterThan(1);
    expect(gen.alertesFormat[0]).toMatch(/^Le RC limite le mémoire technique à 12 pages \(« .*douze \(12\) pages maximum.* »\) : la rédaction automatique n'a pas pu lire le plan/);
  });
  it('réponse du modèle lisible : rien ne change (limite refusée par le modèle respectée, aucune alerte)', async () => {
    const gen: any = new MemoireGenerator();
    gen.callOpenAI = async () => JSON.stringify({ limite: false });
    expect(await gen.detecterFormatImpose(RC)).toBeNull();
    expect(gen.alertesFormat).toEqual([]);
  });
  it('limite non lue : réponse libre, mais alerte posée', async () => {
    const gen: any = new MemoireGenerator();
    gen.callOpenAI = async () => null;
    const f = await gen.detecterFormatImpose('Le dossier ne doit pas dépasser 12 pages maximum au total, annexes comprises.');
    expect(f).toBeNull();
    expect(gen.alertesFormat[0]).toMatch(/^Le RC mentionne une limite de pages .* que la rédaction automatique n'a pas pu lire/);
  });
  it('panne réelle : l’étape est nommée dans l’alerte de rédaction indisponible', () => {
    expect(alerteRedactionIndisponible(['Format imposé par le RC', 'Format imposé par le RC (essai 2)'])).toMatch(/lecture du format imposé par le RC/);
  });
  it.skipIf(!aCorpus('imm'))('RC complet d’imm : 12 pages', () => {
    expect(limitePagesMemoire(passagesLimitePages(DCE('imm')))?.pages).toBe(12);
  });
});
