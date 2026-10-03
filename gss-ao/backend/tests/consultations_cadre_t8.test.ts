import { describe, it, expect } from 'vitest';
import { questionExacte, questionCaseTableau } from '../src/generation/memoire_generator';

/** Tour 8 (T8CS-4) : questions du cadre sans consolidation par le modèle, dans la forme des cartes de l'assistant. */
describe('consultations du cadre sans consolidation (T8CS-4)', () => {
  it('case de tableau : jamais la forme interne « Colonne: … | Ligne: … »', () => {
    expect(questionExacte('Colonne: "Date de délivrance de l’autorisation d’exercer / Date d’obtention" | Ligne: "Autorisation dirigeant | "'))
      .toBe('Tableau du cadre, ligne « Autorisation dirigeant », colonne « Date de délivrance de l’autorisation d’exercer — Date d’obtention » : quelle valeur faut-il écrire ?');
    expect(questionCaseTableau('C.Q.P.A.D.S. | [CHAMP_28]', 'Formations suivies par les agents / Prénom'))
      .toBe('Tableau du cadre, ligne « C.Q.P.A.D.S. », colonne « Formations suivies par les agents — Prénom » : quelle valeur faut-il écrire ?');
  });
  it('intitulé numéroté d’une partie du cadre : l’information à écrire dans sa réponse', () => {
    expect(questionExacte('3.1 Les moyens humains assignés à la mission')).toBe('Quelle information faut-il écrire dans la réponse à « 3.1 Les moyens humains assignés à la mission » ?');
  });
  it('les autres formes sont inchangées', () => {
    expect(questionExacte('Quel est le délai ?')).toBe('Quel est le délai ?');
    expect(questionExacte('Réponse à relire : X')).toBe('Réponse à relire : X');
  });
});

import { alerteCadreAbsent } from '../src/generation/memoire_generator';
describe('alerte « cadre du mémoire absent » (T8CS-5)', () => {
  it('élément de liste sans point final : la citation s’arrête avant le titre numéroté suivant (s2e)', () => {
    const dce = "les pièces contractuelles sont les suivantes :\n- Le cahier des clauses administratives générales (CCAG) applicables aux marchés publics de fournitures\ncourantes et de services, approuvé par l'arrêté du 30 mars 2021\n- Le cadre du mémoire technique et environnemental que l'entreprise se propose d'adopter pour l'exécution\ndu contrat\n3 - Intervenants\n3.1 - Sous-traitance\n3.1.1 - Généralités\nLe titulaire d'un marché public peut sous-traiter.";
    const a = alerteCadreAbsent(dce)[0];
    expect(a).toContain("(« Le cadre du mémoire technique et environnemental que l'entreprise se propose d'adopter pour l'exécution du contrat »)");
    expect(a).not.toMatch(/Intervenants|3\./);
  });
});
describe('alerte « cadre du mémoire absent » : locution et capitales', () => {
  it('« dans le cadre du mémoire technique du Titulaire » n’est pas un document (citedia)', () => {
    expect(alerteCadreAbsent('Ce bilan comportera : tout autre indicateur prévu dans le cadre du mémoire technique du Titulaire.')).toEqual([]);
  });
  it('nom en capitales écrit en minuscules, jamais « cADRE »', () => {
    expect(alerteCadreAbsent('Les candidats remettent le CADRE DE REPONSE TECHNIQUE complété.')[0]).toMatch(/^Le DCE cite un « cadre de reponse technique »/);
  });
});

import { renvoisVersParties } from '../src/generation/format_court';
describe('format court : renvoi d’une rubrique citée avant « développée au bloc N » (T8N-3)', () => {
  const blocs = [{ numero: 4, rubriques: ['b4_rondes', 'b4_proc_alarme', 'b4_tenues'] }];
  const parties = [{ id: 'c1', title: 'Organisation et moyens humains' }, { id: 'c2', title: 'Continuité de service' }, { id: 'c3', title: 'Moyens matériels' }];
  const titres = { b4_rondes: 'Le contrôleur de rondes', b4_proc_alarme: "Notre socle de procédures : l'intervention sur alarme et la télésurveillance", b4_tenues: 'Les tenues' };
  const texte = "- **La nuit, les rondes s'effectuent entre 20h30 et 6h00 du matin** → notre réponse : « Le contrôleur de rondes », développée au bloc 4.";
  it('la partie qui reprend la rubrique citée, jamais toutes celles du bloc (imm)', () => {
    expect(renvoisVersParties(texte, blocs, parties, { c1: [], c2: ['b4_proc_alarme'], c3: ['b4_rondes', 'b4_tenues'] }, titres))
      .toBe("- **La nuit, les rondes s'effectuent entre 20h30 et 6h00 du matin** → notre réponse : « Le contrôleur de rondes », développée dans la partie 3 « Moyens matériels ».");
  });
  it('rubrique citée reprise nulle part : renvoi retiré', () => {
    expect(renvoisVersParties(texte, blocs, parties, { c1: [], c2: ['b4_proc_alarme'], c3: ['b4_tenues'] }, titres))
      .toBe("- **La nuit, les rondes s'effectuent entre 20h30 et 6h00 du matin** → notre réponse : « Le contrôleur de rondes ».");
  });
});
