import { describe, it, expect } from 'vitest';
import {
  repartitionLexicale, lireRepartition, selectionnerParPriorite, selectionnerDansPartie, repartirBudget, assemblerPartie, motsPartie,
  texteBrut, candidatsReference, blocReference, referencesRetenues, fideliteReponse, rubriquesEssentielles, partiePourTexte, poidsPartie,
  sousPartieDe, QUESTION_HORS_MEMOIRE_TYPE, plafonnerEngagements, intitulePrincipal, questionHorsMemoireType, questionComprehension,
  champValeur, attribuerRubriques, blocRenvois, PIECES_ADMINISTRATIVES, type PartieRC, type RubriqueSelection,
  recalerSurReference, motsMaxChamp, SEUIL_FIDELITE_CADRE,
} from '../src/generation/memoire_type_cadre';
import { chargerMemoireType, planMemoireType, type PlanMemoireType } from '../src/generation/memoire_type';

/** Tests HORS LIGNE du cadre imposé et du format court sur le mémoire type (aucun appel au modèle). */

const mt = chargerMemoireType();
const toutVrai = Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE']));
const plan: PlanMemoireType = planMemoireType(mt, toutVrai);
const PARTIES: PartieRC[] = [
  { id: 'c1', title: 'Organisation et moyens humains', attendu: 'équipe, encadrement, organigramme, qualifications' },
  { id: 'c2', title: 'Continuité de service et remplacement des agents', attendu: 'Critère de jugement traité ici : « Délais de remplacement » (10 %)' },
  { id: 'c3', title: 'Moyens matériels et outils de suivi', attendu: '' },
  { id: 'c4', title: 'Formation, qualité et démarche RSE', attendu: '' },
  { id: 'c5', title: 'Compréhension des enjeux du CCTP et cohérence du prix', attendu: 'décomposition justificative' },
];

