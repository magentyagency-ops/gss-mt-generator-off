import { describe, it, expect } from 'vitest';

// Clé factice : callOpenAI est simulé, aucun appel réel (le constructeur exige une clé présente).
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';

import { splitOnPieceBoundaries, MemoireGenerator } from '../src/generation/memoire_generator';

/**
 * Le découpage sert à l'extraction des exigences détaillées (détection des manques, cas sans cadre).
 * L'invariant critique : AUCUN caractère du DCE ne doit être perdu — sinon des exigences des
 * dernières pièces (CCAP, BPU, annexes) disparaissent silencieusement de l'analyse.
 */
const piece = (label: string, body: string) => `\n\n--- ${label} ---\n${body}`;

describe('splitOnPieceBoundaries', () => {
  it('renvoie un seul segment quand le DCE tient dans la fenêtre', () => {
    const dce = piece('CCTP.pdf', 'x'.repeat(500));
    expect(splitOnPieceBoundaries(dce, 10_000)).toEqual([dce]);
  });

  it('coupe sur les frontières de pièces et ne perd aucun caractère', () => {
    const dce = piece('CCTP.pdf', 'a'.repeat(400)) + piece('CCAP.pdf', 'b'.repeat(400)) + piece('RC.pdf', 'c'.repeat(400));
    const segs = splitOnPieceBoundaries(dce, 500);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.join('')).toBe(dce);
    // Chaque segment démarre sur une pièce → aucun article scindé au milieu.
    for (const s of segs) expect(s.startsWith('\n\n--- ')).toBe(true);
  });

  it('regroupe plusieurs petites pièces dans un même segment', () => {
    const dce = piece('a', 'a'.repeat(100)) + piece('b', 'b'.repeat(100)) + piece('c', 'c'.repeat(100));
    expect(splitOnPieceBoundaries(dce, 1_000)).toEqual([dce]);
  });

  it('tronçonne une pièce plus grosse que la fenêtre, sans rien perdre', () => {
    const gros = piece('CCTP.pdf', ('ligne de texte\n'.repeat(200)));
    const segs = splitOnPieceBoundaries(gros, 500);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.join('')).toBe(gros);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(500);
  });

  it('gère un texte sans aucune frontière de pièce', () => {
    const brut = 'y'.repeat(1_200);
    const segs = splitOnPieceBoundaries(brut, 500);
    expect(segs.join('')).toBe(brut);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(500);
  });

  it('respecte toujours le plafond de longueur', () => {
    const dce = Array.from({ length: 12 }, (_, i) => piece(`p${i}`, 'z'.repeat(300))).join('');
    for (const s of splitOnPieceBoundaries(dce, 700)) expect(s.length).toBeLessThanOrEqual(700);
  });
});

/**
 * Utilisation réelle : extraction des grandes exigences du DCE pour la détection des manques (cas
 * sans cadre). Les DCE réels dépassent souvent 120 000 caractères (jusqu'à 240 000) : tout le DCE
 * doit être lu, et un DCE court doit garder l'appel d'origine (un seul appel, DCE entier).
 */
describe('extractRequirementsList (sans cadre) : DCE lu en entier', () => {
  const simuler = (reponses: string[]) => {
    const gen = new MemoireGenerator() as any;
    const appels: any[][] = [];
    gen.callOpenAI = async (messages: any[]) => { appels.push(messages); return reponses[appels.length - 1] ?? '{"items":[]}'; };
    return { gen, appels };
  };
  const json = (labels: string[]) => JSON.stringify({ items: labels.map((label) => ({ label, theme: 'II', criticite: 'normal' })) });

  it('un DCE de 120 000 caractères au plus : un seul appel, DCE entier, consigne inchangée', async () => {
    const dce = piece('CCTP.pdf', 'a'.repeat(50_000)) + piece('RC.pdf', 'b'.repeat(20_000));
    const { gen, appels } = simuler([json(['Dispositif humain global', 'Astreinte'])]);
    const items = await gen.extractRequirementsList(null, dce);
    expect(appels).toHaveLength(1);
    expect(appels[0][1].content).toBe(`=== DCE ===\n${dce}\n\nRenvoie un JSON : {"items":[{"label":"...","theme":"I|II|III|IV","criticite":"bloquant|facultatif|normal"}]}`);
    expect(items.map((x: any) => x.label)).toEqual(['Dispositif humain global', 'Astreinte']);
  });

  it('un DCE de plus de 120 000 caractères : aucune pièce perdue, exigences déjà relevées transmises, sans doublon', async () => {
    const cctp = piece('CCTP.pdf', 'c'.repeat(100_000));
    const annexe = piece('Annexe 1 effectifs.pdf', 'EXIGENCE-FIN-DU-DCE ' + 'e'.repeat(60_000));
    const ccap = piece('CCAP.pdf', 'p'.repeat(70_000));
    const dce = cctp + annexe + ccap;
    const { gen, appels } = simuler([
      json(['Dispositif humain global', 'Astreinte']),
      json(['Astreinte', 'Démarche qualité']),
      json(['Politique RSE']),
    ]);
    const items = await gen.extractRequirementsList(null, dce);
    expect(appels.length).toBe(splitOnPieceBoundaries(dce, 120_000).length);
    expect(appels.length).toBeGreaterThan(1);
    // Chaque caractère du DCE est envoyé au modèle (l'ancienne troncature à 120 000 perdait l'annexe et le CCAP).
    const envoye = appels.map((m) => m[1].content).join('\n');
    for (const seg of splitOnPieceBoundaries(dce, 120_000)) expect(envoye).toContain(seg);
    expect(envoye).toContain('EXIGENCE-FIN-DU-DCE');
    // Les parties suivantes reçoivent les exigences déjà relevées.
    expect(appels[1][1].content).toContain('- Dispositif humain global');
    expect(appels[1][1].content).toContain('- Astreinte');
    expect(items.map((x: any) => x.label)).toEqual(['Dispositif humain global', 'Astreinte', 'Démarche qualité', 'Politique RSE']);
  });
});
