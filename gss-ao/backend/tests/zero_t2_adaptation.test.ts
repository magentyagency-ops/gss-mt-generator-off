// Campagne « zéro défaut », tour 2 : adaptation des rubriques au CCTP (T2-CONS-3, T2-CONS-13).
import { describe, it, expect } from 'vitest';
import { appliquerModifications, phrasesDeFrequenceDeControle, RAISON_SANS_FONDEMENT } from '../src/generation/memoire_type';
import { fondementDansDce, exigenceDeModification, SuiviAdaptations } from '../src/generation/adaptations_cctp';
import { sansAjoutsRepetesEntreRubriques } from '../src/generation/reponse_libre_v2';

const DCE_CSTB = "Article 2.5.3 – Réunions\nDes rencontres annuelles seront organisées afin de faire un état du fonctionnement de la prestation de surveillance et rondes (incluant les moyens mis à disposition par le prestataire) et de décider des évolutions si nécessaire.\nLa première année, un point intermédiaire à mi-année est réalisé.\nArticle 2.2.6 - Circuit des rondes\nLes rondes de surveillance sont effectuées à pied.";
const VATTIER = "**Le contrôle global**\nVATTIER Marie, responsable qualité : lors des réunions trimestrielles, elle se rend sur site et contrôle l'équipe en place ; elle dresse avec le client le bilan du trimestre écoulé et produit un rapport qualité. Basée à Rouen, permis B, véhiculée.";

describe('phrase de GSS modifiée par l’adaptation (T2-CONS-3)', () => {
  it('fréquence d’un contrôle qualité : jamais réécrite par l’adaptation', () => {
    const p = phrasesDeFrequenceDeControle(VATTIER);
    expect(p.join(' ')).toMatch(/lors des réunions trimestrielles/);
    const m = appliquerModifications(VATTIER, { remplacements: [{ extrait: 'lors des réunions trimestrielles', par: 'lors des réunions annuelles' }] }, { phrasesProtegees: p, fondement: (x, ph) => fondementDansDce(x, ph, DCE_CSTB) });
    expect(m.texte).toBe(VATTIER);
  });
  it('modification fondée sur une phrase du DCE : appliquée, exigence gardée ; sans fondement : refusée', () => {
    const t = "Les rondes sont faites de jour comme de nuit. Selon le site, nos agents font leurs rondes en voiture ou à vélo.";
    const ok = appliquerModifications(t, { retraits: [{ extrait: ' Selon le site, nos agents font leurs rondes en voiture ou à vélo.', motif: 'Les rondes de surveillance sont effectuées à pied.' }] }, { fondement: (x, ph) => fondementDansDce(x, ph, DCE_CSTB) });
    expect(ok.appliquees).toHaveLength(1);
    expect(ok.appliquees[0].exigence).toMatch(/effectuées à pied/);
    const non = appliquerModifications(t, { remplacements: [{ extrait: 'de jour comme de nuit', par: 'en équipe renforcée' }] }, { fondement: (x, ph) => fondementDansDce(x, ph, DCE_CSTB) });
    expect(non.appliquees).toHaveLength(0);
    expect(non.refusees[0].raison).toBe(RAISON_SANS_FONDEMENT);
  });
  it('la phrase modifiée est signalée à GSS (D8) avec son exigence', () => {
    const avant = "Les rondes sont faites de jour. Nos rondiers effectuent les rondes en véhicule ou à vélo.";
    const m = appliquerModifications(avant, { remplacements: [{ extrait: 'en véhicule ou à vélo', par: 'à pied' }] }, { fondement: (x, ph) => fondementDansDce(x, ph, DCE_CSTB) });
    const suivi = new SuiviAdaptations({ reference: [avant] });
    expect(suivi.noter('b4_rondes', avant, m.texte, (c) => exigenceDeModification(c, m.appliquees), 'Adaptation')).toBe(1);
    expect(suivi.exigencesNotees()[0]).toMatch(/effectuées à pied/);
  });
});

describe('même exigence ajoutée dans plusieurs rubriques (T2-CONS-13)', () => {
  it('gardée dans la rubrique de son sujet seulement', () => {
    const sections: Record<string, string> = {
      b4_rondes: 'Les rondes sont balisées par des pointeaux. La première année, un point intermédiaire est réalisé à mi-année ; une rencontre annuelle porte sur le fonctionnement des rondes et les moyens mis à disposition, afin de décider des évolutions éventuelles. Fin.',
      b5_reunions_indicateurs: 'Les réunions permettent de faire le point. Un point intermédiaire à mi-année est organisé la première année. Fin.',
      b5_equipe_controle: "VATTIER Marie, responsable qualité. Un point intermédiaire est organisé à mi-année la première année. Basée à Rouen.",
    };
    const ajouts = [
      { id: 'b5_reunions_indicateurs', phrase: 'Un point intermédiaire à mi-année est organisé la première année.' },
      { id: 'b5_equipe_controle', phrase: 'Un point intermédiaire est organisé à mi-année la première année.' },
      { id: 'b4_rondes', phrase: 'La première année, un point intermédiaire est réalisé à mi-année ; une rencontre annuelle porte sur le fonctionnement des rondes et les moyens mis à disposition, afin de décider des évolutions éventuelles.' },
    ];
    const r = sansAjoutsRepetesEntreRubriques(sections, ajouts, (_p, ids) => (ids.includes('b5_reunions_indicateurs') ? 'b5_reunions_indicateurs' : ids[0]));
    expect(r).toHaveLength(2);
    expect(sections.b5_reunions_indicateurs).toMatch(/point intermédiaire/);
    expect(sections.b4_rondes).not.toMatch(/point intermédiaire/);
    expect(sections.b5_equipe_controle).toBe('VATTIER Marie, responsable qualité. Basée à Rouen.');
  });
});

import { refusAlignementCctp } from '../src/generation/memoire_generator';

describe('alignement du texte de GSS sur le CCTP (T2-CONS-9, format court imm 1203)', () => {
  const dce = "Aucun poste ne doit être laissé vacant. Remplacement sous 4h maximum.\nPénalités : Absence d'un agent ou retard supérieur à 60 min — 300 € HT.\nLes rondes de surveillance sont effectuées à pied, toutes les deux heures.";
  const gss = "si le responsable de site n'a pas reçu de prise de service 10 minutes avant le début de la prestation, il appelle l'agent et mobilise automatiquement l'agent d'astreinte, qui est sur site en 4 heures maximum ;";
  it('exigence absente du DCE, grille de pénalités ou phrase réécrite : refusé', () => {
    expect(refusAlignementCctp(gss, "Le marché pénalise toute absence de plus de 60 minutes ;", "l'agent doit arriver au plus tard dans les 60 minutes", dce)).toBe('exigence absente du DCE');
    expect(refusAlignementCctp(gss, "Le marché pénalise toute absence de plus de 60 minutes ;", "Absence d'un agent ou retard supérieur à 60 min — 300 € HT", dce)).toBe('grille de pénalités');
    expect(refusAlignementCctp(gss, 'GSS organise ses remplacements en conséquence ;', 'Remplacement sous 4h maximum', dce)).toMatch(/réécrite/);
  });
  it('délai changé dans la phrase de GSS, exigence citée du DCE : admis', () => {
    expect(refusAlignementCctp('Nos rondiers effectuent les rondes toutes les trois heures, de jour comme de nuit.', 'Nos rondiers effectuent les rondes toutes les deux heures, de jour comme de nuit.', 'Les rondes de surveillance sont effectuées à pied, toutes les deux heures.', dce)).toBe('');
  });
});
