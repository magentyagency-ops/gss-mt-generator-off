// Campagne « zéro défaut », tour 2 : règles de lecture du DCE rédigé autrement (T2-GEN-3 et suivants).
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, preparerMemoireType, qualificationsDuDce } from '../src/generation/memoire_type';

const BASE = `CAHIER DES CLAUSES TECHNIQUES PARTICULIERES
Article 1 - Objet
Le présent marché a pour objet le gardiennage de l'entrepôt de la société, 12 rue de la Mare, 76800 Saint-Étienne-du-Rouvray.
Article 2 - Prestations
Un agent de sécurité assure la surveillance du site du lundi au vendredi de 7h00 à 19h00.
Article 3 - Dispositions particulières
`;

describe('une phrase qui nie une condition ne la déclenche jamais (T2-GEN-3)', () => {
  const mt = chargerMemoireType();
  const temoin = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: BASE, referents: '' } as any, { memoireType: mt });
  const rubT = new Set(temoin.plan.rubriques.map((r: any) => r.id));
  it.each([
    ['CYNOPHILE', "L'emploi d'agents cynophiles est interdit sur le site."],
    ['CYNOPHILE', "Aucun maître-chien n'est demandé dans le cadre du présent marché."],
    ['TELESURVEILLANCE', "La télésurveillance du site n'est pas comprise dans le présent marché."],
    ['ATEX', 'Le site ne comporte aucune zone ATEX.'],
    ['APR', "Aucune mission de protection rapprochée n'est attendue."],
    ['EVENEMENTIEL', 'Les manifestations culturelles organisées sur le site ne font pas partie du marché.'],
    ['SSIAP', "Les agents ne sont pas tenus d'être titulaires du SSIAP."],
    ['RONDES', "Aucune ronde n'est demandée."],
    ['REPRISE_PERSONNEL', "Le présent marché n'emporte aucune reprise du personnel en place."],
    ['REPRISE_PERSONNEL', "Le titulaire n'est pas tenu de reprendre le personnel actuel."],
    ['ACCUEIL_PUBLIC', "Le site n'accueille pas de public : aucun visiteur n'y est reçu."],
    ['VIDEOSURVEILLANCE', "Le site ne dispose d'aucune caméra de vidéosurveillance."],
  ])('%s : %s', (ind, ph) => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: `${BASE}${ph}\n`, referents: '' } as any, { memoireType: mt });
    expect(prep.indicateurs[ind]).toBeFalsy();
    expect(prep.plan.rubriques.map((r: any) => r.id).filter((id: string) => !rubT.has(id))).toEqual([]);
  });
  it('qualification niée jamais exigée ; exigence à double négation gardée', () => {
    expect(qualificationsDuDce(`${BASE}Les agents ne sont pas tenus d'être titulaires du SSIAP.\n`)).toEqual([]);
    expect(qualificationsDuDce(`${BASE}Le titulaire ne pourra pas employer d'agent qui ne soit titulaire du SSIAP 1.\n`)).toContain('SSIAP 1');
  });
  it('une affirmation déclenche toujours la rubrique', () => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: `${BASE}Le titulaire met à disposition un agent cynophile la nuit.\n`, referents: '' } as any, { memoireType: mt });
    expect(prep.indicateurs.CYNOPHILE).toBe(true);
  });
});

import { lieuDuMarche, alerteHorsZone, questionLieuInconnu } from '../src/generation/base_memoires';
import { lotsDuMemoire } from '../src/generation/memoire_type';

