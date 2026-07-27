import { describe, it, expect } from 'vitest';
import { splitOnPieceBoundaries } from '../src/generation/memoire_generator';

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
