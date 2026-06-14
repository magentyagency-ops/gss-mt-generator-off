import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import PizZip from 'pizzip';

// Clé factice : aucun appel LLM avec dossierId='export' (cover en repli),
// mais le constructeur OpenAI exige une clé présente.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';

import { MemoireGenerator, AssembleChapter } from '../src/generation/memoire_generator';

const SAMPLE: AssembleChapter[] = [
  {
    key: 'I',
    title: 'Présentation de notre structure',
    sections: [
      { title: 'Présentation de la société GSS', text: 'GSS est une société de sécurité privée agréée CNAPS.\nNous intervenons sur les marchés publics.' },
      { title: 'Reprise du personnel en place', text: 'GSS organise la reprise du personnel conformément à l\'article L1224-1.' },
    ],
  },
  {
    key: 'II',
    title: 'Les moyens humains',
    sections: [
      { title: 'Qualifications des agents', text: 'Nos agents sont titulaires du CQP APS et SSIAP.' },
    ],
  },
];

const BACKGROUND_HEX = 'E5E5E5';

function openDocx(filePath: string): PizZip {
  expect(fs.existsSync(filePath)).toBe(true);
  return new PizZip(fs.readFileSync(filePath));
}

describe('Refonte template DOCX (format préservation AO RNE + refonte V1)', () => {
  let zip: PizZip;
  let documentXml: string;
  let generatedData: Record<string, string>;

  beforeAll(async () => {
    const gen = new MemoireGenerator();
    const res = await gen.assembleFromSections('export', SAMPLE, { refonte: true });
    zip = openDocx(res.filePath);
    documentXml = zip.file('word/document.xml')!.asText();
    generatedData = res.generatedData;
  });

  it('applique un fond gris uniforme E5E5E5 + active son affichage', () => {
    expect(documentXml).toContain(`<w:background w:color="${BACKGROUND_HEX}"`);
    const settings = zip.file('word/settings.xml')!.asText();
    expect(settings).toContain('displayBackgroundShape');
  });

  it("conserve le bandeau d'en-tête et le titre injecté sur les pages dupliquées", () => {
    // le titre de section injecté est présent (zone de titre / textbox conservée)
    expect(documentXml).toContain('Reprise du personnel en place');
    expect(documentXml).toContain('Qualifications des agents');
    // le bandeau d'en-tête (textbox) du maître reste présent dans le document
    expect(documentXml).toContain('txbxContent');
  });

  it('rapporte le retrait des images de fond des pages dupliquées', () => {
    // Le générateur retire les images de fond pleine page des pages dupliquées
    // *lorsqu'elles sont séparables du titre* (sinon conservées — garde-fou anti-corruption).
    // Le compteur est donc >= 0 et toujours rapporté.
    expect(generatedData.images_fond_retirees).toBeDefined();
    expect(Number(generatedData.images_fond_retirees)).toBeGreaterThanOrEqual(0);
  });

  it('produit un DOCX relisible (zip valide + parts essentielles)', () => {
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/document.xml')).toBeTruthy();
    // le design maître est préservé (médias toujours présents dans le paquet)
    const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
  });

  it('mode refonte désactivé (régression) : aucun fond gris injecté', async () => {
    const gen = new MemoireGenerator();
    const res = await gen.assembleFromSections('export', SAMPLE, { refonte: false });
    const z = openDocx(res.filePath);
    expect(z.file('word/document.xml')!.asText()).not.toContain(`<w:background w:color="${BACKGROUND_HEX}"`);
  });
});

describe('Génération NUE (sans template)', () => {
  it('produit un DOCX valide sans fond, sans en-tête, sans image', async () => {
    const gen = new MemoireGenerator();
    const res = await gen.assembleNoTemplate(SAMPLE);
    const zip = openDocx(res.filePath);
    const documentXml = zip.file('word/document.xml')!.asText();
    expect(documentXml).not.toContain('<w:background');
    expect(Object.keys(zip.files).filter((n) => n.startsWith('word/media/'))).toHaveLength(0);
    expect(documentXml).toContain('Qualifications des agents');
  });
});
