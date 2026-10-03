import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { placerOuEffacerPointilles } from '../src/generation/memoire_generator';

/** Tour 9 (T9CS-3) : restes de pointillés du cadre .docx effacés après la zone (rouen_univ : « [À COMPLÉTER]… » puis « .. »). */
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const para = (...runs: string[]) => new DOMParser().parseFromString(`<w:p xmlns:w="${W}">${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join('')}</w:p>`, 'text/xml').documentElement;
const texte = (p: any) => Array.from(p.getElementsByTagNameNS(W, 't')).map((t: any) => t.textContent).join('');

describe('restes de pointillés du cadre (T9CS-3)', () => {
  it('« Coordonnées … : » de rouen_univ : la zone devient le champ, sans « … » ni « .. » après', () => {
    const p1 = para('…………………………………………', '………………………………………………………………….………', '…');
    expect(placerOuEffacerPointilles(p1, 1)).toBe(true);
    expect(texte(p1)).toBe('[CHAMP_1]');
    const p2 = para('.................................................................................................................................................................', '..');
    placerOuEffacerPointilles(p2, null);
    expect(texte(p2)).toBe('');
    const p3 = para('…………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………', '…', '…………', '…');
    placerOuEffacerPointilles(p3, 5);
    expect(texte(p3)).toBe('[CHAMP_5]');
  });
  it('libellé écrit avant la zone jamais touché ; « … » dans le même run après le champ effacé', () => {
    const p = para('Dénomination du candidat ', ':', ' ', '………………………………………………………………………………', '……', '.');
    placerOuEffacerPointilles(p, 2);
    expect(texte(p)).toBe('Dénomination du candidat : [CHAMP_2]');
    const q = para('Nom du site (prise de photo...) : ……………………………… …');
    placerOuEffacerPointilles(q, 3);
    expect(texte(q)).toBe('Nom du site (prise de photo...) : [CHAMP_3]');
  });
});
