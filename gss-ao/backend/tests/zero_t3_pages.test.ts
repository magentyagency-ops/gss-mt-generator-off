// Campagne « zéro défaut », tour 3 : pages du style Marine v3 (T3-CONS-1, T3-COH-8, T3N-1).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { decouperPagesTexte, pagesQuiDebordentDuLayout, clientDuPied, stylePiedV3, rubriquesDePlusDeDeuxPages } from '../src/generation/marp_generator';
import { reduireBesoinAPages, resserrerBesoin } from '../src/generation/reponse_libre_v2';
import { sommaireV3 } from '../src/generation/marp_pages_marine';
import { nomAcheteurCourtAffiche } from '../src/generation/memoire_type';

const page = (lignes: string) => `<page width="595.276" height="841.89">\n<flow>${lignes}</flow>\n</page>`;
const bloc = (lignes: Array<[number, number, string[]]>) => `<block xMin="0" yMin="0" xMax="0" yMax="0">${lignes.map(([x, y, mots]) => `<line xMin="${x}" yMin="${y}" xMax="500" yMax="${y + 9.7}">${mots.map((m, i) => `<word xMin="${x + i * 30}" yMin="${y}" xMax="${x + i * 30 + 25}" yMax="${y + 9.7}">${m}</word>`).join('')}</line>`).join('')}</block>`;

describe('pied de page Marine v3 d’un acheteur au nom long (T3-CONS-1, T3-COH-8)', () => {
  it('le nom qui passe à la ligne et le numéro de page ne sont jamais vus comme un débordement', () => {
    const pied = bloc([[42.5, 801.8, ['Mémoire', 'technique', '·', 'École', 'Nationale']], [42.5, 809.3, ['géographiques', '(ENSG']], [547.2, 808.4, ['6']]]);
    expect(pagesQuiDebordentDuLayout(page(bloc([[180, 700, ['texte']]]) + pied))).toEqual([]);
  });
  it('un texte qui passe sous le pied reste vu (cstb 1201 p. 20)', () => {
    const pied = bloc([[42.5, 801.8, ['Mémoire', 'technique', '·', 'CSTB']], [547.2, 801.8, ['20']]]);
    expect(pagesQuiDebordentDuLayout(page(bloc([[180, 797.9, ['manière', 'respectueuse']]]) + pied))).toEqual([1]);
  });
  it('forme courte au-delà de 95 signes, taille réduite sans forme courte', () => {
    const long = "École Nationale des Ponts et Chaussées (ENPC) et l'Institut national de l'information géographique et forestière (IGN), au titre de l'École nationale des sciences géographiques (ENSG – Géodata Paris)";
    expect(clientDuPied({ client: long, clientCourt: 'ENPC et IGN' })).toBe('ENPC et IGN');
    expect(clientDuPied({ client: 'Ville de Rouen', clientCourt: 'Rouen' })).toBe('Ville de Rouen');
    expect(nomAcheteurCourtAffiche({ valeur: long, court: "ENPC et l'IGN" } as any)).toBe('ENPC et IGN');
    const grp = `Mémoire technique · Ville de Saint-Étienne-du-Rouvray, le Centre communal d'action sociale de Saint-Étienne-du-Rouvray et la Métropole Rouen Normandie`;
    expect(stylePiedV3(grp)).toMatch(/^<style>footer\{font-size:\d(?:\.\d)?pt\}<\/style>$/);
    expect(stylePiedV3('Mémoire technique · Ville de Rouen')).toBe('');
  });
  it('sommaire : la légende n’est jamais seule sur une page « Sommaire (suite) »', () => {
    const rub = (n: number) => Array.from({ length: n }, (_, i) => `Rubrique numéro ${i + 1} au titre assez long pour deux lignes`);
    const pages = sommaireV3([1, 2, 3, 4, 5].map((n) => ({ numero: n, titre: `Bloc ${n}`, rubriques: rub(13) })), 'ENPC et IGN', '<div class="legende">L</div>');
    const derniere = pages[pages.length - 1];
    expect(derniere).toContain('legende');
    expect(derniere).toMatch(/class="entree"/);
  });
});

describe('bloc 1 tenu en 2 pages de texte (T3N-1)', () => {
  it('parc_expo 1331 : 3 pages estimées → 2, sans retirer d’attente ni de point de vigilance', () => {
    const t = fs.readFileSync(path.join(__dirname, 'fixtures', 'bloc1_parc_expo_1331.md'), 'utf-8');
    const n = (x: string) => decouperPagesTexte(x, false, true).length;
    expect(n(t)).toBe(3);
    const r = reduireBesoinAPages(t, n);
    expect(n(r.texte)).toBeLessThanOrEqual(2);
    expect(r.depasse).toBe(false);
    expect((r.texte.match(/^- /gm) || []).length).toBe((t.match(/^- /gm) || []).length);
    expect(r.texte).not.toMatch(/ \.(?:\s|\||$)/);
  });
  it('resserrement : cellule coupée à sa première phrase, citation longue abrégée par « […] »', () => {
    const t = `## Le périmètre de la prestation demandée\n| Site | Missions |\n|---|---|\n| A | Coordonner l’équipe, diriger le poste de sécurité lors des sinistres et assurer les missions SSIAP 2 prévues au CCTP. |\n\n## Vos attentes et nos engagements\n- **« ${'mot '.repeat(40)}fin »** : nous → notre réponse : « X ».`;
    const r = resserrerBesoin(t);
    expect(r).toContain('| Coordonner l’équipe, diriger le poste de sécurité lors des sinistres |');
    expect(r).toMatch(/« (?:mot ){10,}mot \[…\] »/);
  });
  it('dépassement impossible à résorber : signalé (depasse)', () => {
    const r = reduireBesoinAPages('x', () => 3);
    expect(r.depasse).toBe(true);
  });
});

describe('contrôle final : rubrique de plus de 2 pages de texte avant son schéma (T3-CONS-1)', () => {
  it('lu dans le Markdown rendu', () => {
    const d = (t: string, c = 'texte') => `<!-- _class: ${c} -->\n<!-- rubrique: "${t}" -->\nx`;
    const md = ['---\nmarp: true\n---', d('A'), d('A'), d('A'), d('A', 'schema'), d('B'), d('B'), d('B', 'schema')].join('\n---\n');
    expect(rubriquesDePlusDeDeuxPages(md)).toEqual(['A']);
  });
});
