import { describe, it, expect } from 'vitest';
import { estValidation, lireEffectifsSaisis, lireEffectifsParProfil, appliquerEffectifsParProfil } from '../src/generation/completion';
import { messageDimensionnement } from '../src/generation/dimensionnement';

/** Tour 9 (T9N-3) : les deux phrases d'exemple du premier message de l'assistant sont comprises. */
const TABLEAU = ['| Catégorie de personnel | Qualification | Nombre | Observations |', '|---|---|---|---|', "| Chef d'équipe de sécurité incendie | SSIAP 2 | 5 | 168 h par semaine, soit 5,44 ETP |", '| Agent de sécurité incendie | SSIAP 1 | 6 | 200 h |', '| Agent de sécurité | CQP APS | 4 | 120 h |', '', 'Nous mettons en place une équipe de 15 agents titulaires.'].join('\n');

describe('réponse à la proposition de dimensionnement (T9N-3)', () => {
  it('exemples du premier message : « Je valide les effectifs proposés » valide, « Mets 7 agents SSIAP 2… » change une ligne', () => {
    const msg = messageDimensionnement({ profils: [], titulaires: 0, suppleants: 0, casPratique: [] } as any);
    const [valide, modifie] = [...msg.matchAll(/« ([^»]+) »/g)].map((m) => m[1]);
    expect(valide).toBe('Je valide les effectifs proposés');
    expect(estValidation(valide)).toBe(true);
    expect(lireEffectifsParProfil(modifie)).toEqual([{ nombre: 7, profil: 'agents SSIAP 2' }]);
    expect(lireEffectifsSaisis(modifie).titulaires).toBeUndefined();
  });
  it('validations sans chiffre reconnues ; réserve, refus ou chiffre : jamais une validation', () => {
    for (const v of ['je valide', 'Je valide tel quel', 'Je valide la proposition.', 'OK pour moi', 'Validé, merci']) expect([v, estValidation(v)]).toEqual([v, true]);
    for (const v of ['Je ne valide pas', 'OK mais retire le maître-chien', 'Je valide avec 8 titulaires', 'non', 'Mets 7 agents SSIAP 2']) expect([v, estValidation(v)]).toEqual([v, false]);
  });
  it('effectif par profil : seule la ligne du profil change, le total des titulaires suit la somme du tableau', () => {
    const r = appliquerEffectifsParProfil({ b3: TABLEAU, b2: "L'équipe dédiée de 15 agents titulaires." }, lireEffectifsParProfil("Mets 7 agents SSIAP 2 dans l'équipe dédiée"), '15')!;
    expect(r.total).toBe(17);
    expect(r.sections.b3).toMatch(/\| SSIAP 2 \| 7 \|/);
    expect(r.sections.b3).toMatch(/\| SSIAP 1 \| 6 \|/);
    expect(r.sections.b3).toMatch(/\| CQP APS \| 4 \|/);
    expect(r.sections.b3).not.toMatch(/À COMPLÉTER/);
    expect(r.sections.b3).toMatch(/équipe de 17 agents titulaires/);
    expect(r.sections.b2).toMatch(/équipe dédiée de 17 agents titulaires/);
    // « 6 ADS » : la ligne des agents de sécurité.
    expect(appliquerEffectifsParProfil({ b3: TABLEAU }, lireEffectifsParProfil('6 ADS'), '15')!.sections.b3).toMatch(/\| CQP APS \| 6 \|/);
    // Profil absent du tableau : rien n'est fait sans modèle.
    expect(appliquerEffectifsParProfil({ b3: TABLEAU }, lireEffectifsParProfil('2 maîtres-chiens'), '15')).toBeNull();
  });
  it('saisie complète (titulaires, détail, suppléants) : lue comme avant', () => {
    expect(lireEffectifsSaisis('8 agents titulaires, dont 6 agents de sécurité et 2 SSIAP 1, et 3 suppléants')).toEqual({ titulaires: 8, suppleants: 3, details: 2 });
    expect(lireEffectifsSaisis('8')).toEqual({ titulaires: 8, suppleants: undefined, details: 0 });
  });
});
