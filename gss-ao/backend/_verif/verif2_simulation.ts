// RÉPONSES SIMULÉES DU MODÈLE pour le harnais hors ligne de la réponse libre v2 (aucun appel OpenAI).
// Chaque appel est reconnu à la signature de sa consigne ; la réponse est réaliste (faits des CCTP becquerel et caen,
// mots exacts des textes pour les schémas) pour que toute la chaîne (adaptation, compréhension, propositions,
// contrôles, consultations, schémas, assistant) s'exécute comme en génération réelle.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type Corpus = 'becquerel' | 'caen' | 'ign';

const B = path.resolve(__dirname, '..');
const ANALYSES = JSON.parse(fs.readFileSync(path.join(B, 'tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
const MT = JSON.parse(fs.readFileSync(path.join(B, 'src/generation/memoire_type/memoire_type.json'), 'utf-8'));
const idParTitre = new Map<string, string>(MT.rubriques.map((r: any) => [r.titre, r.id]));

export const journal: Array<{ type: string; entree: number; sortie: number }> = [];
export const inconnus: string[] = [];
/** Scénario de l'assistant (plan d'actions renvoyé au prochain appel « assistant de modification »). */
export const assistant: { plan: any; texteModifie?: (texte: string, consigne: string) => string } = { plan: null };

const contenu = (m: any) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((x: any) => x?.text || '').join('') : '');

// ─── Données simulées par corpus ─────────────────────────────────────────────────────────────

const PERIMETRE: Record<Corpus, string> = {
  becquerel: `- Postes fixes : oui. Poste PC sécurité couvert 24h / 24h, 7 jours sur 7, par un agent SSIAP2 (tenue du PC, alarmes incendie, vidéosurveillance, passes et clés, main courante, rondes de prévention et ronde technique journalière ; l'agent du PC reste dans le PC sécurité).
- Poste d'accueil couvert entre 20h et 7h tous les soirs par un agent SSIAP1 (levées de doute sur sollicitation du PC, accueil des secours, transfert horizontal et évacuation des malades, intrusions, accueil et standard).
- Renfort SSIAP1/ADS ponctuel à la demande du CHB, et prestations exceptionnelles sur bon de commande (délai de prévenance de 48 heures ouvrées).
- Sites : bâtiment de soins rue d'Amiens (PC sécurité et accueil), CHB5 rue Edouard Adam, crèche rue Mollien, plateau de consultation route de Lyons, à Rouen.
- Hors périmètre : télésurveillance, événementiel.`,
  caen: `- Postes fixes : non.
- Ronde d'ouverture à 05H30 et ronde de fermeture à 21 H 30, du lundi au vendredi, sur le site de Caen (20 rue Alfred Kastler).
- Télésurveillance forfaitaire (remontée des alarmes, tests lignes toutes les 24h) ; télésécurité et interventions ponctuelles sur bon de commande (intervention sur alarme, gardiennage ponctuel).
- Hors périmètre : poste d'accueil permanent, sécurité incendie SSIAP.`,
  ign: `- Postes fixes : oui. Bâtiment Carnot-Cassini : SSIAP 2 au PCS 24 h/24 7 j/7, SSIAP 1 au PCS du lundi au samedi de 7h00 à 19h00 et du lundi au vendredi de 19h00 à 7h00, ADS en rondes du lundi au vendredi de 7h00 à 19h00 et de 19h00 à 1h00.
- Bâtiment Coriolis : SSIAP 2 au PCS du lundi au vendredi de 7h00 à 19h00 ; ronde d'ouverture à 6h00 par le SSIAP 1 de Carnot-Cassini.
- Prestations exceptionnelles sur bon de commande (délai de 2 heures) ; Poste de Contrôle Avancé cogéré avec l'UGE.
- Sites : Champs-sur-Marne (Pôle Scientifique et Technique).
- Hors périmètre : télésurveillance, intervention cynophile.`,
};

/** Matrice des exigences simulée (rubriques du mémoire type, deux questions nouvelles, un écart). */
function matrice(c: Corpus, idsConnus: Set<string>): any[] {
  const e = (rubrique: string, theme: string, exigence: string, couverture = 'couvert', criticite = 'normal', sujet?: string) => ({ theme, rubrique, exigence, reponseGss: 'Procédure GSS documentée', couverture, criticite, ...(sujet ? { sujet } : {}) });
  const l = c === 'becquerel' ? [
    e('b3_adequation', 'III', "Poste PC sécurité couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2 ; poste d'accueil couvert entre 20h et 7h tous les soirs par un agent SSIAP1", 'couvert', 'bloquant'),
    e('b3_formation_ssiap_a', 'III', 'Personnel titulaire du SSIAP1 ou du SSIAP2 à jour (moins de 3 ans), du SST, du PSC1, du PSE1 ou de l\'AFPS (moins de 2 ans) et du CQP-APS', 'couvert', 'bloquant'),
    e('b3_formation_secourisme', 'III', 'Habilitation électrique H0-B0 minimum de moins de 3 ans (article EL18 §2)', 'partiel'),
    e('b3_recrutement', 'III', 'Les candidats indiquent les critères utilisés pour le recrutement de leur personnel et les formations dispensées après le recrutement'),
    e('b5_nouvel_agent', 'V', 'Formation en tuilage sur un poste de nuit et un poste de jour le week-end, QCM et fiche d\'intégration fournis au responsable sécurité du CHB avant la titularisation'),
    e('b4_tenues', 'IV', 'Tenues fournies par le titulaire, modèle agréé par le CHB, au minimum une tenue adaptée à l\'été et une tenue adaptée à l\'hiver'),
    e('b4_communication', 'IV', 'Minimum de 5 talkies-walkies fournis par le titulaire et un téléphone mobile pour les zones non couvertes par le DECT'),
    e('b4_rondes', 'IV', 'Contrôleur de rondes fourni par le titulaire, réparé ou remplacé dans la journée en cas de panne ; environ 50 pointeaux puis environ 120'),
    e('b4_pti', 'IV', 'Système PTI fourni par le titulaire, réparé ou remplacé dans la journée en cas de panne'),
    e('b4_planification', 'IV', 'Plannings mensuels transmis au responsable sécurité du CHB au moins 10 jours avant le début du mois considéré ; modifications communiquées au moins 2 jours ouvrés avant', 'couvert', 'bloquant'),
    e('b5_commande_supplementaire', 'V', 'Prestations exceptionnelles sur bon de commande avec un délai de prévenance de 48 heures ouvrées'),
    e('b3_interlocuteur_unique', 'III', 'Un responsable unique interlocuteur du CHB, avec tous les pouvoirs requis'),
    e('b5_reunions_indicateurs', 'V', 'Réunions de suivi qualité organisées au minimum tous les mois, avec les indicateurs du prestataire'),
    e('b5_controle_nuit', 'V', 'Compte rendu des visites réalisées dans le mois par un contrôleur avant le 5 du mois suivant'),
    e('b5_remplacement_imprevu', 'V', 'Remplacement immédiat d\'un agent absent ; personnels mobilisables dans un délai de 2 heures maximum, dans un rayon de 20 km', 'couvert', 'bloquant'),
    e('b3_reprise_personnel', 'III', 'Reprise du personnel conformément à l\'article L. 1224-1 du Code du travail et à l\'avenant du 28 janvier 2011 à l\'accord du 5 mars 2002'),
    e('b_procedures', 'IV', 'Transfert horizontal et évacuation des malades (U43, d)) par l\'agent du poste d\'accueil'),
    e('nouvelle', 'V', 'Le PC sécurité et le poste d\'accueil sont nettoyés et entretenus par le personnel du prestataire, qui fournit tout le matériel nécessaire', 'écart', 'normal', 'Entretien du PC sécurité et du poste d\'accueil'),
    e('nouvelle', 'V', 'En cas d\'arrêt de travail de son personnel, le prestataire assure les prestations définies par le CHB (service minimal)', 'partiel', 'bloquant', 'Service minimal en cas d\'arrêt de travail'),
    e('nouvelle', 'IV', 'Le standard multiligne est assuré en relais par l\'agent du PC sécurité', 'partiel', 'normal', 'Relais du standard téléphonique multiligne'),
  ] : [
    e('b4_rondes', 'IV', "Ronde d'ouverture à 05H30 et ronde de fermeture à 21 H 30, du lundi au vendredi", 'couvert', 'bloquant'),
    e('b4_moyens_acces', 'IV', 'Responsabilité des clés et badges confiés ; perte ou vol signalés sans délai, remplacement à la charge du titulaire'),
    e('b4_planification', 'IV', 'Planning mensuel des rondes communiqué aux responsables de site, avec le nom de l\'agent et sa tâche'),
    e('b5_remplacement_imprevu', 'V', 'Personnel de remplacement dépêché sur le site dans un délai d\'une (1) heure suivant la constatation de la défaillance', 'couvert', 'bloquant'),
    e('b5_reunions_indicateurs', 'V', "Réunion d'exploitation qualité au minimum trimestrielle avec le personnel d'encadrement du titulaire"),
    e('b4_proc_alarme', 'IV', 'Rapports d\'intervention déposés dans la boîte aux lettres de l\'organisme dans un délai maximal de 2 jours ouvrés'),
    e('b4_proc_intrusion', 'IV', 'Appel aux forces de l\'ordre dès qu\'une intrusion est constatée, après vérification sur place'),
    e('b4_main_courante', 'IV', 'Un rapport rédigé à chaque fin de service'),
    e('b_telesurveillance', 'IV', 'Tests lignes toutes les 24h et transmission journalière de la traçabilité des événements de télésurveillance'),
    e('b5_nouveau_marche', 'V', 'Consignes d\'application établies dans les quinze premiers jours du marché (norme NF X 50-777)'),
    e('nouvelle', 'V', 'Plan de prévention remis au pouvoir adjudicateur dans les QUINZE (15) jours suivant la notification du marché, tenu à jour par le titulaire', 'écart', 'bloquant', 'Plan de prévention sous quinze jours'),
    e('nouvelle', 'V', 'En fin de marché, initiation du personnel du nouveau prestataire et communication des plans, documents et instructions', 'écart', 'normal', 'Initiation du nouveau prestataire en fin de marché'),
    e('b2_identite', 'II', 'Agents titulaires d\'une carte professionnelle (nom, prénom, qualité, photo, raison sociale) ; visites médicales annuelles', 'couvert', 'normal'),
  ];
  if (c === 'ign') l.splice(0, l.length,
    e('b3_adequation', 'III', 'Permanence d\'un SSIAP 2 au PCS de Carnot-Cassini du lundi au dimanche de 7h00 à 19h00 et de 19h00 à 7h00, d\'un SSIAP 1 et d\'un ADS selon les plannings de l\'annexe 3', 'couvert', 'bloquant'),
    e('b5_remplacement_imprevu', 'V', 'Remplaçant présent sur site dans les deux (2) heures suivant l\'heure normale de la prise de poste de l\'agent absent', 'couvert', 'bloquant'),
    e('b5_remplacement_prevu', 'V', 'Absence prévisible signalée au SAIMG dès qu\'elle est connue et au moins 24h à l\'avance'),
    e('b4_planification', 'IV', 'Planning mensuel de chaque bâtiment transmis au SAIMG au moins sept (7) jours avant le début du mois ; modifications au plus tard 4 jours ouvrés avant leur prise d\'effet', 'couvert', 'bloquant'),
    e('b5_reunions_indicateurs', 'V', 'Réunion de suivi de périodicité bimestrielle, compte rendu établi dans les 5 jours ouvrés suivants ; rapport d\'activité tous les mois'),
    e('b3_interlocuteur_unique', 'III', 'Un référent ou chargé d\'affaire désigné au démarrage du marché, joignable par téléphone et courriel'),
    e('b4_rondes', 'IV', 'Système de contrôle des rondes avec pointeaux, transmission et consultation à distance en temps réel, mails automatiques en cas d\'anomalie, compatible GuardTek'),
    e('b4_main_courante', 'IV', 'Main courante électronique et système de ronde intégrés dans une seule solution logicielle ; deux ordinateurs fournis, un par PCS'),
    e('b5_nouvel_agent', 'V', 'Formation sur site des nouveaux SSIAP 1 et ADS en binôme avec un chef de poste connaissant déjà le site'),
    e('b5_commande_supplementaire', 'V', 'Prestations exceptionnelles sur bon de commande, délai de 2 heures à compter de la survenance de l\'évènement ou de la demande'),
    e('b4_moyens_acces', 'IV', '19 badges remis par le SAIMG ; toute demande supplémentaire par mail avec un délai de 3 jours ouvrés'),
    e('b3_reprise_personnel', 'III', 'Reprise du personnel en place conformément à l\'accord du 5 mars 2002'),
    e('nouvelle', 'V', 'Le titulaire soumet au SAIMG dans un délai d\'un mois à dater de la prise d\'effet du marché le projet de plan de prévention', 'écart', 'bloquant', 'Plan de prévention sous un mois'),
    e('nouvelle', 'IV', 'Le titulaire collabore avec son homologue du marché de surveillance de l\'UGE pour la gestion du Poste de Contrôle Avancé (PCA)', 'partiel', 'normal', 'Coordination avec le prestataire de l\'UGE au PCA'),
    e('nouvelle', 'IV', 'Les informations, consignes et données du logiciel GuardTek sont récupérées et intégrées dans le nouveau logiciel proposé', 'partiel', 'normal', 'Reprise des données GuardTek'),
  );
  return l.filter((x) => x.rubrique === 'nouvelle' || idsConnus.has(x.rubrique) || /^b_/.test(x.rubrique));
}

/** Lecture du DCE pour le dimensionnement (IGN : relevé de la sonde réelle _verif/correction9_dim_sonde.ts). */
const TOUS_LES_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const DIMENSIONNEMENT: Record<Corpus, any> = {
  becquerel: {
    postes: [
      { profil: 'SSIAP 2', qualification: 'SSIAP 2', lieu: 'PC sécurité', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '07:00', fin: '19:00' }, { jours: TOUS_LES_JOURS, debut: '19:00', fin: '07:00' }],
        citation: 'Poste PC sécurité Le poste devra être couvert 24h / 24h, 7 jours sur 7 par un agent SSIAP2.' },
      { profil: 'SSIAP 1', qualification: 'SSIAP 1', lieu: 'Poste d\'accueil', heures_hebdo: null, heures_an: null,
        plages: [{ jours: TOUS_LES_JOURS, debut: '20:00', fin: '07:00' }],
        citation: 'Poste d’accueil Le poste devra être couvert : entre 20h et 7h tous les soirs par un agent SSIAP1.' },
    ],
    cas_pratique: null,
  },
  caen: { postes: [], cas_pratique: null },
  ign: {"postes": [{"profil": "SSIAP 2", "qualification": "SSIAP 2", "lieu": "Carnot-Cassini", "plages": [{"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"], "debut": "07:00", "fin": "19:00"}, {"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"], "debut": "19:00", "fin": "07:00"}], "citation": "Permanence d’un SSIAP 2 (qualification minimum niveau 3, échelon 3, coefficient 150) en poste au PCS Horaires : du lundi au dimanche de 7h00 à 19h00"}, {"profil": "SSIAP 2", "qualification": "SSIAP 2", "lieu": "Coriolis", "plages": [{"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi"], "debut": "07:00", "fin": "19:00"}], "citation": "Permanence d’un SSIAP 2 (qualification minimum niveau 3, échelon 3, coefficient 150) en poste au PCS et effectuant les rondes techniques le cas échéant, hors jours férié."}, {"profil": "SSIAP 1", "qualification": "SSIAP 1", "lieu": "Carnot-Cassini", "plages": [{"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"], "debut": "07:00", "fin": "19:00"}, {"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi"], "debut": "19:00", "fin": "07:00"}], "citation": "Permanence d’un SSIAP 1 (qualification minimum niveau 3, échelon 2, coefficient 140) en poste au PCS et effectuant les rondes techniques."}, {"profil": "ADS", "qualification": "ADS", "lieu": "Carnot-Cassini", "plages": [{"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi"], "debut": "07:00", "fin": "19:00"}, {"jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi"], "debut": "19:00", "fin": "01:00"}], "citation": "Permanence d’un ADS (qualification minimum niveau 2, échelon 2, coefficient 120) effectuant les rondes à l’intérieur et l’extérieur des locaux"}], "cas_pratique": null},
};

