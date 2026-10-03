import { describe, it, expect } from 'vitest';
import { harmoniserVariantesAcheteur } from '../src/generation/memoire_type';
import { completerFamilles, type CandidatReference } from '../src/generation/memoire_type_cadre';

/** Tour 7 (T7CS-8) : la commune acheteuse écrite d'une seule façon ; (T7CS-2) absence prévue et non prévue inséparables. */
describe('nom de la commune acheteuse (T7CS-8)', () => {
  it('« Ville d’Étampes » ramenée à « Mairie d’Etampes »', () => {
    const t = "La continuité des manifestations de la Ville d’Étampes est organisée. Ville d'Etampes : interlocuteurs. Les interlocuteurs de la ville d’Etampes et de la Mairie d'Etampes.";
    expect(harmoniserVariantesAcheteur(t, "Mairie d'Etampes")).toBe("La continuité des manifestations de la Mairie d'Etampes est organisée. Mairie d'Etampes : interlocuteurs. Les interlocuteurs de la Mairie d'Etampes et de la Mairie d'Etampes.");
  });
  it('sans effet pour un acheteur qui n’est pas une commune, ou pour une autre commune', () => {
    expect(harmoniserVariantesAcheteur('La Ville de Rouen et le CSTB.', 'le CSTB')).toBe('La Ville de Rouen et le CSTB.');
    expect(harmoniserVariantesAcheteur('La Ville de Rouen.', "Mairie d'Etampes")).toBe('La Ville de Rouen.');
  });
});

describe('absence prévue et absence non prévue (T7CS-2)', () => {
  const c = (id: string, cle: string): CandidatReference => ({ id, cle, titre: id, texte: id, score: 0.5, theme: true });
  it('l’absence prévue retenue seule entraîne l’absence non prévue, juste après elle', () => {
    const candidats = [c('b5_remplacement_prevu', 'R1'), c('b5_remplacement_imprevu', 'R2'), c('b4_proc_intrusion', 'R3')];
    expect(completerFamilles([candidats[0], candidats[2]], candidats).map((x) => x.id)).toEqual(['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b4_proc_intrusion']);
    expect(completerFamilles([candidats[1]], candidats).map((x) => x.id)).toEqual(['b5_remplacement_prevu', 'b5_remplacement_imprevu']);
    expect(completerFamilles([candidats[2]], candidats).map((x) => x.id)).toEqual(['b4_proc_intrusion']);
  });
});
