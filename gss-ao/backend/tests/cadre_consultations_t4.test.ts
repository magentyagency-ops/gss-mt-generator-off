import { describe, it, expect } from 'vitest';
import { controlerFaitsNouveauxCadre, completerMailUnique } from '../src/generation/memoire_type_cadre';
import { questionDonneeGss, retirerCommentairesInternes } from '../src/generation/base_memoires';
import { questionExacte } from '../src/generation/memoire_generator';
import { normaliser } from '../src/generation/memoire_type';

const sources = (t: string) => ({ toutes: normaliser(t), gss: normaliser(t), questionPartenaire: 'Quel partenaire de télésurveillance retenez-vous pour ce marché, ERYMA ou Delta ?' });

/** Tour 4 (T4C-7) : les passages écartés du cadre donnent une question exacte, jamais un message interne emballé. */
describe('cadre : questions sur les faits non sourcés (T4C-7)', () => {
  it('libellé vide (« : ») remplacé par celui de la section ; question exacte ; partenaire fusionné', () => {
    const v = 'GSS assure la surveillance du site et la levée de doute sur alarme pour tous les bâtiments du campus. Télésurveillance assurée avec ERYMA, station certifiée APSAD de type P5, avec un rapport à chaque intervention.';
    const r = controlerFaitsNouveauxCadre(v, 'Section: "Télésurveillance et levée de doute" | Question: ":"', sources('surveillance site levee de doute alarme batiments campus rapport intervention'));
    expect(r.texte).not.toMatch(/ERYMA/);
    expect(r.questions).toHaveLength(1);
    const q = r.questions[0];
    expect(q).toMatch(/^Réponse « Télésurveillance et levée de doute » : la phrase « Télésurveillance assurée avec ERYMA/);
    expect(q).toMatch(/Quel partenaire de télésurveillance retenez-vous pour ce marché, ERYMA ou Delta \?/);
    expect(q).not.toMatch(/À confirmer par GSS|champ « : »/);
    expect(questionExacte(q)).toBe(q);
  });
  it('valeur courte écartée : question exacte sur la valeur', () => {
    const r = controlerFaitsNouveauxCadre('Audit annuel par Bureau Veritas', 'Section: "Qualité" | Question: "Audit de la prestation"', sources('audit prestation'));
    expect(r.texte).toBe('[À COMPLÉTER]');
    expect(r.questions[0]).toMatch(/^Réponse « Audit de la prestation » : la valeur « Audit annuel par Bureau Veritas » n'a pas été écrite .* Faut-il l'indiquer, et avec quelle information exacte \?$/);
  });
});

/** Tour 4 (T4C-8) : le courriel du point d'entrée unique est celui de GSS ; pas de commentaire interne. */
describe('cadre : point d\'entrée unique (T4C-8)', () => {
  it('la phrase laissée à compléter sur le courriel devient la ligne « Mail unique » de GSS', () => {
    const t = 'GSS fournit un point d’entrée unique pour le marché. Le canal documenté est donc téléphonique ; le recours complémentaire à un courriel, une application dédiée ou un extranet est [À COMPLÉTER]. Cette organisation donne un accès identifié.';
    const r = completerMailUnique(t, 'contact@gss-securite.fr');
    expect(r.complete).toBe(true);
    expect(r.texte).toBe('GSS fournit un point d’entrée unique pour le marché. Mail unique : contact@gss-securite.fr. Cette organisation donne un accès identifié.');
    expect(r.texte).not.toMatch(/\[À COMPLÉTER\]|documenté/);
  });
  it('« le canal documenté » est un commentaire interne', () => {
    expect(retirerCommentairesInternes('GSS fournit un numéro unique. Le canal documenté est téléphonique.').texte).toBe('GSS fournit un numéro unique.');
  });
});

/** Tour 4 (T4-COH-5) : les fiches techniques des équipements du soumissionnaire sont demandées à GSS. */
describe('fiches techniques demandées à GSS (T4-COH-5)', () => {
  it('jamais « À demander à l\'acheteur » pour les fiches techniques de GSS', () => {
    const q = questionDonneeGss("À demander à l'acheteur : pouvez-vous transmettre les fiches techniques détaillées des équipements ?");
    expect(q).not.toMatch(/acheteur/);
    expect(q).toMatch(/^Pouvez-vous fournir les fiches techniques de vos équipements/);
    expect(questionDonneeGss("À demander à l'acheteur : pouvez-vous transmettre les fiches techniques du SSI existant ?")).toMatch(/^À demander à l'acheteur/);
  });
});

import { sansPseudoTableau, COLONNE_VALEUR, colonneCase } from '../src/generation/memoire_type_cadre';

/** Tour 4 (T4-COH-2) : tableau « Formations suivies par les agents » de havre2. */
describe('cadre : cases de valeur et réponse sous un tableau (T4-COH-2)', () => {
  it('les colonnes NOM, Prénom, Date attendent une donnée', () => {
    for (const c of ['Colonne: "Formations suivies par les agents / NOM" | Ligne: "SST"', 'Colonne: "Formations suivies par les agents / Prénom"', 'Colonne: "Formations suivies par les agents / Date"', 'Colonne: "Autorisation CNAPS / N° de l’agrément"']) expect(COLONNE_VALEUR.test(colonneCase(c))).toBe(true);
    expect(COLONNE_VALEUR.test(colonneCase('Colonne: "Moyens / Description des modalités"'))).toBe(false);
  });
  it('« [À COMPLÉTER] » seul en tête et pseudo-lignes du tableau retirés', () => {
    const t = '[À COMPLÉTER]Autorisation d’exercer de l’entreprise : GLOBAL SECURITY SERVICES (GSS), autorisation CNAPS n° AUT-076.\nNOM : [À COMPLÉTER] ; Prénom : [À COMPLÉTER] ; Date : [À COMPLÉTER].\nIntitulé de la formation : SST (Sauveteur secouriste du travail) ; NOM : [À COMPLÉTER] ; Prénom : [À COMPLÉTER] ; Date : [À COMPLÉTER].\nTous nos agents de sécurité disposent du CQP APS.';
    const r = sansPseudoTableau(t);
    expect(r.texte).toBe('Autorisation d’exercer de l’entreprise : GLOBAL SECURITY SERVICES (GSS), autorisation CNAPS n° AUT-076.\nTous nos agents de sécurité disposent du CQP APS.');
    expect(r.retires).toBe(3);
    // Une phrase avec une seule donnée à compléter reste.
    expect(sansPseudoTableau('Date de fin de validité : [À COMPLÉTER]. Tous nos agents disposent du CQP APS et sont formés au SST.').retires).toBe(0);
  });
});
