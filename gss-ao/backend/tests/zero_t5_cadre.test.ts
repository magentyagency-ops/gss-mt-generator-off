/** Tour 5, correcteur : cadre imposé, phrases ajoutées par l'IA au texte de GSS (T5-CONS-6, consigne 5). */
import { describe, it, expect } from 'vitest';
import { ajoutsAuTexteDeGss } from '../src/generation/memoire_type_cadre';
import { questionExacte } from '../src/generation/memoire_generator';

const REF = "Concrètement, nous organisons trois niveaux de contrôle, qui nous permettent de suivre au plus près nos agents, leurs missions et l'évolution des besoins.\nNotre démarche de certification ISO 9001 est en cours ; la certification est prévue fin 2026.";

describe('phrases ajoutées par l\'IA au texte de GSS (T5-CONS-6)', () => {
  it('enrobage retiré, autre ajout signalé, texte de GSS et du DCE gardés', () => {
    const rep = `${REF} Le dispositif est adapté aux enjeux de ce marché : traçabilité des parcours sur les 16 pointeaux des jardins. Cette organisation renforce la fiabilité des fermetures et permet de corriger rapidement les écarts. Les moyens permettent aux binômes chargés de la fermeture de transmettre les alertes au CSU en cas d'impossibilité de fermer. La ronde de fermeture des jardins suspendus est effectuée chaque soir à 21h00.`;
    const dce = 'CCTP. La ronde de fermeture des jardins suspendus est effectuée chaque soir à 21h00.';
    const r = ajoutsAuTexteDeGss(rep, REF, dce);
    expect(r.retirees).toHaveLength(2);
    expect(r.texte).not.toMatch(/adapté aux enjeux|renforce la fiabilité/);
    expect(r.signalees).toEqual(["Les moyens permettent aux binômes chargés de la fermeture de transmettre les alertes au CSU en cas d'impossibilité de fermer."]);
    expect(r.texte).toContain('ISO 9001');
    expect(r.texte).toContain('à 21h00');
  });
  it('phrase d\'un autre texte du mémoire type : texte de GSS, jamais signalée', () => {
    const autre = 'Premier entretien, par téléphone : prise de contact, demande d\'informations complémentaires au CV, présentation du poste.';
    const r = ajoutsAuTexteDeGss(`${REF}\n${autre}`, REF, '', [autre]);
    expect(r.signalees).toEqual([]);
  });
  it('le signalement reste tel quel dans les consultations', () => {
    const l = "Phrases ajoutées au texte de GSS (rédigées par l'IA), à valider : « 4.3 Le système de contrôle de rondes » — « Les rapports … » ; « Les badges … »";
    expect(questionExacte(l)).toBe(l);
  });
});