const IMPOSEES: Record<Corpus, any[]> = {
  becquerel: [
    { variable: 'FREQ_REUNIONS', valeur: 'au minimum tous les mois', citation: 'Ces réunions seront organisées par le titulaire au minimum tous les mois sous peine de se voir appliquer les pénalités prévues au CCAP.' },
  ],
  caen: [
    { variable: 'DELAI_ASTREINTE', valeur: '1 heure', citation: 'Dans le cas de défaillance de l’effectif prévu, le Titulaire doit dépêcher sur le site le personnel de remplacement dans les UNE (1) heure suivant la constatation.' },
  ],
  ign: [
    { variable: 'DELAI_ASTREINTE', valeur: '2 heures', citation: 'son remplaçant devra être présent sur site dans les deux (2) heures suivant l’heure normale de la prise de poste de l’agent absent.' },
    { variable: 'FREQ_REUNIONS', valeur: 'bimestrielle', citation: 'Une réunion de suivi sera mise en place dès le démarrage des prestations, sa périodicité sera bimestrielle' },
  ],
};

const REMARQUES = ["Article 3.4 : le CCTP exige à la fois le SSIAP1 et le SSIAP2 pour « l'ensemble du personnel » ; nous proposons de retenir le SSIAP2 pour le poste PC sécurité et le SSIAP1 pour le poste d'accueil, conformément à l'article 4.2.", "Article 4.2 : le standard est assuré « en relais de temps en temps » par l'agent du PC sécurité, qui doit rester dans le PC ; nous proposons de préciser les plages de relais avec le responsable sécurité du CHB."];

