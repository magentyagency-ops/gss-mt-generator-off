import { describe, it, expect } from 'vitest';
import { communesParCodePostal, lieuDuMarche, marcheHorsNormandie, delaisHorsNormandie } from '../src/generation/base_memoires';
import { preparerMemoireType, donneesBesoin } from '../src/generation/memoire_type';
import { siteDansPhrase, phraseSites } from '../src/generation/reponse_libre_v2';
import { exigenceHorsNormandie } from '../src/generation/adaptations_cctp';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 9 : numéro « CS », nom de voie et fuseau horaire jamais lus comme la commune du marché (T9REG-1, T9REG-2, T9-COH-3, T9-COH-4). */
const CS_1 = "CCTP\nLieu d'exécution des prestations : Hôtel de Ville, 2 place du Général de Gaulle CS 31402 76037 Rouen\nLe titulaire assure la surveillance du site.";
const CS_2 = "CCTP\nAdresse du site : Centre culturel, 12 rue Jeanne d'Arc CS 40021 76000 Rouen\nSurveillance des locaux.";
const GMT = "Les dates et heures limites s'entendent à l'heure de Paris. A ce titre, le fuseau horaire de référence est celui de (GMT+01:00) Paris, Bruxelles, Copenhague, Madrid.";
const DELAIS = "En cas d'alarme PTI, notre intervenant est sur place en 45 minutes. Notre responsable d'astreinte se déplace sur site en moins de 2 heures.";

const villes = (dce: string, sites: any[] = [{ name: 'Site' }]) => {
  const ctx = { dce, analyse: { clientName: 'Acheteur', sites } };
  return donneesBesoin(preparerMemoireType(ctx), ctx).villes;
};

describe('numéro de tri postal (CS, BP, TSA) jamais lu comme un code postal (T9REG-1)', () => {
  it('adresse normande avec CS : marché normand, délais normands gardés, aucun motif D8', () => {
    for (const d of [CS_1, CS_2]) {
      expect(communesParCodePostal(d).map((c) => c.commune)).toEqual(['Rouen']);
      expect(lieuDuMarche({}, d)).toMatchObject({ statut: 'normandie', normands: ['Rouen'], horsNormandie: [] });
      expect(marcheHorsNormandie({}, d)).toBe(false);
      expect(delaisHorsNormandie(DELAIS, d, false).retires).toEqual([]);
      expect(exigenceHorsNormandie(d, {})).not.toMatch(/\bCS\b|en partie hors Normandie/);
      expect(villes(d)).toEqual(['Rouen']);
    }
  });
  it('BP et TSA : idem', () => {
    expect(communesParCodePostal('Mairie, BP 21401 76000 Rouen').map((c) => c.code)).toEqual(['76000']);
    expect(communesParCodePostal('Service courrier TSA 70011 69134 Lyon').map((c) => c.code)).toEqual(['69134']);
  });
  it('ca_normandie : plus aucune fausse commune « … CS »', () => {
    if (!aCorpus('ca_normandie')) return;
    const communes = communesParCodePostal(DCE('ca_normandie')).map((c) => c.commune);
    expect(communes.filter((c) => /\bCS$/.test(c))).toEqual([]);
  });
});

describe('nom de voie et fuseau horaire jamais lus comme une commune (T9REG-2, T9-COH-3)', () => {
  it('« 42 boulevard Jourdan, 75014 ⏎ Paris » : jamais « Jourdan »', () => {
    expect(communesParCodePostal('dont le siège est situé 42 boulevard Jourdan, 75014\nParis')).toEqual([]);
    expect(communesParCodePostal('12 rue de la Marne 76000\nRouen')).toEqual([]);
    // Commune écrite avant le code, après le nom du site : toujours lue.
    expect(communesParCodePostal('Adresse : Château de Fontainebleau 77300 France').map((c) => c.commune)).toEqual(['Fontainebleau']);
    expect(communesParCodePostal('Adresse | 1 square Carnot à DIEPPE 76200\nClassification').map((c) => c.commune)).toEqual(['Dieppe']);
  });
  it('imm : communes du bloc 1 = Paris seulement', () => {
    if (!aCorpus('imm')) return;
    expect(villes(DCE('imm'), [{ name: 'Institut Mutualiste Montsouris' }])).toEqual(['Paris']);
    expect(phraseSites(['Institut Mutualiste Montsouris'], ['Paris'])).toBe('La prestation porte sur l’Institut Mutualiste Montsouris (Paris).');
  });
  it('citedia2 : Rennes seulement, jamais Paris lu dans le fuseau horaire du RC', () => {
    if (!aCorpus('citedia2')) return;
    expect(lieuDuMarche({}, DCE('citedia2'))).toMatchObject({ statut: 'hors', horsNormandie: ['Rennes'] });
    expect(villes(DCE('citedia2'))).toEqual(['Rennes']);
  });
  it('DCE normand sans code postal avec la formule GMT ou « heure de Paris » : reste en Normandie', () => {
    for (const d of [`Marché de gardiennage du musée des Beaux-Arts de Rouen. ${GMT}`, `Marché de gardiennage. Le site est à Rouen, quartier de la gare de Rouen. ${GMT}`]) {
      expect(lieuDuMarche({}, d)).toMatchObject({ statut: 'normandie', normands: ['Rouen'], horsNormandie: [] });
      expect(preparerMemoireType({ dce: d, analyse: { clientName: 'Ville', sites: [{ name: 'Musée' }] } }).indicateurs.HORS_NORMANDIE).toBe(false);
    }
    const evreux = "Surveillance de la médiathèque d'Évreux. Les offres sont remises avant 12 h, heure de Paris.";
    expect(lieuDuMarche({}, evreux)).toMatchObject({ statut: 'normandie', normands: ['Évreux'], horsNormandie: [] });
  });
  it('corpus : statut du lieu inchangé sur les 19 DCE', () => {
    const attendu: Record<string, string> = { becquerel: 'normandie', ca_normandie: 'normandie', caen: 'normandie', citedia: 'hors', citedia2: 'hors', cstb: 'hors', etampes1: 'hors', etampes2: 'hors', fontainebleau: 'hors', havre1: 'normandie', havre2: 'normandie', ifits: 'hors', ifsem: 'hors', ign: 'hors', imm: 'hors', parc_expo: 'normandie', rouen_univ: 'normandie', s2e: 'normandie', vitry: 'hors' };
    for (const [c, statut] of Object.entries(attendu)) {
      if (!aCorpus(c)) continue;
      expect([c, lieuDuMarche({}, DCE(c)).statut]).toEqual([c, statut]);
    }
  });
});

describe('site en capitales qui commence par un article (T9-COH-4)', () => {
  it('article entier en minuscules, nom gardé', () => {
    expect(siteDansPhrase('LES LICES — place des Lices')).toBe('les LICES — place des Lices');
    expect(siteDansPhrase('LA CRIEE (Halles Centrales) — place Commeurec')).toBe('la CRIEE (Halles Centrales) — place Commeurec');
    expect(siteDansPhrase("L'HOTEL DIEU — rue de l'Hôtel Dieu")).toBe("l'HOTEL DIEU — rue de l'Hôtel Dieu");
    expect(siteDansPhrase('La Criée')).toBe('la Criée');
  });
});
