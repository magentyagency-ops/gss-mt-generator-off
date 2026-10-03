import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, evaluerIndicateurs } from '../src/generation/memoire_type';

// T6C-1 : un rattachement de la matrice (fait par le modèle) ne rend un indicateur vrai que si le texte de l'exigence
// contient le motif de l'indicateur.
const DCE = (n: string) => fs.readFileSync(path.join(__dirname, '../../_corpus_verif/_dce_textes', `${n}.txt`), 'utf-8');
const mt = chargerMemoireType();

describe('Indicateurs : rattachement de la matrice contrôlé par le motif (T6C-1)', () => {
  it('caen : « mobiliser les équipes … en cas de sinistre » rattaché à b5_evenementiel n\'ouvre pas l\'événementiel', () => {
    const e = evaluerIndicateurs(mt, { dce: DCE('caen'), analyse: { clientName: 'ACOSS' }, matrice: [{ rubrique: 'b5_evenementiel', exigence: "Pouvoir mobiliser les équipes nécessaires dans un délai de 2 heures en cas de sinistre ou d'incident grave mettant en jeu la sécurité des biens et des personnes." }] } as any);
    expect(e.EVENEMENTIEL.valeur).toBe(false);
  });
  it('cstb : une levée de doute rattachée à b5_defaillance_ssi n\'ouvre pas la défaillance SSI', () => {
    const e = evaluerIndicateurs(mt, { dce: DCE('cstb'), analyse: { clientName: 'CSTB' }, matrice: [{ rubrique: 'b5_defaillance_ssi', exigence: "Le candidat doit indiquer le délai moyen maximum d'intervention sur site pour une levée de doute après appel de la télésurveillance." }] } as any);
    expect(e.DEFAILLANCE_SSI.valeur).toBe(false);
  });
  it('une exigence rattachée qui contient le motif rend toujours l\'indicateur vrai', () => {
    const e = evaluerIndicateurs(mt, { dce: 'Gardiennage de bureaux.', analyse: {}, matrice: [{ rubrique: 'b5_evenementiel', exigence: 'Renforts pour les manifestations culturelles du site.' }] } as any);
    expect(e.EVENEMENTIEL.valeur).toBe(true);
  });
});

describe('Exigence dont la rubrique de la matrice est hors du plan (T6C-1)', () => {
  it('caen : la mobilisation sur sinistre rattachée à b5_evenementiel (hors plan) va à la rubrique de son thème, pas aux questions nouvelles', async () => {
    const { preparerMemoireType, exigencesParRubrique } = await import('../src/generation/memoire_type');
    const ctx: any = { dce: DCE('caen'), analyse: { clientName: 'ACOSS' }, matrice: [{ rubrique: 'b5_evenementiel', exigence: "Pouvoir mobiliser les équipes nécessaires dans un délai de 2 heures en cas de sinistre ou d'incident grave mettant en jeu la sécurité des biens et des personnes." }] };
    const p = preparerMemoireType(ctx);
    expect(p.plan.rubriques.some((r) => r.id === 'b5_evenementiel')).toBe(false);
    const r = exigencesParRubrique(p.mt, p.plan, ctx.matrice);
    expect(r.nouvelles).toEqual([]);
    expect(Object.keys(r.parRubrique)).toEqual(['b4_proc_ordre_alerte']);
  });
});

describe('Plan de prévention : rubrique du démarrage, jamais la planification (T6C-9)', () => {
  it('caen : l\'exigence du plan de prévention va à « L\'intégration d\'un nouveau marché » ; la planification refuse cet ajout', async () => {
    const { preparerMemoireType, exigencesParRubrique, sujetDeRubrique, dansLeSujet } = await import('../src/generation/memoire_type');
    const e = { rubrique: 'b4_planification', exigence: "Établir et remettre au pouvoir adjudicateur et aux organismes d'hygiène et de sécurité un plan de prévention dans les 15 jours suivant la notification." };
    const p = preparerMemoireType({ dce: DCE('caen'), analyse: { clientName: 'ACOSS' }, matrice: [e] } as any);
    expect(Object.keys(exigencesParRubrique(p.mt, p.plan, [e]).parRubrique)).toEqual(['b5_nouveau_marche']);
    const planif = p.mt.rubriques.find((r) => r.id === 'b4_planification')!;
    expect(dansLeSujet('Nous établissons et remettons au pouvoir adjudicateur un plan de prévention détaillant les risques.', sujetDeRubrique(planif))).toBe(false);
    expect(dansLeSujet('Les plannings mensuels sont transmis 10 jours avant le début du mois.', sujetDeRubrique(planif))).toBe(true);
  });
});
