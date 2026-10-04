/**
 * Tour 5, correcteur : propositions de réponse D5 et engagements (T5N-4 répétitions retirées sans laisser de pronom ni de
 * « donc » orphelin, sous-traitance niée gardée ; T5N-5 clause contractuelle jamais proposée ; T5N-6 clauses administratives
 * jamais imprimées comme engagements ; T5N-3 bloc 1 sans commentaire sur les pièces reçues).
 */
import { describe, it, expect, vi } from 'vitest';
import { controlerProposition, sansCommentairesPiecesBloc1 } from '../src/generation/reponse_libre_v2';
import { motifRefusEngagement, clauseContractuelleOuDuree } from '../src/generation/memoire_generator';
import { fondementDansDce, sansTitresEnTete } from '../src/generation/adaptations_cctp';

vi.hoisted(() => { process.env.OPENAI_API_KEY ||= 'sk-test-hors-ligne'; });

const LONG = ' Les agents sont formés au site, disposent des consignes et rendent compte au responsable de site à chaque prise de service, selon le planning établi pour la période.'.repeat(8);

describe('répétitions entre rubriques (T5N-4)', () => {
  it('phrase dont la suivante dépend (pronom, « donc ») ou qui porte le sujet de la rubrique : gardée', async () => {
    const { MemoireGenerator } = await import('../src/generation/memoire_generator');
    const gen: any = new MemoireGenerator();
    const sections: Record<string, string> = {
      q_defaillance_d_execution: `## Remplacement\n\nSi aucune prise de service n’est enregistrée 10 minutes avant le début, le responsable de site mobilise automatiquement l’agent d’astreinte. Pour les sites normands du marché, son délai d’arrivée sur site est de 60 minutes maximum. Il prend son service auprès du responsable de site.${LONG}`,
      q_sous_traitance_du_service_public: `## Exécution directe\n\nGSS n’envisage pas de recourir à la sous-traitance pour les prestations fixes ou supplémentaires. Les prestations sont donc exécutées directement par GSS, avec ses propres équipes.${LONG}`,
      b5_remplacement_imprevu: `Texte du remplacement imprévu.${LONG}`,
    };
    gen.callOpenAI = async () => JSON.stringify({ suppressions: [
      { id: 'q_defaillance_d_execution', extrait: 'Si aucune prise de service n’est enregistrée 10 minutes avant le début, le responsable de site mobilise automatiquement l’agent d’astreinte.', garde: 'b5_remplacement_imprevu' },
      { id: 'q_defaillance_d_execution', extrait: 'Pour les sites normands du marché, son délai d’arrivée sur site est de 60 minutes maximum.', garde: 'b5_remplacement_imprevu' },
      { id: 'q_sous_traitance_du_service_public', extrait: 'GSS n’envisage pas de recourir à la sous-traitance pour les prestations fixes ou supplémentaires.', garde: 'b5_remplacement_imprevu' },
    ] });
    await gen.dedoublonnerRubriques(sections, [
      { id: 'q_defaillance_d_execution', title: 'Défaillance d’exécution' }, { id: 'q_sous_traitance_du_service_public', title: 'Sous-traitance du service public' }, { id: 'b5_remplacement_imprevu', title: 'Le remplacement d’un agent absent : absence non prévue' },
    ]);
    expect(sections.q_defaillance_d_execution).toContain('Si aucune prise de service');
    expect(sections.q_defaillance_d_execution).toContain('son délai d’arrivée');
    expect(sections.q_sous_traitance_du_service_public).toContain('n’envisage pas de recourir à la sous-traitance');
  });
  it('sous-traitance niée gardée dans une proposition, sous-traitance envisagée retirée', () => {
    const r = controlerProposition('## Exécution directe\n\nGSS n’envisage pas de recourir à la sous-traitance pour les prestations. Les prestations sont donc exécutées directement par GSS. Aucune partie du service public n’est confiée à un sous-traitant. En conséquence, aucun contrat de sous-traitance n’est établi. Si une sous-traitance devait être mise en place, le sous-traitant serait informé.');
    expect(r.texte).toContain('n’envisage pas de recourir à la sous-traitance');
    expect(r.texte).toContain('aucun contrat de sous-traitance n’est établi');
    expect(r.texte).not.toContain('devait être mise en place');
  });
});

