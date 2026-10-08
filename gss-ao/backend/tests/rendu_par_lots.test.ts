import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { decouperEnLots, pagesParLot, MOTEUR_PAGINATION_GLOBALE, PAGES_PAR_LOT_DEFAUT } from '../src/generation/marp_generator';

/**
 * Rendu par lots de la production (b66422b → c594dab, mémoire de Chrome limitée sur Railway), adapté à la refonte : chaque
 * lot garde l'en-tête YAML, les styles globaux et les directives héritées, et la numérotation du document entier.
 */
const TETE = "---\nmarp: true\ntheme: gss\nsize: a4\npaginate: true\nheader: 'GLOBAL SECURITY SERVICES'\nfooter: 'Mémoire technique · Client'\n---\n";
const doc = (n: number, pages: (i: number) => string = (i) => `## Page ${i + 1}`) =>
  TETE + '\n<style>@font-face{font-family:\'Lexend\';src:url(data:font/ttf;base64,AAAA);}</style>\n\n' +
  Array.from({ length: n }, (_, i) => pages(i)).join('\n\n---\n\n');

describe('pages par lot', () => {
  it('10 par défaut (production), 0 ou « non » : une seule passe', () => {
    expect(PAGES_PAR_LOT_DEFAUT).toBe(10);
    expect(pagesParLot(undefined)).toBe(10);
    expect(pagesParLot('')).toBe(10);
    expect(pagesParLot('0')).toBe(0);
    expect(pagesParLot('non')).toBe(0);
    expect(pagesParLot('5')).toBe(5);
  });
});

describe('découpage en lots', () => {
  it('document court, lots désactivés ou pagination « skip » / « hold » : une seule passe', () => {
    expect(decouperEnLots(doc(10), 10)).toBeNull();
    expect(decouperEnLots(doc(30), 0)).toBeNull();
    expect(decouperEnLots(doc(30, (i) => (i === 4 ? '<!-- _paginate: skip -->\n\n## P' : '## P')), 10)).toBeNull();
    expect(decouperEnLots('sans en-tête', 10)).toBeNull();
  });

  it('chaque page dans un seul lot, dans l\'ordre, avec le rang de sa première page', () => {
    const d = decouperEnLots(doc(25), 10)!;
    expect(d.total).toBe(25);
    expect(d.lots.map((l) => [l.debut, l.pages])).toEqual([[0, 10], [10, 10], [20, 5]]);
    const pages = d.lots.flatMap((l) => l.markdown.split('\n---\n').slice(1));
    expect(pages.filter((p) => /## Page \d+/.test(p)).map((p) => /## Page (\d+)/.exec(p)![1])).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1)));
    for (const l of d.lots) expect(l.markdown.startsWith(TETE.slice(0, -'---\n'.length))).toBe(true);
  });

  it('styles globaux du document et directives héritées repris en tête des lots suivants (forme « _ » jamais héritée)', () => {
    const d = decouperEnLots(doc(25, (i) => (i === 3 ? '<!-- header: "**01** Bloc un" -->\n<!-- _class: texte -->\n\n## P' : i === 15 ? '<!-- header: "**02** Bloc deux" -->\n\n## P' : '## P')), 10)!;
    const [l1, l2, l3] = d.lots.map((l) => l.markdown.split('\n---\n')[1]);
    expect(l1).toContain("@font-face{font-family:'Lexend'");
    expect(l2).toContain("@font-face{font-family:'Lexend'");
    expect(l2).toContain('<!-- header: "**01** Bloc un" -->');
    expect(l2).not.toContain('_class');
    expect(l3).toContain('<!-- header: "**02** Bloc deux" -->');
    expect(l3).not.toContain('Bloc un');
  });
});

describe('moteur de numérotation des lots', () => {
  it('numéro de page décalé du nombre de pages des lots précédents, total du document entier', () => {
    const fichier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gss-moteur-')), 'moteur.cjs');
    fs.writeFileSync(fichier, MOTEUR_PAGINATION_GLOBALE);
    const { Marp } = require('@marp-team/marp-core');
    process.env.GSS_PAGINATION_DECALAGE = '20';
    process.env.GSS_PAGINATION_TOTAL = '143';
    try {
      const moteur = require(fichier);
      const marp = moteur({ marp: new Marp({ html: true }) });
      const { html } = marp.render('---\npaginate: true\n---\n\n# A\n\n---\n\n# B\n');
      expect([...html.matchAll(/data-marpit-pagination="(\d+)"/g)].map((m: RegExpMatchArray) => m[1])).toEqual(['21', '22']);
      expect([...html.matchAll(/data-marpit-pagination-total="(\d+)"/g)].map((m: RegExpMatchArray) => m[1])).toEqual(['143', '143']);
    } finally {
      delete process.env.GSS_PAGINATION_DECALAGE;
      delete process.env.GSS_PAGINATION_TOTAL;
      fs.rmSync(path.dirname(fichier), { recursive: true, force: true });
    }
  });
});
