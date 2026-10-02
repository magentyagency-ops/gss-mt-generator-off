// RÉPONSES SIMULÉES DU MODÈLE pour le harnais hors ligne du cadre imposé et du format court sur le mémoire type
// (aucun appel OpenAI). Chaque appel est reconnu à la signature de sa consigne ; les réponses reprennent les faits des DCE
// du corpus (imm : format court du RC, 12 pages ; etampes1 et rouen_univ : cadres de réponse .docx).
import crypto from 'crypto';

export type CorpusCC = 'imm' | 'etampes1' | 'rouen_univ' | 'ca_normandie';
export const journal: Array<{ type: string; entree: number; sortie: number }> = [];
export const inconnus: string[] = [];
/** Champs du cadre : réponses reprises (texte de référence), propositions, nouveaux essais stricts. */
export const champs: Array<{ id: number; candidats: string[]; repris: string[]; strict: boolean }> = [];

const contenu = (m: any) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((x: any) => x?.text || '').join('') : '');

const ANALYSES: Record<CorpusCC, any> = {
  imm: {
    clientName: 'Association Nouvel Institut Médico-Chirurgical Montsouris (Nouvel IMM)', projectTitle: 'Prestations de sûreté et de sécurité incendie des locaux de l\'IMM',
    marketRef: '2026-01-SECU', marketType: 'privé', clientSector: 'santé (établissement de santé recevant du public 24 h/24)', duration: '1 an reconductible 3 fois', lots: [],
    sites: [{ name: 'Institut Médico-Chirurgical Montsouris — 42 boulevard Jourdan, 75014 Paris', requirements: 'Poste permanent de sécurité incendie et de sûreté 24 h/24, 7 j/7 ; rondes de nuit entre 20h30 et 6h00' }],
    operationalSummary: { agentProfiles: 'SSIAP 1, SSIAP 2, agents de sûreté, reprise du personnel en place', uniforms: 'Tenue fournie par le titulaire', equipment: 'Contrôleur de rondes, PTI, radios', qualityControls: 'Contrôles inopinés, réunions trimestrielles' },
    telesurveillance: '', keyRisks: ['Continuité du poste 24 h/24', 'Évacuation des patients'], visitDetails: '',
  },
  etampes1: {
    clientName: "Mairie d'Etampes", projectTitle: 'Gardiennage des équipements municipaux (lot 1)', marketRef: '2026MA006', marketType: 'public', clientSector: 'collectivité territoriale',
    duration: '1 an reconductible', lots: ['Lot 1 : gardiennage'], sites: [{ name: "Équipements municipaux de la ville d'Etampes", requirements: 'Gardiennage sur bons de commande, agents et maîtres-chiens' }],
    operationalSummary: { agentProfiles: 'Agents de sécurité, maîtres-chiens', uniforms: '', equipment: 'Moyens de communication, véhicules', qualityControls: 'Rapports journaliers' },
    telesurveillance: '', keyRisks: ['Intrusions et dégradations dans un quartier prioritaire'], visitDetails: '',
  },
  ca_normandie: {
    clientName: "Cour d'appel de Rouen", projectTitle: 'Gardiennage des sites judiciaires normands (lot 1)', marketRef: 'BOP NORMAND', marketType: 'public', clientSector: 'justice',
    duration: '1 an reconductible 3 fois', lots: ['Lot 1 : sites judiciaires'], sites: [{ name: 'Palais de justice de Rouen', requirements: 'Contrôle des accès, filtrage et rondes' }],
    operationalSummary: { agentProfiles: 'Agents de sécurité, SSIAP 1', uniforms: 'Tenue réglementaire', equipment: 'Magnétomètres, radios', qualityControls: 'Contrôles et rapports' },
    telesurveillance: '', keyRisks: ['Filtrage du public', 'Continuité des postes'], visitDetails: '',
  },
  rouen_univ: {
    clientName: 'Université de Rouen Normandie', projectTitle: 'Prestations humaines de sûreté, sécurité et télésécurité', marketRef: '2026-08', marketType: 'public', clientSector: 'enseignement supérieur',
    duration: '4 ans', lots: ['Lot 1 : sites 76', 'Lot 2 : sites 27', 'Lot 3 : télésécurité'], sites: [{ name: 'Campus de Mont-Saint-Aignan', requirements: 'Postes de sécurité et rondes' }, { name: 'Campus Pasteur (Rouen)', requirements: 'Accueil et rondes' }, { name: 'Campus d\'Evreux', requirements: 'Rondes' }],
    operationalSummary: { agentProfiles: 'ADS, SSIAP 1, chefs de poste', uniforms: 'Tenue réglementaire', equipment: 'Pointeaux de ronde, PTI, téléphones', qualityControls: 'Contrôles et reporting' },
    telesurveillance: 'Télésécurité des sites (lot 3)', keyRisks: ['Rondes de protection du patrimoine', 'Levées de doute'], visitDetails: '',
  },
};

