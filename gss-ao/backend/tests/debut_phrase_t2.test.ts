// Tour 2 (T2N-9, parc_expo 202, b5_equipe_controle) : « …de GSS. il alerte l'équipe encadrante » après le retrait du seul
// début d'une phrase de GSS. Le début d'une phrase ne se retire pas seul : la phrase de GSS reste entière.
import { describe, it, expect } from 'vitest';
import { appliquerModifications, debutDePhraseRetire } from '../src/generation/memoire_type';

const t = "Chaque site a une équipe dédiée : il fait le lien au quotidien entre l'équipe terrain et l'équipe encadrante de GSS. Étant lui-même en poste sur le site, il veille chaque jour à la bonne marche de la prestation et il alerte l'équipe encadrante des besoins.";

describe('début de phrase de GSS (T2N-9)', () => {
  it('retrait du seul début de phrase : refusé', () => {
    const r = appliquerModifications(t, { retraits: [{ extrait: 'Étant lui-même en poste sur le site, il veille chaque jour à la bonne marche de la prestation et' }] } as any);
    expect(r.appliquees).toHaveLength(0);
    expect(r.texte).toBe(t);
  });
  it('remplacement du début de phrase par un texte sans majuscule : refusé ; avec majuscule : accepté', () => {
    expect(appliquerModifications(t, { remplacements: [{ extrait: 'Étant lui-même en poste sur le site,', par: 'présent sur le site,' }] } as any).appliquees).toHaveLength(0);
    expect(appliquerModifications(t, { remplacements: [{ extrait: 'Étant lui-même en poste sur le site,', par: 'Présent sur le site,' }] } as any).appliquees).toHaveLength(1);
  });
  it('retrait d’une phrase entière ou d’un fragment au milieu : accepté', () => {
    expect(appliquerModifications(t, { retraits: [{ extrait: 'Étant lui-même en poste sur le site, il veille chaque jour à la bonne marche de la prestation et il alerte l\'équipe encadrante des besoins.' }] } as any).appliquees).toHaveLength(1);
    expect(appliquerModifications(t, { retraits: [{ extrait: ' au quotidien' }] } as any).appliquees).toHaveLength(1);
  });
  it('début de puce ou de ligne', () => {
    const l = '- Les rondes : elles sont tracées.\n- Le contrôle est mensuel.';
    expect(debutDePhraseRetire(l, l.indexOf('Les'), l.indexOf('Les') + 'Les rondes : '.length, l.replace('Les rondes : ', ''))).toBe(true);
    expect(debutDePhraseRetire(l, l.indexOf('Le contrôle'), l.indexOf('Le contrôle') + 'Le contrôle'.length, l.replace('Le contrôle', 'Le suivi'))).toBe(false);
    // Phrase entière retirée, la suivante commence par une minuscule dans le texte d'origine : accepté.
    expect(appliquerModifications('a b c. d e f.', { retraits: [{ extrait: 'a b c.' }] } as any).appliquees).toHaveLength(1);
    // Phrase entière remplacée par un texte sans majuscule : refusé.
    expect(appliquerModifications('Il pleut. Le site ferme.', { remplacements: [{ extrait: 'Il pleut.', par: 'il pleut fort.' }] } as any).appliquees).toHaveLength(0);
  });
});
