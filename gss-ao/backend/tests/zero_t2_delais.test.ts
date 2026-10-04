// Campagne « zéro défaut », tour 2 : délais du DCE classés d'après l'action qu'ils mesurent (T2-GEN-1), tournures courantes
// lues (T2-GEN-2), demi-heure et absence compensée (T2-COH-7).
import { describe, it, expect } from 'vitest';
import { delaisDuDce, delaiDuDce, extraireValeursImposees, chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';
import { dureesEnMinutes } from '../src/generation/base_memoires';

const lu = (ph: string, sujet: any) => [...new Set(delaisDuDce(`CCTP\nArticle 5 - Délais\n${ph}\n`, sujet).map((d) => d.minutes))];

describe('délai d’une autre action que la présence : jamais un délai d’arrivée ou de remplacement (T2-GEN-1)', () => {
  it.each([
    ['alarme', "Le compte rendu d'intervention sur alarme est transmis au client dans un délai de 24 heures."],
    ['alarme', 'Délai de prise en compte des alarmes par la station de télésurveillance : 2 minutes.'],
    ['alarme', "L'opérateur de télésurveillance acquitte l'alarme dans un délai de 2 minutes."],
    ['alarme', "Le titulaire transmet le rapport d'intervention sur alarme dans les 24 heures."],
    ['alarme', "L'agent de télésurveillance traite l'alarme dans un délai de 2 minutes."],
    ['remplacement', "Toute modification de la liste des agents (remplacement, départ, arrivée) est communiquée à l'acheteur dans un délai de 48 heures."],
    ['remplacement', "La carte professionnelle de tout agent remplaçant est transmise à l'acheteur sous 72 heures."],
    ['remplacement', 'Le titulaire informe l’acheteur sous 24 heures du remplacement d’un agent.'],
    ['remplacement', 'Le planning des remplacements est transmis dans un délai de 48 heures.'],
    ['remplacement', 'Les agents remplacent les badges perdus dans un délai de 48 heures.'],
    ['pti', 'Les alertes PTI sont enregistrées et le rapport est transmis sous 24 heures.'],
  ])('[%s] %s', (sujet, ph) => {
    expect(lu(ph, sujet)).toEqual([]);
  });
  it('dans une même phrase, seul le délai de présence est retenu', () => {
    expect(lu("En cas d'absence imprévue, le titulaire pourvoit au remplacement de l'agent en deux heures maximum ; le rapport d'incident est transmis à l'acheteur dans les 24 heures.", 'remplacement')).toEqual([120]);
    expect(lu("En cas de déclenchement d'alarme, le rondier intervient sur site en 30 minutes maximum et le rapport d'intervention est transmis dans les 24 heures.", 'alarme')).toEqual([30]);
    expect(lu("Après réception de l'alarme, l'opérateur de télésurveillance traite l'alarme dans un délai de 2 minutes puis l'agent intervient sur site en 20 minutes au plus.", 'alarme')).toEqual([20]);
    expect(lu("Toute absence doit être signalée à l'acheteur dans l'heure, et l'agent remplacé dans un délai de 2 heures.", 'remplacement')).toEqual([120]);
    // Proposition sans action : celle de la proposition qui la précède.
    expect(lu('Le titulaire met en place une astreinte permettant d’assurer le remplacement des absents dits « de dernière minute », dans un délai maximal de deux heures.', 'remplacement')).toEqual([120]);
  });
  it('la bonne réponse du modèle n’est plus refusée à cause d’un délai d’une autre action', async () => {
    const mt = chargerMemoireType();
    for (const [variable, phrase, valeur] of [
      ['DELAI_ASTREINTE', "En cas d'absence imprévue, le titulaire pourvoit au remplacement de l'agent en deux heures maximum ; le rapport d'incident est transmis à l'acheteur dans les 24 heures.", '2 heures'],
      ['DELAI_INTERVENTION_ALARME', "En cas de déclenchement d'alarme, le rondier intervient sur site en 30 minutes maximum et le rapport d'intervention est transmis dans les 24 heures.", '30 minutes'],
      ['DELAI_INTERVENTION_ALARME', "Le titulaire s'engage sur un délai d'intervention de 30 minutes après déclenchement de l'alarme ; le compte rendu est adressé au client sous 48 heures.", '30 minutes'],
      ['DELAI_INTERVENTION_ALARME', "Après réception de l'alarme, l'opérateur de télésurveillance traite l'alarme dans un délai de 2 minutes puis l'agent intervient sur site en 20 minutes au plus.", '20 minutes'],
      ['DELAI_INTERVENTION_ALARME', "En cas de déclenchement d'alarme, le rondier intervient sur site dans un délai d'une heure trente.", '1 h 30'],
    ] as Array<[string, string, string]>) {
      const dce = `Marché de surveillance du site de Rouen (76000).\n\n${phrase}\n`;
      const prep = preparerMemoireType({ analyse: {}, dce, referents: '' } as any, { memoireType: mt });
      const r = await extraireValeursImposees(mt, dce, prep.variables, async () => JSON.stringify({ valeurs: [{ variable, valeur, citation: phrase }] }));
      expect(r.refusees).toEqual([]);
      expect(r.imposees[variable]?.valeur).toBe(valeur);
    }
  });
});

describe('tournures courantes de délai lues (T2-GEN-2, T2-COH-7)', () => {
  it.each([
    ['alarme', 30, "En cas de déclenchement d'alarme, l'agent intervient sur site en 30 minutes maximum."],
    ['alarme', 30, "Le titulaire s'engage sur un délai d'intervention de 30 minutes après déclenchement de l'alarme."],
    ['alarme', 30, "Dans un délai d'intervention de 30 minutes suivant l'appel du télésurveilleur, le rondier effectue la levée de doute."],
    ['alarme', 30, 'Levée de doute sur alarme | 30 minutes'],
    ['alarme', 30, "Le rondier devra être sur place dans la demi-heure suivant le déclenchement de l'alarme."],
    ['alarme', 30, "L'intervention sur alarme doit avoir lieu moins de 30 minutes après l'appel."],
    ['alarme', 30, "Intervention sur alarme : délai d'arrivée sur site inférieur à 30 min."],
    ['alarme', 30, "Les levées de doute suite à déclenchement d'alarme seront réalisées en une demi-heure au plus."],
    ['alarme', 30, "Délai d'intervention sur alarme : ½ heure."],
    ['alarme', 30, "En cas d'alarme, l'intervention sur site a lieu dans la demi-heure qui suit l'appel."],
    ['alarme', 20, 'Le délai d’intervention sur alarme ne devra pas être supérieur à 20 minutes.'],
    ['alarme', 90, "L'agent intervient sur alarme dans un délai d'une heure trente."],
    ['remplacement', 120, "En cas d'absence imprévue, le titulaire pourvoit au remplacement de l'agent en deux heures maximum."],
    ['remplacement', 120, "En cas d'absence d'un agent, le prestataire dispose de 2 heures pour assurer son remplacement."],
    ['remplacement', 120, "Délai de remplacement d'un agent absent | 2 h"],
    ['remplacement', 60, "Toute absence d'un agent devra être compensée dans l'heure."],
  ])('[%s] %d minutes : %s', (sujet, minutes, ph) => {
    expect(lu(ph, sujet)).toEqual([minutes]);
  });
  it('durées de la citation lues comme la valeur du modèle', () => {
    expect(dureesEnMinutes('dans la demi-heure qui suit l’appel')).toEqual([30]);
    expect(dureesEnMinutes('Délai : ½ heure')).toEqual([30]);
    expect(dureesEnMinutes("dans un délai d'une heure trente")).toEqual([90]);
  });
  it('les exclusions validées restent : délai de prévenance, absence prévue, plage horaire, amplitude', () => {
    expect(lu("Pour les commandes supplémentaires, le titulaire dispose d'un délai de prévenance de 48 heures.", 'commande')).toEqual([]);
    expect(lu("Les absences prévisibles (congés, formation) sont remplacées 48 heures à l'avance.", 'remplacement')).toEqual([]);
    expect(lu("L'agent intervient sur site de 8h30 à 19h30.", 'alarme')).toEqual([]);
    expect(lu('La télésurveillance intervient en 24 heures sur 24.', 'alarme')).toEqual([]);
    expect(delaiDuDce('CCTP\nLes agents effectuent une ronde toutes les deux heures et vérifient les alarmes.\n', 'alarme')).toBe('');
  });
});