describe('Format court : répartition des rubriques entre les parties du RC', () => {
  it('repli lexical : chaque rubrique au plus une fois, compréhension dans la partie qui la demande', () => {
    const r = repartitionLexicale(mt, plan, PARTIES);
    const tous = Object.values(r).flat();
    expect(new Set(tous).size).toBe(tous.length);
    expect(r.c5).toContain('b1_comprehension');
    expect(r.c2).toContain('b5_remplacement_imprevu');
    expect(r.c1).toContain('b2_organigramme');
  });

  it('lecture de la réponse du modèle : ids inconnus ignorés, doublons retirés, oubliés en secondaires', () => {
    const rep = lireRepartition(JSON.stringify({ parties: [
      { id: 'c1', rubriques: ['b3_recrutement', 'b2_organigramme', 'inconnue'], non_couverts: [] },
      { id: 'c2', rubriques: ['b2_organigramme', 'b5_remplacement_imprevu'], non_couverts: ['Plan de continuité'] },
      { id: 'c9', rubriques: ['b4_rondes'] },
    ] }), mt, plan, PARTIES);
    expect(rep.source).toBe('modele');
    expect(rep.parPartie.c1.indexOf('b2_organigramme')).toBeGreaterThanOrEqual(0);
    expect(rep.parPartie.c1.indexOf('b2_organigramme')).toBeLessThan(rep.parPartie.c1.indexOf('b3_recrutement'));
    expect(rep.parPartie.c2).not.toContain('b2_organigramme');
    expect(rep.nonCouverts.c2).toEqual(['Plan de continuité']);
    expect(rep.parPartie.c5).toContain('b1_comprehension');
    expect(rep.secondaires).not.toContain('b2_organigramme');
    expect(rep.secondaires.length).toBeGreaterThan(10);
  });

  // Plan du RC d'imm (vérification 4) : ordre des éléments cités, secondaires près de leurs voisines, essentielles nettes.
  const IMM: PartieRC[] = [
    { id: 'c1', title: 'Organisation et moyens humains', attendu: 'équipe, encadrement, organigramme, qualifications' },
    { id: 'c2', title: 'Continuité de service, gestion des situations dégradées et plan de reprise du personnel', attendu: 'Critère de jugement traité ici : « Délais de remplacement et capacité de renfort » (10 %)' },
    { id: 'c3', title: 'Moyens matériels et outils de suivi / reporting', attendu: '' },
    { id: 'c4', title: 'Formation, qualité et démarche RSE', attendu: 'Critère de jugement traité ici : « Formation, qualité et démarche RSE » (10 %)' },
    { id: 'c5', title: 'Compréhension des enjeux du CCTP et cohérence du prix', attendu: 'décomposition justificative' },
  ];
  const repImm = lireRepartition(JSON.stringify({ parties: [
    { id: 'c1', rubriques: ['b2_catalogue', 'b2_organigramme', 'b3_adequation', 'b3_recrutement'] },
    { id: 'c2', rubriques: ['b3_reprise_personnel', 'b5_remplacement_prevu', 'b5_remplacement_imprevu'] },
    { id: 'c3', rubriques: ['b4_tenues', 'b4_communication', 'b4_main_courante'] },
    { id: 'c4', rubriques: ['b2_ecologie_mobilite_numerique', 'b3_formation_ads', 'b5_controle_trois_niveaux'] },
    { id: 'c5', rubriques: ['b1_comprehension'] },
  ] }), mt, plan, IMM);

  it('rubriques d\'une partie dans l\'ordre des éléments cités par le RC (formation, puis qualité, puis RSE)', () => {
    const c4 = repImm.parPartie.c4;
    expect(c4.indexOf('b3_formation_ads')).toBeLessThan(c4.indexOf('b5_controle_trois_niveaux'));
    expect(c4.indexOf('b5_controle_trois_niveaux')).toBeLessThan(c4.indexOf('b2_ecologie_mobilite_numerique'));
    const c2 = repImm.parPartie.c2;
    expect(c2.indexOf('b5_remplacement_prevu')).toBeLessThan(c2.indexOf('b3_reprise_personnel'));
  });

  it('rubrique secondaire placée près de sa voisine (tenues réglementaires avec les tenues)', () => {
    expect(repImm.secondaires).toContain('b4_tenues_reglementaires');
    expect(repImm.parPartie.c3).toContain('b4_tenues_reglementaires');
    expect(repImm.parPartie.c3.indexOf('b4_tenues_reglementaires')).toBe(repImm.parPartie.c3.indexOf('b4_tenues') + 1);
  });

  it('rubrique essentielle : pas sur un seul mot courant à égalité (« renfort »), jamais une secondaire', () => {
    const e2 = rubriquesEssentielles(mt, IMM[1], repImm.parPartie.c2, repImm.secondaires);
    expect(e2.has('b5_evenementiel')).toBe(false);
    expect(e2.has('b5_commande_supplementaire')).toBe(false);
    expect(e2.has('b3_reprise_personnel')).toBe(true);
    expect(rubriquesEssentielles(mt, IMM[3], repImm.parPartie.c4, repImm.secondaires).has('b2_ecologie_mobilite_numerique')).toBe(true);
    const ids = plan.rubriques.map((r) => r.id);
    expect(rubriquesEssentielles(mt, IMM[1], ids, ['b5_remplacement_prevu', 'b5_remplacement_imprevu']).has('b5_remplacement_prevu')).toBe(false);
  });

  it('réponse illisible : repli lexical complet', () => {
    expect(lireRepartition('pas du JSON', mt, plan, PARTIES).source).toBe('lexical');
  });

  it('rubriques essentielles : un élément cité par le RC garde sa rubrique', () => {
    const ids = plan.rubriques.map((r) => r.id);
    const e = rubriquesEssentielles(mt, PARTIES[3], ids);
    expect([...e].some((id) => /ecologie/.test(id))).toBe(true);
    expect(rubriquesEssentielles(mt, PARTIES[0], ids).has('b2_organigramme')).toBe(true);
  });

  it('partie la plus proche et pondération', () => {
    expect(partiePourTexte(PARTIES, 'Remplacement d\'un agent absent sous 2 heures').id).toBe('c2');
    expect(poidsPartie(PARTIES[1])).toBe(10);
    expect(poidsPartie({ id: 'x', title: 'x', attendu: 'a (20 %) et b (10 %)' })).toBe(30);
  });
});

