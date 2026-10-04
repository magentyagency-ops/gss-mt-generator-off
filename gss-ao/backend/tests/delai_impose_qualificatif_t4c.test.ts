/**
 * Tour 4, correcteur (T4-CONS-4) : un délai imposé par le CCTP est réduit à sa durée avant insertion dans la phrase de GSS
 * (« en {{DELAI_INTERVENTION_ALARME}} au maximum ») ; quand le CCTP fixe plusieurs délais pour le même point, la valeur
 * imposée n'est pas appliquée : la règle des délais multiples (T10C-2) s'applique.
 */
import { describe, it, expect } from 'vitest';
import { delaiImposeNet, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';
import { valeursImposeesValides } from '../src/generation/reponse_libre_v2';

const ANALYSE = { clientName: 'Citédia Métropole', sites: ['Parc Colombier, Rennes'] };
const CITATION = "Les interventions sont à effectuer sur le site en alerte suivant les modalités ci-dessous dans un délai de 30 minutes maximum à compter de l'appel (alarme technique et intrusion).";
const DCE_MULTI = [
  "CCTP. Lieu d'exécution : Rennes (35000).",
  "Les interventions seront effectuées sur le site en alerte par l'intervenant TLS dans un délai de 15 minutes maximum à compter de l'alarme incendie.",
  CITATION,
  "En cas de déclenchement du bouton anti-agression, l'intervention sur site a lieu dans un délai de 15 minutes maximum.",
].join('\n\n');

describe('délai imposé par le CCTP (T4-CONS-4)', () => {
  it('qualificatifs retirés, valeur refusée si autre chose qu\'une durée reste', () => {
    expect(delaiImposeNet('30 minutes maximum (alarme intrusion)')).toBe('30 minutes');
    expect(delaiImposeNet('en 20 minutes au maximum')).toBe('20 minutes');
    expect(delaiImposeNet('2 heures au plus')).toBe('2 heures');
    expect(delaiImposeNet('30 minutes pour une alarme intrusion')).toBe('');
    const v = valeursImposeesValides({ DELAI_INTERVENTION_ALARME: { valeur: '30 minutes maximum (alarme intrusion)', citation: CITATION } });
    expect(v.valides.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
    const w = valeursImposeesValides({ DELAI_INTERVENTION_ALARME: { valeur: '30 minutes pour une alarme intrusion', citation: CITATION } });
    expect(w.valides.DELAI_INTERVENTION_ALARME).toBeUndefined();
  });
  it('plusieurs délais du CCTP pour le même point : valeur imposée non appliquée, phrase sans délai et question', () => {
    const ctx: any = { analyse: ANALYSE, dce: DCE_MULTI, imposees: { DELAI_INTERVENTION_ALARME: { valeur: '30 minutes', citation: CITATION } } };
    const prep = preparerMemoireType(ctx);
    const v: any = prep.variables.DELAI_INTERVENTION_ALARME;
    expect(v.valeur).toBeNull();
    expect(String(v.question || '')).toMatch(/plusieurs délais/);
    const texte = publierMemoire(prep).map((p) => p.texte || '').join('\n');
    expect(texte).not.toMatch(/30 minutes maximum \(alarme/);
    expect(texte).not.toMatch(/maximum[^.\n]{0,40} au maximum/);
  });
  it('un seul délai du CCTP pour le point : la valeur imposée reste', () => {
    const dce = ["CCTP. Lieu d'exécution : Rennes (35000).", CITATION].join('\n\n');
    const prep = preparerMemoireType({ analyse: ANALYSE, dce, imposees: { DELAI_INTERVENTION_ALARME: { valeur: '30 minutes', citation: CITATION } } } as any);
    expect((prep.variables.DELAI_INTERVENTION_ALARME as any).valeur).toBe('30 minutes');
  });
});
