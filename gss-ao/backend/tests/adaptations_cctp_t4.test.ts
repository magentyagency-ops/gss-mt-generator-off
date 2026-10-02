import { describe, it, expect } from 'vitest';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { adaptationsRetenuesDe, consultationAdaptation, messageAdaptations, type AdaptationCctp } from '../src/generation/reponse_libre_v2';

/** Tour 4 (T4C-13, D8) : une phrase du texte de GSS adaptée au CCTP n'est jamais réécrite en silence. */
describe('phrases de GSS adaptées au CCTP signalées à GSS (T4C-13, D8)', () => {
  const ECOLOGIE = "**Le numérique**\n- Nous nous rapprochons autant que possible du zéro papier : nos mains courantes papier ont été remplacées par des mains courantes électroniques ; nous communiquons en interne essentiellement par mail ou par Dropbox et n'imprimons plus de documents.\n- Tous nos collaborateurs sont sensibilisés au tri régulier de leur boîte mail.";
  const EXTRAIT = "et n'imprimons plus de documents.";
  const REMPLACEMENT = "et imprimons les rapports d'intervention requis au format papier.";
  const EXIGENCE = "Les rapports d'intervention sont remis au format papier.";

  it('corrigerContradictions relève la phrase d\'origine, la phrase adaptée et l\'exigence (caen 471, b2_ecologie_mobilite_numerique)', async () => {
    const g: any = Object.create(MemoireGenerator.prototype);
    g.callOpenAI = async () => JSON.stringify({ corrections: [{ id: 'b2_ecologie_mobilite_numerique', extrait: EXTRAIT, remplacement: REMPLACEMENT, exigence: EXIGENCE, meme_obligation: 'impression des rapports' }] });
    const sections: Record<string, string> = { b2_ecologie_mobilite_numerique: ECOLOGIE };
    const adaptations: AdaptationCctp[] = [];
    await g.corrigerContradictions(sections, [{ id: 'b2_ecologie_mobilite_numerique', title: 'Écologie, mobilité et numérique' }], [{ exigence: EXIGENCE }], [], new Set<string>(), adaptations);
    expect(sections.b2_ecologie_mobilite_numerique).toContain(REMPLACEMENT);
    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].avant).toMatch(/^Nous nous rapprochons autant que possible du zéro papier : .* et n'imprimons plus de documents\.$/);
    expect(adaptations[0].apres).toMatch(/et imprimons les rapports d'intervention requis au format papier\.$/);
    expect(adaptations[0].exigence).toBe(EXIGENCE);
    const retenues = adaptationsRetenuesDe(adaptations, sections);
    expect(retenues).toHaveLength(1);
    const ligne = consultationAdaptation(retenues[0], 'Écologie, mobilité et numérique');
    expect(ligne).toContain("phrase d'origine : « Nous nous rapprochons");
    expect(ligne).toContain("n'imprimons plus de documents »");
    expect(ligne).toContain("phrase adaptée : « Nous nous rapprochons");
    expect(ligne).toContain(`exigence du CCTP : « ${EXIGENCE.replace(/\.$/, '')} »`);
    const msg = messageAdaptations(retenues.map((a) => ({ ...a, titre: 'Écologie, mobilité et numérique' })));
    expect(msg).toMatch(/^J'ai adapté une phrase du texte de GSS que le cahier des charges contredisait/);
    expect(msg).toContain('rétablir la phrase d\'origine');
  });

  it('verifierHoraires relève aussi la phrase adaptée', async () => {
    const g: any = Object.create(MemoireGenerator.prototype);
    const phrase = 'La fermeture du bâtiment A est assurée à 19 h par l\'agent de sécurité.';
    g.callOpenAI = async () => JSON.stringify({ corrections: [{ n: 1, phrase: phrase.replace('19 h', '21 h'), horaire_cctp: 'fermeture du bâtiment A à 21 h' }] });
    const sections: Record<string, string> = { b5_x: `## Horaires\n\n${phrase}` };
    const adaptations: AdaptationCctp[] = [];
    await g.verifierHoraires(sections, [{ id: 'b5_x', title: 'Horaires' }], 'Le bâtiment A ferme à 21 h. La fermeture du bâtiment A a lieu à 21h00 chaque soir.', adaptations);
    expect(sections.b5_x).toContain('à 21 h');
    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].avant).toBe(phrase);
    expect(adaptations[0].exigence).toBe('fermeture du bâtiment A à 21 h');
  });

  it('deux corrections successives de la même phrase : un seul signalement ; phrase retirée ensuite : aucun', () => {
    const a: AdaptationCctp[] = [
      { id: 'r', avant: 'Contrôles de 1 à 3 fois par mois.', apres: 'Contrôles de 3 fois par mois.', exigence: 'au moins 3 visites' },
      { id: 'r', avant: 'Contrôles de 3 fois par mois.', apres: 'Contrôles inopinés de 3 fois par mois.', exigence: 'inopinés' },
      { id: 's', avant: 'Phrase disparue de GSS.', apres: 'Phrase adaptée retirée ensuite par la condensation.', exigence: 'x' },
    ];
    const r = adaptationsRetenuesDe(a, { r: 'Nos contrôles inopinés de 3 fois par mois.', s: 'Autre texte.' });
    expect(r).toHaveLength(1);
    expect(r[0].avant).toBe('Contrôles de 1 à 3 fois par mois.');
    expect(r[0].apres).toBe('Contrôles inopinés de 3 fois par mois.');
    expect(r[0].exigence).toBe('au moins 3 visites ; inopinés');
  });
});
