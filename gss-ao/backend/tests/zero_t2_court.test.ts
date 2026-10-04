// Campagne « zéro défaut », tour 2 : format court, renvois du bloc 1 vers les parties du RC (T2-CONS-10, imm 1203).
import { describe, it, expect } from 'vitest';
import { renvoisVersParties } from '../src/generation/format_court';

const blocs = [{ numero: 4, rubriques: ['b4_rondes', 'b4_main_courante', 'b4_lmc'] }, { numero: 5, rubriques: ['b5_commande_supplementaire', 'b5_evenementiel', 'b5_remplacement_imprevu'] }];
const parties = [{ id: 'c1', title: 'Moyens humains' }, { id: 'c2', title: 'Continuité de service' }, { id: 'c3', title: 'Moyens matériels' }];
const titres = { b4_rondes: 'Le contrôleur de rondes', b4_main_courante: 'La main courante électronique', b4_lmc: 'Le livre des missions et consignes (LMC)', b5_commande_supplementaire: "La gestion d'une commande supplémentaire", b5_evenementiel: 'Le dispositif événementiel', b5_remplacement_imprevu: "Le remplacement d'un agent absent : absence non prévue" };
const retenues = { c1: [], c2: ['b4_rondes', 'b5_remplacement_imprevu'], c3: ['b4_main_courante'] };

describe('renvois du bloc 1 en format court (T2-CONS-10)', () => {
  it('citation terminée par un point, rubriques citées absentes : la réponse part entière, sans « ** » restant', () => {
    const t = "- **« Le Titulaire aura un délai maximum de 24h pour répondre favorablement à la demande faite par téléphone et confirmée par courriel. »** : le traitement des besoins ponctuels est développé au bloc 5 dans « La gestion d'une commande supplémentaire » et « Le dispositif événementiel ».";
    // (T5-CONS-11 : jamais « … courriel. ». » ; la citation garde sa propre ponctuation)
    expect(renvoisVersParties(t, blocs, parties, retenues, titres)).toBe('- **« Le Titulaire aura un délai maximum de 24h pour répondre favorablement à la demande faite par téléphone et confirmée par courriel. »**');
  });
  it('rubriques citées présentes : la partie qui les reprend, sans redire leur titre', () => {
    const t = '- **« Le planning des rondes ne pourra prévoir moins de quatre rondes de sûreté par période de douze heures. »** : le suivi des rondes et leur traçabilité sont développés au bloc 4 dans « Le contrôleur de rondes » et « La main courante électronique ».';
    expect(renvoisVersParties(t, blocs, parties, retenues, titres)).toBe('- **« Le planning des rondes ne pourra prévoir moins de quatre rondes de sûreté par période de douze heures. »** : le suivi des rondes et leur traçabilité sont développés dans les parties 2 et 3.');
  });
  it('une rubrique absente n’est jamais nommée', () => {
    const t = '- **« un manuel de procédure »** : la formalisation des consignes et leur transmission aux équipes sont développées au bloc 4 dans « Le livre des missions et consignes (LMC) ».';
    expect(renvoisVersParties(t, blocs, parties, retenues, titres)).toBe('- **« un manuel de procédure »**.');
  });
});

describe('ponctuation après le retrait d\'un renvoi (T5-CONS-11)', () => {
  it('« … courriel. » → notre réponse : « Rubrique absente », développée au bloc 5. » : un seul point', () => {
    const t = "- « Le Titulaire aura un délai maximum de 24h pour répondre favorablement à la demande faite par téléphone et confirmée par courriel. » → notre réponse : « La gestion d'une commande supplémentaire », développée au bloc 5.";
    const r = renvoisVersParties(t, blocs, parties, { c1: [], c2: [], c3: [] }, titres);
    expect(r).not.toMatch(/\.\s*»\s*\./);
    expect(r).toMatch(/courriel\. »$/);
  });
});
