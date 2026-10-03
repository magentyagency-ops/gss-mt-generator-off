// REG6-1 : une annexe .docx que le parseur XML ne lit pas est lue en texte brut (mammoth), jamais écartée en silence.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractText, loadDocxText } from '../src/ingestion/docConverter';

const F = path.join(__dirname, '../../_corpus_verif/rouen_univ/Annexe 3 CCTP - Pointeaux à installer v2026.docx');

describe('Annexe .docx illisible par le parseur XML (rouen_univ, pointeaux)', () => {
  it.skipIf(!fs.existsSync(F))('texte brut lu par mammoth : pointeaux site par site', async () => {
    expect(() => loadDocxText(F)).toThrow();
    const t = await extractText(F);
    expect(t.length).toBeGreaterThan(500);
    expect(t).toMatch(/E1/);
  });
});
