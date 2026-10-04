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

import { questionSurFrequenceDuDce } from '../src/generation/memoire_generator';
import { sansConsultationsDelaiHorsNormandie } from '../src/generation/base_memoires';
import { controlerProposition, poserReperes } from '../src/generation/reponse_libre_v2';

describe('questions déjà tranchées par le DCE ou posées une fois à GSS (T7-CONS-8, T7-CONS-9)', () => {
  it('fréquence des réunions écrite dans le DCE : jamais demandée', () => {
    const dce = 'ARTICLE 6 - SUIVI. Les fréquences des réunions sont les suivantes : Site de Pouchet : Une fois tous les trois mois. L’ensemble des autres sites : Une fois tous les mois.';
    expect(questionSurFrequenceDuDce("À demander à l'acheteur : Pouvez-vous préciser la fréquence attendue des réunions de suivi pour les sites autres que Pouchet ?", dce)).toBe(true);
    expect(questionSurFrequenceDuDce('Quelle est la fréquence des réunions de suivi ?', 'Le titulaire assure le gardiennage.')).toBe(false);
  });
  it('consultation sur un délai hors Normandie retirée (question unique), jamais celle d’un emplacement', () => {
    const t = 'GSS mobilise ses équipes selon les demandes de la Ville.\n[CONSULTATION REQUISE : Confirmer avec GSS le délai de mobilisation applicable aux sites de Vitry-sur-Seine pour les commandes courantes et les demandes urgentes.]';
    expect(sansConsultationsDelaiHorsNormandie(t, true).texte).not.toMatch(/CONSULTATION/);
    expect(sansConsultationsDelaiHorsNormandie(t, false).texte).toMatch(/CONSULTATION/);
    const e = 'Délai de mise en place : [À COMPLÉTER]\n[CONSULTATION REQUISE : délai de mise en place d’une commande supplémentaire]';
    expect(sansConsultationsDelaiHorsNormandie(e, true).texte).toMatch(/CONSULTATION/);
  });
});

describe('emplacement orphelin d’une proposition (T7N-3)', () => {
  it('consultation retirée sur un délai imposé : l’emplacement seul part avec elle, aucune question « [À COMPLÉTER] »', () => {
    const dce = "En cas de déclenchement de l'alarme intrusion, le titulaire doit être en capacité d'envoyer sur le site un agent pour intervention en moins de 30 (trente) minutes.";
    const texte = "## Traçabilité et intervention\n\nÀ chaque vacation, l’agent consigne rondes et alarmes dans la main courante. En l’absence de personnel, le DCE exige l’envoi d’un agent sur place en moins de 30 minutes ; GSS intervient.\n[À COMPLÉTER]\n[CONSULTATION REQUISE : confirmer la capacité opérationnelle à envoyer un agent en moins de 30 minutes, comme l’exige le DCE.]";
    const r = controlerProposition(texte, [], dce);
    expect(r.texte).not.toMatch(/À COMPLÉTER|CONSULTATION/);
    const s: Record<string, string> = { x: '## Traçabilité et intervention\n\nTexte de GSS.\n[À COMPLÉTER]' };
    const p = poserReperes(s, ['x']);
    expect(p.enPlace).toHaveLength(0);
    expect(s.x).not.toMatch(/Traçabilité et intervention : \[À COMPLÉTER\]/);
    expect(questionExacte('Information à fournir pour compléter : « [À COMPLÉTER] »')).toBe('');
  });
});
