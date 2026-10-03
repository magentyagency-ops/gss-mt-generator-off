// T10N-1, T10N-2, T10N-3 : réponse à la proposition de dimensionnement dans la conversation, profil écrit avant son effectif,
// schéma « spec » de l'équipe dédiée publié de nouveau avec les effectifs du texte.
import { describe, it, expect } from 'vitest';
import { lireEffectifsParProfil, lireEffectifsSaisis, effectifsDuTexte, appliquerEffectifsParProfil } from '../src/generation/completion';
import { reponseAuDimensionnement } from '../src/generation/assistant_memoire';
import { exempleModification, messageDimensionnement } from '../src/generation/dimensionnement';
import { chargerMemoireType, variablesDuSchema, republierSchemaSpec } from '../src/generation/memoire_type';

const TABLEAU = ['| Catégorie de personnel | Qualification | Nombre | Observations |', '|---|---|---|---|', "| Chef d'équipe de sécurité incendie | SSIAP 2 | 6 | 168 h |", '| Agent de sécurité incendie | SSIAP 1 | 3 | 84 h |', '', 'Nous mettons en place une équipe de 9 agents titulaires, et une équipe suppléante de 3 agents formés au site.'].join('\n');

describe('profil écrit avant son effectif (T10N-3)', () => {
  for (const m of ['Passe les SSIAP 1 à 4', 'SSIAP 1 : 4', 'SSIAP 1 = 4', 'les SSIAP 1 passent à 4', '4 pour les SSIAP 1']) {
    it(m, () => {
      expect(lireEffectifsParProfil(m)).toEqual([{ nombre: 4, profil: 'SSIAP 1' }]);
      expect(lireEffectifsSaisis(m).titulaires).toBeUndefined();
      const r = appliquerEffectifsParProfil({ b3: TABLEAU }, lireEffectifsParProfil(m), '9')!;
      expect(r.total).toBe(10);
      expect(r.sections.b3).toMatch(/\| SSIAP 1 \| 4 \|/);
      expect(r.sections.b3).toMatch(/équipe de 10 agents titulaires/);
    });
  }
  it('un profil nommé sans « titulaires » n’est jamais un total ; un horaire n’est pas un effectif', () => {
    expect(lireEffectifsSaisis('les SSIAP 1 doivent être 4').titulaires).toBeUndefined();
    expect(lireEffectifsParProfil('Les SSIAP 1 de 9 h à 18 h')).toEqual([]);
    expect(lireEffectifsSaisis('8')).toEqual({ titulaires: 8, suppleants: undefined, details: 0 });
    expect(lireEffectifsParProfil('SSIAP 1 : 4 et SSIAP 2 : 3')).toEqual([{ nombre: 4, profil: 'SSIAP 1' }, { nombre: 3, profil: 'SSIAP 2' }]);
  });
});

describe('réponse à la proposition écrite dans la conversation (T10N-1)', () => {
  it('validation des effectifs, effectifs par profil ou titulaires : traités comme la saisie', () => {
    for (const m of ['Je valide les effectifs proposés', "Mets 7 agents SSIAP 2 dans l'équipe dédiée", 'Passe les SSIAP 1 à 4', '8 agents titulaires et 3 suppléants']) expect([m, reponseAuDimensionnement(m)]).toEqual([m, true]);
  });
  it('autres demandes : jamais prises pour une réponse au dimensionnement', () => {
    for (const m of ['oui', 'Je valide la proposition sur le service minimal', 'Ajoute 2 rondes par nuit', 'Mets 2 agents de plus au PC']) expect([m, reponseAuDimensionnement(m)]).toEqual([m, false]);
  });
  it('l’exemple du premier message est un profil du marché, lisible par l’assistant', () => {
    const d: any = { profils: [{ profil: 'Agent de sécurité', qualification: 'CQP APS', titulaires: 5 }], titulaires: 5, suppleants: 2, casPratique: [] };
    expect(exempleModification(d)).toBe("Mets 6 agents de sécurité dans l'équipe dédiée");
    expect(lireEffectifsParProfil(exempleModification(d))).toEqual([{ nombre: 6, profil: 'agents de sécurité' }]);
    const cp: any = { profils: [], titulaires: 0, suppleants: 0, casPratique: [{ plage: 'Samedi, 21 h–6 h', profil: 'maître-chien', enService: 2, rotation: '2 × 9 h' }] };
    expect(exempleModification(cp)).toBe('Mets 3 maîtres-chiens en service sur la plage « Samedi, 21 h–6 h »');
    expect(messageDimensionnement(cp)).toMatch(/« Mets 3 maîtres-chiens en service sur la plage « Samedi, 21 h–6 h » »/);
  });
});

describe('schéma de l’équipe dédiée accordé aux effectifs du texte (T10N-2)', () => {
  it('effectifs lus dans le texte : somme du tableau, équipe suppléante', () => {
    expect(effectifsDuTexte({ b3: TABLEAU })).toEqual({ EFFECTIF_AGENTS: '9', NB_AGENTS_RENFORT: '3' });
    expect(effectifsDuTexte({ b3: TABLEAU.replace('| 3 |', '| 4 |') }).EFFECTIF_AGENTS).toBe('10');
  });
  it('le schéma « spec » de b3_adequation écrit la nouvelle valeur', () => {
    const mt = chargerMemoireType();
    expect(variablesDuSchema(mt, 'b3_adequation')).toEqual(expect.arrayContaining(['EFFECTIF_AGENTS', 'NB_AGENTS_RENFORT']));
    const s = republierSchemaSpec(mt, 'b3_adequation', { EFFECTIF_AGENTS: '10', NB_AGENTS_RENFORT: '3', EFFECTIF_TOTAL: '380', EFFECTIF_SSIAP1: '185', EFFECTIF_CONTROLEURS: '35', VIVIER_EVENEMENTIEL: '500' }, {})!;
    expect(s.params.chiffres[0]).toMatchObject({ valeur: '10', libelle: "Agents titulaires de l'équipe dédiée" });
  });
});
