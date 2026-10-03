import { describe, it, expect } from 'vitest';
import { consultationsDuDce } from '../src/generation/reponse_libre_v2';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7CS-6) : une proposition ne demande jamais à GSS une donnée écrite dans le DCE. */
const CCP = `Article 4.2 : Suivi de la conformité réglementaire
En complément des pièces à fournir au stade de l’attribution du marché, les cocontractants, co-
traitants et sous- traitants s’engagent à fournir tous les 6 mois à compter de la notification du marché
et jusqu’à la fin de l’exécution de celui-ci, les pièces et attestations sur l’honneur prévues à l’article
D8222-5 ou D8222-7 et 8 et D8254-2 à 5 du code du travail conformément au Dispositif de vigilance.`;
const PROPOSITION = `## Préparation et dépôt
Avant chaque dépôt, GSS rassemble les pièces exigées. La liste détaillée des pièces à transmettre est la suivante : [À COMPLÉTER].
[CONSULTATION REQUISE : Obtenir la liste exhaustive des pièces et attestations réglementaires de vigilance prévue au CCP.]

GSS dépose ensuite le dossier sur la plateforme.`;

describe('donnée du DCE demandée par une proposition (T7CS-6)', () => {
  it('la référence du DCE remplace l’emplacement, la consultation disparaît', () => {
    const r = consultationsDuDce(PROPOSITION, CCP);
    expect(r.texte).toContain('La liste détaillée des pièces à transmettre est la suivante : les pièces et attestations sur l’honneur prévues à l’article D8222-5 ou D8222-7 et 8 et D8254-2 à 5 du code du travail.');
    expect(r.texte).not.toMatch(/CONSULTATION|À COMPLÉTER/);
    expect(r.remplacees).toHaveLength(1);
  });
  it('donnée introuvable dans le DCE : question à l’acheteur, jamais à GSS', () => {
    const r = consultationsDuDce(PROPOSITION, 'Le titulaire assure le gardiennage.');
    expect(r.texte).toContain("[CONSULTATION REQUISE : À demander à l'acheteur : la liste exhaustive des pièces et attestations réglementaires de vigilance prévue au CCP]");
  });
  it('une consultation sur une donnée interne de GSS reste telle quelle', () => {
    const t = 'Effectif : [À COMPLÉTER].\n[CONSULTATION REQUISE : Combien d’agents GSS affecte-t-elle au site ?]';
    expect(consultationsDuDce(t, CCP).texte).toBe(t);
  });
  it.skipIf(!aCorpus('cstb'))('DCE complet du cstb (551)', () => {
    const r = consultationsDuDce(PROPOSITION, DCE('cstb'));
    expect(r.texte).toMatch(/est la suivante : les pièces et attestations sur l’honneur prévues à l’article D8222-5/);
  });
});
