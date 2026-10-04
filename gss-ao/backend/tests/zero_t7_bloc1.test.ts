// Tour 7 (correcteur) : bloc 1 Marine v3 — libellés EXIGENCE, article des chiffres, repère de consultation dans la liste,
// schéma de secours et renvois des puces ajoutées depuis les exigences du DCE (T7N-1, T7N-2, T7N-5, T7N-6, T7-CONS-4,
// T7-CONS-5, T7-CONS-6).
import { describe, it, expect } from 'vitest';
import { libelleExigenceBloc1, titreExigence, libelleBloc1Valide, anomaliesSchemaBloc1, etapesDesPuces, completerBesoinMinimum, MAX_LIBELLE_EXIGENCE } from '../src/generation/reponse_libre_v2';
import { pageBloc1Marine, articlesBloc1 } from '../src/generation/bloc1_marine';

describe('libellé EXIGENCE du bloc 1 (T7N-1, T7N-2, T7-CONS-5)', () => {
  const cas: Array<[string, string]> = [
    ['le personnel de remplacement dans les UNE (1) heure suivant la constatation', 'Remplacement sous 1 heure'],
    ['Le Titulaire du marché met en place un système d’astreinte au début du service de ses agents […]', 'Système d’astreinte au début du service'],
    ['[…] le Titulaire rédigera un compte-rendu qu’il transmettra sous huit jours à l\'EPCF pour validation', 'Compte-rendu sous 8 jours'],
    ['[…] et Régulations (PCR) doit être informé systématiquement des interventions dans les 3 minutes […]', 'Information des interventions sous 3 minutes'],
    ['Les interventions seront effectuées sur le site en alerte par l’intervenant TLS dans un délai de 15 minutes à compter de la levée de doute', 'Interventions sous 15 minutes'],
    ['En cas de déclenchement de l’alarme intrusion du bâtiment principal, à un moment sans présence du personnel, le prestataire intervient sur site en 30 minutes', 'Intervention sur site en 30 minutes'],
    ['Le titulaire a 10 jours pour faire part de ses observations', 'Observations sous 10 jours'],
    ['Effectuer la ronde d’ouverture du lundi au vendredi à 05h30 et la ronde de fermeture du lundi au vendredi à 21h30', 'Rondes d’ouverture et de fermeture'],
    ['présent sur site dans un délai maximal de 30 minutes', 'Présent sur site en 30 minutes'],
  ];
  for (const [c, attendu] of cas) it(`« ${c.slice(0, 60)}… » → « ${attendu} »`, () => {
    expect(libelleExigenceBloc1('', c)).toBe(attendu);
    expect(libelleBloc1Valide(attendu)).toBe(true);
  });
  it('libellés refusés : nombre en capitales, verbe conjugué, durée seule, intervalle ou locution coupés', () => {
    for (const x of ['Remplacement dans les UNE heure', 'Et Régulations (PCR)', 'Interventions seront effectuées', '10 jours', 'Effectuer la ronde d’ouverture du lundi',
      'Dans un délai maximal de deux heures à compter', 'Au minimum 72 heures avant la prise', 'Compte-rendu qu’il transmettra', 'Marché met en place un système', 'Rédigera un compte-rendu']) expect(libelleBloc1Valide(x), x).toBe(false);
    expect(libelleBloc1Valide('Au minimum 72 heures avant la prise de service')).toBe(true);
    expect(libelleBloc1Valide('A minima 5 jours ouvrés')).toBe(false);
  });
  it('titre de carte : jamais un sujet coupé avant son verbe ni un groupe coupé (T7N-5)', () => {
    expect(titreExigence('Le contrôle de surveillance à distance doit être actif 365 jours sur 365, 24 heures sur 24', 34)).toBe('');
    expect(titreExigence('assurer au centre de permanence un retour des caméras 24 h/24, toute l’année, pour interagir avec l’agent sur site', MAX_LIBELLE_EXIGENCE)).toBe('Assurer un retour des caméras 24 h/24');
    expect(titreExigence('Les jours de week-end et/ou fériés indiqués à l’annexe 2 : une ronde de jour d’une heure, à effectuer entre 6 h et 21 h', MAX_LIBELLE_EXIGENCE)).toBe('Ronde de jour d’une heure');
    expect(titreExigence('environ 50 puis 120 pointeaux à contrôler', 34)).toBe('Environ 50 puis 120 pointeaux');
  });
});

