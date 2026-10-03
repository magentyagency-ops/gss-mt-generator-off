// Campagne « zéro défaut », tour 1 : règles de lecture du DCE rédigé autrement (lots, délais, lieu, interdits…).
import { describe, it, expect } from 'vitest';
import { lotsDuMemoire } from '../src/generation/memoire_type';

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
