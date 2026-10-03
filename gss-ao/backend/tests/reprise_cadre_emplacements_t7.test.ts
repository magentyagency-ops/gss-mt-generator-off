import { describe, it, expect } from 'vitest';
import { questionsPubliposteParEmplacement, questionDeLEmplacement, texteBrut } from '../src/generation/memoire_type_cadre';

/** Tour 7 (T7CS-3) : texte du mémoire type repris tel quel dans le cadre, chaque [À COMPLÉTER] avec sa question exacte. */
const TEXTE = `**L'équipe dédiée à la Ville du Havre**
Après avoir analysé les besoins de la mission, nous avons construit une organisation de terrain et constitué l'équipe suivante :

| Catégorie de personnel | Qualification | Nombre | Observations |
|---|---|---|---|
| Agent de sécurité | CQP APS | [À COMPLÉTER] | |
| Agent cynophile | CQP APS – qualification cynophile | [À COMPLÉTER] | |

Nous mettons en place une équipe de [À COMPLÉTER] agents titulaires, qui assurent les missions de façon régulière. Dans le même temps, nous nous assurons de disposer d'une équipe suppléante de [À COMPLÉTER] agents formés au site, afin de pouvoir intervenir en cas d'absence des titulaires.`;
const MANQUANTES = [
  { variable: 'LIGNES_EQUIPE_DEDIEE', question: "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) ?", repere: true },
  { variable: 'EFFECTIF_AGENTS', question: "Combien d'agents titulaires compte l'équipe dédiée au marché ?", repere: true },
  { variable: 'NB_AGENTS_RENFORT', question: "Combien d'agents formés au site compte l'équipe suppléante (renfort) ?", repere: true },
];

describe('reprise du mémoire type dans le cadre (T7CS-3)', () => {
  const e = questionsPubliposteParEmplacement(TEXTE, MANQUANTES);
  it('une question par emplacement, les lignes du tableau précisées', () => {
    expect(e.map((x) => x.question)).toEqual([
      "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) — ligne « Agent de sécurité » ?",
      "Combien d'agents de cette catégorie compte l'équipe dédiée au marché (tableau de l'adéquation des moyens humains) — ligne « Agent cynophile » ?",
      "Combien d'agents titulaires compte l'équipe dédiée au marché ?",
      "Combien d'agents formés au site compte l'équipe suppléante (renfort) ?",
    ]);
  });
  it('chaque emplacement du document retrouve sa question par sa phrase', () => {
    const brut = texteBrut(TEXTE);
    expect(brut).toContain('Agent de sécurité : CQP APS : [À COMPLÉTER]');
    expect(questionDeLEmplacement('Agent cynophile : CQP APS – qualification cynophile : [À COMPLÉTER]', e)).toMatch(/ligne « Agent cynophile »/);
    expect(questionDeLEmplacement('Nous mettons en place une équipe de [À COMPLÉTER] agents titulaires, qui assurent les missions de façon régulière.', e)).toBe("Combien d'agents titulaires compte l'équipe dédiée au marché ?");
    expect(questionDeLEmplacement("Dans le même temps, nous nous assurons de disposer d'une équipe suppléante de [À COMPLÉTER] agents formés au site, afin de pouvoir intervenir en cas d'absence des titulaires.", e)).toBe("Combien d'agents formés au site compte l'équipe suppléante (renfort) ?");
    expect(questionDeLEmplacement('Date de fin de validité : [À COMPLÉTER]', e)).toBe('');
  });
});
