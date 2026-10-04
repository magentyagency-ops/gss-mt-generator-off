// Tour 7 (correcteur) : lectures du DCE rédigé autrement et vérification des valeurs du modèle (T7G-2, T7G-3, T7G-4, T7G-10,
// T7N-8, T7-REG-2).
import { describe, it, expect } from 'vitest';
import {
  frequenceMensuelle, frequenceRempliePourGss, frequenceInopinesDce, controlesInopinesDe, delaisDuDce, extraireValeursImposees,
  preparerMemoireType, chargerMemoireType, envoiPlanningsClientDce, frequenceReunionsDce, phraseFrequenceReunionsDce, dateDebutMarche,
} from '../src/generation/memoire_type';
import { harmoniserJalonPlanning } from '../src/generation/reponse_libre_v2';

const MT = chargerMemoireType();
const cctp = (corps: string) => `\n\n--- CCTP gardiennage ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 1 – OBJET\nLe présent marché a pour objet des prestations de gardiennage du site, 12 rue Jeanne d'Arc, 76000 Rouen.\nARTICLE 4 – EXIGENCES\n${corps}\n`;

describe('fréquences des contrôles inopinés (T7G-2, T7G-10)', () => {
  it('formes écrites autrement ramenées au mois', () => {
    for (const [f, n] of [['contrôles inopinés quotidiens', 30], ['à raison de cinq par mois', 5], ['5/mois', 5], ['1 fois/semaine', 4.33], ['5 contrôles inopinés mensuels', 5],
      ['tous les quinze jours', 2.17], ['au moins quatre (4) par mois', 4], ['un contrôle inopiné de jour et un contrôle inopiné de nuit chaque semaine', 8.66], ['de manière hebdomadaire.', 4.33]] as Array<[string, number]>) {
      expect(frequenceMensuelle(f), f).toBeCloseTo(n, 1);
    }
    expect(frequenceMensuelle('au moins cinq contrôles inopinés', true)).toBe(5);
    expect(frequenceRempliePourGss('au moins cinq contrôles inopinés', true)).toBe(false);
    expect(frequenceRempliePourGss('5 contrôles inopinés mensuels')).toBe(false);
    expect(frequenceRempliePourGss('contrôles inopinés quotidiens')).toBe(false);
    expect(frequenceRempliePourGss('plusieurs fois par mois')).toBe(true);
    expect(controlesInopinesDe('une fois par semaine')).toBe('au moins quatre contrôles inopinés');
  });
  it('lecture sans modèle : « contrôles inopinés hebdomadaires », « au moins un contrôle de nuit par semaine, de manière inopinée »', () => {
    expect(frequenceInopinesDce(cctp('Le titulaire effectue des contrôles inopinés hebdomadaires.'))?.mensuels).toBe('au moins quatre contrôles inopinés');
    expect(frequenceInopinesDce(cctp("L'encadrement du titulaire effectue au moins un contrôle de nuit par semaine, de manière inopinée."))).not.toBeNull();
  });
  it('valeur juste du modèle acceptée et les deux variables d’accord', async () => {
    const phrase = 'Le titulaire réalise au minimum cinq contrôles inopinés par mois sur le site.';
    const dce = cctp(phrase);
    const ctx: any = { analyse: { clientName: 'Ville de Rouen' }, dce, referents: '' };
    const p0 = preparerMemoireType(ctx, { memoireType: MT } as any);
    const r = await extraireValeursImposees(MT, dce, p0.variables, async () => JSON.stringify({ valeurs: [{ variable: 'CONTROLES_INOPINES_MENSUELS', valeur: 'au moins cinq contrôles inopinés', citation: phrase }] }));
    const p = preparerMemoireType({ ...ctx, imposees: r.imposees }, { memoireType: MT } as any);
    expect(p.variables.CONTROLES_INOPINES_MENSUELS.valeur).toBe('au moins cinq contrôles inopinés');
    const h = 'Des contrôles inopinés sont réalisés par l\'encadrement du titulaire de manière hebdomadaire.';
    const r2 = await extraireValeursImposees(MT, cctp(h), p0.variables, async () => JSON.stringify({ valeurs: [{ variable: 'FREQ_CONTROLE_2', valeur: 'une fois par semaine', citation: h }] }));
    expect(r2.imposees.FREQ_CONTROLE_2?.valeur).toBe('une fois par semaine');
  });
});

