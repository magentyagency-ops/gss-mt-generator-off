/**
 * Tour 6, correcteur : réponse libre (propositions, engagements, répétitions entre rubriques, questions déjà traitées, plan
 * imposé par le RC).
 */
import { describe, it, expect } from 'vitest';
import { sansClauseSanction, motifRefusEngagement, questionCouverteParLeMemoire, appliquerSuppressionsRepetitions } from '../src/generation/memoire_generator';
import { controlerProposition, rubriquesV2 } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType } from '../src/generation/memoire_type';
import { ordonnerSelonRC, sousElementsRC, placeElementRC } from '../src/generation/memoire_type_cadre';

describe('engagement sans renvoi aux sanctions de l\'acheteur (T6-CONS-10)', () => {
  it('l\'obligation reste, la clause de pénalités part', () => {
    const e = 'GSS mobilisera un agent d’astreinte pour pallier au plus vite l’absence de l’agent, dans un délai de 30 minutes ; au-delà de 30 minutes d’attente, les dispositions des articles 10 et 15 du CCAP s’appliqueront.';
    expect(sansClauseSanction(e)).toBe('GSS mobilisera un agent d’astreinte pour pallier au plus vite l’absence de l’agent, dans un délai de 30 minutes.');
    expect(motifRefusEngagement(sansClauseSanction(e))).toBe('');
    expect(sansClauseSanction('Les pénalités prévues au CCAP sont appliquées en cas de retard.')).toBe('');
    expect(sansClauseSanction('GSS remet un rapport mensuel conformément à l’article 5 du CCAP.')).toBe('GSS remet un rapport mensuel conformément à l’article 5 du CCAP.');
  });
});

describe('proposition : commentaire du DCE, vérification interne, délai du DCE déjà engagé (T6-CONS-6)', () => {
  const dce = "--- CCTP ---\nEn cas de déclenchement d'alarme, le titulaire envoie un agent sur site en moins de 30 minutes.";
  const t = "Le chien porte une muselière ; l’agent veille à la propreté des locaux. Le PTI homologué est obligatoire. La conformité de l’application Beepiz à cette exigence doit être établie avant son utilisation : [À COMPLÉTER].\n[CONSULTATION REQUISE : confirmer la conformité de Beepiz]\n\nÀ chaque vacation, l’agent consigne rondes et incidents dans la main courante. En l’absence de personnel sur site, le DCE exige l’envoi d’un agent sur place en moins de 30 minutes ; GSS intervient dans le cadre de son organisation.\n\nCapacité opérationnelle à envoyer un agent sur le site en moins de 30 minutes : [À COMPLÉTER].\n[CONSULTATION REQUISE : confirmer la capacité opérationnelle à envoyer un agent sur le site en moins de 30 minutes]";
  const c = controlerProposition(t, [], dce);
  it('aucun commentaire interne imprimé', () => {
    expect(c.texte).not.toMatch(/doit être établie|le DCE exige|Capacité opérationnelle|CONSULTATION REQUISE/);
    expect(c.texte).toContain('Le PTI homologué est obligatoire.');
  });
  it('la vérification devient une question citée avec la phrase à laquelle elle renvoie ; le délai engagé n\'est pas redemandé', () => {
    expect(c.questions).toEqual(['Une proposition de réponse laissait ce point à vérifier avant la remise : « Le PTI homologué est obligatoire. La conformité de l’application Beepiz à cette exigence doit être établie avant son utilisation ». Pouvez-vous le confirmer ?']);
  });
});

describe('question sans citation déjà traitée par le mémoire (T6-CONS-15)', () => {
  const t = "## Le remplacement d'un agent absent : absence prévue\nNous planifions les absences.\n## Le suivi qualité\nNos contrôleurs réalisent un contrôle de fond une fois par mois et des contrôles inopinés une à trois fois par mois.";
  it.each([
    ['Quelle sera la fréquence des contrôles sur site ?', true],
    ["Quel plan de remplacement prévoyez-vous en cas d'absence de l'agent conducteur de chien ?", true],
    ['Quel délai de remplacement proposez-vous ?', false],
    ['Quel est le nom du responsable de site ?', false],
    ["Quelle procédure d'évacuation prévoyez-vous ?", false],
  ])('%s', (q, attendu) => expect(questionCouverteParLeMemoire(q, t)).toBe(attendu));
});

