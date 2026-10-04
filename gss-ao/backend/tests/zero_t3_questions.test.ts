// Campagne « zéro défaut », tour 3 : questions à GSS (T3-CONS-13).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { questionsDesEmplacements, libelleDuRepere } from '../src/generation/completion';
import { questionExacte } from '../src/generation/memoire_generator';

describe('question d’un emplacement « [À COMPLÉTER] » tirée de sa phrase (T3-CONS-13)', () => {
  it('imm 1353 : le chef de poste, jamais le début du paragraphe', () => {
    const p = "Nous vous présentons les collaborateurs de GSS chargés des missions de contrôle du marché de l'IMM. MARCHANI Adil, responsable de marché, est l'interlocuteur unique. Le chef de poste sur le terrain est [À COMPLÉTER].";
    expect(libelleDuRepere(p)).toBe('Le chef de poste sur le terrain');
    const q = questionsDesEmplacements({ b5_equipe_controle: p }, [])[0].question;
    expect(questionExacte(q)).toBe('Qui sera le chef de poste sur le terrain pour ce marché (nom, fonction et téléphone) ?');
  });
});
