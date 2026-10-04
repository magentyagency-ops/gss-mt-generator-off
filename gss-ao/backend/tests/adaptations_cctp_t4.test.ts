import { describe, it, expect } from 'vitest';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { type AdaptationCctp } from '../src/generation/reponse_libre_v2';
import { SuiviAdaptations, consultationsAdaptations, messageAdaptations } from '../src/generation/adaptations_cctp';

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
    // Signalement par le code appelé en production (adaptations_cctp.ts, T8-COH-5) : suivi, consultation, premier message.
    const suivi = new SuiviAdaptations();
    suivi.noterCoherence('b2_ecologie_mobilite_numerique', ECOLOGIE, sections.b2_ecologie_mobilite_numerique, EXIGENCE, []);
    const retenues = suivi.finaliser(sections, () => 'Écologie, mobilité et numérique');
    expect(retenues).toHaveLength(1);
    const ligne = consultationsAdaptations(retenues)[0];
    expect(ligne).toContain("phrase d'origine de GSS : « Nous nous rapprochons");
    expect(ligne).toContain("n'imprimons plus de documents. »");
    expect(ligne).toContain("phrase adaptée : « Nous nous rapprochons");
    expect(ligne).toContain(EXIGENCE.replace(/\.$/, ''));
    const msg = messageAdaptations(retenues);
    expect(msg).toMatch(/le cahier des charges prime sur votre texte/);
    expect(msg).toContain('Écologie, mobilité et numérique');
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
    const suivi = new SuiviAdaptations();
    suivi.noterCoherence('r', 'Nos contrôles sont réalisés de 1 à 3 fois par mois.', 'Nos contrôles sont réalisés 3 fois par mois.', 'au moins 3 visites', []);
    suivi.noterCoherence('r', 'Nos contrôles sont réalisés 3 fois par mois.', 'Nos contrôles inopinés sont réalisés 3 fois par mois.', 'inopinés', []);
    suivi.noterCoherence('s', 'Cette phrase de GSS a disparu du texte.', 'Cette phrase adaptée est retirée ensuite par la condensation.', 'x', []);
    const r = suivi.finaliser({ r: 'Nos contrôles inopinés sont réalisés 3 fois par mois.', s: 'Autre texte.' }, (id) => id);
    expect(r).toHaveLength(1);
    expect(r[0].origine).toBe('Nos contrôles sont réalisés de 1 à 3 fois par mois.');
    expect(r[0].adaptee).toBe('Nos contrôles inopinés sont réalisés 3 fois par mois.');
    expect(r[0].exigence).toBe('au moins 3 visites ; inopinés');
  });
});

// Tour 4, correcteur (T4-CONS-14, citedia2 1462) : la grille de pénalités du CCAP n'est jamais citée comme exigence d'une phrase
// adaptée ; le motif du retrait est le lieu hors Normandie.
import { exigenceDuFiltre as exigenceDuFiltreT4c } from '../src/generation/adaptations_cctp';
describe('phrase adaptée du cadre : jamais une grille de pénalités citée (T4-CONS-14)', () => {
  it('délai de mise à disposition retiré hors Normandie : motif du lieu', () => {
    const dce = "\n\n--- CCTP ---\nArticle 1 - Objet : surveillance des parcs, 37 boulevard Solférino 35000 RENNES.\n\n--- CCAP ---\nPénalités pour non-respect des délais de mise à disposition :\n200 € par agent demandé pour une mise à disposition urgente attendue dans un délai de 2 heures et non réalisée.\n100 € par agent demandé pour une mise à disposition attendue dans un délai de 24 heures et non réalisée.\n";
    const e = exigenceDuFiltreT4c({ origine: "Selon l'urgence, les agents sont en place dans un délai de 1 h à 24 h.", adaptee: '' } as any, dce, true, { sites: [] });
    expect(e).not.toMatch(/€|200|100/);
    expect(e).toMatch(/hors Normandie/);
  });
});