const PERIMETRE: Record<CorpusCC, string> = {
  imm: `- Postes fixes : oui. Un poste permanent de sécurité incendie et de sûreté 24 h/24, 7 j/7, au PC sécurité de l'IMM (42 boulevard Jourdan, Paris 14e).
- Rondes de nuit entre 20h30 et 6h00 ; levées de doute sur alarme.
- Hors périmètre : télésurveillance, événementiel.`,
  etampes1: `- Gardiennage ponctuel des équipements municipaux sur bons de commande, agents et maîtres-chiens.\n- Hors périmètre : poste permanent, SSIAP.`,
  ca_normandie: `- Contrôle des accès et filtrage du public au palais de justice de Rouen, rondes.\n- Hors périmètre : télésurveillance.`,
  rouen_univ: `- Postes de sécurité et rondes de protection du patrimoine sur les campus (lots 1 et 2), télésécurité (lot 3).\n- Levées de doute sur alarme.`,
};

/** Plan du RC d'imm (tel que lu lors des générations précédentes). */
const PLAN_IMM = {
  limite: true, pagesMax: 12, citation: 'un mémoire technique (douze (12) pages maximum) structuré comme suit : organisation et moyens humains (équipe, encadrement, organigramme, qualifications) ; continuité de service, gestion des situations dégradées et plan de reprise du personnel ; moyens matériels et outils de suivi / reporting ; formation, qualité et démarche RSE ; compréhension des enjeux du CCTP et cohérence du prix (décomposition justificative).',
  plan: [
    { titre: 'Organisation et moyens humains', attendu: 'équipe, encadrement, organigramme, qualifications' },
    { titre: 'Continuité de service, gestion des situations dégradées et plan de reprise du personnel', attendu: '' },
    { titre: 'Moyens matériels et outils de suivi / reporting', attendu: '' },
    { titre: 'Formation, qualité et démarche RSE', attendu: '' },
    { titre: 'Compréhension des enjeux du CCTP et cohérence du prix', attendu: 'décomposition justificative' },
  ],
  criteres: [
    { libelle: 'Moyens humains et encadrement affectés au marché', poids: '20 %', partie: 0 },
    { libelle: 'Continuité de service, gestion des situations dégradées et plan de reprise du personnel', poids: '10 %', partie: 1 },
    { libelle: 'Délais de remplacement et capacité de renfort', poids: '10 %', partie: 1 },
    { libelle: 'Moyens matériels, outils de suivi et reporting', poids: '10 %', partie: 2 },
    { libelle: 'Formation, qualité et démarche RSE', poids: '10 %', partie: 3 },
  ],
};

/** Répartition simulée des rubriques du mémoire type entre les parties du RC d'imm (ids présents dans la consigne seulement). */
const REPARTITION_IMM: Record<string, string[]> = {
  c1: ['b2_organigramme', 'b3_adequation', 'b3_interlocuteur_unique', 'b3_recrutement', 'b2_catalogue', 'b3_formation_ssiap_a'],
  c2: ['b3_reprise_personnel', 'b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b5_nouveau_marche', 'b5_mise_en_place', 'b5_nouvel_agent', 'b4_proc_incendie', 'b4_proc_victime', 'b4_proc_ordre_alerte', 'b5_defaillance_ssi'],
  c3: ['b4_communication', 'b4_pti', 'b4_rondes', 'b4_main_courante', 'b4_planification', 'b4_tenues', 'b4_equipements', 'b4_vehicules', 'b5_outils_suivi', 'b4_lmc'],
  c4: ['b3_formation_ads', 'b3_formation_ssiap_b', 'b3_formations_internes', 'b3_politique_formation', 'b5_controle_trois_niveaux', 'b5_controle_fond', 'b5_controle_technique', 'b5_controle_global', 'b5_reunions_indicateurs', 'b5_procedure_inopine', 'b5_controle_nuit', 'b5_equipe_controle', 'b2_ecologie_mobilite_numerique', 'b2_ecologie_energie_recyclage', 'b3_valeurs_sociales'],
  c5: ['b1_comprehension'],
};