const COMPREHENSION: Record<Corpus, { texte: string; titre_schema: string; etapes: any[] }> = {
  becquerel: {
    texte: `Le Centre Henri Becquerel nous consulte pour les missions de sécurité incendie et de sûreté de ses sites rouennais, dans le cadre d'un accord-cadre de 3 ans. La prestation s'exerce sur 22 520 m² : le bâtiment de soins de la rue d'Amiens (Becquerel 2), qui abrite le PC sécurité et l'accueil, le bâtiment CHB5 de la rue Edouard Adam, la crèche de la rue Mollien et le plateau de consultation de la route de Lyons. Un nouveau bâtiment de cinq niveaux, d'environ 20 000 m², ouvrira au premier trimestre 2027.

## Le périmètre de la prestation demandée

| Site | Poste | Jours et horaires | Qualification | Missions principales |
|---|---|---|---|---|
| Rue d'Amiens | PC sécurité | 24 h/24, 7 j/7 | SSIAP 2 | Alarmes incendie, vidéosurveillance, passes et clés, main courante, rondes de prévention et ronde technique journalière |
| Rue d'Amiens | Poste d'accueil | 20 h – 7 h, tous les soirs | SSIAP 1 | Levées de doute, accueil des secours, premiers secours, transfert horizontal des malades, intrusions |
| Sites du CHB | Renfort SSIAP | À la demande du CHB | SSIAP 1 / ADS | Mêmes missions que le poste d'accueil |

S'y ajoutent les prestations exceptionnelles sur bon de commande (délai de prévenance de 48 heures ouvrées) et la reprise du personnel affecté au marché.

## Vos attentes et nos engagements

- **Continuité de service** : remplacement immédiat d'un agent absent, renfort mobilisable en 2 heures dans un rayon de 20 km → notre réponse : notre dispositif de remplacement d'un agent absent, développé au bloc 5.
- **Qualifications à jour** : SSIAP, SST, habilitation électrique H0-B0, carte professionnelle → notre réponse : le suivi des recyclages de chaque agent, développé au bloc 3.
- **Contrôle et traçabilité** : environ 50 puis 120 pointeaux, alerte en cas de ronde incomplète → notre réponse : nos trois niveaux de contrôle et notre contrôleur de rondes, développés aux blocs 4 et 5.
- **Pilotage** : un interlocuteur unique, une réunion de suivi au minimum tous les mois, des plannings transmis 10 jours avant le début du mois → notre réponse : notre interlocuteur unique et nos réunions de suivi, développés aux blocs 3 et 5.

## Les points de vigilance identifiés et nos réponses

- **Un établissement de soins** : confidentialité des données patients et des protocoles de sûreté, transfert horizontal et évacuation des malades (article U43) → notre réponse : des consignes du site intégrées au livre des missions et consignes (bloc 4).
- **Un site qui s'agrandit en 2027** : nouveau bâtiment de cinq niveaux, pointeaux portés d'environ 50 à 120 → notre réponse : un circuit de ronde adapté à chaque évolution du site (bloc 4).
- **La prise de poste** : formation en tuilage sur un poste de nuit et un poste de jour le week-end, QCM et fiche d'intégration avant titularisation → notre réponse : notre procédure d'intégration d'un nouvel agent (bloc 5).`,
    titre_schema: 'Notre réponse à votre besoin, en un process',
    etapes: [
      { titre: 'Votre besoin', texte: 'PC sécurité 24 h/24 et accueil de 20 h à 7 h', role: 'rouge' },
      { titre: 'Vos enjeux', texte: 'Continuité de service, confidentialité, nouveau bâtiment en 2027', role: 'rouge' },
      { titre: 'Notre dispositif', texte: 'Renfort mobilisable en 2 heures dans un rayon de 20 km', role: 'orange' },
      { titre: 'Notre pilotage', texte: 'Un interlocuteur unique, une réunion de suivi au minimum tous les mois', role: 'bleu' },
      { titre: 'Votre résultat', texte: 'Continuité de service et traçabilité de chaque ronde', role: 'vert' },
    ],
  },
  caen: {
    texte: `L'ACOSS nous consulte pour le lot 5 de son marché de gardiennage et de sûreté/sécurité : le site de Caen, 20 rue Alfred Kastler, d'une surface utile brute de 2820 m², ouvert de 07h00 à 19h00. Les agents y disposent des clés et des badges d'accès à des zones privées et sensibles : honnêteté, confidentialité et intégrité sont au cœur du besoin.

## Le périmètre de la prestation demandée

| Site | Prestation | Jours et horaires | Qualification | Missions principales |
|---|---|---|---|---|
| Caen | Ronde d'ouverture | Du lundi au vendredi, 05H30 | Agent de sécurité | Ouverture du site, vérification des accès et des alarmes |
| Caen | Ronde de fermeture | Du lundi au vendredi, 21 H 30 | Agent de sécurité | Fermeture, mise sous alarme, rapport de fin de service |
| Caen | Télésurveillance | Prestation forfaitaire | Opérateurs de télésurveillance | Remontée des alarmes, tests lignes toutes les 24h |
| Caen | Télésécurité et interventions ponctuelles | Sur bon de commande | Agent de sécurité | Intervention sur alarme, gardiennage ponctuel, rapport d'intervention |

## Vos attentes et nos engagements

- **Ponctualité et respect des heures de ronde** : un planning mensuel des rondes qui nomme chaque agent → notre réponse : notre planification, développée au bloc 4.
- **Réactivité** : personnel de remplacement dépêché dans un délai d'une heure, équipes mobilisées dans un délai de 2 heures en cas de sinistre → notre réponse : notre dispositif de remplacement, développé au bloc 5.
- **Traçabilité** : un rapport à chaque fin de service, des rapports d'intervention déposés dans un délai maximal de 2 jours ouvrés → notre réponse : notre main courante électronique, développée au bloc 4.
- **Pilotage** : une réunion d'exploitation qualité au minimum trimestrielle → notre réponse : nos réunions de suivi et nos indicateurs, développés au bloc 5.

## Les points de vigilance identifiés et nos réponses

- **Des clés et des badges confiés** : la perte ou le vol est signalé sans délai → notre réponse : notre procédure de gestion des moyens d'accès (bloc 4).
- **Un appel aux forces de l'ordre encadré** : vérifier sur place avant tout appel → notre réponse : notre procédure de gestion d'une intrusion (bloc 4).
- **Des rondes à 05H30 et à 21 H 30** : un agent seul sur le site → notre réponse : notre protection du travailleur isolé (bloc 4).`,
    titre_schema: 'Votre besoin, notre réponse en un process',
    etapes: [
      { titre: 'Votre besoin', texte: 'Ronde d\'ouverture et ronde de fermeture du lundi au vendredi', role: 'rouge' },
      { titre: 'Vos enjeux', texte: 'Des clés et des badges confiés, un agent seul sur le site', role: 'rouge' },
      { titre: 'Notre dispositif', texte: 'Personnel de remplacement dépêché dans un délai d\'une heure', role: 'orange' },
      { titre: 'Notre pilotage', texte: 'Une réunion d\'exploitation qualité au minimum trimestrielle', role: 'bleu' },
      { titre: 'Votre résultat', texte: 'Un rapport à chaque fin de service', role: 'vert' },
    ],
  },
  ign: {
    texte: `L'École nationale des ponts et chaussées et l'IGN, réunis en groupement de commandes, nous consultent pour le gardiennage, la sécurité incendie et la surveillance des bâtiments Carnot-Cassini et Coriolis, à Champs-sur-Marne. Le site est ouvert en permanence, avec des accès par badge selon les catégories d'utilisateurs : étudiants, chercheurs présents 24h/24, personnels administratifs et techniques.

## Le périmètre de la prestation demandée

| Bâtiment | Poste | Jours et horaires | Qualification | Missions principales |
|---|---|---|---|---|
| Carnot-Cassini | PCS | 7 j/7, 24 h/24 | SSIAP 2 | Tenue du PCS, rondes techniques, encadrement |
| Carnot-Cassini | PCS | Lundi au samedi 7h00-19h00, lundi au vendredi 19h00-7h00 | SSIAP 1 | Rondes techniques, ouverture de Coriolis à 6h00 |
| Carnot-Cassini | Rondes | Lundi au vendredi 7h00-19h00 et 19h00-1h00 | ADS | Rondes intérieures et extérieures |
| Coriolis | PCS | Lundi au vendredi 7h00-19h00 | SSIAP 2 | Accueil des premiers utilisateurs, PCS |

## Vos attentes et nos engagements

- **Continuité de service** : remplaçant présent sur site dans les deux heures → notre réponse : notre dispositif de remplacement, développé au bloc 5.
- **Traçabilité** : contrôle des rondes en temps réel, compatible GuardTek → notre réponse : notre contrôleur de rondes, développé au bloc 4.
- **Pilotage** : un référent unique, une réunion de suivi bimestrielle, un rapport d'activité tous les mois → notre réponse : nos réunions de suivi, développées au bloc 5.

## Les points de vigilance identifiés et nos réponses

- **Un campus partagé avec l'UGE** : le Poste de Contrôle Avancé est cogéré → notre réponse : une coordination formalisée avec le prestataire de l'UGE (bloc 4).
- **Un ERP de 2e catégorie** : sécurité incendie et évacuation → notre réponse : notre socle de procédures (bloc 4).`,
    titre_schema: 'Votre besoin, notre réponse en un process',
    etapes: [
      { titre: 'Votre besoin', texte: 'Deux bâtiments surveillés 7 j/7 et 24 h/24', role: 'rouge' },
      { titre: 'Vos enjeux', texte: 'Un campus ouvert en permanence, un PCA partagé avec l\'UGE', role: 'rouge' },
      { titre: 'Notre dispositif', texte: 'Remplaçant présent sur site dans les deux heures', role: 'orange' },
      { titre: 'Notre pilotage', texte: 'Un référent unique, une réunion de suivi bimestrielle', role: 'bleu' },
      { titre: 'Votre résultat', texte: 'Des rondes tracées en temps réel', role: 'vert' },
    ],
  },
};

