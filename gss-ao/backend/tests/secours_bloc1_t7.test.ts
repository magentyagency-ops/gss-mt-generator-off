import { describe, it, expect } from 'vitest';
import { texteSecoursBesoin, horairesLisibles, phraseSites, siteDansPhrase, perimetreSecours, poserReperes } from '../src/generation/reponse_libre_v2';
import { cleCommune, preparerMemoireType } from '../src/generation/memoire_type';
import { horairesImposes } from '../src/generation/base_memoires';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7CS-4, T7N-6, T7-COH-3) : texte de secours du bloc 1. */
const base = { client: 'le CSTB', objet: 'Rondes', lots: '', duree: '', sites: [] as string[], villes: [] as string[], secteur: '', horaires: [] as string[], obligations: [] as string[], qualifications: [], enjeux: [], prestations: [], horsNormandie: true, amorce: 'Le CSTB lance le marché « Rondes ».' };

describe('texte de secours du bloc 1 (T7CS-4, T7N-6, T7-COH-3)', () => {
  it('site avec article et minuscule, commune non répétée sous ses variantes (cstb 551)', () => {
    const t = texteSecoursBesoin({ ...base, sites: ['Site du CSTB Grenoble — 24 rue Joseph Fourier, 38400 Saint-Martin-d’Hères'], villes: ["Saint Martin d'Hères", 'St Martin d’Hères'] });
    expect(t).toContain('La prestation porte sur le site du CSTB Grenoble — 24 rue Joseph Fourier, 38400 Saint-Martin-d’Hères.');
    expect(t).not.toMatch(/\(Saint Martin|St Martin/);
  });
  it('site nommé par sa commune (caen 475) : « le site de Caen », sans « (Caen) »', () => {
    expect(phraseSites(['CAEN — 20 rue Alfred Kastler, 14000 Caen'], ['Caen'])).toBe('La prestation porte sur le site de Caen — 20 rue Alfred Kastler, 14000 Caen.');
  });
  it('nom propre : article, majuscule gardée ; commune absente du nom : entre parenthèses', () => {
    expect(phraseSites(['Centre Henri Becquerel'], ['Rouen'])).toBe('La prestation porte sur le Centre Henri Becquerel (Rouen).');
    expect(siteDansPhrase('Hôtel de la Métropole')).toBe('l’Hôtel de la Métropole');
    expect(siteDansPhrase('Le Parc des expositions')).toBe('le Parc des expositions');
    expect(siteDansPhrase('Bâtiments de la DSI')).toBe('les bâtiments de la DSI');
  });
  it('clé de commune : Saint / St, tirets, apostrophes, accents', () => {
    expect(cleCommune('St Martin d’Hères')).toBe(cleCommune("Saint-Martin-d'Hères"));
    expect(cleCommune('SAINT MARTIN D HERES')).toBe(cleCommune('Saint Martin d’Hères'));
  });
  it('VILLE : une commune écrite de trois façons dans le DCE n’est retenue qu’une fois', () => {
    const prep = preparerMemoireType({ dce: 'Site du CSTB, 38400 Saint Martin d\'Hères. Accès : 38400 St Martin d’Hères. Courrier : 38400 Saint-Martin-d’Hères.', analyse: { clientName: 'le CSTB' } } as any);
    expect(prep.variables.VILLE.valeur).toEqual(["Saint Martin d'Hères"]);
  });
  it('« doit être précisé par GSS » devient un emplacement [À COMPLÉTER] avec sa question exacte', () => {
    const p = perimetreSecours('- Levée de doute : oui, sur appel de la télésurveillance ; elle comprend vérifications et compte rendu ; le délai d’intervention doit être précisé par GSS.');
    expect(p).toBe('- Levée de doute : oui, sur appel de la télésurveillance ; elle comprend vérifications et compte rendu ; délai d’intervention : [À COMPLÉTER : Levée de doute : quel délai d’intervention GSS annonce-t-elle ?].');
    const sections: Record<string, string> = { b1: `## Le périmètre\n\n${p}` };
    const r = poserReperes(sections, ['b1']);
    expect(r.enPlace[0].question).toBe('Levée de doute : quel délai d’intervention GSS annonce-t-elle ?');
    expect(sections.b1).not.toMatch(/précisé par GSS/);
  });
  it('horaires : doublons du CCTP commun et du CCTP d’un campus fusionnés (ifsem)', () => {
    const h = horairesLisibles([
      '[Le site présente les caractéristiques d’accès suivantes] Les horaires d’ouverture et de fermeture du campus sont fixés de 7h30 à 19h30, du lundi au vendredi.',
      '[Campus de Thiais] Les horaires d’ouverture et de fermeture du campus sont fixés de 7h30 à 19h30 du lundi au vendredi.',
      '[Campus de Villejuif] Ronde de nuit : à effectuer à partir 20h00, et devant être terminée au plus tard à 00h00.',
      '[Campus de Thiais] Ronde de nuit : à effectuer à partir 20h00, et devant être terminée au plus tard à 00h00.',
      'Les rondes à réaliser sont les suivantes : Ronde générale : une ronde générale aléatoire à chaque vacation, à partir de 9h00.',
      'Les rondes à effectuer sont les suivantes : Ronde générale : une ronde générale aléatoire à chaque vacation, à partir de 9h00.',
    ]);
    expect(h).toEqual([
      'Les horaires d’ouverture et de fermeture du campus sont fixés de 7h30 à 19h30, du lundi au vendredi.',
      'Ronde de nuit : à effectuer à partir 20h00, et devant être terminée au plus tard à 00h00.',
      'Les rondes à réaliser sont les suivantes : Ronde générale : une ronde générale aléatoire à chaque vacation, à partir de 9h00.',
    ]);
  });
  it('horaires : tableau aplati, numéro de partie, pied de page, renvoi d’annexe et puce « o » refusés ou nettoyés (caen 475, ign, havre1)', () => {
    expect(horairesLisibles(['SITE Adresse Surface Utile Brute Horaires d’ouverture CAEN 20 rue Alfred 2820 07h00-19h00 Kastler 14000 Caen 1.2 DEBUT D’EXECUTION DES PRESTATIONS Les prestations pour le site de Caen débuteront à compter de la date de prise d’effet du marché.'])).toEqual([]);
    expect(horairesLisibles(['CCTP- Gardiennage-consultation 202617 En précision complémentaire : Du lundi au vendredi : la ronde d’ouverture de Coriolis à 6h00 est effectuée par le SSIAP 1.'])).toEqual([]);
    expect(horairesLisibles(['Horaires : du lundi au dimanche 19h00 à 7h00 (y compris jours fériés) Cf Annexe-CCTP-Plannings Permanence d’un SSIAP 1 en poste au PCS.'])).toEqual([]);
    expect(horairesLisibles(['Les horaires prévus sont : o Tous les jours, de 22h00 à 06h00.'])).toEqual(['Les horaires prévus sont : Tous les jours, de 22h00 à 06h00.']);
    expect(horairesLisibles(['Pour le lot n° 2 : 1- Pour les jardins suspendus : o Du 1 er avril au 31 octobre fermeture effective après évacuation 20h00.'])).toEqual(['Pour le lot n° 2 : Pour les jardins suspendus : Du 1er avril au 31 octobre fermeture effective après évacuation 20h00.']);
    expect(horairesLisibles(['Horaires d’ouverture au public | Lundi au vendredi de 8h30 à 12h00 et de 13h30 à 17h00.'])).toEqual(['Horaires d’ouverture au public : Lundi au vendredi de 8h30 à 12h00 et de 13h30 à 17h00.']);
    expect(horairesLisibles(['Présentation | Le site se compose : 4 niveaux | Horaires d’ouverture au public | Lundi au vendredi de 8h30 à 12h00.'])).toEqual([]);
  });
  it('attente qui annonce une liste (« … GSS doit : ») jamais imprimée seule (ifsem)', () => {
    const t = texteSecoursBesoin({ ...base, obligations: ['Au minimum 72 heures avant la prise de service d’un agent, le titulaire doit :', 'Le titulaire intervient sous 30 minutes.'] });
    expect(t).not.toMatch(/doit :/);
    expect(t).toContain('- Le titulaire intervient sous 30 minutes.');
  });
  it.skipIf(!aCorpus('ifsem'))('ifsem : chaque horaire du DCE une seule fois', () => {
    const h = horairesLisibles(horairesImposes(DCE('ifsem'), 15));
    expect(h.filter((x) => /7h30 à 19h30/.test(x))).toHaveLength(1);
    expect(h.filter((x) => /^Ronde de nuit : à effectuer à partir 20h00/.test(x))).toHaveLength(1);
  });
});
