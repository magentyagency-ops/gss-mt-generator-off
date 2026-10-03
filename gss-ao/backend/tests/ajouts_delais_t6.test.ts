// Tour 6 (T6C-2, T6-COH-1, T6C-8, T6-COH-5) : ajout de l'adaptation sur un délai, question exacte à GSS, phrases citées.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ajoutContraireAuxDelaisGss, dureesIntervention } from '../src/generation/memoire_type';
import { phraseDuDceProche } from '../src/generation/adaptations_cctp';
import { questionAlignementRefuse, questionAjoutRefuse } from '../src/generation/memoire_generator';

const DCE = (n: string) => fs.readFileSync(path.join(__dirname, '../../_corpus_verif/_dce_textes', `${n}.txt`), 'utf-8');
const GSS = "- si l'agent prévient de son absence au moins 24 heures avant le début de la prestation, nous replanifions en interne.\n- si le responsable de site n'a pas reçu de prise de service 10 minutes avant le début de la prestation, il appelle l'agent et mobilise automatiquement l'agent d'astreinte, qui est sur site en 60 minutes maximum ;";
const AJOUT = "En cas de défaillance de l'effectif prévu, le personnel de remplacement est dépêché sur le site dans l'heure suivant la constatation.";

describe('Durées d\'intervention (préavis et fréquences écartés)', () => {
  it('normalise les durées et écarte les préavis', () => {
    expect(dureesIntervention("au moins 24 heures avant le début de la prestation")).toEqual([]);
    expect(dureesIntervention("prise de service 10 minutes avant le début, l'agent d'astreinte est sur site en 60 minutes maximum")).toEqual([60]);
    expect(dureesIntervention(AJOUT)).toEqual([60]);
    expect(dureesIntervention('dans les UNE (1) heure suivant la constatation')).toEqual([60]);
    expect(dureesIntervention('des tests de lignes toutes les 24 heures ; PC sécurité 24h/24')).toEqual([]);
    expect(dureesIntervention("remplacement immédiat")).toEqual([0]);
  });
});

describe('Ajout de l\'adaptation sur un délai (caen 475)', () => {
  it('« dans l\'heure » n\'est pas contraire aux 60 minutes de GSS ; un délai plus court l\'est', () => {
    expect(ajoutContraireAuxDelaisGss(AJOUT, GSS)).toBe('');
    expect(ajoutContraireAuxDelaisGss("Le remplacement d'un agent absent intervient en 30 minutes.", GSS)).toMatch(/60 minutes maximum/);
    expect(ajoutContraireAuxDelaisGss("Nous assurons le remplacement immédiat d'un agent absent.", GSS)).toMatch(/60 minutes maximum/);
  });
  it('la question cite la phrase du CCTP, jamais la justification du modèle', () => {
    const f = phraseDuDceProche(AJOUT, DCE('caen'));
    expect(f).toMatch(/personnel de remplacement dans les UNE \(1\) heure/);
    const q = questionAlignementRefuse(f, 'qui est sur site en 60 minutes maximum');
    expect(q).toMatch(/^Le DCE exige : « .*UNE \(1\) heure/);
    expect(q).not.toMatch(/Ajoute le délai/);
    expect(phraseDuDceProche('Phrase sans rapport avec le cahier des charges, en 5 minutes.', 'Le titulaire assure le gardiennage des bureaux.')).toBe('');
    expect(questionAjoutRefuse(AJOUT, 'en 60 minutes')).toMatch(/^Phrase proposée par l'IA d'après le cahier des charges : « En cas de défaillance/);
  });
  it('phrases citées coupées à un mot entier avec « … »', () => {
    const long = `${'Nous établissons et remettons au pouvoir adjudicateur un plan de prévention détaillant les risques, '.repeat(6)}les circulations verticales et horizontales d'engins et l'hygiène.`;
    const q = questionAlignementRefuse(long, long);
    for (const m of q.matchAll(/« ([^»]*) »/g)) expect(m[1]).toMatch(/(?:\S…|[^…])$/);
    expect(q).not.toMatch(/horizonta »/);
    expect(q).toMatch(/…/);
  });
});