describe('Format court : sélection par priorité, jamais de réécriture', () => {
  const texteSP = '**Introduction**\nUn deux trois quatre cinq.\n\n**Sous-partie A**\nalpha beta gamma delta epsilon zeta eta theta.\n\n**Sous-partie B**\niota kappa lambda mu nu xi omicron pi.';
  const sp = [{ titre: 'Introduction', priorite: 1 }, { titre: 'Sous-partie A', priorite: 3 }, { titre: 'Sous-partie B', priorite: 2 }];
  const rubriques: RubriqueSelection[] = [
    { id: 'r1', titre: 'Essentielle', priorite: 1, sousParties: [], texte: 'Texte essentiel de GSS en dix mots pour ce test précis.' },
    { id: 'r2', titre: 'Avec sous-parties', priorite: 2, sousParties: sp, texte: texteSP },
    { id: 'r3', titre: 'Secondaire', priorite: 3, sousParties: [], texte: 'Une rubrique secondaire de GSS assez longue pour peser dans le budget.' },
    { id: 'r4', titre: 'Faute de mieux', priorite: 4, sousParties: [], texte: 'Rubrique placée faute de mieux par le repli lexical du format court.' },
  ];

  it('retire dans l’ordre : rubrique 4, sous-parties 3, rubriques 3, sous-parties 2, rubriques 2 ; jamais une priorité 1', () => {
    const r = selectionnerParPriorite(rubriques, 0);
    expect(r.retraits).toEqual(['Faute de mieux', 'Avec sous-parties › Sous-partie A', 'Secondaire', 'Avec sous-parties › Sous-partie B', 'Avec sous-parties']);
    expect(r.gardees).toEqual(['r1']);
    expect(r.textes.r1).toBe(rubriques[0].texte);
  });

  it('s’arrête dès que le budget est tenu, textes gardés mot pour mot', () => {
    const total = motsPartie(rubriques);
    const r = selectionnerParPriorite(rubriques, total - 5);
    expect(r.retraits).toEqual(['Faute de mieux']);
    expect(r.textes.r2).toBe(texteSP);
  });

  it('« garder » protège la rubrique entière, pas ses sous-parties secondaires', () => {
    const r = selectionnerParPriorite([{ ...rubriques[1], garder: true, priorite: 3 }], 0);
    expect(r.gardees).toEqual(['r2']);
    expect(r.textes.r2).not.toContain('Sous-partie A');
    expect(r.textes.r2).toContain('Introduction');
  });

  it('dans une partie assemblée : blocs inconnus (engagements, propositions) gardés', () => {
    const partie = `${assemblerPartie(rubriques.map((x) => ({ titre: x.titre, texte: x.texte })))}\n\n## Nos engagements sur les exigences du cahier des charges\n\n- Engagement chiffré.`;
    const r = selectionnerDansPartie(partie, rubriques.map((x) => ({ titre: x.titre, priorite: x.priorite, sousParties: x.sousParties })), 0);
    expect(r.texte).toContain('## Essentielle');
    expect(r.texte).toContain('## Nos engagements sur les exigences du cahier des charges');
    expect(r.texte).not.toContain('## Secondaire');
  });

  it('titres publipostés : la sous-partie est reconnue par sa partie fixe', () => {
    expect(sousPartieDe([{ titre: "L'équipe dédiée à {{CLIENT}}", priorite: 1 }], "L'équipe dédiée à la Mairie d'Etampes")?.priorite).toBe(1);
  });

  it('engagements plafonnés et pièces administratives écartées', () => {
    const t = `Texte de GSS.\n\n## Nos engagements sur les exigences du cahier des charges\n\n${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `- Engagement ${n}.`).join('\n')}`;
    const p = plafonnerEngagements(t, 6);
    expect(p.match(/^- /gm)).toHaveLength(6);
    expect(p.startsWith('Texte de GSS.\n\n## Nos engagements')).toBe(true);
    expect(plafonnerEngagements('Sans engagements.', 6)).toBe('Sans engagements.');
    expect(PIECES_ADMINISTRATIVES.test('Assurance responsabilité civile')).toBe(true);
    expect(PIECES_ADMINISTRATIVES.test('Justificatifs travail dissimulé')).toBe(true);
    expect(PIECES_ADMINISTRATIVES.test('Remplacement d\'un agent sous 2 heures')).toBe(false);
  });

  it('budget : le volume non utilisé par une partie va aux parties qui en manquent', () => {
    const b = repartirBudget({ a: 100, b: 2000, c: 2000 }, { a: 10, b: 10, c: 20 }, 3000);
    expect(b.a).toBe(150);
    expect(b.b + b.c).toBeGreaterThan(2800);
    expect(b.c).toBeGreaterThan(b.b);
  });
});