describe('délais imposés (T7G-3, T7G-10)', () => {
  const lus = (sujet: any, ph: string) => delaisDuDce(cctp(ph), sujet).map((d) => d.minutes);
  it('vocabulaire de l’alarme, durées écrites autrement', () => {
    expect(lus('alarme', "Sur appel du télésurveilleur, l'intervenant se rend sur site dans un délai de 20 min.")).toEqual([20]);
    expect(lus('alarme', "Délai maximal d'arrivée sur site après déclenchement d'alarme = 30 minutes")).toEqual([30]);
    expect(lus('remplacement', "En cas d'absence d'un agent, le remplacement est assuré à H+2.")).toEqual([120]);
    expect(lus('remplacement', "Le titulaire procède au remplacement de l'agent absent dans un délai d'un jour.")).toEqual([1440]);
    expect(lus('remplacement', "En cas d'absence d'un agent, celui-ci est remplacé dans un délai d'une heure et quart.")).toEqual([75]);
    expect(lus('commande', 'Toute commande supplémentaire est honorée dans un délai de 48 heures.')).toEqual([2880]);
    expect(lus('commande', 'En cas de besoin ponctuel, le titulaire met à disposition le personnel demandé dans un délai de 24 heures.')).toEqual([1440]);
    expect(lus('alarme', "L'agent du PCR doit être informé systématiquement des interventions dans les 3 minutes qui suivent l'alerte.")).toEqual([]);
  });
  it('lecture juste du modèle acceptée sans mot-clé du sujet, jamais le délai normand à sa place', async () => {
    const ph = "Après réception d'une alerte de la station de surveillance, le rondier se rend sur place en 20 minutes.";
    const dce = cctp(ph);
    const p0 = preparerMemoireType({ analyse: { clientName: 'Ville de Rouen' }, dce, referents: '' } as any, { memoireType: MT } as any);
    const r = await extraireValeursImposees(MT, dce, p0.variables, async () => JSON.stringify({ valeurs: [{ variable: 'DELAI_INTERVENTION_ALARME', valeur: '20 minutes', citation: ph }] }));
    expect(r.imposees.DELAI_INTERVENTION_ALARME?.valeur).toBe('20 minutes');
  });
});

describe('envoi des plannings au client (T7G-4, T7N-8)', () => {
  it('formes courantes lues', () => {
    for (const [ph, j] of [['Le planning du mois suivant est transmis à la Ville le 15 du mois précédent.', 15], ['Le planning mensuel est communiqué au plus tard le 15 du mois M-1.', 15],
      ['Le planning prévisionnel est adressé au représentant de la Ville quinze jours avant le début de chaque mois.', 15], ['Les plannings sont remis à la Ville avant le 15 de chaque mois pour le mois suivant.', 15],
      ['Le titulaire transmet les plannings nominatifs du mois M+1 au plus tard à la mi-mois du mois M.', 15], ['Le planning mensuel nominatif est transmis au moins 15 jours avant sa mise en œuvre.', 15],
      ["Le planning mensuel nominatif est transmis au moins deux semaines à l'avance.", 14], ['Délai de transmission des plannings | 15 jours avant le mois concerné', 15]] as Array<[string, number]>) {
      expect(envoiPlanningsClientDce(cctp(ph))?.jours, ph).toBe(j);
    }
  });
  it('question dans l’unité du DCE, jamais « 14 jours » pour « 10 jours ouvrés »', () => {
    const dce = cctp('Le titulaire doit communiquer au service prescripteur au minimum 10 jours ouvrés avant le début du mois suivant un planning prévisionnel nominatif.');
    const p = preparerMemoireType({ analyse: { clientName: 'CNRS' }, dce, referents: '' } as any, { memoireType: MT } as any);
    expect(p.variables.JALON_ENVOI_CLIENT.question).toMatch(/au minimum 10 jours ouvrés avant le début du mois/);
    expect(p.variables.JALON_ENVOI_CLIENT.question).not.toMatch(/14 jours/);
  });
  it('jalon d’une phrase qui cite le CCTP : gardé, écart signalé', () => {
    const h = harmoniserJalonPlanning("Le planning nominatif est transmis à la Ville de Rouen à J-15, comme l'exige le CCTP.", 'J-3', 'la Ville de Rouen', 15);
    expect(h.texte).toMatch(/J-15/);
    expect(h.ecarts).toHaveLength(1);
  });
});

describe('réunions et date de début (T7G-10, T7-REG-2)', () => {
  it('réunion nommée autrement', () => {
    expect(frequenceReunionsDce(cctp('Une rencontre mensuelle est organisée entre le titulaire et la Ville.'))).toBe('chaque mois');
    expect(frequenceReunionsDce(cctp('Une revue de contrat trimestrielle est organisée.'))).toBe('chaque trimestre');
    expect(frequenceReunionsDce(cctp('Le titulaire participe à une réunion de suivi chaque lundi.'))).toBe('chaque semaine');
  });
  it('phrase citée : jamais l’intitulé de l’article avec un point ajouté', () => {
    for (const c of ["ARTICLE 7 – RÉUNIONS MENSUELLES DE SUIVI\nLe titulaire participe à une réunion de suivi organisée chaque mois par l'acheteur.\n",
      "7.2 Réunions mensuelles de suivi\nUne réunion de suivi est organisée chaque mois entre l'acheteur et le titulaire.\n",
      'a. Réunions de suivi mensuelles\nLe Titulaire participe à une réunion mensuelle de suivi organisée par le responsable sécurité.\n',
      "Article 9 - Réunion trimestrielle\nUne réunion de suivi se tient chaque trimestre dans les locaux de l'acheteur.\n"]) {
      expect(phraseFrequenceReunionsDce(c)).not.toMatch(/^(?:ARTICLE|Article|7\.2|a\.|Réunions de suivi mensuelles)/);
    }
    expect(phraseFrequenceReunionsDce('7.3 REUNIONS MENSUELLES\nLes réunions se tiennent dans les locaux.\n')).toBe('7.3 REUNIONS MENSUELLES');
  });
  it('date de début : mois abrégé, « premier », forme ISO', () => {
    expect(dateDebutMarche('Date prévisionnelle de démarrage : 1er janv. 2027.')).toBe('1er janvier 2027');
    expect(dateDebutMarche('Les prestations démarrent le premier janvier 2027.')).toBe('1er janvier 2027');
    expect(dateDebutMarche('Date prévisionnelle de début d’exécution : 2027-01-01')).toBe('1er janvier 2027');
  });
});
