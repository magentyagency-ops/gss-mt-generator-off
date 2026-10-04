/**
 * Tour 6, correcteur (REG6-3) : transcription d'un PDF scanné interrompue (crédit épuisé) jamais mise en cache, pages non lues
 * signalées à GSS, transcription relancée à la lecture suivante. OpenAI simulé, aucun appel réseau.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { PDFDocument } from 'pdf-lib';

const CP: any = Object.getPrototypeOf(new OpenAI({ apiKey: 'x' }).chat.completions);
const createOrigine = CP.create;
let credit = 0;
let appels = 0;
CP.create = async () => {
  appels++;
  if (credit <= 0) { const e: any = new Error('429 You exceeded your current quota'); e.status = 429; e.code = 'insufficient_quota'; throw e; }
  credit--;
  return { choices: [{ message: { content: `BLOC LU. ${'Le titulaire assure la surveillance des sites. '.repeat(40)}` } }] };
};
afterAll(() => { CP.create = createOrigine; });

describe('transcription interrompue (REG6-3)', () => {
  it('rien en cache, pages non lues nommées, nouvelle transcription à la lecture suivante', async () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'simule';
    const doc = await PDFDocument.create();
    for (let i = 0; i < 12; i++) doc.addPage([200, 200]);
    doc.setTitle(`essai ${crypto.randomUUID()}`);
    const f = path.join(os.tmpdir(), `ocr_t6_${process.pid}.pdf`);
    fs.writeFileSync(f, await doc.save({ useObjectStreams: false }));
    const cache = path.resolve(__dirname, '../response/ocr_cache', `${crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')}.txt`);
    const { transcrirePdf, pagesNonTranscrites } = await import('../src/ingestion/ocr_pdf');
    try {
      credit = 1; appels = 0;
      const t1 = await transcrirePdf(f);
      expect((t1.match(/BLOC LU/g) || []).length).toBe(1);
      expect(fs.existsSync(cache)).toBe(false);
      expect(pagesNonTranscrites.get(f)).toEqual(['5-12']);
      credit = 100; appels = 0;
      const t2 = await transcrirePdf(f);
      expect(appels).toBe(3);
      expect((t2.match(/BLOC LU/g) || []).length).toBe(3);
      expect(pagesNonTranscrites.has(f)).toBe(false);
      expect(fs.existsSync(cache)).toBe(true);
    } finally {
      if (fs.existsSync(cache)) fs.unlinkSync(cache);
      fs.unlinkSync(f);
    }
  });
  it('alerte : pièce et pages non lues', async () => {
    const { alerteCctpAbsent } = await import('../src/generation/memoire_generator');
    const a = alerteCctpAbsent('--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\n', [], [{ nom: 'CCTP scanné.pdf', pages: ['13-30'] }]);
    expect(a.join('\n')).toContain('La pièce « CCTP scanné.pdf » est un PDF scanné dont les pages 13 à 30 n\'ont pas pu être lues');
  });
});
