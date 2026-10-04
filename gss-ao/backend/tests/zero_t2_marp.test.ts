// Campagne « zéro défaut », tour 2 : pagination (T2-REG-1).
import { describe, it, expect } from 'vitest';
import { decouperPagesTexte, splitIntoSlideChunks } from '../src/generation/marp_generator';
import { LIMITES_MARINE_V3 } from '../src/generation/marp_pages_marine';

describe('deux tableaux distincts de même en-tête restent deux tableaux (T2-REG-1)', () => {
  const t = "Planning des deux sites.\n\n| Poste | Horaires |\n|---|---|\n| Agent SSIAP 1 | 7h-19h |\n| Agent SSIAP 1 | 19h-7h |\n\n| Poste | Horaires |\n|---|---|\n| Agent ADS | 8h-18h |\n| Agent ADS | 18h-8h |\n\nFin.";
  const enTetes = (pages: string[]) => (pages.join('\n').match(/\| Poste \| Horaires \|/g) || []).length;
  it('retour arrière, style par défaut et style marine', () => {
    expect(enTetes(decouperPagesTexte(t, true))).toBe(2);
    expect(enTetes(splitIntoSlideChunks(t))).toBe(2);
    expect(enTetes(splitIntoSlideChunks(t, LIMITES_MARINE_V3 as any))).toBe(2);
  });
});

import fs from 'fs';
import path from 'path';
import { pagesQuiDebordent } from '../src/generation/marp_generator';
import { sommaireV3 } from '../src/generation/marp_pages_marine';

describe('texte sous le pied de page détecté sur le PDF rendu (T2-CONS-2)', () => {
  const pdf = path.join(__dirname, '../../_corpus_verif/_resultats/v-cstb-1201.pdf');
  it.skipIf(!fs.existsSync(pdf))('génération réelle cstb 1201 : la page 20 seule', () => {
    expect(pagesQuiDebordent(pdf)).toEqual([20]);
  });
});

describe('sommaire comme la planche (T2-CONS-12)', () => {
  it('page de chaque bloc à droite, sous-parties du bloc 1', () => {
    const pages = sommaireV3([
      { numero: 1, titre: 'Notre compréhension de votre besoin', rubriques: ['Votre contexte et votre site', 'Le périmètre de la prestation demandée', 'Vos attentes et nos engagements', 'Les points de vigilance identifiés et nos réponses', 'Notre réponse en un process'], page: 3 },
      { numero: 2, titre: 'Présentation de GSS', rubriques: ['Notre catalogue de prestations'], page: 7 },
    ], 'Client', '');
    expect(pages.join('')).toContain('<div class="p">3</div>');
    expect(pages.join('')).toContain('<div class="p">7</div>');
    expect(pages.join('')).toContain('<li>Les points de vigilance identifiés et nos réponses</li>');
  });
});