function matrice(c: CorpusCC, ids: Set<string>): any[] {
  const e = (rubrique: string, theme: string, exigence: string, couverture = 'couvert', criticite = 'normal', sujet?: string) => ({ theme, rubrique, exigence, reponseGss: 'Procédure GSS documentée', couverture, criticite, ...(sujet ? { sujet } : {}) });
  const l = c === 'imm' ? [
    e('b3_adequation', 'III', 'Poste permanent de sécurité incendie et de sûreté 24 h/24, 7 j/7', 'couvert', 'bloquant'),
    e('b3_formation_ssiap_a', 'III', 'Agents titulaires du SSIAP 1 à jour, chef d\'équipe SSIAP 2', 'couvert', 'bloquant'),
    e('b4_rondes', 'IV', 'La nuit, les rondes s\'effectuent entre 20h30 et 6h00 du matin'),
    e('b5_remplacement_imprevu', 'V', 'Remplacement d\'un agent absent dans un délai de 2 heures', 'couvert', 'bloquant'),
    e('b3_reprise_personnel', 'III', 'Reprise du personnel en place selon l\'accord du 5 mars 2002'),
    e('b5_reunions_indicateurs', 'V', 'Réunion de suivi trimestrielle avec le responsable sécurité de l\'IMM'),
    e('nouvelle', 'V', 'Plan de continuité en cas de grève ou de pandémie remis au démarrage', 'écart', 'normal', 'Plan de continuité en cas de grève'),
  ] : [
    e('b3_adequation', 'III', 'Composition des équipes et interlocuteur unique à la ville'),
    e('b2_ecologie_mobilite_numerique', 'II', 'Clauses environnementales : flotte automobile, écogestes'),
  ];
  return l.filter((x) => x.rubrique === 'nouvelle' || ids.has(x.rubrique));
}

const COMPREHENSION = {
  titre_schema: 'Votre besoin, notre réponse en un process',
  texte: `**Votre contexte et votre site**\nL'Institut Médico-Chirurgical Montsouris est un établissement de santé qui reçoit du public 24 h/24, au 42 boulevard Jourdan à Paris. Les patients, les visiteurs et le personnel doivent être protégés à toute heure, et la sécurité incendie d'un établissement de soins ne tolère aucune rupture.\n\n**Le périmètre de la prestation**\nLe marché porte sur un poste permanent de sécurité incendie et de sûreté, 24 h/24 et 7 j/7, avec des rondes de nuit entre 20h30 et 6h00 et les levées de doute sur alarme. La télésurveillance et l'événementiel sont hors du périmètre.\n\n**Vos attentes et nos engagements**\nVous attendez un poste tenu sans interruption, des agents qualifiés SSIAP, un remplacement rapide en cas d'absence et un suivi régulier de la prestation. Nous nous engageons à remplacer un agent absent dans un délai de 2 heures, à reprendre le personnel en place et à vous rendre compte chaque trimestre.\n\n**Les points de vigilance identifiés**\nL'évacuation des patients, la continuité du poste lors des relèves et la reprise du personnel en place sont les trois points que nous suivons de près dès le démarrage du marché. Chaque relève fait l'objet d'une transmission écrite dans la main courante.`,
  etapes: [
    { titre: 'Votre besoin', texte: 'poste permanent 24 h/24', role: 'bleu' },
    { titre: 'Nos agents', texte: 'agents qualifiés SSIAP', role: 'bleu' },
    { titre: 'Nos rondes', texte: 'rondes de nuit', role: 'orange' },
    { titre: 'Votre résultat', texte: 'sans interruption', role: 'vert' },
  ],
};

