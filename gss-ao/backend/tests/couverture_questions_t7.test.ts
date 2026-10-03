import { describe, it, expect } from 'vitest';
import { questionDEngagement, retirerQuestionsCouvertes, motifRefusEngagement } from '../src/generation/memoire_generator';

/** Tour 7 (T7CS-7) : question du contrôle de couverture bien formée, et jamais posée sur une exigence déjà traitée. */
const PUCE = 'GSS fournira aux agents des tenues propres permettant d’identifier le nom de la société titulaire.';
describe('questions du contrôle de couverture (T7CS-7)', () => {
  it('objet introduit par une préposition : le verbe reste dans la question', () => {
    expect(/sans réponse/.test(motifRefusEngagement(PUCE))).toBe(true);
    expect(questionDEngagement(PUCE)).toBe('Que prévoyez-vous pour fournir aux agents des tenues propres permettant d’identifier le nom de la société titulaire ?');
    // Objet nominal : forme d'avant inchangée.
    expect(questionDEngagement('GSS précisera les modalités de transmission des rapports.')).toBe('Que prévoyez-vous pour répondre à cette exigence du CCTP : les modalités de transmission des rapports ?');
  });
  it('exigence déjà source d’une phrase adaptée (D8) : question retirée ; exigence non traitée : question gardée', () => {
    const q = questionDEngagement(PUCE);
    const autre = questionDEngagement('GSS transmettra le planning mensuel au responsable du site.');
    const questions = new Set([q, autre]);
    const sources = new Map([[q, PUCE], [autre, 'GSS transmettra le planning mensuel au responsable du site.']]);
    const n = retirerQuestionsCouvertes(questions, sources, ['Fournir aux agents des tenues propres permettant d’identifier le nom de la société titulaire.'], 'Texte sans rapport.');
    expect(n).toBe(1);
    expect([...questions]).toEqual([autre]);
  });
  it('exigence traitée par le texte remis : question retirée', () => {
    const p = 'GSS transmettra le planning mensuel au responsable du site.';
    const q = questionDEngagement(p);
    const questions = new Set([q]);
    retirerQuestionsCouvertes(questions, new Map([[q, p]]), [], 'Le planning mensuel est transmis au responsable du site chaque mois.');
    expect(questions.size).toBe(0);
  });
});
