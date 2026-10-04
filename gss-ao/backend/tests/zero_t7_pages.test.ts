// Tour 7 (correcteur) : limite de pages du mémoire technique (T7G-1, T7-COH-3).
import { describe, it, expect } from 'vitest';
import { passagesLimitePages, passagesContenuOffre, limitePagesMemoire, phraseLimitePages } from '../src/generation/format_court';

const lire = (ph: string) => {
  const rc = `\n\n--- RC ---\nREGLEMENT DE LA CONSULTATION\nARTICLE 5 – CONTENU DES OFFRES\nL'offre comprend :\n- l'acte d'engagement ;\n- ${ph}\n`;
  let p = passagesLimitePages(rc); if (!p.length) p = passagesContenuOffre(rc);
  return { lue: limitePagesMemoire(p)?.pages ?? null, phrase: p.map(phraseLimitePages).find(Boolean) || null, passages: p.length };
};

describe('formes abrégées et libellés de la limite de pages (T7G-1)', () => {
  for (const [ph, n] of [['Mémoire technique : 20 p. max.', 20], ['Mémoire technique (20 p. max)', 20], ['Mémoire technique : 20 p max', 20], ['Mémoire technique : 20 pp. maximum', 20],
    ['Nombre de pages maximum du mémoire technique : 20.', 20], ['Mémoire technique : 20 pages max', 20], ['Mémoire technique, 20 pages maxi', 20],
    ['Le mémoire technique ne pourra excéder 10 feuillets recto-verso.', 20], ['Le mémoire technique sera limité à 20 pages, annexes comprises.', 20],
    ['Pièce | Contenu | Nombre de pages\nMémoire technique | Moyens humains et matériels | 20 maximum', 20]] as Array<[string, number]>) {
    it(ph.replace(/\n/g, ' ⏎ '), () => { const r = lire(ph); expect(r.passages).toBeGreaterThan(0); expect(r.lue).toBe(n); expect(r.phrase).toBeTruthy(); });
  }
  it('« (20 p.) » sans marque de limite : le passage est donné au modèle', () => expect(lire('Mémoire technique (20 p.)').passages).toBeGreaterThan(0));
});

describe('citation de la limite (T7-COH-3)', () => {
  it('jamais l’en-tête de la pièce ni le titre, le nombre de pages toujours cité', () => {
    const d = "\n--- RC_entrepots ---\nRÈGLEMENT DE LA CONSULTATION\nAcheteur : SOCIÉTÉ D'ÉCONOMIE MIXTE HAROPA LOGISTIQUE, 5 rue de Paris, 75008 Paris\nObjet : surveillance de deux entrepôts logistiques\nLe mémoire technique comporte au plus 25 pages.\n";
    expect(limitePagesMemoire(passagesLimitePages(d))).toEqual({ pages: 25, citation: 'Le mémoire technique comporte au plus 25 pages.' });
    const d2 = "ARTICLE 6 - PRÉSENTATION DES OFFRES\n6.1 Contenu de l'offre technique\nLe mémoire technique ne devra pas dépasser 15 pages.\n";
    expect(passagesLimitePages(d2).map(phraseLimitePages)).toEqual(['Le mémoire technique ne devra pas dépasser 15 pages.']);
    const d3 = "ARTICLE 6 - CONTENU DE L'OFFRE\nLe candidat remet les pièces suivantes\nActe d'engagement complété et signé\nBordereau des prix unitaires\nMémoire technique de 15 pages maximum, présentant les moyens humains et matériels\n";
    expect(limitePagesMemoire(passagesLimitePages(d3))?.pages).toBe(15);
  });
});
