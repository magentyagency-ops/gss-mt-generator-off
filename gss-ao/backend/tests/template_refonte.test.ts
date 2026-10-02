import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

// Fond injecté quand le maître n'en porte pas (Refonte V1, fd3b63e).
const BACKGROUND_HEX = 'E5E5E5';
// Maître de référence : depuis juin 2026 (7fd93ed, après « fix: grey background » 9cb2d3b), AO RNE.docx
// porte son propre fond gris (<w:background w:color="D8D8D8" …>), que le générateur conserve tel quel
// (garde « pas de second <w:background> » présente depuis fd3b63e).
const MAITRE = path.resolve(__dirname, '../Template/Mémoire technique/AO RNE.docx');
const fondDuMaitre = (): string | null => {
  const xml = new PizZip(fs.readFileSync(MAITRE)).file('word/document.xml')!.asText().slice(0, 20_000);
  return xml.match(/<w:background\b[^>]*\bw:color="([0-9A-Fa-f]{6})"/)?.[1] ?? null;
};
const nbFonds = (xml: string) => (xml.match(/<w:background\b/g) || []).length;

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

  it('applique un fond gris uniforme (celui du maître, conservé) + active son affichage', () => {
    const fond = fondDuMaitre();
    expect(fond).toBe('D8D8D8');
    expect(nbFonds(documentXml)).toBe(1);
    expect(documentXml).toContain(`<w:background w:color="${fond}"`);
    expect(documentXml).not.toContain(`<w:background w:color="${BACKGROUND_HEX}"`);
    const settings = zip.file('word/settings.xml')!.asText();
    expect(settings).toContain('displayBackgroundShape');
    // Le compte rendu cite le fond réellement appliqué.
    expect(generatedData.mode).toContain(`#${fond}`);
  });

  it('maître sans fond : injecte le fond gris uniforme E5E5E5 + active son affichage', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maitre-sans-fond-'));
    try {
      const z = new PizZip(fs.readFileSync(MAITRE));
      z.file('word/document.xml', z.file('word/document.xml')!.asText().replace(/<w:background\b[^>]*\/>/, ''));
      z.file('word/settings.xml', z.file('word/settings.xml')!.asText().replace(/<w:displayBackgroundShape\/>/g, ''));
      fs.mkdirSync(path.join(dir, 'Mémoire technique'));
      fs.writeFileSync(path.join(dir, 'Mémoire technique', 'AO RNE.docx'), z.generate({ type: 'nodebuffer' }));
      const gen = new MemoireGenerator() as any;
      gen.templateDir = dir;
      const res = await gen.assembleFromSections('export', SAMPLE, { refonte: true });
      const out = openDocx(res.filePath);
      const xml = out.file('word/document.xml')!.asText();
      expect(nbFonds(xml)).toBe(1);
      expect(xml).toContain(`<w:background w:color="${BACKGROUND_HEX}"`);
      expect(out.file('word/settings.xml')!.asText()).toContain('displayBackgroundShape');
      expect(res.generatedData.mode).toContain(`#${BACKGROUND_HEX}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("conserve le bandeau d'en-tête et le titre injecté sur les pages dupliquées", () => {
    // le titre de section injecté est présent dans la zone de titre (textbox conservée), en
    // MAJUSCULES comme les titres du maître (setSectionHeading, c35db86 « fix: generate from template text »)
    const titres = (documentXml.match(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g) || [])
      .map((tx) => (tx.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
    expect(titres).toContain('REPRISE DU PERSONNEL EN PLACE');
    expect(titres).toContain('QUALIFICATIONS DES AGENTS');
    // le corps de chaque section est injecté sous son titre
    expect(documentXml).toContain("GSS organise la reprise du personnel conformément à l'article L1224-1.");
    expect(documentXml).toContain('Nos agents sont titulaires du CQP APS et SSIAP.');
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
