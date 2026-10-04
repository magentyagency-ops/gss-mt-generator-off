// Tour 7 (correcteur) : questions à GSS (T7-REG-3, T7N-11, T7-COH-4).
import { describe, it, expect } from 'vitest';
import { questionExacte, definirDceDesQuestions, avecDceDesQuestions } from '../src/generation/questions_gss';

describe('DCE des questions propre à chaque génération (T7-REG-3)', () => {
  it('deux générations intercalées : chacune met ses questions en forme avec son propre DCE', async () => {
    const exigenceA = 'le titulaire doit assurer une ronde de fermeture du bâtiment C chaque soir';
    const pause = () => new Promise((r) => setTimeout(r, 5));
    const genA = avecDceDesQuestions(async () => {
      definirDceDesQuestions('CCTP du dossier A. Article 4 : Le titulaire doit assurer une ronde de fermeture du bâtiment C chaque soir à 20h.');
      await pause(); await pause();
      return questionExacte(exigenceA);
    });
    const genB = avecDceDesQuestions(async () => {
      await pause();
      definirDceDesQuestions('CCTP du dossier B. Article 2 : surveillance du parking souterrain, deux agents de 7h à 19h.');
      await pause(); await pause();
      return questionExacte(exigenceA);
    });
    const [a, b] = await Promise.all([genA, genB]);
    expect(a).toMatch(/^Exigence du DCE à laquelle le mémoire doit répondre/);
    expect(b).toMatch(/^Pouvez-vous préciser ce point/);
  });
});

import { obligationsLisibles, CLAUSE_CONTRACTUELLE, sansClauseSanction } from '../src/generation/reponse_libre_v2';
import { motifRefusEngagement, clauseContractuelleOuDuree, questionOuverte } from '../src/generation/memoire_generator';
import { figureDansLeDce, sansPropositionDeTiers } from '../src/generation/questions_gss';

describe('clauses de l’acheteur et paraphrases du DCE (T7N-7, T7N-11)', () => {
  it('clause de réexamen, facturation des détériorations : jamais un engagement ni une question à GSS', () => {
    expect(obligationsLisibles(['A compter de la date de réception de la demande, la partie destinatrice dispose d’un délai de 15 jours pour se prononcer sur les conditions de réexamen.'])).toEqual([]);
    expect(CLAUSE_CONTRACTUELLE.test('Le titulaire répond des détériorations des matériels ou locaux causées par ses agents ; la réparation ou le remplacement lui est facturé')).toBe(true);
    expect(clauseContractuelleOuDuree('l’IFITS facturera la réparation ou le remplacement au titulaire selon le tarif en vigueur')).toBe(true);
  });
  it('paraphrase d’une phrase du DCE reconnue comme venant du DCE', () => {
    definirDceDesQuestions('Article 9. Toute détérioration des matériels ou des locaux causée par les agents du titulaire engage sa responsabilité : l’IFITS facturera la réparation ou le remplacement au titulaire selon le tarif en vigueur.');
    expect(figureDansLeDce('la réparation ou le remplacement des matériels ou locaux détériorés par les agents est facturé au titulaire')).toBe(true);
    expect(figureDansLeDce('identité de l’agent affecté et disponibilité de ses titres de formation')).toBe(false);
    definirDceDesQuestions('');
  });
});

describe('question tirée d’une consigne à l’infinitif (T7-COH-4)', () => {
  it('la proposition d’un tiers après « ; » est retirée, l’infinitif coordonné reste', () => {
    expect(questionExacte('Réaliser des tests de ligne toutes les 24 heures avant la mise en service de la télésurveillance ; le nombre de tests à réaliser chaque jour est précisé par l’organisme.')).toBe('Pouvez-vous réaliser des tests de ligne toutes les 24 heures avant la mise en service de la télésurveillance ?');
    expect(questionExacte('Fournir un planning mensuel ; le planning est validé par l\'acheteur.')).toBe('Pouvez-vous fournir un planning mensuel ?');
    expect(questionOuverte('Fournir un planning mensuel ; le planning est validé par l\'acheteur.')).toBe('Pouvez-vous fournir un planning mensuel ?');
    expect(sansPropositionDeTiers('Fournir un planning mensuel ; le tenir à jour chaque semaine')).toBe('Fournir un planning mensuel ; le tenir à jour chaque semaine');
  });
});

describe('engagement sur l’organisation de l’acheteur (T7-CONS-7)', () => {
  it('la proposition sur le pôle logistique de l’acheteur est retirée, la partie de GSS reste', () => {
    const x = 'GSS s’engage à ce que le responsable et son remplaçant d’encadrement soient les interlocuteurs du CNRS et répondent aux convocations du délégué régional ou de ses représentants, et à ce que le responsable du pôle logistique soit l’interlocuteur privilégié des campus.';
    expect(sansClauseSanction(x)).toBe('GSS s’engage à ce que le responsable et son remplaçant d’encadrement soient les interlocuteurs du CNRS et répondent aux convocations du délégué régional ou de ses représentants.');
    expect(motifRefusEngagement('GSS s’engage à ce que le responsable du pôle logistique soit l’interlocuteur privilégié des campus.')).toMatch(/organisation de l'acheteur/);
  });
});
