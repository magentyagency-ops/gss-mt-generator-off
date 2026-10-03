// Tour 5 (etampes1 592, T5N-1 et T5N-3) : consultations déjà formulées jamais réécrites par la fusion ; phrase dont GSS est le
// sujet posée en question à GSS ; garde-fou des faits nouveaux : « RAS » admis, ponctuation juste après un retrait.
import { describe, it, expect } from 'vitest';
import { MemoireGenerator, questionExacte, LIGNE_DETERMINISTE } from '../src/generation/memoire_generator';
import { controlerFaitsNouveauxCadre } from '../src/generation/memoire_type_cadre';

describe('fusion des consultations (T5N-1, T5N-3)', () => {
  it('les lignes déjà formulées sont gardées telles quelles, à leur place ; seules les autres vont au modèle', async () => {
    const envoyees: string[] = [];
    const faux = {
      callOpenAI: async (messages: any[]) => {
        envoyees.push(String(messages[1].content));
        return JSON.stringify({ questions: [{ question: 'Quels sont les délais de mise en place et d’urgence ?', sources: [1, 2] }, { question: 'Pouvez-vous joindre les CV ?', sources: [3] }, { question: 'Quel est le nom du chef de site ?', sources: [4] }] });
      },
    };
    const liste = [
      'Proposition à valider : dimensionnement calculé à partir des postes et des horaires du DCE — dispositif du cas pratique.',
      'Délai de mise en place à Étampes',
      'Délai d’urgence à Étampes',
      'Réponse « Rapport d’exécution » : la phrase « X » a été retirée (X : absent du DCE). Faut-il l’écrire, et avec quelle information exacte ?',
      'Joindre les CV des encadrants',
      'Nom du chef de site',
    ];
    const r = await (MemoireGenerator.prototype as any).consoliderAvecSourcesFusion.call(faux, liste);
    expect(envoyees[0]).not.toMatch(/Proposition à valider|Réponse «/);
    expect(r.map((x: any) => x.question)).toEqual([
      liste[0],
      'Quels sont les délais de mise en place et d’urgence ?',
      liste[3],
      'Pouvez-vous joindre les CV ?',
      'Quel est le nom du chef de site ?',
    ]);
    expect(LIGNE_DETERMINISTE.test('Réponse du cadre : la valeur « X » n’a pas été écrite')).toBe(true);
  });
  it('phrase dont GSS est le sujet : question à GSS, jamais « Exigence du DCE »', () => {
    expect(questionExacte("GSS doit valider ou modifier dans l'assistant le dimensionnement proposé pour le cas pratique")).toBe("Validez-vous le dimensionnement proposé pour le cas pratique ? Sinon, modifiez-le dans l'assistant.");
    expect(questionExacte('GSS doit préciser les délais d’intervention courante et d’urgence applicables aux sites d’Étampes')).toBe('Pouvez-vous préciser les délais d’intervention courante et d’urgence applicables aux sites d’Étampes ?');
    expect(questionExacte('Le titulaire doit fournir un rapport mensuel.')).toMatch(/^Exigence du DCE/);
  });
});

describe('garde-fou des faits nouveaux du cadre (T5N-3)', () => {
  it('« RAS » n’est pas un fait inventé', () => {
    const v = `${'Les agents notent les passages dans la main courante. '.repeat(3)}Événement type : ronde de surveillance effectuée, RAS ; toute intrusion est décrite.`;
    const r = controlerFaitsNouveauxCadre(v, 'Question: "Rapport"', { toutes: 'les agents notent les passages main courante evenement type ronde surveillance effectuee intrusion', gss: '' });
    expect(r.questions).toEqual([]);
    expect(r.texte).toContain('RAS ; toute intrusion');
  });
  it('après un retrait, jamais une phrase qui commence par une minuscule', () => {
    const v = 'Les agents tiennent le poste et notent les passages dans la main courante, sans exception aucune et en toute circonstance. Un équipement ZORGLUB est fourni ; toute intrusion est décrite dans la main courante. Le rapport est transmis à la mairie ; Le chef ZORGLUB valide. Fin du rapport transmis à la mairie.';
    const r = controlerFaitsNouveauxCadre(v, 'Question: "Rapport"', { toutes: 'les agents tiennent le poste main courante rapport mairie', gss: '' });
    expect(r.texte).toBe('Les agents tiennent le poste et notent les passages dans la main courante, sans exception aucune et en toute circonstance. Toute intrusion est décrite dans la main courante. Le rapport est transmis à la mairie. Fin du rapport transmis à la mairie.');
    expect(r.questions.length).toBe(2);
  });
});
