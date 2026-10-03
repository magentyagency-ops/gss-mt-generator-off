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

import { completerDelaisCadre } from '../src/generation/memoire_type_cadre';
import { questionDelaiInapplicable } from '../src/generation/base_memoires';

describe('critère du cadre qui demande les délais d’intervention (T5N-2, etampes1 592)', () => {
  const Q = 'Délais d’interventions proposés par le candidat concernant : Une action d’intervention courante ; Une action d’urgence lié à un débordement';
  const T = "Une action d’intervention courante\nÀ réception du bon de commande, GSS récapitule précisément le besoin, puis planifie les agents nécessaires.\n\nUne action d’urgence liée à un débordement\nLa permanence opérationnelle de GSS est organisée 24 h/24 et 7 j/7 afin de recevoir les demandes urgentes de la Mairie.";
  it('sous-point sans durée : « Délai proposé … : [À COMPLÉTER]. » et sa question exacte à GSS', () => {
    const r = completerDelaisCadre(T, Q, { client: "la Mairie d'Etampes", horsNormandie: true });
    expect(r.texte).toContain('planifie les agents nécessaires.\nDélai proposé pour une action d’intervention courante : [À COMPLÉTER].');
    expect(r.texte).toMatch(/demandes urgentes de la Mairie\.\nDélai proposé pour une action d’urgence liée à un débordement : \[À COMPLÉTER\]\.$/);
    expect(r.ajouts[1].question).toBe("Pour le marché de la Mairie d'Etampes (hors Normandie, où GSS n'a annoncé aucun délai chiffré), quel délai GSS annonce-t-elle pour une action d’urgence liée à un débordement, entre l'appel de l'acheteur et l'arrivée des agents sur site ?");
    expect(questionDelaiInapplicable(r.ajouts[0].question, '', true)).toBe(false);
  });
  it('durée ou emplacement déjà présents : rien n’est ajouté ; autre critère : rien', () => {
    expect(completerDelaisCadre(T.replace('nécessaires.', 'nécessaires sous 48 heures.').replace('Mairie.', 'Mairie : [À COMPLÉTER].'), Q).ajouts).toEqual([]);
    expect(completerDelaisCadre(T, 'Méthodologie de mise en place').ajouts).toEqual([]);
  });
});

import { consultationAdaptation } from '../src/generation/reponse_libre_v2';
import { consultationsAdaptations } from '../src/generation/adaptations_cctp';
describe('phrase adaptée citée dans les consultations (T5N-7)', () => {
  it('jamais coupée au milieu d’un mot', () => {
    const avant = `Le troisième niveau de contrôle est assuré par le responsable qualité, ${'qui se rend sur site et contrôle l’équipe en place, '.repeat(6)}y font le point sur la prestation dans son ensemble, à partir d’un dossier produit par GSS.`;
    const l = consultationAdaptation({ id: 'x', avant, apres: avant.replace('trimestre', 'mois'), exigence: 'réunion mensuelle' }, 'Contrôle 3');
    expect(l).not.toMatch(/ensem\b/);
    expect(l).toMatch(/… » ; phrase adaptée/);
    const c = consultationsAdaptations([{ n: 1, titre: 'Contrôle 3', origine: avant, adaptee: avant, exigence: 'x', statut: 'a_valider' } as any])[0];
    expect(c).not.toMatch(/\bensem »/);
  });
});

import { elementsSansDoublon, questionsUniques, cleDonnee } from '../src/generation/memoire_generator';
describe('même donnée demandée deux fois (T5CP-11, cstb 551)', () => {
  it('question sans emplacement retirée ; deux emplacements groupés ; une question par groupe', () => {
    const el = (cle: string, question: string, reperes: number[]) => ({ cle, question, contexte: '', statut: 'ouvert' as const, reperes });
    const e = elementsSansDoublon([
      el('Q1', 'Quel est le délai moyen maximum d’intervention sur site pour une levée de doute après appel de la télésurveillance ?', [1]),
      el('Q4', 'À quelle heure l’agent doit-il commencer la ronde d’ouverture du site pour terminer les opérations avant 07 h 20 ?', [4]),
      el('Q9', 'Quel délai GSS annonce-t-elle pour l’arrivée sur place après une alarme PTI sans réponse ?', []),
      el('Q10', 'Quel délai GSS annonce-t-elle pour l’arrivée du rondier après l’appel de la télésurveillance ?', []),
      el('Q13', 'GSS confirme-t-elle l’horaire de départ permettant l’ouverture effective à 07 h 20 ?', [5]),
    ]);
    expect(e.map((x) => x.cle)).toEqual(['Q1', 'Q4', 'Q9', 'Q13']);
    expect(e.find((x) => x.cle === 'Q4')!.groupe).toBe(e.find((x) => x.cle === 'Q13')!.groupe);
    expect(questionsUniques(e)).toHaveLength(3);
    expect(cleDonnee('Quels sont les délais de mise en place d’une commande et de mobilisation en urgence ?')).toEqual(['delai_mise_en_place', 'delai_urgence']);
    expect(cleDonnee('Combien d’agents faut-il ?')).toEqual([]);
  });
});

describe('délais du cadre : « 24 heures sur 24 » n’est pas un délai (T5N-2, etampes2 553)', () => {
  it('permanence 24 heures sur 24 sans délai : emplacement à compléter', () => {
    const r = completerDelaisCadre('À réception du bon de commande, GSS planifie les agents.\nLa permanence de GSS est organisée 24 heures sur 24 et 7 jours sur 7.', 'Délais d’interventions proposés par le candidat', { client: "la Mairie d'Etampes", horsNormandie: true });
    expect(r.texte).toMatch(/Délai proposé pour une intervention courante : \[À COMPLÉTER\]\.\nDélai proposé pour une action d'urgence : \[À COMPLÉTER\]\.$/);
    expect(r.ajouts[0].question).toMatch(/quel délai GSS annonce-t-elle pour une intervention courante, entre la réception du bon de commande/);
    expect(r.ajouts[1].question).toMatch(/pour une action d'urgence, entre l'appel de l'acheteur/);
  });
  it('questions du modèle sur la couverture du cas pratique : une seule clé', () => {
    expect(cleDonnee('Quelle réponse GSS apporte-t-elle sur ce point : « Clarifier avec la Ville la couverture des 9 heures non décrites entre les 48 heures annoncées et les 39 heures détaillées » ?')).toEqual(['couverture_cas_pratique']);
  });
});

describe('etampes1 594 : questions à GSS', () => {
  it('« Préciser à GSS … » devient une question directe ; validation du dimensionnement : une seule clé', () => {
    expect(questionExacte('Préciser à GSS le délai proposé pour une intervention courante à Étampes')).toBe('Pouvez-vous préciser le délai proposé pour une intervention courante à Étampes ?');
    expect(cleDonnee('GSS valide-t-elle le dimensionnement proposé, soit une équipe dédiée de 6 titulaires ?')).toEqual(['validation_dimensionnement']);
    expect(completerDelaisCadre('Action d’intervention courante\nÀ réception du bon de commande, GSS planifie.\n\nAction d’urgence liée à un débordement\nLa permanence est joignable.', 'Délais d’interventions proposés par le candidat concernant : Une action d’intervention courante ; Une action d’urgence lié à un débordement').ajouts[0].ligne).toBe('Délai proposé pour une action d’intervention courante : [À COMPLÉTER].');
  });
});
