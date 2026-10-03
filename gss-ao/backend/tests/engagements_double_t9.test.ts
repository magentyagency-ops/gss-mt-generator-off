import { describe, it, expect } from 'vitest';
import { sansEngagementsEnDouble } from '../src/generation/reponse_libre_v2';

/** Tour 9 (T9N-4) : engagement du CCTP en double dans la même liste « Nos engagements ». */
const T = `Texte de GSS.

## Nos engagements sur les exigences du cahier des charges

- GSS n’autorisera aucun agent à intervenir sans les EPI requis, adaptés aux tâches, aux produits et matériels utilisés et aux risques encourus.
- GSS interdira à ses personnels de récupérer pour eux-mêmes ou pour un tiers tout matériel, document ou papier du CSTB, même apparemment abandonné, de photographier les bâtiments, équipements scientifiques ou installations, et de divulguer les codes d’accès.
- GSS respectera et fera respecter l’interdiction de photographier les bâtiments, les équipements scientifiques et les installations du CSTB.`;

describe('engagements en double (T9N-4)', () => {
  it('cstb 551 : la puce contenue dans une plus complète est retirée, la plus complète reste', () => {
    const r = sansEngagementsEnDouble(T);
    expect(r.retirees).toEqual(['GSS respectera et fera respecter l’interdiction de photographier les bâtiments, les équipements scientifiques et les installations du CSTB.']);
    expect(r.texte).toMatch(/GSS interdira à ses personnels/);
    expect(r.texte).toMatch(/EPI requis/);
    expect(r.texte.startsWith('Texte de GSS.')).toBe(true);
  });
  it('mêmes mots, autres chiffres : deux engagements distincts, gardés', () => {
    const t = `## Nos engagements sur les exigences du cahier des charges\n\n- GSS remettra le rapport d'activité au CSTB avant le 5 du mois.\n- GSS remettra le rapport d'activité annuel au CSTB avant le 31 janvier.`;
    expect(sansEngagementsEnDouble(t).retirees).toEqual([]);
  });
});
