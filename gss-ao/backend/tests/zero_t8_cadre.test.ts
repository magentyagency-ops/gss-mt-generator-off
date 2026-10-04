// Tour 8 (correcteur) : cadre imposé (T8-CONS-1, T8-CONS-2, T8-COH-1, T8N-1…).
import { describe, it, expect } from 'vitest';
import { controlerFaitsNouveauxCadre } from '../src/generation/memoire_type_cadre';
import { normaliser } from '../src/generation/memoire_type';

describe('contact de GSS : jamais le numéro ni le nom d’un tiers remplacé (T8-CONS-2, T8-COH-1)', () => {
  const dce = 'Le Centre Superviseur Urbain (CSU) est joignable au 02 35 42 29 45. Police municipale : 02 32 95 83 83. Le référent sûreté de la Ville, LEROY Paul. Le correspondant de la commune, DUPONT Jean.';
  const inchanges = [
    'Les agents contactent le CSU au 02 35 42 29 45 à la prise de service et lui signalent les événements pendant la vacation.',
    'GSS demande aux agents affectés aux manifestations de contacter le CSU au 02 35 42 29 45 à leur prise de fonction pour se déclarer.',
    "L'agent appelle la police municipale au 02 32 95 83 83.",
    "En cas d'alarme, l'agent contacte le PC sécurité (05 56 10 20 30).",
    'Le dispositif est suivi avec le correspondant de la commune, DUPONT Jean.',
    'Le référent sûreté de la Ville, LEROY Paul, valide les consignes.',
  ];
  const s: any = { toutes: normaliser(`${dce} marchani adil ${inchanges.join(' ').replace(/[A-Z]{3,} [A-Z][a-z]+/g, '')}`), gss: '', telephoneUnique: '06 58 06 32 25', interlocuteurUnique: 'MARCHANI', interlocuteurNom: 'MARCHANI Adil', telephoneFixe: '09 62 21 24 75', dce };
  for (const c of inchanges) it(c.slice(0, 60), () => expect(controlerFaitsNouveauxCadre(c, 'Question: "4.1 Les moyens de communication"', s).texte).toBe(c));
  it('contact de GSS repris d’un ancien mémoire : toujours corrigé', () => {
    expect(controlerFaitsNouveauxCadre('VATTIER Marie — 06 25 73 94 58', 'Question: "Interlocuteur du titulaire"', s).texte).toBe('MARCHANI Adil — 06 58 06 32 25');
  });
});

import fs from 'fs';
import path from 'path';
import { referencesDeSecours, recalerSurReference, sansDateOrpheline, objetFicheTechnique, ajoutsAuTexteDeGss, retirerEnrobage, type CandidatReference } from '../src/generation/memoire_type_cadre';
import { casseDuDceDetail } from '../src/generation/memoire_type';

const cand = (id: string, titre: string, score: number, theme = false): CandidatReference => ({ cle: id, id, titre, texte: `Texte ${id}.`, score, theme });

describe('rubriques choisies sans modèle : jamais hors sujet (T8-CONS-1, T8N-1)', () => {
  it('« personne référente joignable 24h/24 » : jamais une référence bancaire', () => {
    const q = '2.3 Le centre de permanence téléphonique et la personne référente joignable 24h/24h, 7j/7j pour le présent accord-cadre ;';
    expect(referencesDeSecours([cand('b2_ref_banque', 'Référence — les établissements bancaires', 0.6)], q, { themesSeuls: true })).toEqual([]);
    expect(referencesDeSecours([cand('b3_interlocuteur_unique', 'Un interlocuteur unique', 0.9, true), cand('b2_ref_banque', 'Référence — les établissements bancaires', 0.6)], q).map((c) => c.id)).toEqual(['b3_interlocuteur_unique']);
  });
  it('« qualifications des agents » : jamais l’intégration d’un nouvel agent', () => {
    expect(referencesDeSecours([cand('b5_nouvel_agent', "L'intégration d'un nouvel agent", 0.7)], '3.3 Les qualifications des agents,', { themesSeuls: true })).toEqual([]);
  });
  it('« Délais d’interventions proposés » : jamais le rétroplanning d’un nouveau marché, même en secours', () => {
    const q = 'Sous-critère : Délais d’interventions proposés par le candidat';
    expect(referencesDeSecours([cand('b5_nouveau_marche', "L'intégration d'un nouveau marché", 0.7)], q, { themesSeuls: true })).toEqual([]);
    expect(referencesDeSecours([cand('b5_nouveau_marche', "L'intégration d'un nouveau marché", 0.7)], q)).toEqual([]);
  });
  it('« Moyens humains affectés au marché » : l’adéquation des moyens humains reste choisie (T7-CONS-1)', () => {
    expect(referencesDeSecours([cand('b3_adequation', "L'adéquation de nos moyens humains avec votre besoin", 0.7)], 'SOUS CRITERE 3 : Moyens humains affectés au marché', { themesSeuls: true }).map((c) => c.id)).toEqual(['b3_adequation']);
  });
});