describe('répétitions entre rubriques (T6-CONS-5)', () => {
  const remplissage = ' Cette phrase de remplissage décrit le cadre général de la prestation et la qualité attendue du service rendu.'.repeat(12);
  it('phrase reprise par « L\'outil… » gardée ; puce d\'une énumération jamais retirée seule', () => {
    const sections: Record<string, string> = {
      a: `GSS organise les vacations de l'IFITS avec le logiciel de planification Comète. L'outil intègre les obligations de la convention collective.${remplissage}\n\nGSS applique une procédure de recrutement en plusieurs étapes :\n- un premier entretien téléphonique avec le chargé de recrutement de GSS ;\n- un second entretien dans les locaux de GSS avec le responsable d'exploitation ;\n- une vérification de la carte professionnelle et des diplômes du candidat.`,
      b: `Planification et recrutement.${remplissage}`,
    };
    const liste = [
      { id: 'a', garde: 'b', extrait: "GSS organise les vacations de l'IFITS avec le logiciel de planification Comète." },
      { id: 'a', garde: 'b', extrait: 'un premier entretien téléphonique avec le chargé de recrutement de GSS ;' },
      { id: 'a', garde: 'b', extrait: 'une vérification de la carte professionnelle et des diplômes du candidat.' },
    ];
    const n = appliquerSuppressionsRepetitions(sections, [{ id: 'a', title: 'Protection de la main-d’œuvre' }, { id: 'b', title: 'Autre' }], ['a', 'b'], liste);
    expect(n).toBe(0);
    expect(sections.a).toContain('logiciel de planification Comète. L\'outil intègre');
    expect((sections.a.match(/^- /gm) || []).length).toBe(3);
  });
  it('énumération entièrement redite : retirée avec son introduction', () => {
    const sections: Record<string, string> = {
      a: `${remplissage}\n\nGSS applique une procédure de recrutement en plusieurs étapes :\n- un premier entretien téléphonique avec le chargé de recrutement de GSS ;\n- un second entretien dans les locaux de GSS avec le responsable d'exploitation.\n\nFin de la rubrique avec une phrase qui conclut le propos de la partie.`,
      b: `Recrutement.${remplissage}`,
    };
    const liste = [
      { id: 'a', garde: 'b', extrait: 'un premier entretien téléphonique avec le chargé de recrutement de GSS ;' },
      { id: 'a', garde: 'b', extrait: "un second entretien dans les locaux de GSS avec le responsable d'exploitation." },
    ];
    appliquerSuppressionsRepetitions(sections, [{ id: 'a', title: 'Équipe' }, { id: 'b', title: 'Autre' }], ['a', 'b'], liste);
    expect(sections.a).not.toMatch(/plusieurs étapes|entretien/);
    expect(sections.a).toContain('Fin de la rubrique');
  });
});

describe('plan imposé par le RC : ordre des sous-éléments (T6-CONS-11)', () => {
  const mt = chargerMemoireType();
  const ordre = mt.rubriques.map((r) => r.id);
  const attendu = "2-2a Méthodologie d’intervention en cas d’intrusion, de conflit ou d’incident ; 2-2b Plan de remplacement en cas d’absence de l’agent conducteur de chien ; 2-2c Méthodologie de formation des agents aux spécificités du site ; 2-2d Fréquence des contrôles sur site ; 2-2e Moyens et méthodes d’échanges et de communication avec l’IFITS ; 2-2f Tout autre(s) moyen(s) organisationnel(s) mis en place";
  const p = { id: 'c2', title: '2-2 Moyens organisationnels', attendu };
  it('sous-éléments lus entiers et dans l\'ordre', () => {
    expect(sousElementsRC(p)).toHaveLength(6);
    expect(sousElementsRC(p)[1]).toBe('Plan de remplacement en cas d’absence de l’agent conducteur de chien');
  });
  it('rubriques rangées selon le sous-élément traité ; sans sous-élément : en fin de partie', () => {
    const ids = ['b3_interlocuteur_unique', 'b4_planification', 'b5_controle_trois_niveaux', 'b5_remplacement_prevu', 'b4_proc_intrusion'];
    const r = ordonnerSelonRC(mt, p, ids, ordre);
    expect(r.indexOf('b4_proc_intrusion')).toBeLessThan(r.indexOf('b5_remplacement_prevu'));
    expect(r.indexOf('b5_remplacement_prevu')).toBeLessThan(r.indexOf('b5_controle_trois_niveaux'));
    expect(r.slice(-2).sort()).toEqual(['b3_interlocuteur_unique', 'b4_planification']);
  });
  it('élément sans rubrique gardé à sa place', () => {
    const att21 = "2-1a Nombre d’agents conducteur de chien affecté pour le site ; 2-1b Nombre de contrôleurs affecté pour le site ; 2-1c Nombre d’agents présents au centre de permanence ; 2-1d CV et attestations de formation des équipes assurant les prestations ; 2-1e Tout autre(s) moyen(s) humain(s) mis en place";
    const p21 = { id: 'c1', title: '2-1 Moyens humains', attendu: att21 };
    const ids = ordonnerSelonRC(mt, p21, ['b3_formation_cynophile', 'b5_equipe_controle', 'b3_politique_formation'], ordre);
    expect(placeElementRC(mt, p21, 'Nombre d’agents présents au centre de permanence', ids)).toBe('b5_equipe_controle');
    const plan: any = { blocs: [{ id: 'rc_c1', cle: 'I', numero: 1, titre: '2-1 Moyens humains', rubriques: ids }], rubriques: ids.map((id) => ({ id, bloc: 'rc_c1', titre: id })) };
    const r = rubriquesV2(plan, [{ id: 'q_rc', chapter: 'I', title: 'Nombre d’agents présents au centre de permanence', apres: 'b5_equipe_controle', emplacementRC: true }])[0].rubriques.map((x) => x.id);
    expect(r.indexOf('q_rc')).toBe(r.indexOf('b5_equipe_controle') + 1);
  });
});
