// Campagne « zéro défaut », tour 1 : règles de lecture du DCE rédigé autrement (lots, délais, lieu, interdits…).
import { describe, it, expect } from 'vitest';
import { lotsDuMemoire, publierMemoire } from '../src/generation/memoire_type';

describe('numéros de lot (T1-COH-2)', () => {
  it('« N°1 », « n° 2 », « LOT N° 3 », « Lot A » : jamais « lot N »', () => {
    const lots = (nums: string[]) => lotsDuMemoire({ lots: nums.map((num, i) => ({ num, perimetre: `P${i}` })) }, 'Le RC demande une offre distincte pour chaque lot.');
    for (const nums of [['N°1', 'N°2'], ['n° 1', 'n° 2'], ['LOT N° 1', 'LOT N° 2'], ['Lot n°1', 'Lot n°2'], ['1', '2']]) {
      const r = lots(nums);
      expect(r.lots).toEqual(['1', '2']);
      expect(r.question).toMatch(/pour quel lot ce mémoire est-il remis/);
    }
    expect(lots(['Lot A', 'Lot B']).lots).toEqual(['A', 'B']);
    expect(lots(['N°3']).lots).toEqual(['3']);
  });
});

import { delaisDuDce, delaiDuDce, normaliserDelai, extraireValeursImposees, chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';
import { nombreFr, dureesEnMinutes } from '../src/generation/base_memoires';

describe('délais du DCE rédigés autrement (T1-GEN-2, T1-GEN-3, T1-GEN-12)', () => {
  const lu = (ph: string, sujet: any) => [...new Set(delaisDuDce(ph, sujet).map((d) => d.minutes))];
  it('nombres en lettres composés et heures-minutes', () => {
    expect(nombreFr('vingt-cinq')).toBe(25);
    expect(nombreFr('quatre-vingt-dix')).toBe(90);
    expect(nombreFr('soixante-quinze')).toBe(75);
    expect(nombreFr('trente et un')).toBe(31);
    expect(dureesEnMinutes('1 h 30')).toEqual([90]);
    expect(dureesEnMinutes('dans un délai de vingt-cinq minutes')).toEqual([25]);
    expect(normaliserDelai('1h30')).toBe('1 h 30');
    expect(normaliserDelai('60 minutes')).toBe('60 minutes');
    for (const [ph, m] of [
      ["Le titulaire assure le remplacement de l'agent absent dans un délai de 1h30.", 90],
      ["Le titulaire assure le remplacement de l'agent absent dans un délai de 1 h 30.", 90],
      ["Le titulaire assure le remplacement de l'agent absent dans un délai de 1,5 heure.", 90],
      ["Le titulaire assure le remplacement de l'agent absent dans un délai de quatre-vingt-dix minutes.", 90],
      ["Le titulaire assure le remplacement de l'agent absent dans un délai de 30'.", 30],
      ["Délai de remplacement d'un agent absent : 45 minutes.", 45],
      ["Le titulaire assure le remplacement de l'agent absent au maximum 45 minutes après l'appel.", 45],
    ] as Array<[string, number]>) expect(lu(ph, 'remplacement')).toEqual([m]);
    expect(lu("Le délai d'intervention sur alarme est fixé à 25 minutes.", 'alarme')).toEqual([25]);
    expect(lu("Le délai d'intervention sur alarme ne doit pas dépasser 25 minutes.", 'alarme')).toEqual([25]);
    expect(lu("En cas d'alarme intrusion, l'opérateur informe le client dans les 3 minutes ; l'intervenant arrive sur site dans un délai de 20 minutes.", 'alarme')).toEqual([20]);
  });
  it('remplacement : délai rattaché à sa proposition, « relevé », planning', () => {
    expect(lu("En cas d'absence d'un agent prévu au planning, le titulaire assure son remplacement dans un délai de 30 minutes.", 'remplacement')).toEqual([30]);
    expect(lu('Tout agent absent à sa prise de poste doit être relevé par un autre agent qualifié dans un délai de 30 minutes.', 'remplacement')).toEqual([30]);
    expect(lu("Le remplacement d'un agent doit intervenir dans un délai de 24 heures pour les absences prévisibles et dans un délai de 30 minutes pour les absences imprévues.", 'remplacement')).toEqual([30]);
    expect(lu("Les absences prévisibles (congés, formation) sont remplacées 48 heures à l'avance.", 'remplacement')).toEqual([]);
    // Défaillance générale sous 24 heures, absence imprévue sous 2 heures : le délai de l'absence imprévue.
    expect(delaiDuDce("En cas de défaillance de son personnel, quelle qu'en soit la cause, le titulaire fournit des agents de remplacement dans un délai de 24 heures. En cas d'absence imprévue d'un agent, son remplaçant devra être présent sur site dans les deux heures.", 'remplacement')).toBe('2 heures');
  });
  it('remplacement d’un agent récusé par l’acheteur (tenue, comportement) : jamais le délai de l’astreinte (T1-GEN-12)', () => {
    expect(lu("Tout agent faisant preuve d'une tenue non conforme, d'une attitude incorrecte, de retard ou d'absences répétés, de négligence, devra être remplacé dans les deux (2) heures au plus tard.", 'remplacement')).toEqual([]);
    expect(lu("Le pouvoir adjudicateur peut demander au titulaire le changement d'un agent dont il juge l'éloignement nécessaire et qui doit être remplacé dans un délai de quarante-huit (48) heures.", 'remplacement')).toEqual([]);
  });
  it('réponse exacte du modèle (en chiffres) gardée face à un délai écrit en lettres ou en heures-minutes', async () => {
    const mt = chargerMemoireType();
    for (const [variable, phrase, valeur] of [
      ['DELAI_INTERVENTION_ALARME', "En cas de déclenchement d'alarme, l'agent intervenant doit être sur site dans un délai de vingt-cinq minutes.", '25 minutes'],
      ['DELAI_PTI', "En cas d'alarme PTI non acquittée, un intervenant se rend sur place dans un délai de trente-cinq minutes.", '35 minutes'],
      ['DELAI_ASTREINTE', "En cas d'absence d'un agent prévu au planning, le titulaire assure son remplacement dans un délai de 30 minutes.", '30 minutes'],
      ['DELAI_ASTREINTE', 'Tout agent absent à sa prise de poste doit être relevé par un autre agent qualifié dans un délai de 30 minutes.', '30 minutes'],
      ['DELAI_ASTREINTE', "Le remplacement d'un agent doit intervenir dans un délai de 24 heures pour les absences prévisibles et dans un délai de 30 minutes pour les absences imprévues.", '30 minutes'],
      ['DELAI_ASTREINTE', "En cas d'absence inopinée d'un agent, le titulaire assure son remplacement dans un délai de 1 h 30.", '1 h 30'],
    ] as Array<[string, string, string]>) {
      const dce = `Marché de surveillance du site de Rouen (76000).\n\n${phrase}\n`;
      const prep = preparerMemoireType({ analyse: {}, dce, referents: '' } as any, { memoireType: mt });
      const r = await extraireValeursImposees(mt, dce, prep.variables, async () => JSON.stringify({ valeurs: [{ variable, valeur, citation: phrase }] }));
      expect(r.refusees).toEqual([]);
      expect(r.imposees[variable]?.valeur).toBe(valeur);
    }
  });
});

import { lieuDuMarche, alerteHorsZone, communesParCodePostal } from '../src/generation/base_memoires';

describe('lieu du marché : site écrit en tableau, code postal espacé, département en chiffres (T1-GEN-4, T1-GEN-8)', () => {
  const tete = (acheteur: string) => `REGLEMENT DE LA CONSULTATION\nPouvoir adjudicateur : ${acheteur}\n\nCCTP\nArticle 2 - Lieu d'exécution\n`;
  const PARIS = 'Agence centrale, 36 rue de Valmy, 93100 Montreuil';
  const ROUEN = 'Société normande de logistique, 12 quai de Boisguilbert, 76000 Rouen';
  const corps = "\nArticle 3 - Horaires\nLe poste est tenu de 19h00 à 7h00.\n";
  it('site normand, acheteur hors Normandie', () => {
    for (const site of ['Site | \nAdresse | \nCode postal | \nCommune | \nSite de Colombelles | \n3 rue Alfred Kastler | \n14460 | \nColombelles | \n',
      'Adresse du site : 3 rue Alfred Kastler, 14 460 Colombelles.', 'Les prestations sont exécutées sur le site de Colombelles (14).']) {
      expect(lieuDuMarche({}, tete(PARIS) + site + corps)).toMatchObject({ statut: 'normandie', normands: ['Colombelles'] });
    }
  });
  it('site hors Normandie, acheteur à Rouen : jamais les délais normands', () => {
    for (const site of ['Site | \nAdresse | \nCode postal | \nCommune | \nEntrepôt de Gennevilliers | \n4 route du Bassin n°6 | \n92230 | \nGennevilliers | \n',
      "Les prestations sont exécutées à l'entrepôt de Gennevilliers (92)."]) {
      expect(lieuDuMarche({}, tete(ROUEN) + site + corps)).toMatchObject({ statut: 'hors', horsNormandie: ['Gennevilliers'] });
    }
  });
  it('adresse de l’acheteur seule : lieu inconnu, jamais tranché par elle', () => {
    expect(lieuDuMarche({}, tete(ROUEN) + 'Le site est décrit en annexe.' + corps).statut).toBe('inconnu');
  });
  it('alerte hors zone : code espacé, tableau, département en chiffres', () => {
    const t = 'REGLEMENT DE LA CONSULTATION\nPouvoir adjudicateur : Assistance publique, 80 rue Brochier, 13005 Marseille\n\nCCTP\n';
    for (const site of ["Les prestations sont exécutées à l'Hôpital Nord, chemin des Bourrely, 13 015 Marseille.",
      'Site | \nAdresse | \nCode postal | \nVille | \nHôpital Nord | \nChemin des Bourrely | \n13015 | \nMarseille | \n',
      "Les prestations sont exécutées au centre hospitalier d'Aubagne (13)."]) expect(alerteHorsZone({}, t + site).length).toBe(1);
  });
  it('jamais un montant, un nombre en lettres ni un groupe de milliers', () => {
    expect(communesParCodePostal('Total            40 000,00 €').length).toBe(0);
    expect(communesParCodePostal('Sa capacité est de 15 000 Visiteurs par jour.').length).toBe(0);
    expect(lieuDuMarche({}, "Le titulaire remet le plan dans les QUINZE (15) jours. Site : 3 rue de la Paix, 14000 Caen.").horsNormandie).toEqual([]);
  });
  it('communes imprimées : jamais le tribunal administratif ni le service comptable (T1-GEN-8)', () => {
    const dce = "CCTP\nLieu d'exécution : campus, 3 rue X, 76130 Mont-Saint-Aignan.\nVoies de recours :\nTribunal Administratif de Versailles\n56 avenue de Saint Cloud\n78010 Versailles\nComptable assignataire des paiements :\nSGC d'Ivry sur Seine\n94-96 rue Victor Hugo\n94205 Ivry-sur-Seine\n";
    const prep: any = preparerMemoireType({ analyse: {}, dce, referents: '' } as any);
    expect(prep.variables.VILLE.valeur).toEqual(['Mont-Saint-Aignan']);
  });
});

import { interditPhotosDce, RX_RONDES_A_PIED } from '../src/generation/base_memoires';

describe('interdits du CCTP écrits autrement (T1-GEN-6)', () => {
  it('photos interdites : objet et interdiction dans la même proposition, dans les deux sens', () => {
    for (const ph of ['Il est strictement interdit de photographier les locaux et les patients.', "La prise de photos est interdite dans l'enceinte de l'établissement.",
      'Il est interdit aux agents de prendre des photographies.', 'Interdiction formelle de prendre des photographies ou de filmer.',
      'Les photographies et les vidéos sont strictement interdites sur le site.', "L'usage d'appareils photographiques, y compris celui du téléphone, est interdit."]) {
      expect(interditPhotosDce(`Article 14. ${ph}`)?.photos).toBe(true);
    }
    expect(interditPhotosDce('Il est interdit de toucher au système de vidéosurveillance.')).toBeNull();
    expect(interditPhotosDce('La prise de photos, à titre personnel, est strictement interdite.')).toBeNull();
  });
  it('rondes à pied : « se font exclusivement à pied », « sont pédestres »', () => {
    for (const ph of ['Les rondes se font exclusivement à pied.', 'Toutes les rondes sont pédestres.', 'Les rondes devront impérativement être réalisées à pied.']) expect(RX_RONDES_A_PIED.test(ph)).toBe(true);
    const prep: any = preparerMemoireType({ analyse: {}, dce: 'Surveillance du site de Rouen (76000). Les rondes se font exclusivement à pied.', referents: '' } as any);
    expect(prep.indicateurs.RONDES_A_PIED).toBe(true);
    expect(publierMemoire(prep).find((r: any) => r.id === 'b4_vehicules')?.texte || '').not.toMatch(/vélo|trottinette/);
  });
});

import { qualificationsDuDce, frequenceReunionsDce, dateDebutMarche } from '../src/generation/memoire_type';
import { profilAgentSecurite } from '../src/generation/dimensionnement';
import { horairesImposes, texteCctp, estCahierDesCharges, dceCctpDAbord, obligationsChiffrees } from '../src/generation/base_memoires';

describe('qualifications écrites autrement (T1-GEN-10, T1F-13)', () => {
  it('SSIAP de niveau n, S.S.I.A.P., SSIAPn ; C.Q.P.A.D.S., TFP APS', () => {
    expect(qualificationsDuDce("Le chef d'équipe est titulaire du SSIAP niveau 2.")).toEqual(['SSIAP 2']);
    expect(qualificationsDuDce("Le chef d'équipe est titulaire du SSIAP de niveau 2.")).toEqual(['SSIAP 2']);
    expect(qualificationsDuDce('Le chef de service est titulaire du diplôme SSIAP de niveau 3.')).toEqual(['SSIAP 3']);
    expect(qualificationsDuDce("Le chef d'équipe est titulaire du S.S.I.A.P. 2.")).toEqual(['SSIAP 2']);
    expect(qualificationsDuDce('Les agents sont titulaires du C.Q.P.A.D.S. (Certificat de Qualification Professionnelle des Agents De Sécurité).')).toEqual(['CQP APS']);
    expect(qualificationsDuDce("Les agents sont titulaires du titre à finalité professionnelle d'agent de prévention et de sécurité (TFP APS).")).toEqual(['CQP APS']);
  });
  it('« Agent de sécurité (ADS) » : qualification CQP APS ; un grade entre parenthèses reste', () => {
    expect(profilAgentSecurite('Agent de sécurité (ADS)', 'Agent de sécurité (ADS)')).toBe('CQP APS');
    expect(profilAgentSecurite('ADS', 'ADS (niveau 2, échelon 2)')).toBe('ADS (niveau 2, échelon 2)');
  });
});

describe('réunions de suivi et date de début (T1-GEN-11, T1-GEN-15)', () => {
  it('fréquence d’un autre document : jamais celle des réunions', () => {
    expect(frequenceReunionsDce("Le titulaire remet chaque mois un rapport d'activité qui sert de support à la réunion de suivi.")).toBe('');
    expect(frequenceReunionsDce('Le compte rendu de chaque réunion est transmis sous huit jours. Le titulaire transmet tous les mois le planning prévisionnel, validé en réunion.')).toBe('');
    expect(frequenceReunionsDce('Une réunion de suivi est organisée tous les trimestres.')).toBe('chaque trimestre');
    expect(frequenceReunionsDce('Des réunions de suivi sont organisées tous les 3 mois.')).toBe('chaque trimestre');
    expect(frequenceReunionsDce('Une réunion de suivi sera mise en place dès le démarrage des prestations, sa périodicité sera bimestrielle.')).toBe('tous les deux mois');
    expect(frequenceReunionsDce('Les fréquences des réunions sont les suivantes : Site de Pouchet : Une fois tous les trois mois L’ensemble des autres sites : Une fois tous les mois')).toBe('');
  });
  it('date de début écrite autrement', () => {
    for (const t of ["Date prévisionnelle de début d'exécution : 1er janvier 2027.", 'Le marché prend effet le 01/01/2027.', 'Les prestations débuteront le 1er janvier 2027.', 'Début des prestations : 1er janvier 2027']) expect(dateDebutMarche(t)).toBe('1er janvier 2027');
  });
});

describe('horaires et pièces techniques (T1-GEN-13, T1-GEN-14, T1-COH-3)', () => {
  it('heures « 08:00 », « 8 heures », « huit heures », « 19.30 » ; jamais une durée', () => {
    for (const ph of ["Le poste d'accueil est ouvert du lundi au vendredi de 08:00 à 18:00.", "Le poste d'accueil est ouvert du lundi au vendredi de 8 heures à 18 heures.",
      "Le poste d'accueil est ouvert du lundi au vendredi de huit heures à dix-huit heures.", "La vacation de nuit est assurée de 19.30 à 07.30 tous les jours de l'année."]) {
      expect(horairesImposes(`\n\n--- CCTP ---\nARTICLE 3 - HORAIRES\n${ph}\n`).length).toBe(1);
    }
    expect(horairesImposes("\n\n--- CCTP ---\nLes vacations seront d'une durée minimale de 4 heures.\nLe planning des rondes ne pourra prévoir moins de quatre rondes par période de douze heures.\n").length).toBe(0);
  });
  it('cahier des charges sous tous ses noms, lu en premier', () => {
    for (const n of ['C_C_T_P_ COMMUN - LOT N°1 et N°2', 'CCP VF SECU EVEN', 'Cahierdesclausesparticulieres', 'CdC sécurité 2026', 'Prescriptions techniques', 'Spécifications techniques particulières']) expect(estCahierDesCharges(n)).toBe(true);
    for (const n of ['A_E_ - C_C_A_P_ LOT N°2', 'CCAP MP GARDIENNAGE', 'R_C']) expect(estCahierDesCharges(n)).toBe(false);
    const dce = '\n\n--- RC VF ---\nRèglement.\n\n--- CCP VF SECU EVEN ---\nLe poste est ouvert de 7h00 à 19h00. Le rapport mensuel est remis avant le 5 du mois suivant.\n\n--- 2026_04_10_ANNEXE_EGAL ---\nÉgalité.';
    expect(texteCctp(dce)).toMatch(/^=== CCP VF SECU EVEN ===/);
    expect(dceCctpDAbord(dce)).toMatch(/^\n\n--- CCP VF SECU EVEN ---/);
    const autre = '\n\n--- DCE_Gardiennage_2026 ---\nLe poste est ouvert de 7h00 à 19h00 pour la présence des agents. Le rapport mensuel est remis avant le 5 du mois suivant.';
    expect(horairesImposes(autre).length).toBe(1);
    expect(obligationsChiffrees(autre).length).toBeGreaterThan(0);
  });
});