/** Compréhension simulée du cadre ca_normandie (question « Compréhension des sujétions du site et du contrat »). */
const COMPREHENSION_CA = {
  titre_schema: 'Votre besoin, notre réponse en un process',
  texte: `## Votre contexte et votre site\nLa cour d'appel de Rouen confie à GSS le gardiennage du palais de justice de Rouen. Le site reçoit chaque jour des justiciables, des avocats et des magistrats.\n\n## Le périmètre de la prestation demandée\n| Site | Poste | Jours et horaires | Qualification | Missions principales |\n|---|---|---|---|---|\n| Palais de justice de Rouen | Filtrage | Jours ouvrés | Agent de sécurité | Contrôle des accès et filtrage du public |\n\n## Vos attentes et nos engagements\n- **Ce que vous attendez** : un filtrage sûr et courtois → notre réponse : des agents formés au filtrage et un chef de poste présent.\n- **Ce que vous attendez** : la continuité des postes → notre réponse : un remplacement organisé par notre service planning.\n\n## Les points de vigilance identifiés et nos réponses\n- **Point de vigilance** : l'affluence aux audiences → notre réponse : un renfort du filtrage aux heures d'audience.`.repeat(1),
  etapes: [
    { titre: 'Votre besoin', texte: 'Le gardiennage du palais de justice de Rouen', role: 'rouge' },
    { titre: 'Vos enjeux', texte: 'Un filtrage sûr et courtois', role: 'rouge' },
    { titre: 'Notre dispositif', texte: 'Des agents formés au filtrage', role: 'orange' },
    { titre: 'Notre pilotage', texte: 'Un chef de poste présent', role: 'bleu' },
    { titre: 'Votre résultat', texte: 'La continuité des postes', role: 'vert' },
  ],
};

/** Réécriture simulée (fidélité basse) : chaque phrase longue est résumée en sa première moitié. */
const reformuler = (t: string) => t.split(/(?<=[.!?])\s+/).map((ph) => { const m = ph.split(/\s+/); return m.length > 8 ? `En résumé, ${m.slice(0, Math.ceil(m.length / 2)).join(' ')}.` : ph; }).join(' ');

/** Lecture du DCE pour le dimensionnement (réponses réalistes ; Étampes : relevé de la sonde réelle _verif/correction9_dim_sonde.ts). */
const TOUS_LES_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const PLAGES_ETAMPES = [
  { libelle: 'Dimanche férié, 6 h–21 h', debut: '06:00', fin: '21:00' },
  { libelle: 'Nuit, 21 h–6 h', debut: '21:00', fin: '06:00' },
  { libelle: 'Lundi férié, 6 h–21 h', debut: '06:00', fin: '21:00' },
];
const DIMENSIONNEMENT: Record<CorpusCC, any> = {
  imm: {
    // Postes permanents N1, N2, N3 du CCTP (24 h/24) ; les options (« l'option 2 : 1 SSIAP 2… ») ne sont pas des postes
    // de l'équipe dédiée (génération réelle imm 16 : options relevées, 36 titulaires au lieu de 18).
    postes: [
      { profil: "Chef d'équipe / Agent N1", qualification: 'SSIAP 2, SST, carte CNAPS', lieu: 'Poste de sécurité', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '08:00', fin: '20:00' }, { jours: TOUS_LES_JOURS, debut: '20:00', fin: '08:00' }],
        citation: '1er Chef d’équipe ou agent N1 : 24h/24h au poste de sécurité' },
      { profil: 'Agent de sécurité N2', qualification: 'SSIAP 1, SST, carte CNAPS', lieu: 'Poste de sécurité', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '08:00', fin: '20:00' }, { jours: TOUS_LES_JOURS, debut: '20:00', fin: '08:00' }],
        citation: '2ème Agent de sécurité ou agent N2 : 24h/24h au poste de sécurité' },
      { profil: 'Agent de sécurité N3', qualification: 'SSIAP 1, SST, carte CNAPS', lieu: 'Poste de sécurité', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '08:00', fin: '20:00' }, { jours: TOUS_LES_JOURS, debut: '20:00', fin: '08:00' }],
        citation: '3ème Agent de sécurité ou agent N3 : 24h/24h au poste de sécurité' },
      { profil: 'SSIAP 2', qualification: 'SSIAP 2', lieu: 'Institut Médico-Chirurgical Montsouris', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '08:00', fin: '20:00' }, { jours: TOUS_LES_JOURS, debut: '20:00', fin: '08:00' }],
        citation: 'l’option 2 : 1 SSIAP 2 7j/7 7j/7 24h/24 ou en vacations de 12h (08h00-20h00/20h00-08h00)' },
    ],
    cas_pratique: null,
  },
  etampes1: {
    postes: [],
    cas_pratique: {
      plages: PLAGES_ETAMPES,
      dispositif: PLAGES_ETAMPES.flatMap((p) => [
        { plage: p.libelle, profil: 'Agent de sécurité', en_service: 2, justification: 'Deux agents pour couvrir les accès et les abords des équipements municipaux en binôme.' },
        { plage: p.libelle, profil: 'Maître-chien', en_service: 1, justification: 'Un binôme cynophile pour la dissuasion sur les abords et le quartier.' },
        { plage: p.libelle, profil: 'Agent de sécurité incendie', en_service: 0, justification: 'Aucune mission de sécurité incendie demandée sur cette plage.' },
        { plage: p.libelle, profil: 'Encadrant', en_service: 0, justification: 'Contrôle par passage de l’encadrement, sans présence permanente.' },
      ]),
    },
  },
  rouen_univ: {
    postes: [{ profil: 'Agent de sécurité', qualification: 'CQP APS', lieu: 'Campus de Mont-Saint-Aignan', heures_hebdo: null, heures_an: null,
      plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], debut: '07:00', fin: '23:00' }, { jours: ['samedi'], debut: '08:00', fin: '17:00' }],
      citation: 'Fréquence et durée des prestations : du lundi au vendredi, de 7h00 à 23h00 (divisé en 2 vacations) le samedi, de 8h00 à 17h00' }],
    cas_pratique: null,
  },
  ca_normandie: { postes: [], cas_pratique: null },
};

