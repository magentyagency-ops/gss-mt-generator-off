// Campagne « zéro défaut », tour 3 : questions à GSS (T3-CONS-13).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { questionsDesEmplacements, libelleDuRepere } from '../src/generation/completion';
import { questionExacte } from '../src/generation/memoire_generator';
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
