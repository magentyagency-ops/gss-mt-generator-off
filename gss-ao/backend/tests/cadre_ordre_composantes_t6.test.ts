// Tour 6 (T6C-4, etampes1 594, champ 10) : dans une réponse du cadre qui reprend plusieurs rubriques, la procédure d'absence
// non prévue suit l'absence prévue (pas l'intrusion) et la phrase de l'IA qui la résumait n'est pas gardée en double.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ordonnerSelonReponse, recalerSurReference } from '../src/generation/memoire_type_cadre';

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/recalage_etampes1_594_champ10.json'), 'utf-8'));

describe('Ordre des rubriques d\'une réponse du cadre', () => {
  it('une rubrique non employée par la réponse suit la rubrique employée de la même famille', () => {
    const r = [{ id: 'b5_remplacement_prevu', texte: 'Pour l\'absence prévue, notre procédure interne est la suivante : replanification.' }, { id: 'b4_proc_intrusion', texte: 'Nous entendons par intrusion le fait d\'entrer illégitimement sur un site.' }, { id: 'b5_remplacement_imprevu', texte: 'Il arrive aussi que nous ayons à gérer une absence non prévue.' }];
    const rep = 'Pour l\'absence prévue, notre procédure interne est la suivante : replanification. Puis : nous entendons par intrusion le fait d\'entrer illégitimement sur un site.';
    expect(ordonnerSelonReponse(r, rep).map((x) => x.id)).toEqual(['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b4_proc_intrusion']);
  });
  it('etampes1 594 : absence prévue, absence non prévue, puis le sous-titre « Intrusion… » devant la procédure d\'intrusion ; pas de résumé de l\'IA en double', () => {
    const t = recalerSurReference(F.reference, F.reponse, { ...F.options, dce: '' }).texte;
    const i = (x: string) => t.indexOf(x);
    expect(i('Pour l\'absence prévue')).toBeGreaterThanOrEqual(0);
    expect(i('Il arrive aussi que nous ayons à gérer une absence non prévue')).toBeGreaterThan(i('Pour l\'absence prévue'));
    expect(i('Intrusion et dégradation de type vandalisme')).toBeGreaterThan(i('Il arrive aussi que nous ayons à gérer une absence non prévue'));
    expect(i('Nous entendons par intrusion')).toBeGreaterThan(i('Intrusion et dégradation de type vandalisme'));
    expect(t).not.toMatch(/Pour une absence imprévue, si la prise de service/);
    expect(t).toMatch(/Si le chien ne peut exercer/);
  });
});