describe('site gardé qui est un siège ou une administration : c’est le site (T2-GEN-4)', () => {
  const corps = "\nArticle 3 - Horaires\nLe poste d'agent de sécurité est tenu du lundi au vendredi de 19h00 à 7h00.\n";
  const dce = (objet: string) => `CAHIER DES CLAUSES TECHNIQUES PARTICULIERES\nArticle 1 - Objet\n${objet}\nArticle 2 - Prestations\nLe titulaire assure la surveillance humaine des locaux.${corps}`;
  it.each([
    ['normandie', 'Le présent marché a pour objet le gardiennage du siège social de Rouen Habitat, 41 rue Jean Lecanuet, 76000 Rouen.'],
    ['normandie', 'Le marché porte sur la surveillance du siège de la CAF de la Manche, 22 rue de la Poste, 50000 Saint-Lô.'],
    ['normandie', "Le marché porte sur le gardiennage de l'hôtel de la préfecture de l'Eure, boulevard Georges Chauvin, 27000 Évreux."],
    ['normandie', "Le marché porte sur la sécurité des locaux de l'URSSAF Normandie, 22 rue Jean Lecanuet, 76000 Rouen."],
    ['normandie', 'Le marché porte sur le gardiennage du centre des finances publiques, 8 rue Daniel Huet, 14000 Caen.'],
    ['normandie', 'Le marché porte sur le gardiennage du site du Ministère des Armées, quartier Tallandier, 27000 Évreux.'],
    ['hors', "Le présent marché a pour objet le gardiennage du siège de l'office, 10 rue de la République, 69002 Lyon."],
    ['hors', "Le marché porte sur le gardiennage de la préfecture de l'Isère, 12 place de Verdun, 38000 Grenoble."],
  ])('%s : %s', (attendu, objet) => {
    const d = dce(objet);
    expect(lieuDuMarche({}, d).statut).toBe(attendu);
    expect(questionLieuInconnu({}, d)).toEqual([]);
    expect(alerteHorsZone({}, d)).toHaveLength(attendu === 'hors' ? 1 : 0);
  });
  it('une adresse de recours, de facturation ou d’identification reste administrative', () => {
    const d = "REGLEMENT DE LA CONSULTATION\nPouvoir adjudicateur : Préfecture de l'Isère, 12 place de Verdun, 38000 Grenoble\nInstance chargée des procédures de recours : Tribunal administratif de Lyon, 184 rue Duguesclin, 69003 Lyon\nCCTP\nLe marché porte sur le gardiennage de la sous-préfecture, 2 rue de la Paix, 76600 Le Havre.\n";
    expect(lieuDuMarche({}, d).statut).toBe('normandie');
    expect(alerteHorsZone({}, d)).toEqual([]);
  });
});

describe('Le Havre écrit « du Havre », « au Havre » ou en adresse Cedex (T2-COH-4)', () => {
  it.each([
    ["CCTP\nLe Groupe Hospitalier du Havre confie au titulaire la surveillance du site Jacques Monod. Les rondes sur le site du Havre."],
    ["REGLEMENT DE LA CONSULTATION\nPouvoir adjudicateur : Ville du Havre, Hôtel de Ville, CS 40051, 76084 LE HAVRE CEDEX\nObjet : surveillance des bâtiments de la Ville du Havre.\nCCTP\nLes prestations sont exécutées dans les bâtiments listés en annexe.\n"],
    ["CCTP\nArticle 2 - Lieu d'exécution\nLes prestations sont exécutées à l'Hôtel de Ville, 1517 place de l'Hôtel de Ville, 76084 LE HAVRE CEDEX.\n"],
  ])('%s', (d) => {
    const l = lieuDuMarche({}, d);
    expect(l.statut).toBe('normandie');
    expect(questionLieuInconnu({}, d)).toEqual([]);
    const prep: any = preparerMemoireType({ analyse: {}, dce: d, referents: '' } as any);
    expect(prep.variables.VILLE?.valeur).toEqual(['Le Havre']);
    expect(prep.indicateurs.HORS_NORMANDIE).toBe(false);
  });
});

