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
