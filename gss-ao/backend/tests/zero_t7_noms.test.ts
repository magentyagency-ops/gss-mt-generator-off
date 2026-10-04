// Tour 7 (correcteur) : nom de l'acheteur (T7-CONS-3, T7-COH-1, T7N-9, T7G-5, T7G-9).
import { describe, it, expect } from 'vitest';
import { formesClient, acheteurDuDce, objetDuDce, preparerMemoireType, chargerMemoireType, articleEtNom, ordinalApresPrenom } from '../src/generation/memoire_type';
import { clientDuSurtitre, CAPACITE_SURTITRE } from '../src/generation/marp_generator';

describe('tutelle et service (T7-CONS-3)', () => {
  it('« CNRS, Délégation … » : une seule entité, au singulier, forme courte « le CNRS »', () => {
    const dce = 'Le CNRS lance la consultation. Les sites du CNRS sont surveillés. Le CNRS se réserve…';
    const f = formesClient('Centre National de la Recherche Scientifique (CNRS), Délégation Île-de-France Villejuif', dce);
    expect(f.long).toBe('Centre National de la Recherche Scientifique (CNRS), Délégation Île-de-France Villejuif');
    expect(f.pluriel).toBeFalsy();
    expect(f.court).toMatchObject({ article: 'le', nom: 'CNRS' });
    expect(formesClient('École nationale des ponts et chaussées (ENPC) et Institut national de l’information géographique et forestière (IGN)', '').pluriel).toBe(true);
  });
  it('surtitre « MÉMOIRE TECHNIQUE · … » sur une ligne : forme courte au-delà de sa capacité', () => {
    const cover: any = { client: 'Centre National de la Recherche Scientifique (CNRS), Délégation Île-de-France Villejuif', clientCourt: 'CNRS' };
    expect(clientDuSurtitre(cover, CAPACITE_SURTITRE.sommaire)).toBe('CNRS');
    expect(clientDuSurtitre({ client: 'Ville de Rouen', clientCourt: '' } as any, CAPACITE_SURTITRE.ouverture)).toBe('Ville de Rouen');
  });
});

describe('acheteur et objet lus sans modèle (T7-COH-1, T7N-9)', () => {
  const lire = (l: string) => acheteurDuDce(`RÈGLEMENT DE LA CONSULTATION\n${l}\nObjet : surveillance`);
  it('ligne « Acheteur : » : jamais l’adresse, la représentation ni le service entre parenthèses', () => {
    expect(lire("Acheteur : SOCIÉTÉ D'ÉCONOMIE MIXTE HAROPA LOGISTIQUE, 5 rue de Paris, 75008 Paris")).toBe("SOCIÉTÉ D'ÉCONOMIE MIXTE HAROPA LOGISTIQUE");
    expect(lire('Pouvoir adjudicateur : Ville de Bolbec, Hôtel de Ville, 1 place Charles de Gaulle, 76210 Bolbec')).toBe('Ville de Bolbec');
    expect(lire('Acheteur : Centre hospitalier du Rouvray - 4 rue Paul Éluard - BP 45 - 76301 Sotteville-lès-Rouen Cedex')).toBe('Centre hospitalier du Rouvray');
    expect(lire("Pouvoir adjudicateur : Département de l'Eure, représenté par son Président")).toBe("Département de l'Eure");
    expect(lire('Acheteur : Ville du Havre (Direction de la commande publique)')).toBe('Ville du Havre');
  });
  it('titre en tête du CCTP : objet et sigle de l’acheteur (caen)', () => {
    const dce = `===== PIÈCE : LOT 5 - CCTP - CAEN.pdf =====\n   MARCHE PUBLIC DE FOURNITURES COURANTES ET DE\n   SERVICES\n\nPrestation de gardiennage et de sureté/sécurité des sites\n   de l’ACOSS\n\nCahier des Clauses Techniques Particulières\n${'Les agents de l’ACOSS et les locaux de l’ACOSS. '.repeat(3)}`;
    expect(objetDuDce(dce)).toBe('Prestation de gardiennage et de sureté/sécurité des sites de l’ACOSS');
    expect(acheteurDuDce(dce)).toBe('ACOSS');
    expect(objetDuDce('===== PIÈCE : CCTP =====\nETABLISSEMENT PUBLIC\nService de l’accueil\n')).toBe('');
  });
});

describe('nom écrit seulement en capitales (T7G-5, T7G-9)', () => {
  const MT = chargerMemoireType();
  const client = (nom: string) => preparerMemoireType({ analyse: { clientName: nom }, dce: `===== PIÈCE : RC.pdf =====\n${nom}\n1 rue de l'Église\n76000 ROUEN\nLe titulaire assure les rondes de nuit.`, referents: '' } as any, { memoireType: MT } as any).variables.CLIENT;
  it('prénoms avec leurs accents, rang « Ier », nom d’équipement, « cité »', () => {
    expect(client('LYCEE ANDRE MAUROIS').valeur).toBe('Lycée André Maurois');
    expect(client('LYCEE FRANCOIS 1ER').valeur).toBe('Lycée François Ier');
    expect(client('MEDIATHEQUE DE FECAMP').valeur).toBe('Médiathèque de Fécamp');
    expect(client('CITE SCOLAIRE GUSTAVE FLAUBERT').valeur).toBe('Cité scolaire Gustave Flaubert');
    expect(client('ECOLE ELEMENTAIRE JEROME BOSCH').valeur).toBe('École élémentaire Jérôme Bosch');
    expect(ordinalApresPrenom('Lycée François 1ER')).toBe('Lycée François Ier');
  });
  it('mot dont la graphie n’est pas confirmée : la question unique de graphie', () => {
    expect(client('LYCEE ANDRE MAUROIS').aConfirmer).toMatch(/« Maurois »/);
    expect(client('COLLEGE JULES VALLES').aConfirmer).toMatch(/« Valles »/);
    expect(client('LYCEE PIERRE CORNEILLE').aConfirmer).toBeFalsy();
  });
  it('tête d’équipement public : article, adjectif en minuscules', () => {
    expect(client('PISCINE MUNICIPALE DE BOLBEC')).toMatchObject({ valeur: 'Piscine municipale de Bolbec', article: 'la' });
    expect(client("GYMNASE MUNICIPAL D'YVETOT")).toMatchObject({ valeur: "Gymnase municipal d'Yvetot", article: 'le' });
    expect(articleEtNom('Golf de Rouen').article).toBe('le');
    expect(articleEtNom('Patinoire de Rouen').article).toBe('la');
  });
});
