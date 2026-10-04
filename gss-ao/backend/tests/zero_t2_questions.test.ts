// Campagne « zéro défaut », tour 2 : questions de l'assistant rattachées au bon emplacement (T2-CONS-6).
import { describe, it, expect } from 'vitest';
import { poserReperes } from '../src/generation/reponse_libre_v2';
import { chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';

describe('question de chaque emplacement « [À COMPLÉTER] » (T2-CONS-6, génération réelle cstb 1201)', () => {
  const texte = `| Catégorie de personnel | Qualification | Nombre | Observations |
|---|---|---|---|
| Rondier intervenant | CQP APS | [À COMPLÉTER] | |
[CONSULTATION REQUISE : Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) ?] Les effectifs sont détaillés en distinguant les agents œuvrants de l'encadrement.

Nous mettons en place une équipe de [À COMPLÉTER] agents titulaires. Dans le même temps, nous disposons d'une équipe suppléante de [À COMPLÉTER] agents formés au site.
[CONSULTATION REQUISE : Combien d'agents titulaires compte l'équipe dédiée au marché ?]

[CONSULTATION REQUISE : Combien d'agents formés au site compte l'équipe suppléante (renfort) ?] Les copies des attestations sont tenues à disposition.`;
  it('l’équipe suppléante reçoit sa question, aucune question sans emplacement, aucun marqueur dans le texte', () => {
    const s: Record<string, string> = { a: texte };
    const r = poserReperes(s, ['a']);
    expect(r.enPlace.map((e) => e.question)).toEqual([
      "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) ?",
      "Combien d'agents titulaires compte l'équipe dédiée au marché ?",
      "Combien d'agents formés au site compte l'équipe suppléante (renfort) ?",
    ]);
    expect(r.enLigne).toEqual([]);
    expect(s.a).not.toMatch(/CONSULTATION REQUISE/);
    expect(s.a).toMatch(/\[À COMPLÉTER\]⟦AC:1⟧ \| \|\n\nLes effectifs sont détaillés/);
  });
  it('une ligne de tableau par emplacement garde la question commune, précisée par sa ligne', () => {
    const s: Record<string, string> = { a: "| A | B | Nombre |\n|---|---|---|\n| Agent | CQP | [À COMPLÉTER] |\n| Chef | SSIAP 2 | [À COMPLÉTER] |\n[CONSULTATION REQUISE : Combien d'agents de cette catégorie ?]" };
    const r = poserReperes(s, ['a']);
    expect(r.enPlace.map((e) => e.question)).toEqual(["Combien d'agents de cette catégorie — ligne « Agent · CQP » ?", "Combien d'agents de cette catégorie — ligne « Chef · SSIAP 2 » ?"]);
  });
});

describe('marché de rondes ponctuelles sans poste : une seule ligne d’équipe (T2-CONS-6)', () => {
  it('« Rondier intervenant » seul, jamais « Agent de sécurité » en plus', () => {
    const prep: any = preparerMemoireType({ analyse: { clientName: 'CSTB' }, dce: 'Prestations de rondes de surveillance du site, 38400 Saint-Martin-d’Hères. 3 rondes entre 21h30 et 06h30.', referents: '', dimensionnement: { profils: [], rondesSansDuree: ['3 rondes, entre 21h30 et 06h30'], titulaires: 0, suppleants: 0, casPratique: [] } } as any, { memoireType: chargerMemoireType() });
    const v = String(prep.variables.LIGNES_EQUIPE_DEDIEE.valeur);
    expect(v).toMatch(/Rondier intervenant/);
    expect(v).not.toMatch(/Agent de sécurité/);
  });
});