describe('cadre havre1, 3.4 : identité CNAPS seule, sous-titre devant son bloc, date sans objet (T8-CONS-10, T8-COH-7)', () => {
  const x = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/recalage_havre1_1882_formations.json'), 'utf-8'));
  const r = recalerSurReference(x.reference, x.reponse, { limite: true, attendus: [], question: x.question });
  it('ni assurance, ni ISO, ni effectif, ni sous-traitance ; « Autorisation CNAPS » en tête', () => {
    expect(r.texte).not.toMatch(/Hiscox|ISO 9001|380 salariés|Sous-traitance/);
    expect(r.texte.trim().startsWith('Autorisation CNAPS')).toBe(true);
    expect(r.texte).toMatch(/AUT-076-2114-02-12-20140458592/);
    expect(r.texte.indexOf('déontologie')).toBeLessThan(r.texte.indexOf('Le secourisme'));
  });
  it('« • Date de fin de validité : [À COMPLÉTER]. » retirée quand le cadre la demande, rattachée sinon', () => {
    const t = '• Agrément dirigeant CNAPS : M. MARCHANI Adil, AGD-1.\n\n• Date de fin de validité : [À COMPLÉTER].\n\nFormations';
    expect(sansDateOrpheline(t, 'Autorisation CNAPS | Date d’obtention | Date de fin de validité').texte).not.toMatch(/Date de fin/);
    expect(sansDateOrpheline(t, '').texte).toMatch(/AGD-1 — date de fin de validité : \[À COMPLÉTER\]\./);
  });
});

describe('fiches techniques demandées par le cadre (T8-CONS-11)', () => {
  it('objet de la fiche lu dans la question', () => {
    expect(objetFicheTechnique('4.2 Fiches techniques des moyens de communication (insérer ici les fiches techniques)')).toBe('moyens de communication');
    expect(objetFicheTechnique('4.5 Les fiches techniques de la main courante informatique (insérer ici les fiches techniques)')).toBe('main courante informatique');
    expect(objetFicheTechnique('4.1 Les moyens de communication (GSM, TW,etc.)')).toBe('');
  });
});

describe('enrobage de l’IA retiré (T8-CONS-12)', () => {
  const noms = ['Ville du Havre', 'Le Havre'];
  for (const p of ['Cette traçabilité permet à la Ville de vérifier les parcours effectués et de disposer chaque jour d’un suivi exploitable de la surveillance des installations.',
    'Cette organisation associe la coordination immédiate entre agents à une remontée traçable des informations vers la Ville, essentielle sur un site de plage ouvert au public.',
    'Cette sélection sécurise la conformité des agents affectés et contribue à la qualité du service.',
    'Cette démarche favorise un recrutement attentif à l’égalité des chances et contribue à la stabilité des équipes de la plage du Havre.',
    'Cette organisation apporte une continuité opérationnelle vérifiable et limite le risque de rupture de surveillance sur un site ouvert au public.']) {
    it(p.slice(0, 50), () => {
      expect(ajoutsAuTexteDeGss(p, 'Texte de GSS.', '', [], noms).retirees.length).toBe(1);
      expect(retirerEnrobage(p, noms).retirees.length).toBe(1);
    });
  }
  it('phrase avec une donnée propre gardée', () => {
    expect(retirerEnrobage("Cette procédure permet à l'agent d'alerter le CSU au 02 35 42 29 45.", noms).retirees.length).toBe(0);
  });
});

describe('nom de l’acheteur en casse mêlée avec un mot en capitales (T8-CONS-13, T8-COH-2, T8-COH-8)', () => {
  const dce = "La Ville du Havre lance. Ville du Havre. Ville du HAVRE. L'ESID de Rennes assure. Le CHU de Rouen.";
  it('« Ville du HAVRE » → « Ville du Havre » ; lieux connus mis en casse ; sigles gardés', () => {
    expect(casseDuDceDetail('Ville du HAVRE', dce).forme).toBe('Ville du Havre');
    expect(casseDuDceDetail('Commune de FÉCAMP', dce).forme).toBe('Commune de Fécamp');
    expect(casseDuDceDetail('Département de la SEINE-MARITIME', dce).forme).toBe('Département de la Seine-Maritime');
    expect(casseDuDceDetail("l'ESID de Rennes", dce).forme).toBe('');
    expect(casseDuDceDetail('CHU de Rouen', dce).forme).toBe('');
    expect(casseDuDceDetail('Mairie de TRUCMACHIN', dce).incertains).toEqual(['TRUCMACHIN']);
  });
  it('« RHÔNE » n’est pas un sigle', () => {
    expect(casseDuDceDetail('CONSEIL DÉPARTEMENTAL DU RHÔNE', 'CONSEIL DÉPARTEMENTAL DU RHÔNE\n29-31 cours de la Liberté').forme).toBe('Conseil départemental du Rhône');
  });
});
