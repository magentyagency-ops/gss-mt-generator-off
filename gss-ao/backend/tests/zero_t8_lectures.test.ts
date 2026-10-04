// Tour 8 (correcteur) : lectures sans modèle du DCE (communes, horaires, acheteur, objet, limite de pages).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { communesParCodePostal, communeLisible, lieuDuMarche, horairesImposes, alerteHorsZone, estPieceAdministrative } from '../src/generation/base_memoires';
import { horairesLisibles } from '../src/generation/reponse_libre_v2';
import { acheteurDuDce, objetDuDce, titreDuMarcheDce } from '../src/generation/memoire_type';
import { limitePagesMemoire, passagesLimitePages } from '../src/generation/format_court';

const D = path.join(__dirname, '../../_corpus_verif/_dce_textes');
const lire = (c: string) => fs.readFileSync(path.join(D, `${c}.txt`), 'utf-8');

describe('communes qui commencent par « Ville » (T8-REG-1, T8G-1) et pays après la commune (T8G-7)', () => {
  for (const c of ['14310 Villers-Bocage', '14640 Villers-sur-Mer', '50800 Villedieu-les-Poêles', '76490 Villequier', '94800 Villejuif', "59650 Villeneuve-d'Ascq", '94190 Villeneuve-Saint-Georges', "92410 Ville-d'Avray", '95700 Roissy-en-France'])
    it(c, () => expect(communesParCodePostal(`Le site est situé 3 avenue Foch ${c}.`).map((x) => x.commune)).toEqual([c.slice(6)]));
  it('« 14310 VILLERS-BOCAGE » → « Villers-Bocage »', () => expect(communesParCodePostal('Site : 14310 VILLERS-BOCAGE').map((x) => x.commune)).toEqual(['Villers-Bocage']));
  it('libellés de formulaire toujours retirés', () => {
    expect(communesParCodePostal('76000 Ville : ROUEN').map((x) => x.commune)).toEqual(['Rouen']);
    expect(communeLisible('Commune de Rouen')).toBe('Rouen');
  });
  it('pays retiré quelle que soit sa ponctuation', () => {
    for (const t of ['76000 ROUEN - France', '76000 ROUEN - FRANCE', '76000 Rouen – France', '76000 Rouen, France']) expect(communesParCodePostal(t).map((x) => x.commune)).toEqual(['Rouen']);
    expect(communesParCodePostal('76600 LE HAVRE - France').map((x) => x.commune)).toEqual(['Le Havre']);
  });
  it('ifsem : Villejuif lu', () => expect(lieuDuMarche({}, lire('ifsem')).horsNormandie).toEqual(['Villejuif', 'Thiais']));
});

describe('adresse de l’acheteur en tête d’une pièce jamais prise pour un site (T8-COH-3)', () => {
  const dce = "\n\n--- RC_AC_depots.docx ---\nSYNDICAT MIXTE DES TRANSPORTS POUR LE RHÔNE ET L'AGGLOMÉRATION LYONNAISE (SYTRAL MOBILITÉS)\n21 boulevard Vivier-Merle, 69003 Lyon\nRÈGLEMENT DE LA CONSULTATION\nObjet : accord-cadre de gardiennage\n\n--- CCTP_Lot_2_Caluire.docx ---\nCCTP – LOT N° 2 – DÉPÔT DE CALUIRE\nArticle 1 – Site\nDépôt de bus de Caluire, 12 chemin de Wette-Faya, 69300 Caluire-et-Cuire.\n";
  it('Caluire-et-Cuire seul', () => {
    expect(lieuDuMarche({}, dce).horsNormandie).toEqual(['Caluire-et-Cuire']);
    expect(alerteHorsZone({}, dce)[0]).toMatch(/^Le site du marché \(Caluire-et-Cuire\)/);
  });
});

