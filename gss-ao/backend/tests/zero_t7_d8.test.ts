// Tour 7 (correcteur) : phrase d'origine rétablie par GSS et phrase ajoutée d'après le CCTP qui la contredit (T7N-10).
import { describe, it, expect } from 'vitest';
import { phrasesContrairesAuChoix, deciderAdaptation, SuiviAdaptations, consultationsAdaptations, type PhraseAdaptee } from '../src/generation/adaptations_cctp';

const origine = 'Autre axe primordial de notre suivi qualité, les réunions de suivi sont mensuelles ou trimestrielles selon la nature et les besoins du site.';
const adaptee = "Autre axe primordial de notre suivi qualité, les réunions de suivi ont lieu tous les deux mois pour l'ENPC et l'IGN.";
const ajout = 'Nous assistons aux réunions de suivi organisées dès le démarrage, tous les deux mois ainsi qu’aux réunions ponctuelles décidées ou demandées.';

describe('phrase rétablie et valeur du CCTP redite ailleurs (T7N-10)', () => {
  it('l’assistant signale la phrase contraire au choix de GSS', () => {
    const texte = `**Les réunions de suivi**\n${adaptee} Elles permettent de faire le point. ${ajout}`;
    const a: PhraseAdaptee = { n: 5, rubrique: 'b5_reunions_indicateurs', titre: 'Les réunions de suivi', origine, adaptee, exigence: 'périodicité bimestrielle', etape: 'publipostage', statut: 'a_valider' };
    const r = deciderAdaptation(texte, a, 'retablir');
    expect(r.ok).toBe(true);
    expect(r.texte).toContain('mensuelles ou trimestrielles');
    expect(r.message).toMatch(/Attention : cette phrase de la rubrique reprend encore la valeur du cahier des charges : « Nous assistons aux réunions de suivi organisées dès le démarrage, tous les deux mois/);
    expect(phrasesContrairesAuChoix(r.texte, origine, adaptee)).toHaveLength(1);
  });
  it('génération suivante : la phrase ajoutée contraire est retirée et GSS en est informé', () => {
    const texte = `**Les réunions de suivi**\n${adaptee} Elles permettent de faire le point. ${ajout}`;
    const decision: PhraseAdaptee = { n: 5, rubrique: 'b5', titre: 'Les réunions de suivi', origine, adaptee, exigence: 'x', etape: 'publipostage', statut: 'retablie', actuelle: origine };
    const suivi = new SuiviAdaptations({ reference: [`**Les réunions de suivi**\n${origine} Elles permettent de faire le point.`], decisions: [decision] });
    suivi.noter('b5', `**Les réunions de suivi**\n${origine} Elles permettent de faire le point.`, texte, 'périodicité bimestrielle', 'publipostage');
    const sections: Record<string, string> = { b5: texte };
    const liste = suivi.finaliser(sections, () => 'Les réunions de suivi');
    expect(sections.b5).toContain('mensuelles ou trimestrielles');
    expect(sections.b5).not.toMatch(/deux mois/);
    expect(consultationsAdaptations(liste).join('\n')).toMatch(/la phrase ajoutée d'après le cahier des charges qui la contredisait a été retirée/);
  });
});
