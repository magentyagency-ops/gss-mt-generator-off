// Campagne « zéro défaut », tour 3 : nom de l'acheteur et langue (T3-COH-1, T3-COH-2, T3-COH-3, T3-COH-4, T3N-8).
import { describe, it, expect } from 'vitest';
import { preparerMemoireType, publierMemoire, chargerMemoireType, nomAcheteurAffiche, casseDuDce } from '../src/generation/memoire_type';
import { contracterArticlesNomsPropres } from '../src/generation/base_memoires';

const prep = (nom: string, dce: string) => preparerMemoireType({ dce, analyse: { clientName: nom }, cover: { client: nom }, referents: '' } as any, { memoireType: chargerMemoireType() });
const texte = (p: any) => publierMemoire(p).map((r: any) => r.texte || '').join('\n');
const couverture = (nom: string, dce: string) => { const p: any = prep(nom, dce); return { c: nomAcheteurAffiche(p.variables.CLIENT, nom), t: texte(p) }; };

describe('forme de société suivie d’un complément (T3-COH-1)', () => {
  it('« Société anonyme d’HLM de la région d’Elbeuf » gardé entier, avec « la »', () => {
    const { c, t } = couverture("Société anonyme d'HLM de la région d'Elbeuf", "Pouvoir adjudicateur : Société anonyme d'HLM de la région d'Elbeuf, 76500 Elbeuf. Marché de gardiennage.");
    expect(c).toBe("Société anonyme d'HLM de la région d'Elbeuf");
    expect(t).toMatch(/L'équipe dédiée à la Société anonyme d'HLM de la région d'Elbeuf/);
    expect(t).not.toMatch(/à de la/);
  });
  it('« SA d’HLM Logéal Immobilière » → « Logéal Immobilière »', () => {
    expect(couverture("SA d'HLM Logéal Immobilière", 'Pouvoir adjudicateur : SA d\'HLM Logéal Immobilière. 76190 Yvetot. Logéal Immobilière se réserve.').c).toBe('Logéal Immobilière');
  });
  it('SPL d’aménagement et SEM suivies de « de la … » : nom entier', () => {
    expect(couverture("Société publique locale d'aménagement de la Métropole Rouen Normandie", 'Marché, 76000 Rouen.').c).toBe("Société publique locale d'aménagement de la Métropole Rouen Normandie");
    const { c, t } = couverture("Société d'économie mixte de la Ville du Havre", 'Marché. 76600 Le Havre.');
    expect(c).toBe("Société d'économie mixte de la Ville du Havre");
    expect(t).toMatch(/à la Société d'économie mixte de la Ville du Havre/);
  });
  it('nom d’usage après le tiret : « la SEM Havre Développement »', () => {
    const { c, t } = couverture("SOCIETE D'ECONOMIE MIXTE DE LA VILLE DU HAVRE - SEM HAVRE DEVELOPPEMENT", 'POUVOIR ADJUDICATEUR : SOCIETE D\'ECONOMIE MIXTE DE LA VILLE DU HAVRE - SEM HAVRE DEVELOPPEMENT. 76600 Le Havre.');
    expect(c).toBe('SEM Havre Développement');
    expect(t).toMatch(/à la SEM Havre Développement/);
  });
  it('« S.P.L. CITEDIA METROPOLE » reste « Citédia Métropole » (nom propre après la forme)', () => {
    expect(couverture('S.P.L. CITEDIA METROPOLE', 'Pouvoir adjudicateur : S.P.L. CITEDIA METROPOLE. Citédia Métropole gère les parcs. 35000 Rennes.').c).toBe('Citédia Métropole');
  });
});

describe('groupement de commandes, toutes tournures (T3-COH-2)', () => {
  it('« constitué de la Ville…, du CCAS… et de la Métropole… »', () => {
    const { c, t } = couverture('Groupement de commandes constitué de la Ville de Rouen, du CCAS de Rouen et de la Métropole Rouen Normandie', 'Marché à Rouen 76000.');
    expect(c).toBe('Ville de Rouen, le CCAS de Rouen et la Métropole Rouen Normandie');
    expect(t).toMatch(/à la Ville de Rouen, au CCAS de Rouen et à la Métropole Rouen Normandie/);
    expect(t).not.toMatch(/(?:à|pour) la Ville de Rouen et du CCAS/);
  });
  it('« composé de la Ville du Havre et de la Communauté urbaine… »', () => {
    const { c } = couverture('Groupement de commandes composé de la Ville du Havre et de la Communauté urbaine Le Havre Seine Métropole', 'Marché 76600.');
    expect(c).toBe('Ville du Havre et la Communauté urbaine Le Havre Seine Métropole');
  });
});

describe('article qui fait partie du nom propre (T3-COH-3) et contraction (T3N-8)', () => {
  it('« Le Havre Seine Métropole », « La Poste », « Les Docks Vauban » gardent leur article', () => {
    expect(couverture('Le Havre Seine Métropole', 'Le Havre Seine Métropole lance un marché. 76600 Le Havre.').c).toBe('Le Havre Seine Métropole');
    expect(couverture('La Poste', 'La Poste lance un marché. 76000 Rouen.').t).toMatch(/à La Poste/);
    expect(couverture('Les Docks Vauban', 'Marché. 76600 Le Havre.').t).toMatch(/aux Docks Vauban/);
    expect(couverture('Le Havre Seine Métropole', 'Marché. 76600 Le Havre.').t).toMatch(/au Havre Seine Métropole/);
  });
  it('un nom commun d’institution perd toujours son article (« la Région Normandie », « aux Hôpitaux de Rouen »)', () => {
    expect(couverture('La Région Normandie', 'Marché. 14000 Caen.').c).toBe('Région Normandie');
    expect(couverture('Les Hôpitaux de Rouen', 'Marché. 76000 Rouen.').t).toMatch(/aux Hôpitaux de Rouen/);
  });
  it('« à Le Grand-Quevilly » → « au Grand-Quevilly », « de Les Andelys » → « des Andelys », « à La Poste » inchangé', () => {
    expect(contracterArticlesNomsPropres('Le Parc des Expositions de Rouen, à Le Grand-Quevilly, est un établissement.')).toBe('Le Parc des Expositions de Rouen, au Grand-Quevilly, est un établissement.');
    expect(contracterArticlesNomsPropres('Le site de Les Andelys. À Le Havre, nous.')).toBe('Le site des Andelys. Au Havre, nous.');
    expect(contracterArticlesNomsPropres('à La Poste et à le site')).toBe('à La Poste et à le site');
  });
});

describe('capitales : « A » préposition, mots du dictionnaire et sigles (T3-COH-4)', () => {
  it('intitulés de citedia et de fontainebleau', () => {
    expect(casseDuDce('PRESTATIONS DE SECURITE DANS LES PARCS GERES PAR CITEDIA METROPOLE A RENNES', 'Citédia Métropole gère des parcs gérés par la société à Rennes.', true)).toMatch(/Citédia Métropole à Rennes$/);
    expect(casseDuDce('SURVEILLANCE DU CHATEAU - ACCORD-CADRE A BONS DE COMMANDE', 'Le château.', true)).toBe('Surveillance du château - accord-cadre à bons de commande');
  });
  it('nom en capitales seulement : mots du dictionnaire en minuscules, nom de lieu, sigle gardé', () => {
    expect(casseDuDce('SYNDICAT MIXTE A VOCATION MULTIPLE DU PAYS DE CAUX', 'LE SYNDICAT MIXTE A VOCATION MULTIPLE DU PAYS DE CAUX')).toBe('Syndicat mixte à vocation multiple du pays de Caux');
    expect(casseDuDce("OFFICE PUBLIC DE L'HABITAT DE ROUEN", "OFFICE PUBLIC DE L'HABITAT DE ROUEN")).toBe("Office public de l'habitat de Rouen");
    expect(casseDuDce("SERVICE DEPARTEMENTAL D'INCENDIE ET DE SECOURS DE LA SEINE-MARITIME (SDIS 76)", 'le SDIS 76')).toBe("Service départemental d'incendie et de secours de la Seine-Maritime (SDIS 76)");
    expect(casseDuDce('SURVEILLANCE DU LYCEE ET DU PORT DE PECHE', 'X', true)).toBe('Surveillance du lycée et du port de pêche');
    expect(casseDuDce("GARDIENNAGE DU CHU ET DE L'INSA", "le CHU et l'INSA", true)).toBe("Gardiennage du CHU et de l'INSA");
  });
});