describe('horaires imposés (T8-REG-2, T8G-3, T8G-6)', () => {
  const cctp = (ph: string) => `\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIERES\n${ph}\n`;
  it('présence continue 24h/24 d’un service : horaire imposé ; ouverture au public ou durée : non', () => {
    expect(horairesImposes(cctp('Le poste devra être couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2.'))).toHaveLength(1);
    expect(horairesImposes(cctp('Le titulaire met à disposition un chef de poste et des agents de sécurité pour assurer le gardiennage du site 7j/7, 24h/24.'))).toHaveLength(1);
    expect(horairesImposes(cctp("L’Institut est ouvert au public tous les jours durant toute l'année 24H/24H."))).toHaveLength(0);
    expect(horairesImposes(cctp('Le prestataire devra être capable de proposer des vacations d’agents de courte durée (minimum 4h).'))).toHaveLength(0);
    expect(horairesLisibles(horairesImposes(lire('becquerel'), 20, undefined, { periodes: true }))).toContain('Le poste devra être couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2.');
  });
  it('horaires de la procédure jamais imposés ; AAPC pièce administrative', () => {
    for (const ph of ["Modalités d'ouverture des offres : Date : le 13/10/26 à 09h00 Lieu : Le Havre", 'Séance d’ouverture des offres : 16/11/2026 à 10h00.', 'Une visite groupée du poste de sécurité est organisée. La visite du Campus de Mont Saint Aignan est prévue le lundi 16 mars à 10h00.', 'Les offres devront parvenir avant le 15 novembre 2026 à 12h00.'])
      expect(horairesImposes(cctp(ph))).toEqual([]);
    expect(estPieceAdministrative('MPI1876410_AAPC')).toBe(true);
  });
  it('heures « 22:00 », « 22 heures », en lettres, « 22.00 » imprimées', () => {
    for (const h of ['de 22:00 à 06:00', 'de 22 heures à 6 heures', 'de vingt-deux heures à six heures', 'de 22.00 à 06.00'])
      expect(horairesLisibles([`Le gardiennage est assuré tous les jours ${h} par un agent de sécurité.`])).toHaveLength(1);
  });
});

describe('acheteur et objet lus sans modèle (T8N-2, T8-REG-3, T8-COH-6, T8G-9)', () => {
  it('libellés de l’objet sans casse, valeur en minuscule après « : »', () => {
    for (const [l, o] of [['Objet : Gardiennage des équipements aquatiques', 'Gardiennage des équipements aquatiques'], ['OBJET : GARDIENNAGE DES ÉQUIPEMENTS AQUATIQUES', 'Gardiennage des équipements aquatiques'], ['Objet du marché : Surveillance des parkings', 'Surveillance des parkings'], ['Objet : prestations de gardiennage du musée', 'Prestations de gardiennage du musée'], ["L'accord-cadre a pour objet le gardiennage du musée.", 'Gardiennage du musée'], ['La consultation porte sur le gardiennage du musée.', 'Gardiennage du musée']])
      expect(objetDuDce(`\n\n--- RC ---\n${l}\n`)).toBe(o);
  });
  it('libellés de l’acheteur', () => {
    for (const l of ['Nom et adresse du pouvoir adjudicateur : Ville de Bolbec, place du Général de Gaulle', 'Acheteur public : Ville de Bolbec', "Maître de l'ouvrage : Ville de Bolbec", 'Organisme acheteur : Ville de Bolbec', 'Le pouvoir adjudicateur est la Ville de Bolbec.'])
      expect(acheteurDuDce(`\n\n--- RC ---\n${l}\n`)).toBe('Ville de Bolbec');
    expect(acheteurDuDce("\n\n--- RC ---\nSYNDICAT MIXTE DES TRANSPORTS POUR LE RHÔNE ET L'AGGLOMÉRATION LYONNAISE (SYTRAL MOBILITÉS)\n21 boulevard Vivier-Merle, 69003 Lyon\n")).toMatch(/^SYNDICAT MIXTE/);
  });
  it('corpus : cstb, fontainebleau, ifsem, parc_expo', () => {
    expect(acheteurDuDce(lire('cstb'))).toBe('LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT');
    expect(objetDuDce(lire('cstb'))).toBe('Réalisation de prestations de rondes de surveillance du site du CSTB Grenoble');
    expect(acheteurDuDce(lire('fontainebleau'))).toBe('Château de Fontainebleau');
    expect(objetDuDce(lire('ifsem'))).toMatch(/^Prestations de sécurité des personnes et de surveillance des biens/);
    expect(objetDuDce(lire('parc_expo'))).toMatch(/^Prestations de sécurité incendie, de sûreté, de gardiennage/);
  });
  it('titre recollé sur plusieurs lignes, jamais inachevé', () => {
    expect(titreDuMarcheDce(lire('s2e'))).toBe('Prestations de sécurité incendie et sûreté pour les lieux exploités par la SPL S2E (société public local Seine-Eure évènements)');
    expect(titreDuMarcheDce(lire('citedia'))).toMatch(/GERES PAR CITEDIA METROPOLE A RENNES$/);
    expect(titreDuMarcheDce('\n\n--- CCTP ---\nPrestations de sécurité pour les lieux de la SPL (société\n\nArticle 2\n')).toBe('');
  });
});