describe('clause contractuelle ou de durée (T5N-5)', () => {
  it('durée et reconduction, résiliation, facturation : jamais une proposition de réponse', () => {
    for (const e of ["Durée et reconduction de l'accord-cadre : l'accord-cadre est conclu jusqu'au 31/12/2027 et reconduit tacitement une fois.", 'Le marché peut faire l’objet d’une résiliation.', "La durée du marché est de 3 ans à compter de sa notification."]) expect(clauseContractuelleOuDuree(e)).toBe(true);
    expect(clauseContractuelleOuDuree('Le titulaire assure une ronde de fermeture à 21h30.')).toBe(false);
  });
});

describe('engagements : facultés de l\'acheteur et clauses administratives (T5N-6)', () => {
  for (const e of ['GSS exécutera les prestations similaires qui lui seront confiées par un ou plusieurs nouveaux accords-cadres, dans la limite de 3 ans.', 'GSS prendra en compte les décisions, observations ou informations faisant courir un délai qui lui seront notifiées par le profil d’acheteur.', 'GSS remettra les documents rédigés en français ou accompagnés d’une traduction en français certifiée conforme par un traducteur assermenté.', 'GSS prendra en compte le Hub Expo & Congrès, situé 26 avenue Winston Churchill à Louviers.'])
    it(e.slice(0, 60), () => expect(motifRefusEngagement(e)).not.toBe(''));
  it('un engagement de prestation reste', () => expect(motifRefusEngagement('GSS réalise une ronde de fermeture chaque soir à 21h30.')).toBe(''));
});

describe('adaptation au CCTP : silence du CCTP et exigence citée (T5N-2, T5N-13)', () => {
  it('retrait motivé par « Le CCP ne précise pas … » : jamais fondé', () => {
    expect(fondementDansDce({ type: 'retrait', extrait: 'Pour Seine-Eure évènements, nos agents porteront la tenue des agents SSIAP.', motif: 'Le CCP ne précise pas de qualification SSIAP ni de tenue spécifique pour le marché.' }, '', 'CAHIER DES CLAUSES PARTICULIÈRES Prestations de sécurité incendie et sûreté Seine-Eure évènements Tél : 0276460330. Le titulaire assure la sécurité des agents en tenue.')).toBe('');
  });
  it('exigence ramenée à la phrase qui la porte', () => {
    expect(sansTitresEnTete('Lieux d’exécution : 35000 RENNES 1.2 Durée - Délais d’exécution - Reconduction Le Marché est conclu pour une durée d’un an à compter du 01/01/2027.')).toBe('Le Marché est conclu pour une durée d’un an à compter du 01/01/2027.');
  });
});

describe('bloc 1 sans commentaire sur les pièces reçues (T5N-3)', () => {
  it('puce retirée, consultation gardée seule, flèche rattachée', () => {
    const r = sansCommentairesPiecesBloc1('## Les points de vigilance identifiés et nos réponses\n- **Dimensionnement opérationnel** : le CCP transmis ne détaille pas le dispositif poste par poste ; les effectifs ne peuvent donc pas être établis à partir de cette pièce. [À COMPLÉTER]\n[CONSULTATION REQUISE : obtenir de GSS le CCTP et le BPU]. → notre réponse : ajustement à chaque commande (bloc 5).\n- **Autre** : vigilance.\n\n→ notre réponse : « Le contrôle » (bloc 5).');
    expect(r.texte).not.toMatch(/CCP transmis|cette pièce|\[À COMPLÉTER\]/);
    expect(r.texte).toMatch(/^\[CONSULTATION REQUISE : obtenir de GSS le CCTP et le BPU\]$/m);
    expect(r.texte).toMatch(/- \*\*Autre\*\* : vigilance → notre réponse : « Le contrôle » \(bloc 5\)\./);
  });
});
