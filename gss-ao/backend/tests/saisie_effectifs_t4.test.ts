import { describe, it, expect } from 'vitest';
import { lireEffectifsSaisis, lignesTableauEquipe, accorderTableauEquipe } from '../src/generation/completion';

const TEXTE = `**L'équipe dédiée au CHB**
Après avoir analysé les besoins de la mission, nous avons construit une organisation de terrain et constitué l'équipe suivante :

| Catégorie de personnel | Qualification | Nombre | Observations |
|---|---|---|---|
| Chef d'équipe de sécurité incendie | SSIAP 2 | 6 | 168 h par semaine, soit 4,8 ETP |
| Agent de sécurité incendie | SSIAP 1 | 3 | 84 h par semaine, soit 2,4 ETP |

Nous mettons en place une équipe de 8 agents titulaires, qui assurent les missions de façon régulière.

**Les ressources de GSS**

| Catégorie de personnel | Qualification | Nombre |
|---|---|---|
| Agents SSIAP 1 | SSIAP 1 | 28 |
| Agents SSIAP 3 | SSIAP 1 – 2 – 3 | 2 |`;

/** Tour 4 (T4N-6) : la saisie d'un autre effectif total accorde le tableau de l'équipe dédiée à la phrase. */
describe('saisie d\'un autre effectif total (T4N-6)', () => {
  it('lecture de la réponse de GSS', () => {
    expect(lireEffectifsSaisis('8')).toEqual({ titulaires: 8, suppleants: undefined, details: 0 });
    expect(lireEffectifsSaisis('8 titulaires et 3 suppléants')).toEqual({ titulaires: 8, suppleants: 3, details: 0 });
    expect(lireEffectifsSaisis('8 agents titulaires, dont 6 agents de sécurité et 2 SSIAP 1, et 3 suppléants')).toEqual({ titulaires: 8, suppleants: 3, details: 2 });
  });

  it('seul le tableau de l\'équipe dédiée est lu (jamais celui des ressources de GSS)', () => {
    expect(lignesTableauEquipe(TEXTE).map((l) => l.nombre)).toEqual([6, 3]);
  });

  it('total seul pour plusieurs profils : les effectifs par profil deviennent à compléter, chacun avec son repère', () => {
    let n = 40;
    const r = accorderTableauEquipe(TEXTE, 8, true, () => `⟦AC:${++n}⟧`);
    expect(r.coherent).toBe(true);
    expect(r.texte).toContain("| Chef d'équipe de sécurité incendie | SSIAP 2 | [À COMPLÉTER]⟦AC:41⟧ | 168 h par semaine, soit 4,8 ETP |");
    expect(r.texte).toContain('| Agent de sécurité incendie | SSIAP 1 | [À COMPLÉTER]⟦AC:42⟧ |');
    expect(r.texte).toContain('| Agents SSIAP 1 | SSIAP 1 | 28 |');
    expect(r.aCompleter.map((x) => `${x.categorie} · ${x.qualification}`)).toEqual(["Chef d'équipe de sécurité incendie · SSIAP 2", 'Agent de sécurité incendie · SSIAP 1']);
  });

  it('effectifs détaillés qui ne font pas le total : incohérent, rien n\'est changé', () => {
    const r = accorderTableauEquipe(TEXTE, 8, false, () => '⟦AC:1⟧');
    expect(r.coherent).toBe(false);
    expect(r.texte).toBe(TEXTE);
  });

  it('somme déjà égale au total, ou une seule ligne : cohérent', () => {
    expect(accorderTableauEquipe(TEXTE, 9, true, () => '').coherent).toBe(true);
    const une = TEXTE.replace(/\| Agent de sécurité incendie \| SSIAP 1 \| 3 \|[^\n]*\n/, '');
    const r = accorderTableauEquipe(une, 8, true, () => '');
    expect(r.coherent).toBe(true);
    expect(r.texte).toContain("| Chef d'équipe de sécurité incendie | SSIAP 2 | 8 |");
  });
});