const PROPOSITIONS: Array<{ motif: RegExp; titre: string; texte: string }> = [
  {
    motif: /UGE|PCA/,
    titre: 'La coordination avec le prestataire de l\'UGE',
    texte: `## Un Poste de Contrôle Avancé géré à deux

Le Poste de Contrôle Avancé est cogéré avec l'UGE. Notre chef de poste se coordonne avec son homologue du marché de surveillance de l'UGE pour toutes les questions communes de sécurité.

## Notre organisation

- Une réunion de lancement avec le prestataire de l'UGE dès le démarrage du marché.
- Des consignes communes tenues à jour dans les carnets de consignes.
- Un échange à chaque événement qui concerne les abords du campus.

## Le suivi avec le SAIMG

Chaque échange est tracé dans la main courante électronique et revu lors de la réunion de suivi bimestrielle.`,
  },
  {
    motif: /GuardTek|donn[ée]es/i,
    titre: 'La reprise des données GuardTek',
    texte: `## Des données reprises sans rupture

Les informations, consignes et données de GuardTek sont récupérées auprès du titulaire sortant et intégrées dans notre solution avant la prise d'effet du marché.

## Notre méthode

- Inventaire des pointeaux, des circuits de ronde et des consignes.
- Import dans notre main courante électronique et vérification par notre responsable de site.
- Essai complet sur site avec le chef de poste avant le démarrage.

## Une solution unique

Le système de ronde et la main courante électronique sont réunis dans une seule solution logicielle, consultable à distance par le SAIMG.`,
  },
  {
    motif: /entretien|nettoy/i,
    titre: 'Entretien du PC sécurité et du poste d\'accueil',
    texte: `## Un poste de sécurité tenu propre à chaque relève

Le PC sécurité et le poste d'accueil sont nettoyés et entretenus par nos agents, qui y travaillent jour et nuit. L'entretien fait partie des consignes de chaque poste : il est réalisé à chaque relève, avant la passation des consignes, et consigné dans la main courante.

- dépoussiérage des plans de travail, des pupitres et des écrans ;
- nettoyage des sols et vidage des corbeilles ;
- rangement des cahiers de consignes, des registres et du tableau des clés.

## Le matériel fourni par GSS

Nous fournissons tout le matériel nécessaire : balai, produits d'entretien et chiffons. Ce matériel est rangé dans le poste et renouvelé par notre responsable de site lors de ses passages.

## Un état contrôlé

Notre responsable de site vérifie l'état d'hygiène et de propreté des postes lors de chaque contrôle de fond, et nos contrôleurs le vérifient lors de chaque contrôle technique. Tout écart est corrigé sans délai et suivi jusqu'à sa résolution. Le niveau d'exigence attendu par le CHB est repris dans la fiche de poste remise à chaque agent : [À COMPLÉTER]
[CONSULTATION REQUISE : Fréquence de passage de l'encadrement GSS pour le contrôle de l'entretien des postes au CHB]`,
  },
  {
    motif: /service minimal|arr[êe]t de travail|gr[èe]ve/i,
    titre: 'Service minimal en cas d\'arrêt de travail',
    texte: `## La continuité des prestations, même en cas d'arrêt de travail

En cas d'arrêt de travail de notre personnel, nous assurons les prestations définies par le CHB. Le PC sécurité reste couvert 24 h/24 et le poste d'accueil de 20 h à 7 h : ce sont les deux postes que nous maintenons en toutes circonstances.

## Notre organisation

- Les agents de notre équipe suppléante, déjà formés au site par le tuilage, sont mobilisés en priorité.
- Notre astreinte d'encadrement organise les remplacements et informe le responsable sécurité du CHB.
- Un planning de régularisation est transmis au responsable sécurité du CHB dès que possible.

## Le suivi avec le CHB

Chaque mouvement est tracé dans la main courante. La situation est revue avec le responsable sécurité du CHB lors de la réunion de suivi qui suit l'événement, avec les mesures prises pour éviter qu'il se reproduise.`,
  },
  {
    motif: /standard/i,
    titre: 'Le relais du standard téléphonique',
    texte: `## Un relais du standard assuré depuis le PC sécurité

L'agent du PC sécurité assure le standard en relais de l'accueil, sans quitter le PC sécurité. Il maîtrise le système multiligne : prise d'appel, mise en attente et transfert vers le bon interlocuteur.

## Des agents formés à l'accueil téléphonique

- Chaque agent affecté au poste est formé au système multiligne lors de son tuilage.
- Les consignes d'orientation des appels sont tenues à jour dans le cahier de consignes du poste.
- Un appel qui relève de la sécurité est traité en priorité et tracé dans la main courante.

## Un niveau de français adapté

Nos agents ont un niveau de français et une élocution adaptés à l'accueil téléphonique d'un établissement de soins. Ce point est vérifié lors du recrutement et suivi lors de nos contrôles de fond.`,
  },
  {
    motif: /plan de pr[ée]vention/i,
    titre: 'Le plan de prévention',
    texte: `## Un plan de prévention établi avec l'ACOSS

Nous contribuons à établir le plan de prévention et le remettons au pouvoir adjudicateur et aux organismes d'hygiène et de sécurité dans les quinze jours suivant la notification du marché. Il précise les mesures prévues pour intégrer la sécurité à l'égard des principaux risques courus par nos agents, dans les modes opératoires comme dans chaque phase des missions.

## Son contenu

- les risques propres aux rondes d'ouverture et de fermeture et aux interventions sur alarme ;
- les moyens de prévention des chutes et des circulations sur le site ;
- les équipements de protection du travailleur isolé de nos agents ;
- les mesures concourant à une bonne hygiène de travail.

## Un document tenu à jour

Le plan de prévention est tenu à jour par notre responsable d'exploitation : chaque modification est signalée au pouvoir adjudicateur pour approbation. Nos agents prennent connaissance des consignes particulières du site et du règlement intérieur dès leur mise en place.`,
  },
  {
    motif: /initiation|nouveau prestataire|fin de march/i,
    titre: 'La passation en fin de marché',
    texte: `## Une fin de marché préparée

En fin de marché, nous initions le personnel du nouveau prestataire chargé de l'exécution du nouveau marché. Cette initiation est organisée avec le responsable de site de l'ACOSS, pour que la sécurité du site reste assurée sans interruption.

## Ce que nous transmettons

- tous les plans, documents et instructions reçus ou établis pendant l'exécution du marché ;
- les consignes d'application tenues à jour ;
- l'état des clés et badges confiés, restitués contre émargement.

## Un accès préparé

Nous autorisons le personnel du nouveau titulaire à accéder aux installations et aux locaux avant l'expiration du marché, accompagné de nos agents, pour une prise de poste dans les meilleures conditions.`,
  },
];

