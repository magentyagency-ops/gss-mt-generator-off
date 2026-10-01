import { describe, it, expect, afterEach } from 'vitest';
import {
  rubriquesV2, sectionsV2, chapitresV2, blocPagesReferences, schemaFixe, titreSchemaMemoireType, poserReperes, trierNouvelles,
  grouperNouvelles, idProposition, blocProposition, specProcessBesoin, specSecoursBesoin, messagePropositions, memoireTypeActif,
  court, texteSecoursBesoin, consigneComprehension, CLE_SCHEMA, protegerGras, retablirGras,
} from '../src/generation/reponse_libre_v2';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';
import { chargerMemoireType, planMemoireType, type PlanMemoireType } from '../src/generation/memoire_type';

/** Tests HORS LIGNE des fonctions de la réponse libre v2 (aucun appel au modèle). */

const mt = chargerMemoireType();
const toutVrai = Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE']));
const plan: PlanMemoireType = planMemoireType(mt, toutVrai);

describe('Réponse libre v2 : ordre de rendu', () => {
  it('suit les 5 blocs du mémoire type, compréhension d’abord', () => {
    const blocs = rubriquesV2(plan);
    expect(blocs.map((b) => b.cle)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(blocs[0].titre).toBe('Notre compréhension de votre besoin');
    expect(blocs[0].rubriques.map((r) => r.id)).toEqual(['b1_comprehension']);
    expect(chapitresV2(plan).II).toBe('Présentation de GSS');
  });

  it('insère les rubriques ajoutées après leur rubrique « apres », dans l’ordre d’ajout, sinon en fin de bloc', () => {
    const ajouts = [
      { id: 'q_a', chapter: 'V', title: 'A', apres: 'b5_controle_fond', proposition: true },
      { id: 'q_b', chapter: 'V', title: 'B', apres: 'b5_controle_fond', proposition: true },
      { id: 'x_c', chapter: 'IV', title: 'C' },
      { id: 'x_d', chapter: 'IX', title: 'D' },
    ];
    const ids = sectionsV2(plan, ajouts).map((r) => r.id);
    const i = ids.indexOf('b5_controle_fond');
    expect(ids.slice(i + 1, i + 3)).toEqual(['q_a', 'q_b']);
    const iv = rubriquesV2(plan, ajouts)[3].rubriques.map((r) => r.id);
    expect(iv[iv.length - 1]).toBe('x_c');
    // Chapitre inconnu : fin du dernier bloc.
    expect(ids[ids.length - 1]).toBe('x_d');
  });

  it('n’ajoute pas les pages statiques de références quand le mémoire type a ses rubriques de références', () => {
    expect(plan.rubriques.some((r) => r.ancienne_rubrique === 'b_references')).toBe(true);
    expect(blocPagesReferences(plan)).toBeNull();
    const sansRefs: PlanMemoireType = { ...plan, rubriques: plan.rubriques.filter((r) => r.ancienne_rubrique !== 'b_references') };
    expect(blocPagesReferences(sansRefs)).toBe('II');
  });

  it('schémas fixés par le mémoire type et titres des pages de schéma', () => {
    expect(schemaFixe(plan, 'b2_catalogue')).toBe(true);
    expect(schemaFixe(plan, 'b2_organigramme')).toBe(true);
    expect(schemaFixe(plan, 'b1_comprehension')).toBe(false);
    expect(schemaFixe(plan, 'q_inconnu')).toBe(false);
    expect(titreSchemaMemoireType('b2_valeurs', mt)).toBe('Nos trois valeurs');
    expect(titreSchemaMemoireType('b3_recrutement', mt)).toBe('Quatre étapes pour recruter nos agents');
    expect(titreSchemaMemoireType('b2_references_intro', mt)).toBeUndefined();
    expect(CLE_SCHEMA('b2_valeurs')).toBe('b2_valeurs#schema');
  });
});

describe('Réponse libre v2 : repères des données à compléter', () => {
  it('pose un repère en place par « [À COMPLÉTER] », avec la question du publipostage', () => {
    const sections: Record<string, string> = {
      a: "| Catégorie | Qualification | Nombre |\n|---|---|---|\n| Agent de sécurité | CQP APS | [À COMPLÉTER] |\n| Rondier | CQP APS | [À COMPLÉTER] |\n[CONSULTATION REQUISE : Nombre d'agents par catégorie.]\n\nUne équipe de [À COMPLÉTER] agents titulaires et une équipe de [À COMPLÉTER] agents en renfort.\n[CONSULTATION REQUISE : Nombre de titulaires.]\n[CONSULTATION REQUISE : Nombre d'agents en renfort.]",
    };
    const r = poserReperes(sections, ['a'], 10);
    expect(r.enPlace.map((e) => e.n)).toEqual([11, 12, 13, 14]);
    expect(r.enPlace[0].question).toBe("Nombre d'agents par catégorie — ligne « Agent de sécurité · CQP APS »");
    expect(r.enPlace[1].question).toBe("Nombre d'agents par catégorie — ligne « Rondier · CQP APS »");
    expect(r.enPlace[2].question).toBe('Nombre de titulaires.');
    expect(r.enPlace[3].question).toBe("Nombre d'agents en renfort.");
    expect(r.enPlace[2].contexte).toBe('Une équipe de [À COMPLÉTER] agents titulaires et une équipe de […] agents en renfort.');
    expect(sections.a).toContain('| Agent de sécurité | CQP APS | [À COMPLÉTER]⟦AC:11⟧ |');
    expect(sections.a).toContain('équipe de [À COMPLÉTER]⟦AC:13⟧ agents titulaires');
    expect(sections.a).not.toContain('CONSULTATION REQUISE');
    expect(r.enLigne).toEqual([]);
    expect(r.dernier).toBe(14);
  });

  it('garde la forme v1 pour un marqueur sans « [À COMPLÉTER] », laisse sans question un emplacement non marqué', () => {
    const sections: Record<string, string> = {
      b: "Texte de GSS.\n[CONSULTATION REQUISE : Question A]\n\nAu fil [CONSULTATION REQUISE : Question B] du texte.",
      c: 'Un délai de [À COMPLÉTER] minutes.',
    };
    const r = poserReperes(sections, ['b', 'c'], 0);
    expect(r.enLigne.map((x) => x.question)).toEqual(['Question A', 'Question B']);
    expect(sections.b).toBe('Texte de GSS.\n⟦AC:1⟧\n\nAu fil ⟦AC:2⟧ du texte.');
    expect(r.enPlace).toHaveLength(1);
    expect(r.enPlace[0].question).toBeUndefined();
    expect(sections.c).toBe('Un délai de [À COMPLÉTER]⟦AC:3⟧ minutes.');
  });

  it('ne repose pas de repère sur un emplacement qui a déjà le sien', () => {
    const sections: Record<string, string> = { d: 'Un délai de [À COMPLÉTER]⟦AC:4⟧ minutes.' };
    const r = poserReperes(sections, ['d'], 4);
    expect(r.enPlace).toHaveLength(0);
    expect(sections.d).toBe('Un délai de [À COMPLÉTER]⟦AC:4⟧ minutes.');
  });
});

describe('Réponse libre v2 : questions nouvelles', () => {
  it('rattache au mémoire type un sujet qu’il traite clairement, écarte l’administratif', () => {
    const nouvelles = [
      { exigence: 'Le titulaire organise des rondes avec contrôleur de rondes et pointeaux', rubrique: 'nouvelle', sujet: 'Rondes et contrôleur de rondes' },
      { exigence: 'Le PC sécurité est nettoyé et entretenu par le personnel du prestataire', rubrique: 'nouvelle', sujet: 'Entretien du PC sécurité' },
      { exigence: 'Pénalités de retard appliquées au titulaire', rubrique: 'nouvelle', sujet: 'Pénalités' },
    ];
    const r = trierNouvelles(mt, plan, nouvelles);
    expect(Object.keys(r.rattachees)).toContain('b4_rondes');
    expect(r.nouvelles.map((e) => e.sujet)).toEqual(['Entretien du PC sécurité']);
  });

  it('regroupe par sujet, bloquantes d’abord, 6 propositions au plus', () => {
    const e = (sujet: string, criticite = 'normal') => ({ exigence: `Exigence sur ${sujet}`, sujet, criticite, theme: 'V' });
    const r = grouperNouvelles([e('Entretien du PC sécurité'), e('Entretien du poste de sécurité'), e('Service minimal en cas de grève', 'bloquant'),
      e('Sujet un'), e('Sujet deux'), e('Sujet trois'), e('Sujet quatre'), e('Sujet cinq')], 6);
    expect(r.groupes).toHaveLength(6);
    expect(r.groupes[0].sujet).toBe('Service minimal en cas de grève');
    expect(r.groupes[1].exigences).toHaveLength(2);
    expect(r.ecartees.length).toBeGreaterThan(0);
  });

  it('identifiants uniques et bloc de chaque proposition', () => {
    const pris = new Set<string>(['q_entretien_du_pc_securite']);
    expect(idProposition('Entretien du PC sécurité', pris)).toBe('q_entretien_du_pc_securite_2');
    expect(blocProposition(mt, plan, { sujet: 'x', theme: 'III', exigences: [] })).toBe('III');
    // Thème I (bloc compréhension) ou inconnu : bloc de la rubrique la plus proche, sinon le dernier.
    expect(blocProposition(mt, plan, { sujet: 'Rondes de nuit', theme: 'I', exigences: [{ exigence: 'Rondes avec pointeaux et contrôleur de rondes' }] })).toBe('IV');
    expect(blocProposition(mt, plan, { sujet: 'Zzz', theme: '', exigences: [] })).toBe('V');
  });

  it('message d’accueil de l’assistant : propositions, pages, actions', () => {
    const m = messagePropositions([{ titre: 'Entretien du PC sécurité', page: 87 }, { titre: 'Service minimal' }]);
    expect(m).toContain('2 questions');
    expect(m).toContain('« Entretien du PC sécurité » (page 87)');
    expect(m).toContain('la valider telle quelle');
    expect(messagePropositions([])).toBe('');
  });
});

describe('Réponse libre v2 : bloc « compréhension »', () => {
  it('schéma de process : 2 à 5 étapes, dernière verte, textes courts', () => {
    const s = specProcessBesoin([
      { titre: 'Votre besoin', texte: 'PC sécurité 24 h/24', role: 'rouge (déclencheur)' },
      { titre: 'Vos enjeux', texte: 'Continuité de service', role: 'rouge' },
      { titre: 'Notre dispositif', texte: 'Une équipe formée au site avec un renfort mobilisable rapidement en cas de besoin urgent du client', role: 'orange' },
      { titre: 'Notre pilotage', texte: 'Interlocuteur unique', role: 'bleu' },
      { titre: 'Votre résultat', texte: 'Traçabilité', role: 'orange' },
      { titre: 'De trop', texte: 'x', role: 'vert' },
    ])!;
    expect(s.gabarit).toBe('flux');
    expect(s.params.etapes).toHaveLength(5);
    expect(s.params.etapes[0].role).toBe('rouge');
    expect(s.params.etapes[4].role).toBe('vert');
    expect(s.params.etapes[2].texte.length).toBeLessThanOrEqual(86);
    expect(specProcessBesoin([{ titre: 'Seule' }])).toBeNull();
    const c = specSecoursBesoin('## Votre contexte et votre site\nA\n## Le périmètre\nB\n## Vos attentes\nC\n## Les points de vigilance\nD');
    expect(c?.gabarit).toBe('chevrons');
    expect(c?.params.etapes.map((e: any) => e.titre)).toEqual(['Votre contexte et votre site', 'Le périmètre', 'Vos attentes', 'Les points de vigilance']);
    expect(court('Un titre beaucoup trop long pour une carte de schéma', 20)).toBe('Un titre beaucoup');
  });

  it('consigne : données du DCE citées, longueur demandée, exigences bloquantes d’abord', () => {
    const d = { client: "l'ACOSS", objet: 'Gardiennage', lots: 'lot 5', duree: '', sites: ['Site de Caen'], villes: ['Caen'], secteur: '', horaires: ['Ronde à 05H30'], obligations: ['Remplacement dans les UNE (1) heure'], qualifications: [], enjeux: [], prestations: ['rondes'], horsNormandie: false, amorce: "L'ACOSS nous consulte." };
    const m = consigneComprehension(d, { exigences: [{ exigence: 'Exigence normale' }, { exigence: 'Exigence éliminatoire', criticite: 'bloquant' }], motsMin: 350, motsMax: 600 });
    expect(m[0].content).toContain('350 à 600 mots');
    expect(m[1].content).toContain('« Ronde à 05H30 »');
    expect(m[1].content.indexOf('Exigence éliminatoire')).toBeLessThan(m[1].content.indexOf('Exigence normale'));
    expect(texteSecoursBesoin(d, '- Rondes du lundi au vendredi')).toContain("L'ACOSS nous consulte.");
  });
});

describe('Réponse libre v2 : texte de GSS intact', () => {
  it('deux lignes en gras consécutives ne sont pas fusionnées par le filtre des commentaires internes', () => {
    const t = '**Les sites de santé**\n**Site : Centre hospitalier du Rouvray — Saint-Étienne-du-Rouvray (76800)**\nEffectif : 2 agents.';
    expect(retirerCommentairesInternes(t).texte).not.toBe(t);
    expect(retablirGras(retirerCommentairesInternes(protegerGras(t)).texte)).toBe(t);
  });
});

describe('Réponse libre v2 : retour arrière', () => {
  const avant = process.env.GSS_MEMOIRE_TYPE;
  afterEach(() => { if (avant === undefined) delete process.env.GSS_MEMOIRE_TYPE; else process.env.GSS_MEMOIRE_TYPE = avant; });
  it('GSS_MEMOIRE_TYPE=non revient au plan v1', () => {
    delete process.env.GSS_MEMOIRE_TYPE;
    expect(memoireTypeActif()).toBe(true);
    process.env.GSS_MEMOIRE_TYPE = 'non';
    expect(memoireTypeActif()).toBe(false);
  });
});