describe('tableau « Vos attentes » (T7-CONS-5, T7N-6)', () => {
  const rangs = (t: string) => pageBloc1Marine(t, {}, { sources: false, bandeau: false }).split('\n').filter((l) => /^\| (?!Exigence|---)/.test(l));
  it('ifsem 1772 : libellés entiers, action de GSS jamais en libellé', () => {
    const t = ['## Vos attentes et nos engagements',
      '- **« dans un délai maximal de deux heures à compter du début de la vacation concernée »** : nous traitons l’absence inopinée selon le dispositif de remplacement prévu → notre réponse : « Le remplacement d’un agent absent : absence non prévue », développé au bloc 5.',
      '- **« Au minimum 72 heures avant la prise de service d’un agent, le titulaire doit »** transmettre les informations et justificatifs requis : nous préparons les éléments d’affectation → notre réponse : « L’intégration d’un nouvel agent », développé au bloc 5.',
      '- **« Les horaires précis de début et de fin de chaque ronde doivent être consignés dans la main courante »** : les agents consignent les rondes, alarmes et événements dans la main courante numérique → notre réponse : « La main courante électronique », développée au bloc 4.'].join('\n');
    const r = rangs(t).map((l) => l.split('|')[1].trim());
    expect(r).toEqual(['Remplacement d’un agent absent sous 2 heures', 'Au minimum 72 heures avant la prise de service', 'Horaires précis de chaque ronde consignés']);
    expect(rangs(t)[2].split('|')[3]).toMatch(/^ Les agents consignent les rondes/);
  });
  it('puce placée après un repère ⟦AC:n⟧ : gardée dans le tableau, repère après le tableau (s2e)', () => {
    const t = ['## Les points de vigilance identifiés et nos réponses', '- **Respect des délais** : en cas d’incapacité → notre réponse : « La planification » (bloc 4)', '⟦AC:1⟧', '- **Communiquer à l’acheteur les mesures** d’information des personnels ; informer sans délai l’acheteur.', '', '## Notre réponse'].join('\n');
    const p = pageBloc1Marine(t, {}, { sources: false, bandeau: false });
    expect(rangs(t)).toHaveLength(2);
    expect(p).not.toMatch(/^- \*\*Communiquer/m);
    expect(p).toMatch(/\|\n\n⟦AC:1⟧/);
  });
});

describe('article du CCTP d’un chiffre du bloc 1 (T7-CONS-6)', () => {
  it('le délai cité prend l’article de la ligne de sa citation, jamais celui d’une durée (« dure environ 2h »)', () => {
    const dce = ['--- CCTP ---', 'ARTICLE 2 : RONDES', 'Cette ronde générale dure environ 2h.', 'ARTICLE 5 : MODALITES DE REMPLACEMENT', 'En cas d’absence inopinée d’un agent, le titulaire assure son remplacement dans un délai maximal de deux heures à compter du début de la vacation concernée.'].join('\n');
    const t = '## Vos attentes et nos engagements\n- **« dans un délai maximal de deux heures à compter du début de la vacation concernée »** : nous traitons l’absence → notre réponse : « Le remplacement d’un agent absent », développé au bloc 5.';
    expect(articlesBloc1(t, dce)['attentes|2h']).toBe('5');
  });
});