const AJOUTS: Record<Corpus, Record<string, (t: string) => any>> = {
  becquerel: {
    b4_tenues: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Le modèle de tenue est soumis à l\'agrément du CHB avant le début du marché, avec au minimum une tenue adaptée à l\'été et une tenue adaptée à l\'hiver pour chaque agent.', motif: 'CCTP 3.5' }] }),
    b4_rondes: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Les pointeaux, environ 50 dans un premier temps puis environ 120, sont posés aux emplacements déterminés avec le responsable sécurité du CHB.', motif: 'CCTP 4.2' }] }),
    b4_communication: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Nous fournissons au minimum 5 talkies-walkies et un téléphone mobile pour les zones non couvertes par le DECT du CHB.', motif: 'CCTP 3.5' }] }),
    // Chiffre absent du DCE : modification refusée par le contrôle (test).
    b4_pti: (t) => ({ remplacements: [{ extrait: premiereSphrase(t), par: `${premiereSphrase(t)} sous 12 minutes`, motif: 'test de refus' }] }),
  },
  ign: {
    b4_rondes: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Notre système de ronde est compatible avec les installations en place sur le site (GuardTek) et envoie automatiquement un mail en cas d\'anomalie.', motif: 'CCTP 14.2.1' }] }),
    b4_planification: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Le planning mensuel de chaque bâtiment est transmis au SAIMG au moins sept jours avant le début du mois concerné.', motif: 'CCTP 6.5' }] }),
  },
  caen: {
    b4_rondes: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Les rondes d\'ouverture, à 5 h 30, et de fermeture, à 21 h 30, sont assurées du lundi au vendredi.', motif: 'CCTP 3.9' }] }),
    b4_proc_alarme: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Les rapports d\'intervention sont déposés dans la boîte aux lettres de l\'ACOSS dans un délai maximal de 2 jours ouvrés.', motif: 'CCTP télésécurité' }] }),
    b4_planification: (t) => ({ ajouts: [{ apres: premiereSphrase(t), texte: 'Le planning mensuel des rondes, communiqué aux responsables de site, précise le nom de l\'agent et la tâche qui lui est attribuée.', motif: 'CCTP 3.1' }] }),
  },
};