describe('accord-cadre en plusieurs lots (T2-GEN-5, T2-COH-5)', () => {
  it('mémoire du lot normand : lieu, communes, délais et alerte du seul lot 1', () => {
    const dce = "===== PIÈCE : RC.pdf =====\nLe marché est alloti en deux lots. Lot 1 : sites normands. Lot 2 : sites lyonnais. Les candidats remettent une offre distincte pour chaque lot.\n===== PIÈCE : CCTP.pdf =====\nArticle 1 - Objet\nLe présent marché porte sur le gardiennage des agences de la mutuelle.\nLot 1 : agence de Rouen, 12 rue Jeanne d'Arc, 76000 Rouen. Un agent de sécurité du lundi au vendredi de 8h00 à 18h00. Les alarmes sont reliées à la télésurveillance du titulaire.\nLot 2 : agence de Lyon, 5 rue de la République, 69002 Lyon. Un agent de sécurité du lundi au vendredi de 8h00 à 18h00.\n===== PIÈCE : Cadre de réponse technique Lot 1.docx =====\nCadre de réponse – lot n°1\n";
    const analyse = { clientName: 'Mutuelle X', lots: [{ num: '1', perimetre: 'Agence de Rouen' }, { num: '2', perimetre: 'Agence de Lyon' }], sites: [{ name: 'Agence de Rouen', address: "12 rue Jeanne d'Arc, 76000 Rouen" }, { name: 'Agence de Lyon', address: '5 rue de la République, 69002 Lyon' }] };
    expect(lotsDuMemoire(analyse, dce).lots).toEqual(['1']);
    expect(lieuDuMarche(analyse, dce).statut).toBe('normandie');
    expect(alerteHorsZone(analyse, dce)).toEqual([]);
    const prep: any = preparerMemoireType({ analyse, dce, referents: '' } as any);
    expect(prep.variables.VILLE?.valeur).toEqual(['Rouen']);
    expect(prep.variables.DELAI_ASTREINTE?.question || '').not.toMatch(/Lyon/);
  });
  const analyse3 = { lots: [{ num: '1', perimetre: 'Surveillance' }, { num: '2', perimetre: 'SSIAP' }, { num: '3', perimetre: 'Télésurveillance' }] };
  it.each([
    'Les candidats peuvent présenter une offre pour un lot unique, pour plusieurs lots ou pour l’ensemble des lots.',
    'Chaque lot fera l’objet d’un marché unique.',
    'La prestation de télésurveillance, non allotie en 2022, est désormais le lot 3.',
  ])('mention dans un autre sens : les lots restent (%s)', (ph) => {
    const r = lotsDuMemoire(analyse3, `Le marché est décomposé en 3 lots. ${ph}`);
    expect(r.lots).toEqual(['1', '2', '3']);
    expect(r.question).toMatch(/pour quel lot ce mémoire est-il remis/);
  });
  it.each([
    'Il s’agit d’un marché de services, mono-attributaire et non alloti.',
    'Conformément au code de la commande publique, le marché n’est pas décomposé en lots.',
    'L’accord-cadre fait l’objet d’un lot unique pour le motif suivant : …',
    'Structure Lot unique Lieu d’exécution tous les sites',
  ])('affirmation de non-allotissement : aucun lot (%s)', (ph) => {
    expect(lotsDuMemoire(analyse3, ph).lots).toEqual([]);
  });
});

import { estCahierDesCharges, estPieceAdministrative, texteCctp } from '../src/generation/base_memoires';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';

describe('CCATP et descriptif technique reconnus comme cahier des charges (T2-COH-6)', () => {
  it('nom de pièce', () => {
    for (const n of ['CCATP_gardiennage_2026.pdf', 'C.C.A.T.P. surveillance', 'Cahier des clauses administratives et techniques particulières', 'Descriptif des prestations de sécurité.pdf', 'Descriptif technique.pdf']) {
      expect(estCahierDesCharges(n)).toBe(true);
      expect(estPieceAdministrative(n)).toBe(false);
    }
    expect(estCahierDesCharges('CCAP.pdf')).toBe(false);
    expect(estCahierDesCharges('Cahier des clauses administratives particulières.pdf')).toBe(false);
  });
  it('aucune fausse alerte « Aucun cahier des charges », CCATP lu en tête', () => {
    const dce = "\n\n--- Annexe 1 - plans ---\nPlans des bâtiments\n\n--- CCATP_gardiennage_2026.pdf ---\nCahier des clauses administratives et techniques particulières\nArticle 1 objet : surveillance\n";
    expect(alerteCctpAbsent(dce)).toEqual([]);
    expect(texteCctp(dce).startsWith('=== CCATP_gardiennage_2026.pdf ===')).toBe(true);
  });
});
