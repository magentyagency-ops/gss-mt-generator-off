// Campagne « zéro défaut », tour 1 : style « marine » v3 (T1-CONS-5 bloc 1 comme la maquette, T1-CONS-6 intertitre jamais en
// bas de page, tableau coupé entre deux rangs).
import { describe, it, expect } from 'vitest';
import { articlesBloc1, chiffresCles, pageBloc1Marine, sousPartiesBloc1 } from '../src/generation/bloc1_marine';
import { splitIntoSlideChunks } from '../src/generation/marp_generator';
import { LIMITES_MARINE_V3, intertitresV3 } from '../src/generation/marp_pages_marine';

const B1 = `L'Établissement public lance le marché « Prestations de surveillance », d'une durée de 3 ans.
## Votre contexte et votre site
Le domaine couvre 130 hectares, dont 40 000 m² de bâtiments.
## Le périmètre de la prestation demandée
| Site | Poste | Jours et horaires |
|---|---|---|
| Château | Contrôle d'accès | 9h20–18h10 |
## Vos attentes et nos engagements
- **« dans un délai maximal de deux heures »** : prévoir une astreinte pour le remplacement d’un absent → notre réponse : « Le remplacement d'un agent absent : absence non prévue », développé au bloc 5.
- **« maintenir, en continu et sans interruption »** et « Aucun poste ne doit rester non pourvu. » : organiser les relèves → notre réponse : « La planification », développée au bloc 4, et « Le remplacement d'un agent absent : absence non prévue », développé au bloc 5.
## Les points de vigilance identifiés et nos réponses
- **Parc ouvert en continu** : le parc est ouvert 24h/24 et 7j/7 → notre réponse : cadrer chaque prestation par « La mise en place d'une prestation », développée au bloc 5.`;
const DCE = `ARTICLE 1 - OBJET\nLe marché est conclu pour une durée de trois ans.\n3.2.4 Ouverture du parc\nLe parc est ouvert 24h/24 et 7j/7.\n4.1.3 Remplacement\nLe remplacement intervient dans un délai maximal de deux heures.\n6.3 Description du site\nLe domaine couvre 130 hectares dont 40 000 m2 de bâtiments.\nLe poste est tenu de 9h20 à 18h10.`;

describe('bloc 1 comme la maquette validée (T1-CONS-5)', () => {
  it('chiffres clés avec leur légende et l’article du CCTP', () => {
    const a = articlesBloc1(B1, DCE);
    const c = chiffresCles(B1, a);
    expect(c.map((x) => x.valeur)).toEqual(['3 ans', '130 hectares', '40 000 m²', '24 h/24']);
    expect(c.find((x) => x.valeur === '40 000 m²')).toMatchObject({ legende: 'de bâtiments', source: 'art. 6.3' });
    expect(c.find((x) => x.valeur === '3 ans')?.source).toBe('art. 1');
  });
  it('bandeau, source, attentes et points de vigilance en tableaux à 3 colonnes avec « → BLOC n »', () => {
    const p = pageBloc1Marine(B1, articlesBloc1(B1, DCE));
    expect(p).toMatch(/<div class="gss-chiffres">.*<b>130 hectares<\/b>/);
    expect(p).toMatch(/<p class="gss-source">Source : CCTP, article 6\.3<\/p>/);
    expect(p).toContain('| Exigence | Ce que le CCTP demande | Notre réponse |');
    expect(p).toContain('| Prévoir une astreinte pour le remplacement d’un absent | « dans un délai maximal de deux heures » | « Le remplacement d\'un agent absent : absence non prévue » <span class="gss-bloc">→ BLOC 5</span> |');
    expect(p).toContain('<span class="gss-bloc">→ BLOC 4 ET 5</span>');
    expect(p).toContain('| Parc ouvert en continu | Le parc est ouvert 24h/24 et 7j/7 |');
    // Sans les options de mise en page : ni bandeau ni source.
    expect(pageBloc1Marine(B1, {}, { sources: false, bandeau: false })).not.toMatch(/gss-chiffres|gss-source/);
  });
  it('ouverture du bloc 1 : ses sous-parties', () => {
    expect(sousPartiesBloc1(B1, true)).toEqual(['Votre contexte et votre site', 'Le périmètre de la prestation demandée', 'Vos attentes et nos engagements', 'Les points de vigilance identifiés et nos réponses', 'Notre réponse en un process']);
  });
});

describe('pagination du style v3 (T1-CONS-6)', () => {
  const L = LIMITES_MARINE_V3 as any;
  it('jamais une page qui finit par un intertitre, même collé à la fin d’un tableau', () => {
    const rangs = Array.from({ length: 14 }, (_, i) => `| Site ${i} | Poste ${i} avec un intitulé assez long pour replier la cellule | Tous les jours de 8h30 à 19h45 du 1er mai au 30 septembre et de 8h30 à 18h45 en octobre |`).join('\n');
    const t = intertitresV3(`Amorce du bloc.\n## Le périmètre\n| Site | Poste | Horaires |\n|---|---|---|\n${rangs}\n## Vos attentes et nos engagements\n- une attente → notre réponse : une réponse.\n- une autre attente → notre réponse : une autre réponse.`);
    const pages = splitIntoSlideChunks(t, L);
    for (const p of pages.slice(0, -1)) expect(p.trim().split(/\n{2,}/).pop()!.trim()).not.toMatch(/^#{1,6}\s[^\n]*$/);
  });
  it('tableau trop long pour la page : coupé entre deux rangs, en-tête répété', () => {
    const rangs = Array.from({ length: 30 }, (_, i) => `| Ligne ${i} | Un texte de cellule qui occupe une ligne | Encore un texte |`).join('\n');
    const pages = splitIntoSlideChunks(`Amorce.\n\n${'Un paragraphe de texte qui remplit la page. '.repeat(40)}\n\n| A | B | C |\n|---|---|---|\n${rangs}`, L);
    const avecTableau = pages.filter((p) => /\| A \| B \| C \|/.test(p));
    expect(avecTableau.length).toBeGreaterThanOrEqual(2);
    for (const p of avecTableau) expect(p).toMatch(/\| A \| B \| C \|\n\|---\|---\|---\|/);
  });
});