/** Fin de la première phrase de corps d'un texte (extrait exact, unique), pour y insérer un ajout. */
function premiereSphrase(t: string): string {
  for (const l of t.split('\n')) {
    const x = l.trim();
    if (!x || /^\*\*.*\*\*$|^#|^\||^\d+\.|^[-*•]/.test(x) || /\[À COMPLÉTER\]|\{\{/.test(x)) continue;
    const ph = x.split(/(?<=[.!?])\s+/)[0];
    const mots = ph.replace(/[.!?]$/, '').split(/\s+/);
    if (mots.length >= 6) return mots.slice(-6).join(' ');
  }
  return '';
}

// ─── Schémas simulés (SchemaService) : phrases exactes de la page ───────────────────────────

function specDepuisTexte(texte: string, variante: number): any {
  const net = texte.replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').replace(/^\s*\|.*$/gm, '').replace(/^\s*[-*•]\s*/gm, '').replace(/\[À COMPLÉTER\]|\[CONSULTATION REQUISE[^\]]*\]/g, '');
  const phrases = net.split(/(?<=[.!?;:])\s+|\n+/).map((s) => s.trim().replace(/[.;:!?]+$/, ''))
    .filter((s) => /^[A-ZÀ-Ý]/.test(s) && s.length >= 25 && !/[()«»"“”\[\]→]/.test(s));
  const uniques = [...new Set(phrases)].slice(variante, variante + 6);
  const coupe = (s: string, n: number) => { if (s.length <= n) return s; return s.slice(0, n + 1).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, ''); };
  const roles = ['orange', 'bleu', 'vert', 'sable'];
  const cartes = uniques.slice(0, 4).map((p, i) => {
    const mots = p.split(/\s+/);
    const titre = coupe(mots.slice(0, 3).join(' ').replace(/[,;:]+$/, ''), 34);
    const reste = mots.slice(3).join(' ');
    const texteCarte = coupe(reste.charAt(0).toUpperCase() + reste.slice(1), 84);
    return { titre, texte: texteCarte, role: roles[i % roles.length] };
  }).filter((c) => c.titre && c.texte);
  if (cartes.length >= 3) return { sujet: 'simulation', gabarit: 'grille', params: { cartes } };
  const titres = [...texte.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => coupe(m[1].replace(/\*\*/g, '').trim(), 34)).slice(0, 4);
  return { sujet: 'simulation', gabarit: 'chevrons', params: { etapes: titres.map((t, i) => ({ titre: t, role: ['rouge', 'orange', 'bleu', 'vert'][i] })) } };
}

// ─── Réponse simulée à un appel ──────────────────────────────────────────────────────────────

export function repondre(corpus: Corpus, body: any): string {
  const msgs: any[] = body.messages || [];
  const sys = contenu(msgs[0]);
  const tout = msgs.map(contenu).join('\n');
  const dernier = contenu(msgs[msgs.length - 1]);
  const json = (o: any) => JSON.stringify(o);
  const type = (t: string, sortie: string) => { journal.push({ type: t, entree: tout.length, sortie: sortie.length }); return sortie; };

  if (/Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS/.test(sys)) return type('analyse du DCE', json(ANALYSES[corpus]));
  if (/PÉRIMÈTRE RÉEL des prestations/.test(sys)) return type('périmètre', json({ perimetre: PERIMETRE[corpus] }));
  // Dimensionnement (46a337b) : postes relevés mot pour mot dans le CCTP (citations présentes dans le DCE).
  if (/^Tu lis le DCE d'un marché de sécurité privée pour GSS\. Tu ne calcules aucun total/.test(sys)) return type('dimensionnement', json(DIMENSIONNEMENT[corpus]));
  if (/CHECK-LIST des GRANDES EXIGENCES/.test(sys)) {
    const ids = new Set([...tout.matchAll(/(b\d_[a-z_]+) \(/g)].map((m) => m[1]));
    return type('matrice des exigences', json({ requirements: matrice(corpus, ids) }));
  }
  if (/indique la valeur que le DCE IMPOSE explicitement/.test(sys)) return type('valeurs imposées', json({ valeurs: IMPOSEES[corpus] }));
  if (/^Tu adaptes UNE rubrique du mémoire technique de GSS/.test(sys)) {
    const titre = (/RUBRIQUE : (.+)/.exec(tout) || [])[1]?.trim() || '';
    const id = idParTitre.get(titre) || '';
    const texte = (/<<<\n([\s\S]*?)\n>>>/.exec(tout) || [])[1] || '';
    const f = AJOUTS[corpus][id];
    return type('adaptation', json(f ? f(texte) : { remplacements: [], retraits: [], ajouts: [] }));
  }
  if (/formuler ses remarques sur le cahier des charges/.test(sys)) return type('remarques', json({ remarques: corpus === 'becquerel' ? REMARQUES : [] }));
  if (/le bloc « Notre compréhension de votre besoin »/.test(sys)) {
    if (/Le schéma de process est refusé/.test(dernier)) return type('compréhension (schéma corrigé)', json({ etapes: COMPREHENSION[corpus].etapes }));
    return type('compréhension', json(COMPREHENSION[corpus]));
  }
  if (/une PROPOSITION de réponse à une question du cahier des charges/.test(sys)) {
    const sujet = (/SUJET DE LA QUESTION : (.+)/.exec(tout) || [])[1] || '';
    const p = PROPOSITIONS.find((x) => x.motif.test(sujet)) || PROPOSITIONS[0];
    return type('proposition', json({ titre: p.titre, texte: p.texte }));
  }
  if (/^On te donne le texte d'une rubrique de mémoire technique et une liste numérotée d'exigences/.test(sys)) {
    const texte = (/TEXTE :\n([\s\S]*?)\n\nEXIGENCES :/.exec(tout) || [])[1] || '';
    const exigences = [...tout.split('EXIGENCES :\n').pop()!.matchAll(/^\d+\. (.+?) \(réponse GSS connue/gm)].map((m) => m[1]);
    const puces = exigences.filter((e) => (e.match(/\d+/g) || []).some((n) => !texte.includes(n))).slice(0, 2)
      .map((e) => `Nous respectons l'exigence du cahier des charges : ${e.charAt(0).toLowerCase()}${e.slice(1)}.`);
    return type('couverture', json({ puces }));
  }
  if (/supprimer les RÉPÉTITIONS entre rubriques/.test(sys)) {
    // Une suppression demandée dans une rubrique fixe (doit être ignorée), aucune ailleurs.
    const m = /=== (b2_valeurs) — [^\n]*\n([\s\S]*?)(?:\n=== |$)/.exec(tout);
    const phrase = m ? (m[2].split(/(?<=[.!?])\s+/).find((p) => p.length > 40 && !/\*\*/.test(p)) || '') : '';
    return type('répétitions', json({ suppressions: phrase ? [{ id: 'b2_valeurs', extrait: phrase.trim(), garde: 'b2_catalogue' }] : [] }));
  }
  if (/qui CONTREDIT une exigence/.test(sys)) return type('contradictions', json({ corrections: [] }));
  if (/Tu vérifies les horaires d'un mémoire technique/.test(sys)) return type('horaires', json({ corrections: [] }));
  if (/obligations chiffrées du cahier des charges dont le chiffre n'a pas été retrouvé/.test(sys)) {
    const ids = [...tout.matchAll(/^\[([a-z0-9_]+)\]/gm)].map((m) => m[1]);
    const oblig = (tout.split('NON RETROUVÉES :\n')[1] || '').split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean).slice(0, 1);
    const cible = ids.find((i) => /reunions/.test(i)) || ids.find((i) => /nouveau_marche/.test(i)) || ids[0];
    return type('obligations chiffrées', json({ puces: oblig.map((o) => ({ rubrique: cible, texte: `Nous appliquons l'obligation suivante du cahier des charges : ${o.replace(/^\[[^\]]+\]\s*/, '')}` })) }));
  }
  if (/Tu prépares la liste des informations à obtenir pour finaliser un mémoire technique GSS/.test(sys)) {
    const items = [...dernier.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({ question: m[2], sources: [Number(m[1])] }));
    return type('consolidation', json({ questions: items }));
  }
  if (/indique si les extraits de ses réponses d'appels d'offres précédentes y répondent DÉJÀ/.test(sys)) return type('réponses des mémoires', json({ reponses: [] }));
  if (/formule la question exacte à poser à un collègue de GSS/.test(sys)) {
    const qs = [...dernier.matchAll(/^### (\S+)\nSous-critère : (.*)\nPhrase : (.*)$/gm)].map((m) => ({ cle: m[1], question: `Quelle information faut-il inscrire à la place de « [À COMPLÉTER] » dans « ${m[3].slice(0, 120)} » (${m[2]}) ?`, groupe: m[1] }));
    return type('questions des emplacements', json({ questions: qs }));
  }
  if (/Tu conçois le schéma d'UNE page du mémoire technique de GSS/.test(sys)) {
    const texte = (/Texte de la page :\n"""\n([\s\S]*?)\n"""/.exec(tout) || [])[1] || '';
    const refus = msgs.filter((m) => /Ce schéma est refusé|Reprends le schéma de cette page/.test(contenu(m))).length;
    return type('schéma (SchemaService)', json(specDepuisTexte(texte, refus)));
  }
  if (/Dans la phrase \(ou la ligne de tableau\) donnée, l'emplacement/.test(sys)) {
    const info = (/Information fournie : (.+)/.exec(tout) || [])[1] || '';
    return type('intégration en place', json({ valeur: info.trim() }));
  }
  if (/Une information manquait à l'endroit marqué/.test(sys)) {
    const info = (/Information fournie : (.+)/.exec(tout) || [])[1] || '';
    return type('intégration (phrase)', json({ phrase: `${info.trim().replace(/\.$/, '')}.` }));
  }
  if (/Tu es l'assistant de modification d'un mémoire technique GSS/.test(sys)) return type('assistant (plan)', json(assistant.plan || { reponse: 'Je n\'ai rien modifié.', actions: [] }));
  if (/^Tu réécris une rubrique d'un mémoire technique GSS/.test(sys)) {
    const texte = (/Texte actuel :\n([\s\S]*?)\n\nConsigne de l'utilisateur : /.exec(tout) || [])[1] || '';
    const consigne = (/Consigne de l'utilisateur : (.+)/.exec(tout) || [])[1] || '';
    return type('assistant (réécriture)', json({ texte: assistant.texteModifie ? assistant.texteModifie(texte, consigne) : texte }));
  }
  if (/^Tu rédiges une nouvelle rubrique d'un mémoire technique GSS/.test(sys)) {
    return type('assistant (ajout)', json({ texte: `## Nos engagements environnementaux sur le site\n\nNos agents privilégient les transports en commun pour rejoindre le site, et nos véhicules d'astreinte sont entretenus selon un calendrier suivi par notre responsable d'exploitation.\n\n- Tri des déchets au poste de sécurité.\n- Dématérialisation des rapports dans la main courante électronique.\n\nLe bilan carbone de la prestation est présenté chaque année : [À COMPLÉTER]` }));
  }
  if (/Choisis la rubrique du mémoire où intégrer une information/.test(sys)) {
    const id = (/^(\S+) : /m.exec(dernier) || [])[1] || '';
    return type('assistant (choix de rubrique)', json({ id }));
  }
  inconnus.push(sys.slice(0, 160));
  return type('INCONNU', '{}');
}

/** Vecteur d'embedding déterministe (graine = empreinte du texte). */
export function embedding(texte: string): number[] {
  let graine = crypto.createHash('md5').update(texte).digest().readUInt32LE(0);
  const v: number[] = [];
  for (let i = 0; i < 1536; i++) {
    graine = (graine * 1664525 + 1013904223) >>> 0;
    v.push(graine / 4294967296 - 0.5);
  }
  return v;
}