describe('Cadre imposé : texte de référence du mémoire type', () => {
  it('texte brut : sous-titres « Titre : », puces « • », tableaux en lignes, sans Markdown', () => {
    const t = texteBrut('**Les ressources de GSS**\nDerrière l’équipe.\n\n## Titre\n- point **fort**\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(t).toBe('Les ressources de GSS :\nDerrière l’équipe.\n\nTitre :\n• point fort\n\nA : B\n1 : 2');
  });

  it('candidats : rubriques proches au-dessus du seuil, aucune pour un cas pratique ou la compréhension du site', () => {
    const textes = Object.fromEntries(mt.rubriques.filter((r) => r.texte).map((r) => [r.id, r.texte!]));
    const scores = Object.fromEntries(Object.keys(textes).map((id) => [id, id === 'b5_remplacement_imprevu' ? 0.65 : id === 'b5_remplacement_prevu' ? 0.63 : 0.3]));
    const c = candidatsReference(mt, textes, 'Dispositif prévu pour pallier l’absence d’un agent', { scores });
    expect(c.map((x) => x.id)).toEqual(['b5_remplacement_imprevu', 'b5_remplacement_prevu']);
    expect(c[0].cle).toBe('R1');
    expect(c[0].texte).not.toMatch(/\*\*/);
    expect(candidatsReference(mt, textes, 'Cas pratique : gardiennage d’un site municipal', { scores })).toEqual([]);
    expect(QUESTION_HORS_MEMOIRE_TYPE.test('Mise en situation appliquée')).toBe(true);
    expect(questionComprehension('1.1 - Compréhension des sujétions du site et du contrat')).toBe(true);
    expect(questionHorsMemoireType('1.1 - Compréhension des sujétions du site et du contrat')).toBe(false);
    expect(candidatsReference(mt, textes, 'Question sans rapport', { scores: Object.fromEntries(Object.keys(textes).map((id) => [id, 0.2])) })).toEqual([]);
  });

  it('hors mémoire type : intitulé principal seulement (pas un mot de la liste des éléments attendus)', () => {
    const citedia = "SOUS-CRITERE 1 ; Organisation générale, moyens humains et continuité de service – sur 30 points ; Description argumentée ; Maximum 7 pages recto ; Éléments de réponse attendus : ; Organisation générale mise en œuvre pour assurer les prestations ; Organisation et dimensionnement des équipes affectées au Marché ; Organisation des plannings";
    const caNormandie = '6 – Organisation pendant la phase de prise en charge ; 3 pages maximum ; Annexe autorisée (rétroplanning) ; Description des moyens mis œuvre au début du marché, calendrier provisoire des opérations mise en œuvre dès la notification, modalité de reprise du personnel';
    const vitry = 'CRITERE 3 : PERFORMANCE ENVIRONNEMENTALE (sur 15 points) ; ) ; DESCRIPTION DES ATTENTES DE L’ACHETEUR ; Qualité des mesures mises en œuvre par le candidat pour répondre aux enjeux environnementaux et réduire l’empreinte carbone de son activité liée au présent accord-cadre : équipements techniques, organisation des déplacements, gestion des déchets, modalités de transmission des informations, gestion des flux de données…';
    expect(intitulePrincipal(citedia)).toBe('Organisation générale, moyens humains et continuité de service – sur 30 points');
    for (const q of [citedia, caNormandie, vitry]) {
      expect(questionHorsMemoireType(q)).toBe(false);
      expect(questionComprehension(q)).toBe(false);
    }
    const textes = Object.fromEntries(mt.rubriques.filter((r) => r.texte).map((r) => [r.id, r.texte!]));
    expect(candidatsReference(mt, textes, citedia).length).toBeGreaterThan(0);
    expect(candidatsReference(mt, textes, vitry).map((c) => c.id)).toContain('b2_ecologie_energie_recyclage');
    expect(questionHorsMemoireType('SOUS CRITERE 1 : Mises en situation (sur 20 points) ; DESCRIPTION DES ATTENTES')).toBe(true);
    expect(questionHorsMemoireType('Nombre d’équipes affectées', 'Cas pratique : gardiennage d’un site municipal ; Lieu : groupe scolaire')).toBe(true);
  });

  it('champ qui demande une valeur : pas de réponse développée', () => {
    expect(champValeur('Effectif total de l’entreprise en FRANCE (transmis pour information) :')).toBe(true);
    expect(champValeur('si oui est-ce un courriel, une application dédiée, un extranet ?')).toBe(true);
    expect(champValeur('A titre d’information - Périodes neutralisées éventuelles (fermeture entreprise) :')).toBe(true);
    expect(champValeur('3.1 Les moyens humains assignés à la mission :')).toBe(false);
    expect(champValeur('Dispositif prévu pour pallier à l’absence d’un ou plusieurs agents à leur poste :')).toBe(false);
    expect(champValeur('Nombre d’équipes ; La composition des équipes (interlocuteur unique à la ville, encadrants, CV détaillés, agréments, certificats et cartes professionnelles) ; Le temps d’encadrement')).toBe(false);
    expect(champValeur('Nombre de sites gardés en Normandie :')).toBe(true);
  });

  it('une rubrique reprise dans une seule réponse du cadre ; les autres y renvoient', () => {
    const c = (id: string, score: number, lexical = 0) => ({ cle: 'R1', id, titre: id, texte: 'Texte.', score, lexical });
    const a = attribuerRubriques([
      { id: 33, libelle: '4.1 Les moyens de communication', candidats: [c('b4_communication', 0.6)] },
      { id: 34, libelle: '4.2 Fiches techniques', candidats: [c('b4_communication', 0.7), c('b4_pti', 0.66)] },
      { id: 36, libelle: '4.4 Fiches techniques', candidats: [c('b4_communication', 0.7)] },
    ]);
    expect(a.candidats.get(34)!.map((x) => [x.cle, x.id])).toEqual([['R1', 'b4_communication'], ['R2', 'b4_pti']]);
    expect(a.candidats.get(33)).toEqual([]);
    expect(a.candidats.get(36)).toEqual([]);
    expect(a.renvois.get(36)).toEqual([{ titre: 'b4_communication', libelle: '4.2 Fiches techniques' }]);
    expect(blocRenvois(a.renvois.get(33)!)).toMatch(/voir notre réponse à la question/);
    expect(blocRenvois([])).toBe('');
  });

  it('consigne et repères retenus', () => {
    const c = [{ cle: 'R1', id: 'x', titre: 'X', texte: 'Texte.', score: 0.6 }, { cle: 'R2', id: 'y', titre: 'Y', texte: 'Autre.', score: 0.58 }];
    const b = blocReference(c, { limite: true, strict: true });
    expect(b).toContain('[R1] X');
    expect(b).toContain('MOT POUR MOT');
    expect(b).toContain('limite de longueur');
    expect(blocReference([])).toBe('');
    expect(referencesRetenues(c, ['r2']).map((x) => x.id)).toEqual(['y']);
    expect(referencesRetenues(c, 'R1, R3').map((x) => x.id)).toEqual(['x']);
    expect(referencesRetenues(c, undefined)).toEqual([]);
  });

  it('fidélité : reprise mot pour mot ≥ 0,6 ; réécriture < 0,6 ; limite de longueur : part de la réponse venue du texte', () => {
    const ref = 'Nous remplaçons tout agent absent dans les deux heures qui suivent son absence. Le responsable d’exploitation prévient le client sans délai. Un agent formé au site prend le poste avec les consignes à jour.';
    expect(fideliteReponse(ref, `${ref} Une phrase ajoutée pour la question posée.`)).toBeGreaterThanOrEqual(0.99);
    expect(fideliteReponse(ref, 'En cas d’absence, notre société assure une continuité rapide et informe le client.')).toBeLessThan(0.6);
    expect(fideliteReponse(ref, 'Nous remplaçons tout agent absent dans les deux heures qui suivent son absence.', true)).toBe(1);
  });

  // Décision D7 (2 octobre 2026) : au moins 90 % du texte de GSS repris, la réponse du modèle est recalée sans nouvel appel.
  const REF_CADRE = `Nous mettons à disposition de nos équipes plusieurs types de tenues, selon les missions effectuées.
Les tenues :
• La tenue costume, pour les sites tertiaires : pantalon de costume noir, chemise blanche et veste de costume noire.
• La tenue d'intervention, pour les rondes et les interventions : pantalon treillis, chaussures de sécurité et parka.
Nos rondiers utilisent leurs véhicules de fonction : nous budgétons le remplacement, à terme, de notre flotte par une flotte 100 % électrique.
Pour l'Université de Rouen Normandie, nos agents porteront la tenue d'intervention.`;

  it('seuil de fidélité du cadre : 0,9 (décision D7)', () => {
    expect(SEUIL_FIDELITE_CADRE).toBe(0.9);
  });

  it('recalage : phrases de GSS omises remises à leur place, ajouts propres à la question gardés, fidélité 1', () => {
    const reponse = `• La tenue d'intervention, pour les rondes et les interventions : pantalon treillis, chaussures de sécurité et parka. Avec l'accord de notre interlocuteur, nous y ajoutons un gilet pare-lame.`;
    expect(fideliteReponse(REF_CADRE, reponse)).toBeLessThan(0.5);
    const r = recalerSurReference(REF_CADRE, reponse);
    expect(r.fidelite).toBe(1);
    expect(r.texte).toContain("Avec l'accord de notre interlocuteur, nous y ajoutons un gilet pare-lame.");
    // Ordre du texte de GSS : introduction, sous-titre devant son contenu, tenues, puis la suite.
    const pos = (x: string) => r.texte.indexOf(x);
    expect(pos('Nous mettons à disposition')).toBeLessThan(pos('Les tenues :'));
    expect(pos('Les tenues :')).toBeLessThan(pos('• La tenue costume'));
    expect(pos('• La tenue costume')).toBeLessThan(pos("• La tenue d'intervention"));
    expect(pos('gilet pare-lame')).toBeLessThan(pos('Nos rondiers'));
    expect(r.texte.match(/La tenue d'intervention/g)).toHaveLength(1);
  });

  it('recalage : une phrase reformulée redevient celle de GSS, sauf si elle porte un chiffre imposé par le DCE', () => {
    const ref = 'Nous remplaçons tout agent absent dans les deux heures qui suivent son absence et nous prévenons le client sans délai. Un agent formé au site prend le poste avec les consignes à jour.';
    const reformulee = 'Nous remplaçons chaque agent absent dans les deux heures suivant son absence et prévenons le client immédiatement. Un agent formé au site prend le poste avec les consignes à jour.';
    const r = recalerSurReference(ref, reformulee);
    expect(r.reformulees).toBe(1);
    expect(r.texte).toBe(ref);
    const chiffree = 'Nous remplaçons tout agent absent dans un délai de 45 minutes suivant son absence et nous prévenons le client. Un agent formé au site prend le poste avec les consignes à jour.';
    const r2 = recalerSurReference(ref, chiffree);
    expect(r2.texte).toContain('45 minutes');
    expect(r2.texte).not.toContain('deux heures');
  });

  it('recalage : les bribes d’une phrase de GSS (« En résumé, … » tronqué) sont retirées, sans redite', () => {
    const ref = 'Il peut arriver que le client ait besoin d’une prestation supplémentaire, non prévue ou de dernière minute. Les prestations supplémentaires sont contrôlées selon le même dispositif que les prestations habituelles.';
    const r = recalerSurReference(ref, 'En résumé, Il peut arriver que le client ait besoin. En résumé, Les prestations supplémentaires sont contrôlées selon le.');
    expect(r.texte).toBe(ref);
    expect(r.bribesRetirees).toBe(2);
    expect(r.fidelite).toBe(1);
  });

  it('recalage : un intitulé court de la réponse n’est pas confondu avec un sous-titre de GSS', () => {
    const ref = `La stabilité des équipes :\nNous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement.`;
    const r = recalerSurReference(ref, 'Composition des équipes\nNous privilégions la stabilité sur les sites fixes, tout en maintenant un léger roulement.');
    expect(r.texte.split('\n')[0]).toBe('Composition des équipes');
    expect(r.texte).toContain('La stabilité des équipes :');
  });

  it('recalage : une phrase de GSS contraire au DCE n’est pas remise', () => {
    const r = recalerSurReference(REF_CADRE, 'Pour l\'Université de Rouen Normandie, nos agents porteront la tenue d\'intervention.', {
      exclure: (ph) => /flotte 100 % électrique/.test(ph),
    });
    expect(r.texte).not.toContain('flotte 100 % électrique');
    expect(r.texte).not.toContain('Nos rondiers utilisent leurs véhicules de fonction');
    // La fidélité se mesure sur le texte de GSS applicable au marché (sans la phrase contraire au DCE).
    expect(r.fidelite).toBe(1);
  });

  it('recalage avec limite de mots : texte de GSS dans la limite, ajouts retirés si la fidélité reste sous 0,9', () => {
    const reponse = 'Une réponse entièrement rédigée pour la question posée, sans reprendre le texte de référence de GSS. Elle développe un autre argument propre au marché.';
    const r = recalerSurReference(REF_CADRE, reponse, { limite: true, maxMots: 60 });
    expect(r.fidelite).toBeGreaterThanOrEqual(0.9);
    expect(r.ajoutsRetires).toBeGreaterThan(0);
    expect(motsMaxChamp('Section: "1 page maximum" | Limite: "1 page(s) au total pour les 3 réponses de cette rubrique : environ 140 mots pour celle-ci, sans dépasser"')).toBe(140);
    expect(motsMaxChamp('Section: "2 pages maximum"')).toBe(840);
    expect(motsMaxChamp('Question: "Moyens humains"')).toBeUndefined();
  });
});
