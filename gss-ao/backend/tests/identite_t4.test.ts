import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';
import { appliquerModifications } from '../src/generation/memoire_type';

/** Tour 4 (T4C-5) : un agent de sécurité privée ne contrôle pas l'identité (faits_gss.md), y compris à la forme nominale. */
describe('contrôle d\'identité jamais écrit comme engagement de GSS (T4C-5)', () => {
  const r = (t: string) => retirerCommentairesInternes(t).texte;
  it('formes nominales réécrites (caen 471, puce d\'engagement)', () => {
    expect(r('- GSS assurera la surveillance des sites, le contrôle des identités, les premiers secours et la gestion des alarmes.'))
      .toBe('- GSS assurera la surveillance des sites, la vérification des autorisations de présence, les premiers secours et la gestion des alarmes.');
    expect(r('Les agents procèdent au filtrage et au contrôle d\'identité des visiteurs.')).toBe('Les agents procèdent au filtrage et à la vérification des autorisations de présence des visiteurs.');
    expect(r('Contrôle des identités à l\'entrée du bâtiment.')).toBe('Vérification des autorisations de présence à l\'entrée du bâtiment.');
    expect(r('La vérification des identités est assurée par l\'agent d\'accueil.')).toBe('La vérification des autorisations de présence est assurée par l\'agent d\'accueil.');
  });
  it('une phrase qui l\'interdit reste telle quelle', () => {
    const t = 'L\'agent ne procède jamais au contrôle des identités : il invite la personne à justifier de sa présence.';
    expect(r(t)).toBe(t);
  });
  it('l\'adaptation refuse « le contrôle des identités » et « contrôle d\'identité »', () => {
    for (const par of ['le contrôle des identités', "un contrôle d'identité", "contrôler l'identité"]) {
      const a = appliquerModifications('Nos agents assurent la surveillance.', { remplacements: [{ extrait: 'la surveillance', par: `la surveillance et ${par}` }] }, {});
      expect(a.appliquees).toHaveLength(0);
    }
  });
});
