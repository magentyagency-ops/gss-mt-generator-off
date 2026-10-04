// Campagne « zéro défaut », tour 3 : textes remis (T3-CONS-5).
import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';

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
