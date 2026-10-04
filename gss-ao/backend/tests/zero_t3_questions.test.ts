// Campagne « zéro défaut », tour 3 : questions à GSS (T3-CONS-13).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { questionsDesEmplacements, libelleDuRepere } from '../src/generation/completion';
import { questionExacte, sansQuestionsRedites } from '../src/generation/memoire_generator';
import { libellesEmplacementsNominaux, controlerProposition } from '../src/generation/reponse_libre_v2';

describe('question d’un emplacement « [À COMPLÉTER] » tirée de sa phrase (T3-CONS-13)', () => {
  it('imm 1353 : le chef de poste, jamais le début du paragraphe', () => {
    const p = "Nous vous présentons les collaborateurs de GSS chargés des missions de contrôle du marché de l'IMM. MARCHANI Adil, responsable de marché, est l'interlocuteur unique. Le chef de poste sur le terrain est [À COMPLÉTER].";
    expect(libelleDuRepere(p)).toBe('Le chef de poste sur le terrain');
    const q = questionsDesEmplacements({ b5_equipe_controle: p }, [])[0].question;
    expect(questionExacte(q)).toBe('Qui sera le chef de poste sur le terrain pour ce marché (nom, fonction et téléphone) ?');
  });
});

describe('libellé d’emplacement d’une proposition D5 à la voix de GSS (T3N-9)', () => {
  it('« Définir avec GSS le circuit… : [À COMPLÉTER] » → « Circuit… : [À COMPLÉTER] »', () => {
    expect(libellesEmplacementsNominaux("Définir avec GSS le circuit interne de validation et d'envoi des alertes écrites : [À COMPLÉTER].")).toBe("Circuit interne de validation et d'envoi des alertes écrites : [À COMPLÉTER].");
    expect(controlerProposition("Nous alertons le donneur d'ordre par écrit.\n- Préciser le délai de prise en charge : [À COMPLÉTER].").texte).not.toMatch(/Préciser|avec GSS/);
  });
});

describe('questions redites (T3N-4, T3N-6)', () => {
  const q = (question: string, i: number) => ({ question, sources: [i] });
  it('même phrase du DCE citée deux fois (mode dégradé) : une question, forme « que le mémoire ne traite pas »', () => {
    const c = "Ne facturer qu’après exécution effective ; facturer mensuellement les prestations récurrentes au dernier jour du mois échu";
    const r = sansQuestionsRedites([q(`Quelle réponse GSS apporte-t-elle sur ce point : « ${c} » ?`, 0), q(`Quelle réponse GSS apporte-t-elle sur ce point du DCE, que le mémoire ne traite pas : « ${c} » ?`, 1)]);
    expect(r.length).toBe(1);
    expect(r[0].question).toMatch(/que le mémoire ne traite pas/);
  });
  it('deux clauses de réversibilité : une seule question qui cite les deux', () => {
    const r = sansQuestionsRedites([
      q("Quelle réponse GSS apporte-t-elle sur ce point : « À l’échéance ou en cas de résiliation, coopérer à la réversibilité : participer aux réunions » ?", 0),
      q("Quelle réponse GSS apporte-t-elle sur ce point du DCE, que le mémoire ne traite pas : « À l’échéance, en cas de résiliation ou de changement de prestataire, garantir la continuité et coopérer à la passation » ?", 1),
    ]);
    expect(r.length).toBe(1);
    expect(r[0].question).toMatch(/sur ces points du DCE.*réversibilité.*passation/);
  });
  it('assurance déjà demandée avec Hiscox : la clause d’assurance citée n’est pas redemandée', () => {
    const r = sansQuestionsRedites([
      q('Votre attestation d’assurance (Hiscox, HA RCP0242762) couvre-t-elle la perte des clés ?', 0),
      q('Quelle réponse GSS apporte-t-elle sur ce point : « Souscrire une assurance couvrant la perte de clés, l’incendie et l’explosion » ?', 1),
    ]);
    expect(r.map((x: any) => x.question)).toEqual(['Votre attestation d’assurance (Hiscox, HA RCP0242762) couvre-t-elle la perte des clés ?']);
  });
  it('exigence déjà traitée par un engagement imprimé : question retirée (parc_expo 1331)', () => {
    const texteMemoire = "## Nos engagements sur les exigences du cahier des charges\n\n- GSS assurera la garde des extérieurs, effectuera des rondes régulières, préviendra et dissuadera les intrusions, interviendra ou donnera l’alerte et prendra, si nécessaire, des mesures conservatoires.";
    const r = sansQuestionsRedites([q("Quelle organisation prévoyez-vous pour que l’agent cynophile garde les extérieurs, effectue des rondes régulières, prévienne et dissuade les intrusions, intervienne ou donne l’alerte et prenne, si nécessaire, des mesures conservatoires ?", 0)], { texteMemoire });
    expect(r).toEqual([]);
  });
});
