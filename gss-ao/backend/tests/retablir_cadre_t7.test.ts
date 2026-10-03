import { describe, it, expect } from 'vitest';
import { SuiviAdaptations, deciderAdaptation } from '../src/generation/adaptations_cctp';
import { texteBrut } from '../src/generation/memoire_type_cadre';

/** Tour 7 (T7N-2) : « Rétablis ma phrase d'origine » dans le cadre écrit la phrase dans la forme du cadre, jamais en Markdown. */
const ORIGINE_MD = '- **Préparation** : mobilisation des agents, briefing et équipement. Nous sommes ainsi en mesure de mobiliser 100 agents en 48 heures.';
const CHAMP = "Notre organisation :\n• Réception du besoin (J-30) : analyse de la demande.\n• Préparation : mobilisation des agents, briefing et équipement.\n• Bilan : retour d'expérience.";

describe('phrase d’origine rétablie dans le cadre (T7N-2)', () => {
  it('finalisation du cadre : origine en texte brut (puce « • », sans « ** »)', () => {
    const suivi = new SuiviAdaptations();
    const avant = CHAMP.replace('• Préparation : mobilisation des agents, briefing et équipement.', ORIGINE_MD);
    suivi.noter('GSS_CH_9', avant, CHAMP, 'Hors Normandie : aucun délai de mobilisation promis.', 'Délais hors Normandie', true);
    const sections = { GSS_CH_9: CHAMP };
    const l = suivi.finaliser(sections, () => 'Organisation', {}, texteBrut);
    expect(l).toHaveLength(1);
    expect(l[0].origine).toBe('• Préparation : mobilisation des agents, briefing et équipement. Nous sommes ainsi en mesure de mobiliser 100 agents en 48 heures.');
    const r = deciderAdaptation(sections.GSS_CH_9, { ...l[0], n: 2 }, 'retablir');
    expect(r.ok).toBe(true);
    expect(r.texte).toContain('• Préparation : mobilisation des agents, briefing et équipement. Nous sommes ainsi en mesure de mobiliser 100 agents en 48 heures.');
    expect(r.texte).not.toMatch(/\*\*|^- /m);
  });
  it('réponse libre : la forme Markdown reste (rendu Marp)', () => {
    const suivi = new SuiviAdaptations();
    const md = '- **Préparation** : mobilisation des agents.';
    suivi.noter('b5_evenementiel', `${ORIGINE_MD}\n- **Bilan** : retour.`, `${md}\n- **Bilan** : retour.`, 'Hors Normandie.', 'Délais', true);
    const l = suivi.finaliser({ b5_evenementiel: `${md}\n- **Bilan** : retour.` }, () => 'Événementiel');
    expect(l[0].origine).toBe(ORIGINE_MD);
  });
});