describe('schéma de secours du bloc 1 (T7-CONS-4, T7N-5)', () => {
  it('carte coupée sur un verbe modal, à la voix de l’acheteur ou sans sujet : refusée', () => {
    const a = anomaliesSchemaBloc1({ gabarit: 'flux', params: { etapes: [
      { titre: 'Au minimum 72 heures', texte: 'Avant la prise de service d’un agent, le titulaire doit' },
      { titre: 'Le contrôle de surveillance', texte: 'À distance doit être actif 365 jours sur 365' },
      { titre: 'Votre résultat', texte: 'Continuité de service et traçabilité de chaque intervention' },
    ] } }).join(' | ');
    expect(a).toMatch(/étape 1 .*coupé sur un verbe/);
    expect(a).toMatch(/étape 1 .*voix de l'acheteur/);
    expect(a).toMatch(/étape 2 .*sans sujet/);
  });
  it('citation coupée suivie de sa fin hors du gras : la proposition entière', () => {
    const e = etapesDesPuces('## Vos attentes et nos engagements\n- **« Au minimum 72 heures avant la prise de service d’un agent, le titulaire doit »** transmettre les informations et justificatifs requis : nous préparons les éléments d’affectation → notre réponse : « L’intégration d’un nouvel agent », développé au bloc 5.');
    expect(e.map((x) => `${x.titre} ${x.texte}`).join(' | ')).not.toMatch(/titulaire doit$/);
  });
  it('puces ajoutées depuis le DCE : renvoi seulement à une rubrique qui traite l’exigence', () => {
    const plan: any = { blocs: [{ id: 'b4', numero: 4, rubriques: ['b5_evenementiel', 'b4_proc_alarme'] }], rubriques: [
      { id: 'b5_evenementiel', bloc: 'b4', titre: 'Le dispositif événementiel', mode: 'fixe' },
      { id: 'b4_proc_alarme', bloc: 'b4', titre: "Notre socle de procédures : l'intervention sur alarme et la télésurveillance", mode: 'fixe' }] };
    const r = completerBesoinMinimum('## Vos attentes et nos engagements\n\n## Les points de vigilance identifiés et nos réponses\n', [
      { exigence: 'Prestations de semaine le matin de 5 h à 8 h et le soir de 17 h à 20 h, selon le calendrier de l’annexe 2', rubrique: 'b5_evenementiel' },
      { exigence: 'Le contrôle de surveillance à distance doit être actif 365 jours sur 365, 24 heures sur 24', rubrique: 'b4_proc_alarme' },
    ], plan, '').texte;
    expect(r).not.toMatch(/semaine[^\n]*événementiel/);
    expect(r).toMatch(/365[^\n]*→ notre réponse : « Notre socle de procédures/);
  });
});

describe('libellé EXIGENCE : jamais une préposition prise pour l’attribut (T7N-1)', () => {
  it('« le titulaire doit être en capacité d’envoyer… en moins de 30 minutes »', () => {
    const c = "En cas de déclenchement de l’alarme intrusion du bâtiment principal, à un moment sans présence du personnel de l’IFITS et/ou de l’agent conducteur de chien, le titulaire doit être en capacité d’envoyer sur le site un agent pour intervention en moins de 30 minutes";
    const t = titreExigence(c, 46);
    expect(t).not.toMatch(/en sous|Titulaire en/);
    expect(libelleBloc1Valide(t, 46)).toBe(true);
    expect(libelleExigenceBloc1('', c, MAX_LIBELLE_EXIGENCE)).not.toMatch(/Titulaire en/);
  });
});

describe('libellés en gras du modèle contrôlés dans le tableau « Vos attentes » (T7N-2, T7-CONS-5, fontainebleau 801)', () => {
  const colonne = (puces: string) => [...pageBloc1Marine(`## Vos attentes et nos engagements\n\n${puces}\n`).matchAll(/^\| ([^|]+?) \| (.*?) \|/gm)].map((m) => [m[1], m[2]]).slice(1).filter((r) => r[0] !== '---');
  it('phrase complète, coordination coupée, lieu suivi d’un infinitif, gras coupé dans son groupe, date', () => {
    const r = colonne([
      '- **Un chef d’équipe** doit être présent tous les jours et pendant toute la durée d’ouverture des jardins : du 1er mai au 30 septembre de 8 h 30 à 20 h → notre réponse : « L\'adéquation de nos moyens humains avec votre besoin », développée au bloc 3.',
      '- **SST ou du PSC1** : Chaque agent doit être titulaire du SST ou du PSC1 ; les remises à niveau doivent être maintenues → notre réponse : « Formations et certifications », développée au bloc 3.',
      '- **Les jardins et cours, organiser les rondes** : Dans les jardins et cours, organiser les rondes pour que chacun soit parcouru par au moins un agent toutes les 30 minutes → notre réponse : « Le contrôleur de rondes », développée au bloc 4.',
      '- **Communiquer à l’acheteur les mesures** d’information des personnels et de remédiation aux manquements aux principes d’égalité, de laïcité et de neutralité.',
      '- **Journée portes ouvertes** du samedi 30 janvier 2027 : gardiennage de 8 h à 14 h, puis une ronde de nuit comme un samedi habituel.',
      '- **Le contrôle de surveillance à distance** doit être actif 365 jours sur 365, 24 heures sur 24.',
    ].join('\n'));
    expect(r.map((x) => x[0])).toEqual(['Chef d’équipe présent tous les jours', 'Être titulaire du SST ou du PSC1', 'Rondes dans les jardins et cours',
      'Mesures d’information des personnels', 'Journée portes ouvertes', 'Contrôle de surveillance à distance']);
    expect(r[0][1]).toMatch(/^Un chef d’équipe doit être présent tous les jours et pendant toute la durée d’ouverture des jardins : du 1er mai/);
    expect(r[4][1]).toMatch(/samedi 30 janvier 2027 : gardiennage/);
  });
  it('libellés tirés des citations : délai porté, sigle et lot', () => {
    expect(libelleExigenceBloc1('', 'le Titulaire doit dépêcher sur le site le personnel de remplacement dans les DEUX (2) heures suivant la constatation')).toBe('Personnel de remplacement sous 2 heures');
    expect(libelleExigenceBloc1('', 'Lot 1 : affecter un premier agent SSIAP 1/CQP APS de 21h à 9h du lundi au samedi toute l’année')).toBe('Lot 1 : premier agent SSIAP 1/CQP APS');
    expect(libelleBloc1Valide('SST ou du PSC1')).toBe(false);
    expect(libelleBloc1Valide('Respect des horaires et des consignes')).toBe(true);
  });
});

