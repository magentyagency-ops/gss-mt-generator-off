import { describe, it, expect } from 'vitest';
import { lieuDuMarche, marcheHorsNormandie, questionLieuInconnu } from '../src/generation/base_memoires';
import { preparerMemoireType, publierMemoire, questionsDuPubliposte } from '../src/generation/memoire_type';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7-COH-2) : lieu du marché sans code postal, adresse de l'acheteur, lieu introuvable. */
const LYON = { dce: "Métropole de Lyon. Marché de surveillance et de gardiennage de l'Hôtel de la Métropole, 20 rue du Lac, Lyon 3e. Rondes de nuit, astreinte, remplacement des agents absents.", analyse: { clientName: 'la Métropole de Lyon', sites: [{ name: 'Hôtel de la Métropole', address: '20 rue du Lac, Lyon' }] } };
const LILLE = { dce: 'Cité administrative de Lille, boulevard de Belfort, LILLE. Prestations de gardiennage et de rondes. Remplacement des agents absents.', analyse: { clientName: 'la Préfecture du Nord', sites: [{ name: 'Cité administrative', address: 'boulevard de Belfort, Lille' }] } };
const CAEN_ACHETEUR_93 = { dce: 'Pouvoir adjudicateur : Agence nationale, 12 rue de Paris, 93100 Montreuil. Objet : gardiennage du site de Caen. Rondes, astreinte, remplacement des agents absents. Tribunal administratif de Montreuil.', analyse: { clientName: "l'Agence nationale" } };
const INCONNU = { dce: 'Marché de gardiennage du siège. Rondes de nuit, astreinte, remplacement des agents absents. Le titulaire assure la sécurité des bâtiments.', analyse: { clientName: "l'Office" } };

const publie = (c: any) => {
  const prep = preparerMemoireType(c);
  const rub = publierMemoire(prep);
  return { prep, texte: rub.map((r: any) => r.texte || '').join('\n'), questions: questionsDuPubliposte(rub) };
};

describe('lieu du marché (T7-COH-2)', () => {
  it('Lyon et Lille sans code postal : hors Normandie, aucun délai normand publiposté', () => {
    for (const c of [LYON, LILLE]) {
      expect(lieuDuMarche(c.analyse, c.dce).statut).toBe('hors');
      expect(marcheHorsNormandie(c.analyse, c.dce)).toBe(true);
      const { texte, questions } = publie(c);
      expect(texte).not.toMatch(/60 minutes maximum|100 mobilisables en 48 heures|moins de 2 heures/);
      expect(questions.some((q: string) => /^Marché hors Normandie : quel délai/.test(q))).toBe(true);
    }
  });
  it('Strasbourg (Bas-Rhin) : hors Normandie', () => {
    expect(marcheHorsNormandie({}, 'Gardiennage du Parlement, Strasbourg (Bas-Rhin). Rondes.')).toBe(true);
  });
  it('acheteur en Seine-Saint-Denis, site à Caen : en Normandie', () => {
    expect(lieuDuMarche(CAEN_ACHETEUR_93.analyse, CAEN_ACHETEUR_93.dce)).toMatchObject({ statut: 'normandie', normands: ['Caen'] });
    const { questions } = publie(CAEN_ACHETEUR_93);
    expect(questions.some((q: string) => /hors Normandie/.test(q))).toBe(false);
  });
  it('site d’une commune normande avec code postal et acheteur parisien : en Normandie', () => {
    expect(marcheHorsNormandie({}, "Acheteur : Ministère, 75007 Paris. Lieu d'exécution : site de Rouen (76000). Gardiennage.")).toBe(false);
  });
  it('lieu introuvable : aucun délai normand promis, une question sur le lieu et des questions de délai qui le disent', () => {
    expect(lieuDuMarche(INCONNU.analyse, INCONNU.dce).statut).toBe('inconnu');
    expect(marcheHorsNormandie(INCONNU.analyse, INCONNU.dce)).toBe(true);
    expect(questionLieuInconnu(INCONNU.analyse, INCONNU.dce)).toEqual(["Le DCE ne donne pas la commune du site : le marché est-il en Normandie ? En attendant votre réponse, le mémoire ne promet aucun délai d'intervention normand de GSS."]);
    const { texte, questions } = publie(INCONNU);
    expect(texte).not.toMatch(/60 minutes maximum|moins de 2 heures/);
    const delais = questions.filter((q: string) => /^Le DCE ne donne pas la commune du site : quel délai GSS annonce-t-elle/.test(q));
    expect(delais.length).toBeGreaterThan(0);
    expect(questions.some((q: string) => /^Marché hors Normandie/.test(q))).toBe(false);
  });
  it('lieu connu : pas de question sur le lieu', () => {
    expect(questionLieuInconnu(LYON.analyse, LYON.dce)).toEqual([]);
    expect(questionLieuInconnu({}, '')).toEqual([]);
  });
  it.skipIf(!aCorpus('becquerel', 'caen', 'havre2', 'parc_expo', 's2e', 'rouen_univ', 'ca_normandie', 'havre1', 'imm', 'ifsem', 'vitry', 'cstb', 'citedia', 'citedia2', 'etampes1', 'etampes2', 'fontainebleau', 'ifits', 'ign'))('corpus : classement inchangé', () => {
    for (const n of ['becquerel', 'caen', 'havre1', 'havre2', 'parc_expo', 's2e', 'rouen_univ', 'ca_normandie']) expect(marcheHorsNormandie({}, DCE(n))).toBe(false);
    for (const n of ['imm', 'ifsem', 'vitry', 'cstb', 'citedia', 'citedia2', 'etampes1', 'etampes2', 'fontainebleau', 'ifits', 'ign']) expect(marcheHorsNormandie({}, DCE(n))).toBe(true);
  });
});

import { libelleDelaiRetire, questionExacte } from '../src/generation/memoire_generator';
import { exigenceHorsNormandie } from '../src/generation/adaptations_cctp';
describe('délai retiré quand le lieu est introuvable (T7-COH-2)', () => {
  it('question exacte qui ne dit pas « hors Normandie »', () => {
    const l = libelleDelaiRetire(INCONNU.analyse, INCONNU.dce);
    expect(questionExacte(`${l}L'agent d'astreinte est sur site en 60 minutes.`)).toBe("Le DCE ne donne pas la commune du site : si le site est en Normandie, validez-vous ce délai : « L'agent d'astreinte est sur site en 60 minutes » ? Sinon, quel délai GSS annonce-t-elle ?");
    expect(questionExacte(`${libelleDelaiRetire(LYON.analyse, LYON.dce)}L'agent d'astreinte est sur site en 60 minutes.`)).toMatch(/^Hors Normandie, validez-vous ce délai proposé/);
  });
  it('motif D8 : lieu introuvable dit tel quel ; commune nommée sans code postal citée', () => {
    expect(exigenceHorsNormandie(INCONNU.dce, INCONNU.analyse)).toMatch(/^Lieu du site introuvable dans le DCE/);
    expect(exigenceHorsNormandie(LYON.dce, LYON.analyse)).toMatch(/^Marché hors Normandie \(marché de Lyon\)/);
  });
});
