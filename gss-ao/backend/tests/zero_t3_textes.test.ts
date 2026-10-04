// Campagne « zéro défaut », tour 3 : textes remis (T3-CONS-5).
import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';
import { appliquerModifications, phraseAutonome, chargerMemoireType } from '../src/generation/memoire_type';
import { alignerSchemaSurTexte } from '../src/generation/reponse_libre_v2';
import { corrigerFormeSpec, pictogrammesGrille } from '../src/generation/schema_service';

describe('montant de pénalité en pourcentage ou en lettres (T3-CONS-5)', () => {
  it('phrase du Havre : la proposition qui cite le taux de pénalité est retirée, le reste gardé', () => {
    const t = "Cette organisation renforce la fiabilité des fermetures et permet de détecter et corriger rapidement les écarts, dans un contexte où l'absence constatée lors d'un contrôle peut entraîner une pénalité de 100 % de la prestation commandée.";
    expect(retirerCommentairesInternes(t).texte).toBe('Cette organisation renforce la fiabilité des fermetures et permet de détecter et corriger rapidement les écarts.');
  });
  it('montant en lettres retiré ; un pourcentage sans pénalité gardé', () => {
    expect(retirerCommentairesInternes('Tout retard donne lieu à une pénalité de cent euros par heure.').texte).toBe('');
    expect(retirerCommentairesInternes('GSS respecte 100 % des consignes de sécurité.').texte).toBe('GSS respecte 100 % des consignes de sécurité.');
  });
});

describe('phrase ajoutée qui commence par « ; » (T3-CONS-10, T3N-3)', () => {
  const texte = `Pour chaque nouveau marché, nous procédons toujours de la même manière.

- J-30 — réunion sur site : collecte des éventuelles informations manquantes.
- De J-30 à J-15 — préparation : élaboration du LMC ; élaboration des plannings, pour valider une organisation pérenne ; commande et flocage des paquetages.
- J+30 — réunion de bilan du premier mois.`;
  it('ajout dans une liste (réponse réelle de fontainebleau 801) : paragraphe qui commence par une majuscule', () => {
    const mods = { remplacements: [], retraits: [], ajouts: [{ apres: 'élaboration des plannings, pour valider une organisation pérenne', texte: " ; l’organisation garantit en continu, sans interruption, le nombre de postes désigné ou commandé, sans poste vacant.", motif: 'm' }] };
    const r = appliquerModifications(texte, mods as any, { maxAjouts: 3, motsParAjout: 80, dce: "l'organisation garantit en continu, sans interruption, le nombre de postes désigné ou commandé" });
    expect(r.appliquees.length).toBe(1);
    expect(r.texte).toMatch(/\n\nL’organisation garantit en continu/);
    expect(r.texte).not.toMatch(/(?:^|\n|\. ); /);
    expect(r.appliquees[0].par).toMatch(/^L’organisation/);
  });
  it('ajout hors liste : phrase entière après la phrase finie, jamais « . ; »', () => {
    const r = appliquerModifications('Le plan de prévention est établi avec le client. Les agents sont formés.', { remplacements: [], retraits: [], ajouts: [{ apres: 'établi avec le client', texte: '; le plan de prévention sera transmis au SAIMG dans le mois suivant la prise d’effet du marché', motif: 'm' }] } as any, { maxAjouts: 3, motsParAjout: 80, dce: 'Le plan de prévention est transmis au SAIMG dans le mois suivant la prise d’effet du marché.' });
    expect(r.texte).toContain('avec le client. Le plan de prévention sera transmis au SAIMG dans le mois suivant la prise d’effet du marché. Les agents');
    expect(r.texte).not.toMatch(/\. ;/);
  });
  it('phraseAutonome', () => {
    expect(phraseAutonome(', et les agents sont équipés')).toBe('Les agents sont équipés.');
    expect(phraseAutonome('- puce de liste')).toBe('- puce de liste');
  });
});

describe('schéma aligné sur la phrase adaptée au CCTP (T3-CONS-11)', () => {
  const r: any = chargerMemoireType().rubriques.find((x: any) => x.id === 'b5_nouvel_agent');
  it('« 1 à 3 jours » remplacé par la valeur de la phrase adaptée (ign 1351)', () => {
    const fin = r.texte.replace('chef de site, pendant 1 à 3 jours selon les besoins du site', 'chef de poste, pendant au minimum 2 vacations consécutives de jour et 2 vacations de nuit, dont une de jour ouvré et une de week-end,');
    const a = alignerSchemaSurTexte(r.schema.params, r.texte, fin);
    expect(a.params.etapes[2].texte).toBe('Au minimum 2 vacations consécutives de jour et 2 vacations de nuit');
    expect(JSON.stringify(a.params)).not.toMatch(/1 à 3 jours/);
  });
  it('texte non adapté : schéma inchangé', () => {
    expect(alignerSchemaSurTexte(r.schema.params, r.texte, r.texte).changees).toEqual([]);
  });
});

describe('schéma refusé pour une erreur de forme : corrigé sans repli en grille (T3-CONS-14)', () => {
  const spec = { gabarit: 'flux', params: { etapes: [{ titre: 'alarme', texte: "Effectuer la levée de doute sur place avec l'agent de sécurité présent et prévenir le client", role: 'rouge' }, { titre: 'Compte rendu', texte: 'Rapport écrit', role: 'vert' }] } };
  it('majuscule initiale et texte coupé à la limite sur un mot plein', () => {
    const c = corrigerFormeSpec(spec, ['« alarme » doit commencer par une majuscule.', `« etapes[0].texte » est trop long (88 caractères, maximum 60) : « ${spec.params.etapes[0].texte} ».`]);
    expect(c.params.etapes[0].titre).toBe('Alarme');
    expect(c.params.etapes[0].texte.length).toBeLessThanOrEqual(60);
    expect(c.params.etapes[0].texte).toBe("Effectuer la levée de doute sur place avec l'agent");
  });
  it('erreur de fond : pas de correction automatique', () => {
    expect(corrigerFormeSpec(spec, ['Le mot « Zorglub » ne figure ni dans la page ni dans le vocabulaire GSS validé.'])).toBeNull();
  });
  it('grille : un pictogramme par carte', () => {
    const g = pictogrammesGrille({ gabarit: 'grille', params: { cartes: [{ titre: 'Alarme', texte: 'Effectuer la levée de doute' }, { titre: 'Victime', texte: 'Porter secours' }, { titre: 'Individu perturbateur', texte: 'Raisonner' }, { titre: 'Compte rendu', texte: 'Rapport' }] } });
    expect(g.params.cartes.map((c: any) => c.icone)).toEqual(['sirene', 'coeur', 'personne', 'document']);
  });
});