describe('limite de pages : citation recollée par-dessus la fin de ligne du PDF (T8-REG-4)', () => {
  it('imm', () => expect(limitePagesMemoire(passagesLimitePages(lire('imm')))?.citation).toMatch(/organisation et moyens humains \(équipe/));
});

import { controlesInopinesDe, frequenceInopinesDce } from '../src/generation/memoire_type';
describe('contrôles inopinés : une seule lecture de la fréquence (T8G-2)', () => {
  it('nombre mensuel de toutes les formes', () => {
    for (const f of ['chaque semaine', 'hebdomadaire', 'toutes les semaines', 'une fois par semaine', '1 par semaine']) expect(controlesInopinesDe(f), f).toBe('au moins quatre contrôles inopinés');
    expect(controlesInopinesDe('5 contrôles inopinés mensuels')).toBe('cinq contrôles inopinés');
    expect(controlesInopinesDe('4 par mois')).toBe('quatre contrôles inopinés');
    expect(controlesInopinesDe('quatre par mois')).toBe('quatre contrôles inopinés');
    expect(controlesInopinesDe('une fois par trimestre')).toBe('');
  });
  it('synonymes d’« inopiné » lus dans le DCE', () => {
    for (const ph of ["L'encadrement du titulaire procède à des contrôles surprises chaque semaine.", "L'encadrement du titulaire procède à des contrôles sans préavis chaque semaine.", 'Le chef de secteur passe sur le site de façon impromptue au moins une fois par semaine.'])
      expect(frequenceInopinesDce(`\n\n--- CCTP ---\n${ph}\n`)?.mensuels, ph).toBe('au moins quatre contrôles inopinés');
  });
});

import { dateDebutMarche, phraseDelaiDuDce } from '../src/generation/memoire_type';
import { obligationsChiffrees, separerIntitules } from '../src/generation/base_memoires';
describe('intitulé jamais collé à la phrase du DCE citée (T8G-4)', () => {
  it('citedia, ifsem, vitry : obligations sans leur titre', () => {
    for (const c of ['citedia', 'ifsem', 'vitry']) for (const o of obligationsChiffrees(lire(c))) expect(o.phrase, c).not.toMatch(/^(?:\d+(?:[.-]\d+)*-?\s+[A-ZÀ-Ý]|ARTICLE\s)/);
  });
  it('« ARTICLE 5 – DÉLAIS » et « 1 Intervention sur site » séparés ; liste annoncée gardée', () => {
    expect(phraseDelaiDuDce('\n\n--- CCTP ---\nARTICLE 5 – DÉLAIS\nTout agent absent est remplacé dans un délai de 2 heures.\n', 'remplacement')).toBe('Tout agent absent est remplacé dans un délai de 2 heures.');
    expect(separerIntitules('1 Intervention sur site\nLorsqu’une vérification est nécessaire, l’agent intervient.')).toBe('1 Intervention sur site\n\nLorsqu’une vérification est nécessaire, l’agent intervient.');
    expect(separerIntitules('Fournir une fiche indiquant :\nLe Nom\nLe Prénom\nLe poste')).toBe('Fournir une fiche indiquant :\nLe Nom\nLe Prénom\nLe poste');
  });
});
describe('date de début du marché (T8G-8)', () => {
  for (const ph of ['Le marché est conclu du 1er janvier 2027 au 31 décembre 2027.', 'Le marché commence à courir le 1er janvier 2027.', 'Le contrat court à compter du 1er janvier 2027.'])
    it(ph, () => expect(dateDebutMarche(ph)).toBe('1er janvier 2027'));
  it('échéance du contrat en cours : non', () => expect(dateDebutMarche('Le contrat actuel arrive à échéance le 31 décembre 2026.')).toBe(''));
});