/** Réponse simulée à un appel du modèle. */
export function repondre(corpus: CorpusCC, body: any): string {
  const msgs: any[] = body.messages || [];
  const sys = contenu(msgs[0]);
  const tout = msgs.map(contenu).join('\n');
  const dernier = contenu(msgs[msgs.length - 1]);
  const json = (o: any) => JSON.stringify(o);
  const type = (t: string, sortie: string) => { journal.push({ type: t, entree: tout.length, sortie: sortie.length }); return sortie; };

  if (/Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS/.test(sys)) return type('analyse du DCE', json(ANALYSES[corpus]));
  if (/PÉRIMÈTRE RÉEL des/.test(sys)) return type('périmètre', json({ perimetre: PERIMETRE[corpus] }));
  // Dimensionnement (46a337b) : postes du CCTP (citations exactes) ou cas pratique d'Étampes (relevé de la sonde réelle).
  if (/^Tu lis le DCE d'un marché de sécurité privée pour GSS\. Tu ne calcules aucun total/.test(sys)) return type('dimensionnement', json(DIMENSIONNEMENT[corpus]));
  // Couverture du CCTP en cadre imposé (ec6aa03) : une exigence de moyens ajoutée à Étampes, rien ailleurs.
  if (/^Tu contrôles les réponses de GSS \(sécurité privée\) au cadre de réponse/.test(sys)) {
    const reps = [...tout.matchAll(/^### Réponse (\d+) — question : (.*)$/gm)].map((m) => ({ id: Number(m[1]), question: m[2] }));
    const cible = corpus === 'etampes1' ? reps.find((x) => /moyens?|matériel|communication/i.test(x.question)) : undefined;
    return type('couverture du cadre', json({ ajouts: cible ? [{ id: cible.id, apres: '', texte: 'GSS dote chaque agent d’un moyen de communication qui lui permet de joindre en permanence son encadrement pendant la vacation' }] : [] }));
  }
  // CC_PAGES : limite de pages simulée plus basse (exerce la sélection en boucle et la condensation).
  if (/^Tu lis des extraits du règlement de consultation/.test(sys)) return type('format imposé', json(corpus === 'imm' ? { ...PLAN_IMM, pagesMax: Number(process.env.CC_PAGES) || PLAN_IMM.pagesMax } : { limite: false }));
  if (/CHECK-LIST des GRANDES EXIGENCES/.test(sys)) {
    const ids = new Set([...tout.matchAll(/(b\d_[a-z_]+) \(/g)].map((m) => m[1]));
    return type('matrice des exigences', json({ requirements: matrice(corpus, ids) }));
  }
  if (/indique la valeur que le DCE IMPOSE explicitement/.test(sys)) return type('valeurs imposées', json({ valeurs: [] }));
  if (/impose le plan du mémoire technique\. GSS reprend EXACTEMENT son mémoire type/.test(sys)) {
    const presents = new Set([...dernier.matchAll(/^- (b\d_[a-z0-9_]+) — /gm)].map((m) => m[1]));
    const parties = Object.entries(REPARTITION_IMM).map(([id, l]) => ({ id, rubriques: l.filter((x) => presents.has(x)), non_couverts: id === 'c5' ? ['Cohérence du prix (décomposition justificative)'] : [] }));
    return type('répartition (format court)', json({ parties }));
  }
  if (/^Tu adaptes UNE rubrique du mémoire technique de GSS/.test(sys)) return type('adaptation', json({ remplacements: [], retraits: [], ajouts: [] }));
  if (/formuler ses remarques sur le cahier des charges/.test(sys)) return type('remarques', json({ remarques: [] }));
  if (/le bloc « Notre compréhension de votre besoin »/.test(sys)) {
    const c = corpus === 'ca_normandie' ? COMPREHENSION_CA : COMPREHENSION;
    if (/Le schéma de process est refusé/.test(dernier)) return type('compréhension (schéma corrigé)', json({ etapes: c.etapes }));
    return type('compréhension', json(c));
  }
  if (/tu complètes UNE partie d'un mémoire technique/.test(sys)) {
    return type('complément hors mémoire type', `## Cohérence du prix\n\nLe prix découle du volume du cahier des charges : un poste permanent 24 h/24, 7 j/7, soit **8 760 heures par an**, environ **5,5 ETP** sur une base de 1 607 heures par ETP.\n\n| Poste | Horaires | Heures annuelles | ETP |\n|---|---|---|---|\n| Poste de sécurité incendie et de sûreté | 24 h/24, 7 j/7 | 8 760 | 5,5 |\n\nLe prix horaire comprend le salaire conventionnel (IDCC 1351), les majorations de nuit, de dimanche et de jours fériés, les charges sociales, l'encadrement, les contrôles, la formation et les équipements.\n\n[CONSULTATION REQUISE : taux horaires par qualification et montants de la décomposition, cohérents avec le bordereau de prix remis]`);
  }
  if (/^On te donne le texte d'une rubrique de mémoire technique et une liste numérotée d'exigences/.test(sys)) {
    const texte = (/TEXTE :\n([\s\S]*?)\n\nEXIGENCES :/.exec(tout) || [])[1] || '';
    const exigences = [...tout.split('EXIGENCES :\n').pop()!.matchAll(/^\d+\. (.+?) \(réponse GSS connue/gm)].map((m) => m[1]);
    const puces = exigences.filter((e) => (e.match(/\d+/g) || []).some((n) => !texte.includes(n))).slice(0, 2)
      .map((e) => `Nous respectons l'exigence du cahier des charges : ${e.charAt(0).toLowerCase()}${e.slice(1)}.`);
    return type('couverture', json({ puces }));
  }
  if (/qui CONTREDIT une exigence/.test(sys)) return type('contradictions', json({ corrections: [] }));
  if (/Tu vérifies les horaires d'un mémoire technique/.test(sys)) return type('horaires', json({ corrections: [] }));
  if (/obligations chiffrées du cahier des charges dont le chiffre n'a pas été retrouvé/.test(sys)) return type('obligations chiffrées', json({ puces: [] }));
  if (/^Tu condenses une partie de mémoire technique/.test(sys)) {
    // Condensation simulée : les phrases gardées sont recopiées mot pour mot ; le dernier paragraphe de chaque bloc est retiré.
    const t = dernier.split(/\n(?=## )/).map((b) => { const p = b.split(/\n\n/); return p.length > 2 && !/⟦AC:/.test(p[p.length - 1]) ? p.slice(0, -1).join('\n\n') : b; }).join('\n');
    return type('condensation', t);
  }
  if (/Tu prépares la liste des informations à obtenir pour finaliser un mémoire technique GSS/.test(sys)) {
    const items = [...dernier.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({ question: m[2], sources: [Number(m[1])] }));
    return type('consolidation', json({ questions: items }));
  }
  if (/indique si les extraits de ses réponses d'appels d'offres précédentes y répondent DÉJÀ/.test(sys)) return type('réponses des mémoires', json({ reponses: [] }));
  if (/formule la question exacte à poser à un collègue de GSS/.test(sys)) {
    const qs = [...dernier.matchAll(/^### (\S+)\nSous-critère : (.*)\nPhrase : (.*)$/gm)].map((m) => ({ cle: m[1], question: `Quelle information faut-il inscrire à la place de « [À COMPLÉTER] » dans « ${m[3].slice(0, 120)} » ?`, groupe: m[1] }));
    return type('questions des emplacements', json({ questions: qs }));
  }
  if (/Tu relis les réponses d'un mémoire technique GSS à une grille de notation/.test(sys)) return type('cohérence de la grille', json({ corrections: [] }));
  // ── Cadre de réponse : un champ, une zone ──
  if (/Tu es un rédacteur chevronné de mémoires techniques pour l'entreprise GSS/.test(sys)) {
    if (/LIBELLÉ \/ QUESTION À TRAITER/.test(dernier)) {
      const n = Number((/il y a (\d+) ligne/.exec(dernier) || [])[1] || 1);
      return type('cadre (zone)', json({ items: Array.from({ length: Math.min(n, 2) }, (_, i) => `Élément de réponse ${i + 1} fondé sur la documentation GSS`) }));
    }
    const id = Number((/"id": (\d+)/.exec(dernier) || [])[1] || 0);
    if (/CASE A COCHER/.test(dernier) && /Réponds STRICTEMENT "☑" ou "☐"/.test(dernier)) return type('cadre (case)', json({ id, value: '☐' }));
    if (!/\[PARAGRAPHE\]/.test((/CHAMP UNIQUE À RÉDIGER :\n(.*)/.exec(dernier) || [])[1] || '')) return type('cadre (valeur courte)', json({ id, value: '[À COMPLÉTER]' }));
    const refs = [...dernier.matchAll(/^\[(R\d)\] (.+)\n([\s\S]*?)(?=\n\n\[R\d\] |\n--- FIN DES TEXTES DE RÉFÉRENCE ---)/gm)].map((m) => ({ cle: m[1], titre: m[2], texte: m[3].trim() }));
    const strict = /Ton essai précédent a reformulé le texte de référence/.test(dernier);
    if (!refs.length) {
      champs.push({ id, candidats: [], repris: [], strict });
      return type('cadre (paragraphe sans référence)', json({ id, value: 'GSS organise la prestation demandée à partir de sa documentation : un responsable d\'exploitation dédié, des agents formés et un compte rendu après chaque intervention.' }));
    }
    // Le premier texte candidat est repris ; un champ sur trois est d'abord reformulé (fidélité basse → essai strict).
    const r = refs[0];
    const reformule = !strict && id % 3 === 0;
    champs.push({ id, candidats: refs.map((x) => x.cle), repris: [r.cle], strict });
    const valeur = `${reformule ? reformuler(r.texte) : r.texte}\nGSS applique cette organisation sur les sites du marché dès la prise de poste.`;
    return type(`cadre (paragraphe repris${strict ? ', essai strict' : reformule ? ', reformulé' : ''})`, json({ id, value: valeur, reference: [r.cle] }));
  }
  if (/^Tu classes des informations manquantes d'un mémoire/.test(sys)) return type('classification des manques', '{}');
  inconnus.push(sys.slice(0, 160));
  return type('INCONNU', '{}');
}

/**
 * Embedding hors ligne : sac de mots (racines de 6 lettres) projeté par hachage, normalisé. La similarité cosinus
 * reflète les mots communs (assez pour exercer la recherche des textes de référence sans réseau).
 */
export function embedding(texte: string): number[] {
  const v = new Array(1536).fill(0);
  const mots = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 4);
  for (const w of mots) v[crypto.createHash('md5').update(w.slice(0, 6)).digest().readUInt16LE(0) % 1536] += 1;
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
